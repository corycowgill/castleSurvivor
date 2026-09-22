"""Post-process a ComfyUI audio output (FLAC/WAV/MP3) into a game-ready mono WAV.

  python sfx_post.py <in> <out.wav> [--trim SECONDS] [--loop] [--peak -1.0]

- decodes with PyAV (shipped with ComfyUI), mixes to mono float32 @ 44.1 kHz
- strips leading silence (below -50 dBFS), keeps `--trim` seconds from the first
  transient (unless --loop), applies a 3 ms fade-in and a 40 ms fade-out
- --loop: keeps the whole clip, crossfades the last 0.5 s into the start so it loops cleanly
- normalises the peak to --peak dBFS, writes 16-bit PCM WAV
"""
import sys, argparse
import numpy as np
import av
from scipy.io import wavfile

def decode(path, sr=44100):
    c = av.open(path)
    st = c.streams.audio[0]
    res = av.AudioResampler(format='fltp', layout='mono', rate=sr)
    chunks = []
    for frame in c.decode(st):
        for f in res.resample(frame):
            chunks.append(f.to_ndarray()[0])
    for f in res.resample(None):
        chunks.append(f.to_ndarray()[0])
    c.close()
    return np.concatenate(chunks).astype(np.float32), sr

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('inp'); ap.add_argument('out')
    ap.add_argument('--trim', type=float, default=0)
    ap.add_argument('--loop', action='store_true')
    ap.add_argument('--peak', type=float, default=-1.0)
    a = ap.parse_args()
    x, sr = decode(a.inp)
    if not a.loop:
        thr = 10 ** (-50 / 20)
        idx = np.argmax(np.abs(x) > thr)
        x = x[max(0, idx - int(0.005 * sr)):]
        if a.trim > 0:
            x = x[:int(a.trim * sr)]
        # drop trailing silence below -60 dBFS
        thr2 = 10 ** (-60 / 20)
        nz = np.where(np.abs(x) > thr2)[0]
        if len(nz): x = x[:min(len(x), nz[-1] + int(0.05 * sr))]
        fi, fo = int(0.003 * sr), int(0.04 * sr)
        x[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)
        x[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32)
    else:
        xf = int(0.5 * sr)
        head, tail = x[:xf].copy(), x[-xf:].copy()
        ramp = np.linspace(0, 1, xf, dtype=np.float32)
        x = x[:-xf]
        x[:xf] = head * ramp + tail * (1 - ramp)
    peak = float(np.max(np.abs(x))) or 1.0
    x = x / peak * (10 ** (a.peak / 20))
    wavfile.write(a.out, sr, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    print(f"{a.out}: {len(x)/sr:.2f}s peak {a.peak} dBFS")

if __name__ == '__main__':
    main()

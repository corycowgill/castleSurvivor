#!/usr/bin/env node
/**
 * gen-sfx.mjs  --  Offline SFX renderer for Castle Survivor
 *
 * Renders every AudioSystem slot as 44.1 kHz 16-bit mono WAV into audio/.
 * No native deps; writes raw WAV bytes with Buffer.
 *
 * Usage:  node AssetFactory/scripts/gen-sfx.mjs
 * Re-run is idempotent; files are overwritten.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(__dirname, '..', '..', 'audio');
mkdirSync(AUDIO_DIR, { recursive: true });

const RATE = 44100;
const PI2 = Math.PI * 2;

// ──────────────────────── WAV encoder ────────────────────────
function encodeWav(samples) {
  // samples: Float64Array or Float32Array, mono, [-1,1]
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);       // chunk size
  buf.writeUInt16LE(1, 20);        // PCM
  buf.writeUInt16LE(1, 22);        // mono
  buf.writeUInt32LE(RATE, 24);     // sample rate
  buf.writeUInt32LE(RATE * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);        // block align
  buf.writeUInt16LE(16, 34);       // bits/sample
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

// ──────────────────────── DSP primitives ────────────────────────

/** Seeded PRNG (xoshiro128**) for reproducible noise */
class Rng {
  constructor(seed = 42) {
    let s = seed | 0;
    const sp = () => { s = (s * 1664525 + 1013904223) | 0; return (s >>> 0) / 4294967296; };
    this.s = [sp() * 4294967296 >>> 0, sp() * 4294967296 >>> 0, sp() * 4294967296 >>> 0, sp() * 4294967296 >>> 0];
  }
  next() {
    let [a, b, c, d] = this.s;
    const r = (((b * 5) << 7 | (b * 5) >>> 25) * 9) >>> 0;
    const t = b << 9;
    c ^= a; d ^= b; b ^= c; a ^= d; c ^= t;
    d = (d << 11 | d >>> 21);
    this.s = [a, b, c, d];
    return (r >>> 0) / 4294967296;
  }
  /** Uniform in [-1, 1] */
  uni() { return this.next() * 2 - 1; }
}

function makeNoise(len, seed = 1) {
  const rng = new Rng(seed);
  const out = new Float64Array(len);
  for (let i = 0; i < len; i++) out[i] = rng.uni();
  return out;
}

/** ADSR envelope generator */
function adsr(len, a, d, s, r, sustainLevel = 0.7) {
  const env = new Float64Array(len);
  const aSamp = Math.floor(a * RATE);
  const dSamp = Math.floor(d * RATE);
  const sSamp = Math.floor(s * RATE);
  const rSamp = Math.floor(r * RATE);
  for (let i = 0; i < len; i++) {
    if (i < aSamp) env[i] = i / aSamp;
    else if (i < aSamp + dSamp) env[i] = 1 - (1 - sustainLevel) * ((i - aSamp) / dSamp);
    else if (i < aSamp + dSamp + sSamp) env[i] = sustainLevel;
    else if (i < aSamp + dSamp + sSamp + rSamp) env[i] = sustainLevel * (1 - (i - aSamp - dSamp - sSamp) / rSamp);
    else env[i] = 0;
  }
  return env;
}

/** Linear pitch sweep from f0 to f1 over len samples */
function pitchSweep(len, f0, f1) {
  const out = new Float64Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const freq = f0 + (f1 - f0) * t;
    phase += freq / RATE;
    out[i] = phase;
  }
  return out;
}

/** Exponential pitch sweep */
function expSweep(len, f0, f1) {
  const out = new Float64Array(len);
  let phase = 0;
  const logR = Math.log(f1 / f0);
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const freq = f0 * Math.exp(logR * t);
    phase += freq / RATE;
    out[i] = phase;
  }
  return out;
}

/** Sine from phase accumulator */
function sinFromPhase(phases) {
  return phases.map(p => Math.sin(p * PI2));
}

/** Sawtooth from phase accumulator */
function sawFromPhase(phases) {
  return phases.map(p => 2 * (p % 1) - 1);
}

/** Triangle from phase accumulator */
function triFromPhase(phases) {
  return phases.map(p => { const x = (p % 1); return x < 0.5 ? 4 * x - 1 : 3 - 4 * x; });
}

/** Square from phase accumulator */
function sqrFromPhase(phases) {
  return phases.map(p => (p % 1) < 0.5 ? 1 : -1);
}

/** Simple one-pole lowpass: y[n] = a*x[n] + (1-a)*y[n-1] */
function lpf1(data, cutoffHz) {
  const rc = 1 / (PI2 * cutoffHz);
  const dt = 1 / RATE;
  const a = dt / (rc + dt);
  const out = new Float64Array(data.length);
  out[0] = data[0] * a;
  for (let i = 1; i < data.length; i++) out[i] = a * data[i] + (1 - a) * out[i - 1];
  return out;
}

/** Biquad bandpass filter */
function bpf(data, freq, Q) {
  const w0 = PI2 * freq / RATE;
  const alpha = Math.sin(w0) / (2 * Q);
  const b0 = alpha, b1 = 0, b2 = -alpha;
  const a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  return biquad(data, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

/** Biquad highpass filter */
function hpf(data, freq) {
  const w0 = PI2 * freq / RATE;
  const alpha = Math.sin(w0) / (2 * 0.707);
  const c = Math.cos(w0);
  const b0 = (1 + c) / 2, b1 = -(1 + c), b2 = (1 + c) / 2;
  const a0 = 1 + alpha, a1 = -2 * c, a2 = 1 - alpha;
  return biquad(data, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

/** Biquad lowpass filter */
function lpfBiquad(data, freq, Q = 0.707) {
  const w0 = PI2 * freq / RATE;
  const alpha = Math.sin(w0) / (2 * Q);
  const c = Math.cos(w0);
  const b0 = (1 - c) / 2, b1 = 1 - c, b2 = (1 - c) / 2;
  const a0 = 1 + alpha, a1 = -2 * c, a2 = 1 - alpha;
  return biquad(data, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

function biquad(data, b0, b1, b2, a1, a2) {
  const out = new Float64Array(data.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x0 = data[i];
    out[i] = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x0; y2 = y1; y1 = out[i];
  }
  return out;
}

/** Simple algorithmic reverb: 4 comb filters + 2 allpass filters */
function reverb(data, mix = 0.3, roomSize = 0.7) {
  const combDelays = [1557, 1617, 1491, 1422]; // prime-ish lengths
  const combFb = roomSize * 0.85;
  const allpassDelays = [225, 556];
  const allpassFb = 0.5;
  const len = data.length;

  // Comb filters in parallel
  let wet = new Float64Array(len);
  for (const delay of combDelays) {
    const buf = new Float64Array(delay);
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const delayed = buf[idx];
      buf[idx] = data[i] + delayed * combFb;
      idx = (idx + 1) % delay;
      wet[i] += delayed;
    }
  }
  // Normalize comb sum
  for (let i = 0; i < len; i++) wet[i] /= combDelays.length;

  // Allpass filters in series
  for (const delay of allpassDelays) {
    const buf = new Float64Array(delay);
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const delayed = buf[idx];
      const input = wet[i];
      buf[idx] = input + delayed * allpassFb;
      idx = (idx + 1) % delay;
      wet[i] = delayed - input * allpassFb;
    }
  }

  // Mix dry + wet
  const out = new Float64Array(len);
  for (let i = 0; i < len; i++) out[i] = data[i] * (1 - mix) + wet[i] * mix;
  return out;
}

/** Soft clipping (tanh-ish) */
function softClip(data, drive = 1.5) {
  return data.map(s => Math.tanh(s * drive));
}

/** Normalise to peak dBFS (default -1 dBFS) */
function normalise(data, targetDb = -1) {
  const target = Math.pow(10, targetDb / 20);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak < 1e-10) return data;
  const gain = target / peak;
  return data.map(s => s * gain);
}

/** Mix arrays (additive), optionally with offset */
function mix(target, source, gain = 1, offset = 0) {
  for (let i = 0; i < source.length && (i + offset) < target.length; i++) {
    if (i + offset >= 0) target[i + offset] += source[i] * gain;
  }
}

/** Metallic inharmonic partial stack (bell / clang) */
function metallicPartials(dur, baseFreq, partialRatios, decayMul = 1) {
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);
  for (const [ratio, amp, decay] of partialRatios) {
    const freq = baseFreq * ratio;
    const env = adsr(len, 0.001, decay * decayMul, 0, 0.01, 0);
    const phases = expSweep(len, freq, freq);
    const wave = sinFromPhase(phases);
    for (let i = 0; i < len; i++) out[i] += wave[i] * env[i] * amp;
  }
  return out;
}

/** Sub-bass thump */
function subThump(dur, startFreq = 80, endFreq = 30, attack = 0.003) {
  const len = Math.ceil(dur * RATE);
  const phases = expSweep(len, startFreq, endFreq);
  const wave = sinFromPhase(phases);
  const env = adsr(len, attack, dur * 0.6, dur * 0.2, dur * 0.2, 0.4);
  return wave.map((s, i) => s * env[i]);
}

/** Transient click for impact sounds */
function transientClick(dur = 0.008) {
  const len = Math.ceil(dur * RATE);
  const noise = makeNoise(len, 99);
  const env = adsr(len, 0.0003, dur, 0, 0, 0);
  return noise.map((s, i) => s * env[i]);
}

// ──────────────────────── Sound designs ────────────────────────

function renderSwordSwing(variation = 0) {
  const dur = 0.28;
  const len = Math.ceil(dur * RATE);
  const noise = makeNoise(len, 10 + variation);
  // Swooshing: bandpassed noise with rising then falling freq
  const out = new Float64Array(len);
  // High whoosh
  const filtered = bpf(noise, 1800 + variation * 300, 1.2);
  const env = adsr(len, 0.01, 0.08, 0.05, 0.14, 0.5);
  for (let i = 0; i < len; i++) out[i] = filtered[i] * env[i] * 0.6;
  // Low body
  const low = lpfBiquad(noise, 600 + variation * 100, 0.8);
  const env2 = adsr(len, 0.02, 0.1, 0.02, 0.14, 0.3);
  for (let i = 0; i < len; i++) out[i] += low[i] * env2[i] * 0.25;
  return normalise(softClip(out));
}

function renderSwordHit(variation = 0) {
  const dur = 0.22;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // Transient click
  const click = transientClick(0.006);
  mix(out, click, 0.8);

  // Metallic clang: inharmonic partials
  const partials = [
    [1.0, 0.6, 0.12],
    [2.76, 0.35, 0.08],
    [4.07, 0.2, 0.06],
    [5.2, 0.15, 0.04],
  ];
  const clang = metallicPartials(dur, 900 + variation * 200, partials);
  mix(out, clang, 0.5);

  // Sub thump for body
  const thump = subThump(0.1, 120, 50);
  mix(out, thump, 0.45, Math.floor(0.003 * RATE));

  // Noise burst for impact texture
  const noise = makeNoise(len, 20 + variation);
  const nfilt = hpf(noise, 2000);
  const nenv = adsr(len, 0.001, 0.04, 0, 0.02, 0);
  for (let i = 0; i < len; i++) out[i] += nfilt[i] * nenv[i] * 0.3;

  return normalise(softClip(reverb(out, 0.15, 0.3)));
}

function renderEnemyDeath(variation = 0) {
  const dur = 0.45;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // Impact thump
  const thump = subThump(0.15, 160, 40);
  mix(out, thump, 0.6);

  // Descending tone cluster (squelchy)
  const phases = expSweep(len, 350 + variation * 50, 60);
  const saw = sawFromPhase(phases);
  const filt = lpfBiquad(saw, 800, 1.5);
  const env = adsr(len, 0.005, 0.15, 0.1, 0.2, 0.35);
  for (let i = 0; i < len; i++) out[i] += filt[i] * env[i] * 0.35;

  // Noise crunch
  const noise = makeNoise(len, 30 + variation);
  const nfilt = lpfBiquad(noise, 1200, 2);
  const nenv = adsr(len, 0.002, 0.12, 0.05, 0.2, 0.3);
  for (let i = 0; i < len; i++) out[i] += nfilt[i] * nenv[i] * 0.3;

  return normalise(softClip(reverb(out, 0.2, 0.4)));
}

function renderPlayerHit(variation = 0) {
  const dur = 0.3;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // Meaty low impact
  const thump = subThump(0.12, 100, 35, 0.002);
  mix(out, thump, 0.7);

  // Distorted square wave punch
  const phases = expSweep(len, 180 + variation * 30, 55);
  const sq = sqrFromPhase(phases);
  const filt = lpfBiquad(sq, 400, 0.8);
  const env = adsr(len, 0.002, 0.08, 0.04, 0.16, 0.4);
  for (let i = 0; i < len; i++) out[i] += filt[i] * env[i] * 0.4;

  // Noise crackle
  const noise = makeNoise(len, 40 + variation);
  const nfilt = bpf(noise, 900, 1.5);
  const nenv = adsr(len, 0.001, 0.06, 0, 0.1, 0);
  for (let i = 0; i < len; i++) out[i] += nfilt[i] * nenv[i] * 0.25;

  return normalise(softClip(out, 2));
}

function renderPlayerDeath() {
  const dur = 1.8;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // Long descending tone
  const phases = expSweep(len, 220, 28);
  const saw = sawFromPhase(phases);
  const filt = lpfBiquad(saw, 600, 1.2);
  const env = adsr(len, 0.01, 0.4, 0.8, 0.6, 0.4);
  for (let i = 0; i < len; i++) out[i] += filt[i] * env[i] * 0.35;

  // Rumble
  const noise = makeNoise(len, 50);
  const nfilt = lpfBiquad(noise, 300, 0.6);
  const nenv = adsr(len, 0.05, 0.5, 0.6, 0.65, 0.3);
  for (let i = 0; i < len; i++) out[i] += nfilt[i] * nenv[i] * 0.3;

  // Heartbeat-like double thump
  const beat1 = subThump(0.2, 50, 25, 0.01);
  mix(out, beat1, 0.5, Math.floor(0.3 * RATE));
  const beat2 = subThump(0.2, 45, 22, 0.01);
  mix(out, beat2, 0.4, Math.floor(0.55 * RATE));

  return normalise(softClip(reverb(out, 0.35, 0.6)));
}

function renderCoinPickup(variation = 0) {
  const dur = 0.18;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // Bright bell dyad
  const f1 = 1320 + variation * 100;
  const f2 = 1980 + variation * 150;
  const partials1 = [[1, 0.7, 0.12], [2.0, 0.3, 0.08], [3.4, 0.15, 0.05]];
  const partials2 = [[1, 0.5, 0.1], [2.3, 0.25, 0.06]];
  const bell1 = metallicPartials(dur, f1, partials1);
  const bell2 = metallicPartials(dur * 0.7, f2, partials2);
  mix(out, bell1, 0.6);
  mix(out, bell2, 0.5, Math.floor(0.03 * RATE));

  return normalise(out);
}

function renderFoodPickup() {
  const dur = 0.22;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // Warm rising tone
  const phases = expSweep(len, 480, 780);
  const tri = triFromPhase(phases);
  const env = adsr(len, 0.008, 0.06, 0.06, 0.1, 0.6);
  for (let i = 0; i < len; i++) out[i] += tri[i] * env[i] * 0.5;

  // Sparkle overtone
  const phases2 = expSweep(len, 960, 1560);
  const sin2 = sinFromPhase(phases2);
  const env2 = adsr(len, 0.02, 0.05, 0.04, 0.11, 0.3);
  for (let i = 0; i < len; i++) out[i] += sin2[i] * env2[i] * 0.25;

  return normalise(out);
}

function renderLevelUp() {
  const dur = 0.8;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // Bright bell 4-note arpeggio: C5, E5, G5, C6
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const noteGap = 0.1;
  const noteDur = 0.35;
  for (let n = 0; n < notes.length; n++) {
    const nlen = Math.ceil(noteDur * RATE);
    const offset = Math.floor(n * noteGap * RATE);
    // Bell: inharmonic partials
    const partials = [
      [1.0, 0.7, noteDur * 0.8],
      [2.0, 0.3, noteDur * 0.5],
      [3.0, 0.15, noteDur * 0.3],
      [4.2, 0.1, noteDur * 0.2],
      [5.4, 0.06, noteDur * 0.15],
    ];
    const bell = metallicPartials(noteDur, notes[n], partials);
    mix(out, bell, 0.45, offset);
  }

  // Sparkle layer
  const noise = makeNoise(len, 70);
  const spark = hpf(noise, 6000);
  const sparkEnv = adsr(len, 0.05, 0.2, 0.3, 0.25, 0.15);
  for (let i = 0; i < len; i++) out[i] += spark[i] * sparkEnv[i] * 0.1;

  return normalise(reverb(out, 0.25, 0.5));
}

function renderWaveStart() {
  const dur = 0.9;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // War horn: two detuned sawtooths through a low-pass
  const phases1 = expSweep(len, 165, 220);
  const phases2 = expSweep(len, 167, 223);
  const saw1 = sawFromPhase(phases1);
  const saw2 = sawFromPhase(phases2);
  const mixed = new Float64Array(len);
  for (let i = 0; i < len; i++) mixed[i] = (saw1[i] + saw2[i]) * 0.5;

  // Swept filter
  const filtered = lpfBiquad(mixed, 800, 1.2);
  const env = adsr(len, 0.15, 0.1, 0.4, 0.25, 0.7);
  for (let i = 0; i < len; i++) out[i] = filtered[i] * env[i] * 0.6;

  // Add some breath noise
  const noise = makeNoise(len, 80);
  const nfilt = bpf(noise, 1200, 0.5);
  const nenv = adsr(len, 0.1, 0.15, 0.3, 0.35, 0.2);
  for (let i = 0; i < len; i++) out[i] += nfilt[i] * nenv[i] * 0.12;

  return normalise(softClip(reverb(out, 0.3, 0.5)));
}

function renderUpgradeSelect() {
  const dur = 0.16;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // Quick 2-note chime
  const partials = [[1, 0.8, 0.1], [2.5, 0.3, 0.06], [4.1, 0.15, 0.04]];
  const chime1 = metallicPartials(dur, 800, partials);
  const chime2 = metallicPartials(dur * 0.6, 1200, partials);
  mix(out, chime1, 0.5);
  mix(out, chime2, 0.5, Math.floor(0.04 * RATE));

  return normalise(out);
}

function renderThunder(variation = 0) {
  const dur = 2.2;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // Initial crack: short bright noise burst
  const crackLen = Math.ceil(0.06 * RATE);
  const crackNoise = makeNoise(crackLen, 100 + variation);
  const crackFilt = hpf(crackNoise, 3000);
  const crackEnv = adsr(crackLen, 0.001, 0.02, 0, 0.03, 0);
  for (let i = 0; i < crackLen; i++) out[i] = crackFilt[i] * crackEnv[i] * 0.9;

  // Rolling body: filtered noise with long decay
  const bodyNoise = makeNoise(len, 110 + variation);
  const bodyFilt = lpfBiquad(bodyNoise, 400, 0.8);
  const bodyEnv = adsr(len, 0.02, 0.5, 0.8, 0.9, 0.35);
  for (let i = 0; i < len; i++) out[i] += bodyFilt[i] * bodyEnv[i] * 0.4;

  // Sub bass rumble
  const sub = subThump(1.5, 55, 25, 0.03);
  mix(out, sub, 0.45, Math.floor(0.02 * RATE));

  // Secondary crack (echo)
  const crack2Offset = Math.floor((0.25 + variation * 0.1) * RATE);
  const crack2Noise = makeNoise(crackLen, 120 + variation);
  const crack2Filt = hpf(crack2Noise, 2500);
  const crack2Env = adsr(crackLen, 0.001, 0.015, 0, 0.04, 0);
  for (let i = 0; i < crackLen && (i + crack2Offset) < len; i++) {
    out[i + crack2Offset] += crack2Filt[i] * crack2Env[i] * 0.5;
  }

  return normalise(softClip(reverb(out, 0.4, 0.7)));
}

function renderBlast(variation = 0) {
  const dur = 2.0;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // Initial click transient
  const click = transientClick(0.004);
  mix(out, click, 0.9);

  // Main boom: sub bass
  const boom = subThump(0.8, 100, 25, 0.002);
  mix(out, boom, 0.7, Math.floor(0.003 * RATE));

  // Mid-range explosion body
  const noise = makeNoise(len, 130 + variation);
  const bodyFilt = lpfBiquad(noise, 1800, 1.5);
  const bodyEnv = adsr(len, 0.002, 0.15, 0.3, 1.0, 0.3);
  for (let i = 0; i < len; i++) out[i] += bodyFilt[i] * bodyEnv[i] * 0.45;

  // High debris tail
  const debris = makeNoise(len, 140 + variation);
  const debrisFilt = bpf(debris, 3500, 1.0);
  const debrisEnv = adsr(len, 0.05, 0.3, 0.5, 0.8, 0.15);
  for (let i = 0; i < len; i++) out[i] += debrisFilt[i] * debrisEnv[i] * 0.15;

  // Crackling debris
  const crackle = makeNoise(len, 150 + variation);
  const crackleFilt = hpf(crackle, 5000);
  const crackleEnv = adsr(len, 0.1, 0.3, 0.6, 0.5, 0.08);
  for (let i = 0; i < len; i++) out[i] += crackleFilt[i] * crackleEnv[i] * 0.08;

  return normalise(softClip(reverb(out, 0.35, 0.55), 2));
}

function renderBossRoar(variation = 0) {
  const dur = 1.2;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // Deep growling sawtooth
  const phases = expSweep(len, 80 + variation * 10, 55);
  const saw = sawFromPhase(phases);
  const filt = lpfBiquad(saw, 350, 2.0);
  const env = adsr(len, 0.05, 0.2, 0.5, 0.45, 0.6);
  for (let i = 0; i < len; i++) out[i] += filt[i] * env[i] * 0.5;

  // Noisy breath layer
  const noise = makeNoise(len, 200 + variation);
  const nfilt = bpf(noise, 600, 0.8);
  const nenv = adsr(len, 0.08, 0.25, 0.4, 0.47, 0.4);
  for (let i = 0; i < len; i++) out[i] += nfilt[i] * nenv[i] * 0.35;

  // Guttural formant resonance
  const formant = bpf(noise, 280, 3.0);
  const fenv = adsr(len, 0.1, 0.3, 0.35, 0.45, 0.5);
  for (let i = 0; i < len; i++) out[i] += formant[i] * fenv[i] * 0.3;

  // Sub rumble
  const sub = subThump(0.6, 60, 30, 0.05);
  mix(out, sub, 0.35, Math.floor(0.05 * RATE));

  return normalise(softClip(reverb(out, 0.3, 0.5), 1.8));
}

function renderArrowLoose(variation = 0) {
  const dur = 0.25;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // Twang: short string vibration with inharmonic partials
  const partials = [
    [1.0, 0.6, 0.15],
    [2.3, 0.3, 0.1],
    [3.8, 0.15, 0.07],
  ];
  const twang = metallicPartials(dur, 200 + variation * 40, partials, 1.2);
  mix(out, twang, 0.5);

  // Whoosh: short noise sweep
  const noise = makeNoise(len, 160 + variation);
  const nfilt = bpf(noise, 2200 + variation * 300, 1.5);
  const nenv = adsr(len, 0.005, 0.06, 0.02, 0.1, 0.2);
  for (let i = 0; i < len; i++) out[i] += nfilt[i] * nenv[i] * 0.35;

  // Click at release
  const click = transientClick(0.004);
  mix(out, click, 0.4);

  return normalise(softClip(out));
}

function renderShamanHeal() {
  const dur = 0.55;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // Mystical shimmer: detuned sine cluster
  const freqs = [440, 554, 659]; // A4, C#5, E5 (A major triad)
  for (const f of freqs) {
    const phases1 = expSweep(len, f, f * 1.02);
    const phases2 = expSweep(len, f * 1.005, f * 1.015);
    const s1 = sinFromPhase(phases1);
    const s2 = sinFromPhase(phases2);
    const env = adsr(len, 0.04, 0.1, 0.2, 0.21, 0.5);
    for (let i = 0; i < len; i++) out[i] += (s1[i] + s2[i]) * env[i] * 0.15;
  }

  // Sparkle noise
  const noise = makeNoise(len, 170);
  const spark = hpf(noise, 5000);
  const sparkEnv = adsr(len, 0.03, 0.1, 0.15, 0.27, 0.1);
  for (let i = 0; i < len; i++) out[i] += spark[i] * sparkEnv[i] * 0.08;

  return normalise(reverb(out, 0.35, 0.6));
}

// ──────────────────────── Music loops ────────────────────────

function renderBossMusic() {
  // ~48 seconds at 120 BPM, menacing low ostinato + drums
  const bpm = 110;
  const beatDur = 60 / bpm;
  const bars = 16;
  const beatsPerBar = 4;
  const totalBeats = bars * beatsPerBar;
  const dur = totalBeats * beatDur;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);
  const rng = new Rng(300);

  // ── Bass ostinato: menacing low pattern ──
  // E1-G1-E1-Bb1 repeated with variation
  const bassNotes = [
    // bar pattern: root, minor third, root, tritone
    82.41, 98.00, 82.41, 116.54,  // E2, G2, E2, Bb2
    82.41, 98.00, 77.78, 73.42,   // E2, G2, Eb2, D2
  ];
  for (let beat = 0; beat < totalBeats; beat++) {
    const noteIdx = beat % bassNotes.length;
    const freq = bassNotes[noteIdx];
    const t = Math.floor(beat * beatDur * RATE);
    const nlen = Math.ceil(beatDur * 0.9 * RATE);
    const phases = expSweep(nlen, freq, freq);
    const saw = sawFromPhase(phases);
    const filt = lpfBiquad(saw, 250 + (beat % 4 === 3 ? 100 : 0), 2.0);
    const env = adsr(nlen, 0.005, 0.05, beatDur * 0.6, beatDur * 0.15, 0.7);
    for (let i = 0; i < nlen && (i + t) < len; i++) {
      out[i + t] += filt[i] * env[i] * 0.25;
    }
  }

  // ── Kick drum on 1 and 3 ──
  for (let beat = 0; beat < totalBeats; beat++) {
    if (beat % 2 !== 0) continue;
    const t = Math.floor(beat * beatDur * RATE);
    const kickLen = Math.ceil(0.2 * RATE);
    const kickPhases = expSweep(kickLen, 150, 35);
    const kickWave = sinFromPhase(kickPhases);
    const kickEnv = adsr(kickLen, 0.001, 0.08, 0.02, 0.1, 0.3);
    // Click transient
    const click = transientClick(0.005);
    for (let i = 0; i < click.length && (i + t) < len; i++) out[i + t] += click[i] * 0.3;
    for (let i = 0; i < kickLen && (i + t) < len; i++) {
      out[i + t] += kickWave[i] * kickEnv[i] * 0.4;
    }
  }

  // ── Snare / rim on 2 and 4 ──
  for (let beat = 0; beat < totalBeats; beat++) {
    if (beat % 2 !== 1) continue;
    const t = Math.floor(beat * beatDur * RATE);
    const snareLen = Math.ceil(0.15 * RATE);
    const snareNoise = makeNoise(snareLen, 500 + beat);
    const snareFilt = bpf(snareNoise, 1800, 1.0);
    const snareEnv = adsr(snareLen, 0.001, 0.04, 0.02, 0.08, 0.25);
    for (let i = 0; i < snareLen && (i + t) < len; i++) {
      out[i + t] += snareFilt[i] * snareEnv[i] * 0.3;
    }
    // Tone body
    const toneLen = Math.ceil(0.08 * RATE);
    const tonePhases = expSweep(toneLen, 250, 150);
    const toneWave = sinFromPhase(tonePhases);
    const toneEnv = adsr(toneLen, 0.001, 0.03, 0.01, 0.04, 0.3);
    for (let i = 0; i < toneLen && (i + t) < len; i++) {
      out[i + t] += toneWave[i] * toneEnv[i] * 0.15;
    }
  }

  // ── Hi-hat on eighth notes ──
  for (let eighth = 0; eighth < totalBeats * 2; eighth++) {
    const t = Math.floor(eighth * beatDur * 0.5 * RATE);
    const isOpen = eighth % 4 === 2;
    const hhDur = isOpen ? 0.1 : 0.04;
    const hhLen = Math.ceil(hhDur * RATE);
    const hhNoise = makeNoise(hhLen, 600 + eighth);
    const hhFilt = hpf(hhNoise, 7000);
    const hhEnv = adsr(hhLen, 0.001, hhDur * 0.8, 0, hhDur * 0.2, 0);
    const vol = isOpen ? 0.12 : 0.08;
    for (let i = 0; i < hhLen && (i + t) < len; i++) {
      out[i + t] += hhFilt[i] * hhEnv[i] * vol;
    }
  }

  // ── Menacing pad: low filtered noise ──
  const padNoise = makeNoise(len, 700);
  const padFilt = lpfBiquad(padNoise, 200, 0.5);
  const padEnv = adsr(len, 2.0, 1.0, dur - 5, 2.0, 0.15);
  for (let i = 0; i < len; i++) out[i] += padFilt[i] * padEnv[i] * 0.12;

  // ── Eerie high string drones that swell every 4 bars ──
  for (let bar = 0; bar < bars; bar += 4) {
    const t = Math.floor(bar * beatsPerBar * beatDur * RATE);
    const swellDur = 4 * beatsPerBar * beatDur;
    const swellLen = Math.ceil(swellDur * RATE);
    const freq = bar % 8 === 0 ? 329.63 : 311.13; // E4 or Eb4
    const phases1 = expSweep(swellLen, freq, freq * 1.003);
    const phases2 = expSweep(swellLen, freq * 1.001, freq * 1.005);
    const s1 = sawFromPhase(phases1);
    const s2 = sawFromPhase(phases2);
    const sf = lpfBiquad(s1.map((v, i) => (v + s2[i]) * 0.5), 2000, 1.0);
    const senv = adsr(swellLen, swellDur * 0.3, swellDur * 0.2, swellDur * 0.2, swellDur * 0.3, 0.6);
    for (let i = 0; i < swellLen && (i + t) < len; i++) {
      out[i + t] += sf[i] * senv[i] * 0.08;
    }
  }

  // Make the loop seamless: crossfade last 0.5s with first 0.5s
  const xfLen = Math.floor(0.5 * RATE);
  for (let i = 0; i < xfLen; i++) {
    const fade = i / xfLen;
    out[len - xfLen + i] *= (1 - fade);
    out[len - xfLen + i] += out[i] * fade * 0.5;
  }

  return normalise(softClip(reverb(out, 0.2, 0.4)));
}

function renderMenuMusic() {
  // ~35 seconds, calm medieval plucked
  const bpm = 80;
  const beatDur = 60 / bpm;
  const bars = 8;
  const beatsPerBar = 4;
  const totalBeats = bars * beatsPerBar;
  const dur = totalBeats * beatDur;
  const len = Math.ceil(dur * RATE);
  const out = new Float64Array(len);

  // Medieval scale: D Dorian (D E F G A B C D)
  // Melody using a calm arpeggio pattern
  const melodyNotes = [
    // Bar 1: Dm
    293.66, 349.23, 440.00, 349.23,
    // Bar 2: Am
    440.00, 523.25, 659.25, 523.25,
    // Bar 3: Gm
    392.00, 466.16, 587.33, 466.16,
    // Bar 4: C
    523.25, 659.25, 783.99, 659.25,
    // Bar 5: Dm
    293.66, 349.23, 440.00, 523.25,
    // Bar 6: F
    349.23, 440.00, 523.25, 440.00,
    // Bar 7: Am
    440.00, 523.25, 659.25, 523.25,
    // Bar 8: Dm resolve
    293.66, 349.23, 440.00, 293.66,
  ];

  for (let beat = 0; beat < totalBeats; beat++) {
    const freq = melodyNotes[beat % melodyNotes.length];
    const t = Math.floor(beat * beatDur * RATE);
    const noteDur = beatDur * 1.5; // overlapping notes for warmth
    const nlen = Math.ceil(noteDur * RATE);

    // Plucked string: sharp attack, fast decay, metallic partials
    const partials = [
      [1.0, 0.8, noteDur * 0.7],
      [2.0, 0.4, noteDur * 0.5],
      [3.0, 0.2, noteDur * 0.35],
      [4.0, 0.1, noteDur * 0.2],
      [5.0, 0.05, noteDur * 0.1],
    ];
    const pluck = metallicPartials(noteDur, freq, partials, 0.8);
    mix(out, pluck, 0.35, t);
  }

  // Drone: low D with gentle pulsing
  const droneLen = len;
  const dronePhases = expSweep(droneLen, 146.83, 146.83); // D3
  const droneSin = sinFromPhase(dronePhases);
  const droneEnv = adsr(droneLen, 1.0, 0.5, dur - 3.0, 1.5, 0.5);
  for (let i = 0; i < droneLen; i++) {
    // Gentle tremolo
    const trem = 0.8 + 0.2 * Math.sin(i / RATE * PI2 * 0.5);
    out[i] += droneSin[i] * droneEnv[i] * 0.08 * trem;
  }

  // Crossfade for looping
  const xfLen = Math.floor(0.5 * RATE);
  for (let i = 0; i < xfLen; i++) {
    const fade = i / xfLen;
    out[len - xfLen + i] *= (1 - fade);
    out[len - xfLen + i] += out[i] * fade * 0.5;
  }

  return normalise(reverb(out, 0.4, 0.6));
}

// ──────────────────────── Render all and write ────────────────────────

const SOUNDS = [
  // [filename, renderFn, variations] -- variations: array of args or null
  ['sword-swing', renderSwordSwing, [0, 1, 2]],
  ['sword-hit', renderSwordHit, [0, 1, 2]],
  ['enemy-death', renderEnemyDeath, [0, 1, 2]],
  ['player-hit', renderPlayerHit, [0, 1]],
  ['player-death', renderPlayerDeath, null],
  ['coin-pickup', renderCoinPickup, [0, 1]],
  ['food-pickup', renderFoodPickup, null],
  ['level-up', renderLevelUp, null],
  ['wave-start', renderWaveStart, null],
  ['upgrade-select', renderUpgradeSelect, null],
  ['thunder', renderThunder, [0, 1]],
  ['blast', renderBlast, [0, 1]],
  ['boss-roar', renderBossRoar, [0, 1]],
  ['arrow-loose', renderArrowLoose, [0, 1, 2]],
  ['shaman-heal', renderShamanHeal, null],
  ['boss-music', renderBossMusic, null],
  ['menu-music', renderMenuMusic, null],
];

console.log('gen-sfx: rendering audio assets...\n');
const results = [];

for (const [baseName, fn, variations] of SOUNDS) {
  if (variations) {
    for (const v of variations) {
      const name = `${baseName}-${v + 1}`;
      const samples = fn(v);
      const wav = encodeWav(samples);
      const path = join(AUDIO_DIR, `${name}.wav`);
      writeFileSync(path, wav);
      const durSec = (samples.length / RATE).toFixed(2);
      let peak = 0;
      for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
      const peakDb = (20 * Math.log10(peak)).toFixed(1);
      console.log(`  ${name}.wav  ${durSec}s  peak ${peakDb} dBFS`);
      results.push({ name: `${name}.wav`, dur: durSec, peak: peakDb });
    }
  } else {
    const samples = fn();
    const wav = encodeWav(samples);
    const path = join(AUDIO_DIR, `${baseName}.wav`);
    writeFileSync(path, wav);
    const durSec = (samples.length / RATE).toFixed(2);
    let peak = 0;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    const peakDb = (20 * Math.log10(peak)).toFixed(1);
    console.log(`  ${baseName}.wav  ${durSec}s  peak ${peakDb} dBFS`);
    results.push({ name: `${baseName}.wav`, dur: durSec, peak: peakDb });
  }
}

console.log(`\nDone: ${results.length} files written to audio/`);

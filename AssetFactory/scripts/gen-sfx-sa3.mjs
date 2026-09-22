/**
 * Generate the game's sound effects and music loops with Stable Audio 3 through the
 * local ComfyUI API (the audio worktree at C:\Users\coryc\ComfyUI-audio, port 8189).
 *
 *   tools/run-comfyui-audio.sh                       # start the server (models via junction)
 *   node AssetFactory/scripts/gen-sfx-sa3.mjs [--only slot,slot] [--force] [--seed N] [--dry]
 *
 * Graph (from ComfyUI's bundled Stable Audio 3 template, minus the Qwen reprompt):
 *   CheckpointLoaderSimple → MODEL, VAE
 *   CLIPLoader(t5gemma_b_b_ul2, type=stable_audio) → CLIPTextEncode(+) / CLIPTextEncode('')
 *   EmptyLatentAudio(seconds) → KSampler(8 steps, cfg 1, lcm/simple) → VAEDecodeAudio → SaveAudio (flac)
 * Outputs: AssetFactory/audio_raw/<file>-<n>.flac, then sfx_post.py → audio/<file>-<n>.wav
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..', '..');
const API = process.env.COMFY_AUDIO_URL || 'http://127.0.0.1:8189';
const PY = 'C:/Users/coryc/ComfyUI/venv_trellis/Scripts/python.exe';
const RAW = path.join(PROJECT, 'AssetFactory', 'audio_raw');
const OUT = path.join(PROJECT, 'audio');
const catalog = JSON.parse(fs.readFileSync(path.join(PROJECT, 'AssetFactory', 'audio', 'sfx-catalog.json'), 'utf8'));

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const only = opt('--only', null)?.split(',');
const force = args.includes('--force'), dry = args.includes('--dry');
const seedBase = parseInt(opt('--seed', '0'), 10);

function hashSeed(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }

function workflow({ ckpt, clip, prompt, seconds, seed, prefix }) {
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: ckpt } },
    '2': { class_type: 'CLIPLoader', inputs: { clip_name: clip, type: 'stable_audio', device: 'default' } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: prompt, clip: ['2', 0] } },
    '4': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['2', 0] } },
    '5': { class_type: 'EmptyLatentAudio', inputs: { seconds, batch_size: 1 } },
    '6': { class_type: 'KSampler', inputs: { seed, steps: 8, cfg: 1, sampler_name: 'lcm', scheduler: 'simple', denoise: 1, model: ['1', 0], positive: ['3', 0], negative: ['4', 0], latent_image: ['5', 0] } },
    '7': { class_type: 'VAEDecodeAudio', inputs: { samples: ['6', 0], vae: ['1', 2] } },
    '8': { class_type: 'SaveAudio', inputs: { audio: ['7', 0], filename_prefix: prefix } },
  };
}

async function queueAndWait(wf) {
  const res = await fetch(`${API}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wf }) });
  if (!res.ok) throw new Error(`queue failed: ${res.status} ${await res.text()}`);
  const { prompt_id } = await res.json();
  for (;;) {
    await new Promise(r => setTimeout(r, 1500));
    const h = await fetch(`${API}/history/${prompt_id}`); if (!h.ok) continue;
    const entry = (await h.json())[prompt_id]; if (!entry) continue;
    if (entry.status?.status_str === 'error') throw new Error('generation error: ' + JSON.stringify(entry.status.messages || '').slice(0, 400));
    if (entry.status?.completed) { for (const n of Object.values(entry.outputs)) if (n.audio?.length) return n.audio[0]; throw new Error('no audio output'); }
  }
}
async function download(info, dest) {
  const q = new URLSearchParams({ filename: info.filename, subfolder: info.subfolder || '', type: info.type || 'output' });
  const res = await fetch(`${API}/view?${q}`); if (!res.ok) throw new Error(`download failed: ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  if (!dry) try { await fetch(`${API}/system_stats`); } catch { console.error('ComfyUI (audio) is not reachable at ' + API + ' — run tools/run-comfyui-audio.sh'); process.exit(1); }
  fs.mkdirSync(RAW, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
  let ok = 0, n = 0;
  for (const s of catalog.sounds) {
    if (only && !only.includes(s.slot)) continue;
    for (let v = 1; v <= s.variations; v++) {
      const name = s.variations > 1 ? `${s.file}-${v}` : s.file;
      const out = path.join(OUT, `${name}.wav`), raw = path.join(RAW, `${name}.flac`);
      n++;
      if (!force && fs.existsSync(out)) { console.log(`skip ${name}`); ok++; continue; }
      const seed = (hashSeed(name) + seedBase) >>> 0;
      const wf = workflow({ ckpt: s.music ? catalog.model_music : catalog.model_sfx, clip: catalog.text_encoder, prompt: s.prompt, seconds: s.seconds, seed, prefix: `sa3/${name}` });
      if (dry) { console.log(`would generate ${name} (${s.seconds}s, seed ${seed})`); continue; }
      const t0 = Date.now();
      try {
        const info = await queueAndWait(wf);
        await download(info, raw);
        const postArgs = [path.join(__dirname, 'sfx_post.py'), raw, out, '--peak', '-1'];
        if (s.loop) postArgs.push('--loop'); else if (s.trim) postArgs.push('--trim', String(s.trim));
        const rep = execFileSync(PY, postArgs, { encoding: 'utf8' }).trim();
        console.log(`${name}: ${rep} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
        ok++;
      } catch (e) { console.error(`FAILED ${name}: ${e.message}`); }
    }
  }
  console.log(`done ${ok}/${n}`);
  if (ok < n && !dry) process.exit(2);
}
main();

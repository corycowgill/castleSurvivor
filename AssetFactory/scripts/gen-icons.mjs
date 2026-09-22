/**
 * Generate missing UI icons for Castle Survivor with the local ComfyUI server.
 *
 * Reuses the exact recipe embedded in the existing images/upgrades/*.png files
 * (juggernautXL_v9, 512x512, dpmpp_2m / karras, 30 steps, cfg 7, same prompt
 * template and negative prompt) so new icons match the old ones.
 *
 * Usage:  node AssetFactory/scripts/gen-icons.mjs [--force] [--only id,id]
 *   --force   regenerate even if the file exists
 *   --only    comma-separated icon ids to generate
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..', '..');
const API = 'http://127.0.0.1:8188';

const TEMPLATE = (subject) =>
  `medieval fantasy game icon, ${subject}, RPG item icon, dark vignette border, stylized game art, detailed illustration`;
const NEGATIVE = 'text, words, letters, watermark, signature, blurry, low quality, deformed, ugly, photo, realistic, 3d render, human, person, face, fingers, hands';

// id → { dir, subject }
const ICONS = {
  // Weapons (level-up cards, HUD tooltips, Codex, evolutions)
  spear:       { dir: 'images/upgrades', subject: 'a long knight\'s war spear with a gleaming leaf-shaped steel tip and dark oak shaft, leather-wrapped grip, thrust forward, cold blue steel glint' },
  quickblade:  { dir: 'images/upgrades', subject: 'a slim curved silver quickblade sword with fast motion streaks and a storm-blue energy trail, lightning-fast slash' },
  wardShields: { dir: 'images/upgrades', subject: 'three small round bronze heater shields with golden crests floating in an orbiting circle, protective golden ward glow' },
  stormCall:   { dir: 'images/upgrades', subject: 'a dramatic forked lightning bolt striking down from a dark storm cloud, crackling electric blue-white energy' },
  emberTrail:  { dir: 'images/upgrades', subject: 'a trail of burning footprints and glowing embers across dark ground, flames rising, orange and red fire' },
  // Forge (permanent upgrades)
  vitality:    { dir: 'images/forge', subject: 'a glowing ruby heart-shaped gemstone pulsing with red light, vitality crystal' },
  might:       { dir: 'images/forge', subject: 'a massive iron war hammer resting on a glowing forge anvil, sparks and heat' },
  swiftness:   { dir: 'images/forge', subject: 'a pair of winged leather boots with golden wings and blue speed streaks' },
  ironSkin:    { dir: 'images/forge', subject: 'a heavy iron breastplate armor with riveted plates and a steel sheen' },
  precision:   { dir: 'images/forge', subject: 'a golden eagle eye emblem with sharp focused pupil and target rings, keen sight, on a dark stone background' },
  magnetism:   { dir: 'images/forge', subject: 'a large horseshoe-shaped purple lodestone magnet with glowing tips, a few gold coins flying toward it, on a dark stone background' },
  regen:       { dir: 'images/forge', subject: 'a bubbling green troll blood potion in a glass vial, regenerating vines growing around it, on a dark stone background' },
  treasure:    { dir: 'images/forge', subject: 'an overflowing pile of gold coins and gems spilling from a small wooden chest, golden touch glow' },
  startDagger: { dir: 'images/forge', subject: 'a pair of throwing daggers strapped in a worn leather bandolier, steel blades' },
  rerolls:     { dir: 'images/forge', subject: 'two glowing golden fate dice tumbling with magical sparkles, destiny' },
  banish:      { dir: 'images/forge', subject: 'a cracked stone rune tablet shattering into purple void flames inside a pitch-black cave, glowing purple embers, black background, banishment ritual', seed: 777 },
  // Relics (conditional passives)
  phoenix:     { dir: 'images/relics', subject: 'a single glowing phoenix feather burning with orange and gold fire, floating, on a dark stone background' },
  hunter:      { dir: 'images/relics', subject: 'a bronze hunting medallion engraved with a stag skull and a crosshair, blood-red gem, on a dark stone background' },
  wolfsbane:   { dir: 'images/relics', subject: 'a wolf-fang charm on a leather cord with purple wolfsbane flowers, on a dark stone background' },
  berserker:   { dir: 'images/relics', subject: 'a cracked iron war mask with burning red eyes, rage, on a dark stone background' },
  runes:       { dir: 'images/relics', subject: 'three floating stone runestones glowing teal in a protective circle inside a pitch-black cave, black background, dark stone floor', seed: 4242 },
  greed:       { dir: 'images/relics', subject: 'a small golden idol statue of a grinning goblin hoarding coins, gold glow, inside a pitch-black treasure vault, black background, dark stone floor', seed: 9001 },
  windwalker:  { dir: 'images/relics', subject: 'a pair of light grey leather boots with swirling wind streaks around them, on a dark stone background' },
  bloodletter: { dir: 'images/relics', subject: 'a curved ritual dagger dripping blood with red crystal droplets, on a dark stone background' },
  hooves:      { dir: 'images/relics', subject: 'a golden horseshoe with lightning and dust clouds, galloping speed, on a dark stone background' },
};

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h) % 4294967295;
}

function buildWorkflow(positive, seed, prefix) {
  return {
    '3': { class_type: 'KSampler', inputs: { seed, steps: 30, cfg: 7.0, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1.0, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'juggernautXL_v9.safetensors' } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: positive, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: NEGATIVE, clip: ['4', 1] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: prefix, images: ['8', 0] } },
  };
}

async function queueAndWait(workflow) {
  const res = await fetch(`${API}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: workflow }) });
  if (!res.ok) throw new Error(`queue failed: ${res.status} ${await res.text()}`);
  const { prompt_id } = await res.json();
  for (;;) {
    await new Promise(r => setTimeout(r, 1500));
    const h = await fetch(`${API}/history/${prompt_id}`);
    if (!h.ok) continue;
    const hist = await h.json();
    const entry = hist[prompt_id];
    if (!entry) continue;
    if (entry.status?.status_str === 'error') throw new Error('generation error: ' + JSON.stringify(entry.status.messages || '').slice(0, 300));
    if (entry.status?.completed) {
      for (const node of Object.values(entry.outputs)) if (node.images?.length) return node.images[0];
      throw new Error('no image output');
    }
  }
}

async function download(info, dest) {
  const q = new URLSearchParams({ filename: info.filename, subfolder: info.subfolder || '', type: info.type || 'output' });
  const res = await fetch(`${API}/view?${q}`);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const onlyIdx = args.indexOf('--only');
  const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null;

  try { await fetch(`${API}/system_stats`); } catch { console.error('ComfyUI is not reachable at ' + API); process.exit(1); }

  const results = [];
  for (const [id, spec] of Object.entries(ICONS)) {
    if (only && !only.has(id)) continue;
    const dir = path.join(PROJECT, spec.dir);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${id}.png`);
    if (!force && fs.existsSync(dest)) { console.log(`skip ${id} (exists)`); continue; }
    const seed = spec.seed != null ? spec.seed : hashSeed(id);
    console.log(`generating ${id} (seed ${seed})`);
    const t0 = Date.now();
    try {
      const info = await queueAndWait(buildWorkflow(TEMPLATE(spec.subject), seed, `icon_${id}`));
      await download(info, dest);
      console.log(`  saved ${path.relative(PROJECT, dest)} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      results.push({ id, ok: true });
    } catch (e) {
      console.error(`  FAILED ${id}: ${e.message}`);
      results.push({ id, ok: false, error: e.message });
    }
  }
  const ok = results.filter(r => r.ok).length;
  console.log(`done: ${ok}/${results.length} generated`);
  if (ok < results.length) process.exit(2);
}

main();

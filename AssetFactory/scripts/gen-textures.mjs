/**
 * Ground textures, ground decals and grass sprites for the look pass (PLAN Phase 15),
 * generated with the local ComfyUI server and finished with sharp.
 *
 *   node AssetFactory/scripts/gen-textures.mjs [--force] [--only id,id] [--set textures|decals|sprites]
 *
 * Textures  → images/ground/<id>.webp (1024², made seamless by an offset + feathered
 *             blend so the SD seam disappears) and <id>_n.webp (normal map from luminance)
 * Decals    → images/decals/<id>.webp (512², alpha from a white-background render)
 * Sprites   → images/sprites/<id>.webp (512², alpha, grass tufts for the wind-swayed billboards)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, '..', '..');
const API = 'http://127.0.0.1:8188';
const CKPT = 'juggernautXL_v9.safetensors';

const STYLE = 'stylized hand-painted game texture, warcraft style, rich colour, crisp detail';
const PAINTERLY = 'hand-painted stylized game asset, warcraft 3 reforged style, painterly brush strokes, bold simplified shapes, saturated colour, cel shaded';
const NEG_TEX = 'text, watermark, signature, blurry, low quality, objects, animals, people, buildings, sky, horizon, perspective, shadows of objects, frame, border, seam';
const NEG_OBJ = 'text, watermark, signature, blurry, low quality, people, hands, frame, border, background scenery, shadow on ground, multiple objects, grid, photograph, photorealistic, photo texture, realistic';

const TEXTURES = {
  grass:      { subject: 'short green meadow grass blades with subtle darker and lighter patches, seen straight from above', seed: 31 },
  grassDry:   { subject: 'dry yellow-green trampled grass with patches of earth seen straight from above' },
  dirt:       { subject: 'packed brown dirt path with small pebbles and dust seen straight from above' },
  mud:        { subject: 'dark wet mud with puddles and hoof marks seen straight from above' },
  cobble:     { subject: 'worn grey cobblestone pavement with moss in the cracks seen straight from above' },
  litter:     { subject: 'autumn leaf litter, brown and orange fallen leaves on dark soil seen straight from above' },
  needles:    { subject: 'dry brown pine needles and cones on dark forest soil seen straight from above' },
  moss:       { subject: 'thick green moss with tiny ferns on dark damp soil seen straight from above' },
  // Emberreach (volcano / ogre homeland). Base is `ash`; the splat layers are
  // basalt (bare rock), cinder (burnt ground), lavaCrust (glowing bank apron) and
  // sulfur (vent deposits). lavaFlow scrolls along the lava ribbons.
  ash:        { subject: 'fine pale grey volcanic ash with wind ripples and a few small dark cinder specks, seen straight from above', seed: 201 },
  basalt:     { subject: 'dark grey-black volcanic basalt rock, cracked into angular plates with fine grey ash in the seams, seen straight from above', seed: 202 },
  cinder:     { subject: 'matte black burnt earth, soot and fine charcoal dust with flecks of pale grey ash and a few tiny dull orange sparks, dark and unlit, seen straight from above', seed: 233 },
  lavaCrust:  { subject: 'black cooled lava crust broken into plates with a bright network of glowing orange and yellow molten cracks between them, seen straight from above', seed: 204 },
  sulfur:     { subject: 'crusty bright yellow sulphur mineral deposit over dark volcanic rock, pale yellow-white crystalline edges, seen straight from above', seed: 205 },
  lavaFlow:   { subject: 'bright molten lava flowing, glowing yellow-white at the hottest veins through orange to deep red, with drifting dark grey crust plates on the surface, seen straight from above', seed: 206 },
};
const DECALS = {
  puddle:     { subject: 'a single shallow muddy rain puddle, seen straight from above' },
  cracks:     { subject: 'a patch of cracked dry brown earth with bold dark cracks, seen straight from above', seed: 105, painterly: true },
  cobblePatch:{ subject: 'an irregular patch of chunky grey cobblestones set in brown dirt, seen straight from above', seed: 102, painterly: true },
  rubble:     { subject: 'a scattered pile of chunky broken grey stone blocks, seen straight from above', seed: 104, painterly: true },
  bones:      { subject: 'a few scattered cartoon animal bones and one goblin skull, seen straight from above', seed: 101, painterly: true },
  leafPile:   { subject: 'a loose pile of brown and orange autumn leaves, seen straight from above' },
  hayScatter: { subject: 'loose scattered straw and hay on the ground, seen straight from above' },
  hoofPrints: { subject: 'a trail of muddy horse hoof prints, seen straight from above' },
  mossPatch:  { subject: 'an irregular patch of green moss and tiny mushrooms, seen straight from above' },
  mushrooms:  { subject: 'a cluster of small brown forest mushrooms on soil, seen straight from above' },
  roots:      { subject: 'chunky stylized tree roots radiating outward from the centre over dark soil, seen straight from above, no trunk, no leaves', seed: 103, painterly: true },
  rootsMud:   { subject: 'an irregular patch of bare dark forest soil with small twigs and pine cones, seen straight from above', seed: 12 },
  // Emberreach decals
  scorch:     { subject: 'a very dark near-black charcoal burn scar shaped like an irregular blot, pure black soot in the middle with charred dark grey edges and a few black cinder flakes, extremely dark against the white background, seen straight from above', seed: 252, painterly: true },
  emberCrack: { subject: 'a jagged crack splitting dark ground open with molten orange light glowing up out of it, seen straight from above', seed: 212, painterly: true },
  ashDrift:   { subject: 'a soft irregular drift of pale grey volcanic ash settled over dark ground, seen straight from above', seed: 213, painterly: true },
  sulfurStain:{ subject: 'an irregular stain of crusty bright yellow sulphur deposit on dark rock, seen straight from above', seed: 214, painterly: true },
  slag:       { subject: 'a spill of dark glassy slag and iron scrap with a few dull orange hot pieces, seen straight from above', seed: 215, painterly: true },
};
const SPRITES = {
  tuft1: { subject: 'a single clump of green meadow grass, side view, game sprite' },
  tuft2: { subject: 'a single tall clump of wild green grass with seed heads, side view, game sprite, pure white background', seed: 5 },
  tuft3: { subject: 'a single small clump of dry yellow grass, side view, game sprite' },
  reeds: { subject: 'a single clump of tall green reeds with brown cattails, side view, game sprite, pure white background', seed: 9 },
  // Emberreach tufts: dead stalks, not grass
  ashTuft:    { subject: 'a single small clump of dead brittle grey-brown grass stalks, dried and withered, side view, game sprite, pure white background', seed: 221 },
  cinderTuft: { subject: 'a single small clump of burnt black charred grass stalks with pale ash on the tips, side view, game sprite, pure white background', seed: 222 },
};

function hashSeed(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; } return Math.abs(h) % 4294967295; }

function workflow(positive, negative, seed, size, prefix) {
  return {
    '3': { class_type: 'KSampler', inputs: { seed, steps: 30, cfg: 6.5, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1.0, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: CKPT } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: size, height: size, batch_size: 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: positive, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: negative, clip: ['4', 1] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: prefix, images: ['8', 0] } },
  };
}
async function queueAndWait(wf) {
  const res = await fetch(`${API}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: wf }) });
  if (!res.ok) throw new Error(`queue failed: ${res.status} ${await res.text()}`);
  const { prompt_id } = await res.json();
  for (;;) {
    await new Promise(r => setTimeout(r, 2000));
    const h = await fetch(`${API}/history/${prompt_id}`); if (!h.ok) continue;
    const entry = (await h.json())[prompt_id]; if (!entry) continue;
    if (entry.status?.status_str === 'error') throw new Error('generation error: ' + JSON.stringify(entry.status.messages || '').slice(0, 300));
    if (entry.status?.completed) { for (const n of Object.values(entry.outputs)) if (n.images?.length) return n.images[0]; throw new Error('no image output'); }
  }
}
async function download(info) {
  const q = new URLSearchParams({ filename: info.filename, subfolder: info.subfolder || '', type: info.type || 'output' });
  const res = await fetch(`${API}/view?${q}`); if (!res.ok) throw new Error(`download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Seamless: shift by half, then blend the original back in along the centre cross
// (where the original is continuous) so every border is taken from the shifted copy.
async function makeSeamless(png) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, c = 3, hw = w >> 1, hh = h >> 1;
  const out = Buffer.alloc(data.length);
  const feather = w * 0.28;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = (x + hw) % w, sy = (y + hh) % h;                       // shifted sample
    const dx = Math.abs(x - hw), dy = Math.abs(y - hh);
    const m = Math.max(0, Math.min(1, 1 - Math.min(dx, dy) / feather)); // 1 on the centre cross, 0 away from it
    const mm = m * m * (3 - 2 * m);
    const o = (y * w + x) * c, s = (sy * w + sx) * c;
    for (let k = 0; k < c; k++) out[o + k] = Math.round(data[o + k] * mm + data[s + k] * (1 - mm));
  }
  return { raw: out, w, h };
}
// ── Normal map from blurred luminance (Sobel), tangent-space, +Y up in texture space
async function normalFromHeight(raw, w, h, strength = 2.2) {
  const blurred = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).blur(1.2).greyscale().raw().toBuffer();
  const out = Buffer.alloc(w * h * 3);
  const L = (x, y) => blurred[((y + h) % h) * w + ((x + w) % w)] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = (L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x - 1, y) + L(x - 1, y + 1));
    const gy = (L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x, y - 1) + L(x + 1, y - 1));
    let nx = -gx * strength, ny = -gy * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const o = (y * w + x) * 3;
    out[o] = Math.round((nx * 0.5 + 0.5) * 255); out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255); out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
  }
  return out;
}
// ── Alpha from a white background: distance from white → alpha, with a soft knee, then despill
async function alphaFromWhite(png, radial, feather = 40) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.sqrt((255 - data[i]) ** 2 + (255 - data[i + 1]) ** 2 + (255 - data[i + 2]) ** 2);
    let a = Math.max(0, Math.min(1, (d - 18) / feather));
    // Un-blend the white background from semi-transparent edge pixels (removes the pale halo)
    if (a > 0.02 && a < 0.999) for (let k = 0; k < 3; k++) data[i + k] = Math.max(0, Math.min(255, Math.round((data[i + k] - (1 - a) * 255) / a)));
    data[i + 3] = Math.round(a * 255);
  }
  if (radial) {
    // Ground decals get an irregular round footprint so a square render never shows
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2), th = Math.atan2(dy, dx);
      const rr = Math.hypot(dx, dy) / (0.8 + 0.12 * Math.sin(th * 3 + 1.7) + 0.06 * Math.sin(th * 7 + 0.4));
      const t = Math.max(0, Math.min(1, (rr - 0.55) / 0.45)); const fade = 1 - t * t * (3 - 2 * t);
      const o = (y * w + x) * 4 + 3; data[o] = Math.round(data[o] * fade);
    }
  } else {
    // Sprites: fade only the outer 4% so square edges never show
    const edge = w * 0.04;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const e = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (e < edge) { const o = (y * w + x) * 4 + 3; data[o] = Math.round(data[o] * (e / edge)); }
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } });
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const onlyIdx = args.indexOf('--only'); const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null;
  const setIdx = args.indexOf('--set'); const set = setIdx >= 0 ? args[setIdx + 1] : 'all';
  try { await fetch(`${API}/system_stats`); } catch { console.error('ComfyUI is not reachable at ' + API); process.exit(1); }

  const jobs = [];
  if (set === 'all' || set === 'textures') for (const [id, s] of Object.entries(TEXTURES)) jobs.push({ kind: 'texture', id, ...s });
  if (set === 'all' || set === 'decals') for (const [id, s] of Object.entries(DECALS)) jobs.push({ kind: 'decal', id, ...s });
  if (set === 'all' || set === 'sprites') for (const [id, s] of Object.entries(SPRITES)) jobs.push({ kind: 'sprite', id, ...s });

  let ok = 0, n = 0;
  for (const j of jobs) {
    if (only && !only.has(j.id)) continue;
    n++;
    const dir = path.join(PROJECT, 'images', j.kind === 'texture' ? 'ground' : j.kind === 'decal' ? 'decals' : 'sprites');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${j.id}.webp`);
    if (!force && fs.existsSync(dest)) { console.log(`skip ${j.id}`); ok++; continue; }
    const seed = j.seed ?? hashSeed(j.id);
    const t0 = Date.now();
    try {
      let png;
      if (j.kind === 'texture') {
        png = await download(await queueAndWait(workflow(`seamless tileable texture, ${j.subject}, flat even lighting, ${STYLE}`, NEG_TEX, seed, 1024, `tex_${j.id}`)));
        const { raw, w, h } = await makeSeamless(png);
        await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).webp({ quality: 88 }).toFile(dest);
        const nrm = await normalFromHeight(raw, w, h);
        await sharp(nrm, { raw: { width: w, height: h, channels: 3 } }).webp({ quality: 90 }).toFile(dest.replace('.webp', '_n.webp'));
      } else {
        const sizePrompt = j.kind === 'decal' ? `${j.subject}, isolated on a pure white background, ${j.painterly ? PAINTERLY : STYLE}` : `${j.subject}, isolated on a pure white background, ${STYLE}, transparent background style`;
        png = await download(await queueAndWait(workflow(sizePrompt, NEG_OBJ, seed, 768, `${j.kind}_${j.id}`)));
        const img = await alphaFromWhite(png, j.kind === 'decal');
        await img.resize(512, 512).webp({ quality: 90 }).toFile(dest);
      }
      fs.writeFileSync(path.join(dir, `${j.id}.src.png`), png);
      console.log(`${j.kind} ${j.id}: ${path.relative(PROJECT, dest)} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      ok++;
    } catch (e) { console.error(`FAILED ${j.id}: ${e.message}`); }
  }
  console.log(`done ${ok}/${n}`);
  if (ok < n) process.exit(2);
}
main();

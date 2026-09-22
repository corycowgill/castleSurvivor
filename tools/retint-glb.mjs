/**
 * Style unification for the pipeline props (PLAN 15.6a).
 *
 * The Trellis-generated props come out muted and cool next to the saturated,
 * warm Warcraft-style buildings. This rewrites their textures in place:
 *   - every pipeline GLB: saturation +22%, slight warm shift, a touch more contrast
 *   - fences (white picket): near-white, low-saturation pixels are pulled to
 *     weathered oak so the set reads as wooden rails instead of suburban picket
 *
 * Originals are copied to AssetFactory/glb_pretint/ the first time, and the script
 * always starts from that copy, so re-running with new numbers never compounds.
 *
 *   node tools/retint-glb.mjs [--only key,key] [--dry] [--sheet]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { EXTRA_ASSETS } from '../assets-extra.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const GAME = path.join(ROOT, 'Game3DAssets');
const BACKUP = path.join(ROOT, 'AssetFactory', 'glb_pretint');
fs.mkdirSync(BACKUP, { recursive: true });

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const dry = args.includes('--dry');

// Per-key overrides on top of the global grade
const WOOD = { r: 138, g: 102, b: 66 };
const FENCE_KEYS = new Set(['village_fence_straight_01', 'village_fence_corner_01', 'village_fence_gate_01', 'village_fence_broken_01', 'village_rail_fence_straight_01', 'village_rail_fence_corner_01', 'village_rail_fence_gate_01']);
const SKIP = new Set(['oakTree', 'hayBales', 'villageWell', 'swordShrine']); // hand-made, already in the buildings' palette

async function gradeTexture(buf, { fence }) {
  const img = sharp(buf);
  const meta = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let r = data[o] / 255, g = data[o + 1] / 255, b = data[o + 2] / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    if (fence && lum > 0.42 && sat < 0.38) {
      // pull pale paint to oak, keeping the grain: luminance variation becomes wood-tone variation
      const t = Math.min(1, (lum - 0.42) / 0.2) * (1 - sat / 0.38);
      const shade = 0.7 + (lum - 0.42) * 0.5;
      const wr = WOOD.r / 255 * shade, wg = WOOD.g / 255 * shade, wb = WOOD.b / 255 * shade;
      r = r + (wr - r) * t; g = g + (wg - g) * t; b = b + (wb - b) * t;
    }
    // saturation +22%
    const l2 = 0.299 * r + 0.587 * g + 0.114 * b;
    r = l2 + (r - l2) * 1.22; g = l2 + (g - l2) * 1.22; b = l2 + (b - l2) * 1.22;
    // warm shift + gentle contrast around mid grey
    r = (r * 1.04 - 0.5) * 1.08 + 0.5; g = (g * 1.0 - 0.5) * 1.08 + 0.5; b = (b * 0.95 - 0.5) * 1.08 + 0.5;
    data[o] = Math.max(0, Math.min(255, Math.round(r * 255)));
    data[o + 1] = Math.max(0, Math.min(255, Math.round(g * 255)));
    data[o + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
  }
  const out = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  return meta.format === 'webp' ? out.webp({ quality: 88 }).toBuffer() : meta.format === 'jpeg' ? out.jpeg({ quality: 90 }).toBuffer() : out.png().toBuffer();
}

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });
  let done = 0;
  for (const a of EXTRA_ASSETS) {
    if (only && !only.has(a.key)) continue;
    if (SKIP.has(a.key)) continue;
    const game = path.join(GAME, a.file), backup = path.join(BACKUP, a.file);
    if (!fs.existsSync(backup)) fs.copyFileSync(game, backup);
    const doc = await io.read(backup);
    const textures = doc.getRoot().listTextures();
    let changed = 0;
    for (const tex of textures) {
      const mime = tex.getMimeType();
      if (!/image\/(png|jpeg|webp)/.test(mime)) continue;
      // only colour textures: skip normal / metal-rough maps (named or by usage)
      const uses = new Set();
      for (const mat of doc.getRoot().listMaterials()) {
        if (mat.getBaseColorTexture() === tex) uses.add('base');
        if (mat.getNormalTexture() === tex) uses.add('normal');
        if (mat.getMetallicRoughnessTexture() === tex) uses.add('mr');
        if (mat.getEmissiveTexture() === tex) uses.add('emissive');
      }
      if (!uses.has('base')) continue;
      const graded = await gradeTexture(Buffer.from(tex.getImage()), { fence: FENCE_KEYS.has(a.key) });
      tex.setImage(new Uint8Array(graded));
      changed++;
    }
    if (dry) { console.log(`${a.key}: ${changed} base textures (dry)`); continue; }
    await io.write(game, doc);
    done++;
    console.log(`${a.key}: regraded ${changed} texture(s)${FENCE_KEYS.has(a.key) ? ' (fence → oak)' : ''}`);
  }
  console.log(`retinted ${done} GLBs; originals in ${path.relative(ROOT, BACKUP)}`);
}
main().catch(e => { console.error(e); process.exit(1); });

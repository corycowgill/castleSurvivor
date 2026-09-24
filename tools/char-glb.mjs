/**
 * Re-graded variants of existing props: charred/basalt for Emberreach and
 * bog/bleached for Mirefen (NEW-LEVEL-PLAN §1a).
 *
 *   node tools/char-glb.mjs [--only key,key] [--dry] [--sheet]
 *
 * Takes a GLB we already ship, rewrites its base-colour textures through a
 * "burnt" or "volcanic rock" grade, and writes it out under a new key. No GPU,
 * a second per asset, and the result is automatically consistent with the rest
 * of the art because it IS the rest of the art.
 *
 * The grade is deliberately not "multiply by 0.2". A black tree on black ground
 * is invisible from the top-down camera, so each profile lands its values in a
 * band (`floor` .. `floor + range`) and keeps enough of the original luminance
 * variation to read as bark or stone. Saturation is crushed rather than removed
 * so a hint of the original material survives.
 *
 * Output:
 *   Game3DAssets/<newKey>.glb
 *   AssetFactory/catalog/charred.json   — registry entries, merged into
 *                                         assets-extra.js by tools/add-assets.mjs
 * Run this BEFORE tools/add-assets.mjs.
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
const OUT_JSON = path.join(ROOT, 'AssetFactory', 'catalog', 'charred.json');

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const dry = args.includes('--dry');

// ── Grades ────────────────────────────────────────────────────────────────
// floor/range: where the output luminance band sits (0..1)
// gamma: <1 opens the shadows, >1 crushes them
// sat: what fraction of the original saturation survives
// tint: per-channel multiplier applied last (cool for stone, neutral-warm for char)
const GRADES = {
  char:   { floor: 0.055, range: 0.40, gamma: 1.25, sat: 0.16, tint: [1.03, 0.97, 0.92], contrast: 1.18 },
  basalt: { floor: 0.050, range: 0.38, gamma: 1.10, sat: 0.10, tint: [0.95, 0.97, 1.04], contrast: 1.22 },
  // Pulled down from floor 0.30 / range 0.52: at that band an ash-covered dead tree
  // rendered bone white and read as snow, which on a lava map is the wrong season.
  ash:    { floor: 0.190, range: 0.40, gamma: 0.95, sat: 0.06, tint: [1.03, 1.00, 0.95], contrast: 1.08 },
  // Foliage starts dark (deep green) and the `char` band would take it to near-black,
  // which vanishes against basalt ground. This opens the shadows instead, so a burnt
  // pine reads as a grey ash-covered skeleton rather than a hole in the frame.
  charFoliage: { floor: 0.085, range: 0.40, gamma: 0.82, sat: 0.04, tint: [1.04, 1.00, 0.94], contrast: 1.15 },

  // ── Mirefen ──
  // The bog is a GREEN map, so unlike the volcanic grades these keep real
  // saturation and steer it rather than crushing it. `sat` here is the fraction
  // of the ORIGINAL hue that survives before the tint lands, so 0.2 keeps enough
  // wood or stone underneath for the moss to look like it is growing ON something.
  bogMoss:  { floor: 0.090, range: 0.42, gamma: 1.00, sat: 0.22, tint: [0.80, 1.06, 0.74], contrast: 1.12 },
  // Waterlogged: dark, desaturated, faintly cold. Rot, not soot -- the floor sits
  // above `char` so a sunken log still reads as wood against black water.
  sunken:   { floor: 0.075, range: 0.34, gamma: 1.12, sat: 0.16, tint: [0.98, 1.00, 0.99], contrast: 1.16 },
  // Driftwood bleached bone-pale. This is the map's brightest value and it is
  // meant to be: pale wood is the only thing that reads against peat from above.
  bleached: { floor: 0.300, range: 0.44, gamma: 0.88, sat: 0.05, tint: [1.00, 1.00, 1.02], contrast: 1.05 },
  // Stone under algae: greener and lighter than bogMoss, for rock rather than bark.
  algaeStone: { floor: 0.150, range: 0.40, gamma: 0.95, sat: 0.18, tint: [0.86, 1.04, 0.80], contrast: 1.10 },
};

// source key → { key, name, grade }.  Scale, radius and breakability are inherited
// from the source entry, so a charred stump collides exactly like the stump does.
const VARIANTS = [
  // Emberreach is a lava map: no conifers, only standing dead. Exactly one dead-tree
  // mesh survived validation (nature_dead_tree_01/02 are splinters), so the variety
  // comes from VALUE - the same silhouette sooted black, scorched grey and ash-bleached
  // reads as three different trees from the top-down camera.
  { from: 'nature_dead_tree_03',  key: 'char_dead_tree_01',  name: 'Charred Dead Tree',   grade: 'char' },
  { from: 'nature_dead_tree_03',  key: 'char_dead_tree_02',  name: 'Ashen Dead Tree',     grade: 'ash' },
  { from: 'nature_dead_tree_03',  key: 'char_dead_tree_03',  name: 'Scorched Dead Tree',  grade: 'charFoliage' },
  { from: 'nature_fallen_log_01', key: 'char_fallen_log_01', name: 'Charred Fallen Log',  grade: 'char' },
  { from: 'prop_tree_stump_02',   key: 'char_stump_01',      name: 'Charred Stump',       grade: 'char' },
  { from: 'nature_bush_03',       key: 'char_bush_01',       name: 'Dead Scorched Bush',  grade: 'charFoliage' },
  { from: 'shrubbery',            key: 'char_shrub_01',      name: 'Burnt Scrub',         grade: 'charFoliage' },
  { from: 'prop_logs_02',         key: 'char_logs_01',       name: 'Charred Log Stack',   grade: 'char' },
  { from: 'combat_barricade_01',  key: 'char_barricade_01',  name: 'Burnt Barricade',     grade: 'char' },
  { from: 'boulder',              key: 'basalt_boulder_01',  name: 'Basalt Boulder',      grade: 'basalt' },
  { from: 'nature_rock_cluster_02', key: 'basalt_cluster_01', name: 'Basalt Rubble',      grade: 'basalt' },
  { from: 'nature_rock_small_01', key: 'basalt_small_01',    name: 'Basalt Rock',         grade: 'basalt' },
  { from: 'nature_rock_small_02', key: 'basalt_small_02',    name: 'Basalt Rock (B)',     grade: 'basalt' },

  // Mirefen. The bog has one job the volcano did not: it has to read GREEN and
  // still have something pale in it, or the top-down frame turns into one dark
  // smear. So the set is deliberately split three ways -- mossy (green mass),
  // sunken (dark wet mass) and bleached (the pale note) -- across silhouettes the
  // player already knows from Kingsfield and Darkwood.
  { from: 'nature_dead_tree_03',   key: 'bog_dead_tree_01',   name: 'Drowned Tree',        grade: 'sunken' },
  { from: 'nature_dead_tree_03',   key: 'bog_dead_tree_02',   name: 'Bleached Snag',       grade: 'bleached' },
  { from: 'nature_oak_large_01',   key: 'bog_oak_01',         name: 'Mossy Bog Oak',       grade: 'bogMoss' },
  { from: 'oakTree',               key: 'bog_oak_02',         name: 'Moss-Hung Oak',       grade: 'bogMoss' },
  { from: 'nature_fallen_log_01',  key: 'bog_log_01',         name: 'Waterlogged Log',     grade: 'sunken' },
  { from: 'prop_tree_stump_02',    key: 'bog_stump_01',       name: 'Mossy Stump',         grade: 'bogMoss' },
  { from: 'nature_fern_01',        key: 'bog_fern_01',        name: 'Marsh Fern',          grade: 'bogMoss' },
  { from: 'nature_flowers_02',     key: 'bog_flowers_01',     name: 'Marsh Flowers',       grade: 'bogMoss' },
  { from: 'boulder',               key: 'bog_rock_01',        name: 'Algae Boulder',       grade: 'algaeStone' },
  { from: 'nature_rock_cluster_02', key: 'bog_rock_cluster_01', name: 'Mossy Rubble',      grade: 'algaeStone' },
  // NOT regraded, and the reason is worth keeping: Trellis mislabels, and the
  // grade makes a mislabel worse. nature_bush_03 is actually a mossy BENCH, so
  // bog_bush_01 came out as a neon-green lozenge on legs and the generator put
  // 437 of them across the map. nature_rock_small_01 is a tiny castle (same
  // list in the asset-registry notes). And shrubbery.glb draws 0.6% of frame --
  // it is a thin mesh that never really renders, so bog_scrub_01 was 419
  // invisible objects. Look at tools/shots/glb-sheet.png before adding one.

  { from: 'char_fallen_log_01',    key: 'bog_driftwood_01',   name: 'Driftwood',           grade: 'bleached' },
  { from: 'prop_logs_02',          key: 'bog_logs_01',        name: 'Rotting Log Stack',   grade: 'sunken' },
  { from: 'village_fence_broken_01', key: 'bog_fence_01',     name: 'Rotted Fence',        grade: 'sunken' },
  { from: 'prop_wood_crate_broken_01', key: 'bog_crate_01',   name: 'Swollen Crate',       grade: 'sunken' },
  { from: 'combat_barricade_01',   key: 'bog_barricade_01',   name: 'Rotted Barricade',    grade: 'sunken' },
  { from: 'combat_broken_cart_01', key: 'bog_cart_01',        name: 'Sunken Cart',         grade: 'sunken' },
];

// Source entries for the legacy (non-pipeline) assets that have no assets-extra.js row
const LEGACY_SRC = {
  pineTree:  { file: 'pineTree.glb',  category: 'tree',   defaultScale: 7,   obstacle: true, radius: 1.2, breakable: false },
  boulder:   { file: 'boulder.glb',   category: 'nature', defaultScale: 3.2, obstacle: true, radius: 1.7, breakable: false },
  shrubbery: { file: 'shrubbery.glb', category: 'nature', defaultScale: 2.6, obstacle: false, radius: 0,  breakable: false },
  oakTree:   { file: 'oakTree.glb',   category: 'tree',   defaultScale: 8,   obstacle: true,  radius: 1.4, breakable: false },
};
const ICONS = { props: '📦', village: '🏘', nature: '🌿', tree: '🌳' };

async function gradeTexture(buf, g) {
  const img = sharp(buf);
  const meta = await img.metadata();
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    let r = data[o] / 255, gg = data[o + 1] / 255, b = data[o + 2] / 255;
    const lum = 0.299 * r + 0.587 * gg + 0.114 * b;
    // Land the luminance in the grade's band, keeping the relative variation
    const shaped = Math.pow(Math.max(0, Math.min(1, lum)), g.gamma);
    const target = g.floor + shaped * g.range;
    const k = lum > 0.004 ? target / lum : 0;
    r *= k; gg *= k; b *= k;
    // Crush saturation toward the new luminance
    const l2 = 0.299 * r + 0.587 * gg + 0.114 * b;
    r = l2 + (r - l2) * g.sat; gg = l2 + (gg - l2) * g.sat; b = l2 + (b - l2) * g.sat;
    // Contrast around the band's midpoint, then tint
    const mid = g.floor + g.range * 0.5;
    r = (r - mid) * g.contrast + mid; gg = (gg - mid) * g.contrast + mid; b = (b - mid) * g.contrast + mid;
    r *= g.tint[0]; gg *= g.tint[1]; b *= g.tint[2];
    data[o] = Math.max(0, Math.min(255, Math.round(r * 255)));
    data[o + 1] = Math.max(0, Math.min(255, Math.round(gg * 255)));
    data[o + 2] = Math.max(0, Math.min(255, Math.round(b * 255)));
  }
  const out = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  return meta.format === 'webp' ? out.webp({ quality: 88 }).toBuffer()
       : meta.format === 'jpeg' ? out.jpeg({ quality: 90 }).toBuffer()
       : out.png().toBuffer();
}

// Materials with a flat base colour and no texture get the same treatment on the factor
function gradeFactor([r, g2, b, a], g) {
  const lum = 0.299 * r + 0.587 * g2 + 0.114 * b;
  const target = g.floor + Math.pow(Math.max(0, Math.min(1, lum)), g.gamma) * g.range;
  const k = lum > 0.004 ? target / lum : 0;
  let rr = r * k, gg = g2 * k, bb = b * k;
  const l2 = 0.299 * rr + 0.587 * gg + 0.114 * bb;
  rr = l2 + (rr - l2) * g.sat; gg = l2 + (gg - l2) * g.sat; bb = l2 + (bb - l2) * g.sat;
  return [rr * g.tint[0], gg * g.tint[1], bb * g.tint[2], a];
}

async function main() {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });
  const byKey = Object.fromEntries(EXTRA_ASSETS.map(a => [a.key, a]));
  const entries = [];
  let done = 0;

  for (const v of VARIANTS) {
    const src = byKey[v.from] || LEGACY_SRC[v.from];
    if (!src) { console.log(`skip ${v.key}: no source entry for ${v.from}`); continue; }
    const srcFile = path.join(GAME, src.file);
    if (!fs.existsSync(srcFile)) { console.log(`skip ${v.key}: ${src.file} not found`); continue; }

    const grade = GRADES[v.grade];
    const outFile = path.join(GAME, `${v.key}.glb`);
    const entry = {
      key: v.key, name: v.name, file: `${v.key}.glb`, category: src.category,
      defaultScale: src.defaultScale, obstacle: !!src.obstacle, radius: src.radius || 0,
      breakable: !!src.breakable, icon: ICONS[src.category] || '🌿', charredFrom: v.from,
    };
    // The registry is always complete, even under --only, so re-grading one asset
    // never drops the other eleven out of charred.json
    entries.push(entry);

    if (only && !only.has(v.key)) continue;
    if (dry) { console.log(`${v.key} <- ${v.from} (${v.grade}) [dry]`); continue; }

    const doc = await io.read(srcFile);
    const root = doc.getRoot();
    const baseTextures = new Set();
    for (const mat of root.listMaterials()) {
      const t = mat.getBaseColorTexture();
      if (t) baseTextures.add(t);
      else mat.setBaseColorFactor(gradeFactor(mat.getBaseColorFactor(), grade));
      // A charred prop is matte: nothing here should still look like polished metal
      if (mat.getMetallicFactor?.() != null) mat.setMetallicFactor(Math.min(mat.getMetallicFactor(), 0.05));
      if (mat.getRoughnessFactor?.() != null) mat.setRoughnessFactor(Math.max(mat.getRoughnessFactor(), 0.9));
      if (mat.getEmissiveFactor) mat.setEmissiveFactor([0, 0, 0]);
    }
    let changed = 0;
    for (const tex of baseTextures) {
      if (!/image\/(png|jpeg|webp)/.test(tex.getMimeType())) continue;
      tex.setImage(new Uint8Array(await gradeTexture(Buffer.from(tex.getImage()), grade)));
      changed++;
    }
    await io.write(outFile, doc);
    done++;
    console.log(`${v.key} <- ${v.from} (${v.grade}): ${changed} texture(s), ${(fs.statSync(outFile).size / 1024).toFixed(0)}KB`);
  }

  if (!dry) {
    fs.writeFileSync(OUT_JSON, JSON.stringify(entries, null, 2));
    console.log(`\nwrote ${path.relative(ROOT, OUT_JSON)} with ${entries.length} entries — now run tools/add-assets.mjs`);
  }
  console.log(`charred ${done}/${VARIANTS.length} GLBs`);
}
main().catch(e => { console.error(e); process.exit(1); });

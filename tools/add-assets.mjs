/**
 * Register validated environment GLBs with the game and the editor.
 *
 *   node tools/add-assets.mjs            (reads tools/reports/glb-validation.json)
 *
 * - Copies validated candidate files into Game3DAssets/ (pipeline files are already there)
 * - Derives key, category, scale, obstacle radius and breakability from the
 *   AssetFactory catalog (game.scaleMeters / collision / breakable), with
 *   hand-set entries for the few non-pipeline files
 * - Writes assets-extra.js: an ES module both index.html and editor.html import
 *
 * Scale calibration: models are normalised to a 1-unit max dimension. Existing
 * props sit at ~3 world units per metre (barrel 0.9 m → scale 3) and the knight
 * is 2.4 units tall, so props use 2.2 units/m and trees 1.3 units/m.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const report = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/reports/glb-validation.json'), 'utf8'));
const catalogRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'AssetFactory/catalog/assets.json'), 'utf8'));
const catalog = Object.fromEntries((Array.isArray(catalogRaw) ? catalogRaw : (catalogRaw.assets || Object.values(catalogRaw))).map(a => [a.id, a]));

// Scale pass (PLAN 15.3): the knight is ~2.3 units for 1.8 m, so 1.5 units/m keeps
// a barrel waist high and a crate knee high from the top-down camera. Tall
// fixtures (lantern posts, signposts, stalls) use a gentler factor still.
const UNITS_PER_M = { props: 1.5, village: 1.5, nature: 1.5, tree: 1.3, landmark: 1.5 };
const unitsFor = (category, metres) => (category !== 'tree' && metres > 2 ? 1.35 : UNITS_PER_M[category]);
const CATEGORY_MAP = { village_clutter: 'props', village_infrastructure: 'village', blacksmith_kit: 'village', farm_kit: 'props', tavern_kit: 'props', nature: 'nature', combat: 'props', landmarks: 'village', volcanic: 'nature', ogre_camp: 'village',
  // Mirefen: the swamp itself is nature (so the tree test below can catch the
  // cypresses), the fen-folk camp is built, so it scales like a village prop.
  swamp: 'nature', fen_camp: 'village' };
const ICONS = { props: '📦', village: '🏘', nature: '🌿', tree: '🌳' };
// Waist-high or fence-like props stay solid whatever their computed radius (fences
// still break on touch, so they can never pin the player)
const SOLID = new Set(['village_fence_straight_01', 'village_fence_corner_01', 'village_rail_fence_corner_01', 'village_rail_fence_straight_01',
  'prop_wood_crate_large_01', 'prop_table_wood_01', 'blacksmith_anvil_01', 'blacksmith_water_barrel_01', 'village_water_trough_01', 'prop_wheelbarrow_01', 'prop_logs_02', 'prop_bench_wood_01',
  // Emberreach: the camp furniture and the stake walls are waist-high or taller and must block
  'ogre_spike_wall_01', 'ogre_butcher_block_01', 'ogre_weapon_rack_01', 'ogre_barricade_01', 'ogre_brazier_01', 'ogre_cook_pot_01', 'ogre_forge_01',
  'volcanic_rock_cluster_01', 'volcanic_lava_rock_01', 'volcanic_obsidian_shards_01', 'combat_wall_rubble_01', 'combat_wall_destroyed_01',
  // Mirefen: waist-high or taller and must block
  'swamp_bog_rock_01', 'swamp_stump_mossy_01', 'swamp_moss_curtain_01', 'fen_totem_01', 'fen_fish_rack_01', 'fen_lantern_post_01', 'swamp_wisp_stone_01']);

// Non-pipeline keepers: name, category, metres, collision
const EXTRA = {
  hayBales:    { name: 'Hay Bales',          category: 'props',   metres: 1.2, collision: 'box', breakable: true },
  villageWell: { name: 'Village Well (Alt)', category: 'village', metres: 2.2, collision: 'cylinder', breakable: false },
  swordShrine: { name: 'Sword Shrine',       category: 'village', metres: 2.0, collision: 'cylinder', breakable: false },
  oakTree:     { name: 'Oak Tree',           category: 'tree',    metres: 8.0, collision: 'cylinder', breakable: false },
};

const out = [];
for (const r of report.results) {
  if (!r.valid) continue;
  const id = r.name.replace(/\.glb$/, '');
  const size = r.viewer?.size || r.size || [1, 1, 1];
  const footprint = Math.max(size[0], size[2]) / Math.max(size[0], size[1], size[2]);
  let entry;
  const cat = catalog[id];
  if (cat) {
    const g = cat.game || {};
    let category = CATEGORY_MAP[cat.category] || 'props';
    // Anything 3.5 m or taller in a natural category is a tree and gets the gentler
    // tree scale. Height has to be part of the test: family 'tree' alone would sweep
    // in nature_fallen_log_01, which is a 0.6 m log lying on the ground.
    const isTree = (g.scaleMeters || 1) >= 3.5 && (cat.family === 'tree' || cat.category === 'nature' || cat.category === 'volcanic' || cat.category === 'swamp');
    if (isTree) category = 'tree';
    const scale = +((g.scaleMeters || 1) * unitsFor(category, g.scaleMeters || 1)).toFixed(2);
    // Small clutter (buckets, pots, stools, sacks) never blocks movement: a survivors
    // map must let the player run through knee-high props, and 800+ tiny colliders
    // snagged the kiting bot. Radius ≤ 0.7 → walk-through (still breakable by touch).
    const rad = +(0.5 * scale * footprint).toFixed(1);
    const obstacle = g.collision && g.collision !== 'none' && g.solid !== false && (rad > 0.7 || SOLID.has(id));
    entry = { key: id, name: cat.name, file: r.name, category, defaultScale: scale,
              obstacle, radius: obstacle ? Math.max(rad, SOLID.has(id) ? 0.8 : 0) : 0,
              breakable: !!g.breakable, icon: ICONS[category] };
  } else if (EXTRA[id]) {
    const e = EXTRA[id];
    const scale = +(e.metres * unitsFor(e.category, e.metres)).toFixed(2);
    const rad = +(0.5 * scale * footprint).toFixed(1);
    const obstacle = e.collision !== 'none' && (rad > 0.7 || SOLID.has(id));
    entry = { key: id, name: e.name, file: r.name, category: e.category, defaultScale: scale,
              obstacle, radius: obstacle ? Math.max(rad, SOLID.has(id) ? 0.8 : 0) : 0,
              breakable: !!e.breakable, icon: ICONS[e.category] };
    const dest = path.join(ROOT, 'Game3DAssets', r.name);
    if (!fs.existsSync(dest)) { fs.copyFileSync(r.file, dest); console.log('copied', r.name); }
  } else {
    console.log('skip (no metadata):', r.name); continue;
  }
  if (!fs.existsSync(path.join(ROOT, 'Game3DAssets', r.name))) { console.log('MISSING in Game3DAssets:', r.name); continue; }
  out.push(entry);
}
// Charred / basalt re-grades of assets we already ship (tools/char-glb.mjs). They are
// not pipeline output so they have no validation row; their geometry is a file we
// already validated, so they inherit that file's scale, radius and breakability.
const CHARRED = path.join(ROOT, 'AssetFactory/catalog/charred.json');
if (fs.existsSync(CHARRED)) {
  const have = new Set(out.map(e => e.key));
  let n = 0;
  for (const e of JSON.parse(fs.readFileSync(CHARRED, 'utf8'))) {
    if (have.has(e.key)) continue;
    if (!fs.existsSync(path.join(ROOT, 'Game3DAssets', e.file))) { console.log('MISSING charred GLB:', e.file); continue; }
    out.push(e); n++;
  }
  console.log(`charred variants merged: ${n}`);
}

out.sort((a, b) => a.category.localeCompare(b.category) || a.key.localeCompare(b.key));

const js = `// Generated by tools/add-assets.mjs from tools/reports/glb-validation.json.
// Environment assets produced by the AssetFactory pipeline and validated in a
// three.js viewer. Imported by index.html (asset registry, breakables) and
// editor.html (palette). Regenerate rather than hand-edit.
export const EXTRA_ASSETS = ${JSON.stringify(out, null, 2)};
export const EXTRA_CATEGORIES = [
  { key: 'village', name: 'Village Fixtures' },
  { key: 'tree', name: 'Trees' },
];
`;
fs.writeFileSync(path.join(ROOT, 'assets-extra.js'), js);
const byCat = {}; for (const e of out) byCat[e.category] = (byCat[e.category] || 0) + 1;
console.log(`wrote assets-extra.js with ${out.length} assets:`, JSON.stringify(byCat));
console.log('breakable:', out.filter(e => e.breakable).map(e => e.key).join(', '));

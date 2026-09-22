/**
 * Dress Kingsfield (map.json) with the validated pipeline props, in themed
 * clusters around the buildings the map already has.
 *
 *   node tools/decorate-kingsfield.mjs          (idempotent: replaces its own objects)
 *
 * Rules: never on a road tile, never inside another obstacle, never within 9
 * units of the spawn, stays inside ±95. Every placed object carries gen:'decor1'
 * so a re-run removes and re-places them without touching hand-placed work.
 * A backup of the original map is written once to map.kingsfield.backup.json.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EXTRA_ASSETS } from '../assets-extra.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MAP = path.join(ROOT, 'map.json');
const BACKUP = path.join(ROOT, 'map.kingsfield.backup.json');
if (!fs.existsSync(BACKUP)) fs.copyFileSync(MAP, BACKUP);
const map = JSON.parse(fs.readFileSync(MAP, 'utf8'));
map.objects = map.objects.filter(o => o.gen !== 'decor1');

const A = Object.fromEntries(EXTRA_ASSETS.map(a => [a.key, a]));
let seed = 20260920;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const TAU = Math.PI * 2;

const obstacles = map.objects.filter(o => o.obstacle && o.radius > 0).map(o => ({ x: o.x, z: o.z, r: o.radius }));
const roads = map.objects.filter(o => o.key === 'road').map(o => ({ x: o.x, z: o.z }));
const keepOut = [{ x: map.spawnX || 0, z: map.spawnZ || 0, r: 9 }];

function clear(x, z, r) {
  if (Math.abs(x) > 95 || Math.abs(z) > 95) return false;
  for (const k of keepOut) if (Math.hypot(x - k.x, z - k.z) < k.r + r) return false;
  for (const rd of roads) if (Math.abs(x - rd.x) < 3.6 + r * 0.5 && Math.abs(z - rd.z) < 3.6 + r * 0.5) return false;
  for (const o of obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + r + 0.4) return false;
  return true;
}
let placed = 0;
const byKey = {};
function place(key, x, z, rotY = rnd() * TAU) {
  const a = A[key]; if (!a) { console.warn('unknown key', key); return false; }
  const r = a.obstacle ? a.radius : 0.5;
  if (!clear(x, z, r)) return false;
  map.objects.push({ key, x: +x.toFixed(1), z: +z.toFixed(1), rotX: 0, rotY: +rotY.toFixed(2), rotZ: 0, scale: a.defaultScale, obstacle: !!a.obstacle, radius: a.obstacle ? a.radius : 0, gen: 'decor1' });
  if (a.obstacle) obstacles.push({ x, z, r: a.radius });
  placed++; byKey[key] = (byKey[key] || 0) + 1;
  return true;
}
// Try several spots on a ring around a centre until one is clear
function ring(key, cx, cz, rMin, rMax, tries = 14, facing = null) {
  for (let i = 0; i < tries; i++) {
    const a = rnd() * TAU, d = rMin + rnd() * (rMax - rMin);
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const rot = facing === 'in' ? Math.atan2(cx - x, cz - z) : facing === 'out' ? Math.atan2(x - cx, z - cz) : rnd() * TAU;
    if (place(key, x, z, rot)) return true;
  }
  return false;
}
function pick(list) { return list[Math.floor(rnd() * list.length)]; }

// ── Blacksmiths: the whole kit around each forge building ──
for (const b of [{ x: 34, z: -6 }, { x: 60, z: 6 }]) {
  for (const k of ['blacksmith_forge_01', 'blacksmith_anvil_01', 'blacksmith_tool_rack_01', 'blacksmith_weapon_rack_01', 'blacksmith_water_barrel_01', 'blacksmith_coal_pile_01'])
    ring(k, b.x, b.z, 4.5, 7.5, 20, 'in');
}

// ── Town centre: stalls, signpost, wells, shrine, lantern posts along the crossroads ──
ring('village_market_stall_01', 12, -10, 0, 1.5, 6, 'in'); ring('village_market_stall_01', -12, 10, 0, 1.5, 6, 'in');
ring('village_signpost_01', 5, 5, 0, 1, 6);
ring('village_water_well_01', -12, 12, 0, 2, 8); ring('villageWell', 40, 12, 0, 3, 10);
ring('swordShrine', 12, -14, 0, 2, 8, 'in');
for (const [x, z] of [[5, -5], [-5, 5], [5, 5], [-5, -5]]) ring('village_lantern_post_01', x, z, 0, 1.2, 6);
for (const x of [-36, -18, 18, 36]) { ring('village_lantern_post_01', x, 4.5, 0, 0.8, 4); }
for (const z of [18, 36, 54]) { ring('village_lantern_post_01', 4.5, z, 0, 0.8, 4); ring('village_lantern_post_01', -4.5, z, 0, 0.8, 4); }

// ── Taverns: benches, tables, stools, jugs, hitching posts ──
for (const t of [{ x: 22, z: -8 }, { x: 22, z: 6 }, { x: 10, z: 8 }, { x: -4, z: 56 }, { x: -64, z: -6 }]) {
  ring('prop_table_wood_01', t.x, t.z, 4, 6.5, 16);
  for (let i = 0; i < 2; i++) ring('prop_stool_wood_01', t.x, t.z, 4, 7, 12);
  ring('prop_bench_wood_01', t.x, t.z, 4, 7, 12, 'in');
  ring(pick(['prop_water_jug_01', 'prop_pottery_01']), t.x, t.z, 3.5, 6, 12);
  ring('village_hitching_post_01', t.x, t.z, 5, 8, 12);
}

// ── Farms: fences, gate, scarecrow, wheelbarrow, sacks, hay, trough, buckets ──
for (const f of [{ x: -14, z: 24 }, { x: 18, z: 30 }, { x: 14, z: 56 }, { x: 28, z: -90 }]) {
  const side = rnd() < 0.5 ? 1 : -1;
  for (let i = 0; i < 4; i++) place('village_fence_straight_01', f.x + side * 8, f.z - 4.5 + i * 3, Math.PI / 2);
  place('village_fence_corner_01', f.x + side * 8, f.z + 8, side > 0 ? 0 : Math.PI / 2);
  for (let i = 0; i < 3; i++) place('village_fence_straight_01', f.x + side * 5 - i * side * 3, f.z + 8, 0);
  place('village_fence_gate_01', f.x - side * 6, f.z + 8, 0);
  ring('farm_scarecrow_01', f.x, f.z, 9, 13, 16);
  ring('prop_wheelbarrow_01', f.x, f.z, 4.5, 7, 12);
  ring('prop_grain_sack_stack_01', f.x, f.z, 4, 6.5, 12);
  for (let i = 0; i < 2; i++) ring('prop_grain_sack_01', f.x, f.z, 4, 7, 10);
  for (let i = 0; i < 3; i++) ring('prop_hay_bale_01', f.x, f.z, 4.5, 8, 10);
  ring('hayBales', f.x, f.z, 5, 8, 10);
  ring('village_water_trough_01', f.x, f.z, 4.5, 7, 10, 'in');
  ring(pick(['prop_bucket_wood_01', 'prop_bucket_metal_01']), f.x, f.z, 4, 6, 10);
  ring('prop_wood_crate_large_01', f.x, f.z, 4, 6.5, 10);
}

// ── Stable: trough, hay, hitching post, cart wheel ──
for (const k of ['village_water_trough_01', 'prop_hay_bale_01', 'prop_hay_bale_01', 'hayBales', 'village_hitching_post_01', 'prop_cart_wheel_01', 'prop_bucket_wood_01'])
  ring(k, 50, -10, 4.5, 8, 14);

// ── Houses: a little clutter each ──
const houses = map.objects.filter(o => o.key === 'house' && o.gen !== 'decor1');
for (const h of houses) {
  ring(pick(['prop_wood_crate_small_01', 'prop_wood_crate_large_01', 'prop_wood_crate_broken_01']), h.x, h.z, 4, 6, 10);
  ring(pick(['prop_grain_sack_01', 'prop_pottery_01', 'prop_bucket_wood_01', 'prop_water_jug_01']), h.x, h.z, 4, 6, 10);
  if (rnd() < 0.5) ring('prop_bench_wood_01', h.x, h.z, 4, 6.5, 10, 'in');
  if (rnd() < 0.4) ring('village_fence_broken_01', h.x, h.z, 5, 8, 10);
  if (rnd() < 0.35) ring('nature_bush_03', h.x, h.z, 4.5, 7, 8);
}

// ── Defences: barricade lines on the castle approach and facing each ogre keep ──
for (const x of [-12, -8, 8, 12]) place('combat_barricade_01', x, -23, 0);
for (const keep of [{ x: 75, z: -60 }, { x: -75, z: -60 }, { x: 80, z: 70 }, { x: -80, z: 60 }]) {
  const dx = -Math.sign(keep.x), dz = -Math.sign(keep.z);
  for (let i = -1; i <= 1; i++) place('combat_barricade_01', keep.x + dx * 16 + dz * i * 4, keep.z + dz * 16 - dx * i * 4, Math.atan2(dx, dz));
  ring('village_weapon_rack_01', keep.x + dx * 20, keep.z + dz * 20, 0, 3, 8);
}

// ── Nature: trees in the outskirts, rocks, logs, ferns, flowers ──
function outskirts() { for (;;) { const x = -92 + rnd() * 184, z = -92 + rnd() * 184; if (Math.abs(x) > 40 || Math.abs(z) > 40) return [x, z]; } }
for (let i = 0; i < 10; i++) { const [x, z] = outskirts(); ring(i % 2 ? 'oakTree' : 'nature_oak_large_01', x, z, 0, 4, 6); }
for (let i = 0; i < 10; i++) { const [x, z] = outskirts(); ring('nature_rock_cluster_02', x, z, 0, 4, 6); }
for (let i = 0; i < 6; i++) { const [x, z] = outskirts(); ring('nature_rock_small_02', x, z, 0, 4, 6); }
for (let i = 0; i < 7; i++) { const [x, z] = outskirts(); ring('nature_fallen_log_01', x, z, 0, 4, 6); }
for (let i = 0; i < 30; i++) { const x = -90 + rnd() * 180, z = -90 + rnd() * 180; ring('nature_fern_01', x, z, 0, 3, 4); }
for (let i = 0; i < 30; i++) { const x = -90 + rnd() * 180, z = -90 + rnd() * 180; ring('nature_flowers_02', x, z, 0, 3, 4); }

fs.writeFileSync(MAP, JSON.stringify(map, null, 2));
console.log(`placed ${placed} objects; map now has ${map.objects.length} objects`);
console.log(Object.entries(byKey).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('  '));

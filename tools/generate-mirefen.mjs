/**
 * Mirefen map generator → map.mirefen.json
 *
 * A drowned lowland. Two channels of black water cut the basin apart, the low
 * ground between them is soft bog, and the only quick way across is a raised
 * causeway of peat and plank (north is -z):
 *
 *                       THE GREAT CYPRESS (N)
 *      open fen (NW)   ·    ·    ·    ·    the drowned bell tower (NE)
 *                       ↘ water    water ↙
 *        fen village (W) ─── THE CAUSEWAY (spawn) ─── the sunken temple (E)
 *                          THE DEEP BOG (S)
 *
 * The one thing this map does that the other three do not is make the GROUND a
 * decision. Water is impassable (m.barrier) and bog is soft (m.mire): wading is
 * 62% speed for a knight and 50% for anything chasing them, so the causeway is
 * the fast exposed line and the bog is the slow safe one. Dry hummocks scattered
 * through the bog are the places worth holding — full speed, and the only footing
 * where a melee knight is not at a disadvantage.
 *
 * Assets from Trellis batches 11/12 are asked for by name and skipped if the mesh
 * has not shipped yet (m.has / m.pick), so this runs and plays at any point in the
 * asset run — re-run it as batches land and the map fills in. Until then it stands
 * on the eighteen bog-graded props from tools/char-glb.mjs.
 *
 * Usage: node tools/generate-mirefen.mjs [--seed N] [--out map.mirefen.json]
 */
import { writeFileSync } from 'node:fs';
import { MapBuilder, makeNoise } from './maplib.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEED = +opt('--seed', 8831);
const OUT = opt('--out', 'map.mirefen.json');

const m = new MapBuilder({ worldSize: 100, spawnX: 0, spawnZ: 0, enemySpawnDistance: 46, seed: SEED });
const R = m.rnd;
const wet = makeNoise(R, 21);        // how low and waterlogged the ground is
const canopy = makeNoise(R, 31);     // where the cypress stands are thick
const PI = Math.PI;

// ── Asset access that tolerates a half-finished batch ─────────────────────
const add = (key, x, z, o = {}) => (m.has(key) ? m.add(key, x, z, o) : m.note(key));
const ring = (key, cx, cz, r0, r1, o = {}) => (m.has(key) ? m.ring(key, cx, cz, r0, r1, o) : m.note(key));
const scatter = (key, n, region, o = {}) => (m.has(key) ? m.scatter(key, n, region, o) : (m.note(key), 0));
const P = (...keys) => m.pick(...keys) || keys[0];

// Every one of these names the Trellis mesh first and the bog-graded stand-in
// second, so the map improves in place as batch 11/12 lands.
const CYPRESS = () => P('swamp_cypress_01', 'bog_oak_01', 'oakTree');
const CYPRESS_B = () => P('swamp_cypress_02', 'bog_oak_02', 'nature_oak_large_01');
const MANGROVE = () => P('swamp_mangrove_01', 'bog_oak_02', 'bog_oak_01');
const SNAG = () => P('swamp_dead_willow_01', 'bog_dead_tree_01', 'nature_dead_tree_03');
const BLEACHED = () => P('bog_dead_tree_02', 'bog_dead_tree_01');
// Every reed/lily/hummock role used to fall back to bog_fern_01, so the map
// placed 797 copies of one 48k-triangle mesh and rendered 284M triangles a frame.
// The stand-ins are spread across three different meshes now and the counts are
// well down; batch 11 gives each role its own purpose-built low-poly mesh.
const MOSSFALL = () => P('bog_moss_curtain_01', 'swamp_moss_curtain_01', 'bog_fern_01');
// Built in code (tools/build-models.mjs): the pipeline's reed and cattail clumps were flat lime slabs
const REEDS = () => P('fen_reeds_01', 'swamp_reed_cluster_01', 'bog_fern_01');
const CATTAILS = () => P('fen_cattails_01', 'swamp_cattail_clump_01', 'bog_flowers_01');
const LILIES = () => P('swamp_lilypads_01', 'bog_flowers_01');
const ROTLOG = () => P('swamp_rotten_log_01', 'bog_log_01', 'nature_fallen_log_01');
const STUMP = () => P('swamp_stump_mossy_01', 'bog_stump_01', 'prop_tree_stump_02');
const FUNGUS = () => P('swamp_fungus_shelf_01', 'bog_stump_01');
const HUMMOCK = () => P('swamp_hummock_01', 'bog_rock_cluster_01');
const BOGROCK = () => P('swamp_bog_rock_01', 'bog_rock_01', 'boulder');
const ROCKMID = () => P('bog_rock_cluster_01', 'nature_rock_cluster_02');
const DRIFTWOOD = () => P('swamp_driftwood_01', 'bog_driftwood_01', 'bog_log_01');
const HUT = () => P('fen_stilt_hut_01', 'house', 'farmHouse');
const WITCHHUT = () => P('fen_witch_hut_01', 'apothecary', 'house');
const FISHRACK = () => P('fen_fish_rack_01', 'village_weapon_rack_01');
const CORACLE = () => P('fen_coracle_01', 'bog_crate_01', 'prop_wood_crate_large_01');
const TRAPS = () => P('fen_wicker_trap_01', 'prop_grain_sack_stack_01', 'bog_crate_01');
// fen_walkway_01 is built in code (tools/build-models.mjs): flat decking, 4.2 long
// and 1.5 wide. The Trellis fen_boardwalk_01 was a narrow plank on 0.9 units of
// legs and read as knee-high benches beside the fords (tools/shots/bw-mirefen-1.png).
const BOARDWALK = () => P('fen_walkway_01');
const TOTEM = () => P('fen_totem_mossy_01', 'fen_totem_01', 'village_signpost_01');
const WISPPOST = () => P('fen_lantern_post_01', 'village_lantern_post_01');
const WISPSTONE = () => P('swamp_wisp_stone_01', 'bog_rock_01');
const BARRICADE = () => P('bog_barricade_01', 'combat_barricade_01');

// ══ Ground tiles ══════════════════════════════════════════════════════════
// Kept for the editor; the game paints over them from the splat map.
for (let gx = -96; gx <= 96; gx += 8) for (let gz = -96; gz <= 96; gz += 8) m.tile('grass', gx, gz);

// ══ The black water ═══════════════════════════════════════════════════════
// Two channels, each a curve x = f(z), crossed only at the fords. Wider than
// Emberreach's lava (8 vs 6) because water reads as a bigger obstacle and a bog
// wants the frame broken up more.
// A third ford each (PLAN 50.21), for the reason Emberreach got one: the west
// channel ran 86 units unbroken south of z 12 and the east 50 south of z 48, and
// the kite bot's deaths sat on exactly those banks (4/12 survived, snag to 30%).
const EAST_FORDS = [-10, 48, 76];
const WEST_FORDS = [12, -52, 60];
const eastX = (z) => 40 + Math.sin(z * 0.048) * 13 + Math.cos(z * 0.025) * 6;
const westX = (z) => -38 + Math.sin(z * 0.041) * 10 - Math.cos(z * 0.033) * 7;

for (const [fn, fords, z0, z1] of [[eastX, EAST_FORDS, -78, 98], [westX, WEST_FORDS, -70, 98]]) {
  m.streamCurve(fn, z0, z1, { w: 8.0, step: 2, fords, gap: 5.0 });
  m.barrierCurve(fn, z0, z1, { step: 2.6, r: 4.0, fords, gap: 5.8 });
}
m.blockers.push((x, z, r) => Math.abs(x - eastX(z)) < 5.6 + r || Math.abs(x - westX(z)) < 5.6 + r);
const nearWater = (x, z) => Math.min(Math.abs(x - eastX(z)), Math.abs(x - westX(z)));

// The causeway's line (see below) is needed first: the spurs run from it to the fords
const causewayX = (z) => Math.sin(z * 0.035) * 5;

// ── The crossings: a silt path, a wisp lantern each side, reeds crowding in
// (the dressing goes in after the spurs, below, so it can stay off them)
const CROSSINGS = [];
for (const [fn, fords] of [[eastX, EAST_FORDS], [westX, WEST_FORDS]]) {
  for (const f of fords) {
    const cx = fn(f);
    CROSSINGS.push({ x: cx, z: f });
    for (let d = -8; d <= 8; d += 3.5) m.tile('road', cx + d * 0.2, f + d);
    m.keepOut(cx, f, 6);
    m.paintCircle(0, cx, f, 8, 0.9, 0.5);        // silt under the crossing
  }
}

// ══ The causeway (spawn) ══════════════════════════════════════════════════
// A raised dry track running the length of the map through the middle. This is
// the fast line and the map's spine; everything either side of it is soft.
for (let z = -80; z <= 86; z += 5) m.tile('road', causewayX(z), z);
const cache = (x, z) => m.cache(x, z);   // see MapBuilder.cache
const DRY = [{ x: 0, z: 0, r: 16 }];
for (let z = -80; z <= 86; z += 6) DRY.push({ x: causewayX(z), z, r: 7.5 });
for (const c of CROSSINGS) DRY.push({ x: c.x, z: c.z, r: 9 });
// Spurs: a dry track from the spine out to every ford (PLAN 50.22). The bog is
// 61% of the map and five of six kite-bot deaths after 50.21 were in it; the
// fords had dry pads but nothing dry led to them, so reaching a crossing meant
// wading. A spur is a straight segment spine -> ford: it dries bogField (so the
// paint still matches what you wade through), keeps mire discs off itself, and
// is laid with road tiles so it paints as a silt track like the causeway.
// Each spur bows to one side and wanders a little: drawn as straight bars they
// read from above as a ladder laid on the bog.
const SPURS = CROSSINGS.map(c => {
  const x0 = causewayX(c.z), x1 = c.x, n = Math.max(4, Math.ceil(Math.abs(x1 - x0) / 5));
  const bow = R.range(6, 9) * (R() < 0.5 ? -1 : 1), pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    // sin^2 keeps both ends square to the spine and the ford, the middle bowed
    pts.push([x0 + (x1 - x0) * t, c.z + Math.sin(t * PI) ** 2 * bow + (k > 0 && k < n ? R.range(-1, 1) : 0)]);
  }
  return pts;
});
const spurDist = (x, z) => {
  let best = Infinity;
  for (const pts of SPURS) for (let k = 0; k < pts.length - 1; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
};
for (const [i, pts] of SPURS.entries()) for (let k = 1; k < pts.length - 1; k++) {
  const [x, z] = pts[k];
  DRY.push({ x, z, r: 5 });
  // The ford has its own paved pad; tiles stop short of it so the two do not
  // overlap and the crossing's dressing has room
  if (Math.hypot(x - CROSSINGS[i].x, z - CROSSINGS[i].z) > 7) m.tile('road', x, z);
}
// Crossing dressing, now that the spurs exist to keep off: a wisp lantern each
// side, reeds and a rotten log crowding in
// Duckboards across each ford, laid east-west over the silt from bank to bank so
// the way over reads from a distance. Walk-through: they mark the line, not block it.
const WALK = 4.2;
for (const c of CROSSINGS) for (let k = -1; k <= 1; k++) {
  add(BOARDWALK(), c.x + k * (WALK - 0.15), c.z + k * 0.25, { rotY: 0.04 * k - 0.02, force: true });
}
for (const c of CROSSINGS) for (const side of [-1, 1]) {
  add(WISPPOST(), c.x + side * 5.5, c.z - side * 4.5, { force: true });
  add(CATTAILS(), c.x + side * 7.0, c.z + side * 3, { rotY: R.angle() });
  add(ROTLOG(), c.x + side * 8.5, c.z + side * 6, { rotY: R.angle() });
}

// The spawn clearing: a stand of wisp stones on dry peat, somewhere to read the map from
add(TOTEM(), -8, -6, { rotY: PI * 1.15, ignoreKeepOut: true, force: true });
for (let i = 0; i < 4; i++) ring(WISPSTONE(), 0, 0, 7, 10, { ignoreKeepOut: true });
for (let i = 0; i < 3; i++) ring(HUMMOCK(), 0, 0, 8, 12, { ignoreKeepOut: true });
m.cache(9, -8);
m.keepOut(0, 0, 12);

// ══ The bog ═══════════════════════════════════════════════════════════════
// Soft ground wherever the land is low and away from the causeway. The same
// field paints the algae, so what you see is what you wade through.
const bogField = (x, z) => {
  const low = wet(x, z) - 0.42;                       // the low half of the basin
  const bank = Math.max(0, 0.55 - nearWater(x, z) / 26);  // wetter near the channels
  const spine = Math.max(0, 0.5 - Math.abs(x - causewayX(z)) / 22); // drier on the causeway
  const spur = Math.max(0, 0.5 - spurDist(x, z) / 12);                // and on the spurs to the fords
  return low + bank * 0.9 - spine * 1.3 - spur * 1.3;
};
m.mireField((x, z) => bogField(x, z), { step: 6.5, r: [5, 9], dry: DRY });

// Dry hummock islands: the footing worth fighting on. Deliberately placed OUT in
// the bog rather than near the causeway, so holding one is a choice with a cost.
const ISLANDS = [
  [-58, -34], [-30, 30], [24, -46], [52, 22], [-66, 40], [18, 62], [-14, -64],
  [62, -14], [-46, 66], [34, 44], [-22, 4], [44, -70],
];
for (const [n, [ix, iz]] of ISLANDS.entries()) {
  DRY.push({ x: ix, z: iz, r: 10 });
  m.keepOut(ix, iz, 3);
  m.paintCircle(3, ix, iz, 9, 0.9, 0.55);            // matted sedge on top
  m.paintCircle(1, ix, iz, 12, 0.5, 0.7);
  for (let i = 0; i < Math.floor(R.range(2, 4.99)); i++) ring(HUMMOCK(), ix, iz, 4, 9, { scale: R.range(0.9, 1.5) });
  if (R() < 0.75) ring(SNAG(), ix, iz, 3, 7, { scaleMul: R.range(0.9, 1.3) });
  if (R() < 0.5) ring(BOGROCK(), ix, iz, 4, 8, {});
  if (R() < 0.4) add(WISPSTONE(), ix + R.range(-3, 3), iz + R.range(-3, 3), { rotY: R.angle() });
  // Every third island holds a cache: a 35% roll per island shipped anywhere from
  // none to four, and the islands are meant to be the footing worth the wade
  if (n % 3 === 1) m.cache(ix + R.range(-3, 3), iz + R.range(-3, 3), { maxR: 6 });
}
// The mire discs were placed before the islands were known, so clear any that
// sit on one: an island that is still soft underfoot is a lie the player will
// feel before they see it.
m.mires = m.mires.filter(mi => !ISLANDS.some(([ix, iz]) => Math.hypot(mi.x - ix, mi.z - iz) < 9 + mi.r * 0.5));

// ══ The cypress stands ════════════════════════════════════════════════════
// Dense tree clumps that break the sightlines. On an open map a ranged knight
// simply outranges everything; here the trees decide how far you can see.
const stand = (cx, cz, r, n) => {
  for (let i = 0; i < n; i++) {
    const a = R.angle(), d = Math.sqrt(R()) * r;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const k = R() < 0.45 ? CYPRESS() : R() < 0.6 ? CYPRESS_B() : MANGROVE();
    add(k, x, z, { rotY: R.angle(), scaleMul: R.range(0.7, 1.05) });   // a cypress canopy is twice a pine's; at 1x+ they roofed the knight over
    if (R() < 0.5) add(MOSSFALL(), x + R.range(-4, 4), z + R.range(-4, 4), { rotY: R.angle() });
  }
  m.paintCircle(1, cx, cz, r * 1.1, 0.7, 0.7);
};
for (const [sx, sz, sr, sn] of [
  [-70, -60, 22, 16], [-20, -50, 18, 12], [30, -66, 20, 14], [70, -50, 18, 11],
  [-76, 10, 18, 12], [-56, 62, 20, 13], [8, 30, 16, 10], [64, 60, 20, 13],
  [-34, -16, 14, 8], [48, -20, 15, 9], [80, 20, 16, 9], [-8, 78, 18, 11],
]) stand(sx, sz, sr, sn);

// ══ The fen village (west) ════════════════════════════════════════════════
// Stilt huts on the drier western shelf: this map's loot district. Everything
// the fen-folk built is breakable.
const VILLAGE = { x: -62, z: -6 };
DRY.push({ x: VILLAGE.x, z: VILLAGE.z, r: 22 });
const hutYard = (x, z, rot) => {
  const fx = Math.sin(rot), fz = Math.cos(rot), sx = fz, sz = -fx;
  const put = (key, f, s, r) => add(key, x + fx * f + sx * s, z + fz * f + sz * s, { rotY: r ?? R.angle() });
  put(FISHRACK(), 5.0, 3.4, rot);
  put(TRAPS(), 4.8, -3.4);
  put(CORACLE(), -4.8, R.range(-2.5, 2.5));
  if (R() < 0.7) put(WISPPOST(), 6.0, R() < 0.5 ? 4.6 : -4.6, 0);
  if (R() < 0.6) put(P('bog_crate_01', 'barrel'), -5.2, 3.6);
  if (R() < 0.5) put(P('bog_logs_01', 'prop_logs_02'), -5.4, -3.8, rot + PI / 2);
};
const hutAt = (x, z, rot) => { const k = HUT(); if (m.has(k) && m.add(k, x, z, { rotY: rot, force: true })) hutYard(x, z, rot); else m.note(k); };
for (const [x, z, rot] of [[-70, -22, PI / 2], [-54, -18, -PI / 2], [-72, -2, PI / 2], [-52, 2, -PI / 2], [-66, 14, PI], [-56, 20, 0]])
  hutAt(x, z, rot);
add(WITCHHUT(), VILLAGE.x - 4, VILLAGE.z + 30, { rotY: PI * 0.15, force: true });
for (let i = 0; i < 3; i++) ring(TOTEM(), VILLAGE.x - 4, VILLAGE.z + 30, 7, 11, {});
for (let i = 0; i < 5; i++) ring(WISPPOST(), VILLAGE.x, VILLAGE.z, 10, 20, {});
// The village's edge: a rotted palisade on a ring, broken into runs, with three
// gaps that are its ways in -- north-east to the ford, north to the witch, south to
// the bog. On the east the channel itself is the boundary, so no fence stands within
// reach of the water. Each gap is flanked by a barricade. (Barricades used to ring at
// random and the fence pieces were scattered over the whole district like litter.)
const GATES = [0.62, PI / 2, -PI / 2];          // angles from the village centre (+x east, +z north)
// An ellipse, long north-south like the two rows of huts; a piece that would stand
// in a hut is simply not placed (add's clearance check), which reads as a gap
const FC = { x: VILLAGE.x, z: VILLAGE.z + 3 }, FRX = 19, FRZ = 29;
const onFence = (a, wob = 0) => [FC.x + Math.cos(a) * (FRX + wob), FC.z + Math.sin(a) * (FRZ + wob)];
const fenceYaw = (a) => -Math.atan2(Math.cos(a) * FRZ, -Math.sin(a) * FRX);
for (let a = -PI; a < PI; a += 0.06) {
  if (GATES.some(g => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.13)) continue;
  if (Math.sin(a * 5.3) + Math.sin(a * 11.7) > 1.1) continue;  // fallen runs
  const [x, z] = onFence(a, Math.sin(a * 3.1) * 1.2);
  if (nearWater(x, z) < 7) continue;
  add(P('bog_fence_01', 'village_fence_broken_01'), x, z, { rotY: fenceYaw(a) + R.range(-0.12, 0.12), ignoreKeepOut: true });
}
for (const g of GATES) for (const side of [-1, 1]) {
  const [x, z] = onFence(g + side * 0.17, 0.4);
  if (nearWater(x, z) < 7) continue;
  add(BARRICADE(), x, z, { rotY: fenceYaw(g), ignoreKeepOut: true });
}
// The loot district's loot: the fen-folk's stores stacked between the huts (the
// swollen crates break now; they were registered as scenery), and the witch keeps
// a cache behind her hut
// Stacked in twos and threes on the lane between the huts, a barrel beside each
// stack, rather than rung at random over the whole district
for (const [x, z] of [[-67, -12], [-57, -8], [-67, 6], [-57, 11], [-62, -29], [-57.5, 27]]) {
  const t = R.angle(), c = Math.cos(t), sn = Math.sin(t);
  const offs = R() < 0.6 ? [[0, 0], [1.05, 0], [0.5, 0.95]] : [[0, 0], [1.05, 0.1]];
  for (const [u, v] of offs) add(P('bog_crate_01', 'barrel'), x + u * c - v * sn, z + u * sn + v * c, { rotY: t + R.range(-0.15, 0.15), force: true });
  add('barrel', x - 1.9 * c, z - 1.9 * sn, { rotY: R.angle() });
  if (R() < 0.5) add('barrel', x - 1.9 * c + 1.8 * sn, z - 1.9 * sn - 1.8 * c, { rotY: R.angle() });
}
cache(VILLAGE.x - 4, VILLAGE.z + 36);
// The village is dry, trodden ground: the bog's scatter (reeds, moss curtains, lily
// pads, scum, pools) stays outside the palisade instead of growing between the huts
m.keepOut(FC.x, FC.z, 15); m.keepOut(FC.x, FC.z - 12, 11); m.keepOut(FC.x, FC.z + 12, 11);
// A track out of the village into the bog, so the district has a front door
// a silt track, kept clear of trees and logs so the duckboards along it run unbroken
for (let d = 0; d < 9; d++) {
  m.paintCircle(0, VILLAGE.x + 22 + d * 3.2, VILLAGE.z + d * 1.1, 3, 0.85, 0.5);
  m.keepOut(VILLAGE.x + 22 + d * 3.2, VILLAGE.z + d * 1.1, 2.6);
}
for (let d = 0; d < 8; d++) add(BOARDWALK(), VILLAGE.x + 23.6 + d * 3.9, VILLAGE.z + 0.55 + d * 1.34,
  { rotY: -Math.atan2(1.1, 3.2) + (d % 3 - 1) * 0.03, force: true });   // duckboards along it
m.paintCircle(0, VILLAGE.x, VILLAGE.z, 20, 0.8, 0.6);
m.paintCircle(3, VILLAGE.x, VILLAGE.z, 24, 0.4, 0.8);

// ══ Landmarks ═════════════════════════════════════════════════════════════
// The great cypress holds the north, the temple the east, the bell tower the
// north-east. Each silently skipped until its mesh ships.
if (m.landmark('landmark_great_cypress', -6, -84, { rotY: 0.3, keepOut: 20 })) {
  m.paintCircle(1, -6, -84, 26, 0.85, 0.5);
} else {
  for (let i = 0; i < 20; i++) ring(CYPRESS(), -6, -84, 8, 22, { scaleMul: R.range(0.8, 1.1) });   // 1.3-2.1x loomed into the camera
  m.keepOut(-6, -84, 16);
  m.paintCircle(1, -6, -84, 24, 0.8, 0.5);
}
for (let i = 0; i < 12; i++) ring(MOSSFALL(), -6, -84, 20, 30, {});

if (m.landmark('landmark_sunken_temple', 74, 4, { rotY: -0.4, keepOut: 16 })) {
  m.paintCircle(0, 74, 4, 20, 0.8, 0.5);
} else {
  add(P('landmark_ruined_tower', 'townStatue'), 74, 4, { rotY: -0.4, force: true });
  m.keepOut(74, 4, 12);
  m.paintCircle(0, 74, 4, 18, 0.75, 0.55);
}
for (let i = 0; i < 10; i++) ring(P('bog_rock_cluster_01', 'nature_rock_cluster_02'), 74, 4, 12, 24, {});
for (let i = 0; i < 6; i++) ring(WISPSTONE(), 74, 4, 10, 20, {});
cache(78, 12);

if (!m.landmark('landmark_drowned_bell_tower', 60, -78, { rotY: 0.5, keepOut: 14 })) {
  add(P('landmark_destroyed_watchtower', 'landmark_ruined_tower'), 60, -78, { rotY: 0.5, force: true });
  m.keepOut(60, -78, 11);
}
m.paintCircle(2, 60, -78, 20, 0.7, 0.6);
for (let i = 0; i < 8; i++) ring(BLEACHED(), 60, -78, 12, 24, {});
cache(54, -84);

// A fourth corner prize, as in Darkwood
add('chest', -80, 80, { rotY: R.angle(), ignoreKeepOut: true, force: true });
for (let i = 0; i < 6; i++) ring(BLEACHED(), -80, 80, 6, 16, {});

// ══ The corners ═══════════════════════════════════════════════════════════
// The four corners were the emptiest ground on the map (0-5 props in each 25-unit
// cell against 20-60 elsewhere). Each gets a small place with a story and a cache,
// laid out in its own frame and facing the middle, so a run that drifts to the
// edge finds something there. Their keep-outs go in before the scatter.
const corner = (x, z) => {                                              // facing the map centre
  const f = m.frame(x, z, Math.atan2(-x, -z));
  return { ...f, put: (key, ...a) => f.put(key, ...a) || (m.has(key) && console.warn('corner', x, z, ': no room for', key, ...a.slice(0, 2))) };
};
// One cache per place: an island's cache can already stand in a corner
const cacheOnce = (x, z) => m.objects.some(o => o.key === 'chest' && Math.hypot(o.x - x, o.z - z) < 12) || m.cache(x, z);
{ // South-west: the peat-cutters' camp. Cut peat stacked to dry, the barrow, the cart
  const { put, decal, at } = corner(-76, 78);
  for (const s of [-3.4, -0.6, 2.2]) put(P('bog_logs_01', 'prop_logs_02'), -3, s, PI / 2 + R.range(-0.1, 0.1), { scaleMul: 1.5 });
  put(P('bog_cart_01', 'combat_broken_cart_01'), 1, 5.5, 0.5); put('prop_wheelbarrow_01', 2.4, -2.6, 0.9);
  put(P('bog_stump_01', 'prop_tree_stump_02'), 3.5, 1, null); put(FISHRACK(), -1, -6.5, 0.2);
  put(WISPPOST(), 4.5, -5, 0, { force: true }); put('prop_firewood_stack_02', -6, 4, PI / 2);
  decal('rootsMud', 0, 0, 4.4); decal('puddle', 3, 3.5, 2.6);
  cacheOnce(...at(-1.5, 2.2)); m.keepOut(-76, 78, 10);
}
{ // South-east: the drowned shrine. A ring of fen totems round a wisp stone,
  // offerings at its foot, two old cypresses standing over it
  const { put, decal, at } = corner(78, 76);
  put(WISPPOST(), 0, 0, 0, { force: true });                         // the wisp burns at its heart
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + 0.4; put(TOTEM(), Math.cos(a) * 5, Math.sin(a) * 5, a + PI / 2, { scaleMul: 0.8 }); }
  put('prop_pottery_01', 1.9, 0.6, null); put('prop_water_jug_01', 1.6, -1.5, null); put(P('bog_crate_01', 'barrel'), -1.9, 1.6, null);
  put(CYPRESS(), -6, -8, null, { scaleMul: 1.05 }); put(CYPRESS_B(), -5.5, 8.5, null, { scaleMul: 0.95 });
  decal('mossPatch', 0, 0, 5); decal('bones', 3, 3, 2.2); decal('mushrooms', -3, -3, 2.4);
  cacheOnce(...at(-3.5, 0)); m.keepOut(78, 76, 11);
}
{ // North-west: the sunken caravan. Two carts gone in to the axles, the load
  // spilled into the mud, the drowned logs that were its road
  const { put, decal, at } = corner(-78, -78);
  // Ungraded carts and crates: the bog grades go near-black and vanished on the peat
  put(P('combat_broken_cart_01', 'bog_cart_01'), 0, -2.5, 0.35, { scaleMul: 1.5 }); put(P('combat_broken_cart_01', 'bog_cart_01'), -4, 3.5, -0.4, { scaleMul: 1.4 });
  put('prop_wood_crate_broken_01', 2.4, 0.6, null); put('prop_wood_crate_small_01', 3.4, 1.8, null); put('prop_wood_crate_large_01', 1.8, 3.2, 0.3);
  put('barrel', -1.5, -6, null); put('barrel', 3.5, -4.5, null);
  for (const f of [5, 7.5, 10]) put(P('bog_log_01', 'swamp_rotten_log_01'), f, R.range(-1, 1), PI / 2 + R.range(-0.25, 0.25));
  put(P('bog_driftwood_01', 'swamp_driftwood_01'), -2, 7, null);
  decal('bogPool', -1, 0, 4.6); decal('puddle', 3, -2.5, 3);
  cacheOnce(...at(-6.5, -1)); m.keepOut(-78, -78, 10);
}
{ // North-east, below the bell tower: the fishers' landing. Duckboards out over
  // the mud, coracles drawn up, traps and racks
  const { put, decal, at } = corner(82, -84);
  for (const f of [-2.1, 2.1]) put(BOARDWALK(), f, 0, PI / 2, { force: true });
  put(CORACLE(), 1, 3.2, 0.6); put(CORACLE(), -1.8, 3.6, -0.3); put(TRAPS(), 4.5, -2.6, null);
  put(FISHRACK(), -1.2, -3.6, 0); put(WISPPOST(), 5, 2.5, 0, { force: true });
  decal('puddle', -4.5, 1.5, 3.4); decal('rootMat', 2.5, -6, 3.2);
  cacheOnce(...at(-4.5, -2.5)); m.keepOut(82, -84, 9);
}

// ══ Scatter ═══════════════════════════════════════════════════════════════
const region = { x: 0, z: 0, r: 96 };
const bogDensity = (x, z) => Math.max(0.05, Math.min(1, bogField(x, z) * 2 + 0.35));
const dryDensity = (x, z) => Math.max(0.05, 1 - bogField(x, z) * 2);

scatter(REEDS(), 170, region, { density: (x, z) => Math.max(0.1, bogDensity(x, z) * 1.1), scaleMul: [0.8, 1.5] });
scatter(CATTAILS(), 110, region, { density: (x, z) => Math.max(0.05, 0.9 - nearWater(x, z) / 20), scale: [0.8, 1.4] });
// Lily pads float on the channels in rafts of two or three, clear of the fords. They
// were scattered on the banks, where a flat lime square on dry mud read as a texture
// error. The water plane sits a hair above them, so they read as afloat.
for (const [fn, fords] of [[eastX, EAST_FORDS], [westX, WEST_FORDS]]) for (let z = -76; z <= 94; z += R.range(5, 11)) {
  if (fords.some(f => Math.abs(z - f) < 8)) continue;
  const n = 2 + (R() < 0.4), side = R.range(-2.4, 2.4);
  for (let i = 0; i < n; i++) add(LILIES(), fn(z) + side + R.range(-0.9, 0.9), z + R.range(-1.4, 1.4), { rotY: R.angle(), scale: R.range(0.9, 1.5), force: true });
}
scatter(HUMMOCK(), 110, region, { density: bogDensity, scale: [0.8, 1.6] });
scatter(ROTLOG(), 130, region, { density: (x, z) => bogDensity(x, z) * 0.8 + canopy(x, z) * 0.4, scale: [0.9, 1.4] });
scatter(STUMP(), 110, region, { density: (x, z) => canopy(x, z) * 0.8 + 0.15, scale: [0.9, 1.4] });
scatter(FUNGUS(), 70, region, { density: (x, z) => canopy(x, z) * 0.9, scale: [0.8, 1.3] });
// Fewer than before scaleMul: these are full-size trees and boulders now, not
// knee-high ones, and the same count walled off a third of the spawn
scatter(SNAG(), 55, region, { density: (x, z) => bogDensity(x, z) * 0.7, scaleMul: [0.9, 1.4] });
scatter(BLEACHED(), 70, region, { density: (x, z) => dryDensity(x, z) * 0.6, scaleMul: [0.9, 1.3] });
scatter(DRIFTWOOD(), 80, region, { density: (x, z) => Math.max(0.05, 0.8 - nearWater(x, z) / 22), scale: [0.9, 1.5] });
scatter(MOSSFALL(), 90, region, { density: (x, z) => canopy(x, z), scaleMul: [0.9, 1.5] });
scatter(BOGROCK(), 45, region, { density: dryDensity, scaleMul: [0.8, 1.3] });
scatter(ROCKMID(), 90, region, { density: dryDensity, scale: [0.8, 1.3] });
scatter(P('bog_fern_01', 'nature_fern_01'), 110, region, { density: (x, z) => canopy(x, z) * 0.8 + 0.2, scale: [0.9, 1.5] });
scatter(P('bog_flowers_01', 'nature_flowers_02'), 90, region, { density: (x, z) => 0.4 + canopy(x, z) * 0.4, scale: [0.9, 1.5] });
scatter(P('bog_cart_01', 'combat_broken_cart_01'), 18, region, { density: dryDensity });
scatter(P('bog_crate_01', 'prop_wood_crate_broken_01'), 30, region, { density: (x, z) => Math.max(0.05, 0.7 - nearWater(x, z) / 24) });

// ══ Splat ═════════════════════════════════════════════════════════════════
// base peat, 0 = silt, 1 = bogMoss, 2 = algae, 3 = sedgeMat
const SILT = 0, MOSS = 1, ALGAE = 2, SEDGE = 3;
m.paintRoads(SILT, SILT);
m.paintUnderObstacles(SILT, 3.0, 0.4);
// The bog reads as algae: exactly the field that placed the mires, so the green
// scum on the ground IS the slow ground. A player should never have to guess.
// The first pass multiplied bogField by 1.7, which saturated the channel over
// most of the map and turned the whole frame into one bright green lawn -- the
// exact mistake Emberreach made with orange. Algae is now the WETTEST patches
// only, sitting as islands of green on dark peat, and the dark base does the
// work. Peat is the map; everything else is an accent on it.
m.paintFn(ALGAE, (x, z) => (bogField(x, z) - 0.30) * 2.4, 2);
// Moss under the canopy, well short of full strength: it is the mid tone between
// black peat and the pale sedge on the causeway, not a ground cover of its own.
m.paintFn(MOSS, (x, z) => canopy(x, z) * 0.85 - 0.30, 2);
// Silt aprons along both banks: the bare wet margin where the water has dropped
for (const [fn, fords] of [[eastX, EAST_FORDS], [westX, WEST_FORDS]]) for (let z = -96; z <= 96; z += 1.5) {
  if (fords.some(f => Math.abs(z - f) < 6)) continue;
  m.paintCircle(SILT, fn(z), z, 8.5, 0.9, 0.6);
}
// Dry sedge down the causeway, so the fast line reads as a line from the air
for (let z = -88; z <= 92; z += 3) m.paintCircle(SEDGE, causewayX(z), z, 9, 0.8, 0.7);
m.paintCircle(SEDGE, 0, 0, 14, 0.85, 0.6);
m.suppress(ALGAE, SEDGE); m.suppress(MOSS, SILT); m.suppress(ALGAE, SILT, 0.7);

// ══ Decals ════════════════════════════════════════════════════════════════
m.scatterDecals('bogScum', 90, region, { density: bogDensity, scale: [2.2, 4.2] });
m.scatterDecals('bogPool', 70, region, { density: (x, z) => bogDensity(x, z) * 0.9, scale: [2, 3.6] });
m.scatterDecals('lilyPatch', 55, region, { density: (x, z) => Math.max(0, 0.9 - nearWater(x, z) / 16), scale: [2, 3.6] });
m.scatterDecals('rootMat', 80, region, { density: (x, z) => canopy(x, z) * 0.9, scale: [2.4, 4.2] });
m.scatterDecals('mossPatch', 80, region, { density: (x, z) => canopy(x, z) * 0.7 + 0.15, scale: [2, 3.6] });
m.scatterDecals('mushrooms', 60, region, { density: (x, z) => canopy(x, z) * 0.8, scale: [1.6, 2.8] });
m.scatterDecals('puddle', 60, region, { density: bogDensity, scale: [1.8, 3.2] });
m.scatterDecals('roots', 50, region, { density: (x, z) => canopy(x, z) * 0.8, scale: [2.4, 4] });
m.scatterDecals('leafPile', 40, region, { density: (x, z) => canopy(x, z) * 0.6, scale: [2, 3.4] });
m.scatterDecals('bones', 26, region, { density: (x, z) => bogDensity(x, z) * 0.35, scale: [1.8, 3] });
m.scatterDecals('rootMat', 14, { x: VILLAGE.x, z: VILLAGE.z, r: 24 }, { scale: [2, 3.4], ignoreKeepOut: true });

// ══ Tufts ═════════════════════════════════════════════════════════════════
// reeds / sedge / reeds / tuft3 (MAPS.mirefen.terrain.tufts). Thickest in the
// bog, thin on the silt banks and the causeway.
m.scatterTufts(5200, region, {
  density: (x, z) => 0.55 + bogDensity(x, z) * 0.45,
  bareChannels: [SILT], tries: 6, scale: [0.5, 1.1], variants: 4,
});

// ══ Light shafts ══════════════════════════════════════════════════════════
// Pale green shafts down through the canopy, and low ones over the water where
// the mist would catch. Darkwood's rig, tinted for a bog.
for (let i = 0; i < 26; i++) {
  const a = R.angle(), d = Math.sqrt(R()) * 88;
  const x = Math.cos(a) * d, z = Math.sin(a) * d;
  if (canopy(x, z) < 0.45) continue;
  m.shaft(x, z, { w: 5.5, h: 24, rotY: R.range(0.2, 1.1) });
}
for (const [fn, fords] of [[eastX, EAST_FORDS], [westX, WEST_FORDS]]) {
  for (let z = -64; z <= 90; z += 18) {
    if (fords.some(f => Math.abs(z - f) < 9)) continue;
    m.shaft(fn(z), z, { w: 7, h: 11, rotY: R.range(0.2, 1.0) });
  }
}

const json = m.toJSON();
writeFileSync(OUT, JSON.stringify(json, null, 1).replace(/\n\s*("?\w+"?): /g, ' $1: ').replace(/\{\s+/g, '{ ').replace(/\s+\}/g, ' }'));
await m.writeSplat(OUT.replace(/\.json$/, '.splat.png'));
console.log(`${OUT}: ${json.objects.length} objects, ${m.obstacles.length} obstacles, ${json.barriers.length} water barriers, ${json.mires.length} mires, ${json.decals.length} decals, ${json.tufts.length} tufts, ${json.streams.length} channel segments, ${json.shafts.length} shafts`);
console.log(m.summary());
console.log(m.missingSummary());

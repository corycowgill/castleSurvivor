/**
 * Emberreach map generator → map.emberreach.json  (NEW-LEVEL-PLAN §3)
 *
 * The ogre homeland: a volcanic basin under a burning cone, cut in two by rivers
 * of lava, with the ogres' warcamp between them (north is -z):
 *
 *                              THE CONE (north)
 *        ash barrens (W)   ·   ·   ·   ·   ·   the black gate + ogre keep (NE)
 *                           ↘ lava    lava ↙
 *          slagworks (SW)  ─── THE CROSSING (spawn) ───  obsidian field (E)
 *                              THE WARCAMP (S)
 *
 * The lava is impassable (m.barrier), crossed only at two basalt causeways, so the
 * rivers are routes to plan around rather than a texture to run over. Everything
 * the ogres built is breakable, so the camp is the loot district and the barrens
 * are the open fighting room.
 *
 * Assets from Trellis batches 5/9/10 are asked for by name and skipped if the mesh
 * has not shipped yet (m.has / m.pick), so this runs and plays at any point in the
 * asset run — re-run it as batches land and the map fills in.
 *
 * Usage: node tools/generate-emberreach.mjs [--seed N] [--out map.emberreach.json]
 */
import { writeFileSync } from 'node:fs';
import { MapBuilder, makeNoise } from './maplib.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEED = +opt('--seed', 4127);
const OUT = opt('--out', 'map.emberreach.json');

const m = new MapBuilder({ worldSize: 100, spawnX: 0, spawnZ: 0, enemySpawnDistance: 48, seed: SEED });
const R = m.rnd;
const noise = makeNoise(R, 17);
const heat = makeNoise(R, 34);          // low-frequency "how close to the fire" field
const PI = Math.PI;

// ── Asset access that tolerates a half-finished batch ─────────────────────
const add = (key, x, z, o = {}) => (m.has(key) ? m.add(key, x, z, o) : m.note(key));
const ring = (key, cx, cz, r0, r1, o = {}) => (m.has(key) ? m.ring(key, cx, cz, r0, r1, o) : m.note(key));
const scatter = (key, n, region, o = {}) => (m.has(key) ? m.scatter(key, n, region, o) : (m.note(key), 0));
// First available of a preference list; used where a stand-in is acceptable
const P = (...keys) => m.pick(...keys) || keys[0];

const ROCK_SMALL = () => P('basalt_small_01', 'nature_rock_small_01');
const ROCK_MID = () => P('basalt_cluster_01', 'nature_rock_cluster_02');
const BOULDER = () => P('basalt_boulder_01', 'boulder');
const DEADTREE = () => P('char_dead_tree_01', 'nature_dead_tree_03');
// Three value grades of the one dead-tree mesh that validated, plus the burnt tree
// and giant from the Trellis batches when they land. No conifers: this is a lava map.
const DEADTREES = () => ['char_dead_tree_01', 'char_dead_tree_02', 'char_dead_tree_03',
                         'combat_burned_tree_01', 'burnt_tree_giant_01'].filter(k => m.has(k));
const STAKE = () => P('combat_skull_stake_01', 'ogre_totem_01', 'village_signpost_01');
const TOTEM = () => P('ogre_totem_01', 'combat_enemy_totem_01', 'townStatue');
const BONES = () => P('ogre_bone_pile_01', 'combat_bones_01', 'combat_skull_01');
const BRAZIER = () => P('ogre_brazier_01', 'village_lantern_post_01');
const SPIKEWALL = () => P('ogre_spike_wall_01', 'combat_spikes_01', 'char_barricade_01');
const BARRICADE = () => P('ogre_barricade_01', 'char_barricade_01', 'combat_barricade_01');
const HUT = () => P('ogre_hut_01', 'farmHouse');
const RUBBLE = () => P('combat_wall_rubble_01', 'basalt_cluster_01');

// ══ Ground tiles ══════════════════════════════════════════════════════════
// Kept for the editor; the game paints over them from the splat map.
for (let gx = -96; gx <= 96; gx += 8) for (let gz = -96; gz <= 96; gz += 8) m.tile('grass', gx, gz);

// ══ The lava ══════════════════════════════════════════════════════════════
// Two flows off the cone. Each is a curve x = f(z); the causeways are the gaps.
const EAST_FORDS = [-4, 54];
const WEST_FORDS = [16, -46];
const eastX = (z) => 44 + Math.sin(z * 0.052) * 11 + Math.cos(z * 0.021) * 5;
const westX = (z) => -42 + Math.sin(z * 0.046) * 9 - Math.cos(z * 0.030) * 6;

for (const [fn, fords, z0, z1] of [[eastX, EAST_FORDS, -74, 98], [westX, WEST_FORDS, -66, 98]]) {
  m.streamCurve(fn, z0, z1, { w: 6.0, step: 2, fords, gap: 4.5 });
  // Collision: a chain of discs down the middle. r 3.2 against a 6-wide ribbon
  // leaves a walkable half-metre of crust on each bank, which reads as a shore.
  m.barrierCurve(fn, z0, z1, { step: 2.6, r: 3.2, fords, gap: 5.2 });
}
// Props also stay off the banks
m.blockers.push((x, z, r) => Math.abs(x - eastX(z)) < 4.6 + r || Math.abs(x - westX(z)) < 4.6 + r);
const nearLava = (x, z) => Math.min(Math.abs(x - eastX(z)), Math.abs(x - westX(z)));

// ── The two causeways: basalt slabs, stakes either side, a brazier for the dark
for (const [fn, fords] of [[eastX, EAST_FORDS], [westX, WEST_FORDS]]) {
  for (const f of fords) {
    const cx = fn(f);
    for (let d = -7; d <= 7; d += 3.5) m.tile('road', cx + d * 0.2, f + d);
    for (const side of [-1, 1]) {
      add(STAKE(), cx + side * 6.5, f + side * 2, { rotY: R.angle(), force: true });
      add(BRAZIER(), cx + side * 5.5, f - side * 5, { force: true });
      add(ROCK_MID(), cx + side * 8.5, f + side * 5, { rotY: R.angle() });
    }
    m.keepOut(cx, f, 6);
    m.paintCircle(0, cx, f, 9, 0.95, 0.45);     // basalt slab under the crossing
  }
}

// ══ The crossing (spawn) ══════════════════════════════════════════════════
// Open ground with a ring of totems: somewhere to stand and read the map from.
m.add(TOTEM(), -7, -7, { rotY: PI * 1.2, ignoreKeepOut: true, force: true });
for (let i = 0; i < 4; i++) ring(BRAZIER(), 0, 0, 7, 9, { ignoreKeepOut: true });
for (let i = 0; i < 3; i++) ring(BONES(), 0, 0, 6, 10, { ignoreKeepOut: true });
add('chest', 8, -8, { rotY: R.angle(), ignoreKeepOut: true });
m.keepOut(0, 0, 12);
// The main track south into the camp and north toward the cone
for (let z = -56; z <= 62; z += 6) m.tile('road', Math.sin(z * 0.04) * 3, z);

// ══ The cone ══════════════════════════════════════════════════════════════
// The map's anchor. Everything hot points back at it.
if (m.landmark('landmark_volcano_cone_01', 0, -84, { rotY: 0, keepOut: 24 })) {
  m.paintCircle(0, 0, -84, 30, 0.9, 0.4);
} else {
  // Until the mesh ships, a ridge of spires holds the north so the map is not
  // simply empty up there
  for (let i = 0; i < 26; i++) ring(P('volcanic_spire_01', 'basalt_boulder_01', 'boulder'), 0, -84, 10, 26, { scale: R.range(5, 9) });
  m.keepOut(0, -84, 22);
  m.paintCircle(0, 0, -84, 28, 0.85, 0.4);
}
for (let i = 0; i < 14; i++) ring(BOULDER(), 0, -84, 24, 34, { scale: R.range(3, 5) });
for (let i = 0; i < 10; i++) ring(P('volcanic_lava_rock_01', 'basalt_cluster_01'), 0, -84, 24, 36, {});
for (const [x, z] of [[-18, -62], [16, -66], [-4, -58], [26, -56], [-30, -54]]) {
  add(P('volcanic_vent_01', 'volcanic_lava_rock_01', 'basalt_cluster_01'), x, z, { rotY: R.angle() });
  m.shaft(x, z, { w: 4.5, h: 18, rotY: R.range(0.2, 1.0) });
  m.paintCircle(3, x, z, 8, 0.9, 0.5);
}

// ══ The warcamp (south) ═══════════════════════════════════════════════════
// The "village" of this map: the ogres live between the two rivers. Dense,
// breakable, lit — the opposite of the barrens.
const CAMP = { x: 0, z: 40 };
const hutYard = (x, z, rot) => {
  const fx = Math.sin(rot), fz = Math.cos(rot), sx = fz, sz = -fx;
  const put = (key, f, s, r) => add(key, x + fx * f + sx * s, z + fz * f + sz * s, { rotY: r ?? R.angle() });
  put(P('ogre_bone_pile_01', 'combat_bones_01'), 4.6, 3.4);
  put(P('ogre_butcher_block_01', 'prop_table_wood_01'), 5.0, -3.4, rot);
  put(P('barrel', 'prop_wood_crate_large_01'), -4.8, R.range(-2.5, 2.5));
  if (R() < 0.7) put(BRAZIER(), 6.0, R() < 0.5 ? 4.6 : -4.6, 0);
  if (R() < 0.6) put(P('ogre_weapon_rack_01', 'village_weapon_rack_01'), -5.2, 3.6, rot + PI / 2);
  if (R() < 0.5) put(P('char_logs_01', 'prop_logs_02'), -5.4, -3.8, rot + PI / 2);
};
const camp = (key, x, z, rot) => { if (m.has(key) && m.add(key, x, z, { rotY: rot, force: true })) hutYard(x, z, rot); else m.note(key); };
for (const [x, z, rot] of [[-15, 22, PI / 2], [15, 26, -PI / 2], [-16, 38, PI / 2], [16, 44, -PI / 2], [-14, 54, PI / 2], [14, 58, -PI / 2], [-2, 64, PI]])
  camp(HUT(), x, z, rot);

// The great cauldron at the centre of the camp, with the cook fire's light
add(P('ogre_cook_pot_01', 'blacksmith_forge_01'), CAMP.x, CAMP.z, { force: true });
for (let i = 0; i < 4; i++) ring(BRAZIER(), CAMP.x, CAMP.z, 6, 9, {});
for (let i = 0; i < 3; i++) ring(P('ogre_banner_01', 'village_signpost_01'), CAMP.x, CAMP.z, 8, 12, {});
for (let i = 0; i < 4; i++) ring(P('barrel'), CAMP.x, CAMP.z, 5, 10, {});
for (let i = 0; i < 3; i++) ring(P('ogre_bone_pile_01', 'combat_bones_01'), CAMP.x, CAMP.z, 6, 12, {});
add('chest', CAMP.x + 6, CAMP.z + 8, { rotY: R.angle() });
m.keepOut(CAMP.x, CAMP.z, 5);

// Cages and butchery on the camp's west edge; the spoils are in the middle
for (const [x, z] of [[-24, 30], [-25, 46], [-23, 60]]) {
  add(P('ogre_cage_01', 'ogre_hut_01'), x, z, { rotY: PI / 2 + R.range(-0.3, 0.3) });
  add(BONES(), x + 3.5, z + 3, { rotY: R.angle() });
}
for (const [x, z] of [[24, 34], [25, 50]]) {
  add(P('ogre_butcher_block_01', 'prop_table_wood_01'), x, z, { rotY: -PI / 2 });
  add(P('ogre_weapon_rack_01', 'village_weapon_rack_01'), x + 2, z + 4, { rotY: -PI / 2 });
}

// Stake wall round the camp, open on the north side where the track comes in
const wallStep = 2.6;
for (let z = 16; z <= 66; z += wallStep) for (const side of [-30, 30]) {
  if (Math.abs(z - 40) < 4) continue;                                  // side gates
  if (R() < 0.07) continue;                                            // a gap where it fell
  add(SPIKEWALL(), side + R.range(-0.5, 0.5), z + R.range(-0.3, 0.3), { rotY: PI / 2 + R.range(-0.09, 0.09), force: true });
}
for (let x = -30; x <= 30; x += wallStep) {
  if (Math.abs(x) < 6) continue;
  if (R() < 0.07) continue;
  add(SPIKEWALL(), x + R.range(-0.3, 0.3), 70 + R.range(-0.5, 0.5), { rotY: R.range(-0.09, 0.09), force: true });
}
for (const [x, z, rot] of [[-30, 40, PI / 2], [30, 40, PI / 2], [-8, 70, 0], [8, 70, 0]]) add(TOTEM(), x, z, { rotY: rot, force: true });
m.keepOutRect(-31, 14, 31, 71);
// Camp litter that ignores the keep-out (it belongs inside)
for (const k of ['barrel', 'prop_wood_crate_small_01', 'prop_wood_crate_broken_01', 'prop_pottery_01'])
  scatter(k, 9, { x0: -28, z0: 18, x1: 28, z1: 68 }, { tries: 5, ignoreKeepOut: true });
scatter(P('combat_bones_01', 'ogre_bone_pile_01'), 14, { x0: -28, z0: 18, x1: 28, z1: 68 }, { tries: 5, ignoreKeepOut: true });
scatter(P('combat_skull_01', 'combat_bones_01'), 12, { x0: -28, z0: 18, x1: 28, z1: 68 }, { tries: 5, ignoreKeepOut: true });
scatter(P('combat_spikes_01', 'char_barricade_01'), 8, { x0: -28, z0: 18, x1: 28, z1: 68 }, { tries: 5, ignoreKeepOut: true });

// ══ The black gate and the ogre keep (north-east) ═════════════════════════
m.add('ogreCastle', 78, -78, { rotY: PI * 0.75, force: true });
m.keepOut(78, -78, 11);
m.landmark('landmark_ogre_gate', 58, -58, { rotY: PI * 0.75, keepOut: 9 });
if (!m.has('landmark_ogre_gate')) for (let i = 0; i < 10; i++) ring(P('volcanic_spire_01', 'basalt_boulder_01', 'boulder'), 58, -58, 6, 12, { scale: R.range(4, 7) });
// An approach lined with stakes and barricades: you know whose ground this is
for (let d = 14; d <= 38; d += 5) {
  const a = PI * 0.75, x = 58 + Math.sin(a) * d, z = -58 + Math.cos(a) * d;
  for (const side of [-1, 1]) {
    add(STAKE(), x + Math.cos(a) * side * 7, z - Math.sin(a) * side * 7, { rotY: R.angle() });
    if (R() < 0.5) add(BARRICADE(), x + Math.cos(a) * side * 10, z - Math.sin(a) * side * 10, { rotY: a + PI / 2 });
  }
}
for (let i = 0; i < 7; i++) ring(BARRICADE(), 78, -78, 13, 19, { facing: 'in' });
for (let i = 0; i < 5; i++) ring(P('ogre_skull_pile_01', 'ogre_bone_pile_01', 'combat_bones_01'), 78, -78, 12, 20, {});
for (let i = 0; i < 4; i++) ring(BRAZIER(), 78, -78, 12, 16, {});
ring('chest', 78, -78, 11, 14, {}); ring('chest', 60, -44, 3, 7, {});
for (let i = 0; i < 6; i++) ring(P('combat_wall_destroyed_01', RUBBLE()), 78, -78, 16, 26, {});

// ══ The slagworks (south-west) ════════════════════════════════════════════
const SLAG = { x: -62, z: -50 };
add(P('ogre_forge_01', 'blacksmith_forge_01'), SLAG.x, SLAG.z, { force: true });
add('blacksmith_anvil_01', SLAG.x + 5, SLAG.z + 3, { rotY: R.angle() });
add('blacksmith_coal_pile_01', SLAG.x - 4, SLAG.z + 4, { rotY: R.angle() });
add('blacksmith_tool_rack_01', SLAG.x - 5, SLAG.z - 3, { rotY: PI / 2 });
for (let i = 0; i < 3; i++) ring(P('ogre_weapon_rack_01', 'village_weapon_rack_01'), SLAG.x, SLAG.z, 6, 10, {});
for (let i = 0; i < 5; i++) ring('barrel', SLAG.x, SLAG.z, 5, 11, {});
for (let i = 0; i < 4; i++) ring(BARRICADE(), SLAG.x, SLAG.z, 8, 13, {});
for (let i = 0; i < 4; i++) ring(P('volcanic_lava_rock_01', ROCK_MID()), SLAG.x, SLAG.z, 7, 14, {});
for (let i = 0; i < 3; i++) ring(BRAZIER(), SLAG.x, SLAG.z, 6, 10, {});
ring('chest', SLAG.x, SLAG.z, 7, 10, {});
m.keepOut(SLAG.x, SLAG.z, 15);
m.landmark('landmark_ogre_idol_01', -76, -22, { rotY: PI * 0.3, keepOut: 7 });
for (let i = 0; i < 5; i++) ring(BONES(), -76, -22, 7, 12, {});
for (let i = 0; i < 4; i++) ring(BRAZIER(), -76, -22, 8, 11, {});

// ══ The obsidian field (east) ═════════════════════════════════════════════
m.landmark('landmark_obsidian_arch_01', 74, 34, { rotY: PI * 0.15, keepOut: 6 });
const OBS = { x0: 56, z0: -12, x1: 94, z1: 74 };
scatter(P('volcanic_obsidian_shards_01', ROCK_MID()), 34, OBS, { tries: 8, minSpacing: 1.2 });
scatter(P('volcanic_spire_01', BOULDER()), 16, OBS, { tries: 8, minSpacing: 2 });
scatter(P('volcanic_spire_02', ROCK_MID()), 20, OBS, { tries: 8, minSpacing: 1.5 });
scatter(BOULDER(), 18, OBS, { tries: 6 });
scatter(ROCK_SMALL(), 26, OBS, { tries: 5 });
add('chest', 90, 70, { rotY: R.angle() });
for (const [x, z] of [[64, 8], [82, 52], [70, 66]]) { add(P('volcanic_vent_01', 'volcanic_lava_rock_01', ROCK_MID()), x, z, {}); m.shaft(x, z, { w: 4, h: 15, rotY: R.range(0.2, 1) }); m.paintCircle(3, x, z, 7, 0.85, 0.5); }

// ══ The ash barrens (west) ════════════════════════════════════════════════
// Deliberately sparse: after the camp and the obsidian field, somewhere to fight.
const BARRENS = { x0: -94, z0: -34, x1: -50, z1: 58 };
scatter(P('volcanic_ash_mound_01', ROCK_MID()), 26, BARRENS, { tries: 6, minSpacing: 3 });
scatter(DEADTREE(), 18, BARRENS, { tries: 8, minSpacing: 4 });
scatter(P('combat_bones_01', 'ogre_bone_pile_01'), 20, BARRENS, { tries: 5 });
scatter(P('combat_skull_01', 'combat_bones_01'), 14, BARRENS, { tries: 5 });
scatter(ROCK_SMALL(), 22, BARRENS, { tries: 5 });
scatter(P('combat_abandoned_sword_01', 'combat_arrow_cluster_01'), 9, BARRENS, { tries: 5 });
scatter(P('combat_abandoned_shield_01', 'combat_arrow_cluster_01'), 8, BARRENS, { tries: 5 });
add('chest', -88, -86, { rotY: R.angle() });
add('chest', -86, 82, { rotY: R.angle() });
// A boneyard: the thing to walk toward in an otherwise empty quarter
for (let i = 0; i < 9; i++) ring(P('ogre_skull_pile_01', 'ogre_bone_pile_01', 'combat_bones_01'), -70, 24, 3, 12, {});
for (let i = 0; i < 6; i++) ring(STAKE(), -70, 24, 8, 13, { facing: 'in' });
for (let i = 0; i < 4; i++) ring(DEADTREE(), -70, 24, 12, 18, { scale: R.range(5, 8) });
m.keepOut(-70, 24, 5);

// ══ The burnt forest ══════════════════════════════════════════════════════
// Thickest in the mid-ground and the far south, gone entirely near the lava
// (nothing stands within reach of a river) and near the cone.
const burnt = (x, z) => {
  if (nearLava(x, z) < 9) return 0;
  if (Math.hypot(x, z + 84) < 34) return 0;                       // the cone's slopes
  if (Math.abs(x) < 8 && z > -58 && z < 66) return 0;             // the track verge
  const n = noise(x, z);
  const edge = Math.max(Math.abs(x), Math.abs(z)) / 94;
  return Math.max(0, Math.min(1, 0.26 + edge * 0.45 + (n - 0.5) * 0.85));
};
const region = { x0: -94, z0: -94, x1: 94, z1: 94 };
// Standing dead only. One interleaved pass rather than one scatter per variant:
// scattering them in sequence let the first variant take every good spot (81 / 19 / 8
// out of 90 each), which is exactly the repetition the variants exist to avoid.
const deads = DEADTREES();
const DEADSET = new Set(deads);
let deadPlaced = 0;
for (let i = 0; i < 240 * 30 && deadPlaced < 240; i++) {
  const x = R.range(region.x0, region.x1), z = R.range(region.z0, region.z1);
  if (R() > burnt(x, z)) continue;
  // pad 0.4, not 1.2: the trunk radius already keeps them apart and dead trees have
  // no canopy to overlap, so they can stand as close as a burnt stand really does
  if (m.add(R.pick(deads), x, z, { rotY: R.angle(), pad: 0.4 })) deadPlaced++;
}
for (const o of m.objects) if (DEADSET.has(o.key)) o.scale = +(4.5 + R() * 4.2).toFixed(1);
m.landmark('burnt_tree_giant_01', -34, -34, { rotY: R.angle(), keepOut: 4 });
m.landmark('burnt_tree_giant_01', 30, 78, { rotY: R.angle(), keepOut: 4 });

// Floor of the burnt woods
scatter(P('char_stump_01', 'prop_tree_stump_02'), 60, region, { density: burnt, tries: 7 });
scatter(P('char_fallen_log_01', 'nature_fallen_log_01'), 30, region, { density: burnt, tries: 7 });
scatter(P('char_shrub_01', 'shrubbery'), 45, region, { density: (x, z) => burnt(x, z) * 0.7, tries: 5 });
scatter(P('char_bush_01', 'nature_bush_03'), 40, region, { density: (x, z) => burnt(x, z) * 0.6, tries: 5 });
scatter(ROCK_MID(), 30, region, { density: burnt, tries: 6 });
scatter(ROCK_SMALL(), 34, region, { density: burnt, tries: 6 });
scatter(BOULDER(), 26, region, { density: (x, z) => burnt(x, z) * 0.7, tries: 6 });
scatter(P('volcanic_lava_rock_01', ROCK_MID()), 22, region, { density: (x, z) => Math.max(0, 0.9 - nearLava(x, z) / 26), tries: 8 });
scatter(P('volcanic_crater_slab_01', ROCK_MID()), 20, region, { density: (x, z) => Math.max(0, 0.8 - nearLava(x, z) / 30), tries: 7 });
scatter(P('volcanic_sulfur_crust_01', ROCK_SMALL()), 24, region, { density: (x, z) => heat(x, z) > 0.62 ? 0.9 : 0.1, tries: 6 });

scatter(P('combat_burned_cart_01', 'combat_broken_cart_01', 'char_barricade_01'), 9, region, { density: burnt, tries: 8 });
scatter(P('combat_wall_rubble_01', ROCK_MID()), 16, region, { density: (x, z) => burnt(x, z) * 0.5, tries: 7 });
scatter('prop_wood_crate_broken_01', 8, region, { density: burnt, tries: 8 });
// Scattered caches to reward walking to the edges
add('chest', 88, -88, { rotY: R.angle() });
add('chest', 0, 90, { rotY: R.angle() });

// ══ Ground paint ══════════════════════════════════════════════════════════
// R basalt (bare rock), G cinder (burnt ground), B lavaCrust (hot banks), A sulfur
const BASALT = 0, CINDER = 1, CRUST = 2, SULFUR = 3;
m.paintRoads(BASALT, BASALT);                       // the tracks are bare rock
// r >= 3 rather than 2: at 2 the 650-odd obstacles painted overlapping basalt discs
// that merged into what looked like a paved courtyard across the whole map
m.paintUnderObstacles(BASALT, 3.0, 0.55);
m.paintCircle(BASALT, 0, 0, 15, 0.8, 0.5);          // the crossing
// The camp's trampled rock, as a run of overlapping circles rather than a rect:
// a painted rectangle leaves a hard straight edge that reads from the air as a
// box drawn on the ground, which is the one thing a natural map cannot have.
for (let z = 16; z <= 70; z += 5) for (let x = -27; x <= 27; x += 6)
  m.paintCircle(BASALT, x + R.range(-3, 3), z + R.range(-3, 3), R.range(7, 11), R.range(0.4, 0.7), 0.85);
m.paintCircle(BASALT, CAMP.x, CAMP.z, 12, 0.85, 0.5);
m.paintCircle(BASALT, SLAG.x, SLAG.z, 15, 0.85, 0.5);
m.paintCircle(BASALT, 78, -78, 22, 0.8, 0.5);
m.paintCircle(BASALT, -70, 24, 12, 0.6, 0.6);
// A glowing crust apron down both banks of both rivers
for (const [fn, fords] of [[eastX, EAST_FORDS], [westX, WEST_FORDS]]) for (let z = -96; z <= 96; z += 1.5) {
  if (fords.some(f => Math.abs(z - f) < 6)) continue;             // the causeway is cold rock
  m.paintCircle(CRUST, fn(z), z, 7.5, 0.95, 0.55);
}
// Burnt ground follows the burnt forest
m.paintFn(CINDER, (x, z) => burnt(x, z) * 1.15 - 0.08, 2);
m.paintCircle(CINDER, SLAG.x, SLAG.z, 20, 0.7, 0.6);
for (let z = 14; z <= 72; z += 7) for (let x = -30; x <= 30; x += 8)
  m.paintCircle(CINDER, x + R.range(-4, 4), z + R.range(-4, 4), R.range(8, 13), R.range(0.3, 0.55), 0.9);
// Sulfur is a vent deposit, not a biome. The first pass used (heat - 0.60), which
// put it over roughly 40% of the map: at that coverage its chunky yellow texture
// tiled visibly into a cross-hatch from the air. It is tight patches now.
m.paintFn(SULFUR, (x, z) => (heat(x, z) - 0.80) * 3.2, 2);
m.suppress(CINDER, BASALT); m.suppress(SULFUR, BASALT); m.suppress(CINDER, CRUST); m.suppress(SULFUR, CRUST);
m.suppress(CRUST, BASALT, 0.85);   // a causeway is cold rock laid over a hot bank

// ══ Decals ════════════════════════════════════════════════════════════════
// 90 bright-white drifts plus pale trees read as snow. Fewer and smaller: the ash
// base texture already covers the ground, these are just the wind-piled edges.
m.scatterDecals('ashDrift', 40, region, { density: (x, z) => 0.7 - burnt(x, z) * 0.5, scale: [1.8, 3.0] });
m.scatterDecals('scorch', 70, region, { density: burnt, scale: [2, 3.6] });
m.scatterDecals('emberCrack', 46, region, { density: (x, z) => Math.max(0.08, 0.95 - nearLava(x, z) / 24), scale: [2, 3.8] });
m.scatterDecals('sulfurStain', 38, region, { density: (x, z) => heat(x, z) > 0.6 ? 0.85 : 0.08, scale: [2, 3.4] });
m.scatterDecals('cracks', 40, region, { density: (x, z) => 0.5 - burnt(x, z) * 0.3, scale: [3, 5] });
m.scatterDecals('bones', 30, region, { density: (x, z) => burnt(x, z) * 0.5, scale: [1.8, 3] });
m.scatterDecals('bones', 14, { x: -70, z: 24, r: 14 }, { scale: [2, 3.2], ignoreKeepOut: true });
m.scatterDecals('slag', 16, { x: SLAG.x, z: SLAG.z, r: 16 }, { scale: [2, 3.4], ignoreKeepOut: true });
m.scatterDecals('slag', 10, { x: CAMP.x, z: CAMP.z, r: 22 }, { scale: [1.8, 3], ignoreKeepOut: true });
m.scatterDecals('rubble', 14, { x: 78, z: -78, r: 24 }, { scale: [2.5, 4], ignoreKeepOut: true });
m.scatterDecals('scorch', 18, { x: CAMP.x, z: CAMP.z, r: 26 }, { scale: [2, 3.4], ignoreKeepOut: true });
m.scatterDecals('emberCrack', 10, { x: 0, z: -84, r: 32 }, { scale: [2.5, 4.5], ignoreKeepOut: true });

// ══ Dead tufts ════════════════════════════════════════════════════════════
// Two variants: dry stalks in the ash, charred stalks in the burnt ground
// (MAPS.emberreach.terrain.tufts). Nothing grows on rock or on hot crust.
m.scatterTufts(4200, region, {
  density: (x, z) => 0.85 - burnt(x, z) * 0.35 - Math.max(0, 0.8 - nearLava(x, z) / 18),
  bareChannels: [BASALT, CRUST], tries: 6, scale: [0.45, 0.95], variants: 2,
});

// ══ Heat plumes over the lava ═════════════════════════════════════════════
for (const [fn, fords] of [[eastX, EAST_FORDS], [westX, WEST_FORDS]]) {
  for (let z = -60; z <= 90; z += 15) {
    if (fords.some(f => Math.abs(z - f) < 9)) continue;
    m.shaft(fn(z), z, { w: 6, h: 13, rotY: R.range(0.2, 1.0) });
  }
}

const json = m.toJSON();
writeFileSync(OUT, JSON.stringify(json, null, 1).replace(/\n\s*("?\w+"?): /g, ' $1: ').replace(/\{\s+/g, '{ ').replace(/\s+\}/g, ' }'));
await m.writeSplat(OUT.replace(/\.json$/, '.splat.png'));
console.log(`${OUT}: ${json.objects.length} objects, ${m.obstacles.length} obstacles, ${json.barriers.length} lava barriers, ${json.decals.length} decals, ${json.tufts.length} tufts, ${json.streams.length} lava segments, ${json.shafts.length} plumes`);
console.log(m.summary());
console.log(m.missingSummary());

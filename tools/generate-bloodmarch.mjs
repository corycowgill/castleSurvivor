/**
 * Bloodmarch map generator → map.bloodmarch.json
 *
 * The field where the two armies met, the morning after. The human castle and
 * its town hold the north-west, the orc fortress and its camp the south-east,
 * and the King's Road runs corner to corner between them through what is left
 * of both (north is -z):
 *
 *      THE CASTLE (NW)                             burnt woods + chapel (NE)
 *        battered town ──╮
 *           farms (SW)    ╰── human siege line
 *                              ╲  THE FIELD (spawn): craters, wrecks, banners
 *                               ╲── orc siege line
 *                                    orc camp ──╮
 *                                               ╰── THE ORC FORTRESS (SE)
 *
 * Everything on it has been fought over. The buildings are the ones the player
 * knows from Kingsfield, battered and gutted (tools/char-glb.mjs regrades), with
 * the Trellis ruins of batches 13/14 asked for by name and slotted in beside
 * them as they land. The fires are not meshes: every gutted building, wreck and
 * brazier is a `fire` the game draws as flames, smoke and light
 * (updateMapFires / vfx.buildingFire), so the town burns without a single
 * flame in any GLB.
 *
 * Usage: node tools/generate-bloodmarch.mjs [--seed N] [--out map.bloodmarch.json]
 */
import { writeFileSync } from 'node:fs';
import { MapBuilder, makeNoise } from './maplib.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEED = +opt('--seed', 5511);
const OUT = opt('--out', 'map.bloodmarch.json');

const m = new MapBuilder({ worldSize: 100, spawnX: 0, spawnZ: 0, enemySpawnDistance: 48, seed: SEED });
const R = m.rnd;
const noise = makeNoise(R, 19);
const churn = makeNoise(R, 11);      // fine-grained "how hard was this ground fought over"
const PI = Math.PI;

// ── Asset access that tolerates a half-finished batch ─────────────────────
const add = (key, x, z, o = {}) => (m.has(key) ? m.add(key, x, z, o) : m.note(key));
const ring = (key, cx, cz, r0, r1, o = {}) => (m.has(key) ? m.ring(key, cx, cz, r0, r1, o) : m.note(key));
const scatter = (key, n, region, o = {}) => (m.has(key) ? m.scatter(key, n, region, o) : (m.note(key), 0));
const P = (...keys) => m.pick(...keys) || keys[0];
const pickAny = (...keys) => { const have = keys.filter(k => m.has(k)); return have.length ? R.pick(have) : keys[0]; };

// Every role names the Trellis mesh first and the regraded stand-in behind it.
// ── human side
const COTTAGE = () => pickAny('war_house_ruin_01', 'war_house_ruin_02', 'war_house_01', 'war_house_gutted_01');
const COTTAGE_GUTTED = () => pickAny('war_house_ruin_01', 'war_house_gutted_01');
const TAVERN = () => P('war_tavern_ruin_01', 'war_tavern_gutted_01', 'war_tavern_01');
const BARN = () => P('war_barn_ruin_01', 'war_stable_gutted_01');
const FARMHOUSE = () => pickAny('war_farmhouse_ruin_01', 'war_farmhouse_01', 'war_farmhouse_gutted_01');
const CHAPEL = () => P('war_chapel_ruin_01', 'war_apothecary_01');
const SMITHY = () => P('war_blacksmith_01', 'blacksmith');
const CURTAIN = () => P('war_castle_wall_01', 'war_wall_01', 'wall');
const BREACH = () => P('war_castle_wall_breach_01', 'combat_wall_destroyed_01', 'combat_wall_rubble_01', 'war_wall_01');
const TOWER = () => P('war_tower_ruin_01', 'landmark_ruined_tower');
const GATEHOUSE = () => P('war_gatehouse_ruin_01', 'landmark_destroyed_watchtower', 'war_wall_01');
const STALL = () => P('war_market_stall_ruin_01', 'war_stall_01');
const WELL = () => P('war_well_01', 'village_water_well_01');
const WATCHTOWER_FALLEN = () => P('war_watchtower_wreck_01', 'landmark_destroyed_watchtower');
const SIEGE_TOWER = () => P('war_siege_tower_wreck_01', 'landmark_destroyed_watchtower');
const TREBUCHET = () => P('war_trebuchet_wreck_01', 'war_cart_gutted_01');
const BALLISTA = () => P('war_ballista_01', 'blacksmith_weapon_rack_01', 'village_weapon_rack_01');
const WAGON = () => P('war_supply_wagon_wreck_01', 'war_cart_gutted_01', 'combat_broken_cart_01');
const TENT = () => P('war_field_tent_01', 'prop_hay_bale_01');
const PAVILION = () => P('war_command_tent_01', 'war_stall_01');
const H_BANNER = () => P('war_kingdom_banner_01', 'village_signpost_01');
const STATUE_FALLEN = () => P('war_knight_statue_fallen_01', 'war_statue_01');
const SHIELDS = () => P('war_shield_pile_01', 'combat_abandoned_shield_01', 'prop_wood_crate_broken_01');
const H_LANTERN = () => P('war_lantern_01', 'village_lantern_post_01');
const H_FENCE = () => P('war_fence_01', 'village_fence_broken_01');
// ── orc side
const ORC_GATE = () => P('orc_fortress_gate_ruin_01', 'landmark_ogre_gate');
const PALISADE = () => P('orc_fortress_wall_01', 'ogre_spike_wall_01', 'char_barricade_01', 'combat_barricade_01');
const PALISADE_BROKEN = () => P('orc_fortress_wall_broken_01', 'ogre_barricade_01', 'char_barricade_01');
const ORC_TOWER = () => pickAny('orc_watchtower_01', 'orc_watchtower_broken_01', 'landmark_destroyed_watchtower');
const ORC_HUT = () => pickAny('orc_hut_ruin_01', 'ogre_hut_01', 'war_farmhouse_gutted_01');
const LONGHOUSE = () => P('orc_longhouse_01', 'war_stable_gutted_01');
const DRUM = () => P('orc_war_drum_01', 'barrel');
const CATAPULT = () => P('orc_catapult_wreck_01', 'war_cart_gutted_01');
const RAM = () => P('orc_battering_ram_01', 'char_logs_01', 'prop_logs_02');
const O_BANNER = () => P('orc_war_banner_01', 'ogre_banner_01', 'combat_enemy_totem_01', 'village_signpost_01');
const SPIKES = () => P('orc_spike_barricade_01', 'ogre_barricade_01', 'combat_spikes_01', 'char_barricade_01');
const IDOL = () => P('orc_idol_broken_01', 'ogre_totem_01', 'war_statue_01');
const ORC_SMITHY = () => P('orc_smithy_ruin_01', 'ogre_forge_01', 'blacksmith_forge_01');
const WATCHFIRE = () => P('orc_watch_fire_01', 'ogre_brazier_01', 'village_lantern_post_01');
const LOOT = () => P('orc_loot_pile_01', 'prop_wood_crate_large_01');
const PEN = () => P('orc_pen_01', 'bog_fence_01', 'village_fence_broken_01');
const TOTEM = () => P('ogre_totem_01', 'combat_enemy_totem_01', 'combat_skull_stake_01', 'fen_totem_01');
// nature_rock_small_02 is a MOSSY rock and read as bright green lozenges all over the field
const BONES = () => P('ogre_bone_pile_01', 'combat_skull_01', 'basalt_small_02');
const CAGE = () => P('ogre_cage_01', 'orc_pen_01', 'war_fence_01');
// ── the field
const CRATER = () => P('field_crater_rim_01', 'basalt_cluster_01', 'nature_rock_cluster_02');
const SIEGE_STONE = () => P('field_siege_boulder_01', 'boulder');
const LADDER = () => P('field_broken_ladder_01', 'char_fallen_log_01', 'nature_fallen_log_01');
const BEAMS = () => P('field_charred_beam_pile_01', 'char_logs_01', 'prop_logs_02');
const SHIELD_WALL = () => P('field_shield_wall_01', 'char_barricade_01', 'combat_barricade_01');
const CAIRN = () => P('field_grave_mound_01', 'combat_abandoned_sword_01', 'char_stump_01');
const WRECK = () => P('field_broken_cart_burnt_01', 'combat_burned_cart_01', 'war_cart_gutted_01');
const EARTHWORK = () => P('field_sandbag_wall_01', 'combat_barricade_01', 'char_barricade_01');
// No stand-in for these: a field littered with crates until batch 5 lands is worse than a bare one
const SWORD = () => P('combat_abandoned_sword_01', 'combat_arrow_cluster_01');
const ARROWS = () => P('combat_arrow_cluster_01', 'combat_abandoned_sword_01');
const RUBBLE = () => P('combat_wall_rubble_01', 'basalt_cluster_01', 'nature_rock_cluster_02');
const DEADTREE = () => pickAny('war_oak_burnt_01', 'char_dead_tree_01', 'char_dead_tree_03', 'combat_burned_tree_01', 'nature_dead_tree_03');
const DEADPINE = () => P('war_pine_burnt_01', 'char_dead_tree_02');
const STUMP = () => P('char_stump_01', 'prop_tree_stump_02');

// ── Fires ─────────────────────────────────────────────────────────────────
// A gutted building burns from the roof; a wreck burns low. `big` scales the
// footprint and the smoke height. Every fire also paints scorched ground.
const GUTTED = new Set(['war_house_gutted_01', 'war_house_ruin_01', 'war_tavern_gutted_01', 'war_tavern_ruin_01', 'war_barn_ruin_01',
  'war_farmhouse_gutted_01', 'war_farmhouse_ruin_01', 'war_stable_gutted_01', 'war_chapel_ruin_01', 'war_siege_tower_wreck_01',
  'orc_hut_ruin_01', 'orc_watchtower_broken_01', 'orc_longhouse_01', 'orc_smithy_ruin_01']);
const SMOULDERING = new Set(['war_house_ruin_02', 'war_house_01', 'war_tavern_01', 'war_farmhouse_01', 'war_blacksmith_01', 'war_apothecary_01',
  'war_gatehouse_ruin_01', 'war_tower_ruin_01', 'orc_watchtower_01', 'ogre_hut_01', 'war_orc_keep_01', 'war_castle_01', 'orc_fortress_gate_ruin_01']);
const WRECKS = new Set(['war_cart_gutted_01', 'field_broken_cart_burnt_01', 'combat_burned_cart_01', 'war_supply_wagon_wreck_01',
  'war_trebuchet_wreck_01', 'orc_catapult_wreck_01', 'war_watchtower_wreck_01', 'field_charred_beam_pile_01', 'char_logs_01', 'war_stall_01', 'war_market_stall_ruin_01']);
const SCORCH = 0; // splat channel painted under every fire (assigned below with the others)
const fireAt = (key, x, z, scale) => {
  if (GUTTED.has(key)) {
    const big = scale / 6;
    m.fire(x, z, { r: 1.4 * big, y: 2.2 * big, h: 11 * big, s: 1 });
    if (R() < 0.7) m.fire(x + R.range(-2.2, 2.2) * big, z + R.range(-2.2, 2.2) * big, { r: 0.8 * big, y: 1.4 * big, h: 7, s: 0.7 });
    m.paintCircle(SCORCH, x, z, 6 * big + 2, 0.95, 0.5);
  } else if (SMOULDERING.has(key)) {
    const big = scale / 6;
    if (R() < 0.75) m.fire(x + R.range(-2, 2) * big, z + R.range(-2, 2) * big, { r: 0.6 * big, y: 1.8 * big, h: 9, s: 0.45 });
    m.paintCircle(SCORCH, x, z, 4 * big + 1.5, 0.6, 0.6);
  } else if (WRECKS.has(key)) {
    if (R() < 0.65) m.fire(x, z, { r: 0.8, y: 0.5, h: 6, s: 0.7 });
    m.paintCircle(SCORCH, x, z, 3.2, 0.85, 0.5);
  }
};
// `put`: add, then light it if it is the kind of thing that burns
const put = (key, x, z, o = {}) => {
  if (!m.has(key)) return m.note(key);
  const before = m.objects.length;
  const ok = m.add(key, x, z, o);
  if (ok) fireAt(key, x, z, m.objects[before].scale);
  return ok;
};

// ══ Ground tiles ══════════════════════════════════════════════════════════
for (let gx = -96; gx <= 96; gx += 8) for (let gz = -96; gz <= 96; gz += 8) m.tile('grass', gx, gz);

// ══ The King's Road ═══════════════════════════════════════════════════════
// Corner to corner, castle gate to fortress gate, with a bend either side of the
// field and the middle churned to nothing by the fighting (no tiles there: the
// crater field is the road now).
const roadX = (t) => t + Math.sin(t * 0.06) * 4;        // parametric on z = t
const ROAD_PTS = [];
for (let t = -64; t <= 64; t += 5) { if (Math.abs(t) < 14) continue; m.tile('road', roadX(t), t); ROAD_PTS.push([roadX(t), t]); }
const nearRoad = (x, z) => Math.abs(x - roadX(z)) * 0.7 + 0;   // rough distance to the road's line
// The diagonal axis: u runs castle → fortress, v is across it
const U = (x, z) => (x + z) * 0.7071, V = (x, z) => (z - x) * 0.7071;

// ══ The human castle (north-west) ═════════════════════════════════════════
const CASTLE = { x: -72, z: -72 };
put(P('war_castle_01', 'humanCastle'), CASTLE.x, CASTLE.z, { rotY: PI * 0.25, force: true });
m.keepOut(CASTLE.x, CASTLE.z, 14);
m.paintCircle(2, CASTLE.x, CASTLE.z, 22, 0.9, 0.5);
// Curtain wall: an arc of segments facing the field, breached where the road
// comes through (the gatehouse) and smashed open in two more places.
const WALL_R = 27, WALL_C = CASTLE;
const gateA = PI * 0.25;                                   // the road's direction from the castle
for (let a = gateA - PI * 0.62; a <= gateA + PI * 0.62; a += 0.125) {
  const x = WALL_C.x + Math.cos(a) * WALL_R, z = WALL_C.z + Math.sin(a) * WALL_R;
  if (Math.abs(x) > 96 || Math.abs(z) > 96) continue;
  const da = Math.abs(a - gateA);
  if (da < 0.16) continue;                                 // the gate
  const rot = a + PI / 2;
  if (da > 0.9 && da < 1.02 || da > 1.5 && da < 1.62) { put(BREACH(), x, z, { rotY: rot, force: true }); continue; }
  if (R() < 0.06) continue;                                // knocked flat
  put(CURTAIN(), x, z, { rotY: rot, force: true, scale: m.has('war_castle_wall_01') ? undefined : 5 });
}
const GATE = { x: WALL_C.x + Math.cos(gateA) * WALL_R, z: WALL_C.z + Math.sin(gateA) * WALL_R };
put(GATEHOUSE(), GATE.x, GATE.z, { rotY: gateA + PI / 2, force: true });
m.keepOut(GATE.x, GATE.z, 5);
for (const a of [gateA - PI * 0.62, gateA + PI * 0.62, gateA - PI * 0.3, gateA + PI * 0.3]) {
  const x = WALL_C.x + Math.cos(a) * WALL_R, z = WALL_C.z + Math.sin(a) * WALL_R;
  if (Math.abs(x) < 96 && Math.abs(z) < 96) put(TOWER(), x, z, { rotY: a, force: true });
}
// Rubble spilled out of every breach and along the foot of the wall
for (let i = 0; i < 14; i++) ring(RUBBLE(), WALL_C.x, WALL_C.z, WALL_R + 2, WALL_R + 8, {});
for (let i = 0; i < 8; i++) ring(P('war_wall_01', 'wall'), WALL_C.x, WALL_C.z, WALL_R + 3, WALL_R + 7, { scale: 3 });
m.paintCircle(2, GATE.x, GATE.z, 12, 0.85, 0.5);

// ══ The battered town ═════════════════════════════════════════════════════
// Between the wall and the field, either side of the road. Half of it is gutted
// and burning, the rest battered; the tavern and the smithy still stand.
const yard = (x, z, rot) => {
  const fx = Math.sin(rot), fz = Math.cos(rot), sx = fz, sz = -fx;
  const at = (key, f, s, r) => put(key, x + fx * f + sx * s, z + fz * f + sz * s, { rotY: r ?? R.angle() });
  if (R() < 0.6) at(BEAMS(), 5.2, 3.2);
  if (R() < 0.5) at(SHIELDS(), 5.0, -3.4);
  if (R() < 0.45) at(P('barrel'), -5.0, R.range(-2.5, 2.5));
  if (R() < 0.4) at(H_LANTERN(), 6.2, R() < 0.5 ? 4.6 : -4.6, 0);
  if (R() < 0.35) at(WRECK(), -5.6, 3.8, rot + PI / 2);
};
const TOWN = [
  [-52, -30, PI * 0.25, 'cottage'], [-40, -42, PI * 0.25, 'cottage'], [-30, -54, PI * 0.25, 'cottage'],
  [-33, -35, -PI * 0.75, 'tavern'], [-45, -22, -PI * 0.75, 'cottage'], [-58, -42, PI * 0.25, 'smithy'],
  [-22, -46, -PI * 0.75, 'cottage'], [-62, -30, PI * 0.6, 'cottage'], [-26, -62, PI * 0.1, 'chapel'],
  [-38, -56, PI * 0.25, 'cottage'], [-48, -50, PI * 0.25, 'cottage'], [-18, -34, -PI * 0.75, 'cottage'],
];
for (const [x, z, rot, kind] of TOWN) {
  const key = kind === 'tavern' ? TAVERN() : kind === 'smithy' ? SMITHY() : kind === 'chapel' ? CHAPEL() : COTTAGE();
  if (put(key, x, z, { rotY: rot, force: true })) yard(x, z, rot);
  m.paintCircle(2, x, z, 8, 0.55, 0.7);
}
// The square: the well, the fallen statue, wrecked stalls
const SQUARE = { x: -40, z: -34 };
put(WELL(), SQUARE.x + 4, SQUARE.z - 5, { rotY: R.angle() });
put(STATUE_FALLEN(), SQUARE.x - 3, SQUARE.z + 2, { rotY: PI * 0.7 });
for (let i = 0; i < 3; i++) ring(STALL(), SQUARE.x, SQUARE.z, 5, 9, {});
for (let i = 0; i < 3; i++) ring(H_BANNER(), SQUARE.x, SQUARE.z, 6, 11, {});
for (let i = 0; i < 4; i++) ring(BEAMS(), SQUARE.x, SQUARE.z, 4, 10, {});
for (let i = 0; i < 4; i++) ring(P('barrel'), SQUARE.x, SQUARE.z, 4, 9, {});
add('chest', SQUARE.x + 8, SQUARE.z + 6, { rotY: R.angle() });
m.paintCircle(2, SQUARE.x, SQUARE.z, 11, 0.8, 0.5);
// Town litter that ignores the keep-outs: it belongs in the streets
scatter(SHIELDS(), 10, { x0: -66, z0: -66, x1: -14, z1: -18 }, { tries: 6, ignoreKeepOut: true });
scatter(BEAMS(), 14, { x0: -66, z0: -66, x1: -14, z1: -18 }, { tries: 6, ignoreKeepOut: true });
scatter(RUBBLE(), 12, { x0: -66, z0: -66, x1: -14, z1: -18 }, { tries: 6, ignoreKeepOut: true });
scatter(ARROWS(), 8, { x0: -66, z0: -66, x1: -14, z1: -18 }, { tries: 6, ignoreKeepOut: true });
scatter('prop_wood_crate_broken_01', 8, { x0: -66, z0: -66, x1: -14, z1: -18 }, { tries: 6, ignoreKeepOut: true });
scatter(H_LANTERN(), 6, { x0: -66, z0: -66, x1: -14, z1: -18 }, { tries: 6 });

// ══ The farms (south-west) ════════════════════════════════════════════════
const FARMS = [[-74, -4, PI * 0.3], [-60, 14, PI * 0.1], [-80, 30, PI * 0.5], [-52, 36, PI * 0.9]];
for (const [x, z, rot] of FARMS) {
  if (put(R() < 0.5 ? FARMHOUSE() : BARN(), x, z, { rotY: rot, force: true })) {
    const fx = Math.sin(rot), fz = Math.cos(rot);
    put(WAGON(), x + fx * 7, z + fz * 7, { rotY: rot + R.range(-0.5, 0.5) });
    if (R() < 0.6) put('hayBales', x - fx * 6, z - fz * 6, { rotY: R.angle() });
    if (R() < 0.5) put('farm_scarecrow_01', x + fz * 9, z - fx * 9, { rotY: R.angle() });
  }
  m.keepOut(x, z, 3);
  m.paintCircle(1, x, z, 16, 0.6, 0.7);
}
// Burnt fields: fence remnants and stubble
for (const [x0, z0, x1, z1] of [[-88, -14, -66, 4], [-72, 22, -50, 44], [-90, 36, -70, 56]]) {
  m.line(H_FENCE(), x0, z0, x1, z0, 2.6, {}); m.line(H_FENCE(), x0, z1, x1, z1, 2.6, {});
  m.paintRect(1, x0, z0, x1, z1, 0.8, 3);
  m.scatterDecals('hayScatter', 6, { x0, z0, x1, z1 }, { scale: [2, 3.4] });
  if (R() < 0.6) scatter('cornTile', 3, { x0, z0, x1, z1 }, { tries: 4 });
}
add('chest', -86, 60, { rotY: R.angle() });

// ══ The human siege line ══════════════════════════════════════════════════
// Where the king's host stood: tents, engines and earthworks facing the orcs
// along a line across the diagonal, thirty units out from the castle gate.
const H_LINE = { x: -32, z: -6, rot: PI * 0.25 };   // facing south-east
{
  const fx = Math.sin(H_LINE.rot), fz = Math.cos(H_LINE.rot), sx = fz, sz = -fx;
  const at = (key, f, s, r, o = {}) => put(key, H_LINE.x + fx * f + sx * s, H_LINE.z + fz * f + sz * s, { rotY: r ?? H_LINE.rot, ...o });
  at(PAVILION(), -6, 0, H_LINE.rot, { force: true });
  for (const s of [-16, -9, 9, 16]) at(TENT(), -4 + R.range(-2, 2), s, H_LINE.rot + R.range(-0.4, 0.4));
  for (const s of [-20, -11, 0, 11, 20]) at(EARTHWORK(), 5, s, H_LINE.rot + PI / 2);
  for (const s of [-15, 6, 17]) at(BALLISTA(), 2, s, H_LINE.rot);
  for (const s of [-23, -5, 5, 23]) at(H_BANNER(), -2, s, R.angle());
  for (const s of [-13, 3, 14]) at(SHIELD_WALL(), 7.5, s, H_LINE.rot + PI / 2);
  at(WAGON(), -10, -14, R.angle()); at(WAGON(), -11, 13, R.angle());
  for (let i = 0; i < 5; i++) at(SHIELDS(), R.range(-8, 4), R.range(-24, 24), R.angle());
  at('chest', -9, 3, R.angle());
  m.keepOut(H_LINE.x, H_LINE.z, 7);
}

// ══ The orc fortress (south-east) ═════════════════════════════════════════
const KEEP = { x: 74, z: 74 };
put(P('war_orc_keep_01', 'ogreCastle'), KEEP.x, KEEP.z, { rotY: PI * 1.25, force: true });
m.keepOut(KEEP.x, KEEP.z, 11);
m.paintCircle(SCORCH, KEEP.x, KEEP.z, 16, 0.5, 0.6);
// The palisade: an arc of great logs facing the field, the gate where the road
// arrives, two lengths smashed flat, a watchtower at every quarter.
const PAL_R = 28, oGate = PI * 1.25;
for (let a = oGate - PI * 0.6; a <= oGate + PI * 0.6; a += 0.1) {
  const x = KEEP.x + Math.cos(a) * PAL_R, z = KEEP.z + Math.sin(a) * PAL_R;
  if (Math.abs(x) > 96 || Math.abs(z) > 96) continue;
  const da = Math.abs(a - oGate);
  if (da < 0.2) continue;
  const rot = a + PI / 2;
  if (da > 0.7 && da < 0.85 || da > 1.35 && da < 1.5) { put(PALISADE_BROKEN(), x, z, { rotY: rot, force: true }); continue; }
  if (R() < 0.08) continue;
  put(PALISADE(), x, z, { rotY: rot, force: true });
}
const OGATE = { x: KEEP.x + Math.cos(oGate) * PAL_R, z: KEEP.z + Math.sin(oGate) * PAL_R };
if (!m.landmark('orc_fortress_gate_ruin_01', OGATE.x, OGATE.z, { rotY: oGate + PI / 2, keepOut: 7 })) {
  if (!m.landmark('landmark_ogre_gate', OGATE.x, OGATE.z, { rotY: oGate + PI / 2, keepOut: 7 })) {
    for (const side of [-1, 1]) put(TOTEM(), OGATE.x + Math.sin(oGate) * side * 6, OGATE.z - Math.cos(oGate) * side * 6, { rotY: oGate, force: true });
    m.keepOut(OGATE.x, OGATE.z, 5);
  }
}
m.fire(OGATE.x + 3, OGATE.z - 2, { r: 0.9, y: 1.5, h: 9, s: 0.8 });
for (const a of [oGate - PI * 0.6, oGate + PI * 0.6, oGate - PI * 0.32, oGate + PI * 0.32]) {
  const x = KEEP.x + Math.cos(a) * PAL_R, z = KEEP.z + Math.sin(a) * PAL_R;
  if (Math.abs(x) < 96 && Math.abs(z) < 96) put(ORC_TOWER(), x, z, { rotY: a, force: true });
}
for (let i = 0; i < 6; i++) ring(WATCHFIRE(), KEEP.x, KEEP.z, PAL_R - 4, PAL_R - 1, {});
for (let i = 0; i < 6; i++) ring(O_BANNER(), KEEP.x, KEEP.z, PAL_R + 2, PAL_R + 6, {});
for (let i = 0; i < 8; i++) ring(SPIKES(), KEEP.x, KEEP.z, PAL_R + 3, PAL_R + 9, { facing: 'out' });
// Inside the palisade: the camp. Huts round the longhouse, the drum, the smithy,
// pens and cages at the back, loot everywhere. Most of it breakable.
const CAMP = [[52, 78, PI * 1.5], [78, 52, PI], [60, 66, PI * 1.25], [86, 62, PI * 0.9], [62, 86, PI * 1.6], [88, 84, PI * 1.25]];
for (const [x, z, rot] of CAMP) {
  if (put(ORC_HUT(), x, z, { rotY: rot, force: true })) {
    const fx = Math.sin(rot), fz = Math.cos(rot);
    if (R() < 0.7) put(LOOT(), x + fx * 5, z + fz * 5, { rotY: R.angle() });
    if (R() < 0.5) put(BONES(), x - fz * 5, z + fx * 5, { rotY: R.angle() });
    if (R() < 0.5) put(WATCHFIRE(), x + fz * 5, z - fx * 5, {});
  }
}
put(LONGHOUSE(), 70, 60, { rotY: PI * 1.25, force: true });
put(DRUM(), 62, 74, { rotY: PI * 1.25 });
put(ORC_SMITHY(), 84, 74, { rotY: PI * 1.1, force: true });
put(IDOL(), 58, 58, { rotY: PI * 1.25, force: true });
for (const [x, z] of [[90, 90], [82, 92]]) put(R() < 0.5 ? PEN() : CAGE(), x, z, { rotY: R.angle() });
for (let i = 0; i < 5; i++) ring(LOOT(), KEEP.x, KEEP.z, 12, 22, {});
for (let i = 0; i < 5; i++) ring(TOTEM(), KEEP.x, KEEP.z, 13, 24, {});
for (let i = 0; i < 6; i++) ring(BONES(), KEEP.x, KEEP.z, 12, 24, {});
for (let i = 0; i < 4; i++) ring(P('barrel'), KEEP.x, KEEP.z, 12, 22, {});
add('chest', 66, 82, { rotY: R.angle() }); add('chest', 90, 66, { rotY: R.angle() });
m.keepOut(70, 60, 3);

// ══ The orc siege line ════════════════════════════════════════════════════
// The ram, the catapults and the spike barricades, facing the castle.
const O_LINE = { x: 30, z: 8, rot: PI * 1.25 };   // facing north-west
{
  const fx = Math.sin(O_LINE.rot), fz = Math.cos(O_LINE.rot), sx = fz, sz = -fx;
  const at = (key, f, s, r, o = {}) => put(key, O_LINE.x + fx * f + sx * s, O_LINE.z + fz * f + sz * s, { rotY: r ?? O_LINE.rot, ...o });
  at(RAM(), 4, 0, O_LINE.rot, { force: true });
  for (const s of [-16, 14]) at(CATAPULT(), -4, s, O_LINE.rot + R.range(-0.3, 0.3));
  for (const s of [-22, -12, -4, 6, 13, 22]) at(SPIKES(), 6, s, O_LINE.rot + PI / 2);
  for (const s of [-20, -7, 8, 20]) at(O_BANNER(), -6, s, R.angle());
  for (const s of [-10, 10]) at(WATCHFIRE(), -8, s, 0);
  for (const s of [-18, 0, 18]) at(SIEGE_STONE(), -12 + R.range(-3, 3), s, R.angle());
  for (let i = 0; i < 4; i++) at(BONES(), R.range(-10, 4), R.range(-22, 22), R.angle());
  at('chest', -10, -2, R.angle());
  m.keepOut(O_LINE.x, O_LINE.z, 6);
}

// ══ The field ═════════════════════════════════════════════════════════════
// The diagonal band between the two lines. Craters and wrecks in the middle,
// then the thrown-up detail: stones, ladders, shield walls, cairns, banners
// down, the two great human engines that never made it to the wall.
const FIELD = { x: 0, z: 0, r: 34 };
const inField = (x, z) => Math.abs(V(x, z)) < 30 && Math.abs(U(x, z)) < 40;
for (let i = 0; i < 14; i++) {
  const a = R.angle(), d = Math.sqrt(R()) * 30;
  const x = Math.cos(a) * d, z = Math.sin(a) * d;
  if (Math.hypot(x, z) < 8) continue;
  add(CRATER(), x, z, { rotY: R.angle(), scale: R.range(0.9, 1.5) });
  m.paintCircle(SCORCH, x, z, 5, 0.9, 0.5);
  m.decal('craterScorch', x, z, { scale: R.range(3.5, 5.5) });
}
put(SIEGE_TOWER(), -14, 6, { rotY: PI * 0.3, force: true }); m.keepOut(-14, 6, 5);
put(TREBUCHET(), 10, -22, { rotY: PI * 0.7, force: true });
put(WATCHTOWER_FALLEN(), 22, 18, { rotY: PI * 1.1, force: true });
put(RAM(), -8, 28, { rotY: PI * 0.1 });
scatter(SIEGE_STONE(), 16, FIELD, { tries: 6, density: inField });
scatter(LADDER(), 12, FIELD, { tries: 6, density: inField });
scatter(SHIELD_WALL(), 10, FIELD, { tries: 6, density: inField });
scatter(EARTHWORK(), 8, FIELD, { tries: 6, density: inField });
scatter(WRECK(), 12, FIELD, { tries: 6, density: inField });
scatter(BEAMS(), 10, FIELD, { tries: 6, density: inField });
scatter(SHIELDS(), 18, FIELD, { tries: 6, density: inField });
scatter(SWORD(), 14, FIELD, { tries: 6, density: inField });
scatter(ARROWS(), 16, FIELD, { tries: 6, density: inField });
scatter(CAIRN(), 12, FIELD, { tries: 6, density: inField });
scatter(H_BANNER(), 8, FIELD, { tries: 6, density: inField });
scatter(O_BANNER(), 8, FIELD, { tries: 6, density: inField });
scatter(BONES(), 10, FIELD, { tries: 6, density: inField });
scatter(SPIKES(), 8, FIELD, { tries: 6, density: inField });
scatter(RUBBLE(), 8, FIELD, { tries: 6, density: inField });
// The spawn: the middle of it all. Somewhere to stand, and a cairn to fight beside.
add(STATUE_FALLEN(), -5, 4, { rotY: PI * 0.4, ignoreKeepOut: true, force: true });
for (let i = 0; i < 3; i++) ring(CAIRN(), 0, 0, 6, 10, { ignoreKeepOut: true });
for (let i = 0; i < 2; i++) ring(SHIELD_WALL(), 0, 0, 7, 11, { ignoreKeepOut: true, facing: 'out' });
add('chest', 6, -6, { rotY: R.angle(), ignoreKeepOut: true });
m.keepOut(0, 0, 11);

// ══ The burnt woods (north-east) ══════════════════════════════════════════
// What was the king's forest, burnt through by the retreat. A stand of it holds
// the north-east corner, and a thinner belt runs down the eastern edge.
const woods = (x, z) => {
  if (inField(x, z)) return 0;
  if (Math.hypot(x - KEEP.x, z - KEEP.z) < PAL_R + 8) return 0;
  if (Math.hypot(x - CASTLE.x, z - CASTLE.z) < WALL_R + 8) return 0;
  const ne = Math.max(0, (x - 10) / 80) * Math.max(0, (-z - 10) / 80);
  const east = Math.max(0, (x - 70) / 26) * (z < 40 ? 1 : 0);
  return Math.max(0, Math.min(1, (ne * 2.2 + east * 0.8) * (0.55 + noise(x, z) * 0.9)));
};
const region = { x0: -94, z0: -94, x1: 94, z1: 94 };
let treesPlaced = 0;
for (let i = 0; i < 160 * 30 && treesPlaced < 160; i++) {
  const x = R.range(region.x0, region.x1), z = R.range(region.z0, region.z1);
  if (R() > woods(x, z)) continue;
  if (m.add(R() < 0.55 ? DEADTREE() : DEADPINE(), x, z, { rotY: R.angle(), pad: 0.4, scale: R.range(0.75, 1.15) * (R() < 0.55 ? 0.9 : 1) })) treesPlaced++;
}
scatter(STUMP(), 40, region, { density: woods, tries: 6 });
scatter(P('char_fallen_log_01', 'nature_fallen_log_01'), 22, region, { density: woods, tries: 6 });
scatter(P('char_shrub_01', 'char_bush_01'), 30, region, { density: (x, z) => woods(x, z) * 0.7, tries: 5 });
add('chest', 88, -88, { rotY: R.angle() });
m.paintFn(SCORCH, (x, z) => woods(x, z) * 0.9 - 0.1, 2);
// Fires still smouldering in the wood
for (let i = 0; i < 6; i++) { const x = R.range(30, 90), z = R.range(-90, -30); if (woods(x, z) > 0.4) m.fire(x, z, { r: 0.7, y: 0.4, h: 7, s: 0.5 }); }

// ══ Open ground between the districts ═════════════════════════════════════
// Sparse: this is where the waves come from. Trampled grass, the odd cairn.
const open = (x, z) => (woods(x, z) < 0.15 && !inField(x, z) && Math.hypot(x - KEEP.x, z - KEEP.z) > PAL_R + 6 && Math.hypot(x - CASTLE.x, z - CASTLE.z) > WALL_R + 6) ? 0.6 : 0;
scatter(CAIRN(), 14, region, { density: open, tries: 5 });
scatter(SIEGE_STONE(), 10, region, { density: open, tries: 5 });
scatter(WRECK(), 8, region, { density: open, tries: 5 });
scatter(P('nature_rock_cluster_02'), 16, region, { density: open, tries: 5 });
scatter(P('nature_rock_small_02'), 20, region, { density: open, tries: 5 });
scatter(DEADTREE(), 14, region, { density: (x, z) => open(x, z) * 0.5, tries: 5 });

// ══ Splat ═════════════════════════════════════════════════════════════════
// base churnedMud; 0 scorchedEarth (fires, craters, the woods), 1 battleGrass
// (what survived away from the field), 2 rubbleGround (the castle precinct and
// the road), 3 ironMud (the field itself, churned and stained)
const GRASS = 1, RUB = 2, IRON = 3;
m.paintRoads(RUB, IRON);
m.paintUnderObstacles(IRON, 3.0, 0.4);
m.paintFn(GRASS, (x, z) => {
  if (inField(x, z)) return 0;
  const d = Math.min(Math.hypot(x, z) / 60, 1);
  return (0.25 + d * 0.7) * (0.6 + noise(x, z) * 0.6) - woods(x, z) * 0.8;
}, 2);
// Rust mud is an accent in the worst-fought ground, not the field's floor: at full
// strength the whole middle of the map read as red cobbles from the air.
m.paintFn(IRON, (x, z) => (inField(x, z) ? (churn(x, z) - 0.45) * 1.1 : (churn(x, z) - 0.7) * 0.8), 2);
m.paintCircle(IRON, 0, 0, 14, 0.35, 0.7);
// Scorched patches through the field as well, so the ground carries the burning
m.paintFn(SCORCH, (x, z) => (inField(x, z) ? (noise(x, z) - 0.55) * 1.2 : 0), 2);
m.paintCircle(RUB, KEEP.x, KEEP.z, PAL_R + 6, 0.5, 0.7);
m.paintCircle(SCORCH, KEEP.x, KEEP.z, PAL_R + 2, 0.45, 0.7);
for (let z = -66; z <= -16; z += 6) for (let x = -66; x <= -16; x += 6)
  m.paintCircle(RUB, x + R.range(-3, 3), z + R.range(-3, 3), R.range(6, 10), R.range(0.3, 0.6), 0.85);
m.suppress(GRASS, SCORCH); m.suppress(GRASS, RUB); m.suppress(IRON, RUB, 0.8); m.suppress(GRASS, IRON, 0.7);

// ══ Decals ════════════════════════════════════════════════════════════════
const fieldD = (x, z) => (inField(x, z) ? 1 : 0.15);
m.scatterDecals('bootChurn', 90, region, { density: (x, z) => fieldD(x, z) * 0.9, scale: [2.4, 4.2], ignoreKeepOut: true });
m.scatterDecals('hoofPrints', 50, region, { density: (x, z) => fieldD(x, z) * 0.7, scale: [2, 3.6], ignoreKeepOut: true });
m.scatterDecals('arrowStorm', 60, region, { density: (x, z) => fieldD(x, z) * 0.8 + (Math.hypot(x - CASTLE.x, z - CASTLE.z) < WALL_R + 12 ? 0.6 : 0), scale: [2.2, 3.8], ignoreKeepOut: true });
m.scatterDecals('shieldScatter', 55, region, { density: (x, z) => fieldD(x, z) * 0.8, scale: [2.4, 4], ignoreKeepOut: true });
m.scatterDecals('warStain', 70, region, { density: (x, z) => fieldD(x, z) * 0.9, scale: [1.8, 3.2], ignoreKeepOut: true });
m.scatterDecals('scorch', 80, region, { density: (x, z) => 0.3 + woods(x, z) * 0.7 + fieldD(x, z) * 0.3, scale: [2, 3.6], ignoreKeepOut: true });
m.scatterDecals('charredBeams', 40, region, { density: (x, z) => (Math.hypot(x - SQUARE.x, z - SQUARE.z) < 30 ? 0.9 : 0) + woods(x, z) * 0.4, scale: [2.4, 4], ignoreKeepOut: true });
m.scatterDecals('rubbleSpill', 30, { x: CASTLE.x, z: CASTLE.z, r: WALL_R + 10 }, { scale: [2.6, 4.4], ignoreKeepOut: true });
m.scatterDecals('rubble', 20, { x: CASTLE.x, z: CASTLE.z, r: WALL_R + 8 }, { scale: [2.2, 3.6], ignoreKeepOut: true });
m.scatterDecals('rubble', 14, { x: KEEP.x, z: KEEP.z, r: PAL_R + 6 }, { scale: [2.2, 3.6], ignoreKeepOut: true });
m.scatterDecals('bones', 34, region, { density: (x, z) => fieldD(x, z) * 0.5 + (Math.hypot(x - KEEP.x, z - KEEP.z) < PAL_R + 4 ? 0.7 : 0), scale: [1.8, 3], ignoreKeepOut: true });
m.scatterDecals('ashDrift', 30, region, { density: (x, z) => woods(x, z) * 0.8, scale: [1.8, 3] });
m.scatterDecals('cracks', 30, region, { density: (x, z) => 0.4 - fieldD(x, z) * 0.2, scale: [3, 5] });
m.scatterDecals('hayScatter', 12, { x: -66, z: 20, r: 26 }, { scale: [2, 3.4] });
for (const f of m.fires) if (R() < 0.5) m.decal('scorch', f.x + R.range(-2, 2), f.z + R.range(-2, 2), { scale: R.range(2.4, 4) });

// ══ Tufts ═════════════════════════════════════════════════════════════════
// trampled / ash / cinder / dry (MAPS.bloodmarch.terrain.tufts). Thin on the
// field, thick out where the grass survived.
m.scatterTufts(4200, region, {
  density: (x, z) => (inField(x, z) ? 0.35 : 0.8) - woods(x, z) * 0.3,
  bareChannels: [RUB, SCORCH], tries: 6, scale: [0.5, 1.05], variants: 4,
});

// ══ Smoke haze ════════════════════════════════════════════════════════════
// Grey shaft planes over the burning districts, so the smoke has a body even
// where no particle is in frame.
for (const f of m.fires) if (f.h >= 9 && R() < 0.5) m.shaft(f.x + R.range(-2, 2), f.z + R.range(-2, 2), { w: 6 + f.r * 2, h: 14 + f.h, rotY: R.range(0.2, 1.1) });

const json = m.toJSON();
writeFileSync(OUT, JSON.stringify(json, null, 1).replace(/\n\s*("?\w+"?): /g, ' $1: ').replace(/\{\s+/g, '{ ').replace(/\s+\}/g, ' }'));
await m.writeSplat(OUT.replace(/\.json$/, '.splat.png'));
console.log(`${OUT}: ${json.objects.length} objects, ${m.obstacles.length} obstacles, ${json.fires.length} fires, ${json.decals.length} decals, ${json.tufts.length} tufts, ${json.shafts.length} smoke planes`);
console.log(m.summary());
console.log(m.missingSummary());

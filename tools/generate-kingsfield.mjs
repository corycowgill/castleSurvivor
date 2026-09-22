/**
 * Kingsfield map generator → map.json
 *
 * Layout (north is -z):
 *   - Castle district north: keep behind a curtain wall with a gate, courtyard shrine and racks
 *   - Town plaza at the crossroads (spawn): well, statue, market, benches, lanterns
 *   - Village along both roads: houses, tavern, apothecary, blacksmith yard, stable, all with clutter
 *   - Farms east and west: fenced corn / pumpkin fields, scarecrows, hay, carts, horses, a stream
 *   - Woods south and in the corners, thicker toward the edges
 *   - Ogre keeps in the four corners, fortified with barricades and racks
 *
 * Usage: node tools/generate-kingsfield.mjs [--seed N] [--out map.json]
 */
import { writeFileSync } from 'node:fs';
import { MapBuilder, makeNoise, TAU, ASSET } from './maplib.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEED = +opt('--seed', 2026);
const OUT = opt('--out', 'map.json');

const m = new MapBuilder({ worldSize: 100, spawnX: 0, spawnZ: 0, enemySpawnDistance: 50, seed: SEED });
const R = m.rnd;
const noise = makeNoise(R, 20);
const PI = Math.PI;

// ── Ground ─────────────────────────────────────────────────────────────
for (let gx = -96; gx <= 96; gx += 8) for (let gz = -96; gz <= 96; gz += 8) m.tile('grass', gx, gz);

// ── Roads: a crossroads with lanes out to the farms ────────────────────
for (let z = -18; z <= 66; z += 6) m.tile('road', 0, z);            // gate → south woods
for (let x = -84; x <= 66; x += 6) if (x !== 0) m.tile('road', x, 0); // east–west high street, fords the stream west
for (let x = 6; x <= 42; x += 6) m.tile('road', x, 30);              // lane to the east farm
for (let z = 6; z <= 24; z += 6) m.tile('road', 42, z);
for (let x = -6; x >= -42; x -= 6) m.tile('road', x, -30);           // lane to the west mill road
for (let z = -6; z >= -24; z -= 6) m.tile('road', -42, z);
m.keepOut(0, 0, 9);                                                  // spawn

// ── Stream: down the west side, the high street fords it ───────────────
const streamX = (z) => -78 + Math.sin(z * 0.055) * 5 + Math.cos(z * 0.021) * 3;
for (let z = -96; z <= 96; z += 5.5) {
  if (Math.abs(z) < 4) continue;                       // ford under the road
  m.tile('stream', streamX(z), z, Math.atan2(streamX(z + 1) - streamX(z - 1), 2));
}
m.streamCurve(streamX, -98, 98, { fords: [0] });
const nearStream = (x, z) => Math.abs(x - streamX(z)) < 5;
m.blockers.push((x, z, r) => Math.abs(x - streamX(z)) < 3.2 + r);

// ── Castle district (north) ────────────────────────────────────────────
m.add('humanCastle', 0, -38, { rotY: 0, force: true });
m.keepOut(0, -38, 13);
// Curtain wall at z = -20 with a gate over the road and a breach at each flank
// (the bot playtest showed a continuous 90-unit wall pins a kiting player against
// the horde; the breaches keep the wall readable without making it a trap), then
// it turns north at both ends
for (let x = -45; x <= 45; x += 5) { if (Math.abs(x) < 6 || Math.abs(Math.abs(x) - 27.5) <= 4) continue; m.add('wall', x, -20, { rotY: 0, force: true }); }
for (const bx of [-27.5, 27.5]) { m.add('boulder', bx - 3, -21, { rotY: R.angle(), scale: 2.6, force: true }); m.add('prop_wood_crate_broken_01', bx + 2.5, -19, { rotY: R.angle(), force: true }); }
for (let z = -25; z >= -55; z -= 5) { m.add('wall', -45, z, { rotY: PI / 2, force: true }); m.add('wall', 45, z, { rotY: PI / 2, force: true }); }
// Gatehouse dressing: lanterns, barricades, guard racks
m.add('village_lantern_post_01', -7.5, -16, { force: true }); m.add('village_lantern_post_01', 7.5, -16, { force: true });
m.add('combat_barricade_01', -11, -15, { rotY: 0.3 }); m.add('combat_barricade_01', 11, -15, { rotY: -0.3 });
m.add('village_weapon_rack_01', -9, -23.5, { rotY: PI }); m.add('village_weapon_rack_01', 9, -23.5, { rotY: PI });
// Courtyard: a shrine, statues, training clutter, the castle's own stores
m.add('swordShrine', 0, -24, { rotY: PI, ignoreRoads: true, ignoreKeepOut: true });
m.add('townStatue', -16, -25, { rotY: PI * 0.5 }); m.add('townStatue', 16, -25, { rotY: -PI * 0.5 });
for (const x of [-30, 30]) {
  m.add('village_weapon_rack_01', x, -24, { rotY: PI });
  m.add('combat_barricade_01', x - 5, -28, { rotY: R.angle() }); m.add('combat_barricade_01', x + 5, -28, { rotY: R.angle() });
  m.add('prop_wood_crate_large_01', x + 2, -33, { rotY: R.angle() }); m.add('prop_wood_crate_small_01', x + 4, -35, { rotY: R.angle() });
  m.add('barrel', x - 3, -36, { rotY: R.angle() }); m.add('barrel', x - 5, -34, { rotY: R.angle() });
  m.add('prop_grain_sack_stack_01', x, -40, { rotY: R.angle() });
  m.add('village_lantern_post_01', x, -45, {});
}
m.add('horseCart', -22, -44, { rotY: PI * 0.4 }); m.add('horse', -25, -48, { rotY: PI * 0.4 });
m.add('village_hitching_post_01', 22, -45, { rotY: 0 }); m.add('horse', 24, -49, { rotY: PI * 0.9 });
m.add('village_water_trough_01', 27, -46, { rotY: PI / 2 });
// Behind the castle: dark pines right up to the north edge
m.scatter('pineTree', 70, { x0: -92, z0: -92, x1: 92, z1: -58 }, { density: (x, z) => z < -62 ? 0.8 : 0.35, minSpacing: 1.5, scale: undefined });

// ── Town plaza around the crossroads ───────────────────────────────────
m.add('village_water_well_01', -9, -9, { rotY: 0 });
m.add('prop_bench_wood_01', -13, -6, { rotY: PI / 2 }); m.add('prop_bench_wood_01', -6, -13, { rotY: 0 });
m.add('prop_bucket_wood_01', -7.5, -11.5, {}); m.add('village_lantern_post_01', -14, -14, {});
m.add('townStatue', 9, -9, { rotY: PI * 1.25 });
m.add('prop_bench_wood_01', 13, -6, { rotY: -PI / 2 }); m.add('prop_bench_wood_01', 6, -13, { rotY: 0 });
m.add('village_lantern_post_01', 14, -14, {});
// Market corner (south-east): stalls, sacks, crates, pottery, a signpost at the road
m.add('village_market_stall_01', 9, 10, { rotY: PI * 1.25 });
m.add('village_market_stall_01', 15, 7, { rotY: PI });
m.add('village_market_stall_01', 7, 16, { rotY: -PI / 2 });
m.add('prop_grain_sack_stack_01', 12, 12.5, { rotY: R.angle() }); m.add('prop_grain_sack_01', 14, 14, { rotY: R.angle() });
m.add('prop_wood_crate_small_01', 10.5, 14.5, { rotY: R.angle() }); m.add('prop_pottery_01', 16.5, 10.5, {}); m.add('prop_water_jug_01', 17.2, 12, {});
m.add('village_signpost_01', 6, 6, { rotY: PI * 0.25 }); m.add('village_lantern_post_01', 14, 18, {});
// Traders' corner (south-west): cart, wheel, hitching post, trough, barrels
m.add('village_hitching_post_01', -9, 8, { rotY: 0 }); m.add('village_water_trough_01', -13, 7, { rotY: 0 });
m.add('horse', -9.5, 12, { rotY: PI * 0.1 });
m.add('horseCart', -14, 13, { rotY: PI * 0.55 }); m.add('prop_cart_wheel_01', -17.5, 10, { rotY: R.angle() });
m.add('barrel', -7, 15, { rotY: R.angle() }); m.add('barrel', -9, 16.5, { rotY: R.angle() }); m.add('prop_wood_crate_large_01', -12, 17.5, { rotY: R.angle() });
m.add('village_lantern_post_01', -14, 18, {});
// Lantern posts along the high street and the south road
for (let x = -60; x <= 60; x += 20) if (x !== 0) m.add('village_lantern_post_01', x, x < 0 ? -5 : 5, {});
for (let z = 26; z <= 62; z += 18) m.add('village_lantern_post_01', z % 36 === 26 ? -5 : 5, z, {});

// ── Village buildings along the roads ──────────────────────────────────
const yard = (x, z, kind, rot) => {
  // Clutter in front / beside a house. `rot` is the house's facing (toward its road).
  const fx = Math.sin(rot), fz = Math.cos(rot);          // forward vector of a rotY yaw
  const sx = fz, sz = -fx;                                // sideways
  const at = (f, s) => [x + fx * f + sx * s, z + fz * f + sz * s];
  const put = (key, f, s, r) => { const [px, pz] = at(f, s); return m.add(key, px, pz, { rotY: r ?? R.angle() }); };
  if (kind === 'house') {
    const picks = R.pick([['barrel', 'prop_bucket_wood_01'], ['prop_wood_crate_small_01', 'prop_pottery_01'], ['prop_grain_sack_01', 'prop_water_jug_01'], ['prop_hay_bale_01', 'barrel'], ['prop_bench_wood_01', 'prop_pottery_01']]);
    put(picks[0], 4.2, 3.2); put(picks[1], 4.4, -3.4);
    if (R() < 0.5) put('prop_stool_wood_01', 5.2, 1.5);
    if (R() < 0.45) put('prop_firewood_stack_02', -1.5, 5.4, rot + PI / 2); else if (R() < 0.3) put('prop_tree_stump_02', -3, 5.5);
    if (R() < 0.4) put('village_fence_straight_01', 0, 5.2, rot + PI / 2);
    if (R() < 0.4) put('village_fence_straight_01', 0, -5.2, rot + PI / 2);
    if (R() < 0.5) put('shrubbery', -4.5, R.range(-3, 3));
  } else if (kind === 'tavern') {
    put('prop_table_wood_01', 5.5, 3, rot); put('prop_stool_wood_01', 5.5, 4.4); put('prop_stool_wood_01', 6.8, 3);
    put('prop_table_wood_01', 5.5, -3, rot); put('prop_stool_wood_01', 5.5, -4.4); put('prop_bench_wood_01', 7, -3, rot + PI / 2); put('prop_firewood_stack_02', -2.5, 6.2, rot + PI / 2);
    put('barrel', 1, 5.5); put('barrel', -1, 6); put('barrel', 2.5, 6.4); put('prop_wood_crate_large_01', -1, -5.8);
    put('village_lantern_post_01', 6, 0.2, 0); put('village_hitching_post_01', 6.5, -7, rot);
  } else if (kind === 'apothecary') {
    put('prop_pottery_01', 4.5, 2.5); put('prop_water_jug_01', 4.4, 3.4); put('prop_pottery_01', 4.6, -2.8);
    put('prop_table_wood_01', 5.6, -1, rot); put('prop_bench_wood_01', 5.4, 3.5, rot + PI / 2);
    put('nature_flowers_02', 3.8, 5); put('nature_flowers_02', 3.9, -5); put('nature_fern_01', -4.6, 3); put('shrubbery', -4.7, -3);
  } else if (kind === 'blacksmith') {
    put('blacksmith_forge_01', 5.6, -2.8, rot + PI); put('blacksmith_anvil_01', 5.8, 0.4, rot + PI / 2);
    put('blacksmith_water_barrel_01', 5.2, 2.6); put('blacksmith_coal_pile_01', 7.4, -3.4); put('blacksmith_tool_rack_01', 1.5, 5.6, rot + PI / 2);
    put('blacksmith_weapon_rack_01', 1.5, -5.6, rot - PI / 2); put('prop_bucket_metal_01', 6.8, 1.8); put('prop_firewood_stack_02', -1.5, 6, rot + PI / 2);
    put('village_hitching_post_01', 8.5, 4, rot); put('prop_cart_wheel_01', -2.5, -6.2);
  } else if (kind === 'stable') {
    put('village_hitching_post_01', 6.2, -3, rot); put('village_hitching_post_01', 6.2, 3, rot);
    put('horse', 8.3, -3, rot + PI); put('horse', 8.3, 3.2, rot + PI + 0.3);
    put('village_water_trough_01', 5.8, 0, rot + PI / 2); put('hayBales', -1, 6.2); put('prop_hay_bale_01', 2.2, 6.3); put('prop_hay_bale_01', -3, 6.1);
    put('horseCart', -2, -7, rot + PI / 2); put('prop_wheelbarrow_01', 4.5, -6.2); put('prop_bucket_wood_01', 7, 1.6);
    put('village_fence_straight_01', -5, 4, rot + PI / 2); put('village_fence_corner_01', -5, 7, rot);
  }
};
const building = (key, x, z, rot, kind) => {
  if (!m.add(key, x, z, { rotY: rot })) { console.warn('could not place', key, x, z); return; }
  yard(x, z, kind, rot);
};
// North side of the high street (between plaza and the wall) — the well-to-do row
building('tavern', -22, -11, PI, 'tavern');             // faces south onto the road
building('apothecary', -34, -11, PI, 'apothecary');
building('house', -54, -10, PI, 'house');
building('tavern2', 24, -11, PI, 'tavern');
building('blacksmith', 40, -12, PI, 'blacksmith');
building('house', 56, -10, PI, 'house');
// South side of the high street
building('house', -24, 12, 0, 'house');
building('house', -37, 12, 0, 'house');
building('horseStable', -52, 13, 0, 'stable');
m.add('village_rail_fence_straight_01', -62, 9, { rotY: 0.2 }); m.add('horse', -62, 9, { rotY: 1.2, force: true });
building('house', 24, 12, 0, 'house');
building('house', 35, 12, 0, 'house');
building('house', 55, 11, 0, 'house');
// Down the south road toward the woods
building('house', -12, 26, PI / 2, 'house');           // faces east onto the road
building('house', -12, 40, PI / 2, 'house');
building('house', 12, 42, -PI / 2, 'house');
building('farmHouse', -13, 56, PI / 2, 'house');
// Outside the wall: a ditch-line of boulders (placed after the north row so houses win) and a couple of shrubs, guard stations by the corners
for (let x = -40; x <= 40; x += 8) if (Math.abs(x) > 12 && R() < 0.6) m.add('boulder', x + R.range(-2, 2), -13 + R.range(-1, 1), { rotY: R.angle(), scale: R.range(2.5, 3.5) });
for (let x = -44; x <= 44; x += 6) if (Math.abs(x) > 14) m.add('shrubbery', x, -11 + R.range(-1, 1), { rotY: R.angle(), scale: R.range(3, 4) });
// Village greenery: a few oaks and shrubs between the houses
for (const [x, z] of [[-30, 20], [-46, -2], [48, 22], [-20, 48], [20, 56], [-30, -3]]) m.add(R() < 0.5 ? 'oakTree' : 'nature_oak_large_01', x, z, { rotY: R.angle(), scale: R.range(8, 11) });
m.scatter('shrubbery', 30, { x0: -60, z0: -16, x1: 60, z1: 60 }, { tries: 4, scale: undefined });
m.scatter('nature_flowers_02', 24, { x0: -60, z0: -16, x1: 60, z1: 60 }, { tries: 4 });

// ── Farms ──────────────────────────────────────────────────────────────
const fields = [];
const field = (key, x0, z0, x1, z1, gate, step) => {
  // Crops on a grid inside a fence
  for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) m.add(key, x, z, { rotY: R.cardinal(), force: true });
  m.fence(x0, z0, x1, z1, { gateSide: gate });
  m.keepOutRect(x0 - 1, z0 - 1, x1 + 1, z1 + 1);
  fields.push([x0, z0, x1, z1]);
};
// East farm: corn, off the lane at z = 30
building('farmHouse', 52, 38, -PI / 2, 'house');
field('cornTile', 56, 42, 80, 60, 'west', 6);
field('pumpkinPatch', 50, 8, 68, 22, 'south', 5);
m.add('farm_scarecrow_01', 68, 37, { rotY: PI * 0.2 }); m.add('farm_scarecrow_01', 59, 26, { rotY: -PI * 0.3 });
m.add('hayBales', 49, 47, { rotY: R.angle() }); m.add('prop_hay_bale_01', 46, 45, { rotY: R.angle() }); m.add('prop_hay_bale_01', 47.5, 49.5, { rotY: R.angle() });
m.add('prop_wheelbarrow_01', 53, 45, { rotY: PI * 0.7 }); m.add('horseCart', 58, 34, { rotY: PI * 0.5 }); m.add('horse', 63, 31, { rotY: PI * 0.8 });
m.add('village_water_trough_01', 47, 36, { rotY: 0 }); m.add('village_hitching_post_01', 47, 32, { rotY: 0 });
m.add('prop_grain_sack_stack_01', 55, 33, { rotY: R.angle() }); m.add('prop_grain_sack_01', 57, 31.5, { rotY: R.angle() });
m.add('village_fence_straight_01', 46, 41, { rotY: PI / 2 }); m.add('village_fence_straight_01', 46, 43.6, { rotY: PI / 2 }); m.add('village_fence_broken_01', 46, 46.2, { rotY: PI / 2 });
// West farm: pumpkins and corn across the stream, a mill-road farmstead
building('farmHouse', -50, 30, PI / 2, 'house');
field('pumpkinPatch', -68, 36, -50, 52, 'north', 5);
field('cornTile', -70, 8, -52, 24, 'south', 6);
m.add('farm_scarecrow_01', -60, 30, { rotY: PI * 0.6 }); m.add('farm_scarecrow_01', -58, 56, { rotY: R.angle() });
m.add('hayBales', -44, 40, { rotY: R.angle() }); m.add('prop_hay_bale_01', -46, 44, { rotY: R.angle() }); m.add('prop_hay_bale_01', -42, 44, { rotY: R.angle() });
m.add('horseCart', -44, 24, { rotY: PI * 0.3 }); m.add('horse', -42, 34, { rotY: PI * 0.2 }); m.add('horse', -72, 30, { rotY: PI * 0.9 });
m.add('prop_wheelbarrow_01', -46, 36, { rotY: R.angle() }); m.add('village_water_trough_01', -74, 28, { rotY: PI / 2 });
m.add('prop_grain_sack_stack_01', -55, 28, { rotY: R.angle() }); m.add('prop_wood_crate_large_01', -56, 31.5, { rotY: R.angle() });
m.add('village_water_well_01', -74, 4, {});
// Ford dressing where the high street crosses the stream
m.add('village_signpost_01', -70, -6, { rotY: PI * 0.5 }); m.add('village_lantern_post_01', -84, 6, {});
m.add('village_signpost_01', -38, -26, { rotY: PI * 0.75 });
// The mill road ends at a woodcutter's yard by the stream
building('farmHouse', -52, -41, PI / 2, 'house');
m.add('prop_logs_02', -54, -30, { rotY: 0.2 }); m.add('prop_logs_02', -53, -27, { rotY: 1.8 }); m.add('prop_tree_stump_02', -57, -33, { rotY: R.angle() }); m.add('prop_firewood_stack_02', -47, -47, { rotY: PI / 2 });
m.add('prop_wood_crate_large_01', -46, -42, { rotY: R.angle() }); m.add('prop_wood_crate_small_01', -44, -44, { rotY: R.angle() });
m.add('horseCart', -44, -32, { rotY: PI * 0.5 }); m.add('village_lantern_post_01', -46, -27, {});
m.add('village_fence_straight_01', -56, -40, { rotY: PI / 2 }); m.add('village_fence_straight_01', -56, -42.6, { rotY: PI / 2 }); m.add('village_fence_corner_01', -56, -45.2, { rotY: 0 });
// South-east small holding past the woods' edge
building('farmHouse', 30, 62, 0, 'house');
field('pumpkinPatch', 22, 68, 42, 80, 'north', 5);
m.add('farm_scarecrow_01', 44, 66, { rotY: R.angle() }); m.add('hayBales', 20, 60, { rotY: R.angle() }); m.add('prop_hay_bale_01', 17, 62, { rotY: R.angle() });
m.add('horse', 40, 60, { rotY: R.angle() }); m.add('village_hitching_post_01', 42, 58, { rotY: 0 });
// Farm greenery: oaks by the farmhouses, wildflowers, rocks along the stream
for (const [x, z] of [[62, 66], [84, 30], [-62, 60], [-46, 54], [-60, -4], [50, 70], [-90, 40], [-92, -50]]) m.add(R() < 0.5 ? 'oakTree' : 'nature_oak_large_01', x, z, { rotY: R.angle(), scale: R.range(8, 11) });
m.scatter('nature_flowers_02', 30, { x0: 44, z0: 4, x1: 92, z1: 66 }, { tries: 4 });
m.scatter('nature_flowers_02', 30, { x0: -92, z0: 4, x1: -44, z1: 66 }, { tries: 4 });
m.scatter('shrubbery', 20, { x0: 44, z0: 4, x1: 92, z1: 66 }, { tries: 4 });
m.scatter('shrubbery', 20, { x0: -92, z0: 4, x1: -44, z1: 66 }, { tries: 4 });
for (let z = -90; z <= 90; z += 7) {
  const side = R() < 0.5 ? -1 : 1, x = streamX(z) + side * R.range(5.5, 8);
  const roll = R();
  if (roll < 0.35) m.add('nature_rock_small_02', x, z, { rotY: R.angle() });
  else if (roll < 0.55) m.add('nature_rock_cluster_02', x, z, { rotY: R.angle() });
  else if (roll < 0.7) m.add('boulder', x, z, { rotY: R.angle(), scale: R.range(2.5, 3.5) });
  else if (roll < 0.85) m.add('nature_fern_01', x, z, { rotY: R.angle() });
  else m.add('shrubbery', x, z, { rotY: R.angle(), scale: R.range(3, 4) });
}

// ── Landmarks (Trellis batch 7; each is skipped if its mesh is not registered) ──
// Fountain on the square between the spawn and the gate; the road forks around it
m.landmark('landmark_village_fountain', 0, -12.5, { rotY: 0, keepOut: 3.5 });
// Windmill on the rise behind the east farm
m.landmark('landmark_windmill', 82, 30, { rotY: -PI * 0.6, keepOut: 7 });
m.add('prop_grain_sack_stack_01', 76, 34, { rotY: R.angle() }); m.add('prop_grain_sack_01', 78, 25, { rotY: R.angle() }); m.add('horseCart', 74, 26, { rotY: PI * 0.3 });
// Ruined tower in the north-west woods, watching the mill road
m.landmark('landmark_ruined_tower', -64, -62, { rotY: PI * 0.25, keepOut: 6 });
for (let i = 0; i < 4; i++) m.ring('nature_rock_cluster_02', -64, -62, 6, 9, {});
// Destroyed watchtower past the south-east holding, ogre work
m.landmark('landmark_destroyed_watchtower', 62, 76, { rotY: PI * 0.8, keepOut: 5 });
for (let i = 0; i < 3; i++) m.ring('combat_barricade_01', 62, 76, 7, 10, { facing: 'out' });
// Graveyard in the south woods: gate, rail fence, dead trees, markers
if (m.landmark('landmark_graveyard_gate', -40, 62, { rotY: 0, keepOut: 3 })) {
  m.fence(-50, 62, -30, 78, { gateSide: 'north', set: 'rail' });
  m.keepOutRect(-51, 61, -29, 79);
  for (const [gx, gz] of [[-47, 67], [-43, 67], [-37, 67], [-33, 67], [-47, 72], [-43, 72], [-37, 72], [-33, 72], [-45, 76], [-35, 76]]) m.add('nature_rock_small_02', gx, gz, { rotY: 0, force: true, scale: 1.4 });
  m.add('nature_dead_tree_03', -40, 70, { rotY: R.angle(), force: true, scale: 7.5 });
  m.add('nature_dead_tree_03', -31, 75, { rotY: R.angle(), force: true, scale: 6 });
}
// Ancient oak on the village green
m.landmark('landmark_ancient_oak', 30, 22, { rotY: R.angle(), keepOut: 5 });

// ── Ogre keeps in the corners ──────────────────────────────────────────
for (const [cx, cz] of [[-80, -80], [80, -80], [-80, 80], [80, 80]]) {
  const toCenter = Math.atan2(-cx, -cz);
  m.add('ogreCastle', cx, cz, { rotY: toCenter, force: true });
  m.keepOut(cx, cz, 9);
  // A barricade arc facing the village, weapon racks and a boulder ring
  for (let i = -2; i <= 2; i++) {
    const a = toCenter + i * 0.32, d = 16;
    m.add('combat_barricade_01', cx + Math.sin(a) * d, cz + Math.cos(a) * d, { rotY: a });
  }
  m.add('village_weapon_rack_01', cx + Math.sin(toCenter + 0.9) * 11, cz + Math.cos(toCenter + 0.9) * 11, { rotY: toCenter });
  if (cz > 0 && ASSET.landmark_enemy_totem) m.landmark('landmark_enemy_totem', cx + Math.sin(toCenter - 0.9) * 11, cz + Math.cos(toCenter - 0.9) * 11, { rotY: toCenter, keepOut: 2.5 });
  else m.add('village_weapon_rack_01', cx + Math.sin(toCenter - 0.9) * 11, cz + Math.cos(toCenter - 0.9) * 11, { rotY: toCenter });
  for (let i = 0; i < 6; i++) m.ring('boulder', cx, cz, 10, 15, { scale: R.range(3, 4.5) });
  for (let i = 0; i < 3; i++) m.ring('nature_rock_cluster_02', cx, cz, 9, 17, {});
  for (let i = 0; i < 4; i++) m.ring('barrel', cx, cz, 9, 13, {});
  m.ring('prop_wood_crate_broken_01', cx, cz, 9, 13, {});
  m.ring('chest', cx, cz, 8, 10, {});
}

// ── Woods: south belt, corner thickets, thin copses elsewhere ──────────
const woodDensity = (x, z) => {
  if (nearStream(x, z)) return 0;
  const n = noise(x, z);
  let d = 0;
  if (z > 62) d = 0.75;                                   // south belt
  if (z > 84 || Math.abs(x) > 84) d = Math.max(d, 0.8);   // map rim
  const cornerDist = Math.min(Math.hypot(Math.abs(x) - 80, Math.abs(z) - 80));
  if (cornerDist < 30 && cornerDist > 18) d = Math.max(d, 0.7);
  if (z > 20 && z < 62 && Math.abs(x) > 60) d = Math.max(d, 0.3); // farm hedgerows
  return Math.max(0, Math.min(1, d * (0.55 + n * 0.9)));
};
const woodRegion = { x0: -94, z0: -94, x1: 94, z1: 94 };
m.scatter('pineTree', 190, woodRegion, { density: woodDensity, tries: 12, minSpacing: 1.6 });
m.scatter('oakTree', 12, woodRegion, { density: (x, z) => woodDensity(x, z) * 0.6, tries: 12, minSpacing: 1 });
m.scatter('nature_oak_large_01', 12, woodRegion, { density: (x, z) => woodDensity(x, z) * 0.6, tries: 12, minSpacing: 1 });
// Pines get a little size variation
for (const o of m.objects) if (o.key === 'pineTree') { const s = 5.5 + R() * 3; o.scale = +s.toFixed(1); }
// Forest floor
m.scatter('nature_fern_01', 60, woodRegion, { density: (x, z) => woodDensity(x, z) + 0.05, tries: 6 });
m.scatter('nature_flowers_02', 30, woodRegion, { density: (x, z) => woodDensity(x, z) * 0.8, tries: 6 });
m.scatter('shrubbery', 40, woodRegion, { density: (x, z) => woodDensity(x, z) + 0.05, tries: 6 });
m.scatter('nature_fallen_log_01', 18, woodRegion, { density: woodDensity, tries: 8 });
m.scatter('nature_rock_cluster_02', 14, woodRegion, { density: (x, z) => woodDensity(x, z) * 0.8, tries: 8 });
m.scatter('nature_rock_small_02', 16, woodRegion, { density: (x, z) => woodDensity(x, z) * 0.8, tries: 8 });
m.scatter('boulder', 14, woodRegion, { density: (x, z) => woodDensity(x, z) * 0.7, tries: 8 });
for (const o of m.objects) if (o.key === 'shrubbery' && o.scale === 4) o.scale = +(3 + R() * 1.5).toFixed(1);
// Woodcutting: stumps, log stacks and firewood where trees were felled; dead trees near the keeps
m.scatter('prop_tree_stump_02', 22, woodRegion, { density: (x, z) => woodDensity(x, z) * 0.8, tries: 8 });
m.scatter('prop_logs_02', 8, woodRegion, { density: (x, z) => woodDensity(x, z) * 0.6, tries: 8 });
for (const [cx, cz] of [[-80, -80], [80, -80], [-80, 80], [80, 80]]) for (let i = 0; i < 3; i++) m.ring('nature_dead_tree_03', cx, cz, 18, 28, { scale: R.range(6.5, 8.5) });
m.scatter('nature_dead_tree_03', 6, woodRegion, { density: (x, z) => woodDensity(x, z) * 0.5, tries: 8 });
// A hunter's cache and a ruined cart deep in the south woods
m.add('chest', 0, 90, { rotY: R.angle() }); m.add('chest', -70, 88, { rotY: R.angle() }); m.add('chest', 88, -20, { rotY: R.angle() });
m.add('horseCart', -8, 78, { rotY: PI * 0.7 }); m.add('prop_cart_wheel_01', -12, 80, { rotY: R.angle() }); m.add('prop_wood_crate_broken_01', -5, 81, { rotY: R.angle() });
// Loose barrels along the roads for the player to break
for (let x = -60; x <= 60; x += 12) if (x !== 0 && R() < 0.7) m.add('barrel', x + R.range(-2, 2), (R() < 0.5 ? -1 : 1) * R.range(4.5, 6), { rotY: R.angle() });
for (let z = 8; z <= 62; z += 10) if (R() < 0.7) m.add('barrel', (R() < 0.5 ? -1 : 1) * R.range(4.5, 6), z + R.range(-2, 2), { rotY: R.angle() });

// ── Ground paint: R dirt, G leaf litter, B mud, A cobble (see MAPS.kingsfield.terrain)
const DIRT = 0, LITTER = 1, MUD = 2, COBBLE = 3;
m.paintRoads(COBBLE, DIRT);
m.paintCircle(COBBLE, 0, 0, 16, 0.85, 0.4);                       // plaza
m.paintRect(COBBLE, -13, -28, 13, -19, 0.8, 2.5);                 // castle forecourt
m.paintRect(COBBLE, -8, -50, 8, -28, 0.6, 3);                     // keep approach
m.paintUnderObstacles(DIRT, 2.0, 0.85);                           // yards around buildings and big props
for (const f of fields) m.paintRect(DIRT, f[0], f[1], f[2], f[3], 0.9, 2);
for (const [cx, cz] of [[-80, -80], [80, -80], [-80, 80], [80, 80]]) m.paintCircle(DIRT, cx, cz, 20, 0.55, 0.6);
for (let z = -96; z <= 96; z += 1.5) m.paintCircle(MUD, streamX(z), z, 5.2, 0.9, 0.55);
m.paintFn(LITTER, (x, z) => woodDensity(x, z) * 0.95 - 0.25, 2);
m.paintFn(DIRT, (x, z) => { const d = Math.hypot(x, z); return d < 22 ? 0 : (noise(x * 1.7, z * 1.7) - 0.62) * 1.2; }, 2); // worn patches in the meadows
m.suppress(DIRT, COBBLE, 0.75); m.suppress(LITTER, DIRT); m.suppress(LITTER, MUD); m.suppress(LITTER, COBBLE);

// ── Decals ─────────────────────────────────────────────────────────────
m.scatterDecals('cobblePatch', 16, { x: 0, z: 0, r: 18 }, { scale: [2.5, 4] });
m.scatterDecals('cracks', 8, { x: 0, z: 0, r: 16 }, { scale: [2.5, 4] });
m.scatterDecals('hayScatter', 6, { x: 0, z: 0, r: 16 }, { scale: [1.6, 2.4] });
m.scatterDecals('puddle', 2, { x: -9, z: -9, r: 6 }, { scale: [1.4, 2] });
m.scatterDecals('puddle', 3, { x: -52, z: 13, r: 10 }, { scale: [1.4, 2] });
for (let z = -90; z <= 90; z += 14) m.scatterDecals('puddle', 1, { x: streamX(z) + (R() < 0.5 ? -7 : 7), z, r: 3 }, { scale: [1.4, 2.2] });
m.scatterDecals('hayScatter', 8, { x: -52, z: 13, r: 11 }, { scale: [1.6, 2.4] });
m.scatterDecals('hoofPrints', 5, { x: -52, z: 13, r: 12 }, { scale: [3, 4.5] });
for (const [x, z] of [[52, 38], [-50, 30], [30, 62]]) { m.scatterDecals('hayScatter', 5, { x, z, r: 12 }, { scale: [1.6, 2.4] }); m.scatterDecals('hoofPrints', 3, { x, z, r: 12 }, { scale: [3, 4.5] }); }
m.scatterDecals('hoofPrints', 6, { x0: -60, z0: -6, x1: 60, z1: 6 }, { scale: [3, 4.5] });
for (const [cx, cz] of [[-80, -80], [80, -80], [-80, 80], [80, 80]]) {
  m.scatterDecals('rubble', 12, { x: cx, z: cz, r: 20 }, { scale: [2.5, 4] });
  m.scatterDecals('bones', 5, { x: cx, z: cz, r: 20 }, { scale: [2, 3.2] });
  m.scatterDecals('cracks', 6, { x: cx, z: cz, r: 22 }, { scale: [3, 5] });
}
m.scatterDecals('rubble', 10, { x0: -46, z0: -24, x1: 46, z1: -12 }, { scale: [2, 3] });
m.scatterDecals('leafPile', 45, woodRegion, { density: woodDensity, scale: [2, 3.5] });
m.scatterDecals('mushrooms', 30, woodRegion, { density: (x, z) => woodDensity(x, z) * 0.9, scale: [1.2, 2] });
m.scatterDecals('mossPatch', 18, { x0: -95, z0: -95, x1: -60, z1: 95 }, { density: (x, z) => Math.abs(x - streamX(z)) < 12 ? 0.9 : 0.1, scale: [2, 3.5] });
for (const o of m.objects) if (o.key === 'oakTree' || o.key === 'nature_oak_large_01') m.decal('roots', o.x, o.z, { scale: o.scale * 0.75 });
for (const o of m.objects) if (o.key === 'pineTree' && R() < 0.4) m.decal('rootsMud', o.x, o.z, { scale: o.scale * 0.5 });

// ── Grass tufts (skip bare ground and the woods' deep litter) ───────────
m.scatterTufts(7500, { x0: -95, z0: -95, x1: 95, z1: 95 }, { density: (x, z) => 1 - woodDensity(x, z) * 0.7, bareChannels: [DIRT, MUD, COBBLE], scale: [0.5, 1.0], tries: 4 });

m.bankTufts(streamX, -94, 94, { step: 1.3 });

// ── Write ──────────────────────────────────────────────────────────────
const json = m.toJSON();
writeFileSync(OUT, JSON.stringify(json, null, 1).replace(/\n\s*("?\w+"?): /g, ' $1: ').replace(/\{\s+/g, '{ ').replace(/\s+\}/g, ' }'));
await m.writeSplat(OUT === 'map.json' ? 'map.kingsfield.splat.png' : OUT.replace(/\.json$/, '.splat.png'));
console.log(`${OUT}: ${json.objects.length} objects, ${m.obstacles.length} obstacles, ${json.decals.length} decals, ${json.tufts.length} tufts`);
console.log(m.summary());

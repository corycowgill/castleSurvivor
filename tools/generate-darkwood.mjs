/**
 * Darkwood map generator → map.darkwood.json
 *
 * A logging settlement in an old forest (north is -z):
 *   - A dirt track north–south, a second track east to the river ford
 *   - Logging village south of the crossing: cottages, a tavern, a well, lumber yard
 *   - A farmstead on the western edge: fenced pumpkins, scarecrow, hay, a horse
 *   - Woodcutter camps (NW, SE) with breakable stores
 *   - A stream down the east side with a ford; oak groves in the clearings, pine stands elsewhere
 *   - A forgotten shrine clearing, rock outcrops, a ruined ogre keep in the north-east
 *
 * Usage: node tools/generate-darkwood.mjs [--seed N] [--out map.darkwood.json]
 */
import { writeFileSync } from 'node:fs';
import { MapBuilder, makeNoise } from './maplib.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEED = +opt('--seed', 1337);
const OUT = opt('--out', 'map.darkwood.json');

const m = new MapBuilder({ worldSize: 100, spawnX: 0, spawnZ: 0, enemySpawnDistance: 48, seed: SEED });
const R = m.rnd;
const noise = makeNoise(R, 16);
const grove = makeNoise(R, 30);
const PI = Math.PI;

// ── Ground, tracks, stream ─────────────────────────────────────────────
for (let gx = -96; gx <= 96; gx += 8) for (let gz = -96; gz <= 96; gz += 8) m.tile('grass', gx, gz);
for (let z = -54; z <= 60; z += 6) m.tile('road', 0, z);                  // main track
for (let x = 6; x <= 48; x += 6) m.tile('road', x, -12);                   // track to the ford
m.keepOut(0, 0, 12);
const streamX = (z) => 40 + Math.sin(z * 0.06) * 8 + Math.cos(z * 0.023) * 4;
for (let z = -96; z <= 96; z += 5.5) {
  if (Math.abs(z + 12) < 4) continue;                                       // the ford
  m.tile('stream', streamX(z), z, Math.atan2(streamX(z + 1) - streamX(z - 1), 2));
}
m.streamCurve(streamX, -98, 98, { fords: [-12] });
const nearStream = (x, z) => Math.abs(x - streamX(z)) < 5.5;
m.blockers.push((x, z, r) => Math.abs(x - streamX(z)) < 3.2 + r);
// Ford dressing: rocks and a signpost
m.add('village_signpost_01', 34, -8, { rotY: PI * 0.6 });
m.add('nature_rock_cluster_02', 42, -18, { rotY: R.angle() }); m.add('nature_rock_small_02', 38, -6, { rotY: R.angle() }); m.add('boulder', 46, -7, { rotY: R.angle(), scale: 3 });
m.add('village_lantern_post_01', 30, -16, {});

// ── Clearing at the crossing: a waystone, lanterns, barrels ────────────
m.add('townStatue', -7, -7, { rotY: PI * 1.25, ignoreKeepOut: true });
m.add('village_lantern_post_01', 6, 6, { ignoreKeepOut: true }); m.add('village_lantern_post_01', -6, 6, { ignoreKeepOut: true });
m.add('village_signpost_01', 6, -6, { rotY: PI * 0.3, ignoreKeepOut: true });
m.add('prop_bench_wood_01', -9, -4, { rotY: PI / 2, ignoreKeepOut: true });
for (let z = -48; z <= 56; z += 16) m.add('village_lantern_post_01', (z / 16) % 2 === 0 ? 5 : -5, z, {});
for (let z = -44; z <= 52; z += 12) if (R() < 0.7) m.add('barrel', (R() < 0.5 ? -1 : 1) * R.range(4.5, 6.5), z + R.range(-3, 3), { rotY: R.angle() });

// ── Logging village (south of the crossing, both sides of the track) ───
const yard = (x, z, rot, kind) => {
  const fx = Math.sin(rot), fz = Math.cos(rot), sx = fz, sz = -fx;
  const put = (key, f, s, r) => m.add(key, x + fx * f + sx * s, z + fz * f + sz * s, { rotY: r ?? R.angle() });
  if (kind === 'cottage') {
    put(R.pick(['barrel', 'prop_wood_crate_small_01', 'prop_hay_bale_01']), 4.3, 3.2); put(R.pick(['prop_bucket_wood_01', 'prop_pottery_01', 'prop_water_jug_01']), 4.5, -3.3);
    put(R() < 0.5 ? 'prop_firewood_stack_02' : 'prop_tree_stump_02', -4.8, R.range(-2, 2), rot); if (R() < 0.6) put('prop_stool_wood_01', 5.3, 1.4);
    if (R() < 0.5) put('village_fence_straight_01', 0, 5.3, rot + PI / 2);
  } else if (kind === 'tavern') {
    put('prop_table_wood_01', 5.6, 2.8, rot); put('prop_stool_wood_01', 5.6, 4.2); put('prop_stool_wood_01', 7, 2.8);
    put('prop_bench_wood_01', 6.4, -3, rot + PI / 2); put('barrel', 1, 5.6); put('barrel', -1.2, 6.2); put('prop_wood_crate_large_01', -1, -5.9);
    put('village_lantern_post_01', 6.4, 0, 0); put('village_hitching_post_01', 7, -6.5, rot);
  } else if (kind === 'lumber') {
    // Stacked timber, saw-horse table, crates and a cart
    put('prop_logs_02', 3.5, -5, rot + PI / 2); put('prop_logs_02', 5.2, -5.2, rot + PI / 2 + 0.1); put('prop_logs_02', 4, 3.5, rot);
    put('prop_firewood_stack_02', -2, -6, rot + PI / 2); put('prop_firewood_stack_02', -4, -6, rot + PI / 2); put('prop_tree_stump_02', 7, -2);
    put('prop_table_wood_01', 6.5, 0, rot); put('prop_wood_crate_large_01', 8, 4, R.angle()); put('prop_wood_crate_small_01', 8.5, 6, R.angle());
    put('horseCart', 8, -6, rot + PI / 2); put('prop_wheelbarrow_01', 6, 6.5); put('blacksmith_tool_rack_01', -2, 6, rot + PI / 2);
  }
};
const building = (key, x, z, rot, kind) => { if (m.add(key, x, z, { rotY: rot })) yard(x, z, rot, kind); else console.warn('could not place', key, x, z); };
building('tavern2', -14, 18, PI / 2, 'tavern');
building('house', -14, 34, PI / 2, 'cottage');
building('house', 14, 24, -PI / 2, 'cottage');
building('farmHouse', 14, 40, -PI / 2, 'lumber');
building('house', -14, 50, PI / 2, 'cottage');
building('house', 15, 56, -PI / 2, 'cottage');
m.add('villageWell', -8, 26, {}); m.add('prop_bucket_wood_01', -6.5, 28, {});
m.add('village_hitching_post_01', 8, 32, { rotY: PI / 2 }); m.add('horse', 8, 35.5, { rotY: PI }); m.add('village_water_trough_01', 10, 30, { rotY: 0 });
m.add('village_market_stall_01', -8, 42, { rotY: PI / 2 }); m.add('prop_grain_sack_stack_01', -8, 45.5, { rotY: R.angle() }); m.add('prop_pottery_01', -6.5, 40, {});
// Village fence runs along the track's back lots
for (let z = 12; z <= 60; z += 1.76) { if (Math.abs(z - 26) < 4 || Math.abs(z - 42) < 4) continue; m.add('village_fence_straight_01', -22, z, { rotY: PI / 2 }); }
for (let z = 18; z <= 62; z += 1.76) { if (Math.abs(z - 33) < 4 || Math.abs(z - 48) < 4) continue; m.add(R() < 0.1 ? 'village_fence_broken_01' : 'village_fence_straight_01', 22, z, { rotY: PI / 2 }); }
m.add('village_fence_gate_01', -22, 26, { rotY: PI / 2 }); m.add('village_fence_gate_01', 22, 33, { rotY: PI / 2 });
m.keepOutRect(-24, 10, 24, 64);
// Village oaks and flowers
for (const [x, z] of [[-28, 22], [28, 44], [-30, 56], [30, 14]]) m.add(R() < 0.5 ? 'oakTree' : 'nature_oak_large_01', x, z, { rotY: R.angle(), scale: R.range(8.5, 11) });
m.scatter('nature_flowers_02', 18, { x0: -22, z0: 10, x1: 22, z1: 64 }, { tries: 4, ignoreKeepOut: true });
m.scatter('nature_fern_01', 12, { x0: -22, z0: 10, x1: 22, z1: 64 }, { tries: 4, ignoreKeepOut: true });

// ── Farmstead on the west edge ─────────────────────────────────────────
building('farmHouse', -50, 20, PI / 2, 'cottage');
for (let x = -75 + 2.5; x < -57; x += 5) for (let z = 8 + 2.5; z < 24; z += 5) m.add('pumpkinPatch', x, z, { rotY: R.cardinal(), force: true });
m.fence(-75, 8, -57, 24, { gateSide: 'east' });
m.keepOutRect(-76, 7, -56, 25);
for (let x = -72 + 3; x < -56; x += 6) for (let z = 30 + 3; z < 42; z += 6) m.add('cornTile', x, z, { rotY: R.cardinal(), force: true });
m.fence(-72, 30, -56, 42, { gateSide: 'north' });
m.keepOutRect(-73, 29, -55, 43);
m.add('farm_scarecrow_01', -63, 27, { rotY: PI * 0.3 }); m.add('hayBales', -46, 28, { rotY: R.angle() }); m.add('prop_hay_bale_01', -43, 30, { rotY: R.angle() });
m.add('horse', -44, 14, { rotY: PI * 0.6 }); m.add('village_hitching_post_01', -44, 10, { rotY: PI / 2 }); m.add('village_water_trough_01', -47, 12, { rotY: PI / 2 });
m.add('horseCart', -52, 32, { rotY: PI * 0.55 }); m.add('prop_wheelbarrow_01', -55, 26, { rotY: R.angle() }); m.add('prop_grain_sack_01', -48, 26, { rotY: R.angle() });
m.add('villageWell', -44, 22, {});
m.add('village_rail_fence_straight_01', -42, 40, { rotY: -0.3 });
m.keepOut(-50, 20, 16);

// ── Woodcutter camps ───────────────────────────────────────────────────
for (const [cx, cz] of [[-48, -46], [52, 48]]) {
  m.add('farmHouse', cx, cz, { rotY: R.angle() });
  m.add('horseCart', cx + 7, cz + 2, { rotY: R.angle() });
  for (let i = 0; i < 5; i++) m.ring('barrel', cx, cz, 5, 9, {});
  m.ring('chest', cx, cz, 6, 8, {});
  for (const k of ['prop_wood_crate_large_01', 'prop_wood_crate_small_01', 'prop_grain_sack_stack_01', 'prop_hay_bale_01', 'hayBales', 'prop_wheelbarrow_01', 'prop_bucket_wood_01', 'prop_table_wood_01', 'prop_stool_wood_01', 'prop_logs_02', 'prop_logs_02', 'prop_firewood_stack_02', 'prop_tree_stump_02', 'prop_tree_stump_02']) m.ring(k, cx, cz, 5, 10, {});
  for (let i = 0; i < 4; i++) m.add('village_fence_straight_01', cx - 10, cz - 5 + i * 1.76, { rotY: PI / 2 });
  m.add('village_fence_broken_01', cx - 10, cz + 6, { rotY: PI / 2 });
  m.add('village_lantern_post_01', cx + 4, cz - 8, {});
  m.keepOut(cx, cz, 14);
}
// ── Shrine clearing (south-west) and the ruined keep (north-east) ─────
m.add('swordShrine', -34, 66, { rotY: PI * 0.75 });
for (let i = 0; i < 4; i++) m.ring('townStatue', -34, 66, 6, 8, { facing: 'in' });
for (let i = 0; i < 8; i++) m.ring('nature_flowers_02', -34, 66, 3, 9, {});
for (let i = 0; i < 4; i++) m.ring('village_lantern_post_01', -34, 66, 9, 11, {});
m.add('chest', -34, 72, { rotY: R.angle() });
m.keepOut(-34, 66, 13);
m.add('ogreCastle', 76, -76, { rotY: PI * 0.75, force: true });
m.keepOut(76, -76, 10);
for (let i = -2; i <= 2; i++) { const a = PI * 0.75 + i * 0.3; m.add('combat_barricade_01', 76 - Math.sin(a) * 0 + Math.sin(a + PI) * 17, -76 + Math.cos(a + PI) * 17, { rotY: a + PI }); }
m.add('village_weapon_rack_01', 66, -54, { rotY: PI * 0.75 }); m.add('village_weapon_rack_01', 54, -66, { rotY: PI * 0.75 });
for (let i = 0; i < 6; i++) m.ring('boulder', 76, -76, 11, 16, { scale: R.range(3, 4.5) });
for (let i = 0; i < 4; i++) m.ring('barrel', 76, -76, 10, 14, {});
m.ring('prop_wood_crate_broken_01', 76, -76, 10, 14, {}); m.ring('chest', 76, -76, 9, 11, {});
// ── Landmarks (Trellis batch 7; skipped if a mesh is not registered) ──
m.landmark('landmark_ruined_tower', -72, -66, { rotY: PI * 0.7, keepOut: 6 });
for (let i = 0; i < 4; i++) m.ring('nature_rock_cluster_02', -72, -66, 6, 9, {});
m.landmark('landmark_windmill', -60, 54, { rotY: PI * 0.1, keepOut: 8 });
m.add('prop_grain_sack_stack_01', -52, 50, { rotY: R.angle() }); m.add('horseCart', -68, 48, { rotY: PI * 0.6 });
m.landmark('landmark_destroyed_watchtower', 54, -24, { rotY: PI * 0.4, keepOut: 5 });
if (m.landmark('landmark_graveyard_gate', -78, 64, { rotY: 0, keepOut: 3 })) {
  m.fence(-88, 64, -68, 80, { gateSide: 'north', set: 'rail' });
  m.keepOutRect(-89, 63, -67, 81);
  for (const [gx, gz] of [[-85, 69], [-81, 69], [-75, 69], [-71, 69], [-85, 74], [-81, 74], [-75, 74], [-71, 74], [-83, 78], [-73, 78]]) m.add('nature_rock_small_02', gx, gz, { rotY: 0, force: true, scale: 1.4 });
  m.add('nature_dead_tree_03', -78, 72, { rotY: R.angle(), force: true, scale: 7.5 });
}
// Rock outcrops: two boulder fields
for (const [cx, cz] of [[-70, -20], [70, 20]]) {
  for (let i = 0; i < 7; i++) m.ring('boulder', cx, cz, 0, 10, { scale: R.range(3, 5) });
  for (let i = 0; i < 4; i++) m.ring('nature_rock_cluster_02', cx, cz, 2, 12, {});
  for (let i = 0; i < 4; i++) m.ring('nature_rock_small_02', cx, cz, 2, 12, {});
  for (let i = 0; i < 3; i++) m.ring('nature_fern_01', cx, cz, 3, 12, {});
}

// ── Forest ─────────────────────────────────────────────────────────────
const forestDensity = (x, z) => {
  if (nearStream(x, z)) return 0;
  if (Math.abs(x) < 7 && z > -58 && z < 64) return 0;           // main track verge
  if (Math.abs(z + 12) < 7 && x > 0 && x < 52) return 0;          // ford track verge
  const n = noise(x, z);
  const edge = Math.max(Math.abs(x), Math.abs(z)) / 94;
  return Math.max(0, Math.min(1, 0.4 + edge * 0.6 + (n - 0.5) * 0.9));
};
const isGrove = (x, z) => grove(x, z) > 0.62;                     // broadleaf pockets
const region = { x0: -94, z0: -94, x1: 94, z1: 94 };
m.scatter('pineTree', 400, region, { density: (x, z) => isGrove(x, z) ? forestDensity(x, z) * 0.25 : forestDensity(x, z), tries: 14, minSpacing: 1.4 });
m.scatter('nature_oak_large_01', 22, region, { density: (x, z) => isGrove(x, z) ? forestDensity(x, z) : forestDensity(x, z) * 0.08, tries: 14 });
m.scatter('oakTree', 22, region, { density: (x, z) => isGrove(x, z) ? forestDensity(x, z) : forestDensity(x, z) * 0.08, tries: 14 });
for (const o of m.objects) if (o.key === 'pineTree') o.scale = +(5 + R() * 3.2).toFixed(1);
for (const o of m.objects) if (o.key === 'oakTree' || o.key === 'nature_oak_large_01') if (o.scale === 10.4) o.scale = +(8.5 + R() * 3).toFixed(1);
for (const o of m.objects) if (o.key === 'nature_dead_tree_03' && o.scale === 7.8) o.scale = +(6 + R() * 3).toFixed(1);
// Forest floor
m.scatter('nature_fern_01', 90, region, { density: (x, z) => forestDensity(x, z) + 0.1, tries: 5 });
m.scatter('shrubbery', 60, region, { density: (x, z) => forestDensity(x, z) + 0.05, tries: 5 });
m.scatter('nature_flowers_02', 40, region, { density: (x, z) => isGrove(x, z) ? 0.9 : 0.25, tries: 5 });
m.scatter('nature_fallen_log_01', 24, region, { density: forestDensity, tries: 8 });
m.scatter('prop_tree_stump_02', 40, region, { density: forestDensity, tries: 8 });
m.scatter('nature_dead_tree_03', 26, region, { density: (x, z) => forestDensity(x, z) * (isGrove(x, z) ? 0.2 : 0.9), tries: 10 });
for (let i = 0; i < 5; i++) m.ring('nature_dead_tree_03', 76, -76, 14, 26, { scale: R.range(6.5, 9) });
m.scatter('nature_rock_cluster_02', 16, region, { density: forestDensity, tries: 8 });
m.scatter('nature_rock_small_02', 20, region, { density: forestDensity, tries: 8 });
m.scatter('boulder', 22, region, { density: (x, z) => forestDensity(x, z) * 0.8, tries: 8 });
m.scatter('prop_wood_crate_broken_01', 6, region, { density: forestDensity, tries: 8 });
for (const o of m.objects) if (o.key === 'shrubbery' && o.scale === 4) o.scale = +(3 + R() * 1.8).toFixed(1);
// Lost caches for explorers
m.add('chest', -80, -80, { rotY: R.angle() }); m.add('chest', 84, 84, { rotY: R.angle() }); m.add('chest', 0, 88, { rotY: R.angle() });

// ── Ground paint: R dirt, G pine needles, B mud, A moss (see MAPS.darkwood.terrain)
const DIRT = 0, NEEDLES = 1, MUD = 2, MOSS = 3;
m.paintRoads(DIRT, DIRT);                                         // the tracks are bare earth
m.paintUnderObstacles(DIRT, 2.0, 0.8);
m.paintRect(DIRT, -75, 8, -57, 24, 0.9, 2); m.paintRect(DIRT, -72, 30, -56, 42, 0.9, 2);
m.paintCircle(DIRT, 0, 0, 14, 0.7, 0.5);                          // the crossing clearing
for (const [cx, cz] of [[-48, -46], [52, 48]]) m.paintCircle(DIRT, cx, cz, 13, 0.8, 0.5);
m.paintCircle(DIRT, 76, -76, 20, 0.7, 0.5);
for (let z = -96; z <= 96; z += 1.5) m.paintCircle(MUD, streamX(z), z, 5.6, 0.95, 0.5);
m.paintFn(NEEDLES, (x, z) => (isGrove(x, z) ? 0.2 : 1.15) * forestDensity(x, z) - 0.05, 2);
m.paintFn(MOSS, (x, z) => isGrove(x, z) ? forestDensity(x, z) * 0.9 + 0.2 : (grove(x, z) - 0.5) * 0.8, 2);
m.paintCircle(MOSS, -34, 66, 12, 0.8, 0.5);                       // the shrine clearing is mossy
m.suppress(NEEDLES, DIRT); m.suppress(MOSS, DIRT); m.suppress(NEEDLES, MUD); m.suppress(MOSS, MUD);

// ── Decals ─────────────────────────────────────────────────────────────
m.scatterDecals('mushrooms', 70, region, { density: forestDensity, scale: [1.2, 2.2] });
m.scatterDecals('leafPile', 35, region, { density: (x, z) => isGrove(x, z) ? 0.9 : 0.15, scale: [2, 3.5] });
m.scatterDecals('mossPatch', 45, region, { density: (x, z) => isGrove(x, z) ? 0.8 : forestDensity(x, z) * 0.3, scale: [2, 3.5] });
m.scatterDecals('rootsMud', 50, region, { density: forestDensity, scale: [2, 3.5] });
for (let z = -90; z <= 90; z += 14) m.scatterDecals('puddle', 1, { x: streamX(z) + (R() < 0.5 ? -7 : 7), z, r: 3 }, { scale: [1.4, 2.2] });
m.scatterDecals('puddle', 5, region, { density: (x, z) => forestDensity(x, z) * 0.5, scale: [1.4, 2] });
m.scatterDecals('hayScatter', 6, { x: -50, z: 20, r: 12 }, { scale: [1.6, 2.4] }); m.scatterDecals('hoofPrints', 4, { x: -50, z: 20, r: 12 }, { scale: [3, 4.5] });
m.scatterDecals('hoofPrints', 6, { x0: -5, z0: -50, x1: 5, z1: 60 }, { scale: [3, 4.5] });
for (const [cx, cz] of [[-48, -46], [52, 48]]) m.scatterDecals('hayScatter', 4, { x: cx, z: cz, r: 10 }, { scale: [1.6, 2.4] });
m.scatterDecals('rubble', 8, { x: 76, z: -76, r: 20 }, { scale: [2.5, 4] }); m.scatterDecals('bones', 8, { x: 76, z: -76, r: 22 }, { scale: [2, 3.2] });
m.scatterDecals('bones', 12, region, { density: (x, z) => forestDensity(x, z) * 0.4, scale: [1.8, 2.8] });
m.scatterDecals('cracks', 6, { x: -70, z: -20, r: 12 }, { scale: [3, 5] }); m.scatterDecals('cracks', 6, { x: 70, z: 20, r: 12 }, { scale: [3, 5] });
for (const o of m.objects) if (o.key === 'oakTree' || o.key === 'nature_oak_large_01') m.decal('roots', o.x, o.z, { scale: o.scale * 0.75 });

// ── Grass tufts: the clearings and the village, thinning under the pines ──
m.scatterTufts(6500, region, { density: (x, z) => 1 - forestDensity(x, z) * 0.6, bareChannels: [DIRT, MUD], tries: 6, scale: [0.5, 1.0] });

m.bankTufts(streamX, -94, 94, { step: 1.2 });

// ── Light shafts through the canopy: clearings, the shrine, the village edge ──
for (const [x, z, w] of [[-9, -12, 6], [11, 6, 5], [-34, 60, 7], [-28, 70, 4], [-6, 30, 5], [16, 48, 5], [-52, -38, 6], [56, 52, 5], [-20, -60, 6], [24, 76, 5], [70, 20, 5], [-70, -20, 5]]) m.shaft(x, z, { w, h: 16, rotY: R.range(0.4, 0.9) });

const json = m.toJSON();
writeFileSync(OUT, JSON.stringify(json, null, 1).replace(/\n\s*("?\w+"?): /g, ' $1: ').replace(/\{\s+/g, '{ ').replace(/\s+\}/g, ' }'));
await m.writeSplat(OUT.replace(/\.json$/, '.splat.png'));
console.log(`${OUT}: ${json.objects.length} objects, ${m.obstacles.length} obstacles, ${json.decals.length} decals, ${json.tufts.length} tufts`);
console.log(m.summary());

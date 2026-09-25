/**
 * Shared map-building library for the generators (tools/generate-*.mjs).
 *
 * A MapBuilder keeps an obstacle list and keep-out zones so nothing is placed
 * inside a building, on a road, or on top of the spawn. Every asset placed
 * carries the scale and collision radius the game expects.
 */
import sharp from 'sharp';
import { EXTRA_ASSETS } from '../assets-extra.js';

// Scale / collision for the original hand-made assets (matches editor.html defaults
// and the values used in the hand-authored map.json)
export const LEGACY = {
  humanCastle: { scale: 17, r: 8 }, ogreCastle: { scale: 10, r: 6 },
  house: { scale: 6, r: 3.5 }, farmHouse: { scale: 6, r: 3.5 }, blacksmith: { scale: 6, r: 3.5 },
  apothecary: { scale: 6, r: 3.5 }, tavern: { scale: 6, r: 4 }, tavern2: { scale: 6, r: 4 }, horseStable: { scale: 6, r: 4 },
  // Scale pass (PLAN 15.3): the knight is ~2.3 units (1.8 m), so props sit at
  // ~1.5 units per metre — a barrel is waist high, a cart is cart sized.
  wall: { scale: 5, r: 2.5 }, barrel: { scale: 1.7, r: 0.85 }, boulder: { scale: 3.2, r: 1.7 }, townStatue: { scale: 4.5, r: 1.8 },
  horseCart: { scale: 4, r: 2 }, horse: { scale: 3.6, r: 1.5 }, pineTree: { scale: 7, r: 1.2 },
  shrubbery: { scale: 2.6, r: 0 }, pumpkinPatch: { scale: 5, r: 0 }, cornTile: { scale: 6, r: 0 },
  grass: { scale: 8, r: 0 }, road: { scale: 6, r: 0 }, stream: { scale: 6, r: 0 }, chest: { scale: 1.8, r: 0 },
};
export const ASSET = { ...LEGACY };
for (const a of EXTRA_ASSETS) ASSET[a.key] = { scale: a.defaultScale, r: a.obstacle ? a.radius : 0 };
// Hand overrides: rail fence pieces match the picket set's 2.64-unit module; the dead
// tree's collision is its trunk, not its canopy footprint
Object.assign(ASSET, {
  village_rail_fence_corner_01: { scale: 2.64, r: 1.0 }, village_rail_fence_gate_01: { scale: 2.64, r: 0 },
  nature_dead_tree_03: { scale: 7.8, r: 1.4 },
  // Landmarks (batch 7): 1.35 units/m like other tall fixtures; collision is the base, not the silhouette
  landmark_village_fountain: { scale: 4.5, r: 2.2 }, landmark_ancient_oak: { scale: 15, r: 2.6 },
  landmark_ruined_tower: { scale: 10.5, r: 3.6 }, landmark_windmill: { scale: 13, r: 3.4 },
  landmark_graveyard_gate: { scale: 5.4, r: 1.6 }, landmark_destroyed_watchtower: { scale: 6.8, r: 3.0 },
});
// Emberreach hero pieces (batch 10). Same 1.35 units/m as the other tall fixtures;
// collision is the footprint you actually walk into, not the silhouette — the cone
// is a mountain you route around, the arch is two legs you walk between.
for (const [k, v] of Object.entries({
  landmark_ogre_gate: { scale: 19, r: 7.0 }, landmark_volcano_cone_01: { scale: 27, r: 13.0 },
  landmark_obsidian_arch_01: { scale: 13.5, r: 3.2 }, landmark_ogre_idol_01: { scale: 12, r: 3.4 },
  burnt_tree_giant_01: { scale: 11.7, r: 1.8 },
})) if (ASSET[k]) ASSET[k] = v;   // only once the mesh is registered
// Fence sets: the picket set (re-tinted oak) and the rail set from Trellis batch 8
export const FENCE_SETS = {
  picket: { straight: 'village_fence_straight_01', broken: 'village_fence_broken_01', corner: 'village_fence_corner_01', gate: 'village_fence_gate_01' },
  rail:   { straight: 'village_rail_fence_corner_01', broken: 'village_fence_broken_01', corner: 'village_fence_corner_01', gate: 'village_rail_fence_gate_01' },
};

export const TAU = Math.PI * 2;
export function makeRng(seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  rnd.range = (a, b) => a + rnd() * (b - a);
  rnd.pick = (list) => list[Math.floor(rnd() * list.length)];
  rnd.angle = () => rnd() * TAU;
  rnd.cardinal = () => Math.floor(rnd() * 4) * Math.PI / 2;
  return rnd;
}

// Cheap value noise for clearings / density variation
export function makeNoise(rnd, cell = 18) {
  const grid = {};
  const g = (ix, iz) => { const k = ix + ',' + iz; if (grid[k] == null) grid[k] = rnd(); return grid[k]; };
  return (x, z) => {
    const fx = x / cell, fz = z / cell, ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz, sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
    const a = g(ix, iz), b = g(ix + 1, iz), c = g(ix, iz + 1), d = g(ix + 1, iz + 1);
    return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
  };
}

export class MapBuilder {
  constructor({ worldSize = 100, spawnX = 0, spawnZ = 0, enemySpawnDistance = 45, seed = 1 }) {
    this.worldSize = worldSize; this.spawnX = spawnX; this.spawnZ = spawnZ; this.enemySpawnDistance = enemySpawnDistance;
    this.rnd = makeRng(seed);
    this.objects = []; this.obstacles = []; this.keepOuts = []; this.roads = []; this.counts = {};
    this.blockers = []; // (x, z, r) => true when the spot is off-limits (e.g. a stream)
    this.limit = worldSize - 4;
    // Splat map: 4 float channels over the world, written as RGBA PNG (row 0 = north / -z)
    this.splatSize = 512;
    this.splat = new Float32Array(this.splatSize * this.splatSize * 4);
    this.decals = []; this.tufts = []; this.shafts = []; this.streams = []; this.barriers = []; this.mires = []; this.fires = [];
    this.missing = {};
  }
  // Is this mesh registered? The Emberreach generator runs while its Trellis batch
  // is still going, so it asks before it places and records what was not there yet.
  has(key) { return !!ASSET[key]; }
  // First registered key from a preference list, so a generator can name the asset
  // it wants and the stand-in it will accept: pick('ogre_hut_01', 'farmHouse')
  pick(...keys) { return keys.find(k => ASSET[k]); }
  note(key) { this.missing[key] = (this.missing[key] || 0) + 1; return false; }
  // Collision-only disc: no mesh, no draw call, just somewhere the player cannot
  // walk. Emberreach lines its lava with these.
  barrier(x, z, r) {
    if (Math.abs(x) > this.worldSize + 8 || Math.abs(z) > this.worldSize + 8) return false;
    this.barriers.push({ x: +x.toFixed(1), z: +z.toFixed(1), r: +r.toFixed(1) });
    this.obstacles.push({ x, z, r });                 // also keeps props out of the lava
    this.counts.barriers = (this.counts.barriers || 0) + 1;
    return true;
  }
  // Soft ground: slows whatever walks through it, blocks nothing, draws nothing.
  // Unlike barrier() this does NOT go into the obstacle list -- reeds and stumps
  // should stand in a bog quite happily, and the props are most of what tells the
  // player the ground is soft before they feel it.
  mire(x, z, r) {
    if (Math.abs(x) > this.worldSize + 8 || Math.abs(z) > this.worldSize + 8) return false;
    this.mires.push({ x: +x.toFixed(1), z: +z.toFixed(1), r: +r.toFixed(1) });
    this.counts.mires = (this.counts.mires || 0) + 1;
    return true;
  }
  // Fill a region with overlapping mire discs wherever `fn(x, z)` is positive, so
  // the bog follows the same noise field that paints it and the two cannot drift
  // apart. `keepOut` is a list of {x, z, r} kept dry (the spawn, the causeways).
  mireField(fn, { x0 = -this.limit, x1 = this.limit, z0 = -this.limit, z1 = this.limit,
                  step = 7, r = [5, 8.5], dry = [] } = {}) {
    for (let z = z0; z <= z1; z += step) for (let x = x0; x <= x1; x += step) {
      const px = x + this.rnd.range(-step * 0.35, step * 0.35);
      const pz = z + this.rnd.range(-step * 0.35, step * 0.35);
      if (fn(px, pz) <= 0) continue;
      const rad = this.rnd.range(r[0], r[1]);
      if (dry.some(d => Math.hypot(px - d.x, pz - d.z) < d.r + rad * 0.55)) continue;
      this.mire(px, pz, rad);
    }
  }
  // A run of barriers along x = fn(z), skipped near the fords so a crossing stays open
  barrierCurve(fn, z0, z1, { step = 3, r = 3, fords = [], gap = 4.5 } = {}) {
    for (let z = z0; z <= z1; z += step) {
      if (fords.some(f => Math.abs(z - f) < gap)) continue;
      this.barrier(fn(z), z, r);
    }
  }
  // Stream ribbon along x = fn(z), split into segments around fords (z values) so the
  // road stays dry; the game builds a feathered triangle strip from the points
  streamCurve(fn, z0, z1, { step = 2, w = 4.4, fords = [], gap = 3.5 } = {}) {
    let seg = [];
    const flush = () => { if (seg.length > 1) this.streams.push({ w, pts: seg }); seg = []; };
    for (let z = z0; z <= z1 + 0.001; z += step) {
      if (fords.some(f => Math.abs(z - f) < gap)) { flush(); continue; }
      seg.push([+fn(z).toFixed(2), +z.toFixed(2)]);
    }
    flush();
    this.counts.streams = (this.counts.streams || 0) + this.streams.length;
  }
  // A fire: flames, a smoke column and a pooled point light, drawn by the game
  // (updateMapFires / vfx.buildingFire). r = footprint radius of the blaze, y =
  // where the flames start (a roof, a cart bed), h = how high the smoke climbs,
  // s = intensity 0..1. Bloodmarch's burning town is made of these.
  fire(x, z, { r = 1.2, y = 0.3, h = 8, s = 1 } = {}) {
    if (Math.abs(x) > this.worldSize + 8 || Math.abs(z) > this.worldSize + 8) return false;
    this.fires.push({ x: +x.toFixed(1), z: +z.toFixed(1), r: +r.toFixed(2), y: +y.toFixed(2), h: +h.toFixed(1), s: +s.toFixed(2) });
    this.counts.fires = (this.counts.fires || 0) + 1;
    return true;
  }
  // Light shaft: a tall additive plane the game leans along the key light
  shaft(x, z, { w = 5, h = 26, rotY = 0.6 } = {}) { this.shafts.push({ x: +x.toFixed(1), z: +z.toFixed(1), w, h, rotY }); this.counts.shafts = (this.counts.shafts || 0) + 1; }
  // ── Splat painting (channel 0..3) ──
  _px(v) { return (v + this.worldSize) / (this.worldSize * 2) * this.splatSize; }
  paintCircle(ch, x, z, r, strength = 1, feather = 0.5, mode = 'max') {
    const S = this.splatSize, cx = this._px(x), cz = this._px(z), pr = r / (this.worldSize * 2) * S;
    const x0 = Math.max(0, Math.floor(cx - pr)), x1 = Math.min(S - 1, Math.ceil(cx + pr));
    const z0 = Math.max(0, Math.floor(cz - pr)), z1 = Math.min(S - 1, Math.ceil(cz + pr));
    for (let pz = z0; pz <= z1; pz++) for (let px = x0; px <= x1; px++) {
      const d = Math.hypot(px + 0.5 - cx, pz + 0.5 - cz) / pr; if (d > 1) continue;
      const t = d < 1 - feather ? 1 : (1 - d) / feather;
      const w = strength * t * t * (3 - 2 * t);
      const i = (pz * S + px) * 4 + ch;
      this.splat[i] = mode === 'max' ? Math.max(this.splat[i], w) : Math.min(1, this.splat[i] + w);
    }
  }
  paintRect(ch, x0, z0, x1, z1, strength = 1, feather = 1.5) {
    const S = this.splatSize, u = (this.worldSize * 2) / S;
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1), az = Math.min(z0, z1), bz = Math.max(z0, z1);
    const px0 = Math.max(0, Math.floor(this._px(ax - feather))), px1 = Math.min(S - 1, Math.ceil(this._px(bx + feather)));
    const pz0 = Math.max(0, Math.floor(this._px(az - feather))), pz1 = Math.min(S - 1, Math.ceil(this._px(bz + feather)));
    for (let pz = pz0; pz <= pz1; pz++) for (let px = px0; px <= px1; px++) {
      const wx = -this.worldSize + (px + 0.5) * u, wz = -this.worldSize + (pz + 0.5) * u;
      const dx = Math.max(ax - wx, 0, wx - bx), dz = Math.max(az - wz, 0, wz - bz);
      const d = Math.hypot(dx, dz); if (d > feather) continue;
      const t = feather > 0 ? 1 - d / feather : 1;
      const i = (pz * S + px) * 4 + ch;
      this.splat[i] = Math.max(this.splat[i], strength * t * t * (3 - 2 * t));
    }
  }
  // Paint with a density function over the whole map (e.g. leaf litter under the woods)
  paintFn(ch, fn, step = 1) {
    const S = this.splatSize, u = (this.worldSize * 2) / S;
    for (let pz = 0; pz < S; pz += step) for (let px = 0; px < S; px += step) {
      const wx = -this.worldSize + (px + 0.5) * u, wz = -this.worldSize + (pz + 0.5) * u;
      const w = fn(wx, wz); if (w <= 0) continue;
      for (let dz = 0; dz < step; dz++) for (let dx = 0; dx < step; dx++) {
        const i = ((pz + dz) * S + (px + dx)) * 4 + ch; if (i >= this.splat.length) continue;
        this.splat[i] = Math.max(this.splat[i], Math.min(1, w));
      }
    }
  }
  // Roads and buildings paint themselves: cobble under road tiles with a dirt fringe,
  // dirt under and around anything with a footprint
  paintRoads(cobbleCh, dirtCh) {
    for (const rd of this.roads) {
      this.paintRect(cobbleCh, rd.x - 3, rd.z - 3, rd.x + 3, rd.z + 3, 1, 0.8);
      this.paintRect(dirtCh, rd.x - 3, rd.z - 3, rd.x + 3, rd.z + 3, 0.7, 3.2);
    }
  }
  paintUnderObstacles(dirtCh, minR = 1.5, strength = 0.85) {
    for (const o of this.obstacles) if (o.r >= minR) this.paintCircle(dirtCh, o.x, o.z, o.r + 1.4, strength, 0.55);
  }
  // Where `byCh` is painted, fade `ch` out (cobble beats dirt, dirt beats litter, ...)
  suppress(ch, byCh, amount = 1) {
    for (let i = 0; i < this.splat.length; i += 4) this.splat[i + ch] *= Math.max(0, 1 - this.splat[i + byCh] * amount);
  }
  // Reeds / bank tufts along a curve x = fn(z): variant index `v` from the sprite list
  bankTufts(fn, z0, z1, { step = 3, offset = [4, 6.5], v = 3, scale = [0.9, 1.5], chance = 0.8 } = {}) {
    let placed = 0;
    for (let z = z0; z <= z1; z += step) for (const side of [-1, 1]) {
      if (this.rnd() > chance) continue;
      const x = fn(z) + side * this.rnd.range(offset[0], offset[1]), zz = z + this.rnd.range(-1, 1);
      if (Math.abs(x) > this.limit || Math.abs(zz) > this.limit || !this.isClear(x, zz, 0.3)) continue;
      this.tufts.push({ v, x: +x.toFixed(1), z: +zz.toFixed(1), rotY: +this.rnd.angle().toFixed(2), scale: +this.rnd.range(scale[0], scale[1]).toFixed(2) });
      placed++;
    }
    this.counts.reeds = (this.counts.reeds || 0) + placed;
    return placed;
  }
  sampleSplat(x, z) {
    const S = this.splatSize, px = Math.max(0, Math.min(S - 1, Math.floor(this._px(x)))), pz = Math.max(0, Math.min(S - 1, Math.floor(this._px(z))));
    const i = (pz * S + px) * 4; return [this.splat[i], this.splat[i + 1], this.splat[i + 2], this.splat[i + 3]];
  }
  async writeSplat(file) {
    const S = this.splatSize, buf = Buffer.alloc(S * S * 4);
    for (let i = 0; i < buf.length; i++) buf[i] = Math.round(Math.max(0, Math.min(1, this.splat[i])) * 255);
    await sharp(buf, { raw: { width: S, height: S, channels: 4 } }).png().toFile(file);
  }
  // ── Decals and grass tufts (rendered as instanced quads by the game) ──
  decal(key, x, z, { rotY = this.rnd.angle(), scale = 1 } = {}) {
    if (Math.abs(x) > this.limit || Math.abs(z) > this.limit) return false;
    this.decals.push({ key, x: +x.toFixed(1), z: +z.toFixed(1), rotY: +rotY.toFixed(2), scale: +scale.toFixed(2) });
    this.counts['decal:' + key] = (this.counts['decal:' + key] || 0) + 1;
    return true;
  }
  // `ignoreKeepOut` matters for ground marks inside a district: scorch under the
  // warcamp and slag round the forge are exactly what the keep-out exists to
  // protect, and a decal has no collision to conflict with anyway.
  scatterDecals(key, n, region, { density = null, scale = [1, 1], tries = 4, ignoreKeepOut = false } = {}) {
    let placed = 0;
    for (let i = 0; i < n * tries && placed < n; i++) {
      let x, z;
      if (region.r != null) { const a = this.rnd.angle(), d = Math.sqrt(this.rnd()) * region.r; x = region.x + Math.cos(a) * d; z = region.z + Math.sin(a) * d; }
      else { x = this.rnd.range(region.x0, region.x1); z = this.rnd.range(region.z0, region.z1); }
      if (density && this.rnd() > density(x, z)) continue;
      if (!this.isClear(x, z, 0.4, { ignoreKeepOut, ignoreRoads: ignoreKeepOut })) continue;
      if (this.decal(key, x, z, { scale: this.rnd.range(scale[0], scale[1]) })) placed++;
    }
    return placed;
  }
  // Tufts avoid roads, buildings and painted-bare ground (dirt/cobble/mud weight)
  scatterTufts(n, region, { density = null, bareChannels = [0, 3], tries = 3, scale = [0.7, 1.3], variants = 3 } = {}) {
    let placed = 0;
    for (let i = 0; i < n * tries && placed < n; i++) {
      const x = this.rnd.range(region.x0, region.x1), z = this.rnd.range(region.z0, region.z1);
      if (Math.abs(x) > this.limit || Math.abs(z) > this.limit) continue;
      if (density && this.rnd() > density(x, z)) continue;
      const sp = this.sampleSplat(x, z);
      let bare = 0; for (const c of bareChannels) bare = Math.max(bare, sp[c]);
      if (this.rnd() < bare) continue;
      if (!this.isClear(x, z, 0.3)) continue;
      this.tufts.push({ v: Math.floor(this.rnd() * variants), x: +x.toFixed(1), z: +z.toFixed(1), rotY: +this.rnd.angle().toFixed(2), scale: +this.rnd.range(scale[0], scale[1]).toFixed(2) });
      placed++;
    }
    this.counts.tufts = (this.counts.tufts || 0) + placed;
    return placed;
  }
  keepOut(x, z, r) { this.keepOuts.push({ x, z, r }); }
  keepOutRect(x0, z0, x1, z1) { this.keepOuts.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) }); }
  isClear(x, z, r, { ignoreRoads = false, ignoreKeepOut = false } = {}) {
    if (Math.abs(x) > this.limit || Math.abs(z) > this.limit) return false;
    if (!ignoreKeepOut) for (const k of this.keepOuts) {
      if (k.r != null) { if (Math.hypot(x - k.x, z - k.z) < k.r + r) return false; }
      else if (x > k.x0 - r && x < k.x1 + r && z > k.z0 - r && z < k.z1 + r) return false;
    }
    for (const f of this.blockers) if (f(x, z, r)) return false;
    if (!ignoreRoads) for (const rd of this.roads) if (Math.abs(x - rd.x) < 3.4 + r && Math.abs(z - rd.z) < 3.4 + r) return false;
    for (const o of this.obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + r + 0.3) return false;
    return true;
  }
  // Terrain tiles: no collision, no clearance check
  tile(key, x, z, rotY = 0) {
    const a = ASSET[key]; if (!a) throw new Error('unknown asset ' + key);
    this.objects.push({ key, x: +x.toFixed(1), z: +z.toFixed(1), rotX: 0, rotY: +rotY.toFixed(2), rotZ: 0, scale: a.scale, obstacle: false, radius: 0 });
    if (key === 'road') this.roads.push({ x, z });
    this.counts[key] = (this.counts[key] || 0) + 1;
  }
  // Props and buildings: clearance-checked unless force
  // `scale` may be a number or a [min, max] range, rolled per placement. The range
  // form is what scatterDecals and scatterTufts already take, and passing one here
  // used to poison the collision radius: `a.r * ([0.9,1.4] / a.scale)` is NaN, every
  // isClear comparison against NaN is false, so the prop skipped every obstacle,
  // keep-out, road and barrier check and serialised `radius: null`. That put 560
  // phantom obstacles into Mirefen, some of them standing in impassable water.
  add(key, x, z, { rotY = 0, scale, force = false, ignoreRoads = false, ignoreKeepOut = false, pad = 0 } = {}) {
    const a = ASSET[key]; if (!a) throw new Error('unknown asset ' + key);
    let s = scale ?? a.scale;
    if (Array.isArray(s)) s = this.rnd.range(s[0], s[1]);
    if (!Number.isFinite(s)) throw new Error(`bad scale for ${key}: ${JSON.stringify(scale)}`);
    const r = a.r > 0 ? a.r * (s / a.scale) : 0.5;
    if (!Number.isFinite(r)) throw new Error(`bad radius for ${key} (scale ${s})`);
    if (!force && !this.isClear(x, z, r + pad, { ignoreRoads, ignoreKeepOut })) return false;
    this.objects.push({ key, x: +x.toFixed(1), z: +z.toFixed(1), rotX: 0, rotY: +rotY.toFixed(2), rotZ: 0, scale: s, obstacle: a.r > 0, radius: a.r > 0 ? +r.toFixed(1) : 0 });
    if (a.r > 0) this.obstacles.push({ x, z, r });
    this.counts[key] = (this.counts[key] || 0) + 1;
    return true;
  }
  // Landmark: placed only if the mesh made it through validation (so the generators
  // keep working while a batch is pending), with a keep-out ring and a painted apron
  landmark(key, x, z, { rotY = 0, keepOut = 0, apron = null, ...rest } = {}) {
    if (!ASSET[key]) { this.counts['missing:' + key] = (this.counts['missing:' + key] || 0) + 1; return false; }
    const ok = this.add(key, x, z, { rotY, force: true, ...rest });
    if (keepOut > 0) this.keepOut(x, z, keepOut);
    if (apron) this.paintCircle(apron.ch, x, z, apron.r, apron.strength ?? 0.8, 0.5);
    return ok;
  }
  // Try to place on a ring around (cx, cz); facing: 'in' | 'out' | number | undefined(random)
  ring(key, cx, cz, rMin, rMax, { tries = 16, facing, ...rest } = {}) {
    for (let i = 0; i < tries; i++) {
      const a = this.rnd.angle(), d = this.rnd.range(rMin, rMax);
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      const rotY = facing === 'in' ? Math.atan2(cx - x, cz - z) : facing === 'out' ? Math.atan2(x - cx, z - cz) : typeof facing === 'number' ? facing : this.rnd.angle();
      if (this.add(key, x, z, { rotY, ...rest })) return true;
    }
    return false;
  }
  // Evenly spaced along a segment
  line(key, x0, z0, x1, z1, step, { rotY, ...rest } = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / step));
    const yaw = rotY ?? Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
    let placed = 0;
    for (let i = 0; i <= n; i++) { const t = i / n; if (this.add(key, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, { rotY: yaw, ...rest })) placed++; }
    return placed;
  }
  // Random scatter inside a region (circle {x,z,r} or rect {x0,z0,x1,z1}) with optional density fn
  scatter(key, n, region, { density = null, tries = 6, minSpacing = 0, ...rest } = {}) {
    let placed = 0;
    for (let i = 0; i < n * tries && placed < n; i++) {
      let x, z;
      if (region.r != null) { const a = this.rnd.angle(), d = Math.sqrt(this.rnd()) * region.r; x = region.x + Math.cos(a) * d; z = region.z + Math.sin(a) * d; }
      else { x = this.rnd.range(region.x0, region.x1); z = this.rnd.range(region.z0, region.z1); }
      if (density && this.rnd() > density(x, z)) continue;
      if (this.add(key, x, z, { rotY: this.rnd.angle(), pad: minSpacing, ...rest })) placed++;
    }
    return placed;
  }
  // Rectangular fence with a gate on one side
  fence(x0, z0, x1, z1, { gateSide = 'south', step = ASSET.village_fence_straight_01.scale * 0.98, set = 'rail' } = {}) {
    const F = FENCE_SETS[set] || FENCE_SETS.rail;
    const sides = [
      ['north', x0, z0, x1, z0, 0], ['south', x0, z1, x1, z1, 0],
      ['west', x0, z0, x0, z1, Math.PI / 2], ['east', x1, z0, x1, z1, Math.PI / 2],
    ];
    for (const [name, ax, az, bx, bz, rot] of sides) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / step));
      const mid = Math.floor(n / 2);
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (name === gateSide && i === mid) { this.add(F.gate, x, z, { rotY: rot, force: true }); continue; }
        if (name === gateSide && (i === mid - 1 || i === mid + 1)) continue;
        const key = (i === 0 || i === n) ? F.corner : (this.rnd() < 0.08 ? F.broken : F.straight);
        this.add(key, x, z, { rotY: rot, force: true });
      }
    }
  }
  // Grass and road tiles stay in the object list for the editor and for maps
  // without a terrain definition; the game skips grass when it paints the ground.
  toJSON({ omit = [] } = {}) {
    const objects = omit.length ? this.objects.filter(o => !omit.includes(o.key)) : this.objects;
    return { version: 3, gridSnap: 2, worldSize: this.worldSize, spawnX: this.spawnX, spawnZ: this.spawnZ, enemySpawnDistance: this.enemySpawnDistance,
             objects, decals: this.decals, tufts: this.tufts, shafts: this.shafts, streams: this.streams,
             barriers: this.barriers, mires: this.mires, fires: this.fires };
  }
  summary() { return Object.entries(this.counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '); }
  missingSummary() {
    const e = Object.entries(this.missing).sort((a, b) => b[1] - a[1]);
    return e.length ? `not yet registered (${e.length}): ` + e.map(([k, v]) => `${k}×${v}`).join(' ') : 'every asset the map asks for is registered';
  }
}

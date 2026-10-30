/**
 * Procedural models: the ones the image-to-3D pipeline never delivered.
 *
 *   node tools/build-models.mjs            build every model, then run tools/add-assets.mjs
 *   node tools/build-models.mjs <key> ...  build only these
 *
 * Writes Game3DAssets/<key>.glb (normalised like the pipeline's output: 1-unit max
 * dimension, base on y = 0, centred on x/z; Draco geometry, WebP textures) and the
 * registry entries to AssetFactory/catalog/procedural.json, which add-assets.mjs
 * merges the way it merges charred.json.
 *
 * Built in code rather than through ComfyUI/Trellis because these are shapes that
 * pipeline gets wrong: a walkway has to be flat (Trellis made fen_boardwalk_01 a
 * plank on legs), and a volcano is a landmark the size of a hill that has to carry
 * its lava with it. Textures are the game's own ground set, so they sit on the
 * terrain they stand on.
 *
 *   landmark_volcano_cone_01  Emberreach's summit: a flared cone with gullies, a
 *                             crater holding a lava pool, lava streaks down the flanks
 *   fen_walkway_01            Mirefen's fords: plank decking on two stringers, with
 *                             mooring stakes; a few planks askew or missing
 */
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP, KHRMaterialsEmissiveStrength } from '@gltf-transform/extensions';
import { draco, prune, dedup } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'Game3DAssets');
const REGISTRY = path.join(ROOT, 'AssetFactory', 'catalog', 'procedural.json');
const TAU = Math.PI * 2;

// Seeded so a rebuild is byte-for-byte the same model
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ── Mesh accumulation ───────────────────────────────────────────────────────
class Mesh {
  constructor() { this.pos = []; this.uv = []; this.col = []; this.idx = []; }
  // Colours are given as sRGB (what a paint picker shows); glTF vertex colours are linear
  vert(p, uv = [0, 0], c = [1, 1, 1]) { this.pos.push(...p); this.uv.push(...uv); this.col.push(...c.map(v => v ** 2.2), 1); return this.pos.length / 3 - 1; }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  // Smooth normals from the faces around each vertex
  normals() {
    const n = new Float32Array(this.pos.length);
    const P = this.pos;
    for (let i = 0; i < this.idx.length; i += 3) {
      const [a, b, c] = [this.idx[i] * 3, this.idx[i + 1] * 3, this.idx[i + 2] * 3];
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
    }
    for (let i = 0; i < n.length; i += 3) {
      const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
      n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
    }
    return n;
  }
  // An axis-aligned box (flat-shaded: its own vertices per face), yawed about y
  box(cx, cy, cz, sx, sy, sz, yaw, color) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (x, y, z) => [cx + x * c - z * s, cy + y, cz + x * s + z * c];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const faces = [
      [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]],     // top
      [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]], // bottom
      [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],     // +z
      [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], // -z
      [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]],     // +x
      [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], // -x
    ];
    for (const f of faces) {
      const v = f.map(([x, y, z], i) => this.vert(at(x, y, z), [i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0], color));
      this.quad(v[0], v[1], v[2], v[3]);
    }
  }
}

// Fit to the pipeline's convention: max dimension 1, base on y = 0, centred on x/z
function normalise(meshes) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) for (let i = 0; i < m.pos.length; i++) { lo[i % 3] = Math.min(lo[i % 3], m.pos[i]); hi[i % 3] = Math.max(hi[i % 3], m.pos[i]); }
  const k = 1 / Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const off = [(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2];
  for (const m of meshes) for (let i = 0; i < m.pos.length; i++) m.pos[i] = (m.pos[i] - off[i % 3]) * k;
}

// ── glTF assembly ───────────────────────────────────────────────────────────
function texture(doc, file) {
  return doc.createTexture(path.basename(file)).setImage(fs.readFileSync(file)).setMimeType('image/webp');
}
function primitive(doc, buffer, mesh, material) {
  const acc = (type, arr, T) => doc.createAccessor().setType(type).setArray(new T(arr)).setBuffer(buffer);
  return doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', mesh.pos, Float32Array))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(mesh.normals()).setBuffer(buffer))
    .setAttribute('TEXCOORD_0', acc('VEC2', mesh.uv, Float32Array))
    .setAttribute('COLOR_0', acc('VEC4', mesh.col, Float32Array))
    .setIndices(acc('SCALAR', mesh.idx, Uint32Array))
    .setMaterial(material);
}
async function write(key, build) {
  const doc = new Document();
  doc.createExtension(EXTTextureWebP).setRequired(true);
  const buffer = doc.createBuffer();
  const parts = build(doc);                                   // [{ mesh, material }]
  normalise(parts.map(p => p.mesh));
  const m = doc.createMesh(key);
  for (const p of parts) m.addPrimitive(primitive(doc, buffer, p.mesh, p.material));
  doc.createScene(key).addChild(doc.createNode(key).setMesh(m));
  await doc.transform(dedup(), prune(), draco({ method: 'edgebreaker' }));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });
  const out = path.join(OUT_DIR, `${key}.glb`);
  await io.write(out, doc);
  const tris = parts.reduce((n, p) => n + p.mesh.idx.length / 3, 0);
  console.log(`${key}: ${tris} triangles, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

// ── The volcano cone ────────────────────────────────────────────────────────
// Profile in its own units: base radius 1, rim at 0.3, height 0.84 (so the
// footprint is 2 across and the normalised model stands 0.42 tall). The flank is
// y = H * t^1.5 along the slope, so it flares at the foot and steepens to the rim.
function volcano(doc) {
  const R = rng(1984);
  const A = 144, S = 44, H = 0.84, RIM = 0.3, FLOOR_R = 0.19, FLOOR_Y = H - 0.11;
  const gully = (th, t) => 0.07 * Math.sin(7 * th + 2.1 * t) * (0.35 + 0.65 * t) + 0.035 * Math.sin(17 * th + 1.3) * t + 0.02 * Math.sin(29 * th);
  const rock = new Mesh(), lava = new Mesh();
  const flank = (th, t) => {
    const r = (1 - (1 - RIM) * t) * (1 + gully(th, t));
    const y = H * Math.pow(t, 1.5) + 0.03 * Math.sin(11 * th + 4 * t) * t * (1 - t);
    return [Math.cos(th) * r, y, Math.sin(th) * r];
  };
  // Flank: cooler and paler at the foot, scorched and reddened toward the rim
  const grid = [];
  for (let j = 0; j <= S; j++) {
    const t = j / S, row = [];
    for (let i = 0; i <= A; i++) {
      const th = (i / A) * TAU, p = flank(th, t);
      const heat = Math.pow(t, 3), n = 0.9 + 0.1 * Math.sin(37 * th + 9 * t);
      row.push(rock.vert(p, [i / A * 10, (1 - t) * 4], [(0.82 + 0.25 * heat) * n, (0.78 - 0.2 * heat) * n, (0.75 - 0.3 * heat) * n]));
    }
    grid.push(row);
  }
  for (let j = 0; j < S; j++) for (let i = 0; i < A; i++) rock.quad(grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]);
  // Crater wall: from the rim down and in to the lava
  const rimRow = grid[S], wall = [rimRow];
  const W = 6;
  for (let j = 1; j <= W; j++) {
    const t = j / W, row = [];
    for (let i = 0; i <= A; i++) {
      const th = (i / A) * TAU, [rx, ry, rz] = flank(th, 1), rr = Math.hypot(rx, rz);
      const r = rr + (FLOOR_R - rr) * t, y = ry + (FLOOR_Y - ry) * Math.sin(t * Math.PI / 2);
      row.push(rock.vert([Math.cos(th) * r, y, Math.sin(th) * r], [i / A * 10, 4 + t], [1.1, 0.5, 0.35]));
    }
    wall.push(row);
  }
  for (let j = 0; j < W; j++) for (let i = 0; i < A; i++) rock.quad(wall[j][i], wall[j][i + 1], wall[j + 1][i + 1], wall[j + 1][i]);
  // The lava pool: a fan just above the crater floor
  const centre = lava.vert([0, FLOOR_Y + 0.004, 0], [0.5, 0.5]);
  const ringIdx = [];
  for (let i = 0; i <= A; i++) {
    const th = (i / A) * TAU, r = FLOOR_R + 0.01;
    ringIdx.push(lava.vert([Math.cos(th) * r, FLOOR_Y + 0.004, Math.sin(th) * r], [0.5 + Math.cos(th) * 0.5, 0.5 + Math.sin(th) * 0.5]));
  }
  for (let i = 0; i < A; i++) lava.tri(centre, ringIdx[i + 1], ringIdx[i]);
  // Lava streaks: ribbons that spill over the rim and follow a gully down the
  // flank, narrowing and cooling out before the foot
  for (const th0 of [0.35, 1.9, 3.4, 4.6, 5.6]) {
    const len = 0.45 + R() * 0.3, steps = 26;
    let prev = null;
    for (let k = 0; k <= steps; k++) {
      const t = 1 - (k / steps) * len;
      const th = th0 + 0.05 * Math.sin(k * 0.5);
      const p = flank(th, t);
      const w = 0.045 * (1 - 0.7 * k / steps);
      // lift the ribbon a hair off the rock along the surface's outward direction
      const out = [Math.cos(th) * 0.012, 0.012, Math.sin(th) * 0.012];
      const side = [-Math.sin(th) * w, 0, Math.cos(th) * w];
      const a = lava.vert([p[0] + out[0] - side[0], p[1] + out[1], p[2] + out[2] - side[2]], [0, k / 6]);
      const b = lava.vert([p[0] + out[0] + side[0], p[1] + out[1], p[2] + out[2] + side[2]], [1, k / 6]);
      if (prev) lava.quad(prev[0], prev[1], b, a);
      prev = [a, b];
    }
  }
  const G = path.join(ROOT, 'images', 'ground');
  const rockMat = doc.createMaterial('volcano_rock')
    .setBaseColorTexture(texture(doc, path.join(G, 'basalt.webp')))
    .setNormalTexture(texture(doc, path.join(G, 'basalt_n.webp')))
    .setBaseColorFactor([0.78, 0.74, 0.72, 1]).setRoughnessFactor(0.95).setMetallicFactor(0);
  const lavaTex = texture(doc, path.join(G, 'lavaFlow.webp'));
  const strength = doc.createExtension(KHRMaterialsEmissiveStrength).createEmissiveStrength().setEmissiveStrength(2.2);
  const lavaMat = doc.createMaterial('volcano_lava')
    .setBaseColorTexture(lavaTex).setEmissiveTexture(lavaTex).setEmissiveFactor([1, 0.7, 0.45])
    .setRoughnessFactor(0.6).setMetallicFactor(0).setExtension('KHR_materials_emissive_strength', strength);
  return [{ mesh: rock, material: rockMat }, { mesh: lava, material: lavaMat }];
}

// ── The fen walkway ─────────────────────────────────────────────────────────
// One section: 1 long (x), 0.36 wide. Decking on two stringers, mooring stakes at
// the corners standing a little proud. Weathered planks, some greened with moss,
// one or two askew and one missing, so a run of sections never looks stamped.
function walkway(doc) {
  const R = rng(77);
  const m = new Mesh();
  const wood = () => { const v = 0.85 + R() * 0.3; return R() < 0.25 ? [0.36 * v, 0.4 * v, 0.25 * v] : [0.46 * v, 0.35 * v, 0.24 * v]; };
  for (const z of [-0.12, 0.12]) m.box(0, 0.016, z, 1.0, 0.032, 0.035, 0, [0.3, 0.24, 0.17]);
  const N = 12, step = 0.96 / N;
  const missing = 1 + Math.floor(R() * (N - 2));
  for (let i = 0; i < N; i++) {
    if (i === missing) continue;
    const x = -0.48 + step * (i + 0.5);
    m.box(x + (R() - 0.5) * 0.008, 0.032 + 0.01 + R() * 0.004, (R() - 0.5) * 0.02, step * 0.86, 0.018, 0.36 + (R() - 0.5) * 0.03, (R() - 0.5) * 0.08, wood());
  }
  for (const x of [-0.47, 0.47]) for (const z of [-0.17, 0.17]) m.box(x, 0.05, z, 0.035, 0.1, 0.035, R() * 0.5, [0.28, 0.22, 0.16]);
  const mat = doc.createMaterial('fen_walkway').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.9).setMetallicFactor(0);
  return [{ mesh: m, material: mat }];
}

// Registry entries in charred.json's format. defaultScale and radius are the
// game's world units: the cone stands 27 across (maplib already reserves that),
// a walkway section is 4.2 long and 1.5 wide.
const MODELS = {
  landmark_volcano_cone_01: { build: volcano, entry: { name: 'Volcano Cone', category: 'village', defaultScale: 27, obstacle: true, radius: 13, breakable: false, icon: '🏘' } },
  fen_walkway_01: { build: walkway, entry: { name: 'Fen Walkway', category: 'props', defaultScale: 4.2, obstacle: false, radius: 0, breakable: false, icon: '📦' } },
};

const only = process.argv.slice(2);
const registry = fs.existsSync(REGISTRY) ? JSON.parse(fs.readFileSync(REGISTRY, 'utf8')) : [];
for (const [key, def] of Object.entries(MODELS)) {
  if (only.length && !only.includes(key)) continue;
  await write(key, def.build);
  const entry = { key, file: `${key}.glb`, ...def.entry, procedural: true };
  const at = registry.findIndex(e => e.key === key);
  if (at >= 0) registry[at] = entry; else registry.push(entry);
}
fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + '\n');
console.log(`wrote ${path.relative(ROOT, REGISTRY)} (${registry.length} entries) — now run tools/add-assets.mjs`);

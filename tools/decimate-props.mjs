/**
 * Decimate static prop meshes to a triangle budget.
 *
 * Trellis emits every asset at roughly the same marching-cubes density, so a
 * lantern post and a bush both ship at ~99,500 triangles. The scene holds ~67 M
 * triangles as a result, ~19 M of them drawn per frame, and props are small on
 * screen at the gameplay camera — the detail is invisible and the cost is not.
 *
 *   node tools/decimate-props.mjs                     dry run, show the plan
 *   node tools/decimate-props.mjs --apply             write it
 *   node tools/decimate-props.mjs --budget 4000       target triangles per file
 *   node tools/decimate-props.mjs --only a.glb,b.glb  just these
 *   node tools/decimate-props.mjs --min-tris 20000    leave anything already lean
 *
 * SAFETY
 *   - Files containing a skin (every rigged character, enemy and creature) are
 *     skipped: they are seen close up and the simplifier does not respect joint
 *     weights well. Use --include-skinned deliberately if that ever changes.
 *   - Originals are copied to AssetFactory/glb_predecimate/ before the first
 *     write, and the copy is never overwritten, so a re-run cannot lose them.
 *   - `weld` runs first: Trellis meshes carry split vertices that otherwise stop
 *     the simplifier dead (the same note as tools/compress-models.mjs).
 *   - Draco is re-applied so file size stays where it was.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, draco, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'Game3DAssets');
const BACKUP = path.join(ROOT, 'AssetFactory/glb_predecimate');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const flag = n => args.includes('--' + n);

const BUDGET = parseInt(opt('budget', '4000'), 10);
const MIN_TRIS = parseInt(opt('min-tris', '12000'), 10);
const APPLY = flag('apply');
const only = opt('only', null);
const onlySet = only ? new Set(only.split(',').map(s => s.trim())) : null;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
await MeshoptSimplifier.ready;

function countTris(doc) {
  let t = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) {
      const idx = p.getIndices(), pos = p.getAttribute('POSITION');
      t += (idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3;
    }
  return Math.round(t);
}

const files = (onlySet ? [...onlySet] : fs.readdirSync(SRC).filter(f => f.toLowerCase().endsWith('.glb')));
let planned = 0, before = 0, after = 0, skippedSkin = 0, skippedLean = 0, failed = 0;
const rows = [];

for (const f of files) {
  const src = path.join(SRC, f);
  if (!fs.existsSync(src)) { console.log(`missing: ${f}`); continue; }
  let doc;
  try { doc = await io.read(src); }
  catch (e) { failed++; console.log(`FAILED read ${f}: ${e.message.slice(0, 70)}`); continue; }

  if (!flag('include-skinned') && doc.getRoot().listSkins().length > 0) { skippedSkin++; continue; }
  const tris = countTris(doc);
  if (tris < MIN_TRIS) { skippedLean++; continue; }

  const ratio = Math.min(1, BUDGET / tris);
  planned++; before += tris;

  if (!APPLY) {
    after += Math.min(tris, BUDGET);
    rows.push([f, tris, Math.min(tris, BUDGET), ratio]);
    continue;
  }

  try {
    await doc.transform(
      weld({ tolerance: 0.0001 }),
      simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02, lockBorder: false }),
      dedup(), prune(),
      draco(),
    );
    const got = countTris(doc);
    // Back up once, never overwrite an existing backup.
    fs.mkdirSync(BACKUP, { recursive: true });
    const bak = path.join(BACKUP, f);
    if (!fs.existsSync(bak)) fs.copyFileSync(src, bak);
    await io.write(src, doc);
    after += got;
    rows.push([f, tris, got, ratio]);
    console.log(`${f.padEnd(42)} ${String(tris).padStart(8)} → ${String(got).padStart(7)}  (${(100 * got / tris).toFixed(1)}%)`);
  } catch (e) {
    failed++;
    console.log(`FAILED ${f}: ${e.message.slice(0, 80)}`);
  }
}

if (!APPLY) {
  rows.sort((a, b) => b[1] - a[1]);
  console.log('  triangles      → target  file');
  for (const [f, t, g] of rows.slice(0, 25)) console.log(`${String(t).padStart(11)} → ${String(g).padStart(7)}  ${f}`);
}
console.log(`\n${APPLY ? 'DECIMATED' : 'PLAN'}: ${planned} files   ${before.toLocaleString()} → ${after.toLocaleString()} triangles` +
  `  (${before ? (100 * after / before).toFixed(1) : 0}% kept, ${(before - after).toLocaleString()} removed)`);
console.log(`skipped: ${skippedSkin} rigged, ${skippedLean} already under ${MIN_TRIS.toLocaleString()}   failed: ${failed}`);
if (!APPLY) console.log('\nDry run. Re-run with --apply to write (originals are copied to AssetFactory/glb_predecimate/).');

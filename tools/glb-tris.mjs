// Triangle budget report: which GLBs actually cost the GPU.
//   node tools/glb-tris.mjs [dir]     (default Game3DAssets)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(ROOT, process.argv[2] || 'Game3DAssets');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
});

const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.glb'));
const rows = [];
for (const f of files) {
  try {
    const doc = await io.read(path.join(dir, f));
    let tris = 0, prims = 0;
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const p of mesh.listPrimitives()) {
        prims++;
        const idx = p.getIndices();
        const pos = p.getAttribute('POSITION');
        tris += (idx ? idx.getCount() : pos ? pos.getCount() : 0) / 3;
      }
    }
    rows.push({ f, tris: Math.round(tris), prims, kb: Math.round(fs.statSync(path.join(dir, f)).size / 1024) });
  } catch (e) {
    rows.push({ f, tris: -1, prims: 0, kb: 0, err: e.message.slice(0, 60) });
  }
}
rows.sort((a, b) => b.tris - a.tris);
const total = rows.reduce((s, r) => s + Math.max(0, r.tris), 0);
console.log(`${rows.length} GLBs in ${path.relative(ROOT, dir)}   total ${total.toLocaleString()} triangles\n`);
console.log('  triangles   prims     KB  file');
for (const r of rows.slice(0, 30)) {
  console.log(`${String(r.tris.toLocaleString()).padStart(11)} ${String(r.prims).padStart(7)} ${String(r.kb).padStart(6)}  ${r.f}${r.err ? '  ERR ' + r.err : ''}`);
}
const over = rows.filter(r => r.tris > 20000);
console.log(`\nover 20k triangles: ${over.length} files, ${over.reduce((s, r) => s + r.tris, 0).toLocaleString()} triangles (${Math.round(over.reduce((s, r) => s + r.tris, 0) / total * 100)}% of the total)`);
const over50 = rows.filter(r => r.tris > 50000);
console.log(`over 50k triangles: ${over50.length} files, ${over50.reduce((s, r) => s + r.tris, 0).toLocaleString()} triangles`);

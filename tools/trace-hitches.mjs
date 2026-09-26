// List every hitch in a saved frame-trace capture with its surrounding state.
//   node tools/trace-hitches.mjs [path] [thresholdMs]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(ROOT, 'tools/reports');
const file = process.argv[2] && !/^\d+$/.test(process.argv[2]) ? process.argv[2]
  : path.join(dir, fs.readdirSync(dir).filter(f => /^frame-trace-.*\.json$/.test(f))
    .sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs)[0]);
const TH = parseFloat(process.argv.find(a => /^\d+$/.test(a)) || '50');

const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const C = d.cols, F = d.frames, ix = n => C.indexOf(n);
const DT = ix('dt'), T = ix('t'), P = ix('programs'), E = ix('enemies'), W = ix('wave'),
  G = ix('geo'), TX = ix('tex'), CA = ix('calls'), H = ix('heapMB'), CH = ix('children');
console.log(path.relative(ROOT, file), '\n');
console.log('   dt     t  wave  enemies  Δenemies8  Δprog  Δgeo  Δtex  Δheap  Δchildren');
for (let i = 8; i < F.length; i++) {
  if (F[i][DT] <= TH) continue;
  const a = F[i - 1], b = F[i], back = F[i - 8];
  const d8 = b[E] - back[E];
  console.log(
    `${b[DT].toFixed(0).padStart(5)} ${(b[T] / 1000).toFixed(0).padStart(5)}s ${String(b[W]).padStart(4)} ` +
    `${String(b[E]).padStart(7)} ${String(d8 >= 0 ? '+' + d8 : d8).padStart(10)} ` +
    `${String(b[P] - a[P]).padStart(6)} ${String(b[G] - a[G]).padStart(5)} ${String(b[TX] - a[TX]).padStart(5)} ` +
    `${String(b[H] - a[H]).padStart(6)} ${String(b[CH] - a[CH]).padStart(10)}`);
}

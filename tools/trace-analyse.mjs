// Interrogate a tools/reports/frame-trace-*.json capture.
//   node tools/trace-analyse.mjs [path]   (defaults to the newest capture)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(ROOT, 'tools/reports');
const file = process.argv[2] || path.join(dir, fs.readdirSync(dir)
  .filter(f => /^frame-trace-.*\.json$/.test(f))
  .sort((a, b) => fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs)[0]);

const d = JSON.parse(fs.readFileSync(file, 'utf8'));
const C = d.cols, F = d.frames;
const ix = n => C.indexOf(n);
const DT = ix('dt'), T = ix('t'), P = ix('programs'), E = ix('enemies'), L = ix('lights'),
  G = ix('geo'), TX = ix('tex'), CH = ix('children'), H = ix('heapMB'), W = ix('wave');
console.log(path.relative(ROOT, file), `— ${F.length} frames\n`);

const hist = {};
for (const f of F) hist[f[L]] = (hist[f[L]] || 0) + 1;
console.log('light-count distribution:', JSON.stringify(hist));
let flips = 0, lastL = F[0][L];
const flipFrames = [];
for (const f of F) { if (f[L] !== lastL) { flips++; flipFrames.push(`t=${(f[T] / 1000).toFixed(0)}s ${lastL}→${f[L]} (frame ${f[DT].toFixed(0)}ms, programs ${f[P]})`); lastL = f[L]; } }
console.log('light-count flips:', flips);
for (const s of flipFrames.slice(0, 12)) console.log('  ' + s);

let big = 0, nearFlip = 0, nearProg = 0;
for (let i = 3; i < F.length; i++) {
  if (F[i][DT] <= 50) continue;
  big++;
  let flip = false, prog = false;
  for (let j = i - 3; j <= i; j++) {
    if (j > 0 && F[j][L] !== F[j - 1][L]) flip = true;
    if (j > 0 && F[j][P] !== F[j - 1][P]) prog = true;
  }
  if (flip) nearFlip++;
  if (prog) nearProg++;
}
console.log(`\nhitches >50ms: ${big}   within 3 frames of a light flip: ${nearFlip}   of a program change: ${nearProg}`);

// Which direction do programs move on a hitch, and does the count return?
let up = 0, down = 0;
for (let i = 1; i < F.length; i++) {
  if (F[i][P] > F[i - 1][P]) up += F[i][P] - F[i - 1][P];
  if (F[i][P] < F[i - 1][P]) down += F[i - 1][P] - F[i][P];
}
console.log(`program links total: +${up} created, -${down} released over the run (net ${up - down})`);

const prog = F.map(f => f[P]);
console.log(`programs min ${Math.min(...prog)} max ${Math.max(...prog)} first ${prog[0]} last ${prog[prog.length - 1]}`);
const byWave = {};
for (let i = 1; i < F.length; i++) if (F[i][P] > F[i - 1][P]) byWave[F[i][W]] = (byWave[F[i][W]] || 0) + (F[i][P] - F[i - 1][P]);
console.log('program links by wave:', JSON.stringify(byWave));

/**
 * Real-time CPU and allocation profile of an actual run.
 *
 * tools/playtest.mjs profile samples the SIMULATION while it is stepped with
 * rendering off, which is the right tool for sim cost and the wrong one for
 * "what is stalling the frame". This drives a real rAF-driven run and attaches
 * V8's sampling CPU profiler and its allocation sampler through CDP, so it can
 * answer two questions the frame tracer could not:
 *
 *   - where is main-thread time actually going, render included
 *   - what is allocating, i.e. what is feeding the GC pauses that show up as
 *     hitches with no program / geometry / texture change
 *
 *   node tools/cpu-profile.mjs --gpu --minutes 4 [--invuln] [--wave N]
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream' };
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const flag = n => args.includes('--' + n);

const srv = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const BOT = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'tools/playtest.mjs'), 'utf8');
  const m = src.slice(src.indexOf('function botStep(kind) {'));
  return new Function(m.slice(0, m.search(/\r?\n\}\r?\n/) + 4) + '; return botStep("kite");')();
})();

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, protocolTimeout: 900000,
  args: [...(flag('gpu') ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--headless=new']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800', '--mute-audio'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?debug`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__cs, { timeout: 420000 });
await page.evaluate(() => window.__cs.startRun({ character: 'dad', map: 'kingsfield', ogre: 0 }));
if (flag('invuln')) await page.evaluate(() => window.__cs.setInvulnerable(true));

// Frame intervals, so CPU cost can be tied to what the player felt.
await page.evaluate(() => {
  window.__f = [];
  const raf = window.requestAnimationFrame.bind(window);
  let last = performance.now();
  (function t() { const n = performance.now(); window.__f.push(n - last); last = n; raf(t); })();
});

const client = await page.createCDPSession();
await client.send('Profiler.enable');
await client.send('Profiler.setSamplingInterval', { interval: 200 });   // µs
await client.send('HeapProfiler.enable');
await client.send('HeapProfiler.startSampling', { samplingInterval: 16384 });
await client.send('Profiler.start');

const minutes = parseFloat(opt('minutes', '4'));
const stopWave = parseInt(opt('wave', '0'), 10);
for (let s = 0; s < minutes * 60 * 4; s++) {
  await page.evaluate(b => { eval(b); }, BOT);
  await new Promise(r => setTimeout(r, 250));
  const st = await page.evaluate(() => ({ over: window.__cs.state.gameOver, wave: window.__cs.state.wave }));
  if (st.over) { console.log('run ended at', (s / 4).toFixed(0) + 's'); break; }
  if (stopWave && st.wave >= stopWave) { console.log(`reached wave ${st.wave}`); break; }
  await page.evaluate(() => { const d = document.querySelector('.upgrade-btn'); if (d) d.click(); });
}

const { profile } = await client.send('Profiler.stop');
const heap = await client.send('HeapProfiler.stopSampling');
const frames = (await page.evaluate(() => window.__f)).filter(d => d > 0 && d < 5000);
const wave = await page.evaluate(() => window.__cs.state.wave);
await browser.close(); srv.close();

// ── CPU: self time per function ──
const byId = new Map(profile.nodes.map(n => [n.id, n]));
const totalHits = profile.nodes.reduce((s, n) => s + (n.hitCount || 0), 0) || 1;
const durMs = (profile.endTime - profile.startTime) / 1000;
const rows = profile.nodes
  .filter(n => n.hitCount)
  .map(n => {
    const f = n.callFrame;
    const where = f.url ? `${f.url.split('/').pop().split('?')[0]}:${f.lineNumber + 1}` : '';
    return { name: f.functionName || '(anonymous)', where, hits: n.hitCount };
  });
const agg = new Map();
for (const r of rows) {
  const k = `${r.name}|${r.where}`;
  agg.set(k, (agg.get(k) || 0) + r.hits);
}
const top = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 26);

frames.sort((a, b) => a - b);
const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
console.log(`\nrun reached wave ${wave}   ${frames.length} frames   mean ${mean.toFixed(1)} ms (${(1000 / mean).toFixed(1)} fps)`);
console.log(`profiled ${durMs.toFixed(0)} ms of main thread\n`);
console.log('=== CPU self time (share of all samples) ===');
for (const [k, hits] of top) {
  const [name, where] = k.split('|');
  const pct = (hits / totalHits) * 100;
  if (pct < 0.25) continue;
  console.log(`${pct.toFixed(1).padStart(5)}%  ${(hits * durMs / totalHits).toFixed(0).padStart(6)} ms  ${name.padEnd(28)} ${where}`);
}

// ── Allocation: self size per function ──
function walk(node, out) {
  const f = node.callFrame;
  const where = f.url ? `${f.url.split('/').pop().split('?')[0]}:${f.lineNumber + 1}` : '';
  const k = `${f.functionName || '(anonymous)'}|${where}`;
  out.set(k, (out.get(k) || 0) + (node.selfSize || 0));
  for (const c of node.children || []) walk(c, out);
  return out;
}
const alloc = walk(heap.profile.head, new Map());
const totalAlloc = [...alloc.values()].reduce((a, b) => a + b, 0) || 1;
console.log(`\n=== allocation by function (sampled, ${(totalAlloc / 1048576).toFixed(1)} MB total over the run) ===`);
for (const [k, size] of [...alloc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  const pct = (size / totalAlloc) * 100;
  if (pct < 0.5) continue;
  const [name, where] = k.split('|');
  console.log(`${pct.toFixed(1).padStart(5)}%  ${(size / 1048576).toFixed(1).padStart(6)} MB  ${name.padEnd(28)} ${where}`);
}
console.log(`\nallocation rate: ${(totalAlloc / 1048576 / (durMs / 1000)).toFixed(1)} MB/s of sampled allocation`);

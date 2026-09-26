/**
 * Find out WHY a frame hitched, not just that it did.
 *
 * tools/perf-probe.mjs reports the distribution; this one records, for every
 * frame, the cheap counters that explain a spike, then prints each hitch with
 * what changed in the second around it:
 *
 *   - shader programs (a new WebGLProgram links synchronously: the classic stall)
 *   - live enemies, and the spawn burst at a wave start (SkinnedMesh clones)
 *   - adaptive-quality state: shadow on/off, shadow map size, bloom strength
 *     (a castShadow toggle re-links every shadowed material)
 *   - geometries / textures (uploads), scene children, JS heap
 *
 *   node tools/frame-trace.mjs --gpu --minutes 6 [--invuln] [--wave N]
 *                              [--char dad] [--map kingsfield] [--hitch 50]
 *
 * --invuln keeps the bot alive so the trace reaches the waves that actually
 * hurt; without it the run usually dies around wave 6 and the heavy frames
 * are never sampled.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
};
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const flag = n => args.includes('--' + n);

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, url === '/' ? 'index.html' : url);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}
function findBrowser() {
  for (const p of ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(p)) return p;
  throw new Error('No Chrome/Edge found');
}

// The kite bot, lifted from tools/playtest.mjs so both drive the same policy.
const BOT = (() => {
  const src = fs.readFileSync(path.join(ROOT, 'tools/playtest.mjs'), 'utf8');
  const m = src.slice(src.indexOf('function botStep(kind) {'));
  return new Function(m.slice(0, m.search(/\r?\n\}\r?\n/) + 4) + '; return botStep("kite");')();
})();

const { srv, port } = await serve();
const browser = await puppeteer.launch({
  executablePath: findBrowser(), headless: !flag('headed'), protocolTimeout: 900000,
  args: [...(flag('gpu') ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--headless=new']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']),
    '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800', '--mute-audio'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.evaluateOnNewDocument(() => {
  try { const k = 'castleSurvivor_settings'; const d = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...d, privateMode: false, privateUnlocked: true })); } catch {}
});
await page.goto(`http://127.0.0.1:${port}/index.html?debug`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__cs, { timeout: 420000 });

// Per-frame sampler. Everything read here is O(1) so the probe does not
// perturb what it measures.
await page.evaluate(() => {
  const cs = window.__cs, r = cs.three.renderer, dl = cs.three.dirLight, bp = cs.three.bloomPass;
  window.__tr = { f: [], longtasks: [] };
  try {
    new PerformanceObserver(list => { for (const e of list.getEntries()) window.__tr.longtasks.push({ t: e.startTime, dur: e.duration }); })
      .observe({ entryTypes: ['longtask'] });
  } catch {}
  const raf = window.requestAnimationFrame.bind(window);
  let last = performance.now();
  // Light count is a shader-define input: if it changes, every standard
  // material needs a new program. Counting top-level children is cheap, and
  // every light in this game is parented to the scene root.
  let lights = 0, n = 0;
  (function tick() {
    const t = performance.now();
    const info = r.info;
    if ((n++ % 10) === 0) {
      let L = 0;
      const kids = cs.three.scene.children;
      for (let i = 0; i < kids.length; i++) if (kids[i].isLight && kids[i].visible) L++;
      lights = L;
    }
    window.__tr.f.push([
      +(t - last).toFixed(2),            // 0 frame interval
      +(t).toFixed(0),                   // 1 timestamp
      info.programs ? info.programs.length : -1, // 2 shader programs
      cs.enemies.length,                 // 3 enemies
      cs.state.wave,                     // 4 wave
      info.memory.geometries,            // 5 geometries
      info.memory.textures,              // 6 textures
      info.render.calls,                 // 7 draw calls
      dl.castShadow ? dl.shadow.mapSize.x : 0,  // 8 shadow map size (0 = shadows off)
      +bp.strength.toFixed(2),           // 9 bloom strength (adaptive-quality tell)
      cs.three.scene.children.length,    // 10 scene children
      performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0, // 11 heap MB
      lights,                            // 12 visible lights parented to the scene
    ]);
    last = t;
    raf(tick);
  })();
});

await page.evaluate((c, m) => window.__cs.startRun({ character: c, map: m, ogre: 0 }),
  opt('char', 'dad'), opt('map', 'kingsfield'));
if (flag('invuln')) await page.evaluate(() => window.__cs.setInvulnerable(true));
await page.evaluate(() => { window.__tr.f.length = 0; window.__tr.longtasks.length = 0; });  // drop the start-up spike

const minutes = parseFloat(opt('minutes', '6'));
const stopWave = parseInt(opt('wave', '0'), 10);
for (let s = 0; s < minutes * 60 * 4; s++) {
  await page.evaluate(b => { eval(b); }, BOT);
  await new Promise(r => setTimeout(r, 250));
  const st = await page.evaluate(() => ({ over: window.__cs.state.gameOver, wave: window.__cs.state.wave }));
  if (st.over) { console.log('run ended at', (s / 4).toFixed(0) + 's'); break; }
  if (stopWave && st.wave >= stopWave) { console.log(`reached wave ${st.wave} at ${(s / 4).toFixed(0)}s`); break; }
  await page.evaluate(() => { const d = document.querySelector('.upgrade-btn'); if (d) d.click(); });
}

const { f, longtasks } = await page.evaluate(() => window.__tr);
await browser.close(); srv.close();

const HITCH = parseFloat(opt('hitch', '50'));
const dt = f.map(r => r[0]).filter(d => d > 0 && d < 5000).sort((a, b) => a - b);
const pc = p => dt[Math.min(dt.length - 1, Math.floor(dt.length * p))];
const mean = dt.reduce((a, b) => a + b, 0) / dt.length;
console.log(`\nframes: ${dt.length}   mean ${mean.toFixed(1)} ms (${(1000 / mean).toFixed(1)} fps)   max ${dt[dt.length - 1].toFixed(0)} ms`);
console.log(`p50 ${pc(0.5).toFixed(1)}   p90 ${pc(0.9).toFixed(1)}   p99 ${pc(0.99).toFixed(1)}   p99.9 ${pc(0.999).toFixed(1)} ms`);
console.log(`frames over ${HITCH} ms: ${dt.filter(d => d > HITCH).length}    over 100 ms: ${dt.filter(d => d > 100).length}`);

// Attribute each hitch to what changed across it.
const N = ['dt', 't', 'programs', 'enemies', 'wave', 'geo', 'tex', 'calls', 'shadow', 'bloom', 'children', 'heapMB', 'lights'];
const hitches = [];
for (let i = 1; i < f.length; i++) if (f[i][0] > HITCH) hitches.push(i);
console.log(`\n=== ${hitches.length} hitches over ${HITCH} ms, and what changed across each ===`);
const causeTally = {};
for (const i of hitches.slice(0, 40)) {
  const a = f[Math.max(0, i - 1)], b = f[i];
  const d = {};
  for (let k = 2; k < N.length; k++) if (b[k] !== a[k]) d[N[k]] = `${a[k]} → ${b[k]}`;
  // Look back a little further for a spawn burst that set the frame up to fail
  const back = f[Math.max(0, i - 8)];
  const enemyBurst = b[3] - back[3];
  const causes = [];
  if (d.lights) causes.push(`LIGHT COUNT CHANGED (${d.lights}) → relinks every material`);
  if (d.programs) causes.push(`SHADER LINK (${d.programs})`);
  if (d.shadow || d.bloom) causes.push(`ADAPTIVE QUALITY (${d.shadow ? 'shadow ' + d.shadow : ''}${d.bloom ? ' bloom ' + d.bloom : ''})`);
  if (enemyBurst >= 8) causes.push(`SPAWN BURST (+${enemyBurst} enemies in 8 frames)`);
  if (d.wave) causes.push(`WAVE START (${d.wave})`);
  if (!causes.length && d.tex) causes.push(`TEXTURE UPLOAD (${d.tex})`);
  if (!causes.length && d.geo) causes.push(`GEOMETRY (${d.geo})`);
  if (!causes.length && d.heapMB && parseInt(d.heapMB.split(' → ')[1]) < parseInt(d.heapMB.split(' → ')[0])) causes.push(`GC (heap ${d.heapMB})`);
  if (!causes.length) causes.push('unattributed');
  for (const c of causes) causeTally[c.split(' (')[0]] = (causeTally[c.split(' (')[0]] || 0) + 1;
  console.log(`  ${b[0].toFixed(0).padStart(5)} ms  t=${(b[1] / 1000).toFixed(0)}s  wave ${b[4]}  enemies ${b[3]}  →  ${causes.join('  +  ')}`);
}
console.log('\n=== hitch causes, counted ===');
for (const [k, v] of Object.entries(causeTally).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);

// Shader programs and adaptive quality over the run: the two slow creeps.
const first = f[0], last = f[f.length - 1];
console.log(`\nprograms ${first[2]} → ${last[2]}   geometries ${first[5]} → ${last[5]}   textures ${first[6]} → ${last[6]}   heap ${first[11]} → ${last[11]} MB`);
const aqChanges = [];
for (let i = 1; i < f.length; i++) if (f[i][8] !== f[i - 1][8] || f[i][9] !== f[i - 1][9]) aqChanges.push(`t=${(f[i][1] / 1000).toFixed(0)}s shadow ${f[i - 1][8]}→${f[i][8]} bloom ${f[i - 1][9]}→${f[i][9]} (frame ${f[i][0].toFixed(0)} ms)`);
console.log(`\nadaptive-quality transitions: ${aqChanges.length}`);
for (const c of aqChanges.slice(0, 20)) console.log('  ' + c);
if (longtasks.length) {
  longtasks.sort((a, b) => b.dur - a.dur);
  console.log(`\nlongest main-thread tasks: ${longtasks.slice(0, 8).map(l => l.dur.toFixed(0) + ' ms').join(', ')}`);
}
const out = path.join(ROOT, 'tools/reports', `frame-trace-${Date.now()}.json`);
fs.writeFileSync(out, JSON.stringify({ cols: N, frames: f, longtasks }));
console.log(`\nraw frames → ${path.relative(ROOT, out)}`);

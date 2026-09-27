/**
 * What does a frame actually cost the GPU, and which pass costs it?
 *
 * The main thread is ~83% idle at the 60 Hz cap (PLAN 39), so frame rate on a
 * weaker machine is set by GPU work, not JS. Measuring that needs two things the
 * other tools do not do: the vsync cap off, and the simulation frozen — because
 * the game loop is frame-coupled, so an uncapped run at 300 fps also does 5x the
 * simulation and measures the wrong thing entirely.
 *
 * So: play to a wave with a full scene, freeze the simulation, keep rendering,
 * run uncapped, and time frames. Then toggle one pass at a time and re-measure.
 * The difference is that pass's cost.
 *
 *   node tools/gpu-budget.mjs --wave 12 [--map kingsfield] [--seconds 5]
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream' };
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };

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
  args: ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--headless=new',
    '--disable-gpu-vsync', '--disable-frame-rate-limit',
    '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800', '--mute-audio'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?debug`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__cs, { timeout: 420000 });
await page.evaluate((m) => window.__cs.startRun({ character: 'dad', map: m, ogre: 0 }), opt('map', 'kingsfield'));
await page.evaluate(() => { window.__cs.setInvulnerable(true); window.__cs.setLoopUpdates(false); window.__cs.setRendering(false); });

// Build a realistic scene: bot to the target wave with rendering off.
const target = parseInt(opt('wave', '12'), 10);
for (let i = 0; i < 4000; i++) {
  const st = await page.evaluate((b) => {
    const cs = window.__cs;
    for (let k = 0; k < 8; k++) { eval(b); cs.step(0.25); if (cs.state.paused || cs.state.gameOver) break; }
    return { wave: cs.state.wave, paused: cs.state.paused && cs.upgradeScreenOpen, over: cs.state.gameOver };
  }, BOT);
  if (st.over) { console.log('died before target wave'); break; }
  if (st.paused) { await page.evaluate(() => { const d = document.querySelector('.upgrade-btn'); if (d) d.click(); }); continue; }
  if (st.wave >= target) break;
}
const scene = await page.evaluate(() => ({ wave: window.__cs.state.wave, enemies: window.__cs.counts().live }));
console.log(`scene: wave ${scene.wave}, ${scene.enemies} live enemies\n`);

// Freeze the simulation, keep drawing. Every configuration then renders the
// identical scene, so the only variable is the pass being toggled.
await page.evaluate(() => { window.__cs.setRendering(true); window.__cs.clearFlash(); });

const SECONDS = parseFloat(opt('seconds', '5'));
async function measure(label, setup) {
  await page.evaluate(setup);
  await new Promise(r => setTimeout(r, 400));                 // let it settle
  await page.evaluate(() => {
    window.__g = [];
    const raf = window.requestAnimationFrame.bind(window);
    let last = performance.now();
    window.__gStop = false;
    (function t() { const n = performance.now(); window.__g.push(n - last); last = n; if (!window.__gStop) raf(t); })();
  });
  await new Promise(r => setTimeout(r, SECONDS * 1000));
  const f = await page.evaluate(() => { window.__gStop = true; return window.__g; });
  const d = f.filter(x => x > 0 && x < 1000).sort((a, b) => a - b);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  const p95 = d[Math.floor(d.length * 0.95)];
  console.log(`${label.padEnd(30)} ${mean.toFixed(2).padStart(7)} ms  ${(1000 / mean).toFixed(0).padStart(5)} fps   p95 ${p95.toFixed(2)} ms   (${d.length} frames)`);
  return mean;
}

const base = await measure('everything on', () => {});
await measure('bloom off', () => { window.__cs.three.bloomPass.enabled = false; });
await measure('bloom + AO off', () => { const t = window.__cs.three.gtaoPass; if (t) t.enabled = false; });
await measure('+ shadows off', () => { window.__cs.three.dirLight.castShadow = false; });
await measure('+ props hidden', () => {
  window.__hidden = [];
  window.__cs.three.scene.traverse(o => { if ((o.isMesh || o.isInstancedMesh) && o.visible && !o.isSkinnedMesh && !o.isSprite) { o.visible = false; window.__hidden.push(o); } });
});
await measure('restore all', () => {
  for (const o of window.__hidden || []) o.visible = true;
  window.__cs.three.dirLight.castShadow = true;
  window.__cs.three.bloomPass.enabled = true;
  const t = window.__cs.three.gtaoPass; if (t) t.enabled = true;
});
const info = await page.evaluate(() => window.__cs.renderTime ? window.__cs.renderTime(20) : null);
console.log(`\nrenderer: ${info ? `${info.drawCalls} draw calls, ${info.triangles.toLocaleString()} triangles` : 'n/a'}`);
console.log(`baseline ${base.toFixed(2)} ms/frame uncapped with the simulation frozen`);
await browser.close(); srv.close();

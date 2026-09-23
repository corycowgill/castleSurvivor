/**
 * Measure real frame pacing during a bot-driven run.
 *
 * Companion to tools/shader-churn.mjs. That one answers "what is being
 * recompiled"; this one answers "what does the player feel". It hooks
 * requestAnimationFrame inside the page and records every frame interval, then
 * reports the same percentiles and fps bands as a DevTools trace so the numbers
 * are directly comparable to one.
 *
 *   node tools/perf-probe.mjs --gpu --minutes 3 [--char dad] [--map kingsfield]
 *
 * Always pass --gpu for numbers that mean anything: SwiftShader is a software
 * rasteriser and its frame times are unrelated to a real machine's.
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
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.wav': 'audio/wav',
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
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe']) if (fs.existsSync(p)) return p;
  throw new Error('No Chrome/Edge found');
}

const BOT = `(() => { const cs = window.__cs, p = cs.playerPos; if (!p) return;
  let vx = 0, vz = 0;
  for (const e of cs.enemies) { const dx = p.x - e.mesh.position.x, dz = p.z - e.mesh.position.z;
    const d = Math.hypot(dx, dz) || 1; if (d < 14) { vx += dx / d / d * 8; vz += dz / d / d * 8; } }
  if (Math.abs(p.x) > 60 || Math.abs(p.z) > 60) { vx = -p.x; vz = -p.z; }
  const m = Math.hypot(vx, vz) || 1;
  cs.keys.w = vz / m < -0.3; cs.keys.s = vz / m > 0.3; cs.keys.a = vx / m < -0.3; cs.keys.d = vx / m > 0.3; })()`;

const main = async () => {
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
  await page.goto(`http://127.0.0.1:${port}/index.html?debug`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cs, { timeout: 420000 });

  // Record every frame interval from inside the page
  await page.evaluate(() => {
    window.__frames = [];
    const raf = window.requestAnimationFrame.bind(window);
    let last = performance.now();
    (function tick() { const t = performance.now(); window.__frames.push(t - last); last = t; raf(tick); })();
  });

  await page.evaluate((c, m) => window.__cs.startRun({ character: c, map: m, ogre: 0 }),
    opt('char', 'dad'), opt('map', 'kingsfield'));
  await page.evaluate(() => { window.__frames.length = 0; });   // drop the start-up spike

  const minutes = parseFloat(opt('minutes', '3'));
  for (let s = 0; s < minutes * 60 * 4; s++) {
    await page.evaluate(b => { eval(b); }, BOT);
    await new Promise(r => setTimeout(r, 250));
    if (await page.evaluate(() => window.__cs.state.gameOver)) { console.log('run ended at', (s / 4).toFixed(0) + 's'); break; }
    await page.evaluate(() => { const d = document.querySelector('.upgrade-btn'); if (d) d.click(); });
  }

  const f = (await page.evaluate(() => window.__frames)).filter(d => d > 0 && d < 3000);
  f.sort((a, b) => a - b);
  const pc = p => f[Math.min(f.length - 1, Math.floor(f.length * p))];
  const mean = f.reduce((a, b) => a + b, 0) / f.length;
  console.log(`\nframes: ${f.length}   mean ${mean.toFixed(1)} ms (${(1000 / mean).toFixed(1)} fps)`);
  console.log('=== frame interval percentiles ===');
  for (const p of [0.5, 0.75, 0.9, 0.95, 0.99])
    console.log(`  p${(p * 100).toFixed(0).padStart(2)}  ${pc(p).toFixed(1).padStart(7)} ms   ${(1000 / pc(p)).toFixed(1).padStart(6)} fps`);
  console.log(`  max  ${f[f.length - 1].toFixed(1).padStart(7)} ms`);

  const bands = [['60+', 0, 16.7], ['45-60', 16.7, 22.2], ['30-45', 22.2, 33.4], ['20-30', 33.4, 50], ['10-20', 50, 100], ['<10', 100, 1e9]];
  console.log('=== frames by fps band ===');
  for (const [name, lo, hi] of bands) {
    const n = f.filter(d => d >= lo && d < hi).length;
    console.log(`  ${name.padEnd(6)} ${String(n).padStart(6)}  ${((n / f.length) * 100).toFixed(1)}%`);
  }
  const below30 = f.filter(d => d > 33.4).length;
  console.log(`\n  frames below 30 fps: ${below30} (${((below30 / f.length) * 100).toFixed(2)}%)`);
  console.log(`  frames over 100 ms (visible hitch): ${f.filter(d => d > 100).length}`);

  await browser.close(); srv.close();
};
main().catch(e => { console.error(e); process.exit(1); });

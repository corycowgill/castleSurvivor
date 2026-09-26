/**
 * Name the materials behind shader-program churn.
 *
 * tools/frame-trace.mjs shows programs being created and released thousands of
 * times a run; this says WHICH materials do it. It patches Material.dispose and
 * the renderer's program acquisition inside the page and tallies by material
 * type + name, so the offending call site is identifiable by name rather than
 * guessed at.
 *
 *   node tools/mat-churn.mjs --gpu --minutes 3 [--invuln]
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream' };
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
  args: [...(flag('gpu') ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--headless=new'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800', '--mute-audio'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?debug`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__cs, { timeout: 420000 });

await page.evaluate(() => {
  const cs = window.__cs;
  window.__mc = { disposed: {}, created: {}, stacks: {} };
  // Find Material.prototype by walking up from any live material
  let mat = null;
  cs.three.scene.traverse(o => { if (!mat && o.material) mat = Array.isArray(o.material) ? o.material[0] : o.material; });
  let proto = Object.getPrototypeOf(mat);
  while (proto && !Object.prototype.hasOwnProperty.call(proto, 'dispose')) proto = Object.getPrototypeOf(proto);
  const origDispose = proto.dispose;
  proto.dispose = function () {
    const k = `${this.type}|${this.name || '(unnamed)'}`;
    window.__mc.disposed[k] = (window.__mc.disposed[k] || 0) + 1;
    if (!window.__mc.stacks[k]) {
      // Two frames up is the caller inside index.html
      window.__mc.stacks[k] = (new Error().stack || '').split('\n').slice(1, 5).join(' | ');
    }
    return origDispose.apply(this, arguments);
  };
  // Count new programs by watching the renderer's own list each frame
  const r = cs.three.renderer;
  let prev = r.info.programs ? r.info.programs.length : 0;
  const raf = window.requestAnimationFrame.bind(window);
  (function tick() {
    const n = r.info.programs ? r.info.programs.length : 0;
    if (n > prev) window.__mc.created.links = (window.__mc.created.links || 0) + (n - prev);
    if (n < prev) window.__mc.created.releases = (window.__mc.created.releases || 0) + (prev - n);
    prev = n;
    raf(tick);
  })();
});

await page.evaluate(() => window.__cs.startRun({ character: 'dad', map: 'kingsfield', ogre: 0 }));
if (flag('invuln')) await page.evaluate(() => window.__cs.setInvulnerable(true));
await page.evaluate(() => { window.__mc.disposed = {}; window.__mc.created = {}; });

const minutes = parseFloat(opt('minutes', '3'));
for (let s = 0; s < minutes * 60 * 4; s++) {
  await page.evaluate(b => { eval(b); }, BOT);
  await new Promise(r => setTimeout(r, 250));
  if (await page.evaluate(() => window.__cs.state.gameOver)) { console.log('run ended at', (s / 4).toFixed(0) + 's'); break; }
  await page.evaluate(() => { const d = document.querySelector('.upgrade-btn'); if (d) d.click(); });
}
const mc = await page.evaluate(() => window.__mc);
const kills = await page.evaluate(() => window.__cs.state.kills);
await browser.close(); srv.close();

console.log(`\nkills: ${kills}   program links: ${mc.created.links || 0}   releases: ${mc.created.releases || 0}`);
console.log('\n=== material.dispose() calls, by material ===');
const rows = Object.entries(mc.disposed).sort((a, b) => b[1] - a[1]);
for (const [k, v] of rows.slice(0, 15)) console.log(`  ${String(v).padStart(6)}  ${k}`);
console.log('\n=== first call site per material ===');
for (const [k] of rows.slice(0, 8)) console.log(`  ${k}\n      ${(mc.stacks[k] || '').slice(0, 300)}`);

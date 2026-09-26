// Prove the studio ident plays before the loading screen, and capture it.
//   node tools/intro-shot.mjs            (frames at 0.3s, 1.2s, 2.4s, 3.6s, 6s)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools/shots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream' };
const srv = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, protocolTimeout: 300000,
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--headless=new', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800', '--mute-audio'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e.message || e)));
page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push('console: ' + m.text()); });

// NOTE: deliberately no ?debug — that flag skips the ident by design.
const t0 = Date.now();
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
const marks = [300, 1200, 2400, 3600, 6000];
let i = 0;
for (const ms of marks) {
  const wait = ms - (Date.now() - t0);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  const state = await page.evaluate(() => {
    const ov = [...document.body.children].find(el => el.style && el.style.zIndex === '2147483647');
    const ls = document.getElementById('loading-screen');
    const ss = document.getElementById('start-screen');
    return {
      intro: !!ov,
      loading: !!ls && getComputedStyle(ls).display !== 'none',
      title: !!ss && getComputedStyle(ss).display !== 'none',
    };
  });
  const f = path.join(OUT, `intro-${++i}-${ms}ms.png`);
  await page.screenshot({ path: f });
  console.log(`${String(ms).padStart(5)}ms  intro=${state.intro ? 'YES' : 'no '}  loading=${state.loading ? 'YES' : 'no '}  title=${state.title ? 'YES' : 'no '}  → ${path.relative(ROOT, f)}`);
}
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 6).join('\n') : 'no errors');
await browser.close(); srv.close();

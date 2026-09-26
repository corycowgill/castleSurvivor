// Co-op HUD capture: three knights, one down, nameplates in the world.
import http from 'http';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve('C:/Users/coryc/castleSurvivor');
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, protocolTimeout: 600000,
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--headless=new', '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800', '--mute-audio'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e.message || e)));
await page.evaluateOnNewDocument(() => { try { const k = 'castleSurvivor_settings'; const d = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...d, privateMode: false, privateUnlocked: true })); } catch {} });
await page.goto(`http://127.0.0.1:${port}/index.html?debug`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__cs, { timeout: 240000 });
const src = fs.readFileSync(path.join(ROOT, 'tools/playtest.mjs'), 'utf8');
const m = src.slice(src.indexOf('function botStep(kind) {'));
const botStep = new Function(m.slice(0, m.search(/\r?\n\}\r?\n/) + 4) + '; return botStep("kite");')();
await page.evaluate(async () => { const cs = window.__cs; await cs.startRun({ character: 'dad', map: 'kingsfield', ogre: 0 }); await cs.joinPlayer('brennan', { type: 'pad', index: 1 }); await cs.joinPlayer('parker', { type: 'kb' }); });
await page.evaluate(() => { window.__cs.setLoopUpdates(false); window.__cs.setRendering(false); });
for (let i = 0; i < 300; i++) {
  const st = await page.evaluate((b) => { const cs = window.__cs; for (let k = 0; k < 8; k++) { eval(b); cs.step(0.25); if (cs.state.paused || cs.state.gameOver) break; } return { wave: cs.state.wave, over: cs.state.gameOver, paused: cs.state.paused && cs.upgradeScreenOpen }; }, botStep);
  if (st.over) break;
  if (st.paused) { await page.evaluate(() => { const b = document.querySelector('.upgrade-btn'); b && b.click(); }); continue; }
  if (st.wave >= 4) break;
}
// Park the companions near P1, knock P3 down, then render
await page.evaluate(() => {
  const cs = window.__cs; const p1 = cs.players[0].mesh.position;
  cs.players[1].mesh.position.set(p1.x + 4, p1.y, p1.z + 1);
  cs.players[2].mesh.position.set(p1.x - 3, p1.y, p1.z + 3);
  const ps = cs.players[2].state; ps.hp = 0; ps.isDead = true; ps.bleedOut = 24; ps.reviveProgress = 0;
  cs.setRendering(true); cs.setInvulnerable(true); cs.clearFlash();
});
await page.evaluate((b) => { const cs = window.__cs; for (let k = 0; k < 12; k++) { if (k % 5 === 0) eval(b); cs.step(0.05); } }, botStep);
await sleep(800);
await page.screenshot({ path: path.join(OUT, 'ui-coop.png') });
console.log('saved tools/shots/ui-coop.png', errors.length ? 'ERRORS: ' + errors.slice(0, 5).join(' | ') : 'no errors');
await browser.close(); srv.close();

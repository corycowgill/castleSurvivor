// UI verification captures (title, Muster, level-up, HUD, pause, end screen). Usage: node tools/ui-shots.mjs [1280x800|390x844|844x390]
import http from 'http';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve('C:/Users/coryc/castleSurvivor');
const OUT = path.join(ROOT, 'tools/shots');
const size = (process.argv[2] || '1280x800').split('x').map(Number);
const phone = size[0] < 1000;
const tag = phone ? `ui-${size[0]}x${size[1]}` : 'ui';
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
  args: ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--headless=new', '--autoplay-policy=no-user-gesture-required', `--window-size=${size[0]},${size[1]}`, '--mute-audio'],
  defaultViewport: { width: size[0], height: size[1], deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone },
});
const page = await browser.newPage();
if (phone) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
const errors = [];
page.on('pageerror', e => errors.push(String(e.message || e)));
page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push('console: ' + m.text()); });
await page.evaluateOnNewDocument(() => { try { const k = 'castleSurvivor_settings'; const d = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...d, privateMode: false, privateUnlocked: true })); localStorage.setItem('castleSurvivor_lastQuest', JSON.stringify({ who: 'Brennan', map: 'Kingsfield', wave: 20, grade: 'A', gold: 7795, victory: true })); } catch {} });
await page.goto(`http://127.0.0.1:${port}/index.html?debug`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__cs, { timeout: 240000 });
await sleep(1200);
const shot = async (n) => { const f = path.join(OUT, `${tag}-${n}.png`); await page.screenshot({ path: f }); console.log('saved', path.relative(ROOT, f)); };
await shot('title');
await page.evaluate(() => document.getElementById('play-btn').click()); await sleep(900);
await shot('muster');
const src = fs.readFileSync(path.join(ROOT, 'tools/playtest.mjs'), 'utf8');
const m = src.slice(src.indexOf('function botStep(kind) {'));
const botStep = new Function(m.slice(0, m.search(/\r?\n\}\r?\n/) + 4) + '; return botStep("kite");')();
await page.evaluate(async () => { await window.__cs.startRun({ character: 'dad', map: 'kingsfield', ogre: 0 }); });
await page.evaluate(() => { window.__cs.setLoopUpdates(false); window.__cs.setRendering(false); });
let lvShot = false;
for (let i = 0; i < 600; i++) {
  const st = await page.evaluate((b) => { const cs = window.__cs; for (let k = 0; k < 8; k++) { eval(b); cs.step(0.25); if (cs.state.paused || cs.state.gameOver) break; } return { wave: cs.state.wave, over: cs.state.gameOver, paused: cs.state.paused && cs.upgradeScreenOpen }; }, botStep);
  if (st.over) break;
  if (st.paused) {
    if (!lvShot && st.wave >= 4) { await page.evaluate(() => window.__cs.setRendering(true)); await sleep(500); await shot('levelup'); lvShot = true; }
    await page.evaluate(() => { const btns = [...document.querySelectorAll('.upgrade-btn')]; const b = btns.find(x => /NEW|RELIC/.test(x.textContent)) || btns[0]; b && b.click(); });
    continue;
  }
  if (st.wave >= 8) break;
}
await page.evaluate(() => { const cs = window.__cs; cs.setRendering(true); cs.setInvulnerable(true); cs.clearFlash(); cs.spawnBoss && cs.spawnBoss(); });
await page.evaluate((b) => { const cs = window.__cs; for (let k = 0; k < 30; k++) { if (k % 5 === 0) eval(b); cs.step(0.05); } }, botStep);
await sleep(700);
await shot('hud');
// Touch-control check (closes the open piece of PLAN 18.7): the stick zone must be
// live on a touch device in either orientation while a run is on.
// `touch-gameplay` is removed at game over, so a dead run reads as hidden
// controls; that false positive is what made portrait look broken before.
const touch = await page.evaluate(() => ({ isTouch: 'ontouchstart' in window || navigator.maxTouchPoints > 0, live: !window.__cs.state.gameOver && window.__cs.state.started !== false, body: document.body.className, controls: getComputedStyle(document.getElementById('touch-controls')).display, stickZone: getComputedStyle(document.getElementById('touch-stick-zone')).display }));
console.log('touch check', JSON.stringify(touch), !phone ? '(desktop)'
  : !touch.live ? 'SKIP (run already over)'
  : touch.controls === 'block' && touch.stickZone === 'block' ? 'PASS' : 'FAIL touch controls hidden during play');
await page.keyboard.press('Escape'); await sleep(600); await shot('pause'); await page.keyboard.press('Escape'); await sleep(200);
// End screen: kill the knight
await page.evaluate(() => { const cs = window.__cs; cs.setInvulnerable(false); cs.state.player.hp = 1; cs.state.player.maxHp = Math.max(cs.state.player.maxHp, 1); cs.keys.KeyW = cs.keys.KeyA = cs.keys.KeyS = cs.keys.KeyD = false; });
for (let i = 0; i < 400; i++) {
  const st = await page.evaluate(() => { const cs = window.__cs; cs.state.player.hp = Math.min(cs.state.player.hp, 1); cs.step(0.25); return { over: cs.state.gameOver, paused: cs.state.paused && cs.upgradeScreenOpen }; });
  if (st.over) break;
  if (st.paused) await page.evaluate(() => { const b = document.querySelector('.upgrade-btn'); b && b.click(); });
}
await sleep(1200); await shot('gameover');
await page.evaluate(() => document.getElementById('go-menu-btn').click()); await sleep(900); await shot('menu-after');
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'no errors');
await browser.close(); srv.close();

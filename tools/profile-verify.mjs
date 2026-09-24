/**
 * Verify the per-knight profile system.
 *
 * One profile per knight: gold and Forge ranks are per profile, while weapon
 * unlocks, mastery, wins and the Ogre ladder stay shared across the family.
 * This drives the real page and checks the store end to end, including the
 * migration from the v1 single-wallet save.
 *
 *   node tools/profile-verify.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg',
  '.css': 'text/css', '.wasm': 'application/wasm', '.bin': 'application/octet-stream', '.wav': 'audio/wav',
};

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(42)} ${detail}`); };

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
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new', protocolTimeout: 900000,
  args: ['--use-angle=d3d11', '--no-sandbox', '--disable-gpu-sandbox', '--mute-audio'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

// Private Mode ships on and hides two of the three knights. The harness drives
// all of them, so it seeds the unlock before any page script runs.
await page.evaluateOnNewDocument(() => {
  try {
    const k = 'castleSurvivor_settings';
    const d = JSON.parse(localStorage.getItem(k) || '{}');
    localStorage.setItem(k, JSON.stringify({ ...d, privateMode: false, privateUnlocked: true }));
  } catch {}
});

// ── Seed a v1 save BEFORE the page scripts run, so migration is exercised ──
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('castleSurvivor_meta', JSON.stringify({
  gold: 777, ranks: { vitality: 2 }, achievements: ['wave10'], mastery: { sword: 400 }, wins: 3, ogreUnlocked: 2,
})));
await page.goto(`http://127.0.0.1:${port}/index.html?debug`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__cs, { timeout: 420000 });

console.log('\n=== migration from the v1 single wallet ===');
const mig = await page.evaluate(() => {
  const cs = window.__cs;
  const save = cs.loadSave();
  return { version: save.version, profiles: save.profiles, shared: save.shared };
});
check('save upgrades to version 2', mig.version === 2, `v${mig.version}`);
check('every knight keeps the old gold', ['dad', 'brennan', 'parker'].every(k => mig.profiles[k].gold === 777),
  JSON.stringify(Object.fromEntries(Object.entries(mig.profiles).map(([k, v]) => [k, v.gold]))));
check('every knight keeps the old ranks', ['dad', 'brennan', 'parker'].every(k => mig.profiles[k].ranks.vitality === 2));
check('unlocks stay shared', mig.shared.achievements.includes('wave10') && mig.shared.ogreUnlocked === 2 && mig.shared.wins === 3,
  JSON.stringify(mig.shared));

console.log('\n=== wallets are independent ===');
const indep = await page.evaluate(() => {
  const cs = window.__cs;
  const m = cs.loadMeta('brennan');
  m.gold = 50;
  m.ranks = { might: 1 };
  cs.saveMeta(m, 'brennan');
  const s = cs.loadSave();
  return { dad: s.profiles.dad.gold, brennan: s.profiles.brennan.gold, parker: s.profiles.parker.gold,
           dadRanks: s.profiles.dad.ranks, brennanRanks: s.profiles.brennan.ranks };
});
check('spending from one wallet leaves others', indep.dad === 777 && indep.parker === 777 && indep.brennan === 50,
  `dad ${indep.dad} brennan ${indep.brennan} parker ${indep.parker}`);
check('Forge ranks are per knight', indep.brennanRanks.might === 1 && !indep.dadRanks.might);

console.log('\n=== a co-op run pays every knight into their own profile ===');
await page.evaluate(() => window.__cs.startRun({ character: 'dad', map: 'kingsfield', ogre: 0 }));
await page.evaluate(async () => {
  await window.__cs.joinPlayer('brennan', { type: 'pad', index: 0 });
  await window.__cs.joinPlayer('parker', { type: 'kb' });
});
const before = await page.evaluate(() => {
  const s = window.__cs.loadSave();
  return { dad: s.profiles.dad.gold, brennan: s.profiles.brennan.gold, parker: s.profiles.parker.gold };
});
// Advance far enough that the run is worth something, then end it
await page.evaluate(() => { window.__cs.state.wave = 6; window.__cs.state.kills = 250; window.__cs.state.score = 4000; });
await page.evaluate(() => window.__cs.triggerGameOver && window.__cs.triggerGameOver());
await page.evaluate(() => { for (const p of window.__cs.players) window.__cs.triggerPlayerDeath(p); });
for (let i = 0; i < 60; i++) await page.evaluate(() => window.__cs.step(0.1));
await new Promise(r => setTimeout(r, 900));
const after = await page.evaluate(() => {
  const s = window.__cs.loadSave();
  return { dad: s.profiles.dad.gold, brennan: s.profiles.brennan.gold, parker: s.profiles.parker.gold, over: window.__cs.state.gameOver };
});
const gained = { dad: after.dad - before.dad, brennan: after.brennan - before.brennan, parker: after.parker - before.parker };
console.log(`  gold gained: ${JSON.stringify(gained)} (run ended: ${after.over})`);
check('all three knights were paid', gained.dad > 0 && gained.brennan > 0 && gained.parker > 0, JSON.stringify(gained));
check('nobody is short-changed for co-op', gained.dad === gained.brennan && gained.brennan === gained.parker,
  'equal payouts (Golden Touch ranks are equal here)');

check('no JS errors', errors.length === 0, errors.slice(0, 2).join(' | ') || 'none');

console.log(`\n  ${pass}/${pass + fail} passed`);
await browser.close(); srv.close();
process.exit(fail ? 1 : 0);

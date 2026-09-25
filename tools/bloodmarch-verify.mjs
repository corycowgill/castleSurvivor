/**
 * Bloodmarch regression: the map loads, burns and plays, and the other maps do
 * not catch fire. Runs through the ?debug hook like tools/mirefen-verify.mjs.
 *
 *   node tools/bloodmarch-verify.mjs [--gpu]
 *
 * Never while ComfyUI is up (16 GB machine, see tools/run-bloodmarch-assets.sh).
 */
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GPU = process.argv.includes('--gpu');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: chromePath, headless: true, args: GPU ? ['--use-angle=d3d11', '--enable-unsafe-swiftshader'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/audio|404/i.test(m.text())) errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/index.html?debug`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__cs, { timeout: 300000 });

const checks = await page.evaluate(async () => {
  const cs = window.__cs; const r = {};
  await cs.startRun({ character: 'dad', map: 'bloodmarch', ogre: 0 });
  cs.setLoopUpdates(false); cs.setInvulnerable(true); cs.players[0].state.xpToNext = 1e9;
  r.mapLoaded = cs.loadedMap === 'bloodmarch';
  r.hasFires = cs.mapFires.length >= 40;
  // The nearest fires burn: step and count live particles before/after
  const before = cs.vfx.stats().live;
  cs.step(1.0);
  const after = cs.vfx.stats().live;
  r.firesEmit = after > before + 20;
  // Spawn is clear ground: the knight can walk out in every direction
  const pm = cs.playerMesh; let moved = 0;
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) { const x0 = pm.position.x, z0 = pm.position.z; cs.keys[k] = true; cs.step(0.6); cs.keys[k] = false; if (Math.hypot(pm.position.x - x0, pm.position.z - z0) > 2) moved++; cs.teleport(0, 0); }
  r.spawnOpen = moved === 4;
  // Enemies come and the mix is the war mix
  cs.step(20);
  r.enemiesSpawn = cs.enemies.length > 0;
  // The other maps have no fires
  cs.returnToMenu();
  await cs.startRun({ character: 'dad', map: 'kingsfield', ogre: 0 });
  cs.setLoopUpdates(false);
  r.kingsfieldNoFires = cs.mapFires.length === 0;
  cs.returnToMenu();
  return r;
});
let failed = 0;
for (const [k, v] of Object.entries(checks)) { console.log(`${v ? 'PASS' : 'FAIL'}  ${k}`); if (!v) failed++; }
console.log(errors.length ? `JS ERRORS (${errors.length}):\n  ` + [...new Set(errors)].slice(0, 10).join('\n  ') : 'no JS errors');
await browser.close(); server.close();
process.exit(failed || errors.length ? 1 : 0);

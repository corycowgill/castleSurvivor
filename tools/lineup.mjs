// An enemy line-up: one of every type, elites and both bosses, parked at fixed
// distances around a frozen knight and photographed from the gameplay camera.
//
// `playtest action` takes combat frames, which is the right tool for judging VFX
// in motion but the wrong one for judging whether you can TELL A GOBLIN FROM THE
// GROUND: the bot kites, the camera lerps after it, and half the captures come
// back with the fight off screen. This is deterministic. Every enemy is where the
// script put it, the archer is frozen mid-draw and the ogre mid-swing, so two
// runs of this on two commits are directly comparable.
//
//   node tools/lineup.mjs [--map kingsfield] [--tag lineup] [--wave 12]
//                         [--zoom 1.45] [--r1 7] [--r2 12]
//
// `--r1` / `--r2` are the radii of the two rings: ordinary spawns at r1, forced
// elites at r2. `--tag` names the output, so `--tag before` / `--tag after` on two
// commits gives a pair of directly comparable frames.
import http from 'http';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), '..'));
const OUT = path.join(ROOT, 'tools/shots');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const MAP = opt('map', 'kingsfield');
const TAG = opt('tag', 'lineup');
const WAVE = parseInt(opt('wave', '12'), 10);
const ZOOM = parseFloat(opt('zoom', '1.45'));
const R1 = parseFloat(opt('r1', '7'));
const R2 = parseFloat(opt('r2', '12'));

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
await page.goto(`http://127.0.0.1:${port}/index.html?debug`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__cs, { timeout: 240000 });

await page.evaluate(async (map, wave) => {
  const cs = window.__cs;
  await cs.startRun({ character: 'dad', map, ogre: 0 });
  cs.setLoopUpdates(false);
  cs.setRendering(false);
  cs.state.wave = wave;           // wave drives elite rolls and enemy scaling
}, MAP, WAVE);

// Place the line-up. Angles are measured from the knight, distances chosen so
// everything fits the frame at the capture zoom without overlapping.
const placed = await page.evaluate((R1, R2) => {
  const cs = window.__cs, T = Math.PI * 2;
  const types = Object.keys(cs.ENEMY_TYPES);
  // spawnEnemy(type, fixedAngle, opts) places at `dist` along `fixedAngle`,
  // with `spread` randomising the angle -- zero it so the row is exact.
  types.forEach((t, i) => {
    cs.spawnEnemy(t, (i / types.length) * T, { dist: R1, spread: 0 });
    cs.spawnEnemy(t, (i / types.length) * T + 0.10, { dist: R2, spread: 0, elite: true });
  });
  cs.spawnBoss(cs.state.wave);
  // One step so the models bind their animations and the aura code has run once.
  cs.step(1 / 60);
  const live = cs.enemies.filter(e => !e.isDying);
  // Freeze the interesting states so the tells are in the photograph: the archer
  // half-way through a draw, an ogre half-way through a swing.
  let drew = 0, swung = 0;
  for (const e of live) {
    if (e.isArcher && drew < 3) { e.arrowReleaseTimer = 0.28; drew++; }
    if (e.type === 'ogre' && swung < 3) { e.windupTimer = 0.22; e._windupLen = 0.45; swung++; }
  }
  return { types: types.length, live: live.length, drew, swung,
           elites: live.filter(e => e.isElite).length,
           marked: live.filter(e => e._auraHue).length,
           tells: live.filter(e => e._tellHue).length };
}, R1, R2);

// Run the tells for a few frames so their particles exist, without letting the
// enemies walk out of formation: step with the sim frozen except VFX time.
await page.evaluate((zoom) => {
  const cs = window.__cs;
  cs.setRendering(true);
  cs.setInvulnerable(true);
  cs.setZoom(zoom);
  cs.clearFlash();
}, ZOOM);
await page.evaluate(() => {
  const cs = window.__cs;
  // Re-arm every frame: stepping advances the timers, and a tell that finished
  // is not in the picture.
  for (let k = 0; k < 14; k++) {
    for (const e of cs.enemies) {
      if (e.isArcher && e.arrowReleaseTimer > 0) e.arrowReleaseTimer = 0.28;
      if (e.type === 'ogre' && e.windupTimer > 0) e.windupTimer = 0.22;
    }
    cs.step(1 / 60);
  }
});
await sleep(900);
await page.evaluate(() => window.__cs.clearFlash());
await sleep(200);

const file = path.join(OUT, `${TAG}-${MAP}.png`);
await page.screenshot({ path: file });
console.log(JSON.stringify(placed));
console.log('saved', path.relative(ROOT, file), errors.length ? 'ERRORS: ' + errors.slice(0, 5).join(' | ') : 'no errors');
await browser.close();
srv.close();
process.exit(errors.length ? 1 : 0);

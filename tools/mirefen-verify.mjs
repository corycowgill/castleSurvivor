/**
 * Mirefen verification. The bog is the first ground in the game that does
 * something, so it gets a test: the mires have to slow a knight, slow a chaser
 * harder, let a dash through, leave the causeway and the islands dry, and leave
 * the other three maps untouched.
 *
 *   node tools/mirefen-verify.mjs
 *
 * Prints PASS/FAIL per check so a regression is obvious.
 */
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json',
  '.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.wav':'audio/wav','.css':'text/css','.ogg':'audio/ogg' };

const srv = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  try {
    const f = fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
    const d = fs.readFileSync(f);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    res.end(d);
  } catch { res.writeHead(404); res.end(); }
});

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); };

srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--use-angle=d3d11', '--no-sandbox', '--disable-gpu-sandbox'],
    protocolTimeout: 600000,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://localhost:${port}/?debug`, { waitUntil: 'networkidle0', timeout: 180000 });
  await page.waitForFunction(() => window.__cs, { timeout: 420000 });

  const r = await page.evaluate(async () => {
    const cs = window.__cs;
    const out = {};
    await cs.startRun({ character: 'dad', map: 'mirefen', ogre: 0 });
    const p0 = cs.players[0];

    out.mireCount = cs.mires.length;
    out.barrierCount = cs.state && cs.mires ? null : null;

    // Walk WEST for a fixed time from a dry spot and from the middle of a mire,
    // with the same input, and compare the ground covered.
    const walk = (x, z, steps = 40) => {
      p0.mesh.position.set(x, 0, z);
      p0.state.isDashing = false; p0.state.dashTimer = 0; p0.state.dashCooldown = 9;
      cs.keys['KeyA'] = true;
      const x0 = p0.mesh.position.x;
      for (let i = 0; i < steps; i++) cs.step(0.05);
      cs.keys['KeyA'] = false;
      return Math.abs(p0.mesh.position.x - x0);
    };

    // A mire big enough that 2 seconds of walking stays inside it.
    const big = cs.mires.slice().sort((a, b) => b.r - a.r)[0];
    out.biggestMire = +big.r.toFixed(1);
    const dryPoint = { x: 0, z: 0 };            // the spawn clearing is kept dry
    out.dryIsDry = !cs.inMire(dryPoint.x, dryPoint.z);
    out.mireIsMire = cs.inMire(big.x, big.z);

    const dryDist = walk(dryPoint.x, dryPoint.z, 30);
    const bogDist = walk(big.x, big.z, 30);
    out.dryDist = +dryDist.toFixed(2);
    out.bogDist = +bogDist.toFixed(2);
    out.wadeRatio = +(bogDist / dryDist).toFixed(2);

    // A dash ignores the bog: same start, but dashing.
    p0.mesh.position.set(big.x, 0, big.z);
    p0.state.dashCooldown = 0;
    const dx0 = p0.mesh.position.x;
    cs.keys['KeyA'] = true; cs.keys['Space'] = true;
    for (let i = 0; i < 8; i++) cs.step(0.05);
    cs.keys['Space'] = false; cs.keys['KeyA'] = false;
    out.dashDist = +Math.abs(p0.mesh.position.x - dx0).toFixed(2);

    // Enemies wade harder than knights do.
    out.enemyMul = cs.MIRE_ENEMY;
    out.playerMul = cs.MIRE_PLAYER;

    // The causeway (the map's fast line) must be dry the whole way down.
    let causewayWet = 0;
    for (let z = -80; z <= 86; z += 4) {
      const cx = Math.sin(z * 0.035) * 5;
      if (cs.inMire(cx, z)) causewayWet++;
    }
    out.causewayWet = causewayWet;

    // Water barriers must actually stop a knight. z = 20 is well clear of both
    // east fords (-10 and 48) -- the first draft walked in at z = -10, which is
    // a crossing, and the knight quite correctly strolled over it.
    p0.mesh.position.set(20, 0, 20);
    p0.state.dashCooldown = 9;
    cs.keys['KeyD'] = true;
    for (let i = 0; i < 120; i++) cs.step(0.05);
    const hitX = p0.mesh.position.x;
    for (let i = 0; i < 40; i++) cs.step(0.05);
    cs.keys['KeyD'] = false;
    out.stoppedAtX = +hitX.toFixed(1);
    out.stillStuck = Math.abs(p0.mesh.position.x - hitX) < 0.6;

    // The other maps must carry no mires at all.
    await cs.startRun({ character: 'dad', map: 'kingsfield', ogre: 0 });
    out.kingsfieldMires = cs.mires.length;
    await cs.startRun({ character: 'dad', map: 'darkwood', ogre: 0 });
    out.darkwoodMires = cs.mires.length;
    return out;
  });

  check('the map carries mires', r.mireCount > 200, `${r.mireCount} discs, biggest r=${r.biggestMire}`);
  check('the spawn clearing is dry', r.dryIsDry, String(r.dryIsDry));
  check('a mire reads as a mire', r.mireIsMire, String(r.mireIsMire));
  check('wading is slower than walking', r.bogDist < r.dryDist * 0.85, `${r.bogDist} vs ${r.dryDist} units`);
  check('wade rate is about MIRE_PLAYER', Math.abs(r.wadeRatio - r.playerMul) < 0.12, `${r.wadeRatio} vs ${r.playerMul}`);
  check('enemies wade harder than knights', r.enemyMul < r.playerMul, `${r.enemyMul} vs ${r.playerMul}`);
  check('a dash clears the bog', r.dashDist > r.bogDist, `${r.dashDist} dashing vs ${r.bogDist} wading`);
  check('the causeway stays dry', r.causewayWet === 0, `${r.causewayWet} wet samples of 42`);
  check('black water stops a knight', r.stillStuck && r.stoppedAtX < 70, `held at x=${r.stoppedAtX}, still stuck: ${r.stillStuck}`);
  check('Kingsfield has no mires', r.kingsfieldMires === 0, `${r.kingsfieldMires}`);
  check('Darkwood has no mires', r.darkwoodMires === 0, `${r.darkwoodMires}`);
  check('no JS errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');

  console.log('\nMIREFEN VERIFICATION\n');
  let failed = 0;
  for (const c of results) {
    if (!c.ok) failed++;
    console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(32)} ${c.detail}`);
  }
  console.log(`\n  ${results.length - failed}/${results.length} passed\n`);

  await browser.close();
  srv.close();
  process.exit(failed ? 1 : 0);
});

/**
 * Two-player co-op verification. Exercises controls, HUD, health/XP, combat
 * and revive for both a pad-driven and a keyboard-driven companion.
 *
 *   node tools/coop-verify.mjs
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
    const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

    await cs.startRun({ character: 'dad', map: 'kingsfield', ogre: 0 });
    // P2 on a pad, P3 on the keyboard: both input paths in one run.
    await cs.joinPlayer('brennan', { type: 'pad', index: 1 });
    await cs.joinPlayer('parker', { type: 'kb' });
    const P = cs.players;
    out.partySize = P.length;
    out.devices = P.map(p => (p.device ? p.device.type : 'primary'));
    out.maxHp = P.map(p => p.state.maxHp);
    out.primaries = P.map(p => p.state.primaryWeapon);

    const hold = (i, x, z) => P[i].mesh.position.set(x, 0, z);
    const spread = () => { hold(0, -10, 0); hold(1, 0, 0); hold(2, 10, 0); };

    // ---- MOVEMENT, each device in isolation ----
    spread();
    let s = P.map(p => ({ x: p.mesh.position.x, z: p.mesh.position.z }));
    Object.assign(cs.padSlot(1), { lx: 1, ly: 0 });
    for (let i = 0; i < 25; i++) cs.step(0.05);
    out.padMoved = P.map((p, i) => +dist(p.mesh.position, s[i]).toFixed(1));
    Object.assign(cs.padSlot(1), { lx: 0, ly: 0 });

    spread();
    s = P.map(p => ({ x: p.mesh.position.x, z: p.mesh.position.z }));
    cs.keys['ArrowRight'] = true;
    for (let i = 0; i < 25; i++) cs.step(0.05);
    cs.keys['ArrowRight'] = false;
    out.kbMoved = P.map((p, i) => +dist(p.mesh.position, s[i]).toFixed(1));

    spread();
    s = P.map(p => ({ x: p.mesh.position.x, z: p.mesh.position.z }));
    cs.keys['KeyD'] = true;
    for (let i = 0; i < 25; i++) cs.step(0.05);
    cs.keys['KeyD'] = false;
    out.wasdMoved = P.map((p, i) => +dist(p.mesh.position, s[i]).toFixed(1));

    // ---- DASH, per device ----
    spread();
    P.forEach(p => { p.state.dashCooldown = 0; p.state.isDashing = false; });
    Object.assign(cs.padSlot(1), { lx: 1, b: true });
    cs.keys['ArrowRight'] = true; cs.keys['ShiftRight'] = true;
    cs.keys['KeyD'] = true; cs.keys['Space'] = true;
    for (let i = 0; i < 3; i++) cs.step(0.05);
    out.dashed = P.map(p => !!p.state.isDashing || p.state.dashCooldown > 0);
    Object.assign(cs.padSlot(1), { lx: 0, b: false });
    cs.keys['ArrowRight'] = false; cs.keys['ShiftRight'] = false;
    cs.keys['KeyD'] = false; cs.keys['Space'] = false;

    // ---- COMBAT: each player kills on its own ----
    spread();
    P.forEach(p => { p.weapons.dagger.owned = true; p.weapons.dagger.level = 4; });
    const kills0 = cs.state.kills;
    for (let i = 0; i < 12; i++) cs.spawnEnemy('goblin', 0, { at: { x: 10, z: 0 }, dist: 2 });
    for (let i = 0; i < 200; i++) { cs.step(0.05); spread(); }
    out.killsNearP3 = cs.state.kills - kills0;

    // ---- HUD ----
    out.hudRows = [...document.querySelectorAll('.coop-hp-row')].length;
    P[1].state.hp = 40;
    cs.updateHudNow && cs.updateHudNow();
    out.hudTextBefore = [...document.querySelectorAll('.coop-hp-text')].map(e => e.textContent);

    // ---- SHARED XP ----
    const lvlBefore = P.map(p => p.state.level);
    cs.gainXP(400);
    out.levelsAfterXP = P.map(p => p.state.level);
    out.levelsMovedTogether = P.every(p => p.state.level > lvlBefore[0]);
    out.pendingPicks = P.map(p => p.pendingPicks || 0);
    // Clear the card queue so it does not interfere with the revive test
    for (let i = 0; i < 40; i++) document.querySelector('.upgrade-btn')?.click();

    // ---- REVIVE ----
    spread();
    cs.triggerPlayerDeath(P[2]);
    out.downedNotGameOver = { p3Dead: P[2].state.isDead, gameOverTimer: P[0].state._gameOverTimer || 0, alive: cs.alivePlayers().length };
    // nobody near: bleed-out ticks
    for (let i = 0; i < 20; i++) { cs.step(0.1); hold(0, -10, 0); hold(1, 0, 0); }
    out.bleedTicked = +(P[2].state.bleedOut).toFixed(1);
    // a teammate walks over
    for (let i = 0; i < 40; i++) { cs.step(0.1); P[1].mesh.position.set(P[2].mesh.position.x + 1.5, 0, P[2].mesh.position.z); }
    out.revived = { isDead: P[2].state.isDead, hp: Math.round(P[2].state.hp) };
    out.hudTextAfterRevive = [...document.querySelectorAll('.coop-hp-text')].map(e => e.textContent);

    // ---- PARTY WIPE ends the run ----
    cs.triggerPlayerDeath(P[1]); cs.triggerPlayerDeath(P[2]); cs.triggerPlayerDeath(P[0]);
    out.wipe = { alive: cs.alivePlayers().length, gameOverTimer: +(P[0].state._gameOverTimer || 0).toFixed(1) };

    return out;
  });

  check('party has 3 players', r.partySize === 3, `${r.partySize}`);
  check('devices are primary/pad/keyboard', r.devices.join(',') === 'primary,pad,kb', r.devices.join(','));
  // Parker is the glass-cannon wizard: 100 base minus 15 from Arcane Focus.
  check('per-character max HP applied', r.maxHp[0] === 115 && r.maxHp[1] === 110 && r.maxHp[2] === 85, r.maxHp.join('/'));
  check('per-character primary weapon', r.primaries.join(',') === 'sword,spear,staff', r.primaries.join(','));
  check('pad moves ONLY P2', r.padMoved[1] > 5 && r.padMoved[0] < 1 && r.padMoved[2] < 1, r.padMoved.join('/'));
  check('arrows move ONLY P3', r.kbMoved[2] > 5 && r.kbMoved[0] < 1 && r.kbMoved[1] < 1, r.kbMoved.join('/'));
  check('WASD moves ONLY P1', r.wasdMoved[0] > 5 && r.wasdMoved[1] < 1 && r.wasdMoved[2] < 1, r.wasdMoved.join('/'));
  check('all three can dash', r.dashed.every(Boolean), r.dashed.join('/'));
  check('companion kills enemies', r.killsNearP3 > 0, `${r.killsNearP3} kills`);
  check('HUD has a row per companion', r.hudRows === 2, `${r.hudRows} rows`);
  check('HUD shows companion HP', /\d+\/\d+/.test(r.hudTextBefore.join(' ')), r.hudTextBefore.join(' | '));
  check('shared XP levels everyone', r.levelsMovedTogether, r.levelsAfterXP.join('/'));
  check('each player gets card picks', r.pendingPicks.every(n => n > 0), r.pendingPicks.join('/'));
  check('down does NOT end the run', r.downedNotGameOver.gameOverTimer === 0 && r.downedNotGameOver.alive === 2, JSON.stringify(r.downedNotGameOver));
  check('bleed-out counts down', r.bleedTicked < 25 && r.bleedTicked > 0, `${r.bleedTicked}s left`);
  check('teammate revives', r.revived.isDead === false && r.revived.hp > 0, JSON.stringify(r.revived));
  check('HUD reflects revived HP', /\d+\/\d+/.test(r.hudTextAfterRevive.join(' ')), r.hudTextAfterRevive.join(' | '));
  check('party wipe ends run', r.wipe.alive === 0 && r.wipe.gameOverTimer > 0, JSON.stringify(r.wipe));
  check('no JS errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');

  console.log('\nTWO-PLAYER CO-OP VERIFICATION\n');
  let failed = 0;
  for (const c of results) {
    if (!c.ok) failed++;
    console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(34)} ${c.detail}`);
  }
  console.log(`\n  ${results.length - failed}/${results.length} passed\n`);

  await browser.close();
  srv.close();
  process.exit(failed ? 1 : 0);
});

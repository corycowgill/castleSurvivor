/**
 * Automated playtest harness for Castle Survivor.
 *
 * Drives the real game in headless Chrome through the ?debug hook in index.html.
 *
 *   node tools/playtest.mjs smoke              load, start each knight, run 30s, screenshot, report JS errors
 *   node tools/playtest.mjs balance [opts]     play full runs with a bot and print a timeline per run
 *       --chars dad,brennan,parker   --maps kingsfield,darkwood   --ogre 0   --bot kite|still
 *       --minutes 20                 --headed (show the browser)
 *   node tools/playtest.mjs shot <name>        screenshot the title screen
 *
 * Screenshots land in tools/shots/. Needs Chrome or Edge installed (no download).
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.css': 'text/css',
  '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
};

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      let file = path.join(ROOT, url === '/' ? 'index.html' : url);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

function findBrowser() {
  const c = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const p of c) if (fs.existsSync(p)) return p;
  throw new Error('No Chrome/Edge found');
}

const args = process.argv.slice(2);
const mode = args[0] || 'smoke';
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes('--' + name);

async function openGame(headed) {
  const { srv, port } = await serve();
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: !headed,
    // The __cs wait allows 420 s, but puppeteer's own protocol timeout defaults
    // to 180 s and kills the underlying evaluate first -- a cold SwiftShader
    // load of the asset set can exceed that and fail with a confusing
    // "Runtime.callFunctionOn timed out" rather than a load error.
    protocolTimeout: 600000,
    // --gpu: render on the real GPU (ANGLE over D3D11) instead of SwiftShader. Much
    // faster and free of SwiftShader's dropped tiles; SwiftShader stays the default
    // because it works on any machine and never competes with ComfyUI for VRAM.
    args: [...(flag('gpu') ? ['--use-gl=angle', '--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--headless=new']
                          : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']),
           '--autoplay-policy=no-user-gesture-required', '--window-size=1280,800', '--mute-audio'],
    defaultViewport: { width: 1280, height: 800 },
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + (e.message || e)));
  // Missing optional audio files are expected 404s; everything else is a real error
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push('console.error: ' + m.text()); });
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${port}/index.html?debug`, { waitUntil: 'domcontentloaded' });
  // 420 s is ample on an idle machine, but a cold SwiftShader boot while the
  // AssetFactory has the CPU takes ~8 minutes. --boot-timeout overrides it.
  await page.waitForFunction(() => window.__cs, { timeout: parseInt(opt('boot-timeout', '420'), 10) * 1000 });
  console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return { browser, page, errors, close: async () => { await browser.close(); srv.close(); } };
}

async function shot(page, name) {
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file });
  return path.relative(ROOT, file);
}

// ── Upgrade policy, roughly how a competent player builds: take a second and
// third weapon early, then level weapons, take evolutions, then core stats ──
async function pickUpgrade(page) {
  return page.evaluate(() => {
    const btns = [...document.querySelectorAll('.upgrade-btn')];
    if (!btns.length) return null;
    const text = b => b.textContent || '';
    const owned = Object.values(window.__cs.playerWeapons).filter(w => w.owned).length;
    const pref = [/EVOLUTION/];
    if (owned < 3) pref.push(/NEW/);
    pref.push(/Lv \d/, /Whetstone/, /Berserker/, /Champion/, /RELIC/, /NEW/, /Assassin/, /Executioner/, /Blessed Chainmail/, /Healer/);
    for (const re of pref) { const b = btns.find(x => re.test(text(x))); if (b) { const t = text(b).trim().split('\n')[0].slice(0, 40); b.click(); return t; } }
    const t = text(btns[0]).trim().split('\n')[0].slice(0, 40); btns[0].click(); return t;
  });
}

// ── Bot: one decision per call, applied through the keys map.
// 'kite' circle-strafes: keeps the crowd at weapon range instead of fleeing it,
// engages when nothing is close, backs straight off when hurt. 'still' stands. ──
function botStep(kind) {
  return `(() => {
    const cs = window.__cs; const k = cs.keys;
    for (const c of ['KeyW','KeyA','KeyS','KeyD','Space']) k[c] = false;
    if ('${kind}' === 'still') return;
    const p = cs.playerPos; if (!p) return;
    const away = cs.threatVector(10);
    const near = cs.nearestEnemyDist();
    const hpFrac = cs.state.player.hp / cs.state.player.maxHp;
    let vx = 0, vz = 0;
    // Telegraphs first: step out of any zone about to explode
    let dz_ = 0, dx_ = 0, inDanger = false;
    for (const zn of cs.dangerZones()) {
      const ddx = p.x - zn.x, ddz = p.z - zn.z; const d = Math.hypot(ddx, ddz);
      if (d < zn.r) { inDanger = true; const w = (zn.r - d) / zn.r + 0.2; dx_ += (d > 0.01 ? ddx / d : 1) * w; dz_ += (d > 0.01 ? ddz / d : 0) * w; }
    }
    // Press a boss only to break a stalemate: the Ogre King, or any boss that has
    // been alive 45s+. Pressing every boss on sight walked level-12 knights into
    // the wave-5 boss and its escort.
    const boss = cs.enemies.find(e => e.isBoss && !e.isDying);
    if (boss && window.__bossSince == null) window.__bossSince = cs.state.time;
    if (!boss) window.__bossSince = null;
    const bossD = boss ? Math.hypot(boss.mesh.position.x - p.x, boss.mesh.position.z - p.z) : Infinity;
    const pressBoss = boss && hpFrac > 0.6 && (boss.isFinalBoss || cs.state.time - window.__bossSince > 45);
    if (inDanger) {
      const l = Math.hypot(dx_, dz_) || 1; vx = dx_ / l; vz = dz_ / l;
      if (cs.state.player.dashCooldown <= 0) k.Space = true;
    } else if (pressBoss && bossD > 3.5) {
      vx = (boss.mesh.position.x - p.x) / bossD; vz = (boss.mesh.position.z - p.z) / bossD;
    } else if (away.n === 0 || near > 7) {
      // nothing in reach: walk toward the nearest enemy so the auto-attack fires
      let best = null, bd = Infinity;
      for (const e of cs.enemies) { if (e.isDying) continue; const dx = e.mesh.position.x - p.x, dz = e.mesh.position.z - p.z; const d = dx*dx + dz*dz; if (d < bd) { bd = d; best = { dx, dz }; } }
      if (best) { const l = Math.hypot(best.dx, best.dz) || 1; vx = best.dx / l; vz = best.dz / l; }
    } else if (hpFrac < 0.35 || near < 1.6) {
      vx = away.x; vz = away.z;                       // hurt or pinned: straight out
    } else {
      // circle: mostly perpendicular to the threat, a little away
      window.__botSpin = window.__botSpin || (Math.random() < 0.5 ? 1 : -1);
      const s = window.__botSpin;
      vx = away.x * 0.35 + (-away.z * s) * 0.65; vz = away.z * 0.35 + (away.x * s) * 0.65;
    }
    // Drift back toward the centre near the world edge
    if (Math.abs(p.x) > 78 || Math.abs(p.z) > 78) { vx = -p.x; vz = -p.z; window.__botSpin = -(window.__botSpin || 1); }
    const l = Math.hypot(vx, vz); if (l < 0.01) return; vx /= l; vz /= l;
    if (vz < -0.38) k.KeyW = true; if (vz > 0.38) k.KeyS = true;
    if (vx < -0.38) k.KeyA = true; if (vx > 0.38) k.KeyD = true;
    if ((near < 1.8 || hpFrac < 0.3) && cs.state.player.dashCooldown <= 0) k.Space = true;
  })()`;
}

async function playRun(page, { character, map, ogre, bot, minutes }) {
  await page.evaluate(async (c, m, o) => { await window.__cs.startRun({ character: c, map: m, ogre: o }); }, character, map, ogre);
  await page.evaluate(() => { window.__cs.setLoopUpdates(false); window.__cs.setRendering(false); });
  const timeline = [];
  const picks = [];
  const trace = [];
  const limit = minutes * 60;
  let lastRow = -60, lastTrace = -10, t = 0;
  for (;;) {
    // Level-up screen open? pick and continue
    const paused = await page.evaluate(() => window.__cs.state.paused && window.__cs.upgradeScreenOpen);
    if (paused) { const p = await pickUpgrade(page); if (p) picks.push(p); continue; }
    const st = await page.evaluate((b) => {
      const cs = window.__cs;
      if (cs.state.gameOver) return { over: true };
      // 0.25s of decisions, 4 per second of game time
      for (let i = 0; i < 4; i++) { eval(b); cs.step(0.25); if (cs.state.paused || cs.state.gameOver) break; }
      const s = cs.state, p = s.player, pp = cs.playerPos || { x: 0, z: 0 };
      return { over: s.gameOver, victory: !!s.victory, t: s.time, wave: s.wave, hp: p.hp, maxHp: p.maxHp, lvl: p.level,
               kills: s.kills, enemies: cs.enemies.filter(e => !e.isDying).length, dead: p.isDead, x: pp.x, z: pp.z };
    }, botStep(bot));
    t = st.t || t;
    if (st.over || st.dead) {
      // let the game-over timer resolve
      await page.evaluate(() => { window.__cs.setLoopUpdates(true); window.__cs.setRendering(true); });
      await new Promise(r => setTimeout(r, 3500));
      const final = await page.evaluate(() => { const s = window.__cs.state; return { victory: !!s.victory, gameOver: s.gameOver, wave: s.wave, t: s.time, kills: s.kills, lvl: s.player.level }; });
      const weapons = await page.evaluate(() => Object.entries(window.__cs.playerWeapons).filter(([, w]) => w.owned).map(([k, w]) => `${k}${w.evolved ? '★' : ' L' + w.level}`).join(' ')
        + (window.__cs.state.player.relics ? '  relics: ' + Object.keys(window.__cs.state.player.relics).join(' ') : ''));
      const taken = await page.evaluate(() => Object.entries(window.__cs.runStats.damageTakenBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', '));
      return { result: final.victory ? 'VICTORY' : 'DIED', ...final, timeline, weapons, picks: picks.length, taken, trace, diedAt: [Math.round(st.x), Math.round(st.z)] };
    }
    // Position trace every 10 s (stuck detection: the bot pinned against obstacles reads as a static x,z)
    if (t - lastTrace >= 10) { lastTrace = t; trace.push([Math.round(t), Math.round(st.x), Math.round(st.z)]); }
    if (t - lastRow >= 60) { lastRow = t; timeline.push({ t: Math.round(t), wave: st.wave, hp: Math.round(st.hp), maxHp: st.maxHp, lvl: st.lvl, kills: st.kills, enemies: st.enemies, x: Math.round(st.x), z: Math.round(st.z) }); }
    if (t >= limit) {
      const weapons = await page.evaluate(() => Object.entries(window.__cs.playerWeapons).filter(([, w]) => w.owned).map(([k, w]) => `${k}${w.evolved ? '★' : ' L' + w.level}`).join(' ')
        + (window.__cs.state.player.relics ? '  relics: ' + Object.keys(window.__cs.state.player.relics).join(' ') : ''));
      return { result: 'SURVIVED', wave: st.wave, t, kills: st.kills, lvl: st.lvl, timeline, weapons, picks: picks.length, trace };
    }
  }
}

function fmtTime(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

async function main() {
  const headed = flag('headed');
  if (mode === 'shot') {
    const g = await openGame(headed);
    await new Promise(r => setTimeout(r, 1500));
    console.log('saved', await shot(g.page, (args[1] && !args[1].startsWith('--')) ? args[1] : 'title'));
    await g.close(); return;
  }
  if (mode === 'profile') {
    // Performance analysis: advance a bot run to a target wave, then measure
    // simulation cost, CPU hot spots (V8 profiler), and leak indicators.
    const targetWave = parseInt(opt('wave', '12'), 10);
    const ch = opt('char', 'dad');
    const map = opt('map', 'kingsfield');
    const g = await openGame(headed);
    const client = await g.page.createCDPSession();
    // The leak comparison below must collect first: renderer.info counts objects
    // that are unreachable but not yet swept, which otherwise reads as a leak.
    const gc = async () => {
      await client.send('HeapProfiler.collectGarbage');
      await new Promise(r => setTimeout(r, 400));
      await client.send('HeapProfiler.collectGarbage');
    };
    await g.page.evaluate(async (c, m) => { await window.__cs.startRun({ character: c, map: m, ogre: 0 }); }, ch, map);
    await g.page.evaluate(() => { window.__cs.setLoopUpdates(false); window.__cs.setRendering(false); });
    const baseline = await g.page.evaluate(() => window.__cs.counts());
    console.log('baseline counts:', JSON.stringify(baseline));
    const samples = [];
    // advance, sampling sim cost every wave
    let lastWave = 0;
    for (;;) {
      const paused = await g.page.evaluate(() => window.__cs.state.paused && window.__cs.upgradeScreenOpen);
      if (paused) { await pickUpgrade(g.page); continue; }
      const st = await g.page.evaluate((b) => {
        const cs = window.__cs;
        for (let i = 0; i < 8; i++) { eval(b); cs.step(0.25); if (cs.state.paused || cs.state.gameOver) break; }
        return { wave: cs.state.wave, over: cs.state.gameOver, dead: cs.state.player.isDead, t: cs.state.time };
      }, botStep('kite'));
      if (st.wave !== lastWave) {
        lastWave = st.wave;
        // Never measure through a level-up pause (it reads as 0.00 ms)
        while (await g.page.evaluate(() => window.__cs.state.paused && window.__cs.upgradeScreenOpen)) await pickUpgrade(g.page);
        const s = await g.page.evaluate(() => ({ ...window.__cs.timeSteps(3), ...window.__cs.counts(), wave: window.__cs.state.wave }));
        samples.push(s);
        console.log(`wave ${String(s.wave).padStart(2)}  sim avg ${s.avgMs.toFixed(2)}ms  p95 ${s.p95.toFixed(2)}ms  max ${s.maxMs.toFixed(1)}ms  enemies ${s.live}/${s.enemies}  pickups ${s.pickups}  dmgNums ${s.damageNumbers}  scene ${s.sceneChildren}  geo ${s.geometries}  tex ${s.textures}  heap ${s.heapMB}MB`);
      }
      if (st.over || st.dead || st.wave >= targetWave) break;
    }
    // CPU profile of 6s of simulation at the target wave
    await client.send('Profiler.enable');
    await client.send('Profiler.setSamplingInterval', { interval: 200 });
    await client.send('Profiler.start');
    await g.page.evaluate((b) => { const cs = window.__cs; for (let i = 0; i < 24; i++) { eval(b); cs.step(0.25); if (cs.state.paused) { document.querySelector('.upgrade-btn')?.click(); } } }, botStep('kite'));
    const { profile } = await client.send('Profiler.stop');
    // Aggregate self time per function
    const self = new Map();
    const byId = new Map(profile.nodes.map(n => [n.id, n]));
    const dtArr = profile.timeDeltas || [];
    for (let i = 0; i < profile.samples.length; i++) {
      const n = byId.get(profile.samples[i]); if (!n) continue;
      const cf = n.callFrame; const key = `${cf.functionName || '(anon)'}  ${path.basename(cf.url || '')}:${cf.lineNumber + 1}`;
      self.set(key, (self.get(key) || 0) + (dtArr[i] || 0));
    }
    const total = [...self.values()].reduce((a, b) => a + b, 0) || 1;
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
    console.log(`\nTop self-time functions over ${(total / 1000).toFixed(0)}ms of profiled simulation at wave ${lastWave}:`);
    for (const [k, v] of top) console.log(`  ${(v / total * 100).toFixed(1).padStart(5)}%  ${k}`);
    // Render cost (CPU side, software GL: draw calls and triangles are the signal, not ms)
    await g.page.evaluate(() => { window.__cs.setRendering(true); });
    await new Promise(r => setTimeout(r, 1500));
    const after = await g.page.evaluate(() => window.__cs.counts());
    console.log(`\nrender: ${after.drawCalls} draw calls, ${after.triangles.toLocaleString()} triangles, ${after.programs} shader programs, scene children ${after.sceneChildren}`);
    console.log(`leak check (baseline → wave ${lastWave}): geometries ${baseline.geometries} → ${after.geometries}, textures ${baseline.textures} → ${after.textures}, heap ${baseline.heapMB} → ${after.heapMB} MB, scene children ${baseline.sceneChildren} → ${after.sceneChildren}`);
    console.log('scene textures in run:', JSON.stringify(await g.page.evaluate(() => window.__cs.textureReport())));
    const takenP = await g.page.evaluate(() => Object.entries(window.__cs.runStats.damageTakenBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', '));
    console.log(`damage taken by: ${takenP || '(none)'}; player ${await g.page.evaluate(() => (window.__cs.state.player.isDead ? 'DEAD' : 'alive') + ' at wave ' + window.__cs.state.wave)}`);
    // Return to menu and check the scene is cleaned up
    await g.page.evaluate(() => window.__cs.returnToMenu());
    await new Promise(r => setTimeout(r, 800));
    await gc();
    const menu = await g.page.evaluate(() => window.__cs.counts());
    console.log(`after returnToMenu (post-GC): scene children ${menu.sceneChildren}, geometries ${menu.geometries}, textures ${menu.textures}, heap ${menu.heapMB} MB`);
    console.log('scene textures at menu:', JSON.stringify(await g.page.evaluate(() => window.__cs.textureReport())));
    // Second short run: if pools and lazy caches are the explanation, counts
    // after run 2 match run 1; if they climb again, something leaks per run.
    await g.page.evaluate(async () => { await window.__cs.startRun({ character: 'dad', map: 'kingsfield', ogre: 0 }); });
    await g.page.evaluate(() => { window.__cs.setLoopUpdates(false); window.__cs.setRendering(false); });
    for (let i = 0; i < 60; i++) {
      const paused = await g.page.evaluate(() => window.__cs.state.paused && window.__cs.upgradeScreenOpen);
      if (paused) { await pickUpgrade(g.page); continue; }
      await g.page.evaluate((b) => { const cs = window.__cs; for (let j = 0; j < 8; j++) { eval(b); cs.step(0.25); if (cs.state.paused || cs.state.gameOver) break; } }, botStep('kite'));
    }
    await g.page.evaluate(() => { window.__cs.setRendering(true); });
    await new Promise(r => setTimeout(r, 1200));
    const run2 = await g.page.evaluate(() => window.__cs.counts());
    await g.page.evaluate(() => window.__cs.returnToMenu());
    await new Promise(r => setTimeout(r, 800));
    await gc();
    const menu2 = await g.page.evaluate(() => window.__cs.counts());
    console.log(`second run (2 min): in-run textures ${run2.textures}, geometries ${run2.geometries}; after menu: textures ${menu2.textures} (run 1: ${menu.textures}), geometries ${menu2.geometries} (run 1: ${menu.geometries}), heap ${menu2.heapMB} MB (run 1: ${menu.heapMB})`);
    // Heap is the verdict, not renderer.info: three.js only decrements those
    // counters on an explicit dispose(), so a texture freed by GC leaves the
    // count stale and a healthy build still shows it climbing.
    const heapGrowth = menu2.heapMB - menu.heapMB;
    console.log(heapGrowth <= 15
      ? `LEAK CHECK: heap stable across runs (${heapGrowth >= 0 ? '+' : ''}${heapGrowth} MB) — renderer.info counts are stale-on-GC, not a leak`
      : `LEAK CHECK: heap grew ${heapGrowth} MB between runs — investigate (run tools/heap-trend.mjs --runs 5 to confirm)`);
    console.log(g.errors.filter(e => !/404/.test(e)).length ? 'JS errors:\n  ' + [...new Set(g.errors.filter(e => !/404/.test(e)))].slice(0, 10).join('\n  ') : 'no JS errors (ignoring 404s)');
    await g.close(); return;
  }
  if (mode === 'enemies') {
    // Regression: every enemy type, both bosses and every formation run for 45s
    // of simulation against the kite bot without throwing.
    const g = await openGame(headed);
    await g.page.evaluate(async () => { await window.__cs.startRun({ character: 'dad', map: 'kingsfield', ogre: 0 }); });
    await g.page.evaluate(() => { window.__cs.setLoopUpdates(false); window.__cs.setRendering(false); window.__cs.state.wave = 12; });
    const spawned = await g.page.evaluate(() => {
      const cs = window.__cs;
      for (const t of Object.keys(cs.ENEMY_TYPES)) for (let i = 0; i < 4; i++) cs.spawnEnemy(t, i * 1.5, { dist: 14 + i * 3 });
      cs.spawnBoss(12);
      for (const f of Object.keys(cs.FORMATIONS)) cs.spawnFormation(f, 1 + Math.random() * 5);
      return Object.keys(cs.ENEMY_TYPES).length + ' types, 1 boss, ' + Object.keys(cs.FORMATIONS).length + ' formations queued';
    });
    console.log('spawned:', spawned);
    // A clean frame of the mixed horde close up, for eyeballing markers and tints
    await g.page.evaluate(() => { const cs = window.__cs; cs.setInvulnerable(true); cs.step(3.0); cs.setZoom(0.9); cs.clearFlash(); cs.setRendering(true); });
    await new Promise(r => setTimeout(r, 1500));
    await g.page.evaluate(() => window.__cs.clearFlash());
    await new Promise(r => setTimeout(r, 300));
    console.log('horde shot:', await shot(g.page, 'enemies-horde'));
    await g.page.evaluate(() => { const cs = window.__cs; cs.setRendering(false); cs.setInvulnerable(false); });
    for (let i = 0; i < 45; i++) {
      const paused = await g.page.evaluate(() => window.__cs.state.paused && window.__cs.upgradeScreenOpen);
      if (paused) { await pickUpgrade(g.page); i--; continue; }
      await g.page.evaluate((b) => { const cs = window.__cs; for (let j = 0; j < 4; j++) { eval(b); cs.step(0.25); if (cs.state.paused || cs.state.gameOver) break; } }, botStep('kite'));
      if (i === 20) {
        // Second act: the dragon ogre after the first boss is dead or not
        await g.page.evaluate(() => { const cs = window.__cs; if (!cs.enemies.some(e => e.isBoss && !e.isDying)) cs.spawnDragonOgreBoss(12); });
      }
    }
    const summary = await g.page.evaluate(() => ({ counts: window.__cs.enemyTypeCounts(), kills: window.__cs.state.kills, hp: Math.round(window.__cs.state.player.hp), dead: window.__cs.state.player.isDead,
      taken: Object.entries(window.__cs.runStats.damageTakenBy).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ') }));
    console.log('after 45s:', JSON.stringify(summary));
    console.log(g.errors.length ? `JS ERRORS (${g.errors.length}):\n  ` + [...new Set(g.errors)].slice(0, 15).join('\n  ') : 'no JS errors');
    await g.close(); return;
  }
  if (mode === 'leak') {
    // Count live three.js objects by class after GC: baseline, after run 1, after run 2.
    // Growth from run 1 → run 2 is a per-run retention.
    const g = await openGame(headed);
    const client = await g.page.createCDPSession();
    const names = ['CanvasTexture', 'Texture', 'Sprite', 'SpriteMaterial', 'Mesh', 'SkinnedMesh', 'AnimationMixer', 'AnimationAction',
                   'MeshStandardMaterial', 'MeshBasicMaterial', 'ShaderMaterial', 'BufferGeometry', 'Group', 'Object3D', 'Bone', 'Skeleton',
                   'dom:HTMLCanvasElement', 'dom:ImageBitmap', 'dom:Float32Array', 'dom:Uint16Array', 'dom:ArrayBuffer',
                   'dom:GainNode', 'dom:OscillatorNode', 'dom:AudioBufferSourceNode', 'dom:BiquadFilterNode', 'dom:HTMLImageElement', 'dom:Promise'];
    async function countInstances() {
      await client.send('HeapProfiler.collectGarbage');
      const out = {};
      for (const n of names) {
        const expr = n.startsWith('dom:') ? `window.${n.slice(4)}.prototype` : `window.__cs.THREE.${n}.prototype`;
        const { result } = await client.send('Runtime.evaluate', { expression: expr, objectGroup: 'leak' });
        const { objects } = await client.send('Runtime.queryObjects', { prototypeObjectId: result.objectId, objectGroup: 'leak' });
        const { result: len } = await client.send('Runtime.callFunctionOn', { objectId: objects.objectId, functionDeclaration: 'function() { return this.length; }', returnByValue: true });
        out[n] = len.value;
      }
      await client.send('Runtime.releaseObjectGroup', { objectGroup: 'leak' });
      out.heapMB = await g.page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
      return out;
    }
    async function shortRun(seconds) {
      await g.page.evaluate(async () => { await window.__cs.startRun({ character: 'dad', map: 'kingsfield', ogre: 0 }); });
      await g.page.evaluate(() => { window.__cs.setLoopUpdates(false); window.__cs.setRendering(false); });
      for (let i = 0; i < seconds / 2; i++) {
        const paused = await g.page.evaluate(() => window.__cs.state.paused && window.__cs.upgradeScreenOpen);
        if (paused) { await pickUpgrade(g.page); i--; continue; }
        await g.page.evaluate((b) => { const cs = window.__cs; for (let j = 0; j < 8; j++) { eval(b); cs.step(0.25); if (cs.state.paused || cs.state.gameOver) break; } }, botStep('kite'));
      }
      await g.page.evaluate(() => { window.__cs.setRendering(true); });
      await new Promise(r => setTimeout(r, 1000));
      await g.page.evaluate(() => window.__cs.returnToMenu());
      await new Promise(r => setTimeout(r, 800));
    }
    // GPU-side texture accounting: renderer.info.memory.textures grows per run while the
    // JS object census stays flat, so log every texture upload (onUpdate fires after
    // upload; a prototype accessor catches instances whose constructor set onUpdate=null)
    // and every dispose, then list what run 2 uploaded and never disposed.
    await g.page.evaluate(() => {
      const T = window.__cs.THREE.Texture.prototype;
      window.__texLog = { up: new Map(), disposed: new Set(), phase: 'base' };
      Object.defineProperty(T, 'onUpdate', { configurable: true, get() { return (tex) => { const L = window.__texLog; if (!L.up.has(tex.uuid)) L.up.set(tex.uuid, { phase: L.phase, stack: tex.__stack || '', kind: (tex.isRenderTargetTexture ? 'renderTarget' : tex.image ? (tex.image.constructor?.name || 'image') + (tex.image.width ? ` ${tex.image.width}x${tex.image.height}` : '') : 'noimage'), name: tex.name || '', type: tex.constructor.name }); }; }, set() {} });
      const od = T.dispose; T.dispose = function () { window.__texLog.disposed.add(this.uuid); return od.call(this); };
      // Creation stacks: the constructors assign these properties, so a prototype accessor
      // sees every `new` (three.js internals included) and can note where it came from.
      const hook = (proto, prop, init) => Object.defineProperty(proto, prop, { configurable: true,
        get() { return this['__' + prop] === undefined ? init : this['__' + prop]; },
        set(v) { if (this['__' + prop] === undefined && window.__texLog.phase === 'run2') { this.__stack = new Error().stack.split('\n').slice(2, 6).map(l => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+\//, '')).join(' < '); } this['__' + prop] = v; } });
      hook(window.__cs.THREE.Texture.prototype, 'name', '');
    });
    const base = await countInstances();
    await g.page.evaluate(() => { window.__texLog.phase = 'run1'; });
    await shortRun(90); const r1 = await countInstances();
    await g.page.evaluate(() => { window.__texLog.phase = 'run2'; });
    await shortRun(90); const r2 = await countInstances();
    const texSummary = await g.page.evaluate(() => {
      const L = window.__texLog, groups = {};
      for (const [id, info] of L.up) { if (info.phase !== 'run2') continue; const k = `${info.type} ${info.kind}${info.name ? ' "' + info.name + '"' : ''}${info.stack ? '\n         ' + info.stack : ''}`; groups[k] = groups[k] || { uploaded: 0, disposed: 0 }; groups[k].uploaded++; if (L.disposed.has(id)) groups[k].disposed++; }
      return { gpuTextures: window.__cs.three.renderer.info.memory.textures, groups };
    });
    console.log('textures uploaded during run 2 (GPU counter now ' + texSummary.gpuTextures + '):');
    for (const [k, v] of Object.entries(texSummary.groups).sort((a, b) => (b[1].uploaded - b[1].disposed) - (a[1].uploaded - a[1].disposed))) console.log(`  ${String(v.uploaded).padStart(4)} up ${String(v.disposed).padStart(4)} disposed  ${k}`);
    console.log('class'.padEnd(22) + 'base'.padStart(8) + 'run1'.padStart(8) + 'run2'.padStart(8) + '  Δ(run2-run1)');
    for (const n of [...names, 'heapMB']) console.log(n.padEnd(22) + String(base[n]).padStart(8) + String(r1[n]).padStart(8) + String(r2[n]).padStart(8) + String(r2[n] - r1[n]).padStart(8));
    await g.close(); return;
  }
  if (mode === 'overhead') {
    // Top-down capture of a whole map: --map kingsfield|darkwood --height 260
    const omap = opt('map', 'kingsfield');
    const height = parseFloat(opt('height', '260'));
    const g = await openGame(headed);
    await g.page.evaluate(async (m) => { await window.__cs.startRun({ character: 'dad', map: m, ogre: 0 }); }, omap);
    await g.page.evaluate((h) => { const cs = window.__cs; cs.setLoopUpdates(false); cs.setInvulnerable(true); cs.clearFlash(); cs.setOverhead(true, h); }, height);
    await new Promise(r => setTimeout(r, 2500));
    await g.page.evaluate(() => window.__cs.clearFlash());
    await new Promise(r => setTimeout(r, 500));
    // Canvas-direct so the HUD is not in the capture (it feeds the map thumbnails)
    await g.page.evaluate(() => window.__cs.capture());
    await new Promise(r => setTimeout(r, 400));
    const dataUrl = await g.page.evaluate(() => window.__cs.capture());
    const file = path.join(SHOTS, `overhead-${omap}.png`);
    fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('overhead:', path.relative(ROOT, file));
    await g.close(); return;
  }
  if (mode === 'action') {
    // Bot to --wave N with rendering off, then render and capture --frames F frames --gap G seconds apart
    // (canvas-direct, HUD excluded unless --page). For judging VFX in real fights: --map, --char, --tag.
    const amap = opt('map', 'kingsfield'), ach = opt('char', 'dad'), tag = opt('tag', 'action');
    const targetWave = parseInt(opt('wave', '8'), 10), frames = parseInt(opt('frames', '6'), 10), gap = parseFloat(opt('gap', '0.6'));
    const g = await openGame(headed);
    await g.page.evaluate(async (c, m) => { await window.__cs.startRun({ character: c, map: m, ogre: 0 }); }, ach, amap);
    await g.page.evaluate(() => { window.__cs.setLoopUpdates(false); window.__cs.setRendering(false); });
    for (;;) {
      const paused = await g.page.evaluate(() => window.__cs.state.paused && window.__cs.upgradeScreenOpen);
      if (paused) { await pickUpgrade(g.page); continue; }
      const st = await g.page.evaluate((b) => { const cs = window.__cs; for (let i = 0; i < 8; i++) { eval(b); cs.step(0.25); if (cs.state.paused || cs.state.gameOver) break; } return { wave: cs.state.wave, over: cs.state.gameOver }; }, botStep('kite'));
      if (st.over) { console.log('bot died before wave', targetWave); break; }
      if (st.wave >= targetWave) break;
    }
    await g.page.evaluate((z) => { const cs = window.__cs; cs.setRendering(true); cs.setInvulnerable(true); cs.setZoom(z); cs.clearFlash(); }, parseFloat(opt('zoom', '1.6')));
    for (let i = 0; i < frames; i++) {
      // run the bot for `gap` seconds of sim (weapons fire, enemies die), then render one frame
      await g.page.evaluate((b, gapS) => { const cs = window.__cs; const n = Math.round(gapS / 0.05); for (let k = 0; k < n; k++) { if (k % 5 === 0) eval(b); cs.step(0.05); } }, botStep('kite'), gap);
      const name = `${tag}-${amap}-${i + 1}`;
      if (flag('page')) { await new Promise(r => setTimeout(r, 300)); console.log(await shot(g.page, name)); }
      else { const dataUrl = await g.page.evaluate(() => window.__cs.capture()); const file = path.join(SHOTS, `${name}.png`); fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64')); console.log(path.relative(ROOT, file)); }
    }
    const info = await g.page.evaluate(() => ({ wave: window.__cs.state.wave, particles: window.__cs.vfxStats ? window.__cs.vfxStats() : null, counts: window.__cs.counts() }));
    console.log(JSON.stringify(info));
    await g.close(); return;
  }
  if (mode === 'probe') {
    // Start a run and evaluate a JS expression against the debug hook: --map, --js "cs => ..." (function body with `cs`)
    const pmap = opt('map', 'kingsfield');
    const g = await openGame(headed);
    await g.page.evaluate(async (m) => { await window.__cs.startRun({ character: 'dad', map: m, ogre: 0 }); }, pmap);
    await g.page.evaluate(() => { const cs = window.__cs; cs.setLoopUpdates(false); cs.setInvulnerable(true); cs.capture(); });
    const out = await g.page.evaluate((js) => { const cs = window.__cs; try { return JSON.stringify(new Function('cs', js)(cs), null, 1); } catch (e) { return 'ERR ' + e.message; } }, opt('js', 'return cs.counts()'));
    console.log(out);
    if (g.errors.length) console.log('page errors:', g.errors.slice(0, 5).join('\n'));
    await g.close(); return;
  }
  if (mode === 'tour') {
    // Close-ups of several map locations in one session: --map, --zoom, --at "x,z;x,z;..." --tag name
    const tmap = opt('map', 'kingsfield');
    const tzoom = parseFloat(opt('zoom', '0.8'));
    const tag = opt('tag', 'tour');
    const spots = (opt('at', '0,0')).split(';').map(s => s.split(',').map(Number));
    const g = await openGame(headed);
    await g.page.evaluate(async (m) => { await window.__cs.startRun({ character: 'dad', map: m, ogre: 0 }); }, tmap);
    const aoOff = opt('ao', 'on') === 'off';
    const evalJs = opt('eval', null);          // JS run once before the shots, e.g. GTAO parameter experiments
    const canvasOnly = !flag('page');          // default: read the WebGL canvas directly (no HUD, no partial frames)
    await g.page.evaluate((z, aoOff, js) => { const cs = window.__cs; cs.setLoopUpdates(false); cs.setInvulnerable(true); cs.setZoom(z); if (aoOff) cs.setAO(false); if (js) new Function('cs', js)(cs); }, tzoom, aoOff, evalJs);
    for (let i = 0; i < spots.length; i++) {
      const [x, z] = spots[i];
      await g.page.evaluate((x, z) => { const cs = window.__cs; cs.teleport(x, z); cs.step(6); cs.clearFlash(); }, x, z);
      await new Promise(r => setTimeout(r, 2500));
      await g.page.evaluate(() => window.__cs.clearFlash());
      await new Promise(r => setTimeout(r, 300));
      // --post "js": run at this spot right before the capture (fire an effect), then
      // --postStep S seconds of simulation so it develops; `i` is the spot index
      const postJs = opt('post', null), postStep = parseFloat(opt('postStep', '0.05'));
      if (postJs) await g.page.evaluate((js, idx, st) => { const cs = window.__cs; new Function('cs', 'i', js)(cs, idx); const n = Math.max(1, Math.round(st / 0.025)); for (let k = 0; k < n; k++) cs.step(0.025); }, postJs, i, postStep);
      const name = `${tag}-${tmap}-${i + 1}`;
      if (canvasOnly) {
        // Two renders: the software renderer occasionally leaves a partial frame in the first
        await g.page.evaluate(() => window.__cs.capture());
        await new Promise(r => setTimeout(r, 400));
        const dataUrl = await g.page.evaluate(() => window.__cs.capture());
        const file = path.join(SHOTS, `${name}.png`);
        fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
        const rt = flag('time') ? await g.page.evaluate(() => window.__cs.renderTime(20)) : null;
        console.log(`${x},${z}:`, path.relative(ROOT, file), rt ? `render ${rt.ms}ms/frame, ${rt.drawCalls} draw calls, ${rt.triangles} tris` : '');
      } else {
        await shot(g.page, name);
        await new Promise(r => setTimeout(r, 1200));
        console.log(`${x},${z}:`, await shot(g.page, name));
      }
    }
    await g.close(); return;
  }
  if (mode === 'diag') {
    // Visual diagnostics: close-up of a run with shadows on, then off (--map, --zoom)
    const dmap = opt('map', 'kingsfield');
    const dzoom = parseFloat(opt('zoom', '0.7'));
    const g = await openGame(headed);
    await g.page.evaluate(async (m) => { await window.__cs.startRun({ character: 'dad', map: m, ogre: 0 }); }, dmap);
    const at = opt('at', null); // "x,z": teleport the knight before the shot
    await g.page.evaluate((z, atStr) => {
      const cs = window.__cs; cs.setLoopUpdates(false); cs.setInvulnerable(true);
      if (atStr) { const [x, zz] = atStr.split(',').map(Number); cs.teleport(x, zz); }
      cs.step(6); cs.setZoom(z); cs.clearFlash();
    }, dzoom, at);
    await new Promise(r => setTimeout(r, 1200));
    await g.page.evaluate(() => window.__cs.clearFlash());
    await new Promise(r => setTimeout(r, 300));
    console.log('shadows on :', await shot(g.page, `diag-${dmap}-shadows-on`));
    await g.page.evaluate(() => { window.__cs.three.dirLight.castShadow = false; });
    await new Promise(r => setTimeout(r, 800));
    console.log('shadows off:', await shot(g.page, `diag-${dmap}-shadows-off`));
    await g.page.evaluate(() => { window.__cs.three.dirLight.castShadow = true; window.__cs.three.bloomPass.strength = 0; });
    await new Promise(r => setTimeout(r, 800));
    console.log('no bloom   :', await shot(g.page, `diag-${dmap}-no-bloom`));
    const info = await g.page.evaluate(() => {
      const t = window.__cs.three;
      return { shadowBias: t.dirLight.shadow.bias, normalBias: t.dirLight.shadow.normalBias, mapSize: t.dirLight.shadow.mapSize.x,
               exposure: t.renderer.toneMappingExposure, ambient: t.ambientLight.intensity, hemi: t.hemiLight.intensity, dir: t.dirLight.intensity };
    });
    console.log(info);
    await g.close(); return;
  }
  if (mode === 'smoke') {
    const g = await openGame(headed);
    console.log('title:', await shot(g.page, 'title'));
    for (const ch of ['dad', 'brennan', 'parker']) {
      await g.page.evaluate(async (c) => { await window.__cs.startRun({ character: c, map: 'kingsfield', ogre: 0 }); }, ch);
      await g.page.evaluate(() => window.__cs.setLoopUpdates(false));
      let picks = 0;
      for (let i = 0; i < 30; i++) {
        const paused = await g.page.evaluate(() => window.__cs.state.paused && window.__cs.upgradeScreenOpen);
        if (paused) { await pickUpgrade(g.page); picks++; i--; continue; }
        await g.page.evaluate((b) => { for (let j = 0; j < 4; j++) { eval(b); window.__cs.step(0.25); if (window.__cs.state.paused) break; } }, botStep('kite'));
      }
      await g.page.evaluate(() => window.__cs.setLoopUpdates(true));
      await new Promise(r => setTimeout(r, 400));
      const s = await g.page.evaluate(() => { const s = window.__cs.state; return { wave: s.wave, kills: s.kills, hp: Math.round(s.player.hp), lvl: s.player.level, enemies: window.__cs.enemies.length }; });
      console.log(`${ch}: 30s → wave ${s.wave}, level ${s.lvl}, kills ${s.kills}, hp ${s.hp}, enemies ${s.enemies}, picks ${picks}, shot ${await shot(g.page, 'run-' + ch)}`);
      await g.page.evaluate(() => window.__cs.returnToMenu());
    }
    console.log(g.errors.length ? `JS ERRORS (${g.errors.length}):\n  ` + [...new Set(g.errors)].slice(0, 15).join('\n  ') : 'no JS errors');
    await g.close(); return;
  }
  if (mode === 'balance') {
    const chars = opt('chars', 'dad,brennan,parker').split(',');
    const maps = opt('maps', 'kingsfield').split(',');
    const ogre = parseInt(opt('ogre', '0'), 10);
    const bot = opt('bot', 'kite');
    const minutes = parseFloat(opt('minutes', '24')); // wave 20 starts at 16:11; leave room for the Ogre King
    const g = await openGame(headed);
    // Fresh meta so Forge ranks/mastery do not skew results, but with every weapon
    // unlocked so the bot tests the full arsenal
    await g.page.evaluate(() => {
      localStorage.setItem('castleSurvivor_meta', JSON.stringify({ gold: 0, ranks: {}, achievements: ['wave5', 'boss1', 'elite5', 'combo15', 'wave10'], mastery: {} }));
    });
    const results = [];
    for (const map of maps) for (const ch of chars) {
      const t0 = Date.now();
      const r = await playRun(g.page, { character: ch, map, ogre, bot, minutes });
      results.push({ ch, map, ...r });
      console.log(`\n=== ${ch} / ${map} / Ogre ${ogre} / bot=${bot}: ${r.result} at wave ${r.wave}, ${fmtTime(r.t)}, level ${r.lvl}, ${r.kills} kills (${((Date.now() - t0) / 1000).toFixed(0)}s wall)`);
      console.log(`    weapons: ${r.weapons}`);
      if (r.taken) console.log(`    damage taken by: ${r.taken}`);
      console.log('    time   wave  hp        lvl  kills  enemies   at');
      for (const row of r.timeline) console.log(`    ${fmtTime(row.t).padStart(5)}  ${String(row.wave).padStart(4)}  ${String(row.hp + '/' + row.maxHp).padEnd(9)} ${String(row.lvl).padStart(3)}  ${String(row.kills).padStart(5)}  ${String(row.enemies).padStart(6)}   ${row.x},${row.z}`);
      if (r.trace && r.trace.length > 2) {
        // Snag metric: 10 s intervals in which the knight moved under 2.5 units. A kiting
        // bot never stands still by choice, so this is time pinned on obstacles/enemies.
        let stuck = 0; for (let i = 1; i < r.trace.length; i++) if (Math.hypot(r.trace[i][1] - r.trace[i - 1][1], r.trace[i][2] - r.trace[i - 1][2]) < 2.5) stuck++;
        console.log(`    snagged ${Math.round(100 * stuck / (r.trace.length - 1))}% of 10s intervals`);
      }
      if (r.diedAt) { const last = r.trace.slice(-9).map(([t, x, z]) => `${t}s:${x},${z}`).join(' '); console.log(`    died at ${r.diedAt}; last 90s: ${last}`); }
      await g.page.evaluate(() => window.__cs.returnToMenu());
    }
    console.log('\nSUMMARY');
    for (const r of results) console.log(`  ${r.ch.padEnd(8)} ${r.map.padEnd(10)} ${r.result.padEnd(9)} wave ${String(r.wave).padStart(2)}  ${fmtTime(r.t)}  lvl ${r.lvl}  kills ${r.kills}`);
    console.log(g.errors.length ? `JS ERRORS (${g.errors.length}):\n  ` + [...new Set(g.errors)].slice(0, 15).join('\n  ') : 'no JS errors');
    await g.close(); return;
  }
  console.error('unknown mode', mode);
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });

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

    // ---- TITLE SCREEN: ANY KNIGHT TO ANY SLOT ----
    // Join two companions, then check every arrangement is reachable.
    cs.coopPending.clear();
    document.querySelector('.char-card[data-char="dad"]').click();
    cs.padSlot(1); cs.padSlot(2);
    cs.coopPending.set('pad:1', { character: 'brennan', device: { type: 'pad', index: 1 } });
    cs.coopPending.set('kb', { character: 'parker', device: { type: 'kb' } });
    cs.renderCoopRoster();
    const arrangement = () => [cs.selectedCharacter,
      cs.coopPending.get('pad:1').character, cs.coopPending.get('kb').character].join(',');
    out.startArrangement = arrangement();

    // The case the user hit: P1 wants Parker, P2 wants Brennan. Clicking Parker
    // for P1 must SWAP with whoever had it, not scatter the companions.
    document.querySelector('.char-card[data-char="parker"]').click();
    out.afterP1TakesParker = arrangement();

    // And a companion can take a knight back off player 1.
    cs.assignKnight('pad:1', 'parker');
    out.afterP2TakesParker = arrangement();

    // Cycling wraps through all three, in both directions, from any slot.
    const seen = new Set();
    for (let i = 0; i < 6; i++) { cs.cycleKnight('kb', 1); seen.add(cs.coopPending.get('kb').character); }
    out.kbReachedAll = [...seen].sort().join(',');
    for (let i = 0; i < 3; i++) cs.cycleKnight('kb', -1);
    out.noDuplicates = new Set(arrangement().split(',')).size === 3;

    // The cards say who holds them.
    out.cardBadges = [...document.querySelectorAll('.char-card')]
      .map(c => `${c.dataset.char}:${c.querySelector('.char-owner')?.textContent || '-'}`).join(' ');
    // Every roster slot is clickable.
    out.rosterClickable = [...document.querySelectorAll('#coop-slots .coop-slot')].map(b => b.tagName).join(',');
    cs.coopPending.clear();
    document.querySelector('.char-card[data-char="dad"]').click();

    // ---- THE CARD SHOWS THE KNIGHT YOU ACTUALLY PLAY ----
    // What each hand bone is holding, by the gear model's own name.
    const gearOf = (model) => {
      const out = { hand_r: [], hand_l: [] };
      model.traverse(c => {
        if (!c.isBone || !out[c.name]) return;
        for (const child of c.children) if (!child.isBone) out[c.name].push(child.name || 'gear');
      });
      return `${out.hand_r.length}/${out.hand_l.length}`;
    };
    out.previewGear = {};
    for (const k of ['dad', 'brennan', 'parker']) {
      const pv = cs.charPreviews[k];
      out.previewGear[k] = pv && pv.model ? gearOf(pv.model) : 'missing';
    }

    await cs.startRun({ character: 'dad', map: 'kingsfield', ogre: 0 });
    // P2 on a pad, P3 on the keyboard: both input paths in one run.
    await cs.joinPlayer('brennan', { type: 'pad', index: 1 });
    await cs.joinPlayer('parker', { type: 'kb' });
    const P = cs.players;
    out.partySize = P.length;
    out.inGameGear = {};
    for (const pl of P) out.inGameGear[pl.character] = gearOf(pl.mesh);
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

    // ---- SHARED XP + PER-PLAYER CARD PICKS ----
    const lvlBefore = P.map(p => p.state.level);
    cs.gainXP(400);
    out.levelsAfterXP = P.map(p => p.state.level);
    out.levelsMovedTogether = P.every(p => p.state.level > lvlBefore[0]);
    out.pendingPicks = P.map(p => (p.picks ? p.picks.length : 0) + (cs.pickingPlayer === p ? 1 : 0));

    // The card screen must PAUSE, and it must belong to exactly one knight.
    out.pausedWhilePicking = cs.state.paused && cs.upgradeScreenOpen;
    out.ownerShown = document.getElementById('pick-owner').textContent;

    // Nobody but the owner may drive it. Drive every OTHER pad and the keyboard
    // for a few frames and check the card screen has not moved on.
    const owner = cs.pickingPlayer;
    const before = cs.upgradeScreenOpen && owner;
    for (let i = 0; i < 6; i++) {
      for (let pi = 0; pi < 3; pi++) {
        if (owner && owner.padIndex === pi) continue;
        Object.assign(cs.padSlot(pi), { a: false, dpadDown: true });
      }
      cs.step(0.05);
      for (let pi = 0; pi < 3; pi++) {
        if (owner && owner.padIndex === pi) continue;
        Object.assign(cs.padSlot(pi), { a: true, dpadDown: false });
      }
      cs.step(0.05);
    }
    for (let pi = 0; pi < 3; pi++) Object.assign(cs.padSlot(pi), { a: false, dpadDown: false, prevA: false });
    out.foreignInputIgnored = before && cs.upgradeScreenOpen && cs.pickingPlayer === owner;

    // ---- A COMPANION'S PICK LANDS ON THE COMPANION ----
    // Force the queue to P2 and take a weapon card; P1's sheet must not move.
    for (const pl of P) pl.picks = [];
    while (cs.upgradeScreenOpen) document.querySelector('#skip-btn')?.click();
    // Every card bumps the picker's rank book, whatever kind of card it is, so
    // that is the signal: it must land in P2's book and nowhere near P1's.
    const snap = pl => JSON.stringify([pl.ranks, Object.entries(pl.weapons).map(([k, w]) => [k, w.level]),
                                       pl.state.damage, pl.state.maxHp, pl.state.armor, pl.state.relics]);
    P[1].picks = ['level'];
    cs.presentNextLevelUp();
    out.pickOwnerIsP2 = cs.pickingPlayer === P[1];
    const p1Snap = snap(P[0]), p2Snap = snap(P[1]);
    out.cardTitle = document.querySelector('.upgrade-title')?.textContent || '(none)';
    document.querySelector('.upgrade-btn')?.click();
    out.p1Untouched = snap(P[0]) === p1Snap;
    out.p2Changed = snap(P[1]) !== p2Snap;
    out.p2Ranks = Object.keys(P[1].ranks).length;
    out.p1Ranks = Object.keys(P[0].ranks).length;
    // The globals must be back on player 1 the moment the screen closes.
    out.globalsRestored = cs.state.player === P[0].state && cs.playerWeapons === P[0].weapons;

    // ---- A FULL ROUND OF PICKS REACHES EVERY KNIGHT ----
    // Six levels' worth of cards, always taking the first weapon card on offer,
    // and then every knight must have levelled a weapon of their own.
    for (const pl of P) { pl.picks = []; for (const k of Object.keys(pl.ranks)) delete pl.ranks[k]; }
    const wBefore = P.map(pl => Object.values(pl.weapons).reduce((n, w) => n + w.level, 0));
    for (let round = 0; round < 6; round++) for (const pl of P) pl.picks.push('level');
    cs.presentNextLevelUp();
    let guard = 0;
    while (cs.upgradeScreenOpen && guard++ < 200) {
      const btns = [...document.querySelectorAll('.upgrade-btn')];
      const weaponCard = btns.find(b => /NEW|Lv \d/.test(b.textContent)) || btns[0];
      weaponCard?.click();
    }
    out.weaponGain = P.map((pl, i) => Object.values(pl.weapons).reduce((n, w) => n + w.level, 0) - wBefore[i]);
    out.ranksEach = P.map(pl => Object.keys(pl.ranks).length);
    out.resumedAfterPicks = !cs.state.paused;

    // ---- HUD SHOWS EACH COMPANION'S WEAPONS AND RELICS ----
    P[1].state.relics = { wolfsbane: true };
    P[2].state.relics = { berserker: true };
    cs.updateHudNow && cs.updateHudNow();
    out.kitSlots = [...document.querySelectorAll('.coop-kit')].map(e => e.querySelectorAll('.coop-wpn').length);
    out.kitRelics = [...document.querySelectorAll('.coop-kit')].map(e => e.querySelectorAll('.coop-rel').length);

    // ---- DAMAGE IS CREDITED TO THE KNIGHT WHO DEALT IT ----
    // P3 alone gets a huge crit chance. If crit belonged to P1 (the old bug),
    // P3's hits would never crit and P1's always would.
    const critOf = (pl, n) => {
      const e = { hp: 1e9, maxHp: 1e9, mesh: { position: { x: 0, y: 0, z: 0 } }, isDying: false, type: 'goblin', anims: {} };
      let crits = 0;
      for (let i = 0; i < n; i++) { cs.applyDamage(e, 10, { source: 'sword', canCrit: true, by: pl }); if (cs.lastHitCrit) crits++; }
      return crits;
    };
    P[0].state.critChance = 0; P[1].state.critChance = 0; P[2].state.critChance = 1;
    out.critByOwner = [critOf(P[0], 40), critOf(P[1], 40), critOf(P[2], 40)];

    // Lifesteal heals the killer, not player 1.
    P[0].state.lifesteal = 0; P[2].state.lifesteal = 20;
    P[0].state.hp = 50; P[2].state.hp = 20;
    P[0]._lastLifesteal = -1; P[2]._lastLifesteal = -1;
    cs.registerKill(P[2]);
    out.lifestealHealedKiller = { p1: Math.round(P[0].state.hp), p3: Math.round(P[2].state.hp) };
    P[2].state.lifesteal = 0;

    // An area attack hits every knight standing in it, not just player 1.
    P.forEach(pl => { pl.mesh.position.set(0, 0, 0); pl.state.iframes = 0; pl.state.hp = pl.state.maxHp; });
    cs.damagePlayersInRadius({ x: 0, y: 0, z: 0 }, 5, 30, { by: 'test blast', falloff: false });
    out.blastHitAll = P.map(pl => pl.state.maxHp - Math.round(pl.state.hp));

    // Armour protects the knight being hit, not everyone equally.
    P.forEach(pl => { pl.state.iframes = 0; pl.state.hp = pl.state.maxHp; pl.state.armor = 0; });
    P[2].state.armor = 8;   // -36%
    cs.damagePlayersInRadius({ x: 0, y: 0, z: 0 }, 5, 100, { by: 'test blast', falloff: false });
    out.armorPerKnight = P.map(pl => pl.state.maxHp - Math.round(pl.state.hp));
    P.forEach(pl => { pl.state.armor = 0; pl.state.hp = pl.state.maxHp; pl.state.relics = null; pl.state.critChance = 0.05; });

    // ---- PARTY-WIDE REWARDS REACH EVERY KNIGHT ----
    P.forEach(pl => { pl.state.hp = 10; });
    cs.partyHeal(0.5);
    out.partyHealed = P.map(pl => Math.round(pl.state.hp));
    const spdBefore = P.map(pl => pl.state.speed);
    cs.partyBuff('speed', 3, 5);
    out.partyBuffed = P.map((pl, i) => +(pl.state.speed - spdBefore[i]).toFixed(1));
    P.forEach(pl => { pl.state.hp = pl.state.maxHp; });

    // ---- COINS FLY TO THE NEAREST KNIGHT, NOT ALWAYS P1 ----
    // The party is pinned for this one: the coin must move, not the knights.
    // P1 sits on the FAR side of the coin, so "moved toward P3" and "moved
    // toward P1" point in opposite directions and the check means something.
    P[0].mesh.position.set(40, 0, 0);
    P[1].mesh.position.set(10, 0, 0);
    P[2].mesh.position.set(20, 0, 0);
    P.forEach(pl => { pl.state.isDead = false; });
    cs.pickups.length = 0;   // a lone coin cannot be merged into a blob mid-test
    cs.spawnPickup('coin', { x: 24, y: 0.5, z: 0 });
    const coin = cs.pickups[cs.pickups.length - 1];
    const dTo = pl => Math.hypot(coin.mesh.position.x - pl.mesh.position.x, coin.mesh.position.z - pl.mesh.position.z);
    const before3 = dTo(P[2]), before1 = dTo(P[0]);
    for (let i = 0; i < 10; i++) cs.step(0.05);
    out.coinMovedToP3 = +(before3 - dTo(P[2])).toFixed(2);
    out.coinMovedToP1 = +(before1 - dTo(P[0])).toFixed(2);

    // ---- ENEMIES KEEP FIGHTING WHEN P1 IS DOWN ----
    spread();
    for (let i = 0; i < 8; i++) cs.spawnEnemy('goblin', 0, { at: { x: P[2].mesh.position.x + 6, z: P[2].mesh.position.z }, dist: 2 });
    for (let i = 0; i < 10; i++) { cs.step(0.05); spread(); }
    cs.triggerPlayerDeath(P[0]);
    const eBefore = cs.enemies.filter(e => !e.isDying).map(e => ({ e, x: e.mesh.position.x, z: e.mesh.position.z }));
    for (let i = 0; i < 30; i++) { cs.step(0.05); spread(); }
    out.enemiesStillMove = eBefore.filter(r => !r.e.isDying &&
      Math.hypot(r.e.mesh.position.x - r.x, r.e.mesh.position.z - r.z) > 0.5).length;
    out.enemiesChecked = eBefore.length;
    P[0].state.isDead = false; P[0].state.bleedOut = 0; P[0].state.hp = P[0].state.maxHp;
    P[0]._gameOverTimer = 0; P[0].state._gameOverTimer = 0;
    for (const e of cs.enemies.slice()) e.hp = -1;
    for (let i = 0; i < 20; i++) cs.step(0.05);

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

    // ---- EACH KNIGHT'S OWN PROFILE: GOLD, FORGE RANKS, STAT EFFECT ----
    // Give the three knights different wallets and different Forge investments,
    // then check that nothing leaks between them.
    const save0 = cs.loadSave();
    save0.profiles.dad     = { gold: 1000, ranks: { vitality: 5, treasure: 0, rerolls: 0 } };
    save0.profiles.brennan = { gold: 2000, ranks: { vitality: 0, treasure: 3, rerolls: 2 } };
    save0.profiles.parker  = { gold: 3000, ranks: { vitality: 2, treasure: 0, banish: 2 } };
    save0.shared.achievements = ['wave5'];
    cs.saveSave(save0);

    out.walletsSeparate = P.map(pl => cs.loadMeta(pl).gold);
    out.ranksSeparate = P.map(pl => cs.loadMeta(pl).ranks.vitality || 0);
    out.sharedVisibleToAll = P.every(pl => (cs.loadMeta(pl).achievements || []).includes('wave5'));

    // Forge STATS have to reach the knight who paid for them: +10 Max HP per
    // vitality rank, on top of each character's own base.
    const sheet = () => ({ maxHp: 100, hp: 100, damage: 0, speed: 0, armor: 0, critChance: 0, regen: 0 });
    const forged = P.map(pl => { const ps = sheet(); cs.applyForgeStatsTo(ps, pl); return ps.maxHp - 100; });
    out.forgeHpByKnight = forged;          // expect dad +50, brennan +0, parker +20

    // Fate's Favor and Fate's Scorn are per knight too (they were player 1's only).
    // The `who` has to carry the character, or profileIdFor() falls back to the
    // knight on the title screen and every wallet reads as dad's.
    const charges = P.map(pl => { const q = { index: 9, character: pl.character, weapons: {}, rerollCharges: 0, banishCharges: 0 };
      cs.applyForgeStatsTo(sheet(), q); return [q.rerollCharges, q.banishCharges]; });
    out.rerollByKnight = charges.map(c => c[0]);   // expect 0, 2, 0
    out.banishByKnight = charges.map(c => c[1]);   // expect 0, 0, 2

    // A run pays every knight into their OWN wallet, at their OWN Golden Touch rank.
    cs.state.wave = 10; cs.state.kills = 500; cs.state.score = 5000;
    const goldBefore = P.map(pl => cs.loadMeta(pl).gold);
    const expectRatio = cs.calcRunGold(P[1]) / cs.calcRunGold(P[0]);   // brennan has treasure 3
    cs.gameOver(false);
    const goldAfter = P.map(pl => cs.loadMeta(pl).gold);
    out.goldGained = goldAfter.map((g, i) => g - goldBefore[i]);
    out.goldenTouchRatio = +expectRatio.toFixed(2);
    out.allThreePaid = out.goldGained.every(g => g > 0);
    out.brennanPaidMore = out.goldGained[1] > out.goldGained[0];

    // The Forge screen opens on the title-screen knight, but a companion can pick
    // their own wallet and spend from it without being made player 1 first.
    cs.forgeProfileReset();
    cs.renderForge();
    out.forgeOpensOn = document.getElementById('forge-gold').textContent;
    out.forgeTabs = [...document.querySelectorAll('.forge-who-tab')].map(b => b.dataset.who).join(',');
    document.querySelector('.forge-who-tab[data-who="parker"]').click();
    out.forgeAfterTab = document.getElementById('forge-gold').textContent;
    // Buy Fortified Vitality (50 gold) as parker and check whose purse paid.
    const purseBefore = cs.PROFILE_IDS.map(id => cs.loadMeta(id).gold);
    document.querySelectorAll('#forge-grid .forge-item')[0].click();
    const purseAfter = cs.PROFILE_IDS.map(id => cs.loadMeta(id).gold);
    out.forgeSpend = purseAfter.map((g, i) => g - purseBefore[i]);

    // ---- PARTY WIPE ends the run ----
    cs.triggerPlayerDeath(P[1]); cs.triggerPlayerDeath(P[2]); cs.triggerPlayerDeath(P[0]);
    out.wipe = { alive: cs.alivePlayers().length, gameOverTimer: +(P[0].state._gameOverTimer || 0).toFixed(1) };

    return out;
  });

  check('select starts dad/brennan/parker', r.startArrangement === 'dad,brennan,parker', r.startArrangement);
  check('P1 taking Parker swaps, not scatters', r.afterP1TakesParker === 'parker,brennan,dad', r.afterP1TakesParker);
  check('a companion can take it back', r.afterP2TakesParker === 'brennan,parker,dad', r.afterP2TakesParker);
  check('cycling reaches every knight', r.kbReachedAll === 'brennan,dad,parker', r.kbReachedAll);
  check('no two slots share a knight', r.noDuplicates, String(r.noDuplicates));
  check('cards show who holds them', /dad:P/.test(r.cardBadges) && /parker:P/.test(r.cardBadges), r.cardBadges);
  check('roster slots are buttons', /^(BUTTON,?)+$/.test(r.rosterClickable), r.rosterClickable);
  // Parker's card used to show a sword and a shield while the game gave him a staff.
  check('preview gear matches the game', ['dad', 'brennan', 'parker'].every(k => r.previewGear[k] === r.inGameGear[k]),
    ['dad', 'brennan', 'parker'].map(k => `${k} ${r.previewGear[k]} vs ${r.inGameGear[k]}`).join(', '));
  check('Parker carries a staff, no shield', r.inGameGear.parker === '1/0', `hand_r/hand_l = ${r.inGameGear.parker}`);
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
  check('card screen pauses the game', r.pausedWhilePicking, String(r.pausedWhilePicking));
  check('card screen names its owner', /P\d/.test(r.ownerShown), r.ownerShown || '(blank)');
  check('other pads cannot pick', r.foreignInputIgnored, String(r.foreignInputIgnored));
  check('queue can hand the card to P2', r.pickOwnerIsP2, String(r.pickOwnerIsP2));
  check("P2's pick lands on P2", r.p2Changed && r.p2Ranks > 0, `${r.cardTitle} -> ${r.p2Ranks} ranks`);
  check("P2's pick leaves P1 alone", r.p1Untouched && r.p1Ranks === 0, `P1 has ${r.p1Ranks} ranks`);
  check('globals restored on close', r.globalsRestored, String(r.globalsRestored));
  check('every knight levels their own weapons', r.weaponGain.every(n => n > 0), r.weaponGain.join('/'));
  check('every knight banks their own ranks', r.ranksEach.every(n => n > 0), r.ranksEach.join('/'));
  check('game resumes once picks are done', r.resumedAfterPicks, String(r.resumedAfterPicks));
  check('HUD lists each companion weapons', r.kitSlots.every(n => n > 0), r.kitSlots.join('/'));
  check('HUD lists each companion relics', r.kitRelics.every(n => n > 0), r.kitRelics.join('/'));
  check('crit belongs to the knight who hit', r.critByOwner[0] === 0 && r.critByOwner[1] === 0 && r.critByOwner[2] === 40, r.critByOwner.join('/') + ' of 40');
  check('lifesteal heals the killer', r.lifestealHealedKiller.p1 === 50 && r.lifestealHealedKiller.p3 > 20, JSON.stringify(r.lifestealHealedKiller));
  check('a blast hits every knight in it', r.blastHitAll.every(n => n > 0), r.blastHitAll.join('/'));
  check('armour is per knight', r.armorPerKnight[2] < r.armorPerKnight[0], r.armorPerKnight.join('/'));
  check('a party heal reaches everyone', r.partyHealed.every(n => n > 10), r.partyHealed.join('/'));
  check('a party buff reaches everyone', r.partyBuffed.every(n => n === 3), r.partyBuffed.join('/'));
  check('coins fly to the nearest knight', r.coinMovedToP3 > 0.1 && r.coinMovedToP1 <= 0,
    `${r.coinMovedToP3} closer to P3, ${r.coinMovedToP1} to P1`);
  check('enemies fight on when P1 is down', r.enemiesStillMove > 0, `${r.enemiesStillMove}/${r.enemiesChecked} kept moving`);
  check('down does NOT end the run', r.downedNotGameOver.gameOverTimer === 0 && r.downedNotGameOver.alive === 2, JSON.stringify(r.downedNotGameOver));
  check('bleed-out counts down', r.bleedTicked < 25 && r.bleedTicked > 0, `${r.bleedTicked}s left`);
  check('teammate revives', r.revived.isDead === false && r.revived.hp > 0, JSON.stringify(r.revived));
  check('HUD reflects revived HP', /\d+\/\d+/.test(r.hudTextAfterRevive.join(' ')), r.hudTextAfterRevive.join(' | '));
  check('party wipe ends run', r.wipe.alive === 0 && r.wipe.gameOverTimer > 0, JSON.stringify(r.wipe));
  check('wallets are per knight', r.walletsSeparate.join(',') === '1000,2000,3000', r.walletsSeparate.join('/'));
  check('Forge ranks are per knight', r.ranksSeparate.join(',') === '5,0,2', r.ranksSeparate.join('/'));
  check('achievements stay shared', r.sharedVisibleToAll, String(r.sharedVisibleToAll));
  check('Forge stats reach the buyer', r.forgeHpByKnight.join(',') === '50,0,20', '+HP ' + r.forgeHpByKnight.join('/'));
  check('Fate\'s Favor is per knight', r.rerollByKnight.join(',') === '0,2,0', r.rerollByKnight.join('/'));
  check('Fate\'s Scorn is per knight', r.banishByKnight.join(',') === '0,0,2', r.banishByKnight.join('/'));
  check('a run pays every knight', r.allThreePaid, '+' + r.goldGained.join(' / +'));
  check('Golden Touch is the buyer\'s', r.brennanPaidMore, `ratio ${r.goldenTouchRatio}, gained ${r.goldGained.join('/')}`);
  check('Forge opens on the P1 knight', /Dad/.test(r.forgeOpensOn), r.forgeOpensOn);
  check('Forge offers a tab per knight', r.forgeTabs === 'dad,brennan,parker', r.forgeTabs);
  check('a tab switches the wallet', /Parker/.test(r.forgeAfterTab), r.forgeAfterTab);
  check('spending debits that knight', r.forgeSpend[0] === 0 && r.forgeSpend[1] === 0 && r.forgeSpend[2] < 0, r.forgeSpend.join('/'));
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

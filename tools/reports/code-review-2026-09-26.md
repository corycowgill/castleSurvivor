# Castle Survivor code review, 2026-09-26

Scope: `index.html` (12,938 lines at HEAD `c7b88e3`), `vfx.js`, `assets-extra.js`, `tools/`. Static review only: `node --check`, grep, and a brace-matching script for function sizes. No browser was run.

**Line numbers are from the committed HEAD version of `index.html`.** The working tree was being edited by another agent during this review (162 insertions / 39 deletions, all in CSS, markup, `gameOver`, `returnToMenu`, `readInput`, menu rows and the Ogre buttons), so working-tree numbers past line 1500 drift by up to ~120 lines. Every quote below was verified against `git show HEAD:index.html`.

Known decisions not repeated as findings: module split deferred (PLAN 7.4, 16.7), online co-op deferred (19.6), the dormant `quickblade` / Tempest Edge (21.2), profile-is-a-knight (Phase 25), the 3-player balance pass still owed (19.5).

---

## 1. Architecture overview

One module script from line 1653 to 12938, in this order:

| Region | Lines | What lives there |
|---|---|---|
| Constants and tables | 1678-2043 | `BUILD`, world/player constants, `WEAPON_NAMES/ICONS/STATS`, `OGRE_LEVELS`, the `state` singleton (1869), `CHARACTER_PASSIVES`, entity arrays (`enemies`, `pickups`, `projectiles`, `bossBoulders`), streak/wave-event tables, scratch vectors and pools |
| Sim helpers | 2043-2247 | dispose helpers, buffs, spatial grid (`rebuildGrid`/`queryEnemies`), separation, `runStats` |
| Renderer, lights, post | 2248-2520 | scene, camera, `renderer`, lantern pool, `vfx = createVFXSystem(...)`, composer (GTAO, bloom, `DamageFlashShader`), screen flash |
| Downed / revive | 2518-2627 | `triggerPlayerDeath`, `updateDownedPlayers`, revive banner |
| Asset loading | 2628-2853 | GLTF/Draco loaders, `assetList` (2636), `loadAssetEntries`, `parseEnemyModel`, `cloneEnemyModel`, `primeSkinnedBounds`, `ASSET_FILE_MAP`, `EXTRA_ASSETS` join |
| `AudioSystem` | 2854-3174 | an IIFE module: buffers, synth fallback, `playMusic`/`stopMusic`, volume |
| Settings, private mode | 3174-3419 | `settings`, `GFX_CONTROLS`, `loadSettings`, `renderSettings`, unlock code |
| Maps | 3420-4310 | `MAPS` (3420), ground/water/stream/tuft materials, `loadMap` (3992), `unloadMap`, breakables, fires, mires |
| Players and party | 4311-4790 | legacy singletons (`playerMesh`, `playerMixer`, `playerAnims` 4311-4315), `players[]` (4324), `makePlayer`, `adoptLegacyIntoPlayer0`, `PARTY_SCALE`, `partyFocus`, `nearestPlayer`, `CHARACTER_GEAR`, `createPlayer` (4550), `joinPlayer`, `resetPartyToSolo`, `applyForgeStatsTo` |
| Enemies | 4789-5690 | `ENEMY_TYPES`, `spawnEnemy` (4835), HP-bar sprites, `spawnBoss`, `spawnDragonOgreBoss`, enemy arrows, boss patterns, boulders, enemy anims |
| Pickups, powerups, numbers | 5688-6040 | pickup pool, coin merging, world chests, damage numbers, death particles, shake, off-screen indicators |
| Streaks and wave events | 6042-6167 | `onStreakKill`, `triggerWaveEvent`, `updateWaveEvent` |
| Player update | 6169-6446 | `updatePlayer(p, dt)`: input, dash, primary attack (sword/spear/staff branches) |
| Damage core | 6447-6822 | `SOURCE_NAMES`, `DEATH_FX`, `LOOT_TABLE`, `applyDamage` (6489), `killEnemy`, `dropLoot`, `damagePlayer`, `damagePlayersInRadius`, `detonateBombGuy` |
| Enemy update | 6822-7322 | `updateEnemies`: the 500-line loop (targeting, anim LOD, AI per type, shaman heals, boss) |
| Weapons and projectiles | 7383-7890 | `updateWeapons(p, dt)` with seven `// --- WEAPON ---` blocks, ward shields, orbital bombs, chain lightning, burn patches, projectile pool |
| Waves and formations | 7886-8230 | `triggerSwarm`, `WAVE_SCRIPT`, `waveWeights`, `FORMATIONS`, `updateWaves`, kills/combo |
| Level-up and picks | 8229-8540 | `xpForLevel`, `gainXP`, pick queue, `beginPickContext`/`endPickContext` (8304), relics, rarities, `UPGRADES` (8448), banish |
| Meta and Forge | 8541-8800 | unlocks, mastery, `FORGE_UPGRADES`, save schema v2 (`_blankSave`, `_migrate`, `loadSave`, `loadMeta`, `saveMeta`), `renderForge` |
| Milestones, synergies, evolutions | 8805-8975 | `RUN_MILESTONES`, `WEAPON_SYNERGIES`, `WEAPON_EVOLUTIONS`, `evolveWeapon` |
| Level-up screen | 8975-9222 | `showLevelUp`, pick-device gating, `pickUpgrades`, `populateUpgradeChoices` |
| HUD and minimap | 9222-9583 | cached elements, `updateCoopHud`, `updateHUD` (9341), `updateMinimap` |
| Run end and lifecycle | 9584-10090 | grade, best run, Hall of Fame, `gameOver` (9752), `clearRun` (9890), `startRun`, `resetGame`, `returnToMenu` |
| Loop | 10099-10385 | `gameLoop` (rAF, slow-mo, adaptive quality, hit-freeze, camera), `updateGame` (the ordered tick) |
| Creatures | 10385-10878 | shared creature helpers, Lupin, the horse |
| Input | 10878-10966, 11440-11472, 11753-11910 | gamepad slots, `readInput(p)`, touch |
| Mobile quality and audit | 10967-11203 | `LOW_QUALITY`, `applyQualityMode`, on-device audit overlay |
| Co-op roster | 11204-11440 | `coopPending`, `assignKnight`, `renderCoopRoster`, `updateCoopJoin` |
| Menus | 11473-11752 | `MENU_SCREENS`, focus rows, `togglePause`, `pauseLoadoutHtml`, keyboard handler |
| Title screen | 11910-12256 | character previews, `setPlayerOneCharacter`, tips, Ogre buttons, `beginQuest` (12147), button wiring |
| Codex | 12256-12675 | `populateHelpScreen` (197 lines of HTML strings), enemy previews, help modal |
| Boot and `?debug` hook | 12723-12938 | `init()`, then `window.__cs = {...}` (12750) with `step`, `startRun`, `returnToMenu`, `setLoopUpdates`, `setRendering` |

**Global mutable state.** The sim is driven by module-level `let`s and arrays, not by an object graph. Two overlapping models coexist: the original singletons (`state.player`, `playerWeapons`, `playerMesh`, `weaponTimers`, `upgradeRanks`, `banishedUpgrades`, `_activeSynergies`, `rerollCharges`, `banishCharges`) and `players[]`, where `players[0]` aliases those same objects (`makePlayer` 4348, `adoptLegacyIntoPlayer0` 4375). Companions get fresh copies. `beginPickContext` (8304) re-points the singleton `let`s at the picking knight for the duration of a level-up card. This aliasing is the single biggest source of correctness findings below: every one of the 90 `state.player`, 76 `playerMesh` and 45 `players[0]` references is "player 1" unless it sits inside the pick context or a `for (const p of players)` loop.

**The update loop** (`updateGame` 10265) is variable-step: `rawDt = Math.min(clock.getDelta(), 0.05)` (10104), scaled by slow-mo and hit-freeze, then a fixed call order (grid, players, downed, obstacles cache, enemies, separation, companion, enemy projectiles, boulders, weapons, horse, projectiles, bombs, burn patches, pickups, numbers, particles, HP bars, powerups, waves, buffs...). The harness bypasses the frame clock and calls `updateGame(1/60)` directly through `step` (12894), so tests run a fixed step the game itself never does.

**Where the file fights its size.** (a) The two player models above. (b) Three hand-copied player sheets: `state.player` (1881-1904), `makePlayerState` (4328), and the reset list in `clearRun` (9946-9955), each with a different field set. (c) Six functions over 200 lines and 15 over 100. (d) Tables that must agree by hand: `WEAPON_NAMES`, `WEAPON_ICONS`, `WEAPON_STATS`, `weaponTimers`, `PRIMARY_WEAPONS`, `SOURCE_NAMES`, `RARE_UPGRADES`, `WEAPON_EVOLUTIONS`, `EVOLUTION_COLORS`, Codex `weaponDetails`, each keyed by weapon id, with no check that they cover the same keys (they do not; see C12, M-dead). (e) Forward references across 10,000 lines that are only safe because nothing runs until `init()`.

---

## 2. Correctness findings

Ranked by player impact. Each: location, the line, what happens, trigger, fix.

### C1. Restart after a co-op run silently drops every companion
`index.html:10068-10071`
```js
function resetGame() {
  clearRun();
  startRun();
}
```
`clearRun` calls `resetPartyToSolo()` (9967) which truncates `players` to one. Only `beginQuest` (12165) re-runs `spawnCoopCompanions()`. The RISE AGAIN button is wired to `resetGame` (12179).
**Trigger:** any co-op run ends, press RISE AGAIN. P2/P3 vanish, party scaling and the shared XP curve snap to solo, their pads go dead.
**Fix:** `async function resetGame() { clearRun(); await spawnCoopCompanions(); startRun(); }`, or route the button through `beginQuest`.

### C2. A pad companion's level-up card can soft-lock the game
`index.html:9041-9046` and `9048-9058`
```js
if (p.padIndex != null) return gamepadStates[p.padIndex] || _DEAD_PAD;
...
return false;   // a pad companion's card cannot be answered from the keyboard
```
`gainXP` (8268) queues a pick for every knight, including one whose `bledOut` is set (nothing in `queuePick` 8244 filters). The screen is modal and paused (27.2). If the owning pad is asleep, disconnected, or its player has put it down after bleeding out, no input can answer the card: no Escape, no timeout, no fallback to P1.
**Trigger:** a second pad goes to sleep mid-run (common with Bluetooth pads and kids), then the party levels.
**Fix:** in `pickPadState`/`pickKeyAllowed` fall back to P1's inputs when `gamepadStates[p.padIndex]` is absent or `p.state.bledOut`; and skip `queuePick` for bled-out knights.

### C3. Player 1's bleed-out is permanent for the rest of the session
`index.html:9946-9955` resets `state.player` with an explicit field list that omits `bledOut`, `bleedOut` and `reviveProgress`. The only writer is `2616 ps.bledOut = true`. Companions get a fresh sheet from `makePlayer`; player 1 never does.
**Trigger:** P1 bleeds out in one co-op run, the party starts another. Next time P1 goes down, `updateDownedPlayers` skips them (2591 `if (!ps.isDead || !p.mesh || ps.bledOut) continue`), the revive banner hides them (2562), and they can never be revived until a reload.
**Fix:** add `bledOut: false, bleedOut: 0, reviveProgress: 0` to the reset at 9950. Better: build the reset from `makePlayerState()` so the three player sheets cannot drift (see M2).

### C4. BEGIN QUEST is live before boot has finished loading
`index.html:12727-12734`
```js
document.getElementById('start-screen').style.display = 'flex';
...
await setupCharacterPreviews();
await loadMap(selectedMap);
await createPlayer();
```
`beginQuest` only guards `state.started || _starting` (12148) and `loadedMap` is null mid-load (`unloadMap` 3989), so a click during those seconds runs a second `loadMap` and a second `createPlayer(0)` concurrently with init's. `unloadMap` empties `mapMeshes`/`obstacles` under the first load, whose props keep being pushed after each `await` (4008, 4066): orphaned props that no later unload can remove, doubled obstacles.
**Trigger:** press BEGIN QUEST in the first few seconds after the loading screen hides. Slow on phones, and on a desktop with `?lowq=0`.
**Fix:** set `_starting = true` at the top of `init()` and clear it after `createPlayer()`, or show the start screen after those awaits.

### C5. Enemy archers aim at one knight's X and player 1's Z
`index.html:5324-5325`
```js
const dx0 = aimMesh.position.x - enemy.mesh.position.x;
const dz0 = playerMesh.position.z - enemy.mesh.position.z;
```
The comment above (5317) says this was fixed to aim at the tracked knight. Only the X half was.
**Trigger:** every archer volley in co-op at a companion. Arrows fly along a direction that exists for nobody; when P1 and the target are far apart on Z they miss both or hit P1.
**Fix:** `aimMesh.position.z`.

### C6. Wave-event buffs land on player 1 only
`index.html:6113-6116`
```js
if (event.effect.speedBoost) addBuff('speed', event.effect.speedBoost, event.duration);
if (event.effect.armorBoost) addBuff('armor', event.effect.armorBoost, event.duration);
if (event.effect.dmgBoost) addBuff('damage', event.effect.dmgBoost, event.duration);
if (event.effect.cdReduction) addBuff('attackCooldown', -event.effect.cdReduction, event.duration);
```
`addBuff` with no `ps` defaults to `state.player` (2073). Streak and combo rewards were converted to `partyBuff` in 27.5; wave events were not. The Armor of Light shield VFX (6111) also draws on `playerMesh` only.
**Trigger:** Blessed Wind, Armor of Light, Berserker Rage, Arcane Blessing in any co-op run. Companions get the banner, not the buff.
**Fix:** replace the four `addBuff(...)` with `partyBuff(...)`; loop `alivePlayers()` for the VFX.

### C7. A companion's evolved daggers and arrows use player 1's evolution state
`index.html:7805-7807`
```js
const evolved = type === 'arrow'
  ? playerWeapons.arrowVolley.evolved
  : playerWeapons.dagger.evolved;
```
`playerWeapons` is player 1's book during gameplay. `trailType === 'storm'` gates the Storm Kunai chain (7869).
**Trigger:** a companion evolves daggers: their shots never chain. P1 evolves: companions' level-1 daggers chain and look evolved.
**Fix:** `const w = (owner || players[0]).weapons; const evolved = type === 'arrow' ? w.arrowVolley.evolved : w.dagger.evolved;`

### C8. Two music loops after a quick restart
`index.html:3090-3102`
```js
stopMusic(0.5);
setTimeout(() => { ... source.start(0); ... musicSource = { source, gain }; }, 600);
```
`musicSource` is only assigned when the timer fires. A second `playMusic` within 600 ms finds `musicSource === null`, stops nothing, and the first timer's source starts later with no handle: unstoppable for the session.
**Trigger:** `gameOver` plays `gameOverMusic` (9755); RISE AGAIN within 0.6 s plays `battleMusic` (10055). Also `returnToMenu` 10078-10079 racing a pending timer.
**Fix:** keep the pending timer id in the closure; `clearTimeout` it at the top of `playMusic`/`stopMusic`; if a source exists when a new one starts, stop it.

### C9. Nobody can pause while player 1 is down
`index.html:11610`
```js
if (!state.started || state.gameOver || state.player.isDead) return;
```
**Trigger:** P1 downed, companions still fighting; Start/Esc does nothing for anyone.
**Fix:** `alivePlayers().length === 0` in place of `state.player.isDead`.

### C10. A failed map load leaves the title screen stuck on PREPARING
`index.html:12149-12159`
```js
_starting = true;
...
await loadMap(selectedMap);
```
No `try/finally`. One rejected `loader.load` (4071, a map GLB 404 or a network blip) rejects the promise, `_starting` stays true, the button reads PREPARING... until reload and previews stay paused.
**Fix:** wrap the body in `try { ... } finally { _starting = false; btn.textContent = 'BEGIN QUEST'; }`.

### C11. Any gamepad disconnect on the title screen drops every pending companion
`index.html:11370-11371`
```js
for (const padIndex of [...coopPending.keys()]) {
  if (!gps[padIndex]) { coopPending.delete(padIndex); dirty = true; }
```
`coopPending` keys are `'pad:2'` and `'kb'` (11397, 11355), never numbers, so `gps['pad:2']` is always undefined and everything is deleted, including the keyboard companion.
**Trigger:** a pad goes to sleep or the primary pad reconnects while the roster is set up.
**Fix:** `const idx = padIndex.startsWith('pad:') ? +padIndex.slice(4) : -1; if (idx >= 0 && !gps[idx]) coopPending.delete(padIndex);`

### C12. HUD cooldown sweep is NaN for the staff, Warding Shields and Trail of Embers (solo too)
`index.html:9427-9429`
```js
const cdPct = PRIMARY_WEAPONS.has(wKey)
  ? Math.max(0, state.player.attackTimer / (state.player._primaryCD || 1) * 100)
  : (WEAPON_STATS[wKey] ? Math.max(0, weaponTimers[wKey] / WEAPON_STATS[wKey].cooldown[lvl] * 100) : 0);
```
`PRIMARY_WEAPONS` (1702) still reads `['sword', 'spear', 'quickblade']`, no `staff`; `weaponTimers` (1727) has no `wardShields` or `emberTrail`. `undefined / n` is NaN, `Math.round(NaN)` is NaN, `height:NaN%` is dropped by CSS. Parker's primary and two weapons never show a cooldown sweep.
**Fix:** `PRIMARY_WEAPONS = new Set(Object.values(CHARACTER_PRIMARY))` and `weaponTimers[wKey] == null ? 0 : ...`.

### C13. The Ogre-level unlock line erases the weapon-unlock and mastery lines
`index.html:9843`
```js
unlockLine = `<div id="go-placement" style="color:#ff7733">Ogre Level ${next} ...unlocked!</div>`;
```
The two loops above use `+=` (9827, 9835).
**Trigger:** win at a new Ogre level while also earning a mastery rank or a weapon unlock; the weapon-unlock message is lost, and with it the only in-game notice that Storm Call or Ember Trail exists.
**Fix:** `unlockLine +=`.

### C14. A save with any version other than 2 is treated as v1 and blanked
`index.html:8619`
```js
const save = data.version === 2 && data.profiles ? data : _migrate(data);
```
`_migrate` reads `v1.gold` etc. and returns a blank save. A future v3, or any tool or hand edit that bumps `version`, wipes every wallet on the next `saveSave`.
**Fix:** `data.version >= 2 && data.profiles ? data : _migrate(data)`, and a real migration switch when v3 arrives.

### C15. `saveMeta` writes the shared half back from a stale view (latent)
`index.html:8652-8661`
```js
const save = loadSave();
save.profiles[id] = { gold: meta.gold || 0, ranks: meta.ranks || {} };
save.shared.achievements = meta.achievements || save.shared.achievements;
```
Every `saveMeta`, including the Forge's gold-only writes (8781-8788), rewrites achievements, mastery, wins and ogreUnlocked from whatever `loadMeta` returned earlier. Single-tab it is safe because the Forge re-reads immediately and `gameOver` is single-writer (9848-9857 deliberately writes companions' wallets only). Two browser tabs, one on the Forge while the other finishes a run, loses that run's unlocks.
**Fix:** `saveMeta` writes only the profile half unless the caller passes `{ shared: true }`.

### C16. `loadBestRun` and `loadSettings` trust the stored shape
`index.html:9612-9613` `return data ? JSON.parse(data) : {...}` with no shape check; a stored `"5"` or `[]` makes `saveBestRun` throw inside its try and return `{ best: current, updated: false }`, so Personal Best silently shows the current run forever and NEW RECORD never fires again.
`index.html:3231` `Object.assign(settings, d)`: a stored `gfx: null` throws in `effectiveGfx` (3214) on the first frame.
**Fix:** `Object.assign(defaults, parsed)` after `typeof parsed === 'object' && !Array.isArray(parsed)`; `settings.gfx = (d.gfx && typeof d.gfx === 'object') ? d.gfx : {}`.

### C17. Switching maps on the title screen leaks per-map GPU objects
`index.html:3981-3990` `unloadMap()` only `scene.remove`s `mapMeshes`. Created fresh per `loadMap` and never disposed: decal materials (4040), tuft materials (4051), the three contact/canopy/glow materials (4179-4181), the shaft geometry and material (4127-4128), every `InstancedMesh` and its `instanceMatrix` (3818), every stream ribbon geometry and material (4155).
**Trigger:** Kingsfield -> Bloodmarch -> Kingsfield on the menu. Each change adds a set. Matters most on iOS (Phase 20).
**Fix:** tag map-owned objects `userData.mapOwned = true` where created and dispose them in `unloadMap`.

### C18. Companion rings and ward-shield materials leak per run
`index.html:4602-4614` builds two `radialTex` canvas textures, a third `CanvasTexture` and a `PlaneGeometry` per joined knight; `resetPartyToSolo` (4717) only removes the ring from the scene. `syncWardShields` (7637) clones a material per shield; `ring.pop()` (7641), `clearWardShields` (7645) and 4719 never dispose them.
**Fix:** dispose ring texture/geometry in `resetPartyToSolo`; dispose cloned shield materials on pop.

### C19. Companion HUD kit row can stay blank for a whole run
`index.html:9310`
```js
if (_hudPrev[`kit${i}`] !== html) { _hudPrev[`kit${i}`] = html; kit.innerHTML = html; }
```
`_hudPrev` is never cleared in `clearRun` (only `_prevWeaponHtml`/`_prevRelicHtml` are), but `updateCoopHud` rebuilds the row DOM empty whenever party size changes (9271-9288). Co-op run, solo run, co-op run with the same knight: the kit HTML is identical to the cached string, so the write is skipped.
**Fix:** `for (const k in _hudPrev) delete _hudPrev[k]` next to `_prevWeaponHtml = ''` in `clearRun`.

### C20. Latent ReferenceError in the enemy loop
`index.html:6829`
```js
const tgtMesh = tgt.mesh || tgtMesh;
```
The right-hand side names the binding being declared. Today `nearestPlayer` (4485) returns `players[0]` as a fallback and P1's mesh is never null after `createPlayer`, so the short-circuit hides it. If either changes, this throws every frame.
**Fix:** `const tgtMesh = tgt.mesh || null;`

### C21. Wave-announce timers from the previous run hide the next run's text
13 sites of `setTimeout(() => { announce.style.opacity = '0'; ... }, N)` on the shared `getWaveAnnounce()` element (5203, 5309, 6067, 6872, 6891, 6910, 6922, 7904, 8027, 8046, 8122, 8198, 8944) outlive `clearRun`. Restart within a few seconds of a boss or streak announce and WAVE 1 blinks out early. Cosmetic.
**Fix:** one `_announceTimer` id, cleared on show and in `clearRun`.

### C22. Hall of Fame and Personal Best record player 1 only
`index.html:9791` `character: CHARACTER_ASSETS[selectedCharacter]?.name` and `9778` `saveBestRun(...)` keyed on the device-global `castleSurvivor_best`. A three-knight victory enters the hall as Dad alone. PLAN 25 says bests are "comparable across the family" but there is one best per device. Design call, flagged.
**Fix:** store `party: players.map(p => CHARACTER_NAMES[p.character])` on the row; decide whether best is per profile.

### C23. Smaller single-player leftovers (cosmetic in co-op)
- `8818` the `'3weapons'` milestone counts `playerWeapons` (P1) only.
- `10331-10359` swing trail, ambient dust and footsteps run on `playerMesh` only; companions get none.
- `10368` music muffle follows `state.player.hp` only.
- `6449` `SOURCE_NAMES` has no `staff`, so the game-over damage breakdown prints the raw key `staff` for Parker's primary (`9746 ${SOURCE_NAMES[k] || k}`).
- `9062` `RARE_UPGRADES` has `quickblade` but no `staff`, so Fortune's Favor never weights Parker's primary card.
- `12290-12299` Codex `weaponDetails` has `quickblade` ("Quickblade — Parker") but no `staff`, so with the unlock code the Codex lists a weapon nobody carries and describes Parker's real one from the card blurb.
- `12094` START_TIPS still says "sword, spear or quickblade".

### C24. The loop is variable-step; the harness is fixed-step
`index.html:10104` `const rawDt = Math.min(clock.getDelta(), 0.05);` with no accumulator. Below 20 fps the sim runs slower than wall-clock (a 12 fps phone plays at 60% speed), which is a hidden difficulty cut on exactly the devices that struggle, and the reason PLAN 19.6 needs a fixed timestep before netcode. Every balance number comes from `step()` calling `updateGame(1/60)` (12894-12899), which the game never does. Also `10115-10116` samples adaptive quality from the slow-mo-scaled `dt` rather than `rawDt`. Not a bug today; a measurement mismatch. The fix (accumulate `rawDt`, up to 3 sub-steps of 1/60) is one screen of code in `gameLoop`.

---

## 3. Maintainability findings

### M1. Largest functions (measured by brace matching)

| Lines | Function | Location |
|---|---|---|
| 500 | `updateEnemies` | 6822-7321 |
| 269 | `updatePlayer` | 6169-6437 |
| 251 | `loadMap` | 3992-4242 |
| 237 | `updateWeapons` | 7383-7619 |
| 227 | `spawnEnemy` | 4835-5061 |
| 225 | `fetchBuffer` (inside `AudioSystem`) | 2945-3169 |
| 197 | `populateHelpScreen` | 12258-12454 |
| 159 | `clearRun` | 9890-10048 |
| 156 | `gameLoop` | 10101-10256 |
| 135 | `gameOver` | 9752-9886 |
| 133 | `updateHUD` | 9341-9473 |
| 114 | `updateGame` | 10265-10378 |
| 113 | `createPlayer` | 4550-4662 |
| 106 | `setupCharacterPreviews` | 11913-12018 |
| 102 | `updateWaves` | 8050-8151 |

349 functions; 15 over 100 lines, 6 over 200. `vfx.js` has one 666-line `generateTextures` (32-697) and is otherwise well factored. `updateEnemies` is one loop body with per-type AI inline; the per-type blocks (archer, shaman, bomb goblin, boss) are natural `ENEMY_TYPES[type].update(enemy, dt)` methods. `updateWeapons` already has its seven blocks labelled with banner comments (7390-7595): each is a function waiting for a name.

### M2. Three copies of the player sheet
`state.player` literal (1881-1904), `makePlayerState()` (4328-4339), and the reset list in `clearRun` (9946-9955). The clearRun copy carries ~20 fields the other two do not (`thorns`, `lifesteal`, `luck`, `_projDmgMul`, `relics`, `_runesUntil`...), and none carries `bledOut`. This is the root cause of C3 and will produce the next one. One `makePlayerState()` used by all three, with `Object.assign(state.player, makePlayerState())` in `clearRun`. Likewise `weaponTimers` is spelled out twice (1727, 4354) and `xpToNext: 23` is hand-copied twice (1886, 4331) with a comment admitting it is `xpForLevel(1)`.

### M3. Duplicated logic
- **Material clamp** `metalness = Math.min(m, 0.3); roughness = Math.min(r, 0.85)` four times: 4114-4115 (map props), 4595-4596 (players), 4963-4964 (enemies), 5153-5154 (bosses). One `tameMaterial(m)`.
- **Alive-knight guard** `if (!p.mesh || p.state.isDead) continue;` five times (4477, 4488, 5837, 6733, 6745); `alivePlayers()` (4424) already exists.
- **Knight name/id tables** four times: `CHARACTER_ASSETS[].name` (1907), `PROFILE_IDS` (8588), `CHARACTER_NAMES` (9254), `COOP_KNIGHTS` (11204). Two of them are the same array literal.
- **Slot colours** twice: `PLAYER_RING_COLORS` (4326, rgba prefixes) and `_COOP_HUD_TINT` (9253, hex), the same three hues in two formats.
- **Ogre level colours** twice, differently: 12138 `['#e8c860', '#e8c860', ...]` and 12168 `['', '#e8c860', ...]`; belongs on `OGRE_LEVELS[i].color`.
- **Announce fade** pattern 13 times (C21).
- **Static test server** copied into 13 tool scripts (`http.createServer` in playtest, coop-verify, profile-verify, touch-verify, perf-probe, shader-churn, heap-trend, view-glb, view-anim, validate-glb, mirefen-verify, bloodmarch-verify, _ui-shots), with drifting MIME tables (playtest lacks `.webp`/`.wav`, coop-verify has them). One `tools/lib/serve.mjs` and one `openGame()`.
- **Random angle** `Math.random() * Math.PI * 2` 18 times; matters once a seed exists (T3).

### M4. Magic numbers that already have a name
- `1943` `let cd = 2.5 - ...` dash base cooldown, no constant; `getDashCooldown()` is also called without a player at 9401 and 9415 (HUD), so the HUD sweep is P1's cooldown for every knight.
- `9612`/`9634` `'castleSurvivor_best'` literal twice while `META_KEY`, `HIGH_SCORE_KEY`, `SETTINGS_KEY`, `LOWQ_KEY` exist.
- `2544`, `6611` `_deathSlowMo = 1.5` and `10109 / 1.5`: the duration is a literal in three places.
- `1878`, `9943` `waveDuration: 35` twice; `3.0` spawn interval twice.
- `10104` `0.05` frame clamp; `2073` `addBuff` default sheet; `6669` `0.4`/`0.045` armour curve (only place, fine).
- `12168` Ogre HUD colours (above).

### M5. Dead code
Known: the `quickblade` family. It is bigger than it looks and some of it is player-facing: `WEAPON_STATS.quickblade` 1780-1798, `PRIMARY_WEAPONS` 1702 (the cause of C12), `getDashCooldown` branch 1944-1945, swing pitch 6350, `SOURCE_NAMES` 6449, `UPGRADES` `primaryUpgrade('quickblade', 'Whetted Edge', ...)` 8495, `WEAPON_EVOLUTIONS.quickblade` 8877, `EVOLUTION_COLORS` 8904, `RARE_UPGRADES` 9062, START_TIPS 12094, Codex 12282 and 12292. Because the `UPGRADES` entry is still there and `isWeapon`, the Codex Weapons tab renders it.
Unreferenced (declared, never read): `TILE_SIZE` 1688, `decorations` 1952, `_sharedDebrisGeo` 1997, `_markerGeo`/`_markerMats` 4802-4803 (left over from 21.1's `markerRing` removal; `_markerGeo` still allocates a `RingGeometry`), `_hpBarCtx` 5066, `_chunk` 11489.
Transitional: `adoptLegacyIntoPlayer0` (4375) is commented "drops out entirely after that" and still runs at 4661; `gamepadState` (10878) is the first pad's state next to `gamepadStates[]`; `players[0].state === state.player` is documented only in comments.

### M6. Inconsistent naming
- The player argument is `p` in 14 signatures, `pl` in 4, `ps` (the state sheet) in 3, `who` in 6 (profile id or player or nothing). `pl` vs `p` vs `ps` matters here because `p.state` and `ps` look alike in a 500-line loop.
- `_` prefix means module-private, but 40+ `_`-names are exported on the debug hook, and some non-private globals (`playerMesh`, `ground`, `companion`, `horse`) carry no prefix while their siblings do.
- Wave event id `arcanBlessing` (1975, 2484) is a typo carried into two tables.
- `ENEMY_SPAWN_DISTANCE` and `MAGNET_RANGE` are `let`s in SCREAMING_CASE, mutated by map load and three unrelated systems (Forge 8694, card 8482, event 6119); the reset at 9996 hard-codes `6.0` rather than a base constant.

### M7. The three most valuable extractions, if the split happens
1. **`data.js`** (already PLAN 16.7): `WEAPON_STATS`, `UPGRADES`, `ENEMY_TYPES`, `WAVE_SCRIPT`, `FORMATIONS`, `RELICS`, `FORGE_UPGRADES`, `MAPS`, `OGRE_LEVELS`, `RUN_MILESTONES`, `WEAPON_EVOLUTIONS`, `SOURCE_NAMES`, `DEATH_FX`, `LOOT_TABLE`. About 1,200 lines with no behaviour. The payoff is a 20-line Node test that asserts every weapon id appears in every weapon table (would have caught C12 and the five `staff` gaps in C23 on the day Parker changed).
2. **`save.js`**: settings (3174-3242), save schema (8588-8720), best run and Hall of Fame (9584-9720). Pure functions over `localStorage`; testable in Node with a `Map` in place of storage, which is where C14, C15 and C16 belong.
3. **`party.js`**: `players[]`, `makePlayer`, `makePlayerState`, `joinPlayer`, `resetPartyToSolo`, `nearestPlayer`, `alivePlayers`, `partyFocus`, and the pick context (8304-8341). Doing this forces the `state.player` alias to be explicit, which is the only way the C1-C9 class of bug stops recurring.
`AudioSystem` (2854-3174) is already an IIFE with a closed interface and can move in ten minutes as a warm-up.

---

## 4. Tooling and test findings

### T1. `npm test` cannot fail
`package.json:6` `"test": "node tools/playtest.mjs smoke"`. `tools/playtest.mjs:651` ends the smoke run with `console.log(g.errors.length ? 'JS ERRORS...' : 'no JS errors'); await g.close(); return;` and no `process.exit(1)`; `balance` (687), `profile` (366) and `enemies` (547) do the same. Only `creatures` (549) exits non-zero. A `pageerror` in any knight's 30 seconds prints red and returns 0.

### T2. The verify scripts are not in `npm test`
`coop-verify` (60 checks), `profile-verify` (9), `touch-verify` (5) each exit 1 on failure (coop-verify.mjs:471, profile-verify.mjs:123, touch-verify.mjs:139). They are one line from being the test suite.

### T3. Nothing is seeded
99 `Math.random()` sites in `index.html`: spawn angle (4864), boss angle (5133, 5226), `rollEnemyType` (7963), `rollRarity`, `pickUpgrades`, wave-event choice, every drop roll, and the bot's own spin (`playtest.mjs:126`). Only Darkwood's layout is seeded (`mulberry32(1337)`, 3875). PLAN 22.1 already records batch swings larger than the treatment (5/6 vs 3/6 wins). One `setSeed(n)` on the hook that swaps `Math.random` for a `mulberry32` instance before `startRun`, plus `--seed` in balance, makes any run replayable.

### T4. Wall-clock waits and `eval`
`playtest.mjs:189` `setTimeout(r, 3500)` for the game-over timer and 400/800/1200 ms sleeps after `setRendering(true)`. On a loaded machine (ComfyUI running, per the contention memory) the final read can land before `gameOver()` fires. Use `page.waitForFunction(() => window.__cs.state.gameOver)`. The bot runs through `eval(b)` inside `page.evaluate` (182, 632) with `'${kind}'` interpolated into a string; pass the bot as a function argument instead.

### T5. Balance seeds a v1-shaped meta
`playtest.mjs:646` writes `{ gold: 0, ranks: {}, achievements: [...], mastery: {} }`. It only works because `_migrate` accepts it; the day v1 migration goes, balance runs start with locked weapons and no error. Seed a `version: 2` save.

### T6. Coverage
- **Covered by `npm test`:** boot, three knights on Kingsfield at Ogre 0, 30 s each with the kite bot, upgrade cards clicked by DOM (`pickUpgrade`), `returnToMenu`, console errors printed. No other map boots.
- **Covered elsewhere, not in `npm test`:** co-op join/HUD/revive/picks (coop-verify), profiles and v1 migration (profile-verify), touch (touch-verify), creatures.
- **Not covered anywhere:** pause screen and per-knight loadout, Settings (volume, low quality, private code), Forge purchase path (`renderForge` click -> `saveMeta` -> `applyForgeStatsTo`), Hall of Fame render, best-run persistence, the victory path (`triggerVictory` -> `gameOver(true)` -> `ogreUnlocked`), Ogre levels above 0, reroll and banish, chest and evolution flow beyond "click whatever matches `/EVOLUTION/`", map switching on the title screen (C17), the restart button (C1), menu keyboard/pad navigation, level-up card content (a card with NaN text passes), corrupt storage (C14, C16), wave 20 without `--minutes 24`.

### T7. Smallest additions that catch the most
1. `if (g.errors.length) process.exit(1)` in every mode, and `"test": "node tools/playtest.mjs smoke && node tools/coop-verify.mjs && node tools/profile-verify.mjs && node tools/touch-verify.mjs"`. Two edits; every thrown error in any covered path now fails CI.
2. In smoke, after each 30 s run: `Number.isFinite(hp) && kills > 0 && document.querySelectorAll('.weapon-slot-cd[style*="NaN"]').length === 0`. Catches C12 and any future NaN in the HUD.
3. A table-consistency check (node, no browser): for every id in `WEAPON_NAMES`, assert it is in `WEAPON_STATS`, `WEAPON_EVOLUTIONS`, `EVOLUTION_COLORS`, `SOURCE_NAMES` and `RARE_UPGRADES`-or-known-exception; that every `CHARACTER_PRIMARY` value is in `PRIMARY_WEAPONS`; that every `WEAPON_UNLOCKS[].milestone` is a `RUN_MILESTONES` id. Needs the tables reachable from Node, which is extraction 1 in M7, or a `--dump-tables` hook.
4. Hook additions `setSeed`, `triggerVictory`, `resetGame`, `openForge`; then a `meta` mode: buy one Forge rank, start, assert the stat; `triggerVictory()` + `step(6)`, assert `loadSave().shared.ogreUnlocked === 2` and `wins === 1`; `resetGame()` from a three-knight party, assert `players.length === 3` (C1).
5. Boot every map once in smoke (`--maps all`): five `startRun` + `step(5)` + error check, about a minute.
6. A `save-fuzz` step in profile-verify: write `"5"`, `[]`, `{version:3,...}`, `{version:2,profiles:null}`, and `{gfx:null}` settings; reload; assert no pageerror and that the v3 case preserves gold (C14, C16).

---

## 5. Top 10 actions

| # | Action | Effort | Where |
|---|---|---|---|
| 1 | Make `resetGame` re-spawn companions (C1) and add the `resetGame` co-op assertion to coop-verify | 15 min | 10068-10071, coop-verify |
| 2 | Pick fallback for an absent pad and skip picks for bled-out knights (C2) | 30 min | 9041-9058, 8244, 8268 |
| 3 | One `makePlayerState()` for all three player sheets; fixes C3 and closes the class | 1 h | 1881-1904, 4328-4339, 9946-9955 |
| 4 | `npm test` exits non-zero and runs the three verify scripts; NaN and `Number.isFinite(hp)` assertions in smoke (T1, T2, T7.1-2) | 30 min | playtest.mjs 651/687, package.json |
| 5 | Gate BEGIN QUEST until `init()` finishes; `try/finally` in `beginQuest` (C4, C10) | 20 min | 12727-12734, 12147-12176 |
| 6 | The five one-line co-op fixes: archer Z (C5), wave-event `partyBuff` (C6), projectile evolution by owner (C7), pause gate (C9), `coopPending` key parse (C11) | 45 min | 5325, 6113-6116, 7805-7807, 11610, 11370 |
| 7 | `PRIMARY_WEAPONS` from `CHARACTER_PRIMARY`; add `staff` to `SOURCE_NAMES`, `RARE_UPGRADES`, Codex; retire the quickblade rows and the stale tip; then the table-consistency test (C12, C23, M5, T7.3) | 1.5 h | 1702, 6449, 9062, 12094, 12282-12299, 8495 |
| 8 | Music timer handle in `AudioSystem` (C8) and the shared announce timer (C21) | 30 min | 3085-3108, 13 announce sites |
| 9 | Save hardening: `version >= 2`, profile-only `saveMeta`, shape-checked `loadBestRun`/`loadSettings`, `unlockLine +=`, v2 seed in balance; the save-fuzz check (C13-C16, T5, T7.6) | 1.5 h | 8619, 8652-8661, 9612, 3231, 9843, playtest.mjs 646 |
| 10 | `unloadMap` disposes map-owned GPU objects; ring textures and shield materials disposed with their owner (C17, C18) | 1 h | 3981-3990, 4602-4614, 4717-4719, 7637-7645 |

After these: `setSeed` on the hook and `--seed` in balance (T3), then the fixed-step accumulator in `gameLoop` (C24), which together turn the balance logs into something that can be compared run to run. The `updateEnemies` and `updateWeapons` splits (M1) are the first real step of the module split and can be done inside the single file.

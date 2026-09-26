# Fact-check of the 2026-09-26 press and UX reviews

**Method:** every line number, formula, log statistic and screenshot claim in the two prioritised lists was checked against `index.html` **as committed at `c7b88e3`** (12,938 lines, build 58, the file both reviews cite; `git show HEAD:index.html`), `tools/playtest.mjs`, `tools/reports/review-2026-09-26-balance.log`, `tools/reports/review-2026-09-26-profile.log`, `PLAN.md`, `map.json` and the `tools/shots/*.png` captures. No game or browser was run. Contrast ratios were recomputed by hand (WCAG relative luminance) against `#1a0e05` unless stated.

**Working-tree warning:** while this check ran, `index.html` acquired uncommitted edits (+132/−39, now 13,031 lines: a two-step title/"muster" rework that already deletes the `@media (max-height: 1000px)` pin). Every line number below refers to the committed file; in the live tree CSS lines are shifted by roughly +70 and JS lines by roughly +84. Re-grep before editing by number.

Verdicts: **CONFIRMED** = line, mechanism and number all hold. **PARTLY** = the finding is real but a cited number, line or cause is off. **WRONG** = the load-bearing claim does not match the code or log. **UNVERIFIABLE** = cannot be settled from code, logs and captures.

---

## 1. Press review (`press-review-2026-09-26.md`)

### 1a. "What to Fix First" (8 items + ten-minute bin)

| # | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| P1 | Delete `colorMul: 0.55` on goblin/archer (4790–4791), applied 4967–4969 | CONFIRMED | 4790 `... canElite: true, colorMul: 0.55 },` 4791 `... canElite: false, colorMul: 0.55 },` 4967–4969 `if (def.colorMul != null) { for (const mat of _materials) { mat.color.multiplyScalar(def.colorMul);`. Balance log Dad/Kingsfield 5:02 wave 8 = 33 live enemies; `rev-kingsfield-1.png` shows a handful of dark figures. | — |
| P2 | Archer unmarked; add to `ENEMY_AURA` (4812–4818) | CONFIRMED | 4811 `// Ordinary goblins, rats, wolves, bats and archers stay unmarked.` 4812–4818 keys are elite, speedGoblin, ogre, shaman, goblinBomb only. Archer is top damage source in 12 of 15 runs (checked run by run, see L2). Brennan/Bloodmarch `archer arrow 2448`. | — |
| P3 | Ogre Level ladder hidden behind BEGIN QUEST at 1280×800; "check the 18.7 compaction media query" | PARTLY | Fact holds: `title.png` and `menu-menu-after-run.png` show the "Ogre Level" heading, the six boxes under the button, and "The standard challenge…" peeking below. Cause is wrong. The 18.7 rule is 1261 `@media (max-width: 900px), (pointer: coarse) and (max-height: 820px)`, which cannot fire on a 1280-wide mouse-driven window (harness: `playtest.mjs:76–77` `--window-size=1280,800`, `defaultViewport: { width: 1280, height: 800 }`, no touch emulation). The cover is 1251–1256 `@media (max-height: 1000px) { #start-screen { padding-bottom: 88px; } #start-btn { position: fixed; left: 50%; ... bottom: 14px; z-index: 1002; ... } }`. | Fix the `max-height: 1000px` pin at 1251–1257, not the compaction rule. The UX review has this right. |
| P4 | Storm Kunai chains on every hit (7868 vs 8879); "3 × 45 × 6 direct + 36 chain hits per half-second" | PARTLY | Chain-on-every-hit CONFIRMED: 7868 `if (p.trailType === 'storm') chainLightning(enemy, Math.round(finalDmg * 0.6), 2, 'dagger', 0, p.owner);` has no `_lastHitCrit` test; 8879 text says "Critical daggers that chain". Damage 45 (7420 `stats.damage[dLvl] * 1.5`), pierce 5 (7421 `+ (dEvo ? 3 : 0)`), +15% mastery (8554 `MASTERY_BONUS_PER_RANK = 0.03`) all hold. The volley arithmetic is wrong for the *evolved* weapon: 7397 `wt.dagger = stats.cooldown[dLvl] * (dEvo ? 0.6 : 1);` → 0.3 s, and 7398 `const count = stats.count[dLvl] + (dEvo ? 2 : 0);` → 5 daggers. | Evolved L5: **5 daggers every 0.3 s**, up to 30 direct hits (1,350) plus 60 chain hits (1,620) per volley. The weapon is stronger than the review says; the fix direction stands. |
| P5 | Cap boss damage through wave 8 in `damagePlayer` (6671) or move first boss to wave 8 | CONFIRMED | 5145 `(800 + wave * 260)` = 2,100 at wave 5; 5162 `damage: (20 + wave * 2.5)` = 32.5; 3 × 32.5 = 97.5 > Parker's 85. 6671–6713 applies armour, Warding Runes and Phoenix only, no cap. 7922–7942 bosses at 5, 10, 15, 20. Log: Dad/Emberreach `boss charge 38, boss 30`, Parker/Emberreach `boss 60`, Dad/Mirefen no boss damage → boss in 2 of 3 early deaths. `rev-emberreach-1.png` shows Gnarltusk at ~15% at 4:48, wave 8; wave 5 starts at 2:32 (35+37+39+41 s), so it had lived 2:16. | — |
| P6a | Ogre King: 40,000 HP, boulder 120 → 150 after fury; winners kill him in 35–45 s | PARTLY | 5248 `(1600 + wave * 320) * (isFinal ? 5.0 : 1)` = 40,000. 5275 `boulderDamage: (30 + wave * 3.5) * dmgMul` with 5250 `dmgMul = 1.2` → 120. 6879–6885 first fury stack at `_fightTime` 60 s → `boulderDamage *= 1.25` → 150. Wave 20 starts at **16:11** (1878 `waveDuration: 35`, 8088 `+ 2` per wave capped at 60: 35+37+…+59 + 6×60 = 971 s); victories 16:40–16:54. | Kill time is **29–43 s**, not 35–45. |
| P6b | Brennan "crossed into wave 20 already hurt (79/194 and 103/185)" and "died five and ten seconds after the King arrived" to "two boulders" | WRONG | Balance log Brennan/Kingsfield: `16:07 19 193/194` then `17:08 20 79/194`, died 17:13. Brennan/Bloodmarch: `16:10 19 185/185`, `17:10 20 103/185`, died 17:20. The 79/194 and 103/185 readings are the 17:08/17:10 samples, a minute *into* the fight; on entry both were at full HP. Deaths are **62 s and 69 s** after the King arrived at 16:11, i.e. **2 s and 9 s after the first fury stack** (60 s). Damage-taken lines: Brennan/K `dragonOgre 816, boulder 145`; Brennan/B `dragonOgre 423, boulder 180`. The King's melee/charge (`(25 + wave * 3) * 1.2` = 102, 127 after fury, line 5261) out-damages the boulder several times over. | Re-scope fix 6: the killer is the 60 s fury step plus melee against a knight who has been chipped for a minute, not two boulders on entry. A boulder ceiling alone would not have saved either run. |
| P7 | `approachGoal` stuck reset defeats `giveUp` (10456–10462); seed spawn angle, poll bolt for 70 s (`playtest.mjs:518, 532–534`) | CONFIRMED | 10456–10462: `if (blocked) { c.stuck = (c.stuck || 0) + dt; ... if (c.stuck > giveUp) {...} } else if (!c.detour || c.detour.t <= 0) { c.stuck = 0; }` — one unblocked frame after a detour expires zeroes `stuck`. Lupin uses it too (10637, `giveUp` 3). Harness: 518–519 arrive loop 20 s, 532 `for (i < 12) { cs.step(5); unpause(); }`, 533 bolt check, 499 `unpause` only between steps; mount-to-check budget 0.1+0.5+0.6+0.2+1.0+60 = 62.4 s. Profile log 58–77: `FAIL horseArrives … detail: {"ridden":5,"walked":4,…}`, 9 of 13 horse checks failed. Nominal arrival: `map.json` `enemySpawnDistance: 50` × 0.8 = 40 u at 15 u/s = 2.7 s. | The specific "concave Kingsfield wall" is inferred; the log only shows 20 s in `arriving` with `giveUp` never firing, which the reset explains. |
| P8 | Start 18.5; content counts identical; `menu-levelup-late.png` three stat cards, three rerolls | CONFIRMED | Capture: Assassin's Eye 2/5, Champion's Resolve 1/5, Whetstone 1/5, REROLL (3), wave 15. Counts in 1c. | — |
| P9 | Ten-minute bin: Codex 12094/12289–12299/12292; `staff` into `PRIMARY_WEAPONS` 1702; archer z-aim 5325; placeholder 12485; horse toggle; ground skirt 4000/4030 | CONFIRMED | All lines verified (see B2, B6, B7). Settings has only 1489 `id="set-companion"` (Lupin); no horse toggle. | — |

### 1b. "Small Bugs Found While Reading"

| # | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| B1 | Archer aim in co-op mixes axes (5324–5325) | CONFIRMED | 5324 `const dx0 = aimMesh.position.x - enemy.mesh.position.x;` 5325 `const dz0 = playerMesh.position.z - enemy.mesh.position.z;` | — |
| B2 | Parker's primary slot never shows cooldown (1702, 9427–9429, 1727) | CONFIRMED | 1702 `PRIMARY_WEAPONS = new Set(['sword', 'spear', 'quickblade'])`; 1727 `weaponTimers` has no `staff`; 9429 divides `weaponTimers.staff` (undefined) → NaN; 9435 writes `style="height:${Math.round(cdPct)}%"` → `height:NaN%`, invalid CSS, fill stays 0%. | It is the `height`, not width. Cosmetic. |
| B3 | `approachGoal` reset, affects Lupin too | CONFIRMED | See P7; 10637 `approachGoal(c, goalX, goalZ, …, LUPIN.radius, 3)`. | — |
| B4 | Storm Kunai chains on every hit | CONFIRMED | See P4. | — |
| B5 | Ogre Level ladder hidden at 1280×800 | CONFIRMED | Captures. Cause: see P3. | — |
| B6 | Codex: "Quickblade — Parker" (12292), no `staff` in `weaponDetails` (12289–12299), tip 12094 stale, archer range 18 vs 11 | CONFIRMED | 12292 `quickblade: { name: 'Quickblade — Parker', …`; keys 12290–12299 are sword, spear, quickblade, dagger, holyAura, arrowVolley, orbitalBomb, wardShields, stormCall, emberTrail. 12094 `'…sword, spear or quickblade.'`. 12325 `'Range: 18 …'`; 4791 `range: 11`; fires when 7155 `dist < band + 6` with 7112 `band = enemy.attackRange || 12` → 17. "Runed Focus" is 8496. | — |
| B7 | World edge never fogged: plane ±`WORLD_SIZE` (4000, 4030), clamp 6236–6237, farthest ground ~45 u at max zoom, inside every fog near (34–60) | CONFIRMED | 4000/4030 `PlaneGeometry(WORLD_SIZE * 2, WORLD_SIZE * 2)`; clamps 6236–6237 (dash) and 6253–6254 (walk); `map.json` `worldSize: 100`. 2253 `cameraOffset (0, 10, 8)`, 2256 `cameraZoom = ZOOM_MAX` (2.0), 10155 `cameraOffset × cameraZoom × framed.zoom` (zoom 1 solo), 10171 `camera.lookAt(_partyCenter.x, 0, …)`, FOV 50. Camera at (0,20,16): pitch 51.3°, top ray 26.3° below horizontal → ground hit 40.5 u ahead of camera = 24.5 u ahead of knight, 45 u from camera (three.js linear fog uses view-space depth, ~41 u, even less). Fog near: Kingsfield 60 (3424), Darkwood 40, Emberreach 38, Mirefen 34, Bloodmarch 44. `rev-kingsfield-1.png` top edge is a flat green band. | — |
| B8 | Goblins stand on lava in `rev-emberreach-2.png` | UNVERIFIABLE | Review says so itself; enemy/barrier handling not traced. | — |

### 1c. Content-count table

| Table | Claim | Verdict | Evidence |
|---|---|---|---|
| All ten rows | Weapons 11 entries/10 live (1744–1841); evolutions 11 (8874–8886); relics 9 (8380–8388); synergies 8 (8845–8852); Forge 11 (8565–8575); stat lines 14 (8449–8491); enemies 8+3 (4790–4798); formations 7 (7971–8008); maps 5 (3421–3606); companions 2 (10485, 10647) | CONFIRMED | Keys counted at each range. `WEAPON_STATS` keys: sword, spear, staff, quickblade, dagger, holyAura, arrowVolley, orbitalBomb, wardShields, stormCall, emberTrail. `UPGRADES` 8449–8491 has 14 stat rows; the three `primaryUpgrade(...)` rows follow at 8492–8496. `RUN_MILESTONES` (8805) has 13 ids. |

### 1d. Balance-log, profile-log and other numeric claims

| # | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| L1 | 8 victories / 7 deaths; Dad 3–2, Brennan 3–2, Parker 2–3 | CONFIRMED | SUMMARY block, balance log 314–329. | — |
| L2 | Archer top damage source in 12 of 15 runs; win values 123, 478, 433, 1,159, 454, 543, 588, 343 | CONFIRMED | Not top in Dad/Kingsfield (dragonOgre 189), Brennan/Darkwood (dragonOgre 511), Parker/Emberreach (ogre 96); top in the other 12. Win values match the eight VICTORY lines. | — |
| L3 | 15-row run table (result, wave, time, level, top damage) | CONFIRMED | Every row matches the log. | — |
| L4 | Dad/Mirefen died 2:33, level 7, 126 kills; Kingsfield level 8 / 122 kills at 2:01, level 13 by 3:01; archers did 115 of 115 HP | CONFIRMED | Log 192–200 and 3–10. `damage taken by: archer arrow 115, rat 8`, max HP 115. | — |
| L5 | Bloodmarch: archer 2,448; `weights.archer: 1.4` at 3606; snag 13% vs 0–6%; 171 live at wave 8 vs cap 180; Dad 31 | CONFIRMED | 3606 is the Bloodmarch `weights` line (last map block). Log 265–288 `snagged 13%`, `5:03 8 78/140 18 502 171`; Dad/B `5:03 8 … 31`. 2024 `MAX_ENEMIES = 180`. Other runs snag 0–6%. | — |
| L6 | Darkwood 3/3, Kingsfield 1/3 (losses at 20 and 18), zero deaths before wave 18 on the two original maps | CONFIRMED | SUMMARY. | — |
| L7 | Three deaths before wave 8, all Emberreach/Mirefen; boss in two | CONFIRMED | Dad/E wave 5, Parker/E wave 6, Dad/M wave 5; see P5. | — |
| L8 | Wins end at level 46–49 in 16:40–16:54; one level-up per ~21 s | CONFIRMED | Levels 47, 49, 47, 46, 47, 47, 48, 47; ~1,000 s / 47 ≈ 21 s. | — |
| L9 | Wave-5 boss still alive at 4:48 in wave-8 captures; "nearly two minutes" | CONFIRMED | `rev-emberreach-1.png` (Gnarltusk ~15%, 4:48), `rev-mirefen-2.png` (Morghul ~45%, 4:49). Wave 5 begins 2:32. | — |
| L10 | "Wave 20 begins at about 16:08" | PARTLY | Cumulative wave durations give 16:11 (see P6a). Log samples at 16:07 show wave 19, 17:08 wave 20. | 16:11. |
| L11 | Horse regression: 9 of 13 failed, `ridden 5, walked 4`, profile log 58–77, harness lines 483–551, 489, 499, 518–519, 532–534 | CONFIRMED | Profile log 58 `PASS lupinSpawned` … 77 `detail: {"ridden":5,"walked":4,…}`. `playtest.mjs` 483 `if (mode === 'creatures')`, 489 3.5 s wait, 499 `unpause`, 519 `horseArrives`, 533 `horseBolts`. | — |
| L12 | Perf/memory: sim 0.02–0.25 ms avg, p95 ≤ 0.6, max 6.9/6.0; vfx 8.4%, rebuildGrid 6.7%, updateEnemies 5.6%, (program) ~49%; 368 draw calls, 19.26 M tris, 40 programs, 1,499 children, 75 skinned, 3,118 bones; heap 605/634/581/581; textures 109→209→145→192 | CONFIRMED | Profile log lines 3–17, 19–24, 43–52. | — |
| L13 | Codex previews: "thirteen" model parses, kicked off after open (12541–12548) | PARTLY | 12457–12474 list **14** entries (11 enemies + lupin, thunderhoof, airguitar); 12469 comment: allies are cloned, not re-parsed. 12541–12548 confirmed. | 14 entries; 11 parsed, 3 cloned. |
| L14 | 58 commits since 09-22; `2587a6d` touch fix; 47 clips in `audio/`; 127 MB / 284 files; BUILD 58 | CONFIRMED | `git log --since=2026-09-22` = 58; `2587a6d Stop the phone layout applying to desktop browsers`; 47 `.wav`; 284 files, 127 MB; 1678 `BUILD = { number: 58 }`. | — |
| L15 | Thunderhoof 45 s first, every 120 s, waits 30 s, 60 s at 2×, no Settings toggle | CONFIRMED | 10649 `spawnEvery: 120, firstSpawn: 45`, 10650 `waitSeconds: 30`, 10651 `rideSeconds: 60, speedMul: 2`; only 1489 `set-companion`. | — |
| L16 | Lupin bites `3 + 0.6 × wave` every 1.8 s (10485) | CONFIRMED | 10491–10492 `biteCooldown: 1.8`, `biteDamage: (wave) => 3 + wave * 0.6`. | — |
| L17 | PLAN 18.3 after-numbers put archers at 33–53% | CONFIRMED | `PLAN.md:193` "after 39% over 24 runs (Dad 33%, Parker 53%, Brennan 34% and 41%)". | — |
| L18 | "PLAN 22.1 measured" batch variance of ±2 wins in six | UNVERIFIABLE | `PLAN.md:225` 22.1 is the `ENGAGE_RANGE` auto-targeting item; no variance measurement found under it or elsewhere by search (`variance`, `±`, `2 wins`). | Cite the right PLAN item or drop the attribution. |

---

## 2. UX review (`ux-review-2026-09-26.md`)

### 2a. Prioritised implementation list (top 10)

| # | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| U1 | BEGIN QUEST pinned by `@media (max-height: 1000px)` (1251–1257); compaction at 1261 not the culprit; markup 1431–1459 | CONFIRMED | 1251–1256 as quoted in P3; 1261 needs `max-width: 900px` or a coarse pointer; harness viewport 1280×800 with a mouse. 1431 `<div id="ogre-level-wrapper">`, 1451–1459 `.menu-row` with six buttons. `#start-screen` (87–93) is `overflow-y: auto` with no `justify-content`, so the ladder is covered at the initial scroll position, not clipped. | On a touchscreen laptop (`pointer: coarse`) the compaction *also* fires at ≤820 px tall, but it only shrinks; the pin is still what covers. |
| U2 | Token table: one `:root` var (12); `#c9a253` 60+, `#e8c860` 40+, `#8a7040` 30+, `#5a3a1a` 40+; contrast ratios | PARTLY | 12 `:root { --title-bg: … }` is the only `:root` var (`--tint`, `--who-tint`, `--slot-tint`, `--cd` are set on elements). Counts (case-insensitive, all occurrences): `#c9a253` **68**, `#e8c860` **43**, `#8a7040` **18**, `#5a3a1a` **28**. Recomputed vs `#1a0e05`: `#c9a253` 7.9 ✓, `#e8c860` 11.6 ✓, `#8a7040` 4.0 ✓, `#e8d9b0` 13.5 ✓, `#b8a680` 7.9 ✓, `#d04040` 4.05 ✓ (white on it 4.7 ✓), `#4ec95a` 8.9 ✓, `#4a8fd6` 5.6 ✓, `#4a9eff` 6.9 ✓, `#b66cff` 5.9 ✓, `#ffb02e` 10.4 ✓, `#5fd3c7` 10.5 ✓, `#7a9a5a` 5.95 ✓, `#6d5637` 2.9 on `#0c0602` ✓ (2.7 on `#1a0e05`). Off: `#cc2222` Blood Moon **3.4:1** (stated 2.4), `#3d2a14` **1.4** (1.6), `#7ec8ff` **10.5** (9.7), `#8fe08f` **11.9** (11.0), `#ffdd00` **14.1** (13.0), `#88ddff` **12.5** (11.2). | Hex counts for `#8a7040`/`#5a3a1a` are 18 and 28. Six ratios are off by 0.2–1.3; none flips a pass/fail, Blood Moon still fails 4.5:1. |
| U3 | Numerals inside bars in Cinzel (424–462, 1170–1194); "add `--hp-warn`/`--danger` fill thresholds in the HUD update (9360 region)"; H5 "bar is green … does not change colour under 25%" | PARTLY | Lines hold: 435–437 `#health-text` MedievalSharp 12px `#cc8888`; 1184–1186 `.coop-hp-text` MedievalSharp 12px. But the thresholds already exist: 9347–9351 `background` = green gradient `hpPct > 0.5`, amber `> 0.25`, else red `#8b1a1a, #cc2222, #dd3333`; 9352–9354 pulsing red glow `≤ 0.25`. `rev-mirefen-2.png` shows the amber band at 63/145 (43%), which the review cites itself. | Drop the threshold sub-task from U3 (and H5's "does not change colour under 25%" is wrong). Keep numerals-in-bar and the Cinzel change. |
| U4 | Re-stack top-centre: boss 665–685, combo/streak 688–692 & 935–940, buffs 837–849, strip 899–953, ride-timer 941; Blood Moon +30% speed (1971); wave title 8114 | CONFIRMED | 665–667 `#boss-bar top: 60px … width: 360px`, 670 Cinzel Decorative 15px, 676 `height: 12px`; 688–690 combo `top: 10px … 14px`; 935–937 streak same; 838 `#active-buffs top: 34px`; 941 `#ride-timer { top: 64px …}` (sits on the boss slot); 946–947 banner `top: 136px; font-size: 16px`; 1971 `enemySpeedMul: 1.3`; 8114 `No Respite`. | The "Fixes" column cites a press-review finding ("banner and boss bar stacking") that does not exist in the press review. Harmless. |
| U5 | Wave track: CSS 464–477, 832–836; markup 1575–1584; JS 9370–9390; `#wave-text` Cinzel Decorative 20px | CONFIRMED | 474–476 `#wave-text` Cinzel Decorative 20px; 833–835 `#wave-timer` MedievalSharp 12px (H8 calls it 13px, trivial); 1575 `<div id="hud-right">`; 9370–9390 score/kills/time/next-wave writers. | — |
| U6 | Nameplates/rings: `PLAYER_RING_COLORS` 4326, `_COOP_HUD_TINT` 9253 | CONFIRMED | 4326 `['rgba(255,235,190,', 'rgba(150,215,255,', 'rgba(180,255,180,']`; 9253 `['#e8c860', '#7ec8ff', '#8fe08f']`. | Co-op captures not re-examined. |
| U7 | Damage numbers "un-outlined pale text in one size", crits indistinguishable (H13) | PARTLY | 5886–5905 `spawnDamageNumber` draws to a canvas with `ctx.font = 'bold 48px Arial'` and `ctx.strokeStyle = '#000'; ctx.strokeText(...)`, so they *are* black-outlined; 6524 crits are coloured `#ff4444` vs `#c9a253`. "One size" is true: a single 48px canvas font, no crit scale. | Scope U7 to size-by-crit, jitter and merge; the outline exists (thin at sprite scale) and crit colour exists. |
| U8 | Card types: CSS 518–584; JS 9140–9170; `upgrade-rank`/`upgrade-delta`; `WEAPON_EVOLUTIONS[*].requires` 8874–8886 | CONFIRMED | 518 `.upgrade-btn`, 583 `.upgrade-rank … 11px; color: #6d5637`, 584 `.upgrade-delta`; 9163 `rankTag`, 9167 `innerHTML` with rank/delta; 8874–8886 `requires:` per weapon. | — |
| U9 | End-of-run: CSS 631–662, 1364–1379; JS 9855–9880; "13-row list in 20px MedievalSharp" | CONFIRMED | 647–648 `#game-over-stats` MedievalSharp 20px; 9862–9876 twelve rows plus a conditional Ogre Level row; 1364–1379 `#dmg-breakdown`. | — |
| U10 | Weapon pips + radial cooldown (851–883, 780–787); "run `gen-icons.mjs` for the nine relics and use `.relic-pill-img`"; 2.3 "Relics use emoji … render as the OS's emoji font" | PARTLY (relic half WRONG) | Pips/radial lines hold: 874–877 level 10px, 879–882 fill `rgba(201,162,83,0.3)`, 780–786 `conic-gradient(... var(--cd, 0deg) ...)`. But `images/relics/` already holds all nine PNGs (berserker, bloodletter, greed, hooves, hunter, phoenix, runes, windwalker, wolfsbane) and the HUD already uses them: 9450 `<img class="relic-pill-img" src="images/relics/${r.id}.png" … onerror="this.outerHTML='${r.icon}'">`; the level-up relic card does the same at 9164. Emoji is only the `onerror` fallback. `rev-kingsfield-1.png` bottom-left shows image tiles. `gen-icons.mjs` is at `AssetFactory/scripts/`, not `tools/`. | Do not generate relic icons. Keep the pips and radial sweep. |

### 2b. Typography and contrast claims (section 2.2 and audit rows)

| # | Claim | Verdict | Evidence | Correction |
|---|---|---|---|---|
| T1 | Cinzel Decorative at 52 (title), 46 (LEVEL UP), 64 (VICTORY/FALLEN), 42 (PAUSED), 72 (grade), 36 (Codex/Forge/Hall); 20px wave (475); 15px boss (670) | CONFIRMED | 100–101, 510, 638–639, 595, 956–957, 301/974/991/1335, 475, 670. | — |
| T2 | MedievalSharp at 11–12px "in eleven places" (461, 724, 834, 1137, 1098, 357, 584, 951, 1028, 158, 195) | PARTLY | Ten hold (11, 11, 12, 11, 11, 12, 12, 12, 12, 12 px). 158 `.char-title … font-size: 13px; color: #7a6030` is 13px. | Ten places; `.char-title` is 13px. |
| T3 | `#6d5637` 2.9:1 and `#8a7040` 4.0:1 | CONFIRMED | 2.91 vs `#0c0602`; 4.03 vs `#1a0e05` (the two baselines the review uses). | — |
| T4 | "2/5" rank tag: 583, 11px, `#6d5637` | CONFIRMED | 583 `.upgrade-rank { float: right; font-size: 11px; color: #6d5637; …}`; visible in `menu-levelup-late.png`. | — |
| T5 | Cinzel 700 at 10–11px "in eight places" (876, 136, 1004, 1106, 1166, 30) | PARTLY | 876 Cinzel 10px ✓; 136 Cinzel 11px ✓; 30 Cinzel 11px ✓; 1166 Cinzel **9px**; 1004 `#scores-table th` is 11px but inherits **MedievalSharp** from 1001, not Cinzel; 1106 `.fm-title` is Cinzel **12px**. Only six named. | Four of six hold as stated. |
| T6 | MedievalSharp carries numbers: 436, 460, 1185, 604, 647, 1001, 1367 | CONFIRMED | All seven declare `font-family: 'MedievalSharp'`. "1S1 / 1S1" visible in `rev-kingsfield-1.png`. | — |
| T7 | Hints at 11–12px: 724, 1137, 1223, 1229, 1231 | CONFIRMED | 11, 11, 10, 10, 11 px. | — |
| T8 | Card body 14px MedievalSharp `#8a7040` (542) 4.0:1; HUD stats 13px Cinzel `#c9a253` (470–472); menu hints 11px `#6d5637` (1137); Codex stats 12px `#7a9a5a` (356–358) ~6:1 | CONFIRMED | 542, 470–472, 1137, 357 as stated; 5.95:1 for `#7a9a5a`. | — |
| T9 | H5: HP bar "is green … does not change colour under 25%" | WRONG | 9347–9354: green >50%, amber 25–50%, red ≤25% with a pulsing red glow. | The bar already goes amber then red. |
| T10 | Boss bar 360×12, no percentage, thinner than the XP bar | CONFIRMED | 667 `width: 360px`, 676 `height: 12px`; `#xp-bar-outer` 440 `height: 14px`. | — |
| T11 | Event banner 16px at 136px below boss bar at 60px; buff pill at 34px; wave announce 19px at 100px; desc 12px at 0.85 opacity | CONFIRMED | 946–947, 665, 838, 913–914, 951–952. | — |
| T12 | 2.3 "Relics use emoji" | WRONG | See U10. | — |
| T13 | H10/H11/H12/H15/H16/H17 numbers: 44px slot, 10px level, 0.3-alpha fill; 30px relic pill 14px; 40px dash ring, 11px label; P1 240×20 vs companion 14px bars; coop-kit 22px; panel `rgba(20,10,2,0.85)` (420); boss glow 10px (672); 0.85 scale (811); dash button 76px (761); minimap 110px | CONFIRMED | 856–857, 876, 881, 578, 697–698, 724, 425–426 vs 1180–1181, 1155, 420, 672, 811, 761, 808. | — |
| T14 | 2.4: six-button `.menu-row` (1451–1459); 13 feats; "Glory" in HUD (9370); archaic labels (9862–9873); Forge "who" tabs clipped (`#forge-screen` 967–972); pause 17px MedievalSharp; Settings values MedievalSharp (1344) | CONFIRMED | 1451–1459 six buttons; `RUN_MILESTONES` 13 ids; 9370 `Glory: ${state.score}`; Renown/Glory are at 9874–9875 (just past the cited range); 969 `justify-content: center` + 971 `overflow-y: auto` (the classic top-clipping combination); 604–605 17px; 1344. | — |
| T15 | Codex canvases blank on cold open; press review confirms parse-after-open | CONFIRMED | 12541–12548. | — |

---

## 3. Where the two reports disagree

1. **Cause of the hidden Ogre Level ladder.** Press: the 18.7 phone compaction query. UX: the `@media (max-height: 1000px)` pin at 1251–1257. **The UX review is right**; the compaction query cannot fire on a 1280-wide mouse-driven window.
2. **UX item 4 attributes a "banner and boss bar stacking" finding to the press review.** The press review has no such finding (it discusses damage-number stacking only). Cosmetic.
3. **HP bar colour.** UX H5 says it never changes under 25% while H5 itself cites an amber bar at 43% in `rev-mirefen-2.png`; the code has three bands. Internal to the UX review; the press review does not comment.
4. **Ogre King timeline.** The press review says wave 20 begins "about 16:08" and then that Brennan died "five and ten seconds after the King arrived" at 17:13 and 17:20. Those two statements cannot both be true; the log resolves it as 62 s and 69 s after arrival.
5. **Damage-number overlap.** Press: "two 30s touching, milder than last time". UX H13: "three 30s … stack". Same capture (`rev-kingsfield-1.png`): two adjacent "30"s by the tree and one alone lower right. Not a real conflict.

---

## 4. Safe to act on

- Press 1 (delete `colorMul`), 2 (mark the archer), 5 (early-boss damage cap or move to wave 8), 7 (`approachGoal` reset + harness seeding/polling), 8 (18.5 content).
- Press small bugs: co-op archer z-axis (5325), `staff` into `PRIMARY_WEAPONS`/`weaponTimers` (1702, 1727), Storm Kunai crit gate (7868), Codex text (12094, 12292, 12325, add `staff` to `weaponDetails`), ground skirt or inner clamp for the world edge, Codex preview placeholder, horse Settings toggle and ride-time logging.
- Press content counts and every balance-log/profile-log statistic in section 1d except L10 (16:11, not 16:08) and L18 (PLAN 22.1 citation).
- UX 1 (un-pin BEGIN QUEST by fixing 1251–1257), 4 (re-stack top-centre), 5 (wave track), 6 (nameplates/rings), 8 (card types), 9 (end-of-run layout), and the pips/radial half of 10.
- UX typography floors and the ten-minute bin (724, 1137, 542, 672, 342, 967–972, 798–805).

## 5. Do not act on until corrected

- **Press 3 / fix wording:** target the `max-height: 1000px` pin (1251–1257), not the 18.7 compaction query at 1261.
- **Press 4 arithmetic:** evolved Storm Kunai is 5 daggers every 0.3 s (7397–7398), not 3 every 0.5 s. Size the nerf and the re-run against the real numbers.
- **Press 6 premise:** Brennan entered wave 20 at full HP and died 62 s and 69 s in, right after the first fury stack; the King's melee (`dragonOgre` 816 / 423) dwarfs the boulder (145 / 180). A boulder ceiling alone does not address either death. Re-scope to the 60 s fury step and melee damage, and keep the "winners kill him in 29–43 s" ceiling.
- **UX 3 threshold sub-task:** the amber/red HP fill thresholds already exist at 9347–9354. Do only the numerals-in-bar and Cinzel work.
- **UX 10 relic half and 2.3 "relics use emoji":** all nine relic PNGs exist in `images/relics/` and the HUD (9450) and cards (9164) already use them. Do not run the icon generator for relics.
- **UX 7 premise:** damage numbers already have a black stroke and crits are already red. Keep size-by-crit, jitter and merge; drop "add an outline" as a finding.
- **UX 2 numbers:** `#8a7040` appears 18 times and `#5a3a1a` 28, not 30+/40+; Blood Moon red on ink is 3.4:1, not 2.4:1 (still a fail); five other ratios are off by up to 1.3. The token plan itself is sound.
- **Press L18:** PLAN 22.1 is the auto-targeting item; the "±2 wins in six" variance note was not found in PLAN.md.

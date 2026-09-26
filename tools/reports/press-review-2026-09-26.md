# Castle Survivor Review — Third Look

**Five maps, a dog, a horse and a co-op couch. The world got bigger; the fight inside it did not.**

---

**Developer:** Cory Cowgill (solo, family project)
**Platform:** Browser (Three.js / WebGL)
**Genre:** Survivors-like (auto-attack horde survival)
**Build reviewed:** master at `c7b88e3`, BUILD 58, 2026-09-26
**Played on:** Windows 11, RTX 4060, via the project's own harness (`tools/playtest.mjs`) plus one hand-driven Brennan run
**Sessions reviewed:** Fifteen full runs — three knights across five maps, Ogre Level 0, kiting bot (`tools/reports/review-2026-09-26-balance.log`); one profiling run to wave 14 and the `enemies` and `creatures` regressions (`review-2026-09-26-profile.log`); 37 GPU captures at 1280×800 in `tools/shots/` (`title`, `rev-*`, `rev2-darkwood-*`, `enemies-horde`, `menu-*`, `codex-allies`)
**Previous reviews:** 2026-09-21 (7/10), 2026-09-22 (7.5/10)
**Caveat up front:** the bot kites in circles. It never dodges an arrow, never sidesteps a boulder, and never spends a reroll or a banish. Every balance number below is what a stationary target takes, and I say so where it matters.

---

## Fifty-Eight Commits Later

Since the last review on 2026-09-22 this project has shipped 58 commits. Three new battlefields. Local co-op for up to three knights with per-knight gold, Forge ranks and level-up ownership. A mobile build that actually loads on a phone. A frame-pacing pass driven by a real DevTools trace. Parker rebuilt from a quickblade duellist into a ranged wizard. A companion dog named Lupin, a rideable horse named Thunderhoof, and an easter egg in which the Knight Commander plays air guitar to a Stable Audio riff. The Bloodmarch map alone is 45 new Trellis meshes and 54 building fires.

That is more than most solo projects ship in a quarter, and a fair amount of it addresses the last review directly. The memory story that I called alarming is fixed: the baseline JavaScript heap is **605 MB before the first enemy spawns**, down from 1,428 MB, and `Game3DAssets/` is 127 MB across 284 files where it was 287 MB across 53. The profiler's leak check now reads **+0 MB across two runs**. The draw-call counter that reported "1" for a 1,442-mesh scene reports 368. The touch detection that fired on every touchscreen laptop was fixed in commit `2587a6d`. The audio was listened to and signed off by the developer (PLAN 18.1b); there are now 47 clips in `audio/`. The character-select portraits, which were near-black cards on a near-black background, are lit and readable in `title.png` — you can see Dad's shield, Brennan's spear and Parker's staff at a glance.

So the question this review has to answer is not whether the developer has been busy. It is whether the survivors-like at the centre of all this got better. And the honest answer is: the presentation and infrastructure moved a long way, the maps are a genuine step, and the combat and build layer is byte-for-byte where it was two reviews ago, with one new problem it did not have before.

## The Maps Are Real

Two maps became five, and none of the three new ones is a palette swap.

**Emberreach** is the ogre homeland: lava rivers off a cone, basalt causeways, a warcamp of hide huts and bone-topped stake walls that is now built from its own meshes (PLAN 32.9 closed the long-outstanding 17.4). `rev-emberreach-1.png` is the best-composed action frame in the project — a lava river cutting the frame diagonally, huts and a spiked palisade in the foreground, enemies readable as green figures against grey basalt, the boss bar for "Gnarltusk the Defiler" across the top. The lava is `terrain.flow: 'lava'`, an unlit ribbon pushed past 1.0 so the tone mapper blooms it, and it works; the map is warm where the fire is and grey everywhere else, which is the lesson 26.6 recorded after the first pass came out one orange smear.

**Mirefen** is the first map where the ground does something. `MIRE_PLAYER = 0.62` (index.html:4299): a knight in the bog wades at 62% speed, a chaser at 50%, a dash clears it, bats fly over, black water is impassable except at two boardwalk fords. The design note in PLAN 28.1 is right that the other four maps differ only in lighting, props, textures and enemy weights; this one changes the decision you are making every second. The bot does not understand it, and it shows. Dad on Mirefen died at 2:33 at **character level 7 with 126 kills** — the same bot on Kingsfield was level 8 with 122 kills at 2:01 and level 13 by 3:01. He was wading, the XP was not coming, and an archer line took 115 of his 115 HP. That is the map working as designed against a player who does not know the rule, which is exactly what a human's first Mirefen run will look like, and there is nothing on screen that tells them why they are slow.

**Bloodmarch** is a war-torn field at smoky dusk: a burning human town in the north-west, an orc fortress in the south-east, 54 fires that are a real map feature (`updateMapFires`, budgeted so ten burn in full, the next ring smokes, beyond 80 units nothing). `rev-bloodmarch-3.png` and `-4.png` — a gutted timber-frame house burning from inside, a ruined chapel behind, embers drifting — are the most atmospheric frames the game has produced. The map is also the hardest on the evidence: Brennan's Bloodmarch run recorded the highest archer damage of any run in the project's history (**2,448**, against `weights.archer: 1.4` at index.html:3606), the highest snag rate the bot has ever logged (**13%** of intervals, versus 0–6% everywhere else), and **171 live enemies at wave 8** against a cap of 180 — Dad on the same map had 31. The ruins are dense enough to pen a kiting knight, and once penned, the horde piles up. A human can dash out of that; the bot cannot. It is still the map to watch for keep-outs.

**Darkwood** went 3 for 3 this session. **Kingsfield** went 1 for 3, with both losses late (wave 20 and wave 18). Batch-to-batch variance in this harness is at least ±2 wins in six (PLAN 22.1 measured it), so read the per-map win rates as noise. What is not noise: on the two original maps, zero deaths before wave 18 across six runs. On 2026-09-22 it was three deaths before wave 8 across the same six.

The title screen now shows all five thumbnails side by side (`title.png`), and they are genuinely distinct at thumbnail size — green fields, blue forest, red lava seams, dark bog, grey ruin.

## Presentation: Two-Thirds Done Is Still Two-Thirds Done

The last review's top recommendation was in two halves: fix the character-select renderer, and delete the `colorMul: 0.55` that renders goblins and archers at half brightness. The first half is done. The second is not. `ENEMY_TYPES.goblin` and `ENEMY_TYPES.archer` (index.html:4790–4791) still carry `colorMul: 0.55`, and it is still applied to every material on spawn (index.html:4967–4969). PLAN 21.1 says "every enemy recolour removed" and that is true of the tints, rings and discs — but the brightness multiplier on the two most common enemies in the game survived the purge.

Look at `rev-kingsfield-1.png`. Wave 8, the balance log shows roughly 30 live enemies at this moment, and I can pick out perhaps five dark figures. Three damage numbers reading "30" float over patches of grass with nothing visible under them. The knight is a 40-pixel dark figure inside a bright ring; the enemies are 20-pixel dark smudges without one. `enemies-horde.png` — the regression's close-zoom shot — proves the models are fine: green-skinned goblins with brown leather, an ogre with a club, bats, a shaman with a glowing staff. At gameplay distance you get none of that. On Mirefen's dark peat (`rev-mirefen-2.png`) the ring is the only thing that tells you where you are, and rats and bats are indistinguishable from the moss clumps. Bloodmarch at dusk has the same problem in a different colour.

The archer specifically is still unmarked. `ENEMY_AURA` (index.html:4812–4818) gives particle auras to elites, ogres, shamans and bombers; the comment says "ordinary goblins, rats, wolves, bats and archers stay unmarked." The archer is the top damage source in **12 of 15 runs**. It is the one enemy the game should be telling you to go and kill, and it is drawn at 55% brightness with no marker.

Two things got better. There is no full-screen colour wash in any of today's nineteen in-run captures; on 2026-09-22 four of six Kingsfield frames were tinted edge to edge. No Flash Intensity slider was added (`menu-settings.png` shows Master, Effects, Music, Screen Shake and the Lighting panel), so I cannot tell you whether that is a fix or luck. Damage-number stacking is milder — `rev-kingsfield-1.png` has two "30"s touching, nothing like the "32/63/822" pile from last time.

One new visual defect, and the code explains it: the top of `rev-kingsfield-1.png` is a hard, flat green band where the ground plane simply ends. The ground mesh is exactly `WORLD_SIZE * 2` wide (index.html:4000, 4030) — ±100 on Kingsfield (`map.json` `worldSize: 100`) — and the knight is clamped to the same ±100 (6236–6237), so a knight at the boundary is standing on the last row of the plane. Fog is supposed to hide that: Kingsfield's is `[60, 100]` (3424, applied at 4008–4009). But the camera at maximum zoom sits at `(0, 10, 8) × 2.0` above and behind the party (2253, 10155) and looks at the ground under it, so with a 50° vertical field of view the top edge of the frame lands only about 24 units ahead of the knight and about 45 units from the camera. Fog that starts at 60 never touches a single pixel on Kingsfield, and on the other four maps (fog near 34–44) it barely tints the top band. Nothing in the pipeline hides the world edge because nothing in the frame is ever far enough away to be fogged. A ground skirt in the base terrain colour extending 30 units past `WORLD_SIZE`, or a player clamp 25 units inside the plane, closes it; retuning fog does not, unless near drops under 40. I could not fix the knight's position in this capture (the `rev-*` shots are not from the balance batch), so I cannot say which edge this is, but the hard edge with no gradient is exactly what the numbers predict at any of them.

The red triangles at the left and right edges of the same frame are the off-screen threat indicators (`showThreatDirection`, index.html:6013, driven by `isOffScreen` at 6008). They are not new — they are in the initial import and the 2026-09-21 review credited them — but they are pulling their weight here: with the horde this dark they are the only thing in the frame that says where the archers are.

And one new UI defect that matters more than it looks: **at 1280×800 the Ogre Level ladder is hidden behind the BEGIN QUEST button.** In both `title.png` and `menu-menu-after-run.png` the "Ogre Level" heading sits directly above the button, the six difficulty boxes are covered, and the description text "The standard challenge — for those learning the blade" peeks out below. The 2026-09-21 review described a visible ladder 0–5 with padlocks. This looks like the phone-layout compaction from 18.7 ("keyed on (max-width: 900px) or a coarse pointer under 820px tall") catching an 800-pixel-tall desktop window. It hides the game's entire long-term difficulty system from anyone on a 1280×800 laptop.

## The Codex Question

The team lead who captured the evidence asked me to check a specific thing: the Codex Enemies and Allies tabs show empty icon boxes (`menu-codex-tab3.png`, `-tab4.png`) while the Weapons tab has icons.

I checked. It is not a bug, but it is a first impression. The Enemies and Allies entries are not icons; each one is a `<canvas>` (index.html:12340, 12366, 12377) fed by a live rotating 3D preview. `setupHelpEnemyPreviews` (index.html:12485–12515) awaits a model parse per entry — thirteen of them — and it is only kicked off after the Codex is already on screen (index.html:12541–12548). The lead's captures were taken on tab click; the harness's own `codex-allies.png`, taken after a 3.5-second wait (`tools/playtest.mjs:489`), shows Lupin, Thunderhoof and the air-guitar knight rendered and animating. So: the boxes are blank for the first few seconds every time the Codex is opened cold. A silhouette placeholder or a pre-parse on the title screen would close it.

While I was in there: the Weapons tab (`menu-codex-tab2.png`) still lists **"Quickblade — Parker"** with a full stat line, even though `CHARACTER_PRIMARY.parker` is `'staff'` (index.html:1701) and no knight can equip a quickblade. Parker's actual primary appears only under its level-up card name, "Runed Focus", with no knight attribution and no stats, because `weaponDetails` (index.html:12289–12299) has no `staff` entry. The rotating start-screen tip at index.html:12094 still reads "sword, spear or quickblade." The Goblin Archer entry says "Range: 18" (index.html:12325); the archer's `range` is 11 and it looses inside `range + 6` (PLAN 18.3). These are ten-minute fixes and they are the kind of thing a curious nine-year-old will find.

## Combat and Builds: Unchanged, Plus One Thing

I counted the content tables in `index.html` against the 2026-09-22 review's numbers.

| Table | 09-22 | 09-26 | Location |
|---|---|---|---|
| Weapons (`WEAPON_STATS`) | 10 live | **10 live** (11 entries; `quickblade` is dormant, `staff` replaced it) | index.html:1744–1841 |
| Evolutions (`WEAPON_EVOLUTIONS`) | 10 live | **10 live** (11 entries; Tempest Edge dormant, Starcaller new) | index.html:8874–8886 |
| Relics (`RELICS`) | 9 | **9** | index.html:8380–8388 |
| Synergies (`WEAPON_SYNERGIES`) | 8 | **8** | index.html:8845–8852 |
| Forge upgrades (`FORGE_UPGRADES`) | 11 | **11** | index.html:8565–8575 |
| Stat lines (`UPGRADES`) | 14 | **14** | index.html:8449–8491 |
| Enemy types + bosses | 8 + 3 | **8 + 3** | index.html:4790–4798 |
| Formations | 7 | **7** | index.html:7971–8008 |
| Maps | 2 | **5** | index.html:3421–3606 |
| Companions | 0 | **2** (+ easter egg) | index.html:10485, 10647 |

The build layer is exactly what it was. Parker's Arcane Staff and its Starcaller evolution are a real design change — a `shape: 'bolt'` primary at 14–18 range with pierce from level 3, against the sword's 3.5 (index.html:1771–1778) — and it gives the third knight a genuinely different job. But it is a swap, not an addition. PLAN 18.5, "thin discovery arc," has now been open across three reviews and was the second-loudest complaint in the first one.

The arithmetic from last time holds. Every winning run this session ended at character level 46–49 in 16:40–16:54: **one level-up every 21 seconds**. `menu-levelup-late.png` is what that looks like at wave 15: Assassin's Eye (2/5), Champion's Resolve (1/5), Whetstone of the Forge (1/5), and REROLL (3) sitting unused because the bot never rerolls. Three flat stat cards with a before-and-after line each. `pickUpgrades` (index.html:9070–9117) and the pool it draws from have not changed shape. A human with three rerolls in hand would fare better than the bot here, but rerolling into the same fourteen stat lines is not depth.

The level-up presentation itself remains good. `menu-levelup.png` — Warding Shields NEW / Honed Spearhead Lv 1→2 / Executioner's Might 1/5 — and `menu-levelup-relic.png` — Phoenix Feather RELIC 1 of 3 / an EPIC Apothecary's Draught / Whetstone — show rarity tags, rank counters, delta lines, and the reroll/banish/skip row with keyboard and pad hints. The game presents its choices better than it stocks them.

**Now the new problem.** A hand-driven Brennan run on Kingsfield (victory at 16:49, level 46, 6,424 kills, 770,839 total damage, `menu-gameover-brennan.png`) ended with a damage breakdown of **Throwing Daggers 91%, Spear 8%, Holy Aura 1%, Warding Shields 0%.** The lead asked whether that is real or an attribution bug.

It is real, and the code says why. Attribution is clean: projectiles credit `'dagger'` or `'arrowVolley'` by type (index.html:7861), the primary credits itself (6771), Holy Aura and Warding Shields credit themselves (7444, 7540), and the Storm Kunai chain credits `'dagger'` explicitly (7868, 7695). Nothing is being mis-filed. The daggers really did 91%. Here is the arithmetic for evolved level-5 daggers:

- Three daggers every 0.5 s (index.html:1789–1791), each 30 × 1.5 = **45 damage** (7420), **pierce 5** (2 + 3 for the evolution, 7421), range 20, plus a mastery rank 5 bonus of +15% that the end screen reported.
- **Every hit** chains to two more enemies at 60% damage (7868). The Codex says "Critical daggers that chain to 2 extra targets" (8879); the code does not check `_lastHitCrit`. That is a description-versus-behaviour bug, and it roughly doubles the weapon.
- In a crowd, one volley is up to 18 direct hits (810) and 36 chain hits (972). Even at a third of that in practice, the daggers alone clear 1,000 DPS.

Against that: a level-5 spear does 68 every 0.95 s to the nearest four foes and half to the rest (1758–1763); a level-5 Holy Aura does 30 every 0.7 s inside 6.5 units (1798–1802). The daggers reach 20 units. Everything dies before it gets within 6.5 of the knight, so the aura and the shields touch nothing. It is not that the aura is weak; it is that the range hierarchy means the longest-reaching weapon eats every kill, and the Storm Kunai is that weapon by a wide margin. DRG: Survivor's end screen exists precisely so players discover this kind of thing; the developer built the same screen (index.html:9735–9750, a nice touch) and it has now surfaced a balance problem the harness could not, because the bot's builds are random.

Against the bot, builds still diverge: Dad finished Bloodmarch with Excalibur, Meteor Shower, Bulwark of Ages and Wrath of Heaven under Hunter/Hooves/Windwalker; Brennan finished Emberreach with Dragonlance, Armageddon, Wrath of Heaven and Ember Trail L5 under Phoenix/Hunter/Berserker. Different runs, same small bag.

## Enemies and Bosses: Three Numbers

Fifteen runs: **8 victories, 7 deaths** (the summary block at the end of the balance log; Dad 3–2, Brennan 3–2, Parker 2–3).

| Run | Result | Wave | Time | Level | Top damage taken |
|---|---|---|---|---|---|
| Dad / Kingsfield | **VICTORY** | 20 | 16:54 | 47 | dragonOgre 189, archer 123 |
| Brennan / Kingsfield | died | 20 | 17:13 | 48 | archer 1,038, dragonOgre 816 |
| Parker / Kingsfield | died | 18 | 14:42 | 40 | archer 979, elite ogre 180 |
| Dad / Darkwood | **VICTORY** | 20 | 16:45 | 49 | archer 478, dragonOgre 198 |
| Brennan / Darkwood | **VICTORY** | 20 | 16:44 | 47 | dragonOgre 511, archer 343 |
| Parker / Darkwood | **VICTORY** | 20 | 16:40 | 46 | archer 433, dragonOgre 209 |
| Dad / Emberreach | died | 5 | 3:11 | 12 | archer 110, boss charge 38, boss 30 |
| Brennan / Emberreach | **VICTORY** | 20 | 16:49 | 47 | archer 1,159, dragonOgre 443 |
| Parker / Emberreach | died | 6 | 3:53 | 16 | ogre 96, boss 60, archer 44 |
| Dad / Mirefen | died | 5 | 2:33 | 7 | archer 115, rat 8 |
| Brennan / Mirefen | **VICTORY** | 20 | 16:44 | 47 | archer 454, dragonOgre 209, boulder 204 |
| Parker / Mirefen | died | 11 | 7:35 | 25 | archer 164, dragonOgre 69 |
| Dad / Bloodmarch | **VICTORY** | 20 | 16:52 | 48 | archer 543, dragonOgre 279 |
| Brennan / Bloodmarch | died | 20 | 17:20 | 48 | archer 2,448, dragonOgre 423 |
| Parker / Bloodmarch | **VICTORY** | 20 | 16:42 | 47 | archer 588, dragonOgre 342 |

**The wave-5 wall moved to the new maps.** Three runs died before wave 8, all on Emberreach and Mirefen. Dad on Emberreach: wave 5, "archer arrow 110, boss charge 38, boss 30" against 115 max HP. Parker on Emberreach: wave 6, "ogre 96, boss 60" against 85. Dad on Mirefen: wave 5, all archers, wading. The boss is still `800 + 260 × wave` HP (index.html:5145) and `20 + 2.5 × wave` contact damage (5162) — 2,100 HP and 32.5 a touch at wave 5, a three-hit kill on Parker — and there is still no cap on boss damage as a fraction of the knight's HP in `damagePlayer` (6671–6713). The 2026-09-22 recommendation to cap it or move the first boss to wave 8 was not taken. And in two of today's wave-8 captures — `rev-emberreach-1.png` (Gnarltusk at ~15%) and `rev-mirefen-1.png` (Morghul at ~45%) — **the wave-5 boss is still alive at 4:48**. `WAVE_SCRIPT` (7922–7942) spawns bosses only at 5, 10, 15 and 20, so this is the wave-5 ogre, and the bot has been fighting it for nearly two minutes with a Dad sword build while the wave-7 bat ring and wave-8 ogre wall arrive on top of it. Whether that is fun or a slog is a feel question the bot cannot answer, but a boss that lingers for three waves on a map's first outing is not the five-wave punctuation it was designed as.

**Archers are the top damage source in 12 of 15 runs.** In the eight wins: 123, 478, 433, 1,159, 454, 543, 588, 343. In the Bloodmarch loss: 2,448. The bot does not dodge, so these are ceilings, not what a human takes — but 18.3's own after-numbers put archers at 33–53% of damage against the same non-dodging bot, and nothing has changed since to bring the archer down further. Meanwhile it lost its ring (21.1) and stayed at 55% brightness. A ranged enemy you cannot see, cannot pick out of a crowd, and that fires every 3.0 s from 11 units, is going to define the mid-game whether or not a human sidesteps some of the arrows.

**The Ogre King two-shots Brennan.** Two runs died at wave 20 — Brennan on Kingsfield at 17:13 and Brennan on Bloodmarch at 17:20 — after surviving everything else. Look at when. Wave 20 begins at about 16:08; both knights crossed into it already hurt (79/194 HP and 103/185, chewed up by wave 19's ogre wall and bat ring) and died **five and ten seconds after the King arrived**. His boulder is `(30 + 3.5 × wave) × 1.2` for the final (index.html:5275, 5250) — **120 damage at wave 20**, 150 after the first fury stack (6883–6885) — against a Brennan whose maximum HP was 185–194. Two boulders. The winning builds, by contrast, killed a 40,000-HP King (`(1600 + 320 × 20) × 5`, index.html:5248) in **35–45 seconds** — every victory timestamp is 16:40–16:54. The code comment at 5243–5247 says he "is meant to be a 60–120 s fight." He is currently a 40-second fight for a build that has the Storm Kunai or an evolved bomb, and a 10-second death for one that does not. That is too binary for a finale.

One more balance note that nobody has measured: Thunderhoof arrives at 45 s and every 120 s after (index.html:10649), waits 30 s, and gives **double stride for 60 s** (10651). A knight who takes every horse is mounted for up to half the run. All fifteen balance runs had the horse enabled — there is no Settings toggle for him, only for Lupin — and the log does not record ride time. Whatever the horse does to kiting pressure is currently baked into every number above, unmeasured.

## Companions: The Test That Fails

Lupin is well-judged. She heels, she bites for `3 + 0.6 × wave` every 1.8 s (`LUPIN`, index.html:10485), she howls at bosses. The Codex line "Relief, not firepower: her bite finishes fodder, it never carries a wave" is exactly right at 15 damage per bite against a 1,000-DPS build. She has an on/off switch. She does not change balance and she does change the feel of the sofa. Good.

The horse is a bigger swing and its regression is unstable. `node tools/playtest.mjs creatures` (`tools/playtest.mjs:483–551`) ran twice today. The first run, which is the one on disk (`review-2026-09-26-profile.log:58–77`), **failed 9 of 13 horse checks** with `detail: ridden 5, walked 4` — the "ridden" speed measurement returned walking speed, which means the knight never mounted. The lead reports a rerun that passed everything but `horseBolts` and `riderDropped`; that output is not on disk.

I read the test and the horse code, and the two runs failed for different reasons.

The first run is **real horse behaviour, exposed by a random spawn angle.** `horseArrives` (line 519) waits at most 20 s for `phase === 'waiting'`. The horse spawns at a random angle (index.html:10675) at 0.8× the enemy spawn distance and gallops at 15 units/s, so nominal arrival is under 3 s. It has a `giveUp` of 6 s in `approachGoal` (index.html:10443): stuck that long and it teleports to its goal. But look at 10456–10462. When the horse is blocked, `stuck` accumulates and a 0.8 s sideways detour starts. If the detour frees it for a single frame after the detour timer expires, `stuck` resets to zero — and then it turns back toward the goal and hits the same wall. In a concave pocket of Kingsfield wall the horse oscillates forever and `giveUp` never fires. PLAN 31.1 recorded "the horse grinding on a Kingsfield wall for 20 s before this existed"; this is the same wall, and the fallback that was supposed to end it is defeated by its own reset. Every downstream check (mount, lift, follow, trample, HUD, bolt, despawn, double speed) fails as a consequence of that one. `riderDropped` "passed" only because a knight who was never lifted is trivially at ground level.

The second run's failures look like **harness timing**, not the horse. The bolt check (line 533) sits after twelve 5-second steps, and the `unpause()` helper (line 499) only clicks away a chest or level-up card *between* those steps — a card that opens mid-step freezes the simulation for up to 5 s. The budget from mount to check is about 62.3 s against a 60 s ride. Two seconds of slack and one chest is enough to leave `p.riding` still true, which fails `horseBolts` and `riderDropped` together. That is exactly the pair that failed. I cannot confirm it without the rerun's output, but the fix is cheap either way: poll for the bolt for up to 70 s instead of stepping a fixed 60, and seed the horse's spawn angle from the test.

Neither run is a flake in the sense of "run it again." Run one is a bug in `approachGoal`. Run two is a test with no margin. Both should be fixed before the horse is trusted.

## Performance: Fixed

Sim cost per step: 0.02–0.25 ms average across waves 1–14, p95 never above 0.6 ms, worst single step 6.9 ms (during wave-1 load) and 6.0 ms at wave 6. Hot JS is spread thin — `vfx.js` update 8.4%, `rebuildGrid` 6.7%, `updateEnemies` 5.6% — under 49% in `(program)`. Draw calls 368, **19.26 million triangles per frame**, 40 shader programs (PLAN 23.1's steady-state count, where it used to swing 105–137), 1,499 scene children, 75 skinned meshes, 3,118 bones.

Nineteen million triangles is high for what is on screen and worth a look on anything weaker than a 4060 — most of it is the map's 1,400 static props — but on the review hardware the tail is now where it should be: PLAN 23's before/after (p99 55.8 → 33.3 ms, sub-30-fps frames 3.14% → 0.97%) is the first frame-time data this project has captured from real play, and the cause it found — VFX point lights entering and leaving the scene re-linking every shader — is exactly the kind of thing that only a trace finds.

Memory: baseline heap 605 MB, 634 MB at wave 14, 581 MB after returning to the menu, **581 MB after a second run**. The renderer's texture count still climbs (109 baseline → 209 in-run → 145 at menu → 192 after the second run's menu), which the harness attributes to `renderer.info` being stale under garbage collection. With the heap flat that is plausible, but "plausible" is as far as I will go; the count is the only metric that still moves.

The mobile pass (Phase 20) that made this possible found the thing that matters: WebP and Draco shrink files, not VRAM, and every texture decodes to RGBA8 on upload. Halving texture resolution and decimating meshes cut texture RAM from 528 to 288 MB and made the phone build real rather than theoretical.

## Audio: Signed Off, Still Unheard by Me

The developer listened to the Stable Audio set headed on 2026-09-23 and called it good enough to ship (PLAN 18.1b). There are 47 WAVs in `audio/` now, including four dog slots, three horse slots and the air-guitar riff; the synth set is the fallback in `audio/synth/`. The harness mutes audio, so I cannot judge any of it, and the three newest slots — dog, horse, riff — are noted in PLAN 29.3, 30.2 and 33.2 as "not yet listened to by the user." The pillar that the first review called the game's weakest has gone from procedural placeholder to real assets with one human sign-off. That is the correct trajectory and I have nothing to add to it.

## Small Bugs Found While Reading

- **Archer aim in co-op is wrong on one axis.** `fireEnemyArrow` (index.html:5324–5325) takes `dx0` from the archer's own target but `dz0` from `playerMesh` — player 1. Arrows meant for a companion fly toward P1's z-coordinate. Solo is unaffected.
- **Parker's primary slot never shows its cooldown.** `PRIMARY_WEAPONS` (index.html:1702) is `sword, spear, quickblade` — no `staff` — so the HUD (9427–9429) reads `weaponTimers.staff`, which does not exist (1727), and writes a NaN width.
- **`approachGoal` stuck reset defeats `giveUp`** (index.html:10456–10462), as above. Affects Lupin as well as the horse.
- **Storm Kunai chains on every hit, not on crits** (index.html:7868 versus the description at 8879 and in the Codex).
- **Ogre Level ladder hidden behind BEGIN QUEST at 1280×800** (`title.png`, `menu-menu-after-run.png`).
- **Codex lists a weapon nobody can hold** ("Quickblade — Parker", index.html:12292) and omits the stats for the one Parker does (no `staff` in `weaponDetails`, 12289–12299); start tip 12094 is stale; archer range in the Codex is 18, in the table 11.
- **World edge is never fogged.** Ground plane and player clamp are both ±`WORLD_SIZE` (index.html:4000, 6236–6237); the farthest visible ground at max zoom is ~45 units from the camera, inside every map's fog near (34–60). Hard green band in `rev-kingsfield-1.png`.
- In `rev-emberreach-2.png` goblins stand on the lava ribbon at two points. `mapData.barriers` are collision discs; I did not verify whether enemies respect them.

---

## What Changed Since Last Review

| 09-22 item | Verdict |
|---|---|
| **1. Finish the lighting fix (portraits + `colorMul`)** | **Half.** Character select is lit and readable (`title.png`). `colorMul: 0.55` on goblin and archer is still applied (index.html:4790–4791, 4967–4969); the horde is still dark at play distance. |
| **2. Give the archer its ring back** | **Not done.** 21.1 removed every ring; archers are explicitly unmarked (4811). Top damage source in 12 of 15 runs. |
| **3. Break the wave-5 wall** | **Not done.** No damage cap in `damagePlayer`; boss still 32.5 contact at wave 5. Three deaths before wave 8, all on the new maps, two involving the boss. Zero on Kingsfield/Darkwood this batch. |
| **4. Listen to the audio** | **Done.** Signed off 2026-09-23. |
| **5. Fix touch detection** | **Done** (`2587a6d`). |
| **6. Chase the texture leak** | **Done as far as the heap goes.** +0 MB across runs; `renderer.info` texture count still climbs and is attributed to stale-on-GC. |
| **7. Compress the asset payload** | **Done.** 287 MB → 127 MB; baseline heap 1,428 → 605 MB. |
| **8. Tame flashes, stagger damage numbers** | **No slider added.** Today's captures show no full-screen wash and mild number overlap; cannot say whether that is a fix. |
| **9. Start 18.5** | **Not started.** Content tables byte-identical in count. Third review in a row. |
| **10. Fix draw-call instrumentation** | **Done** (20.2). Reports 368. |
| **11. Rebalance the new-weapon guarantee** | **Not done.** `pickUpgrades` unchanged (9076, 9099). |
| **Three new maps (unplanned)** | **Landed and distinct.** Emberreach, Mirefen (first map with a ground mechanic), Bloodmarch (fires as a map feature). |
| **Local co-op, per-knight profiles (unplanned)** | **Landed.** 48/48 in `coop-verify`; 3-player balance still unmeasured (19.5 open). |
| **Mobile and memory (unplanned)** | **Landed.** The single largest technical improvement since 09-22. |
| **Frame pacing (unplanned)** | **Landed** with real trace data. |
| **Parker → wizard (unplanned)** | **Landed.** A swap, not an addition; Codex not updated. |
| **Lupin, Thunderhoof, air guitar (unplanned)** | **Landed.** Horse pathing has a real bug; horse regression is unstable; ride time is unmeasured in every balance number. |
| **Storm Kunai dominance (new)** | **New problem.** 91% of damage in a hand run; chain fires on every hit contrary to its own text. |

---

## Pros

- **Five real maps**, three of them new since last review, each with its own light, ground, props and enemy mix — and Mirefen is the first one where the terrain is a mechanic
- **Memory and payload fixed**: 1,428 → 605 MB heap, 287 → 127 MB assets, flat across runs
- **Frame-time tail fixed** from a real trace: p99 from 17.9 to 30 fps, and the shader-relink cause is the kind of find that pays forever
- **Character select is finally lit**; the first screen now looks like the game
- **Local co-op with per-knight ownership** shipped, tested, and then fixed again from actually playing it
- **Bloodmarch's fires** and Emberreach's lava are the best-looking things in the project
- **Lupin** is exactly the right size for what she is
- **Simulation cost remains trivial**: 0.25 ms per step at 75 live enemies
- **The end-of-run damage breakdown** is doing its job — it found the dagger problem
- **Audio is real and signed off**; the touch and draw-call bugs from last review are closed

## Cons

- **The horde is still rendered at 55% brightness** and archers are still unmarked; at wave 8 on Kingsfield you can see about five of thirty enemies
- **Zero new build content across three reviews**; the level-up screen at wave 15 is three flat stat cards
- **Storm Kunai does 91% of a winning run's damage** and chains on every hit despite saying "critical"
- **The wave-5 boss still three-hits Parker**, lingers into wave 8 on the new maps, and has no damage cap
- **The Ogre King is a 40-second fight or a two-boulder death**, against a 60–120 s design intent
- **The Ogre Level ladder is hidden behind BEGIN QUEST** at 1280×800
- **The horse has a real pathing bug** and its regression fails for two different reasons
- **The Codex describes a Parker who no longer exists** and omits the one who does
- **Bloodmarch pens the bot**: 13% snag, 171 live enemies at wave 8
- **Mirefen tells you nothing about why you are slow**
- **Ride time and 3-player difficulty are baked into the numbers and unmeasured**

---

## Score: 8 / 10

**Up from 7.5 — earned by the maps, the memory work and the frame pacing, and held back from 8.5 by a combat layer that has not been touched since the first review.**

Last time I wrote that the build was "one afternoon of cleanup away from looking like a genuinely different game." A lot of afternoons happened. The character select got fixed, the memory problem that made the game unshippable got fixed, the frame hitches got traced and fixed, and three maps arrived that are not palette swaps — one of them changes how you move. That is worth a half point and I would argue for more if the horde were visible.

But of the three things I said were keeping it from 8, two are still there. The enemies are still dark. The archer still has no marker and still tops the damage chart in four runs out of five. And 18.5 — depth in the pick pool — is unstarted across three reviews, which means the game has added five battlefields and a horse to a build system that a dedicated player exhausts in ten runs. Now there is a fourth thing: the Storm Kunai is doing nine-tenths of the work in a good build, which is the sort of imbalance that flattens every other weapon decision once a player notices it, and the end screen makes sure they will.

Vampire Survivors is a small game with a bottomless pick pool. DRG: Survivor is a small game with a deep talent tree. Castle Survivor has become a large game — five maps, three knights, co-op, companions — with a pick pool that has not grown since it was reviewed as thin. The world is now ahead of the fight. The next point is in the fight.

---

## What to Fix First, in Order

1. **Delete `colorMul: 0.55` from goblin and archer (index.html:4790–4791; applied 4967–4969). 30 minutes.** `rev-kingsfield-1.png`: ~5 visible of ~30 live at wave 8. Third review asking.
2. **Mark the archer: add it to `ENEMY_AURA` (index.html:4812–4818) or restore a ground ring. 30 minutes.** Top damage source in 12 of 15 runs; 2,448 on Bloodmarch.
3. **Unhide the Ogre Level ladder at 1280×800. 30 minutes.** `title.png` and `menu-menu-after-run.png` show it under BEGIN QUEST; check the 18.7 compaction media query against an 800-pixel desktop window.
4. **Make Storm Kunai chain only on crits, as its text says (index.html:7868 vs 8879). 1 hour.** 91% of a winning run's damage; 3 × 45 × 6 direct + 36 chain hits per half-second. Re-run the hand build after.
5. **Cap boss damage at 20% of max HP through wave 8 in `damagePlayer` (index.html:6671), or move the first boss to wave 8. 1–2 hours.** 32.5 contact vs 85 HP; two of three early deaths; still alive at wave 8 in `rev-emberreach-1.png` and `rev-mirefen-1.png`.
6. **Give the Ogre King a floor and a ceiling: boulder ≤ 35% of max HP, and either more HP or a delayed fury so a full build takes 60 s+ (index.html:5248, 5275). 1 hour.** Winners kill him in 35–45 s; Brennan died 5 s and 10 s after arrival to 120-damage boulders on 185–194 HP.
7. **Fix `approachGoal` so `giveUp` cannot be reset by a detour (index.html:10456–10462); seed the creatures test's spawn angle and poll the bolt check for 70 s (`tools/playtest.mjs:518, 532–534`). 1 hour.** Run 1 failed 9 of 13 with `ridden 5 / walked 4`.
8. **Start 18.5: three relics, two relic-gated evolutions, per-knight feats. Several days.** `menu-levelup-late.png`: three stat cards at wave 15 with three rerolls unused; content counts identical to 09-22 and 09-21.

Also, in the ten-minute bin: update the Codex weapons tab and start tip for the staff (index.html:12094, 12289–12299, 12292); add `staff` to `PRIMARY_WEAPONS` (1702); fix the archer's z-aim in co-op (5325); put a placeholder in the Codex preview boxes while models parse (12485); add a horse toggle next to Lupin's and log ride seconds in the balance timeline; add a ground skirt 30 units past `WORLD_SIZE` (4000, 4030) so the world edge is never a hard line.

---

## What I Could Not Assess

- **Audio quality.** Muted harness. The developer's sign-off is the only judgement on record; the dog, horse and riff clips have none.
- **Feel.** Hitstop, knockback, dash, the mount transition, riding at double speed with weapons still firing, whether a two-minute wave-5 boss fight is tense or tedious. One human run with a video capture would answer all of it.
- **Co-op at three players.** `PARTY_SCALE` was reasoned, never measured (PLAN 19.5); Phase 27 raised 3-player difficulty by an unknown amount on top.
- **The horse's effect on balance.** No ride-time column in the balance log; no toggle to run without him.
- **Ogre Levels 1–5.** Every run was Ogre 0.
- **Whether the human-driven Storm Kunai run is typical.** One run; the bot's builds are random and no bot run ended with an evolved dagger on Brennan. Two more hand runs with the same build would settle it.
- **Mobile in practice.** No device captures in this evidence set.
- **Whether the texture-count climb is really stale-on-GC.** The heap says yes; the counter says maybe.

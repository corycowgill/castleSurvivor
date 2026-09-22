# Castle Survivor Review — Second Look

**The lights finally came on. Now you can see what still needs fixing.**

---

**Developer:** Cory Cowgill (solo, family project)
**Platform:** Browser (Three.js / WebGL)
**Genre:** Survivors-like (auto-attack horde survival)
**Played on:** Windows 11, RTX 4060, via the project's own automated harness (`tools/playtest.mjs`)
**Sessions reviewed:** Six full runs — all three knights across both maps, Ogre Level 0, kiting bot (`tools/reports/review-2026-09-22-balance.log`); one profiling run to wave 12 (`review-2026-09-22-profile.log`); GPU screen captures taken 2026-09-22 12:05–12:06
**Previous review:** 2026-09-21, scored 7/10
**Caveat up front:** these runs were driven by the project's bot, not by hands. The bot kites but never dodges arrows and never rerolls a card. Where that matters, I say so.

---

## The Thing That Changed

Every GLB model in this game was authored with `metalness: 1, roughness: 1`. In physically-based rendering that is not a stylistic choice, it is a bug: metalness 1 zeroes the diffuse term entirely, so a goblin, a barrel and a cottage roof were all physically incapable of reflecting diffuse light. They could only catch speculars. For four months this game's art was being graded through a filter that mathematically deleted most of its colour, and every lighting fix layered on top of it — the ambient raises, the fill lights, the exposure bumps, the whole of Phase 15 — was fighting a problem that had nothing to do with lighting.

The current build clamps every loaded material to `metalness <= 0.3, roughness <= 0.85` at four sites: `createPlayer`, `spawnEnemy`, `spawnBoss`, and map-object placement.

It worked. It obviously worked. Put `tools/shots/tour-kingsfield-1.png` next to anything from the previous review and the village plaza has gone from a brown smear to a readable scene: the fountain reads as carved white stone, the statue plinth has separate stone and metal, the crates have visible grain, the cobble has warm and cool stones instead of one flat tone. `action-kingsfield-2.png` shows cottages with red clay tiles, dark slate roofs, timber frames and rough stone chimneys, all distinguishable at gameplay camera distance. This is the single largest visual improvement the project has made, and it cost four lines of code.

And then it stopped halfway.

## Presentation: Half a Fix

The fix is applied to *materials*. It is not applied to everything that darkens a model, and the game darkens its models in several other places.

**The horde is still a field of black silhouettes.** `ENEMY_TYPES.goblin` and `ENEMY_TYPES.archer` (index.html:3493–3494) each carry `colorMul: 0.55`, which multiplies the base colour of every material on the model down to 55% before it ever reaches a light. The two most common enemies in the game are deliberately rendered at just over half brightness. You can see the result in `action-kingsfield-3.png`: a dozen enemies along the curtain wall read as pure black cut-outs against green grass, with no silhouette detail, no weapon read, and nothing to distinguish a goblin from a wolf from a rat. `action-kingsfield-5.png` is the tell — the goblin at the bottom of the frame, close to camera and in full key light, shows green skin and brown leather and looks great. The identical goblins forty units away are ink blots. The fix reached the buildings and stopped at the things you are actually fighting.

**The knight is dark too.** In `tour-kingsfield-1.png` the player is a small dark figure on bright cobble, and the golden hero glow ring underneath him is doing all the work of telling you where you are. That ring was added in Phase 15 as a readability crutch. It is still load-bearing.

**The character select screen was not touched at all.** `title.png` is the front door of this game, and the three portrait cards — Dad, Brennan, Parker — are near-black figures on near-black backgrounds. You can make out a blue tabard on Brennan and a shield edge on Parker, and that is about it. The cause is in the code: the preview path builds its own scenes and renderers at index.html:8928–9043 and never clamps materials, and the Codex enemy previews do the same thing at index.html:9448. These are separate render paths that bypass the fix entirely. The first screen a new player sees is the worst-looking screen in the game, and it is a ten-line fix.

**Four new character models landed** and nobody mentioned them. The goblin archer, the shaman, the standard ogre boss and the Ogre King now have their own rigged meshes (`goblinArcherAnimation.glb`, `ogreWizardWithAnimation.glb`, `ogreBoss1Animation.glb`, `ogreKingRigged.glb`) instead of tinted goblin and re-used ogre clones. That is a genuine content upgrade and it should have been in the changelog.

**Darkwood's readability pass works.** This was the previous review's loudest visual complaint and 18.4 fixed it. In `action-darkwood-4.png` and `-5.png` every enemy carries a faint blue ground disc that reads cleanly through pine canopy and shadow, the pines themselves are separable green masses rather than one black wall, and the windmill and cottage in `action-darkwood-2.png` are bright landmarks you can navigate by. Credit where it is due. The uncomfortable part is that you are now reading the *discs*, not the monsters — the enemy bodies underneath are still dark shapes, so the fix works by drawing UI on the ground rather than by lighting the models. Fix `colorMul` and the discs become a nice-to-have instead of a necessity.

**Screen flashes are overpowering the frame.** Four of the six Kingsfield action captures are washed in a single hue across the entire screen: green in `-1`, purple in `-4`, orange in `-3` and `-6`. These are full-screen colour grades that tint the ground, the props, the enemies and the HUD text together. `action-kingsfield-4.png` is an entire 1280×800 frame rendered magenta. One of these is a dramatic punctuation mark. Four out of six frames means the effect is firing constantly, and when the flash is up you cannot read enemy positions at all. There is a "hit freeze" toggle in Settings; there needs to be a screen-flash intensity slider next to it, defaulted lower.

**Damage numbers pile into soup.** In `action-kingsfield-3.png` the numbers "32", "63" and "822" overlap into an unreadable cluster, with a stray text string tangled through them. There is no collision avoidance or stagger on the damage number spawner. At 6,500 kills per run this is not a corner case.

**And 18.6 did not happen**, so the melted props are still there. The two market-stall canopies in `tour-darkwood-1.png` render as flat purple-black quads with hard edges and no surface detail — they look like untextured placeholder geometry sitting in an otherwise finished scene.

## Combat and Builds: Unchanged, and That Is the Problem

Nothing in the content layer moved since the last review. The count is exactly what it was: ten weapons (three primaries plus seven secondaries), ten evolutions (`WEAPON_EVOLUTIONS`, index.html:7298), nine relics with three slots (`RELICS`, index.html:6913), eight weapon synergies, eleven Forge upgrades, eight regular enemy types plus three bosses, two maps, six Ogre Levels. PLAN item 18.5 — "thin discovery arc", the previous review's second-biggest complaint — was never started.

The arithmetic is unkind. In the winning Dad run the player takes **47 level-ups in 16 minutes 48 seconds** — one decision screen every 21 seconds. Against that, the pool can supply at most four weapons at five ranks each (20 picks), three relics, and roughly twelve stat lines capped at five ranks. By level 30 the third card on every screen is another Whetstone of the Forge. Vampire Survivors solves this by making the pool much deeper than any one run can exhaust; DRG: Survivor solves it by making the late picks *overdrive* picks that change how a weapon behaves. Castle Survivor solves it by running out. The picks are well-presented — rarity tiers, before-and-after values, rank counters, banish and reroll — and there is nothing left to present by minute twelve.

The good news is that the build layer still produces distinguishable runs. Across the six logged runs the loadouts were genuinely different: Dad finished with an evolved sword, Holy Aura L5, evolved Arrow Volley and evolved Orbital Bomb under Bloodletter/Wolfsbane/Phoenix; Parker finished with evolved Quickblade, evolved Daggers, Orbital Bomb L5 and Ember Trail L5 under Warding Runes/Berserker/Greed. Those are different games. They are just different games drawn from the same small bag.

## Enemies and Bosses: The Wave 5 Wall

Four of six runs ended in death, and the deaths cluster hard.

| Run | Result | Wave | Time | Top damage |
|---|---|---|---|---|
| Dad / Kingsfield | **VICTORY** | 20 | 16:48 | archer 595, dragonOgre 336 |
| Brennan / Kingsfield | died | 6 | 3:25 | boss 74 + boss charge 53 = **69% of all damage taken** |
| Parker / Kingsfield | died | 6 | 3:19 | archer 96, boss slam 37, boss 31 |
| Dad / Darkwood | died | 7 | 4:14 | boss slam 44 + boss 44 |
| Brennan / Darkwood | died | 20 | 16:53 | archer 718, dragonOgre 365 |
| Parker / Darkwood | **VICTORY** | 20 | 17:00 | archer 953, dragonOgre 419 |

Three of the four losses are the wave-5 ogre boss, and the numbers say it is not close. That boss spawns with `800 + 260 × wave` HP — 2,100 at wave 5 — and deals `20 + 2.5 × wave` on contact, which is **32.5 per touch, 42 on a charge**. Brennan walks into that fight with 110 maximum HP and Parker with 100. It is a three-hit kill, three and a half minutes into a seventeen-minute run, and there is no revive unless you happened to be offered Phoenix Feather.

Meanwhile the damage going the other way: Brennan died at character level 14 with a **level 1 spear** — 22 damage per thrust against 2,100 HP is ninety-five clean hits. He had four weapons (spear L1, dagger L1, Orbital Bomb L3, Warding Shields L5), so PLAN 18.2's "guarantee a new weapon card at levels 2–6" is working, and it is working *too* well — it filled his slots with secondaries while his primary never levelled once in thirteen picks. The 18.2 guarantee and the 12.13 "owned weapons offered 2.2× as often" rule are fighting each other, and the guarantee is winning.

This is the most actionable finding in the review. A survivors-like should not have a hard gate at minute three. Either the wave-5 boss needs its contact damage capped as a fraction of the knight's maximum HP, or it needs to not be a boss — make it an elite with a chest, and move the first real boss to wave 8 where players have a build.

**The archers got worse, not better.** PLAN 18.3 cut archer damage growth from 0.65 to 0.5 per wave and reported the archer share of damage falling from 56% to 39%. In these six runs, archer arrows are still the number one damage source in **every run that lasted past wave 10** — 595, 718 and 953 — and the 953 figure is higher than anything in the previous review's logs, including the 700 from Parker's win. Some of that is the bot's refusal to dodge. But some of it is a change that went the wrong way: `ENEMY_TYPES.archer` used to carry `tint: { hex: 0x8a9a22 }` and `marker: 0xd8e04a`, the yellow ground ring that made archers pickable out of a crowd. Both are gone in the current build, replaced by `colorMul: 0.55`. **The most dangerous regular enemy in the game now has no ground ring, no colour tint, and is rendered at 55% brightness.** On Kingsfield it has no marker at all; on Darkwood it gets the same faint generic blue disc as a rat. The new dedicated archer model with its visible bow is a better idea than a green tint, but at gameplay camera distance a silhouette is not a substitute for a ring. The off-screen directional warning still fires (`isOffScreen`, index.html:4729), which is the only reason archers are survivable at all.

The rest of the roster continues to be the game's quiet strength. The shaman's coven formation at waves 11, 14 and 16 is a genuine target-priority puzzle, the bomb goblin's orange ring reads instantly, and the Ogre King's guard phases at 66% and 33% give the finale real structure. Brennan's Darkwood run reached wave 20 with a full evolved build and still lost to the King — that is exactly the shape a final boss should have.

**The bot is not snagging.** Snag rate across all six runs: 2%, 0%, 0%, 0%, 1%, 2%. Whatever is killing these knights, it is not the terrain.

## Audio: I Cannot Review This

Thirty WAV files and two music loops now sit in `audio/` — sword swings in three variations, enemy deaths in three, hit impacts, coin pickups, thunder, blasts, boss roars, arrow releases, a shaman heal cue, plus `boss-music.wav` and `menu-music.wav`. They were generated by Stability's Stable Audio 3 Small through the local pipeline described in PLAN 18.1b, and the synthesised Web Audio set has been demoted to a fallback in `audio/synth/`.

I cannot tell you whether any of it sounds good. I reviewed this build through an automated harness and screen captures; there was no audio path. Per PLAN 18.1 and the brief, **nobody has listened to these files headed either** — not me, and not the developer. So the honest position is: the previous review's "audio is the game's single weakest pillar, procedural only" is no longer factually true, the files exist and resolve at every call site, and the quality question is completely open. This is the cheapest outstanding task on the board and it needs twenty minutes with headphones, not another agent.

## Performance: Excellent Frame Times, Alarming Memory

The simulation is fast and it is not close. Average sim cost per step from the profile log: 0.03 ms at wave 1, 0.38 ms at wave 6 with 75 live enemies (94 spawned), 0.21 ms at wave 12. The worst p95 across the whole run is 1.2 ms. There is one 16.8 ms outlier at wave 4 and nothing else above 2.1 ms. Hot JS is evenly spread — `vfx.js` update at 4.5%, `updateHUD` at 4.1%, `updateGame` at 4.0%, `rebuildGrid` at 3.1% — with 63.4% of self-time in `(program)`, i.e. outside JS entirely. There is no CPU problem here at any enemy count this game will ever reach.

The memory story is the opposite.

**The baseline heap is 1,428 MB before a single enemy spawns**, rising to 1,518 MB by wave 12. The cause is not subtle: `index.html` references 53 GLB files totalling **287 MB**, fourteen of which are loaded with `keepBuffer: true`, meaning their raw ArrayBuffers are retained in the JS heap for the session. Individual character models run 33–37 MB each — `ogreKingRigged.glb` is 36.2 MB, `bombOgreWithAnimation.glb` is 33.8 MB, and `ratEnemyAnimated.glb` — a rat — is 34.3 MB. The texture census backs it up: 72 ImageBitmaps at 1024², 80 at 512², twelve at 2048² and two at **4096²**, none of it in a compressed GPU format. That is roughly 700 MB of uncompressed texture before mipmaps. The harness reports "loaded in 11.2s" reading off a local SSD.

This matters for three reasons. It means nobody outside this house will ever play the game, because 287 MB is a several-minute download. It means the mobile support added in 18.7 cannot work — iOS Safari kills a tab at a few hundred megabytes, so the virtual joystick is controlling a page that will never finish loading on a phone. And it means the game is one browser tab away from an out-of-memory crash on a 16 GB machine that is also running anything else.

**The texture leak is back.** The profile log's final verdict is unambiguous: after returning to the menu, run 1 leaves 178 textures and 85 geometries; run 2 leaves **207 textures and 98 geometries**. That is +29 textures and +13 geometries retained per run, on top of a fix that PLAN 16.1 declared closed ("Heap growth per run 25 MB → 0"). Something added since then — the new enemy and boss models are the obvious suspects, along with the per-map lighting rig — is not going through `disposeSkeletons` / `disposeEnemy`. Five or six runs in a sitting and this becomes a crash.

One more thing, and it is an instrumentation bug rather than a game bug: the profile reports **"render: 1 draw calls, 1 triangles"** for a scene containing 1,442 meshes and 1,308 groups. That number is being sampled at the wrong point in the frame. Nobody currently knows this game's real draw-call count, which makes the "performance is fine" conclusion true for CPU and unverified for GPU.

## UX and Accessibility

The menus continue to be better than they need to be. Full controller navigation across character select, Ogre Level, Forge, Hall of Fame, pause, game over, settings and the card picker. Keyboard 1/2/3 to pick, R to reroll, Y/B to banish. Private Mode so the kids only see themselves and Dad. The HUD is consolidated into one top-centre column and nothing is drawn over the knight.

Two things are new and one of them has a defect.

**The Lighting panel in Settings** is a nice piece of tooling turned into a feature: six live sliders for Exposure, Ambient, Key Light, Fill Light, Key Rotation and Key Height, seeded per-map from the `MAPS[].look` rig, persisted to settings, with a RESET LIGHTING button so you cannot brick your visuals. Given that this project has spent three phases guessing at lighting values through the harness, exposing them live is the right call. It is also, bluntly, a workaround for the problem in the Presentation section: a player should not need an Exposure slider to see the enemies.

**Touch support has a detection bug.** At index.html:8855, `const _isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0`. That test returns true on every touchscreen Windows laptop, every Surface, and every desktop with a touch monitor — all of which are keyboard-and-controller machines. Those users get a permanent virtual joystick overlay pinned to the left half of the screen, a DASH button, a PAUSE button, an 0.85-scaled HUD, a shrunken minimap, and `dash-indicator` hidden with `!important`. There is no Settings toggle to turn it off. The fix is `window.matchMedia('(pointer: coarse)').matches` plus an override switch in Settings, and it should land before this is committed. The underlying implementation is fine — pointer capture, a proper stick, cooldown feedback on the dash button — it just fires at the wrong people.

There is also still no onboarding beyond the Codex. A new player is not told that archers are the thing that kills them, that evolutions need a level-5 weapon *and* a matching stat pick, or that weapon slots cap at four. The Codex holds all of it; nothing surfaces it during a run.

---

## What Changed Since Last Review

| Item | Verdict |
|---|---|
| **18.1 Real audio (30 SFX + 2 music loops via Stable Audio 3)** | **Landed, unverified.** Files exist, call sites resolve, synth demoted to fallback. Quality is genuinely unknown — nobody has listened. Twenty minutes with headphones closes this. |
| **18.2 Brennan early game** | **Partial.** The new-weapon guarantee works (he had four weapons by level 14) but it starved his primary — spear L1 at level 14 in the Kingsfield death. He still died at wave 6, same as last review. |
| **18.3 Archer pressure** | **Failed on the evidence here.** Archers are still the #1 damage source in every long run (595 / 718 / 953), and 953 is worse than anything in the previous review's logs. The damage-growth cut was real; removing the archer's yellow marker ring and tint undid the legibility half. |
| **18.4 Darkwood readability and difficulty** | **Succeeded.** The blue enemy discs and raised ambient work — verified in `action-darkwood-2/4/5.png`. Darkwood went from 0 wins in 3 to 1 win in 3 with Brennan reaching the Ogre King. Best-executed item on the list. |
| **18.5 Discovery arc** | **Not started.** The content pool is byte-for-byte what it was. |
| **18.6 Regenerate melted props** | **Not started.** The Darkwood market stalls are still flat purple quads. |
| **18.7 Touch support** | **Landed with a defect.** Good implementation, wrong detection test, and a 287 MB payload means no phone can load the game anyway. |
| **PBR material fix (unplanned)** | **The headline change, and it is two-thirds done.** Props, buildings, terrain and landmarks are transformed. Enemies are still halved by `colorMul: 0.55`, the knight is still dark, and the character-select and Codex preview renderers bypass the fix entirely. |
| **Four new rigged models (unplanned)** | **Landed.** Archer, shaman, ogre boss and Ogre King now have their own meshes. |
| **Lighting panel (unplanned)** | **Landed.** Six live sliders, per-map seeding, reset button, persisted. |
| **Texture leak** | **Regressed.** +29 textures and +13 geometries retained per run, after PLAN 16.1 closed this. |

---

## Pros

- **The PBR fix is transformative where it applies** — the environment has gone from muddy to legible in one change
- **Darkwood is now readable** without losing its atmosphere, which is the hardest version of that problem
- **Four new dedicated enemy and boss models** replace tinted clones
- **Simulation performance is genuinely excellent**: 0.38 ms per step at 75 live enemies, 1.2 ms p95 worst case
- **Real audio assets now exist** and every call site resolves
- **Boss structure holds up** — the Ogre King beat a fully evolved Brennan build at wave 20
- **Menu, controller and settings coverage remains best-in-class for a solo project**
- **The live Lighting panel** is the right tool exposed at the right time
- **Build variety still produces distinguishable runs** across the six logged playthroughs

## Cons

- **The lighting fix stops at the enemies.** `colorMul: 0.55` renders the two most common foes as black silhouettes
- **The character select screen — the first thing anyone sees — is still dark**, because it uses a separate render path
- **The archer lost its marker ring** and remains the #1 damage source in every long run (595 / 718 / 953)
- **A wave-5 boss that kills in three touches** (32.5 contact / 42 charge vs 100–115 max HP) ended 3 of 6 runs before minute five
- **Zero new content since the last review.** The discovery arc complaint is unaddressed
- **287 MB of models and a 1.4 GB baseline heap.** Nobody outside the family can download this, and no phone can run it
- **The per-run texture leak is back**: +29 textures per run after it was declared fixed
- **Full-screen colour flashes dominate four of six captured frames** with no intensity control
- **Damage numbers overlap into unreadable clusters**
- **Touch detection fires on desktop touchscreens** with no way to turn it off
- **Melted props still present**, and the draw-call metric is broken so GPU cost is unverified

---

## Score: 7.5 / 10

**Up from 7/10 — but it moved on a change that was not on the roadmap, and it did not move further because the two loudest complaints from the last review are still open.**

The half-point is earned honestly. The PBR material bug was a genuine four-month-old defect that was silently sabotaging every piece of art in the game, and fixing it lifted the environment more than the entire Phase 15 look pass did. Darkwood readability went from the review's worst visual complaint to a solved problem. Four new rigged models arrived. Real audio files exist where there were none.

It did not move to 8 because the fix is two-thirds applied and the gaps are visible in the very first screenshot: the character select cards are still black, the horde is still silhouettes, and the game's most dangerous enemy quietly lost the ground ring that made it fightable. It did not move to 8 because 18.5 never started, so a dedicated player still exhausts the content in ten runs and takes 47 level-ups from a pool that runs dry at twenty. And it did not move to 8 because the build got measurably heavier — a 1.4 GB heap, a returned texture leak, and 287 MB of models that make the newly-added mobile support theoretical.

The foundation is not the problem. The combat is good, the bosses have structure, the performance is excellent, and the family-project identity is still the most charming thing about it. The problem is that this build is one afternoon of cleanup away from looking like a genuinely different game, and that afternoon has not happened yet.

---

## What to Fix Next, in Order

1. **Finish the lighting fix. (1–2 hours, largest visible gain in the project.)** Delete `colorMul: 0.55` from `ENEMY_TYPES.goblin` and `.archer` (index.html:3493–3494) — if goblins then read too bright, re-tint with a hue rather than a brightness multiplier. Apply the same `metalness <= 0.3 / roughness <= 0.85` clamp inside the character-preview loader (index.html:8928–9043) and the Codex enemy previews (index.html:9448). Re-shoot `title.png` and confirm you can see armour on all three cards.

2. **Give the archer its ring back. (15 minutes.)** Restore `marker: 0xd8e04a` on `ENEMY_TYPES.archer`. The new dedicated model is an improvement, but a bow silhouette at forty units is not a marker. Archers are the #1 damage source in every run past wave 10 and currently have no crowd-readable identifier on Kingsfield at all.

3. **Break the wave-5 wall. (1–2 hours.)** The wave-5 ogre deals 32.5 contact / 42 charge against 100–115 max HP and killed 3 of 6 runs before minute five. Cap boss contact damage at 20% of the player's maximum HP, or push the first boss to wave 8 and make wave 5 an elite-with-chest. Verify with `balance --chars dad,brennan,parker --maps kingsfield,darkwood`; target zero deaths before wave 8 across six runs.

4. **Listen to the audio. (20 minutes.)** Thirty generated WAVs have shipped that no human has heard. Last unknown on the pillar the previous review called weakest.

5. **Fix the touch detection. (30 minutes, blocks the 18.7 commit.)** Replace the test at index.html:8855 with `matchMedia('(pointer: coarse)').matches` and add a "Touch Controls: Auto / On / Off" toggle in Settings.

6. **Chase the texture leak back down. (2–4 hours.)** +29 textures and +13 geometries per run. Run `playtest.mjs leak` — it already logs texture uploads with creation stacks — and check whether the four new rigged models and the per-map lighting rig go through `disposeSkeletons` / `disposeEnemy`.

7. **Compress the asset payload. (1 day, unlocks everything downstream.)** 287 MB of GLB with 33–37 MB characters, two 4096² textures and twelve 2048². Run every model through `gltf-transform` with Draco geometry compression and KTX2/Basis textures at 1024² for characters, 512² for props. 10–20× reduction is routine on AI-generated meshes.

8. **Tame the screen flashes and stagger the damage numbers. (2–3 hours.)** Flash Intensity slider next to Screen Shake defaulted around 50%; cap concurrent full-screen grades at one. Give the damage-number spawner position jitter and a per-target cooldown.

9. **Start 18.5. (Several days — biggest remaining structural gap.)** Three relics, two relic-gated evolutions, per-knight feats. Count distinct offers across a twenty-run log to verify the pool no longer empties.

10. **Fix the draw-call instrumentation. (30 minutes.)** `render: 1 draw calls, 1 triangles` for a 1,442-mesh scene means `renderer.info` is read at the wrong point in the frame.

11. **Rebalance the 18.2 weapon guarantee against the 12.13 owned-weapon weighting.** Brennan reached level 14 with four weapons and a level-1 primary. Stop the secondary guarantee once the knight owns two weapons *or* the primary is below level 3.

---

## What I Could Not Assess

- **Audio quality.** No audio path through the harness. Files exist and resolve; that is all I can confirm.
- **Feel — hitstop, knockback weight, dash responsiveness, controller deadzones.** Screenshots and bot logs measure none of these. A 30-second video capture at wave 12, or one human run, would tell me more than six more bot runs.
- **The Ogre Level ladder above 0.** All six runs were Ogre 0. PLAN 16.5 already flags the ladder as un-human-tested and notes the bot wins Ogre 2 more often than Ogre 1, which is an artefact.
- **Real GPU cost.** Draw-call counter broken, no per-frame timing captured. `tour --gpu --time` would produce it.
- **The touch build in practice.** Never run under device emulation in the evidence given.
- **Whether the reroll/banish economy matters.** The kiting bot never rerolls, so Brennan's new "+1 free reroll" from 18.2 has never been exercised by any test in this project.

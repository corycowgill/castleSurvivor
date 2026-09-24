# Castle Survivor — Quality Roadmap

Goal: reach the bar set by Vampire Survivors and Deep Rock Galactic: Survivor.
Status legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` deferred (needs assets or a decision)

## Phase 1 — Fix what's broken
- [x] 1.1 DOM-cache helpers recurse infinitely (game crashes on first kill, restart dead)
- [x] 1.2 Evolution `requires` is displayed but never enforced
- [x] 1.3 Gaining two levels in one XP grant loses a pick (queue level-ups)
- [x] 1.4 Boss enrages twice (two stacked enrage systems)
- [x] 1.5 Six copy-pasted kill paths with different drop tables → single `applyDamage` / `killEnemy`
- [x] 1.6 Shockwave kills award nothing (fixed by 1.5)
- [x] 1.7 Luck / boss-reroll only apply on sword kills (fixed by 1.5)
- [x] 1.8 (found during 1.5) Bomb goblin killed by the player gave no XP; boulder friendly-fire left enemies alive at negative HP
- [x] 1.9 (found during 2.1) Character passive and Forge ranks were applied twice on the first run of a session

## Phase 2 — Close the meta loop (UX + controller)
- [x] 2.1 Main Menu button on game-over and pause; return restores character select and previews
- [x] 2.2 Full controller navigation: character select, Ogre Level, Forge, Hall of Fame, pause, game over, settings, help
- [x] 2.3 Keyboard 1/2/3 to pick level-up cards, R to reroll; arrows/WASD + Enter/Esc in every menu
- [x] 2.4 Settings screen: master/SFX/music volume, screen shake, damage numbers, hit freeze (persisted)
- [x] 2.5 Per-weapon damage breakdown on the run-end screen

## Phase 3 — Make builds exist
- [x] 3.1 Weapon slot limit (4 incl. primary); full slots stop offering new weapons; empty slots shown in HUD
- [x] 3.2 Stat upgrades capped per rank (5 for most, 4 magnet, heal unlimited); pool shrinks as picks run out
- [x] 3.3 Rarity tiers on level-up cards (Common / Rare 1.6x / Epic 2.4x / Legendary 3.5x); luck raises odds
- [x] 3.4 Banish + Skip alongside Reroll; Forge upgrade "Fate's Scorn" for banish charges; Y / B key banish, Esc skip
- [x] 3.5 Level-up cards show "before → after" and rank x/max; weapon cards show damage/cooldown next level
- [x] 3.6 Distinct characters: Sword (Dad, sweep + cleave), Spear (Brennan, piercing cone thrust), Quickblade (Parker, fast + dash strikes); each has its own evolution (Excalibur / Dragonlance / Tempest Edge)

## Phase 4 — Give the run an arc
- [x] 4.1 Fixed run length: 20 waves (~19 min), The Ogre King on wave 20, VICTORY screen; the horde dies with its king
- [x] 4.2 Data-driven spawn timeline: `waveWeights()` composition + `WAVE_SCRIPT` per-wave formations/swarms/bosses (wolf pack, bat ring, rat flood, ogre wall, archer line, bomb rush)
- [x] 4.3 XP curve → linear with ramps at 10 and 20; combo XP bonus capped at +3
- [x] 4.4 Ogre Level gating: 0–1 open, winning at N unlocks N+1 (🔒 on the selector); victory gold bonus

## Phase 5 — Make the horde read as a horde
- [x] 5.1 Spatial hash grid rebuilt per frame (`queryEnemies`); used by separation. Weapon loops left linear (n ≤ 180, cheap)
- [x] 5.2 Enemy separation (bosses shove, bats exempt)
- [x] 5.3 Melee wind-up: enemy stops, pulses red, hit lands at the end only if still in reach (0.12s rats → 0.45s ogres)
- [x] 5.4 Goblin Archer: keeps 8–14 range, strafes, fires straight arrows every 2.6s (dodgeable); formations from wave 4
- [x] 5.5 Boss patterns with telegraphs: Ogre = Charge (red lane) / Slam (ring) / Summon; Dragon Ogre = Boulder Volley / Stomp
- [x] 5.6 Elites drop chests (35%); random power-up timer 35s → 55s
- [x] 5.7 XP never despawns; coins beyond 30 units merge into one bigger coin worth the sum (hard cap 140 merges closer)
- [x] 5.8 Enemy cap 120 → 180. Measured 2026-09-20 on the RTX 4060 (`probe`): 60 / 120 / 170 live enemies → render 1.6 / 2.8 / 2.9 ms per frame, sim 0.2 / 0.6 / 1.0 ms per step. The cap is not a performance limit on this hardware; impostors are only worth doing if the cap goes past ~300 or for integrated GPUs

## Phase 6 — Audio
- [x] 6.1 Procedural SFX rebuilt as noise + tone patches (whoosh, crunch hits, horn wave-start, arpeggio level-up)
- [x] 6.2 Music low-pass: muffles below 30% HP and on pause. `audio/boss-music.mp3` slot auto-plays on boss spawn if present
- [-] 6.3 Real recorded SFX and music tracks (needs audio assets from you). Filenames expected are listed in `AudioSystem.loadAll`

## Phase 7 — Discovery
- [x] 7.1 Weapon unlocks: Arrow Volley (reach wave 5), Arcane Bomb (slay a boss); shown locked in Forge and Codex
- [x] 7.2 Weapon mastery: kills per weapon persist; ranks at 100/300/700/1500/3000 → +3% damage each; Forge shows progress
- [-] 7.3 Second map with its own spawn table (content: needs a map from the editor)
- [-] 7.4 Split the single file into modules (deferred: no test harness; do after gameplay stabilises)

## Verification
- `node --check` on the extracted module script passes after every phase.
- An undefined-identifier scan over the script passes.
- Not yet play-tested in a browser — the next step is a real run on each character, then tuning.

## Phase 8 — Balance (from first playtest: "can stand still and win")
- [x] 8.1 Knockback overhaul: push speed 30 → 12, per-weapon values cut (sword 5.4 units → 1.1), bosses immune, ogres resist 70%
- [x] 8.2 Melee i-frames 0.35s → 0.15s so being surrounded actually hurts
- [x] 8.3 Armor is percentage-based (4.5%/point, 60% floor) instead of flat subtraction
- [x] 8.4 Arc weapons hit (1 + cleave) targets at full + 3 at half, nearest first, instead of everything in range
- [x] 8.5 Lifesteal throttled to one heal per 0.3s and 1 HP/rank
- [x] 8.6 Enemy HP/damage bend upward past wave 10; spawn burst cap 8 → 10; boss HP raised (~1.5–2x)
- [x] 8.7 XP curve raised ~30% (level-ups a bit rarer)
- [x] 8.8 Second playtest (2026-09-20, kite bot on the regenerated maps, `tools/reports/balance-kite-*-look.log` + position traces): Dad wins Ogre 0 on both maps (~16:45); Brennan is the swingy knight — over 10 Kingsfield runs he died at waves 5, 5, 7, 9, 10, 11 and won 4, with archer arrows the top damage source every time; Parker won. Bots snag on obstacles only 1–3% of the time, so the early deaths are archer pressure + RNG, not map traps. Two map changes came out of the traces anyway: the curtain wall has breaches at both flanks (a continuous 90-unit wall pinned the bot twice), and knee-high clutter (buckets, pots, stools, sacks, stumps, small crates) is walk-through — obstacles 809 → 680 per map; fences and waist-high props stay solid and still break on touch. `balance` now prints `snagged %` and the death position with a 90 s trace

## Phase 9 — Content and world (from "improve the game")
- [x] 9.1 Three new weapons with evolutions: Warding Shields (orbiting shield meshes → Bulwark of Ages, swats arrows), Storm Call (sky lightning + chains → Wrath of Heaven, stuns), Trail of Embers (burning ground behind you → Inferno Wake, bursts)
- [x] 9.2 Three new synergies: Sanctuary (shields + aura), Thunderstrike (storm + daggers), Scorched Earth (embers + bomb)
- [x] 9.3 Breakables: map barrels break for coins/food; map chests are supply caches (6 coins + food). Reset each run
- [x] 9.4 Map system: `MAPS` registry, load/unload, per-map lighting/fog and enemy-mix weights; Battlefield selector on the title screen
- [x] 9.5 Darkwood: generated from a fixed seed (pines, boulders, stream, track, three camps, ogre keep); wolves ×2, bats ×1.7, rats ×0.5
- [x] 9.6 Minimap shows chests/power-ups (edge-clamped) and unbroken caches
- [x] 9.7 Rotating tips on the title screen; Feats list (milestones earned across runs, victories) in the Hall of Fame; Hall records map and victory
- [x] 9.8 Playtest Darkwood (kite bot, 2026-09-20): Dad wins at 16:43 (6,401 kills), Brennan died at wave 11; snag rate as low as Kingsfield, so the 400-pine forest leaves enough kiting room. Barrel loot and shield scale still need a human pass

## Phase 10 — Art fill (local ComfyUI)
- [x] 10.1 Audit: 5 weapon icons missing (spear, quickblade, wardShields, stormCall, emberTrail); Forge had no icon slot at all
- [x] 10.2 `AssetFactory/scripts/gen-icons.mjs`: reuses the recipe embedded in the existing icons' PNG metadata (juggernautXL_v9, 512², dpmpp_2m karras, 30 steps, CFG 7, same prompt template). `--force`, `--only id,id`, per-icon `seed`
- [x] 10.3 Generated 16 icons locally (5 weapons → `images/upgrades/`, 11 Forge → `images/forge/`); 4 regenerated for light backgrounds / wrong subject, 1 needed a second retry
- [x] 10.4 Forge items now show icons; weapon HUD slots use the icon art (emoji fallback if a file is missing); run-end damage breakdown shows weapon icons
- [~] 10.5 Map thumbnails in the Battlefield selector (`images/maps/*.webp`, cut from HUD-free overhead captures by `npm run thumbs`); rarity/evolution badges and Ogre Level crests still possible with the icon script

## Phase 11 — Automated playtesting, performance, critic
- [x] 11.1 `tools/playtest.mjs` drives the real game in headless Chrome (puppeteer-core, software WebGL) via a `?debug` hook: `smoke` (load + 30s per knight + screenshots + JS errors), `balance` (bot plays full runs, timeline per minute, damage-taken by attacker), `profile` (sim ms/step per wave, V8 hot functions, draw calls, leak checks), `diag`, `shot`. `npm test` = smoke
- [x] 11.2 Perf: enemy spawn ran a full CPU skinning pass per spawn (`alignToGround` on a SkinnedMesh) → 750ms frame spikes; foot offset now cached per (model, scale). Animation rate-limited by distance (28/45/70 units) and skipped when not rendering
- [x] 11.3 Balance from bot data: early spawn volume halved (1 per spawn at waves 1–2, packs from wave 2–3, wolf pack formation smaller), XP curve lowered to 15 + 8·level so level 2 lands ~20s in
- [x] 11.4 Runtime bug caught by the harness: `fullRange` moved out of scope (elite aura / dissolve) — fixed
- [x] 11.5 `.claude/agents/game-critic.md`: a critic agent definition that judges the build from code, screenshots and harness logs and writes `tools/reports/critic-<date>.md`
- [x] 11.6 Memory: object census across two runs is flat (no per-run growth of any three.js/DOM/audio class). Retained-on-menu enemies (grid scratch) now cleared. ~22 MB heap / ~34 renderer textures per run remain unexplained → monitor
- [x] 11.7 Balance loop — final: all three knights beat Ogre 0 with full builds (King fight ~70s); at Ogre 2 they die at waves 6/8/11. Detail in `tools/reports/perf-analysis-2026-09-20.md` §4. Earlier notes: early game fixed (one-hit fodder, half spawn volume, XP 15+8L, rats defanged); spear full-target cap; coin XP by wave; evolutions chest-only with ≥75s between elite chests; bosses 800+260w / 1600+320w / final ×5. Stand-still bot dies wave 4 to archers ✓. Next run should show evolved builds reaching the Ogre King with 2–3 evolutions
- [x] 11.8 Perf/bug analysis written: `tools/reports/perf-analysis-2026-09-20.md`
- [x] 11.9 Critic report: `tools/reports/critic-2026-09-20.md` — overall 5.7/10 (build depth 6, legibility 7, run arc 7, balance 5, feel 6, perf 7, meta 5, UX 7, code health 3). Acted on: archer damage 0.8→0.65/wave and cooldown 2.6→3.0s; off-screen "drawing the bow" edge warning; Parker +1 armor; Storm Call and Trail of Embers now unlock by feats; dash cooldown floor; boss telegraph freed on return-to-menu; harness no longer counts audio 404s as errors and no longer samples sim cost through a level-up pause. Rejected/clarified: "burn patch meshes leak" (patches have no meshes), "banish starts at 1" (intentional), "15 JS errors" (were audio 404s).
- [ ] 11.10 Critic items still open: (passive-item layer is done as the relic layer, Phase 12), character unlock progression (S — deliberately not done: the knights are the family, Private Mode already handles who is selectable), 5 recorded SFX (needs assets), monolith split (L)
- [x] 11.11 Off-screen archer warning now actually fires: the old check (`dist > 20` inside a `dist < 18` branch) could never be true; it is a camera-frustum test (`isOffScreen`). Edge arrows (hit direction and warning) were mapped from a world angle with the camera axis inverted — anything toward the camera lit the TOP arrow; both now use the screen projection. Speed goblins get a blue ground ring like the other priority targets, since their emissive tint is invisible at distance. Verified with `playtest.mjs probe`

## Phase 12 — Relics and follow-through
- [x] 12.1 Relic layer (critic's #3): nine conditional passives, three slots, offered at level-up with a teal RELIC tag — Phoenix Feather (one revive), Hunter's Mark (execute), Wolfsbane Charm (crowd scaling), Berserker's Oath (low-HP damage), Warding Runes (post-hit shield), Greed Idol (coin XP), Windwalker Boots (dash), Bloodletter (crit burst), Thundering Hooves (move-speed damage). Shown in HUD, pause, run-end and Codex
- [x] 12.2 HUD writes only when a value changes (was 3% of sim time)
- [x] 12.3 Ogre King ×5 → ×4 after a mid-strength build could not finish him in 4 minutes; harness runs default to 24 minutes
- [x] 12.4 Relic icons generated (9, two regenerated for light backgrounds) into `images/relics/`; level-up cards, HUD pills and the Codex use them with emoji fallback. Lesson: do not run ComfyUI and the headless harness at the same time on 16 GB
- [x] 12.5 Balance verification with relics: no errors; relics picked (phoenix/wolfsbane/windwalker, phoenix/greed/hunter, bloodletter/runes/windwalker). Dad died wave 12, Parker won 18:01, Brennan stalemated the Ogre King for 8 min with an unevolved spear → Ogre King ×4 → ×3 plus a fury ramp (+25% speed/damage per minute after the first, max 4)
- [x] 12.7 New enemy: Goblin Shaman (wave 7+, purple) keeps range and heals every foe within 6 units by 12% every 4s with a violet rune telegraph; "coven" formation (2 shamans + escort) on waves 11, 14, 16. A priority target, the roster's first support enemy
- [x] 12.9 Ogre King no longer kiteable: he advances at full speed inside throwing range (regular dragon ogres still linger); ×3 HP + fury ramp; a Parker run finished him in ~25s with three evolutions, a weak build gets pushed instead of stalemating
- [x] 12.10 Priority-target ground rings (critic #6): gold under elites, yellow archers, violet shamans, orange bombers; shared geometry, one material per colour, no depth test so they read through grass and crowd (verified in `tools/shots/enemies-horde.png`)
- [x] 12.14 Ogre King finale has structure: ×5 HP, full-speed advance, fury ramp, and guard phases at 66%/33% (8s immune, calls an ogre wall, then a coven + wolf pack). With every knight beating Ogre 0 on a full build, Ogre 0 is "Normal": the challenge axis is the Ogre Level
- [x] 12.13 Owned-weapon level-ups are offered 2.2x as often (VS-style): a primary no longer sits at L1 for ten levels (Brennan's recurring early deaths in bot runs)
- [x] 12.12 Harness: `clearFlash()` / `setInvulnerable()` for clean screenshots; `enemies` mode saves a close-up horde frame
- [x] 12.11 Bot presses a live boss when healthy, so boss fights are measurable
- [x] 12.8 `node tools/playtest.mjs enemies`: regression that force-spawns every enemy type, both bosses and every formation for 45s
- [x] 12.6 Code health: `spawnEnemy` is data-driven — `ENEMY_TYPES` (one row per type: model, scale, HP, speed, damage growth, XP, range, cooldown, body radius, weapon preset, elite eligibility, tint) and `WEAPON_ATTACH` presets replace seven-way ternary chains; the Codex enemy stats render from the same table. Adding an enemy is now one row plus any behaviour branch

## Phase 13 — Environment assets from the pipeline
- [x] 13.1 Scan: 65 AssetFactory props (files already in Game3DAssets, none registered), 26 ImagesGameCastle outputs (mostly already in game), 13 unnamed Trellis samples in Downloads (12 characters, 1 oak), 330 raw ComfyUI outputs (duplicates of the curated set), Meshy concrete debris and the kaiju project (out of scope)
- [x] 13.2 `tools/validate-glb.mjs`: gltf-transform structural pass + real three.js viewer render in headless Chrome with a pixel-coverage check; contact sheet `tools/shots/glb-sheet.png`, report `tools/reports/glb-validation.json`. 46/70 valid; 24 rejected as empty or splinter geometry (bushes 01/02, dead trees, pines 02/03, small oaks, sapling, basket, firewood, hay pile, logs, stump, grindstone, market stall 02, mushrooms, grass clumps, flowers 01, rock cluster 01, willow)
- [x] 13.3 `tools/add-assets.mjs` → `assets-extra.js` (46 entries: key, file, category, scale from catalog metres × 2.2 units/m props or 1.3 trees, obstacle radius, breakable). Imported by index.html (registry + breakables) and editor.html (palette, two new categories)
- [x] 13.4 `tools/decorate-kingsfield.mjs`: 255 props placed in themed clusters (blacksmith kits, market, wells, sword shrine, lantern posts, tavern furniture, farm fences/scarecrows/hay, stable, house clutter, barricades facing the ogre keeps, trees/rocks/logs/ferns/flowers). Idempotent (gen:'decor1'); original saved as `map.kingsfield.backup.json`
- [x] 13.5 Darkwood generator uses the set: camp clutter and fences, lanterns and a signpost on the track, well, shrine and barricades at the keep, oaks mixed into the pines, rocks, logs, ferns, flowers
- [x] 13.6 Breakable crates/sacks/pottery/fences/tables: splinter burst, coin ~50%
- [x] 13.7 Not auto-placed (mislabelled by Trellis, kept in the editor palette): `nature_rock_small_01` is a tiny castle, `nature_bush_03` is a mossy bench
- [x] 13.8 Verified in-game: smoke clean with 1,244 Kingsfield objects; close-ups of the blacksmith, a farm and the Darkwood track (`tools/shots/diag-*.png`). Tall fixtures use 1.6 units/m after a first pass made lantern posts tower over the knight
- [ ] 13.9 The 24 rejected meshes can be regenerated through the pipeline (`batch_runner.py`) with a different seed; re-validate before adding

## Phase 14 — Map regeneration (castle / village / farms / woods)
- [x] 14.1 `tools/maplib.mjs`: MapBuilder with asset scale/collision table (legacy + pipeline), clearance-checked placement (obstacles, roads, spawn keep-outs, custom blockers such as streams), ring/line/scatter/fence helpers, value noise, seeded RNG
- [x] 14.2 `tools/generate-kingsfield.mjs` → `map.json` (1,748 objects). Castle district behind a curtain wall with gate, courtyard shrine, statues and stores; plaza at the crossroads (well, statue, market stalls, traders' corner, lanterns); tavern, apothecary, blacksmith yard, stable and nine houses along the roads, each with yard clutter; three farms with fenced corn and pumpkin fields, scarecrows, hay, carts, horses; a stream on the west forded by the high street; south woods and corner thickets; four fortified ogre keeps
- [x] 14.3 `tools/generate-darkwood.mjs` → `map.darkwood.json` (1,680 objects), loaded by `MAPS.darkwood` with the in-code generator as fallback. Logging village on the track (tavern, cottages, lumber yard, well, market stall, fence runs), west farmstead with pumpkins and corn, two woodcutter camps, ford track to a winding stream, shrine clearing with statues, rock outcrops, ruined keep, oak groves inside pine forest, forest floor clutter
- [x] 14.4 Harness: `overhead` re-captured, new `tour` mode (`--at "x,z;x,z" --zoom`) for close-ups in one session; fixed stream tile yaw (was mirrored → zigzag); `npm run maps` regenerates both
- [ ] 14.5 Editor still reads/writes `map.json` only; to hand-edit Darkwood, load `map.darkwood.json` through the editor's import

## Phase 15 — Look pass: close the gap to Diablo / Warcraft scene dressing
Findings from the tour shots (2026-09-20): flat uniform green ground is ~70% of every frame; lighting is even with blurred shadow blobs and no ambient occlusion; small props are over-scaled (barrels taller than the knight); road kerbs run through intersections and the stream is hard-edged rectangles; pipeline props are muted next to the saturated Warcraft-style buildings; no ground decals or micro-clutter; lanterns glow but light nothing.

Local tooling available: ComfyUI 8188 with juggernautXL_v9 + SDXL base (no ControlNet, no LoRAs), ComfyUI-Trellis2 node + `~/trellis/batch_trellis.py` (image → GLB), `sharp` and gltf-transform in node_modules, `bg-remover.mjs` for alpha cut-outs, `AssetFactory/decals/` (empty). Rule: never run ComfyUI and the headless Chrome harness at the same time (memory guard kills both).

Order matters: 15.1–15.3 change every pixel of every frame; do them first and re-shoot before touching the rest.

- [x] 15.1 **Textured ground with a splat map** (replaced the 625 grass tile meshes per map)
  - [x] a. `AssetFactory/scripts/gen-textures.mjs`: juggernautXL 1024² renders made seamless in Node (half-offset + feathered centre-cross blend), Sobel normal maps; set: grass, grassDry, dirt, mud, cobble, litter, needles, moss → `images/ground/*.webp` (+`_n`)
  - [x] b. `MapBuilder` paints a 512² RGBA splat (`map.<id>.splat.png`): cobble under roads with a dirt fringe, dirt under every building/prop footprint, plaza/forecourt/fields/keeps, mud band along streams, litter/needles/moss from the woods density functions; `suppress()` gives layers priority (cobble > dirt > litter)
  - [x] c. `makeGroundMaterial()`: MeshStandardMaterial with `onBeforeCompile` 5-way splat blend of colour + normal, per-layer UV scale, low-frequency macro brightness from the base texture to hide the repeat; grass and road tiles stay in the JSON for the editor but are skipped in-game when the map has `terrain`
  - [x] d. Verified: scene children 1,700 → 1,200; render 0.8–1.0 ms/frame at 1280×800 on the RTX 4060
- [x] 15.2 **Lighting and post**
  - [x] a. Shadow map 2048 over a ±24 box, normalBias 0.06 (bias 0 — the earlier negative bias produced light leaks along the ground)
  - [~] b. `GTAOPass` is wired in and reachable through `__cs.setAO / gtao`, but it blackens whole props at this scene scale on both SwiftShader and D3D11, so it is off and hidden from Settings. Grounding comes from the contact-shadow discs under every obstacle instead (15.2d)
  - [x] c. `MAPS[].look` light rigs: Kingsfield warm key / cool ambient; Darkwood cold blue key, moon-lit ambient, exposure 1.08 (first pass was too dark to read)
  - [x] d. Pool of 6 point lights re-assigned to the nearest lantern posts / forge every 0.2 s with flicker, additive glow discs under all of them, soft contact-shadow discs under every obstacle, canopy shadow discs under oaks
  - [x] e. Grade uniforms (lift/gain/gamma/saturation/vignette) in the existing post shader, driven per map by `applyLook()`; `__cs.setLook()` for A/B
  - [x] f. Before/after captures in tools/shots (`look*`, `gpu*`, `tint*`); critic review still to run (15.8)
- [x] 15.3 **Prop scale pass**: 1.5 units/m for props (was 2.2), 1.35 for tall fixtures; barrel 3 → 1.7, boulder 4 → 3.2, cart 5 → 4, horse 5 → 3.6, shrub 4 → 2.6, chest 3 → 1.8 in `maplib.LEGACY`, `add-assets.mjs` and the editor palette. Fence spacing follows the new segment length. (No lineup mode: the tour shots at zoom 1.5 next to the knight were enough.)
- [x] 15.4 **Roads and water**: road tiles no longer render (cobble is painted, so no kerb grid at junctions and the dirt fringe blends into the meadow); streams are continuous triangle-strip ribbons (`MapBuilder.streamCurve` → `streams[]`, `buildStreamRibbon` in the game) split at fords, with a feathered alpha bank and faded ends, the scrolling water shader, a painted mud bank and reed tufts along both sides. The old stream tiles stay in the JSON for the editor and are skipped in-game
- [x] 15.5 **Decals and micro-clutter**: 12 alpha decals (`images/decals/`) cut from white-background renders with an irregular round footprint; `MapBuilder.decal/scatterDecals` places them by district (cobble patches in the plaza, hay + hoof prints at stables and farms, rubble/bones/cracks at the keeps, leaf piles/mushrooms/moss in the woods, roots under oaks, bare soil under pines); one InstancedMesh per decal kind
- [~] 15.6 **Style unification and asset regeneration**
  - [x] a. `tools/retint-glb.mjs`: every pipeline GLB's base-colour textures regraded in place (saturation +22%, warm shift, contrast) with gltf-transform + sharp; the white picket fence set is pulled to weathered oak. Originals in `AssetFactory/glb_pretint/` (ignored); re-runs start from the originals
  - [x] b. Trellis regeneration (catalog batch 8, `tools/run-art-batch.sh`): 10 meshes, 7 valid. `village_rail_fence_straight_01` came out as a closed pen (kept as "Rail Pen"), `village_rail_fence_corner_01` as a straight two-post rail segment (now the straight piece), plus rail gate, log stack 02, stump 02, firewood 02 and dead tree 03. Rejected as splinter geometry, same as their first attempts: reeds, hay pile 02, mushrooms 02 (marked `rejected` in the catalog — Trellis cannot do thin-strand subjects; reeds are a sprite instead). `FENCE_SETS.rail` is the default fence set in `maplib.fence`; stumps, log stacks and firewood dress yards, camps and the woods; dead trees ring the ogre keeps and thin out the Darkwood pines. Rail meshes are pulled to oak by the re-tint like the picket set
  - [x] c. Decals bones / cobblePatch / roots / rubble / cracks regenerated painterly; all decals and sprites re-cut with background un-blending (no pale halo)
- [x] 15.7 **Vegetation**: ~7,600 / 6,700 instanced grass tufts per map (3 sprite variants + reeds, scale 0.5–1.0) on crossed alpha-tested quads with vertex-shader sway, thinned on bare ground and under the pines; reeds doubled along stream banks; canopy shadow discs under oaks; 12 subtle additive light shafts in Darkwood clearings (`MapBuilder.shaft`, `MAPS.darkwood.look.shafts`)
- [x] 15.8 **Verification and budget**: smoke clean; profile wave 10 on the GPU (`tools/reports/profile-gpu-look.log`) shows sim cost unchanged and 500 fewer scene objects; `tour --gpu --time` reports ~0.9 ms render per frame with 7,600 tufts. Harness gained `--gpu` (ANGLE/D3D11, no SwiftShader tile drop-outs), `--time`, `--eval`, canvas-direct capture. Critic review `tools/reports/critic-look-2026-09-20.md`: scene look 3/10 → 6.5/10; its top items are applied (hero glow ring + contact shadow under the knight, Darkwood fill light up, cobble tiled finer, tufts ×2, plaza/keep decals ×2, macro banding fix, stronger oak re-tint on fences). Still open from the report: feathered stream edges, decal style (some photoreal), AO

## Phase 16 — Second critic review (`tools/reports/critic-2026-09-20b.md`, 6.6/10, up from 5.7)
- [x] 16.1 GPU texture leak found and fixed. Object census was flat, so it was GPU-side: every SkinnedMesh clone's `Skeleton` uploads a bone `DataTexture` that nobody disposed (`disposeSkeletons` in `disposeEnemy`), and the knight's model is re-parsed each run without freeing the previous parse's two 2048² textures (`createPlayer` now disposes the old model's own textures/materials/geometry/skeleton; weapon attachments are shared clones and skipped). `leak` mode now logs texture uploads with creation stacks. Heap growth per run 25 MB → 0
- [x] 16.2 Brennan early game: +10 max HP in the passive, and the first four level-ups always show at least one weapon card (`pickUpgrades`). Kingsfield bot deaths went from waves 5,5,7,9,10,11 (4 wins / 10) to 11, 15 (2 wins / 4)
- [x] 16.3 Relics gated behind run milestones (`RELICS[].unlock`: phoenix and wolfsbane free; berserker wave5, hunter kills100, hooves combo15, runes boss1, greed kills250, bloodletter elite5, windwalker wave10); Codex shows locked relics with the hint
- [x] 16.4 Quickblade evolution 1.5× → 1.7×; Darkwood fill light raised again (ambient 1.1, warmer hemi ground, lanterns 24)
- [~] 16.5 Ogre Level ladder measured for the first time and re-spaced: bots won Ogre 1 3/3 and Ogre 2 2/3 on the old table, so every level above 0 got steeper (Ogre 1 HP ×1.35 / dmg ×1.2 / spawns ×1.15; Ogre 2 ×1.9 / ×1.55 / ×1.4; Ogre 3 ×2.6 / ×1.85 / ×1.6). Kite-bot wins on the new table, Kingsfield: Ogre 0 2/6, Ogre 1 3/12, Ogre 2 6/9, Ogre 3 1/3. Ogre 2 beating Ogre 1 is consistent across samples and is a bot artefact (its 1.12× enemy speed pulls the horde into the bot's strafing range; the bot never dodges arrows and archers are 70–85% of all damage it takes at every level). The table is monotonic and stays; the ladder needs a human check, and archer share of damage is the number to watch (`damage taken by` line in every balance log)
- [x] 16.6 "Map boundary black void" (critic #6) is not real: run-parker.png is a SwiftShader partial frame from the smoke test (the knight is at spawn in wave 1). GPU captures never show it
- [-] 16.7 Recorded SFX (needs audio assets), data.js extraction (deferred with the module split)

## Phase 17 — Landmarks and HUD
- [x] 17.1 Trellis batch 7 (landmarks): 5 of 7 usable — village fountain, windmill, ivy watchtower (the "ruined tower" came out intact), graveyard gate, border keep (the "destroyed watchtower" came out as a small fortified keep). Rejected: grand totem (178 triangles, empty) and ancient oak (thin-strand canopy → splinter, same failure class as reeds/hay/mushrooms). `MapBuilder.landmark()` places them with keep-outs and skips missing meshes, so generators stay runnable while a batch is pending
- [x] 17.2 Kingsfield: fountain on the square below the gate, windmill behind the east farm, watchtower in the north-west woods, border keep past the south-east holding, fenced graveyard with gate, dead tree and markers in the south woods. Darkwood: watchtower, windmill by the farmstead, keep on the ford track, graveyard in the south-west corner
- [x] 17.3 HUD: every transient text lives in one top-centre column with a shared `.hud-strip` style (Cinzel, 14–19 px, gold on a dark pill): combo + streak at the top, buff pills, boss bar, then one announcement line (wave / boss / milestone as a single line / swarm), then the wave-event banner as a one-liner. Nothing is drawn mid-screen or over the knight any more; the combo no longer scales up to 2×; the stats panel is tighter (13 px). Verified with `tour --page --eval` lighting every strip at once (`tools/shots/hud-kingsfield-1.png`)
- [x] 17.5 VFX pass ("Thor lightning, sun-flare aura, dynamite bombs"): lightning bolts are camera-facing ribbons (glow/body/core layers on a midpoint-displacement path that re-rolls 2–3× while it strobes, with forks) instead of 1-px GL lines; Storm Call fires `vfx.thunderStrike` — a 26-unit column from a sky flash with ground arcs, rings, sparks, scorch, a blue screen flash and a thunder patch (crack + roll); Wrath of Heaven adds two ground forks. Holy Aura is a solar flare: ring of fire racing to the rim, corona rays, prominences, embers. Arcane Bomb is a dynamite blast: flash, rings, an orange fireball that rolls up (normal-blend discs so it stays orange instead of saturating to white), burning debris on ballistic arcs, crater cracks, a dark smoke column, a screen flash and a blast patch. `vfx.onScreenFlash` hook reuses the damage-flash uniform with a colour. Harness: `tour --post "js" --postStep S` fires an effect before a capture; `action` mode captures mid-fight frames at a target wave. vfxlab has THUNDER / thunder evo buttons
- [ ] 17.4 Remaining catalog batches: 5 combat/battlefield (14), 4 farm + tavern kits (12), 6 terrain features (bridge, mounds, embankment, steps are the useful four). Skip thin-strand subjects (pitchfork, arrow cluster)

## Phase 18 — Press-review remediation (`tools/reports/press-review-2026-09-21.md`, 7/10)
Target: 8/10 on the same reviewer's rubric. Each item names the pain point, the fix, the agent that owns it, how it is verified, and what "done" means. Order is by score impact per hour. Items 18.1–18.4 can run in parallel (18.1 needs the GPU and must not overlap 18.3's harness runs).

- [x] 18.1 **Audio: real SFX and music rendered offline** — `node AssetFactory/scripts/gen-sfx.mjs` renders 30 WAV files (44.1 kHz 16-bit mono, peaks at -1 dBFS) into `audio/`. 17 sound slots with 2-3 variations where it matters (swordSwing x3, swordHit x3, enemyDeath x3, playerHit x2, coinPickup x2, thunder x2, blast x2, bossRoar x2, arrowLoose x3; singles: playerDeath, foodPickup, levelUp, waveStart, upgradeSelect, shamanHeal). Two music loops: boss-music (35s menacing ostinato+drums) and menu-music (24s medieval plucked). Sound design uses layered oscillators+noise with ADSR envelopes, inharmonic metallic partials for clangs/bells, sub-bass thumps, transient clicks, algorithmic reverb (comb+allpass) and soft clipping. `play()` picks a random variation per call. New call sites: `arrowLoose` in `fireEnemyArrow`, `shamanHeal` in shaman heal branch, `bossRoar` in both `spawnBoss`/`spawnDragonOgreBoss`. Probe confirmed all slots resolve. User should listen headed to judge quality
- [x] 18.1b **Generated audio (Stable Audio 3)** — SIGNED OFF 2026-09-23: the user listened and called the set good enough to ship. No slot reverts to synth.  — the synthesised set in 18.1 is the fallback; real sound design comes from Stability's Stable Audio 3 Small SFX (0.6 B, sound-effects-only, 8-step "lcm" sampling, cfg 1, 44.1 kHz stereo, Community License) and Small Music for loops, both trained on licensed data. Setup done 2026-09-21: models + T5-Gemma encoder downloaded into `ComfyUI/models` (5.7 GB; Medium at 9.2 GB deferred — the C: drive has ~20 GB free); the installed ComfyUI (0.20.1, April) predates SA3 support, so `C:\Users\coryc\ComfyUI-audio` is a git worktree of current master sharing the Trellis venv (only Comfy front-end packages changed) and the models folder through a junction; started on port 8189 by `tools/run-comfyui-audio.sh`. Pipeline: `AssetFactory/audio/sfx-catalog.json` (17 slots, prompts in the model's own SFX-reprompt style with "Length: N seconds") → `AssetFactory/scripts/gen-sfx-sa3.mjs` (ComfyUI API, graph from the bundled SA3 template minus the Qwen reprompt) → `sfx_post.py` (PyAV decode, silence trim, fades, loop crossfade, −1 dBFS) → `audio/*.wav`; `AssetFactory/workflows/stable-audio-3-sfx.api.json` for hand use. `AudioSystem` loads `audio/` first and falls back to `audio/synth/`. Open: first test batch and a headed listen; ComfyUI-audio must never run beside the harness or Trellis (16 GB RAM)
- [x] 18.2 **Brennan: "early game punishingly RNG-dependent" (died wave 6 with a level-5 spear and no secondaries)** — Owner: balance agent. The weapon-card guarantee (16.2) covers levels ≤ 4; the run that died had a maxed primary and nothing else, so the gap is *secondary* weapons. Fix: (1) levels 2–6 guarantee at least one NEW weapon card while the knight owns fewer than 2 weapons; (2) spear L1–L3 damage +12% and the thrust cone +10° so a lone spear clears a wave-4 archer line; (3) Brennan's passive gains "+1 free reroll per run". Verify: `balance --gpu --chars brennan×8 --maps kingsfield` and `darkwood`; target ≤ 1 death before wave 8 in 8 runs and archer share of damage below 60%. Done when both maps meet the target
  - Done 2026-09-21 (`tools/reports/b18-*-before.log` / `-after.log`, kite bot, Ogre 0, 24 min). `pickUpgrades`: levels 2–6 with `ownedWeaponCount() < 2` replace a stat card with a NEW weapon card (the ≤ 4-slot cap holds because full slots already drop new weapons from the pool); the old ≤ 4 any-weapon guarantee stays behind it. Spear damage 20/28/38 → 22/31/43 (L4–L5 unchanged), `halfAngle` 0.36 → 0.447 rad (cone 41° → 51°). Passive: `rerollCharges += 1` in `apply` (runs from `clearRun` after the zeroing, before Forge rerolls), desc gains "+1 Reroll". The kite bot never rerolls, so that part is untested by the harness
  - Brennan, deaths before wave 8 / wins / archer share: Kingsfield before 0 / 5 of 8 / 48% → after 0 / 8 of 16 + 1 survived to the cap / 38% (two batches: 2/8 with deaths at 8 (wave-8 boss, 4:48), 11, 11, 20, 20; then 6/8 with deaths at 16, 18). Darkwood before 3 (waves 6, 7, 6) / 3 of 8 / 56% → after 1 (wave 6) / 5 of 8 / 44%. The baseline Kingsfield batch ran lucky against 8.8's history (4/10 wins, deaths at 5, 5, 7), which is why the second after-batch was run; the remaining Kingsfield losses are boss fights (Ogre King at 20, the wave-8/11 bosses) that the bot does not dodge, not archer lines
- [x] 18.3 **Archers "define the mid-game" (top damage in 5 of 6 runs; 1,434 at Ogre 1)** — Owner: balance agent (same run as 18.2). Fix: arrow damage growth `dmgW` 0.65 → 0.5, arrows visible for 0.15 s longer before release (windup 0.4 → 0.55 with a brighter draw flash), archer `range` 12 → 11 so they sit inside more weapons' reach, and Warding Shields' arrow swat gets a 0.4 s cooldown per shield instead of per hit so it actually blocks a volley. Verify: same balance runs; target archer share of damage taken ≤ 45% averaged over 12 runs (was 70–85%) with no drop in overall death wave for Dad
  - Done 2026-09-21. `ENEMY_TYPES.archer` `dmgW` 0.65 → 0.5 (wave 10 arrow 10.5 → 9, wave 20 17 → 14), `range` 12 → 11. The archer AI ignored `range` (its band was the constants 8 / 14 / 18), so the archer branch now derives it: back off inside `range−4`, close beyond `range+2`, loose inside `range+6` (12 reproduced the old numbers exactly; 11 gives 7 / 13 / 17). `arrowReleaseTimer` 0.4 → 0.55 with a gold emissive pulse (0xffe066 at 0.9, the melee wind-up pattern) for the whole draw, `restoreEmissive` on release. Bulwark of Ages swat: the code had no cooldown at all — every arrow within 1.2 of a shield was swatted, and a volley threaded the 2.6-unit gaps between six shields on the 4.8 orbit. Now the first swat raises the ring for 0.4 s (`_shieldGuardUntil`), during which every shield's swat reach is 2.6, so the ring is sealed for the rest of the volley; reset in `clearRun`
  - Archer share of damage taken (Dad/Parker ×8 + Brennan ×8 on Kingsfield): before 56% (Dad 67%, Parker 60%, Brennan 48%) → after 39% over 24 runs (Dad 33%, Parker 53%, Brennan 34% and 41%). Dad: before 2 of 4 wins, deaths at 6 and 11, mean end wave 14.3 → after 3 of 4, one death at 11, mean end wave 17.8. Parker: 1 of 4 (deaths 11, 20, 20) → 3 of 4 (death at 20). Archers are still the top damage source in most runs because the bot never dodges arrows; the share is now what a stationary target takes, not what defines the game. `npm test` (smoke) clean after the change
- [x] 18.4 **Darkwood "crosses from moody to unreadable away from lanterns"; all three knights died before wave 12** — Owner: look agent. Two halves: readability and difficulty. Readability: raise Darkwood `ambientIntensity` to 1.3 and `hemiGround` toward 0x40503a, add a cool rim light on enemies (emissive tint `i` +0.15 for all Darkwood spawns via `MAPS.darkwood.enemyTint`), and give every enemy a faint ground disc on Darkwood (reuse the priority-ring geometry at 0.35 opacity, dark-blue). Difficulty: wolves ×2.0 → ×1.6 and bats ×1.7 → ×1.4 in `MAPS.darkwood.weights`, and the Darkwood spawn distance 45 → 48. Verify: `tour --gpu` at the ford, farmstead and woods at zoom 2.0 with 40 enemies spawned (`--post`), reviewed by the critic-look agent; `balance` target ≥ 1 win in 6 Ogre 0 runs and no death before wave 9. Done when both pass
  - 2026-09-21 results. Look: `ambientIntensity` 1.1 → 1.3, `hemiGround` 0x35452e → 0x40503a; `MAPS.darkwood.enemyTint` 0x9fc0ff at **i 0.07**, not the planned +0.15/0.18: at 0.18 every goblin, rat and wolf renders as a flat pale-blue silhouette with no shading (`tools/shots/dw-after-rim018-darkwood-{1,2}.png`), 0.07 gives a moonlit rim that keeps the model readable. Rim is added on top of the type tint (elites and speed goblins keep their own; bosses do not pass through `spawnEnemy`). `MAPS.darkwood.enemyDisc` 0x2a4a90 at 0.35 opacity, scale 0.7 of the priority ring, for spawns that have **no** priority ring (archers/shamans/bombers/elites keep their ring alone, nothing is stacked). `markerRing` takes an opacity, material cache keyed colour:opacity. Captures with the same `--post` (40 enemies placed 8–22 units out): `dw-before-darkwood-{1..4}.png` vs `dw-after-darkwood-{1..4}.png` (ford 40,-12; farmstead -60,18; village 0,34; woods -30,-50). Read: before, wolves/bats/rats off the road are black blobs identical to their shadows and only the archer rings locate anything; after, every enemy has a blue disc that reads through grass and shadow at zoom 2.0, and the rim separates bodies from the ground in the woods and at the ford. The discs are the readability win; the rim alone would not have been enough. Density in these shots is 3–4× a real wave, so the disc field looks busier than play.
  - Difficulty: weights wolf 2.0 → 1.6, bat 1.7 → 1.4, and after iteration 1 **archer 1.3 → 1.1**; `enemySpawnDistance` 45 → 48 (`tools/generate-darkwood.mjs`, map regenerated, only that field changed). `balance --gpu --chars dad,dad,brennan,brennan,parker,parker --maps darkwood --ogre 0 --bot kite --minutes 24`: iteration 1 (`tools/reports/b18-darkwood-after-iter1.log`) 2 wins / 6, deaths: Dad wave 5 (archer arrows 67 + wave-5 boss charge), Dad wave 20 Ogre King, Brennan wave 20 Ogre King; iteration 2 (`b18-darkwood-after.log`) **5 wins / 6**, one death: Parker wave 5 (archer arrows 51 + boss charge 40). Win target met; the "no death before wave 9" target is missed by one run per batch, both the same shape: wave-5 boss charge landing while archers chip. That is the 18.2/18.3 archer and early-boss problem, not the Darkwood mix (Kingsfield logs show the same wave 5–7 deaths). `npm test` clean (note: the SwiftShader smoke load took 96–180 s today against the harness's 180 s protocol timeout, on base code too; `smoke --gpu` loads in 9 s and is also clean).
- [ ] 18.5 (agent launched and stopped before any edit on 2026-09-21 — start fresh) **"Thin discovery arc; most content visible within ten runs"** — Owner: content agent. Cheapest depth per hour, in order: (1) three more relics with conditional effects (Glass Cannon +25% dmg/−20% HP, Arcane Focus crits shorten cooldowns, Blood Pact lifesteal-on-kill/−regen), each gated behind a feat; (2) two weapon evolutions that need a *relic* rather than a stat (Storm Call + Hooves → Ride the Lightning; Ember Trail + Berserker → Pyre); (3) per-knight feats ("Win Darkwood as Parker") that unlock a fourth relic slot for that knight; (4) map-specific unlock: winning Darkwood unlocks a third Ogre King variant. Verify: Codex shows every new item locked with a hint; `balance` runs pick them; no JS errors. Done when 20 runs no longer exhaust the pool (count distinct offers across the 20-run log)
- [ ] 18.6 **"Generated art inconsistency: some props look melted at close zoom"** — Owner: art agent (needs ComfyUI; run after 18.1 and never alongside the harness). Re-generate the six props the review would have seen up close (village_fence_straight_01, village_fence_corner_01, prop_tree_stump_02, prop_logs_02, prop_wood_crate_small_01, nature_rock_cluster_02) through the pipeline with sharper prompts (`chunky low-poly, hard edges, no fine detail`) and 2 seeds each; keep the best by `validate-glb` drawn fraction *and* a manual look at the sheet; ground textures: re-tile `grass` at 3.6 (from 4.6) to hide the repeat. Done when the six are swapped and `tour` close-ups show no melt
- [x] 18.7 **"No mobile or touch support"** - done 2026-09-22/23, and it grew past the planned scope into a full mobile pass (Phase 20). Touch: a virtual stick drawn wherever the thumb lands (the whole screen is the zone; it was first pinned bottom-left and read as broken) plus dash and pause buttons above it in z-order. Start/move/end are shared handlers bound to **Touch Events when `ontouchstart` exists, Pointer Events otherwise** - never both: the original Pointer-Event build worked under Chrome emulation and was dead on a real iPhone, because `setPointerCapture` alongside `preventDefault` drops the capture in WebKit and `pointermove` stops firing. `changedTouches` matches on the stored identifier rather than truthiness, since the first touch on a fresh page is usually id 0. Title screen compacted so BEGIN QUEST cannot fall below the fold, keyed on `(max-width: 900px)` or a coarse pointer under 820px tall so desktop is unaffected
  - Verified with dispatched touch events at iPhone resolution: drags from all four corners and centre return dx 1 and move the knight; a two-thumb stick+dash hold dashes. **The planned harness `--mobile` flag was never added** - `tools/playtest.mjs` has no touch mode, so mobile checks are still ad-hoc. That is the open piece of 18.7
- [ ] 18.8 **Re-review**: after 18.1–18.5 land, re-run the press-review agent on a fresh session (same evidence set) and record the delta. Target 8/10; if it stays at 7, the review's own cons list decides the next phase

## Phase 19 - Local co-op (`COOP-PLAN.md` Phases A + B, 2026-09-22)
1-3 knights on one screen. The plan doc is the design record; this is what shipped.
- [x] 19.1 `players[]` refactor - every single-player singleton is an array entry `{ state, mesh, mixer, anims, weapons, ring, inputSource, character }`; `nearestPlayer(x, z)` for enemy targeting; spawn fan-out; per-player rings. Shipped as a behavioural no-op at `players.length === 1`
- [x] 19.2 Local co-op - per-device input isolation (WASD / arrows / pad), join slots on the title screen (A to join, Y to change knight, B to leave), centroid camera with zoom from party spread and a soft `PARTY_LEASH` tether at 26, modal per-knight level-up picks (one owner, every other device locked out), per-knight upgrade books / damage ownership / loadout HUD, and a swap-based character select where any knight can go to any slot, downed + bleed-out + proximity revive, HUD row per companion, shared XP pool
- [x] 19.3 Party difficulty scaling - `PARTY_SCALE = { spawn: 0.8, hp: 0.25, bossHp: 0.7, cap: 0.6 }`, every multiplier exactly 1.0 at one player so solo is untouched
- [x] 19.4 `tools/coop-verify.mjs` drives a three-knight party and prints PASS/FAIL per check; 19/19. Review pass fixed two things tests could not catch: the shared XP bar now reads "Party Level N - x / y XP (shared)", and a downed knight keeps its ring as a marker that brightens as a rescuer revives it
- [ ] 19.5 **3-player balance pass - the one part of local co-op still owed.** `PARTY_SCALE` was reasoned out, never measured, and `tools/playtest.mjs` has no `--players N`, so it cannot be measured. COOP-PLAN Phase B item 7 called this out. Done when a 3-player run reaches wave 20 without being either trivial or impossible. **More urgent after Phase 27**: companions used to be immune to boulders, bomb blasts, boss charges and boss slams, and enemies froze when P1 went down, so 3-player difficulty has risen by an unmeasured amount on top of a multiplier that was already a guess
- [-] 19.6 Online co-op (COOP-PLAN Phases C + D) - deferred by design. Needs a fixed timestep and a seeded PRNG across 85 `Math.random()` sites before any netcode; re-decide with real 3-player experience in hand

## Phase 20 - Mobile and iOS memory (2026-09-22/23)
iOS Safari kills a tab past a few hundred MB and offers no devtools, so the instrumentation had to live in the page.
- [x] 20.1 On-device asset audit - triple-tap the top-left corner or load `?audit` for an overlay measuring unique textures by resolution, texture RAM including mipmaps, triangles, geometries, materials, draw calls, shadow casters and JS heap against a mobile budget, with Copy so a reading comes off a phone
- [x] 20.2 Draw-call counter fixed - the 2026-09-21 review flagged "1 draw call" for a 1,442-mesh scene. `renderer.info.render` resets each pass and the composer's final pass is a fullscreen quad, so anything read after it saw only that quad. `autoReset` off with a manual per-frame reset: the same scene now reports 149
- [x] 20.3 Low-quality mode - phones default to it, persisted, Settings toggle, `?lowq=1|0` to force for A/B on device. Pixel ratio capped 2 -> 1.5 (a quarter of the pixels on a DPR 3 phone, which also shrinks every post-processing target), shadows off (one shadow map was fed by 1,221 casters), bloom and GTAO off, VFX LOW, props thinned **before** the asset list is derived so dropped keys are never fetched. Draw calls 150 -> 39, shadow casters 1,222 -> 4. Also drops the three character-preview WebGL contexts
- [x] 20.4 GPU memory cut - the key finding: **WebP and Draco shrink files on disk, not in GPU memory.** Every texture decodes to RGBA8 on upload, so a 1024 map costs 5.3 MB of VRAM whether the file is 80 KB or 8 MB; the startup set held 18x 2048 + 89x 1024 = 859 MB. Textures halved (characters 2048 -> 1024, props 1024 -> 512) and meshes decimated with meshoptimizer via `--simplify` on `compress-models.mjs` (characters 0.55, static props 0.3). Texture RAM 528 -> 288 MB, JS heap 753 -> 525 MB

## Phase 21 - Readability and presentation (2026-09-22)
- [x] 21.1 **Every enemy recolour removed.** Tinting models to mark threats washed them out - a goblin read as a lamp, a wounded one as a scarlet creature. Gone: per-type emissive tints, the Darkwood rim tint and blue ground discs from 18.4, the speed-goblin tint, the damage flash, the boss enrage/guard repaints, the dragon ogre's permanent glow, every priority-target ground ring and `markerRing()` itself. Danger is now VFX only - `vfx.eliteAura` sparks with a per-type hue, `vfx.enemyHit` sparks at the point of impact, `vfx.enemyEnraged` hotter at phase 2 - so models keep their own materials
- [x] 21.2 Parker becomes a wizard - `parkerWizardAnimated.glb`, and the quickblade gives way to Arcane Staff: a `shape: 'bolt'` primary at 14-18 range against the sword's 3.5, high single-target damage, pierce from L3, no cleave. Arcane Focus replaces Swift Guardian (+25% crit, +0.5 speed, -15 max HP, no armour). A real glass cannon, which also gives a third player a distinct job in co-op. New title art
- [x] 21.3 Silent-audio fix - `loadAll()` runs at page load, so Chrome built the AudioContext suspended, and `beginQuest` called `AudioSystem.init()` which returned early on `if (initialized)` without ever resuming. `init()` now resumes when already initialised, `playMusic` resumes *before* its buffer check (a still-loading slot used to skip the resume and mute everything), and pointerdown/keydown/touchstart resume as a fallback

## Phase 22 - Combat tuning (2026-09-23)
- [x] 22.1 **Auto-targeting no longer reaches across the map.** The camera shows ~24 units ahead of the knight and ~11 behind; enemies spawn at 48-50. Throwing Daggers acquired at a flat 40, Arrow Volley flew 50, and Arcane Bomb used an unnamed `d < 900` (30) - all three killed at or near the spawn ring, off every edge of the screen, and stranded the XP where the 6-unit magnet never reached it. One constant now governs all of it: `ENGAGE_RANGE = 22`, inside the forward view and inside the 28 `_ANIM_FULL_RANGE_SQ` already treats as visible. Daggers 40 -> per-level `[13, 15, 17, 19, 20]` so levelling is what extends reach (Codex line updated); Arrow Volley and Arcane Bomb clamp to 22; the primary clamps too, so a range-stacked staff still fights on screen, with +4 bolt overtravel to catch a target that steps aside. Holy Aura, Warding Shields, chain lightning and Storm Call were already 4-14 and are untouched
  - Cost, 12 kite-bot runs per side (Kingsfield, Ogre 0): wins 8/12 -> 6/12, **mean end wave flat at 17.4 -> 17.3**, wave-20 Ogre King deaths 2 on both sides. The batch-to-batch swing was larger than the treatment (before 5/6 then 3/6; after 4/6 then 2/6), so the effect is consistent but mild. The bot also flatters the old behaviour - it kites in circles and never turns, so free off-screen kills helped it more than they help a human. `ENGAGE_RANGE` is the single dial if it plays too tight
- [x] 22.2 `images/upgrades/staff.png` added - Parker's staff (21.2) shipped without an icon, so the HUD slot was blank and every run logged 404s (the `onerror` fallbacks meant nothing else broke). Generated through `gen-icons.mjs`; the first pass came out cream with gold filigree against a dark-backgrounded set, so the catalog entry uses the black-background phrasing and fixed seed already used for `banish`/`runes`/`greed`. It was the only missing icon - relics and forge are complete

## Phase 23 - Frame pacing (2026-09-23, from a 91 s DevTools trace of real play)
The median frame was always fine (16.7 ms). The complaint was the tail: p99 93 ms, worst frame 990 ms, and a hard collapse after ~60 s of a run (13, 15, 6, 4 fps). Two new tools measure this: `tools/shader-churn.mjs` (what is being recompiled) and `tools/perf-probe.mjs` (what the player feels; always pass `--gpu`).
- [x] 23.1 **VFX lights are resident - the big one.** three.js bakes `NUM_POINT_LIGHTS` into every shader as a `#define`, so a light entering or leaving the scene re-links *every material in the scene*. `spawnVFXLight` did `scene.add()` per explosion and `scene.remove()` 0.3 s later, so every blast, spark and bolt recompiled everything. The trace caught it exactly: **661 synchronous link stalls in 91 s** on `setProgram > getUniforms > onFirstUse > getProgramInfoLog`, 13.8 s of blocked main thread (**15% of all CPU**), p99 stall 470 ms, worst 964 ms. Stall *count* was flat across the run (65-93 per 10 s) but cost exploded as the GPU got busier - 484 ms in the first 10 s, **6,505 ms in the 80-90 s window** - which is the late-run collapse. Live cache-key dump confirmed it: every churning key was a `MeshStandardMaterial` differing only in point-light count, cycling 6/7/8. Lights are now provisioned once and faded in and out, never added or removed (`provisionVFXLights`; `setQuality` re-provisions, which is the one legitimate re-link). Live program count went from swinging 105-137 to a steady **30**. `updateLanternLights` already did it this way - the VFX pool was the odd one out
- [x] 23.2 `renderer.debug.checkShaderErrors = false` - `getProgramInfoLog` is the call that blocks until the driver finishes linking. A dev affordance, not something to pay for at runtime. Flip it back on when working on a shader
- [x] 23.3 **Static map matrices frozen.** ~1,400 props re-derived a world matrix every frame, and *twice*, because the heat-distortion pass is a second full `renderer.render`. `updateMatrixWorld` + `multiplyMatrices` + `applyMatrix4` + `projectObject` were ~20% of the trace. `mapMeshes` now gets `updateMatrix()` once and `matrixAutoUpdate = false` after the map builds
- [x] 23.4 **Skinned bounds primed on clone.** `Frustum.intersectsObject` calls `SkinnedMesh.computeBoundingSphere()` when `boundingSphere` is null, and that walks every vertex through `applyBoneTransform`. A `SkeletonUtils.clone` starts null, so **every enemy paid a full skin of its mesh on the frame it first rendered** - thousands per run, in bursts at wave spawns (~10% of the trace). `primeSkinnedBounds` now assigns the free bind-pose geometry sphere inflated by `SKIN_BOUNDS_SLACK` 1.8 to cover animation. Culling still works
- Result, 4-minute bot runs on the GPU, baseline vs all four (`tools/perf-probe.mjs --gpu --minutes 4`):

  | | baseline | after |
  |---|---|---|
  | mean | 18.5 ms (54.0 fps) | 17.1 ms (58.6 fps) |
  | p90 | 23.0 ms (43.5 fps) | 21.7 ms (46.1 fps) |
  | p95 | 27.4 ms (36.5 fps) | 25.2 ms (39.7 fps) |
  | **p99** | **55.8 ms (17.9 fps)** | **33.3 ms (30.0 fps)** |
  | worst frame | 2,136 ms | 735 ms |
  | **frames below 30 fps** | **3.14%** | **0.97%** |

  The 30 fps floor is now met at p99 exactly, and sub-30 frames are down 3.2x. Note the first A/B (23.1-23.3 only) moved the worst frame 2,489 -> 423 ms but left p95 flat - the shader fix owns the catastrophic hitches, 23.4 owns the everyday tail
- [ ] 23.5 **Next, in priority order.** (1) `renderDistortion` (`vfx.js`) is a second full `renderer.render(scene, camera)` - 9.5% inclusive; it early-outs when nothing distorts, but when active it walks all ~1,400 objects to draw a handful on `DISTORT_LAYER`. A dedicated distortion scene would cut it to near zero. (2) `projectObject` 4.8% - the traversal itself survives 23.3; parenting static props under one Group with `matrixWorldAutoUpdate = false` skips the subtree. (3) Damage-number and HP-bar sprites still build a canvas texture each (`texSubImage2D` 448 ms) and are the residual +-2 program churn; a glyph atlas would end both. (4) The remaining >100 ms hitches (22 in 4 minutes) are not yet attributed - re-trace after (1)

## Phase 24 - Co-op legibility (2026-09-23, from playing it)
Local co-op worked mechanically and 19/19 in `coop-verify`, but the first real session produced three reports the tests could not catch, all of them about what the screen tells you rather than what the code does.
- [x] 24.1 **"There is no health for the second player."** There was - an 8px bar labelled "P2" tucked under player 1's panel, which reads as nothing at all. Each companion now gets a row the size of a real HUD element: the knight's NAME rather than a slot number (you look for the character you are playing), a 14px bar in that knight's ring colour, and legible HP. Down turns the row red, a rescue in progress turns it green. The label falls back to `PLAYER 2` when the character is unknown, never `P2 P2`
- [x] 24.2 **"The level-up menu is not helpful, it opens a separate browser lower left."** It was pinned bottom-LEFT, which read as a separate window that had opened over the game, and it said nothing about whose pick it was. It is now centred along the bottom, framed in the picking knight's colour via a `--pick-tint` custom property, headed `P2 - BRENNAN`, and footed with the keys that knight actually holds (`describePickDevice`; a shared screen with a pad, the arrows and WASD all live makes "press 1/2/3" useless on its own). Everyone else gets a `DAD IS CHOOSING AN UPGRADE` strip so they know why a panel appeared and that they can keep fighting
- [x] 24.3 **"How does revive work? There needs to be help on screen."** Revive is **proximity-only**: stand within `REVIVE_RANGE` 4.5 of a downed knight for `REVIVE_SECONDS` 2.5 uninterrupted, decaying at 0.6x/s if you leave, with `BLEED_OUT_SECONDS` 25 before it is permanent. There is no button to press - right for kids, impossible to guess. `updateReviveBanner` now names the knight and spells the whole mechanic out: `PARKER IS DOWN - 23s` / `RUN TO THEM AND STAND CLOSE - NO BUTTON NEEDED`, turning green to `REVIVING PARKER... 75%` / `KEEP STANDING CLOSE` once a rescuer is in range. The user had guessed it was a button press ("push B"), which is exactly the confusion this removes
- Verified by screenshot at 1280x800 with a three-knight party (`tools/shots/coop-{hud,down,reviving,levelup}.png`) and `coop-verify` still 19/19

## Phase 25 - Per-knight profiles (2026-09-23)
"Each player can save their results in both single and co-op mode - make it really simple so the gold they earn goes to them."

Three decisions, all taken deliberately:
- **A profile is a knight.** The knights already ARE the family, so there is nothing to pick, nothing to log into, and no way for a nine-year-old to bank a run into the wrong wallet. The cost is that playing someone else's knight credits their profile, which is the right trade for this household.
- **Split: gold and Forge ranks. Shared: weapon-unlock achievements, mastery, wins, the Ogre ladder, personal bests and the Hall of Fame.** Earnings are yours; content gates are not, so a kid who starts later is never locked out of half the game, and the leaderboards stay comparable across the family.
- **A co-op run pays every knight the full amount**, not a split. Splitting would make co-op worth less per person than solo, which quietly punishes playing together - the opposite of the point when the party is a parent and two kids. Each knight's own Golden Touch rank applies to their own payout, so the amounts can differ.

- [x] 25.1 Save schema v2: `{ version, shared: { achievements, mastery, wins, ogreUnlocked }, profiles: { dad, brennan, parker } }` with each profile `{ gold, ranks }`. `loadSave` / `saveSave` own the store
- [x] 25.2 `loadMeta(who)` returns a **flat view that looks exactly like the old v1 meta** - gold and ranks from the profile, the rest from shared - so all ~15 existing call sites kept working unchanged. `saveMeta(meta, who)` writes each half back where it belongs. `who` accepts a profile id, a player object, or nothing (the knight selected on the menu)
- [x] 25.3 Migration from v1 copies the old single wallet **to every profile** rather than handing it to one knight. Nobody opens the Forge to find their savings gone
- [x] 25.4 `applyForgeStatsTo(ps, p)` per player, so in co-op each knight fights with the upgrades they paid for. `calcRunGold(who)` uses the earning knight's own Golden Touch. The Forge header reads `BRENNAN'S GOLD: 310`, and the title-screen purse follows the knight you select
- [x] 25.5 `tools/profile-verify.mjs`, 9/9: v1 migration preserves gold and ranks for all three and keeps unlocks shared; spending from one wallet leaves the others untouched; Forge ranks are per knight; a three-knight co-op run pays all three (160 each). `coop-verify` 19/19, `touch-verify` 5/5 and smoke all still clean
- [x] 25.6 **Fixed in 27.1** (2026-09-24): rerolls, banish charges and the bonus starting weapon now come from each knight's own Forge through `applyForgeStatsTo`, so a companion who buys Fate's Favor gets their own extra reroll. Only magnet range is still run-wide, and deliberately: pickups fly to the whole party


## Phase 26 - Emberreach, the ogre homeland (2026-09-23)
A third battlefield, and the first one built end to end through the asset pipeline
rather than out of props we already had. Full design in `NEW-LEVEL-PLAN.md`.

- [x] 26.1 **Pipeline extended for a new art direction.** Two new prompt templates,
  `VOLCANIC` (basalt, cooled lava, ash, glowing fissures) and `OGRE` (crude, oversized,
  bone and hide and black iron), plus `DEADTREE` for the burnt woods; two new catalogue
  categories (`volcanic`, `ogre_camp`) wired through `run_pipeline.py`'s `CATEGORY_DIRS`
  and `add-assets.mjs`'s `CATEGORY_MAP`. 28 new catalogue entries as batches 9 and 10
  (`AssetFactory/scripts/add-emberreach-assets.mjs`, idempotent so a prompt can be
  edited and the asset re-run)
- [x] 26.2 **Ground art, first try but for two.** Six seamless 1024 textures (`ash`,
  `basalt`, `cinder`, `lavaCrust`, `sulfur`, `lavaFlow`), five decals (`scorch`,
  `emberCrack`, `ashDrift`, `sulfurStain`, `slag`) and two dead tuft sprites
  (`ashTuft`, `cinderTuft`) through `gen-textures.mjs`. `cinder` came back as glowing
  rubble and `scorch` as a pale crater - both wanted the word "matte" and an explicit
  "extremely dark against the white background", since `alphaFromWhite` turns a light
  centre transparent
- [x] 26.3 **`tools/char-glb.mjs` - twelve props for free.** A charred/basalt re-grade
  of GLBs we already ship, written out under new keys (`char_dead_tree_01`,
  `char_pine_01`, `basalt_boulder_01`, ...). No GPU, a second each, and automatically
  consistent with the rest of the art because it *is* the rest of the art. The grade
  lands luminance in a band rather than multiplying toward black: a black tree on
  black ground is invisible from this camera. Foliage needed its own `charFoliage`
  band because deep green starts too dark for the `char` one. Registry entries go to
  `AssetFactory/catalog/charred.json` and are merged into `assets-extra.js` by
  `add-assets.mjs`, so `add-assets` stays the single source of truth for the game
- [x] 26.4 **Engine, all additive.** (1) `MAPS.emberreach`. (2) `look.emitters`, a
  table of prop key to light, replacing the two hard-coded keys - Emberreach names
  seven (braziers, cauldrons, forges, vents, glowing rock), and Kingsfield and
  Darkwood get the same table synthesised from their existing `look.lantern`/`look.forge`
  so their behaviour is byte-identical. (3) `terrain.flow: 'lava'` swaps the stream
  ribbon for an unlit material driven past 1.0 so the molten core blooms through the
  tone mapper; lava creeps (scroll 0.012 against water's 0.05) and stretches its UV
  over 16 units instead of 6, which killed a chevron artifact. (4) `terrain.tufts`
  makes the grass sprite set per-map. (5) `mapData.barriers` - collision-only discs,
  no mesh - make the lava impassable. (6) `vfx.ambientEmbers` (rising sparks, falling
  ash), chosen by `look.ambientParticles`
- [x] 26.5 **`tools/generate-emberreach.mjs`.** 1,708 objects, 658 obstacles, 115 lava
  barriers, 330 decals, 4,200 dead tufts, 6 lava segments, 26 heat plumes. Two lava
  rivers off the cone crossed at two basalt causeways; the warcamp between them (huts,
  cauldron, cages, butcher blocks, stake wall, all breakable - the loot district); the
  black gate and ogre keep north-east; the ash barrens west, deliberately sparse, as
  the open fighting room; the obsidian field east; the slagworks south-west. New
  `MapBuilder` methods `has`/`pick`/`note` let the generator name the asset it wants
  and the stand-in it will accept, so the map builds and plays at any point in the
  asset run and fills in as batches land
- [x] 26.6 **Six look fixes, each from a capture.** Nothing here was predictable from
  the code; every one came from looking at a frame.
  1. **One orange hue end to end.** A warm key, a warm ambient and a grade with `gain`
     `[1.10, 0.98, 0.90]` multiplied red across everything, and the pale ash read as
     mud. Warmth belongs to the fires and the lava, not the fill: key `0xffd9bc`,
     ambient `0x5d5560`, `gain` `[1.04, 1.0, 0.97]`
  2. **The lava chevroned.** The ribbon UV repeats every 6 world units, which is right
     for water ripples and turns lava's swirls into a herringbone. 16 for lava
  3. **The warcamp was a box drawn on the ground.** A `paintRect` apron leaves a hard
     straight edge that is unmistakable from the air. Overlapping circles now, and the
     palisade is jittered and gapped rather than a perfect line of identical posts
  4. **Sulphur was a biome.** `(heat - 0.60)` put it over ~40% of the map, at which
     coverage its chunky yellow texture tiled into a visible cross-hatch. `(heat -
     0.80) * 3.2` plus explicit vent aprons, and `layerScale` 1.2 -> 0.65 so the
     features are larger than the repeat
  5. **No conifers.** The burnt pines still read as living trees and filled the frame -
     wrong for a lava map however they are graded. Gone entirely (`char_pine_01`
     deleted). Only one standing-dead mesh passed validation, so the variety comes from
     VALUE: the same tree sooted black, scorched grey and ash-bleached. They scatter in
     one interleaved pass, because one scatter per variant let the first take every
     good spot (81 / 19 / 8 out of 90 each)
  6. **Ash read as snow.** The bleached tree at floor 0.30 / range 0.52 rendered bone
     white, and 90 bright `ashDrift` decals finished the job. Band pulled to 0.19 /
     0.40 with a warm tint, drifts to 40 and smaller
- [x] 26.6b Regression: `smoke` clean on all three knights with no JS errors, and
  Kingsfield and Darkwood re-captured overhead - lantern and forge glows intact, so the
  `look.emitters` refactor is behaviour-preserving. `images/maps/emberreach.webp` cut
- [ ] 26.7 **The asset run - STOPPED, resumable.** Batches 5 (war debris, outstanding
  since 17.4), 9 and 10: 42 assets at ~10 min each. What actually happened:
  - Batch 5 produced `combat_spikes_01` and `combat_broken_cart_01` and then
    `combat_burned_cart_01`. **Eleven of its fourteen were skipped** because a browser
    harness run starved ComfyUI's 120 s SD step; the pipeline timed out, resubmitted,
    and fed its own queue backlog. `batch_runner.py` skips permanently after two
    failures, which is the right default and was the wrong outcome here
  - **Batches 9 and 10 never started.** None of the 28 Emberreach-specific meshes
    (volcanic terrain, ogre camp, hero landmarks) exist yet. The map plays on
    stand-ins - see 26.5 - and fills in as they land
  - The run was killed by the harness's low-memory reaper: 21 MB free of 16 GB, 35 GB
    committed. ComfyUI holding SDXL and Trellis-4B is ~4.8 GB of that on a 16 GB box,
    so this machine can run the pipeline **or** a browser, never both
  - Two fixes already in: the SD wait is 120 s -> 360 s (`run_pipeline.py`) so a queue
    backlog cannot cascade, and `tools/playtest.mjs --boot-timeout` exists because a
    cold SwiftShader boot under load takes ~8 min against the old 420 s ceiling
  - **To resume**, with nothing else running: `tools/run-emberreach-assets.sh` (edit
    the `for B in 5 9 10` list to taste), then `tools/rerun-skipped.sh` for the eleven.
    After each batch: `node tools/validate-glb.mjs` -> `node tools/add-assets.mjs` ->
    `node tools/generate-emberreach.mjs`
  - Standing rule: **never run the harness while the pipeline runs**
- [ ] 26.8 Thumbnail (`npm run overhead` then `npm run thumbs`), `npm run smoke`, a
  balance batch on the new enemy mix, and the readability pass Darkwood needed
  (PLAN 18.4) if the ogres vanish against the basalt. All of it needs the machine to
  itself. The only verification done so far is the overhead capture that produced 26.6;
  26.6's own fixes are **not yet seen rendered**

## Changelog
- 2026-09-23 - Phase 26: Emberreach, a volcanic ogre-homeland map built end to end through the asset pipeline. New VOLCANIC/OGRE prompt templates, 6 ground textures, 12 free charred prop variants, per-map light emitters, impassable lava ribbons, and tools/generate-emberreach.mjs. Asset batches 5/9/10 running.
- 2026-09-23 - Phase 25: per-knight profiles. Gold and Forge ranks are per knight, unlocks and leaderboards stay shared, and a co-op run pays every knight in full. v1 saves migrate by copying the old wallet to all three.
- 2026-09-23 - Phase 24: co-op legibility - named companion HP rows, the level-up picker moved bottom-centre and attributed to a knight, and on-screen revive instructions. 18.1b audio signed off.
- 2026-09-23 - Build number on the title screen (bottom-right). tools/stamp-build.mjs rewrites the BUILD constant in index.html and .githooks/pre-commit runs it on every commit, so the number is the commit count and matches git rev-list --count. A fresh clone needs git config core.hooksPath .githooks once.
- 2026-09-23 - Phase 23: frame pacing from a real DevTools trace. VFX lights were re-linking every shader in the scene on every explosion (661 stalls / 91 s, 15% of CPU); p99 17.9 -> 30.0 fps, sub-30 frames 3.14% -> 0.97%.
- 2026-09-23 - Phase 22: auto-target reach capped at ENGAGE_RANGE 22 (daggers 40, arrows 50, bomb 30 all reached the spawn ring); staff icon generated. Tracker brought current - Phases 19-21 below record the co-op, mobile and readability work done 2026-09-22/23 that was never written down.
- 2026-09-21 — Session hand-off after 18.1–18.4: generated audio, balance, Darkwood merged; 18.5/18.7 not started; all servers stopped. See memory `project_session_handoff.md`.
- 2026-09-20 — Phase 14: both maps regenerated from scripts with district layouts and full prop variety.
- 2026-09-19 — Phases 1–7 implemented in one pass (see checkboxes). Deferred: real audio assets, second map, module split, far-enemy LOD.

## Phase 27 - Per-knight ownership (2026-09-24, from playing co-op)
"The 2nd player isn't getting weapon level ups." One report, and underneath it a
long tail of systems that still read the single-player globals - which are player
1's. Each looked right solo and was silently wrong with three people on the sofa.

- [x] 27.1 **A companion's card lands on the companion.** The `UPGRADES` table, the
  card text, evolutions and synergies are all written against `state.player` /
  `playerWeapons`, so a card taken by P2 applied to P1. `beginPickContext()` re-points
  those bindings at the picking knight for the length of a pick; every knight carries
  their own `ranks`, `banished`, `synergies`, reroll and banish charges. Companions
  also get the rerolls, banishes and start weapon from the Forge THEY paid into
  (closes 25.6)
- [x] 27.2 **The level-up screen pauses again, reversing COOP-PLAN decision 1.** The
  non-blocking overlay aimed three sets of live inputs at one card list: whoever moved
  a stick drove the other knight's highlight, and a mashed dash button picked their
  upgrade for them. Nobody can choose a build while being hit either. The screen is
  modal but belongs to ONE knight - their colour, their name, and `pickPadState()` /
  `pickKeyAllowed()` ignore every other device. The pause is load-bearing: it is what
  makes 27.1's binding swap safe
- [x] 27.3 **Damage carries an owner.** `applyDamage(enemy, amount, { by })` reads crit
  and the Hunter / Berserker / Wolfsbane / Hooves relics off the knight who swung -
  before this, every hit in the game rolled player 1's crit chance. Projectiles, bombs
  and burn patches remember who fired them; kills credit the killer, so lifesteal heals
  the right person on a per-knight throttle
- [x] 27.4 **Enemy attacks find every knight.** Companions were immune to boulders,
  bomb blasts, boss charges and boss slams - all four tested player 1's position only.
  `damagePlayersInRadius()` / `playerAt()` replace that. Archers aim at the knight they
  chase, thorns and armour belong to the victim, and enemies no longer freeze on the
  spot the moment P1 goes down
- [x] 27.5 **Party-wide things are party-wide.** Streak, combo and kill-milestone
  rewards reach everyone (they were worth a third as much in a trio), a boss reroll goes
  to all of them, drops roll against the luckiest knight, coins magnet to the NEAREST
  knight and merge only when far from all of them, and chests, health and haste go to
  whoever walked over them. Warding Shields and ember trails were single global rings
  shared by the whole party
- [x] 27.6 **HUD and pause screen per knight.** Each companion row carries their weapons
  (level badges, gold border when evolved) and relics; the pause screen gives each knight
  a tinted section with weapons, relics and synergies, and scrolls so RESUME stays put
- [x] 27.7 **Any knight to any slot.** `assignKnight()` SWAPS two slots instead of
  scattering them - "P1 Parker, P2 Brennan" was previously unreachable, because choosing
  Parker for P1 bumped P2 onto whatever was free. Drive it by clicking a roster slot,
  clicking a card, or D-Pad left/right on the joining pad; the cards wear P1/P2/P3 badges
- [x] 27.8 **Two bugs this exposed that were never co-op bugs.** Parker's Arcane Staff
  had no level-up card and no evolution, so his primary sat at level 1 for a whole run
  in SOLO too (added `Runed Focus` and the `Starcaller` evolution; he now finishes
  `staff*`). And `makeWeaponTable()` handed every companion a free sword on top of their
  own primary, which put Tempered Blade in Parker's card pool and ate a weapon slot.
  His title-screen preview also had a drifted copy of the attachment code and showed him
  with a sword and shield - one `CHARACTER_GEAR` table now serves both
- [x] 27.9 **Verify:** `tools/coop-verify.mjs` grown from 19 checks to 48, all passing.
  `npm test` clean; solo balance reaches wave 20 at or above the 2026-09-22 baseline

## Phase 28 - Mirefen, the drowned lowland (2026-09-24)
A fourth battlefield, and the first one that is not just a palette. Full design and
the asset-run post-mortem in `NEW-LEVEL-PLAN.md`.

- [x] 28.1 **The ground is the decision.** Kingsfield, Darkwood and Emberreach differ in
  lighting, props, textures and enemy weights and in nothing else - same open arena, same
  rules, and on no map can the ground itself do anything (Emberreach's lava is an obstacle
  you route around). Mirefen adds `mires`: soft ground, 62% speed for a knight and 50% for
  anything chasing one, a dash clears it, bats fly over. Black water is impassable, crossed
  at two boardwalk fords. Dry hummock islands sit out in the bog at full speed, away from
  the causeway so taking one costs you. The bog hurts the enemy more than you, so retreating
  into it is a move rather than a punishment
- [x] 28.2 **Eighteen bog-graded props before any GPU work.** Four new grades in
  `char-glb.mjs` (`bogMoss`, `sunken`, `bleached`, `algaeStone`). The split into green mass,
  dark wet mass and a PALE note is deliberate: a bog in only greens and blacks is one smear
  from above. Six ground textures, four decals and two sprites in four minutes
- [x] 28.3 **Look pass, four corrections each off a capture.** (1) Pass 1 was a bright green
  lawn - algae painted at `bogField x 1.7` saturated the channel across the map, the same
  mistake Emberreach made with orange. (2) The air was green too; saturation moved out of
  the ambient and into the moss and wisps. (3) 284M triangles a frame because six scatter
  roles all fell back through `m.pick()` to the same 48k-tri mesh. (4) The channels read as
  holes until `water.color` lifted
- [x] 28.4 **The asset run: 26 catalogued, 23 usable, three passes.** Every pass-1 failure
  asked Trellis for thin geometry, so `SWAMP`/`FENFOLK` carry a solid-closed-mass rule.
  Pass 2 was a no-op for 7 of 12 because `run_pipeline.py` resumes off FILES, not catalog
  status. Two meshes passed the render check and were still wrong in place. Scale from the
  mesh you got: the cypresses came back as root masses and at tree scale took the bot's snag
  rate to 8%
- [x] 28.5 **Emitter ground-glow follows its light.** `_glowTex` was hard-coded warm orange,
  so Mirefen's green wisps cast orange pools. White now, tinted by `look.lantern.color`;
  white x 0xffb060 reproduces the old warm glow and the other three maps are unchanged
- [x] 28.6 **Verify:** `tools/mirefen-verify.mjs`, 12 checks, all passing - the bog slows a
  knight at exactly `MIRE_PLAYER`, slows a chaser harder, a dash clears it, the causeway and
  spawn stay dry, black water holds a knight, and the other maps carry no mires. `npm test`
  clean; snag 0-2%; dad and parker both take Mirefen to a wave-20 victory
- [ ] 28.7 Still open: three meshes never came good (`swamp_dead_willow_01`,
  `fen_wicker_trap_01`, `landmark_great_cypress`) and four are mislabels that read fine as
  swamp clutter but are not what they are named (`fen_fish_rack_01` is a porch swing,
  `fen_coracle_01` a mossy box, `swamp_reed_cluster_01` and `swamp_rotten_log_01` ground mats)

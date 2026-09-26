# Castle Survivor Review — Third Look, Addendum

**Same build, three more questions answered: the difficulty ladder is flat for anyone who can kite, co-op is 59/60 and the one red check is the family's own bug, and the phone build only works sideways and does not say so.**

---

**Build reviewed:** master at `c7b88e3`, BUILD 58 — unchanged since this morning's review (`press-review-2026-09-26.md`, 8/10)
**New evidence:** nine Ogre Level 3 kite-bot runs (`review-2026-09-26-ogre3.log`); the 60-check co-op verifier (`review-2026-09-26-coop.log`); five phone-viewport captures at 390×844 and 844×390, device scale 2, iPhone user agent with `isMobile` and `hasTouch` set (`tools/shots/phone-*.png`)
**Method:** files, code and screenshots only. No harness, no browser. The same caveat as this morning applies to every balance number: the bot kites in circles, dodges telegraphs, never dodges an arrow, never rerolls.

This morning I listed Ogre Levels 1–5, three-player co-op and mobile under "What I Could Not Assess." Two of the three now have evidence. The third — three-player balance — still has none, and I say below exactly what it would take.

---

## 1. Ogre Level 3: The Ladder Has One Rung That Bites

**7 wins in 9 at Ogre 3, against 8 in 15 at Ogre 0.** That headline flatters Ogre 3, because the Ogre 3 batch skipped Emberreach and Mirefen, where three of this morning's seven deaths happened. On the three maps both batches share, the honest comparison is:

| Knight / map | Ogre 0 | Ogre 3 |
|---|---|---|
| Dad / Kingsfield | **Win** 16:54, L47, 6,783 kills | **Win** 16:43, L47, 6,699 kills |
| Brennan / Kingsfield | died wave 20, 17:13 | died **wave 11, 7:51** |
| Parker / Kingsfield | died wave 18, 14:42 | **Win** 16:38, L47 |
| Dad / Darkwood | **Win** 16:45 | **Win** 17:07 |
| Brennan / Darkwood | **Win** 16:44 | **Win** 16:51 |
| Parker / Darkwood | **Win** 16:40 | **Win** 16:38 |
| Dad / Bloodmarch | **Win** 16:52 | **Win** 18:01 |
| Brennan / Bloodmarch | died wave 20, 17:20 | died **wave 11, 7:39** |
| Parker / Bloodmarch | **Win** 16:42 | **Win** 16:42 |
| | **6 / 9** | **7 / 9** |

Same maps, same bot, three difficulty rungs apart: one more win. Batch variance is ±2 (PLAN 22.1), so call it flat. Kill counts are flat (5,548–6,951 against 6,191–6,795). End levels are flat (45–48 against 46–49). Victory times are flat — seven of the nine Ogre 3 wins finished between 16:38 and 17:07, inside the same window as every Ogre 0 win — which means the Ogre King with **80% more HP** (`bossHpMul: 1.8`, index.html:1855, applied at 5248: 72,000 HP against 40,000) did not add a measurable second to the finale for a build that already had him.

Here is what Ogre 3 actually changes, and why the kiter does not notice.

**What scales (index.html:1854–1855).** Trickle HP ×2.6, damage ×1.85, speed ×1.22 (applied at 4944–4946); spawn count ×1.6 (8063); elite chance ×2.0 (4919); boss HP ×1.8 (5145, 5248); food ×0.3 (4278, 4284, 4291, 6644, 6652, 6661).

**What does not scale.** XP per kill (4939–4940). Regen. Lifesteal. The 5% party heal every 50 kills (`checkKillMilestones`, 8038). The chest gate (6653). `PLAYER_SPEED` 8 (1689). `ENGAGE_RANGE`. Boss attack cadence (`attackCooldown` 3.0, 5262).

Take those pairs one at a time:

- **Speed ×1.22 changes nothing about who can catch you.** A wave-11 goblin runs 5.82 at Ogre 0 and 7.10 at Ogre 3 — both under the knight's 8, before Windwalker, Hooves or the horse. A goblin does not out-run an unbuffed knight at Ogre 3 until wave 18 (4.5 + 0.12w ≥ 8 / 1.22 needs w ≥ 17.1). Archers top out at 6.8, ogres at 6.1, bombers at 6.2. Wolves and rats were already faster than you at Ogre 0. The multiplier makes the horde look busier and leaves the kite loop exactly as safe.
- **HP ×2.6 is absorbed by the build, not the player.** A wave-11 goblin has 100 HP at Ogre 3 against 38 at Ogre 0. Kills are flat because kills are DPS-limited at both levels: the bot kills what it reaches and the rest pile up. Dad on Bloodmarch sat at **156–175 live enemies from wave 16 to 20** against `MAX_ENEMIES` 180 (2024). At the cap, `spawnMul` stops meaning anything.
- **Food ×0.3 is irrelevant to a build with regen.** Dad on Bloodmarch took **2,552 from archers and 995 from dragon ogres** and never once dipped below maximum at a minute mark (log line 140; rows 142–159 read 115/115 through 184/184). 5,548 kills is 110 milestones × 5% of max HP ≈ 930 HP from `partyHeal` alone, plus a regen tick every second for 18 minutes, plus Healer's Blessing. "Healing is a luxury" is the Ogre 3 description (1854). It is not true of anything except pickups, and pickups are the heal source a levelled build already ignores.
- **Elites ×2.0 makes Ogre 3 evolve faster.** `eliteChance = min((0.03 + 0.01w) × eliteMul, 0.20)` (4919) hits the 20% cap at **wave 7** at Ogre 3 and wave 17 at Ogre 0. Elites give 3× XP (4977) and are the only chest source (6647–6656), gated by `CHEST_MIN_GAP` and a flat chance that Ogre Level does not touch. More elites earlier means more chest rolls earlier. The difficulty knob is quietly accelerating the thing that trivialises the difficulty.
- **Damage ×1.85 is the one knob that bites, and it bites only at the bosses.** A wave-11 arrow does 18.6 at Ogre 3 (10.1 at Ogre 0): six arrows kill Brennan instead of eleven. Fine. But look at the wave-10 dragon ogre: **contact 102, boulder 120** (`(25 + 3w) × 1.85` at 5260, `(30 + 3.5w) × 1.85` at 5275). Brennan has 110 HP and no armour (`CHARACTER_PASSIVES.brennan`, 1918–1925). One touch is 93% of his health. One boulder is 109%.

**The two Brennan deaths tell exactly that story.** Both at wave 11, both at 7:39–7:51, both at level 25 with **no evolved weapon** (log lines 28 and 164: spear L4–5, holyAura L4, arrowVolley L2–4, a fifth slot at L5, no stars). Dad and Parker at the same Ogre level finished with three or four evolutions each. Both damage lists say the same thing: `dragonOgre 98 / 59`, `boulder 78`, `archer 267 / 215`, and `boss 119 / 84` — that last one is the wave-5 ogre's contact, which at Ogre 3 has 3,780 HP and was still chewing on him at wave 7 (rows at 4:03 and 4:04: 42/110 and 61/110). The wave-10 dragon ogre arrives with 8,640 HP. A level-5 spear does 68 to four targets every 0.95 s — about 30 s of uninterrupted hits to kill it, which a kiting bot does not deliver. At 45 s the bot decides to press the boss (`tools/playtest.mjs:143–150`) into a 102-damage contact. Then wave 11 spawns `archerLine` and `coven` (7932) on top of a boss that is not dead. He was at 110/110 at 7:04 and dead by 7:51.

And this is not new at Ogre 3. Look at Ogre 0: **Brennan on Kingsfield was at 20/125 at wave 11** (`review-2026-09-26-balance.log:39`), **Brennan on Bloodmarch was at 32/140 at wave 11** (line 277). Wave 10–11 is the melee knight's crisis at every difficulty. Ogre 3 just multiplies the same crisis by 1.85 and it goes from "nearly" to "dead." Parker, with 85 HP and no armour either, survived both maps because the staff reaches 14–18 and he never lets the boss touch him.

So the ladder is not flat; it is a step function. Waves 1–9 at Ogre 3 are Ogre 0 with a darker, thicker crowd. The wave-5 boss, the wave-10 dragon ogre and the King are three one-shot checks that the description ("Every mistake is punished") describes accurately, and nothing in between punishes anything. DRG's Hazard 5, which the code comment cites as the model (1843), makes the *trickle* lethal — swarmers that catch you, praetorians that do not stop. Ogre 3 makes the trickle 2.6× tankier and leaves it 12% too slow to matter.

**What a human feels that the bot does not.**

- The crowd. At the cap on Bloodmarch, 160–175 enemies at 55% brightness (this morning's #1, unchanged). A human's readability problem scales with Ogre Level; the bot's does not exist.
- The wave-5 boss. At Ogre 0 it lingered into wave 8 in two of this morning's captures; at Ogre 3 it has 3,780 HP and hits for 60 on 85–115 HP. A human who does not kite it for two minutes gets touched.
- The dragon ogre's contact hit. The bot dodges the boulder because it is telegraphed (`dangerZones`, 12818–12824) and so will a human. Nobody dodges the 102-damage touch except by never being near it, and a melee knight has to be near it.
- The reward. An Ogre 3 win pays +180 gold from the wave bonus and +300 on victory (8674–8675), +45% to the grade score (9594–9602), and unlocks Ogre 4 (9838–9844). That is a real carrot. But the ladder is hidden behind BEGIN QUEST at 1280×800 (this morning's #3), so a laptop player never sees that Ogre 1 is open from a fresh save (`meta.ogreUnlocked || 1`, 9841).

One more thing the Bloodmarch Dad run shows. It is the longest run on record at 18:01, and its wave-20 row is at 17:10 (line 159) where every other run's wave 19 row is at 16:09–16:10. At 164–175 live enemies pinned to the cap, the King fight ran somewhere between 50 and 110 seconds — the only Ogre 3 run where his 72,000 HP produced the "60–120 s fight" the code says he is meant to be (5243–5244). He got there by being one of nine and by a map that pens the bot. That is not a ladder working; that is the cap working.

## 2. Co-op: 59 of 60, and the One Miss Is the Bug the Family Reported

`tools/coop-verify.mjs` drives a three-knight party (Dad on WASD, Brennan on a pad, Parker on the arrows) and checks sixty things. Fifty-nine pass. Read the list (`review-2026-09-26-coop.log`) and it is a good list: device isolation (lines 17–19), per-knight max HP and primary (15–16), the pick screen pausing and belonging to one knight (22–24), a companion's card landing on the companion (26–27), crit and lifesteal credited to the knight who hit (38–39), blasts hitting everyone in them (40), coins flying to the nearest knight (44), down / bleed-out / revive / wipe (45–50), per-knight wallets, Forge ranks and payouts (51–62). Every item in PLAN Phases 19, 24 and 27 has a line here. Phase 27's list of "systems that still read player 1's globals" (PLAN.md:390–392) is the reason most of these checks exist.

**The failing check is `every knight levels their own weapons`, result `3/0/3`** (`coop-verify.mjs:227–240`, asserted at 428). The test queues six level-ups for each knight, and on every card screen clicks the first card whose text matches `NEW` or `Lv N`, falling back to the first card. Afterwards it sums each knight's weapon levels. Dad gained 3, Parker gained 3, **Brennan gained 0.** The next line, `every knight banks their own ranks 6/5/6`, passes — so Brennan's six picks did land in Brennan's book. They were not weapon cards, or they did not write to Brennan's weapons.

I read the write path and it is sound. `weaponUpgrade.apply` writes to `playerWeapons[id]` (8433–8437); `beginPickContext` points `playerWeapons` at the picking knight's `weapons` for the length of a pick (8304–8329, specifically 8322); the earlier check `P2's pick lands on P2` took a "Honed Spearhead Lv 1 → 2" card through exactly this path and passed (log line 30). So the write works at least once. What is left is the offer: six card screens in a row for slot 2 with no weapon card on any of them, or a weapon card the regex did not match.

Brennan's eligible weapon cards at that point are the spear and the dagger (both owned, both under 5, weighted 2.2× at 9076) plus any *new* weapon that is unlocked in the harness's fresh save — and a fresh save has very few (the phone game-over capture shows Storm Call and Arrow Volley being unlocked at the end of a wave-5 run). Against fourteen stat cards at weight 1, three draws without replacement miss both weapons about 42% of the time. Six screens in a row: about 0.5%. That is possible for an unseeded test — the game has 85 `Math.random()` sites and no seed (PLAN 19.6) — and it is unlikely enough that I would not wave it away.

**What it means for a player, if it is real:** the second knight on the sofa is offered stat cards and never a weapon. That is word for word the report that opened Phase 27: "The 2nd player isn't getting weapon level ups" (PLAN.md:390). The check that guards the family's own complaint is the one that is red. The fix is not to the game yet; it is to the test. Record every card title offered per pick, assert that slot 2 is *offered* a weapon within six screens, seed the pool or force it, and run it twenty times. If it is a 1-in-200 flake, the test stops crying wolf. If slot 2 really is not offered weapons, the developer has the repro that Phase 27 never got.

**What the sixty checks do not cover** — and this is the bigger point. Not one of them puts three knights under enemy pressure. "Companion kills enemies" (line 21) spawns twelve goblins at a fixed point and counts kills. Nothing measures what `PARTY_SCALE = { spawn: 0.8, hp: 0.25, bossHp: 0.7, cap: 0.6 }` (4396–4402) does to a run: at three players, spawns ×2.6, enemy HP ×1.5, boss HP ×2.4, cap 288. XP-to-next also scales by the spawn multiplier (`partyXpToNext`, 8258) — 2.6× the XP per party level, one pick per knight per level — so whether a trio levels at the same cadence as a solo knight depends entirely on whether three knights kill 2.6× as fast, and nobody has looked. Phase 27.4 then made companions vulnerable to boulders, blasts, charges and slams and stopped enemies freezing when P1 goes down (PLAN.md:413–417), so the party got harder by an amount that was never measured on top of a multiplier that was reasoned out (PLAN 19.5). This morning I could not assess three-player balance. I still cannot, and it is now the largest untested surface in the game.

**What it would take.** Three things, all in the harness: (1) a `--players N` option — `__cs.startRun` takes only `character`, `map` and `ogre` (12901–12906), while `joinPlayer` (4669) exists and `coop-verify` already drives three devices through `cs.padSlot()` and `cs.keys`; (2) a bot brain per knight — the kite bot reads `cs.playerPos` and `cs.state.player`, which is player 1 only (`tools/playtest.mjs:132–135`); (3) per-knight HP, downs and revives in the balance timeline. About a day. Until then, every co-op session the family plays is the playtest.

Unchanged from this morning and still relevant here: `fireEnemyArrow` takes `dx0` from the archer's own target and `dz0` from player 1's mesh (5324–5325), so arrows meant for a companion fly toward P1's z-coordinate. PLAN 27.4 says archers aim at the knight they chase. On one axis they do.

## 3. Mobile: It Works Sideways, and Nothing Tells You That

Five captures. Two of them are the game working; three are the game's desktop menus at phone size.

**The landscape play screen is good.** `phone-landscape-hud.png` (844×390, wave 6): the HUD scaled to 85% (`.touch-active #hud-left/#hud-right`, 810–811), the weapon and relic rows tucked bottom-left (806–807), a 110px minimap bottom-right (808), the DASH button at right with its cooldown sweep (760–787), a boss bar, a combo counter, a "200 SLAIN — Vitality Restored" banner, and the stick that appears under the thumb wherever it lands (731–738). That is the Vampire Survivors mobile input model — floating stick, one button — and the stick-follows-thumb decision was made for exactly the right reason (the comment at 731–734). If the phone build were only this screen I would call it done.

**Portrait is an unhandled state, not a supported one.** `phone-portrait-hud.png` is not a HUD capture; it is the game-over screen after a run that died at wave 5, 3:12, to Gnarltusk — the stand-still death this morning's review asked for, delivered by accident. The lead's DOM probe says `#touch-controls` was `display: none` for the whole run. I looked for where the code decides that:

- There is **no `orientation` media query anywhere in index.html**, and no "rotate your phone" text. The only rule that shows the controls is `.touch-active.touch-gameplay #touch-controls { display: block }` (729–730). `touch-active` comes from `_isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0` (11754–11755). `touch-gameplay` is added in `startRun()` (10061), removed at game over (9757) and on return to menu (10083). Both phone runs went through the same `__cs.startRun → beginQuest → startRun` path (12901–12906, 12175).

So the game does not hide the controls in portrait by design. Either `_isTouch` was false in the portrait context, or the probe read after game over had removed the class. I cannot tell which from files, and neither can the developer, because the smoke step does not log `_isTouch` or the computed display of `#touch-controls`. That is the open piece of 18.7 — "the planned harness `--mobile` flag was never added" (PLAN.md:200) — showing up as a dead knight instead of a red check. Whichever it was, a portrait player who gets no joystick gets no message either.

The portrait menus, meanwhile, are broken by one CSS pattern repeated three times: **a centred flex container with a fixed-size child wider or taller than the viewport, which clips both edges equally.**

- **Title (`phone-portrait-title.png`).** `#char-select` is `display: flex; gap: 20px` with no wrap (120–122); the phone query sets `.char-card { width: 132px }` (1270). Three cards plus two gaps is 436px in a 390px viewport: Dad's left edge and Parker's right edge are gone, exactly as captured. BEGIN QUEST is `position: fixed; bottom: 14px` under `(max-height: 1000px)` (1251–1256) with `#start-screen { padding-bottom: 92px }` (1264) — but with five maps wrapped to two rows (1278) the portrait page is about 1.3 screens tall, so the button floats over the Companions row and the controller hints for most of the scroll. Reachable, if you know to scroll under a button.
- **Game over (`phone-portrait-hud.png`).** The stats grid has an inline `max-width: 420px` (9863) at 20px type (648) inside the centred column (631–635). 420 in 390: labels lose their first letters ("aves Weathered", "oes Vanquished"), values lose their last digits ("6,7", "Level 1"). The phone query (1261–1300) does not mention `#game-over-screen` or `#game-over-stats` at all.
- **Level-up, landscape (`phone-landscape-levelup.png`).** `#level-up-screen` is a centred flex column (480–484): a 46px heading (510), a divider with 25px under it (515), three 420px cards at 12px padding and 6px margins (518–519), then the REROLL / BANISH / SKIP row. At 390 CSS pixels tall that overflows, and `justify-content: center` on an overflowing column pushes the excess off the top *and* the bottom: the heading is cut at the top, and the action row is a sliver at the bottom edge. **In the one orientation that has controls, a phone player cannot reroll, banish or skip.** No phone rule targets this screen either.

Two more in landscape. `#touch-pause-btn` is fixed at `top: 12px; right: 12px`, 40×40 (798–800); `#hud` pads 20px on the right (414) and `#hud-right` scales from its top-right corner (811), so the button sits over the panel's last 32px — the "20" in "WAVE 6 / 20" is under it (`phone-landscape-hud.png`, top right). And `phone-landscape-title.png` is this morning's 1280×800 finding at 844×390: the same pinned BEGIN QUEST (1251) covers the map row, and the Ogre ladder and Companions are below the fold.

**Against Vampire Survivors' mobile port.** VS on a phone is portrait-first, and every screen is laid out for it: the stage list, the character grid, the level-up cards stacked vertically and scrollable, the results table. It also plays in landscape. There is no rotate prompt because there is nothing to rotate for. Castle Survivor's landscape *play* screen is honestly competitive with it — arguably better, since VS's virtual stick is a fixed-quadrant affair on most phones and this one follows the thumb. But VS's menus were rebuilt for the phone and these were shrunk, and VS never leaves you in an orientation without controls. The mobile pass (PLAN 20) did the hard part — memory, texture RAM, a quality mode, a Safari-proof input path — and skipped the part a player sees first.

The honest options are two. The cheap one: `@media (orientation: portrait) and (pointer: coarse)` shows a "Turn your phone sideways" panel over the title and the game, and the landscape screens get three small fixes (below). Thirty minutes plus an hour. The proper one: re-flow the character select (wrap), the stats grid (`max-width: 92vw`, smaller type) and the level-up screen (top-aligned, scrollable) for a 390px width. Half a day. Either is fine. Neither is what ships now, which is a phone build that loads, plays well in one orientation, and says nothing when you hold it the other way.

---

## Does This Change the Score?

**8/10 holds.** Nothing here is a regression the morning did not price in, and one thing is better than I assumed.

The ladder finding is another face of the morning's central complaint. Ogre Levels multiply HP and damage on a trickle that a levelled build shrugs off and a kiter never lets touch it, and the only place the multiplier lands — boss one-shots — is the place this morning's #5 and #6 already asked to cap. That is the same "combat layer untouched" con, not a new one. The co-op result is a point in the game's favour: fifty-nine checks on the systems that matter, and the one red check is at least as likely to be the test's dice as the game. Mobile is where I would take a point if the game were being sold as mobile. It is not, yet. The landscape play screen is genuinely good, and the defects are CSS, not architecture.

What would move it to 8.5 is unchanged — visible enemies, a marked archer, a pick pool with depth — with one precondition added by today: **Ogre 3 has to be a different game from Ogre 0 for a player who can already kite.** Right now it is the same game with three reflex checks in it.

---

## Fix List: Additions and Re-ranks Against This Morning's Top 8

This morning's list stands (1 `colorMul`, 2 archer marker, 3 Ogre ladder hidden at 1280×800, 4 Storm Kunai crit gate, 5 boss damage cap, 6 King floor and ceiling, 7 horse pathing, 8 start 18.5). These are the changes.

- **Re-rank 5 and 6 into one item, and move it to #3.** A boss hit ceiling as a fraction of max HP at every wave and every Ogre Level — contact ≤ 50%, boulder ≤ 60% — in `damagePlayer` (6671). Evidence: wave-10 dragon ogre at Ogre 3 does 102 contact and 120 boulder on Brennan's 110 HP (5260, 5275, 1918–1925); both Ogre 3 deaths are this; Brennan at 20/125 and 32/140 at wave 11 at Ogre 0 (`balance.log:39, 277`). Let Ogre Level scale boss *cadence* (`attackCooldown`, 5262) instead of the one-shot. **S–M, 2 hours.**
- **New, after #4: Landscape phone fixes.** `.touch-active #hud-right { margin-right: 44px }` so the pause button clears the wave counter (798–800, 811, 414). Under the phone query (1261): `#level-up-screen { justify-content: flex-start; overflow-y: auto; padding: 8px 0 }`, heading 24px, divider margin 8px, `.upgrade-btn { padding: 8px 12px }`. Verify against `phone-landscape-levelup.png` — REROLL / BANISH / SKIP must be on screen at 844×390. **S, 1 hour.**
- **New, same rank: Portrait.** Either an `(orientation: portrait) and (pointer: coarse)` "Turn your phone sideways" overlay, or `#char-select { flex-wrap: wrap }`, the game-over grid at `max-width: 92vw` and 15px, and the level-up rule above. The overlay is the honest 30-minute answer; the re-flow is half a day. Pick one; do not ship neither. **S or M.**
- **New, same rank: Make "no joystick" a red check.** The smoke step logs `_isTouch`, `document.body.className` and `getComputedStyle(#touch-controls).display` at t = 5 s in both orientations. Closes the open piece of 18.7 (PLAN.md:200). **S, 30 minutes.**
- **New, above #7: Make the co-op weapon check deterministic.** Record offered card titles per pick in `coop-verify.mjs:235–239`; assert slot 2 is *offered* a weapon within six screens; seed or force the pool; run it twenty times. It guards the family's own reported bug (PLAN.md:390) and it is red. **S, 1 hour.**
- **New, above #8: Give the ladder teeth where the kiter lives.** (a) Replace `foodMul` with a `healMul` applied to regen, lifesteal and the 5% milestone heal at 8038 — Ogre 3 at 0.5. (b) Set `speedMul` so a trickle goblin reaches `PLAYER_SPEED` 8 by wave 10 at Ogre 3 (≈1.4, or scale `speedW` at 4929). (c) Do not let `eliteMul` shorten time-to-first-evolution: keep the 20% cap at 4919 but scale `CHEST_MIN_GAP` at 6653 by `eliteMul`. (d) Add "first evolution at", "hits taken" and "boss contact hits" columns to the balance log so the ladder can be read at all. **M, half a day.** Then re-run the nine Ogre 3 runs; the target is a real spread between Ogre 0 and Ogre 3 on the same three maps, not one more win.
- **New, after that: `--players N` in `tools/playtest.mjs` with a bot per knight and per-knight HP / downs / revives in the timeline** (12901–12906, 4669, `playtest.mjs:132–135`). This is the only way 19.5 ever gets measured, and it is the largest untested surface in the game. **M, one day.**
- **Small, in the ten-minute bin:** delay `formation2: 'coven'` at wave 11 (7932) until the wave-10 dragon ogre is dead, or make wave 11 the archer line alone — it is the melee knight's crisis at every Ogre Level.

---

## Still Not Assessed

- **Three-player balance under pressure.** No run, no bot, no log. See above for what it needs.
- **Ogre 1, 2, 4 and 5.** Only 0 and 3 have runs. The elite-cap crossover (wave 7 at Ogre 3) happens at wave 10 for Ogre 2 and wave 5 for Ogre 4, so the "evolve faster" effect is worth checking at each rung.
- **Which of the two portrait explanations is true.** `_isTouch` false, or the probe reading after game over. One line of logging settles it.
- **Whether a human dodges the wave-10 dragon ogre's contact hit.** The bot walks into it on purpose at 45 s. A human might never get near it, or might get pinned by the wave-11 archer line into it. One hand-driven Brennan run at Ogre 3 on Kingsfield would answer this and the coven question together.
- **The phone build on a phone.** These captures are a desktop Chromium pretending. Safari's actual memory ceiling, its touch-event path (11766–11772) and its landscape address bar are still unseen.

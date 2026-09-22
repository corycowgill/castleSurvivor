# Performance and Bug Analysis — automated runs, 2026-09-20

Source: `tools/playtest.mjs profile|balance|leak` (headless Chrome, software WebGL, simulation stepped at 60 Hz without rendering; V8 sampling profiler at 200 µs). Logs in `tools/reports/`.

## 1. Simulation cost (before → after)

| Metric | Before | After | Cause / fix |
|---|---|---|---|
| Sim ms per step, wave 2 (37 enemies) | avg 19.6, p95 53.9, max 754 | avg 0.06, max 0.6 | Every enemy spawn ran `alignToGround` on a SkinnedMesh; three.js computes that box by pushing every vertex through its bones (`applyBoneTransform`, `computeBoundingBox` = 15% of samples). Foot offset now cached per (model, scale). |
| Sim ms per step, wave 12 (79 live) | not reached (bot died) | avg 0.42, p95 1.0, max 3.4 | — |
| Sim ms per step, wave 7 (139 live) | — | avg ≈0.6, p95 1.2 | — |
| Animation share of sim time | ~30% (`slerpFlat`, `setFromRotationMatrix`, `multiplyMatrices`, `PropertyBinding.apply`) | 0% when not rendering; rate-limited when rendering | Mixer updates: full rate within 28 units, half to 45, quarter to 70, none beyond; skipped entirely in simulation-only mode. |

Remaining hot spots at wave 12 (self time, of ~350 ms profiled): `rebuildGrid` 6%, `updateGame` inline 6%, `vfx update` 5.6%, `applySeparation` 4%, `updateEnemies` 4%, `updateHUD` 3.2%. Nothing above 10%; the sim is comfortably under 1 ms per frame at the enemy cap. On the real GPU the frame budget is dominated by skinned-mesh draw calls (one per enemy mesh part), not by this code.

## 2. Memory

- **JS objects do not accumulate across runs.** Counts of every three.js class (textures, meshes, skinned meshes, mixers, actions, bones, materials, geometries), canvases, ImageBitmaps, typed arrays and Web Audio nodes are flat from run 1 to run 2 after a forced GC (`tools/playtest.mjs leak`).
- **Retained on the menu (fixed):** ~35 enemy SkinnedMeshes (~1,200 bones) stayed referenced after `clearRun` by the spatial grid's last frame and scratch arrays. `clearRun` now empties the grid cells, `_queryOut`, `_meleeHits`, `_daggerTargets`, `_chainHit`, `_dirtyHPBars`.
- **Unexplained:** `usedJSHeapSize` still rises ~22 MB per run after GC, and `renderer.info.memory.textures` rises ~34 per run, while no counted object class grows. Not matched to any JS object; likely V8 old-space growth and GL-side counters for re-uploaded shared textures. Monitor over 10+ consecutive runs before spending more time on it.
- Draw calls / triangles could not be measured meaningfully under the software renderer.

## 3. Bugs found by the harness (all fixed)

1. `fullRange` moved inside a render-only block but still read by the elite aura and death-dissolve code → `ReferenceError` on the first elite (every run). Syntax checks cannot catch this; the first balance run did.
2. `rawDt` referenced inside `updateGame` (victory timer) but defined only in `gameLoop` → `ReferenceError` after the first game over of a session.
3. Boulder volleys triple-hit a player because boulders used the 0.15 s melee i-frame window → 0.6 s window for boulders.
4. Spear cone dealt full damage to every enemy in it → Brennan won Ogre 0 untouched (37 damage taken in 16 min). Now (1 + cleave) full targets, rest half.
5. Coin XP scaled with player level (quadratic XP income) → level 61 by wave 20. Now scales with wave.
6. Evolutions offered at level-up → all four by wave 12, HP never dropped after. Now chest-only, chests paced ≥ 75 s apart.
7. Early spawn volume: 50 enemies on screen at 1:00 against a 0.6 kills/s level-1 sword; goblins took two swings (30 HP vs 15). Trickle starts at 1 per spawn, packs from wave 2–3, goblin 14 HP so the starting weapon one-shots wave-1 fodder.
8. Rats: 3 damage every 0.5 s (24 DPS per pack of four at wave 1) killed a stationary player at 0:55. Now 2 damage every 0.8 s.

## 4. Balance state (kiting bot that levels weapons and dodges telegraphs, Ogre 0, Kingsfield)

| Build | Dad | Brennan | Parker |
|---|---|---|---|
| Before session | died wave 4 | died wave 10 | died wave 5 |
| After spawn/XP/HP retune | won (evolved by w12) | died wave 11 | won (evolved by w12) |
| After chest-gated evolutions | died wave 10 (boss) | died wave 10 (boss) | died wave 7 |
| + telegraph-dodging bot | won, 4 evolutions | died wave 8 | won, 4 evolutions |

Stand-still bot: dies at wave 4 (2:11) to the archer line, which is the intended punishment for not moving.

Final state (end of session, kiting bot that levels weapons, dodges telegraphs, presses only a stalled boss):

| Ogre Level | Dad | Brennan | Parker |
|---|---|---|---|
| 0 Normal | VICTORY 16:31–17:22 | VICTORY 16:35 | VICTORY 16:40 |
| 2 Veteran | died wave 6 | died wave 8 | died wave 11 |

Ogre 0 is winnable by a competent build; the challenge axis is the Ogre Level. The Ogre King fight lasts ~70 s against a full build (5x dragon ogre HP, full-speed advance, guard phases at 66%/33% with 8 s immunity and summons, fury ramp after the first minute), and the bot took ~1,000 damage during it. Owned-weapon level-ups are offered 2.2x as often, which removed the "primary stuck at level 1" runs that produced Brennan's early deaths.

## 5. Recommended next steps, by impact

1. Play-verify on a real GPU: the harness cannot measure render cost. Watch draw calls at 130+ enemies; if frame time is GPU-bound, the next lever is far-enemy billboards (PLAN 5.8).
2. `updateHUD` rebuilds strings every 100 ms even when nothing changed (3% of sim); cache per-field text and skip identical writes.
3. `rebuildGrid` + `applySeparation` are the largest sim costs at the cap; a fixed-size cell array instead of a `Map` keyed by packed ints would halve grid cost. Only worth it if 200+ enemies are wanted.
4. Archer arrows are the dominant damage source in every bot run (500–1,500 per run). Humans dodge them; confirm in play that they feel fair, and consider a short arrow-spawn telegraph (draw the bow) so the shot is readable.

# Castle Survivor: Graphics and Level Design Review

**Date:** 2026-10-28
**Build reviewed:** master at `29bb537`, with changes recorded in PLAN Phase 50
**Method:** headless Chromium (SwiftShader) captures from the gameplay camera at zoom 2.0:
overheads of all five maps, edge tours, a fixed enemy line-up at each spawn, and staged shots
of every new set piece. Each "before" frame came from a worktree of `29bb537`, each "after"
from the working tree. Obstruction was measured from the map JSON as the share of each area a
knight can't stand in (obstacle radius + 1.1). Balance comes from `playtest.mjs balance` with
the kite bot.

---

## Verdict

The art direction holds up: splat-painted ground, per-map light rigs, burning buildings and
lava all work. What let the game down was the frame around the action:

1. **Every map ended in a hard band.** The ground plane stopped exactly at the movement clamp,
   so near any edge the top of the frame was flat background.
2. **The horde was still dark.** Deleting `colorMul` fixed goblins, but wolves, rats and bats
   were black shapes on Darkwood. The code said so itself (`MAPS.darkwood`).
3. **Two maps weren't built at the size they were designed.** Mirefen's cypress stands and
   Bloodmarch's burnt wood were placed at one fifth to one eighth of their calibrated scale.
   The generator's own comment describes "dense tree clumps that break the sightlines"; what
   shipped was ankle-height scrub. This is the biggest level-design finding: Mirefen had no
   trees and Bloodmarch had no wood.
4. **Bloodmarch was inside out.** The fight-heavy centre was the most cluttered ground in the
   game, the outskirts were empty, and the spawn point itself was buried in props.

## What changed (all verified by capture)

| Area | Before | After | Evidence |
|---|---|---|---|
| World edge | Ground stops at ±100, flat background beyond | Ground runs 40 past the clamp and darkens outward; each map's own trees/rocks ring the edge (rocks only on the camera side) | `edge-*`, `final-kingsfield-*`, `overhead-*` |
| Enemy readability | Wolf, rat and bat render as black silhouettes (Darkwood worst) | Per-map albedo lift: wolf reads brown and white, archer red, goblins green; no recolour | `lineup-before-*` vs `final-lineup-*` |
| Mirefen wading | `_inMire` computed, never shown | Ripple and splash while wading, plus a one-time `BOG: SLOWED` | `wade2-mirefen-1` |
| Mirefen trees | Cypress at scale ~1.0 (calibrated 5.46): knee-high blobs | Real stands at 0.7-1.05x, trunk-sized collision | `mf-mirefen-1` vs `final3-mirefen-*` |
| Bloodmarch woods | Burnt trees at ~0.9 (calibrated 7-10) | Full-size burnt wood in the NE and the eastern belt | `final-bloodmarch-1..4` |
| Bloodmarch centre | 48% obstructed, 92 small blockers, 12 within 9 units of spawn, a statue between camera and knight | 35%; spawn clear; statue north of spawn; three painted kiting lanes (ring + diagonals) | JSON audit, `final2-lineup-bloodmarch-1` |
| Bloodmarch outskirts | NE/SW quadrants 4-17% obstructed, nothing to find | Pyres, baggage train and last stand, each with a supply cache (7 caches, was 4) | `bm-bloodmarch-1..3` |

### Obstruction (share of ground a knight can't stand on)

| Map | Centre 60×60 before → after | Whole map before → after |
|---|---|---|
| Kingsfield | 37% (unchanged) | 30% |
| Darkwood | 19% (unchanged) | 31% |
| Emberreach | 37% (unchanged) | 51% |
| Mirefen | 19.5% → 28% | 29% → 32% |
| Bloodmarch | 48% → 35% | 25% → 32% |

### Balance check (kite bot, 10 minutes)

| | Before | After |
|---|---|---|
| Dad, Bloodmarch, 10 runs | 8/10 survived, snag 0-6% | 8/10 survived, snag 0-7% |
| Dad, Mirefen (smaller samples) | 2/5 | 2/4 to 3/5 across batches |

That's within the harness's known ±2-in-6 variance. Archer arrows lead every death list on
both builds. `npm test` passes with no JS errors.

### Cost

At a map edge, draw calls rise 0.4% and triangles 11% (Kingsfield, 5-frame sample). At the
spawn there's no change. Enemy lift is one added line in an existing shader; all enemies share
one program, and warm-up compiles it.

## Tried and dropped

- **Fresnel rim light on enemies.** The Trellis meshes have noisy normals (fur especially), so
  any rim band sparkled into white speckle, mapped normal or geometric (`iso-*` captures). Albedo
  lift alone was clean.
- **Lighter Kingsfield fog.** The "green wall" I first saw came from the action-mode camera caught
  mid-lerp. Single-player framing never reaches the fog's near distance, so I reverted the change
  rather than ship something I couldn't see working. It may matter at co-op zoom (PLAN 50.11).
- **Full-scale cypress (1.0-2.1×).** Their canopies loomed into the camera and roofed the knight
  over. Settled at 0.7-1.05×.

## Recommendations, by impact per hour

1. **Fade props between camera and knight.** Full-size trees now make this matter on Mirefen
   and in Bloodmarch's woods; Darkwood's pines always had it. Raycast or distance-test props
   south of each knight and lower their opacity. Size: M.
2. **Trunk-sized collision on Emberreach's dead trees.** It's the most obstructed map (51%), and
   `char_dead_tree_*` collide at half-canopy (3.9). Add them to the `maplib` override, then
   regenerate and re-measure. Size: S, plus a look.
3. **Trace the dark band on Mirefen at (30, -62).** It's in every build: a very large shadow
   from something tall. Size: S.
4. **Keep the bot out of the orc fortress on Bloodmarch.** Several bot deaths happen inside the
   palisade at (58-78, 70-80). A human wouldn't go there, but it costs the harness signal.
   Size: S.
5. **Check Kingsfield's fog at co-op party zoom** before changing its colour. Size: S.

## What I couldn't assess

- Real-GPU frame time. SwiftShader timings are meaningless; only draw-call and triangle deltas
  were compared.
- How the border treeline and enemy lift look on a phone in low-quality mode (the ring thins
  itself at 1.8× spacing there, but I didn't capture that mode).
- Human play on the reshaped Bloodmarch field: the lanes are designed for kiting, but the bot
  doesn't use them deliberately.

---

## Second pass (same day)

| Item | Result |
|---|---|
| Props hiding the knight | Dithered see-through in the prop shader for anything between the camera and a knight. A cypress over the knight on Mirefen is now cut through (`occ2-mirefen-1`); trees behind stay solid (`occ2-kingsfield-*`) |
| Mirefen "dark band" | Not a shadow: hiding shafts, AO and shadows in turn left it unchanged. It's a black-water bog channel rendering near-black with nothing to reflect. Still water now gets a rippled sky sheen and reads as water (`band-noshaft-mirefen-1` vs `water-mirefen-1`) |
| Emberreach obstruction | `char_dead_tree_*` collide on the trunk (3.9 → 1.3). 51% → 35% obstructed, centre 37% → 20%; bot 6/10 → 5/10 survived (noise), worst snag 16% → 5% |

Recommendations 1-3 above are done. Still open: the bot wandering into Bloodmarch's fortress,
and Kingsfield fog at co-op zoom.

## Third pass (2026-10-29): the knight in a crowd

Staged fights (30 mixed enemies closing on the knight, 1.5 s of combat) on every map showed the
real-play problem the static line-ups hid: the knight and his ring vanished inside the pile on all
five maps (`horde0-*`).

| Change | Evidence |
|---|---|
| X-ray silhouette of the knight wherever something is in front of him; nothing when he is in the open (no self-overlap, no boot-sole slivers) | `horde0-*` vs `horde3-*`, `alone3-kingsfield-1` |
| Ring glow drawn over the horde, still under the knight's own legs | `horde3-*`, `alone3-kingsfield-1` |
| "+N XP" labels only for coins worth more than 1 (they stacked on the knight) | `horde3-mirefen-1` |
| Shaman heal ring peak opacity 0.9 → 0.5 | `horde2-*` |

## Fourth pass (2026-10-29): whole-map layout and prop placement

Overheads of all five maps (`overhead-*`) for composition, plus a prop check in
`tools/map-audit.py` for what map scale hides.

| Map | Read | Changed |
|---|---|---|
| Kingsfield | Strong: walled castle district open to a meadow, crossroads town, farms, corner keeps, woods at the edge. 9-10/10 bot survival | Postern where the west lane met the curtain wall (`postern-kingsfield-1`); oak moved out of the windmill; caches use `m.cache()` |
| Darkwood | Track-and-ford forest with clearings (charcoal camp, lodge from 50.19) | Nothing new |
| Emberreach | Two lava flows and causeways frame it well; the anchor did not exist | Caldera: a lava lake at the summit with two flanking ridges, replacing a boulder ring that was the map's worst maze (`caldera-emberreach-*`). Bot 3/10 -> 6/10 |
| Mirefen | Spine, channels, fords, islands, village | Spurs bow and wander instead of reading as a ladder; crossing dressing keeps off them; every third island holds a cache (`overhead-mirefen`) |
| Bloodmarch | Diagonal war between castle and fortress, with the outskirts from 50.6 | Towers no longer stacked on wall segments; wall rubble out of the smithy; a cottage off the King's Road; the orc idol out of the gate ruin |

Still open: `fen_boardwalk_01` wants regenerating as a flat walkway; the cone and spire meshes
for Emberreach were never made, and the caldera is a stand-in for them.


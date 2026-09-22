# Castle Survivor — Co-op Plan (1–3 players, local + online)

**Status:** Draft for review. Nothing implemented.
**Written:** 2026-09-22
**Companion doc:** `PLAN.md` (the main roadmap). If this is approved it becomes Phase 19.

---

## The headline

**Local co-op and online co-op are not the same size of project, and they are not equally gated.**

They share one prerequisite — turning the single-player singletons into a `players[]` array — but after that they diverge sharply:

| | Local co-op | Online co-op |
|---|---|---|
| Needs the `players[]` refactor | Yes | Yes |
| Needs fixed timestep | No | **Yes** |
| Needs seeded PRNG across 85 sites | No | **Yes** |
| Needs state serialization | No | **Yes** |
| Needs transport / lobby / disconnect handling | No | **Yes** |
| Rough effort | **1–1.5 weeks** | **+3–4 weeks on top** |

**Recommendation: build local co-op first and ship it as its own feature.** It is the natural fit for three kids and controllers in one room, it is most of the fun for a fraction of the cost, and it de-risks the big refactor before netcode compounds every bug. Then decide on online with the refactor already paid for.

---

## What currently assumes exactly one player

All line numbers verified against the working tree on 2026-09-22.

### The singletons

| Symbol | References | Notes |
|---|---:|---|
| `state.player` | **198** | 41 distinct fields once upgrades/relics attach at runtime |
| `playerMesh` | **154** | the dominant blocker |
| `playerWeapons` | 47 | run-scoped, becomes per-player |
| `ogreMods` | 22 | global difficulty — **stays shared** |
| `selectedCharacter` | 14 | becomes per-player |
| `rerollCharges` | 10 | per-player (Brennan's passive grants +1) |
| `_heroRing` | 10 | one ring → N rings, needs player colours |
| `playerAnims` | 8 | |
| `playerMixer` / `currentPlayerAnim` | 6 each | |
| `PLAYER_SPAWN_X/Z` | 4 each | needs spawn fan-out |

**~350 call sites** between `playerMesh` and `state.player` is the honest headline number.

### The three real problems

**1. The level-up pause is the hard one, and it is a design problem, not a code problem.**

`showLevelUp()` (index.html:7397) sets `state.paused = true` at **7402**. The entire simulation stops for every level-up.

The arithmetic kills it outright. Dad's winning run took **47 level-ups in 16:48** — one decision screen every 21 seconds. Three players on a shared XP pool at 3× income, with the curve unchanged, is roughly **141 level-ups per run — one every 7 seconds**. The game would spend more time paused than running.

This must be solved before the refactor, because it determines the shape of the UI work. See Decision 1.

**2. Enemy AI targets one player.** 96 references to `playerMesh.position` in targeting, spawn placement, and the off-screen warning. Every one needs a nearest-player (or aggro-weighted) lookup.

**3. One death ends the run.** `triggerPlayerDeath()` (2097) → `gameOver()` (8510). Co-op needs a downed/revive state or the first death ruins it for everyone.

### The good news

**Multi-gamepad is already half-built.** `pollGamepad()` (8568) already does `for (const gp of navigator.getGamepads())` — it iterates *every* connected pad, then writes all of them into one `gamepadState` (8572, `const s = gamepadState`). Last pad wins. Making it `gamepadState[i]` is genuinely a small change.

**The input seam is narrow.** `updatePlayer()` (4889) sums three sources into one `dx/dz` at 4911–4926 and ORs dash at 4939. Replacing that with `readInput(playerIdx)` is contained.

**The camera is ~30 lines.** Single target at 8372–8389, and `cameraZoom` is already a live variable (the bumpers control it), so group framing is centroid + a zoom derived from party spread.

**No network scaffolding to tear out.** Confirmed zero matches for websocket/socket.io/peerjs/webrtc. Greenfield.

---

## Decisions — RESOLVED 2026-09-22

| # | Decision | Choice |
|---|---|---|
| 1 | Level-up flow | **Non-blocking per-player card overlay** |
| 2 | XP | **Shared pool, `xpToNext` scaled by player count** |
| 3 | Death | **Downed + revive**, run ends when all are down |
| 4 | Screen | **Shared screen** with centroid camera + soft leash |

What each one commits us to:

**1 — Non-blocking overlay.** `showLevelUp()` must stop setting `state.paused` (index.html:7402). The card picker becomes a non-modal, per-player overlay anchored to that player's HUD corner, driven by that player's input device only. The sim keeps running underneath, so card effects apply mid-combat and the picker must tolerate the owner being hit, downed or killed while it is open. This is the largest single piece of UI work in Phase B.

**2 — Shared XP.** Gem pickup stays proximity-based but credits one party pool. `xpToNext` scales with `players.length` so a 3-player party levels at roughly solo pace rather than 3×. Needs a balance pass: the curve was tuned for one knight's DPS.

**3 — Downed + revive.** `triggerPlayerDeath()` (2097) no longer calls `gameOver()` directly — it puts the player into a downed state with a bleed-out timer. A teammate within range for N seconds revives. `gameOver()` fires only when every player is down. Adds a revive interaction, a downed visual, and a bleed-out HUD element.

**4 — Shared screen.** Camera targets the party centroid with zoom derived from the bounding radius, clamped to a max; beyond that a soft tether pulls stragglers back. Keeps the render cost flat and the family in one shared space.

**Hardware prerequisite:** full 3-player local needs three controllers, or two plus keyboard for P1. Currently one Xbox pad — confirm before Phase B.

---

## Phase A — The `players[]` refactor (prerequisite for both)

**Goal:** convert every single-player singleton to an array, with **no user-visible change**. The game still plays exactly as it does now, with `players.length === 1`.

This is the biggest single chunk and the riskiest. Shipping it as a no-op first means any regression is attributable to the refactor alone, not to co-op features layered on top.

1. Introduce `players[]`, each entry owning `{ state, mesh, mixer, anims, currentAnim, weapons, ring, inputSource, character, rerollCharges }`.
2. Mechanical conversion of the ~350 sites. `state.player` → `players[i].state`, `playerMesh` → `players[i].mesh`.
3. Keep a `const p0 = players[0]` shim during conversion so the tree stays runnable between commits.
4. Enemy targeting: `nearestPlayer(x, z)` helper, applied across the 96 `playerMesh.position` sites.
5. Spawn fan-out from `PLAYER_SPAWN_X/Z`.
6. Per-player `_heroRing` with distinct colours.

**Verify:** `npm test`, then `balance --chars dad,brennan,parker --maps kingsfield,darkwood`. Results must match the 2026-09-22 baseline within noise (2 wins / 6, same death waves). Any divergence means the refactor changed behaviour.

**Effort:** 2–4 days.

---

## Phase B — Local co-op

1. **Per-player input.** `gamepadState` → `gamepadState[]` (small, already iterating). `readInput(playerIdx)` replacing the summed block at 4911–4926. Pad-to-player assignment on join.
2. **Join flow.** "Press A to join" on the character select; each joining pad picks its own knight. Private Mode still applies.
3. **Group camera.** Centroid, zoom from party bounding radius, soft leash beyond max zoom.
4. **Level-up UI** — non-modal per-player card overlay; `showLevelUp()` stops pausing the sim.
5. **Downed/revive** — bleed-out timer, proximity revive, `gameOver()` only when all are down.
6. **HUD** — N health bars, N level/XP readouts, N minimap blips, player-coloured rings.
7. **Difficulty scaling.** 3 players is ~3× DPS. Enemy HP and spawn rate need a party-size multiplier alongside `ogreMods`. This needs its own balance pass — expect the existing wave curve to feel trivial at 3P until retuned.
8. **Shared XP pool** — one pool fed by all pickups, `xpToNext` scaled by `players.length`.

**Verify:** extend the harness bot to drive N players (`balance --players 3`). Target: a 3-player run that reaches wave 20 without being either trivial or impossible.

**Effort:** 3–5 days, plus a balance pass.

---

## Phase C — Determinism groundwork (online only)

Skip entirely if you only want local.

1. **Fixed timestep.** Currently `rawDt = Math.min(clock.getDelta(), 0.05)` (8327) with raw variable dt throughout, and hit-freeze *mutates* dt (`dt *= 0.05`, 8361). Needs an accumulator loop at a fixed tick with rendering interpolated between ticks. Invasive — touches every dt consumer.
2. **Seeded PRNG.** 85 unseeded `Math.random()` sites. `mulberry32` already exists (2987) but is used only for Darkwood map generation (`mulberry32(1337)`, 2997). Thread a seeded instance through all gameplay randomness: spawns, loot, crits, card offers.

**Effort:** 2–3 days.

---

## Phase D — Online co-op

1. **Authority: host-authoritative.** One peer simulates, others send input and receive state. Lockstep is not viable here — the codebase is nowhere near deterministic enough, and host authority sidesteps most of the 85-RNG problem by simply not replicating it.
2. **Transport.** WebRTC data channels (no server cost, but NAT traversal and a signalling server) versus a small authoritative WebSocket server (simpler, needs hosting). Given the game currently ships as a static file, WebRTC keeps that property.
3. **State sync.** Snapshot the authoritative state each tick; clients interpolate. Input from clients is applied on the host.
4. **Lobby, join codes, disconnect handling, host migration** (or explicit "host left, run over").
5. **Latency handling.** Client-side prediction for your own knight, reconciliation on mismatch.

**Effort:** 3–4 weeks, and this is the part most likely to overrun.

---

## Risks

- **The refactor touches ~350 sites in a 10k-line file.** Highest-risk change ever made to this codebase. Mitigated by Phase A shipping as a behavioural no-op and by the balance harness as a regression check.
- ~~**Memory.**~~ Resolved before Phase A: payload 287 → 72 MB, baseline heap 1,428 → ~870 MB (`e201486`). Three player models is now a much smaller marginal cost. Re-measure with `tools/heap-trend.mjs` once `players[]` lands.
- **Balance.** The single-player curve is already fragile — the wave-5 boss kills 3 of 6 runs. 3-player scaling is a second full balance problem sitting on top of an unsolved first one.
- ~~**Uncommitted work.**~~ Tree is clean as of 2026-09-22. Keep it that way through Phase A — commit each converted region rather than landing ~350 sites in one change.

---

## Recommended sequence

1. ~~**Commit the working tree.**~~ Done 2026-09-22 (`e201486`, `37aecc4`, `39ef7fc`).
2. ~~**Compress the assets.**~~ Done — 287 MB → 72 MB, baseline heap 1,428 → ~870 MB. The texture leak turned out to be a stale-counter false positive, not a real leak.
3. ~~**Answer Decisions 1–4.**~~ Done — see the resolved table above.
4. **Phase A** — refactor, verified as a no-op against the balance baseline. ← **next**
5. **Phase B** — local co-op. Ship it. Play it with the kids.
6. **Re-decide on online** with the refactor already paid for and real 3-player experience in hand.

Local co-op through step 5 is roughly **1–1.5 weeks**. Online would roughly quadruple that.

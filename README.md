# Castle Survivor

A browser-based survivors-like built in Three.js. Three knights — Dad, Brennan and Parker — hold a medieval kingdom against twenty waves of goblins, wolves and ogres.

It is a family project: the three playable knights are a father and his two sons, and the game has a Private Mode that hides the other two so each kid only sees themselves and their dad.

**Play:** open `index.html` in a browser, or visit the deployed site. No install, no build step, no backend.

---

## How it plays

If you have played Vampire Survivors or Deep Rock Galactic: Survivor, you already know the shape. You move; your knight swings on his own. Enemies pour in from every edge, dying enemies drop XP, and every level-up offers three cards. A run is twenty waves — around seventeen minutes — ending at the Ogre King.

- **Move** with WASD / arrows / left stick / the on-screen stick on touch. **Dash** with Space / A / the dash button.
- **Your primary weapon swings automatically** in the direction you face. Everything else fires on its own cooldown.
- **Four weapon slots**, primary included, so every run forces a build.
- **Three relic slots** for conditional passives — a revive, lifesteal, damage that scales with the size of the crowd.
- **Evolutions** need a weapon at level 5 *and* a matching stat pick. Excalibur, Meteor Shower, Armageddon, Inferno Wake.

The three knights are genuinely different. Dad is the sturdy generalist with a broadsword and a shield-wall passive. Brennan trades health for a piercing spear thrust and a free reroll. Parker is a wizard — an arcane staff that outranges everything at 14–18 units, +25% crit, and the lowest health in the game.

**Three battlefields.** Kingsfield is a castle town of farms, lantern-lit streets and curtain walls. Darkwood is a pine forest under a cold moon where wolves and bats hunt and the trees hem you in. Emberreach is the ogre homeland: a volcanic basin cut in two by impassable rivers of lava, crossed at two basalt causeways, with the ogres' warcamp burning between them.

**Six Ogre Levels** ratchet difficulty across runs, and a Forge spends gold on permanent upgrades between them.

**The archers will kill you.** They hang back, strafe and loose arrows every three seconds, and they are the top source of damage in nearly every long run. Learning to break off and chase them down is the game's real lesson.

---

## How it was built

Almost every asset in this game was generated rather than authored by hand, which is what made a project this size tractable for one person.

- **3D models** — text/image prompts through **TRELLIS** running locally in **ComfyUI**, then normalised, validated and optimised by the scripts in `AssetFactory/`. 139 GLBs: knights, enemies, bosses, buildings, props, terrain and weapons. The pipeline rejects a lot; Trellis reliably fails on thin-strand subjects like reeds and hay, so those are sprites and decals instead.
- **Textures, decals and sprites** — Stable Diffusion via ComfyUI (`AssetFactory/scripts/gen-textures.mjs`).
- **Sound** — 30 effects and two music loops from **Stable Audio 3 Small**, with a hand-written Web Audio synth set in `audio/synth/` as fallback.
- **Maps** — generated, not placed by hand. `tools/generate-kingsfield.mjs` and `generate-darkwood.mjs` build on a shared `maplib.mjs` and emit the map JSON plus a splat map that paints the ground.

Assets ship Draco-compressed with WebP textures, which took the referenced payload from 287 MB to 72 MB and the baseline heap from ~1.4 GB to ~870 MB. `tools/compress-models.mjs --check` audits for anything that skipped that step.

---

## Architecture

Deliberately plain: **no framework, no bundler, no build step.** ES modules and import maps, straight from the filesystem. Three.js comes from a CDN. Open the file and it runs.

```
index.html     ~10,000 lines — the whole game: state, systems, UI, render loop
vfx.js          ~4,700 lines — instanced-quad particle engine
assets-extra.js              — generated asset registry
map.json / map.darkwood.json / map.emberreach.json — generated level data
Game3DAssets/                — 139 GLB models
audio/                       — 30 SFX + music (synth fallback in audio/synth/)
images/                      — ground, decals, sprites, icons
AssetFactory/                — asset generation pipeline (ComfyUI, Trellis, SD)
tools/                       — map generators, playtest harness, asset utilities
```

**Why one file.** `index.html` holding the entire game is unusual and it is a real trade-off — it is a big file to navigate. But it keeps the game a single artifact with no build step, which is what makes "open it and play" true.

**Rendering.** Three.js with a post-processing chain: bloom, a damage-flash/colour-grade pass, optional GTAO. Each map carries its own light rig and colour grade in `MAPS[].look`, adjustable live from a lighting panel in Settings. The ground is a single splat-painted mesh; grass tufts and decals are InstancedMeshes.

**Simulation.** A flat update loop over typed arrays and plain objects — no ECS. Enemies use a spatial grid for separation and collision. Performance is not the constraint: roughly 0.38 ms per simulation step with 75 live enemies, worst-case p95 around 1.2 ms.

**VFX.** A custom instanced-quad particle system in `vfx.js` with pooled groups per blend mode, rather than per-particle meshes.

**Testing is headless and automated.** `tools/playtest.mjs` drives the real game in headless Chrome through a `?debug` hook:

```bash
npm test                              # load, run each knight 30s, report JS errors
node tools/playtest.mjs balance       # full 20-wave bot runs with per-wave timelines
node tools/playtest.mjs profile       # sim cost, CPU hot spots, heap and leak checks
node tools/playtest.mjs action --gpu  # gameplay screenshots on the real GPU
node tools/heap-trend.mjs --runs 5    # heap trend across runs, with forced GC
```

The balance mode plays complete runs with a kiting bot and reports damage sources, build loadouts and death causes — which is how the game is tuned. One honest caveat: with 85 unseeded `Math.random()` call sites, consecutive runs of *identical* code have returned anywhere from 2 to 6 wins out of 6. The harness is good for finding crashes and for coarse balance signal, but it cannot currently certify that a refactor changed nothing.

---

## Running it

```bash
git clone https://github.com/corycowgill/castleSurvivor.git
cd castleSurvivor
npx serve .          # or any static file server
```

Opening `index.html` directly works too, though a server is better — ES modules and asset fetches are happier over HTTP than `file://`.

`npm install` is only needed for the tooling (the playtest harness and asset scripts). The game itself has no runtime dependencies beyond the Three.js CDN import.

**One-time, if you are going to commit:**

```bash
git config core.hooksPath .githooks
```

That wires up `.githooks/pre-commit`, which stamps the build number into `index.html` before each commit so the title screen always shows the build it shipped in (bottom-right, `BUILD 37`). The number is the commit count, so it matches `git rev-list --count <sha>`. Skipping this breaks nothing — the number just stops advancing. `node tools/stamp-build.mjs --check` prints what would be written without touching the file.

**Deployment** is any static host. No build command; publish directory is the repository root.

---

## Project docs

- **`PLAN.md`** — the quality roadmap, 23 phases of tracked work
- **`COOP-PLAN.md`** — design plan for 1–3 player local and online co-op. Local co-op shipped; the online phases are deferred
- **`ASSETS.md`** — the asset catalogue
- **`tools/reports/`** — press-style reviews used to drive the roadmap, plus balance and profiling logs

## Status

Playable start to finish and reviewed at 7/10 against the Vampire Survivors bar.

**Local co-op is done** — 1–3 knights on one screen, per-device input, party camera, downed-and-revive, shared XP, verified 19/19 by `tools/coop-verify.mjs`. Touch controls and a low-quality mode make it playable on a phone.

Known gaps: the content pool still thins out after about ten runs (PLAN 18.5), 3-player difficulty scaling was reasoned out but never measured (19.5), and a wave-5 boss spike ends a lot of early runs.

# Frame-pacing audit, 2026-09-26

Static audit only. No browser, no benchmark, no game run. Everything below comes
from reading `index.html`, `vfx.js` and `assets-extra.js`, plus the GLB JSON
chunks of the animated enemy models (read with a 12-line node script, no GPU).
Cost figures are **estimates derived from operation counts**, not measurements,
and are labelled as such. Frequencies are exact where the code gives them.

Baseline: three.js **0.164.1** (`index.html:2022`). Several findings below depend
on three.js program-cache semantics in that version, which are stated explicitly
so they can be checked against a trace.

---

## Phase 23.1-23.4: all four fixes are still present

| fix | status | evidence |
|---|---|---|
| 23.1 resident VFX point lights | **intact** | `vfx.js:1894` `provisionVFXLights`; `vfx.js:1910` `spawnVFXLight` only writes `intensity`/`color`/`position` into a resident slot. No `scene.add`/`remove` of a light outside `provisionVFXLights`. `updateVFXLights` (`vfx.js:1931`) fades to intensity 0 and leaves the light in the scene. |
| 23.2 `checkShaderErrors = false` | **intact** | `index.html:2632` |
| 23.3 static map matrices frozen | **intact** | `index.html:4599-4603`, applied to every entry of `mapMeshes`; all five push sites (`4195`, `4486`, `4543`, `4561`) run before the freeze loop. |
| 23.4 skinned bounds primed on clone | **intact, and covers every clone path** | `primeSkinnedBounds` (`index.html:3141`) is called inside `cloneEnemyModel` (`3158`), and every spawn path goes through it: `spawnEnemy` (`5233`), `spawnBoss` (`5507`), the second boss path (`5600`), the debug roster path (`10929`), `spawnCreature` for Lupin and the horse (`10929`), and the harness (`13068`). |

No regression. One thing 23.4 does not cover, and does not need to: `createPlayer`
re-parses the knight GLB per run rather than cloning, so it gets fresh bounds from
the parser.

---

# A: certain spike sources

## A1. Four VFX shader programs are destroyed and re-linked every time their effect pauses

**This is 23.1's bug through a different door, and it is the biggest remaining item.**

In three.js 0.164, `material.dispose()` reaches `WebGLPrograms.releaseProgram`,
which does `if ( --program.usedTimes === 0 ) { programs.splice(...); program.destroy(); }`.
A program with no live material referencing it is **deleted**. The next material
with that cache key re-compiles and re-links, and `getUniforms > onFirstUse`
blocks on the driver finishing the link. That is the exact stack 23.1 traced.

Four effects create a `ShaderMaterial` per event and dispose it when the event
ends. Each has a cache key nothing else in the scene shares, because a
`ShaderMaterial`'s key is derived from its shader source. So whenever the effect
count reaches zero, the program dies.

| site | line | fires | gap that kills the program |
|---|---|---|---|
| `spawnSlashArc` | `vfx.js:2510` | **every melee swing** (`vfx.js:2775`, from `index.html:6752`) | arc lives 0.22 s; a 2/s swing rate leaves ~0.28 s with zero arcs |
| `spawnShockwave` | `vfx.js:1999` | **every enemy death** (`vfx.js:3321`), every explosion, every boss slam | rings live 0.22-0.9 s |
| `spawnHeatDistortion` | `vfx.js:2218` | every large explosion (8 call sites) | 0.35-0.9 s |
| `makeRuneLayer` | `vfx.js:2105` | every rune circle (boss guard phases, casts) | minutes between circles |

Quoted, the slash arc:

```js
  const mat = new THREE.ShaderMaterial({
    uniforms: { ... },
    vertexShader: shockwaveVertexShader,
    fragmentShader: slashArcFragmentShader,
```

and its disposal, `vfx.js:2549`:

```js
      a.mat.dispose();
```

**Cost, estimated:** a warm driver program cache (ANGLE/D3D keeps compiled
binaries keyed by source) makes a re-link roughly 0.5-3 ms. A cold one, which is
what you get on the first swing after a quality change, a tab refocus or a new
map, is 20-80 ms. The slash arc is the worst of the four because it is tied to the
player's own attack rate: **on the order of one re-link per swing, indefinitely**.
This fits "sometimes smooth, sometimes it lags" well, because it depends on whether
the player is swinging continuously (program stays alive) or in bursts (program
dies between bursts).

**Fix:** keep a free list per effect instead of disposing. At `vfx.js:2549`,
replace `a.mat.dispose()` with `_arcMatPool.push(a.mat)`, and in `spawnSlashArc`
take from the pool before constructing. Same shape for the other three. About six
lines per effect. The alternative, and what 23.1 did for lights, is one resident
hidden mesh per effect type so `usedTimes` can never reach zero; the pool is
strictly better because it also removes the allocation.

## A2. `dirLight.castShadow` toggling in the adaptive-quality block re-links every material in the scene

`index.html:10668` and `index.html:10671`:

```js
      if (_aqLevel === 3) { dirLight.castShadow = false; }
...
      if (_aqLevel === 2) { dirLight.castShadow = true; dirLight.shadow.mapSize.set(512, 512); dirLight.shadow.map?.dispose(); dirLight.shadow.map = null; }
```

`numDirLightShadows` is part of three.js's program cache key, exactly like
`NUM_POINT_LIGHTS` was in 23.1. Flipping `castShadow` on the scene's only
directional light moves it between 1 and 0, so **every material in the scene
changes cache key and re-links**. That is the 400-900 ms class of stall 23.1
eliminated, and it fires here only when the frame rate is already bad.

**Can it oscillate?** Yes, and there are two separate mechanisms.

1. **The level-2 transition removes bloom entirely** (`bloomPass.strength = 0`),
   which is a large win. If that pushes the average above 45 fps, the next
   two-second window steps back down to level 1, bloom returns, fps falls below
   25, and level 2 comes back. The 25/45 dead band does not prevent this, because
   the treatment itself moves fps across the band. Once the cycle reaches level 3
   at any point, every period of that cycle pays a full-scene re-link.

2. **The sampled `dt` is game time, not wall-clock time.** `index.html:10652-10656`
   applies death slow-mo to `dt`, and the sample is pushed afterwards at
   `index.html:10658`:

   ```js
     _aqFrameTimes.push(dt);
   ```

   During slow-mo `dt` is scaled to as little as 0.15x, so `avgFps` reads up to
   6.7x too high and quality ratchets **up** at the exact moment the machine is
   struggling. Hit-freeze is applied after the push, so it is unaffected; slow-mo
   is applied before, so it is not.

**Cost, estimated:** the 2-to-3 transition, full-scene re-link, 200-900 ms on the
evidence from 23.1's own trace. The 0-to-1 and 1-to-2 transitions only dispose and
reallocate a shadow depth texture plus re-render all casters once, so 2-10 ms. Note
that the `_aqLevel === 0` branch reallocates a 1024 shadow map that was already
1024, since nothing shrinks it on the way up from 0 to 1. Guarding on an actual
size change saves that 2-5 ms for free.

**Fix, three lines:**

```js
_aqFrameTimes.push(rawDt);                              // wall clock, not slow-mo time
// and at level 3, instead of dirLight.castShadow = false:
dirLight.shadow.mapSize.set(256, 256); dirLight.shadow.map?.dispose(); dirLight.shadow.map = null;
```

A 256 shadow map costs almost nothing and keeps `numDirLightShadows` at 1 forever,
so no material ever re-links. Widen the band to 22/50 as well if the oscillation
survives.

## A3. Animation actions are built for every clip on every spawn, including clips that are never played

`index.html:5241-5244`:

```js
  const mixer = new THREE.AnimationMixer(mesh);
  const anims = {};
  for (const clip of gltf.animations) {
    anims[clip.name] = mixer.clipAction(clip);
  }
```

`AnimationMixer.clipAction` constructs an `AnimationAction`, whose constructor
allocates **one `Interpolant` and its result buffer per animation channel**, and
`_bindAction` allocates a `PropertyMixer` and a `PropertyBinding` per unique track
name (a regex parse of the track path each time). So the per-spawn cost scales with
total channels across all clips in the GLB, not with the clips the AI plays.

Channel counts read straight out of the GLB JSON chunks:

| model | clips | total channels | clips the game actually plays |
|---|---|---|---|
| ogreWizard (shaman) and ogreBoss | 8 | **536** | ~3 |
| wolf | 9 | **450** | ~3 |
| lupin | 7 | 420 | 4-5 |
| bat | 5 | 280 | 2 |
| dragonOgre | 9 | 262 | ~3 |
| rat | 5 | 250 | ~3 |
| goblinArcher | 6 | 174 | ~3 |
| goblin, goblinBomb | 5 | 145 | ~4 |
| ogre | 4 | 117 | ~3 |

The unused ones are concrete: the wolf ships `Sit`, `Jump`, `Howl`, `Bark`, `Idle`
and `Walk` while the game plays `Run`, `Bite` and `Death`. The shaman ships
`Consume`, `Death_C`, `Jog`, `Sprint` and `Spell_Simple_Enter` beyond what it uses.

**Frequency:** once per spawn, in bursts. Wave spawns are staggered, but the packs
are large: `index.html:8372` and `8468` queue 8-20 wolves at 0.08 s apart, and
`8384`/`8476` queue rats at 0.05-0.06 s apart. With `dt` clamped to 0.05
(`index.html:10645`), a frame that already ran long pops several queue entries at
once, so a bad frame causes a spawn burst, which causes a worse frame. That is a
positive feedback loop, and it is the mechanism behind a wave-start freeze.

**Cost, estimated:** a 20-wolf pack is 20 x 450 = **9,000 interpolants plus 9,000
result buffers plus ~1,000 property bindings**, spread over ~1.6 s but concentrated
into whichever frames the queue fires on. Call it 15-40 ms of allocation and regex
work, plus the minor collection that follows.

**Fix:** build actions lazily. `playEnemyAnim` (`index.html:6054`) is the only real
reader, plus `stopAllAnims` (`2410`) and one check at `6956`, so a small accessor
covers it:

```js
  const clipsByName = {}; for (const c of gltf.animations) clipsByName[c.name] = c;
  const anims = {};   // filled on demand by playEnemyAnim via mixer.clipAction(clipsByName[name])
```

That drops the wolf from 450 channels to ~150 and the shaman from 536 to ~200, a
2-3x cut on the most expensive part of a spawn.

## A4. Damage-number and HP-bar canvas textures upload with mipmap regeneration, and the merge path is unthrottled

Both sprite textures are `CanvasTexture` and **neither sets `generateMipmaps = false`**,
so they default to `true` with `LinearMipmapLinearFilter`. Every `needsUpdate` is a
`texImage2D` of the whole canvas followed by a `gl.generateMipmap` over the full
chain. `vfx.js:391` shows the author already knows to do this
(`tex.generateMipmaps = false`) for the bolt texture; these two were missed.

Damage numbers, `index.html:6317`:

```js
    const texture = new THREE.CanvasTexture(cvs);
```

HP bars, `index.html:5461`:

```js
  const tex = new THREE.CanvasTexture(cvs);
```

Uploads happen at `index.html:6296` and `6310` (damage numbers) and `5490` (HP bars).

**The merge path bypasses the per-frame cap.** `spawnDamageNumber` checks
`_dmgNumThisFrame >= _DMG_NUM_PER_FRAME` at `index.html:6301`, but the merge branch
returns at `6300`, before that check. The merge redraw and upload are
`index.html:6295-6296`:

```js
      _drawDmgText(e.sprite.material.map.image.getContext('2d'), String(Math.round(e.amount)), color, e.big);
      e.sprite.material.map.needsUpdate = true;
```

So new numbers are capped at 12 per frame while merges are unbounded. A ground aura
or a burn patch ticking on a tight clump of enemies produces one redraw plus one
upload per merge with no ceiling.

**Quantified, wave 12, ~80 enemies, 6,500 kills per run:**

| | count |
|---|---|
| damage events/s, AoE build at wave 12 (aura on ~40 in range every 0.5 s, plus burn, plus chain) | 60-150 |
| damage-number uploads/s (one per event, new or merged), 128x64 RGBA = 32 KB each | 60-150 |
| enemies carrying an HP bar (elites and ogres only, `index.html:5428`) | 15-25 |
| HP-bar uploads/s, capped at 8 per frame (`index.html:2511`), 64x8 each | up to 480 |

That is 540-630 `texImage2D` plus `generateMipmap` pairs per second. The 23.1 trace
already attributed 448 ms of `texSubImage2D` over 91 s to these two, and that was
before today's rewrite added the merge redraw.

**Fix, two lines each:**

```js
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
```

on both textures, and move the `_dmgNumThisFrame` check above the merge loop so
merges count against the same budget.

## A5. Lightning bolts create and destroy dozens of GPU buffers per bolt

`spawnBolt` (`vfx.js:2389`) builds 3 ribbon layers plus `forks` (default 3) x 2
layers, so **9 `BufferGeometry` and 9 `MeshBasicMaterial` per bolt**. Then
`updateLightning` re-rolls the path `rejitters` (default 3) more times, and each
re-roll rebuilds every layer geometry and calls `buildForks`, which disposes and
recreates all six fork geometries and materials.

`vfx.js:2436`:

```js
      for (const l of b.layers) { const g = ribbonGeometry(pts, l.width, b.taper); l.mesh.geometry = g; l.geo.dispose(); l.geo = g; }
```

**Per bolt over its 0.22 s life:** ~36 geometry creates and disposes, ~27 material
creates and disposes, and `boltPath` allocates 17 `Vector3` per path (4 levels of
midpoint displacement) four times over, plus 9 per fork path.

**Frequency:** `MAX_LIGHTNING_BOLTS = 10`. Storm Kunai and chain lightning fire
several times a second, so at a steady chain build this is **several hundred GL
buffer creates and deletes per second**. Each create is a `gl.createBuffer` plus
`bufferData`; each delete is a `deleteBuffer` that can force a driver sync.

The bolt materials all share one cache key (`vfx.js:2385`: map, additive,
`DoubleSide`, `fog: false`, `depthTest: false`), so they do not individually
re-link. But the shared program still dies whenever the last bolt expires, which
puts this in A1's category too during intermittent chain procs.

**Fix:** allocate each layer's ribbon geometry once at its maximum point count
(17 points is fixed by `levels = 4`) and rewrite the existing `Float32Array` in
place with `attr.needsUpdate = true` instead of building a new `BufferGeometry`.
Pool the fork geometries the same way.

## A6. Particle groups are created lazily, mid-run

`getGroup` (`vfx.js:1196`):

```js
    const group = new ParticleGroup(tex, 800, SOFT_RANGES[textureName] ?? 0.15, ATLASES[textureName] || null);
```

Each group allocates seven `Float32Array`s sized for 800 instances (~57 KB total),
an `InstancedBufferGeometry` with seven instanced attributes, and a `ShaderMaterial`.
There are 12 distinct texture names across 77 `getGroup` call sites, and the key
includes the blend mode, so up to ~20 groups can exist.

They are built **the first time each effect type occurs in a run**: the first boss
slam, the first chest, the first shaman cast. Each is a one-off 1-3 ms spike
(estimated) at a dramatic moment, which is when it is most noticeable. The
`ShaderMaterial` shares a cache key across groups, so only the first group pays a
shader compile.

**Fix, one loop at init:** walk the 12 texture names against both blend modes and
call `getGroup` for each during load.

---

# B: steady-state cost

## B1. Particle attribute uploads send the whole 800-instance buffer regardless of live count

`vfx.js:1148-1155`:

```js
      this.posAttr.needsUpdate = true;
      this.scaleAttr.needsUpdate = true;
```

and five more. In three.js 0.164 a `BufferAttribute` with the default
`updateRange.count === -1` uploads the **entire** array. Per group per frame that is
800 x (3+2+1+3+4+3+2) floats = **57,600 bytes**, whether 5 particles are alive or 800.

With ~10 groups active that is 576 KB per frame, **34 MB/s at 60 fps**, and 70
`bufferSubData` calls per frame.

**Fix, inside the existing `if (writeIdx > 0)` block, per attribute:**

```js
      this.posAttr.updateRange.offset = 0; this.posAttr.updateRange.count = writeIdx * 3;
```

(`addUpdateRange` arrived in r166; on 0.164 set `updateRange` directly.) Typical
live counts are a small fraction of 800, so this is roughly a 5-10x cut in VFX
upload bandwidth.

## B2. `emit` and `emitBurst` allocate two objects per particle

`vfx.js:1215`:

```js
    const cfg = { ...baseConfig };
```

and `ParticleGroup.emit` (`vfx.js:944`) then builds a fresh ~30-field literal per
particle even though `this.particles` is a pre-sized array whose slot object could
be reused.

`eliteAura` alone emits `34 * particleMul` particles per second **per elite**
(`vfx.js:4067`), so 10 elites late-run is ~340 particles/s from that source before
any explosion. Explosions, dust, sparks and embers add more. Call it 600-1,500
particles/s at wave 12, so **1,200-3,000 short-lived objects per second**. Well
within what a generational collector handles, but it is the most likely source of
the small irregular minor-collection pauses that read as micro-stutter.

**Fix:** reuse the slot object. In `emit`, use
`const p = this.particles[i] || (this.particles[i] = {});` and assign fields rather
than constructing. Drop the spread in `emitBurst` by passing `baseConfig` plus an
explicit randomiser.

## B3. The weapon HUD rewrites its whole subtree roughly ten times a second

`index.html:9941`:

```js
    _hudEls.weaponHud.innerHTML = hudHtml;
```

The guard is a string compare against `_prevWeaponHtml`, but the string contains
the radial cooldown, quantised to 10 degrees of 360 (`index.html:9927`):

```js
    const cdDeg = Math.round(Math.min(100, Math.max(0, cdPct)) * 3.6 / 10) * 10;
```

36 buckets. `updateHUD` runs at 10 Hz (`_HUD_INTERVAL = 0.1`, `index.html:2376`).
A 0.5 s weapon cooldown moves ~20 percentage points per tick, which is 7 buckets,
so that slot's HTML changes on essentially every tick. With six owned weapons on
independent cooldowns, at least one slot changes almost always, so the comment's
intent ("only a few times per cooldown") does not hold in practice.

Each rewrite destroys and recreates ~40 elements including six `img` tags, then
forces style recalc, layout and paint of the HUD strip.

**Estimated cost:** 0.3-1.5 ms per rewrite, so **3-15 ms/s**. Not a stutter, but a
measurable slice of the average.

**Fix:** stop putting the cooldown in the diffed string. Build the slots when
ownership or level changes, then each tick write only
`slotEl.style.setProperty('--cd', cdDeg + 'deg')` on the existing `.weapon-slot-cd`
nodes. The custom property already drives the conic gradient (`index.html:1057`),
so nothing else changes.

## B4. `spawnEnemy` walks the model hierarchy four times

`index.html:5266` (shadows), `5284` (hand bone lookup), `5339` (material clone),
plus `primeSkinnedBounds` inside `cloneEnemyModel`. Four full traversals of a 29-67
node hierarchy per spawn.

Individually ~0.05 ms; across a 20-40 clone wave burst, 2-4 ms that lands in the
same frames as A3. Merge them into one `traverse` in `cloneEnemyModel`, which
already has the tree in hand.

## B5. Ground decals and shockwaves allocate a unique geometry each

`vfx.js:1837` is `new THREE.PlaneGeometry(size, size)` per decal (the size is baked
into the vertices, so it cannot be shared), and `vfx.js:1997` is
`new THREE.RingGeometry(0.6, 1.0, 48)` per shockwave, a 48-segment ring of ~196
vertices, created and destroyed on **every enemy death**. At 6,500 kills a run that
is 6,500 ring geometries built and freed.

Both are fixable by sharing a unit geometry and scaling the mesh. The decal already
sets position and rotation, so `mesh.scale.setScalar(size)` on a shared unit plane
is a two-line change. The shockwave already scales the mesh for its animation
(`vfx.js:2051`), so the geometry never needed to encode the radius at all.

## B6. Audio creates unbounded concurrent sources

`AudioSystem.play` (`index.html:3420`) creates a `BufferSource` and a `Gain` per
call with no concurrency limit and no per-sound cooldown. `enemyDeath` plays on
every kill, so a burst of 40 simultaneous deaths starts 40 sources at once.

Web Audio node creation is cheap and mixing is off the main thread, so this is an
audio-quality problem (clipping, flamming) rather than a frame-time one. Worth a
short cooldown per sound name if it ever shows up in a trace. **Not a stutter source.**

---

# C: ruled out

**C1. DOM layout thrash.** There is none. `offsetWidth`, `offsetHeight`,
`getBoundingClientRect`, `getComputedStyle`, `clientWidth`, `clientHeight`,
`scrollHeight` and `offsetTop` appear **nowhere** in `index.html`. The HUD only
writes. The enemy HP bars and the co-op nameplates are three.js sprites parented to
the enemy or the player ring (`index.html:5436`, `5005`), not DOM, so they cost a
matrix each and no layout at all. Item 7 is clean.

**C2. `#relic-hud-wrap:has(#relic-hud:empty)` (`index.html:797`).** Chrome scopes
`:has()` invalidation to elements it marks as affected, and `#relic-hud` is a
sibling subtree of the weapon HUD and the co-op HUD. Only a change to
`#relic-hud`'s own children can flip the match, and `relicHtml` changes only when a
relic is picked up (`index.html:9949`), a handful of times per run. Effectively
zero cost.

**C3. Per-spawn `material.clone()` in `spawnEnemy` (`index.html:5341`).** A cloned
material keeps every property that feeds the program cache key, so it reuses the
existing program rather than re-linking. The subsequent writes are uniform values
(`metalness`, `roughness`, `color`), not defines. And because ~80 enemies hold
references, the program's `usedTimes` never reaches zero while any enemy is alive,
unlike A1's `ShaderMaterial`s. The clone costs one `initMaterial` on first draw, a
parameters object plus a cache-key string, so tens of microseconds. Correct as
written.

**C4. Audio decoding mid-run.** Every buffer is decoded in `loadAll` at load
(`index.html:3522-3531`, `await Promise.allSettled(loads)`). `play` only reads
`buffers[name]`. There is no `decodeAudioData` anywhere in the play path; the only
call is inside `fetchBuffer` (`index.html:3312`), reached from `loadSound` and
`loadAll` alone. Item 5 is clean.

**C5. `renderDistortion`'s early-out does cover the common case.** `vfx.js:2267`:

```js
  if (!distortRT || distortions.length === 0) return null;
```

`distortions` is fed only by `spawnHeatDistortion`, from **eight** call sites, all
large one-off explosions: `explosion` (`vfx.js:2968`), a heavy bolt impact (`3066`),
`bossSlam` (`3337`), an evolved AoE (`3693`), a big blast (`3842`), boss death
(`4333`), and one game-side call for an evolution burst (`index.html:9357`).
Nothing ambient or map-driven feeds it; the Bloodmarch fires do not, which was
worth checking. Lifetimes are 0.35-0.9 s and `MAX_DISTORTIONS` is 10, so a quiet
moment early-outs completely and a busy one pays for roughly half a second after
each blast. The caller also drops it entirely below quality level 2
(`index.html:10785`). The 9.5% inclusive figure in 23.5 is therefore concentrated
in fights, not spread evenly.

Two details worth knowing when 23.5 item (1) gets done. The pass sets
`scene.fog = null` (`vfx.js:2280`) while rendering, which changes the fog half of
the program cache key, but `camera.layers.set(DISTORT_LAYER)` means only the
handful of distortion quads are drawn, so only they need a fog-less variant, and it
is compiled once. And because lights sit on layer 0 they fail `projectObject`'s
layer test, so `shadowsArray` is empty and the second render skips the shadow pass.
Both are fine. **The remaining cost is exactly what 23.5 says it is:
`projectObject` walking ~1,400 objects to draw a handful.** A dedicated `Scene`
holding only the distortion quads removes it entirely and is the right fix.

**C6. `updateMinimap` (`index.html:9986`).** Allocation-free: `_mmElites` and
`_mmBosses` are reused module arrays, all loops are indexed, and there are no
intermediate arrays. ~80 `fillRect`s into a 160x160 canvas at 10 Hz. Fine as
written.

**C7. `buildDamageBreakdownHtml` (`index.html:10238`).** Its `Object.entries`,
`filter`, `sort`, `reduce` and `map` chain runs only from the game-over screen
(`index.html:10415`). Never in the loop.

**C8. `rebuildGrid` (`index.html:2529`).** Reuses every cell array, and `_gridKey`
(`index.html:2528`) returns an integer rather than a string, so there is no
per-enemy string allocation. Called every frame and correctly written.

**C9. `checkMilestones` (`index.html:9241`).** Runs every frame, and one milestone
closure allocates two small arrays (`Object.values(playerWeapons).filter(...)`,
`index.html:9235`). It is removed from the loop once completed, and the arrays hold
under ten elements. ~120 tiny arrays/s at worst, then zero.

**C10. Stale dirty flags on pooled HP bars.** I expected a bug here, because
`_dirtyHPBars.length = 0` (`index.html:10534`, `10587`) does not clear each
sprite's `userData._dirty`, which would freeze a recycled bar forever. It is not a
bug: both sites are inside `clearRun`, which disposes and empties `_hpBarPool`
first (`index.html:10438-10439`), so no sprite survives with a stale flag.

**C11. `material.needsUpdate = true` at `index.html:12537`.** This does force a
full program re-init, but it is in the character-preview builder on the menu, not
in the game loop.

**C12. Spawn queue staggering.** `updateSpawnQueue` (`index.html:2394`) has no
per-frame cap, which looked alarming, but every `queueSpawn` call site staggers by
0.05-0.25 s. The residual risk is the `dt` clamp at 0.05 (`index.html:10645`)
letting a long frame pop 2-3 entries at once, which amplifies A3 rather than being
a problem on its own. Fixing A3 makes it harmless; a per-frame cap of 2 in
`updateSpawnQueue` would belt-and-brace it.

---

# Fix in this order

| # | fix | why here | effort |
|---|---|---|---|
| 1 | **Pool the four per-event `ShaderMaterial`s** (slash arc, shockwave, heat distortion, rune layer) instead of disposing them (A1) | Same failure mode 23.1 proved owns the catastrophic hitches, and the slash arc fires on every swing. Highest expected ms per unit of work on this list. | S, ~6 lines x 4 sites |
| 2 | **Stop the adaptive-quality block toggling `castShadow`, and sample `rawDt`** (A2) | A full-scene re-link on a 2 s oscillation, and it only triggers when the machine is already in trouble. | S, 3 lines |
| 3 | **Build enemy animation actions lazily** (A3) | Owns the wave-start freeze. 450 channels per wolf, 536 per shaman, ~3 clips used. A 2-3x cut on the dominant per-spawn cost. | M, a small accessor plus the `playEnemyAnim` call path |
| 4 | **`generateMipmaps = false` on both sprite textures, and move the damage-number cap above the merge loop** (A4) | 540-630 uploads/s at wave 12, each currently dragging a full mipmap chain. Four lines for the largest bandwidth win. | S, 4 lines |
| 5 | **Bound the particle attribute uploads to the live count** (B1) | 34 MB/s down to 3-7 MB/s, and 70 `bufferSubData` per frame down with it. Pure average-fps win, no behaviour change. | S, 7 lines |
| 6 | **Give `renderDistortion` its own scene** (C5, and 23.5 item 1) | The last item from 23.5 that is confirmed real. Removes a 1,400-object traversal from every frame in a fight. | M, a second `Scene`, and `spawnHeatDistortion` adds to it instead of `scene` |
| 7 | **Reuse ribbon geometries for lightning, and share unit geometries for decals and shockwaves** (A5, B5) | Hundreds of GL buffer creates and deletes per second under a chain build; 6,500 ring geometries per run. | M, rewrite `ribbonGeometry` to fill in place |
| 8 | **Reuse particle slot objects and pre-create all particle groups at load** (B2, A6) | Removes the last routine allocation churn in the VFX path and the first-of-each-effect spikes. | S, two small edits |

Two deliberate omissions from the ranking, both B-list and both cheap if you are
already in the file: the weapon-HUD rewrite (B3, ~3-15 ms/s, fix by writing the
`--cd` custom property instead of `innerHTML`) and the four redundant traversals in
`spawnEnemy` (B4, ~2-4 ms per wave burst). Neither causes a hitch.

After 1-4 land, re-run `tools/perf-probe.mjs --gpu --minutes 4` and check whether
the 22 hitches over 100 ms from 23.5 item (4) are gone. My expectation is that A1
and A2 account for most of them and A3 for the rest.

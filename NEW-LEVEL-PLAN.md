# New Level Plan — **Emberreach**, the Ogre Homeland

A third battlefield beside Kingsfield and Darkwood: the volcanic country the ogres
come from. Black basalt, ash drifts, rivers of lava running down from a smoking
cone in the north, burnt forests, and an ogre warcamp built out of bone, hide and
iron. Mordor by way of Warcraft — saturated orange against near-black rock, not a
grey-brown murk.

The map has to read at a glance from the top-down camera, so the design leans on
**value contrast** (black ground, white ash, glowing orange lava) rather than on
detail, and on **light** (braziers, cauldrons, vents, lava glow) to make the dark
half of the frame legible. Darkwood already proved that a dark map needs its own
lighting rig; Emberreach needs one more aggressive still.

## 1. What the existing catalogue already gives us

121 catalogued assets, 77 through the pipeline. Re-usable here as-is:

| Use | Existing keys |
|---|---|
| Ogre architecture | `ogreCastle`, `combat_barricade_01`, `village_weapon_rack_01` |
| Rock | `boulder`, `nature_rock_cluster_02`, `nature_rock_small_01/02` |
| Dead wood | `nature_dead_tree_03`, `nature_fallen_log_01`, `prop_tree_stump_02` |
| Forge / fire | `blacksmith_forge_01`, `blacksmith_coal_pile_01`, `blacksmith_anvil_01` |
| Ruins | `landmark_ruined_tower`, `landmark_destroyed_watchtower`, `landmark_graveyard_gate` |
| Loot | `barrel`, `chest`, `prop_wood_crate_*` |

### 1a. Free wins — charred variants of assets we already own

`tools/char-glb.mjs` (new) bakes a **charred / basalt grade** into a copy of an
existing GLB: crush the value, desaturate, push the shadows blue-black, and lift
a warm ember rim into the mid-tones. No GPU, seconds per asset. Ten props for
free, and they are visually *of a piece* with the map because they share geometry
with props the player already knows:

`char_dead_tree_01/02/03` ← nature_dead_tree_03 (three grades) ·
`char_fallen_log_01` ← nature_fallen_log_01 · `char_stump_01` ← prop_tree_stump_02 ·
`char_bush_01` ← nature_bush_03 · `char_shrub_01` ← shrubbery ·
`char_logs_01` ← prop_logs_02 · `char_barricade_01` ← combat_barricade_01 ·
`basalt_boulder_01` ← boulder · `basalt_cluster_01` ← nature_rock_cluster_02 ·
`basalt_small_01/02` ← nature_rock_small_01/02

**No conifers.** A burnt pine reads as a living tree whatever you do to its texture,
and on a lava map a full canopy is simply wrong — the forest here is standing dead.
`nature_dead_tree_01/02` are splinter meshes that never passed validation, so there is
exactly one usable dead-tree silhouette. The variety comes from **value** instead: the
same tree sooted black (`char`), scorched grey (`charFoliage`) and ash-bleached (`ash`).
From the top-down camera three values of one silhouette read as three trees.

## 2. Assets to generate

Three batches through **SD (juggernautXL) → rembg → Trellis 2 → normalise →
Draco/WebP optimise → Game3DAssets/**, i.e. the existing
`AssetFactory/scripts/run_pipeline.py` path, driven by `batch_runner.py`.
~8–10 min per asset on the RTX 4060, so this is a multi-hour background run.

### Batch 5 — war debris (14, already in the catalogue, never run)

A long-standing gap in PLAN 17.4, and it happens to be exactly the dressing an
ogre homeland wants: `combat_burned_tree_01`, `combat_burned_cart_01`,
`combat_broken_cart_01`, `combat_broken_barrel_01`, `combat_wall_rubble_01`,
`combat_wall_destroyed_01`, `combat_spikes_01`, `combat_bones_01`,
`combat_skull_01`, `combat_skull_stake_01`, `combat_enemy_totem_01`,
`combat_arrow_cluster_01`, `combat_abandoned_sword_01`,
`combat_abandoned_shield_01`. Running it clears the PLAN item and feeds the map.

### Batch 9 — volcanic terrain + ogre camp (20, new)

Volcanic (new `VOLCANIC` prompt template — cooled lava, basalt columns, ash, glowing fissures):

1. `volcanic_spire_01` — basalt spire, 5.0 m, solid
2. `volcanic_spire_02` — basalt spire variant, 3.5 m, solid
3. `volcanic_rock_cluster_01` — angular basalt cluster, 1.6 m, solid
4. `volcanic_boulder_01` — cracked volcanic boulder, 2.4 m, solid
5. `volcanic_lava_rock_01` — black rock split by glowing orange fissures, 1.2 m
6. `volcanic_vent_01` — fumarole cone, 1.6 m — **light emitter**
7. `volcanic_obsidian_shards_01` — black glass shards, 2.0 m
8. `volcanic_ash_mound_01` — grey ash drift, 1.0 m, walk-through
9. `volcanic_sulfur_crust_01` — yellow sulphur crust, 0.6 m, walk-through
10. `volcanic_crater_slab_01` — cracked lava slab, 1.4 m, walk-through

Ogre-made (new `OGRE` template — crude, oversized, bone/hide/black iron):

11. `ogre_brazier_01` — iron brazier of burning coals, 1.8 m — **light emitter**
12. `ogre_cook_pot_01` — cauldron over a fire, 2.2 m — **light emitter**
13. `ogre_totem_01` — skull totem, 3.4 m, breakable
14. `ogre_bone_pile_01` — bone heap, 1.1 m, breakable
15. `ogre_spike_wall_01` — stake wall segment, 2.4 m, solid
16. `ogre_banner_01` — tattered war banner, 3.8 m
17. `ogre_cage_01` — prisoner cage, 2.6 m, breakable
18. `ogre_butcher_block_01` — chopping block, 1.2 m, breakable
19. `ogre_weapon_rack_01` — rack of clubs and cleavers, 2.0 m, breakable
20. `ogre_hut_01` — hide-and-bone hut, 4.5 m, solid

### Batch 10 — hero pieces (8, new)

21. `ogre_forge_01` — slag forge, 2.6 m — **light emitter**
22. `ogre_barricade_01` — iron-spiked barricade, 1.8 m, breakable
23. `ogre_skull_pile_01` — skull cairn, 1.4 m, breakable
24. `burnt_tree_giant_01` — great charred tree, 9 m
25. `landmark_ogre_gate` — the black gate, 14 m
26. `landmark_volcano_cone_01` — smoking cone, 20 m
27. `landmark_obsidian_arch_01` — natural obsidian arch, 10 m
28. `landmark_ogre_idol_01` — colossal ogre idol, 9 m

Every landmark is placed through `MapBuilder.landmark()`, which silently skips a
mesh that has not shipped — so the map builds and plays at any point in the run,
and improves as meshes land.

### Ground textures, decals and sprites (SD only, ~40 s each)

Added to `gen-textures.mjs`:

- **Textures** (1024², seamless + normal): `ash` (base), `basalt`, `cinder`,
  `lavaCrust`, `sulfur`, `lavaFlow` (scrolls along the lava ribbons)
- **Decals**: `scorch`, `emberCrack`, `ashDrift`, `sulfurStain`, `slag`
- **Sprites** (grass tufts): `ashTuft`, `cinderTuft` — dead stalks, not green grass

## 3. The map — `tools/generate-emberreach.mjs`

Same `MapBuilder` as the other two, seeded, 100-unit world, spawn at the crossing.

```
                    ▲ north (-z)
        ash barrens │ THE CONE (landmark, smoking)   the black gate
             (W)    │        ↓ lava                  + ogre castle (NE)
                    │       ↙   ↘
   slagworks ───── CROSSING (spawn) ───── obsidian field (E)
      (SW)          │                     arch, shard forests
                    │
              OGRE WARCAMP (S) — huts, cauldrons, cages, totems, braziers
```

- **Two lava rivers** from the cone, one east one south-west, built with
  `streamCurve` and rendered as **emissive scrolling ribbons** with a bloom-ish
  glow. Crossed at two **basalt causeways** (the `fords` argument).
  Lava is **impassable** — a new `barriers` array in the map JSON becomes plain
  collision discs, so you route around it instead of swimming through it.
- **The warcamp** is the "village": huts round a central cauldron, cages and
  butcher blocks on the edge, spike walls and totems facing out, braziers for
  light. Breakables everywhere — this is the loot-rich district.
- **The black gate + ogre castle** in the north-east behind barricades, ringed
  with skull stakes. The set-piece.
- **Ash barrens** west: pale dunes, dead trees, bones, near-empty — the fighting
  room. Contrast against the cluttered camp.
- **Obsidian field** east: shard forests and the arch, a maze of solid rock.
- **Slagworks** south-west: ogre forge, anvils, coal, slag decals.
- **Fumarole fields** scattered, each with an ember shaft (the Darkwood light-shaft
  system, tinted orange and inverted into a rising heat plume).
- Chests in the far corners, as in Darkwood.

Ground splat: base `ash`, layers `[basalt, cinder, lavaCrust, sulfur]` — rock
under the causeways and spires, cinder through the burnt woods, a glowing crust
apron along every lava bank, sulphur round the vents.

## 4. Engine work (index.html)

All additive; nothing existing changes behaviour.

1. **`MAPS.emberreach`** — name, desc, loader, fog/bg, `terrain`, `look`, `weights`.
2. **Lava ribbons** — `terrain.flow: 'lava'` swaps the stream ribbon's material for
   an emissive scrolling lava shader (unlit core, additive rim, `fog: false`).
3. **Per-map emitters** — today only `village_lantern_post_01` and
   `blacksmith_forge_01` light the scene, hard-coded. Replaced by
   `look.emitters = { key: {color, intensity, distance, y} }`, which is how the
   braziers, cauldrons, vents and forge glow. Kingsfield/Darkwood keep their
   current behaviour through the same table.
4. **Per-map tuft sprites** — `TUFT_SPRITES` becomes `terrain.tufts`, defaulting to
   the existing green set.
5. **`mapData.barriers`** → collision discs (the lava).
6. **Ambient embers** — `vfx.ambientEmbers()`, rising warm motes, chosen by
   `look.ambientParticles` instead of the hard-coded dust+ash pair.
7. **Enemy mix** — ogre 2.0, bomber 1.5, shaman 1.3, bat 1.1, goblin 1.0,
   archer 0.9, wolf 0.4, rat 0.3. Their homeland; they field their heavies.
8. **Map select** — a third `.map-btn` and an `images/maps/emberreach.webp`
   thumbnail cut from an overhead capture.

## 5. Order of work

1. Catalogue entries + `VOLCANIC` / `OGRE` prompt templates
2. Start ComfyUI → ground textures, decals, sprites (fast)
3. **Launch batch 5 → 9 → 10 in the background** (hours; the GPU is busy from here)
4. Meanwhile, no GPU needed: `char-glb.mjs`, the engine work, the generator
5. As batches land: `validate-glb` → `add-assets` → regenerate the map
6. Verify: `npm run smoke`, `playtest overhead/tour --map emberreach`, thumbnail,
   a balance batch on the new mix

## 6. Where it actually got to

**Done and verified in the running game:** the map, the engine work, the ground art,
the thirteen charred variants, six look corrections each driven by a capture, and a
clean `smoke` run with Kingsfield and Darkwood unchanged.

**Not done:** the 28 Emberreach-specific meshes. Batch 5 produced two (one of which,
`combat_spikes_01`, Trellis returned as a 1,449-triangle sliver and was rejected);
eleven more were skipped when a harness run starved ComfyUI; batches 9 and 10 never
started, and the whole run was stopped for memory pressure. The map is playing on
stand-ins — lantern posts for braziers, picket fences for stake walls, farmhouses for
ogre huts — and `m.has()` / `m.pick()` mean every mesh that lands just improves it.

To resume on a quiet machine:

```bash
tools/run-emberreach-assets.sh          # batches 5, 9, 10
tools/rerun-skipped.sh                  # the eleven war-debris assets
node tools/validate-glb.mjs Game3DAssets/<new>.glb --out tools/reports/glb-<tag>.json
node tools/add-assets.mjs && node tools/generate-emberreach.mjs
npm run overhead && npm run thumbs
```

## 7. Risks

- **Disk**: 9.9 GB free on C:, and `ComfyUI/output` is already 4.1 GB of spent
  intermediates. The run needs ~1 GB. Watched, not deleted — it is the user's.
- **Trellis reject rate** is real (5 rejected of 121 so far). Anything melted gets
  re-prompted or dropped; the `landmark()` guard means a drop is never a blocker.
- **A dark map is hard to read.** Darkwood needed a lighting pass after the fact
  (PLAN 18.4). Budget for the same here: emitters first, then rim light and
  ground discs if enemies vanish against the basalt.

---

# New Level — **Mirefen**, the Drowned Lowland

The fourth battlefield, built 2026-09-24 on the Emberreach template. A peat basin
of black water and bog: two channels cut it apart, a raised causeway runs its
length, and the low ground between is soft.

## Why a swamp is not just a fourth palette

Kingsfield, Darkwood and Emberreach differ in lighting, props, ground textures and
enemy weights, and in nothing else. Same open arena, same wave script, same rules;
Emberreach's lava is an *obstacle*, so on no map can the ground itself do anything.
Mirefen's whole reason to exist is the one rule the other three do not have:

- **Black water** is impassable (`m.barrier`), crossed only at two boardwalk fords.
- **Bog** is soft (`m.mire`, new): 62% speed for a knight, **50% for anything
  chasing one**, and a dash clears it outright. Bats fly over it.
- **Dry hummock islands** sit out in the bog at full speed — the footing worth
  holding, and deliberately placed away from the causeway so taking one costs you.

So the causeway is the fast exposed line, the bog is the slow safe one, and the
choice between them is the map. The bog is slower for the enemy than for you, which
makes retreating into it a move rather than a punishment.

Enemy mix follows: rats 1.9, bats 1.7, shamans 1.5 — vermin and things that fly
over a bog — and the heavies bog down both in the weights and mechanically.

## Free art before any GPU work

`tools/char-glb.mjs` gained four Mirefen grades (`bogMoss`, `sunken`, `bleached`,
`algaeStone`) and **eighteen** variants of props we already ship, which is what the
map is standing on now. The split is deliberate: green mass, dark wet mass, and a
*pale* note — a bog rendered only in greens and blacks is one smear from above, and
bleached driftwood is the only thing that reads against peat.

Three were cut after looking at the contact sheet, and the reason generalises:
Trellis mislabels, and a grade makes a mislabel worse. `nature_bush_03` is actually
a mossy *bench*, so its bog variant was a neon-green lozenge on legs and the
generator placed 437 of them. `nature_rock_small_01` is a tiny castle.
`shrubbery.glb` draws 0.6% of frame — 419 invisible objects. **Look at
`tools/shots/glb-sheet.png` before trusting a regrade.**

## Ground art (SD only, ~4 minutes total)

Textures `peat` (base), `silt`, `bogMoss`, `algae`, `sedgeMat`, `swampWater`;
decals `lilyPatch`, `bogScum`, `rootMat`, `bogPool`; sprites `sedge`, `swampFern`
(`reeds` already existed). Four of the six textures needed a re-roll, both times
for **scale**: SD returns one four-metre lily pad unless the prompt insists on
"very small scale, no large shapes", and a texture tiled every 4.4 units cannot
carry a hero object.

## Assets to generate — batches 11 and 12 (26 meshes)

`AssetFactory/scripts/add-mirefen-assets.mjs`, prompt templates `SWAMP` and
`FENFOLK`. Batch 11 is the swamp itself (cypress ×2, mangrove, drowned willow,
moss curtain, reeds, cattails, lily pads, rotten log, mossy stump, bracket fungus,
peat hummock, bog boulder, driftwood); batch 12 is the fen-folk camp (stilt hut,
drying rack, coracle, eel traps, boardwalk, bog totem, fen lantern, witch hut, wisp
stone) plus three landmarks — the sunken temple, the great cypress and the drowned
bell tower. Every one is asked for by name through `m.pick()` with a bog-graded
stand-in behind it, so the map plays now and improves as meshes land.

## Look corrections, each driven by a capture

1. **Pass 1 was a bright green lawn.** `ALGAE` was painted at `bogField × 1.7`,
   which saturated the channel across most of the map — the same mistake Emberreach
   made with orange. Algae is now the wettest patches only (`(bogField − 0.30) × 2.4`)
   sitting as islands on dark peat, and moss is a mid tone rather than a ground cover.
2. **The air was green too.** A strong green ambient (0x76907a at 1.35) over green
   ground left one hue. The ambient is greyer and weaker, the key carries more, and
   the grade no longer pushes green on top: the green belongs to the moss and the
   wisps, not to the air.
3. **284M triangles a frame.** Six roles (reeds, cattails, lilies, hummocks, moss
   curtains, scrub) all fell back to the same 48k-tri fern, so the map placed 797 of
   it. Stand-ins spread across three meshes and the counts roughly halved: 3,594 →
   2,449 objects, 157M triangles.
4. **The channels read as holes** cut in the ground. `water.color` lifted from
   0x22302a to 0x44584a until the texture's bronze sheen survives the tint.

## Verification

`tools/mirefen-verify.mjs` — **12 checks, all passing**: the bog slows a knight at
exactly `MIRE_PLAYER`, slows a chaser harder, a dash clears it, the causeway and
the spawn stay dry, black water holds a knight, and Kingsfield and Darkwood carry
no mires at all. Plus `npm test` clean, and dad and parker both take Mirefen to a
wave-20 victory with 2–3% bot snagging, in band with the other three maps.

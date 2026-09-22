# Castle Survivor -- Visual Look Pass Critic Review
**Date:** 2026-09-20  
**Build:** `068c2eb` (Phase 15 look pass)  
**Captures:** GPU-rendered at zoom 1.5, no HUD. 10 Kingsfield spots, 10 Darkwood spots (see file list).  
**Reference bar:** Diablo III/IV (isometric dungeon/outdoor), Warcraft III Reforged (stylised RTS), Halls of Torment (retro survivor with painted terrain).

---

## 1. Verdict

The look pass is a dramatic transformation. The BEFORE shots show a flat, monochrome #3a8f3a green plane littered with oversized props, jagged kerb-stone road tiles, and uniform white-ish lighting -- a programmer-art placeholder. The AFTER shots show a splat-painted terrain with five distinct ground layers, warm directional lighting on Kingsfield, moody cold-blue moonlight on Darkwood, grass tufts swaying on the meadows, ground decals (leaf litter, bones, cobble patches, hoof prints), and point-lit lanterns casting warm pools. Props are rescaled to stop towering over the knight. Stream tiles now scroll with a water shader and muddy banks with reed tufts. The overall impression went from "engine test" to "indie ARPG level".

Still, it falls short of the reference games in several areas: the ground textures tile visibly at the current UV scale; splat transitions are mushy instead of painted; water edges are hard rectangles; the knight and small enemies merge into the cobble at plaza distances; vegetation is sparse enough that open meadows still read as wallpaper; and the Darkwood map is underlit to the point of hiding prop detail.

**Scene look score: 3/10 BEFORE, 6.5/10 AFTER.**

---

## 2. Element-by-element assessment

| Element | Before | After | Gap to reference |
|---------|--------|-------|------------------|
| **Ground / terrain** | Flat `#3a8f3a` green plane, 625 grass tile meshes (visible grid). Tour shots show a perfectly uniform bright green. | 5-way splat (grass, dirt, cobble, mud, litter/needles/moss) with normal maps and macro brightness variation. Cobble under roads, dirt under buildings, mud along streams. | Tile repeat is visible at zoom 1.5 (see `gpu-kingsfield-1.png` cobble and `gpu-kingsfield-3.png` plaza). D3/WC3R use hand-painted splats with 3-4 layers at higher res and a stronger noise mask. Macro variation (`0.82 + macro * 0.42`) breaks the repeat but introduces low-frequency banding on Kingsfield (`gpu-kingsfield-3.png` bottom half). Tile size 4.6 units is too large for cobble (each stone reads 15-20 px, should be 8-10 px). |
| **Lighting** | Single white directional, flat ambient, shadow blobs. | Per-map light rigs: Kingsfield warm key 0xffdcb0 at 1.45 + cool ambient 0xa9b6d0 at 0.5 + hemi + exposure 1.08. Darkwood cold blue key 0xa8bcff at 1.25 + deep blue ambient + exposure 1.08. 6 pooled point lights on lanterns with flicker. Colour grade with lift/gain/saturation/vignette. | Kingsfield looks good -- warm and readable (`gpu-kingsfield-2.png` blacksmith yard). Darkwood is too dark: `gpu-darkwood-2.png` (farmstead) props are almost silhouettes; the knight at the ford (`gpu-darkwood-4.png`) disappears into the ground. D4 dark areas still show material detail via fill lights and rim light. AO is disabled (blackens props at this scale per `gpu-ao-kingsfield-1/2.png`). No SSAO fallback tried (lower radius?). |
| **Props / scale** | Barrels taller than the knight; crates oversized 2-3x; scarecrows comically large (tour-kingsfield-5.png fences above the knight's head). | Props at 1.5 units/m (was 2.2); barrel 1.7, boulder 3.2, cart 4, horse 3.6, shrub 2.6. Blacksmith yard (`gpu-kingsfield-2.png`) reads well: barrels and crates in proportion. | The few remaining overscale items: the supply chest (`gpu-kingsfield-2.png` crate right of forge) still feels 20% large next to the house. Lantern post heads feel large in Darkwood (`gpu-darkwood-1.png`). D3/WC3R props have a consistent "half the hero height" guideline for clutter; the game is close but not all props follow it. |
| **Roads** | Kerb-stone tiles with hard rectangular edges at every junction; grid obvious (`tour-kingsfield-1.png`). | Roads removed; cobble splat-painted with a dirt fringe that blends into meadow. Road no longer has a hard edge (`gpu-kingsfield-1.png`). | The cobble-to-grass transition is wide but smooth -- acceptable for a top-down game. Intersections (`gpu-kingsfield-3.png`) now look like proper medieval squares. Close to WC3R quality on roads specifically. |
| **Water** | Bright cyan rectangular tiles, no animation, hard white edge (`tour-kingsfield-5.png`). | Scrolling two-layer water shader (roughness 0.25, metalness 0.05), muted tint, mud bank painted in the splat, reed tufts along banks. | Hard rectangular edges still visible (`gpu-kingsfield-1.png` stream, `gpu-darkwood-4.png` ford). No feathered alpha mask or shoreline foam. The water texture itself is noisy and reads more "plastic wrap" than "stream" at zoom 1.5. D3's water has edge caustics, depth tinting, and foam sprites. |
| **Decals / micro-clutter** | None. | 12 decal types (cobble patches, hay, hoof prints, rubble, bones, cracks, leaf piles, mushrooms, moss, roots, bare soil). Instanced quads per type. Visible in `gpu-kingsfield-3.png` (cobble patches at plaza edge), `gpu-kingsfield-1.png` (leaf litter in the woods). | Decal density is low -- the plaza (`gpu-kingsfield-3.png`) is 80% bare cobble. D3 would layer 3-4 overlapping decals per 5x5m. Rubble/bones at keeps (`gpu-darkwood-3.png` shrine area) are good but sparse. Some decals (look-sheet row 2: skulls, cracked cobble, roots) are photorealistic rather than painterly -- style mismatch with the Warcraft-style buildings. |
| **Vegetation** | None (flat green). | ~3,800/3,300 instanced grass tufts per map (3 sprite variants + reeds) on crossed alpha-tested quads with vertex-shader sway. Canopy shadow discs under oaks. | Open meadows (`gpu-kingsfield-2.png` lower half) have visible tuft spacing -- the grass reads as "scattered" not "ground cover". Darkwood (`gpu-darkwood-1.png`) grass is hard to see under the dark lighting. No flowers in the meadow layer (only in decals). WC3R fills meadows with a continuous grass card layer at ~4 cards/m^2; current density looks like ~0.5 cards/m^2 in open areas. |
| **Style consistency** | Pipeline props were desaturated grey next to saturated Warcraft-style buildings. | `retint-glb.mjs` regraded all pipeline GLBs (+22% sat, warm shift, contrast). White picket fences -> weathered oak. Kingsfield blacksmith (`tint-kingsfield-4.png`) and farm (`tint-kingsfield-1.png`) look harmonised. | Darkwood fences (`tint-darkwood-2.png`) still read pale against the dark ground. The corn/pumpkin fields (`tint-kingsfield-1.png`) are vivid and charming. Some pipeline props (lantern post body, the forge mesh) are still darker/muddier than the houses -- visible in `gpu-ao-kingsfield-1.png`. |
| **Readability (knight/enemies vs ground)** | Knight and enemies highly visible against the flat green. | Knight on cobble (`gpu-kingsfield-3.png`, `gpu-ao-kingsfield-2.png`) is hard to spot -- dark metal armour on dark cobble at zoom 2.0 is a readability problem. On grass (`gpu-kingsfield-2.png`) the knight reads fine due to the lighter backdrop and warm light. On Darkwood the knight is nearly invisible at the ford (`gpu-darkwood-4.png`) and dimly lit on the track (`gpu-darkwood-1.png`). | D3/D4 solve this with a permanent subtle hero glow, a contact highlight ring, and lighter hero silhouette values than the terrain. The game has no hero highlight system. At zoom 2.0 on cobble or Darkwood, the knight and small enemies (rats, goblins) will merge with the ground. This is the most gameplay-critical issue. |

---

## 3. Top 8 next steps (ordered by impact per hour)

### 1. Hero readability ring / glow (HIGH impact, ~2h)
**Problem:** Knight merges into cobble and Darkwood ground (`gpu-kingsfield-3.png`, `gpu-darkwood-4.png`).  
**Fix:** Add a subtle additive glow disc under the player (like the lantern glow disc but white/pale gold, radius ~1.4, opacity 0.15-0.2). Reuse `radialTex('rgba(255,240,200,0.25)', 'rgba(255,240,200,0)')` at `playerMesh.position`. Also consider a thin bright rim-light on the knight material (emissive 0.08 on the character's MeshStandardMaterial). This is a single `THREE.Sprite` parented to the player.  
**Target:** Knight silhouette readable on cobble at zoom 2.0 in both maps.

### 2. Raise Darkwood fill light (HIGH impact, ~30min)
**Problem:** Props are silhouettes in Darkwood (`gpu-darkwood-2.png` farmstead, `gpu-darkwood-4.png` ford).  
**Fix:** In `MAPS.darkwood.look`: raise `ambientIntensity` from 0.75 to 0.95, `hemiIntensity` from 0.7 to 0.85, and add a slight warm fill by shifting `hemiGround` from `0x16261a` to `0x2a3a28`. Increase lantern `intensity` from 15 to 20 so they punch through the ambient. The shrine clearing (`gpu-darkwood-3.png`) already looks good with lanterns -- extend that to the whole map.  
**Target:** Props show material detail at zoom 1.5 without washing out the moonlit mood.

### 3. Increase tuft density 2-3x in open meadows (MEDIUM impact, ~1h)
**Problem:** Open grass areas look sparse (`gpu-kingsfield-2.png` lower half, `gpu-darkwood-1.png`).  
**Fix:** In `generate-kingsfield.mjs` and `generate-darkwood.mjs`, increase the `scatterTufts` count for the full-world pass from ~3,800/3,300 to ~7,500/6,500 (or switch from a fixed count to a density like 1.5 tufts/m^2 in the `scatterTufts` region). The instanced mesh cost at 8,000 instances is ~0.1ms. Reduce scale range from `[0.7, 1.3]` to `[0.5, 1.0]` so individual tufts are smaller and the coverage reads as denser.  
**Budget:** Profile with `node tools/playtest.mjs profile` to confirm <1ms cost at 8K instances.

### 4. Tighten cobble tile UV scale (MEDIUM impact, ~20min)
**Problem:** Cobble stones are too large at the current tile ratio (`gpu-kingsfield-3.png` plaza).  
**Fix:** In `MAPS.kingsfield.terrain`, change `layerScale[3]` (cobble) from `2.3` to `3.5`. This makes each cobble stone ~60% of its current size, closer to the D3 scale. Also tweak Darkwood's `layerScale[3]` (moss) from `1.2` to `1.6` to tighten the moss patches.  
**Verify:** Re-shoot `gpu-kingsfield-3.png` spot and compare.

### 5. Water edge softening (MEDIUM impact, ~2-3h)
**Problem:** Stream tiles have hard rectangular edges (`gpu-kingsfield-1.png`, `gpu-darkwood-4.png`).  
**Fix:** Replace the stream tile meshes with a custom geometry that has a 0.3-unit feathered alpha edge on both sides. Set the material to `transparent: true, depthWrite: false, alphaTest: 0` and paint the edge opacity into vertex colour alpha (1.0 at centre, 0.0 at edge). Add 3-4 small foam sprite decals at the ford crossing (`MapBuilder.decal('foam', x, z)`).  
**Alternative (quicker):** Double the reed tuft density along stream banks (`bankTufts` scale up by 2x) to hide the edge with vegetation. This avoids custom geometry.

### 6. Double decal density in the plaza and keeps (LOW-MEDIUM impact, ~1h)
**Problem:** Large bare cobble areas in the plaza (`gpu-kingsfield-3.png`).  
**Fix:** In `generate-kingsfield.mjs`, increase `scatterDecals('cobble_patch', ...)` count in the plaza region by 2x (and stagger them to avoid overlap). Add 2-3 more `scatterDecals('rubble', ...)` calls in the keep regions. Add `scatterDecals('bare_soil', ...)` under building footprints.  
**Target:** No 5x5m area of cobble without at least one decal.

### 7. Macro variation noise fix (LOW impact, ~30min)
**Problem:** The macro brightness modulator creates low-frequency banding on Kingsfield cobble (`gpu-kingsfield-3.png` bottom half shows subtle horizontal light/dark stripes).  
**Fix:** In `makeGroundMaterial`, change the macro UV rotation angle to break the axis alignment: replace `vec2(vMapUv.x * 0.11 + vMapUv.y * 0.07, vMapUv.y * 0.11 - vMapUv.x * 0.07)` with `vec2(vMapUv.x * 0.091 + vMapUv.y * 0.113, vMapUv.y * 0.091 - vMapUv.x * 0.067)` (more irrational ratio avoids axis-aligned repeats). Also reduce the modulation range from `0.82 + macro * 0.42` to `0.86 + macro * 0.32` to soften the contrast.

### 8. AO at smaller radius (LOW impact, ~2h investigation)
**Problem:** GTAOPass blackens whole props at this scene scale (`gpu-ao-kingsfield-1.png`).  
**Fix:** Try `GTAOPass` with `radius: 0.3` (down from whatever default, likely 2-5), `thickness: 0.1`, `samples: 8`. The issue is likely the kernel radius being larger than small props. If it still blackens, try `N8AOPostPass` from `postprocessing` (more stable at small radii). Test on the blacksmith yard shot.  
**Fallback:** If no SSAO works at this scale, the contact-shadow discs are sufficient for grounding -- but the scene will never match D3's depth.

---

## 4. Broken / suspect in the captures

| Issue | Capture | Details |
|-------|---------|---------|
| **Stream hard edges** | `gpu-kingsfield-1.png`, `gpu-darkwood-4.png` | Water tiles meet the ground in a razor-sharp rectangle. Not a bug per se (acknowledged in PLAN.md 15.4) but visually jarring. |
| **AO blackening** | `gpu-ao-kingsfield-1.png`, `gpu-ao-kingsfield-2.png` | Entire forge building and adjacent props rendered as black silhouettes. The GTAO kernel is too large for the scene scale. AO is correctly disabled in the current build. |
| **Darkwood ford too dark** | `gpu-darkwood-4.png` | The knight is nearly invisible against the dark cobble road at the ford. The water tiles are also very dark. This is a lighting issue, not a bug, but it would cause gameplay deaths from invisible enemies. |
| **Macro banding on cobble** | `gpu-kingsfield-3.png` | Subtle horizontal light/dark stripes visible in the lower third of the plaza area. Caused by the macro variation UV sampling aligning with the cobble repeat. |
| **White fence in Darkwood** | `tint-darkwood-2.png` | Despite the retint pass, the farm fences at (-60,18) still read pale/blue-white against the dark green ground. The `retint-glb.mjs` warm shift may not have been strong enough on white-painted wood. |
| **Lantern post head scale** | `gpu-darkwood-1.png` | The lantern fixture head appears disproportionately large compared to the post body in the Darkwood village track shot. May need `tallFixture` scale from 1.6 to 1.4 units/m specifically for lanterns. |
| **Corn/pumpkin field z-fight flicker** | `tint-kingsfield-1.png` | Corn stalks at the border of two fence plots appear to overlap/intersect at the fence rail height. Not a z-fight (different meshes) but visually cluttered at the plot boundary. Wider spacing between adjacent plot fences would fix it. |
| **Knight shadow vs contact shadow** | `gpu-kingsfield-3.png` | The knight's cast shadow and the contact-shadow disc under obstacles both render, which is correct, but the knight has no contact shadow disc of its own, making them look "floating" while obstacles look grounded. Adding the hero glow disc (#1 above) would also solve this. |

---

## Summary

The look pass took the game from a 3/10 programmer-art placeholder to a 6.5/10 "credible indie ARPG". The splat-painted terrain, warm/cold per-map lighting, grass tufts, decals, and prop rescale are all solid foundations. The top priority is readability: the knight needs a glow disc or contact highlight before the next playtest. After that, raising Darkwood's fill light and increasing tuft density will close another point toward the reference games. The AO issue is a known limitation that would take investigation time; the contact shadows are an acceptable substitute.

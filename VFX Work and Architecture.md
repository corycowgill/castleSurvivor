# VFX System — Work Log & Architecture Reference

## New Files
- **`vfx.js`** (1,722 lines) — Complete VFX engine module, imported into index.html

## Architecture

### Phase 15 — Procedural Texture Atlas (14 textures)
softCircle, hardCircle, spark, star, streak, smoke, flame, flash, burst, bloodSplat, bloodDrop, dust, gradient, ring — all generated via Canvas2D at runtime, colored by materials.

### Phase 4 — GPU Particle Engine
- `ParticleGroup` class using `THREE.Points` + custom vertex/fragment shaders
- Per-particle attributes: position, velocity, acceleration, gravity, drag, lifetime, size lerp, opacity lerp, color lerp, rotation, floor bounce
- Lazy-created groups by texture + blending mode, max 600 particles each
- 12 preset emitters: sparks, embers, blood, dust, magic, heal, xp, fire, frost, poison, smoke, streaks

### Phase 5 — Weapon Trail System
- `WeaponTrail` class with ribbon geometry (base + tip tracking per frame)
- Custom shader: gradient fade along length + edge fade
- 7 trail style presets: sword, axe, spear, club, magic, boss, dragon

### Phase 3 — VFX Socket System
- Bone mapping layer: HEAD, CHEST, LEFT/RIGHT_HAND, LEFT/RIGHT_FOOT, HIPS
- Supports varying bone names across Trellis-generated character models
- `findBone(mesh, socketName)` and `getSocketWorldPos(mesh, socketName)` helpers

### Phase 2 — VFXManager (semantic API)
Centralized `vfx.*` calls used by gameplay code:

**Combat:**
- `meleeSwing(characterMesh, weaponType)` — starts weapon trail
- `updateTrail(characterMesh)` — called each frame during attack anim
- `meleeImpact(position, normal, type)` — flash + sparks + dust + dynamic light
- `bloodImpact(position, direction, strength)` — directional blood particles + mist + ground decal

**Ranged:**
- `projectileTrail(projectile, type)` — streak particles behind arrows/daggers

**Enemy Death:**
- `enemyDeath(position, type)` — type-specific VFX (goblin/wolf/ogre/boss/dragonOgre) with blood, sparks, flash, dust, shockwave for bosses

**Magic / Abilities:**
- `fireball(origin, target)`, `explosion(position, size)`, `lightning(start, end)`
- `heal(characterMesh)`, `auraPulse(position, radius, color)`

**Power-up Auras (persistent):**
- `attackBoost`, `rangedBoost`, `attackSpeedBoost`, `movementSpeedBoost`, `defenseBoost`, `xpBoost`
- `removeBoost(characterMesh, type)` — removes a specific aura
- Defense boost uses a Fresnel shield shader with animated noise + hit flash

**Boss-specific:**
- `bossSlam(position)` — shockwave + dust + sparks + flash + light + ground decal
- `bossFireBreath(position, direction)` — fire + embers + dynamic light
- `bossTelegraph(position, radius, duration)` — growing warning circle + particles

**Misc:**
- `levelUp(characterMesh)` — magic burst + sparks + shockwave + light
- `dashEffect(characterMesh, dirX, dirZ)` — motion streaks + dust
- `collectEffect(position, type)` — coin/food/chest/health/speed pickup VFX
- `shieldHit(characterMesh)` — flashes the defense shield

### Phase 6 — Impact Flash System
Sprite-based impact flashes with size expansion + fade animation.

### Phase 10 — Decal System
Ground decals (blood, scorch, etc.) with 15s lifetime, max 60 active, fade-out in last 3 seconds. Oldest recycled when at cap.

### Phase 11 — Dynamic VFX Lighting
Pooled PointLights (max 6) with quadratic intensity falloff. Reused from pool when available.

### Phase 8 — Shockwave System
Ring geometry shockwaves that expand and fade. Also used for boss telegraphs.

### Phase 9 — Power-up Aura System
`activeAuras` Map tracks persistent effects per character mesh. Supports:
- Particle-emitting auras (attack boost, speed, xp) via configurable `particleInterval` + `particlePreset`
- Mesh-based auras (defense shield) with custom Fresnel shader

### Phase 12 — Post-Processing (in index.html)
- `EffectComposer` with `RenderPass` → `UnrealBloomPass` → `DamageFlashShader` → `OutputPass`
- Bloom: strength 0.4, radius 0.3, threshold 0.85 (only bright emissive things bloom)
- Damage flash: red overlay that fades over ~0.3s, triggered on player hit
- Low-health vignette: red border when HP < 30%, intensity scales with how low

### Phase 16 — Quality Settings
Three levels: LOW / MEDIUM / HIGH controlling:
- `particleMul` — multiplier on particle counts (0.3 / 0.7 / 1.0)
- `trailRes` — weapon trail vertex count (4 / 8 / 16)
- `maxDecals` — ground decal limit (10 / 30 / 60)
- `maxLights` — dynamic VFX light limit (2 / 4 / 6)
- `bloom` — enable/disable bloom pass
- `envParticles` — enable/disable environment particles

## Integration Points (28 hooks in index.html)

| Location | VFX Call | What It Replaced |
|---|---|---|
| Melee attack trigger | `vfx.meleeSwing()` | (new) |
| Game loop during attack | `vfx.updateTrail()` | (new) |
| `damageEnemy()` | `vfx.meleeImpact()` + `vfx.bloodImpact()` | (new) |
| Enemy death | `vfx.enemyDeath()` | (enhances existing death particles) |
| Projectile update loop | `vfx.projectileTrail()` | (new) |
| Holy Aura pulse | `vfx.auraPulse()` | Inline RingGeometry + rAF fade |
| Level-up shockwave | `vfx.levelUp()` | Inline RingGeometry + rAF expand |
| Boss boulder telegraph | `vfx.bossTelegraph()` | (new, adds to existing warning ring) |
| Boss boulder impact | `vfx.bossSlam()` | Inline crater + shockwave + debris meshes |
| Coin/food pickup | `vfx.collectEffect()` | (new) |
| Chest/health/speed powerup | `vfx.collectEffect()` | (new) |
| Speed powerup active | `vfx.movementSpeedBoost()` | (new) |
| Speed powerup expire | `vfx.removeBoost()` | (new) |
| Dash | `vfx.dashEffect()` | (new) |
| Player hit (melee) | `triggerDamageFlash()` | (new post-process) |
| Player hit (boulder) | `triggerDamageFlash()` | (new post-process) |
| Game loop | `vfx.update(dt)` | (new) |
| Render | `composer.render()` | `renderer.render(scene, camera)` |
| Window resize | `composer.setSize()` + `bloomPass.resolution.set()` | (new) |

## Key Design Decisions
- VFX module receives `THREE`, `scene`, `camera`, `renderer` as params (no global dependency)
- Gameplay code calls semantic methods (`vfx.meleeImpact`) not particle constructors
- Existing death particle system (`spawnDeathParticles`) kept alongside new VFX (layered enhancement)
- All procedural textures — no external image files needed
- Object pooling for lights and damage number sprites
- Instanced GPU particles via custom shaders (not individual meshes)

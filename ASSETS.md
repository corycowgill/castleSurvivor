# Castle Survivor - 3D Asset Inventory

All GLB files are located in `Game3DAssets/`

## Characters

| # | Key | Name | Filename | Description |
|---|-----|------|----------|-------------|
| 1 | brennanKnight | Brennan Knight | `brennanKingtFinal.glb` | Player character - Brennan (rigged + animated) |
| 2 | parkerKnight | Parker Knight | `parkerKnightFinal.glb` | Player character - Parker (rigged + animated) |
| 3 | dadKnight | Dad Knight | `dadKnightFinal.glb` | Player character - Dad (rigged + animated) |
| 4 | brennwrig | Brennan (old) | `brennwrig.glb` | Older Brennan rig (used for character select preview) |
| 5 | parkerwrig | Parker (old) | `parkerwrig.glb` | Older Parker rig (used for character select preview) |
| 6 | dadwrig | Dad (old) | `dadwrig.glb` | Older Dad rig (used for character select preview) |
| 7 | dadKnightRigged | Dad Rigged | `dadKnightRigged.glb` | Intermediate Dad rig |
| 8 | knightAnims | Knight Animations | `knightWithAnimations.glb` | Shared knight animation source |

## Enemies

| # | Key | Name | Filename | Description |
|---|-----|------|----------|-------------|
| 9 | goblin | Goblin | `goblineWithAnimations.glb` | Basic melee enemy (rigged + animated) |
| 10 | ogre | Ogre | `orgreWithAnimations.glb` | Heavy melee enemy + boss base (rigged + animated) |
| 11 | wolf | Wolf | `wolfWithAnimation.glb` | Fast pack enemy (rigged + animated) |
| 12 | dragonOgre | Dragon Ogre | `dragonOgreHybridBossWithAnimation.glb` | Boss enemy - throws boulders (rigged + animated) |
| 13 | bat | Bat | `batWithAnimation.glb` | Flying swarm enemy (Flap/Glide/Idle/Rest_Pose/Walk anims) |

## Structures

| # | Key | Name | Filename | Description |
|---|-----|------|----------|-------------|
| 14 | humanCastle | Human Castle | `HumanCastle.glb` | Player's castle/base structure |
| 15 | ogreCastle | Ogre Castle | `OrgreCastle.glb` | Enemy castle structure |
| 16 | house | Peasant House | `peasntHouse1WithMesh_00001_.glb` | Small residential building |
| 17 | farmHouse | Farm House | `farmHouse.glb` | Rural farm building |
| 18 | blacksmith | Blacksmith | `blacksmithBuilding.glb` | Blacksmith shop building |
| 19 | apothecary | Apothecary | `apothecaryBuilding.glb` | Potion/herb shop building |
| 20 | tavern | Tavern | `tavernBuilding.glb` | Tavern building variant 1 |
| 21 | tavern2 | Tavern (Alt) | `tavernBuilding_2.glb` | Tavern building variant 2 |
| 22 | horseStable | Horse Stable | `horseStable.glb` | Stable structure |

## Props

| # | Key | Name | Filename | Description |
|---|-----|------|----------|-------------|
| 23 | wall | Stone Wall | `sonteWallWithMesh_00001_.glb` | Defensive wall segment (solid obstacle) |
| 24 | barrel | Barrel | `barrelWithMesh_00001_.glb` | Decorative barrel (solid obstacle) |
| 25 | boulder | Boulder | `boulder.glb` | Rock prop (solid obstacle) + boss projectile |
| 26 | townStatue | Town Statue | `townStatue.glb` | Decorative statue (solid obstacle) |
| 27 | horseCart | Horse Cart | `horseCart.glb` | Cart prop (solid obstacle) |
| 28 | horse | Horse | `horse.glb` | Horse prop (solid obstacle) |

## Nature

| # | Key | Name | Filename | Description |
|---|-----|------|----------|-------------|
| 29 | pineTree | Pine Tree | `pineTree.glb` | Tree (solid obstacle) |
| 30 | shrubbery | Shrubbery | `shrubbery.glb` | Decorative bush (passable) |
| 31 | pumpkinPatch | Pumpkin Patch | `pumpkingPatch.glb` | Pumpkin decoration (passable) |
| 32 | cornTile | Corn Field | `cornTile.glb` | Corn crop tile (passable) |

## Terrain

| # | Key | Name | Filename | Description |
|---|-----|------|----------|-------------|
| 33 | grass | Grass Tile | `grassTile1WithMesh_00001_.glb` | Ground cover tile (placed in 8x8 grid) |
| 34 | road | Road Tile | `roadTile1WithMesh_00001_.glb` | Road surface tile |
| 35 | stream | Stream Tile | `streamTile.glb` | Water stream tile |

## Pickups

| # | Key | Name | Filename | Description |
|---|-----|------|----------|-------------|
| 36 | chest | Treasure Chest | `treasure_chestWithMesh_00001_.glb` | Loot chest pickup |
| 37 | coin | Coin | `coinWithMesh_00001_.glb` | Currency pickup |
| 38 | food | Food | `foodWithMesh_00001_.glb` | Health restore pickup |
| 39 | healthPowerup | Health Powerup | `healthPowerup.glb` | HP boost powerup |
| 40 | speedPowerup | Speed Powerup | `speedPowerup.glb` | Movement speed powerup |

## Weapons

| # | Key | Name | Filename | Description |
|---|-----|------|----------|-------------|
| 41 | sword | Sword | `swordWithMesh_00001_.glb` | Player melee weapon (attached to hand bone) |
| 42 | club | Club | `clubWithMesh_00001_.glb` | Ogre/boss weapon (attached to hand bone) |
| 43 | dagger | Dagger | `daggerWithMesh_00001_.glb` | Goblin weapon + thrown projectile |
| 44 | bow | Bow | `bow.glb` | Ranged weapon model |
| 45 | arrow | Arrow | `arros.glb` | Arrow projectile model |

## Notes

- All filenames with typos (`goblineWithAnimations`, `orgreWithAnimations`, `peasntHouse1`, `sonteWall`, `arros`, `pumpkingPatch`) are the real filenames from the original asset creation
- All GLBs have been optimized with Draco mesh compression, WebP texture conversion, and texture resizing (character models max 2048px, everything else max 1024px)
- Enemy models use `keepBuffer: true` so they can be parsed fresh for each spawn via `loader.parse()`

/**
 * One-shot: append the Emberreach (ogre homeland / volcano) assets to the catalog
 * as batches 9 and 10. Idempotent — re-running replaces the entries in place
 * rather than duplicating them, so a prompt can be edited and the asset re-run.
 *
 *   node AssetFactory/scripts/add-emberreach-assets.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.resolve(__dirname, '..', 'catalog', 'assets.json');

// game: scaleMeters, collision ('box'|'cylinder'|'none'), solid, breakable, health
const V = (id, name, metres, promptDetails, game = {}, batch = 9) => ({
  id, name, category: 'volcanic', family: 'rock', promptTemplate: 'VOLCANIC', promptDetails,
  status: 'pending', batch,
  game: { scaleMeters: metres, collision: 'box', solid: true, breakable: false, spawnWeight: 4, maxCluster: 2, ...game },
  placement: { near: [], avoid: [] },
});
const O = (id, name, metres, promptDetails, game = {}, batch = 9, template = 'OGRE') => ({
  id, name, category: 'ogre_camp', family: 'ogre', promptTemplate: template, promptDetails,
  status: 'pending', batch,
  game: { scaleMeters: metres, collision: 'box', solid: true, breakable: false, spawnWeight: 3, maxCluster: 2, ...game },
  placement: { near: ['ogreCastle'], avoid: [] },
});
const L = (id, name, metres, promptDetails, template = 'BUILDING') => ({
  id, name, category: 'landmarks', family: 'landmark', promptTemplate: template, promptDetails,
  status: 'pending', batch: 10,
  game: { scaleMeters: metres, collision: 'cylinder', solid: true, breakable: false, spawnWeight: 1, maxCluster: 1 },
  placement: { near: [], avoid: [] },
});

const NEW = [
  // ── Batch 9: volcanic terrain ────────────────────────────────────────────
  V('volcanic_spire_01', 'Basalt Spire', 5.0,
    'A tall jagged spire of columnar basalt thrusting straight up out of the ground, narrowing to a broken point. Hexagonal column facets down the sides, pale ash caught in the crevices, a few thin orange fissures near the base. Approximately 5 meters tall.',
    { collision: 'cylinder', spawnWeight: 3, maxCluster: 1 }),
  V('volcanic_spire_02', 'Basalt Spire (Variant B)', 3.5,
    'A leaning wedge of broken black basalt, snapped off at an angle with a sheared flat face and a rubble skirt at its foot. Rough crusted rock, ash dusted, one deep orange-glowing crack up the leaning side. Approximately 3.5 meters tall.',
    { collision: 'cylinder', spawnWeight: 4, maxCluster: 2 }),
  V('volcanic_rock_cluster_01', 'Basalt Cluster', 1.6,
    'A compact cluster of five or six angular black basalt chunks of different sizes heaped together, sharp fractured faces, grey ash settled between them. Approximately 1.6 meters tall.',
    { spawnWeight: 8, maxCluster: 3 }),
  V('volcanic_boulder_01', 'Volcanic Boulder', 2.4,
    'A single big rounded boulder of dark volcanic rock, pocked and bubbled like cooled lava, split by one wide crack that glows orange deep inside. Ash dusted on top. Approximately 2.4 meters tall.',
    { collision: 'cylinder', spawnWeight: 5, maxCluster: 1 }),
  V('volcanic_lava_rock_01', 'Glowing Lava Rock', 1.2,
    'A knee-high slab of black crusted lava rock broken into plates, with a web of bright orange glowing fissures running between the plates like cracked embers in a fireplace. Approximately 1.2 meters tall.',
    { spawnWeight: 7, maxCluster: 3 }),
  V('volcanic_vent_01', 'Fumarole Vent', 1.6,
    'A small squat volcanic vent cone: a ring of crusted yellow-stained rock built up around a dark open hole in the middle, the rim caked in pale sulphur, the throat glowing dull orange. No smoke plume. Approximately 1.6 meters tall.',
    { collision: 'cylinder', spawnWeight: 4, maxCluster: 1 }),
  V('volcanic_obsidian_shards_01', 'Obsidian Shards', 2.0,
    'A cluster of tall sharp shards of glossy black obsidian jutting up out of a low rocky base at different angles, like broken black glass blades. Deep black with hard bright highlights along the edges. Approximately 2 meters tall.',
    { spawnWeight: 5, maxCluster: 2 }),
  V('volcanic_ash_mound_01', 'Ash Drift', 1.0,
    'A low soft drift of pale grey volcanic ash piled up like a snow bank, smooth wind-rippled surface, with two or three dark rocks half buried in it. Approximately 1 meter tall.',
    { collision: 'none', solid: false, spawnWeight: 8, maxCluster: 3 }),
  V('volcanic_sulfur_crust_01', 'Sulfur Crust', 0.6,
    'A low crusty patch of bright yellow sulphur deposit built up over dark rock, knobbly and mineral, with pale white-yellow crystalline edges. Approximately 0.6 meters tall.',
    { collision: 'none', solid: false, spawnWeight: 7, maxCluster: 4 }),
  V('volcanic_crater_slab_01', 'Cracked Lava Slab', 1.4,
    'A wide flat slab of cooled black lava crust lying almost flat on the ground, broken into tilted plates with thin orange glowing seams between them, edges crumbling to cinder. Wider than it is tall. Approximately 1.4 meters wide and low to the ground.',
    { collision: 'none', solid: false, spawnWeight: 6, maxCluster: 2 }),

  // ── Batch 9: the ogre warcamp ────────────────────────────────────────────
  O('ogre_brazier_01', 'Ogre Brazier', 1.8,
    'A huge crude brazier: a heavy black iron bowl on three bent iron legs, heaped with glowing orange coals and charred wood. Riveted iron, soot-blackened, a bone charm hanging from one leg. Approximately 1.8 meters tall.',
    { collision: 'cylinder', spawnWeight: 4, maxCluster: 1 }),
  O('ogre_cook_pot_01', 'Ogre Cauldron', 2.2,
    'An enormous dented black iron cooking cauldron slung from a crude tripod of lashed timber over a bed of glowing coals. Thick iron rim, rivets, soup slopped down the side, a giant wooden ladle hooked on the rim. Approximately 2.2 meters tall.',
    { collision: 'cylinder', spawnWeight: 2, maxCluster: 1 }),
  O('ogre_totem_01', 'Ogre Skull Totem', 3.4,
    'A tall crude totem pole of rough dark timber, lashed with rawhide, mounted with stylized animal and goblin skulls and hung with feathers, teeth and strips of hide. Carved with harsh angular ogre marks daubed in red. Approximately 3.4 meters tall.',
    { collision: 'cylinder', breakable: true, health: 60, spawnWeight: 3, maxCluster: 1 }),
  O('ogre_bone_pile_01', 'Bone Heap', 1.1,
    'A heaped pile of big pale yellowed animal bones, ribs and leg bones, tossed together with one large cartoon-stylized horned skull on top. Clean dry bones, no blood, no gore. Approximately 1.1 meters tall.',
    { solid: false, breakable: true, health: 20, spawnWeight: 6, maxCluster: 3 }),
  O('ogre_spike_wall_01', 'Ogre Stake Wall', 2.4,
    'A straight section of crude defensive wall made of thick tree trunks sharpened to points at the top, driven into the ground shoulder to shoulder and lashed together with two horizontal rails of rope-bound timber. Scorched and weathered. A straight modular segment with clean flat ends. Approximately 2.4 meters tall.',
    { spawnWeight: 4, maxCluster: 1 }),
  O('ogre_banner_01', 'Ogre War Banner', 3.8,
    'A tall crude banner pole of rough timber topped with a stylized iron skull finial, flying a big ragged torn banner of dark red hide with a harsh angular ogre rune daubed on it in black. Rope lashings, tattered edges. Approximately 3.8 meters tall.',
    { collision: 'cylinder', breakable: true, health: 30, spawnWeight: 4, maxCluster: 1 }),
  O('ogre_cage_01', 'Ogre Prisoner Cage', 2.6,
    'A big crude cage of thick timber bars bound with black iron bands and rope, roughly cube shaped on a plank floor, with a heavy barred door held shut by an oversized iron padlock. Empty. Weathered scorched wood. Approximately 2.6 meters tall.',
    { breakable: true, health: 80, spawnWeight: 3, maxCluster: 1 }),
  O('ogre_butcher_block_01', 'Ogre Butcher Block', 1.2,
    'A massive chopping block cut from a single tree trunk, deeply scarred and hacked across the top, with an oversized rusty iron cleaver buried in it and a coil of rope at the base. No blood, no meat. Approximately 1.2 meters tall.',
    { breakable: true, health: 40, spawnWeight: 4, maxCluster: 1 }),
  O('ogre_weapon_rack_01', 'Ogre Weapon Rack', 2.0,
    'A crude A-frame rack of lashed timber holding oversized ogre weapons: two huge knobbly wooden clubs, a rusty iron cleaver and a spiked maul, plus a battered round hide shield leaning against the foot. Approximately 2 meters tall.',
    { breakable: true, health: 40, spawnWeight: 4, maxCluster: 1 }),
  O('ogre_hut_01', 'Ogre Hide Hut', 4.5,
    'A large crude ogre dwelling: a domed frame of huge curved bones and rough timber poles lashed together and covered with stitched brown animal hides, a low dark doorway hung with a hide flap, skulls and antlers fixed above it, a crooked stone chimney at the back. Approximately 4.5 meters tall.',
    { collision: 'cylinder', spawnWeight: 1, maxCluster: 1 }, 9, 'BUILDING'),

  // ── Batch 10: camp detail and hero pieces ────────────────────────────────
  O('ogre_forge_01', 'Ogre Slag Forge', 2.6,
    'A brutal open forge built of stacked black basalt blocks and iron plate, its firebox packed with glowing orange coals, a huge crude bellows of hide and timber strapped to one side and a soot-stained iron chimney hood above. Slag and cinder heaped at the base. Approximately 2.6 meters tall.',
    { collision: 'cylinder', spawnWeight: 2, maxCluster: 1 }, 10),
  O('ogre_barricade_01', 'Ogre Iron Barricade', 1.8,
    'A crude portable barricade: a heavy frame of rough timber crossed with black iron bars and bristling with outward-pointing iron spikes, braced by two angled legs, bound with rope and chain. Approximately 1.8 meters tall.',
    { breakable: true, health: 60, spawnWeight: 5, maxCluster: 2 }, 10),
  O('ogre_skull_pile_01', 'Skull Cairn', 1.4,
    'A cairn of stylized pale skulls stacked into a rough pyramid on a base of dark volcanic stones, bound with a strand of rope and topped with one large horned skull. Clean dry bone, cartoon fantasy style, no blood, no gore. Approximately 1.4 meters tall.',
    { breakable: true, health: 30, spawnWeight: 4, maxCluster: 2 }, 10),
  { id: 'burnt_tree_giant_01', name: 'Great Charred Tree', category: 'volcanic', family: 'tree',
    promptTemplate: 'DEADTREE', status: 'pending', batch: 10,
    promptDetails: 'An enormous ancient dead tree, burnt black, with a massive buttressed trunk and huge twisted clawing branches reaching upward and outward. Deeply fissured charred bark with pale ash-grey wood showing in the splits. Approximately 9 meters tall.',
    game: { scaleMeters: 9, collision: 'cylinder', solid: true, breakable: false, spawnWeight: 2, maxCluster: 1 },
    placement: { near: [], avoid: [] } },
  L('landmark_ogre_gate', 'The Black Gate', 14,
    'A colossal fortress gateway built by ogres: two massive square towers of rough black basalt blocks flanking a huge pair of iron-banded timber doors, the lintel mounted with giant horned skulls, iron spikes along the battlements, tattered red banners hanging either side. Scorched, battle-scarred, monumental. Approximately 14 meters tall.'),
  L('landmark_volcano_cone_01', 'Smoking Cone', 20,
    'A stylized volcano: a steep broad cone of near-black ash and basalt with a broken crater rim at the top glowing orange from within, and three bright orange lava channels running down its flanks and fading out before the base. Ash-grey streaks between the lava runs. A single solid mountain form, no smoke plume, no clouds, no surrounding landscape. Approximately 20 meters tall.',
    'TERRAIN'),
  L('landmark_obsidian_arch_01', 'Obsidian Arch', 10,
    'A natural arch of glossy black volcanic rock, two thick weathered legs meeting in a heavy span overhead, the stone faceted and glassy with sharp bright edge highlights and pale ash dusting the top of the span. Approximately 10 meters tall.',
    'VOLCANIC'),
  L('landmark_ogre_idol_01', 'Ogre Idol', 9,
    'A colossal crude idol carved from a single block of dark volcanic stone: a squat brutish ogre figure, seated, with a heavy jaw and tusks, oversized fists resting on its knees, harsh angular chisel marks all over it and glowing orange gemstones set in the eye sockets. Chipped, weathered, half sunk in ash. Approximately 9 meters tall.',
    'BUILDING'),
];

const assets = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const byId = new Map(assets.map((a, i) => [a.id, i]));
let added = 0, replaced = 0;
for (const entry of NEW) {
  if (byId.has(entry.id)) {
    const prev = assets[byId.get(entry.id)];
    // keep pipeline state so a completed asset is not re-run by accident
    assets[byId.get(entry.id)] = { ...entry, status: prev.status, ...(prev.glbGame ? { glbGame: prev.glbGame, glbRaw: prev.glbRaw, glbOptimized: prev.glbOptimized } : {}) };
    replaced++;
  } else {
    assets.push(entry); added++;
  }
}
fs.writeFileSync(CATALOG, JSON.stringify(assets, null, 2));
const counts = {};
for (const a of assets) counts[a.batch] = (counts[a.batch] || 0) + 1;
console.log(`catalog: +${added} new, ${replaced} updated, ${assets.length} total`);
console.log('per batch:', JSON.stringify(counts));

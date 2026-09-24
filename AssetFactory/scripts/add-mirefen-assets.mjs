/**
 * One-shot: append the Mirefen (drowned lowland / bog) assets to the catalog as
 * batches 11 and 12. Idempotent — re-running replaces the entries in place rather
 * than duplicating them, so a prompt can be edited and the asset re-run.
 *
 *   node AssetFactory/scripts/add-mirefen-assets.mjs
 *
 * Batch 11 is the swamp itself (cypress, reeds, rot) and batch 12 is the fen-folk
 * camp plus the three hero landmarks. The map generator asks for every one of these
 * through m.pick(), with an existing prop as the stand-in, so Mirefen plays from the
 * first commit and improves as meshes land.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.resolve(__dirname, '..', 'catalog', 'assets.json');

// game: scaleMeters, collision ('box'|'cylinder'|'none'), solid, breakable, health
const S = (id, name, metres, promptDetails, game = {}, batch = 11) => ({
  id, name, category: 'swamp', family: 'swamp', promptTemplate: 'SWAMP', promptDetails,
  status: 'pending', batch,
  game: { scaleMeters: metres, collision: 'box', solid: true, breakable: false, spawnWeight: 5, maxCluster: 2, ...game },
  placement: { near: [], avoid: [] },
});
const F = (id, name, metres, promptDetails, game = {}, batch = 12) => ({
  id, name, category: 'fen_camp', family: 'fenfolk', promptTemplate: 'FENFOLK', promptDetails,
  status: 'pending', batch,
  game: { scaleMeters: metres, collision: 'box', solid: true, breakable: false, spawnWeight: 3, maxCluster: 2, ...game },
  placement: { near: ['fen_stilt_hut_01'], avoid: [] },
});
const L = (id, name, metres, promptDetails, template = 'BUILDING') => ({
  id, name, category: 'landmarks', family: 'landmark', promptTemplate: template, promptDetails,
  status: 'pending', batch: 12,
  game: { scaleMeters: metres, collision: 'cylinder', solid: true, breakable: false, spawnWeight: 1, maxCluster: 1 },
  placement: { near: [], avoid: [] },
});

const NEW = [
  // ── Batch 11: the swamp itself ───────────────────────────────────────────
  S('swamp_cypress_01', 'Bald Cypress', 7.0,
    'A tall bald cypress tree with a hugely flared buttressed base that spreads out into the ground like melted wax, a straight tapering trunk, and a thin ragged crown of feathery dark green needles. Long grey beards of hanging moss droop from the lower limbs. Bark deeply furrowed and water-stained. Approximately 7 meters tall.',
    { collision: 'cylinder', spawnWeight: 6, maxCluster: 1 }),
  S('swamp_cypress_02', 'Leaning Cypress', 6.0,
    'A half-dead cypress leaning hard to one side, most of its crown gone, a few bare crooked limbs left with tattered moss hanging off them. The flared base is undercut and splitting, pale rot showing through the black bark. Approximately 6 meters tall.',
    { collision: 'cylinder', spawnWeight: 5, maxCluster: 1 }),
  S('swamp_mangrove_01', 'Mangrove Stilt Tree', 4.5,
    'A low spreading mangrove standing up on a tangled cage of arching stilt roots, so the trunk starts well above the ground. Dense glossy dark green leaves in a flattened crown, roots slick with algae and mud. Approximately 4.5 meters tall.',
    { collision: 'cylinder', spawnWeight: 6, maxCluster: 2 }),
  S('swamp_dead_willow_01', 'Drowned Willow', 6.5,
    'A dead willow, bark peeled to silver-grey bare wood, its long whip-thin branches sweeping down almost to the ground and hung with grey moss. No leaves. The base is swollen and black with rot. Approximately 6.5 meters tall.',
    { collision: 'cylinder', spawnWeight: 5, maxCluster: 1 }),
  S('swamp_moss_curtain_01', 'Hanging Moss', 3.0,
    'A single thick curtain of grey-green spanish moss hanging straight down from a short bare horizontal branch, like a ragged beard or a torn veil. Wispy at the bottom edge. Nothing else, no tree behind it. Approximately 3 meters tall.',
    { collision: 'none', solid: false, spawnWeight: 7, maxCluster: 2 }),
  S('swamp_reed_cluster_01', 'Reed Stand', 1.8,
    'A dense clump of tall straight swamp reeds, yellow-green stalks going brown at the tips, packed tight and splaying slightly outward at the top, rising from a base of dark mud. Approximately 1.8 meters tall.',
    { collision: 'none', solid: false, spawnWeight: 10, maxCluster: 4 }),
  S('swamp_cattail_clump_01', 'Cattails', 1.6,
    'A clump of cattail reeds with flat green blade leaves and eight or nine brown velvety sausage-shaped seed heads on thin stems at different heights. Approximately 1.6 meters tall.',
    { collision: 'none', solid: false, spawnWeight: 9, maxCluster: 3 }),
  S('swamp_lilypads_01', 'Lily Pads', 0.35,
    'A small raft of flat round green lily pads of different sizes lying edge to edge, one notched, two curling up at the rim, with a single closed pale pink bud on a short stalk. Seen as a floating cluster. Approximately 0.35 meters tall.',
    { collision: 'none', solid: false, spawnWeight: 8, maxCluster: 4 }),
  S('swamp_rotten_log_01', 'Rotten Log', 1.0,
    'A fallen log half rotted away, waterlogged and sagging in the middle, the bark sloughing off in sheets to show punky orange-brown rot underneath, the whole top face carpeted in bright green moss. Approximately 1 meter tall.',
    { spawnWeight: 8, maxCluster: 2 }),
  S('swamp_stump_mossy_01', 'Mossy Stump', 1.2,
    'A broad broken tree stump, the snapped top jagged and hollowed out, completely upholstered in thick green moss, with three or four cream-coloured shelf fungi stepping up one side. Approximately 1.2 meters tall.',
    { spawnWeight: 8, maxCluster: 2 }),
  S('swamp_fungus_shelf_01', 'Bracket Fungus', 0.9,
    'A stacked cluster of large bracket fungi, fat semicircular shelves in banded cream, rust orange and brown, growing out of a short piece of blackened rotten wood. Approximately 0.9 meters tall.',
    { collision: 'none', solid: false, spawnWeight: 7, maxCluster: 3 }),
  S('swamp_hummock_01', 'Peat Hummock', 1.2,
    'A low rounded mound of peat and moss rising out of the bog like a small grassy island, domed and soft-edged, its top shaggy with sedge grass and its flanks dark and damp. Approximately 1.2 meters tall.',
    { collision: 'none', solid: false, spawnWeight: 9, maxCluster: 3 }),
  S('swamp_bog_rock_01', 'Bog Boulder', 1.8,
    'A rounded grey boulder sunk into the ground at an angle, its upper half completely overgrown with thick green moss and small ferns, its lower half dark and wet with a pale water-stain line across it. Approximately 1.8 meters tall.',
    { collision: 'cylinder', spawnWeight: 6, maxCluster: 2 }),
  S('swamp_driftwood_01', 'Bleached Driftwood', 1.6,
    'A tangle of bone-white bleached driftwood: two or three smooth twisted root masses and broken branches heaped and interlocking, stripped of bark, weathered smooth and pale. Approximately 1.6 meters tall.',
    { spawnWeight: 7, maxCluster: 2 }),

  // ── Batch 12: the fen-folk camp ──────────────────────────────────────────
  F('fen_stilt_hut_01', 'Stilt Hut', 5.0,
    'A small one-room hut raised on four crooked wooden stilts well clear of the ground, with a steep thatched reed roof, walls of woven wicker and grey planks, and a short ladder of lashed poles leaning up to the doorway. Approximately 5 meters tall.',
    { collision: 'cylinder', spawnWeight: 2, maxCluster: 1 }),
  F('fen_fish_rack_01', 'Drying Rack', 2.2,
    'A simple A-frame rack of lashed poles with a horizontal bar, hung with a dozen split fish and long eels drying in a row, and a knotted net draped over one end. Approximately 2.2 meters tall.',
    { breakable: true, health: 30, spawnWeight: 4, maxCluster: 2 }),
  F('fen_coracle_01', 'Coracle', 1.4,
    'A small round one-person boat of hide stretched over a woven wicker frame, pulled up and tipped on its side, with a single short paddle leaning against it. Approximately 1.4 meters tall.',
    { spawnWeight: 4, maxCluster: 2 }),
  F('fen_wicker_trap_01', 'Eel Traps', 1.0,
    'A stack of three long conical woven wicker eel traps, open funnel mouths facing out, tied with cord, the willow withies gone grey and one basket sprung and unravelling. Approximately 1 meter tall.',
    { breakable: true, health: 20, spawnWeight: 6, maxCluster: 3 }),
  F('fen_boardwalk_01', 'Boardwalk Section', 0.4,
    'A short straight section of plank boardwalk: six or seven grey weathered boards laid across two low crossbeams, slightly uneven, with moss in the gaps between the planks. Seen as a single flat walkway piece. Approximately 0.4 meters tall.',
    { collision: 'none', solid: false, spawnWeight: 6, maxCluster: 4 }),
  F('fen_totem_01', 'Bog Totem', 3.0,
    'A tall crooked pole driven into the ground, wound with rope and hung with animal skulls, black feathers, twists of cloth and small carved wooden charms that dangle and turn. A larger horned skull is lashed at the top. Approximately 3 meters tall.',
    { collision: 'cylinder', breakable: true, health: 40, spawnWeight: 3, maxCluster: 1 }),
  F('fen_lantern_post_01', 'Fen Lantern', 2.4,
    'A leaning pole of weathered wood with a small glass-sided lantern hanging from an iron hook at the top. The lantern glows a cold sickly green from within, like a trapped marsh light. Approximately 2.4 meters tall.',
    { collision: 'cylinder', spawnWeight: 3, maxCluster: 1 }),
  F('fen_witch_hut_01', 'Bog Witch Hut', 5.5,
    'A larger hunched hut of mud-daubed wicker with a sagging thatch roof, a crooked chimney of stacked stones, bundles of dried herbs and bones hanging from the eaves, and a heavy hide curtain for a door. Approximately 5.5 meters tall.',
    { collision: 'cylinder', spawnWeight: 1, maxCluster: 1 }),
  S('swamp_wisp_stone_01', 'Wisp Stone', 1.6,
    'A weathered standing stone leaning out of the ground, its face cut with worn spiral runes that glow a cold pale green from deep inside the carved grooves. Moss creeps up the shaded side. Glowing from within the stone, not lighting its surroundings. Approximately 1.6 meters tall.',
    { collision: 'cylinder', spawnWeight: 3, maxCluster: 1 }, 12),

  // ── Batch 12: hero pieces ────────────────────────────────────────────────
  L('landmark_sunken_temple', 'Sunken Temple', 12.0,
    'A small ancient stone temple sunk crookedly into the ground up to its windows, tilted well off vertical, its columned portico half swallowed and its roof caved in at one corner. Pale weathered stone blackened with damp at the base, thick moss and creeping vine over the whole north face, carved reliefs worn almost smooth. Approximately 12 meters tall.'),
  L('landmark_great_cypress', 'The Great Cypress', 16.0,
    'A colossal ancient cypress, its buttressed base spreading into a wall of fluted roots wide enough to walk into, a vast gnarled trunk, and a broad crown of dark feathery needles hung with enormous curtains of grey moss. Approximately 16 meters tall.',
    'TREE'),
  L('landmark_drowned_bell_tower', 'Drowned Bell Tower', 14.0,
    'A square stone bell tower leaning at a steep angle, sunk to a third of its height, its upper belfry arches still open with a dark bell hanging crooked inside. Grey stone, green algae band around the sunken base, ivy up one side, the top courses crumbled away. Approximately 14 meters tall.'),
];

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf-8'));
const byId = new Map(catalog.map((a, i) => [a.id, i]));
let added = 0, replaced = 0;
for (const entry of NEW) {
  const at = byId.get(entry.id);
  if (at == null) { catalog.push(entry); added++; continue; }
  // Keep a status the pipeline already earned; only the prompt/metadata is refreshed.
  const prev = catalog[at];
  catalog[at] = { ...entry, status: prev.status === 'pending' ? 'pending' : prev.status };
  replaced++;
}
fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + '\n');
console.log(`mirefen: ${added} added, ${replaced} refreshed, catalog now ${catalog.length}`);
for (const b of [11, 12]) {
  const n = catalog.filter(a => a.batch === b).length;
  const todo = catalog.filter(a => a.batch === b && a.status === 'pending').length;
  console.log(`  batch ${b}: ${n} assets, ${todo} pending`);
}

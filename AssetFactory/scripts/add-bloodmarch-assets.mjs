/**
 * One-shot: append the Bloodmarch (war-torn battlefield) assets to the catalog as
 * batches 13 (the human side: castle, town and farms after the battle), 14 (the
 * orc fortress and camp, and the field between). Idempotent: re-running replaces
 * the entries in place, so a prompt can be edited and the asset re-run.
 *
 *   node AssetFactory/scripts/add-bloodmarch-assets.mjs
 *
 * Prompt templates WARRUIN (human, damaged), ORCRUIN (orc, damaged) and FIELD
 * (battle debris) carry the solid-closed-mass rule Mirefen taught us, plus a
 * no-fire rule: every fire on this map is VFX, so the meshes stay clean.
 * tools/generate-bloodmarch.mjs asks for each of these through m.pick() with an
 * existing prop behind it, so the map plays now and improves as meshes land.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.resolve(__dirname, '..', 'catalog', 'assets.json');

const mk = (category, family, template, batch) => (id, name, metres, promptDetails, game = {}) => ({
  id, name, category, family, promptTemplate: template, promptDetails,
  status: 'pending', batch,
  game: { scaleMeters: metres, collision: 'box', solid: true, breakable: false, spawnWeight: 3, maxCluster: 1, ...game },
  placement: { near: [], avoid: [] },
});
const H = mk('warfront_human', 'ruin', 'WARRUIN', 13);
const O = mk('warfront_orc', 'orc_ruin', 'ORCRUIN', 14);
const F = mk('warfront_field', 'debris', 'FIELD', 14);

const NEW = [
  // ── Batch 13: the human side after the battle ────────────────────────────
  H('war_house_ruin_01', 'Burnt-Out Cottage', 5.0,
    'A small stone-and-timber peasant cottage burnt out by fire: the thatch roof gone except for a charred sagging section at one end, the exposed roof beams black and thick, the walls sooted above every window, one corner of the wall fallen into a heap of stone. Approximately 5 meters tall.',
    { collision: 'box', spawnWeight: 6 }),
  H('war_house_ruin_02', 'Breached Cottage', 4.5,
    'A half-timbered village house with its whole front wall blown open into a ragged gap, the clay-tile roof caved in over the breach, plaster cracked away to show scorched timber framing, a heap of rubble spilling out of the gap. Approximately 4.5 meters tall.',
    { collision: 'box', spawnWeight: 6 }),
  H('war_tavern_ruin_01', 'Gutted Tavern', 7.0,
    'A two-storey timber-framed tavern gutted by fire, the upper floor and roof collapsed inward leaving a jagged black ridge of charred beams, the ground floor walls still standing with a heavy stone chimney intact at one end, the hanging tavern sign scorched. Approximately 7 meters tall.',
    { collision: 'box', spawnWeight: 3 }),
  H('war_barn_ruin_01', 'Collapsed Barn', 6.0,
    'A big wooden barn that has collapsed on one side, half the roof slid down to the ground in one heavy scorched slab of planks, the other half still up on blackened posts, hay-loft doors hanging open, walls scorched dark. Approximately 6 meters tall.',
    { collision: 'box', spawnWeight: 4 }),
  H('war_farmhouse_ruin_01', 'Scorched Farmhouse', 6.0,
    'A stone farmhouse with a burnt-through roof, only the thick blackened rafters and the stone gable ends left standing, one gable cracked and leaning, the low front porch smashed flat. Approximately 6 meters tall.',
    { collision: 'box', spawnWeight: 4 }),
  H('war_chapel_ruin_01', 'Ruined Chapel', 8.0,
    'A small stone village chapel with its roof burnt away, leaving the stone walls and a pointed bell gable standing open to the sky, one side wall breached into rubble, a round window cracked, soot streaking the pale stone. Approximately 8 meters tall.',
    { collision: 'box', spawnWeight: 1 }),
  H('war_castle_wall_01', 'Battered Curtain Wall', 6.0,
    'A straight segment of castle curtain wall built of heavy grey stone blocks, its crenellations half smashed away, deep gouges and cracks across the face, a burnt scaffold ladder against it as shallow relief. A long solid block. Approximately 6 meters tall.',
    { collision: 'box', spawnWeight: 8, maxCluster: 6 }),
  H('war_castle_wall_breach_01', 'Breached Wall', 6.0,
    'A segment of castle curtain wall with a great breach smashed through the middle of it, the two standing ends jagged and cracked, a wide low heap of broken stone blocks and mortar filling the gap between them. One solid mass. Approximately 6 meters tall.',
    { collision: 'box', spawnWeight: 4, maxCluster: 2 }),
  H('war_tower_ruin_01', 'Toppled Tower', 11.0,
    'A round castle tower of grey stone snapped off two-thirds of the way up, the top gone, the break jagged and leaning to one side, a long crack running down the wall, its arrow slits scorched black. Approximately 11 meters tall.',
    { collision: 'cylinder', spawnWeight: 2 }),
  H('war_gatehouse_ruin_01', 'Smashed Gatehouse', 12.0,
    'A castle gatehouse of two square stone towers flanking an arched gateway, the gate itself smashed inward and hanging from one hinge as one heavy slab, the battlements of one tower knocked off, the stone scorched and cracked around the arch. Approximately 12 meters tall.',
    { collision: 'box', spawnWeight: 1 }),
  H('war_market_stall_ruin_01', 'Smashed Market Stall', 2.6,
    'A wooden market stall knocked half over, its striped canvas awning torn and hanging as one heavy fold, the counter split, crates and a barrel crushed against it. Approximately 2.6 meters tall.',
    { collision: 'box', breakable: true, spawnWeight: 5 }),
  H('war_watchtower_wreck_01', 'Fallen Watchtower', 6.0,
    'A wooden village watchtower that has fallen over and lies on its side on the ground, its four heavy legs splayed and snapped, the lookout platform crushed at one end, the timber scorched. Approximately 6 meters long and 2.5 meters tall.',
    { collision: 'box', spawnWeight: 2 }),
  H('war_siege_tower_wreck_01', 'Burnt Siege Tower', 9.0,
    'A tall wooden siege tower on huge solid wheels, burnt black and leaning hard to one side, its top platform collapsed and the hide-covered front panels charred through in patches, thick heavy beams. Approximately 9 meters tall.',
    { collision: 'box', spawnWeight: 2 }),
  H('war_trebuchet_wreck_01', 'Broken Trebuchet', 7.0,
    'A wooden trebuchet with its throwing arm snapped in half and lying across the heavy timber frame, the counterweight box split open spilling stone, one wheel broken, scorch marks along the frame. Approximately 7 meters tall.',
    { collision: 'box', spawnWeight: 2 }),
  H('war_ballista_01', 'Ballista', 3.0,
    'A heavy wooden ballista on a stout four-legged stand, its thick bow arms and winch wound with rope, a bolt as long as a spear loaded in the groove, the wood scarred and muddy. Approximately 3 meters tall.',
    { collision: 'box', spawnWeight: 4 }),
  H('war_supply_wagon_wreck_01', 'Overturned Supply Wagon', 3.0,
    'A heavy covered supply wagon overturned onto its side, its canvas cover burnt away to the hoops, sacks and barrels spilled in a heap against it, one solid wheel snapped off and lying flat. Approximately 3 meters tall.',
    { collision: 'box', breakable: true, spawnWeight: 5 }),
  H('war_field_tent_01', 'Torn Army Tent', 3.5,
    'A soldiers\' canvas ridge tent of faded cream canvas with a blue and gold stripe, one side torn open in a long heavy flap and the ridge pole sagging, the canvas mud-splashed and scorched at one corner. Approximately 3.5 meters tall.',
    { collision: 'box', breakable: true, spawnWeight: 6, maxCluster: 3 }),
  H('war_command_tent_01', 'Command Pavilion', 5.5,
    'A large round command pavilion tent of blue and gold striped canvas with a peaked roof and a heavy pennant on top, one section of the roof collapsed inward and scorched, the entrance flap tied back. Approximately 5.5 meters tall.',
    { collision: 'cylinder', spawnWeight: 1 }),
  H('war_kingdom_banner_01', 'Tattered Kingdom Banner', 4.5,
    'A tall wooden banner pole planted in the ground flying a long tattered blue banner with a gold lion device, the cloth torn ragged along the bottom edge and hanging in heavy folds, the pole scorched. Approximately 4.5 meters tall.',
    { collision: 'none', solid: false, spawnWeight: 6, maxCluster: 2 }),
  H('war_knight_statue_fallen_01', 'Fallen Knight Statue', 3.0,
    'A grey stone statue of an armoured knight that has been knocked off its plinth and lies broken on the ground, the head and one arm snapped off and resting beside it, the empty cracked plinth behind. Approximately 3 meters long and 1.5 meters tall.',
    { collision: 'box', spawnWeight: 2 }),
  H('war_shield_pile_01', 'Heap of Shields', 1.3,
    'A heap of dented kite shields and round shields in faded blue, red and gold heraldry, with a few battered steel helmets and a broken sword among them, all piled together into one solid mound. Approximately 1.3 meters tall.',
    { collision: 'box', breakable: true, spawnWeight: 7, maxCluster: 3 }),

  // ── Batch 14: the orc fortress and camp ───────────────────────────────────
  O('orc_fortress_gate_ruin_01', 'Smashed Fortress Gate', 13.0,
    'The main gate of an orc fortress: two massive square towers of huge stacked logs bound with black iron bands and studded with spikes, a wide gateway between them whose great iron-plated doors have been smashed, one door lying flat and one hanging askew as a heavy slab, the tops of the towers burnt and one torn open. Approximately 13 meters tall.',
    { collision: 'box', spawnWeight: 1 }),
  O('orc_fortress_wall_01', 'Orc Palisade Wall', 6.0,
    'A straight segment of orc fortress wall made of huge sharpened logs standing upright side by side, bound across with two black iron bands, studded with spikes, the tops scorched and a few logs split. A long solid block. Approximately 6 meters tall.',
    { collision: 'box', spawnWeight: 8, maxCluster: 6 }),
  O('orc_fortress_wall_broken_01', 'Smashed Palisade', 5.0,
    'A segment of orc palisade wall of huge upright logs that has been smashed through, the logs in the middle snapped off short and leaning outward, burnt black, the iron band torn and bent, a heap of broken log ends at the base. One solid mass. Approximately 5 meters tall.',
    { collision: 'box', spawnWeight: 5, maxCluster: 2 }),
  O('orc_watchtower_01', 'Orc Watchtower', 9.0,
    'A crude orc watchtower of huge lashed logs, four thick splayed legs, a boxed lookout platform at the top walled with hide and iron plates, a heavy ladder as shallow relief on one leg, spikes and a skull on the corner posts. Approximately 9 meters tall.',
    { collision: 'box', spawnWeight: 3 }),
  O('orc_watchtower_broken_01', 'Burnt Watchtower', 7.0,
    'A crude orc log watchtower burnt and broken, its lookout box collapsed and hanging off one side, two legs snapped so the whole tower leans hard, the timber charred black. Approximately 7 meters tall.',
    { collision: 'box', spawnWeight: 3 }),
  O('orc_hut_ruin_01', 'Caved-In Orc Hut', 3.8,
    'A squat round orc hut of hide stretched over bone and log ribs, caved in on one side so the roof sags to the ground, the hide burnt through in a big ragged hole showing the charred ribs, a tusked skull over the low doorway. Approximately 3.8 meters tall.',
    { collision: 'cylinder', spawnWeight: 6, maxCluster: 2 }),
  O('orc_longhouse_01', 'Orc Longhouse', 6.5,
    'A long low orc hall built of massive logs with a ridged roof of overlapping hides weighted with stones, one end of the roof burnt away to the charred rafters, iron spikes along the ridge, a wide low doorway hung with a hide. Approximately 6.5 meters tall.',
    { collision: 'box', spawnWeight: 2 }),
  O('orc_war_drum_01', 'War Drum', 2.6,
    'A huge orc war drum, a fat barrel-shaped drum of black iron bands and stretched hide as tall as a man, standing on a crude timber frame, two heavy bone mallets resting against it, the hide scorched at one edge. Approximately 2.6 meters tall.',
    { collision: 'box', breakable: true, spawnWeight: 3 }),
  O('orc_catapult_wreck_01', 'Broken Catapult', 4.5,
    'A crude orc catapult of heavy logs and black iron, its throwing arm snapped and lying across the frame, the frame scorched and one solid wheel broken off, a pile of stone shot beside it as one lump. Approximately 4.5 meters tall.',
    { collision: 'box', spawnWeight: 3 }),
  O('orc_battering_ram_01', 'Battering Ram', 5.0,
    'A great orc battering ram: a huge log capped with a black iron head shaped like a snarling boar, slung under a heavy log frame on four solid wheels, the frame roofed with hides, scorched and dented. Approximately 5 meters long and 3 meters tall.',
    { collision: 'box', spawnWeight: 2 }),
  O('orc_war_banner_01', 'Orc War Banner', 4.5,
    'A tall crude banner pole of a stripped log with bone spikes, flying a long ragged banner of dark red hide painted with a white skull device, torn along the bottom and hanging in heavy folds, a skull on the pole top. Approximately 4.5 meters tall.',
    { collision: 'none', solid: false, spawnWeight: 6, maxCluster: 2 }),
  O('orc_spike_barricade_01', 'Iron Spike Barricade', 2.0,
    'A low orc barricade of a heavy log frame bristling with thick black iron spikes on all sides, bound with iron bands, scorched, one end smashed. Approximately 2 meters tall.',
    { collision: 'box', breakable: true, spawnWeight: 7, maxCluster: 3 }),
  O('orc_idol_broken_01', 'Toppled Orc Idol', 4.0,
    'A crude squat stone idol of a tusked orc god that has been toppled and lies tilted against a heap of broken stone, its head cracked off and resting beside it, painted with faded red war marks. Approximately 4 meters long and 2.5 meters tall.',
    { collision: 'box', spawnWeight: 1 }),
  O('orc_smithy_ruin_01', 'Wrecked Orc Smithy', 4.0,
    'A crude open-sided orc forge shed of logs and hide, its roof half collapsed, a big black iron forge hearth of stacked stone at the centre with a huge anvil in front, weapon blanks and a hammer as relief on the hearth, scorched all over. Approximately 4 meters tall.',
    { collision: 'box', spawnWeight: 1 }),
  O('orc_watch_fire_01', 'Iron Fire Basket', 2.2,
    'A big crude orc fire basket: a wide black iron bowl of riveted plates on three thick bent iron legs, heaped with charred logs and dark coals, spikes around the rim. Approximately 2.2 meters tall.',
    { collision: 'cylinder', spawnWeight: 8, maxCluster: 2 }),
  O('orc_loot_pile_01', 'Plunder Heap', 1.4,
    'A heap of plundered goods piled into one mound: a stolen blue and gold banner, an iron-bound chest, sacks, a dented helmet, a rolled tapestry and a few gold cups, all thrown together. Approximately 1.4 meters tall.',
    { collision: 'box', breakable: true, spawnWeight: 6, maxCluster: 3 }),
  O('orc_pen_01', 'Broken Wolf Pen', 2.4,
    'A small enclosure of crude thick stakes lashed together into a low fence, one side broken open and the stakes leaning, with a heavy hide shelter at the back, muddy and scorched. Approximately 2.4 meters tall.',
    { collision: 'box', spawnWeight: 2 }),

  // ── Batch 14: the field between ───────────────────────────────────────────
  F('field_crater_rim_01', 'Blast Crater', 1.0,
    'A shallow blast crater seen as a raised ring of thrown-up dark earth, broken stone and clods around a scorched black bowl, the whole thing one low solid mound. Approximately 1 meter tall and 6 meters across.',
    { collision: 'none', solid: false, spawnWeight: 8, maxCluster: 2 }),
  F('field_siege_boulder_01', 'Catapult Stone', 1.6,
    'A huge rough round catapult stone half sunk into churned earth where it landed, cracked across, the ground heaped up around it. Approximately 1.6 meters tall.',
    { collision: 'cylinder', spawnWeight: 7, maxCluster: 2 }),
  F('field_broken_ladder_01', 'Smashed Siege Ladder', 0.9,
    'A heavy wooden siege ladder snapped in two and lying flat on the ground, its thick rails and rungs splintered, scorched at one end. Approximately 4 meters long and 0.9 meters tall.',
    { collision: 'none', solid: false, spawnWeight: 6, maxCluster: 2 }),
  F('field_charred_beam_pile_01', 'Charred Beam Heap', 1.2,
    'A heap of thick charred roof beams and burnt planks collapsed together into one black mound, ends splintered, a few clay roof tiles mixed in. Approximately 1.2 meters tall.',
    { collision: 'box', breakable: true, spawnWeight: 8, maxCluster: 3 }),
  F('field_shield_wall_01', 'Planted Shield Wall', 1.6,
    'A row of five tall kite shields in faded blue and gold heraldry planted upright edge to edge in the mud as a barricade, dented and pierced by arrows shown as shallow relief, one shield fallen forward. One solid piece. Approximately 1.6 meters tall.',
    { collision: 'box', breakable: true, spawnWeight: 5, maxCluster: 2 }),
  F('field_grave_mound_01', 'Soldier\'s Cairn', 1.4,
    'A low mound of heaped earth and stones with a knight\'s sword planted upright in the top and a dented helmet hung on the hilt, a broken shield leaning against the side. Approximately 1.4 meters tall.',
    { collision: 'none', solid: false, spawnWeight: 5, maxCluster: 2 }),
  F('field_broken_cart_burnt_01', 'Burnt Wagon Wreck', 2.2,
    'The burnt-out wreck of a farm wagon, charred black, its bed collapsed and one side gone, two solid wheels still on and one lying flat beside it. Approximately 2.2 meters tall.',
    { collision: 'box', breakable: true, spawnWeight: 6, maxCluster: 2 }),
  F('field_sandbag_wall_01', 'Earthwork', 1.4,
    'A short defensive earthwork of stacked earth-filled sacks and sods reinforced with a few thick logs, one end blown apart and slumped, muddy. One solid mass. Approximately 1.4 meters tall.',
    { collision: 'box', spawnWeight: 6, maxCluster: 3 }),
];

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const byId = new Map(catalog.map((a, i) => [a.id, i]));
let added = 0, replaced = 0;
for (const a of NEW) {
  if (byId.has(a.id)) { const old = catalog[byId.get(a.id)]; catalog[byId.get(a.id)] = { ...old, ...a, status: old.status === 'glb_optimized' ? old.status : a.status }; replaced++; }
  else { catalog.push(a); added++; }
}
fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2));
console.log(`catalog: ${added} added, ${replaced} replaced, ${catalog.length} total`);
console.log('batch 13:', NEW.filter(a => a.batch === 13).length, ' batch 14:', NEW.filter(a => a.batch === 14).length);

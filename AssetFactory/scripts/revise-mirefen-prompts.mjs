/**
 * Second pass on the twelve Mirefen assets Trellis could not build.
 *
 *   node AssetFactory/scripts/revise-mirefen-prompts.mjs
 *
 * Every one of the seven splinter/empty results and all five that were skipped
 * after two failures asked for the SAME thing: thin, wispy, dangling, woven or
 * tangled geometry. Trellis 2 reconstructs that as a spray of slivers, which the
 * render check then rejects -- hanging moss beards, whip-thin willow branches,
 * open wicker weave, belfry arches, dangling charms, interlocking driftwood.
 *
 * So this is not a wording tweak. Each prompt is rewritten around ONE closed
 * chunky volume, with anything that would really be fine or hanging restated as
 * a heavy lump or as shallow relief on the solid form. The SWAMP and FENFOLK
 * templates carry the same rule now, so it applies to anything added later too.
 *
 * It also resets the seven that "succeeded" into a bad mesh back to pending
 * (the pipeline counts a GLB as done; only the render check knows better) and
 * drops all twelve from skipped.json, or batch_runner passes straight over them.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.resolve(__dirname, '..', 'catalog', 'assets.json');
const SKIPPED = path.resolve(__dirname, '..', 'catalog', 'skipped.json');

const REVISED = {
  // ── Splinters: the crown was asked for as foliage, so it came back as needles
  swamp_cypress_01:
    'A chunky stylized swamp tree. A hugely flared buttressed base spreading into the ground like melted wax, a short thick tapering trunk above it, and one single solid rounded canopy of dense dark green foliage read as one closed blob. Deeply furrowed water-stained bark. The canopy is a simple compact mass with a lumpy surface, not individual leaves. No hanging moss, no beards, no wispy strands, no thin twigs, no bare branches. Approximately 7 meters tall.',
  landmark_great_cypress:
    'A colossal ancient swamp tree. The base is a wall of thick fluted buttress roots wide enough to walk into, above that one vast gnarled trunk, and at the top a single broad solid dome of dense dark foliage as one closed mass with a lumpy surface. Massive, heavy and simple. No hanging moss, no curtains, no wispy strands, no thin twigs, no separate branches. Approximately 16 meters tall.',
  swamp_dead_willow_01:
    'A dead swamp tree stripped to bare silvered wood, with a swollen black rotting base and only four or five short THICK tapering limbs, each as chunky as an arm and ending in a blunt broken stub. Solid heavy wood throughout, like a carved club. No twigs, no fine branches, no hanging moss, no leaves. Approximately 6.5 meters tall.',
  swamp_moss_curtain_01:
    'A single dense clump of moss gathered into one thick rounded teardrop mass, hanging from a short stout stub of branch at the top, like a heavy grey-green hornet nest made of moss. One closed chunky volume with a soft lumpy quilted surface. No loose strands, no wisps, no thin fibres, no individual threads. Approximately 3 meters tall.',
  fen_totem_01:
    'A thick carved wooden totem post, squat and solid like a heavy tiki carving, with a large horned animal skull fixed flat against the top and simple carved geometric faces down the shaft. Two or three fat rope coils wound tight around it. Everything sits flush against the post so it reads as one solid column. No dangling charms, no feathers, no loose cloth, no hanging objects, no thin cords. Approximately 3 meters tall.',
  fen_wicker_trap_01:
    'One fat conical basket trap of woven willow lying on its side, CLOSED and solid, its weave shown only as shallow carved basketry texture on the surface rather than as open gaps, with a thick rope loop at the narrow end. A single chunky cone. No open lattice, no gaps, no holes, no visible weave openings, no thin strands. Approximately 1 meter tall.',
  landmark_drowned_bell_tower:
    'A squat square stone bell tower leaning at a steep angle and sunk to a third of its height, built as one solid heavy block of masonry with a simple pyramid cap. The belfry is shown as shallow recessed niches carved into the solid wall, NOT as openings. Grey weathered stone with a green algae band round the sunken base and ivy on one face. No open arches, no windows cut through, no thin columns, no hanging bell. Approximately 14 meters tall.',

  // ── Skipped after two failures each: same cause, the fine detail
  swamp_stump_mossy_01:
    'A broad solid tree stump with a jagged snapped top, completely upholstered in thick green moss, with three fat rounded shelf fungi attached flush to one side like thick lips. One chunky closed mass, heavy and simple. No thin edges, no gaps, no loose foliage, no roots. Approximately 1.2 meters tall.',
  swamp_fungus_shelf_01:
    'A stack of four large bracket fungi growing out of a short chunky piece of blackened rotten wood, each shelf a FAT rounded wedge several centimetres thick with a blunt rim, banded cream, rust orange and brown. Solid heavy forms like stacked stones. No thin edges, no papery gills, no delicate detail. Approximately 0.9 meters tall.',
  swamp_hummock_01:
    'A low solid dome of peat and moss rising out of the ground like a small island, smooth and rounded with soft edges, its top one continuous close-cropped mat of green moss and its flanks dark damp earth. A single simple closed mound. No individual grass blades, no stalks, no loose foliage. Approximately 1.2 meters tall.',
  swamp_bog_rock_01:
    'A large rounded grey boulder sunk into the ground at an angle, its upper half under a thick continuous blanket of green moss that follows the shape of the rock, its lower half dark and wet with a pale water-stain line across it. One solid closed stone. No ferns, no plants, no loose foliage, no thin stems. Approximately 1.8 meters tall.',
  swamp_driftwood_01:
    'One single thick piece of bone-white bleached driftwood: a heavy smooth twisted root mass, fat and solid like a worn bone, with two or three short blunt stubs where branches snapped off. Weathered smooth, chunky and closed. No tangle, no thin branches, no twigs, no interlocking pieces, no heap. Approximately 1.6 meters tall.',
};

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf-8'));
const ids = Object.keys(REVISED);
let revised = 0, reset = 0;
for (const a of catalog) {
  if (!REVISED[a.id]) continue;
  a.promptDetails = REVISED[a.id];
  revised++;
  // A bad mesh still counts as glb_optimized to the pipeline: it produced a file.
  // Only the render check knows it is a sliver, so the status has to come back.
  if (a.status !== 'pending') { a.status = 'pending'; reset++; }
}
fs.writeFileSync(CATALOG, JSON.stringify(catalog, null, 2) + '\n');

const skipped = fs.existsSync(SKIPPED) ? JSON.parse(fs.readFileSync(SKIPPED, 'utf-8')) : [];
const kept = skipped.filter(id => !REVISED[id]);
fs.writeFileSync(SKIPPED, JSON.stringify(kept, null, 2));

console.log(`revised ${revised}/${ids.length} prompts, reset ${reset} to pending`);
console.log(`skipped.json: ${skipped.length} -> ${kept.length} (dropped ${skipped.length - kept.length} Mirefen entries)`);
for (const b of [11, 12]) {
  const a = catalog.filter(x => x.batch === b);
  const todo = a.filter(x => x.status === 'pending').length;
  console.log(`  batch ${b}: ${todo} of ${a.length} will run`);
}

/**
 * Contact sheet of the SD source images for a catalog batch, so the concept art
 * can be judged before Trellis spends three minutes per mesh on it.
 *
 *   node tools/image-sheet.mjs <batch> [out.png]      → tools/reports/images-<batch>.png
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const batch = +process.argv[2];
const out = process.argv[3] || `tools/reports/images-${batch}.png`;
const catalog = JSON.parse(fs.readFileSync('AssetFactory/catalog/assets.json', 'utf8'));
const dirs = fs.readdirSync('AssetFactory/source_images').map(d => path.join('AssetFactory/source_images', d));
const items = catalog.filter(a => a.batch === batch).map(a => {
  const f = dirs.map(d => path.join(d, a.id + '.png')).find(p => fs.existsSync(p));
  return f ? { id: a.id, file: f } : null;
}).filter(Boolean);
if (!items.length) { console.log('no images for batch', batch); process.exit(0); }
const CELL = 256, COLS = 6, rows = Math.ceil(items.length / COLS);
const tiles = [];
for (let i = 0; i < items.length; i++) {
  const img = await sharp(items[i].file).resize(CELL, CELL, { fit: 'contain', background: '#20242c' }).flatten({ background: '#20242c' }).png().toBuffer();
  const label = Buffer.from(`<svg width="${CELL}" height="22"><rect width="${CELL}" height="22" fill="#000" opacity="0.6"/><text x="4" y="16" font-size="12" fill="#eee" font-family="sans-serif">${items[i].id}</text></svg>`);
  const tile = await sharp(img).composite([{ input: label, top: CELL - 22, left: 0 }]).png().toBuffer();
  tiles.push({ input: tile, left: (i % COLS) * CELL, top: Math.floor(i / COLS) * CELL });
}
await sharp({ create: { width: COLS * CELL, height: rows * CELL, channels: 3, background: '#20242c' } }).composite(tiles).png().toFile(out);
console.log(`${out}: ${items.length} images`);

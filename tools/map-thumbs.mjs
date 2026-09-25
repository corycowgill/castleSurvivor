// Square 256px map thumbnails for the Battlefield selector, cut from the harness
// overhead captures (run `npm run overhead` or `... overhead --gpu` first).
import sharp from 'sharp';
import fs from 'fs';
fs.mkdirSync('images/maps', { recursive: true });
for (const id of ['kingsfield', 'darkwood', 'emberreach', 'mirefen', 'bloodmarch']) {
  const src = `tools/shots/overhead-${id}.png`;
  if (!fs.existsSync(src)) { console.warn('missing', src); continue; }
  const m = await sharp(src).metadata();
  const side = Math.min(m.width, m.height);
  await sharp(src).extract({ left: Math.floor((m.width - side) / 2), top: Math.floor((m.height - side) / 2), width: side, height: side }).resize(256, 256).modulate({ brightness: id === 'darkwood' ? 1.35 : id === 'emberreach' ? 1.2 : id === 'mirefen' ? 1.3 : id === 'bloodmarch' ? 1.25 : 1.0 }).webp({ quality: 82 }).toFile(`images/maps/${id}.webp`);
  console.log(`images/maps/${id}.webp`);
}

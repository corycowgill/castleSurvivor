/**
 * Optimize all GLB files in Game3DAssets/:
 * 1. Resize textures to max 1024x1024 (2048 for character models)
 * 2. Convert textures to WebP
 * 3. Apply Draco mesh compression
 * 4. Deduplicate accessors/meshes
 */
import { NodeIO, Logger } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  textureCompress,
  prune,
  draco
} from '@gltf-transform/functions';
import sharp from 'sharp';
import draco3d from 'draco3dgltf';
import fs from 'fs';
import path from 'path';

const DIR = './Game3DAssets';

// Character models get 2048, everything else gets 1024
const LARGE_TEXTURE_FILES = new Set([
  'brennwrig.glb',
  'parkerwrig.glb',
  'dadwrig.glb',
  'dadKnightRigged.glb',
  'knightWithAnimations.glb',
  'wolfWithAnimation.glb',
  'dragonOgreHybridBossWithAnimation.glb',
  'goblineWithAnimations.glb',
  'orgreWithAnimations.glb',
  'brennanKingtFinal.glb',
  'parkerKnightFinal.glb',
  'dadKnightFinal.glb',
]);

async function main() {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'draco3d.decoder': await draco3d.createDecoderModule(),
    });

  const files = fs.readdirSync(DIR).filter(f => f.endsWith('.glb'));

  console.log(`Optimizing ${files.length} GLB files...\n`);

  let totalBefore = 0;
  let totalAfter = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filepath = path.join(DIR, file);
    const sizeBefore = fs.statSync(filepath).size;
    totalBefore += sizeBefore;

    const maxRes = LARGE_TEXTURE_FILES.has(file) ? 2048 : 1024;

    console.log(`[${i+1}/${files.length}] ${file} (${(sizeBefore/1024/1024).toFixed(1)}MB) — max texture ${maxRes}...`);

    try {
      const doc = await io.read(filepath);

      // 1. Remove duplicate data
      await doc.transform(dedup());

      // 2. Remove unused resources
      await doc.transform(prune());

      // 3. Resize textures manually via sharp
      const textures = doc.getRoot().listTextures();
      for (const tex of textures) {
        const imageData = tex.getImage();
        if (!imageData) continue;
        try {
          const meta = await sharp(Buffer.from(imageData)).metadata();
          if (meta.width > maxRes || meta.height > maxRes) {
            const resized = await sharp(Buffer.from(imageData))
              .resize(maxRes, maxRes, { fit: 'inside', withoutEnlargement: true })
              .webp({ quality: 80 })
              .toBuffer();
            tex.setImage(new Uint8Array(resized));
            tex.setMimeType('image/webp');
          } else {
            // Just convert to WebP without resize
            const compressed = await sharp(Buffer.from(imageData))
              .webp({ quality: 80 })
              .toBuffer();
            tex.setImage(new Uint8Array(compressed));
            tex.setMimeType('image/webp');
          }
        } catch (e) {
          console.log(`    Texture skip: ${e.message}`);
        }
      }

      // 4. Draco mesh compression
      await doc.transform(draco());

      // Write back
      await io.write(filepath, doc);

      const sizeAfter = fs.statSync(filepath).size;
      totalAfter += sizeAfter;
      const saved = sizeBefore - sizeAfter;
      const pct = ((saved / sizeBefore) * 100).toFixed(0);
      console.log(`  → ${(sizeAfter/1024/1024).toFixed(1)}MB (saved ${(saved/1024/1024).toFixed(1)}MB, ${pct}%)\n`);

    } catch (err) {
      console.log(`  ERROR: ${err.message}\n`);
      totalAfter += sizeBefore; // count unchanged
    }
  }

  console.log('='.repeat(60));
  console.log(`TOTAL BEFORE: ${(totalBefore/1024/1024).toFixed(1)}MB`);
  console.log(`TOTAL AFTER:  ${(totalAfter/1024/1024).toFixed(1)}MB`);
  console.log(`SAVED:        ${((totalBefore-totalAfter)/1024/1024).toFixed(1)}MB (${(((totalBefore-totalAfter)/totalBefore)*100).toFixed(0)}%)`);
}

main().catch(err => { console.error(err); process.exit(1); });

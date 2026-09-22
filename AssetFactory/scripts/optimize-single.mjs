/**
 * Optimize a single GLB file — called by run_pipeline.py.
 * Usage: node optimize-single.mjs <input.glb> <output.glb> [category]
 *
 * Applies: Draco compression, WebP textures, texture resizing, dedup, prune.
 * Matches conventions in the project's existing optimize-glb.mjs.
 */
import { NodeIO } from '@gltf-transform/core';
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

const [inputPath, outputPath, category] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error('Usage: node optimize-single.mjs <input.glb> <output.glb> [category]');
  process.exit(1);
}

// Landmarks and terrain get 1024, everything else gets 512
const LARGE_CATEGORIES = new Set(['landmarks', 'terrain']);
const maxRes = LARGE_CATEGORIES.has(category) ? 1024 : 512;

async function main() {
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'draco3d.decoder': await draco3d.createDecoderModule(),
    });

  const doc = await io.read(inputPath);

  await doc.transform(
    prune(),
    dedup(),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [maxRes, maxRes]
    }),
    draco()
  );

  await io.write(outputPath, doc);

  const inSize = fs.statSync(inputPath).size;
  const outSize = fs.statSync(outputPath).size;
  console.log(`${inSize} -> ${outSize} (${((1 - outSize/inSize) * 100).toFixed(1)}% reduction)`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});

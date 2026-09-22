/**
 * GLB optimizer — applies Draco compression, WebP textures, texture resizing.
 * Mirrors the conventions in the project's existing optimize-glb.mjs.
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
import path from 'path';
import config from './config.mjs';

let io = null;

async function getIO() {
  if (io) return io;
  io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'draco3d.decoder': await draco3d.createDecoderModule(),
    });
  return io;
}

/**
 * Optimize a GLB file — Draco, WebP, texture resize, dedup, prune.
 * @param {string} inputPath - normalized GLB
 * @param {string} outputPath - optimized GLB
 * @param {object} asset - catalog entry (for texture size lookup)
 * @returns {{ sizeBefore: number, sizeAfter: number, reduction: string }}
 */
export async function optimizeGLB(inputPath, outputPath, asset) {
  const reader = await getIO();
  const doc = await reader.read(inputPath);

  const sizeBefore = fs.statSync(inputPath).size;

  // Determine max texture size based on category
  const maxRes = getMaxTextureSize(asset);

  // Resize textures
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

  await reader.write(outputPath, doc);

  const sizeAfter = fs.statSync(outputPath).size;
  const reduction = ((1 - sizeAfter / sizeBefore) * 100).toFixed(1);

  return { sizeBefore, sizeAfter, reduction: `${reduction}%` };
}

function getMaxTextureSize(asset) {
  const category = asset.category;
  // Landmarks and buildings get larger textures
  if (['landmarks', 'terrain'].includes(category)) {
    return config.optimization.largeTextureSize;
  }
  return config.optimization.defaultTextureSize;
}

/**
 * GLB normalizer — fixes origin and scale to match game requirements.
 *
 * Rules:
 * - Y = up
 * - Origin X/Z = center of bounding box
 * - Origin Y = lowest geometry point (bottom-center)
 * - Scale to match target real-world dimensions from config
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import fs from 'fs';
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
 * Normalize a GLB's origin and scale.
 * @param {string} inputPath - raw GLB
 * @param {string} outputPath - normalized GLB
 * @param {string} assetId - for looking up target scale
 * @returns {{ scaled: boolean, originalHeight: number, targetHeight: number, scaleFactor: number }}
 */
export async function normalizeGLB(inputPath, outputPath, assetId) {
  const reader = await getIO();
  const doc = await reader.read(inputPath);
  const root = doc.getRoot();

  // Step 1: Compute current bounding box
  const bbox = computeBBox(root);
  const currentHeight = bbox.max[1] - bbox.min[1];
  const centerX = (bbox.min[0] + bbox.max[0]) / 2;
  const centerZ = (bbox.min[2] + bbox.max[2]) / 2;
  const bottomY = bbox.min[1];

  // Step 2: Determine scale factor
  let scaleFactor = 1.0;
  let targetHeight = currentHeight;

  const scaleEntry = config.scaleTargets[assetId];
  if (scaleEntry?.height && currentHeight > 0) {
    targetHeight = scaleEntry.height;
    scaleFactor = targetHeight / currentHeight;
  }

  // Step 3: Apply transforms to all root-level scene nodes
  const scenes = root.listScenes();
  for (const scene of scenes) {
    for (const node of scene.listChildren()) {
      const currentTranslation = node.getTranslation();
      const currentScale = node.getScale();

      // Offset to center X/Z and bottom Y
      node.setTranslation([
        (currentTranslation[0] - centerX) * scaleFactor,
        (currentTranslation[1] - bottomY) * scaleFactor,
        (currentTranslation[2] - centerZ) * scaleFactor
      ]);

      // Apply uniform scale
      node.setScale([
        currentScale[0] * scaleFactor,
        currentScale[1] * scaleFactor,
        currentScale[2] * scaleFactor
      ]);
    }
  }

  // If no scene children to transform, apply to mesh positions directly
  if (scenes.length === 0 || scenes.every(s => s.listChildren().length === 0)) {
    for (const mesh of root.listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        const posAccessor = prim.getAttribute('POSITION');
        if (!posAccessor) continue;

        const count = posAccessor.getCount();
        for (let i = 0; i < count; i++) {
          const pos = posAccessor.getElement(i, [0, 0, 0]);
          posAccessor.setElement(i, [
            (pos[0] - centerX) * scaleFactor,
            (pos[1] - bottomY) * scaleFactor,
            (pos[2] - centerZ) * scaleFactor
          ]);
        }
      }
    }
  }

  await reader.write(outputPath, doc);

  return {
    scaled: scaleFactor !== 1.0,
    originalHeight: currentHeight,
    targetHeight,
    scaleFactor,
    newOrigin: 'bottom-center'
  };
}

function computeBBox(root) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const posAccessor = prim.getAttribute('POSITION');
      if (!posAccessor) continue;

      const count = posAccessor.getCount();
      for (let i = 0; i < count; i++) {
        const pos = posAccessor.getElement(i, [0, 0, 0]);
        for (let j = 0; j < 3; j++) {
          if (pos[j] < min[j]) min[j] = pos[j];
          if (pos[j] > max[j]) max[j] = pos[j];
        }
      }
    }
  }

  return { min, max };
}

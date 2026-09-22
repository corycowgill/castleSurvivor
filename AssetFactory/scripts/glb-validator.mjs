/**
 * GLB validation — inspects generated GLBs for structural integrity.
 * Rejects obvious failures before optimization.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
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
      'draco3d.decoder': await draco3d.createDecoderModule(),
    });
  return io;
}

/**
 * Validate a raw GLB file from Trellis.
 * @param {string} glbPath
 * @returns {{ valid: boolean, issues: string[], stats: object }}
 */
export async function validateGLB(glbPath) {
  const issues = [];

  if (!fs.existsSync(glbPath)) {
    return { valid: false, issues: ['File does not exist'], stats: {} };
  }

  const fileSize = fs.statSync(glbPath).size;
  const fileSizeMB = fileSize / (1024 * 1024);

  const stats = {
    fileSize,
    fileSizeMB: fileSizeMB.toFixed(2)
  };

  if (fileSize === 0) {
    return { valid: false, issues: ['File is empty (0 bytes)'], stats };
  }

  if (fileSizeMB > config.validation.maxFileSizeMB) {
    issues.push(`File too large: ${fileSizeMB.toFixed(1)}MB (max ${config.validation.maxFileSizeMB}MB)`);
  }

  try {
    const reader = await getIO();
    const doc = await reader.read(glbPath);
    const root = doc.getRoot();

    // Count meshes
    const meshes = root.listMeshes();
    stats.meshCount = meshes.length;
    if (meshes.length === 0) {
      issues.push('No meshes found — empty scene');
      return { valid: false, issues, stats };
    }

    // Count triangles and vertices
    let totalVertices = 0;
    let totalTriangles = 0;

    for (const mesh of meshes) {
      for (const prim of mesh.listPrimitives()) {
        const posAccessor = prim.getAttribute('POSITION');
        if (posAccessor) {
          totalVertices += posAccessor.getCount();
        }

        const indices = prim.getIndices();
        if (indices) {
          totalTriangles += indices.getCount() / 3;
        } else if (posAccessor) {
          totalTriangles += posAccessor.getCount() / 3;
        }
      }
    }

    stats.vertexCount = totalVertices;
    stats.triangleCount = Math.round(totalTriangles);

    if (totalVertices < config.validation.minVertices) {
      issues.push(`Too few vertices: ${totalVertices} (min ${config.validation.minVertices})`);
    }

    if (totalTriangles > config.validation.maxTriangles) {
      issues.push(`Too many triangles: ${totalTriangles} (max ${config.validation.maxTriangles})`);
    }

    // Count materials
    const materials = root.listMaterials();
    stats.materialCount = materials.length;
    if (materials.length > config.validation.maxMaterials) {
      issues.push(`Too many materials: ${materials.length} (max ${config.validation.maxMaterials})`);
    }

    // Count textures
    const textures = root.listTextures();
    stats.textureCount = textures.length;

    // Bounding box
    const bbox = computeBoundingBox(root);
    stats.boundingBox = bbox;
    stats.dimensions = {
      x: (bbox.max[0] - bbox.min[0]).toFixed(3),
      y: (bbox.max[1] - bbox.min[1]).toFixed(3),
      z: (bbox.max[2] - bbox.min[2]).toFixed(3)
    };

    const maxDim = Math.max(
      bbox.max[0] - bbox.min[0],
      bbox.max[1] - bbox.min[1],
      bbox.max[2] - bbox.min[2]
    );

    if (maxDim > config.validation.maxDimensionMeters * 10) {
      // Raw Trellis output may have arbitrary scale
      issues.push(`Abnormally large dimensions: max ${maxDim.toFixed(1)} units (may need normalization)`);
    }

    // Check for animations (environment props shouldn't have them usually)
    const animations = root.listAnimations();
    stats.animationCount = animations.length;

    // Check for skins/bones
    const skins = root.listSkins();
    stats.skinCount = skins.length;

    // Count nodes
    const nodes = root.listNodes();
    stats.nodeCount = nodes.length;

  } catch (err) {
    issues.push(`Failed to parse GLB: ${err.message}`);
    return { valid: false, issues, stats };
  }

  return {
    valid: issues.length === 0,
    issues,
    stats
  };
}

/**
 * Compute AABB for all meshes in the scene.
 */
function computeBoundingBox(root) {
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

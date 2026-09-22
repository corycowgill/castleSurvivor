/**
 * Analyze all GLB files — extract mesh/animation/texture/buffer info
 * by parsing the GLB binary format directly (no extension issues).
 */
import fs from 'fs';
import path from 'path';

const dir = './Game3DAssets';

function parseGLB(filepath) {
  const buf = fs.readFileSync(filepath);
  const fileSize = buf.byteLength;

  // GLB header: magic(4) + version(4) + length(4)
  // Then chunks: length(4) + type(4) + data
  // First chunk is JSON, second is BIN

  let offset = 12; // skip header
  let jsonChunkLen = 0, binChunkLen = 0;
  let jsonData = null;

  while (offset < buf.byteLength) {
    const chunkLen = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);

    if (chunkType === 0x4E4F534A) { // JSON
      jsonChunkLen = chunkLen;
      const jsonStr = buf.toString('utf8', offset + 8, offset + 8 + chunkLen);
      jsonData = JSON.parse(jsonStr);
    } else if (chunkType === 0x004E4942) { // BIN
      binChunkLen = chunkLen;
    }
    offset += 8 + chunkLen;
  }

  return { fileSize, jsonChunkLen, binChunkLen, gltf: jsonData };
}

function analyzeBufferViews(gltf) {
  // Categorize buffer views by what references them
  const bvUsage = {};
  const bufferViews = gltf.bufferViews || [];

  bufferViews.forEach((bv, i) => {
    bvUsage[i] = { byteLength: bv.byteLength, users: [] };
  });

  // Images reference buffer views
  (gltf.images || []).forEach((img, i) => {
    if (img.bufferView !== undefined) {
      bvUsage[img.bufferView].users.push(`image[${i}]:${img.mimeType || 'unknown'}`);
    }
  });

  // Accessors reference buffer views
  (gltf.accessors || []).forEach((acc, i) => {
    if (acc.bufferView !== undefined) {
      if (!bvUsage[acc.bufferView]) return;
      bvUsage[acc.bufferView].users.push(`accessor[${i}]`);
    }
  });

  return bvUsage;
}

function getAnimationSize(gltf, anim) {
  let totalBytes = 0;
  const accessors = gltf.accessors || [];
  const bufferViews = gltf.bufferViews || [];

  for (const sampler of (anim.samplers || [])) {
    for (const accIdx of [sampler.input, sampler.output]) {
      if (accIdx !== undefined && accessors[accIdx]) {
        const bvIdx = accessors[accIdx].bufferView;
        if (bvIdx !== undefined && bufferViews[bvIdx]) {
          totalBytes += bufferViews[bvIdx].byteLength;
        }
      }
    }
  }
  return totalBytes;
}

function getTextureSize(gltf) {
  let totalBytes = 0;
  const bufferViews = gltf.bufferViews || [];
  const images = gltf.images || [];

  for (const img of images) {
    if (img.bufferView !== undefined && bufferViews[img.bufferView]) {
      totalBytes += bufferViews[img.bufferView].byteLength;
    }
  }
  return totalBytes;
}

function getMeshSize(gltf) {
  let totalBytes = 0;
  const accessors = gltf.accessors || [];
  const bufferViews = gltf.bufferViews || [];
  const counted = new Set();

  for (const mesh of (gltf.meshes || [])) {
    for (const prim of (mesh.primitives || [])) {
      // Attributes
      for (const accIdx of Object.values(prim.attributes || {})) {
        if (accessors[accIdx]) {
          const bvIdx = accessors[accIdx].bufferView;
          if (bvIdx !== undefined && !counted.has(bvIdx) && bufferViews[bvIdx]) {
            totalBytes += bufferViews[bvIdx].byteLength;
            counted.add(bvIdx);
          }
        }
      }
      // Indices
      if (prim.indices !== undefined && accessors[prim.indices]) {
        const bvIdx = accessors[prim.indices].bufferView;
        if (bvIdx !== undefined && !counted.has(bvIdx) && bufferViews[bvIdx]) {
          totalBytes += bufferViews[bvIdx].byteLength;
          counted.add(bvIdx);
        }
      }
    }
  }
  return totalBytes;
}

// ---- Main ----
const files = fs.readdirSync(dir).filter(f => f.endsWith('.glb')).sort();
const allResults = [];

for (const file of files) {
  const filepath = path.join(dir, file);
  const { fileSize, jsonChunkLen, binChunkLen, gltf } = parseGLB(filepath);

  const meshes = gltf.meshes || [];
  const animations = gltf.animations || [];
  const images = gltf.images || [];
  const nodes = gltf.nodes || [];
  const skins = gltf.skins || [];

  const textureBytes = getTextureSize(gltf);
  const meshBytes = getMeshSize(gltf);
  let animBytes = 0;

  const animDetails = animations.map(a => {
    const size = getAnimationSize(gltf, a);
    animBytes += size;
    return {
      name: a.name || '(unnamed)',
      channels: (a.channels || []).length,
      samplers: (a.samplers || []).length,
      sizeKB: Math.round(size / 1024)
    };
  });

  allResults.push({
    file,
    fileSizeMB: (fileSize / (1024*1024)).toFixed(1),
    meshCount: meshes.length,
    nodeCount: nodes.length,
    skinCount: skins.length,
    imageCount: images.length,
    animCount: animations.length,
    textureMB: (textureBytes / (1024*1024)).toFixed(1),
    meshMB: (meshBytes / (1024*1024)).toFixed(1),
    animMB: (animBytes / (1024*1024)).toFixed(1),
    animations: animDetails
  });
}

// Summary table
console.log('\n=== FILE SIZE BREAKDOWN ===\n');
console.log('File'.padEnd(45) + 'Size'.padStart(7) + '  Tex'.padStart(7) + '  Mesh'.padStart(7) + '  Anim'.padStart(7) + '  #Anim'.padStart(7) + '  #Img'.padStart(6) + '  #Skin'.padStart(7));
console.log('-'.repeat(95));

let totalSize = 0, totalTex = 0, totalMesh = 0, totalAnim = 0;

for (const r of allResults) {
  totalSize += parseFloat(r.fileSizeMB);
  totalTex += parseFloat(r.textureMB);
  totalMesh += parseFloat(r.meshMB);
  totalAnim += parseFloat(r.animMB);

  console.log(
    r.file.padEnd(45) +
    (r.fileSizeMB + 'M').padStart(7) +
    (r.textureMB + 'M').padStart(7) +
    (r.meshMB + 'M').padStart(7) +
    (r.animMB + 'M').padStart(7) +
    String(r.animCount).padStart(7) +
    String(r.imageCount).padStart(6) +
    String(r.skinCount).padStart(7)
  );
}

console.log('-'.repeat(95));
console.log(
  'TOTAL'.padEnd(45) +
  (totalSize.toFixed(1) + 'M').padStart(7) +
  (totalTex.toFixed(1) + 'M').padStart(7) +
  (totalMesh.toFixed(1) + 'M').padStart(7) +
  (totalAnim.toFixed(1) + 'M').padStart(7)
);

// Animation details for animated files
console.log('\n\n=== ANIMATION DETAILS (files with animations) ===\n');
for (const r of allResults) {
  if (r.animations.length === 0) continue;
  console.log(`\n${r.file} (${r.fileSizeMB}MB, ${r.skinCount} skin(s)):`);
  for (const a of r.animations) {
    console.log(`  "${a.name}" — ${a.sizeKB}KB, ${a.channels} channels, ${a.samplers} samplers`);
  }
}

// Find duplicate animation names
console.log('\n\n=== SHARED ANIMATION NAMES ACROSS FILES ===\n');
const animNameMap = {};
for (const r of allResults) {
  for (const a of r.animations) {
    if (!animNameMap[a.name]) animNameMap[a.name] = [];
    animNameMap[a.name].push({ file: r.file, sizeKB: a.sizeKB });
  }
}
for (const [name, files] of Object.entries(animNameMap).sort((a,b) => b[1].length - a[1].length)) {
  if (files.length > 1) {
    console.log(`"${name}" appears in ${files.length} files:`);
    for (const f of files) {
      console.log(`  ${f.file} (${f.sizeKB}KB)`);
    }
  }
}

// Identify likely duplicate/unused files
console.log('\n\n=== POTENTIAL DUPLICATES / UNUSED FILES ===\n');
const groups = {};
for (const r of allResults) {
  // Group by base name pattern
  const base = r.file.replace(/WithAnimation|WithMesh_00001_|Rigged|Final|\d+/g, '').replace('.glb', '').toLowerCase();
  if (!groups[base]) groups[base] = [];
  groups[base].push(r);
}
for (const [base, items] of Object.entries(groups)) {
  if (items.length > 1) {
    console.log(`Group "${base}":`);
    for (const r of items) {
      console.log(`  ${r.file} (${r.fileSizeMB}MB) — ${r.animCount} anims, ${r.skinCount} skins, ${r.imageCount} images`);
    }
  }
}

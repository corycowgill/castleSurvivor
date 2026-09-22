import { NodeIO } from '@gltf-transform/core';
import fs from 'fs';
import path from 'path';

const io = new NodeIO();
const dir = './Game3DAssets';

for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(dir, file));
  const root = doc.getRoot();
  const anims = root.listAnimations().map(a => ({
    name: a.getName(),
    channels: a.listChannels().length,
    samplers: a.listSamplers().length,
  }));
  const meshes = root.listMeshes().map(m => m.getName());
  const scenes = root.listScenes().map(s => s.getName());
  console.log(`\n=== ${file} ===`);
  console.log(`  Scenes: ${scenes.join(', ') || 'none'}`);
  console.log(`  Meshes (${meshes.length}): ${meshes.slice(0, 5).join(', ')}${meshes.length > 5 ? '...' : ''}`);
  console.log(`  Animations (${anims.length}):`);
  for (const a of anims) {
    console.log(`    - "${a.name}" (${a.channels} channels, ${a.samplers} samplers)`);
  }
}

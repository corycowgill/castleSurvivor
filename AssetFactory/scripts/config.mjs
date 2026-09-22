/**
 * AssetFactory configuration — single source of truth for all pipeline settings.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROJECT = path.resolve(ROOT, '..');

export default {
  // Directories
  root: ROOT,
  project: PROJECT,
  catalog: path.join(ROOT, 'catalog'),
  prompts: path.join(ROOT, 'prompts'),
  sourceImages: path.join(ROOT, 'source_images'),
  glbRaw: path.join(ROOT, 'glb_raw'),
  glbOptimized: path.join(ROOT, 'glb_optimized'),
  thumbnails: path.join(ROOT, 'thumbnails'),
  reports: path.join(ROOT, 'reports'),
  gameAssets: path.join(PROJECT, 'Game3DAssets'),

  // ComfyUI
  comfyui: {
    host: '127.0.0.1',
    port: 8188,
    get url() { return `http://${this.host}:${this.port}`; }
  },

  // Trellis 2.0
  trellis: {
    host: '127.0.0.1',
    port: 7860,
    get url() { return `http://${this.host}:${this.port}`; }
  },

  // Image generation
  image: {
    width: 1024,
    height: 1024,
    format: 'png',
    maxAttempts: 4,
    coverageTarget: 0.70  // 65-75% object coverage
  },

  // GLB validation thresholds
  validation: {
    maxTriangles: 50000,
    maxMaterials: 5,
    maxFileSizeMB: 10,
    minVertices: 10,
    maxDimensionMeters: 20
  },

  // Optimization (matches existing optimize-glb.mjs conventions)
  optimization: {
    defaultTextureSize: 512,   // environment props
    largeTextureSize: 1024,    // buildings, landmarks
    useDraco: true,
    useWebP: true
  },

  // Scale normalization — expected real-world heights in meters
  scaleTargets: {
    prop_wood_crate_small_01: { height: 0.6 },
    prop_wood_crate_large_01: { height: 1.0 },
    prop_grain_sack_01: { height: 0.7 },
    prop_hay_bale_01: { height: 0.6 },
    prop_bench_wood_01: { height: 0.9, width: 1.8 },
    prop_firewood_stack_01: { height: 1.0 },
    prop_barrel: { height: 0.9 },
    village_water_well_01: { height: 2.0 },
    village_fence_straight_01: { height: 1.2 },
    village_lantern_post_01: { height: 3.0 },
    blacksmith_anvil_01: { height: 0.8 },
    blacksmith_forge_01: { height: 1.5 },
    farm_scarecrow_01: { height: 2.0 },
    nature_oak_large_01: { height: 8.0 },
    nature_oak_small_01: { height: 4.0 },
    nature_pine_02: { height: 7.0 },
    nature_dead_tree_01: { height: 5.0 },
    nature_rock_cluster_01: { height: 0.8 },
    combat_barricade_01: { height: 1.5 },
    combat_enemy_totem_01: { height: 3.0 },
    landmark_village_fountain: { height: 3.0 },
    landmark_ancient_oak: { height: 12.0 },
    landmark_ruined_tower: { height: 8.0 },
    landmark_windmill: { height: 10.0 }
  },

  // Pipeline
  pipeline: {
    batchSize: 10,
    statusValues: [
      'pending',
      'image_generating',
      'image_complete',
      'image_failed',
      'bg_removing',
      'bg_complete',
      'trellis_generating',
      'glb_complete',
      'glb_failed',
      'optimizing',
      'ready',
      'human_review'
    ]
  }
};

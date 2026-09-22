/**
 * ComfyUI API client — submits image generation workflows and retrieves results.
 * Expects ComfyUI running locally with API mode enabled.
 */
import fs from 'fs';
import path from 'path';
import config from './config.mjs';
import { buildPrompt, loadNegativePrompt } from './prompt-builder.mjs';

const API = config.comfyui.url;

/**
 * Build a ComfyUI workflow JSON for SD image generation.
 * This creates a basic txt2img workflow — adjust node IDs to match your ComfyUI setup.
 */
function buildWorkflow(positive, negative, seed, filename) {
  return {
    "3": {
      "class_type": "KSampler",
      "inputs": {
        "seed": seed,
        "steps": 30,
        "cfg": 7.0,
        "sampler_name": "euler_ancestral",
        "scheduler": "normal",
        "denoise": 1.0,
        "model": ["4", 0],
        "positive": ["6", 0],
        "negative": ["7", 0],
        "latent_image": ["5", 0]
      }
    },
    "4": {
      "class_type": "CheckpointLoaderSimple",
      "inputs": {
        "ckpt_name": "sd_xl_base_1.0.safetensors"
      }
    },
    "5": {
      "class_type": "EmptyLatentImage",
      "inputs": {
        "width": config.image.width,
        "height": config.image.height,
        "batch_size": 1
      }
    },
    "6": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": positive,
        "clip": ["4", 1]
      }
    },
    "7": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": negative,
        "clip": ["4", 1]
      }
    },
    "8": {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": ["3", 0],
        "vae": ["4", 2]
      }
    },
    "9": {
      "class_type": "SaveImage",
      "inputs": {
        "filename_prefix": filename,
        "images": ["8", 0]
      }
    }
  };
}

/**
 * Queue a prompt on ComfyUI and wait for completion.
 * @returns {string} path to the output image
 */
async function queueAndWait(workflow) {
  // Queue the prompt
  const queueRes = await fetch(`${API}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow })
  });

  if (!queueRes.ok) {
    throw new Error(`ComfyUI queue failed: ${queueRes.status} ${await queueRes.text()}`);
  }

  const { prompt_id } = await queueRes.json();
  console.log(`  Queued prompt ${prompt_id}`);

  // Poll for completion
  while (true) {
    await new Promise(r => setTimeout(r, 2000));

    const histRes = await fetch(`${API}/history/${prompt_id}`);
    if (!histRes.ok) continue;

    const history = await histRes.json();
    if (history[prompt_id]?.status?.completed) {
      // Find the output image
      const outputs = history[prompt_id].outputs;
      for (const nodeId of Object.keys(outputs)) {
        const images = outputs[nodeId]?.images;
        if (images?.length > 0) {
          return images[0]; // { filename, subfolder, type }
        }
      }
      throw new Error('No image output found in completed prompt');
    }

    if (history[prompt_id]?.status?.status_str === 'error') {
      throw new Error(`ComfyUI generation failed for prompt ${prompt_id}`);
    }
  }
}

/**
 * Download an image from ComfyUI output to local path.
 */
async function downloadImage(imageInfo, destPath) {
  const params = new URLSearchParams({
    filename: imageInfo.filename,
    subfolder: imageInfo.subfolder || '',
    type: imageInfo.type || 'output'
  });

  const res = await fetch(`${API}/view?${params}`);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return destPath;
}

/**
 * Generate a source image for an asset.
 * @param {object} asset - catalog entry
 * @param {number} attempt - attempt number (affects seed)
 * @returns {string} path to the downloaded PNG
 */
export async function generateImage(asset, attempt = 0) {
  const positive = buildPrompt(asset);
  const negative = loadNegativePrompt();
  const seed = hashSeed(asset.id) + attempt * 1000;
  const filename = asset.id;

  console.log(`  Generating image for ${asset.id} (attempt ${attempt + 1}, seed ${seed})`);

  const workflow = buildWorkflow(positive, negative, seed, filename);
  const imageInfo = await queueAndWait(workflow);

  // Determine destination based on category
  const categoryDir = getCategoryDir(asset.category);
  const destDir = path.join(config.sourceImages, categoryDir);
  fs.mkdirSync(destDir, { recursive: true });

  const destPath = path.join(destDir, `${asset.id}.png`);
  await downloadImage(imageInfo, destPath);

  console.log(`  Saved: ${destPath}`);
  return destPath;
}

/**
 * Deterministic seed from asset ID for reproducibility.
 */
function hashSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash) % 999999999;
}

/**
 * Map category to source_images subdirectory.
 */
function getCategoryDir(category) {
  const map = {
    village_clutter: 'props',
    village_infrastructure: 'village',
    blacksmith_kit: 'village',
    farm_kit: 'village',
    tavern_kit: 'village',
    nature: 'vegetation',
    combat: 'combat',
    terrain: 'terrain',
    landmarks: 'landmarks'
  };
  return map[category] || 'props';
}

/**
 * Check if ComfyUI is reachable.
 */
export async function checkConnection() {
  try {
    const res = await fetch(`${API}/system_stats`);
    return res.ok;
  } catch {
    return false;
  }
}

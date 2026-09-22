/**
 * Trellis 2.0 client — sends validated transparent PNGs for 3D reconstruction.
 * Expects Trellis running locally via Gradio interface.
 */
import fs from 'fs';
import path from 'path';
import config from './config.mjs';

const API = config.trellis.url;

/**
 * Submit an image to Trellis and retrieve the GLB output.
 * @param {string} imagePath - path to transparent PNG
 * @param {string} assetId - asset identifier
 * @returns {string} path to the output GLB
 */
export async function generateGLB(imagePath, assetId) {
  console.log(`  Sending ${assetId} to Trellis...`);

  // Read image as base64 for Gradio API
  const imageBuffer = fs.readFileSync(imagePath);
  const base64 = imageBuffer.toString('base64');
  const mimeType = 'image/png';

  // Trellis Gradio API call
  // The exact endpoint/payload depends on your Trellis setup
  // This targets the standard Gradio predict endpoint
  const response = await fetch(`${API}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fn_index: 0,
      data: [
        `data:${mimeType};base64,${base64}`,  // image input
        64,    // seed
        15,    // guidance scale
        50     // steps
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Trellis API error ${response.status}: ${text}`);
  }

  const result = await response.json();

  // Extract GLB file from response
  // Trellis typically returns a file path or base64 GLB
  const glbData = extractGLB(result);
  if (!glbData) {
    throw new Error('No GLB output found in Trellis response');
  }

  const outputPath = path.join(config.glbRaw, `${assetId}.glb`);

  if (typeof glbData === 'string' && glbData.startsWith('data:')) {
    // Base64 encoded
    const b64 = glbData.split(',')[1];
    fs.writeFileSync(outputPath, Buffer.from(b64, 'base64'));
  } else if (typeof glbData === 'string') {
    // File path from Trellis — download it
    const fileRes = await fetch(`${API}/file=${glbData}`);
    if (!fileRes.ok) throw new Error(`Failed to download GLB from Trellis`);
    const buf = Buffer.from(await fileRes.arrayBuffer());
    fs.writeFileSync(outputPath, buf);
  } else if (Buffer.isBuffer(glbData)) {
    fs.writeFileSync(outputPath, glbData);
  }

  console.log(`  GLB saved: ${outputPath}`);
  return outputPath;
}

/**
 * Extract GLB data from Trellis API response.
 * Handles various response formats.
 */
function extractGLB(result) {
  if (!result?.data) return null;

  for (const item of result.data) {
    if (!item) continue;

    // Direct file path
    if (typeof item === 'string' && item.endsWith('.glb')) return item;

    // Object with name/path
    if (item.name && item.name.endsWith('.glb')) return item.name;
    if (item.path && item.path.endsWith('.glb')) return item.path;

    // Nested data URI
    if (typeof item === 'string' && item.includes('model/gltf-binary')) return item;
  }

  return null;
}

/**
 * Check if Trellis is reachable.
 */
export async function checkConnection() {
  try {
    const res = await fetch(`${API}/api/predict`, { method: 'GET' });
    // Gradio will return something even on GET
    return true;
  } catch {
    return false;
  }
}

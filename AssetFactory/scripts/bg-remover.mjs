/**
 * Background removal — ensures clean transparent PNG before Trellis.
 * Uses sharp for images that already have alpha, or can integrate with
 * external bg removal tools (rembg, etc.)
 */
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import config from './config.mjs';

/**
 * Remove/clean background from a source image.
 * Strategy:
 * 1. If image already has proper alpha transparency, validate and pass through
 * 2. If image has alpha but messy, clean up the alpha channel
 * 3. If no alpha, attempt color-based removal or flag for external tool
 *
 * @param {string} inputPath - source PNG
 * @param {string} outputPath - cleaned output PNG (can be same as input)
 * @returns {{ success: boolean, method: string, message: string }}
 */
export async function removeBackground(inputPath, outputPath) {
  const metadata = await sharp(inputPath).metadata();

  // If already has alpha, validate the transparency is real
  if (metadata.channels === 4) {
    const result = await validateAlpha(inputPath);
    if (result.transparentRatio > 0.15) {
      // Alpha looks good — clean up any semi-transparent edge noise
      await cleanAlpha(inputPath, outputPath);
      return { success: true, method: 'alpha_cleanup', message: 'Existing alpha cleaned' };
    }
  }

  // Try rembg (Python tool) if available
  const rembgResult = await tryRembg(inputPath, outputPath);
  if (rembgResult.success) return rembgResult;

  // Fallback: color-keyed removal (works for uniform backgrounds)
  const colorResult = await colorKeyRemoval(inputPath, outputPath);
  if (colorResult.success) return colorResult;

  return {
    success: false,
    method: 'none',
    message: 'Could not remove background — needs manual review or external tool'
  };
}

/**
 * Check how much real transparency exists in the alpha channel.
 */
async function validateAlpha(imagePath) {
  const { data, info } = await sharp(imagePath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  let transparentPixels = 0;
  const total = info.width * info.height;

  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 10) transparentPixels++;
  }

  return { transparentRatio: transparentPixels / total };
}

/**
 * Clean alpha channel — ensure fully transparent pixels are actually alpha=0
 * and reduce semi-transparent fringing.
 */
async function cleanAlpha(inputPath, outputPath) {
  const { data, info } = await sharp(inputPath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Clean: alpha < 30 → fully transparent, also zero RGB
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 30) {
      data[i] = 0;     // R
      data[i + 1] = 0;  // G
      data[i + 2] = 0;  // B
      data[i + 3] = 0;  // A
    }
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(outputPath);
}

/**
 * Try rembg (Python background removal tool).
 */
async function tryRembg(inputPath, outputPath) {
  const { execSync } = await import('child_process');
  try {
    execSync(`rembg i "${inputPath}" "${outputPath}"`, {
      timeout: 60000,
      stdio: 'pipe'
    });
    if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
      return { success: true, method: 'rembg', message: 'Background removed via rembg' };
    }
  } catch {
    // rembg not available or failed
  }
  return { success: false, method: 'rembg', message: 'rembg not available' };
}

/**
 * Color-key based background removal for uniform backgrounds.
 */
async function colorKeyRemoval(inputPath, outputPath) {
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const { data, info } = await image.ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width, h = info.height;

  // Sample corners for background color
  const samplePositions = [
    [0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1],
    [5, 5], [w - 6, 5], [5, h - 6], [w - 6, h - 6]
  ];

  const bgSamples = samplePositions.map(([x, y]) => {
    const idx = (y * w + x) * 4;
    return [data[idx], data[idx + 1], data[idx + 2]];
  });

  // Check if background is uniform enough
  const avg = [0, 0, 0];
  for (const s of bgSamples) { avg[0] += s[0]; avg[1] += s[1]; avg[2] += s[2]; }
  avg[0] /= bgSamples.length; avg[1] /= bgSamples.length; avg[2] /= bgSamples.length;

  const maxVariance = bgSamples.reduce((max, s) => {
    const d = Math.sqrt((s[0]-avg[0])**2 + (s[1]-avg[1])**2 + (s[2]-avg[2])**2);
    return Math.max(max, d);
  }, 0);

  if (maxVariance > 40) {
    return { success: false, method: 'color_key', message: 'Background not uniform enough for color keying' };
  }

  // Remove background by color distance
  const threshold = 50;
  let removed = 0;

  for (let i = 0; i < data.length; i += 4) {
    const dist = Math.sqrt(
      (data[i] - avg[0])**2 + (data[i+1] - avg[1])**2 + (data[i+2] - avg[2])**2
    );
    if (dist < threshold) {
      data[i] = 0; data[i+1] = 0; data[i+2] = 0; data[i+3] = 0;
      removed++;
    }
  }

  const removedRatio = removed / (w * h);
  if (removedRatio < 0.10) {
    return { success: false, method: 'color_key', message: 'Too few pixels matched background color' };
  }

  await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(outputPath);

  return {
    success: true,
    method: 'color_key',
    message: `Removed ${(removedRatio * 100).toFixed(1)}% background pixels`
  };
}

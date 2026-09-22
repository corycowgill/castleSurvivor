/**
 * Image validation — checks generated images before sending to Trellis.
 * Uses sharp for image analysis.
 */
import sharp from 'sharp';
import fs from 'fs';
import config from './config.mjs';

/**
 * Validate a generated source image.
 * @param {string} imagePath - path to PNG file
 * @returns {{ valid: boolean, issues: string[], stats: object }}
 */
export async function validateImage(imagePath) {
  const issues = [];

  if (!fs.existsSync(imagePath)) {
    return { valid: false, issues: ['File does not exist'], stats: {} };
  }

  const metadata = await sharp(imagePath).metadata();
  const { width, height, channels, format } = metadata;

  const stats = { width, height, channels, format };

  // Check dimensions
  if (width < 1024 || height < 1024) {
    issues.push(`Resolution too low: ${width}x${height} (need 1024x1024 min)`);
  }

  // Check aspect ratio (should be ~1:1)
  const ratio = width / height;
  if (ratio < 0.9 || ratio > 1.1) {
    issues.push(`Bad aspect ratio: ${ratio.toFixed(2)} (need ~1:1)`);
  }

  // Check format
  if (format !== 'png') {
    issues.push(`Wrong format: ${format} (need png)`);
  }

  // Analyze object coverage and centering
  const coverageResult = await analyzeCoverage(imagePath);
  stats.coverage = coverageResult;

  if (coverageResult.objectCoverage > 0.90) {
    issues.push(`Object too large: ${(coverageResult.objectCoverage * 100).toFixed(1)}% coverage (need <90%)`);
  }

  if (coverageResult.objectCoverage < 0.20) {
    issues.push(`Object too small: ${(coverageResult.objectCoverage * 100).toFixed(1)}% coverage (need >20%)`);
  }

  if (coverageResult.isCropped) {
    issues.push('Object appears cropped (touches image edge)');
  }

  if (!coverageResult.isCentered) {
    issues.push(`Object not centered (center offset: ${coverageResult.centerOffset.toFixed(2)})`);
  }

  // Check for transparency
  if (channels === 4) {
    stats.hasAlpha = true;
    if (coverageResult.backgroundAlpha < 0.5) {
      issues.push('Image has alpha channel but background is not transparent');
    }
  } else {
    stats.hasAlpha = false;
    // No alpha — check if background is uniform (removable)
    if (!coverageResult.uniformBackground) {
      issues.push('No transparency and background is not uniform — will need cleanup');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    stats
  };
}

/**
 * Analyze object coverage, centering, and background properties.
 */
async function analyzeCoverage(imagePath) {
  const image = sharp(imagePath);
  const { width, height, channels } = await image.metadata();
  const raw = await image.raw().toBuffer();
  const pixelCount = width * height;
  const stride = channels;

  let nonBgPixels = 0;
  let minX = width, maxX = 0, minY = height, maxY = 0;
  let edgePixels = 0;

  // Sample corner pixels to determine background color
  const corners = [
    getPixel(raw, 0, 0, width, stride),
    getPixel(raw, width - 1, 0, width, stride),
    getPixel(raw, 0, height - 1, width, stride),
    getPixel(raw, width - 1, height - 1, width, stride),
  ];

  const bgColor = averageColor(corners);
  const threshold = 40; // color distance threshold

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = getPixel(raw, x, y, width, stride);

      // Check alpha first if available
      if (channels === 4 && px[3] < 128) continue;

      const dist = colorDistance(px, bgColor);
      if (dist > threshold) {
        nonBgPixels++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        // Check edges
        if (x <= 2 || x >= width - 3 || y <= 2 || y >= height - 3) {
          edgePixels++;
        }
      }
    }
  }

  const objectCoverage = nonBgPixels / pixelCount;
  const isCropped = edgePixels > (width + height) * 0.05;

  // Centering: check if object bounding box center is near image center
  const objCenterX = (minX + maxX) / 2;
  const objCenterY = (minY + maxY) / 2;
  const imgCenterX = width / 2;
  const imgCenterY = height / 2;
  const centerOffset = Math.sqrt(
    ((objCenterX - imgCenterX) / width) ** 2 +
    ((objCenterY - imgCenterY) / height) ** 2
  );
  const isCentered = centerOffset < 0.15;

  // Background alpha check (for images with alpha)
  let bgAlphaPixels = 0;
  if (channels === 4) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * stride;
        if (raw[idx + 3] < 10) bgAlphaPixels++;
      }
    }
  }

  // Check if corner colors are uniform
  const cornerVariance = corners.reduce((sum, c) => {
    return sum + colorDistance(c, bgColor);
  }, 0) / corners.length;

  return {
    objectCoverage,
    isCropped,
    isCentered,
    centerOffset,
    backgroundAlpha: bgAlphaPixels / pixelCount,
    uniformBackground: cornerVariance < 20,
    boundingBox: { minX, minY, maxX, maxY }
  };
}

function getPixel(raw, x, y, width, stride) {
  const idx = (y * width + x) * stride;
  return [raw[idx], raw[idx + 1], raw[idx + 2], stride > 3 ? raw[idx + 3] : 255];
}

function colorDistance(a, b) {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  );
}

function averageColor(pixels) {
  const avg = [0, 0, 0, 0];
  for (const p of pixels) {
    avg[0] += p[0]; avg[1] += p[1]; avg[2] += p[2]; avg[3] += p[3];
  }
  return avg.map(v => v / pixels.length);
}

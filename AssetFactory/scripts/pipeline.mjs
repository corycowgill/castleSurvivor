#!/usr/bin/env node
/**
 * Asset Factory Pipeline — main orchestrator.
 *
 * Usage:
 *   node pipeline.mjs status              — show catalog stats
 *   node pipeline.mjs run [--batch N]     — process next pending assets (default batch 1)
 *   node pipeline.mjs run --ids a,b,c     — process specific asset IDs
 *   node pipeline.mjs resume              — resume from where we left off
 *   node pipeline.mjs validate-images     — validate all existing source images
 *   node pipeline.mjs validate-glbs       — validate all existing raw GLBs
 *   node pipeline.mjs optimize            — optimize all validated raw GLBs
 *   node pipeline.mjs report              — generate full validation report
 */
import fs from 'fs';
import path from 'path';
import config from './config.mjs';
import * as catalog from './catalog.mjs';
import { generateImage, checkConnection as checkComfyUI } from './comfyui-client.mjs';
import { validateImage } from './image-validator.mjs';
import { removeBackground } from './bg-remover.mjs';
import { generateGLB, checkConnection as checkTrellis } from './trellis-client.mjs';
import { validateGLB } from './glb-validator.mjs';
import { normalizeGLB } from './glb-normalizer.mjs';
import { optimizeGLB } from './glb-optimizer.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'status';

async function main() {
  console.log('\n=== Asset Factory Pipeline ===\n');

  switch (command) {
    case 'status':
      return showStatus();
    case 'run':
      return runPipeline();
    case 'resume':
      return resumePipeline();
    case 'validate-images':
      return validateAllImages();
    case 'validate-glbs':
      return validateAllGLBs();
    case 'optimize':
      return optimizeAll();
    case 'report':
      return generateReport();
    default:
      console.log(`Unknown command: ${command}`);
      console.log('Usage: node pipeline.mjs [status|run|resume|validate-images|validate-glbs|optimize|report]');
  }
}

// ─── STATUS ──────────────────────────────────────────

function showStatus() {
  const stats = catalog.getStats();
  console.log('Catalog Stats:');
  console.log(`  Total assets: ${stats.total}`);
  for (const [status, count] of Object.entries(stats)) {
    if (status === 'total') continue;
    console.log(`  ${status}: ${count}`);
  }

  // Count files on disk
  const sourceCount = countFiles(config.sourceImages, '.png');
  const rawGlbCount = countFiles(config.glbRaw, '.glb');
  const optGlbCount = countFiles(config.glbOptimized, '.glb');
  const thumbCount = countFiles(config.thumbnails, '.png');

  console.log('\nFiles on disk:');
  console.log(`  Source images: ${sourceCount}`);
  console.log(`  Raw GLBs: ${rawGlbCount}`);
  console.log(`  Optimized GLBs: ${optGlbCount}`);
  console.log(`  Thumbnails: ${thumbCount}`);
}

function countFiles(dir, ext) {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith(ext)) count++;
  }
  return count;
}

// ─── FULL PIPELINE RUN ──────────────────────────────

async function runPipeline() {
  // Parse args
  let assets;
  const batchFlag = args.indexOf('--batch');
  const idsFlag = args.indexOf('--ids');

  if (idsFlag !== -1 && args[idsFlag + 1]) {
    const ids = args[idsFlag + 1].split(',');
    const allAssets = catalog.loadAssets();
    assets = allAssets.filter(a => ids.includes(a.id));
    if (assets.length === 0) {
      console.log('No matching assets found for the given IDs');
      return;
    }
  } else if (batchFlag !== -1 && args[batchFlag + 1]) {
    const batchNum = parseInt(args[batchFlag + 1]);
    assets = catalog.getBatch(batchNum).filter(a => a.status === 'pending');
  } else {
    // Default: batch 1 pending assets
    assets = catalog.getBatch(1).filter(a => a.status === 'pending');
  }

  if (assets.length === 0) {
    console.log('No pending assets to process.');
    return;
  }

  console.log(`Processing ${assets.length} assets...\n`);

  // Check service availability
  const comfyOk = await checkComfyUI();
  const trellisOk = await checkTrellis();

  if (!comfyOk) {
    console.log('WARNING: ComfyUI is not reachable. Image generation will be skipped.');
    console.log('  Start ComfyUI and ensure it is running on ' + config.comfyui.url);
  }

  if (!trellisOk) {
    console.log('WARNING: Trellis is not reachable. GLB generation will be skipped.');
    console.log('  Start Trellis and ensure it is running on ' + config.trellis.url);
  }

  for (const asset of assets) {
    console.log(`\n--- ${asset.id} (${asset.name}) ---`);
    await processAsset(asset, { comfyOk, trellisOk });
  }

  console.log('\n=== Pipeline run complete ===');
  showStatus();
}

async function processAsset(asset, { comfyOk, trellisOk }) {
  const id = asset.id;

  try {
    // Stage 1: Image Generation
    if (asset.status === 'pending' && comfyOk) {
      catalog.updateAsset(id, { status: 'image_generating' });

      let imagePath = null;
      for (let attempt = 0; attempt < config.image.maxAttempts; attempt++) {
        try {
          imagePath = await generateImage(asset, attempt);

          // Validate the image
          const validation = await validateImage(imagePath);
          if (validation.valid) {
            console.log(`  Image validated OK`);
            break;
          } else {
            console.log(`  Image validation failed (attempt ${attempt + 1}):`);
            validation.issues.forEach(i => console.log(`    - ${i}`));
            imagePath = null;
          }
        } catch (err) {
          console.log(`  Image generation error (attempt ${attempt + 1}): ${err.message}`);
        }
      }

      if (!imagePath) {
        catalog.markFailed(id, 'All image generation attempts failed', 'image');
        return;
      }

      catalog.updateAsset(id, { status: 'image_complete', image: imagePath });
      catalog.markGenerated(id, 'image', { path: imagePath });
    }

    // Stage 2: Background Removal
    if (['image_complete'].includes(asset.status) || asset.image) {
      const imgPath = asset.image || findSourceImage(id);
      if (!imgPath || !fs.existsSync(imgPath)) {
        console.log('  No source image found, skipping bg removal');
      } else {
        catalog.updateAsset(id, { status: 'bg_removing' });
        const bgResult = await removeBackground(imgPath, imgPath); // in-place
        console.log(`  Background: ${bgResult.message}`);
        if (!bgResult.success) {
          console.log('  WARNING: Background removal failed — proceeding anyway');
        }
        catalog.updateAsset(id, { status: 'bg_complete' });
      }
    }

    // Stage 3: Trellis 3D Generation
    if (['bg_complete'].includes(asset.status) && trellisOk) {
      const imgPath = asset.image || findSourceImage(id);
      if (!imgPath) {
        catalog.markFailed(id, 'No source image for Trellis', 'trellis');
        return;
      }

      catalog.updateAsset(id, { status: 'trellis_generating' });
      try {
        const glbPath = await generateGLB(imgPath, id);

        // Validate the GLB
        const validation = await validateGLB(glbPath);
        if (!validation.valid) {
          console.log('  GLB validation issues:');
          validation.issues.forEach(i => console.log(`    - ${i}`));
          // Non-fatal issues: continue but log
          if (validation.stats.vertexCount === 0 || validation.stats.meshCount === 0) {
            catalog.markFailed(id, 'Empty GLB from Trellis', 'glb');
            return;
          }
        }

        console.log(`  GLB: ${validation.stats.triangleCount} tris, ${validation.stats.materialCount} mats`);
        catalog.updateAsset(id, { status: 'glb_complete', glb: glbPath });
        catalog.markGenerated(id, 'glb', validation.stats);
      } catch (err) {
        catalog.markFailed(id, err.message, 'trellis');
        return;
      }
    }

    // Stage 4: Normalize + Optimize
    if (['glb_complete'].includes(asset.status)) {
      const rawGlb = asset.glb || path.join(config.glbRaw, `${id}.glb`);
      if (!fs.existsSync(rawGlb)) {
        console.log('  No raw GLB found, skipping optimization');
        return;
      }

      catalog.updateAsset(id, { status: 'optimizing' });

      // Normalize origin + scale
      const normalizedPath = path.join(config.glbRaw, `${id}_normalized.glb`);
      const normResult = await normalizeGLB(rawGlb, normalizedPath, id);
      console.log(`  Normalized: scale ${normResult.scaleFactor.toFixed(3)}x, origin: ${normResult.newOrigin}`);

      // Optimize (Draco + WebP + texture resize)
      const optimizedPath = path.join(config.glbOptimized, `${id}.glb`);
      const optResult = await optimizeGLB(normalizedPath, optimizedPath, asset);
      console.log(`  Optimized: ${optResult.reduction} reduction (${(optResult.sizeAfter/1024).toFixed(0)}KB)`);

      // Clean up intermediate
      if (fs.existsSync(normalizedPath)) fs.unlinkSync(normalizedPath);

      catalog.updateAsset(id, {
        status: 'ready',
        glbOptimized: optimizedPath,
        optimization: optResult
      });
      catalog.markGenerated(id, 'optimize', optResult);
      console.log(`  READY`);
    }

  } catch (err) {
    console.error(`  ERROR processing ${id}: ${err.message}`);
    catalog.markFailed(id, err.message, 'pipeline');
  }
}

/**
 * Find source image for an asset by checking known locations.
 */
function findSourceImage(assetId) {
  const dirs = ['props', 'vegetation', 'village', 'combat', 'terrain', 'landmarks'];
  for (const dir of dirs) {
    const p = path.join(config.sourceImages, dir, `${assetId}.png`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ─── RESUME ──────────────────────────────────────────

async function resumePipeline() {
  console.log('Resuming pipeline from last state...\n');

  const assets = catalog.loadAssets();
  const inProgress = assets.filter(a =>
    ['image_generating', 'bg_removing', 'trellis_generating', 'optimizing',
     'image_complete', 'bg_complete', 'glb_complete'].includes(a.status)
  );

  if (inProgress.length === 0) {
    console.log('Nothing to resume. All assets are either pending, ready, or failed.');
    return;
  }

  console.log(`Found ${inProgress.length} assets to resume.\n`);

  const comfyOk = await checkComfyUI();
  const trellisOk = await checkTrellis();

  for (const asset of inProgress) {
    console.log(`\n--- ${asset.id} (status: ${asset.status}) ---`);
    await processAsset(asset, { comfyOk, trellisOk });
  }

  console.log('\n=== Resume complete ===');
  showStatus();
}

// ─── BULK VALIDATION ──────────────────────────────────

async function validateAllImages() {
  console.log('Validating all source images...\n');
  const results = [];

  const dirs = ['props', 'vegetation', 'village', 'combat', 'terrain', 'landmarks'];
  for (const dir of dirs) {
    const fullDir = path.join(config.sourceImages, dir);
    if (!fs.existsSync(fullDir)) continue;

    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.png'));
    for (const file of files) {
      const filePath = path.join(fullDir, file);
      const result = await validateImage(filePath);
      const id = path.basename(file, '.png');
      results.push({ id, ...result });
      console.log(`  ${id}: ${result.valid ? 'OK' : 'FAIL'} ${result.issues.join(', ')}`);
    }
  }

  // Save report
  const reportPath = path.join(config.reports, 'image_validation.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nReport saved: ${reportPath}`);
}

async function validateAllGLBs() {
  console.log('Validating all raw GLBs...\n');
  const results = [];

  if (!fs.existsSync(config.glbRaw)) return;
  const files = fs.readdirSync(config.glbRaw).filter(f => f.endsWith('.glb'));

  for (const file of files) {
    const filePath = path.join(config.glbRaw, file);
    const result = await validateGLB(filePath);
    const id = path.basename(file, '.glb');
    results.push({ id, ...result });
    console.log(`  ${id}: ${result.valid ? 'OK' : 'FAIL'} — ${result.stats.triangleCount || 0} tris, ${result.stats.fileSizeMB || '?'}MB`);
  }

  const reportPath = path.join(config.reports, 'glb_validation.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nReport saved: ${reportPath}`);
}

// ─── OPTIMIZE ALL ────────────────────────────────────

async function optimizeAll() {
  console.log('Optimizing all validated GLBs...\n');

  const assets = catalog.getByStatus('glb_complete');
  if (assets.length === 0) {
    console.log('No GLBs ready for optimization.');
    return;
  }

  for (const asset of assets) {
    console.log(`  ${asset.id}...`);
    await processAsset(asset, { comfyOk: false, trellisOk: false });
  }
}

// ─── REPORT ──────────────────────────────────────────

async function generateReport() {
  console.log('Generating full pipeline report...\n');

  const assets = catalog.loadAssets();
  const report = {
    timestamp: new Date().toISOString(),
    summary: catalog.getStats(),
    assets: []
  };

  for (const asset of assets) {
    const entry = {
      id: asset.id,
      name: asset.name,
      category: asset.category,
      status: asset.status
    };

    // Check for source image
    const imgPath = findSourceImage(asset.id);
    if (imgPath) {
      entry.sourceImage = imgPath;
      entry.imageValidation = await validateImage(imgPath);
    }

    // Check for raw GLB
    const rawGlb = path.join(config.glbRaw, `${asset.id}.glb`);
    if (fs.existsSync(rawGlb)) {
      entry.rawGlb = rawGlb;
      entry.glbValidation = await validateGLB(rawGlb);
    }

    // Check for optimized GLB
    const optGlb = path.join(config.glbOptimized, `${asset.id}.glb`);
    if (fs.existsSync(optGlb)) {
      entry.optimizedGlb = optGlb;
      entry.optimizedSize = fs.statSync(optGlb).size;
    }

    report.assets.push(entry);
  }

  const reportPath = path.join(config.reports, 'pipeline_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Report saved: ${reportPath}`);
  console.log(`  ${report.summary.total} total assets`);
  console.log(`  ${report.summary.ready || 0} ready`);
  console.log(`  ${(report.summary.image_failed || 0) + (report.summary.glb_failed || 0)} failed`);
}

main().catch(err => {
  console.error('Pipeline error:', err);
  process.exit(1);
});

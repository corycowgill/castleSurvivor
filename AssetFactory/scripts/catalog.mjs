/**
 * Catalog manager — reads/writes asset catalog, tracks pipeline state.
 * Every mutation is immediately persisted to disk.
 */
import fs from 'fs';
import path from 'path';
import config from './config.mjs';

const ASSETS_PATH = path.join(config.catalog, 'assets.json');
const GENERATED_PATH = path.join(config.catalog, 'generated.json');
const FAILED_PATH = path.join(config.catalog, 'failed.json');

export function loadAssets() {
  return JSON.parse(fs.readFileSync(ASSETS_PATH, 'utf-8'));
}

export function saveAssets(assets) {
  fs.writeFileSync(ASSETS_PATH, JSON.stringify(assets, null, 2));
}

export function loadGenerated() {
  return JSON.parse(fs.readFileSync(GENERATED_PATH, 'utf-8'));
}

export function loadFailed() {
  return JSON.parse(fs.readFileSync(FAILED_PATH, 'utf-8'));
}

/** Get a single asset by ID */
export function getAsset(id) {
  return loadAssets().find(a => a.id === id) || null;
}

/** Update a single asset's fields and persist */
export function updateAsset(id, updates) {
  const assets = loadAssets();
  const idx = assets.findIndex(a => a.id === id);
  if (idx === -1) throw new Error(`Asset not found: ${id}`);
  Object.assign(assets[idx], updates);
  saveAssets(assets);
  return assets[idx];
}

/** Move an asset to failed log */
export function markFailed(id, reason, stage) {
  const asset = updateAsset(id, { status: `${stage}_failed` });
  const failed = loadFailed();
  failed.push({
    id,
    reason,
    stage,
    timestamp: new Date().toISOString()
  });
  fs.writeFileSync(FAILED_PATH, JSON.stringify(failed, null, 2));
  return asset;
}

/** Record a successful generation */
export function markGenerated(id, stage, metadata) {
  const generated = loadGenerated();
  generated.push({
    id,
    stage,
    metadata,
    timestamp: new Date().toISOString()
  });
  fs.writeFileSync(GENERATED_PATH, JSON.stringify(generated, null, 2));
}

/** Get all assets for a given batch number */
export function getBatch(batchNum) {
  return loadAssets().filter(a => a.batch === batchNum);
}

/** Get all assets with a given status */
export function getByStatus(status) {
  return loadAssets().filter(a => a.status === status);
}

/** Get next pending assets up to limit */
export function getNextPending(limit = 10) {
  return loadAssets()
    .filter(a => a.status === 'pending')
    .sort((a, b) => a.batch - b.batch)
    .slice(0, limit);
}

/** Summary stats */
export function getStats() {
  const assets = loadAssets();
  const counts = {};
  for (const a of assets) {
    counts[a.status] = (counts[a.status] || 0) + 1;
  }
  return { total: assets.length, ...counts };
}

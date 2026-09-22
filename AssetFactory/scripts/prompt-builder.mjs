/**
 * Prompt builder — assembles full SD prompts from templates + asset metadata.
 * Templates use {base_prompt}, {asset_description}, {extra_details} placeholders.
 */
import fs from 'fs';
import path from 'path';
import config from './config.mjs';

const templateCache = {};

function loadTemplate(name) {
  if (templateCache[name]) return templateCache[name];
  const filepath = path.join(config.prompts, 'category_prompts', `${name}.txt`);
  templateCache[name] = fs.readFileSync(filepath, 'utf-8');
  return templateCache[name];
}

function loadBasePrompt() {
  if (templateCache._base) return templateCache._base;
  templateCache._base = fs.readFileSync(
    path.join(config.prompts, 'base_prompt.txt'), 'utf-8'
  );
  return templateCache._base;
}

export function loadNegativePrompt() {
  if (templateCache._negative) return templateCache._negative;
  templateCache._negative = fs.readFileSync(
    path.join(config.prompts, 'negative_prompt.txt'), 'utf-8'
  );
  return templateCache._negative;
}

/**
 * Build a full positive prompt for an asset.
 * @param {object} asset - catalog entry
 * @returns {string} complete prompt
 */
export function buildPrompt(asset) {
  const base = loadBasePrompt();
  const template = loadTemplate(asset.promptTemplate);

  return template
    .replace('{base_prompt}', base)
    .replace('{asset_description}', asset.promptDetails || asset.name)
    .replace('{extra_details}', '')
    .trim();
}

/**
 * Build prompts for a batch of assets.
 * @param {object[]} assets
 * @returns {{ id: string, positive: string, negative: string }[]}
 */
export function buildBatchPrompts(assets) {
  const negative = loadNegativePrompt();
  return assets.map(asset => ({
    id: asset.id,
    positive: buildPrompt(asset),
    negative
  }));
}

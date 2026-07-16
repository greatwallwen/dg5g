#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { textbookOutput, textbookOutputRelative } from './textbook-paths.mjs';

const root = process.cwd();
const manifestPath = path.join(root, 'packages', 'edugame-assets', 'asset-manifest.json');
const failures = [];
const warnings = [];
const expectedSchema = 'dgbook.edugame-assets/v1';
const expectedPack = 'dgbook-5g-v1';
const minimumCounts = {
  icon: 12,
  card: 3,
  ui: 4,
  background: 2,
  particle: 4,
  audio: 4,
  animation: 2,
};
const safeProceduralFormats = new Set(['procedural', 'procedural-css', 'procedural-audio', 'synth', 'config']);
const allowedLicenses = new Set(['internal', 'CC0', 'MIT', 'Apache-2.0', 'CC-BY-4.0']);

const manifest = readJson(manifestPath);
auditManifest(manifest);
auditWidgetAssetPacks(manifest.asset_pack);
auditAssetDocs();

const report = {
  tool: 'audit-edugame-assets',
  summary: {
    failures: failures.length,
    warnings: warnings.length,
    assetCount: Array.isArray(manifest.assets) ? manifest.assets.length : 0,
  },
  categoryCounts: countByType(manifest.assets),
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;

function auditManifest(data) {
  if (!data || typeof data !== 'object') {
    fail('manifest-empty', 'asset manifest must be a JSON object');
    return;
  }
  if (data.schema !== expectedSchema) fail('schema', `expected schema ${expectedSchema}`);
  if (data.asset_pack !== expectedPack) fail('asset-pack', `expected asset_pack ${expectedPack}`);
  if (data.style !== 'light-sci-fi-engineering') fail('style', 'asset style must stay light-sci-fi-engineering');
  if (!String(data.source_policy ?? '').includes('metadata')) fail('source-policy', 'source_policy must require metadata');

  const assets = Array.isArray(data.assets) ? data.assets : [];
  if (!assets.length) fail('assets-empty', 'asset manifest has no assets');
  const ids = new Set();
  for (const asset of assets) {
    auditAsset(asset, ids);
  }
  const counts = countByType(assets);
  for (const [type, minimum] of Object.entries(minimumCounts)) {
    if ((counts[type] ?? 0) < minimum) {
      fail('asset-category-count', `${type} needs at least ${minimum} asset(s), found ${counts[type] ?? 0}`);
    }
  }
}

function auditAsset(asset, ids) {
  if (!asset || typeof asset !== 'object') {
    fail('asset-shape', 'asset entry must be an object');
    return;
  }
  for (const key of ['asset_id', 'type', 'domain', 'object', 'format', 'license', 'source']) {
    if (!hasText(asset[key])) fail('asset-field', `${asset.asset_id ?? '(unknown)'} missing ${key}`);
  }
  if (!/^([a-z]+)_([a-z0-9-]+)_([a-z0-9-]+)_([a-z0-9-]+)_v\d{3}$/i.test(String(asset.asset_id ?? ''))) {
    fail('asset-id-format', `${asset.asset_id ?? '(unknown)'} does not follow type_domain_object_state_v001`);
  }
  if (ids.has(asset.asset_id)) fail('asset-id-duplicate', `${asset.asset_id} duplicated`);
  ids.add(asset.asset_id);
  if (!allowedLicenses.has(asset.license)) {
    fail('asset-license', `${asset.asset_id} uses unsupported license ${asset.license}`);
  }
  if (!Array.isArray(asset.tags) || asset.tags.length < 2) {
    fail('asset-tags', `${asset.asset_id} needs at least two tags`);
  }
  if (!Array.isArray(asset.allowed_usage) || !asset.allowed_usage.includes('game')) {
    fail('asset-usage', `${asset.asset_id} must declare game usage when stored in edugame-assets`);
  }
  if (!safeProceduralFormats.has(asset.format) && !hasText(asset.file)) {
    fail('asset-file', `${asset.asset_id} uses ${asset.format} and needs a file path`);
  }
  if (/unknown|todo|placeholder/i.test(`${asset.source} ${asset.license}`)) {
    fail('asset-source', `${asset.asset_id} has unclear source or license`);
  }
}

function auditWidgetAssetPacks(assetPack) {
  const widgetDir = textbookOutput('widgets');
  if (!existsSync(widgetDir)) {
    warn('widgets-missing', `${textbookOutputRelative('widgets')} not found`);
    return;
  }
  const files = readdirSync(widgetDir).filter((file) => file.endsWith('-edugame-interactive-001.json'));
  if (files.length !== 18) fail('widget-count', `expected 18 edugame widgets, found ${files.length}`);
  for (const file of files) {
    const widget = readJson(path.join(widgetDir, file));
    const config = widget?.props?.gameConfig ?? {};
    if (config.asset_pack !== assetPack) {
      fail('widget-asset-pack', `${file} uses ${config.asset_pack ?? '(missing)'}, expected ${assetPack}`);
    }
  }
}

function auditAssetDocs() {
  const docPath = path.join(root, 'docs', 'asset-spec.md');
  if (!existsSync(docPath)) {
    fail('asset-doc', 'docs/asset-spec.md missing');
    return;
  }
  const doc = readFileSync(docPath, 'utf-8');
  for (const term of ['asset-manifest.json', 'PixiJS', 'CC0', 'Tabler', 'Kenney', 'allowed_usage']) {
    if (!doc.includes(term)) fail('asset-doc', `docs/asset-spec.md missing ${term}`);
  }
}

function countByType(assets) {
  const counts = {};
  if (!Array.isArray(assets)) return counts;
  for (const asset of assets) counts[asset.type] = (counts[asset.type] ?? 0) + 1;
  return counts;
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (error) {
    fail('json-parse', `${path.relative(root, filePath)} cannot be parsed: ${error.message}`);
    return {};
  }
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function fail(code, message) {
  failures.push({ code, message });
}

function warn(code, message) {
  warnings.push({ code, message });
}

#!/usr/bin/env node
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { textbookOutputRelative } from './textbook-paths.mjs';

const root = process.cwd();
const failures = [];
const warnings = [];

const authoringMediaRoots = ['site/public/media'];
const runtimeVerifiedMediaRoots = ['apps/web/public/media'];
const contentRoots = [
  'content',
  'textbook',
  ...authoringMediaRoots,
  'site/public/avatars',
  'site/public/interactives',
  ...runtimeVerifiedMediaRoots,
];
const codeRoots = ['packages', 'apps/web/src', 'scripts', 'schemas', 'templates', 'tools', 'config'];
const allowedAssetCodeRoots = ['packages/edugame-assets', 'packages/animation/assets'];
const allowedAssetCodePaths = ['apps/web/src/app/icon.svg'];
const sourceExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.astro', '.vue', '.svelte', '.ps1', '.sh']);
const assetExts = new Set(['.docx', '.pptx', '.xlsx', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.mp4', '.webm', '.wav', '.mp3']);

for (const rootDir of contentRoots) {
  for (const file of await walk(rootDir)) {
    if (sourceExts.has(path.extname(file).toLowerCase())) {
      fail('content-source-code', `${file} is code inside a textbook/content asset root`);
    }
  }
}

for (const rootDir of codeRoots) {
  for (const file of await walk(rootDir)) {
    if (isAllowedAssetCodePath(file)) continue;
    if (assetExts.has(path.extname(file).toLowerCase())) {
      fail('code-binary-asset', `${file} is a binary/media asset inside code root ${rootDir}`);
    }
  }
}

await requirePath(textbookOutputRelative('outline'), '5G textbook outline must follow manifest outputs.outline');
await requirePath(textbookOutputRelative('projects'), 'generated lesson pages must follow manifest outputs.projects');
await requirePath(textbookOutputRelative('widgets'), 'generated widget JSON must follow manifest outputs.widgets');
await requirePath(authoringMediaRoots[0], 'importer/authoring media source must stay in site/public/media/');
await requirePath(runtimeVerifiedMediaRoots[0], 'verified runtime media closure must stay in apps/web/public/media/');
await requirePath('config/textbooks/5g/textbook.manifest.json', 'current 5G textbook must have an explicit book manifest');
await requirePath('packages/edugame-assets/asset-manifest.json', 'game assets must be described by packages/edugame-assets/asset-manifest.json');
await requirePath('README.md', 'asset/code boundary documentation is required');
await forbidPath('5g.docx', 'source DOCX must live under content/<book-id>/, not the repository root');

const report = {
  tool: 'audit-textbook-boundaries',
  summary: {
    failures: failures.length,
    warnings: warnings.length,
    contentRoots,
    codeRoots,
    authoringMediaRoots,
    runtimeVerifiedMediaRoots,
    allowedAssetCodeRoots,
    allowedAssetCodePaths,
  },
  failures,
  warnings,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;

async function walk(relativeDir) {
  const absolute = path.join(root, relativeDir);
  if (!(await exists(relativeDir))) return [];
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(relativeDir, entry.name).replaceAll(path.sep, '/');
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    if (entry.isDirectory()) files.push(...await walk(relative));
    else files.push(relative);
  }
  return files;
}

async function exists(relativePath) {
  try {
    await stat(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function requirePath(relativePath, message) {
  if (!(await exists(relativePath))) fail('required-path', `${message}: missing ${relativePath}`);
}

async function forbidPath(relativePath, message) {
  if (await exists(relativePath)) fail('forbidden-path', `${message}: found ${relativePath}`);
}

function isAllowedAssetCodePath(file) {
  return allowedAssetCodePaths.includes(file)
    || allowedAssetCodeRoots.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));
}

function fail(code, message) {
  failures.push({ code, message });
}

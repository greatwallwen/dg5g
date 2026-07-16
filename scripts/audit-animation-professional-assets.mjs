#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { textbookOutput } from './textbook-paths.mjs';

const root = process.cwd();
const widgetDir = textbookOutput('widgets');
const failures = [];
const rows = [];

for (const file of readdirSync(widgetDir).filter((name) => /^P\d{2}-lesson-animation-\d+\.json$/i.test(name)).sort()) {
  const fullPath = path.join(widgetDir, file);
  const data = JSON.parse(readFileSync(fullPath, 'utf-8'));
  const projectId = file.match(/^(P\d{2})-/)?.[1] ?? file;
  const elements = collectElements(data);
  const images = elements.filter((element) => element.type === 'image');
  const svgImages = images.filter((element) => String(element.src ?? '').startsWith('data:image/svg+xml'));
  const iconKinds = new Set(svgImages
    .map((element) => String(element.iconKind ?? element.ariaLabel ?? element.alt ?? '').trim())
    .filter(Boolean));
  rows.push({ projectId, images: images.length, svgImages: svgImages.length, iconKinds: [...iconKinds].sort() });

  if (svgImages.length < 4) {
    fail(projectId, 'icon-density', `${projectId} has only ${svgImages.length} SVG pictograms`);
  }
  if (iconKinds.size < 3) {
    fail(projectId, 'icon-variety', `${projectId} has only ${iconKinds.size} pictogram kinds`);
  }

  for (const image of svgImages) {
    const svg = decodeSvgDataUri(String(image.src ?? ''));
    if (!svg) {
      fail(projectId, 'svg-decode', `${image.id ?? '(image)'} SVG data URI could not be decoded`);
      continue;
    }
    if (/<text\b/i.test(svg)) {
      fail(projectId, 'svg-text', `${image.id ?? '(image)'} contains visible text inside pictogram SVG`);
    }
    if (!/<path|<circle|<rect|<line|<polyline/i.test(svg)) {
      fail(projectId, 'svg-empty', `${image.id ?? '(image)'} lacks vector geometry`);
    }
  }
}

const report = {
  tool: 'audit-animation-professional-assets',
  totals: {
    projects: rows.length,
    failures: failures.length,
  },
  rows,
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;

function collectElements(value) {
  const result = [];
  visit(value);
  return result;

  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node.id === 'string' && typeof node.type === 'string') result.push(node);
    for (const child of Object.values(node)) visit(child);
  }
}

function decodeSvgDataUri(uri) {
  const [, payload = ''] = uri.split(',', 2);
  if (!payload) return '';
  try {
    return decodeURIComponent(payload);
  } catch {
    try {
      return Buffer.from(payload, 'base64').toString('utf-8');
    } catch {
      return '';
    }
  }
}

function fail(scope, code, message) {
  failures.push({ scope, code, message });
}

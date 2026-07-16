#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { MANIM_REQUIRED_TARGETS } from './manim-scene-sources.mjs';

const root = process.cwd();
const release = process.argv.includes('--release');
const manifests = [
  ...await findManifests(path.join(root, 'site', 'public', 'media', 'manim')),
];
const failures = [];
const warnings = [];

for (const file of manifests) await validateManifest(file);
if (release) await validateReleaseCoverage();

for (const warning of warnings) console.warn(`WARN ${warning}`);
for (const failure of failures) console.error(`ERROR ${failure}`);
if (failures.length) {
  console.error(`Media asset validation failed: ${failures.length} error(s).`);
  process.exitCode = 1;
} else {
  console.log(`Media asset validation passed (${manifests.length} manifest(s)).`);
}

async function validateManifest(file) {
  let data;
  try {
    data = JSON.parse(await readFile(file, 'utf-8'));
  } catch (error) {
    fail(file, `invalid JSON: ${error.message}`);
    return;
  }
  if (!data.schema) fail(file, 'missing schema');
  if (!data.id) fail(file, 'missing id');
  if (data.schema === 'dgbook.asset.manim-animation/v1') validateManim(file, data);
  else fail(file, `unknown schema ${data.schema}`);
}

function validateManim(file, data) {
  const status = String(data.status ?? '');
  if (release && status !== 'rendered') fail(file, `release requires rendered status, got ${status || 'missing'}`);
  if (!release && !['dry-run', 'placeholder', 'rendered', 'missing-renderer', 'render-failed'].includes(status)) {
    warn(file, `unusual status ${status || 'missing'}`);
  }
  const sourcePath = data.source?.path ? path.join(root, data.source.path) : '';
  if (!sourcePath || !existsSync(sourcePath)) fail(file, `source scene missing: ${data.source?.path ?? '(none)'}`);
  const posterUrl = data.outputs?.posterUrl;
  const videoUrl = data.outputs?.videoUrl;
  if (posterUrl && !existsSync(publicPath(posterUrl))) fail(file, `poster missing: ${posterUrl}`);
  if (videoUrl && !existsSync(publicPath(videoUrl))) fail(file, `video missing: ${videoUrl}`);
  if (release && !videoUrl) fail(file, 'release requires videoUrl');
}

async function validateReleaseCoverage() {
  for (const target of MANIM_REQUIRED_TARGETS) {
    const manifest = await readJson(path.join(root, 'site', 'public', 'media', 'manim', target.project.toLowerCase(), target.template, 'manifest.json'));
    if (manifest?.status !== 'rendered') fail(`manim:${target.project}`, `${target.project}/${target.template} is not rendered`);
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf-8'));
  } catch {
    return null;
  }
}

async function findManifests(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await findManifests(full));
    else if (entry.name === 'manifest.json') files.push(full);
  }
  return files;
}

function publicPath(url) {
  return path.join(root, 'site', 'public', String(url).replace(/^\//, ''));
}

function fail(file, message) {
  failures.push(`${rel(file)}: ${message}`);
}

function warn(file, message) {
  warnings.push(`${rel(file)}: ${message}`);
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

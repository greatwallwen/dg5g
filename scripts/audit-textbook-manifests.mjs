#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const configRoot = path.join(root, 'config', 'textbooks');
const failures = [];
const manifests = [];
const requiredCapabilities = ['lesson-animation', 'openmaic-style-playback', 'qwen-tts', 'manim', 'edugame-pixi'];
const requiredGates = ['audit:textbook-boundaries', 'audit:product-closure'];
const requiredOutputs = ['outline', 'projects', 'widgets', 'generatedAst', 'animations', 'media', 'manim', 'tts'];

if (!existsSync(configRoot)) {
  fail('missing-config-root', 'config/textbooks is missing');
} else {
  for (const entry of readdirSync(configRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join('config', 'textbooks', entry.name, 'textbook.manifest.json');
    const manifest = readJson(manifestPath);
    if (!manifest) continue;
    manifests.push(auditManifest(entry.name, manifestPath, manifest));
  }
}

if (!manifests.length) fail('manifest-count', 'no textbook manifests found');

const report = {
  tool: 'audit-textbook-manifests',
  summary: {
    failures: failures.length,
    manifests: manifests.length,
  },
  manifests,
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;

function auditManifest(folder, manifestPath, manifest) {
  const row = {
    bookId: String(manifest.bookId ?? ''),
    manifestPath,
    sourcePath: String(manifest.source?.path ?? ''),
    preferredSourcePath: String(manifest.source?.preferredPath ?? ''),
    migrationStatus: String(manifest.source?.migrationStatus ?? ''),
    configRoot: String(manifest.configRoot ?? ''),
    importer: String(manifest.importer ?? ''),
    rulePackage: String(manifest.rulePackage ?? ''),
    capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities.length : 0,
    gates: Array.isArray(manifest.qualityGates) ? manifest.qualityGates.length : 0,
    outputs: Object.keys(manifest.outputs ?? {}).length,
  };

  if (row.bookId !== folder) fail('book-id', `${manifestPath} bookId must match folder ${folder}`);
  requireString(row.bookId, 'bookId', manifestPath);
  requireString(manifest.title, 'title', manifestPath);
  requireString(manifest.version, 'version', manifestPath);
  requireExistingPath(row.sourcePath, 'source.path', manifestPath);
  requireString(row.preferredSourcePath, 'source.preferredPath', manifestPath);
  if (!row.sourcePath.startsWith(`content/${row.bookId}/`)) {
    fail('source-root', `${manifestPath} source.path must live under content/${row.bookId}/`);
  }
  requireExistingPath(row.configRoot, 'configRoot', manifestPath);
  requireExistingPath(row.importer, 'importer', manifestPath);
  requireExistingPath(row.rulePackage, 'rulePackage', manifestPath);

  for (const [name, outputPath] of Object.entries(manifest.outputs ?? {})) {
    requireExistingPath(String(outputPath), `outputs.${name}`, manifestPath);
  }
  for (const name of requiredOutputs) {
    requireExistingPath(String(manifest.outputs?.[name] ?? ''), `outputs.${name}`, manifestPath);
  }
  for (const capability of requiredCapabilities) {
    if (!manifest.capabilities?.includes(capability)) fail('capability', `${manifestPath} missing capability ${capability}`);
  }
  for (const gate of requiredGates) {
    if (!manifest.qualityGates?.includes(gate)) fail('quality-gate', `${manifestPath} missing quality gate ${gate}`);
  }
  if (!manifest.futureMigration?.preferredContentRoot || !manifest.futureMigration?.preferredTextbookRoot) {
    fail('future-migration', `${manifestPath} must declare futureMigration preferred roots`);
  }
  return row;
}

function requireString(value, field, manifestPath) {
  if (typeof value !== 'string' || !value.trim()) fail('required-field', `${manifestPath} missing ${field}`);
}

function requireExistingPath(relativePath, field, manifestPath) {
  requireString(relativePath, field, manifestPath);
  if (relativePath && !existsSync(path.join(root, relativePath))) {
    fail('missing-path', `${manifestPath} ${field} points to missing path ${relativePath}`);
  }
}

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(path.join(root, relativePath), 'utf-8'));
  } catch (error) {
    fail('json-parse', `${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

function fail(code, message) {
  failures.push({ code, message });
}

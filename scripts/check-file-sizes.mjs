#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { textbookOutput } from './textbook-paths.mjs';

const root = process.cwd();
const maxLines = Number(process.argv[2] ?? 800);
const sourceExts = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.astro', '.css']);
const localReferenceProject = ['Open', 'MAIC'].join('');
const ignoredSegments = new Set(['node_modules', '.git', '.astro', '.codex', '.next', 'dist', 'site/dist', localReferenceProject, '__pycache__']);
const ignoredRoots = [
  textbookOutput('projects'),
  textbookOutput('widgets'),
  path.join(root, 'site', 'public'),
  path.join(root, 'artifacts'),
  path.join(root, 'output'),
  path.join(root, 'runtime'),
  path.join(root, 'archive'),
  path.join(root, 'research', 'vendor'),
];

const failures = [];
const lineLimitOverrides = new Map([
  [path.join(root, 'apps', 'web', 'src', 'app', 'globals.css'), 1000],
]);
await scan(root);

if (failures.length) {
  for (const item of failures) console.error(`${item.lines} lines: ${path.relative(root, item.file)}`);
  process.exitCode = 1;
} else {
  console.log(`Source file size gate passed: <= ${maxLines} lines.`);
}

async function scan(dir) {
  if (ignoredRoots.some((ignored) => dir === ignored || dir.startsWith(`${ignored}${path.sep}`))) return;
  const rel = path.relative(root, dir);
  if (rel.split(path.sep).some((segment) => ignoredSegments.has(segment))) return;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await scan(full);
    else if (sourceExts.has(path.extname(entry.name))) await check(full);
  }
}

async function check(file) {
  const text = await readFile(file, 'utf-8');
  const lines = text.split(/\r?\n/).length;
  const limit = lineLimitOverrides.get(file) ?? maxLines;
  if (lines > limit) failures.push({ file, lines });
}

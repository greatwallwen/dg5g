#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);
const target = args.find((arg) => !arg.startsWith('-')) ?? '.';
const targetPath = path.resolve(root, target);

const result = runCodegraph(args.length ? args : ['files', '-p', root, '--max-depth', '3']);
if (result.ok) {
  process.stdout.write(result.output);
  process.exit(0);
}

console.warn('[codegraph-read] codegraph unavailable; using local structure fallback.');
console.warn(`[codegraph-read] reason: ${result.reason}`);
await printFallback(targetPath);

function runCodegraph(codegraphArgs) {
  const executable = process.platform === 'win32' ? 'cmd.exe' : 'npx';
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/c', 'npx.cmd', '@colbymchenry/codegraph', ...codegraphArgs]
    : ['@colbymchenry/codegraph', ...codegraphArgs];
  const run = spawnSync(executable, commandArgs, {
    cwd: root,
    encoding: 'utf-8',
    shell: false,
    timeout: 8000,
  });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  if (run.error) return { ok: false, reason: run.error.message, output };
  if (run.status === 0 && output.trim()) return { ok: true, output };
  return { ok: false, reason: output.trim() || `exit ${run.status}`, output };
}

async function printFallback(start) {
  if (!existsSync(start)) {
    console.log(`missing: ${path.relative(root, start)}`);
    return;
  }
  const info = await stat(start);
  if (info.isFile()) {
    console.log(relative(start));
    return;
  }
  const tree = await scan(start, 0);
  for (const line of tree) console.log(line);
}

async function scan(dir, depth) {
  if (depth > 3) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const visible = entries
    .filter((entry) => !entry.name.startsWith('.'))
    .filter((entry) => !['node_modules', 'dist', '.astro', '__pycache__'].includes(entry.name))
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  const lines = [];
  for (const entry of visible.slice(0, 80)) {
    const full = path.join(dir, entry.name);
    const prefix = '  '.repeat(depth);
    lines.push(`${prefix}${entry.isDirectory() ? 'dir ' : 'file'} ${relative(full)}`);
    if (entry.isDirectory()) lines.push(...await scan(full, depth + 1));
  }
  if (visible.length > 80) lines.push(`${'  '.repeat(depth)}... ${visible.length - 80} more`);
  return lines;
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

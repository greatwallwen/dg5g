#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = path.resolve(process.cwd(), 'apps', 'web', 'src');
const tests = await collectTests(root);
if (!tests.length) throw new Error(`No web unit tests found under ${root}`);

const preloadUrl = new URL('./web-test-register.mjs', import.meta.url).href;
const testArguments = ['--test', ...tests];
const child = spawn(process.execPath, ['--import', preloadUrl, ...testArguments], {
  cwd: process.cwd(),
  stdio: 'inherit',
});
const code = await new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', resolve);
});
process.exitCode = Number(code ?? 1);

async function collectTests(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTests(filePath));
    else if (entry.isFile() && /\.test\.tsx?$/.test(entry.name)) files.push(filePath);
  }
  return files.sort();
}

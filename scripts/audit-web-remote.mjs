#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';

const defaultBaseUrl =
  process.env.DGBOOK_WEB_DEMO_BASE_URL ||
  process.env.DGBOOK_WEB_DEPLOY_PUBLIC_URL ||
  'http://8.153.206.97/';

const baseUrl = normalizeBaseUrl(readArg('--base-url', defaultBaseUrl));
const outDir = readArg('--out', 'output/playwright/web-runtime-remote-live');
const extraArgs = passthroughArgs(['--base-url', '--out']);

const args = [
  path.join('scripts', 'audit-web-runtime.mjs'),
  '--base-url',
  baseUrl,
  '--out',
  outDir,
  ...extraArgs,
];

console.log(JSON.stringify({
  tool: 'audit-web-remote',
  baseUrl,
  outDir,
}, null, 2));

const child = spawn(process.execPath, args, {
  cwd: process.cwd(),
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

function readArg(name, fallback) {
  const inlinePrefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function passthroughArgs(consumedNames) {
  const consumed = new Set(consumedNames);
  const args = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    const arg = process.argv[index];
    if (arg === '--') continue;
    const name = arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
    if (consumed.has(name)) {
      if (!arg.includes('=')) index += 1;
      continue;
    }
    args.push(arg);
  }
  return args;
}

function normalizeBaseUrl(value) {
  const withScheme = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  return withScheme.endsWith('/') ? withScheme : `${withScheme}/`;
}

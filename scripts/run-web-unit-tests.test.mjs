import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const preloadUrl = new URL('./web-test-register.mjs', import.meta.url).href;

test('the web test preload works on the active Node runtime and centralizes TS, aliases, Next, and asset loading', () => {
  const probe = [
    "const moduleApi = await import('node:module');",
    "const handle = moduleApi.registerHooks({ resolve(specifier, context, nextResolve) { return nextResolve(specifier, context); } });",
    "handle.deregister();",
    "await import('./apps/web/src/app/api/class-sessions/[sessionId]/route.ts');",
    "await import('./apps/web/src/app/layout.tsx');",
  ].join('\n');
  const result = spawnSync(process.execPath, [
    '--import',
    preloadUrl,
    '--input-type=module',
    '--eval',
    probe,
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    `web test preload failed on ${process.version}:\n${result.stdout}${result.stderr}`,
  );
});

test('the web unit runner preloads the shared runtime without changing sorted test-file execution', () => {
  const source = readFileSync(new URL('./run-web-unit-tests.mjs', import.meta.url), 'utf8');

  assert.match(source, /--import/);
  assert.match(source, /web-test-register\.mjs/);
  assert.match(source, /\['--test', \.\.\.tests\]/);
  assert.match(source, /return files\.sort\(\)/);
});

test('the preload propagates to Node subprocesses started by database tests', () => {
  const outerProbe = [
    "const { spawnSync } = await import('node:child_process');",
    "const nested = spawnSync(process.execPath, ['--input-type=module', '--eval', \"await import('./apps/web/src/platform/db/demo-seed.ts')\"], { cwd: process.cwd(), encoding: 'utf8' });",
    "if (nested.status !== 0) { console.error(nested.stdout + nested.stderr); process.exitCode = 1; }",
  ].join('\n');
  const result = spawnSync(process.execPath, [
    '--import',
    preloadUrl,
    '--input-type=module',
    '--eval',
    outerProbe,
  ], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  assert.equal(
    result.status,
    0,
    `nested Node process missed the web test preload on ${process.version}:\n${result.stdout}${result.stderr}`,
  );
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('separates self-contained historical cutover tests from current accepted-media gates', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const scripts = packageJson.scripts ?? {};

  assert.equal(
    scripts['test:web-media-cutover'],
    'pnpm test:web-media-history && pnpm test:web-media-accepted',
  );
  assert.match(
    scripts['test:web-media-accepted'] ?? '',
    /scripts\/verify-accepted-web-media-release\.test\.mjs/,
  );
  assert.match(
    scripts['test:web-media-accepted'] ?? '',
    /scripts\/web-media-eol-policy\.test\.mjs/,
  );
  assert.match(
    scripts['test:web-media-history'] ?? '',
    /scripts\/web-media-historical-fixture\.test\.mjs/,
  );
  for (const historicalTest of [
    'scripts/web-media-cutover-plan.test.mjs',
    'scripts/audit-web-media-cutover.test.mjs',
    'scripts/cutover-web-media.test.mjs',
    'scripts/quarantine-web-media-rollback.test.mjs',
  ]) {
    assert.match(scripts['test:web-media-history'] ?? '', new RegExp(historicalTest.replaceAll('.', '\\.')));
    assert.doesNotMatch(scripts['test:web-media-accepted'] ?? '', new RegExp(historicalTest.replaceAll('.', '\\.')));
  }
});

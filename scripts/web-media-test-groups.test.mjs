import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('keeps only current runtime-media gates after historical cutover retirement', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const scripts = packageJson.scripts ?? {};

  for (const retired of ['test:web-media-cutover', 'test:web-media-history', 'audit:web-media-cutover', 'cutover:web-media']) {
    assert.equal(scripts[retired], undefined);
  }
  assert.match(
    scripts['test:web-media-accepted'] ?? '',
    /scripts\/web-runtime-media-contract\.test\.mjs/,
  );
  assert.match(
    scripts['test:web-media-accepted'] ?? '',
    /scripts\/web-media-eol-policy\.test\.mjs/,
  );
  for (const historicalTest of [
    'scripts/web-media-historical-fixture.test.mjs',
    'scripts/web-media-cutover-plan.test.mjs',
    'scripts/audit-web-media-cutover.test.mjs',
    'scripts/cutover-web-media.test.mjs',
    'scripts/quarantine-web-media-rollback.test.mjs',
  ]) {
    assert.doesNotMatch(scripts['test:web-media-accepted'] ?? '', new RegExp(historicalTest.replaceAll('.', '\\.')));
  }
});

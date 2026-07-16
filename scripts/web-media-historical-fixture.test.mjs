import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createHistoricalMediaRepositoryFixture,
  withHistoricalMediaRepositoryFixture,
} from './web-media-historical-fixture.mjs';
import { buildMediaCutoverPlan } from './web-media-cutover-plan.mjs';

const sourceRepositoryRoot = path.resolve(import.meta.dirname, '..');

test('materializes a path-independent pre-cutover repository from committed inputs', async () => {
  const fixture = await createHistoricalMediaRepositoryFixture();
  try {
    const sourceRelation = path.relative(sourceRepositoryRoot, fixture.root);
    assert.equal(path.isAbsolute(sourceRelation) || sourceRelation.startsWith('..'), true);
    assert.equal(path.relative(os.tmpdir(), fixture.root).startsWith('..'), false);
    const plan = await buildMediaCutoverPlan({
      repositoryRoot: fixture.repositoryRoot,
      releaseId: 'self-contained-history',
      createdAt: '2026-07-16T00:00:00.000Z',
    });
    assert.deepEqual(plan.summary, {
      fileCount: 40,
      totalBytes: 12_627_129,
      groups: {
        home: { fileCount: 4, totalBytes: 863_881 },
        capabilityMaps: { fileCount: 6, totalBytes: 266_566 },
        generatedP1: { fileCount: 22, totalBytes: 6_616_211 },
        existingTarget: { fileCount: 1, totalBytes: 1_650_087 },
        safeTts: { fileCount: 7, totalBytes: 3_230_384 },
      },
    });
    assert.deepEqual(plan.oldTargetInventory.summary, { fileCount: 9, totalBytes: 5_494_279 });
  } finally {
    await fixture.cleanup();
  }
});

test('removes its complete temporary repository when historical work fails', async () => {
  let fixtureRoot;
  await assert.rejects(
    () => withHistoricalMediaRepositoryFixture(async (fixture) => {
      fixtureRoot = fixture.root;
      throw new Error('injected historical test failure');
    }),
    /injected historical test failure/,
  );
  await assert.rejects(() => access(fixtureRoot), /ENOENT/);
});

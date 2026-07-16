import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { applyMediaCutoverPlan } from './cutover-web-media.mjs';
import {
  auditExactMediaTree,
  buildMediaCutoverPlan,
  inventoryMediaTree,
  resolveAcceptedMediaCutoverManifest,
} from './web-media-cutover-plan.mjs';
import { withHistoricalMediaRepositoryFixture } from './web-media-historical-fixture.mjs';

test('local cutover atomically installs the exact 40-file tree and publishes an accepted pointer', async () => withHistoricalMediaRepositoryFixture(async ({ repositoryRoot }) => {
  const plan = await buildMediaCutoverPlan({
    repositoryRoot,
    releaseId: 'task9-cutover-success',
    createdAt: '2026-07-16T00:00:00.000Z',
  });
  const result = await applyMediaCutoverPlan({
    repositoryRoot,
    manifest: plan,
    acceptedAt: '2026-07-16T00:10:00.000Z',
  });

  assert.equal(result.state, 'postverified');
  assert.deepEqual(result.stateHistory, ['planned', 'staged', 'verified', 'switched', 'postverified']);
  const targetAudit = await auditExactMediaTree({
    root: path.join(repositoryRoot, plan.targetRoot),
    entries: plan.entries,
  });
  assert.equal(targetAudit.passed, true);
  const rollback = await inventoryMediaTree({ root: path.join(repositoryRoot, plan.rollbackRoot) });
  assert.deepEqual(rollback.summary, plan.oldTargetInventory.summary);
  assert.deepEqual(rollback.entries, plan.oldTargetInventory.entries);

  const accepted = await resolveAcceptedMediaCutoverManifest({ repositoryRoot });
  assert.equal(accepted.manifest.releaseId, plan.releaseId);
  assert.equal(accepted.journal.state, 'postverified');
  assert.equal(accepted.targetPaths.length, 40);
}));

test('post-switch failure restores the old 9-file target and never publishes current', async () => withHistoricalMediaRepositoryFixture(async ({ repositoryRoot }) => {
  const plan = await buildMediaCutoverPlan({
    repositoryRoot,
    releaseId: 'task9-cutover-rollback',
    createdAt: '2026-07-16T00:00:00.000Z',
  });
  const result = await applyMediaCutoverPlan({
    repositoryRoot,
    manifest: plan,
    acceptedAt: '2026-07-16T00:10:00.000Z',
    faultAt: 'postverify',
  });

  assert.equal(result.state, 'rolled_back');
  assert.equal(result.recovery, 'restored-old-target');
  const restored = await inventoryMediaTree({ root: path.join(repositoryRoot, plan.targetRoot) });
  assert.deepEqual(restored.summary, plan.oldTargetInventory.summary);
  assert.deepEqual(restored.entries, plan.oldTargetInventory.entries);
  await assert.rejects(
    () => readFile(path.join(repositoryRoot, 'artifacts/media-cutover/current.json'), 'utf8'),
    /ENOENT/,
  );
}));

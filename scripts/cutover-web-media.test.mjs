import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { applyMediaCutoverPlan } from './cutover-web-media.mjs';
import { resolveAcceptedMediaRollbackQuarantineReceipt } from './quarantine-web-media-rollback.mjs';
import {
  auditExactMediaTree,
  buildMediaCutoverPlan,
  inventoryMediaTree,
  resolveAcceptedMediaCutoverManifest,
} from './web-media-cutover-plan.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('local cutover atomically installs the exact 40-file tree and publishes an accepted pointer', async () => {
  const plan = await buildMediaCutoverPlan({
    repositoryRoot,
    releaseId: 'task9-cutover-success',
    createdAt: '2026-07-16T00:00:00.000Z',
  });
  const isolatedRoot = await mkdtemp(path.join(os.tmpdir(), 'dgbook-cutover-success-'));
  try {
    await materializePlanSources(isolatedRoot, plan);
    const result = await applyMediaCutoverPlan({
      repositoryRoot: isolatedRoot,
      manifest: plan,
      acceptedAt: '2026-07-16T00:10:00.000Z',
    });

    assert.equal(result.state, 'postverified');
    assert.deepEqual(result.stateHistory, ['planned', 'staged', 'verified', 'switched', 'postverified']);
    const targetAudit = await auditExactMediaTree({
      root: path.join(isolatedRoot, plan.targetRoot),
      entries: plan.entries,
    });
    assert.equal(targetAudit.passed, true);
    const rollback = await inventoryMediaTree({ root: path.join(isolatedRoot, plan.rollbackRoot) });
    assert.deepEqual(rollback.summary, plan.oldTargetInventory.summary);
    assert.deepEqual(rollback.entries, plan.oldTargetInventory.entries);

    const accepted = await resolveAcceptedMediaCutoverManifest({ repositoryRoot: isolatedRoot });
    assert.equal(accepted.manifest.releaseId, plan.releaseId);
    assert.equal(accepted.journal.state, 'postverified');
    assert.equal(accepted.targetPaths.length, 40);
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});

test('post-switch failure restores the old 9-file target and never publishes current', async () => {
  const plan = await buildMediaCutoverPlan({
    repositoryRoot,
    releaseId: 'task9-cutover-rollback',
    createdAt: '2026-07-16T00:00:00.000Z',
  });
  const isolatedRoot = await mkdtemp(path.join(os.tmpdir(), 'dgbook-cutover-rollback-'));
  try {
    await materializePlanSources(isolatedRoot, plan);
    const result = await applyMediaCutoverPlan({
      repositoryRoot: isolatedRoot,
      manifest: plan,
      acceptedAt: '2026-07-16T00:10:00.000Z',
      faultAt: 'postverify',
    });

    assert.equal(result.state, 'rolled_back');
    assert.equal(result.recovery, 'restored-old-target');
    const restored = await inventoryMediaTree({ root: path.join(isolatedRoot, plan.targetRoot) });
    assert.deepEqual(restored.summary, plan.oldTargetInventory.summary);
    assert.deepEqual(restored.entries, plan.oldTargetInventory.entries);
    await assert.rejects(
      () => readFile(path.join(isolatedRoot, 'artifacts/media-cutover/current.json'), 'utf8'),
      /ENOENT/,
    );
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});

async function materializePlanSources(root, plan) {
  let accepted;
  let quarantineReceipt;
  for (const oldEntry of plan.oldTargetInventory.entries) {
    let source = path.join(repositoryRoot, 'apps/web/public/media', oldEntry.relativePath);
    try {
      await readFile(source);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      accepted ??= await resolveAcceptedMediaCutoverManifest({ repositoryRoot });
      source = path.join(repositoryRoot, accepted.manifest.rollbackRoot, oldEntry.relativePath);
      try {
        await readFile(source);
      } catch (rollbackError) {
        if (rollbackError?.code !== 'ENOENT') throw rollbackError;
        quarantineReceipt ??= await resolveAcceptedMediaRollbackQuarantineReceipt({ repositoryRoot });
        const sealedEntry = quarantineReceipt.sealedPlan.entries.find(({ relativePath }) => relativePath === oldEntry.relativePath);
        assert.ok(sealedEntry, `quarantine receipt missing old media: ${oldEntry.relativePath}`);
        source = sealedEntry.quarantinePath;
      }
    }
    await copyRelative(
      source,
      path.join(root, 'apps/web/public/media', oldEntry.relativePath),
    );
  }
  for (const entry of plan.entries) {
    const target = path.join(root, entry.sourcePath);
    try {
      await readFile(target);
    } catch {
      await copyRelative(path.join(repositoryRoot, entry.sourcePath), target);
    }
  }
}

async function copyRelative(source, target) {
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}

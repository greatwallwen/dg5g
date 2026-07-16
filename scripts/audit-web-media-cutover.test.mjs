import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runWebMediaCutoverAudit } from './audit-web-media-cutover.mjs';
import {
  buildMediaCutoverPlan,
  serializeMediaCutoverManifestSha256,
} from './web-media-cutover-plan.mjs';
import { withHistoricalMediaRepositoryFixture } from './web-media-historical-fixture.mjs';

test('planned audit proves the 40-file source closure and records the untouched 9-file rollback inventory', async () => withHistoricalMediaRepositoryFixture(async ({ repositoryRoot }) => {
  const report = await runWebMediaCutoverAudit({
    repositoryRoot,
    mode: 'planned',
    releaseId: 'task9-a-audit',
    createdAt: '2026-07-16T00:00:00.000Z',
  });

  assert.equal(report.schema, 'dgbook.web-media-cutover-audit/v1');
  assert.equal(report.mode, 'planned');
  assert.equal(report.passed, true);
  assert.equal(report.plan.summary.fileCount, 40);
  assert.equal(report.plan.summary.totalBytes, 12_627_129);
  assert.deepEqual(report.sourceAudit, {
    passed: true,
    expectedFileCount: 40,
    verifiedFileCount: 40,
    verifiedTotalBytes: 12_627_129,
    issues: [],
  });
  assert.equal(report.plan.oldTargetInventory.summary.fileCount, 9);
  assert.equal(report.plan.oldTargetInventory.summary.totalBytes, 5_494_279);
  assert.deepEqual(
    report.plan.oldTargetInventory.entries.map(({ relativePath }) => relativePath),
    [
      '5g/p01-n02-topology-stage-v1.png',
      'tts/qwen-cherry/p01-story-speech-006.wav',
      'tts/qwen-cherry/p01-story-speech-011.wav',
      'tts/qwen-cherry/p01-story-speech-012.wav',
      'tts/qwen-cherry/p01-story-speech-013.wav',
      'tts/qwen-cherry/p01-story-speech-014.wav',
      'tts/qwen-cherry/p01-story-speech-016.wav',
      'tts/qwen-cherry/p01-story-speech-021.wav',
      'tts/qwen-cherry/p01-story-speech-023.wav',
    ],
  );
}));

test('staging audit accepts only the manifest exact set and reports missing or extra files', async () => withHistoricalMediaRepositoryFixture(async ({ repositoryRoot }) => {
  const releaseId = 'task9-staging-audit';
  const plan = await buildMediaCutoverPlan({
    repositoryRoot,
    releaseId,
    createdAt: '2026-07-16T00:00:00.000Z',
  });
  const isolatedRoot = await mkdtemp(path.join(os.tmpdir(), 'dgbook-media-staging-audit-'));
  try {
    await writeManifestArtifacts(isolatedRoot, plan);
    for (const entry of plan.entries) {
      const source = path.join(repositoryRoot, entry.sourcePath);
      const target = path.join(isolatedRoot, entry.stagingPath);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target);
    }

    let report = await runWebMediaCutoverAudit({
      repositoryRoot: isolatedRoot,
      mode: 'verify-staging',
      releaseId,
      createdAt: '2026-07-16T00:01:00.000Z',
    });
    assert.equal(report.passed, true);
    assert.equal(report.treeAudit.actualFileCount, 40);

    const missing = plan.entries[0].stagingPath;
    await unlink(path.join(isolatedRoot, missing));
    report = await runWebMediaCutoverAudit({
      repositoryRoot: isolatedRoot,
      mode: 'verify-staging',
      releaseId,
      createdAt: '2026-07-16T00:02:00.000Z',
    });
    assert.equal(report.passed, false);
    assert.ok(report.treeAudit.issues.some(({ code }) => code === 'missing-file'));

    await copyFile(path.join(repositoryRoot, plan.entries[0].sourcePath), path.join(isolatedRoot, missing));
    await writeFile(path.join(isolatedRoot, plan.stagingRoot, 'extra.bin'), 'extra');
    report = await runWebMediaCutoverAudit({
      repositoryRoot: isolatedRoot,
      mode: 'verify-staging',
      releaseId,
      createdAt: '2026-07-16T00:03:00.000Z',
    });
    assert.equal(report.passed, false);
    assert.ok(report.treeAudit.issues.some(({ code }) => code === 'extra-file'));
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
}));

async function writeManifestArtifacts(root, plan) {
  await mkdir(path.dirname(path.join(root, plan.manifestPath)), { recursive: true });
  await writeFile(path.join(root, plan.manifestPath), `${JSON.stringify(plan, null, 2)}\n`);
  await writeFile(path.join(root, plan.manifestSha256Path), serializeMediaCutoverManifestSha256(plan));
}

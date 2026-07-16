import assert from 'node:assert/strict';
import { access, copyFile, link, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  applyMediaRollbackQuarantinePlan,
  createMediaRollbackQuarantinePlan,
  MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_PATH,
  parseMediaRollbackQuarantinePlan,
  parseMediaRollbackQuarantineCurrentPointer,
  publishMediaRollbackQuarantineReceipt,
  resolveAcceptedMediaRollbackQuarantineReceipt,
  restoreMediaRollbackFromQuarantine,
  writeImmutableMediaRollbackQuarantinePlan,
} from './quarantine-web-media-rollback.mjs';
import {
  auditExactMediaTree,
  buildMediaCutoverPlan,
  createMediaCutoverJournal,
  inventoryMediaTree,
  resolveAcceptedMediaCutoverManifest,
} from './web-media-cutover-plan.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const FIXED_TIME = '2026-07-16T22:30:40.123Z';

test('dry-run plan is sealed to the accepted rollback and exact old 9-file inventory without mutation', async () => {
  const fixture = await createAcceptedFixture();
  try {
    const plan = await createMediaRollbackQuarantinePlan({
      repositoryRoot: fixture.repositoryRoot,
      quarantineRoot: fixture.quarantineRoot,
      createdAt: FIXED_TIME,
    });
    const accepted = await resolveAcceptedMediaCutoverManifest({ repositoryRoot: fixture.repositoryRoot });

    assert.equal(plan.schema, 'dgbook.web-media-rollback-quarantine/v1');
    assert.equal(plan.releaseId, accepted.manifest.releaseId);
    assert.equal(plan.sourceRepositoryPath, accepted.manifest.rollbackRoot);
    assert.equal(plan.acceptedPlanSha256, accepted.manifest.planSha256);
    assert.equal(plan.acceptedPointerSha256, accepted.pointer.pointerSha256);
    assert.equal(plan.acceptedJournalSha256, accepted.journal.journalSha256);
    assert.deepEqual(plan.summary, { fileCount: 9, totalBytes: 5_494_279 });
    assert.equal(plan.entries.length, 9);
    assert.ok(plan.entries.every((entry) => (
      path.isAbsolute(entry.originalPath)
      && path.isAbsolute(entry.quarantinePath)
      && entry.quarantinePath.startsWith(`${plan.payloadRoot}${path.sep}`)
      && /^[A-F0-9]{64}$/.test(entry.sha256)
    )));
    assert.match(plan.restore.command, /--restore/);
    assert.match(plan.restore.command, /--apply/);
    assert.match(plan.sealSha256, /^[A-F0-9]{64}$/);
    assert.deepEqual(parseMediaRollbackQuarantinePlan(plan), plan);
    await assert.rejects(() => access(plan.quarantineSessionRoot), /ENOENT/);

    const planPath = path.join(fixture.root, 'dry-run-plan.json');
    await writeImmutableMediaRollbackQuarantinePlan(planPath, plan);
    assert.deepEqual(
      parseMediaRollbackQuarantinePlan(await readFile(planPath, 'utf8')),
      plan,
    );
    await assert.rejects(
      () => writeImmutableMediaRollbackQuarantinePlan(planPath, plan),
      /already exists|EEXIST/i,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('same-volume apply atomically moves rollback, writes a write-once seal, and controlled restore returns the source', async () => {
  const fixture = await createAcceptedFixture();
  try {
    const plan = await createMediaRollbackQuarantinePlan({
      repositoryRoot: fixture.repositoryRoot,
      quarantineRoot: fixture.quarantineRoot,
      createdAt: FIXED_TIME,
    });
    assert.equal(plan.transferStrategy, 'same-volume-rename');

    const result = await applyMediaRollbackQuarantinePlan({
      repositoryRoot: fixture.repositoryRoot,
      plan,
    });
    assert.equal(result.state, 'quarantined');
    assert.equal(result.sourceDisposition, 'moved');
    assert.equal(result.receiptState, 'published');
    assert.equal(result.receiptPath, `artifacts/media-cutover/${plan.releaseId}/media-rollback-quarantine-receipt.json`);
    await assert.rejects(() => access(plan.sourceRoot), /ENOENT/);
    const payload = await inventoryMediaTree({ root: plan.payloadRoot });
    assert.equal(payload.passed, true);
    assert.deepEqual(payload.summary, plan.summary);
    assert.deepEqual(payload.entries, plan.entries.map(({ relativePath, bytes, sha256 }) => ({ relativePath, bytes, sha256 })));
    assert.deepEqual(
      parseMediaRollbackQuarantinePlan(await readFile(plan.sealedManifestPath, 'utf8')),
      plan,
    );
    assert.equal(
      await readFile(plan.sealedManifestSha256Path, 'utf8'),
      `${plan.sealSha256}  sealed-manifest.json\n`,
    );
    const republished = await publishMediaRollbackQuarantineReceipt({
      repositoryRoot: fixture.repositoryRoot,
      sealedManifestPath: plan.sealedManifestPath,
    });
    assert.equal(republished.receiptSha256, result.receiptSha256);
    assert.equal(republished.state, 'published');

    const restored = await restoreMediaRollbackFromQuarantine({
      repositoryRoot: fixture.repositoryRoot,
      sealedManifestPath: plan.sealedManifestPath,
    });
    assert.equal(restored.state, 'restored');
    const source = await inventoryMediaTree({ root: plan.sourceRoot });
    assert.equal(source.passed, true);
    assert.deepEqual(source.summary, plan.summary);
    await assert.rejects(() => access(plan.payloadRoot), /ENOENT/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('post-quarantine build resolves old inventory only through the atomic current receipt and exact external seal', async () => {
  const fixture = await createAcceptedFixture();
  try {
    const plan = await createMediaRollbackQuarantinePlan({
      repositoryRoot: fixture.repositoryRoot,
      quarantineRoot: fixture.quarantineRoot,
      createdAt: FIXED_TIME,
    });
    await applyMediaRollbackQuarantinePlan({ repositoryRoot: fixture.repositoryRoot, plan });

    const receipt = await resolveAcceptedMediaRollbackQuarantineReceipt({ repositoryRoot: fixture.repositoryRoot });
    assert.equal(receipt.receipt.releaseId, plan.releaseId);
    assert.equal(receipt.receipt.externalSealSha256, plan.sealSha256);
    assert.deepEqual(receipt.receipt.oldTargetInventory, {
      summary: plan.summary,
      entries: plan.entries.map(({ relativePath, bytes, sha256 }) => ({ relativePath, bytes, sha256 })),
    });
    const rebuilt = await buildMediaCutoverPlan({
      repositoryRoot: fixture.repositoryRoot,
      releaseId: 'post-quarantine-idempotence',
      createdAt: '2026-07-16T23:00:00.000Z',
    });
    assert.deepEqual(rebuilt.oldTargetInventory, receipt.receipt.oldTargetInventory);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('post-quarantine build rejects a missing pointer, forged receipt and unsafe receipt path', async () => {
  const missing = await createQuarantinedFixture();
  try {
    await unlink(path.join(missing.repositoryRoot, ...MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_PATH.split('/')));
    await assert.rejects(
      () => buildMediaCutoverPlan({ repositoryRoot: missing.repositoryRoot, releaseId: 'missing-receipt-pointer' }),
      /quarantine receipt|current pointer|missing/i,
    );
  } finally {
    await rm(missing.root, { recursive: true, force: true });
  }

  const forged = await createQuarantinedFixture();
  try {
    const resolved = await resolveAcceptedMediaRollbackQuarantineReceipt({ repositoryRoot: forged.repositoryRoot });
    const receiptPath = path.join(forged.repositoryRoot, ...resolved.pointer.receiptPath.split('/'));
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    receipt.externalSealSha256 = 'A'.repeat(64);
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    await assert.rejects(
      () => buildMediaCutoverPlan({ repositoryRoot: forged.repositoryRoot, releaseId: 'forged-receipt' }),
      /receipt SHA-256|sidecar|seal/i,
    );
  } finally {
    await rm(forged.root, { recursive: true, force: true });
  }

  const valid = await createQuarantinedFixture();
  try {
    const resolved = await resolveAcceptedMediaRollbackQuarantineReceipt({ repositoryRoot: valid.repositoryRoot });
    const unsafe = { ...resolved.pointer, receiptPath: '../escaped-receipt.json' };
    assert.throws(() => parseMediaRollbackQuarantineCurrentPointer(unsafe), /receipt path|unsafe|invalid/i);
  } finally {
    await rm(valid.root, { recursive: true, force: true });
  }
});

test('post-quarantine build rejects payload drift, reparse points and multiple same-release receipts', async () => {
  const drifted = await createQuarantinedFixture();
  try {
    const receipt = await resolveAcceptedMediaRollbackQuarantineReceipt({ repositoryRoot: drifted.repositoryRoot });
    const victim = receipt.sealedPlan.entries[0].quarantinePath;
    await unlink(victim);
    await writeFile(victim, 'drifted payload');
    await assert.rejects(
      () => buildMediaCutoverPlan({ repositoryRoot: drifted.repositoryRoot, releaseId: 'drifted-payload' }),
      /payload|inventory|byte|SHA|exact/i,
    );
  } finally {
    await rm(drifted.root, { recursive: true, force: true });
  }

  const reparsed = await createQuarantinedFixture();
  try {
    const receipt = await resolveAcceptedMediaRollbackQuarantineReceipt({ repositoryRoot: reparsed.repositoryRoot });
    await assert.rejects(
      () => buildMediaCutoverPlan({
        repositoryRoot: reparsed.repositoryRoot,
        releaseId: 'reparsed-payload',
        reparseDetector: async (candidate) => path.resolve(candidate) === path.resolve(receipt.sealedPlan.payloadRoot),
      }),
      /reparse/i,
    );
  } finally {
    await rm(reparsed.root, { recursive: true, force: true });
  }

  const receiptReparsed = await createQuarantinedFixture();
  try {
    const resolved = await resolveAcceptedMediaRollbackQuarantineReceipt({ repositoryRoot: receiptReparsed.repositoryRoot });
    const receiptPath = path.join(receiptReparsed.repositoryRoot, ...resolved.pointer.receiptPath.split('/'));
    await assert.rejects(
      () => publishMediaRollbackQuarantineReceipt({
        repositoryRoot: receiptReparsed.repositoryRoot,
        sealedManifestPath: resolved.sealedPlan.sealedManifestPath,
        publishedAt: resolved.receipt.publishedAt,
        reparseDetector: async (candidate) => path.resolve(candidate) === path.resolve(receiptPath),
      }),
      /reparse/i,
    );
  } finally {
    await rm(receiptReparsed.root, { recursive: true, force: true });
  }

  const ambiguous = await createQuarantinedFixture();
  try {
    const receipt = await resolveAcceptedMediaRollbackQuarantineReceipt({ repositoryRoot: ambiguous.repositoryRoot });
    const canonicalReceipt = path.join(ambiguous.repositoryRoot, ...receipt.pointer.receiptPath.split('/'));
    await copyFile(
      canonicalReceipt,
      path.join(path.dirname(canonicalReceipt), 'media-rollback-quarantine-receipt-copy.json'),
    );
    await assert.rejects(
      () => buildMediaCutoverPlan({ repositoryRoot: ambiguous.repositoryRoot, releaseId: 'ambiguous-receipt' }),
      /multiple|ambiguous|receipt/i,
    );
  } finally {
    await rm(ambiguous.root, { recursive: true, force: true });
  }
});

test('cross-volume apply copies and rehashes payload while retaining the accepted rollback source', async () => {
  const fixture = await createAcceptedFixture();
  const volumeKey = (candidate) => path.resolve(candidate).startsWith(path.resolve(fixture.quarantineRoot)) ? 'quarantine-volume' : 'repository-volume';
  try {
    const plan = await createMediaRollbackQuarantinePlan({
      repositoryRoot: fixture.repositoryRoot,
      quarantineRoot: fixture.quarantineRoot,
      createdAt: FIXED_TIME,
      volumeKey,
    });
    assert.equal(plan.transferStrategy, 'cross-volume-copy-retain-source');

    const result = await applyMediaRollbackQuarantinePlan({
      repositoryRoot: fixture.repositoryRoot,
      plan,
      volumeKey,
    });
    assert.equal(result.sourceDisposition, 'retained');
    const source = await inventoryMediaTree({ root: plan.sourceRoot });
    const payload = await inventoryMediaTree({ root: plan.payloadRoot });
    assert.deepEqual(source.entries, payload.entries);
    assert.deepEqual(payload.summary, plan.summary);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('apply never overwrites an existing quarantine session and leaves the source unchanged', async () => {
  const fixture = await createAcceptedFixture();
  try {
    const plan = await createMediaRollbackQuarantinePlan({
      repositoryRoot: fixture.repositoryRoot,
      quarantineRoot: fixture.quarantineRoot,
      createdAt: FIXED_TIME,
    });
    await mkdir(plan.quarantineSessionRoot, { recursive: true });
    const sentinel = path.join(plan.quarantineSessionRoot, 'sentinel.txt');
    await writeFile(sentinel, 'do-not-overwrite');

    await assert.rejects(
      () => applyMediaRollbackQuarantinePlan({ repositoryRoot: fixture.repositoryRoot, plan }),
      /already exists/i,
    );
    assert.equal(await readFile(sentinel, 'utf8'), 'do-not-overwrite');
    const source = await inventoryMediaTree({ root: plan.sourceRoot });
    assert.deepEqual(source.summary, plan.summary);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('an injected post-transfer failure restores the same-volume source and publishes no seal', async () => {
  const fixture = await createAcceptedFixture();
  try {
    const plan = await createMediaRollbackQuarantinePlan({
      repositoryRoot: fixture.repositoryRoot,
      quarantineRoot: fixture.quarantineRoot,
      createdAt: FIXED_TIME,
    });
    await assert.rejects(
      () => applyMediaRollbackQuarantinePlan({
        repositoryRoot: fixture.repositoryRoot,
        plan,
        faultAt: 'after-transfer',
      }),
      /injected rollback quarantine fault/i,
    );
    const source = await inventoryMediaTree({ root: plan.sourceRoot });
    assert.deepEqual(source.summary, plan.summary);
    assert.deepEqual(source.entries, plan.entries.map(({ relativePath, bytes, sha256 }) => ({ relativePath, bytes, sha256 })));
    await assert.rejects(() => access(plan.sealedManifestPath), /ENOENT/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('planning fails closed for non-postverified acceptance and any source or destination reparse point', async () => {
  const fixture = await createAcceptedFixture();
  try {
    const accepted = await resolveAcceptedMediaCutoverManifest({ repositoryRoot: fixture.repositoryRoot });
    const quarantinedJournal = createMediaCutoverJournal(accepted.manifest, {
      state: 'quarantined',
      stateHistory: [...accepted.journal.stateHistory, 'quarantined'],
      updatedAt: '2026-07-16T22:31:00.000Z',
    });
    await writeFile(
      path.join(fixture.repositoryRoot, accepted.pointer.journalPath),
      `${JSON.stringify(quarantinedJournal, null, 2)}\n`,
    );
    await assert.rejects(
      () => createMediaRollbackQuarantinePlan({
        repositoryRoot: fixture.repositoryRoot,
        quarantineRoot: fixture.quarantineRoot,
        createdAt: FIXED_TIME,
      }),
      /must be postverified/i,
    );
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }

  const sourceFixture = await createAcceptedFixture();
  try {
    const accepted = await resolveAcceptedMediaCutoverManifest({ repositoryRoot: sourceFixture.repositoryRoot });
    const unsafeSource = path.resolve(sourceFixture.repositoryRoot, ...accepted.manifest.rollbackRoot.split('/'));
    await assert.rejects(
      () => createMediaRollbackQuarantinePlan({
        repositoryRoot: sourceFixture.repositoryRoot,
        quarantineRoot: sourceFixture.quarantineRoot,
        createdAt: FIXED_TIME,
        reparseDetector: async (candidate) => path.resolve(candidate) === unsafeSource,
      }),
      /reparse/i,
    );
  } finally {
    await rm(sourceFixture.root, { recursive: true, force: true });
  }

  const destinationFixture = await createAcceptedFixture();
  try {
    await mkdir(destinationFixture.quarantineRoot, { recursive: true });
    await assert.rejects(
      () => createMediaRollbackQuarantinePlan({
        repositoryRoot: destinationFixture.repositoryRoot,
        quarantineRoot: destinationFixture.quarantineRoot,
        createdAt: FIXED_TIME,
        reparseDetector: async (candidate) => path.resolve(candidate) === path.resolve(destinationFixture.quarantineRoot),
      }),
      /reparse/i,
    );
  } finally {
    await rm(destinationFixture.root, { recursive: true, force: true });
  }
});

async function createAcceptedFixture() {
  const root = await mkdtemp(path.join(repositoryRoot, '.tmp-media-rollback-quarantine-'));
  const fixtureRepositoryRoot = path.join(root, 'repo');
  const quarantineRoot = path.join(root, 'quarantine');
  await mkdir(fixtureRepositoryRoot, { recursive: true });
  const accepted = await resolveAcceptedMediaCutoverManifest({ repositoryRoot });

  for (const relativePath of [
    accepted.pointer.pointerPath,
    accepted.pointer.manifestPath,
    accepted.pointer.manifestSha256Path,
    accepted.pointer.journalPath,
  ]) {
    await copyRelative(
      path.join(repositoryRoot, ...relativePath.split('/')),
      path.join(fixtureRepositoryRoot, ...relativePath.split('/')),
      false,
    );
  }
  for (const entry of accepted.manifest.entries) {
    await copyRelative(
      path.join(repositoryRoot, ...entry.targetPath.split('/')),
      path.join(fixtureRepositoryRoot, ...entry.targetPath.split('/')),
    );
  }
  for (const entry of accepted.manifest.entries) {
    const target = path.join(fixtureRepositoryRoot, ...entry.sourcePath.split('/'));
    try {
      await access(target);
    } catch {
      await copyRelative(
        path.join(repositoryRoot, ...entry.sourcePath.split('/')),
        target,
      );
    }
  }
  for (const relativePath of [
    'textbook/5g/generated/p1-demo-content.json',
    'apps/web/src/features/textbook-scene/learning-playback.ts',
  ]) {
    await copyRelative(
      path.join(repositoryRoot, ...relativePath.split('/')),
      path.join(fixtureRepositoryRoot, ...relativePath.split('/')),
    );
  }
  for (const entry of accepted.manifest.oldTargetInventory.entries) {
    const source = await findOldMediaSource(accepted, entry);
    await copyRelative(
      source,
      path.join(fixtureRepositoryRoot, ...accepted.manifest.rollbackRoot.split('/'), ...entry.relativePath.split('/')),
    );
  }
  return { root, repositoryRoot: fixtureRepositoryRoot, quarantineRoot };
}

async function createQuarantinedFixture() {
  const fixture = await createAcceptedFixture();
  const plan = await createMediaRollbackQuarantinePlan({
    repositoryRoot: fixture.repositoryRoot,
    quarantineRoot: fixture.quarantineRoot,
    createdAt: FIXED_TIME,
  });
  await applyMediaRollbackQuarantinePlan({ repositoryRoot: fixture.repositoryRoot, plan });
  return { ...fixture, plan };
}

async function findOldMediaSource(accepted, entry) {
  const candidates = [
    path.join(repositoryRoot, ...accepted.manifest.rollbackRoot.split('/'), ...entry.relativePath.split('/')),
    path.join(repositoryRoot, 'apps', 'web', 'public', 'media', ...entry.relativePath.split('/')),
    path.join(repositoryRoot, 'site', 'public', 'media', ...entry.relativePath.split('/')),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next authoritative copy.
    }
  }
  throw new Error(`no fixture source for old media: ${entry.relativePath}`);
}

async function copyRelative(source, target, preferLink = true) {
  await mkdir(path.dirname(target), { recursive: true });
  if (preferLink) {
    try {
      await link(source, target);
      return;
    } catch (error) {
      if (!['EXDEV', 'EPERM', 'EACCES', 'ENOSYS'].includes(error?.code)) throw error;
    }
  }
  await copyFile(source, target);
}

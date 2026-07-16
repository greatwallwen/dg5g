#!/usr/bin/env node

import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  copyFile,
  link,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MEDIA_CUTOVER_CURRENT_POINTER_PATH,
  auditExactMediaTree,
  inventoryMediaTree,
  resolveAcceptedMediaCutoverManifest,
} from './web-media-cutover-plan.mjs';

export const MEDIA_ROLLBACK_QUARANTINE_SCHEMA = 'dgbook.web-media-rollback-quarantine/v1';
export const MEDIA_ROLLBACK_QUARANTINE_RECEIPT_SCHEMA = 'dgbook.web-media-rollback-quarantine-receipt/v1';
export const MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_SCHEMA = 'dgbook.web-media-rollback-quarantine-current/v1';
export const MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_PATH = 'artifacts/media-cutover/rollback-quarantine-current.json';

export function mediaRollbackQuarantineReceiptPath(releaseId) {
  assert(typeof releaseId === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(releaseId), 'invalid rollback quarantine releaseId');
  return `artifacts/media-cutover/${releaseId}/media-rollback-quarantine-receipt.json`;
}

export async function createMediaRollbackQuarantinePlan({
  repositoryRoot,
  quarantineRoot,
  createdAt = new Date().toISOString(),
  reparseDetector = defaultReparseDetector,
  volumeKey = defaultVolumeKey,
}) {
  const root = path.resolve(repositoryRoot);
  const externalRoot = validateExternalQuarantineRoot({ repositoryRoot: root, quarantineRoot });
  const timestampKey = quarantineTimestampKey(createdAt);
  await assertSecureExistingPathPrefix(externalRoot, reparseDetector);

  const accepted = await resolveAndAuditAcceptedRollback({
    repositoryRoot: root,
    reparseDetector,
    requireRollback: true,
  });
  const sourceRoot = resolveRepositoryPath(root, accepted.manifest.rollbackRoot);
  const quarantineSessionRoot = path.join(
    externalRoot,
    timestampKey,
    'media-rollback',
    accepted.manifest.releaseId,
  );
  assert(isPathInside(externalRoot, quarantineSessionRoot), 'quarantine session escaped quarantine root');
  await assertMissing(quarantineSessionRoot, 'quarantine session');
  await assertSecureExistingPathPrefix(quarantineSessionRoot, reparseDetector);

  const payloadRoot = path.join(quarantineSessionRoot, 'payload');
  const sealedManifestPath = path.join(quarantineSessionRoot, 'sealed-manifest.json');
  const sealedManifestSha256Path = `${sealedManifestPath}.sha256`;
  const transferStrategy = volumeKey(sourceRoot) === volumeKey(quarantineSessionRoot)
    ? 'same-volume-rename'
    : 'cross-volume-copy-retain-source';
  const entries = accepted.manifest.oldTargetInventory.entries.map((entry) => ({
    relativePath: entry.relativePath,
    originalPath: path.join(sourceRoot, ...entry.relativePath.split('/')),
    quarantinePath: path.join(payloadRoot, ...entry.relativePath.split('/')),
    bytes: entry.bytes,
    sha256: entry.sha256,
  }));
  const restoreCommand = `node scripts/quarantine-web-media-rollback.mjs --restore --plan ${quoteCommandArg(sealedManifestPath)} --apply`;
  const unsigned = {
    schema: MEDIA_ROLLBACK_QUARANTINE_SCHEMA,
    releaseId: accepted.manifest.releaseId,
    createdAt,
    acceptedPlanSha256: accepted.manifest.planSha256,
    acceptedPointerSha256: accepted.pointer.pointerSha256,
    acceptedJournalSha256: accepted.journal.journalSha256,
    repositoryRoot: root,
    sourceRepositoryPath: accepted.manifest.rollbackRoot,
    sourceRoot,
    quarantineRoot: externalRoot,
    quarantineSessionRoot,
    payloadRoot,
    sealedManifestPath,
    sealedManifestSha256Path,
    transferStrategy,
    summary: { ...accepted.manifest.oldTargetInventory.summary },
    entries,
    restore: {
      command: restoreCommand,
      strategy: transferStrategy === 'same-volume-rename'
        ? 'verify-seal-and-rename-payload-to-original'
        : 'source-retained-no-restore-required',
      originalRoot: sourceRoot,
      payloadRoot,
      requiresExplicitApply: true,
    },
  };
  return deepFreeze({ ...unsigned, sealSha256: sha256Text(canonicalJson(unsigned)) });
}

export function parseMediaRollbackQuarantinePlan(input) {
  const candidate = jsonClone(input, 'media rollback quarantine plan');
  assert(candidate.schema === MEDIA_ROLLBACK_QUARANTINE_SCHEMA, 'invalid media rollback quarantine schema');
  assert(typeof candidate.releaseId === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(candidate.releaseId), 'invalid rollback quarantine releaseId');
  quarantineTimestampKey(candidate.createdAt);
  for (const field of [
    'repositoryRoot',
    'sourceRoot',
    'quarantineRoot',
    'quarantineSessionRoot',
    'payloadRoot',
    'sealedManifestPath',
    'sealedManifestSha256Path',
  ]) {
    assert(typeof candidate[field] === 'string' && path.isAbsolute(candidate[field]), `invalid absolute quarantine path: ${field}`);
  }
  assert(isSafeRepositoryRelativePath(candidate.sourceRepositoryPath), 'invalid rollback source repository path');
  assert(resolveRepositoryPath(candidate.repositoryRoot, candidate.sourceRepositoryPath) === path.resolve(candidate.sourceRoot), 'rollback source path mismatch');
  assert(candidate.quarantineSessionRoot === path.join(
    candidate.quarantineRoot,
    quarantineTimestampKey(candidate.createdAt),
    'media-rollback',
    candidate.releaseId,
  ), 'invalid quarantine session path');
  assert(candidate.payloadRoot === path.join(candidate.quarantineSessionRoot, 'payload'), 'invalid quarantine payload path');
  assert(candidate.sealedManifestPath === path.join(candidate.quarantineSessionRoot, 'sealed-manifest.json'), 'invalid sealed manifest path');
  assert(candidate.sealedManifestSha256Path === `${candidate.sealedManifestPath}.sha256`, 'invalid sealed manifest SHA path');
  assert(['same-volume-rename', 'cross-volume-copy-retain-source'].includes(candidate.transferStrategy), 'invalid rollback quarantine transfer strategy');
  assert(candidate.summary?.fileCount === 9 && candidate.summary?.totalBytes === 5_494_279, 'old rollback quarantine totals changed');
  assert(Array.isArray(candidate.entries) && candidate.entries.length === 9, 'old rollback quarantine entries changed');
  const seen = new Set();
  for (const entry of candidate.entries) {
    assert(isSafeRepositoryRelativePath(entry?.relativePath), `invalid rollback entry path: ${String(entry?.relativePath)}`);
    const collisionKey = entry.relativePath.normalize('NFC').toLowerCase();
    assert(!seen.has(collisionKey), `rollback entry path collision: ${entry.relativePath}`);
    seen.add(collisionKey);
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes > 0, `invalid rollback entry bytes: ${entry.relativePath}`);
    assert(typeof entry.sha256 === 'string' && /^[A-F0-9]{64}$/.test(entry.sha256), `invalid rollback entry SHA-256: ${entry.relativePath}`);
    assert(entry.originalPath === path.join(candidate.sourceRoot, ...entry.relativePath.split('/')), `rollback original path mismatch: ${entry.relativePath}`);
    assert(entry.quarantinePath === path.join(candidate.payloadRoot, ...entry.relativePath.split('/')), `rollback quarantine path mismatch: ${entry.relativePath}`);
  }
  assert(candidate.entries.reduce((total, entry) => total + entry.bytes, 0) === candidate.summary.totalBytes, 'rollback entry byte total mismatch');
  for (const field of ['acceptedPlanSha256', 'acceptedPointerSha256', 'acceptedJournalSha256']) {
    assert(typeof candidate[field] === 'string' && /^[A-F0-9]{64}$/.test(candidate[field]), `invalid accepted SHA-256: ${field}`);
  }
  assert(candidate.restore?.originalRoot === candidate.sourceRoot, 'invalid rollback restore original root');
  assert(candidate.restore?.payloadRoot === candidate.payloadRoot, 'invalid rollback restore payload root');
  assert(candidate.restore?.requiresExplicitApply === true, 'rollback restore must require explicit apply');
  assert(typeof candidate.restore?.command === 'string' && candidate.restore.command.includes('--restore') && candidate.restore.command.includes('--apply'), 'invalid rollback restore command');
  const { sealSha256, ...unsigned } = candidate;
  assert(typeof sealSha256 === 'string' && /^[A-F0-9]{64}$/.test(sealSha256), 'invalid rollback quarantine seal SHA-256');
  assert(sha256Text(canonicalJson(unsigned)) === sealSha256, 'rollback quarantine seal SHA-256 mismatch');
  return deepFreeze(candidate);
}

export function createMediaRollbackQuarantineReceipt(plan, accepted, {
  publishedAt = new Date().toISOString(),
} = {}) {
  const sealed = parseMediaRollbackQuarantinePlan(plan);
  quarantineTimestampKey(publishedAt);
  assertAcceptedBinding(sealed, accepted);
  const receiptPath = mediaRollbackQuarantineReceiptPath(sealed.releaseId);
  const oldTargetInventory = {
    summary: { ...sealed.summary },
    entries: sealed.entries.map(({ relativePath, bytes, sha256 }) => ({ relativePath, bytes, sha256 })),
  };
  const unsigned = {
    schema: MEDIA_ROLLBACK_QUARANTINE_RECEIPT_SCHEMA,
    releaseId: sealed.releaseId,
    publishedAt,
    receiptPath,
    receiptSha256Path: `${receiptPath}.sha256`,
    currentPointerPath: MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_PATH,
    acceptedPlanSha256: sealed.acceptedPlanSha256,
    acceptedPointerSha256: sealed.acceptedPointerSha256,
    acceptedJournalSha256: sealed.acceptedJournalSha256,
    sourceRepositoryPath: sealed.sourceRepositoryPath,
    transferStrategy: sealed.transferStrategy,
    externalSealedManifestPath: sealed.sealedManifestPath,
    externalSealedManifestSha256Path: sealed.sealedManifestSha256Path,
    externalPayloadRoot: sealed.payloadRoot,
    externalSealSha256: sealed.sealSha256,
    oldTargetInventory,
    restoreCommand: sealed.restore.command,
  };
  return deepFreeze({ ...unsigned, receiptSha256: sha256Text(canonicalJson(unsigned)) });
}

export function parseMediaRollbackQuarantineReceipt(input) {
  const candidate = jsonClone(input, 'media rollback quarantine receipt');
  assert(candidate.schema === MEDIA_ROLLBACK_QUARANTINE_RECEIPT_SCHEMA, 'invalid media rollback quarantine receipt schema');
  assert(candidate.receiptPath === mediaRollbackQuarantineReceiptPath(candidate.releaseId), 'invalid rollback quarantine receipt path');
  assert(candidate.receiptSha256Path === `${candidate.receiptPath}.sha256`, 'invalid rollback quarantine receipt SHA path');
  assert(candidate.currentPointerPath === MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_PATH, 'invalid rollback quarantine current pointer path');
  quarantineTimestampKey(candidate.publishedAt);
  for (const field of ['acceptedPlanSha256', 'acceptedPointerSha256', 'acceptedJournalSha256', 'externalSealSha256']) {
    assert(typeof candidate[field] === 'string' && /^[A-F0-9]{64}$/.test(candidate[field]), `invalid rollback receipt SHA-256: ${field}`);
  }
  assert(isSafeRepositoryRelativePath(candidate.sourceRepositoryPath), 'invalid rollback receipt source path');
  assert(['same-volume-rename', 'cross-volume-copy-retain-source'].includes(candidate.transferStrategy), 'invalid rollback receipt transfer strategy');
  for (const field of ['externalSealedManifestPath', 'externalSealedManifestSha256Path', 'externalPayloadRoot']) {
    assert(typeof candidate[field] === 'string' && path.isAbsolute(candidate[field]), `invalid external rollback receipt path: ${field}`);
  }
  assert(candidate.externalSealedManifestSha256Path === `${candidate.externalSealedManifestPath}.sha256`, 'external rollback seal sidecar path mismatch');
  assert(candidate.externalSealedManifestPath === path.join(path.dirname(candidate.externalPayloadRoot), 'sealed-manifest.json'), 'external rollback seal path does not match payload');
  assertOldTargetInventory(candidate.oldTargetInventory, 'rollback receipt old inventory');
  assert(typeof candidate.restoreCommand === 'string' && candidate.restoreCommand.includes('--restore') && candidate.restoreCommand.includes('--apply'), 'invalid rollback receipt restore command');
  const { receiptSha256, ...unsigned } = candidate;
  assert(typeof receiptSha256 === 'string' && /^[A-F0-9]{64}$/.test(receiptSha256), 'invalid rollback receipt SHA-256');
  assert(sha256Text(canonicalJson(unsigned)) === receiptSha256, 'rollback receipt SHA-256 mismatch');
  return deepFreeze(candidate);
}

export function createMediaRollbackQuarantineCurrentPointer(receipt) {
  const parsed = parseMediaRollbackQuarantineReceipt(receipt);
  const unsigned = {
    schema: MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_SCHEMA,
    pointerPath: MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_PATH,
    releaseId: parsed.releaseId,
    receiptPath: parsed.receiptPath,
    receiptSha256Path: parsed.receiptSha256Path,
    receiptSha256: parsed.receiptSha256,
    externalSealSha256: parsed.externalSealSha256,
    publishedAt: parsed.publishedAt,
  };
  return deepFreeze({ ...unsigned, pointerSha256: sha256Text(canonicalJson(unsigned)) });
}

export function parseMediaRollbackQuarantineCurrentPointer(input) {
  const candidate = jsonClone(input, 'media rollback quarantine current pointer');
  assert(candidate.schema === MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_SCHEMA, 'invalid rollback quarantine current pointer schema');
  assert(candidate.pointerPath === MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_PATH, 'invalid rollback quarantine current pointer path');
  assert(candidate.receiptPath === mediaRollbackQuarantineReceiptPath(candidate.releaseId), 'invalid rollback quarantine pointer receipt path');
  assert(candidate.receiptSha256Path === `${candidate.receiptPath}.sha256`, 'invalid rollback quarantine pointer receipt SHA path');
  quarantineTimestampKey(candidate.publishedAt);
  for (const field of ['receiptSha256', 'externalSealSha256']) {
    assert(typeof candidate[field] === 'string' && /^[A-F0-9]{64}$/.test(candidate[field]), `invalid rollback pointer SHA-256: ${field}`);
  }
  const { pointerSha256, ...unsigned } = candidate;
  assert(typeof pointerSha256 === 'string' && /^[A-F0-9]{64}$/.test(pointerSha256), 'invalid rollback current pointer SHA-256');
  assert(sha256Text(canonicalJson(unsigned)) === pointerSha256, 'rollback current pointer SHA-256 mismatch');
  return deepFreeze(candidate);
}

export async function writeImmutableMediaRollbackQuarantinePlan(filePath, plan) {
  const parsed = parseMediaRollbackQuarantinePlan(plan);
  const absolute = path.resolve(filePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  try {
    await writeFile(absolute, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`rollback quarantine plan already exists: ${absolute}`);
    throw error;
  }
  return absolute;
}

export async function publishMediaRollbackQuarantineReceipt({
  repositoryRoot,
  sealedManifestPath,
  publishedAt,
  reparseDetector = defaultReparseDetector,
  faultAt,
}) {
  const root = path.resolve(repositoryRoot);
  const accepted = await resolveAndAuditAcceptedRollback({
    repositoryRoot: root,
    reparseDetector,
    requireRollback: false,
  });
  const sealed = await loadAndAuditExternalQuarantineSeal({
    repositoryRoot: root,
    sealedManifestPath,
    accepted,
    reparseDetector,
  });
  if (sealed.plan.transferStrategy === 'same-volume-rename') {
    await assertMissing(sealed.plan.sourceRoot, 'quarantined rollback source');
  } else {
    await assertSecureRepositoryPath(root, sealed.plan.sourceRepositoryPath, reparseDetector, 'directory');
    const source = await auditRollbackInventory({ root: sealed.plan.sourceRoot, plan: sealed.plan, reparseDetector });
    assert(source.passed, `retained cross-volume rollback failed audit: ${formatIssues(source.issues)}`);
  }

  const pointerPath = resolveRepositoryPath(root, MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_PATH);
  let existingPointer;
  if (await exists(pointerPath)) {
    await assertSecureRepositoryPath(root, MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_PATH, reparseDetector, 'file');
    existingPointer = parseMediaRollbackQuarantineCurrentPointer(await readFile(pointerPath, 'utf8'));
    assert(existingPointer.releaseId === sealed.plan.releaseId, 'a different rollback quarantine release is already current');
    assert(existingPointer.externalSealSha256 === sealed.plan.sealSha256, 'a different external rollback seal is already current');
  }
  const effectivePublishedAt = existingPointer?.publishedAt ?? publishedAt ?? new Date().toISOString();
  const receipt = createMediaRollbackQuarantineReceipt(sealed.plan, accepted, { publishedAt: effectivePublishedAt });
  const pointer = createMediaRollbackQuarantineCurrentPointer(receipt);
  await assertSecureRepositoryPath(root, `artifacts/media-cutover/${receipt.releaseId}`, reparseDetector, 'directory');
  await assertNoReceiptAmbiguity(root, receipt.releaseId);
  const receiptPath = resolveRepositoryPath(root, receipt.receiptPath);
  const receiptSha256Path = resolveRepositoryPath(root, receipt.receiptSha256Path);
  if (await exists(receiptPath)) await assertSecureRepositoryPath(root, receipt.receiptPath, reparseDetector, 'file');
  if (await exists(receiptSha256Path)) await assertSecureRepositoryPath(root, receipt.receiptSha256Path, reparseDetector, 'file');
  await writeImmutableOrVerify(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'rollback quarantine receipt');
  await writeImmutableOrVerify(
    receiptSha256Path,
    `${receipt.receiptSha256}  media-rollback-quarantine-receipt.json\n`,
    'rollback quarantine receipt sidecar',
  );
  if (faultAt === 'before-current-pointer') throw new Error('injected rollback quarantine receipt fault before-current-pointer');

  const pointerContent = `${JSON.stringify(pointer, null, 2)}\n`;
  if (await exists(pointerPath)) {
    await assertSecureRepositoryPath(root, MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_PATH, reparseDetector, 'file');
    assert(await readFile(pointerPath, 'utf8') === pointerContent, 'a different rollback quarantine current pointer already exists');
  } else {
    await publishAtomicNoReplace(pointerPath, pointerContent, `${receipt.releaseId}-${receipt.externalSealSha256.slice(0, 12)}`);
  }
  return deepFreeze({
    state: 'published',
    receiptPath: receipt.receiptPath,
    receiptSha256: receipt.receiptSha256,
    pointerPath: MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_PATH,
    pointerSha256: pointer.pointerSha256,
    externalSealSha256: receipt.externalSealSha256,
  });
}

export async function resolveAcceptedMediaRollbackQuarantineReceipt({
  repositoryRoot,
  reparseDetector = defaultReparseDetector,
}) {
  const root = path.resolve(repositoryRoot);
  const accepted = await resolveAndAuditAcceptedRollback({
    repositoryRoot: root,
    reparseDetector,
    requireRollback: false,
  });
  await assertSecureRepositoryPath(root, MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_PATH, reparseDetector, 'file');
  const pointer = parseMediaRollbackQuarantineCurrentPointer(
    await readFile(resolveRepositoryPath(root, MEDIA_ROLLBACK_QUARANTINE_CURRENT_POINTER_PATH), 'utf8'),
  );
  assert(pointer.releaseId === accepted.manifest.releaseId, 'rollback quarantine pointer release is not the accepted release');
  await assertNoReceiptAmbiguity(root, pointer.releaseId);
  await assertSecureRepositoryPath(root, pointer.receiptPath, reparseDetector, 'file');
  await assertSecureRepositoryPath(root, pointer.receiptSha256Path, reparseDetector, 'file');
  const receipt = parseMediaRollbackQuarantineReceipt(
    await readFile(resolveRepositoryPath(root, pointer.receiptPath), 'utf8'),
  );
  assert(
    await readFile(resolveRepositoryPath(root, pointer.receiptSha256Path), 'utf8')
      === `${receipt.receiptSha256}  media-rollback-quarantine-receipt.json\n`,
    'rollback quarantine receipt SHA-256 sidecar mismatch',
  );
  assert(pointer.receiptSha256 === receipt.receiptSha256, 'rollback quarantine pointer receipt SHA mismatch');
  assert(pointer.externalSealSha256 === receipt.externalSealSha256, 'rollback quarantine pointer external seal SHA mismatch');
  assert(pointer.publishedAt === receipt.publishedAt, 'rollback quarantine pointer timestamp mismatch');
  assertReceiptBinding(receipt, accepted);
  const sealed = await loadAndAuditExternalQuarantineSeal({
    repositoryRoot: root,
    sealedManifestPath: receipt.externalSealedManifestPath,
    accepted,
    reparseDetector,
  });
  assert(sealed.plan.sealSha256 === receipt.externalSealSha256, 'external rollback seal no longer matches receipt');
  assert(sealed.plan.sealedManifestSha256Path === receipt.externalSealedManifestSha256Path, 'external rollback seal sidecar path changed');
  assert(sealed.plan.payloadRoot === receipt.externalPayloadRoot, 'external rollback payload path changed');
  const sealedInventory = {
    summary: sealed.plan.summary,
    entries: sealed.plan.entries.map(({ relativePath, bytes, sha256 }) => ({ relativePath, bytes, sha256 })),
  };
  assert(canonicalJson(receipt.oldTargetInventory) === canonicalJson(sealedInventory), 'rollback receipt inventory does not match external seal');
  assert(canonicalJson(receipt.oldTargetInventory) === canonicalJson(accepted.manifest.oldTargetInventory), 'rollback receipt inventory does not match accepted cutover');
  return deepFreeze({ pointer, receipt, sealedPlan: sealed.plan, payloadInventory: sealed.payloadInventory });
}

export async function applyMediaRollbackQuarantinePlan({
  repositoryRoot,
  plan,
  reparseDetector = defaultReparseDetector,
  volumeKey = defaultVolumeKey,
  faultAt,
}) {
  const root = path.resolve(repositoryRoot);
  const parsed = parseMediaRollbackQuarantinePlan(plan);
  assert(samePath(root, parsed.repositoryRoot), 'rollback quarantine plan belongs to a different repository');
  const current = await createMediaRollbackQuarantinePlan({
    repositoryRoot: root,
    quarantineRoot: parsed.quarantineRoot,
    createdAt: parsed.createdAt,
    reparseDetector,
    volumeKey,
  });
  assert(current.sealSha256 === parsed.sealSha256, 'rollback quarantine plan no longer matches accepted current state');

  await mkdir(path.dirname(parsed.quarantineSessionRoot), { recursive: true });
  await assertSecureExistingPathPrefix(path.dirname(parsed.quarantineSessionRoot), reparseDetector);
  await mkdir(parsed.quarantineSessionRoot, { recursive: false });
  await assertSecureExistingPath(parsed.quarantineSessionRoot, reparseDetector, 'directory');

  let movedSource = false;
  try {
    if (parsed.transferStrategy === 'same-volume-rename') {
      assert(volumeKey(parsed.sourceRoot) === volumeKey(parsed.payloadRoot), 'same-volume rollback plan no longer shares a volume');
      await rename(parsed.sourceRoot, parsed.payloadRoot);
      movedSource = true;
    } else {
      assert(volumeKey(parsed.sourceRoot) !== volumeKey(parsed.payloadRoot), 'cross-volume rollback plan no longer crosses volumes');
      await mkdir(parsed.payloadRoot, { recursive: false });
      for (const entry of parsed.entries) {
        await mkdir(path.dirname(entry.quarantinePath), { recursive: true });
        await copyFile(entry.originalPath, entry.quarantinePath, constants.COPYFILE_EXCL);
      }
    }

    const payload = await auditRollbackInventory({ root: parsed.payloadRoot, plan: parsed, reparseDetector });
    assert(payload.passed, `quarantine payload verification failed: ${formatIssues(payload.issues)}`);
    if (faultAt === 'after-transfer') throw new Error('injected rollback quarantine fault after-transfer');

    await writeFile(parsed.sealedManifestPath, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await writeFile(
      parsed.sealedManifestSha256Path,
      `${parsed.sealSha256}  sealed-manifest.json\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
    const receipt = await publishMediaRollbackQuarantineReceipt({
      repositoryRoot: root,
      sealedManifestPath: parsed.sealedManifestPath,
      reparseDetector,
    });
    return deepFreeze({
      state: 'quarantined',
      releaseId: parsed.releaseId,
      transferStrategy: parsed.transferStrategy,
      sourceDisposition: movedSource ? 'moved' : 'retained',
      sealedManifestPath: parsed.sealedManifestPath,
      sealSha256: parsed.sealSha256,
      receiptState: receipt.state,
      receiptPath: receipt.receiptPath,
      receiptSha256: receipt.receiptSha256,
      receiptPointerPath: receipt.pointerPath,
    });
  } catch (error) {
    if (movedSource) {
      try {
        if (!await exists(parsed.sourceRoot) && await exists(parsed.payloadRoot)) {
          await rename(parsed.payloadRoot, parsed.sourceRoot);
          const restored = await auditRollbackInventory({ root: parsed.sourceRoot, plan: parsed, reparseDetector });
          assert(restored.passed, `restored rollback verification failed: ${formatIssues(restored.issues)}`);
        }
      } catch (recoveryError) {
        throw new AggregateError([error, recoveryError], 'rollback quarantine failed and source restoration also failed');
      }
    }
    throw error;
  }
}

export async function restoreMediaRollbackFromQuarantine({
  repositoryRoot,
  sealedManifestPath,
  reparseDetector = defaultReparseDetector,
  volumeKey = defaultVolumeKey,
}) {
  const root = path.resolve(repositoryRoot);
  const manifestPath = path.resolve(sealedManifestPath);
  await assertSecureExistingPath(manifestPath, reparseDetector, 'file');
  const parsed = parseMediaRollbackQuarantinePlan(await readFile(manifestPath, 'utf8'));
  assert(samePath(manifestPath, parsed.sealedManifestPath), 'restore manifest path does not match its sealed path');
  assert(samePath(root, parsed.repositoryRoot), 'restore manifest belongs to a different repository');
  await assertSecureExistingPath(parsed.sealedManifestSha256Path, reparseDetector, 'file');
  assert(
    await readFile(parsed.sealedManifestSha256Path, 'utf8') === `${parsed.sealSha256}  sealed-manifest.json\n`,
    'sealed rollback manifest sidecar mismatch',
  );
  const accepted = await resolveAndAuditAcceptedRollback({
    repositoryRoot: root,
    reparseDetector,
    requireRollback: parsed.transferStrategy === 'cross-volume-copy-retain-source',
  });
  assertAcceptedBinding(parsed, accepted);

  const payload = await auditRollbackInventory({ root: parsed.payloadRoot, plan: parsed, reparseDetector });
  assert(payload.passed, `restore payload verification failed: ${formatIssues(payload.issues)}`);
  if (parsed.transferStrategy === 'cross-volume-copy-retain-source') {
    return deepFreeze({ state: 'source-retained', sourceRoot: parsed.sourceRoot, payloadRoot: parsed.payloadRoot });
  }

  assert(volumeKey(parsed.sourceRoot) === volumeKey(parsed.payloadRoot), 'restore requires source and payload on the same volume');
  await assertMissing(parsed.sourceRoot, 'rollback restore source');
  await assertSecureRepositoryPath(root, path.posix.dirname(parsed.sourceRepositoryPath), reparseDetector, 'directory');
  let installed = false;
  try {
    await rename(parsed.payloadRoot, parsed.sourceRoot);
    installed = true;
    const restored = await auditRollbackInventory({ root: parsed.sourceRoot, plan: parsed, reparseDetector });
    assert(restored.passed, `restored rollback verification failed: ${formatIssues(restored.issues)}`);
    return deepFreeze({ state: 'restored', sourceRoot: parsed.sourceRoot, sealedManifestPath: parsed.sealedManifestPath });
  } catch (error) {
    if (installed && await exists(parsed.sourceRoot) && !await exists(parsed.payloadRoot)) {
      try {
        await rename(parsed.sourceRoot, parsed.payloadRoot);
      } catch (recoveryError) {
        throw new AggregateError([error, recoveryError], 'rollback restore failed and payload recovery also failed');
      }
    }
    throw error;
  }
}

async function resolveAndAuditAcceptedRollback({ repositoryRoot, reparseDetector, requireRollback }) {
  await assertSecureRepositoryPath(repositoryRoot, MEDIA_CUTOVER_CURRENT_POINTER_PATH, reparseDetector, 'file');
  const accepted = await resolveAcceptedMediaCutoverManifest({ repositoryRoot });
  assert(accepted.journal.state === 'postverified', 'accepted media cutover journal must be postverified before rollback quarantine');
  for (const relativePath of [
    accepted.pointer.manifestPath,
    accepted.pointer.manifestSha256Path,
    accepted.pointer.journalPath,
  ]) {
    await assertSecureRepositoryPath(repositoryRoot, relativePath, reparseDetector, 'file');
  }
  await assertSecureRepositoryPath(repositoryRoot, accepted.manifest.targetRoot, reparseDetector, 'directory');
  const targetAudit = await auditExactMediaTree({
    root: resolveRepositoryPath(repositoryRoot, accepted.manifest.targetRoot),
    entries: accepted.manifest.entries,
    reparseDetector,
  });
  assert(targetAudit.passed, `accepted current media target failed exact audit: ${formatIssues(targetAudit.issues)}`);

  let rollbackInventory;
  if (requireRollback) {
    await assertSecureRepositoryPath(repositoryRoot, accepted.manifest.rollbackRoot, reparseDetector, 'directory');
    rollbackInventory = await inventoryMediaTree({
      root: resolveRepositoryPath(repositoryRoot, accepted.manifest.rollbackRoot),
      reparseDetector,
    });
    assert(rollbackInventory.passed, `accepted rollback inventory failed: ${formatIssues(rollbackInventory.issues)}`);
    assert(
      canonicalJson(rollbackInventory.summary) === canonicalJson(accepted.manifest.oldTargetInventory.summary)
        && canonicalJson(rollbackInventory.entries) === canonicalJson(accepted.manifest.oldTargetInventory.entries),
      'accepted rollback no longer matches the immutable old 9-file inventory',
    );
  }
  return { ...accepted, rollbackInventory };
}

async function loadAndAuditExternalQuarantineSeal({
  repositoryRoot,
  sealedManifestPath,
  accepted,
  reparseDetector,
}) {
  const root = path.resolve(repositoryRoot);
  const manifestPath = path.resolve(sealedManifestPath);
  assert(!isPathInside(root, manifestPath), 'external rollback seal must be outside the repository');
  await assertSecureExistingPath(manifestPath, reparseDetector, 'file');
  const plan = parseMediaRollbackQuarantinePlan(await readFile(manifestPath, 'utf8'));
  assert(samePath(plan.repositoryRoot, root), 'external rollback seal belongs to a different repository');
  assert(samePath(plan.sealedManifestPath, manifestPath), 'external rollback seal path changed');
  validateExternalQuarantineRoot({ repositoryRoot: root, quarantineRoot: plan.quarantineRoot });
  assert(isPathInside(plan.quarantineRoot, plan.quarantineSessionRoot), 'external rollback session escaped its quarantine root');
  assert(isPathInside(plan.quarantineSessionRoot, plan.payloadRoot), 'external rollback payload escaped its session');
  await assertSecureExistingPath(plan.sealedManifestSha256Path, reparseDetector, 'file');
  assert(
    await readFile(plan.sealedManifestSha256Path, 'utf8') === `${plan.sealSha256}  sealed-manifest.json\n`,
    'external rollback sealed manifest sidecar mismatch',
  );
  assertAcceptedBinding(plan, accepted);
  assert(plan.sourceRoot === resolveRepositoryPath(root, accepted.manifest.rollbackRoot), 'external rollback seal source root changed');
  const payloadInventory = await auditRollbackInventory({ root: plan.payloadRoot, plan, reparseDetector });
  assert(payloadInventory.passed, `external rollback payload failed exact inventory: ${formatIssues(payloadInventory.issues)}`);
  return { plan, payloadInventory };
}

function assertReceiptBinding(receipt, accepted) {
  assert(receipt.releaseId === accepted.manifest.releaseId, 'rollback receipt release is not accepted');
  assert(receipt.acceptedPlanSha256 === accepted.manifest.planSha256, 'rollback receipt accepted plan SHA changed');
  assert(receipt.acceptedPointerSha256 === accepted.pointer.pointerSha256, 'rollback receipt accepted pointer SHA changed');
  assert(receipt.acceptedJournalSha256 === accepted.journal.journalSha256, 'rollback receipt accepted journal SHA changed');
  assert(receipt.sourceRepositoryPath === accepted.manifest.rollbackRoot, 'rollback receipt source is not the accepted rollback root');
}

function assertOldTargetInventory(inventory, label) {
  assert(inventory?.summary?.fileCount === 9 && inventory?.summary?.totalBytes === 5_494_279, `${label} totals changed`);
  assert(Array.isArray(inventory.entries) && inventory.entries.length === 9, `${label} entries changed`);
  const seen = new Set();
  let totalBytes = 0;
  for (const entry of inventory.entries) {
    assert(isSafeRepositoryRelativePath(entry?.relativePath), `${label} contains an unsafe path`);
    const key = entry.relativePath.normalize('NFC').toLowerCase();
    assert(!seen.has(key), `${label} contains a path collision`);
    seen.add(key);
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes > 0, `${label} contains invalid bytes`);
    assert(typeof entry.sha256 === 'string' && /^[A-F0-9]{64}$/.test(entry.sha256), `${label} contains invalid SHA-256`);
    totalBytes += entry.bytes;
  }
  assert(totalBytes === inventory.summary.totalBytes, `${label} byte total mismatch`);
}

async function assertNoReceiptAmbiguity(repositoryRoot, releaseId) {
  const relativeDirectory = `artifacts/media-cutover/${releaseId}`;
  const directory = resolveRepositoryPath(repositoryRoot, relativeDirectory);
  const names = await readdir(directory);
  const receipts = names.filter((name) => /^media-rollback-quarantine-receipt.*\.json$/i.test(name));
  const canonicalName = path.posix.basename(mediaRollbackQuarantineReceiptPath(releaseId));
  assert(receipts.length <= 1, `multiple rollback quarantine receipts are ambiguous: ${receipts.join(', ')}`);
  if (receipts.length === 1) assert(receipts[0] === canonicalName, `non-canonical rollback quarantine receipt is ambiguous: ${receipts[0]}`);
}

async function writeImmutableOrVerify(filePath, content, label) {
  try {
    await writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    assert(await readFile(filePath, 'utf8') === content, `${label} already exists with different content`);
  }
}

async function publishAtomicNoReplace(filePath, content, key) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.next-${key}-${process.pid}`;
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
    await link(temporary, filePath);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`rollback quarantine current pointer already exists: ${filePath}`);
    throw error;
  } finally {
    try {
      await unlink(temporary);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function assertAcceptedBinding(plan, accepted) {
  assert(plan.releaseId === accepted.manifest.releaseId, 'rollback quarantine release is no longer accepted');
  assert(plan.acceptedPlanSha256 === accepted.manifest.planSha256, 'rollback quarantine accepted plan SHA changed');
  assert(plan.acceptedPointerSha256 === accepted.pointer.pointerSha256, 'rollback quarantine accepted pointer SHA changed');
  assert(plan.acceptedJournalSha256 === accepted.journal.journalSha256, 'rollback quarantine accepted journal SHA changed');
  assert(plan.sourceRepositoryPath === accepted.manifest.rollbackRoot, 'rollback quarantine source is not the accepted rollback root');
}

async function auditRollbackInventory({ root, plan, reparseDetector }) {
  const inventory = await inventoryMediaTree({ root, reparseDetector });
  if (!inventory.passed) return inventory;
  const expectedEntries = plan.entries.map(({ relativePath, bytes, sha256 }) => ({ relativePath, bytes, sha256 }));
  if (canonicalJson(inventory.summary) !== canonicalJson(plan.summary)) {
    inventory.issues.push({ code: 'summary-mismatch', path: '' });
  }
  if (canonicalJson(inventory.entries) !== canonicalJson(expectedEntries)) {
    inventory.issues.push({ code: 'inventory-mismatch', path: '' });
  }
  inventory.passed = inventory.issues.length === 0;
  return inventory;
}

async function assertSecureRepositoryPath(repositoryRoot, relativePath, reparseDetector, expectedType) {
  assert(isSafeRepositoryRelativePath(relativePath), `unsafe repository path: ${String(relativePath)}`);
  const root = path.resolve(repositoryRoot);
  const rootStat = await lstat(root);
  assert(rootStat.isDirectory() && !rootStat.isSymbolicLink() && !await reparseDetector(root, rootStat), 'repository root is a reparse point');
  const rootReal = await realpath(root);
  let current = root;
  const segments = relativePath.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const names = await readdir(current);
    assert(names.includes(segment), `repository path missing or has wrong case: ${relativePath}`);
    current = path.join(current, segment);
    const stat = await lstat(current);
    assert(!stat.isSymbolicLink() && !await reparseDetector(current, stat), `repository path contains a reparse point: ${relativePath}`);
    assert(isPathInside(rootReal, await realpath(current)), `repository path realpath escaped root: ${relativePath}`);
    if (index < segments.length - 1) assert(stat.isDirectory(), `repository path parent is not a directory: ${relativePath}`);
    else if (expectedType === 'directory') assert(stat.isDirectory(), `repository path is not a directory: ${relativePath}`);
    else if (expectedType === 'file') assert(stat.isFile(), `repository path is not a file: ${relativePath}`);
  }
}

async function assertSecureExistingPathPrefix(candidate, reparseDetector) {
  const absolute = path.resolve(candidate);
  const parsed = path.parse(absolute);
  const segments = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    assert(!stat.isSymbolicLink() && !await reparseDetector(current, stat), `destination path contains a reparse point: ${current}`);
    assert(stat.isDirectory(), `destination path parent is not a directory: ${current}`);
    const resolved = await realpath(current);
    assert(samePath(resolved, current), `destination realpath changed unexpectedly: ${current}`);
  }
}

async function assertSecureExistingPath(candidate, reparseDetector, expectedType) {
  const absolute = path.resolve(candidate);
  await assertSecureExistingPathPrefix(path.dirname(absolute), reparseDetector);
  const stat = await lstat(absolute);
  assert(!stat.isSymbolicLink() && !await reparseDetector(absolute, stat), `path is a reparse point: ${absolute}`);
  assert(samePath(await realpath(absolute), absolute), `path realpath changed unexpectedly: ${absolute}`);
  if (expectedType === 'directory') assert(stat.isDirectory(), `path is not a directory: ${absolute}`);
  if (expectedType === 'file') assert(stat.isFile(), `path is not a file: ${absolute}`);
}

function validateExternalQuarantineRoot({ repositoryRoot, quarantineRoot }) {
  assert(typeof quarantineRoot === 'string' && path.isAbsolute(quarantineRoot), 'quarantine root must be an absolute path');
  const root = path.resolve(repositoryRoot);
  const external = path.resolve(quarantineRoot);
  assert(!samePath(root, external), 'quarantine root must differ from repository root');
  assert(!isPathInside(root, external), 'quarantine root must be outside the repository');
  assert(!isPathInside(external, root), 'quarantine root must not contain the repository');
  return external;
}

function resolveRepositoryPath(root, relativePath) {
  assert(isSafeRepositoryRelativePath(relativePath), `unsafe repository path: ${String(relativePath)}`);
  const resolved = path.resolve(root, ...relativePath.split('/'));
  assert(isPathInside(root, resolved), `repository path escaped root: ${relativePath}`);
  return resolved;
}

function isSafeRepositoryRelativePath(candidate) {
  return typeof candidate === 'string'
    && candidate.length > 0
    && !path.isAbsolute(candidate)
    && !path.win32.isAbsolute(candidate)
    && !candidate.includes('\\')
    && !candidate.includes('\0')
    && !candidate.includes('%')
    && !candidate.includes(':')
    && path.posix.normalize(candidate) === candidate
    && candidate.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

function quarantineTimestampKey(createdAt) {
  assert(typeof createdAt === 'string' && createdAt.endsWith('Z') && !Number.isNaN(Date.parse(createdAt)), 'rollback quarantine timestamp must be UTC');
  return new Date(createdAt).toISOString().replace(/[-:.]/g, '');
}

function quoteCommandArg(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function defaultVolumeKey(candidate) {
  return path.parse(path.resolve(candidate)).root.toLowerCase();
}

async function defaultReparseDetector(_candidate, stat) {
  return stat.isSymbolicLink();
}

async function assertMissing(candidate, label) {
  assert(!await exists(candidate), `${label} already exists: ${candidate}`);
}

async function exists(candidate) {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function isPathInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function formatIssues(issues) {
  return issues.map(({ code, path: issuePath }) => `${code}:${issuePath}`).join(', ');
}

function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function jsonClone(input, label) {
  try {
    const candidate = typeof input === 'string' ? JSON.parse(input) : JSON.parse(JSON.stringify(input));
    assert(candidate && typeof candidate === 'object' && !Array.isArray(candidate), `invalid ${label}`);
    return candidate;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid ')) throw error;
    throw new Error(`invalid ${label} JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : undefined;
}

async function readPlanFile(filePath) {
  const absolute = path.resolve(filePath);
  const stat = await lstat(absolute);
  assert(stat.isFile() && !stat.isSymbolicLink(), `plan path is not a safe regular file: ${absolute}`);
  assert(samePath(await realpath(absolute), absolute), `plan path resolves through a reparse point: ${absolute}`);
  return parseMediaRollbackQuarantinePlan(await readFile(absolute, 'utf8'));
}

async function main() {
  const repositoryRoot = path.resolve(import.meta.dirname, '..');
  const planPath = readArg('--plan');
  if (process.argv.includes('--publish-receipt')) {
    assert(process.argv.includes('--apply'), '--publish-receipt requires explicit --apply');
    assert(planPath, '--publish-receipt requires --plan pointing to the external sealed manifest');
    const result = await publishMediaRollbackQuarantineReceipt({
      repositoryRoot,
      sealedManifestPath: planPath,
    });
    process.stdout.write(`${JSON.stringify({ mode: 'receipt-published', ...result }, null, 2)}\n`);
    return;
  }
  if (process.argv.includes('--restore')) {
    assert(process.argv.includes('--apply'), '--restore requires explicit --apply');
    assert(planPath, '--restore requires --plan pointing to the sealed manifest');
    const result = await restoreMediaRollbackFromQuarantine({ repositoryRoot, sealedManifestPath: planPath });
    process.stdout.write(`${JSON.stringify({ mode: 'restored', ...result }, null, 2)}\n`);
    return;
  }
  if (process.argv.includes('--apply')) {
    assert(planPath, '--apply requires an immutable --plan from a prior dry-run');
    const plan = await readPlanFile(planPath);
    const result = await applyMediaRollbackQuarantinePlan({ repositoryRoot, plan });
    process.stdout.write(`${JSON.stringify({ mode: 'applied', ...result }, null, 2)}\n`);
    return;
  }

  const quarantineRoot = readArg('--quarantine-root')
    ? path.resolve(readArg('--quarantine-root'))
    : path.join(path.dirname(repositoryRoot), `${path.basename(repositoryRoot)}-quarantine`);
  const plan = await createMediaRollbackQuarantinePlan({
    repositoryRoot,
    quarantineRoot,
    createdAt: readArg('--created-at') ?? new Date().toISOString(),
  });
  let writtenPlanPath;
  if (planPath) writtenPlanPath = await writeImmutableMediaRollbackQuarantinePlan(planPath, plan);
  process.stdout.write(`${JSON.stringify({
    mode: 'dry-run',
    releaseId: plan.releaseId,
    transferStrategy: plan.transferStrategy,
    summary: plan.summary,
    quarantineSessionRoot: plan.quarantineSessionRoot,
    sealSha256: plan.sealSha256,
    ...(writtenPlanPath ? { planPath: writtenPlanPath } : {}),
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

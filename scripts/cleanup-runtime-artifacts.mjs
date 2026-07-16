#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, cp, lstat, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyWorkspacePath, normalizeWorkspacePath } from './active-workspace-policy.mjs';

const SCHEMA = 'dgbook-runtime-cleanup/v1';
const APPLY_RECEIPT_SCHEMA = 'dgbook-runtime-cleanup-apply/v1';
const RESTORE_RECEIPT_SCHEMA = 'dgbook-runtime-cleanup-restore/v1';

export class CleanupManifestError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'CleanupManifestError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new CleanupManifestError(code, message, details);
}

function normalizeAbsolute(inputPath) {
  if (typeof inputPath !== 'string' || !path.isAbsolute(inputPath)) {
    fail('INVALID_ABSOLUTE_PATH', 'Expected an absolute path.', { inputPath });
  }
  return path.normalize(path.resolve(inputPath));
}

function isAtOrBelow(candidatePath, parentPath) {
  const relative = path.relative(parentPath, candidatePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function samePath(leftPath, rightPath) {
  const left = path.normalize(leftPath);
  const right = path.normalize(rightPath);
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function assertExternalQuarantine(rootPath, quarantineRootPath) {
  if (
    isAtOrBelow(quarantineRootPath, rootPath) ||
    isAtOrBelow(rootPath, quarantineRootPath)
  ) {
    fail('QUARANTINE_ROOT_OVERLAP', 'Quarantine root must be outside the workspace tree.', {
      rootPath,
      quarantineRootPath,
    });
  }
}

function assertManifestId(manifestId) {
  if (typeof manifestId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(manifestId)) {
    fail('INVALID_MANIFEST_ID', 'Manifest id must be a safe, portable path segment.', { manifestId });
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareText)
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function inventoryPath(sourcePath) {
  const rootItem = await lstat(sourcePath);
  const records = [];
  let count = 0;
  let bytes = 0;

  async function visit(absolutePath, relativePath) {
    const item = await lstat(absolutePath);
    if (item.isSymbolicLink()) {
      fail('REPARSE_POINT', 'Reparse points inside cleanup candidates are forbidden.', {
        path: absolutePath,
      });
    }
    if (item.isFile()) {
      const contentSha256 = await sha256File(absolutePath);
      count += 1;
      bytes += item.size;
      records.push({ type: 'file', path: relativePath, bytes: item.size, contentSha256 });
      return;
    }
    if (item.isDirectory()) {
      records.push({ type: 'directory', path: relativePath });
      const names = (await readdir(absolutePath)).sort(compareText);
      for (const name of names) {
        const childRelative = relativePath === '.' ? name : `${relativePath}/${name}`;
        await visit(path.join(absolutePath, name), childRelative);
      }
      return;
    }
    fail('UNSUPPORTED_TYPE', 'Only regular files and directories may be quarantined.', {
      path: absolutePath,
    });
  }

  await visit(sourcePath, '.');
  return {
    type: rootItem.isFile() ? 'file' : 'directory',
    count,
    bytes,
    treeSha256: sha256Text(records.map(stableJson).join('\n')),
    mtimeMs: rootItem.mtimeMs,
    nlink: rootItem.nlink,
  };
}

function suppliedRole(decision) {
  return decision.role ?? decision.evidenceRole ?? 'not-evidence';
}

function validateRemovableDecision(decision, relativePath) {
  const role = suppliedRole(decision);
  if (decision.disposition !== 'removable') return undefined;
  if (!['not-evidence', 'superseded'].includes(role)) {
    fail('PROTECTED_EVIDENCE_ROLE', 'Only non-evidence caches or proven superseded evidence may be removable.', {
      relativePath,
      role,
    });
  }
  const metadata = {
    ...(role === 'superseded' ? { evidenceRole: role } : {}),
    isReparsePoint: decision.isReparsePoint,
    hasReparseAncestor: decision.hasReparseAncestor,
  };
  let policy;
  try {
    policy = classifyWorkspacePath(relativePath, metadata);
  } catch (error) {
    if (error?.code === 'REPARSE_POINT') {
      fail('REPARSE_POINT', 'Supplied path decision reports a reparse point or ancestor.', {
        relativePath,
      });
    }
    throw error;
  }

  if (policy.disposition !== 'removable' || policy.reason !== decision.reason) {
    fail('DECISION_MISMATCH', 'Supplied removal decision does not match the path policy.', {
      relativePath,
      supplied: { disposition: decision.disposition, reason: decision.reason },
      policy,
    });
  }
  if (
    role === 'superseded' &&
    (typeof decision.supersededBy !== 'string' || decision.supersededBy.trim().length === 0)
  ) {
    fail('MISSING_SUPERSESSION', 'Superseded evidence requires supersededBy proof.', {
      relativePath,
    });
  }
  return { role, supersededBy: decision.supersededBy ?? null };
}

function targetName(manifestId, index, relativePath) {
  const digest = sha256Text(relativePath).slice(0, 12);
  const safeBasename = path.basename(relativePath).replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80);
  return `${manifestId}--${String(index).padStart(4, '0')}--${digest}--${safeBasename}`;
}

function sealManifest(payload) {
  return {
    ...payload,
    manifestSha256: sha256Text(stableJson(payload)),
  };
}

export function verifyCleanupManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    fail('INVALID_MANIFEST', 'Cleanup manifest must be an object.');
  }
  if (manifest.schema !== SCHEMA || !Array.isArray(manifest.candidates)) {
    fail('INVALID_MANIFEST', 'Cleanup manifest schema or candidate list is invalid.');
  }
  if (manifest.candidateCount !== manifest.candidates.length) {
    fail('INVALID_MANIFEST', 'Cleanup manifest candidate count is inconsistent.');
  }
  const { manifestSha256, ...payload } = manifest;
  const actualSha256 = sha256Text(stableJson(payload));
  if (manifestSha256 !== actualSha256) {
    fail('MANIFEST_DIGEST_MISMATCH', 'Cleanup manifest content differs from its immutable seal.', {
      expectedSha256: manifestSha256,
      actualSha256,
    });
  }
  return manifest;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export async function createCleanupManifest({
  root,
  quarantineRoot,
  decisions,
  manifestId = new Date().toISOString().replace(/[:.]/g, '-'),
  createdAt = new Date().toISOString(),
}) {
  const rootPath = normalizeAbsolute(root);
  const quarantineRootPath = normalizeAbsolute(quarantineRoot);
  assertExternalQuarantine(rootPath, quarantineRootPath);
  assertManifestId(manifestId);
  await assertNoReparseChain(rootPath);
  await assertNoReparseChain(quarantineRootPath);
  if (!Array.isArray(decisions)) {
    fail('INVALID_DECISIONS', 'Path decisions must be supplied as an array.');
  }

  const removable = [];
  for (const decision of decisions) {
    if (!decision || typeof decision !== 'object') {
      fail('INVALID_DECISION', 'Every path decision must be an object.', { decision });
    }
    const relativePath = normalizeWorkspacePath(decision.path);
    const proof = validateRemovableDecision(decision, relativePath);
    if (proof) removable.push({ decision, relativePath, ...proof });
  }
  removable.sort((left, right) => compareText(left.relativePath, right.relativePath));
  for (let leftIndex = 0; leftIndex < removable.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < removable.length; rightIndex += 1) {
      const leftPath = removable[leftIndex].relativePath.toLowerCase();
      const rightPath = removable[rightIndex].relativePath.toLowerCase();
      if (leftPath === rightPath) {
        fail('DUPLICATE_CANDIDATE', 'Dry-run decisions contain a duplicate Windows path.', {
          paths: [removable[leftIndex].relativePath, removable[rightIndex].relativePath],
        });
      }
      if (leftPath.startsWith(`${rightPath}/`) || rightPath.startsWith(`${leftPath}/`)) {
        fail('OVERLAPPING_CANDIDATES', 'Parent and child paths cannot share one cleanup manifest.', {
          paths: [removable[leftIndex].relativePath, removable[rightIndex].relativePath],
        });
      }
    }
  }

  const candidates = [];
  for (const [index, candidate] of removable.entries()) {
    const sourcePath = path.resolve(rootPath, candidate.relativePath);
    if (!isAtOrBelow(sourcePath, rootPath) || sourcePath === rootPath) {
      fail('SOURCE_OUTSIDE_ROOT', 'Candidate source escaped the exact workspace root.', {
        relativePath: candidate.relativePath,
      });
    }
    await assertNoReparseChain(sourcePath);
    const inventory = await inventoryPath(sourcePath);
    const targetPath = path.join(
      quarantineRootPath,
      targetName(manifestId, index, candidate.relativePath),
    );
    try {
      await access(targetPath);
      fail('TARGET_COLLISION', 'Quarantine target already exists.', { targetPath });
    } catch (error) {
      if (error instanceof CleanupManifestError) throw error;
      if (error?.code !== 'ENOENT') throw error;
    }
    candidates.push({
      relativePath: candidate.relativePath,
      sourcePath,
      targetPath,
      reason: candidate.decision.reason,
      role: candidate.role,
      supersededBy: candidate.supersededBy,
      ...inventory,
    });
  }

  return deepFreeze(
    sealManifest({
      schema: SCHEMA,
      manifestId,
      createdAt,
      rootPath,
      quarantineRootPath,
      candidateCount: candidates.length,
      candidates,
    }),
  );
}

export async function writeCleanupManifest(manifestPath, manifest) {
  verifyCleanupManifest(manifest);
  const absoluteManifestPath = normalizeAbsolute(manifestPath);
  try {
    await writeFile(absoluteManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      fail('MANIFEST_EXISTS', 'Refusing to replace an existing dry-run manifest.', {
        manifestPath: absoluteManifestPath,
      });
    }
    throw error;
  }
}

export async function readCleanupManifest(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(normalizeAbsolute(manifestPath), 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      fail('INVALID_MANIFEST_JSON', 'Cleanup manifest is not valid JSON.', {
        manifestPath,
      });
    }
    throw error;
  }
  verifyCleanupManifest(manifest);
  return deepFreeze(manifest);
}

function cleanupReceiptPaths(manifest) {
  return {
    applyReceiptPath: path.join(manifest.quarantineRootPath, 'apply-receipt.json'),
    applyReceiptSha256Path: path.join(manifest.quarantineRootPath, 'apply-receipt.sha256'),
    restoreReceiptPath: path.join(manifest.quarantineRootPath, 'restore-receipt.json'),
    restoreReceiptSha256Path: path.join(manifest.quarantineRootPath, 'restore-receipt.sha256'),
  };
}

function powershellQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildRestoreCommand(manifestPath, manifest) {
  const scriptPath = fileURLToPath(import.meta.url);
  return [
    'node',
    powershellQuote(scriptPath),
    '--restore-manifest',
    powershellQuote(manifestPath),
    '--root',
    powershellQuote(manifest.rootPath),
    '--quarantine-root',
    powershellQuote(manifest.quarantineRootPath),
  ].join(' ');
}

async function assertReceiptPathsMissing(paths, code, label) {
  for (const receiptPath of paths) {
    if (await pathExists(receiptPath)) {
      fail(code, `${label} already exists; refusing to replace write-once evidence.`, {
        receiptPath,
      });
    }
    await assertNoReparseChain(receiptPath, { allowMissing: true });
  }
}

async function writeSealedReceipt({ receiptPath, sidecarPath, unsigned, existsCode, label }) {
  await assertReceiptPathsMissing([receiptPath, sidecarPath], existsCode, label);
  const receipt = { ...unsigned, receiptSha256: sha256Text(stableJson(unsigned)) };
  const content = `${JSON.stringify(receipt, null, 2)}\n`;
  const fileSha256 = sha256Text(content);
  let receiptWritten = false;
  try {
    await writeFile(receiptPath, content, { encoding: 'utf8', flag: 'wx' });
    receiptWritten = true;
    await writeFile(sidecarPath, `${fileSha256}  ${path.basename(receiptPath)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
  } catch (error) {
    if (receiptWritten) await rm(receiptPath, { force: true });
    if (error?.code === 'EEXIST') {
      fail(existsCode, `${label} already exists; refusing to replace write-once evidence.`, {
        receiptPath,
        sidecarPath,
      });
    }
    throw error;
  }
  return { receipt: deepFreeze(receipt), fileSha256 };
}

function assertManifestCandidateCanonical(manifest, entry, index, rootPath, quarantineRootPath) {
  const relativePath = normalizeWorkspacePath(entry.relativePath);
  const sourcePath = path.resolve(rootPath, relativePath);
  const targetPath = path.join(
    quarantineRootPath,
    targetName(manifest.manifestId, index, relativePath),
  );
  if (!samePath(entry.sourcePath, sourcePath) || !samePath(entry.targetPath, targetPath)) {
    fail('MANIFEST_PATH_MISMATCH', 'Manifest source or target path is not canonical.', {
      relativePath,
    });
  }
  return { relativePath, sourcePath, targetPath };
}

async function assertCleanupBoundary(manifest, root, quarantineRoot) {
  const rootPath = normalizeAbsolute(root);
  const quarantineRootPath = normalizeAbsolute(quarantineRoot);
  if (!samePath(rootPath, normalizeAbsolute(manifest.rootPath))) {
    fail('ROOT_MISMATCH', 'Operation root differs from the immutable dry-run root.', {
      expected: manifest.rootPath,
      actual: rootPath,
    });
  }
  if (!samePath(quarantineRootPath, normalizeAbsolute(manifest.quarantineRootPath))) {
    fail('QUARANTINE_ROOT_MISMATCH', 'Operation quarantine root differs from the dry-run root.', {
      expected: manifest.quarantineRootPath,
      actual: quarantineRootPath,
    });
  }
  assertExternalQuarantine(rootPath, quarantineRootPath);
  await assertNoReparseChain(rootPath);
  await assertNoReparseChain(quarantineRootPath);
  const quarantineInfo = await lstat(quarantineRootPath);
  if (!quarantineInfo.isDirectory() || quarantineInfo.isSymbolicLink()) {
    fail('REPARSE_POINT', 'Quarantine root must be an existing ordinary directory.', {
      path: quarantineRootPath,
    });
  }
  return { rootPath, quarantineRootPath };
}

export async function publishCleanupApplyReceipt({
  manifestPath,
  root = process.cwd(),
  quarantineRoot,
  completedAt = new Date().toISOString(),
} = {}) {
  const absoluteManifestPath = normalizeAbsolute(manifestPath);
  const manifest = await readCleanupManifest(absoluteManifestPath);
  const boundary = await assertCleanupBoundary(
    manifest,
    root,
    quarantineRoot ?? manifest.quarantineRootPath,
  );
  const receiptPaths = cleanupReceiptPaths(manifest);
  await assertReceiptPathsMissing(
    [receiptPaths.applyReceiptPath, receiptPaths.applyReceiptSha256Path],
    'APPLY_RECEIPT_EXISTS',
    'Apply receipt',
  );
  await assertReceiptPathsMissing(
    [receiptPaths.restoreReceiptPath, receiptPaths.restoreReceiptSha256Path],
    'RESTORE_RECEIPT_EXISTS',
    'Restore receipt',
  );

  const candidates = [];
  for (const [index, entry] of manifest.candidates.entries()) {
    const canonical = assertManifestCandidateCanonical(
      manifest,
      entry,
      index,
      boundary.rootPath,
      boundary.quarantineRootPath,
    );
    await assertNoReparseChain(canonical.targetPath);
    let targetInventory;
    try {
      targetInventory = await inventoryPath(canonical.targetPath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        fail('PAYLOAD_MISSING', 'Applied quarantine payload is missing; refusing receipt publication.', {
          targetPath: canonical.targetPath,
        });
      }
      throw error;
    }
    assertContentInventoryMatches(entry, targetInventory, canonical.targetPath);
    const sourceRetained = await pathExists(canonical.sourcePath);
    if (sourceRetained) {
      await assertNoReparseChain(canonical.sourcePath);
      const sourceInventory = await inventoryPath(canonical.sourcePath);
      assertContentInventoryMatches(entry, sourceInventory, canonical.sourcePath);
    }
    candidates.push({
      relativePath: canonical.relativePath,
      sourcePath: canonical.sourcePath,
      targetPath: canonical.targetPath,
      mode: sourceRetained ? 'cross-volume-copy-retained' : 'same-volume-rename',
      sourceRetained,
      count: entry.count,
      bytes: entry.bytes,
      treeSha256: entry.treeSha256,
    });
  }

  const restoreCommand = buildRestoreCommand(absoluteManifestPath, manifest);
  const { receipt, fileSha256 } = await writeSealedReceipt({
    receiptPath: receiptPaths.applyReceiptPath,
    sidecarPath: receiptPaths.applyReceiptSha256Path,
    existsCode: 'APPLY_RECEIPT_EXISTS',
    label: 'Apply receipt',
    unsigned: {
      schema: APPLY_RECEIPT_SCHEMA,
      status: 'quarantined',
      manifestId: manifest.manifestId,
      completedAt,
      manifestPath: absoluteManifestPath,
      manifestSha256: manifest.manifestSha256,
      rootPath: boundary.rootPath,
      quarantineRootPath: boundary.quarantineRootPath,
      candidateCount: candidates.length,
      candidates,
      restoreCommand,
    },
  });
  return deepFreeze({
    status: 'quarantined',
    receipt,
    receiptPath: receiptPaths.applyReceiptPath,
    receiptSha256Path: receiptPaths.applyReceiptSha256Path,
    receiptFileSha256: fileSha256,
    restoreCommand,
  });
}

async function readSealedCleanupReceipt({
  receiptPath,
  sidecarPath,
  schema,
  missingCode,
  manifest,
  manifestPath,
}) {
  if (!(await pathExists(receiptPath)) || !(await pathExists(sidecarPath))) {
    fail(missingCode, 'A complete sealed apply receipt and SHA sidecar are required.', {
      receiptPath,
      sidecarPath,
    });
  }
  await assertNoReparseChain(receiptPath);
  await assertNoReparseChain(sidecarPath);
  const content = await readFile(receiptPath, 'utf8');
  const expectedSidecar = `${sha256Text(content)}  ${path.basename(receiptPath)}\n`;
  const actualSidecar = await readFile(sidecarPath, 'utf8');
  if (actualSidecar !== expectedSidecar) {
    fail('RECEIPT_FILE_DIGEST_MISMATCH', 'Receipt SHA sidecar does not match the receipt file.', {
      receiptPath,
    });
  }
  let receipt;
  try {
    receipt = JSON.parse(content);
  } catch (error) {
    fail('INVALID_RECEIPT_JSON', 'Cleanup receipt is not valid JSON.', {
      receiptPath,
      cause: String(error),
    });
  }
  const { receiptSha256, ...unsigned } = receipt;
  if (receiptSha256 !== sha256Text(stableJson(unsigned))) {
    fail('RECEIPT_SEAL_MISMATCH', 'Cleanup receipt differs from its immutable seal.', {
      receiptPath,
    });
  }
  if (
    receipt.schema !== schema ||
    receipt.manifestId !== manifest.manifestId ||
    receipt.manifestSha256 !== manifest.manifestSha256 ||
    !samePath(receipt.manifestPath, manifestPath) ||
    !samePath(receipt.rootPath, manifest.rootPath) ||
    !samePath(receipt.quarantineRootPath, manifest.quarantineRootPath) ||
    receipt.candidateCount !== manifest.candidateCount ||
    !Array.isArray(receipt.candidates) ||
    receipt.candidates.length !== manifest.candidateCount
  ) {
    fail('RECEIPT_MANIFEST_MISMATCH', 'Cleanup receipt does not authorize this exact manifest.', {
      receiptPath,
    });
  }
  return deepFreeze(receipt);
}

function assertApplyReceiptCandidate(entry, receiptEntry, canonical) {
  const immutableFields = ['relativePath', 'sourcePath', 'targetPath', 'count', 'bytes', 'treeSha256'];
  const expected = {
    relativePath: canonical.relativePath,
    sourcePath: canonical.sourcePath,
    targetPath: canonical.targetPath,
    count: entry.count,
    bytes: entry.bytes,
    treeSha256: entry.treeSha256,
  };
  const drift = immutableFields.filter((field) => {
    if (field.endsWith('Path')) return !samePath(receiptEntry?.[field], expected[field]);
    return receiptEntry?.[field] !== expected[field];
  });
  const validMode =
    (receiptEntry?.mode === 'same-volume-rename' && receiptEntry.sourceRetained === false) ||
    (receiptEntry?.mode === 'cross-volume-copy-retained' && receiptEntry.sourceRetained === true);
  if (drift.length || !validMode) {
    fail('RECEIPT_MANIFEST_MISMATCH', 'Apply receipt candidate differs from the sealed manifest.', {
      relativePath: canonical.relativePath,
      fields: drift,
    });
  }
}

export async function restoreCleanupManifest({
  manifestPath,
  root = process.cwd(),
  quarantineRoot,
  completedAt = new Date().toISOString(),
  faultInjector,
} = {}) {
  const absoluteManifestPath = normalizeAbsolute(manifestPath);
  const manifest = await readCleanupManifest(absoluteManifestPath);
  const boundary = await assertCleanupBoundary(
    manifest,
    root,
    quarantineRoot ?? manifest.quarantineRootPath,
  );
  const receiptPaths = cleanupReceiptPaths(manifest);
  const applyReceipt = await readSealedCleanupReceipt({
    receiptPath: receiptPaths.applyReceiptPath,
    sidecarPath: receiptPaths.applyReceiptSha256Path,
    schema: APPLY_RECEIPT_SCHEMA,
    missingCode: 'APPLY_RECEIPT_REQUIRED',
    manifest,
    manifestPath: absoluteManifestPath,
  });
  await assertReceiptPathsMissing(
    [receiptPaths.restoreReceiptPath, receiptPaths.restoreReceiptSha256Path],
    'RESTORE_RECEIPT_EXISTS',
    'Restore receipt',
  );

  const plans = [];
  for (const [index, entry] of manifest.candidates.entries()) {
    const canonical = assertManifestCandidateCanonical(
      manifest,
      entry,
      index,
      boundary.rootPath,
      boundary.quarantineRootPath,
    );
    const receiptEntry = applyReceipt.candidates[index];
    assertApplyReceiptCandidate(entry, receiptEntry, canonical);
    if (!(await pathExists(canonical.targetPath))) {
      fail('PAYLOAD_MISSING', 'Quarantine payload is missing; refusing partial restore.', {
        targetPath: canonical.targetPath,
      });
    }
    await assertNoReparseChain(canonical.targetPath);
    const payloadInventory = await inventoryPath(canonical.targetPath);
    try {
      assertContentInventoryMatches(entry, payloadInventory, canonical.targetPath);
    } catch (error) {
      if (error?.code === 'COPY_VERIFY_FAILED') {
        fail('PAYLOAD_DRIFT', 'Quarantine payload differs from the sealed manifest.', {
          targetPath: canonical.targetPath,
          fields: error.details?.fields,
        });
      }
      throw error;
    }
    const sourceExists = await pathExists(canonical.sourcePath);
    if (!receiptEntry.sourceRetained && sourceExists) {
      fail('SOURCE_COLLISION', 'Restore refuses to overwrite an existing workspace source.', {
        sourcePath: canonical.sourcePath,
      });
    }
    if (receiptEntry.sourceRetained) {
      if (!sourceExists) {
        fail('RETAINED_SOURCE_MISSING', 'Cross-volume cleanup receipt requires its retained source.', {
          sourcePath: canonical.sourcePath,
        });
      }
      await assertNoReparseChain(canonical.sourcePath);
      const sourceInventory = await inventoryPath(canonical.sourcePath);
      try {
        assertContentInventoryMatches(entry, sourceInventory, canonical.sourcePath);
      } catch (error) {
        if (error?.code === 'COPY_VERIFY_FAILED') {
          fail('RETAINED_SOURCE_DRIFT', 'Retained source differs from the sealed manifest.', {
            sourcePath: canonical.sourcePath,
            fields: error.details?.fields,
          });
        }
        throw error;
      }
    }
    plans.push({ entry, canonical, receiptEntry });
  }

  await faultInjector?.({ phase: 'after-preflight', plans });
  const actions = [];
  try {
    for (const [index, plan] of plans.entries()) {
      if (plan.receiptEntry.sourceRetained) {
        actions.push({
          sourcePath: plan.canonical.sourcePath,
          targetPath: plan.canonical.targetPath,
          mode: 'source-already-retained',
          mutated: false,
        });
        continue;
      }
      await faultInjector?.({ phase: 'before-mutation', index, plan, actions: [...actions] });
      await rename(plan.canonical.targetPath, plan.canonical.sourcePath);
      actions.push({
        sourcePath: plan.canonical.sourcePath,
        targetPath: plan.canonical.targetPath,
        mode: 'same-volume-rename',
        mutated: true,
      });
      const restoredInventory = await inventoryPath(plan.canonical.sourcePath);
      assertInventoryMatches(plan.entry, restoredInventory, plan.canonical.sourcePath);
      await faultInjector?.({ phase: 'after-mutation', index, plan, actions: [...actions] });
    }
    const { receipt, fileSha256 } = await writeSealedReceipt({
      receiptPath: receiptPaths.restoreReceiptPath,
      sidecarPath: receiptPaths.restoreReceiptSha256Path,
      existsCode: 'RESTORE_RECEIPT_EXISTS',
      label: 'Restore receipt',
      unsigned: {
        schema: RESTORE_RECEIPT_SCHEMA,
        status: 'restored',
        manifestId: manifest.manifestId,
        completedAt,
        manifestPath: absoluteManifestPath,
        manifestSha256: manifest.manifestSha256,
        applyReceiptSha256: applyReceipt.receiptSha256,
        rootPath: boundary.rootPath,
        quarantineRootPath: boundary.quarantineRootPath,
        candidateCount: plans.length,
        candidates: plans.map(({ entry, canonical, receiptEntry }) => ({
          relativePath: canonical.relativePath,
          sourcePath: canonical.sourcePath,
          targetPath: canonical.targetPath,
          mode: receiptEntry.sourceRetained ? 'source-already-retained' : 'same-volume-rename',
          count: entry.count,
          bytes: entry.bytes,
          treeSha256: entry.treeSha256,
        })),
      },
    });
    return deepFreeze({
      status: 'restored',
      actions,
      receipt,
      receiptPath: receiptPaths.restoreReceiptPath,
      receiptSha256Path: receiptPaths.restoreReceiptSha256Path,
      receiptFileSha256: fileSha256,
    });
  } catch (error) {
    const rollbackErrors = [];
    for (const action of [...actions].reverse()) {
      if (!action.mutated) continue;
      try {
        if ((await pathExists(action.targetPath)) || !(await pathExists(action.sourcePath))) {
          fail('PARTIAL_MUTATION', 'Restore rollback encountered an ambiguous source/target state.', {
            sourcePath: action.sourcePath,
            targetPath: action.targetPath,
          });
        }
        await rename(action.sourcePath, action.targetPath);
        const entry = manifest.candidates.find(({ sourcePath }) => samePath(sourcePath, action.sourcePath));
        const recoveredInventory = await inventoryPath(action.targetPath);
        assertInventoryMatches(entry, recoveredInventory, action.targetPath);
      } catch (rollbackError) {
        rollbackErrors.push({
          sourcePath: action.sourcePath,
          targetPath: action.targetPath,
          message: rollbackError.message,
          code: rollbackError.code,
        });
      }
    }
    if (rollbackErrors.length) {
      const rollbackFailure = new CleanupManifestError(
        'RESTORE_ROLLBACK_FAILED',
        'Restore failed and the quarantine state could not be fully recovered.',
        { rollbackErrors },
      );
      rollbackFailure.cause = error;
      throw rollbackFailure;
    }
    const restoreFailure = new CleanupManifestError(
      'RESTORE_FAILED',
      'Restore failed; completed moves were returned to quarantine.',
      { completedBeforeRollback: actions.filter(({ mutated }) => mutated).length },
    );
    restoreFailure.cause = error;
    throw restoreFailure;
  }
}

function assertInventoryMatches(entry, inventory, pathLabel) {
  const fields = ['type', 'count', 'bytes', 'treeSha256', 'mtimeMs', 'nlink'];
  const drift = fields.filter((field) => entry[field] !== inventory[field]);
  if (drift.length) {
    fail('SOURCE_DRIFT', 'Candidate no longer matches the immutable dry-run inventory.', {
      path: pathLabel,
      fields: drift,
    });
  }
}

function assertContentInventoryMatches(entry, inventory, pathLabel) {
  const fields = ['type', 'count', 'bytes', 'treeSha256'];
  const drift = fields.filter((field) => entry[field] !== inventory[field]);
  if (drift.length) {
    fail('COPY_VERIFY_FAILED', 'Copied quarantine content failed its post-copy rehash.', {
      path: pathLabel,
      fields: drift,
    });
  }
}

async function pathExists(absolutePath) {
  try {
    await lstat(absolutePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function assertNoReparseChain(absolutePath, { allowMissing = false } = {}) {
  const normalizedPath = normalizeAbsolute(absolutePath);
  const volumeRoot = path.parse(normalizedPath).root;
  const segments = path.relative(volumeRoot, normalizedPath).split(path.sep).filter(Boolean);
  let currentPath = volumeRoot;

  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    let item;
    try {
      item = await lstat(currentPath);
    } catch (error) {
      if (allowMissing && error?.code === 'ENOENT') return;
      throw error;
    }
    if (item.isSymbolicLink()) {
      fail('REPARSE_POINT', 'Path or parent is a symbolic link, junction, or reparse point.', {
        path: currentPath,
      });
    }
  }
}

export async function applyCleanupManifest(
  manifest,
  {
    root = process.cwd(),
    quarantineRoot = manifest?.quarantineRootPath,
    volumeResolver,
    faultInjector,
  } = {},
) {
  verifyCleanupManifest(manifest);
  const rootPath = normalizeAbsolute(root);
  const quarantineRootPath = normalizeAbsolute(quarantineRoot);
  if (!samePath(rootPath, normalizeAbsolute(manifest.rootPath))) {
    fail('ROOT_MISMATCH', 'Apply root differs from the immutable dry-run root.', {
      expected: manifest.rootPath,
      actual: rootPath,
    });
  }
  if (!samePath(quarantineRootPath, normalizeAbsolute(manifest.quarantineRootPath))) {
    fail('QUARANTINE_ROOT_MISMATCH', 'Apply quarantine root differs from the dry-run root.', {
      expected: manifest.quarantineRootPath,
      actual: quarantineRootPath,
    });
  }
  assertExternalQuarantine(rootPath, quarantineRootPath);
  await assertNoReparseChain(rootPath);
  await assertNoReparseChain(quarantineRootPath);
  const quarantineInfo = await lstat(quarantineRootPath);
  if (!quarantineInfo.isDirectory() || quarantineInfo.isSymbolicLink()) {
    fail('REPARSE_POINT', 'Quarantine root must be an existing ordinary directory.', {
      path: quarantineRootPath,
    });
  }

  const plans = [];
  for (const [index, entry] of manifest.candidates.entries()) {
    const relativePath = normalizeWorkspacePath(entry.relativePath);
    const expectedSourcePath = path.resolve(rootPath, relativePath);
    const expectedTargetPath = path.join(
      quarantineRootPath,
      targetName(manifest.manifestId, index, relativePath),
    );
    if (!samePath(entry.sourcePath, expectedSourcePath) || !samePath(entry.targetPath, expectedTargetPath)) {
      fail('MANIFEST_PATH_MISMATCH', 'Manifest source or target path is not canonical.', {
        relativePath,
      });
    }
    if (!['not-evidence', 'superseded'].includes(entry.role)) {
      fail('PROTECTED_EVIDENCE_ROLE', 'Manifest candidate carries a protected or invalid evidence role.', {
        relativePath,
        role: entry.role,
      });
    }
    const metadata = entry.role === 'superseded' ? { evidenceRole: 'superseded' } : {};
    const policy = classifyWorkspacePath(relativePath, metadata);
    if (policy.disposition !== 'removable' || policy.reason !== entry.reason) {
      fail('DECISION_MISMATCH', 'Manifest candidate is no longer removable under path policy.', {
        relativePath,
        policy,
      });
    }
    if (
      entry.role === 'superseded' &&
      (typeof entry.supersededBy !== 'string' || entry.supersededBy.trim().length === 0)
    ) {
      fail('MISSING_SUPERSESSION', 'Superseded evidence lost its replacement proof.', {
        relativePath,
      });
    }
    try {
      await assertNoReparseChain(entry.sourcePath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        fail('SOURCE_MISSING', 'Manifest source is missing; refusing partial apply.', {
          sourcePath: entry.sourcePath,
        });
      }
      throw error;
    }
    await assertNoReparseChain(entry.targetPath, { allowMissing: true });
    if (await pathExists(entry.targetPath)) {
      fail('TARGET_COLLISION', 'Quarantine target already exists; refusing partial apply.', {
        targetPath: entry.targetPath,
      });
    }
    let inventory;
    try {
      inventory = await inventoryPath(entry.sourcePath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        fail('SOURCE_MISSING', 'Manifest source is missing; refusing partial apply.', {
          sourcePath: entry.sourcePath,
        });
      }
      throw error;
    }
    assertInventoryMatches(entry, inventory, entry.sourcePath);
    const sourceInfo = await lstat(entry.sourcePath);
    const sameVolume = volumeResolver
      ? await volumeResolver({
          sourcePath: entry.sourcePath,
          targetPath: entry.targetPath,
          sourceInfo,
          quarantineInfo,
        })
      : process.platform === 'win32'
        ? samePath(path.parse(entry.sourcePath).root, path.parse(entry.targetPath).root)
        : sourceInfo.dev === quarantineInfo.dev;
    plans.push({
      entry,
      mode: sameVolume ? 'same-volume-rename' : 'cross-volume-copy-retained',
    });
  }

  const actions = [];
  try {
    await faultInjector?.({ phase: 'after-preflight', plans });
    for (const [index, plan] of plans.entries()) {
      await faultInjector?.({ phase: 'before-mutation', index, plan, actions: [...actions] });
      if (plan.mode === 'same-volume-rename') {
        await rename(plan.entry.sourcePath, plan.entry.targetPath);
      } else {
        await cp(plan.entry.sourcePath, plan.entry.targetPath, {
          recursive: plan.entry.type === 'directory',
          force: false,
          errorOnExist: true,
          preserveTimestamps: true,
          verbatimSymlinks: true,
        });
      }
      const action = {
        sourcePath: plan.entry.sourcePath,
        targetPath: plan.entry.targetPath,
        mode: plan.mode,
        sourceRetained: plan.mode === 'cross-volume-copy-retained',
      };
      actions.push(action);
      if (action.sourceRetained) {
        await faultInjector?.({
          phase: 'after-copy-before-verify',
          index,
          plan,
          actions: [...actions],
        });
      }
      const targetInventory = await inventoryPath(plan.entry.targetPath);
      if (action.sourceRetained) {
        assertContentInventoryMatches(plan.entry, targetInventory, plan.entry.targetPath);
      } else {
        assertInventoryMatches(plan.entry, targetInventory, plan.entry.targetPath);
      }
      await faultInjector?.({ phase: 'after-mutation', index, plan, actions: [...actions] });
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const action of [...actions].reverse()) {
      if (action.sourceRetained) continue;
      try {
        const sourceExists = await pathExists(action.sourcePath);
        const targetExists = await pathExists(action.targetPath);
        if (sourceExists || !targetExists) {
          fail('PARTIAL_MUTATION', 'Rollback encountered an ambiguous source/target state.', {
            sourcePath: action.sourcePath,
            targetPath: action.targetPath,
            sourceExists,
            targetExists,
          });
        }
        await rename(action.targetPath, action.sourcePath);
      } catch (rollbackError) {
        rollbackErrors.push({
          sourcePath: action.sourcePath,
          targetPath: action.targetPath,
          message: rollbackError.message,
          code: rollbackError.code,
        });
      }
    }
    if (rollbackErrors.length) {
      const rollbackFailure = new CleanupManifestError(
        'ROLLBACK_FAILED',
        'Apply failed and at least one same-volume quarantine move could not be restored.',
        { rollbackErrors },
      );
      rollbackFailure.cause = error;
      throw rollbackFailure;
    }
    const retainedCopies = actions.filter((action) => action.sourceRetained);
    const applyFailure = new CleanupManifestError(
      retainedCopies.length ? 'APPLY_FAILED_WITH_RETAINED_COPY' : 'APPLY_FAILED',
      retainedCopies.length
        ? 'Apply failed; same-volume moves were restored and cross-volume copies were retained for inspection.'
        : 'Apply failed; completed same-volume moves were restored.',
      { completedBeforeRollback: actions.length, retainedCopies },
    );
    applyFailure.cause = error;
    throw applyFailure;
  }

  return deepFreeze({
    status: 'quarantined',
    manifestSha256: manifest.manifestSha256,
    actions,
  });
}

function optionValue(args, name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage() {
  return `Usage:
  node scripts/cleanup-runtime-artifacts.mjs --dry-run --decisions <json> --manifest <json> --quarantine-root <absolute-dir> [--root <absolute-dir>]
  node scripts/cleanup-runtime-artifacts.mjs --apply-manifest <json> [--root <absolute-dir>] [--quarantine-root <absolute-dir>]
  node scripts/cleanup-runtime-artifacts.mjs --publish-apply-receipt <json> [--root <absolute-dir>] [--quarantine-root <absolute-dir>]
  node scripts/cleanup-runtime-artifacts.mjs --restore-manifest <json> [--root <absolute-dir>] [--quarantine-root <absolute-dir>]

Dry-run consumes supplied path decisions and writes a new immutable manifest. It never discovers candidates itself.
Receipt-only verifies an already-applied payload without moving or restoring it.`;
}

export async function runCleanupCli(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return 0;
  }
  const applyManifestPath = optionValue(args, '--apply-manifest');
  const publishReceiptManifestPath = optionValue(args, '--publish-apply-receipt');
  const restoreManifestPath = optionValue(args, '--restore-manifest');
  const dryRun = args.includes('--dry-run');
  const selectedModes = [dryRun, applyManifestPath, publishReceiptManifestPath, restoreManifestPath].filter(Boolean);
  if (selectedModes.length > 1) {
    fail('MODE_CONFLICT', 'Dry-run, apply, receipt-only, and restore modes are mutually exclusive.');
  }
  if (selectedModes.length === 0) {
    fail('MODE_REQUIRED', 'Use --dry-run, --apply-manifest, --publish-apply-receipt, or --restore-manifest. Direct delete is forbidden.');
  }

  if (applyManifestPath) {
    const absoluteManifestPath = path.resolve(applyManifestPath);
    const manifest = await readCleanupManifest(absoluteManifestPath);
    const root = path.resolve(optionValue(args, '--root') ?? process.cwd());
    const quarantineRoot = path.resolve(
      optionValue(args, '--quarantine-root') ?? manifest.quarantineRootPath,
    );
    const result = await applyCleanupManifest(manifest, { root, quarantineRoot });
    const published = await publishCleanupApplyReceipt({
      manifestPath: absoluteManifestPath,
      root,
      quarantineRoot,
    });
    console.log(
      `APPLY-MANIFEST ${result.manifestSha256}: ${result.actions.length} candidate(s) quarantined; receipt ${published.receiptFileSha256}`,
    );
    return 0;
  }

  if (publishReceiptManifestPath) {
    const absoluteManifestPath = path.resolve(publishReceiptManifestPath);
    const manifest = await readCleanupManifest(absoluteManifestPath);
    const root = path.resolve(optionValue(args, '--root') ?? process.cwd());
    const quarantineRoot = path.resolve(
      optionValue(args, '--quarantine-root') ?? manifest.quarantineRootPath,
    );
    const result = await publishCleanupApplyReceipt({
      manifestPath: absoluteManifestPath,
      root,
      quarantineRoot,
    });
    console.log(
      `PUBLISH-APPLY-RECEIPT ${result.receiptFileSha256}: ${result.receipt.candidateCount} verified candidate(s)`,
    );
    return 0;
  }

  if (restoreManifestPath) {
    const absoluteManifestPath = path.resolve(restoreManifestPath);
    const manifest = await readCleanupManifest(absoluteManifestPath);
    const root = path.resolve(optionValue(args, '--root') ?? process.cwd());
    const quarantineRoot = path.resolve(
      optionValue(args, '--quarantine-root') ?? manifest.quarantineRootPath,
    );
    const result = await restoreCleanupManifest({
      manifestPath: absoluteManifestPath,
      root,
      quarantineRoot,
    });
    console.log(
      `RESTORE-MANIFEST ${result.receiptFileSha256}: ${result.actions.length} candidate(s) restored`,
    );
    return 0;
  }

  const root = path.resolve(optionValue(args, '--root') ?? process.cwd());
  const decisionsPath = optionValue(args, '--decisions');
  const manifestPath = optionValue(args, '--manifest');
  const quarantineRoot = optionValue(args, '--quarantine-root');
  const manifestId = optionValue(args, '--manifest-id') ?? undefined;
  if (!decisionsPath || !manifestPath || !quarantineRoot) {
    fail('MISSING_ARGUMENT', '--decisions, --manifest, and --quarantine-root are required.');
  }
  const decisionDocument = JSON.parse(await readFile(path.resolve(decisionsPath), 'utf8'));
  const decisions = Array.isArray(decisionDocument) ? decisionDocument : decisionDocument.decisions;
  const manifest = await createCleanupManifest({
    root,
    quarantineRoot: path.resolve(quarantineRoot),
    decisions,
    ...(manifestId ? { manifestId } : {}),
  });
  await writeCleanupManifest(path.resolve(manifestPath), manifest);
  console.log(
    `DRY-RUN manifest ${manifest.manifestSha256}: ${manifest.candidateCount} candidate(s) -> ${path.resolve(manifestPath)}`,
  );
  return 0;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await runCleanupCli();
  } catch (error) {
    console.error(`${error.code ?? 'ERROR'}: ${error.message}`);
    process.exitCode = 1;
  }
}

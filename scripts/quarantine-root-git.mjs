#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAN_SCHEMA = 'dgbook.root-git-quarantine/v1';
const INVENTORY_SCHEMA = 'dgbook.root-git-inventory/v1';
const APPLY_RECEIPT_SCHEMA = 'dgbook.root-git-quarantine-apply/v1';
const RESTORE_RECEIPT_SCHEMA = 'dgbook.root-git-quarantine-restore/v1';
const SOURCE_RELATIVE_PATH = '.git';
const PAYLOAD_NAME = 'root-git.payload';
const DEFAULT_QUARANTINE_ROOT = path.resolve('D:/Claude/dgbook-quarantine');
const SCRIPT_PATH = fileURLToPath(import.meta.url);

const HELP = `DGBook repository-root .git reversible quarantine

Usage:
  node scripts/quarantine-root-git.mjs [--dry-run] [--root <path>] [--quarantine-root <path>] [--session <id>]
  node scripts/quarantine-root-git.mjs --apply --manifest <absolute-path>
  node scripts/quarantine-root-git.mjs --publish-apply-receipt --manifest <absolute-path>
  node scripts/quarantine-root-git.mjs --restore --manifest <absolute-path>

No mode means default safe dry-run. Only the exact repository-root .git directory is eligible.
Dry-run writes a write-once sealed plan outside the repository. Apply and restore require that plan.
The tool never permanently deletes .git content.
Receipt-only recovery never moves data: it only seals proof after an independently completed exact rename.
`;

export class RootGitQuarantineError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'RootGitQuarantineError';
    this.code = code;
    this.details = details;
  }
}

export async function sealRootGitQuarantinePlan({
  repositoryRoot = process.cwd(),
  quarantineRoot = DEFAULT_QUARANTINE_ROOT,
  sessionId = createSessionId(),
  createdAt = new Date().toISOString(),
  volumeResolver = defaultVolumeResolver,
} = {}) {
  const root = path.resolve(repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : repositoryRoot);
  const externalRoot = path.resolve(quarantineRoot);
  validateSessionId(sessionId);
  const sourcePath = path.join(root, SOURCE_RELATIVE_PATH);
  const sessionRoot = path.join(externalRoot, sessionId);
  validateExternalBoundary(root, externalRoot, sessionRoot);
  await assertNormalDirectory(root, 'repository root');
  await assertExactRootGitDirectory(root, sourcePath);
  await assertMissing(sessionRoot, 'write-once quarantine session');
  await mkdir(externalRoot, { recursive: true });
  await assertNormalDirectory(externalRoot, 'external quarantine root');

  const repositoryVolume = await volumeResolver(root);
  const quarantineVolume = await volumeResolver(externalRoot);
  if (String(repositoryVolume) !== String(quarantineVolume)) {
    fail('CROSS_VOLUME_FORBIDDEN', 'root .git quarantine requires a same-volume atomic rename', {
      repositoryVolume,
      quarantineVolume,
    });
  }

  const inventory = await inventoryRootGit(sourcePath);
  const manifestPath = path.join(sessionRoot, 'sealed-manifest.json');
  const manifestSha256Path = path.join(sessionRoot, 'sealed-manifest.sha256');
  const payloadPath = path.join(sessionRoot, PAYLOAD_NAME);
  const applyReceiptPath = path.join(sessionRoot, 'apply-receipt.json');
  const applyReceiptSha256Path = path.join(sessionRoot, 'apply-receipt.sha256');
  const restoreReceiptPath = path.join(sessionRoot, 'restore-receipt.json');
  const restoreReceiptSha256Path = path.join(sessionRoot, 'restore-receipt.sha256');
  const commands = buildCommands(manifestPath);
  const unsigned = {
    schema: PLAN_SCHEMA,
    state: 'sealed-plan',
    sessionId,
    createdAt,
    repositoryRoot: root,
    sourceRelativePath: SOURCE_RELATIVE_PATH,
    sourcePath,
    quarantineRoot: externalRoot,
    sessionRoot,
    manifestPath,
    manifestSha256Path,
    payloadPath,
    applyReceiptPath,
    applyReceiptSha256Path,
    restoreReceiptPath,
    restoreReceiptSha256Path,
    volumes: {
      repository: String(repositoryVolume),
      quarantine: String(quarantineVolume),
      sameVolumeRequired: true,
    },
    inventory,
    safety: {
      exactRootGitOnly: true,
      sourcePathConfigurable: false,
      externalTargetRequired: true,
      overwriteAllowed: false,
      permanentDeletionAllowed: false,
      transferStrategy: 'same-volume-directory-rename',
    },
    commands,
  };
  const plan = { ...unsigned, sealSha256: sha256Text(canonicalJson(unsigned)) };
  const manifestContent = `${JSON.stringify(plan, null, 2)}\n`;
  const manifestFileSha256 = sha256Text(manifestContent);

  await mkdir(sessionRoot, { recursive: false });
  await writeFile(manifestPath, manifestContent, { encoding: 'utf8', flag: 'wx' });
  await writeFile(
    manifestSha256Path,
    `${manifestFileSha256}  sealed-manifest.json\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
  return plan;
}

export async function applyRootGitQuarantine({
  manifestPath,
  volumeResolver = defaultVolumeResolver,
  faultAfterRename = false,
} = {}) {
  const plan = await loadSealedPlan(manifestPath);
  await preflightApply(plan, volumeResolver);
  let moved = false;
  try {
    await rename(plan.sourcePath, plan.payloadPath);
    moved = true;
    if (faultAfterRename) throw new Error('injected root git quarantine fault after rename');
    await assertMissing(plan.sourcePath, 'repository root .git after quarantine');
    const payloadInventory = await inventoryDirectory(plan.payloadPath, SOURCE_RELATIVE_PATH);
    assertInventoryEqual(payloadInventory, plan.inventory, 'payload changed during quarantine rename');
    const receipt = await writeSealedReceipt({
      filePath: plan.applyReceiptPath,
      sidecarPath: plan.applyReceiptSha256Path,
      unsigned: buildApplyReceipt(plan),
    });
    return {
      state: 'quarantined',
      manifestPath: plan.manifestPath,
      manifestSealSha256: plan.sealSha256,
      payloadPath: plan.payloadPath,
      receiptPath: plan.applyReceiptPath,
      receipt,
      restoreCommand: plan.commands.restore,
    };
  } catch (error) {
    if (moved) {
      try {
        await assertMissing(plan.sourcePath, 'repository root .git during failed-apply recovery');
        await rename(plan.payloadPath, plan.sourcePath);
        const recoveredInventory = await inventoryRootGit(plan.sourcePath);
        assertInventoryEqual(recoveredInventory, plan.inventory, 'failed-apply recovery changed root .git');
      } catch (recoveryError) {
        throw new AggregateError(
          [error, recoveryError],
          'root .git quarantine apply failed and reverse-rename recovery was incomplete',
        );
      }
    }
    throw error;
  }
}

export async function publishRootGitApplyReceipt({
  manifestPath,
  volumeResolver = defaultVolumeResolver,
} = {}) {
  const plan = await loadSealedPlan(manifestPath);
  await assertNormalDirectory(plan.repositoryRoot, 'repository root');
  await assertNormalDirectory(plan.quarantineRoot, 'external quarantine root');
  await assertNormalDirectory(plan.sessionRoot, 'sealed quarantine session root');
  await assertSameSealedVolume(plan, volumeResolver);
  if (await pathExists(plan.sourcePath)) {
    fail('SOURCE_STILL_PRESENT', 'receipt-only recovery requires repository root .git to be absent');
  }
  await assertNormalDirectory(plan.payloadPath, 'quarantined root .git payload');
  await assertMissing(plan.applyReceiptPath, 'write-once apply receipt');
  await assertMissing(plan.applyReceiptSha256Path, 'write-once apply receipt sidecar');
  await assertMissing(plan.restoreReceiptPath, 'write-once restore receipt');
  await assertMissing(plan.restoreReceiptSha256Path, 'write-once restore receipt sidecar');
  const payloadInventory = await inventoryDirectory(plan.payloadPath, SOURCE_RELATIVE_PATH);
  assertInventoryEqual(payloadInventory, plan.inventory, 'receipt-only payload differs from the sealed root .git inventory');
  await assertMissing(plan.sourcePath, 'repository root .git before receipt-only publication');

  const receipt = await writeSealedReceipt({
    filePath: plan.applyReceiptPath,
    sidecarPath: plan.applyReceiptSha256Path,
    unsigned: buildApplyReceipt(plan),
  });
  return {
    state: 'quarantined',
    manifestPath: plan.manifestPath,
    manifestSealSha256: plan.sealSha256,
    payloadPath: plan.payloadPath,
    receiptPath: plan.applyReceiptPath,
    receipt,
    restoreCommand: plan.commands.restore,
  };
}

export async function restoreRootGitQuarantine({
  manifestPath,
  volumeResolver = defaultVolumeResolver,
  faultAfterRename = false,
} = {}) {
  const plan = await loadSealedPlan(manifestPath);
  await assertNormalDirectory(plan.repositoryRoot, 'repository root');
  await assertNormalDirectory(plan.quarantineRoot, 'external quarantine root');
  await assertNormalDirectory(plan.sessionRoot, 'sealed quarantine session root');
  await assertSameSealedVolume(plan, volumeResolver);
  await loadSealedReceipt({
    filePath: plan.applyReceiptPath,
    sidecarPath: plan.applyReceiptSha256Path,
    schema: APPLY_RECEIPT_SCHEMA,
    plan,
    missingCode: 'APPLY_RECEIPT_REQUIRED',
  });
  await assertMissing(plan.restoreReceiptPath, 'write-once restore receipt');
  await assertMissing(plan.restoreReceiptSha256Path, 'write-once restore receipt sidecar');
  if (await pathExists(plan.sourcePath)) {
    fail('SOURCE_COLLISION', 'restore refuses to overwrite an existing repository root .git');
  }
  await assertNormalDirectory(plan.payloadPath, 'quarantined root .git payload');
  const payloadInventory = await inventoryDirectory(plan.payloadPath, SOURCE_RELATIVE_PATH);
  assertInventoryEqual(payloadInventory, plan.inventory, 'quarantined root .git payload drifted before restore');

  let moved = false;
  try {
    await rename(plan.payloadPath, plan.sourcePath);
    moved = true;
    if (faultAfterRename) throw new Error('injected root git restore fault after rename');
    await assertExactRootGitDirectory(plan.repositoryRoot, plan.sourcePath);
    const restoredInventory = await inventoryRootGit(plan.sourcePath);
    assertInventoryEqual(restoredInventory, plan.inventory, 'restored root .git differs from the sealed inventory');
    const receipt = await writeSealedReceipt({
      filePath: plan.restoreReceiptPath,
      sidecarPath: plan.restoreReceiptSha256Path,
      unsigned: {
        schema: RESTORE_RECEIPT_SCHEMA,
        state: 'restored',
        sessionId: plan.sessionId,
        completedAt: new Date().toISOString(),
        manifestPath: plan.manifestPath,
        manifestSealSha256: plan.sealSha256,
        inventoryEntrySummarySha256: plan.inventory.entrySummarySha256,
        fileCount: plan.inventory.fileCount,
        reparseCount: plan.inventory.reparseCount,
        totalBytes: plan.inventory.totalBytes,
        sourcePath: plan.sourcePath,
        payloadPath: plan.payloadPath,
        action: 'same-volume-directory-rename',
      },
    });
    return {
      state: 'restored',
      manifestPath: plan.manifestPath,
      manifestSealSha256: plan.sealSha256,
      receiptPath: plan.restoreReceiptPath,
      receipt,
    };
  } catch (error) {
    if (moved) {
      try {
        await assertMissing(plan.payloadPath, 'quarantine payload during failed-restore recovery');
        await rename(plan.sourcePath, plan.payloadPath);
        const recoveredInventory = await inventoryDirectory(plan.payloadPath, SOURCE_RELATIVE_PATH);
        assertInventoryEqual(recoveredInventory, plan.inventory, 'failed-restore recovery changed quarantined root .git');
      } catch (recoveryError) {
        throw new AggregateError(
          [error, recoveryError],
          'root .git restore failed and quarantine-state recovery was incomplete',
        );
      }
    }
    throw error;
  }
}

export async function inventoryRootGit(absoluteGitPath) {
  const sourcePath = path.resolve(absoluteGitPath);
  if (path.basename(sourcePath).toLocaleLowerCase() !== SOURCE_RELATIVE_PATH) {
    fail('EXACT_ROOT_GIT_REQUIRED', 'inventoryRootGit accepts only a path whose final component is .git');
  }
  return inventoryDirectory(sourcePath, SOURCE_RELATIVE_PATH);
}

async function preflightApply(plan, volumeResolver) {
  await assertNormalDirectory(plan.repositoryRoot, 'repository root');
  await assertNormalDirectory(plan.quarantineRoot, 'external quarantine root');
  await assertNormalDirectory(plan.sessionRoot, 'sealed quarantine session root');
  await assertExactRootGitDirectory(plan.repositoryRoot, plan.sourcePath);
  await assertSameSealedVolume(plan, volumeResolver);
  await assertMissing(plan.payloadPath, 'write-once root .git payload target');
  await assertMissing(plan.applyReceiptPath, 'write-once apply receipt');
  await assertMissing(plan.applyReceiptSha256Path, 'write-once apply receipt sidecar');
  await assertMissing(plan.restoreReceiptPath, 'write-once restore receipt');
  await assertMissing(plan.restoreReceiptSha256Path, 'write-once restore receipt sidecar');
  const currentInventory = await inventoryRootGit(plan.sourcePath);
  assertInventoryEqual(currentInventory, plan.inventory, 'repository root .git changed after dry-run seal');
}

async function assertSameSealedVolume(plan, volumeResolver) {
  const repositoryVolume = String(await volumeResolver(plan.repositoryRoot));
  const quarantineVolume = String(await volumeResolver(plan.sessionRoot));
  if (repositoryVolume !== quarantineVolume
    || repositoryVolume !== plan.volumes.repository
    || quarantineVolume !== plan.volumes.quarantine) {
    fail('CROSS_VOLUME_FORBIDDEN', 'same-volume identity changed after the dry-run seal', {
      repositoryVolume,
      quarantineVolume,
      sealed: plan.volumes,
    });
  }
}

async function inventoryDirectory(absoluteRoot, relativePrefix) {
  const root = path.resolve(absoluteRoot);
  await assertNormalDirectory(root, `${relativePrefix} inventory root`);
  const files = [];
  const directories = [];
  const reparsePoints = [];

  const visit = async (directory, relativeDirectory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = toPosix(path.posix.join(relativeDirectory, entry.name));
      const stats = await lstat(absolutePath);
      if (stats.isSymbolicLink()) {
        reparsePoints.push({
          relativePath,
          kind: 'symbolic-link-or-junction',
          target: await readlink(absolutePath),
          size: stats.size,
        });
      } else if (stats.isDirectory()) {
        directories.push({ relativePath });
        await visit(absolutePath, relativePath);
      } else if (stats.isFile()) {
        const sha256 = await sha256File(absolutePath);
        const after = await lstat(absolutePath);
        if (!after.isFile() || after.size !== stats.size) {
          fail('INVENTORY_RACE', `file changed while hashing: ${relativePath}`);
        }
        files.push({ relativePath, size: stats.size, sha256 });
      } else {
        fail('UNSUPPORTED_GIT_ENTRY', `unsupported special entry inside root .git: ${relativePath}`);
      }
    }
  };

  await visit(root, relativePrefix);
  files.sort(compareRecord);
  directories.sort(compareRecord);
  reparsePoints.sort(compareRecord);
  const entries = { directories, files, reparsePoints };
  return {
    schema: INVENTORY_SCHEMA,
    sourceRelativePath: SOURCE_RELATIVE_PATH,
    fileCount: files.length,
    directoryCount: directories.length,
    reparseCount: reparsePoints.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0)
      + reparsePoints.reduce((sum, point) => sum + point.size, 0),
    entrySummarySha256: sha256Text(canonicalJson(entries)),
    ...entries,
  };
}

async function loadSealedPlan(manifestPath) {
  if (typeof manifestPath !== 'string' || !path.isAbsolute(manifestPath)) {
    fail('MANIFEST_PATH_REQUIRED', 'an absolute --manifest path is required');
  }
  const absolutePath = path.resolve(manifestPath);
  await assertNormalFile(absolutePath, 'sealed manifest');
  let content;
  let plan;
  try {
    content = await readFile(absolutePath, 'utf8');
    plan = JSON.parse(content);
  } catch (error) {
    fail('INVALID_MANIFEST_JSON', 'sealed manifest is not valid JSON', { cause: String(error) });
  }
  validateFixedPlan(plan, absolutePath);
  await assertNormalFile(plan.manifestSha256Path, 'sealed manifest SHA sidecar');
  const expectedSidecar = `${sha256Text(content)}  sealed-manifest.json\n`;
  const actualSidecar = await readFile(plan.manifestSha256Path, 'utf8');
  if (actualSidecar !== expectedSidecar) {
    fail('MANIFEST_FILE_SHA_MISMATCH', 'sealed manifest file SHA sidecar does not match');
  }
  const { sealSha256, ...unsigned } = plan;
  if (sealSha256 !== sha256Text(canonicalJson(unsigned))) {
    fail('MANIFEST_PLAN_SEAL_MISMATCH', 'sealed manifest plan seal does not match');
  }
  return plan;
}

function validateFixedPlan(plan, absoluteManifestPath) {
  if (!plan || plan.schema !== PLAN_SCHEMA || plan.state !== 'sealed-plan') {
    fail('INVALID_MANIFEST', 'unsupported root .git quarantine manifest');
  }
  validateSessionId(plan.sessionId);
  const root = path.resolve(plan.repositoryRoot);
  const externalRoot = path.resolve(plan.quarantineRoot);
  const expectedSessionRoot = path.join(externalRoot, plan.sessionId);
  const expectedSourcePath = path.join(root, SOURCE_RELATIVE_PATH);
  const expectedManifestPath = path.join(expectedSessionRoot, 'sealed-manifest.json');
  const expected = {
    sourceRelativePath: SOURCE_RELATIVE_PATH,
    sourcePath: expectedSourcePath,
    sessionRoot: expectedSessionRoot,
    manifestPath: expectedManifestPath,
    manifestSha256Path: path.join(expectedSessionRoot, 'sealed-manifest.sha256'),
    payloadPath: path.join(expectedSessionRoot, PAYLOAD_NAME),
    applyReceiptPath: path.join(expectedSessionRoot, 'apply-receipt.json'),
    applyReceiptSha256Path: path.join(expectedSessionRoot, 'apply-receipt.sha256'),
    restoreReceiptPath: path.join(expectedSessionRoot, 'restore-receipt.json'),
    restoreReceiptSha256Path: path.join(expectedSessionRoot, 'restore-receipt.sha256'),
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    const actualValue = field === 'sourceRelativePath' ? plan[field] : path.resolve(plan[field]);
    const normalizedExpected = field === 'sourceRelativePath' ? expectedValue : path.resolve(expectedValue);
    if (field === 'sourceRelativePath' ? actualValue !== normalizedExpected : !samePath(actualValue, normalizedExpected)) {
      fail('EXACT_ROOT_GIT_PATH_DRIFT', `sealed ${field} is not the fixed exact root .git quarantine path`);
    }
  }
  if (!samePath(absoluteManifestPath, expectedManifestPath)) {
    fail('MANIFEST_PATH_MISMATCH', 'the opened manifest path differs from the sealed fixed path');
  }
  validateExternalBoundary(root, externalRoot, expectedSessionRoot);
  const expectedSafety = {
    exactRootGitOnly: true,
    sourcePathConfigurable: false,
    externalTargetRequired: true,
    overwriteAllowed: false,
    permanentDeletionAllowed: false,
    transferStrategy: 'same-volume-directory-rename',
  };
  assertCanonicalEqual(plan.safety, expectedSafety, 'SAFETY_POLICY_DRIFT', 'root .git safety policy changed');
  if (plan.volumes?.sameVolumeRequired !== true
    || String(plan.volumes.repository) !== String(plan.volumes.quarantine)) {
    fail('VOLUME_POLICY_DRIFT', 'sealed plan does not require one fixed same-volume identity');
  }
  assertCanonicalEqual(plan.commands, buildCommands(expectedManifestPath), 'COMMAND_DRIFT', 'apply/restore commands changed');
  validateInventory(plan.inventory);
  if (!/^[a-f0-9]{64}$/u.test(plan.sealSha256 ?? '')) {
    fail('INVALID_MANIFEST_SEAL', 'sealed plan SHA must be lowercase SHA-256');
  }
}

function validateInventory(inventory) {
  if (!inventory || inventory.schema !== INVENTORY_SCHEMA || inventory.sourceRelativePath !== SOURCE_RELATIVE_PATH) {
    fail('INVALID_INVENTORY', 'manifest does not contain the fixed root .git inventory schema');
  }
  for (const collectionName of ['files', 'directories', 'reparsePoints']) {
    const collection = inventory[collectionName];
    if (!Array.isArray(collection)) fail('INVALID_INVENTORY', `${collectionName} inventory must be an array`);
    let previous = '';
    const seen = new Set();
    for (const entry of collection) {
      validateInventoryRelativePath(entry.relativePath);
      const key = entry.relativePath.toLocaleLowerCase();
      if (seen.has(key) || (previous && compareText(previous, entry.relativePath) >= 0)) {
        fail('INVALID_INVENTORY', `${collectionName} inventory is duplicate or unsorted`);
      }
      seen.add(key);
      previous = entry.relativePath;
    }
  }
  for (const file of inventory.files) {
    if (!Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/u.test(file.sha256 ?? '')) {
      fail('INVALID_INVENTORY', `invalid file inventory record: ${file.relativePath}`);
    }
  }
  for (const point of inventory.reparsePoints) {
    if (!Number.isSafeInteger(point.size) || point.size < 0
      || point.kind !== 'symbolic-link-or-junction' || typeof point.target !== 'string') {
      fail('INVALID_INVENTORY', `invalid reparse inventory record: ${point.relativePath}`);
    }
  }
  if (inventory.fileCount !== inventory.files.length
    || inventory.directoryCount !== inventory.directories.length
    || inventory.reparseCount !== inventory.reparsePoints.length) {
    fail('INVALID_INVENTORY', 'inventory counts do not match their sealed record arrays');
  }
  const totalBytes = inventory.files.reduce((sum, file) => sum + file.size, 0)
    + inventory.reparsePoints.reduce((sum, point) => sum + point.size, 0);
  if (inventory.totalBytes !== totalBytes) fail('INVALID_INVENTORY', 'inventory totalBytes does not match records');
  const entrySummarySha256 = sha256Text(canonicalJson({
    directories: inventory.directories,
    files: inventory.files,
    reparsePoints: inventory.reparsePoints,
  }));
  if (inventory.entrySummarySha256 !== entrySummarySha256) {
    fail('INVALID_INVENTORY', 'inventory entry summary SHA does not match records');
  }
}

function validateInventoryRelativePath(relativePath) {
  if (typeof relativePath !== 'string'
    || relativePath === SOURCE_RELATIVE_PATH
    || !relativePath.startsWith(`${SOURCE_RELATIVE_PATH}/`)
    || relativePath.includes('\\')
    || relativePath.split('/').includes('..')) {
    fail('INVALID_INVENTORY_PATH', `inventory entry escaped exact root .git: ${relativePath}`);
  }
}

async function writeSealedReceipt({ filePath, sidecarPath, unsigned }) {
  await assertMissing(filePath, 'write-once receipt');
  await assertMissing(sidecarPath, 'write-once receipt sidecar');
  const receipt = { ...unsigned, receiptSealSha256: sha256Text(canonicalJson(unsigned)) };
  const content = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' });
  await writeFile(
    sidecarPath,
    `${sha256Text(content)}  ${path.basename(filePath)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
  return receipt;
}

function buildApplyReceipt(plan) {
  return {
    schema: APPLY_RECEIPT_SCHEMA,
    state: 'quarantined',
    sessionId: plan.sessionId,
    completedAt: new Date().toISOString(),
    manifestPath: plan.manifestPath,
    manifestSealSha256: plan.sealSha256,
    inventoryEntrySummarySha256: plan.inventory.entrySummarySha256,
    fileCount: plan.inventory.fileCount,
    reparseCount: plan.inventory.reparseCount,
    totalBytes: plan.inventory.totalBytes,
    sourcePath: plan.sourcePath,
    payloadPath: plan.payloadPath,
    action: 'same-volume-directory-rename',
    restoreCommand: plan.commands.restore,
  };
}

async function loadSealedReceipt({ filePath, sidecarPath, schema, plan, missingCode }) {
  if (!await pathExists(filePath)) fail(missingCode, 'sealed apply receipt is required before restore');
  await assertNormalFile(filePath, 'sealed receipt');
  await assertNormalFile(sidecarPath, 'sealed receipt SHA sidecar');
  const content = await readFile(filePath, 'utf8');
  let receipt;
  try {
    receipt = JSON.parse(content);
  } catch (error) {
    fail('INVALID_RECEIPT_JSON', 'receipt is not valid JSON', { cause: String(error) });
  }
  const expectedSidecar = `${sha256Text(content)}  ${path.basename(filePath)}\n`;
  if (await readFile(sidecarPath, 'utf8') !== expectedSidecar) {
    fail('RECEIPT_FILE_SHA_MISMATCH', 'receipt SHA sidecar does not match');
  }
  const { receiptSealSha256, ...unsigned } = receipt;
  if (receiptSealSha256 !== sha256Text(canonicalJson(unsigned))) {
    fail('RECEIPT_PLAN_SEAL_MISMATCH', 'receipt plan seal does not match');
  }
  if (receipt.schema !== schema
    || receipt.state !== 'quarantined'
    || receipt.sessionId !== plan.sessionId
    || receipt.manifestSealSha256 !== plan.sealSha256
    || receipt.inventoryEntrySummarySha256 !== plan.inventory.entrySummarySha256
    || !samePath(receipt.sourcePath, plan.sourcePath)
    || !samePath(receipt.payloadPath, plan.payloadPath)) {
    fail('RECEIPT_BINDING_MISMATCH', 'apply receipt is not bound to this exact sealed root .git plan');
  }
  return receipt;
}

async function assertExactRootGitDirectory(repositoryRoot, candidate) {
  const expected = path.join(path.resolve(repositoryRoot), SOURCE_RELATIVE_PATH);
  if (!samePath(candidate, expected)) {
    fail('EXACT_ROOT_GIT_REQUIRED', 'only the exact repository-root .git path is allowed');
  }
  await assertNormalDirectory(expected, 'repository root .git');
}

async function assertNormalDirectory(candidate, label) {
  let stats;
  try {
    stats = await lstat(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') fail('MISSING_ROOT_GIT', `${label} does not exist`);
    throw error;
  }
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    fail('UNSAFE_NORMAL_DIRECTORY_REQUIRED', `${label} must be a normal directory, not a file or reparse point`);
  }
  const resolved = await realpath(candidate);
  if (!samePath(resolved, candidate)) {
    fail('UNSAFE_REPARSE_PATH', `${label} resolves through a reparse path`);
  }
}

async function assertNormalFile(candidate, label) {
  let stats;
  try {
    stats = await lstat(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') fail('MISSING_SEALED_FILE', `${label} does not exist`);
    throw error;
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    fail('UNSAFE_NORMAL_FILE_REQUIRED', `${label} must be a normal file`);
  }
  const resolved = await realpath(candidate);
  if (!samePath(resolved, candidate)) fail('UNSAFE_REPARSE_PATH', `${label} resolves through a reparse path`);
}

async function assertMissing(candidate, label) {
  if (await pathExists(candidate)) fail('WRITE_ONCE_TARGET_EXISTS', `${label} already exists: ${candidate}`);
}

async function pathExists(candidate) {
  try {
    await lstat(candidate);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function validateExternalBoundary(repositoryRoot, quarantineRoot, sessionRoot) {
  const root = path.resolve(repositoryRoot);
  const external = path.resolve(quarantineRoot);
  const session = path.resolve(sessionRoot);
  if (isWithin(root, external) || isWithin(root, session) || isWithin(session, root)) {
    fail('EXTERNAL_QUARANTINE_REQUIRED', 'quarantine session must be uniquely outside the repository root');
  }
}

function validateSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !/^[a-z0-9][a-z0-9._-]{7,127}$/iu.test(sessionId)
    || sessionId === '.' || sessionId === '..') {
    fail('INVALID_SESSION_ID', 'session id must be one safe path segment');
  }
}

function buildCommands(manifestPath) {
  const script = quoteCommandPath(SCRIPT_PATH);
  const manifest = quoteCommandPath(path.resolve(manifestPath));
  return {
    apply: `node ${script} --apply --manifest ${manifest}`,
    restore: `node ${script} --restore --manifest ${manifest}`,
  };
}

function quoteCommandPath(candidate) {
  return `"${String(candidate).replaceAll('"', '\\"')}"`;
}

function createSessionId() {
  return `task12-root-git-${new Date().toISOString().replaceAll(/[-:.]/gu, '').toLocaleLowerCase()}`;
}

function defaultVolumeResolver(candidate) {
  return path.parse(path.resolve(candidate)).root.toLocaleLowerCase();
}

function isWithin(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function samePath(left, right) {
  return path.resolve(String(left)).toLocaleLowerCase() === path.resolve(String(right)).toLocaleLowerCase();
}

function toPosix(candidate) {
  return candidate.replaceAll('\\', '/');
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareRecord(left, right) {
  return compareText(left.relativePath, right.relativePath);
}

function canonicalJson(value) {
  const sort = (candidate) => {
    if (Array.isArray(candidate)) return candidate.map(sort);
    if (candidate && typeof candidate === 'object') {
      return Object.fromEntries(Object.keys(candidate).sort().map((key) => [key, sort(candidate[key])]));
    }
    return candidate;
  };
  return JSON.stringify(sort(value));
}

function assertCanonicalEqual(actual, expected, code, message) {
  if (canonicalJson(actual) !== canonicalJson(expected)) fail(code, message);
}

function assertInventoryEqual(actual, expected, message) {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    fail('INVENTORY_DRIFT', message, {
      expectedEntrySummarySha256: expected?.entrySummarySha256,
      actualEntrySummarySha256: actual?.entrySummarySha256,
    });
  }
}

function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function fail(code, message, details = {}) {
  throw new RootGitQuarantineError(code, message, details);
}

function readCliOption(args, name) {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const prefix = `${name}=`;
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

const isMain = process.argv[1] && samePath(process.argv[1], SCRIPT_PATH);
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    process.stdout.write(HELP);
  } else {
    try {
      const modes = ['--dry-run', '--apply', '--publish-apply-receipt', '--restore']
        .filter((mode) => args.includes(mode));
      if (modes.length > 1) {
        fail('MODE_CONFLICT', 'choose only one of --dry-run, --apply, --publish-apply-receipt, or --restore');
      }
      const mode = modes[0] ?? '--dry-run';
      if (mode === '--dry-run') {
        const plan = await sealRootGitQuarantinePlan({
          repositoryRoot: path.resolve(readCliOption(args, '--root') ?? process.cwd()),
          quarantineRoot: path.resolve(readCliOption(args, '--quarantine-root') ?? DEFAULT_QUARANTINE_ROOT),
          sessionId: readCliOption(args, '--session') ?? createSessionId(),
        });
        process.stdout.write(`${JSON.stringify({
          schema: plan.schema,
          state: plan.state,
          applied: false,
          manifestPath: plan.manifestPath,
          sealSha256: plan.sealSha256,
          payloadPath: plan.payloadPath,
          fileCount: plan.inventory.fileCount,
          reparseCount: plan.inventory.reparseCount,
          totalBytes: plan.inventory.totalBytes,
          applyCommand: plan.commands.apply,
          restoreCommand: plan.commands.restore,
        }, null, 2)}\n`);
      } else {
        const manifestPath = readCliOption(args, '--manifest');
        if (!manifestPath) fail('MANIFEST_PATH_REQUIRED', `${mode} requires --manifest <absolute-path>`);
        const absoluteManifestPath = path.resolve(manifestPath);
        const result = mode === '--apply'
          ? await applyRootGitQuarantine({ manifestPath: absoluteManifestPath })
          : mode === '--publish-apply-receipt'
            ? await publishRootGitApplyReceipt({ manifestPath: absoluteManifestPath })
            : await restoreRootGitQuarantine({ manifestPath: absoluteManifestPath });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      }
    } catch (error) {
      process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
      process.exitCode = error instanceof RootGitQuarantineError ? 1 : 2;
    }
  }
}

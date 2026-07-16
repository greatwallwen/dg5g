#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, readdir, readlink, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLegacyRuntimeClosureAudit } from './audit-legacy-runtime-closure.mjs';
const SCHEMA = 'dgbook.legacy-workspace-quarantine/v1';
const DEFAULT_QUARANTINE_ROOT = path.resolve('D:/Claude/dgbook-quarantine');
const PROTECTED_MEDIA_PATH = 'site/public/media';
const EXPECTED_SITE_PUBLIC_CHILDREN = Object.freeze(['avatars', 'favicon.svg', 'interactives', 'media']);
const LEGACY_SCRIPT_PATHS = Object.freeze([
  'scripts/prepare-cloud-sample.mjs', 'scripts/verify-cloud-sample.mjs', 'scripts/audit-cloud-sample-portability.mjs',
  'scripts/audit-cloud-sample-runtime.mjs', 'scripts/audit-cloud-sample-remote.mjs', 'scripts/smoke-cloud-sample-archive.mjs',
  'scripts/archive-cloud-sample.mjs', 'scripts/verify-cloud-sample-archive.mjs', 'scripts/cloud-sample-preflight.mjs',
  'scripts/deploy-cloud-sample-ssh.mjs', 'scripts/prepare-cloud-sample-release.mjs', '.gitea/workflows/deploy-cloud-sample.yml',
  'scripts/audit-product-closure.mjs', 'scripts/audit-product-maturity.mjs',
]);
export const LEGACY_WORKSPACE_GROUPS = Object.freeze([
  Object.freeze({ id: 'legacy-scripts', kind: 'regular', roots: LEGACY_SCRIPT_PATHS }),
  Object.freeze({ id: 'site-a', kind: 'regular', roots: Object.freeze(['site/src', 'site/astro.config.mjs', 'site/package.json', 'site/tsconfig.json']) }),
  Object.freeze({ id: 'site-b', kind: 'regular', roots: Object.freeze(['site/public/avatars', 'site/public/interactives', 'site/public/favicon.svg']) }),
  Object.freeze({ id: 'site-dependencies', kind: 'opaque', roots: Object.freeze(['site/node_modules']) }),
  Object.freeze({ id: 'studio', kind: 'opaque', roots: Object.freeze(['studio']) }),
  Object.freeze({ id: 'openmaic', kind: 'opaque', roots: Object.freeze(['OpenMAIC']) }),
]);
const HELP = `DGBook legacy workspace quarantine
Usage:
  node scripts/quarantine-legacy-workspace.mjs --dry-run [--session <id>] [--root <path>] [--quarantine-root <path>]
  node scripts/quarantine-legacy-workspace.mjs --apply --manifest <absolute-path>
  node scripts/quarantine-legacy-workspace.mjs --restore --manifest <absolute-path>
The default external root is D:/Claude/dgbook-quarantine/<session>/legacy.
Dry-run writes a write-once sealed manifest. Apply and restore are explicit.
`;
export class LegacyWorkspaceQuarantineError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'LegacyWorkspaceQuarantineError';
    this.code = code;
    this.details = details;
  }
}
export async function sealLegacyWorkspaceQuarantinePlan({
  repositoryRoot = process.cwd(), quarantineRoot = DEFAULT_QUARANTINE_ROOT, sessionId = createSessionId(),
  createdAt = new Date().toISOString(), closureAuditLoader = loadLegacyRuntimeClosureAudit,
  reparseDetector = defaultReparseDetector, volumeResolver = defaultVolumeResolver,
} = {}) {
  const root = path.resolve(repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : repositoryRoot);
  const externalRoot = path.resolve(quarantineRoot);
  validateSessionId(sessionId);
  validateExternalQuarantineRoot(root, externalRoot);
  await assertNormalDirectory(root, reparseDetector, 'repository root');
  const closureAudit = await closureAuditLoader({ repositoryRoot: root });
  if (!closureAudit || closureAudit.passed !== true || (closureAudit.blockers?.length ?? 0) !== 0) {
    fail('ACTIVE_AUDIT_RED', 'legacy runtime closure audit must be green before planning', {
      blockers: closureAudit?.blockers ?? [],
    });
  }
  const workspaceClosure = await auditWorkspaceClosure(root);
  if (!workspaceClosure.passed) {
    fail('WORKSPACE_CLOSURE_RED', 'package/workspace/lock still references legacy runtime', {
      blockers: workspaceClosure.blockers,
    });
  }
  await assertSiteRootBoundary(root, reparseDetector);
  const protectedMedia = await auditProtectedMedia({ repositoryRoot: root, reparseDetector });
  const repositoryVolume = await volumeResolver(root);
  const quarantineVolume = await volumeResolver(externalRoot);
  if (String(repositoryVolume) !== String(quarantineVolume)) {
    fail('CROSS_VOLUME_FORBIDDEN', 'legacy quarantine requires the repository and quarantine root on one volume', {
      repositoryVolume,
      quarantineVolume,
    });
  }
  const legacyRoot = path.join(externalRoot, sessionId, 'legacy');
  const payloadRoot = path.join(legacyRoot, 'payload');
  const manifestPath = path.join(legacyRoot, 'sealed-manifest.json');
  const manifestSha256Path = path.join(legacyRoot, 'sealed-manifest.sha256');
  await assertMissing(path.join(externalRoot, sessionId), 'write-once quarantine session');
  const groups = [];
  for (const definition of LEGACY_WORKSPACE_GROUPS) {
    const group = await inventoryGroup({
      repositoryRoot: root,
      payloadRoot,
      definition,
      reparseDetector,
      repositoryVolume,
      quarantineVolume,
    });
    groups.push(group);
  }
  assertProtectedMediaExcluded(groups);
  const unsigned = {
    schema: SCHEMA,
    state: 'sealed-plan',
    sessionId,
    createdAt,
    repositoryRoot: root,
    quarantineRoot: externalRoot,
    legacyRoot,
    payloadRoot,
    manifestPath,
    manifestSha256Path,
    groupOrder: LEGACY_WORKSPACE_GROUPS.map(({ id }) => id),
    closureAudit: {
      schema: closureAudit.schema,
      passed: true,
      blockers: [],
    },
    workspaceClosure,
    protectedMedia,
    volumes: {
      repository: String(repositoryVolume),
      quarantine: String(quarantineVolume),
      sameVolumeRequired: true,
    },
    groups,
    safety: {
      protectedPaths: [PROTECTED_MEDIA_PATH, '.git'],
      crossVolumeAllowed: false,
      opaqueRootsAreRenameOnly: true,
      nestedOpenmaicGitIsPayload: true,
      rootGitIsPayload: false,
    },
  };
  const sealSha256 = sha256Text(canonicalJson(unsigned));
  const plan = { ...unsigned, sealSha256 };
  const content = `${JSON.stringify(plan, null, 2)}\n`;
  const manifestFileSha256 = sha256Text(content);
  await mkdir(externalRoot, { recursive: true });
  await mkdir(path.join(externalRoot, sessionId), { recursive: false });
  await mkdir(legacyRoot, { recursive: false });
  await writeFile(manifestPath, content, { encoding: 'utf8', flag: 'wx' });
  await writeFile(
    manifestSha256Path,
    `${manifestFileSha256}  sealed-manifest.json\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
  return plan;
}
export async function applyLegacyWorkspaceQuarantine({
  manifestPath, closureAuditLoader = loadLegacyRuntimeClosureAudit, reparseDetector = defaultReparseDetector,
  volumeResolver = defaultVolumeResolver, faultAfterMoves,
} = {}) {
  const plan = await loadSealedPlan(manifestPath, reparseDetector);
  await preflightApply({ plan, closureAuditLoader, reparseDetector, volumeResolver });
  const applyReceiptPath = path.join(plan.legacyRoot, 'apply-receipt.json');
  const applyReceiptSha256Path = path.join(plan.legacyRoot, 'apply-receipt.sha256');
  await assertMissing(applyReceiptPath, 'write-once apply receipt');
  await assertMissing(applyReceiptSha256Path, 'write-once apply receipt sidecar');
  await assertMissing(path.join(plan.legacyRoot, 'restore-receipt.json'), 'write-once restore receipt');
  await mkdir(plan.payloadRoot, { recursive: false });
  const actions = [];
  try {
    for (const group of plan.groups) {
      for (const root of group.roots) {
        await mkdir(path.dirname(root.targetPath), { recursive: true });
        await rename(root.sourcePath, root.targetPath);
        actions.push({ groupId: group.id, relativePath: root.relativePath, sourcePath: root.sourcePath, targetPath: root.targetPath });
        if (faultAfterMoves === actions.length) {
          throw new Error(`injected legacy quarantine fault after move ${actions.length}`);
        }
      }
    }
    await assertPostQuarantineSiteBoundary(plan.repositoryRoot, reparseDetector);
    await auditPlanGroupsAt(plan, 'target', reparseDetector);
    const receipt = await writeSealedReceipt({
      filePath: applyReceiptPath,
      sidecarPath: applyReceiptSha256Path,
      unsigned: {
        schema: 'dgbook.legacy-workspace-quarantine-apply/v1',
        state: 'quarantined',
        sessionId: plan.sessionId,
        manifestSealSha256: plan.sealSha256,
        actions,
      },
    });
    return { state: 'quarantined', actions, receiptPath: applyReceiptPath, receipt };
  } catch (error) {
    const recoveryErrors = [];
    for (const action of [...actions].reverse()) {
      try {
        await mkdir(path.dirname(action.sourcePath), { recursive: true });
        await rename(action.targetPath, action.sourcePath);
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError);
      }
    }
    if (recoveryErrors.length === 0) await removeEmptyPayload(plan);
    if (recoveryErrors.length > 0) {
      throw new AggregateError([error, ...recoveryErrors], 'legacy quarantine apply failed and reverse recovery was incomplete');
    }
    throw error;
  }
}
export async function restoreLegacyWorkspaceQuarantine({
  manifestPath, reparseDetector = defaultReparseDetector, volumeResolver = defaultVolumeResolver, faultAfterRestores,
} = {}) {
  const plan = await loadSealedPlan(manifestPath, reparseDetector);
  validateFixedPlan(plan);
  validateExternalQuarantineRoot(plan.repositoryRoot, plan.quarantineRoot);
  const repositoryVolume = await volumeResolver(plan.repositoryRoot);
  const quarantineVolume = await volumeResolver(plan.legacyRoot);
  if (String(repositoryVolume) !== String(quarantineVolume)) {
    fail('CROSS_VOLUME_FORBIDDEN', 'restore requires the original same-volume boundary');
  }
  const applyReceiptPath = path.join(plan.legacyRoot, 'apply-receipt.json');
  await loadSealedReceipt(applyReceiptPath, 'dgbook.legacy-workspace-quarantine-apply/v1', plan.sealSha256, reparseDetector);
  const restoreReceiptPath = path.join(plan.legacyRoot, 'restore-receipt.json');
  const restoreReceiptSha256Path = path.join(plan.legacyRoot, 'restore-receipt.sha256');
  await assertMissing(restoreReceiptPath, 'write-once restore receipt');
  await assertMissing(restoreReceiptSha256Path, 'write-once restore receipt sidecar');
  await auditPlanGroupsAt(plan, 'target', reparseDetector);
  await assertAllRootsMissing(plan, 'source');
  const actions = [];
  try {
    for (const group of [...plan.groups].reverse()) {
      for (const root of [...group.roots].reverse()) {
        await mkdir(path.dirname(root.sourcePath), { recursive: true });
        await rename(root.targetPath, root.sourcePath);
        actions.push({ groupId: group.id, relativePath: root.relativePath, sourcePath: root.sourcePath, targetPath: root.targetPath });
        if (faultAfterRestores === actions.length) {
          throw new Error(`injected legacy restore fault after restore ${actions.length}`);
        }
      }
    }
    await auditPlanGroupsAt(plan, 'source', reparseDetector);
    const protectedMedia = await auditProtectedMedia({ repositoryRoot: plan.repositoryRoot, reparseDetector });
    assertCanonicalEqual(protectedMedia, plan.protectedMedia, 'PROTECTED_MEDIA_DRIFT', 'protected media changed before restore');
    await rm(plan.payloadRoot, { recursive: true, force: true });
    const receipt = await writeSealedReceipt({
      filePath: restoreReceiptPath,
      sidecarPath: restoreReceiptSha256Path,
      unsigned: {
        schema: 'dgbook.legacy-workspace-quarantine-restore/v1',
        state: 'restored',
        sessionId: plan.sessionId,
        manifestSealSha256: plan.sealSha256,
        actions,
      },
    });
    return { state: 'restored', actions, receiptPath: restoreReceiptPath, receipt };
  } catch (error) {
    const recoveryErrors = [];
    for (const action of [...actions].reverse()) {
      try {
        await mkdir(path.dirname(action.targetPath), { recursive: true });
        await rename(action.sourcePath, action.targetPath);
      } catch (recoveryError) {
        recoveryErrors.push(recoveryError);
      }
    }
    if (recoveryErrors.length > 0) {
      throw new AggregateError([error, ...recoveryErrors], 'legacy restore failed and quarantine-state recovery was incomplete');
    }
    throw error;
  }
}
async function preflightApply({ plan, closureAuditLoader, reparseDetector, volumeResolver }) {
  validateFixedPlan(plan);
  validateExternalQuarantineRoot(plan.repositoryRoot, plan.quarantineRoot);
  await assertNormalDirectory(plan.repositoryRoot, reparseDetector, 'repository root');
  await assertNormalDirectory(plan.legacyRoot, reparseDetector, 'sealed legacy session root');
  const closureAudit = await closureAuditLoader({ repositoryRoot: plan.repositoryRoot });
  if (!closureAudit || closureAudit.passed !== true || (closureAudit.blockers?.length ?? 0) !== 0) {
    fail('ACTIVE_AUDIT_RED', 'legacy runtime closure audit must remain green at apply', {
      blockers: closureAudit?.blockers ?? [],
    });
  }
  const workspaceClosure = await auditWorkspaceClosure(plan.repositoryRoot);
  if (!workspaceClosure.passed) fail('WORKSPACE_CLOSURE_RED', 'workspace closure regressed before apply', workspaceClosure);
  assertCanonicalEqual(workspaceClosure, plan.workspaceClosure, 'WORKSPACE_CLOSURE_DRIFT', 'workspace package/lock snapshot changed');
  const protectedMedia = await auditProtectedMedia({ repositoryRoot: plan.repositoryRoot, reparseDetector });
  assertCanonicalEqual(protectedMedia, plan.protectedMedia, 'PROTECTED_MEDIA_DRIFT', 'protected media boundary changed');
  const repositoryVolume = await volumeResolver(plan.repositoryRoot);
  const quarantineVolume = await volumeResolver(plan.legacyRoot);
  if (String(repositoryVolume) !== String(quarantineVolume)
    || String(repositoryVolume) !== plan.volumes.repository
    || String(quarantineVolume) !== plan.volumes.quarantine) {
    fail('CROSS_VOLUME_FORBIDDEN', 'same-volume identity changed after dry-run');
  }
  await assertMissing(plan.payloadRoot, 'unique quarantine payload target');
  await assertAllRootsMissing(plan, 'target');
  await auditPlanGroupsAt(plan, 'source', reparseDetector);
}
async function auditPlanGroupsAt(plan, location, reparseDetector) {
  for (const group of plan.groups) {
    const files = [];
    const reparsePoints = [];
    for (const root of group.roots) {
      const absoluteRoot = location === 'source' ? root.sourcePath : root.targetPath;
      if (location === 'source') await assertSafeRepositoryChain(plan.repositoryRoot, absoluteRoot, reparseDetector);
      const inventory = await inventoryTree({
        absoluteRoot,
        repositoryRelativeRoot: root.relativePath,
        allowInternalReparse: group.kind === 'opaque',
        hashFiles: true,
        reparseDetector,
      });
      assertCanonicalEqual(inventory.rootIdentity, root.rootIdentity, 'ROOT_IDENTITY_DRIFT', `${location} root identity changed: ${root.relativePath}`);
      if (inventory.entrySummarySha256 !== root.entrySummarySha256) {
        fail('ENTRY_SUMMARY_DRIFT', `${location} directory entry summary changed: ${root.relativePath}`);
      }
      files.push(...inventory.files);
      reparsePoints.push(...inventory.reparsePoints);
    }
    files.sort(compareRelativePath);
    reparsePoints.sort(compareRelativePath);
    assertCanonicalEqual(files, group.files, 'FILE_HASH_DRIFT', `${location} per-file SHA inventory changed: ${group.id}`);
    assertCanonicalEqual(reparsePoints, group.reparsePoints, 'REPARSE_SUMMARY_DRIFT', `${location} opaque reparse summary changed: ${group.id}`);
  }
}
async function assertAllRootsMissing(plan, location) {
  const seen = new Set();
  for (const group of plan.groups) {
    for (const root of group.roots) {
      const candidate = location === 'source' ? root.sourcePath : root.targetPath;
      const key = path.resolve(candidate).toLocaleLowerCase();
      if (seen.has(key)) fail('DUPLICATE_TARGET', `duplicate ${location} path in sealed plan: ${candidate}`);
      seen.add(key);
      await assertMissing(candidate, `${location} root`);
    }
  }
}
function validateFixedPlan(plan) {
  if (!plan || plan.schema !== SCHEMA || plan.state !== 'sealed-plan') fail('INVALID_MANIFEST', 'unsupported sealed manifest');
  const expectedOrder = LEGACY_WORKSPACE_GROUPS.map(({ id }) => id);
  if (canonicalJson(plan.groupOrder) !== canonicalJson(expectedOrder)) {
    fail('GROUP_ORDER_DRIFT', 'sealed manifest declared group order differs from the fixed apply order');
  }
  const actual = plan.groups.map((group) => ({
    id: group.id,
    kind: group.kind,
    roots: group.roots.map(({ relativePath }) => relativePath),
  }));
  const expected = LEGACY_WORKSPACE_GROUPS.map(({ id, kind, roots }) => ({ id, kind, roots: [...roots] }));
  assertCanonicalEqual(actual, expected, 'GROUP_DEFINITION_DRIFT', 'sealed manifest does not use the fixed group order and roots');
  if (!plan.safety?.nestedOpenmaicGitIsPayload || plan.safety?.rootGitIsPayload !== false) {
    fail('GIT_BOUNDARY_DRIFT', 'OpenMAIC nested .git must be payload and repository .git must be excluded');
  }
  assertProtectedMediaExcluded(plan.groups);
  for (const group of plan.groups) {
    for (const root of group.roots) {
      const expectedTarget = path.join(plan.payloadRoot, ...root.relativePath.split('/'));
      if (!samePath(root.targetPath, expectedTarget)) fail('TARGET_PATH_DRIFT', `non-canonical quarantine target: ${root.relativePath}`);
      if (root.relativePath === '.git' || root.relativePath.startsWith('.git/')) fail('ROOT_GIT_SELECTED', 'repository .git entered quarantine payload');
      if (group.kind === 'opaque' && root.transferStrategy !== 'same-volume-opaque-rename') {
        fail('OPAQUE_TRANSFER_DRIFT', `opaque group is not same-volume rename only: ${group.id}`);
      }
    }
  }
}
async function loadSealedPlan(manifestPath, reparseDetector) {
  if (typeof manifestPath !== 'string' || !path.isAbsolute(manifestPath)) fail('MANIFEST_PATH_REQUIRED', 'absolute --manifest path is required');
  const absolutePath = path.resolve(manifestPath);
  const manifestStat = await safeLstat(absolutePath, 'sealed manifest');
  if (!manifestStat.isFile() || await isReparse(absolutePath, manifestStat, reparseDetector)) fail('UNSAFE_MANIFEST', 'sealed manifest must be a normal file');
  if (!samePath(await realpath(absolutePath), absolutePath)) fail('UNSAFE_MANIFEST', 'sealed manifest resolves through a link');
  const text = await readFile(absolutePath, 'utf8');
  const plan = JSON.parse(text);
  if (!samePath(plan.manifestPath, absolutePath)) fail('MANIFEST_PATH_MISMATCH', 'sealed manifest path does not match its payload');
  const sidecarPath = path.resolve(plan.manifestSha256Path);
  const sidecarStat = await safeLstat(sidecarPath, 'sealed manifest sidecar');
  if (!sidecarStat.isFile() || await isReparse(sidecarPath, sidecarStat, reparseDetector)) fail('UNSAFE_MANIFEST', 'sealed manifest sidecar must be normal');
  const expectedSidecar = `${sha256Text(text)}  sealed-manifest.json\n`;
  if (await readFile(sidecarPath, 'utf8') !== expectedSidecar) fail('MANIFEST_FILE_SHA_MISMATCH', 'sealed manifest sidecar mismatch');
  const { sealSha256, ...unsigned } = plan;
  if (sealSha256 !== sha256Text(canonicalJson(unsigned))) fail('MANIFEST_SEAL_MISMATCH', 'sealed manifest payload hash mismatch');
  return plan;
}
async function writeSealedReceipt({ filePath, sidecarPath, unsigned }) {
  const receipt = { ...unsigned, sealSha256: sha256Text(canonicalJson(unsigned)) };
  const content = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' });
  await writeFile(sidecarPath, `${sha256Text(content)}  ${path.basename(filePath)}\n`, { encoding: 'utf8', flag: 'wx' });
  return receipt;
}
async function loadSealedReceipt(filePath, schema, manifestSealSha256, reparseDetector) {
  const receiptStat = await safeLstat(filePath, 'apply receipt');
  if (!receiptStat.isFile() || await isReparse(filePath, receiptStat, reparseDetector)) fail('UNSAFE_RECEIPT', 'receipt must be a normal file');
  const content = await readFile(filePath, 'utf8');
  const sidecarPath = filePath.replace(/\.json$/u, '.sha256');
  const expected = `${sha256Text(content)}  ${path.basename(filePath)}\n`;
  if (await readFile(sidecarPath, 'utf8') !== expected) fail('RECEIPT_FILE_SHA_MISMATCH', 'receipt sidecar mismatch');
  const receipt = JSON.parse(content);
  const { sealSha256, ...unsigned } = receipt;
  if (receipt.schema !== schema || receipt.manifestSealSha256 !== manifestSealSha256) fail('RECEIPT_MISMATCH', 'receipt does not belong to this manifest');
  if (sealSha256 !== sha256Text(canonicalJson(unsigned))) fail('RECEIPT_SEAL_MISMATCH', 'receipt payload hash mismatch');
  return receipt;
}
async function assertPostQuarantineSiteBoundary(repositoryRoot, reparseDetector) {
  const siteRoot = resolveRepositoryPath(repositoryRoot, 'site');
  await assertSafeRepositoryChain(repositoryRoot, siteRoot, reparseDetector);
  const siteChildren = (await readdir(siteRoot)).sort();
  if (canonicalJson(siteChildren) !== canonicalJson(['public'])) fail('SITE_POSTCONDITION_FAILED', 'site must retain only public after quarantine');
  const publicChildren = (await readdir(path.join(siteRoot, 'public'))).sort();
  if (canonicalJson(publicChildren) !== canonicalJson(['media'])) fail('SITE_POSTCONDITION_FAILED', 'site/public must retain only protected media');
}
async function removeEmptyPayload(plan) {
  try {
    await assertAllRootsMissing(plan, 'target');
    await rm(plan.payloadRoot, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== 'REQUIRED_PATH_MISSING') throw error;
  }
}
function assertCanonicalEqual(actual, expected, code, message) {
  if (canonicalJson(actual) !== canonicalJson(expected)) fail(code, message, { actual, expected });
}
async function inventoryGroup({ repositoryRoot, payloadRoot, definition, reparseDetector, repositoryVolume, quarantineVolume }) {
  const roots = [];
  const files = [];
  const reparsePoints = [];
  for (const relativePath of definition.roots) {
    const sourcePath = resolveRepositoryPath(repositoryRoot, relativePath);
    await assertSafeRepositoryChain(repositoryRoot, sourcePath, reparseDetector);
    const inventory = await inventoryTree({
      absoluteRoot: sourcePath,
      repositoryRelativeRoot: relativePath,
      allowInternalReparse: definition.kind === 'opaque',
      hashFiles: true,
      reparseDetector,
    });
    roots.push({
      relativePath,
      sourcePath,
      targetPath: path.join(payloadRoot, ...relativePath.split('/')),
      rootIdentity: inventory.rootIdentity,
      entrySummarySha256: inventory.entrySummarySha256,
      ordinaryFileCount: inventory.files.length,
      ordinaryFileBytes: inventory.files.reduce((sum, file) => sum + file.size, 0),
      directoryCount: inventory.entries.filter(({ type }) => type === 'directory').length,
      reparsePointCount: inventory.reparsePoints.length,
      sameVolumeRequired: definition.kind === 'opaque',
      transferStrategy: definition.kind === 'opaque' ? 'same-volume-opaque-rename' : 'same-volume-rename',
      nestedGitPayload: definition.id === 'openmaic',
    });
    files.push(...inventory.files);
    reparsePoints.push(...inventory.reparsePoints);
  }
  files.sort(compareRelativePath);
  reparsePoints.sort(compareRelativePath);
  return {
    id: definition.id,
    kind: definition.kind,
    repositoryVolume: String(repositoryVolume),
    quarantineVolume: String(quarantineVolume),
    roots,
    files,
    reparsePoints,
    entrySummarySha256: sha256Text(canonicalJson(roots.map((root) => ({
      relativePath: root.relativePath,
      rootIdentity: root.rootIdentity,
      entrySummarySha256: root.entrySummarySha256,
    })))),
  };
}
async function inventoryTree({ absoluteRoot, repositoryRelativeRoot, allowInternalReparse, hashFiles, reparseDetector }) {
  const rootStat = await safeLstat(absoluteRoot, `required quarantine root ${repositoryRelativeRoot}`);
  if (await isReparse(absoluteRoot, rootStat, reparseDetector)) {
    fail('ROOT_REPARSE_FORBIDDEN', `quarantine root is a reparse point: ${repositoryRelativeRoot}`);
  }
  if (!rootStat.isDirectory() && !rootStat.isFile()) {
    fail('UNSUPPORTED_ROOT_TYPE', `quarantine root must be a regular file or directory: ${repositoryRelativeRoot}`);
  }
  const rootIdentity = statIdentity(rootStat);
  const entries = [];
  const files = [];
  const reparsePoints = [];
  async function visit(absolutePath, relativePath) {
    const candidateStat = await safeLstat(absolutePath, relativePath);
    const reparse = await isReparse(absolutePath, candidateStat, reparseDetector);
    if (reparse) {
      if (!allowInternalReparse || relativePath === repositoryRelativeRoot) {
        fail('REPARSE_FORBIDDEN', `regular quarantine group contains a reparse point: ${relativePath}`);
      }
      let linkTarget;
      try {
        linkTarget = await readlink(absolutePath);
      } catch {
        linkTarget = '<opaque-reparse-target>';
      }
      const record = {
        relativePath: normalizeRelativePath(relativePath),
        type: 'reparse-point',
        linkTarget,
        identity: statIdentity(candidateStat),
      };
      entries.push(record);
      reparsePoints.push(record);
      return;
    }
    if (candidateStat.isDirectory()) {
      entries.push({
        relativePath: normalizeRelativePath(relativePath),
        type: 'directory',
        identity: statIdentity(candidateStat),
      });
      const children = await readdir(absolutePath, { withFileTypes: true });
      for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
        await visit(path.join(absolutePath, child.name), `${normalizeRelativePath(relativePath)}/${child.name}`);
      }
      return;
    }
    if (!candidateStat.isFile()) {
      fail('UNSUPPORTED_ENTRY_TYPE', `unsupported entry in quarantine root: ${relativePath}`);
    }
    const record = {
      relativePath: normalizeRelativePath(relativePath),
      size: candidateStat.size,
      sha256: hashFiles ? await sha256File(absolutePath) : undefined,
    };
    entries.push({ ...record, type: 'file', identity: statIdentity(candidateStat) });
    files.push(record);
  }
  await visit(absoluteRoot, repositoryRelativeRoot);
  entries.sort(compareRelativePath);
  files.sort(compareRelativePath);
  reparsePoints.sort(compareRelativePath);
  return {
    rootIdentity,
    entries,
    files,
    reparsePoints,
    entrySummarySha256: sha256Text(canonicalJson(entries)),
  };
}
async function auditProtectedMedia({ repositoryRoot, reparseDetector }) {
  const sitePublic = resolveRepositoryPath(repositoryRoot, 'site/public');
  await assertSafeRepositoryChain(repositoryRoot, sitePublic, reparseDetector);
  const children = (await readdir(sitePublic)).sort();
  if (canonicalJson(children) !== canonicalJson(EXPECTED_SITE_PUBLIC_CHILDREN)) {
    fail('SITE_PUBLIC_BOUNDARY_DRIFT', 'site/public must contain only fixed Site-B entries and protected media', {
      expected: EXPECTED_SITE_PUBLIC_CHILDREN,
      actual: children,
    });
  }
  const mediaRoot = resolveRepositoryPath(repositoryRoot, PROTECTED_MEDIA_PATH);
  const inventory = await inventoryTree({
    absoluteRoot: mediaRoot,
    repositoryRelativeRoot: PROTECTED_MEDIA_PATH,
    allowInternalReparse: false,
    hashFiles: false,
    reparseDetector,
  });
  return {
    relativePath: PROTECTED_MEDIA_PATH,
    rootIdentity: inventory.rootIdentity,
    entrySummarySha256: inventory.entrySummarySha256,
    ordinaryFileCount: inventory.files.length,
    ordinaryFileBytes: inventory.files.reduce((sum, file) => sum + file.size, 0),
    directoryCount: inventory.entries.filter(({ type }) => type === 'directory').length,
    reparsePointCount: 0,
    excludedFromPayload: true,
  };
}
async function assertSiteRootBoundary(repositoryRoot, reparseDetector) {
  const siteRoot = resolveRepositoryPath(repositoryRoot, 'site');
  await assertSafeRepositoryChain(repositoryRoot, siteRoot, reparseDetector);
  const actual = (await readdir(siteRoot)).sort();
  const expected = ['astro.config.mjs', 'node_modules', 'package.json', 'public', 'src', 'tsconfig.json'];
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    fail('SITE_ROOT_BOUNDARY_DRIFT', 'site must contain only fixed Site-A, Site-B/dependencies, and protected public media roots', {
      expected,
      actual,
    });
  }
}
async function auditWorkspaceClosure(repositoryRoot) {
  const packagePath = path.join(repositoryRoot, 'package.json');
  const workspacePath = path.join(repositoryRoot, 'pnpm-workspace.yaml');
  const lockPath = path.join(repositoryRoot, 'pnpm-lock.yaml');
  const [packageText, workspaceText, lockText] = await Promise.all([
    readFile(packagePath, 'utf8'),
    readFile(workspacePath, 'utf8'),
    readFile(lockPath, 'utf8'),
  ]);
  const rootPackage = JSON.parse(packageText);
  const blockers = [];
  for (const workspace of rootPackage.workspaces ?? []) {
    if (['site', 'studio'].includes(normalizeRelativePath(workspace))) {
      blockers.push({ code: 'legacy-package-workspace', path: 'package.json', detail: workspace });
    }
  }
  for (const [name, command] of Object.entries(rootPackage.scripts ?? {})) {
    if (name === 'deploy:sample' || name.startsWith('deploy:sample:')) {
      blockers.push({ code: 'legacy-package-script', path: 'package.json', detail: name });
    }
    if (/@dgbook\/site|site[\\/]src|scripts[\\/](?:prepare|verify|audit|smoke|archive|deploy|cloud)-cloud-sample/iu.test(String(command))) {
      blockers.push({ code: 'legacy-package-command', path: 'package.json', detail: `${name}: ${command}` });
    }
  }
  for (const [filePath, text] of [
    ['pnpm-workspace.yaml', workspaceText],
    ['pnpm-lock.yaml', lockText],
  ]) {
    if (/^\s{2}(?:site|studio):(?:\s|$)/gmu.test(text) || /^\s*-\s*['"]?(?:site|studio)['"]?\s*$/gmu.test(text)) {
      blockers.push({ code: 'legacy-workspace-importer', path: filePath });
    }
  }
  blockers.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code));
  return {
    passed: blockers.length === 0,
    blockers,
    files: [
      { relativePath: 'package.json', sha256: sha256Text(packageText) },
      { relativePath: 'pnpm-workspace.yaml', sha256: sha256Text(workspaceText) },
      { relativePath: 'pnpm-lock.yaml', sha256: sha256Text(lockText) },
    ],
  };
}
function assertProtectedMediaExcluded(groups) {
  const protectedPrefix = `${PROTECTED_MEDIA_PATH}/`;
  for (const group of groups) {
    for (const root of group.roots) {
      if (root.relativePath === PROTECTED_MEDIA_PATH || root.relativePath.startsWith(protectedPrefix)) {
        fail('PROTECTED_MEDIA_SELECTED', `protected media entered quarantine group ${group.id}`);
      }
    }
    for (const file of group.files) {
      if (file.relativePath === PROTECTED_MEDIA_PATH || file.relativePath.startsWith(protectedPrefix)) {
        fail('PROTECTED_MEDIA_SELECTED', `protected media file entered quarantine group ${group.id}`);
      }
    }
  }
}
async function assertSafeRepositoryChain(repositoryRoot, candidate, reparseDetector) {
  const relative = path.relative(repositoryRoot, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail('PATH_ESCAPE', `candidate escaped repository: ${candidate}`);
  let current = repositoryRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const candidateStat = await safeLstat(current, `repository path ${current}`);
    if (await isReparse(current, candidateStat, reparseDetector)) {
      fail('REPARSE_ANCESTOR', `repository candidate crosses a reparse point: ${current}`);
    }
  }
}
async function assertNormalDirectory(candidate, reparseDetector, label) {
  const candidateStat = await safeLstat(candidate, label);
  if (!candidateStat.isDirectory() || await isReparse(candidate, candidateStat, reparseDetector)) {
    fail('UNSAFE_DIRECTORY', `${label} must be a normal directory: ${candidate}`);
  }
  const resolved = await realpath(candidate);
  if (!samePath(resolved, candidate)) fail('REALPATH_MISMATCH', `${label} resolves through a link: ${candidate}`);
}
async function assertMissing(candidate, label) {
  try {
    await lstat(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  fail('WRITE_ONCE_TARGET_EXISTS', `${label} already exists: ${candidate}`);
}
async function safeLstat(candidate, label) {
  try {
    return await lstat(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT') fail('REQUIRED_PATH_MISSING', `${label} is missing: ${candidate}`);
    throw error;
  }
}
async function isReparse(candidate, candidateStat, reparseDetector) {
  return candidateStat.isSymbolicLink() || await reparseDetector(candidate, candidateStat);
}
async function defaultReparseDetector(_candidate, candidateStat) {
  return candidateStat.isSymbolicLink();
}
async function defaultVolumeResolver(candidate) {
  let current = path.resolve(candidate);
  while (true) {
    try {
      const info = await stat(current);
      return `${path.parse(current).root.toLocaleLowerCase()}:dev-${info.dev}`;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = path.dirname(current);
      if (samePath(parent, current)) throw error;
      current = parent;
    }
  }
}
function resolveRepositoryPath(repositoryRoot, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.startsWith('../')) {
    fail('INVALID_REPOSITORY_PATH', `invalid repository path: ${relativePath}`);
  }
  const resolved = path.resolve(repositoryRoot, ...normalized.split('/'));
  if (!isPathInside(repositoryRoot, resolved)) fail('PATH_ESCAPE', `repository path escaped root: ${relativePath}`);
  return resolved;
}
function validateExternalQuarantineRoot(repositoryRoot, quarantineRoot) {
  if (!path.isAbsolute(quarantineRoot)) fail('QUARANTINE_ROOT_NOT_ABSOLUTE', 'quarantine root must be absolute');
  if (samePath(repositoryRoot, quarantineRoot) || isPathInside(repositoryRoot, quarantineRoot) || isPathInside(quarantineRoot, repositoryRoot)) {
    fail('QUARANTINE_ROOT_NOT_EXTERNAL', 'quarantine root must be outside and must not contain the repository');
  }
}
function validateSessionId(sessionId) {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{5,127}$/u.test(sessionId)) {
    fail('INVALID_SESSION_ID', 'session id must be a stable path-safe identifier');
  }
}
function createSessionId() {
  return `${new Date().toISOString().replaceAll(/[-:.]/gu, '')}-${process.pid}`;
}
function statIdentity(candidateStat) {
  return {
    dev: String(candidateStat.dev),
    ino: String(candidateStat.ino),
    mode: candidateStat.mode,
    size: candidateStat.size,
    mtimeMs: Math.trunc(candidateStat.mtimeMs * 1_000) / 1_000,
    birthtimeMs: Math.trunc(candidateStat.birthtimeMs * 1_000) / 1_000,
  };
}
async function sha256File(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}
function sha256Text(text) {
  return createHash('sha256').update(text).digest('hex');
}
function canonicalJson(value) {
  return JSON.stringify(sortDeep(value));
}
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortDeep(value[key])]));
  }
  return value;
}
function normalizeRelativePath(input) {
  return String(input ?? '').replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/$/u, '');
}
function isPathInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}
function samePath(left, right) {
  const normalize = (candidate) => path.resolve(candidate).toLocaleLowerCase();
  return normalize(left) === normalize(right);
}
function compareRelativePath(left, right) {
  return left.relativePath.localeCompare(right.relativePath);
}
function fail(code, message, details) {
  throw new LegacyWorkspaceQuarantineError(code, message, details);
}
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--help')) {
      process.stdout.write(HELP);
    } else {
      const modes = ['--dry-run', '--apply', '--restore'].filter((flag) => args.includes(flag));
      if (modes.length !== 1) fail('CLI_MODE_REQUIRED', 'choose exactly one of --dry-run, --apply, or --restore');
      if (modes[0] === '--dry-run') {
        const plan = await sealLegacyWorkspaceQuarantinePlan({
          repositoryRoot: readCliOption(args, '--root') ?? process.cwd(),
          quarantineRoot: readCliOption(args, '--quarantine-root') ?? DEFAULT_QUARANTINE_ROOT,
          sessionId: readCliOption(args, '--session') ?? createSessionId(),
        });
        process.stdout.write(`${JSON.stringify({
          schema: plan.schema,
          state: plan.state,
          manifestPath: plan.manifestPath,
          sealSha256: plan.sealSha256,
          applied: false,
          groupOrder: plan.groupOrder,
        }, null, 2)}\n`);
      } else {
        const manifestPath = readCliOption(args, '--manifest');
        if (!manifestPath) fail('MANIFEST_PATH_REQUIRED', `${modes[0]} requires --manifest <absolute-path>`);
        const result = modes[0] === '--apply'
          ? await applyLegacyWorkspaceQuarantine({ manifestPath: path.resolve(manifestPath) })
          : await restoreLegacyWorkspaceQuarantine({ manifestPath: path.resolve(manifestPath) });
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      }
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = error instanceof LegacyWorkspaceQuarantineError ? 1 : 2;
  }
}
function readCliOption(args, name) {
  const exactIndex = args.indexOf(name);
  if (exactIndex >= 0) return args[exactIndex + 1];
  const prefix = `${name}=`;
  const inline = args.find((argument) => argument.startsWith(prefix));
  return inline?.slice(prefix.length);
}

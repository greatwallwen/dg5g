#!/usr/bin/env node

import { copyFile, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  MEDIA_CUTOVER_CURRENT_POINTER_PATH,
  auditExactMediaTree,
  auditPlannedMediaSources,
  buildMediaCutoverPlan,
  createMediaCutoverCurrentPointer,
  createMediaCutoverJournal,
  executeMediaCutoverTransaction,
  inventoryMediaTree,
  parseMediaCutoverManifest,
  serializeMediaCutoverManifestSha256,
} from './web-media-cutover-plan.mjs';

export async function applyMediaCutoverPlan({
  repositoryRoot,
  manifest,
  acceptedAt = new Date().toISOString(),
  faultAt,
}) {
  const root = path.resolve(repositoryRoot);
  const plan = parseMediaCutoverManifest(manifest);
  const paths = resolvePlanPaths(root, plan);
  const sourceAudit = await auditPlannedMediaSources({ repositoryRoot: root, manifest: plan });
  assert(sourceAudit.passed, `planned media source audit failed: ${JSON.stringify(sourceAudit.issues)}`);

  await writeImmutableFile(paths.manifest, `${JSON.stringify(plan, null, 2)}\n`);
  await writeImmutableFile(paths.sidecar, serializeMediaCutoverManifestSha256(plan));

  const operations = createLocalMediaCutoverOperations({ root, plan, paths, faultAt });
  const result = await executeMediaCutoverTransaction(plan, operations);
  const journal = createMediaCutoverJournal(plan, {
    state: result.state,
    stateHistory: result.stateHistory,
    updatedAt: acceptedAt,
  });
  await writeImmutableFile(paths.journal, `${JSON.stringify(journal, null, 2)}\n`);

  if (result.state === 'postverified') {
    const pointer = createMediaCutoverCurrentPointer(plan, journal, { acceptedAt });
    await writeCurrentPointer(paths.pointer, pointer, plan.releaseId);
  }
  return Object.freeze({ ...result, manifestPath: plan.manifestPath, journalPath: journal.journalPath });
}

export function createLocalMediaCutoverOperations({ root, plan, paths, faultAt }) {
  const failedRoot = path.join(paths.publicRoot, `media.failed-${plan.releaseId}`);
  return {
    async prepareStaging() {
      await injectFault('prepare-staging');
      await assertMissing(paths.staging, 'staging');
      await assertMissing(paths.rollback, 'rollback');
      await assertMissing(failedRoot, 'failed target');
      await mkdir(paths.staging, { recursive: true });
    },
    async stageEntry(entry, index) {
      await injectFault(`stage-entry:${index}`);
      const source = resolveRepositoryPath(root, entry.sourcePath);
      const target = resolveRepositoryPath(root, entry.stagingPath);
      assert(isInside(paths.staging, target), `staging entry escaped staging root: ${entry.stagingPath}`);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(source, target, 0);
    },
    async verifyStaging() {
      await injectFault('verify-staging');
      const audit = await auditExactMediaTree({ root: paths.staging, entries: plan.entries });
      assert(audit.passed, `staging exact-tree audit failed: ${JSON.stringify(audit.issues)}`);
    },
    async reverifySources() {
      await injectFault('reverify-sources');
      const audit = await auditPlannedMediaSources({ repositoryRoot: root, manifest: plan });
      assert(audit.passed, `source reverification failed: ${JSON.stringify(audit.issues)}`);
    },
    async moveTargetToRollback() {
      await injectFault('move-target-to-rollback');
      const inventory = await inventoryMediaTree({ root: paths.target });
      assert(inventory.passed, `old target inventory failed: ${JSON.stringify(inventory.issues)}`);
      assert(
        JSON.stringify(inventory.summary) === JSON.stringify(plan.oldTargetInventory.summary)
          && JSON.stringify(inventory.entries) === JSON.stringify(plan.oldTargetInventory.entries),
        'old target changed after the immutable plan was created',
      );
      await rename(paths.target, paths.rollback);
    },
    async moveStagingToTarget() {
      await injectFault('move-staging-to-target');
      await rename(paths.staging, paths.target);
    },
    async postverify() {
      await injectFault('postverify');
      const audit = await auditExactMediaTree({ root: paths.target, entries: plan.entries });
      assert(audit.passed, `post-switch media target audit failed: ${JSON.stringify(audit.issues)}`);
    },
    async discardStaging() {
      if (await exists(paths.staging)) await rm(paths.staging, { recursive: true, force: false });
    },
    async restoreOldTarget(_plan, { newTargetInstalled }) {
      if (newTargetInstalled && await exists(paths.target)) await rename(paths.target, failedRoot);
      if (await exists(paths.rollback)) await rename(paths.rollback, paths.target);
    },
  };

  async function injectFault(phase) {
    if (faultAt === phase) throw new Error(`injected media cutover fault at ${phase}`);
  }
}

function resolvePlanPaths(root, plan) {
  const publicRoot = path.join(root, 'apps', 'web', 'public');
  const paths = {
    publicRoot,
    target: resolveRepositoryPath(root, plan.targetRoot),
    staging: resolveRepositoryPath(root, plan.stagingRoot),
    rollback: resolveRepositoryPath(root, plan.rollbackRoot),
    manifest: resolveRepositoryPath(root, plan.manifestPath),
    sidecar: resolveRepositoryPath(root, plan.manifestSha256Path),
    journal: resolveRepositoryPath(root, `artifacts/media-cutover/${plan.releaseId}/media-cutover-journal.json`),
    pointer: resolveRepositoryPath(root, MEDIA_CUTOVER_CURRENT_POINTER_PATH),
  };
  for (const candidate of [paths.target, paths.staging, paths.rollback]) {
    assert(path.dirname(candidate) === publicRoot, 'media target, staging and rollback must share one public directory');
    assert(path.parse(candidate).root.toLowerCase() === path.parse(paths.target).root.toLowerCase(), 'media cutover roots must share one volume');
  }
  return paths;
}

function resolveRepositoryPath(root, relativePath) {
  assert(typeof relativePath === 'string' && relativePath.length > 0, 'repository-relative path is required');
  assert(!path.isAbsolute(relativePath) && !path.win32.isAbsolute(relativePath), `absolute path is forbidden: ${relativePath}`);
  assert(!relativePath.includes('\\') && !relativePath.includes('\0') && !relativePath.includes(':') && !relativePath.includes('%'), `unsafe repository path: ${relativePath}`);
  const segments = relativePath.split('/');
  assert(segments.every((segment) => segment && segment !== '.' && segment !== '..'), `unsafe repository path: ${relativePath}`);
  const resolved = path.resolve(root, ...segments);
  assert(isInside(root, resolved), `repository path escaped root: ${relativePath}`);
  return resolved;
}

async function writeImmutableFile(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = await readFile(filePath, 'utf8');
    assert(existing === content, `immutable cutover artifact changed: ${filePath}`);
  }
}

async function writeCurrentPointer(pointerPath, pointer, releaseId) {
  await mkdir(path.dirname(pointerPath), { recursive: true });
  const temporary = `${pointerPath}.next-${releaseId}`;
  await assertMissing(temporary, 'current pointer temporary file');
  await writeFile(temporary, `${JSON.stringify(pointer, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  try {
    await rename(temporary, pointerPath);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
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

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : undefined;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const repositoryRoot = path.resolve(import.meta.dirname, '..');
  const releaseId = readArg('--release-id');
  assert(releaseId, '--release-id is required');
  const plan = await buildMediaCutoverPlan({ repositoryRoot, releaseId });
  if (!process.argv.includes('--apply')) {
    process.stdout.write(`${JSON.stringify({ mode: 'planned', releaseId, summary: plan.summary, planSha256: plan.planSha256 }, null, 2)}\n`);
    return;
  }
  const result = await applyMediaCutoverPlan({ repositoryRoot, manifest: plan });
  process.stdout.write(`${JSON.stringify({ mode: 'applied', releaseId, ...result }, null, 2)}\n`);
  if (result.state !== 'postverified') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

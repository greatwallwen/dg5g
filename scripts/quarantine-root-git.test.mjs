import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(new URL('./quarantine-root-git.mjs', import.meta.url));

async function writeFixtureFile(root, relativePath, content = relativePath) {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
  return absolutePath;
}

async function makeFixture(t, { createReparse = true } = {}) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'dgbook-root-git-quarantine-'));
  const repositoryRoot = path.join(base, 'repository');
  const quarantineRoot = path.join(base, 'external-quarantine');
  const sessionId = 'task12-root-git-20260716t000000z-fixture';
  await mkdir(repositoryRoot, { recursive: true });
  await mkdir(quarantineRoot, { recursive: true });
  t.after(() => rm(base, { recursive: true, force: true }));

  await writeFixtureFile(repositoryRoot, '.git/config', '[core]\nrepositoryformatversion = 0\n');
  await writeFixtureFile(repositoryRoot, '.git/HEAD', 'ref: refs/heads/codex/sample\n');
  await writeFixtureFile(repositoryRoot, '.git/objects/aa/fixture-object', 'object payload\n');
  await mkdir(path.join(repositoryRoot, '.git/empty-directory'), { recursive: true });
  await writeFixtureFile(repositoryRoot, 'workspace-marker.txt', 'must remain\n');

  if (createReparse) {
    const linkTarget = path.join(base, 'linked-git-metadata');
    await mkdir(linkTarget, { recursive: true });
    await writeFixtureFile(linkTarget, 'outside.txt', 'must not be traversed\n');
    await mkdir(path.join(repositoryRoot, '.git/modules'), { recursive: true });
    await symlink(
      linkTarget,
      path.join(repositoryRoot, '.git/modules/linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  }

  return {
    repositoryRoot,
    quarantineRoot,
    sessionId,
    volumeResolver: async () => 'fixture-volume',
  };
}

async function exists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

test('CLI help makes dry-run the default and exposes only explicit apply and restore mutations', () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, '--help'], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /default[^\n]*dry-run/iu);
  assert.match(result.stdout, /--apply/iu);
  assert.match(result.stdout, /--restore/iu);
  assert.match(result.stdout, /exact repository-root \.git/iu);
});

test('default dry-run seals exact per-file and reparse inventory without moving root .git', async (t) => {
  const quarantine = await import('./quarantine-root-git.mjs');
  assert.equal(typeof quarantine.sealRootGitQuarantinePlan, 'function');
  const fixture = await makeFixture(t);

  const plan = await quarantine.sealRootGitQuarantinePlan(fixture);

  assert.equal(plan.schema, 'dgbook.root-git-quarantine/v1');
  assert.equal(plan.state, 'sealed-plan');
  assert.equal(plan.sourceRelativePath, '.git');
  assert.equal(plan.sourcePath, path.join(fixture.repositoryRoot, '.git'));
  assert.equal(plan.payloadPath, path.join(fixture.quarantineRoot, fixture.sessionId, 'root-git.payload'));
  assert.equal(plan.safety.exactRootGitOnly, true);
  assert.equal(plan.safety.permanentDeletionAllowed, false);
  assert.equal(await exists(plan.sourcePath), true);
  assert.equal(await exists(plan.payloadPath), false);
  assert.equal(await exists(plan.applyReceiptPath), false);
  assert.match(plan.sealSha256, /^[a-f0-9]{64}$/u);
  assert.match(plan.inventory.entrySummarySha256, /^[a-f0-9]{64}$/u);
  assert.equal(plan.inventory.fileCount, 3);
  assert.equal(plan.inventory.reparseCount, 1);
  assert.equal(plan.inventory.files.some(({ relativePath }) => relativePath === '.git/config'), true);
  assert.equal(plan.inventory.files.some(({ relativePath }) => relativePath.endsWith('outside.txt')), false);
  assert.equal(plan.inventory.directories.some(({ relativePath }) => relativePath === '.git/empty-directory'), true);
  assert.equal(plan.inventory.reparsePoints[0].relativePath, '.git/modules/linked');
  assert.equal(plan.inventory.totalBytes, plan.inventory.files.reduce((sum, file) => sum + file.size, 0)
    + plan.inventory.reparsePoints.reduce((sum, point) => sum + point.size, 0));
  for (const file of plan.inventory.files) assert.match(file.sha256, /^[a-f0-9]{64}$/u);

  const stored = JSON.parse(await readFile(plan.manifestPath, 'utf8'));
  assert.equal(stored.sealSha256, plan.sealSha256);
  assert.equal(
    await readFile(plan.manifestSha256Path, 'utf8'),
    `${sha256(await readFile(plan.manifestPath, 'utf8'))}  sealed-manifest.json\n`,
  );
  await assert.rejects(quarantine.sealRootGitQuarantinePlan(fixture), /WRITE_ONCE|already exists|session/iu);
});

test('CLI with no mode performs dry-run only and reports an explicit restore command', async (t) => {
  const fixture = await makeFixture(t, { createReparse: false });
  const result = spawnSync(process.execPath, [
    SCRIPT_PATH,
    '--root', fixture.repositoryRoot,
    '--quarantine-root', fixture.quarantineRoot,
    '--session', fixture.sessionId,
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.state, 'sealed-plan');
  assert.equal(summary.applied, false);
  assert.match(summary.restoreCommand, /--restore --manifest/iu);
  assert.equal(await exists(path.join(fixture.repositoryRoot, '.git')), true);
  assert.equal(await exists(summary.payloadPath), false);
});

test('fixture apply and explicit restore are a receipt-backed lossless rename round trip', async (t) => {
  const quarantine = await import('./quarantine-root-git.mjs');
  assert.equal(typeof quarantine.applyRootGitQuarantine, 'function');
  assert.equal(typeof quarantine.restoreRootGitQuarantine, 'function');
  const fixture = await makeFixture(t);
  const plan = await quarantine.sealRootGitQuarantinePlan(fixture);

  const applied = await quarantine.applyRootGitQuarantine({
    manifestPath: plan.manifestPath,
    volumeResolver: fixture.volumeResolver,
  });

  assert.equal(applied.state, 'quarantined');
  assert.equal(await exists(plan.sourcePath), false);
  assert.equal(await exists(plan.payloadPath), true);
  assert.equal(await exists(plan.applyReceiptPath), true);
  assert.equal(await readFile(path.join(fixture.repositoryRoot, 'workspace-marker.txt'), 'utf8'), 'must remain\n');
  const applyReceipt = JSON.parse(await readFile(plan.applyReceiptPath, 'utf8'));
  assert.equal(applyReceipt.manifestSealSha256, plan.sealSha256);
  assert.equal(applyReceipt.inventoryEntrySummarySha256, plan.inventory.entrySummarySha256);
  assert.equal(applyReceipt.sourcePath, plan.sourcePath);
  assert.equal(applyReceipt.payloadPath, plan.payloadPath);
  assert.equal(applyReceipt.restoreCommand, plan.commands.restore);

  const restored = await quarantine.restoreRootGitQuarantine({
    manifestPath: plan.manifestPath,
    volumeResolver: fixture.volumeResolver,
  });

  assert.equal(restored.state, 'restored');
  assert.equal(await exists(plan.sourcePath), true);
  assert.equal(await exists(plan.payloadPath), false);
  assert.equal(await exists(plan.restoreReceiptPath), true);
  assert.equal(await readFile(path.join(plan.sourcePath, 'config'), 'utf8'), '[core]\nrepositoryformatversion = 0\n');
  const restoredInventory = await quarantine.inventoryRootGit(plan.sourcePath);
  assert.deepEqual(restoredInventory, plan.inventory);
});

test('receipt-only recovery publishes the normal apply receipt after an exact external rename', async (t) => {
  const quarantine = await import('./quarantine-root-git.mjs');
  assert.equal(typeof quarantine.publishRootGitApplyReceipt, 'function');
  const fixture = await makeFixture(t);
  const plan = await quarantine.sealRootGitQuarantinePlan(fixture);

  await rename(plan.sourcePath, plan.payloadPath);
  const published = await quarantine.publishRootGitApplyReceipt({
    manifestPath: plan.manifestPath,
    volumeResolver: fixture.volumeResolver,
  });

  assert.equal(published.state, 'quarantined');
  assert.equal(await exists(plan.sourcePath), false);
  assert.equal(await exists(plan.payloadPath), true);
  const receipt = JSON.parse(await readFile(plan.applyReceiptPath, 'utf8'));
  assert.equal(receipt.schema, 'dgbook.root-git-quarantine-apply/v1');
  assert.equal(receipt.state, 'quarantined');
  assert.equal(receipt.action, 'same-volume-directory-rename');
  assert.equal(receipt.manifestSealSha256, plan.sealSha256);
  assert.equal(receipt.inventoryEntrySummarySha256, plan.inventory.entrySummarySha256);
  assert.equal(receipt.fileCount, plan.inventory.fileCount);
  assert.equal(receipt.reparseCount, plan.inventory.reparseCount);
  assert.equal(receipt.totalBytes, plan.inventory.totalBytes);
  assert.equal(receipt.sourcePath, plan.sourcePath);
  assert.equal(receipt.payloadPath, plan.payloadPath);
  assert.equal(receipt.restoreCommand, plan.commands.restore);
  assert.match(receipt.receiptSealSha256, /^[a-f0-9]{64}$/u);
  assert.equal(
    await readFile(plan.applyReceiptSha256Path, 'utf8'),
    `${sha256(await readFile(plan.applyReceiptPath, 'utf8'))}  apply-receipt.json\n`,
  );

  await quarantine.restoreRootGitQuarantine({
    manifestPath: plan.manifestPath,
    volumeResolver: fixture.volumeResolver,
  });
  assert.equal(await exists(plan.sourcePath), true);
});

test('receipt-only recovery fails closed unless source is absent and payload exactly matches the sealed plan', async (t) => {
  const quarantine = await import('./quarantine-root-git.mjs');

  const sourcePresent = await makeFixture(t, { createReparse: false });
  const sourcePresentPlan = await quarantine.sealRootGitQuarantinePlan(sourcePresent);
  await assert.rejects(quarantine.publishRootGitApplyReceipt({
    manifestPath: sourcePresentPlan.manifestPath,
    volumeResolver: sourcePresent.volumeResolver,
  }), /SOURCE_STILL_PRESENT|source/iu);
  assert.equal(await exists(sourcePresentPlan.applyReceiptPath), false);

  const payloadMissing = await makeFixture(t, { createReparse: false });
  const payloadMissingPlan = await quarantine.sealRootGitQuarantinePlan(payloadMissing);
  await rm(payloadMissingPlan.sourcePath, { recursive: true, force: true });
  await assert.rejects(quarantine.publishRootGitApplyReceipt({
    manifestPath: payloadMissingPlan.manifestPath,
    volumeResolver: payloadMissing.volumeResolver,
  }), /MISSING_ROOT_GIT|payload|does not exist/iu);
  assert.equal(await exists(payloadMissingPlan.applyReceiptPath), false);

  const drifted = await makeFixture(t, { createReparse: false });
  const driftedPlan = await quarantine.sealRootGitQuarantinePlan(drifted);
  await rename(driftedPlan.sourcePath, driftedPlan.payloadPath);
  await writeFixtureFile(driftedPlan.payloadPath, 'config', 'drifted after external rename\n');
  await assert.rejects(quarantine.publishRootGitApplyReceipt({
    manifestPath: driftedPlan.manifestPath,
    volumeResolver: drifted.volumeResolver,
  }), /INVENTORY_DRIFT/iu);
  assert.equal(await exists(driftedPlan.applyReceiptPath), false);
});

test('receipt-only recovery rejects an existing receipt and invalid manifest sidecar', async (t) => {
  const quarantine = await import('./quarantine-root-git.mjs');

  const alreadyPublished = await makeFixture(t, { createReparse: false });
  const publishedPlan = await quarantine.sealRootGitQuarantinePlan(alreadyPublished);
  await rename(publishedPlan.sourcePath, publishedPlan.payloadPath);
  await quarantine.publishRootGitApplyReceipt({
    manifestPath: publishedPlan.manifestPath,
    volumeResolver: alreadyPublished.volumeResolver,
  });
  await assert.rejects(quarantine.publishRootGitApplyReceipt({
    manifestPath: publishedPlan.manifestPath,
    volumeResolver: alreadyPublished.volumeResolver,
  }), /WRITE_ONCE|receipt/iu);

  const invalidManifest = await makeFixture(t, { createReparse: false });
  const invalidPlan = await quarantine.sealRootGitQuarantinePlan(invalidManifest);
  await rename(invalidPlan.sourcePath, invalidPlan.payloadPath);
  await writeFile(invalidPlan.manifestSha256Path, `${'0'.repeat(64)}  sealed-manifest.json\n`);
  await assert.rejects(quarantine.publishRootGitApplyReceipt({
    manifestPath: invalidPlan.manifestPath,
    volumeResolver: invalidManifest.volumeResolver,
  }), /MANIFEST_FILE_SHA_MISMATCH|sidecar/iu);
  assert.equal(await exists(invalidPlan.applyReceiptPath), false);
});

test('planning rejects anything except a normal exact root .git and an external same-volume target', async (t) => {
  const quarantine = await import('./quarantine-root-git.mjs');

  const missing = await makeFixture(t, { createReparse: false });
  await rm(path.join(missing.repositoryRoot, '.git'), { recursive: true, force: true });
  await assert.rejects(quarantine.sealRootGitQuarantinePlan(missing), /ROOT_GIT|\.git/iu);
  assert.equal(await exists(path.join(missing.quarantineRoot, missing.sessionId)), false);

  const fileGit = await makeFixture(t, { createReparse: false });
  await rm(path.join(fileGit.repositoryRoot, '.git'), { recursive: true, force: true });
  await writeFile(path.join(fileGit.repositoryRoot, '.git'), 'gitdir: elsewhere\n');
  await assert.rejects(quarantine.sealRootGitQuarantinePlan(fileGit), /ROOT_GIT|normal directory/iu);

  const inside = await makeFixture(t, { createReparse: false });
  await assert.rejects(quarantine.sealRootGitQuarantinePlan({
    ...inside,
    quarantineRoot: path.join(inside.repositoryRoot, 'quarantine'),
  }), /EXTERNAL|outside/iu);

  const crossVolume = await makeFixture(t, { createReparse: false });
  await assert.rejects(quarantine.sealRootGitQuarantinePlan({
    ...crossVolume,
    volumeResolver: async (candidate) => (
      path.resolve(candidate).startsWith(path.resolve(crossVolume.repositoryRoot)) ? 'repository-volume' : 'quarantine-volume'
    ),
  }), /CROSS_VOLUME/iu);
  assert.equal(await exists(path.join(crossVolume.quarantineRoot, crossVolume.sessionId)), false);
});

test('apply revalidates the entire sealed inventory before moving and refuses payload collisions', async (t) => {
  const quarantine = await import('./quarantine-root-git.mjs');

  const drifted = await makeFixture(t, { createReparse: false });
  const driftPlan = await quarantine.sealRootGitQuarantinePlan(drifted);
  await writeFixtureFile(drifted.repositoryRoot, '.git/config', 'changed after seal\n');
  await assert.rejects(quarantine.applyRootGitQuarantine({
    manifestPath: driftPlan.manifestPath,
    volumeResolver: drifted.volumeResolver,
  }), /INVENTORY_DRIFT/iu);
  assert.equal(await exists(driftPlan.sourcePath), true);
  assert.equal(await exists(driftPlan.payloadPath), false);

  const collision = await makeFixture(t, { createReparse: false });
  const collisionPlan = await quarantine.sealRootGitQuarantinePlan(collision);
  await mkdir(collisionPlan.payloadPath, { recursive: true });
  await assert.rejects(quarantine.applyRootGitQuarantine({
    manifestPath: collisionPlan.manifestPath,
    volumeResolver: collision.volumeResolver,
  }), /WRITE_ONCE|collision|payload/iu);
  assert.equal(await exists(collisionPlan.sourcePath), true);
});

test('apply rejects manifest corruption and a maliciously re-sealed non-root source path', async (t) => {
  const quarantine = await import('./quarantine-root-git.mjs');

  const corrupt = await makeFixture(t, { createReparse: false });
  const corruptPlan = await quarantine.sealRootGitQuarantinePlan(corrupt);
  await writeFile(corruptPlan.manifestPath, `${await readFile(corruptPlan.manifestPath, 'utf8')} `);
  await assert.rejects(quarantine.applyRootGitQuarantine({
    manifestPath: corruptPlan.manifestPath,
    volumeResolver: corrupt.volumeResolver,
  }), /MANIFEST|SHA|JSON/iu);
  assert.equal(await exists(corruptPlan.sourcePath), true);

  const resealed = await makeFixture(t, { createReparse: false });
  const resealedPlan = await quarantine.sealRootGitQuarantinePlan(resealed);
  const tampered = JSON.parse(await readFile(resealedPlan.manifestPath, 'utf8'));
  tampered.sourcePath = path.join(resealed.repositoryRoot, '.not-git');
  delete tampered.sealSha256;
  tampered.sealSha256 = sha256(canonicalJson(tampered));
  const text = `${JSON.stringify(tampered, null, 2)}\n`;
  await writeFile(resealedPlan.manifestPath, text);
  await writeFile(resealedPlan.manifestSha256Path, `${sha256(text)}  sealed-manifest.json\n`);
  await assert.rejects(quarantine.applyRootGitQuarantine({
    manifestPath: resealedPlan.manifestPath,
    volumeResolver: resealed.volumeResolver,
  }), /EXACT_ROOT_GIT|source path|\.git/iu);
  assert.equal(await exists(path.join(resealed.repositoryRoot, '.git')), true);
});

test('an injected post-rename apply fault returns .git to the repository and writes no receipt', async (t) => {
  const quarantine = await import('./quarantine-root-git.mjs');
  const fixture = await makeFixture(t, { createReparse: false });
  const plan = await quarantine.sealRootGitQuarantinePlan(fixture);

  await assert.rejects(quarantine.applyRootGitQuarantine({
    manifestPath: plan.manifestPath,
    volumeResolver: fixture.volumeResolver,
    faultAfterRename: true,
  }), /injected root git quarantine fault/iu);

  assert.equal(await exists(plan.sourcePath), true);
  assert.equal(await exists(plan.payloadPath), false);
  assert.equal(await exists(plan.applyReceiptPath), false);
});

test('restore refuses missing receipts, source collisions, and quarantined payload drift', async (t) => {
  const quarantine = await import('./quarantine-root-git.mjs');

  const noReceipt = await makeFixture(t, { createReparse: false });
  const noReceiptPlan = await quarantine.sealRootGitQuarantinePlan(noReceipt);
  await assert.rejects(quarantine.restoreRootGitQuarantine({
    manifestPath: noReceiptPlan.manifestPath,
    volumeResolver: noReceipt.volumeResolver,
  }), /APPLY_RECEIPT|receipt/iu);

  const collision = await makeFixture(t, { createReparse: false });
  const collisionPlan = await quarantine.sealRootGitQuarantinePlan(collision);
  await quarantine.applyRootGitQuarantine({
    manifestPath: collisionPlan.manifestPath,
    volumeResolver: collision.volumeResolver,
  });
  await mkdir(collisionPlan.sourcePath);
  await assert.rejects(quarantine.restoreRootGitQuarantine({
    manifestPath: collisionPlan.manifestPath,
    volumeResolver: collision.volumeResolver,
  }), /SOURCE_COLLISION|source/iu);

  const drifted = await makeFixture(t, { createReparse: false });
  const driftPlan = await quarantine.sealRootGitQuarantinePlan(drifted);
  await quarantine.applyRootGitQuarantine({
    manifestPath: driftPlan.manifestPath,
    volumeResolver: drifted.volumeResolver,
  });
  await writeFixtureFile(driftPlan.payloadPath, 'config', 'payload changed\n');
  await assert.rejects(quarantine.restoreRootGitQuarantine({
    manifestPath: driftPlan.manifestPath,
    volumeResolver: drifted.volumeResolver,
  }), /INVENTORY_DRIFT/iu);
  assert.equal(await exists(driftPlan.sourcePath), false);
  assert.equal(await exists(driftPlan.payloadPath), true);
});

test('implementation has no permanent-delete primitive', async () => {
  const source = await readFile(SCRIPT_PATH, 'utf8');
  assert.doesNotMatch(source, /\b(?:rm|unlink|rmdir)\s*\(/u);
  assert.doesNotMatch(source, /\b(?:rm|unlink|rmdir)\b[^\n]*from ['"]node:fs\/promises['"]/u);
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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

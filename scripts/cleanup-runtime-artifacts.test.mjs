import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CleanupManifestError,
  applyCleanupManifest,
  createCleanupManifest,
  publishCleanupApplyReceipt,
  restoreCleanupManifest,
  verifyCleanupManifest,
  writeCleanupManifest,
} from './cleanup-runtime-artifacts.mjs';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL('./cleanup-runtime-artifacts.mjs', import.meta.url));

async function makeSandbox(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'dgbook-cleanup-test-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace');
  const quarantineRoot = path.join(base, 'quarantine');
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(quarantineRoot, { recursive: true });
  return { base, root, quarantineRoot };
}

test('dry-run writes an immutable inventory manifest from supplied path decisions without moving source', async (t) => {
  const { base, root, quarantineRoot } = await makeSandbox(t);
  const sourcePath = path.join(root, 'scripts', 'cache.pyc');
  const decisionsPath = path.join(base, 'decisions.json');
  const manifestPath = path.join(base, 'manifest.json');
  await writeFile(sourcePath, 'cache');
  await writeFile(
    decisionsPath,
    JSON.stringify({
      decisions: [
        {
          path: 'scripts/cache.pyc',
          disposition: 'removable',
          reason: 'regenerable:python-bytecode',
          role: 'not-evidence',
          supersededBy: null,
        },
      ],
    }),
  );

  await execFileAsync(process.execPath, [
    scriptPath,
    '--dry-run',
    `--root=${root}`,
    `--decisions=${decisionsPath}`,
    `--manifest=${manifestPath}`,
    `--quarantine-root=${quarantineRoot}`,
    '--manifest-id=test-run',
  ]);

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.schema, 'dgbook-runtime-cleanup/v1');
  assert.equal(manifest.rootPath, path.resolve(root));
  assert.equal(manifest.quarantineRootPath, path.resolve(quarantineRoot));
  assert.equal(manifest.candidates.length, 1);
  assert.deepEqual(
    {
      relativePath: manifest.candidates[0].relativePath,
      sourcePath: manifest.candidates[0].sourcePath,
      reason: manifest.candidates[0].reason,
      role: manifest.candidates[0].role,
      supersededBy: manifest.candidates[0].supersededBy,
      type: manifest.candidates[0].type,
      count: manifest.candidates[0].count,
      bytes: manifest.candidates[0].bytes,
      nlink: manifest.candidates[0].nlink,
    },
    {
      relativePath: 'scripts/cache.pyc',
      sourcePath: path.resolve(sourcePath),
      reason: 'regenerable:python-bytecode',
      role: 'not-evidence',
      supersededBy: null,
      type: 'file',
      count: 1,
      bytes: 5,
      nlink: 1,
    },
  );
  assert.match(manifest.candidates[0].targetPath, /test-run--0000--[a-f0-9]{12}--cache\.pyc$/);
  assert.match(manifest.candidates[0].treeSha256, /^[a-f0-9]{64}$/);
  assert.equal(typeof manifest.candidates[0].mtimeMs, 'number');
  assert.match(manifest.manifestSha256, /^[a-f0-9]{64}$/);
  await access(sourcePath);
  await assert.rejects(access(manifest.candidates[0].targetPath));
});

test('dry-run inventories only supplied directory decisions and never discovers unlisted candidates', async (t) => {
  const { root, quarantineRoot } = await makeSandbox(t);
  const cacheRoot = path.join(root, 'apps', 'web', '.next');
  await mkdir(path.join(cacheRoot, 'nested', 'empty'), { recursive: true });
  await writeFile(path.join(cacheRoot, 'a.bin'), 'abc');
  await writeFile(path.join(cacheRoot, 'nested', 'b.bin'), 'de');
  const unlistedPath = path.join(root, 'scripts', 'unlisted.pyc');
  await writeFile(unlistedPath, 'must-stay');

  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'directory-run',
    createdAt: '2026-07-16T00:00:00.000Z',
    decisions: [
      {
        path: 'apps/web/.next',
        disposition: 'removable',
        reason: 'regenerable:next-build-cache',
        role: 'not-evidence',
      },
    ],
  });

  assert.equal(manifest.candidateCount, 1);
  assert.deepEqual(
    {
      relativePath: manifest.candidates[0].relativePath,
      type: manifest.candidates[0].type,
      count: manifest.candidates[0].count,
      bytes: manifest.candidates[0].bytes,
    },
    { relativePath: 'apps/web/.next', type: 'directory', count: 2, bytes: 5 },
  );
  assert.match(manifest.candidates[0].treeSha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(Object.isFrozen(manifest.candidates[0]), true);
  await access(unlistedPath);
  await assert.rejects(access(manifest.candidates[0].targetPath));
});

test('manifest seal detects tampering and the writer refuses replacement', async (t) => {
  const { base, root, quarantineRoot } = await makeSandbox(t);
  await writeFile(path.join(root, 'scripts', 'cache.pyc'), 'sealed');
  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'sealed-run',
    createdAt: '2026-07-16T00:00:00.000Z',
    decisions: [
      {
        path: 'scripts/cache.pyc',
        disposition: 'removable',
        reason: 'regenerable:python-bytecode',
        role: 'not-evidence',
      },
    ],
  });
  assert.equal(verifyCleanupManifest(manifest), manifest);

  const tampered = JSON.parse(JSON.stringify(manifest));
  tampered.candidates[0].reason = 'regenerable:forged';
  assert.throws(
    () => verifyCleanupManifest(tampered),
    (error) =>
      error instanceof CleanupManifestError && error.code === 'MANIFEST_DIGEST_MISMATCH',
  );

  const manifestPath = path.join(base, 'sealed-manifest.json');
  await writeCleanupManifest(manifestPath, manifest);
  await assert.rejects(
    writeCleanupManifest(manifestPath, manifest),
    (error) => error instanceof CleanupManifestError && error.code === 'MANIFEST_EXISTS',
  );
});

test('apply consumes the exact manifest with same-volume rename and never discovers new candidates', async (t) => {
  const { root, quarantineRoot } = await makeSandbox(t);
  const sourcePath = path.join(root, 'scripts', 'listed.pyc');
  const unlistedPath = path.join(root, 'scripts', 'unlisted.pyc');
  await writeFile(sourcePath, 'listed');
  await writeFile(unlistedPath, 'unlisted-must-stay');
  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'apply-run',
    createdAt: '2026-07-16T00:00:00.000Z',
    decisions: [
      {
        path: 'scripts/listed.pyc',
        disposition: 'removable',
        reason: 'regenerable:python-bytecode',
        role: 'not-evidence',
      },
    ],
  });

  const result = await applyCleanupManifest(manifest, { root, quarantineRoot });

  assert.equal(result.status, 'quarantined');
  assert.deepEqual(result.actions, [
    {
      sourcePath: manifest.candidates[0].sourcePath,
      targetPath: manifest.candidates[0].targetPath,
      mode: 'same-volume-rename',
      sourceRetained: false,
    },
  ]);
  await assert.rejects(access(sourcePath));
  assert.equal(await readFile(manifest.candidates[0].targetPath, 'utf8'), 'listed');
  assert.equal(await readFile(unlistedPath, 'utf8'), 'unlisted-must-stay');
});

test('receipt-only verifies an already-applied payload and writes a sealed external apply receipt', async (t) => {
  const { base, root, quarantineRoot } = await makeSandbox(t);
  const sourcePath = path.join(root, 'scripts', 'receipt.pyc');
  await writeFile(sourcePath, 'receipt-content');
  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'receipt-only-run',
    createdAt: '2026-07-16T00:00:00.000Z',
    decisions: [
      {
        path: 'scripts/receipt.pyc',
        disposition: 'removable',
        reason: 'regenerable:python-bytecode',
        role: 'not-evidence',
      },
    ],
  });
  const manifestPath = path.join(base, 'receipt-manifest.json');
  await writeCleanupManifest(manifestPath, manifest);
  await applyCleanupManifest(manifest, { root, quarantineRoot });

  const result = await publishCleanupApplyReceipt({ manifestPath, root, quarantineRoot });

  assert.equal(result.status, 'quarantined');
  assert.equal(result.receipt.schema, 'dgbook-runtime-cleanup-apply/v1');
  assert.equal(result.receipt.manifestSha256, manifest.manifestSha256);
  assert.match(result.receipt.receiptSha256, /^[a-f0-9]{64}$/);
  assert.match(result.receipt.restoreCommand, /--restore-manifest/u);
  assert.deepEqual(result.receipt.candidates, [
    {
      relativePath: 'scripts/receipt.pyc',
      sourcePath,
      targetPath: manifest.candidates[0].targetPath,
      mode: 'same-volume-rename',
      sourceRetained: false,
      count: 1,
      bytes: 15,
      treeSha256: manifest.candidates[0].treeSha256,
    },
  ]);
  assert.match(await readFile(result.receiptSha256Path, 'utf8'), /^[a-f0-9]{64}  apply-receipt\.json\n$/u);
  await assert.rejects(access(sourcePath));
  assert.equal(await readFile(manifest.candidates[0].targetPath, 'utf8'), 'receipt-content');
  await assert.rejects(
    publishCleanupApplyReceipt({ manifestPath, root, quarantineRoot }),
    (error) => error instanceof CleanupManifestError && error.code === 'APPLY_RECEIPT_EXISTS',
  );
});

test('restore requires the sealed apply receipt and reverses a same-volume quarantine', async (t) => {
  const { base, root, quarantineRoot } = await makeSandbox(t);
  const sourcePath = path.join(root, 'scripts', 'restore.pyc');
  await writeFile(sourcePath, 'restore-content');
  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'restore-run',
    createdAt: '2026-07-16T00:00:00.000Z',
    decisions: [
      {
        path: 'scripts/restore.pyc',
        disposition: 'removable',
        reason: 'regenerable:python-bytecode',
        role: 'not-evidence',
      },
    ],
  });
  const manifestPath = path.join(base, 'restore-manifest.json');
  await writeCleanupManifest(manifestPath, manifest);
  await applyCleanupManifest(manifest, { root, quarantineRoot });
  await publishCleanupApplyReceipt({ manifestPath, root, quarantineRoot });

  const result = await restoreCleanupManifest({ manifestPath, root, quarantineRoot });

  assert.equal(result.status, 'restored');
  assert.equal(result.receipt.schema, 'dgbook-runtime-cleanup-restore/v1');
  assert.equal(result.receipt.manifestSha256, manifest.manifestSha256);
  assert.match(result.receipt.receiptSha256, /^[a-f0-9]{64}$/);
  assert.match(await readFile(result.receiptSha256Path, 'utf8'), /^[a-f0-9]{64}  restore-receipt\.json\n$/u);
  assert.equal(await readFile(sourcePath, 'utf8'), 'restore-content');
  await assert.rejects(access(manifest.candidates[0].targetPath));
});

test('restore preflights every payload and rejects source collision or payload drift before moving anything', async (t) => {
  const { base, root, quarantineRoot } = await makeSandbox(t);
  await writeFile(path.join(root, 'scripts', 'restore-a.pyc'), 'alpha');
  await writeFile(path.join(root, 'scripts', 'restore-b.pyc'), 'bravo');
  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'restore-preflight-run',
    decisions: ['a', 'b'].map((suffix) => ({
      path: `scripts/restore-${suffix}.pyc`,
      disposition: 'removable',
      reason: 'regenerable:python-bytecode',
      role: 'not-evidence',
    })),
  });
  const manifestPath = path.join(base, 'restore-preflight-manifest.json');
  await writeCleanupManifest(manifestPath, manifest);
  await applyCleanupManifest(manifest, { root, quarantineRoot });
  await publishCleanupApplyReceipt({ manifestPath, root, quarantineRoot });

  await writeFile(manifest.candidates[1].sourcePath, 'collision');
  await assert.rejects(
    restoreCleanupManifest({ manifestPath, root, quarantineRoot }),
    (error) => error instanceof CleanupManifestError && error.code === 'SOURCE_COLLISION',
  );
  await assert.rejects(access(manifest.candidates[0].sourcePath));
  await access(manifest.candidates[0].targetPath);
  await rm(manifest.candidates[1].sourcePath);
  await writeFile(manifest.candidates[1].targetPath, 'payload-drift');
  await assert.rejects(
    restoreCleanupManifest({ manifestPath, root, quarantineRoot }),
    (error) => error instanceof CleanupManifestError && error.code === 'PAYLOAD_DRIFT',
  );
  await assert.rejects(access(manifest.candidates[0].sourcePath));
  await access(manifest.candidates[0].targetPath);
});

test('restore fault rolls every completed move back to the verified quarantine payloads', async (t) => {
  const { base, root, quarantineRoot } = await makeSandbox(t);
  await writeFile(path.join(root, 'scripts', 'rollback-a.pyc'), 'alpha');
  await writeFile(path.join(root, 'scripts', 'rollback-b.pyc'), 'bravo');
  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'restore-rollback-run',
    decisions: ['a', 'b'].map((suffix) => ({
      path: `scripts/rollback-${suffix}.pyc`,
      disposition: 'removable',
      reason: 'regenerable:python-bytecode',
      role: 'not-evidence',
    })),
  });
  const manifestPath = path.join(base, 'restore-rollback-manifest.json');
  await writeCleanupManifest(manifestPath, manifest);
  await applyCleanupManifest(manifest, { root, quarantineRoot });
  await publishCleanupApplyReceipt({ manifestPath, root, quarantineRoot });

  await assert.rejects(
    restoreCleanupManifest({
      manifestPath,
      root,
      quarantineRoot,
      faultInjector({ phase, index }) {
        if (phase === 'after-mutation' && index === 1) throw new Error('injected restore fault');
      },
    }),
    (error) =>
      error instanceof CleanupManifestError &&
      error.code === 'RESTORE_FAILED' &&
      error.cause?.message === 'injected restore fault',
  );
  for (const candidate of manifest.candidates) {
    await assert.rejects(access(candidate.sourcePath));
    await access(candidate.targetPath);
  }
});

test('apply rejects a source whose parent became a reparse point after dry-run', async (t) => {
  const { base, root, quarantineRoot } = await makeSandbox(t);
  const sourcePath = path.join(root, 'scripts', 'cache.pyc');
  await writeFile(sourcePath, 'reparse-safe');
  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'reparse-run',
    createdAt: '2026-07-16T00:00:00.000Z',
    decisions: [
      {
        path: 'scripts/cache.pyc',
        disposition: 'removable',
        reason: 'regenerable:python-bytecode',
        role: 'not-evidence',
      },
    ],
  });

  const realScripts = path.join(base, 'scripts-real');
  await rename(path.join(root, 'scripts'), realScripts);
  await symlink(realScripts, path.join(root, 'scripts'), 'junction');

  await assert.rejects(
    applyCleanupManifest(manifest, { root, quarantineRoot }),
    (error) => error instanceof CleanupManifestError && error.code === 'REPARSE_POINT',
  );
  await access(sourcePath);
  await assert.rejects(access(manifest.candidates[0].targetPath));
});

test('fault injection rolls back every completed same-volume rename without partial mutation', async (t) => {
  const { root, quarantineRoot } = await makeSandbox(t);
  await writeFile(path.join(root, 'scripts', 'a.pyc'), 'alpha');
  await writeFile(path.join(root, 'scripts', 'b.pyc'), 'bravo');
  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'fault-run',
    createdAt: '2026-07-16T00:00:00.000Z',
    decisions: ['a.pyc', 'b.pyc'].map((name) => ({
      path: `scripts/${name}`,
      disposition: 'removable',
      reason: 'regenerable:python-bytecode',
      role: 'not-evidence',
    })),
  });

  await assert.rejects(
    applyCleanupManifest(manifest, {
      root,
      quarantineRoot,
      faultInjector({ phase, index }) {
        if (phase === 'before-mutation' && index === 1) throw new Error('injected fault');
      },
    }),
    (error) =>
      error instanceof CleanupManifestError &&
      error.code === 'APPLY_FAILED' &&
      error.cause?.message === 'injected fault',
  );

  assert.equal(await readFile(path.join(root, 'scripts', 'a.pyc'), 'utf8'), 'alpha');
  assert.equal(await readFile(path.join(root, 'scripts', 'b.pyc'), 'utf8'), 'bravo');
  for (const candidate of manifest.candidates) {
    await assert.rejects(access(candidate.targetPath));
  }
});

test('cross-volume apply copies then rehashes quarantine content while retaining source', async (t) => {
  const { root, quarantineRoot } = await makeSandbox(t);
  const sourcePath = path.join(root, 'scripts', 'cross.pyc');
  await writeFile(sourcePath, 'cross-volume-content');
  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'cross-run',
    createdAt: '2026-07-16T00:00:00.000Z',
    decisions: [
      {
        path: 'scripts/cross.pyc',
        disposition: 'removable',
        reason: 'regenerable:python-bytecode',
        role: 'not-evidence',
      },
    ],
  });

  const result = await applyCleanupManifest(manifest, {
    root,
    quarantineRoot,
    volumeResolver: () => false,
  });

  assert.deepEqual(result.actions, [
    {
      sourcePath,
      targetPath: manifest.candidates[0].targetPath,
      mode: 'cross-volume-copy-retained',
      sourceRetained: true,
    },
  ]);
  assert.equal(await readFile(sourcePath, 'utf8'), 'cross-volume-content');
  assert.equal(await readFile(manifest.candidates[0].targetPath, 'utf8'), 'cross-volume-content');
});

test('CLI --apply-manifest consumes the sealed dry-run file instead of rescanning', async (t) => {
  const { base, root, quarantineRoot } = await makeSandbox(t);
  const sourcePath = path.join(root, 'scripts', 'cli.pyc');
  const unlistedPath = path.join(root, 'scripts', 'unlisted.pyc');
  await writeFile(sourcePath, 'cli-listed');
  await writeFile(unlistedPath, 'cli-unlisted');
  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'cli-apply-run',
    createdAt: '2026-07-16T00:00:00.000Z',
    decisions: [
      {
        path: 'scripts/cli.pyc',
        disposition: 'removable',
        reason: 'regenerable:python-bytecode',
        role: 'not-evidence',
      },
    ],
  });
  const manifestPath = path.join(base, 'cli-manifest.json');
  await writeCleanupManifest(manifestPath, manifest);

  const { stdout } = await execFileAsync(process.execPath, [
    scriptPath,
    `--apply-manifest=${manifestPath}`,
    `--root=${root}`,
    `--quarantine-root=${quarantineRoot}`,
  ]);

  assert.match(stdout, /APPLY-MANIFEST .*1 candidate\(s\)/);
  await assert.rejects(access(sourcePath));
  assert.equal(await readFile(manifest.candidates[0].targetPath, 'utf8'), 'cli-listed');
  assert.equal(await readFile(unlistedPath, 'utf8'), 'cli-unlisted');
});

test('apply preflights every candidate and rejects SHA drift before the first mutation', async (t) => {
  const { root, quarantineRoot } = await makeSandbox(t);
  await writeFile(path.join(root, 'scripts', 'a.pyc'), 'aaaa');
  await writeFile(path.join(root, 'scripts', 'b.pyc'), 'bbbb');
  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'drift-run',
    createdAt: '2026-07-16T00:00:00.000Z',
    decisions: ['a.pyc', 'b.pyc'].map((name) => ({
      path: `scripts/${name}`,
      disposition: 'removable',
      reason: 'regenerable:python-bytecode',
      role: 'not-evidence',
    })),
  });
  await writeFile(path.join(root, 'scripts', 'b.pyc'), 'BBBB');

  await assert.rejects(
    applyCleanupManifest(manifest, { root, quarantineRoot }),
    (error) =>
      error instanceof CleanupManifestError &&
      error.code === 'SOURCE_DRIFT' &&
      error.details?.fields.includes('treeSha256'),
  );
  assert.equal(await readFile(path.join(root, 'scripts', 'a.pyc'), 'utf8'), 'aaaa');
  assert.equal(await readFile(path.join(root, 'scripts', 'b.pyc'), 'utf8'), 'BBBB');
  for (const candidate of manifest.candidates) {
    await assert.rejects(access(candidate.targetPath));
  }
});

test('apply rejects a pre-existing quarantine target as partial state before moving anything', async (t) => {
  const { root, quarantineRoot } = await makeSandbox(t);
  const sourcePath = path.join(root, 'scripts', 'collision.pyc');
  await writeFile(sourcePath, 'source');
  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'collision-run',
    createdAt: '2026-07-16T00:00:00.000Z',
    decisions: [
      {
        path: 'scripts/collision.pyc',
        disposition: 'removable',
        reason: 'regenerable:python-bytecode',
        role: 'not-evidence',
      },
    ],
  });
  await writeFile(manifest.candidates[0].targetPath, 'collision');

  await assert.rejects(
    applyCleanupManifest(manifest, { root, quarantineRoot }),
    (error) => error instanceof CleanupManifestError && error.code === 'TARGET_COLLISION',
  );
  assert.equal(await readFile(sourcePath, 'utf8'), 'source');
  assert.equal(await readFile(manifest.candidates[0].targetPath, 'utf8'), 'collision');
});

test('dry-run rejects overlapping parent and child candidates before inventorying a mutable set', async (t) => {
  const { root, quarantineRoot } = await makeSandbox(t);
  const cacheFile = path.join(root, 'apps', 'web', '.next', 'cache', 'entry.bin');
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, 'entry');

  await assert.rejects(
    createCleanupManifest({
      root,
      quarantineRoot,
      manifestId: 'overlap-run',
      createdAt: '2026-07-16T00:00:00.000Z',
      decisions: ['apps/web/.next', 'apps/web/.next/cache/entry.bin'].map((candidatePath) => ({
        path: candidatePath,
        disposition: 'removable',
        reason: 'regenerable:next-build-cache',
        role: 'not-evidence',
      })),
    }),
    (error) => error instanceof CleanupManifestError && error.code === 'OVERLAPPING_CANDIDATES',
  );
  assert.equal(await readFile(cacheFile, 'utf8'), 'entry');
});

test('cross-volume copy fault fails rehash and retains the authoritative source', async (t) => {
  const { root, quarantineRoot } = await makeSandbox(t);
  const sourcePath = path.join(root, 'scripts', 'copy-fault.pyc');
  await writeFile(sourcePath, 'authoritative-source');
  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'copy-fault-run',
    createdAt: '2026-07-16T00:00:00.000Z',
    decisions: [
      {
        path: 'scripts/copy-fault.pyc',
        disposition: 'removable',
        reason: 'regenerable:python-bytecode',
        role: 'not-evidence',
      },
    ],
  });

  await assert.rejects(
    applyCleanupManifest(manifest, {
      root,
      quarantineRoot,
      volumeResolver: () => false,
      async faultInjector({ phase, plan }) {
        if (phase === 'after-copy-before-verify') {
          await writeFile(plan.entry.targetPath, 'corrupted-copy');
        }
      },
    }),
    (error) =>
      error instanceof CleanupManifestError &&
      error.code === 'APPLY_FAILED_WITH_RETAINED_COPY' &&
      error.cause?.code === 'COPY_VERIFY_FAILED',
  );
  assert.equal(await readFile(sourcePath, 'utf8'), 'authoritative-source');
  assert.equal(await readFile(manifest.candidates[0].targetPath, 'utf8'), 'corrupted-copy');
});

test('dry-run rejects removable decisions carrying a protected evidence role', async (t) => {
  const { root, quarantineRoot } = await makeSandbox(t);
  const sourcePath = path.join(root, 'scripts', 'current.pyc');
  await writeFile(sourcePath, 'current-evidence');

  await assert.rejects(
    createCleanupManifest({
      root,
      quarantineRoot,
      manifestId: 'protected-role-run',
      createdAt: '2026-07-16T00:00:00.000Z',
      decisions: [
        {
          path: 'scripts/current.pyc',
          disposition: 'removable',
          reason: 'regenerable:python-bytecode',
          role: 'current',
        },
      ],
    }),
    (error) => error instanceof CleanupManifestError && error.code === 'PROTECTED_EVIDENCE_ROLE',
  );
  assert.equal(await readFile(sourcePath, 'utf8'), 'current-evidence');
});

test('Task 9 media rollback siblings remain protected from the generic cleanup manifest', async (t) => {
  const { root, quarantineRoot } = await makeSandbox(t);
  const rollbackPath = path.join(
    root,
    'apps',
    'web',
    'public',
    'media.rollback-task9-media-20260716t2116z',
  );
  await mkdir(rollbackPath, { recursive: true });
  await writeFile(path.join(rollbackPath, 'asset.jpg'), 'protected-rollback');

  await assert.rejects(
    createCleanupManifest({
      root,
      quarantineRoot,
      manifestId: 'rollback-protection-run',
      createdAt: '2026-07-16T00:00:00.000Z',
      decisions: [
        {
          path: 'apps/web/public/media.rollback-task9-media-20260716t2116z',
          disposition: 'removable',
          reason: 'regenerable:media-rollback',
          role: 'not-evidence',
        },
      ],
    }),
    (error) => error instanceof CleanupManifestError && error.code === 'DECISION_MISMATCH',
  );
  assert.equal(await readFile(path.join(rollbackPath, 'asset.jpg'), 'utf8'), 'protected-rollback');
});

test('dry-run accepts only a sealed superseded source-release history root', async (t) => {
  const { root, quarantineRoot } = await makeSandbox(t);
  const releaseRelativePath =
    'artifacts/web-source-release-history/s2-p1-content-portfolio-fix2-20260715T162252Z';
  const releasePath = path.join(root, ...releaseRelativePath.split('/'));
  await mkdir(releasePath, { recursive: true });
  await writeFile(path.join(releasePath, 'dgbook-web-source.tar.gz'), 'old-release');

  const manifest = await createCleanupManifest({
    root,
    quarantineRoot,
    manifestId: 'superseded-source-release-run',
    createdAt: '2026-07-16T00:00:00.000Z',
    decisions: [
      {
        path: releaseRelativePath,
        disposition: 'removable',
        reason: 'superseded-evidence:web-source-release-history',
        role: 'superseded',
        supersededBy:
          'artifacts/web-source-release-history/p1-final-20260715t224419z',
      },
    ],
  });

  assert.equal(manifest.candidateCount, 1);
  assert.equal(manifest.candidates[0].relativePath, releaseRelativePath);
  assert.equal(manifest.candidates[0].role, 'superseded');
  assert.equal(
    manifest.candidates[0].supersededBy,
    'artifacts/web-source-release-history/p1-final-20260715t224419z',
  );
  assert.equal(manifest.candidates[0].count, 1);
  assert.equal(manifest.candidates[0].bytes, 11);
  await access(releasePath);
  await assert.rejects(access(manifest.candidates[0].targetPath));
});

test('dry-run honors injected reparse metadata even when local lstat appears ordinary', async (t) => {
  const { root, quarantineRoot } = await makeSandbox(t);
  const sourcePath = path.join(root, 'scripts', 'metadata.pyc');
  await writeFile(sourcePath, 'metadata');

  await assert.rejects(
    createCleanupManifest({
      root,
      quarantineRoot,
      manifestId: 'metadata-reparse-run',
      createdAt: '2026-07-16T00:00:00.000Z',
      decisions: [
        {
          path: 'scripts/metadata.pyc',
          disposition: 'removable',
          reason: 'regenerable:python-bytecode',
          role: 'not-evidence',
          hasReparseAncestor: true,
        },
      ],
    }),
    (error) => error instanceof CleanupManifestError && error.code === 'REPARSE_POINT',
  );
  assert.equal(await readFile(sourcePath, 'utf8'), 'metadata');
});

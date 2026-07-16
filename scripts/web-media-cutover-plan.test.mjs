import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  auditExactMediaTree,
  auditRepositoryRelativeMediaFiles,
  assertNoCaseCollisions,
  assertCutoverStateTransition,
  buildMediaCutoverPlan,
  createMediaCutoverCurrentPointer,
  createMediaCutoverJournal,
  deriveGeneratedP1MediaUrls,
  executeMediaCutoverTransaction,
  mediaCutoverManifestPath,
  mediaTargetRelativePaths,
  normalizeMediaUrl,
  parseMediaCutoverManifest,
  resolveAcceptedMediaCutoverManifest,
  serializeMediaCutoverManifestSha256,
  validateMediaCutoverReleaseId,
} from './web-media-cutover-plan.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('derives the approved immutable P1 media closure from authoritative sources', async () => {
  const plan = await buildMediaCutoverPlan({
    repositoryRoot,
    releaseId: 'task9-a-test',
    createdAt: '2026-07-16T00:00:00.000Z',
  });

  assert.equal(plan.schema, 'dgbook.web-media-cutover-plan/v1');
  assert.equal(plan.state, 'planned');
  assert.equal(plan.summary.fileCount, 40);
  assert.equal(plan.summary.totalBytes, 12_627_129);
  assert.deepEqual(plan.summary.groups, {
    home: { fileCount: 4, totalBytes: 863_881 },
    capabilityMaps: { fileCount: 6, totalBytes: 266_566 },
    generatedP1: { fileCount: 22, totalBytes: 6_616_211 },
    existingTarget: { fileCount: 1, totalBytes: 1_650_087 },
    safeTts: { fileCount: 7, totalBytes: 3_230_384 },
  });

  assert.equal(new Set(plan.entries.map(({ url }) => url)).size, 40);
  assert.equal(plan.entries.filter(({ group }) => group === 'generatedP1').length, 22);
  assert.ok(plan.entries.some(({ url }) => url === '/media/5g/image2.jpeg'));
  assert.ok(plan.entries.some(({ url }) => url === '/media/manim/p01/p01-site-survey-map/manifest.json'));
  assert.ok(plan.entries.some(({ url }) => url === '/media/manim/p02/p02-outdoor-site-survey/p02-p02-outdoor-site-survey.webm'));
  assert.ok(plan.entries.some(({ url }) => url === '/media/manim/p03/p03-complaint-evidence-loop/poster.png'));

  const topology = plan.entries.find(({ url }) => url === '/media/5g/p01-n02-topology-stage-v1.png');
  assert.deepEqual(topology, {
    group: 'existingTarget',
    url: '/media/5g/p01-n02-topology-stage-v1.png',
    sourceKind: 'existing-target',
    sourcePath: 'apps/web/public/media/5g/p01-n02-topology-stage-v1.png',
    stagingPath: 'apps/web/public/media.staging-task9-a-test/5g/p01-n02-topology-stage-v1.png',
    targetPath: 'apps/web/public/media/5g/p01-n02-topology-stage-v1.png',
    bytes: 1_650_087,
    sha256: '86CAA5E66670B8F89C27A9A4FEF0DAA5B15316362BDB72AB491701D52357535E',
  });

  for (const entry of plan.entries) {
    assert.equal(entry.targetPath, `apps/web/public${entry.url}`);
    assert.ok(entry.stagingPath.startsWith('apps/web/public/media.staging-task9-a-test/'));
    assert.match(entry.sha256, /^[A-F0-9]{64}$/);
    assert.ok(entry.bytes > 0);
  }
  assert.match(plan.planSha256, /^[A-F0-9]{64}$/);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.entries));
});

test('rejects traversal, separator injection, absolute forms, NUL, encoding and Windows case collisions', () => {
  assert.equal(normalizeMediaUrl('/media/manim/p01/scene/poster.png'), '/media/manim/p01/scene/poster.png');
  for (const candidate of [
    '/media/../secret.txt',
    '/media/5g/../../secret.txt',
    '/media/5g\\secret.png',
    '/media/%2e%2e/secret.txt',
    '/media/5g%2fsecret.png',
    '/media/5g/%5Csecret.png',
    '/media/C:/secret.png',
    '/media//double.png',
    '/media/5g/./image.png',
    '/media/5g/image.png?cache=1',
    '/media/5g/image.png#fragment',
    `/media/5g/image\0.png`,
    'C:/media/5g/image.png',
    '//server/share/media/image.png',
  ]) assert.throws(() => normalizeMediaUrl(candidate), /unsafe media URL/);

  assert.throws(
    () => assertNoCaseCollisions(['/media/5g/Image.png', '/media/5g/image.png']),
    /case collision/,
  );
  assert.doesNotThrow(() => assertNoCaseCollisions(['/media/5g/image2.jpeg', '/media/5g/image3.png']));

  for (const releaseId of ['../escape', 'x/y', 'x\\y', 'C:cutover', '', 'x\0y']) {
    assert.throws(() => validateMediaCutoverReleaseId(releaseId), /invalid media cutover releaseId/);
  }
  assert.equal(validateMediaCutoverReleaseId('task9-20260716.a'), 'task9-20260716.a');
});

test('accepts exactly the three generated P1 task mediaRef sets and fails closed on drift', () => {
  const generatedEntries = EXPECTED_GENERATED_URLS.map((url) => ({ url }));
  const content = generatedContent(generatedEntries.map(({ url }) => url));
  assert.deepEqual(deriveGeneratedP1MediaUrls(content), EXPECTED_GENERATED_URLS);

  assert.throws(
    () => deriveGeneratedP1MediaUrls({ tasks: content.tasks.slice(0, 2) }),
    /generated P1 task set changed/,
  );
  assert.throws(
    () => deriveGeneratedP1MediaUrls(generatedContent([...EXPECTED_GENERATED_URLS.slice(0, -1), EXPECTED_GENERATED_URLS[0]])),
    /duplicates/,
  );
  assert.throws(
    () => deriveGeneratedP1MediaUrls(generatedContent([...EXPECTED_GENERATED_URLS.slice(0, -1), '/assets/not-media.png'])),
    /unsafe media URL/,
  );
  assert.throws(
    () => deriveGeneratedP1MediaUrls(generatedContent(EXPECTED_GENERATED_URLS.slice(0, -1))),
    /mediaRefs changed: 21/,
  );
});

test('exposes a stable immutable manifest contract for source archive exact-set gates', async () => {
  const plan = await buildMediaCutoverPlan({
    repositoryRoot,
    releaseId: 'release-closure-01',
    createdAt: '2026-07-16T00:00:00.000Z',
  });
  assert.equal(
    mediaCutoverManifestPath('release-closure-01'),
    'artifacts/media-cutover/release-closure-01/media-cutover-manifest.json',
  );
  assert.equal(plan.manifestPath, mediaCutoverManifestPath(plan.releaseId));
  assert.equal(plan.manifestSha256Path, `${plan.manifestPath}.sha256`);

  const parsed = parseMediaCutoverManifest(JSON.stringify(plan));
  const targetPaths = mediaTargetRelativePaths(parsed);
  assert.equal(targetPaths.length, 40);
  assert.equal(new Set(targetPaths).size, 40);
  assert.ok(targetPaths.includes('apps/web/public/media/5g/image2.jpeg'));
  assert.ok(targetPaths.includes('apps/web/public/media/manim/p03/p03-complaint-evidence-loop/poster.png'));
  assert.ok(targetPaths.every((targetPath) => targetPath.startsWith('apps/web/public/media/')));

  const tamperedPath = structuredClone(plan);
  tamperedPath.entries[0].targetPath = 'site/public/media/home/legacy.svg';
  assert.throws(() => parseMediaCutoverManifest(tamperedPath), /targetPath does not match URL/);

  const tamperedDigest = structuredClone(plan);
  tamperedDigest.createdAt = '2026-07-16T00:00:01.000Z';
  assert.throws(() => parseMediaCutoverManifest(tamperedDigest), /plan SHA-256 mismatch/);
});

test('exact-tree audit reports missing, extra, byte and SHA drift without changing the tree', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dgbook-media-tree-'));
  const expectedBytes = Buffer.from('abc');
  const entries = [{
    url: '/media/5g/a.bin',
    bytes: expectedBytes.byteLength,
    sha256: sha256(expectedBytes),
  }];
  try {
    await mkdir(path.join(root, '5g'), { recursive: true });
    await writeFile(path.join(root, '5g', 'a.bin'), expectedBytes);
    assert.deepEqual(await auditExactMediaTree({ root, entries }), {
      passed: true,
      expectedFileCount: 1,
      actualFileCount: 1,
      actualTotalBytes: 3,
      issues: [],
    });

    await writeFile(path.join(root, '5g', 'extra.bin'), 'x');
    let result = await auditExactMediaTree({ root, entries });
    assert.equal(result.passed, false);
    assert.deepEqual(result.issues.map(({ code, path: issuePath }) => [code, issuePath]), [
      ['extra-file', '5g/extra.bin'],
    ]);

    await unlink(path.join(root, '5g', 'extra.bin'));
    await unlink(path.join(root, '5g', 'a.bin'));
    result = await auditExactMediaTree({ root, entries });
    assert.deepEqual(result.issues.map(({ code }) => code), ['missing-file']);

    await writeFile(path.join(root, '5g', 'a.bin'), 'abd');
    result = await auditExactMediaTree({ root, entries });
    assert.deepEqual(result.issues.map(({ code }) => code), ['sha256-mismatch']);

    await writeFile(path.join(root, '5g', 'a.bin'), 'abcd');
    result = await auditExactMediaTree({ root, entries });
    assert.deepEqual(result.issues.map(({ code }) => code), ['byte-mismatch', 'sha256-mismatch']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('exact-tree audit rejects symlink, junction, reparse and realpath escape before reading media', async () => {
  const base = await mkdtemp(path.join(os.tmpdir(), 'dgbook-media-path-'));
  const root = path.join(base, 'root');
  const outside = path.join(base, 'outside');
  const linkedRoot = path.join(base, 'linked-root');
  const expectedBytes = Buffer.from('abc');
  const entries = [{ url: '/media/5g/a.bin', bytes: 3, sha256: sha256(expectedBytes) }];
  try {
    await mkdir(path.join(root, '5g'), { recursive: true });
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(root, '5g', 'a.bin'), expectedBytes);
    await writeFile(path.join(outside, 'secret.bin'), 'secret');
    await symlink(outside, path.join(root, 'escape'), 'junction');

    let result = await auditExactMediaTree({ root, entries });
    assert.equal(result.passed, false);
    assert.ok(result.issues.some(({ code, path: issuePath }) => code === 'unsafe-reparse-point' && issuePath === 'escape'));
    assert.ok(result.issues.some(({ code, path: issuePath }) => code === 'realpath-escape' && issuePath === 'escape'));

    result = await auditExactMediaTree({
      root,
      entries,
      reparseDetector: async (candidate) => path.basename(candidate) === '5g',
    });
    assert.ok(result.issues.some(({ code, path: issuePath }) => code === 'unsafe-reparse-point' && issuePath === '5g'));

    await symlink(root, linkedRoot, 'junction');
    result = await auditExactMediaTree({ root: linkedRoot, entries });
    assert.ok(result.issues.some(({ code }) => code === 'unsafe-root-reparse'));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('source-file audit enforces exact on-disk case and every parent reparse boundary', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dgbook-media-source-path-'));
  const bytes = Buffer.from('abc');
  const expected = {
    sourcePath: 'site/public/media/5g/image.png',
    bytes: 3,
    sha256: sha256(bytes),
  };
  try {
    await mkdir(path.join(root, 'site', 'public', 'media', '5g'), { recursive: true });
    await writeFile(path.join(root, 'site', 'public', 'media', '5g', 'Image.png'), bytes);
    let result = await auditRepositoryRelativeMediaFiles({
      repositoryRoot: root,
      entries: [expected],
      pathField: 'sourcePath',
    });
    assert.deepEqual(result.issues.map(({ code }) => code), ['path-case-mismatch']);

    await rename(
      path.join(root, 'site', 'public', 'media', '5g', 'Image.png'),
      path.join(root, 'site', 'public', 'media', '5g', 'image.png'),
    );
    result = await auditRepositoryRelativeMediaFiles({
      repositoryRoot: root,
      entries: [expected],
      pathField: 'sourcePath',
      reparseDetector: async (candidate) => path.basename(candidate) === 'media',
    });
    assert.ok(result.issues.some(({ code }) => code === 'unsafe-reparse-point'));

    await assert.rejects(
      () => auditRepositoryRelativeMediaFiles({
        repositoryRoot: root,
        entries: [{ ...expected, sourcePath: '../escape.bin' }],
        pathField: 'sourcePath',
      }),
      /unsafe repository-relative media path/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cutover state machine permits only ordered progress and explicit rollback terminals', () => {
  for (const [from, to] of [
    ['planned', 'staged'],
    ['staged', 'verified'],
    ['verified', 'switched'],
    ['switched', 'postverified'],
    ['postverified', 'quarantined'],
    ['planned', 'rolled_back'],
    ['staged', 'rolled_back'],
    ['verified', 'rolled_back'],
    ['switched', 'rolled_back'],
    ['postverified', 'rolled_back'],
  ]) assert.equal(assertCutoverStateTransition(from, to), to);

  for (const [from, to] of [
    ['planned', 'verified'],
    ['staged', 'switched'],
    ['verified', 'postverified'],
    ['switched', 'quarantined'],
    ['postverified', 'switched'],
    ['quarantined', 'rolled_back'],
    ['rolled_back', 'planned'],
    ['unknown', 'planned'],
  ]) assert.throws(() => assertCutoverStateTransition(from, to), /invalid media cutover state transition/);
});

test('transaction harness preserves or restores the old target at every injected cutover fault', async () => {
  const plan = await buildMediaCutoverPlan({
    repositoryRoot,
    releaseId: 'fault-test',
    createdAt: '2026-07-16T00:00:00.000Z',
  });
  const scenarios = [
    ['copy-entry-3', 'stage-entry:2', 'discarded-staging', false],
    ['source-reverify', 'reverify-sources', 'discarded-staging', false],
    ['first-rename', 'move-target-to-rollback', 'discarded-staging', false],
    ['second-rename', 'move-staging-to-target', 'restored-old-target', true],
    ['postverify', 'postverify', 'restored-old-target', true],
  ];

  for (const [name, failAt, expectedRecovery, expectedRestore] of scenarios) {
    const calls = [];
    const operations = transactionOperations(calls, failAt);
    const result = await executeMediaCutoverTransaction(plan, operations);
    assert.equal(result.state, 'rolled_back', name);
    assert.equal(result.failedAt, failAt, name);
    assert.equal(result.recovery, expectedRecovery, name);
    assert.equal(calls.includes('restore-old-target'), expectedRestore, name);
    assert.equal(calls.includes('discard-staging'), !expectedRestore, name);
  }
});

test('stable current pointer resolves exactly one digest-matched postverified manifest and journal', async () => {
  const plan = await buildMediaCutoverPlan({
    repositoryRoot,
    releaseId: 'accepted-release',
    createdAt: '2026-07-16T00:00:00.000Z',
  });
  const journal = createMediaCutoverJournal(plan, {
    state: 'postverified',
    updatedAt: '2026-07-16T00:05:00.000Z',
    stateHistory: ['planned', 'staged', 'verified', 'switched', 'postverified'],
  });
  const pointer = createMediaCutoverCurrentPointer(plan, journal, {
    acceptedAt: '2026-07-16T00:05:01.000Z',
  });
  const artifactRoot = await mkdtemp(path.join(os.tmpdir(), 'dgbook-media-accepted-'));
  try {
    await writeAcceptedArtifacts(artifactRoot, plan, journal, pointer);
    const accepted = await resolveAcceptedMediaCutoverManifest({ repositoryRoot: artifactRoot });
    assert.equal(accepted.manifest.planSha256, plan.planSha256);
    assert.equal(accepted.journal.state, 'postverified');
    assert.equal(accepted.targetPaths.length, 40);

    assert.throws(
      () => createMediaCutoverCurrentPointer(plan, createMediaCutoverJournal(plan, {
        state: 'verified',
        updatedAt: '2026-07-16T00:04:00.000Z',
        stateHistory: ['planned', 'staged', 'verified'],
      }), { acceptedAt: '2026-07-16T00:04:01.000Z' }),
      /postverified journal/,
    );

    await writeFile(path.join(artifactRoot, plan.manifestSha256Path), `${'0'.repeat(64)}  media-cutover-manifest.json\n`);
    await assert.rejects(
      () => resolveAcceptedMediaCutoverManifest({ repositoryRoot: artifactRoot }),
      /manifest SHA-256 sidecar mismatch/,
    );
  } finally {
    await rm(artifactRoot, { recursive: true, force: true });
  }
});

const EXPECTED_GENERATED_URLS = [
  '/media/5g/image2.jpeg',
  '/media/5g/image29.png',
  '/media/5g/image3.png',
  '/media/5g/image30.png',
  '/media/5g/image31.png',
  '/media/5g/image4.png',
  '/media/manim/p01/p01-site-survey-map/manifest.json',
  '/media/manim/p01/p01-site-survey-map/p01-p01-site-survey-map.webm',
  '/media/manim/p01/p01-site-survey-map/poster.png',
  '/media/5g/image54.jpeg',
  '/media/5g/image55.png',
  '/media/5g/image56.png',
  '/media/5g/image57.png',
  '/media/5g/image58.jpeg',
  '/media/5g/image62.png',
  '/media/5g/image65.png',
  '/media/manim/p02/p02-outdoor-site-survey/manifest.json',
  '/media/manim/p02/p02-outdoor-site-survey/p02-p02-outdoor-site-survey.webm',
  '/media/manim/p02/p02-outdoor-site-survey/poster.png',
  '/media/manim/p03/p03-complaint-evidence-loop/manifest.json',
  '/media/manim/p03/p03-complaint-evidence-loop/p03-p03-complaint-evidence-loop.webm',
  '/media/manim/p03/p03-complaint-evidence-loop/poster.png',
];

function generatedContent(urls) {
  return {
    tasks: [
      { taskId: 'P01', source: { mediaRefs: urls.slice(0, 9) } },
      { taskId: 'P02', source: { mediaRefs: urls.slice(9, 19) } },
      { taskId: 'P03', source: { mediaRefs: urls.slice(19) } },
    ],
  };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex').toUpperCase();
}

function transactionOperations(calls, failAt) {
  const operation = (name) => async () => {
    calls.push(name);
    if (name === failAt) throw new Error(`injected fault at ${name}`);
  };
  return {
    prepareStaging: operation('prepare-staging'),
    stageEntry: async (_entry, index) => operation(`stage-entry:${index}`)(),
    verifyStaging: operation('verify-staging'),
    reverifySources: operation('reverify-sources'),
    moveTargetToRollback: operation('move-target-to-rollback'),
    moveStagingToTarget: operation('move-staging-to-target'),
    postverify: operation('postverify'),
    discardStaging: operation('discard-staging'),
    restoreOldTarget: operation('restore-old-target'),
  };
}

async function writeAcceptedArtifacts(root, plan, journal, pointer) {
  for (const relativePath of [plan.manifestPath, plan.manifestSha256Path, journal.journalPath, pointer.pointerPath]) {
    await mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  }
  await writeFile(path.join(root, plan.manifestPath), `${JSON.stringify(plan, null, 2)}\n`);
  await writeFile(path.join(root, plan.manifestSha256Path), serializeMediaCutoverManifestSha256(plan));
  await writeFile(path.join(root, journal.journalPath), `${JSON.stringify(journal, null, 2)}\n`);
  await writeFile(path.join(root, pointer.pointerPath), `${JSON.stringify(pointer, null, 2)}\n`);
}

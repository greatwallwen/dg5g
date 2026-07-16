import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const CURRENT_SHA = '6fdc0726527dd9e5d2944aae2cef6e7affd46cc5ef0e91cc40eeac6b21109477';
const PREVIOUS_SHA = '9433b8acc08f0f9a5be546b0fb73a85dcd53838e4b803c24c811e4ec3a3d6bbb';
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('confirms a locked release role only when every explicit identity and runtime proof agrees', async () => {
  const { buildReleaseEvidenceIndex, evidenceMetadataForPath } = await import('./release-evidence-index.mjs');
  const index = buildReleaseEvidenceIndex({
    releases: [releaseFixture({
      releaseId: 's3-classroom-unified-snapshot',
      evidenceRole: 'current',
      path: 'artifacts/web-source-release',
      sha256: CURRENT_SHA,
    })],
    finalRuns: [],
    staleCandidates: [],
  });

  assert.equal(index.schema, 'dgbook.release-evidence-index/v1');
  assert.deepEqual(index.releases, [{
    releaseId: 's3-classroom-unified-snapshot',
    path: 'artifacts/web-source-release',
    evidenceRole: 'current',
    sha256: CURRENT_SHA,
    confirmed: true,
    evidencePaths: [
      '.superpowers/sdd/s3-classroom-unified-snapshot.md',
      'artifacts/web-source-release/dgbook-web-source.tar.gz',
      'artifacts/web-source-release/dgbook-web-source.tar.gz.sha256',
      'artifacts/web-source-release/dgbook-web-source.upload-manifest.json',
      'output/playwright/s3-classroom-unified-snapshot/report.json',
    ],
    issues: [],
  }]);
  assert.equal(index.entries.length, 5);
  for (const entry of index.entries) {
    assert.equal(entry.evidenceRole, 'current');
    assert.equal(entry.releaseId, 's3-classroom-unified-snapshot');
    assert.equal(entry.sha256, CURRENT_SHA);
    assert.equal(entry.exact, true);
  }
  assert.deepEqual(evidenceMetadataForPath(index, 'artifacts/web-source-release/dgbook-web-source.tar.gz'), {
    path: 'artifacts/web-source-release/dgbook-web-source.tar.gz',
    evidenceRole: 'current',
  });
  assert.deepEqual(
    evidenceMetadataForPath(index, 'artifacts/web-source-release/dgbook-web-source/apps/web/package.json'),
    {
      path: 'artifacts/web-source-release/dgbook-web-source/apps/web/package.json',
      evidenceRole: 'unknown',
    },
  );
  assert.deepEqual(index.issues, []);

  const mismatched = releaseFixture({
    releaseId: 's3-classroom-unified-snapshot',
    evidenceRole: 'current',
    path: 'artifacts/web-source-release',
    sha256: CURRENT_SHA,
  });
  mismatched.archiveSha256 = '0'.repeat(64);
  const protectedIndex = buildReleaseEvidenceIndex({
    releases: [mismatched],
    finalRuns: [],
    staleCandidates: [],
  });

  assert.equal(protectedIndex.releases[0].confirmed, false);
  assert.equal(protectedIndex.releases[0].evidenceRole, 'unknown');
  assert.deepEqual(protectedIndex.releases[0].issues, ['archive-sha-mismatch']);
  assert.equal(protectedIndex.entries[0].evidenceRole, 'unknown');
  assert.deepEqual(protectedIndex.issues, [{
    code: 'release-evidence-unconfirmed',
    path: 'artifacts/web-source-release',
    releaseId: 's3-classroom-unified-snapshot',
    reasons: ['archive-sha-mismatch'],
  }]);
});

test('keeps a release unknown when its attestation identity or runtime audit is not confirmed', async () => {
  const { buildReleaseEvidenceIndex } = await import('./release-evidence-index.mjs');
  const candidate = releaseFixture({
    releaseId: 's3-classroom-unified-snapshot',
    evidenceRole: 'current',
    path: 'artifacts/web-source-release',
    sha256: CURRENT_SHA,
  });
  candidate.releaseReport = candidate.releaseReport.replace(CURRENT_SHA, PREVIOUS_SHA);
  candidate.runtimeReport.failures.push('remote-runtime-failure');

  const index = buildReleaseEvidenceIndex({ releases: [candidate] });

  assert.equal(index.releases[0].evidenceRole, 'unknown');
  assert.deepEqual(index.releases[0].issues, [
    'release-report-sha-mismatch',
    'runtime-report:failures:1',
  ]);
  assert.ok(index.entries.every(({ evidenceRole }) => evidenceRole === 'unknown'));
});

test('downgrades ambiguous duplicate current releases to unknown', async () => {
  const { buildReleaseEvidenceIndex } = await import('./release-evidence-index.mjs');
  const first = releaseFixture({
    releaseId: 'current-a',
    evidenceRole: 'current',
    path: 'artifacts/current-a',
    sha256: CURRENT_SHA,
  });
  const second = releaseFixture({
    releaseId: 'current-b',
    evidenceRole: 'current',
    path: 'artifacts/current-b',
    sha256: PREVIOUS_SHA,
  });

  const index = buildReleaseEvidenceIndex({ releases: [second, first] });

  assert.deepEqual(index.releases.map(({ releaseId, evidenceRole, confirmed, issues }) => ({
    releaseId,
    evidenceRole,
    confirmed,
    issues,
  })), [
    {
      releaseId: 'current-a',
      evidenceRole: 'unknown',
      confirmed: false,
      issues: ['ambiguous-release-role:current'],
    },
    {
      releaseId: 'current-b',
      evidenceRole: 'unknown',
      confirmed: false,
      issues: ['ambiguous-release-role:current'],
    },
  ]);
  assert.ok(index.entries.every(({ evidenceRole }) => evidenceRole === 'unknown'));
});

test('accepts a complete zero-failure final run and rejects a run with a failed journey', async () => {
  const { evaluateFinalEvidenceRun } = await import('./release-evidence-index.mjs');
  const final6 = finalRunFixture('task8-final6-20260716T0455Z');
  const accepted = evaluateFinalEvidenceRun(final6);

  assert.equal(accepted.eligible, true);
  assert.deepEqual(accepted.issues, []);
  assert.equal(accepted.evidenceRole, 'unknown');

  const final5 = finalRunFixture('task8-final5-20260716T0452Z');
  final5.reports.find(({ reportId }) => reportId === 'p1-complete-journey').document.failures.push(
    'formal-attempt-limit',
  );
  const rejected = evaluateFinalEvidenceRun(final5);

  assert.equal(rejected.eligible, false);
  assert.deepEqual(rejected.issues, ['p1-complete-journey:failures:1']);
  assert.equal(rejected.evidenceRole, 'unknown');
});

test('fails final evidence closed when a required report, checkpoint, or screenshot hash is missing', async () => {
  const { evaluateFinalEvidenceRun } = await import('./release-evidence-index.mjs');
  const candidate = finalRunFixture('task8-final6-20260716T0455Z');
  candidate.reports = candidate.reports.filter(({ reportId }) => reportId !== 'self-study-closure');
  const image2 = candidate.reports.find(({ reportId }) => reportId === 'image2-layout').document;
  image2.captures[0].actualScreenshotSha256 = 'f'.repeat(64);
  const journey = candidate.reports.find(({ reportId }) => reportId === 'p1-complete-journey').document;
  journey.checkpoints = journey.checkpoints.filter(({ name }) => name !== 'teacher-verified-three-professional-outputs');

  const result = evaluateFinalEvidenceRun(candidate);

  assert.equal(result.eligible, false);
  assert.deepEqual(result.issues, [
    'missing-report:self-study-closure',
    'image2-layout:screenshot-sha-mismatch:1',
    'p1-complete-journey:missing-checkpoint:teacher-verified-three-professional-outputs',
  ]);
});

test('accepts only the explicit isolated-mutation skip in a public read-only web runtime audit', async () => {
  const { evaluateFinalEvidenceRun } = await import('./release-evidence-index.mjs');
  const candidate = finalRunFixture('public-read-only-final');
  const runtime = candidate.reports.find(({ reportId }) => reportId === 'web-runtime');
  runtime.document = {
    isolatedDatabase: false,
    checks: [
      { name: 'public runtime', status: 'passed' },
      { name: 'isolated mutation', status: 'skipped' },
    ],
    consoleErrors: [],
    failures: [],
  };

  const accepted = evaluateFinalEvidenceRun(candidate);
  assert.equal(accepted.eligible, true);
  assert.deepEqual(accepted.issues, []);

  runtime.document.checks[1].name = 'authorization boundary';
  const rejected = evaluateFinalEvidenceRun(candidate);
  assert.equal(rejected.eligible, false);
  assert.deepEqual(rejected.issues, ['web-runtime:checks-failed:1']);
});

test('marks only the explicitly selected eligible final and explicitly superseded stale evidence', async () => {
  const { buildReleaseEvidenceIndex, evidenceMetadataForPath } = await import('./release-evidence-index.mjs');
  const final6 = finalRunFixture('task8-final6-20260716T0455Z');
  const final5 = finalRunFixture('task8-final5-20260716T0452Z');
  final5.reports.find(({ reportId }) => reportId === 'p1-complete-journey').document.failures.push(
    'formal-attempt-limit',
  );

  const index = buildReleaseEvidenceIndex({
    releases: [],
    finalRuns: [final6, final5],
    selectedFinalRunId: final6.runId,
    staleCandidates: [
      { path: final5.path, supersededBy: final6.path },
      { path: 'output/playwright/unproven-stale-run' },
      { path: 'output/playwright/missing-target-run', supersededBy: 'output/playwright/not-indexed' },
    ],
  });

  assert.deepEqual(
    index.finalRuns.map(({ runId, evidenceRole, eligible, supersededBy }) => ({
      runId,
      evidenceRole,
      eligible,
      supersededBy,
    })),
    [
      {
        runId: final5.runId,
        evidenceRole: 'superseded',
        eligible: false,
        supersededBy: final6.path,
      },
      {
        runId: final6.runId,
        evidenceRole: 'final',
        eligible: true,
        supersededBy: undefined,
      },
    ],
  );
  assert.deepEqual(index.staleCandidates, [
    {
      path: 'output/playwright/missing-target-run',
      evidenceRole: 'unknown',
      supersededBy: 'output/playwright/not-indexed',
      issues: ['superseded-target-unconfirmed', 'source-evidence-unindexed'],
    },
    {
      path: final5.path,
      evidenceRole: 'superseded',
      supersededBy: final6.path,
      issues: [],
    },
    {
      path: 'output/playwright/unproven-stale-run',
      evidenceRole: 'unknown',
      supersededBy: undefined,
      issues: ['missing-superseded-by', 'source-evidence-unindexed'],
    },
  ]);

  assert.deepEqual(evidenceMetadataForPath(index, `${final5.path}/image2-layout/report.json`), {
    path: `${final5.path}/image2-layout/report.json`,
    evidenceRole: 'superseded',
    supersededBy: final6.path,
  });
  assert.deepEqual(evidenceMetadataForPath(index, `${final6.path}/image2-layout/report.json`), {
    path: `${final6.path}/image2-layout/report.json`,
    evidenceRole: 'final',
  });
  assert.deepEqual(evidenceMetadataForPath(index, 'output/playwright/not-indexed/report.json'), {
    path: 'output/playwright/not-indexed/report.json',
    evidenceRole: 'unknown',
  });
});

test('does not supersede a stale run whose own required evidence is incomplete', async () => {
  const { buildReleaseEvidenceIndex } = await import('./release-evidence-index.mjs');
  const final6 = finalRunFixture('task8-final6-20260716T0455Z');
  const broken = finalRunFixture('task8-broken-run');
  broken.reports = broken.reports.filter(({ reportId }) => reportId !== 'web-runtime');

  const index = buildReleaseEvidenceIndex({
    finalRuns: [final6, broken],
    selectedFinalRunId: final6.runId,
    staleCandidates: [{ path: broken.path, supersededBy: final6.path }],
  });

  const brokenRun = index.finalRuns.find(({ runId }) => runId === broken.runId);
  assert.equal(brokenRun?.evidenceRole, 'unknown');
  assert.deepEqual(index.staleCandidates, [{
    path: broken.path,
    evidenceRole: 'unknown',
    supersededBy: final6.path,
    issues: ['source-evidence-incomplete'],
  }]);
});

test('loads the final workspace evidence and confirms locked P1 final, S3 rollback, and canonical final-run decisions', async () => {
  const { evidenceMetadataForPath, loadDefaultReleaseEvidenceIndex } = await import('./release-evidence-index.mjs');
  const index = await loadDefaultReleaseEvidenceIndex({ repositoryRoot: REPOSITORY_ROOT });

  const current = index.releases.find(({ evidenceRole }) => evidenceRole === 'current');
  assert.equal(current?.releaseId, 'p1-final-20260715t224419z');
  assert.equal(current?.path, 'artifacts/web-source-release-history/p1-final-20260715t224419z');
  assert.equal(current?.sha256, CURRENT_SHA);
  assert.equal(current?.confirmed, true);
  assert.equal(
    evidenceMetadataForPath(index, `${current.path}/dgbook-web-source.tar.gz`).evidenceRole,
    'current',
  );
  assert.equal(
    evidenceMetadataForPath(index, 'artifacts/web-source-release/dgbook-web-source.tar.gz').evidenceRole,
    'unknown',
  );

  const previous = index.releases.find(({ evidenceRole }) => evidenceRole === 'previous');
  assert.equal(previous?.releaseId, 's3-classroom-unified-snapshot-fix1-20260715T190407Z');
  assert.equal(previous?.path, 'artifacts/web-source-release-history/s3-classroom-unified-snapshot-fix1-20260715T190407Z');
  assert.equal(previous?.sha256, PREVIOUS_SHA);
  assert.equal(previous?.confirmed, true);

  const finalRun = index.finalRuns.find(({ runId }) => runId === 'p1-final-20260715t224419z');
  assert.equal(finalRun?.path, 'output/playwright/p1-final/p1-final-20260715t224419z');
  assert.equal(finalRun?.eligible, true);
  assert.equal(finalRun?.evidenceRole, 'final');
  assert.deepEqual(finalRun?.issues, []);
  assert.equal(
    finalRun?.reportPaths.includes(
      'output/playwright/p1-final/p1-final-20260715t224419z/web-runtime/report.json',
    ),
    true,
  );

  assert.equal(
    index.finalRuns.some(({ runId }) => runId === 'task8-final6-20260716T0455Z'),
    false,
  );
  assert.deepEqual(index.staleCandidates, []);
  assert.deepEqual(index.issues, []);
});

function releaseFixture({ releaseId, evidenceRole, path, sha256 }) {
  return {
    releaseId,
    evidenceRole,
    path,
    expectedSha256: sha256,
    manifestPath: `${path}/dgbook-web-source.upload-manifest.json`,
    manifest: {
      kind: 'dgbook-web-source',
      sha256,
    },
    sidecarPath: `${path}/dgbook-web-source.tar.gz.sha256`,
    sidecar: `${sha256}  dgbook-web-source.tar.gz\n`,
    archivePath: `${path}/dgbook-web-source.tar.gz`,
    archiveSha256: sha256,
    releaseReportPath: `.superpowers/sdd/${releaseId}.md`,
    releaseReport: `releaseId: \`${releaseId}\`\nsourceSha256: \`${sha256}\`\n`,
    runtimeReportPath: `output/playwright/${releaseId}/report.json`,
    runtimeReport: {
      checks: [{ status: 'passed' }],
      consoleErrors: [],
      failures: [],
    },
  };
}

function finalRunFixture(runId) {
  const path = `output/playwright/${runId}`;
  return {
    runId,
    path,
    attestationPath: 'design-qa.md',
    attestation: [
      'final result: passed',
      `Final evidence run: \`${runId}\`.`,
      'Product P0: 0. Product P1: 0.',
    ].join('\n'),
    reports: [
      {
        reportId: 'image2-layout',
        path: `${path}/image2-layout/report.json`,
        document: {
          matrix: { jobs: 120, states: 24 },
          captures: Array.from({ length: 120 }, (_, index) => ({
            screenshot: `${path}/image2-layout/capture-${index}.png`,
            screenshotSha256: String(index).padStart(64, '0'),
            actualScreenshotSha256: String(index).padStart(64, '0'),
            screenshotBytes: 1,
          })),
          consoleErrors: [],
          failures: [],
        },
      },
      {
        reportId: 'p1-complete-journey',
        path: `${path}/p1-complete-journey/report.json`,
        document: {
          checkpoints: [
            'teacher-started-p1t1-n02',
            'three-students-joined',
            'teacher-switch-follow-isolation',
            'leave-rejoin-preserves-personal-progress',
            'three-task-professional-outputs-submitted',
            'teacher-verified-three-professional-outputs',
            'portfolio-and-graph-authoritative-update',
          ].map((name) => ({ name })),
          browserErrors: [],
          failures: [],
        },
      },
      {
        reportId: 'p1-three-terminal-consistency',
        path: `${path}/p1-three-terminal-consistency/report.json`,
        document: { checks: [{ status: 'passed' }], consoleErrors: [], failures: [] },
      },
      {
        reportId: 'class-session-cross-context',
        path: `${path}/class-session-cross-context/report.json`,
        document: {
          classroom: {},
          participation: {},
          cursors: {},
          contexts: {},
          privacy: {},
        },
      },
      {
        reportId: 'self-study-closure',
        path: `${path}/self-study-closure/self-study-closure-report.json`,
        document: {
          checkpoints: [
            'actor-scoped-snapshots',
            'isolated-self-study-write',
            'student-learning-page',
            'teacher-workbench',
          ].map((name) => ({ name })),
          errors: [],
          blockingIssues: [],
        },
      },
      {
        reportId: 'web-runtime',
        path: `${path}/web-runtime/report.json`,
        document: { checks: [{ status: 'passed' }], consoleErrors: [], failures: [] },
      },
    ],
  };
}

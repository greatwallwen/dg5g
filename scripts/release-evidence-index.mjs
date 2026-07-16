import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const INDEX_SCHEMA = 'dgbook.release-evidence-index/v1';
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RELEASE_ROLES = new Set(['current', 'previous']);
const REQUIRED_FINAL_REPORT_IDS = [
  'class-session-cross-context',
  'image2-layout',
  'p1-complete-journey',
  'p1-three-terminal-consistency',
  'self-study-closure',
  'web-runtime',
];
const REQUIRED_P1_JOURNEY_CHECKPOINTS = [
  'teacher-started-p1t1-n02',
  'three-students-joined',
  'teacher-switch-follow-isolation',
  'leave-rejoin-preserves-personal-progress',
  'three-task-professional-outputs-submitted',
  'teacher-verified-three-professional-outputs',
  'portfolio-and-graph-authoritative-update',
];

const CURRENT_RELEASE_ROOT = 'artifacts/web-source-release-history/p1-final-20260715t224419z';
const PREVIOUS_RELEASE_ROOT = 'artifacts/web-source-release-history/s3-classroom-unified-snapshot-fix1-20260715T190407Z';
const FINAL_RUN_ID = 'p1-final-20260715t224419z';
const FINAL_RUN_ROOT = `output/playwright/p1-final/${FINAL_RUN_ID}`;

export const DEFAULT_RELEASE_EVIDENCE_SPEC = Object.freeze({
  releases: [
    {
      releaseId: 'p1-final-20260715t224419z',
      evidenceRole: 'current',
      path: CURRENT_RELEASE_ROOT,
      expectedSha256: '6fdc0726527dd9e5d2944aae2cef6e7affd46cc5ef0e91cc40eeac6b21109477',
      manifestPath: `${CURRENT_RELEASE_ROOT}/dgbook-web-source.upload-manifest.json`,
      sidecarPath: `${CURRENT_RELEASE_ROOT}/dgbook-web-source.tar.gz.sha256`,
      archivePath: `${CURRENT_RELEASE_ROOT}/dgbook-web-source.tar.gz`,
      releaseReportPath: '.superpowers/sdd/p1-final-release-report.md',
      runtimeReportPath: `${FINAL_RUN_ROOT}/web-runtime/report.json`,
    },
    {
      releaseId: 's3-classroom-unified-snapshot-fix1-20260715T190407Z',
      evidenceRole: 'previous',
      path: PREVIOUS_RELEASE_ROOT,
      expectedSha256: '9433b8acc08f0f9a5be546b0fb73a85dcd53838e4b803c24c811e4ec3a3d6bbb',
      manifestPath: `${PREVIOUS_RELEASE_ROOT}/dgbook-web-source.upload-manifest.json`,
      sidecarPath: `${PREVIOUS_RELEASE_ROOT}/dgbook-web-source.tar.gz.sha256`,
      archivePath: `${PREVIOUS_RELEASE_ROOT}/dgbook-web-source.tar.gz`,
      releaseReportPath: '.superpowers/sdd/s3-remote-release-report.md',
      runtimeReportPath: 'output/playwright/s3-classroom-unified-snapshot/s3-classroom-unified-snapshot-fix1-20260715T190407Z/report.json',
    },
  ],
  finalRuns: [
    finalRunSpec(FINAL_RUN_ID, {
      root: FINAL_RUN_ROOT,
      attestationPath: '.superpowers/sdd/p1-final-release-attestation.md',
    }),
  ],
  selectedFinalRunId: FINAL_RUN_ID,
  // The live index contains only the currently protected release and final
  // evidence roots. Quarantine manifests retain supersession history.
  staleCandidates: [],
});

export function buildReleaseEvidenceIndex({
  releases = [],
  finalRuns = [],
  selectedFinalRunId,
  staleCandidates = [],
} = {}) {
  const releaseRecords = releases
    .map(confirmReleaseEvidence)
    .sort((left, right) => left.path.localeCompare(right.path));
  for (const role of RELEASE_ROLES) {
    const matches = releaseRecords.filter(({ confirmed, evidenceRole }) => confirmed && evidenceRole === role);
    if (matches.length > 1) {
      for (const match of matches) {
        match.confirmed = false;
        match.evidenceRole = 'unknown';
        match.issues.push(`ambiguous-release-role:${role}`);
      }
    }
  }
  const finalRecords = finalRuns
    .map(evaluateFinalEvidenceRun)
    .sort((left, right) => left.path.localeCompare(right.path));
  const selectedFinal = finalRecords.filter(({ runId }) => runId === selectedFinalRunId);
  if (selectedFinal.length === 1 && selectedFinal[0].eligible) {
    selectedFinal[0].evidenceRole = 'final';
  }

  const protectedTargets = new Set([
    ...releaseRecords.filter(({ confirmed }) => confirmed).map(({ path }) => path),
    ...finalRecords.filter(({ evidenceRole }) => evidenceRole === 'final').map(({ path }) => path),
  ]);
  const staleRecords = staleCandidates
    .map((candidate) => evaluateStaleCandidate(
      candidate,
      protectedTargets,
      finalRecords.find(({ path }) => path === normalizePath(candidate?.path)),
    ))
    .sort((left, right) => left.path.localeCompare(right.path));

  for (const stale of staleRecords) {
    const finalRecord = finalRecords.find(({ path }) => path === stale.path);
    if (finalRecord && finalRecord.evidenceRole === 'unknown') {
      finalRecord.evidenceRole = stale.evidenceRole;
      if (stale.supersededBy !== undefined) finalRecord.supersededBy = stale.supersededBy;
    }
  }

  const entries = releaseRecords.flatMap(({ evidencePaths, evidenceRole, releaseId, sha256 }) =>
    evidencePaths.map((evidencePath) => ({
      path: evidencePath,
      evidenceRole,
      releaseId,
      sha256,
      exact: true,
    })));
  entries.push(...finalRecords.map(({ path, evidenceRole, runId, supersededBy }) => compactEntry({
    path,
    evidenceRole,
    runId,
    supersededBy,
  })));
  entries.push(...staleRecords
    .filter(({ path }) => !finalRecords.some((finalRecord) => finalRecord.path === path))
    .map(({ path, evidenceRole, supersededBy }) => compactEntry({ path, evidenceRole, supersededBy })));
  entries.sort((left, right) => left.path.localeCompare(right.path));

  const issues = releaseRecords
    .filter(({ confirmed }) => !confirmed)
    .map(({ path, releaseId, issues: reasons }) => ({
      code: 'release-evidence-unconfirmed',
      path,
      releaseId,
      reasons,
    }));
  if (finalRecords.length > 0 && (selectedFinal.length !== 1 || !selectedFinal[0].eligible)) {
    issues.push({
      code: 'final-evidence-unconfirmed',
      runId: String(selectedFinalRunId ?? ''),
      reasons: selectedFinal.length === 1 ? selectedFinal[0].issues : ['selected-final-not-unique'],
    });
  }
  issues.push(...staleRecords
    .filter(({ evidenceRole }) => evidenceRole === 'unknown')
    .map(({ path, issues: reasons }) => ({
      code: 'stale-evidence-unconfirmed',
      path,
      reasons,
    })));

  return {
    schema: INDEX_SCHEMA,
    releases: releaseRecords,
    finalRuns: finalRecords,
    staleCandidates: staleRecords,
    entries,
    issues,
  };
}

export function evidenceMetadataForPath(index, inputPath) {
  const path = normalizePath(inputPath);
  const matches = (Array.isArray(index?.entries) ? index.entries : [])
    .filter((entry) => path === entry.path || (!entry.exact && path.startsWith(`${entry.path}/`)))
    .sort((left, right) => right.path.length - left.path.length || left.path.localeCompare(right.path));
  if (matches.length === 0) return { path, evidenceRole: 'unknown' };

  const longestLength = matches[0].path.length;
  const closest = matches.filter((entry) => entry.path.length === longestLength);
  const roles = new Set(closest.map(({ evidenceRole }) => evidenceRole));
  if (roles.size !== 1) return { path, evidenceRole: 'unknown' };

  const match = closest[0];
  return compactEntry({
    path,
    evidenceRole: match.evidenceRole,
    supersededBy: match.evidenceRole === 'superseded' ? match.supersededBy : undefined,
  });
}

export async function loadDefaultReleaseEvidenceIndex({ repositoryRoot = process.cwd() } = {}) {
  return loadReleaseEvidenceIndex(DEFAULT_RELEASE_EVIDENCE_SPEC, { repositoryRoot });
}

export async function loadReleaseEvidenceIndex(spec, {
  repositoryRoot = process.cwd(),
  readText = defaultReadText,
  hashFile = sha256File,
  fileInfo = defaultFileInfo,
} = {}) {
  const releases = [];
  for (const release of spec.releases ?? []) {
    const manifestText = await readText(resolveEvidencePath(repositoryRoot, release.manifestPath));
    releases.push({
      ...release,
      manifest: JSON.parse(manifestText),
      sidecar: await readText(resolveEvidencePath(repositoryRoot, release.sidecarPath)),
      archiveSha256: await hashFile(resolveEvidencePath(repositoryRoot, release.archivePath)),
      releaseReport: await readText(resolveEvidencePath(repositoryRoot, release.releaseReportPath)),
      runtimeReport: JSON.parse(await readText(resolveEvidencePath(repositoryRoot, release.runtimeReportPath))),
    });
  }

  const finalRuns = [];
  for (const run of spec.finalRuns ?? []) {
    const reports = [];
    for (const report of run.reports ?? []) {
      const document = JSON.parse(await readText(resolveEvidencePath(repositoryRoot, report.path)));
      if (report.reportId === 'image2-layout' && Array.isArray(document.captures)) {
        for (const capture of document.captures) {
          try {
            const screenshotPath = resolveEvidencePath(repositoryRoot, capture.screenshot);
            const info = await fileInfo(screenshotPath);
            capture.screenshotBytes = info.size;
            capture.actualScreenshotSha256 = await hashFile(screenshotPath);
          } catch {
            capture.screenshotBytes = 0;
            capture.actualScreenshotSha256 = undefined;
          }
        }
      }
      reports.push({
        ...report,
        document,
      });
    }
    finalRuns.push({
      ...run,
      attestation: await readText(resolveEvidencePath(repositoryRoot, run.attestationPath)),
      reports,
    });
  }

  return buildReleaseEvidenceIndex({
    releases,
    finalRuns,
    selectedFinalRunId: spec.selectedFinalRunId,
    staleCandidates: spec.staleCandidates,
  });
}

export function evaluateFinalEvidenceRun(candidate) {
  const runId = String(candidate.runId ?? '');
  const path = normalizePath(candidate.path);
  const issues = [];
  const reports = Array.isArray(candidate.reports) ? candidate.reports : [];
  const reportsById = new Map();

  for (const report of reports) {
    const reportId = String(report?.reportId ?? '');
    if (!reportId || reportsById.has(reportId)) {
      issues.push(reportId ? `duplicate-report:${reportId}` : 'invalid-report-id');
      continue;
    }
    reportsById.set(reportId, report?.document);
  }

  for (const reportId of REQUIRED_FINAL_REPORT_IDS) {
    if (!reportsById.has(reportId)) issues.push(`missing-report:${reportId}`);
  }

  inspectImage2Report(reportsById.get('image2-layout'), issues);
  inspectArrayFailures(reportsById.get('p1-complete-journey'), 'p1-complete-journey', ['browserErrors', 'failures'], issues);
  inspectRequiredCheckpoints(
    reportsById.get('p1-complete-journey'),
    'p1-complete-journey',
    REQUIRED_P1_JOURNEY_CHECKPOINTS,
    issues,
  );
  inspectPassedChecks(reportsById.get('p1-three-terminal-consistency'), 'p1-three-terminal-consistency', issues);
  inspectCrossContextReport(reportsById.get('class-session-cross-context'), issues);
  inspectArrayFailures(reportsById.get('self-study-closure'), 'self-study-closure', ['errors', 'blockingIssues'], issues);
  inspectPassedChecks(reportsById.get('web-runtime'), 'web-runtime', issues, {
    allowedPublicReadOnlySkips: ['isolated mutation'],
  });
  inspectAttestation(candidate.attestation, runId, issues);

  return {
    runId,
    path,
    evidenceRole: 'unknown',
    eligible: issues.length === 0,
    complete: !issues.some(isIncompleteEvidenceIssue),
    attestationPath: normalizePath(candidate.attestationPath),
    reportPaths: reports.map(({ path: reportPath }) => normalizePath(reportPath)).sort((left, right) => left.localeCompare(right)),
    issues,
  };
}

function inspectImage2Report(document, issues) {
  if (!document || typeof document !== 'object') return;
  const jobs = document.matrix?.jobs;
  if (jobs !== 120) issues.push(`image2-layout:jobs:${String(jobs)}`);
  if (!Array.isArray(document.captures) || document.captures.length !== jobs) {
    issues.push(`image2-layout:captures:${Array.isArray(document.captures) ? document.captures.length : 'invalid'}`);
  } else {
    let mismatched = 0;
    for (const capture of document.captures) {
      const reported = normalizeSha256(capture?.screenshotSha256);
      const actual = normalizeSha256(capture?.actualScreenshotSha256);
      if (!reported || !actual || capture?.screenshotBytes <= 0 || reported !== actual) mismatched += 1;
    }
    if (mismatched > 0) issues.push(`image2-layout:screenshot-sha-mismatch:${mismatched}`);
  }
  inspectArrayFailures(document, 'image2-layout', ['consoleErrors', 'failures'], issues);
}

function inspectRequiredCheckpoints(document, reportId, requiredNames, issues) {
  if (!document || typeof document !== 'object') return;
  const names = new Set(Array.isArray(document.checkpoints) ? document.checkpoints.map(({ name }) => name) : []);
  for (const name of requiredNames) {
    if (!names.has(name)) issues.push(`${reportId}:missing-checkpoint:${name}`);
  }
}

function inspectPassedChecks(document, reportId, issues, {
  allowedPublicReadOnlySkips = [],
} = {}) {
  if (!document || typeof document !== 'object') return;
  if (!Array.isArray(document.checks) || document.checks.length === 0) {
    issues.push(`${reportId}:checks:invalid`);
  } else {
    const allowedSkips = new Set(
      document.isolatedDatabase === false ? allowedPublicReadOnlySkips : [],
    );
    const failed = document.checks.filter(({ name, status }) =>
      status !== 'passed' && !(status === 'skipped' && allowedSkips.has(name))).length;
    if (failed > 0) issues.push(`${reportId}:checks-failed:${failed}`);
  }
  inspectArrayFailures(document, reportId, ['consoleErrors', 'failures'], issues);
}

function inspectCrossContextReport(document, issues) {
  if (!document || typeof document !== 'object') return;
  for (const key of ['classroom', 'participation', 'cursors', 'contexts', 'privacy']) {
    if (!document[key] || typeof document[key] !== 'object') {
      issues.push(`class-session-cross-context:missing:${key}`);
    }
  }
}

function inspectArrayFailures(document, reportId, fields, issues) {
  if (!document || typeof document !== 'object') return;
  for (const field of fields) {
    if (!Array.isArray(document[field])) {
      issues.push(`${reportId}:${field}:invalid`);
    } else if (document[field].length > 0) {
      issues.push(`${reportId}:${field}:${document[field].length}`);
    }
  }
}

function inspectAttestation(attestation, runId, issues) {
  const text = String(attestation ?? '');
  if (!text.includes('final result: passed')) issues.push('attestation:not-passed');
  if (!text.includes(`Final evidence run: \`${runId}\`.`)) issues.push('attestation:run-mismatch');
  if (!text.includes('Product P0: 0. Product P1: 0.')) issues.push('attestation:open-p0-p1');
}

function evaluateStaleCandidate(candidate, protectedTargets, sourceRecord) {
  const path = normalizePath(candidate?.path);
  const supersededBy = candidate?.supersededBy === undefined
    ? undefined
    : normalizePath(candidate.supersededBy);
  const issues = [];
  if (!supersededBy) {
    issues.push('missing-superseded-by');
  } else if (supersededBy === path) {
    issues.push('self-supersession');
  } else if (!protectedTargets.has(supersededBy)) {
    issues.push('superseded-target-unconfirmed');
  }
  if (!sourceRecord) {
    issues.push('source-evidence-unindexed');
  } else if (!sourceRecord.complete) {
    issues.push('source-evidence-incomplete');
  }

  return {
    path,
    evidenceRole: issues.length === 0 ? 'superseded' : 'unknown',
    supersededBy,
    issues,
  };
}

function isIncompleteEvidenceIssue(issue) {
  return issue.startsWith('missing-report:')
    || issue.startsWith('duplicate-report:')
    || issue === 'invalid-report-id'
    || issue.includes(':invalid')
    || issue.startsWith('image2-layout:screenshot-sha-mismatch:');
}

function compactEntry(entry) {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined));
}

function finalRunSpec(runId, {
  root = `output/playwright/${runId}`,
  attestationPath = 'design-qa.md',
} = {}) {
  return {
    runId,
    path: root,
    attestationPath,
    reports: [
      { reportId: 'image2-layout', path: `${root}/image2-layout/report.json` },
      { reportId: 'p1-complete-journey', path: `${root}/p1-complete-journey/report.json` },
      { reportId: 'p1-three-terminal-consistency', path: `${root}/p1-three-terminal-consistency/report.json` },
      { reportId: 'class-session-cross-context', path: `${root}/class-session-cross-context/report.json` },
      { reportId: 'self-study-closure', path: `${root}/self-study-closure/self-study-closure-report.json` },
      { reportId: 'web-runtime', path: `${root}/web-runtime/report.json` },
    ],
  };
}

function resolveEvidencePath(repositoryRoot, relativePath) {
  return path.resolve(repositoryRoot, normalizePath(relativePath));
}

function defaultReadText(filePath) {
  return readFile(filePath, 'utf8');
}

async function defaultFileInfo(filePath) {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Evidence screenshot must be a regular file.');
  return info;
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve);
  });
  return hash.digest('hex');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadDefaultReleaseEvidenceIndex()
    .then((index) => console.log(JSON.stringify(index, null, 2)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

function confirmReleaseEvidence(candidate) {
  const path = normalizePath(candidate.path);
  const expectedSha256 = normalizeSha256(candidate.expectedSha256);
  const manifestSha256 = normalizeSha256(candidate.manifest?.sha256);
  const sidecarSha256 = normalizeSha256(String(candidate.sidecar ?? '').trim().split(/\s+/u)[0]);
  const archiveSha256 = normalizeSha256(candidate.archiveSha256);
  const issues = [];

  if (!RELEASE_ROLES.has(candidate.evidenceRole)) issues.push('invalid-release-role');
  if (candidate.manifest?.kind !== 'dgbook-web-source') issues.push('invalid-manifest-kind');
  if (!expectedSha256) issues.push('invalid-expected-sha');
  if (manifestSha256 !== expectedSha256) issues.push('manifest-sha-mismatch');
  if (sidecarSha256 !== expectedSha256) issues.push('sidecar-sha-mismatch');
  if (archiveSha256 !== expectedSha256) issues.push('archive-sha-mismatch');
  const releaseReport = String(candidate.releaseReport ?? '');
  if (!releaseReport.includes(String(candidate.releaseId ?? ''))) issues.push('release-report-id-mismatch');
  if (!expectedSha256 || !releaseReport.toLowerCase().includes(expectedSha256)) {
    issues.push('release-report-sha-mismatch');
  }
  inspectReleaseRuntimeReport(candidate.runtimeReport, issues);

  const confirmed = issues.length === 0;
  return {
    releaseId: String(candidate.releaseId ?? ''),
    path,
    evidenceRole: confirmed ? candidate.evidenceRole : 'unknown',
    sha256: expectedSha256 ?? String(candidate.expectedSha256 ?? ''),
    confirmed,
    evidencePaths: [
      candidate.archivePath,
      candidate.sidecarPath,
      candidate.manifestPath,
      candidate.releaseReportPath,
      candidate.runtimeReportPath,
    ]
      .map(normalizePath)
      .sort((left, right) => left.localeCompare(right)),
    issues,
  };
}

function inspectReleaseRuntimeReport(document, issues) {
  if (!document || typeof document !== 'object') {
    issues.push('runtime-report:invalid');
    return;
  }
  if (!Array.isArray(document.checks) || document.checks.length === 0) {
    issues.push('runtime-report:checks:invalid');
  } else {
    const failed = document.checks.filter(({ status }) => !['passed', 'skipped'].includes(status)).length;
    if (failed > 0) issues.push(`runtime-report:checks-failed:${failed}`);
  }
  inspectArrayFailures(document, 'runtime-report', ['consoleErrors', 'failures'], issues);
}

function normalizeSha256(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SHA256_PATTERN.test(normalized) ? normalized : undefined;
}

function normalizePath(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

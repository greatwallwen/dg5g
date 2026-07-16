import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  parseAcceptedMediaManifest,
  verifyAcceptedMediaArtifactSet,
  verifyAcceptedWebMediaRelease,
} from './verify-accepted-web-media-release.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('verifies the accepted digest chain and exact 40-file web media target', async () => {
  const accepted = await verifyAcceptedWebMediaRelease({ repositoryRoot });

  assert.equal(accepted.manifest.summary.fileCount, 40);
  assert.equal(accepted.manifest.summary.totalBytes, 12_627_129);
  assert.equal(accepted.targetPaths.length, 40);
  assert.equal(new Set(accepted.targetPaths).size, 40);
  assert.equal(accepted.targetPaths.every((targetPath) => targetPath.startsWith('apps/web/public/media/')), true);
  assert.deepEqual(accepted.targetAudit, {
    passed: true,
    expectedFileCount: 40,
    actualFileCount: 40,
    actualTotalBytes: 12_627_129,
    issues: [],
  });
});

test('rejects sidecar drift and a non-postverified accepted journal', async () => {
  const artifacts = await readCurrentArtifacts();
  assert.doesNotThrow(() => verifyAcceptedMediaArtifactSet(artifacts));

  assert.throws(
    () => verifyAcceptedMediaArtifactSet({ ...artifacts, sidecar: `${'0'.repeat(64)}  media-cutover-manifest.json\n` }),
    /manifest SHA-256 sidecar mismatch/,
  );

  const verifiedJournal = structuredClone(artifacts.journal);
  verifiedJournal.state = 'verified';
  verifiedJournal.stateHistory = ['planned', 'staged', 'verified'];
  const { journalSha256: _oldJournalSha256, ...unsignedJournal } = verifiedJournal;
  verifiedJournal.journalSha256 = canonicalSha256(unsignedJournal);
  assert.throws(
    () => verifyAcceptedMediaArtifactSet({ ...artifacts, journal: verifiedJournal }),
    /not postverified/,
  );
});

test('rejects path/bytes/SHA contract drift even when the manifest digest is recomputed', async () => {
  const { manifest } = await readCurrentArtifacts();
  const tampered = structuredClone(manifest);
  tampered.entries[0].bytes += 1;
  tampered.summary.totalBytes += 1;
  tampered.summary.groups[tampered.entries[0].group].totalBytes += 1;
  const { planSha256: _oldPlanSha256, ...unsignedManifest } = tampered;
  tampered.planSha256 = canonicalSha256(unsignedManifest);

  assert.throws(
    () => parseAcceptedMediaManifest(tampered),
    /40-file path\/bytes\/SHA contract mismatch/,
  );
});

test('rejects an unsafe historical source path even when the manifest digest is recomputed', async () => {
  const { manifest } = await readCurrentArtifacts();
  const tampered = structuredClone(manifest);
  tampered.entries[0].sourcePath = '../outside.bin';
  const { planSha256: _oldPlanSha256, ...unsignedManifest } = tampered;
  tampered.planSha256 = canonicalSha256(unsignedManifest);

  assert.throws(
    () => parseAcceptedMediaManifest(tampered),
    /unsafe repository path/,
  );
});

test('rejects a reparse boundary before trusting accepted artifacts', async () => {
  await assert.rejects(
    () => verifyAcceptedWebMediaRelease({
      repositoryRoot,
      reparseDetector: async (candidate, candidateStat) => (
        candidateStat.isSymbolicLink() || path.basename(candidate) === 'current.json'
      ),
    }),
    /reparse point/,
  );
  await assert.rejects(
    () => verifyAcceptedWebMediaRelease({
      repositoryRoot,
      reparseDetector: async (candidate, candidateStat) => (
        candidateStat.isSymbolicLink() || path.basename(candidate) === '5g'
      ),
    }),
    /unsafe-reparse-point:5g/,
  );
});

test('keeps the active verifier and source packager independent from the legacy cutover module and root', async () => {
  const verifierSource = await readFile(new URL('./verify-accepted-web-media-release.mjs', import.meta.url), 'utf8');
  const packagerSource = await readFile(new URL('./prepare-web-source-release.mjs', import.meta.url), 'utf8');
  const policySource = await readFile(new URL('./web-source-release-policy.mjs', import.meta.url), 'utf8');

  for (const source of [verifierSource, packagerSource, policySource]) {
    assert.equal(source.includes('site/public/media'), false);
  }
  assert.equal(verifierSource.includes('web-media-cutover-plan.mjs'), false);
  assert.equal(packagerSource.includes('web-media-cutover-plan.mjs'), false);
});

async function readCurrentArtifacts() {
  const pointer = JSON.parse(await readFile(path.join(repositoryRoot, 'artifacts/media-cutover/current.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(repositoryRoot, pointer.manifestPath), 'utf8'));
  const sidecar = await readFile(path.join(repositoryRoot, pointer.manifestSha256Path), 'utf8');
  const journal = JSON.parse(await readFile(path.join(repositoryRoot, pointer.journalPath), 'utf8'));
  return { pointer, manifest, sidecar, journal };
}

function canonicalSha256(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex').toUpperCase();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

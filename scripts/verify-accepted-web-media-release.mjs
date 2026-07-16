import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

const MANIFEST_SCHEMA = 'dgbook.web-media-cutover-plan/v1';
const JOURNAL_SCHEMA = 'dgbook.web-media-cutover-journal/v1';
const POINTER_SCHEMA = 'dgbook.web-media-cutover-current/v1';
const ARTIFACT_ROOT = 'artifacts/media-cutover';
const CURRENT_POINTER_PATH = `${ARTIFACT_ROOT}/current.json`;
const WEB_MEDIA_TARGET_ROOT = 'apps/web/public/media';
const EXPECTED_FILE_COUNT = 40;
const EXPECTED_TOTAL_BYTES = 12_627_129;
const EXPECTED_TARGET_CONTRACT_SHA256 = '28BE8A10D3AAA00923F0A90BA8237FBBC72240AF284D3C68D9BB83866336763B';
const EXPECTED_GROUP_SUMMARIES = Object.freeze({
  home: { fileCount: 4, totalBytes: 863_881 },
  capabilityMaps: { fileCount: 6, totalBytes: 266_566 },
  generatedP1: { fileCount: 22, totalBytes: 6_616_211 },
  existingTarget: { fileCount: 1, totalBytes: 1_650_087 },
  safeTts: { fileCount: 7, totalBytes: 3_230_384 },
});
const TRANSITIONS = Object.freeze({
  planned: ['staged', 'rolled_back'],
  staged: ['verified', 'rolled_back'],
  verified: ['switched', 'rolled_back'],
  switched: ['postverified', 'rolled_back'],
  postverified: ['quarantined', 'rolled_back'],
  quarantined: [],
  rolled_back: [],
});

export async function verifyAcceptedWebMediaRelease({
  repositoryRoot,
  reparseDetector = defaultReparseDetector,
} = {}) {
  const root = path.resolve(repositoryRoot);
  const pointer = parseAcceptedMediaPointer(
    parseJson(await readSecureRepositoryFile(root, CURRENT_POINTER_PATH, reparseDetector), 'current pointer'),
  );
  const manifestText = await readSecureRepositoryFile(root, pointer.manifestPath, reparseDetector);
  const sidecar = await readSecureRepositoryFile(root, pointer.manifestSha256Path, reparseDetector);
  const journalText = await readSecureRepositoryFile(root, pointer.journalPath, reparseDetector);
  const accepted = verifyAcceptedMediaArtifactSet({
    pointer,
    manifest: parseJson(manifestText, 'manifest'),
    sidecar,
    journal: parseJson(journalText, 'journal'),
  });
  const targetAudit = await auditExactAcceptedMediaTree({
    root: path.resolve(root, ...accepted.manifest.targetRoot.split('/')),
    entries: accepted.manifest.entries,
    reparseDetector,
  });
  assert(targetAudit.passed, `accepted web media target audit failed: ${formatIssues(targetAudit.issues)}`);
  return deepFreeze({ ...accepted, targetAudit });
}

export function verifyAcceptedMediaArtifactSet({ pointer, manifest, sidecar, journal }) {
  const parsedPointer = parseAcceptedMediaPointer(pointer);
  const parsedManifest = parseAcceptedMediaManifest(manifest);
  const parsedJournal = parseAcceptedMediaJournal(journal);
  assert(sidecar === `${parsedManifest.planSha256}  media-cutover-manifest.json\n`, 'media cutover manifest SHA-256 sidecar mismatch');
  assert(['postverified', 'quarantined'].includes(parsedJournal.state), 'accepted media cutover journal is not postverified');
  assert(
    parsedManifest.releaseId === parsedPointer.releaseId && parsedJournal.releaseId === parsedPointer.releaseId,
    'accepted media cutover release mismatch',
  );
  assert(
    parsedManifest.planSha256 === parsedPointer.planSha256 && parsedJournal.planSha256 === parsedPointer.planSha256,
    'accepted media cutover plan SHA mismatch',
  );
  return deepFreeze({
    pointer: parsedPointer,
    manifest: parsedManifest,
    journal: parsedJournal,
    targetPaths: parsedManifest.entries.map(({ targetPath }) => targetPath),
  });
}

export function parseAcceptedMediaPointer(input) {
  const candidate = jsonClone(input, 'current pointer');
  assert(candidate.schema === POINTER_SCHEMA, 'invalid media cutover current pointer schema');
  validateReleaseId(candidate.releaseId);
  assert(candidate.pointerPath === CURRENT_POINTER_PATH, 'invalid media cutover current pointer path');
  const manifestPath = manifestPathFor(candidate.releaseId);
  assert(candidate.manifestPath === manifestPath, 'invalid current media manifest path');
  assert(candidate.manifestSha256Path === `${manifestPath}.sha256`, 'invalid current media manifest SHA path');
  assert(candidate.journalPath === journalPathFor(candidate.releaseId), 'invalid current media journal path');
  assertSha256(candidate.planSha256, 'invalid current media plan SHA-256');
  assertValidTimestamp(candidate.acceptedAt, 'invalid media cutover acceptance timestamp');
  const { pointerSha256, ...unsigned } = candidate;
  assertSha256(pointerSha256, 'invalid current media pointer SHA-256');
  assert(sha256Text(canonicalJson(unsigned)) === pointerSha256, 'media cutover current pointer SHA-256 mismatch');
  return deepFreeze(candidate);
}

export function parseAcceptedMediaManifest(input) {
  const candidate = jsonClone(input, 'manifest');
  assert(candidate.schema === MANIFEST_SCHEMA, 'invalid media cutover manifest schema');
  validateReleaseId(candidate.releaseId);
  assert(candidate.state === 'planned', 'immutable media cutover plan must remain planned');
  assertValidTimestamp(candidate.createdAt, 'invalid media cutover manifest timestamp');
  assert(candidate.manifestPath === manifestPathFor(candidate.releaseId), 'invalid media cutover manifest path');
  assert(candidate.manifestSha256Path === `${candidate.manifestPath}.sha256`, 'invalid media cutover manifest SHA path');
  const sourceRoot = normalizeRepositoryPath(candidate.sourceRoot);
  assert(candidate.targetRoot === WEB_MEDIA_TARGET_ROOT, 'invalid accepted web media target root');
  assert(candidate.existingTargetRoot === WEB_MEDIA_TARGET_ROOT, 'invalid accepted existing web media target root');
  assert(candidate.stagingRoot === `${WEB_MEDIA_TARGET_ROOT}.staging-${candidate.releaseId}`, 'invalid media staging root');
  assert(candidate.rollbackRoot === `${WEB_MEDIA_TARGET_ROOT}.rollback-${candidate.releaseId}`, 'invalid media rollback root');
  assert(Array.isArray(candidate.entries) && candidate.entries.length === EXPECTED_FILE_COUNT, `media cutover manifest entry count changed: ${candidate.entries?.length}`);

  const seenTargets = new Map();
  const targetContract = [];
  for (const entry of candidate.entries) {
    const url = normalizeMediaUrl(entry?.url);
    const sourcePath = normalizeRepositoryPath(entry?.sourcePath);
    const stagingPath = normalizeRepositoryPath(entry?.stagingPath);
    const targetPath = normalizeRepositoryPath(entry?.targetPath);
    assert(targetPath === `apps/web/public${url}`, `media cutover targetPath does not match URL: ${url}`);
    assert(
      entry.sourceKind === 'existing-target'
        ? sourcePath === targetPath
        : sourcePath.startsWith(`${sourceRoot}/`),
      `media cutover sourcePath does not match source root: ${url}`,
    );
    assert(
      stagingPath === `${candidate.stagingRoot}/${url.slice('/media/'.length)}`,
      `media cutover stagingPath does not match URL: ${url}`,
    );
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes > 0, `invalid media bytes: ${url}`);
    assertSha256(entry.sha256, `invalid media SHA-256: ${url}`);
    assert(typeof entry.group === 'string' && entry.group.length > 0, `invalid media group: ${url}`);
    const collisionKey = targetPath.normalize('NFC').toLowerCase();
    assert(!seenTargets.has(collisionKey), `media target case collision: ${seenTargets.get(collisionKey)} <> ${targetPath}`);
    seenTargets.set(collisionKey, targetPath);
    targetContract.push({ targetPath, bytes: entry.bytes, sha256: entry.sha256 });
  }
  targetContract.sort((left, right) => left.targetPath.localeCompare(right.targetPath));
  assert(
    sha256Text(canonicalJson(targetContract)) === EXPECTED_TARGET_CONTRACT_SHA256,
    'accepted web media 40-file path/bytes/SHA contract mismatch',
  );

  const recalculatedSummary = {
    fileCount: candidate.entries.length,
    totalBytes: candidate.entries.reduce((total, entry) => total + entry.bytes, 0),
    groups: groupSummaries(candidate.entries),
  };
  assert(recalculatedSummary.fileCount === EXPECTED_FILE_COUNT, 'accepted web media file count changed');
  assert(recalculatedSummary.totalBytes === EXPECTED_TOTAL_BYTES, 'accepted web media total bytes changed');
  assert(canonicalJson(recalculatedSummary.groups) === canonicalJson(EXPECTED_GROUP_SUMMARIES), 'accepted web media group totals changed');
  assert(canonicalJson(candidate.summary) === canonicalJson(recalculatedSummary), 'media cutover manifest summary mismatch');
  validateOldTargetInventory(candidate.oldTargetInventory);
  const { planSha256, ...unsigned } = candidate;
  assertSha256(planSha256, 'invalid media cutover plan SHA-256');
  assert(sha256Text(canonicalJson(unsigned)) === planSha256, 'media cutover plan SHA-256 mismatch');
  return deepFreeze(candidate);
}

export function parseAcceptedMediaJournal(input) {
  const candidate = jsonClone(input, 'journal');
  assert(candidate.schema === JOURNAL_SCHEMA, 'invalid media cutover journal schema');
  validateReleaseId(candidate.releaseId);
  assert(candidate.manifestPath === manifestPathFor(candidate.releaseId), 'invalid media cutover journal manifest path');
  assert(candidate.journalPath === journalPathFor(candidate.releaseId), 'invalid media cutover journal path');
  assert(Array.isArray(candidate.stateHistory) && candidate.stateHistory[0] === 'planned', 'media cutover journal must begin at planned');
  for (let index = 1; index < candidate.stateHistory.length; index += 1) {
    const previous = candidate.stateHistory[index - 1];
    assert(TRANSITIONS[previous]?.includes(candidate.stateHistory[index]), `invalid media cutover state transition: ${previous} -> ${candidate.stateHistory[index]}`);
  }
  assert(candidate.stateHistory.at(-1) === candidate.state, 'media cutover journal state does not match state history');
  assertSha256(candidate.planSha256, 'invalid journal plan SHA-256');
  assertValidTimestamp(candidate.updatedAt, 'invalid media cutover journal timestamp');
  const { journalSha256, ...unsigned } = candidate;
  assertSha256(journalSha256, 'invalid media cutover journal SHA-256');
  assert(sha256Text(canonicalJson(unsigned)) === journalSha256, 'media cutover journal SHA-256 mismatch');
  return deepFreeze(candidate);
}

export async function auditExactAcceptedMediaTree({
  root,
  entries,
  reparseDetector = defaultReparseDetector,
}) {
  const absoluteRoot = path.resolve(root);
  const expected = new Map();
  for (const entry of entries) {
    const targetPath = normalizeRepositoryPath(entry.targetPath);
    assert(targetPath.startsWith(`${WEB_MEDIA_TARGET_ROOT}/`), `media target escapes accepted root: ${targetPath}`);
    const relativePath = targetPath.slice(`${WEB_MEDIA_TARGET_ROOT}/`.length);
    assert(!expected.has(relativePath), `duplicate accepted media target: ${relativePath}`);
    expected.set(relativePath, { bytes: entry.bytes, sha256: entry.sha256 });
  }

  const issues = [];
  const actual = new Map();
  let rootRealPath;
  try {
    const rootStat = await lstat(absoluteRoot);
    if (rootStat.isSymbolicLink() || await reparseDetector(absoluteRoot, rootStat)) {
      issues.push({ code: 'unsafe-root-reparse', path: '' });
    } else if (!rootStat.isDirectory()) {
      issues.push({ code: 'root-not-directory', path: '' });
    } else {
      rootRealPath = await realpath(absoluteRoot);
      await walk(absoluteRoot, '');
    }
  } catch (error) {
    issues.push({ code: 'unreadable-root', path: '', detail: error instanceof Error ? error.message : String(error) });
  }
  for (const expectedPath of [...expected.keys()].sort()) {
    if (!actual.has(expectedPath)) issues.push({ code: 'missing-file', path: expectedPath });
  }
  for (const actualPath of [...actual.keys()].sort()) {
    if (!expected.has(actualPath)) issues.push({ code: 'extra-file', path: actualPath });
  }
  for (const [relativePath, expectedEntry] of [...expected.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const actualEntry = actual.get(relativePath);
    if (!actualEntry) continue;
    if (actualEntry.bytes !== expectedEntry.bytes) issues.push({ code: 'byte-mismatch', path: relativePath, expected: expectedEntry.bytes, actual: actualEntry.bytes });
    if (actualEntry.sha256 !== expectedEntry.sha256) issues.push({ code: 'sha256-mismatch', path: relativePath, expected: expectedEntry.sha256, actual: actualEntry.sha256 });
  }
  return {
    passed: issues.length === 0,
    expectedFileCount: expected.size,
    actualFileCount: actual.size,
    actualTotalBytes: [...actual.values()].reduce((total, entry) => total + entry.bytes, 0),
    issues,
  };

  async function walk(directory, relativeDirectory) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name;
      const absolutePath = path.join(directory, child.name);
      try {
        const childStat = await lstat(absolutePath);
        if (childStat.isSymbolicLink() || await reparseDetector(absolutePath, childStat)) {
          issues.push({ code: 'unsafe-reparse-point', path: relativePath });
          continue;
        }
        const resolved = await realpath(absolutePath);
        if (!isPathInside(rootRealPath, resolved)) {
          issues.push({ code: 'realpath-escape', path: relativePath });
          continue;
        }
        if (childStat.isDirectory()) {
          await walk(absolutePath, relativePath);
        } else if (childStat.isFile()) {
          actual.set(relativePath.split(path.sep).join('/'), {
            bytes: childStat.size,
            sha256: await sha256File(absolutePath),
          });
        } else {
          issues.push({ code: 'non-regular-entry', path: relativePath });
        }
      } catch (error) {
        issues.push({ code: 'unreadable-entry', path: relativePath, detail: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}

async function readSecureRepositoryFile(repositoryRoot, relativePath, reparseDetector) {
  const normalized = normalizeRepositoryPath(relativePath);
  const rootStat = await lstat(repositoryRoot);
  assert(rootStat.isDirectory() && !rootStat.isSymbolicLink() && !await reparseDetector(repositoryRoot, rootStat), 'accepted media repository root is unsafe');
  const rootRealPath = await realpath(repositoryRoot);
  let current = repositoryRoot;
  const segments = normalized.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    const names = await readdir(current);
    assert(names.includes(segments[index]), `accepted media artifact path case mismatch: ${normalized}`);
    current = path.join(current, segments[index]);
    const currentStat = await lstat(current);
    assert(!currentStat.isSymbolicLink() && !await reparseDetector(current, currentStat), `accepted media artifact path contains a reparse point: ${normalized}`);
    const resolved = await realpath(current);
    assert(isPathInside(rootRealPath, resolved), `accepted media artifact realpath escapes repository: ${normalized}`);
    if (index < segments.length - 1) assert(currentStat.isDirectory(), `accepted media artifact parent is not a directory: ${normalized}`);
    else assert(currentStat.isFile(), `accepted media artifact is not a regular file: ${normalized}`);
  }
  return readFile(current, 'utf8');
}

function validateOldTargetInventory(inventory) {
  assert(inventory && Array.isArray(inventory.entries), 'old media target inventory is required');
  const paths = new Set();
  for (const entry of inventory.entries) {
    const relativePath = normalizeRepositoryPath(entry.relativePath);
    assert(!paths.has(relativePath.toLowerCase()), `old media target inventory case collision: ${relativePath}`);
    paths.add(relativePath.toLowerCase());
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes > 0, `invalid old target bytes: ${relativePath}`);
    assertSha256(entry.sha256, `invalid old target SHA-256: ${relativePath}`);
  }
  const summary = {
    fileCount: inventory.entries.length,
    totalBytes: inventory.entries.reduce((total, entry) => total + entry.bytes, 0),
  };
  assert(canonicalJson(inventory.summary) === canonicalJson(summary), 'old media target inventory summary mismatch');
  assert(summary.fileCount === 9 && summary.totalBytes === 5_494_279, 'old media target inventory totals changed');
}

function groupSummaries(entries) {
  const groups = [...new Set(entries.map(({ group }) => group))].sort();
  return Object.fromEntries(groups.map((group) => {
    const members = entries.filter((entry) => entry.group === group);
    return [group, {
      fileCount: members.length,
      totalBytes: members.reduce((total, entry) => total + entry.bytes, 0),
    }];
  }));
}

function normalizeMediaUrl(candidate) {
  assert(typeof candidate === 'string' && candidate.startsWith('/media/'), `unsafe media URL: ${String(candidate)}`);
  assert(!candidate.startsWith('//') && !candidate.includes('\\') && !candidate.includes('\0'), `unsafe media URL: ${candidate}`);
  assert(!candidate.includes('%') && !candidate.includes('?') && !candidate.includes('#') && !candidate.includes(':'), `unsafe media URL: ${candidate}`);
  assert(path.posix.normalize(candidate) === candidate, `unsafe media URL: ${candidate}`);
  assert(candidate.slice(1).split('/').every((segment) => segment && segment !== '.' && segment !== '..'), `unsafe media URL: ${candidate}`);
  return candidate;
}

function normalizeRepositoryPath(candidate) {
  assert(
    typeof candidate === 'string'
      && !path.isAbsolute(candidate)
      && !path.win32.isAbsolute(candidate)
      && !candidate.includes('\\')
      && !candidate.includes('\0')
      && !candidate.includes('%')
      && !candidate.includes(':')
      && path.posix.normalize(candidate) === candidate
      && candidate.split('/').every((segment) => segment && segment !== '.' && segment !== '..'),
    `unsafe repository path: ${String(candidate)}`,
  );
  return candidate;
}

function validateReleaseId(releaseId) {
  assert(typeof releaseId === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(releaseId), 'invalid media cutover releaseId');
}

function manifestPathFor(releaseId) {
  validateReleaseId(releaseId);
  return `${ARTIFACT_ROOT}/${releaseId}/media-cutover-manifest.json`;
}

function journalPathFor(releaseId) {
  validateReleaseId(releaseId);
  return `${ARTIFACT_ROOT}/${releaseId}/media-cutover-journal.json`;
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid accepted media ${label} JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function jsonClone(input, label) {
  try {
    const value = typeof input === 'string' ? JSON.parse(input) : JSON.parse(JSON.stringify(input));
    assert(value && typeof value === 'object' && !Array.isArray(value), `invalid accepted media ${label}`);
    return value;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid accepted media')) throw error;
    throw new Error(`invalid accepted media ${label} JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertValidTimestamp(value, message) {
  assert(typeof value === 'string' && !Number.isNaN(Date.parse(value)), message);
}

function assertSha256(value, message) {
  assert(typeof value === 'string' && /^[A-F0-9]{64}$/u.test(value), message);
}

function isPathInside(rootPath, candidatePath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function defaultReparseDetector(_candidate, candidateStat) {
  return candidateStat.isSymbolicLink();
}

function formatIssues(issues) {
  return issues.map(({ code, path: issuePath }) => `${code}:${issuePath}`).join(', ');
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex').toUpperCase()));
  });
}

function sha256Text(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex').toUpperCase();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

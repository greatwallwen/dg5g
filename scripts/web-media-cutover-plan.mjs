import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export const EXPECTED_MEDIA_CLOSURE = deepFreeze([
  media('home', '/media/home/capability-map-expert-readable-v2.svg', 358_782, '2E51E6462E541C9591E9DCFEBF02E615F5D13B8FE1B8B1182C93F92DB482DAB3'),
  media('home', '/media/home/capability-map-expert.svg', 367_851, '55E28E6E25F30008CE10D7D60254533EA1D1C8C382DC23BCF906318E688ABF0B'),
  media('home', '/media/home/capability-map-student.svg', 80_948, 'C87F1BC17EE577946EC01A0D41A927B298EA46DB1596D9396110EA17B8E71DEA'),
  media('home', '/media/home/capability-map.svg', 56_300, '9732699F2EFE494E5E080E1FFAC9503CAB217B265DC18F5C7970530E76ECFDF5'),
  media('capabilityMaps', '/media/capability-maps/ch1-module-map-readable-v2.svg', 45_178, '9DAB63381459CCEE253639E046EEBE9ECC5BC895BEF28EFA23E0D3F358CAAC31'),
  media('capabilityMaps', '/media/capability-maps/ch2-module-map-readable-v2.svg', 44_480, '72B8D9087F051892F4F18FCBB8CA98EDBD932EDC82683107D3B70F3B4B9F283F'),
  media('capabilityMaps', '/media/capability-maps/ch3-module-map-readable-v2.svg', 54_962, 'E6ED12801A2E7B9FE74F715352675A0838738AE5DBACB78D1B1F2BE71DF49AAE'),
  media('capabilityMaps', '/media/capability-maps/ch4-module-map-readable-v2.svg', 44_177, 'FEC78FBA47D0CD47C8CACF044F386D7871D5925B93DC83CA77515E90BA088934'),
  media('capabilityMaps', '/media/capability-maps/ch5-module-map-readable-v2.svg', 44_022, 'B9DCD0A0E3863E514C1ADBD29E9575DD64350445CC58ABCB1FC3E8D99FEC7C77'),
  media('capabilityMaps', '/media/capability-maps/ch6-module-map-readable-v2.svg', 33_747, 'EEE5E2186FC62EF1904219E6F89E87ADE36BDCDD86A857E5D1E87E8954144784'),
  media('generatedP1', '/media/5g/image2.jpeg', 63_781, '9C403BD487C3F753341A576DB6A4BCA2CB97B7A7CFD880CE48C7B11190784570'),
  media('generatedP1', '/media/5g/image29.png', 693_394, '8C53B0FC70C5329479F584086BCDB561E2A8678F5710E4BE62C1568E7B3E04C2'),
  media('generatedP1', '/media/5g/image3.png', 245_104, '6F106DF690A48D03E18DD86461065133A041555032BF7137A58665DB02601F5D'),
  media('generatedP1', '/media/5g/image30.png', 176_771, '11E87B2E409F959749633B0385995D7A01FCC2931700CFDBB04758D853A635F5'),
  media('generatedP1', '/media/5g/image31.png', 216_458, 'FA57D6C5B77BD888210411BD5CDBB2F2EB77A153C9A5A55E4C66589314C279CD'),
  media('generatedP1', '/media/5g/image4.png', 54_906, 'CE97BB5C7ACA334A7D20D2E9CDD2A685460C34B8B9BBE41F6C15095DF7B03390'),
  media('generatedP1', '/media/manim/p01/p01-site-survey-map/manifest.json', 2_757, 'FFB037E56E62307F697123961C8E8F112EA4B72818814D85B14E688C46D3C53F'),
  media('generatedP1', '/media/manim/p01/p01-site-survey-map/p01-p01-site-survey-map.webm', 909_355, '2D8DC5EB7790CAFD99CB9B968B99FA8750B27319969C8B20098EB495398A26DA'),
  media('generatedP1', '/media/manim/p01/p01-site-survey-map/poster.png', 84_139, '23C071A513110D612DE0A3D664ABC7C84BB9C7FE83E3FBDF3E19AF26983112AB'),
  media('generatedP1', '/media/5g/image54.jpeg', 10_875, '5FA52B5BEA53D39B190227547DC4B23FDF10967113DEE426A59542D6C5C1BD05'),
  media('generatedP1', '/media/5g/image55.png', 7_608, 'D2DD6D094A9AC128507E40A8C5FD3781343EB6ADAAAAE9A5953AB7FE8B505F5C'),
  media('generatedP1', '/media/5g/image56.png', 13_730, '0F1DF936CBBCC342B829D9880DECE3F9371877A42DCA1657554A4AEE9BAB3235'),
  media('generatedP1', '/media/5g/image57.png', 467_600, 'FF8A1FC9DBA2FC34F873B3776B4B9702157D913AEA6590759B157481C455422D'),
  media('generatedP1', '/media/5g/image58.jpeg', 292_750, 'CD3047E46E3349F1BA46B5143D82F5AF7821E7930F48D691A6D3EA7877B81676'),
  media('generatedP1', '/media/5g/image62.png', 117_709, '9F05916EE248DABE44A90DC51C92AA540D27A30C8E2E2274527A09152C18150E'),
  media('generatedP1', '/media/5g/image65.png', 1_435_995, '09BB129565A177EAB995CACE060F4EE0570E7B5D1AA4786FCC52C99534D76844'),
  media('generatedP1', '/media/manim/p02/p02-outdoor-site-survey/manifest.json', 2_846, '0CFFD33B9A7E4F9BB8970DE48D370C6BE7253708C511E9C76EB7CA1E72BC5712'),
  media('generatedP1', '/media/manim/p02/p02-outdoor-site-survey/p02-p02-outdoor-site-survey.webm', 1_008_922, '2E387863E6D86ED303AABAB23ED68536A30140F748F147C100AC52F65E7262B0'),
  media('generatedP1', '/media/manim/p02/p02-outdoor-site-survey/poster.png', 93_186, '0222D302F8A10D79FAB90349211EF77CF6861D5898024A37BBB8BD70E33C424D'),
  media('generatedP1', '/media/manim/p03/p03-complaint-evidence-loop/manifest.json', 2_898, '51F542F630B7106F04F38234CB0D2765D2755DE4DFF40498A555848C0EE549DE'),
  media('generatedP1', '/media/manim/p03/p03-complaint-evidence-loop/p03-p03-complaint-evidence-loop.webm', 602_034, 'CCE040336B73A6ED7326D52E35BD04772996E6B8D9BDEA4388CB6A514D7CF878'),
  media('generatedP1', '/media/manim/p03/p03-complaint-evidence-loop/poster.png', 113_393, '73B56798160E676211AFE02CF32D18C853EAF06CF2B88B51F4F9A42DEB450181'),
  media('existingTarget', '/media/5g/p01-n02-topology-stage-v1.png', 1_650_087, '86CAA5E66670B8F89C27A9A4FEF0DAA5B15316362BDB72AB491701D52357535E', 'existing-target'),
  media('safeTts', '/media/tts/manifest.json', 411_560, 'DA3A91463BD53641D60FD97A8EAE9D5472E803EAE92BEB1E518E9FBBF38BF01F'),
  media('safeTts', '/media/tts/qwen-cherry/p01-story-speech-006.wav', 572_204, 'B64F85D2D143B25FE28B497255D63589F104CD689613BCFFEA3671838BF0B073'),
  media('safeTts', '/media/tts/qwen-cherry/p01-story-speech-011.wav', 453_164, 'A07786A2AA84D5ED609EDC25F4148C6E64A739DB1D465CCEBA641EAEAC95A28E'),
  media('safeTts', '/media/tts/qwen-cherry/p01-story-speech-012.wav', 422_444, 'A3B83DA00DBD8D87EBC92F1610F8BE71C8A4FEF038D25593E5183C33F76A49EA'),
  media('safeTts', '/media/tts/qwen-cherry/p01-story-speech-014.wav', 364_844, 'D7D7BE41ABAF2A8573DECD5E1025C683692CE6D19FA07D4727F6FC98AD855383'),
  media('safeTts', '/media/tts/qwen-cherry/p01-story-speech-021.wav', 464_684, 'C7DE3CCA97ABB2D48FDB04B4929AC6794CECDBE78E4D679E4298A1688716793D'),
  media('safeTts', '/media/tts/qwen-cherry/p01-story-speech-023.wav', 541_484, '74B3DC39807251CD4B93B3E9081657B4DD498B2F41B93F0A02B2D2C5418F59A3'),
]);

const EXPECTED_GROUP_SUMMARIES = deepFreeze({
  home: { fileCount: 4, totalBytes: 863_881 },
  capabilityMaps: { fileCount: 6, totalBytes: 266_566 },
  generatedP1: { fileCount: 22, totalBytes: 6_616_211 },
  existingTarget: { fileCount: 1, totalBytes: 1_650_087 },
  safeTts: { fileCount: 7, totalBytes: 3_230_384 },
});

const EXPECTED_OLD_TARGET_PATHS = deepFreeze([
  '5g/p01-n02-topology-stage-v1.png',
  'tts/qwen-cherry/p01-story-speech-006.wav',
  'tts/qwen-cherry/p01-story-speech-011.wav',
  'tts/qwen-cherry/p01-story-speech-012.wav',
  'tts/qwen-cherry/p01-story-speech-013.wav',
  'tts/qwen-cherry/p01-story-speech-014.wav',
  'tts/qwen-cherry/p01-story-speech-016.wav',
  'tts/qwen-cherry/p01-story-speech-021.wav',
  'tts/qwen-cherry/p01-story-speech-023.wav',
]);

export const MEDIA_CUTOVER_MANIFEST_SCHEMA = 'dgbook.web-media-cutover-plan/v1';
export const MEDIA_CUTOVER_JOURNAL_SCHEMA = 'dgbook.web-media-cutover-journal/v1';
export const MEDIA_CUTOVER_CURRENT_POINTER_SCHEMA = 'dgbook.web-media-cutover-current/v1';
export const MEDIA_CUTOVER_ARTIFACT_ROOT = 'artifacts/media-cutover';
export const MEDIA_CUTOVER_CURRENT_POINTER_PATH = `${MEDIA_CUTOVER_ARTIFACT_ROOT}/current.json`;
export const MEDIA_CUTOVER_STATES = deepFreeze([
  'planned',
  'staged',
  'verified',
  'switched',
  'postverified',
  'quarantined',
  'rolled_back',
]);

const MEDIA_CUTOVER_TRANSITIONS = deepFreeze({
  planned: ['staged', 'rolled_back'],
  staged: ['verified', 'rolled_back'],
  verified: ['switched', 'rolled_back'],
  switched: ['postverified', 'rolled_back'],
  postverified: ['quarantined', 'rolled_back'],
  quarantined: [],
  rolled_back: [],
});

export async function buildMediaCutoverPlan({
  repositoryRoot,
  releaseId,
  createdAt = new Date().toISOString(),
  reparseDetector = defaultReparseDetector,
}) {
  const root = path.resolve(repositoryRoot);
  validateMediaCutoverReleaseId(releaseId);
  assertNoCaseCollisions(EXPECTED_MEDIA_CLOSURE.map(({ url }) => url));

  const entries = EXPECTED_MEDIA_CLOSURE.map((expected) => {
    const url = normalizeMediaUrl(expected.url);
    const relative = url.slice('/media/'.length);
    const sourcePath = expected.sourceKind === 'existing-target'
      ? `apps/web/public${url}`
      : `site/public${url}`;
    return {
      group: expected.group,
      url,
      sourceKind: expected.sourceKind,
      sourcePath,
      stagingPath: `apps/web/public/media.staging-${releaseId}/${relative}`,
      targetPath: `apps/web/public${url}`,
      bytes: expected.bytes,
      sha256: expected.sha256,
    };
  });
  const sourceAudit = await auditRepositoryRelativeMediaFiles({
    repositoryRoot: root,
    entries,
    pathField: 'sourcePath',
    reparseDetector,
  });
  assert(sourceAudit.passed, `media source audit failed: ${formatIssues(sourceAudit.issues)}`);
  await assertAuthoritativeInputs(root);
  const oldTargetInventory = await resolveTask9OldTargetInventory(root, reparseDetector);

  const summary = {
    fileCount: entries.length,
    totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    groups: groupSummaries(entries),
  };
  assert(summary.fileCount === 40, `media closure file count changed: ${summary.fileCount}`);
  assert(summary.totalBytes === 12_627_129, `media closure byte total changed: ${summary.totalBytes}`);
  assert(JSON.stringify(summary.groups) === JSON.stringify(EXPECTED_GROUP_SUMMARIES), 'media closure group totals changed');

  const unsigned = {
    schema: MEDIA_CUTOVER_MANIFEST_SCHEMA,
    releaseId,
    state: 'planned',
    createdAt,
    manifestPath: mediaCutoverManifestPath(releaseId),
    manifestSha256Path: `${mediaCutoverManifestPath(releaseId)}.sha256`,
    sourceRoot: 'site/public/media',
    existingTargetRoot: 'apps/web/public/media',
    stagingRoot: `apps/web/public/media.staging-${releaseId}`,
    rollbackRoot: `apps/web/public/media.rollback-${releaseId}`,
    targetRoot: 'apps/web/public/media',
    summary,
    entries,
    oldTargetInventory: {
      summary: oldTargetInventory.summary,
      entries: oldTargetInventory.entries,
    },
  };
  return deepFreeze({ ...unsigned, planSha256: sha256Text(canonicalJson(unsigned)) });
}

async function resolveTask9OldTargetInventory(root, reparseDetector) {
  const targetRoot = path.join(root, 'apps', 'web', 'public', 'media');
  const targetInventory = await inventoryMediaTree({ root: targetRoot, reparseDetector });
  if (matchesTask9OldTargetInventory(targetInventory)) return targetInventory;

  try {
    const accepted = await resolveAcceptedMediaCutoverManifest({ repositoryRoot: root });
    const targetAudit = await auditExactMediaTree({ root: targetRoot, entries: accepted.manifest.entries, reparseDetector });
    assert(targetAudit.passed, `accepted media target failed exact-tree audit: ${formatIssues(targetAudit.issues)}`);
    const rollbackRoot = path.resolve(root, ...accepted.manifest.rollbackRoot.split('/'));
    try {
      await lstat(rollbackRoot);
      const rollbackInventory = await inventoryMediaTree({ root: rollbackRoot, reparseDetector });
      assert(rollbackInventory.passed, `old media rollback inventory failed: ${formatIssues(rollbackInventory.issues)}`);
      assert(
        JSON.stringify(rollbackInventory.summary) === JSON.stringify(accepted.manifest.oldTargetInventory.summary)
          && JSON.stringify(rollbackInventory.entries) === JSON.stringify(accepted.manifest.oldTargetInventory.entries),
        'old media rollback inventory changed',
      );
      return rollbackInventory;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }

    const { resolveAcceptedMediaRollbackQuarantineReceipt } = await import('./quarantine-web-media-rollback.mjs');
    const resolved = await resolveAcceptedMediaRollbackQuarantineReceipt({
      repositoryRoot: root,
      reparseDetector,
    });
    assert(resolved.receipt.releaseId === accepted.manifest.releaseId, 'rollback quarantine receipt release mismatch');
    return deepFreeze({
      passed: true,
      summary: { ...resolved.receipt.oldTargetInventory.summary },
      entries: resolved.receipt.oldTargetInventory.entries.map((entry) => ({ ...entry })),
      issues: [],
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`old media target inventory changed and no accepted rollback is valid: ${detail}`);
  }
}

function matchesTask9OldTargetInventory(inventory) {
  if (!inventory.passed || inventory.summary.fileCount !== 9 || inventory.summary.totalBytes !== 5_494_279) return false;
  const actual = inventory.entries.map(({ relativePath }) => relativePath).sort();
  return JSON.stringify(actual) === JSON.stringify([...EXPECTED_OLD_TARGET_PATHS].sort());
}

export function mediaCutoverManifestPath(releaseId) {
  validateMediaCutoverReleaseId(releaseId);
  return `${MEDIA_CUTOVER_ARTIFACT_ROOT}/${releaseId}/media-cutover-manifest.json`;
}

export function mediaCutoverJournalPath(releaseId) {
  validateMediaCutoverReleaseId(releaseId);
  return `${MEDIA_CUTOVER_ARTIFACT_ROOT}/${releaseId}/media-cutover-journal.json`;
}

export function serializeMediaCutoverManifestSha256(manifest) {
  const plan = parseMediaCutoverManifest(manifest);
  return `${plan.planSha256}  media-cutover-manifest.json\n`;
}

export function createMediaCutoverJournal(manifest, { state, updatedAt, stateHistory }) {
  const plan = parseMediaCutoverManifest(manifest);
  assert(Array.isArray(stateHistory) && stateHistory[0] === 'planned', 'media cutover journal must begin at planned');
  for (let index = 1; index < stateHistory.length; index += 1) {
    assertCutoverStateTransition(stateHistory[index - 1], stateHistory[index]);
  }
  assert(stateHistory.at(-1) === state, 'media cutover journal state does not match state history');
  assert(MEDIA_CUTOVER_STATES.includes(state), `invalid media cutover journal state: ${String(state)}`);
  assert(typeof updatedAt === 'string' && !Number.isNaN(Date.parse(updatedAt)), 'invalid media cutover journal timestamp');
  const unsigned = {
    schema: MEDIA_CUTOVER_JOURNAL_SCHEMA,
    releaseId: plan.releaseId,
    planSha256: plan.planSha256,
    manifestPath: plan.manifestPath,
    journalPath: mediaCutoverJournalPath(plan.releaseId),
    state,
    updatedAt,
    stateHistory: [...stateHistory],
  };
  return deepFreeze({ ...unsigned, journalSha256: sha256Text(canonicalJson(unsigned)) });
}

export function parseMediaCutoverJournal(input) {
  const candidate = jsonClone(input, 'media cutover journal');
  assert(candidate.schema === MEDIA_CUTOVER_JOURNAL_SCHEMA, 'invalid media cutover journal schema');
  validateMediaCutoverReleaseId(candidate.releaseId);
  assert(candidate.manifestPath === mediaCutoverManifestPath(candidate.releaseId), 'invalid media cutover journal manifest path');
  assert(candidate.journalPath === mediaCutoverJournalPath(candidate.releaseId), 'invalid media cutover journal path');
  assert(Array.isArray(candidate.stateHistory) && candidate.stateHistory[0] === 'planned', 'media cutover journal must begin at planned');
  for (let index = 1; index < candidate.stateHistory.length; index += 1) {
    assertCutoverStateTransition(candidate.stateHistory[index - 1], candidate.stateHistory[index]);
  }
  assert(candidate.stateHistory.at(-1) === candidate.state, 'media cutover journal state does not match state history');
  assert(typeof candidate.planSha256 === 'string' && /^[A-F0-9]{64}$/.test(candidate.planSha256), 'invalid journal plan SHA-256');
  const { journalSha256, ...unsigned } = candidate;
  assert(typeof journalSha256 === 'string' && /^[A-F0-9]{64}$/.test(journalSha256), 'invalid media cutover journal SHA-256');
  assert(sha256Text(canonicalJson(unsigned)) === journalSha256, 'media cutover journal SHA-256 mismatch');
  return deepFreeze(candidate);
}

export function createMediaCutoverCurrentPointer(manifest, journal, { acceptedAt }) {
  const plan = parseMediaCutoverManifest(manifest);
  const parsedJournal = parseMediaCutoverJournal(journal);
  assert(['postverified', 'quarantined'].includes(parsedJournal.state), 'current media pointer requires a postverified journal');
  assert(parsedJournal.releaseId === plan.releaseId, 'current media pointer release mismatch');
  assert(parsedJournal.planSha256 === plan.planSha256, 'current media pointer plan SHA mismatch');
  assert(typeof acceptedAt === 'string' && !Number.isNaN(Date.parse(acceptedAt)), 'invalid media cutover acceptance timestamp');
  const unsigned = {
    schema: MEDIA_CUTOVER_CURRENT_POINTER_SCHEMA,
    pointerPath: MEDIA_CUTOVER_CURRENT_POINTER_PATH,
    releaseId: plan.releaseId,
    manifestPath: plan.manifestPath,
    manifestSha256Path: plan.manifestSha256Path,
    journalPath: parsedJournal.journalPath,
    planSha256: plan.planSha256,
    acceptedAt,
  };
  return deepFreeze({ ...unsigned, pointerSha256: sha256Text(canonicalJson(unsigned)) });
}

export function parseMediaCutoverCurrentPointer(input) {
  const candidate = jsonClone(input, 'media cutover current pointer');
  assert(candidate.schema === MEDIA_CUTOVER_CURRENT_POINTER_SCHEMA, 'invalid media cutover current pointer schema');
  validateMediaCutoverReleaseId(candidate.releaseId);
  assert(candidate.pointerPath === MEDIA_CUTOVER_CURRENT_POINTER_PATH, 'invalid media cutover current pointer path');
  assert(candidate.manifestPath === mediaCutoverManifestPath(candidate.releaseId), 'invalid current media manifest path');
  assert(candidate.manifestSha256Path === `${candidate.manifestPath}.sha256`, 'invalid current media manifest SHA path');
  assert(candidate.journalPath === mediaCutoverJournalPath(candidate.releaseId), 'invalid current media journal path');
  assert(typeof candidate.planSha256 === 'string' && /^[A-F0-9]{64}$/.test(candidate.planSha256), 'invalid current media plan SHA-256');
  const { pointerSha256, ...unsigned } = candidate;
  assert(typeof pointerSha256 === 'string' && /^[A-F0-9]{64}$/.test(pointerSha256), 'invalid current media pointer SHA-256');
  assert(sha256Text(canonicalJson(unsigned)) === pointerSha256, 'media cutover current pointer SHA-256 mismatch');
  return deepFreeze(candidate);
}

export async function resolveAcceptedMediaCutoverManifest({ repositoryRoot }) {
  const root = path.resolve(repositoryRoot);
  const pointer = parseMediaCutoverCurrentPointer(await readSecureRepositoryFile(root, MEDIA_CUTOVER_CURRENT_POINTER_PATH));
  const manifest = parseMediaCutoverManifest(await readSecureRepositoryFile(root, pointer.manifestPath));
  const sidecar = await readSecureRepositoryFile(root, pointer.manifestSha256Path);
  assert(sidecar === serializeMediaCutoverManifestSha256(manifest), 'media cutover manifest SHA-256 sidecar mismatch');
  const journal = parseMediaCutoverJournal(await readSecureRepositoryFile(root, pointer.journalPath));
  assert(['postverified', 'quarantined'].includes(journal.state), 'accepted media cutover journal is not postverified');
  assert(manifest.releaseId === pointer.releaseId && journal.releaseId === pointer.releaseId, 'accepted media cutover release mismatch');
  assert(manifest.planSha256 === pointer.planSha256 && journal.planSha256 === pointer.planSha256, 'accepted media cutover plan SHA mismatch');
  return deepFreeze({
    pointer,
    manifest,
    journal,
    targetPaths: mediaTargetRelativePaths(manifest),
  });
}

export async function loadMediaCutoverManifest({ repositoryRoot, releaseId }) {
  const root = path.resolve(repositoryRoot);
  const manifestPath = mediaCutoverManifestPath(releaseId);
  const manifest = parseMediaCutoverManifest(await readSecureRepositoryFile(root, manifestPath));
  const sidecar = await readSecureRepositoryFile(root, `${manifestPath}.sha256`);
  assert(sidecar === serializeMediaCutoverManifestSha256(manifest), 'media cutover manifest SHA-256 sidecar mismatch');
  return manifest;
}

export async function loadMediaCutoverJournal({ repositoryRoot, releaseId }) {
  const root = path.resolve(repositoryRoot);
  const journal = parseMediaCutoverJournal(await readSecureRepositoryFile(root, mediaCutoverJournalPath(releaseId)));
  const manifest = await loadMediaCutoverManifest({ repositoryRoot: root, releaseId });
  assert(journal.releaseId === manifest.releaseId && journal.planSha256 === manifest.planSha256, 'media cutover journal does not match immutable manifest');
  return journal;
}

export function assertCutoverStateTransition(from, to) {
  const allowed = MEDIA_CUTOVER_TRANSITIONS[from];
  if (!allowed?.includes(to)) throw new Error(`invalid media cutover state transition: ${String(from)} -> ${String(to)}`);
  return to;
}

export async function executeMediaCutoverTransaction(manifest, operations) {
  const plan = parseMediaCutoverManifest(manifest);
  const requiredOperations = [
    'prepareStaging',
    'stageEntry',
    'verifyStaging',
    'reverifySources',
    'moveTargetToRollback',
    'moveStagingToTarget',
    'postverify',
    'discardStaging',
    'restoreOldTarget',
  ];
  for (const name of requiredOperations) {
    assert(typeof operations?.[name] === 'function', `media cutover operation is required: ${name}`);
  }

  let state = 'planned';
  let phase = 'prepare-staging';
  let oldTargetMoved = false;
  let newTargetInstalled = false;
  const stateHistory = ['planned'];
  try {
    await operations.prepareStaging(plan);
    for (let index = 0; index < plan.entries.length; index += 1) {
      phase = `stage-entry:${index}`;
      await operations.stageEntry(plan.entries[index], index, plan);
    }
    state = assertCutoverStateTransition(state, 'staged');
    stateHistory.push(state);

    phase = 'verify-staging';
    await operations.verifyStaging(plan);
    phase = 'reverify-sources';
    await operations.reverifySources(plan);
    state = assertCutoverStateTransition(state, 'verified');
    stateHistory.push(state);

    phase = 'move-target-to-rollback';
    await operations.moveTargetToRollback(plan);
    oldTargetMoved = true;
    phase = 'move-staging-to-target';
    await operations.moveStagingToTarget(plan);
    newTargetInstalled = true;
    state = assertCutoverStateTransition(state, 'switched');
    stateHistory.push(state);

    phase = 'postverify';
    await operations.postverify(plan);
    state = assertCutoverStateTransition(state, 'postverified');
    stateHistory.push(state);
    return deepFreeze({ state, stateHistory, recovery: 'not-required' });
  } catch (error) {
    const failedAt = phase;
    let recovery;
    try {
      if (oldTargetMoved) {
        await operations.restoreOldTarget(plan, { newTargetInstalled });
        recovery = 'restored-old-target';
      } else {
        await operations.discardStaging(plan);
        recovery = 'discarded-staging';
      }
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        `media cutover recovery failed after ${failedAt}`,
      );
    }
    state = assertCutoverStateTransition(state, 'rolled_back');
    stateHistory.push(state);
    return deepFreeze({
      state,
      stateHistory,
      failedAt,
      recovery,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function parseMediaCutoverManifest(input) {
  let candidate;
  try {
    candidate = typeof input === 'string' ? JSON.parse(input) : JSON.parse(JSON.stringify(input));
  } catch (error) {
    throw new Error(`invalid media cutover manifest JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(candidate && typeof candidate === 'object' && !Array.isArray(candidate), 'invalid media cutover manifest');
  assert(candidate.schema === MEDIA_CUTOVER_MANIFEST_SCHEMA, 'invalid media cutover manifest schema');
  validateMediaCutoverReleaseId(candidate.releaseId);
  assert(candidate.state === 'planned', 'immutable media cutover plan must remain planned');
  assert(candidate.manifestPath === mediaCutoverManifestPath(candidate.releaseId), 'invalid media cutover manifest path');
  assert(candidate.manifestSha256Path === `${candidate.manifestPath}.sha256`, 'invalid media cutover manifest SHA path');
  assert(Array.isArray(candidate.entries), 'media cutover manifest entries are required');
  assert(candidate.entries.length === EXPECTED_MEDIA_CLOSURE.length, `media cutover manifest entry count changed: ${candidate.entries.length}`);

  const expectedByUrl = new Map(EXPECTED_MEDIA_CLOSURE.map((entry) => [entry.url, entry]));
  for (const entry of candidate.entries) {
    const url = normalizeMediaUrl(entry?.url);
    const expected = expectedByUrl.get(url);
    assert(expected, `unexpected media cutover entry: ${url}`);
    assert(entry.group === expected.group, `media cutover group mismatch: ${url}`);
    assert(entry.sourceKind === expected.sourceKind, `media cutover source kind mismatch: ${url}`);
    assert(entry.bytes === expected.bytes, `media cutover byte mismatch: ${url}`);
    assert(entry.sha256 === expected.sha256, `media cutover SHA-256 mismatch: ${url}`);
    const expectedSource = expected.sourceKind === 'existing-target'
      ? `apps/web/public${url}`
      : `site/public${url}`;
    assert(entry.sourcePath === expectedSource, `media cutover sourcePath does not match URL: ${url}`);
    assert(entry.targetPath === `apps/web/public${url}`, `media cutover targetPath does not match URL: ${url}`);
    assert(
      entry.stagingPath === `apps/web/public/media.staging-${candidate.releaseId}/${url.slice('/media/'.length)}`,
      `media cutover stagingPath does not match URL: ${url}`,
    );
  }
  assertNoCaseCollisions(candidate.entries.map(({ url }) => url));
  const recalculatedSummary = {
    fileCount: candidate.entries.length,
    totalBytes: candidate.entries.reduce((total, entry) => total + entry.bytes, 0),
    groups: groupSummaries(candidate.entries),
  };
  assert(JSON.stringify(candidate.summary) === JSON.stringify(recalculatedSummary), 'media cutover manifest summary mismatch');
  assert(candidate.oldTargetInventory && Array.isArray(candidate.oldTargetInventory.entries), 'old media target inventory is required');
  const oldTargetPaths = candidate.oldTargetInventory.entries.map(({ relativePath }) => normalizeRepositoryRelativePath(relativePath));
  assertNoRepositoryCaseCollisions(oldTargetPaths);
  assertSameSet(oldTargetPaths, EXPECTED_OLD_TARGET_PATHS, 'old media target inventory');
  for (const entry of candidate.oldTargetInventory.entries) {
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes > 0, `invalid old target bytes: ${entry.relativePath}`);
    assert(typeof entry.sha256 === 'string' && /^[A-F0-9]{64}$/.test(entry.sha256), `invalid old target SHA-256: ${entry.relativePath}`);
  }
  const oldTargetSummary = {
    fileCount: candidate.oldTargetInventory.entries.length,
    totalBytes: candidate.oldTargetInventory.entries.reduce((total, entry) => total + entry.bytes, 0),
  };
  assert(JSON.stringify(candidate.oldTargetInventory.summary) === JSON.stringify(oldTargetSummary), 'old media target inventory summary mismatch');
  assert(oldTargetSummary.fileCount === 9 && oldTargetSummary.totalBytes === 5_494_279, 'old media target inventory totals changed');

  const { planSha256, ...unsigned } = candidate;
  assert(typeof planSha256 === 'string' && /^[A-F0-9]{64}$/.test(planSha256), 'invalid media cutover plan SHA-256');
  assert(sha256Text(canonicalJson(unsigned)) === planSha256, 'media cutover plan SHA-256 mismatch');
  return deepFreeze(candidate);
}

export function mediaTargetRelativePaths(manifest) {
  const parsed = parseMediaCutoverManifest(manifest);
  return Object.freeze(parsed.entries.map(({ targetPath }) => targetPath));
}

export async function auditPlannedMediaSources({ repositoryRoot, manifest, reparseDetector }) {
  const plan = parseMediaCutoverManifest(manifest);
  return auditRepositoryRelativeMediaFiles({
    repositoryRoot,
    entries: plan.entries,
    pathField: 'sourcePath',
    reparseDetector,
  });
}

export async function auditRepositoryRelativeMediaFiles({
  repositoryRoot,
  entries,
  pathField,
  reparseDetector = defaultReparseDetector,
}) {
  const root = path.resolve(repositoryRoot);
  const issues = [];
  const paths = entries.map((entry) => normalizeRepositoryRelativePath(entry[pathField]));
  assertNoRepositoryCaseCollisions(paths);
  let rootRealPath;
  try {
    const rootStat = await lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || await reparseDetector(root, rootStat)) {
      issues.push({ code: 'unsafe-root-reparse', path: '' });
    } else {
      rootRealPath = await realpath(root);
    }
  } catch (error) {
    issues.push({ code: 'unreadable-root', path: '', detail: error instanceof Error ? error.message : String(error) });
  }
  if (!rootRealPath) {
    return { passed: false, expectedFileCount: entries.length, verifiedFileCount: 0, verifiedTotalBytes: 0, issues };
  }

  let verifiedFileCount = 0;
  let verifiedTotalBytes = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const relativePath = paths[index];
    const beforeIssueCount = issues.length;
    let parent = root;
    const segments = relativePath.split('/');
    try {
      for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
        const segment = segments[segmentIndex];
        const childNames = await readdir(parent);
        if (!childNames.includes(segment)) {
          const caseVariant = childNames.find((name) => name.normalize('NFC').toLowerCase() === segment.normalize('NFC').toLowerCase());
          issues.push({
            code: caseVariant ? 'path-case-mismatch' : 'missing-file',
            path: relativePath,
            ...(caseVariant ? { actualSegment: caseVariant, expectedSegment: segment } : {}),
          });
          break;
        }
        const candidate = path.join(parent, segment);
        const candidateStat = await lstat(candidate);
        if (candidateStat.isSymbolicLink() || await reparseDetector(candidate, candidateStat)) {
          issues.push({ code: 'unsafe-reparse-point', path: relativePath, segment });
          break;
        }
        const resolved = await realpath(candidate);
        if (!isPathInside(rootRealPath, resolved)) {
          issues.push({ code: 'realpath-escape', path: relativePath, segment });
          break;
        }
        const final = segmentIndex === segments.length - 1;
        if (!final && !candidateStat.isDirectory()) {
          issues.push({ code: 'parent-not-directory', path: relativePath, segment });
          break;
        }
        if (final) {
          if (!candidateStat.isFile()) {
            issues.push({ code: 'non-regular-file', path: relativePath });
            break;
          }
          if (candidateStat.size !== entry.bytes) {
            issues.push({ code: 'byte-mismatch', path: relativePath, expected: entry.bytes, actual: candidateStat.size });
          }
          const actualSha256 = await sha256File(candidate);
          if (actualSha256 !== entry.sha256) {
            issues.push({ code: 'sha256-mismatch', path: relativePath, expected: entry.sha256, actual: actualSha256 });
          }
        }
        parent = candidate;
      }
    } catch (error) {
      issues.push({ code: 'file-audit-error', path: relativePath, detail: error instanceof Error ? error.message : String(error) });
    }
    if (issues.length === beforeIssueCount) {
      verifiedFileCount += 1;
      verifiedTotalBytes += entry.bytes;
    }
  }
  return {
    passed: issues.length === 0,
    expectedFileCount: entries.length,
    verifiedFileCount,
    verifiedTotalBytes,
    issues,
  };
}

export async function inventoryMediaTree({ root, reparseDetector = defaultReparseDetector }) {
  const absoluteRoot = path.resolve(root);
  const entries = [];
  const issues = [];
  let rootRealPath;
  try {
    const rootStat = await lstat(absoluteRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || await reparseDetector(absoluteRoot, rootStat)) {
      issues.push({ code: 'unsafe-root-reparse', path: '' });
    } else {
      rootRealPath = await realpath(absoluteRoot);
      await walk(absoluteRoot, '');
    }
  } catch (error) {
    issues.push({ code: 'unreadable-root', path: '', detail: error instanceof Error ? error.message : String(error) });
  }
  entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const collisionKeys = new Map();
  for (const entry of entries) {
    const key = entry.relativePath.normalize('NFC').toLowerCase();
    if (collisionKeys.has(key)) issues.push({ code: 'path-case-collision', path: entry.relativePath, otherPath: collisionKeys.get(key) });
    else collisionKeys.set(key, entry.relativePath);
  }
  return {
    passed: issues.length === 0,
    summary: {
      fileCount: entries.length,
      totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    },
    entries,
    issues,
  };

  async function walk(directory, relativeDirectory) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name;
      const candidate = path.join(directory, child.name);
      const candidateStat = await lstat(candidate);
      if (candidateStat.isSymbolicLink() || await reparseDetector(candidate, candidateStat)) {
        issues.push({ code: 'unsafe-reparse-point', path: relativePath });
        continue;
      }
      const resolved = await realpath(candidate);
      if (!isPathInside(rootRealPath, resolved)) {
        issues.push({ code: 'realpath-escape', path: relativePath });
        continue;
      }
      if (candidateStat.isDirectory()) await walk(candidate, relativePath);
      else if (candidateStat.isFile()) entries.push({
        relativePath,
        bytes: candidateStat.size,
        sha256: await sha256File(candidate),
      });
      else issues.push({ code: 'non-regular-entry', path: relativePath });
    }
  }
}

export async function auditExactMediaTree({
  root,
  entries,
  reparseDetector = async (_candidate, candidateStat) => candidateStat.isSymbolicLink(),
}) {
  const absoluteRoot = path.resolve(root);
  const expected = new Map();
  for (const entry of entries) {
    const url = normalizeMediaUrl(entry.url);
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes >= 0, `invalid expected media bytes: ${url}`);
    assert(typeof entry.sha256 === 'string' && /^[A-F0-9]{64}$/.test(entry.sha256), `invalid expected media SHA-256: ${url}`);
    expected.set(url.slice('/media/'.length), entry);
  }
  assertNoCaseCollisions([...expected.keys()].map((relative) => `/media/${relative}`));

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

  for (const relative of [...expected.keys()].sort()) {
    if (!actual.has(relative)) issues.push({ code: 'missing-file', path: relative });
  }
  for (const relative of [...actual.keys()].sort()) {
    if (!expected.has(relative)) issues.push({ code: 'extra-file', path: relative });
  }
  for (const [relative, expectedEntry] of [...expected.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const actualEntry = actual.get(relative);
    if (!actualEntry) continue;
    if (actualEntry.bytes !== expectedEntry.bytes) {
      issues.push({ code: 'byte-mismatch', path: relative, expected: expectedEntry.bytes, actual: actualEntry.bytes });
    }
    if (actualEntry.sha256 !== expectedEntry.sha256) {
      issues.push({ code: 'sha256-mismatch', path: relative, expected: expectedEntry.sha256, actual: actualEntry.sha256 });
    }
  }

  return {
    passed: issues.length === 0,
    expectedFileCount: expected.size,
    actualFileCount: actual.size,
    actualTotalBytes: [...actual.values()].reduce((total, entry) => total + entry.bytes, 0),
    issues,
  };

  async function walk(directory, relativeDirectory) {
    let children;
    try {
      children = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      issues.push({ code: 'unreadable-root', path: relativeDirectory, detail: error instanceof Error ? error.message : String(error) });
      return;
    }
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      const relative = relativeDirectory ? `${relativeDirectory}/${child.name}` : child.name;
      const absolute = path.join(directory, child.name);
      const childStat = await lstat(absolute);
      const isReparse = childStat.isSymbolicLink() || await reparseDetector(absolute, childStat);
      if (isReparse) {
        issues.push({ code: 'unsafe-reparse-point', path: relative });
        try {
          const resolved = await realpath(absolute);
          if (!isPathInside(rootRealPath, resolved)) issues.push({ code: 'realpath-escape', path: relative });
        } catch (error) {
          issues.push({ code: 'unreadable-reparse-point', path: relative, detail: error instanceof Error ? error.message : String(error) });
        }
        continue;
      }
      const resolved = await realpath(absolute);
      if (!isPathInside(rootRealPath, resolved)) {
        issues.push({ code: 'realpath-escape', path: relative });
        continue;
      }
      if (childStat.isDirectory()) {
        await walk(absolute, relative);
        continue;
      }
      if (!childStat.isFile()) {
        issues.push({ code: 'non-regular-entry', path: relative });
        continue;
      }
      actual.set(relative.split(path.sep).join('/'), {
        bytes: childStat.size,
        sha256: await sha256File(absolute),
      });
    }
  }
}

function isPathInside(rootPath, candidatePath) {
  if (!rootPath) return false;
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function normalizeRepositoryRelativePath(candidate) {
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
    `unsafe repository-relative media path: ${String(candidate)}`,
  );
  return candidate;
}

function assertNoRepositoryCaseCollisions(paths) {
  const seen = new Map();
  for (const relativePath of paths) {
    const key = relativePath.normalize('NFC').toLowerCase();
    const prior = seen.get(key);
    if (prior) throw new Error(`repository media path case collision: ${prior} <> ${relativePath}`);
    seen.set(key, relativePath);
  }
}

async function defaultReparseDetector(_candidate, candidateStat) {
  return candidateStat.isSymbolicLink();
}

function formatIssues(issues) {
  return issues.map(({ code, path: issuePath }) => `${code}:${issuePath}`).join(', ');
}

async function readSecureRepositoryFile(repositoryRoot, relativePath) {
  assert(
    typeof relativePath === 'string'
      && !path.isAbsolute(relativePath)
      && !relativePath.includes('\\')
      && !relativePath.includes('\0')
      && !relativePath.includes('%')
      && path.posix.normalize(relativePath) === relativePath
      && relativePath.split('/').every((segment) => segment && segment !== '.' && segment !== '..'),
    `unsafe media artifact path: ${String(relativePath)}`,
  );
  const rootStat = await lstat(repositoryRoot);
  assert(rootStat.isDirectory() && !rootStat.isSymbolicLink(), 'media artifact repository root is unsafe');
  const rootRealPath = await realpath(repositoryRoot);
  let current = repositoryRoot;
  const segments = relativePath.split('/');
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const currentStat = await lstat(current);
    assert(!currentStat.isSymbolicLink(), `media artifact path contains a reparse point: ${relativePath}`);
    const resolved = await realpath(current);
    assert(isPathInside(rootRealPath, resolved), `media artifact realpath escapes repository: ${relativePath}`);
    if (index < segments.length - 1) assert(currentStat.isDirectory(), `media artifact parent is not a directory: ${relativePath}`);
    else assert(currentStat.isFile(), `media artifact is not a regular file: ${relativePath}`);
  }
  return readFile(current, 'utf8');
}

function jsonClone(input, label) {
  try {
    const candidate = typeof input === 'string' ? JSON.parse(input) : JSON.parse(JSON.stringify(input));
    assert(candidate && typeof candidate === 'object' && !Array.isArray(candidate), `invalid ${label}`);
    return candidate;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('invalid ')) throw error;
    throw new Error(`invalid ${label} JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function assertAuthoritativeInputs(root) {
  const contentPath = path.join(root, 'textbook', '5g', 'generated', 'p1-demo-content.json');
  const content = JSON.parse(await readFile(contentPath, 'utf8'));
  const generatedUrls = deriveGeneratedP1MediaUrls(content);
  assertSameSet(
    generatedUrls,
    EXPECTED_MEDIA_CLOSURE.filter(({ group }) => group === 'generatedP1').map(({ url }) => url),
    'generated P1 mediaRefs',
  );

  await assertFlatDirectoryMatches(root, 'site/public/media/home', 'home');
  await assertFlatDirectoryMatches(root, 'site/public/media/capability-maps', 'capabilityMaps');

  const playback = await readFile(path.join(root, 'apps', 'web', 'src', 'features', 'textbook-scene', 'learning-playback.ts'), 'utf8');
  const safeWavUrls = [...playback.matchAll(/audioId:\s*'([^']+)'/g)]
    .map(([, audioId]) => `/media/tts/qwen-cherry/${audioId.toLowerCase()}.wav`);
  assertSameSet(
    safeWavUrls,
    EXPECTED_MEDIA_CLOSURE.filter(({ group, url }) => group === 'safeTts' && url.endsWith('.wav')).map(({ url }) => url),
    'safe P01 N02 narration URLs',
  );
}

export function deriveGeneratedP1MediaUrls(content) {
  const tasks = Array.isArray(content?.tasks) ? content.tasks : [];
  assert(JSON.stringify(tasks.map(({ taskId }) => taskId)) === JSON.stringify(['P01', 'P02', 'P03']), 'generated P1 task set changed');
  const generatedUrls = tasks.flatMap(({ source }) => Array.isArray(source?.mediaRefs) ? source.mediaRefs : []);
  assert(generatedUrls.length === 22, `generated P1 mediaRefs changed: ${generatedUrls.length}`);
  const normalized = generatedUrls.map(normalizeMediaUrl);
  assert(new Set(normalized).size === normalized.length, 'generated P1 mediaRefs contain duplicates');
  assertNoCaseCollisions(normalized);
  return normalized;
}

async function assertFlatDirectoryMatches(root, relativeDirectory, group) {
  const directory = path.resolve(root, ...relativeDirectory.split('/'));
  const children = await readdir(directory, { withFileTypes: true });
  assert(children.every((child) => child.isFile()), `${relativeDirectory} must contain only regular files`);
  const urls = children.map(({ name }) => `/${relativeDirectory.replace(/^site\/public\//, '')}/${name}`);
  const expected = EXPECTED_MEDIA_CLOSURE.filter((entry) => entry.group === group).map(({ url }) => url);
  assertSameSet(urls, expected, relativeDirectory);
}

function media(group, url, bytes, sha256, sourceKind = 'legacy-site') {
  return { group, url, bytes, sha256, sourceKind };
}

function groupSummaries(entries) {
  return Object.fromEntries(Object.keys(EXPECTED_GROUP_SUMMARIES).map((group) => {
    const members = entries.filter((entry) => entry.group === group);
    return [group, {
      fileCount: members.length,
      totalBytes: members.reduce((total, entry) => total + entry.bytes, 0),
    }];
  }));
}

export function validateMediaCutoverReleaseId(releaseId) {
  assert(typeof releaseId === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(releaseId), 'invalid media cutover releaseId');
  return releaseId;
}

export function normalizeMediaUrl(candidate) {
  const fail = () => {
    throw new Error(`unsafe media URL: ${String(candidate)}`);
  };
  if (typeof candidate !== 'string' || !candidate.startsWith('/media/')) fail();
  if (candidate.startsWith('//') || candidate.includes('\\') || candidate.includes('\0')) fail();
  if (candidate.includes('%') || candidate.includes('?') || candidate.includes('#') || candidate.includes(':')) fail();
  if (/[\u0000-\u001F\u007F]/u.test(candidate)) fail();
  if (path.posix.normalize(candidate) !== candidate) fail();
  const segments = candidate.slice(1).split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) fail();
  return candidate;
}

export function assertNoCaseCollisions(urls) {
  const seen = new Map();
  for (const value of urls) {
    const normalized = normalizeMediaUrl(value);
    const collisionKey = normalized.normalize('NFC').toLowerCase();
    const prior = seen.get(collisionKey);
    if (prior) throw new Error(`media URL case collision: ${prior} <> ${normalized}`);
    seen.set(collisionKey, normalized);
  }
  return true;
}

function assertSameSet(actual, expected, label) {
  const left = [...actual].sort();
  const right = [...expected].sort();
  assert(JSON.stringify(left) === JSON.stringify(right), `${label} changed`);
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex').toUpperCase();
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

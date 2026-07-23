import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

export const WEB_RUNTIME_MEDIA_ROOT = 'apps/web/public/media';

const runtimeMediaEntries = deepFreeze([
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
  media('existingTarget', '/media/5g/p01-n02-topology-stage-v1.png', 1_650_087, '86CAA5E66670B8F89C27A9A4FEF0DAA5B15316362BDB72AB491701D52357535E'),
  media('safeTts', '/media/tts/manifest.json', 411_560, 'DA3A91463BD53641D60FD97A8EAE9D5472E803EAE92BEB1E518E9FBBF38BF01F'),
  media('safeTts', '/media/tts/qwen-cherry/p01-story-speech-006.wav', 572_204, 'B64F85D2D143B25FE28B497255D63589F104CD689613BCFFEA3671838BF0B073'),
  media('safeTts', '/media/tts/qwen-cherry/p01-story-speech-011.wav', 453_164, 'A07786A2AA84D5ED609EDC25F4148C6E64A739DB1D465CCEBA641EAEAC95A28E'),
  media('safeTts', '/media/tts/qwen-cherry/p01-story-speech-012.wav', 422_444, 'A3B83DA00DBD8D87EBC92F1610F8BE71C8A4FEF038D25593E5183C33F76A49EA'),
  media('safeTts', '/media/tts/qwen-cherry/p01-story-speech-014.wav', 364_844, 'D7D7BE41ABAF2A8573DECD5E1025C683692CE6D19FA07D4727F6FC98AD855383'),
  media('safeTts', '/media/tts/qwen-cherry/p01-story-speech-021.wav', 464_684, 'C7DE3CCA97ABB2D48FDB04B4929AC6794CECDBE78E4D679E4298A1688716793D'),
  media('safeTts', '/media/tts/qwen-cherry/p01-story-speech-023.wav', 541_484, '74B3DC39807251CD4B93B3E9081657B4DD498B2F41B93F0A02B2D2C5418F59A3'),
]);

export function buildWebRuntimeMediaContract() {
  const entries = runtimeMediaEntries.map((entry) => Object.freeze({
    ...entry,
    targetPath: `${WEB_RUNTIME_MEDIA_ROOT}/${entry.url.slice('/media/'.length)}`,
  }));
  const contractPayload = entries
    .map(({ targetPath, bytes, sha256 }) => ({ targetPath, bytes, sha256 }))
    .sort((left, right) => left.targetPath.localeCompare(right.targetPath));
  return deepFreeze({
    schema: 'dgbook.web-runtime-media-contract/v1',
    contractId: 'tracked-runtime-media-v1',
    contractSha256: sha256Text(canonicalJson(contractPayload)),
    summary: {
      fileCount: entries.length,
      totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    },
    entries,
  });
}

export async function verifyWebRuntimeMedia({
  repositoryRoot,
  reparseDetector = (_candidate, candidateStat) => candidateStat.isSymbolicLink(),
} = {}) {
  const root = path.resolve(repositoryRoot);
  const contract = buildWebRuntimeMediaContract();
  const targetAudit = await auditExactRuntimeMediaTree({
    root: path.join(root, ...WEB_RUNTIME_MEDIA_ROOT.split('/')),
    entries: contract.entries,
    reparseDetector,
  });
  if (!targetAudit.passed) {
    throw new Error(`web runtime media target failed exact-tree audit: ${formatIssues(targetAudit.issues)}`);
  }
  return deepFreeze({
    contract,
    targetAudit,
    targetPaths: contract.entries.map(({ targetPath }) => targetPath),
  });
}

export async function auditExactRuntimeMediaTree({ root, entries, reparseDetector }) {
  const absoluteRoot = path.resolve(root);
  const expected = new Map();
  for (const entry of entries) {
    const targetPath = normalizeTargetPath(entry.targetPath);
    const relativePath = targetPath.slice(`${WEB_RUNTIME_MEDIA_ROOT}/`.length);
    assert(!expected.has(relativePath), `duplicate runtime media target: ${relativePath}`);
    assert(Number.isSafeInteger(entry.bytes) && entry.bytes > 0, `invalid runtime media bytes: ${relativePath}`);
    assert(/^[A-F0-9]{64}$/u.test(entry.sha256), `invalid runtime media SHA-256: ${relativePath}`);
    expected.set(relativePath, entry);
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

  for (const relativePath of [...expected.keys()].sort()) {
    if (!actual.has(relativePath)) issues.push({ code: 'missing-file', path: relativePath });
  }
  for (const relativePath of [...actual.keys()].sort()) {
    if (!expected.has(relativePath)) issues.push({ code: 'extra-file', path: relativePath });
  }
  for (const [relativePath, expectedEntry] of [...expected.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const actualEntry = actual.get(relativePath);
    if (!actualEntry) continue;
    if (actualEntry.bytes !== expectedEntry.bytes) {
      issues.push({ code: 'byte-mismatch', path: relativePath, expected: expectedEntry.bytes, actual: actualEntry.bytes });
    }
    if (actualEntry.sha256 !== expectedEntry.sha256) {
      issues.push({ code: 'sha256-mismatch', path: relativePath, expected: expectedEntry.sha256, actual: actualEntry.sha256 });
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
        if (childStat.isDirectory()) await walk(absolutePath, relativePath);
        else if (childStat.isFile()) actual.set(relativePath.split(path.sep).join('/'), {
          bytes: childStat.size,
          sha256: sha256Buffer(await readFile(absolutePath)),
        });
        else issues.push({ code: 'non-regular-entry', path: relativePath });
      } catch (error) {
        issues.push({ code: 'unreadable-entry', path: relativePath, detail: error instanceof Error ? error.message : String(error) });
      }
    }
  }
}

function media(group, url, bytes, sha256) {
  return { group, url, bytes, sha256 };
}

function normalizeTargetPath(candidate) {
  assert(
    typeof candidate === 'string'
      && candidate.startsWith(`${WEB_RUNTIME_MEDIA_ROOT}/`)
      && !path.isAbsolute(candidate)
      && !path.win32.isAbsolute(candidate)
      && !candidate.includes('\\')
      && !candidate.includes('\0')
      && path.posix.normalize(candidate) === candidate,
    `unsafe runtime media target: ${String(candidate)}`,
  );
  return candidate;
}

function isPathInside(rootPath, candidatePath) {
  if (!rootPath) return false;
  const relative = path.relative(rootPath, candidatePath);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return sha256Buffer(Buffer.from(value, 'utf8'));
}

function sha256Buffer(value) {
  return createHash('sha256').update(value).digest('hex').toUpperCase();
}

function formatIssues(issues) {
  return issues.map(({ code, path: issuePath }) => `${code}:${issuePath}`).join(', ');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

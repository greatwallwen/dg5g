import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WorkspacePolicyError,
  classifyWorkspacePath,
  classifyWorkspacePaths,
  normalizeWorkspacePath,
} from './active-workspace-policy.mjs';

test('protects authoritative paths and unknown paths by default', () => {
  const authoritativePaths = [
    'content/5g/5g.docx',
    'textbook/5g/generated/p1-demo-content.json',
    'scripts/import-5g-docx.py',
    'scripts/import_5g/parser.py',
    'packages/shared/src/index.ts',
    'apps/web/database/migrations/001_initial.sql',
    'apps/web/.data/dgbook-demo.sqlite',
    'apps/web/public/media/5g/image2.jpeg',
    'apps/web/public/media.staging-task9/5g/image2.jpeg',
    'apps/web/public/media.rollback-task9/5g/image2.jpeg',
    'apps/web/public/media.quarantine-task9/5g/image2.jpeg',
    'site/public/media/5g/image2.jpeg',
    'artifacts/media-cutover/release/manifest.json',
    'runtime/tts/voices.json',
    'runtime/voice-profiles/default.json',
    'runtime/vendor-research/source.md',
    '.pnpm-store/v3/files/example',
    '.playwright-cli/session.json',
    'apps/web/node_modules/react/index.js',
  ];

  for (const path of authoritativePaths) {
    const result = classifyWorkspacePath(path);
    assert.equal(result.disposition, 'protected', path);
    assert.equal(result.path, path.replaceAll('\\', '/'), path);
    assert.match(result.reason, /^authoritative:/, path);
  }

  assert.deepEqual(classifyWorkspacePath('docs/notes.md'), {
    path: 'docs/notes.md',
    disposition: 'protected',
    reason: 'unknown-default',
  });
});

test('marks only explicit regenerable cache and staging paths as removable', () => {
  const removablePaths = [
    'apps/web/.next',
    'apps/web/.next/cache/webpack/client-development/0.pack.gz',
    'scripts/__pycache__',
    'scripts/__pycache__/import-5g-docx.cpython-312.pyc',
    'scripts/import_5g/__pycache__/parser.cpython-312.pyc',
    'scripts/tools/temporary.pyc',
    'artifacts/web-source-release/dgbook-web-source',
    'artifacts/web-source-release/dgbook-web-source/apps/web/package.json',
  ];

  for (const path of removablePaths) {
    const result = classifyWorkspacePath(path);
    assert.equal(result.disposition, 'removable', path);
    assert.match(result.reason, /^regenerable:/, path);
  }

  for (const path of [
    '.pnpm-store/v3/files/example',
    '.playwright-cli/session.json',
    'runtime/tts/cache/voice.wav',
    'apps/web/node_modules/.cache/tool/result.json',
    'artifacts/web-source-release/dgbook-web-source.zip',
  ]) {
    assert.equal(classifyWorkspacePath(path).disposition, 'protected', path);
  }
});

test('protects active and unknown evidence while allowing explicit superseded evidence', () => {
  const evidencePath = 'output/playwright/task8-final6/report.json';

  for (const evidenceRole of ['current', 'previous', 'final', 'unknown']) {
    const result = classifyWorkspacePath(evidencePath, { evidenceRole });
    assert.equal(result.disposition, 'protected', evidenceRole);
    assert.equal(result.reason, `evidence:${evidenceRole}`, evidenceRole);
  }

  assert.deepEqual(classifyWorkspacePath(evidencePath), {
    path: evidencePath,
    disposition: 'protected',
    reason: 'evidence:unknown',
  });

  assert.deepEqual(classifyWorkspacePath(evidencePath, { evidenceRole: 'superseded' }), {
    path: evidencePath,
    disposition: 'removable',
    reason: 'superseded-evidence:playwright-output',
  });

  assert.equal(
    classifyWorkspacePath('output/playwright', { evidenceRole: 'superseded' }).disposition,
    'protected',
  );

  assert.deepEqual(classifyWorkspacePath('apps/web/.next/cache/current.json', { evidenceRole: 'current' }), {
    path: 'apps/web/.next/cache/current.json',
    disposition: 'protected',
    reason: 'evidence:current',
  });

  assert.equal(
    classifyWorkspacePath('content/5g/5g.docx', { evidenceRole: 'superseded' }).disposition,
    'protected',
  );
  assert.equal(
    classifyWorkspacePath('docs/notes.md', { evidenceRole: 'superseded' }).disposition,
    'protected',
  );
});

test('allows only an exact superseded source-release history root', () => {
  const releaseRoot =
    'artifacts/web-source-release-history/s2-p1-content-portfolio-fix2-20260715T162252Z';

  assert.deepEqual(classifyWorkspacePath(releaseRoot, { evidenceRole: 'superseded' }), {
    path: releaseRoot,
    disposition: 'removable',
    reason: 'superseded-evidence:web-source-release-history',
  });

  for (const candidate of [
    releaseRoot,
    `${releaseRoot}/dgbook-web-source.tar.gz`,
    'artifacts/web-source-release-history',
  ]) {
    assert.equal(classifyWorkspacePath(candidate).disposition, 'protected', candidate);
  }

  assert.equal(
    classifyWorkspacePath(`${releaseRoot}/dgbook-web-source.tar.gz`, {
      evidenceRole: 'superseded',
    }).disposition,
    'protected',
  );
});

test('rejects unsafe Windows path spellings and normalizes ordinary separators', () => {
  assert.equal(normalizeWorkspacePath('apps\\web\\.next\\cache'), 'apps/web/.next/cache');

  const unsafePaths = [
    null,
    '',
    '   ',
    '/absolute/path',
    '\\rooted-on-current-drive',
    'C:\\absolute\\path',
    'C:/absolute/path',
    'C:drive-relative',
    '\\\\server\\share\\file',
    '//server/share/file',
    '\\\\?\\C:\\device-path',
    '\\\\.\\PIPE\\device-path',
    'output/file.txt:stream',
    'output/../content',
    'output/./file',
    'output/trailing.',
    'output/trailing ',
    'output/CON.txt',
    'output/com1.log',
    'output/LPT9',
    'output//file',
    'output/',
    'output/file\0name',
    'output/file\u001fname',
    'output/%2e%2e/content',
  ];

  for (const path of unsafePaths) {
    assert.throws(
      () => normalizeWorkspacePath(path),
      (error) =>
        error instanceof WorkspacePolicyError &&
        error.code === 'UNSAFE_PATH' &&
        typeof error.message === 'string',
      String(path),
    );
  }
});

test('rejects candidates with reparse-point metadata before classifying them', () => {
  for (const metadata of [
    { isReparsePoint: true },
    { hasReparseAncestor: true },
    { isReparsePoint: true, evidenceRole: 'superseded' },
  ]) {
    assert.throws(
      () => classifyWorkspacePath('apps/web/.next/cache/file.bin', metadata),
      (error) =>
        error instanceof WorkspacePolicyError &&
        error.code === 'REPARSE_POINT' &&
        error.details?.path === 'apps/web/.next/cache/file.bin',
    );
  }
});

test('batch classification rejects duplicate and case-colliding Windows paths', () => {
  assert.throws(
    () => classifyWorkspacePaths([{ path: 'output/run' }, { path: 'output\\run' }]),
    (error) =>
      error instanceof WorkspacePolicyError &&
      error.code === 'DUPLICATE_PATH' &&
      error.details?.path === 'output/run',
  );

  assert.throws(
    () => classifyWorkspacePaths([{ path: 'output/Foo/report.json' }, { path: 'output/foo/report.json' }]),
    (error) =>
      error instanceof WorkspacePolicyError &&
      error.code === 'CASE_COLLISION' &&
      error.details?.conflictingPath === 'output/Foo/report.json' &&
      error.details?.path === 'output/foo/report.json',
  );

  assert.deepEqual(
    classifyWorkspacePaths([
      { path: 'apps/web/.next/cache/file.bin' },
      { path: 'output/playwright/old-run/report.json', evidenceRole: 'superseded' },
      { path: 'content/5g/5g.docx' },
    ]).map(({ disposition }) => disposition),
    ['removable', 'removable', 'protected'],
  );
});

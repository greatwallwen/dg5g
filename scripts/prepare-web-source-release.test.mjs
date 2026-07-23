import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import * as sourcePackager from './prepare-web-source-release.mjs';
import { verifyWebRuntimeMedia } from './web-runtime-media-contract.mjs';
import { REQUIRED_WEB_SOURCE_RUNTIME_FILES } from './web-source-release-policy.mjs';

test('source package validation accepts regular files and rejects selected symbolic links', async () => {
  assert.equal(typeof sourcePackager.assertRegularSourceFile, 'function');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dgbook-source-boundary-'));
  const regularFile = path.join(directory, 'regular.txt');
  const externalDirectory = path.join(directory, 'outside-workspace');
  const selectedLink = path.join(directory, 'selected-link');

  try {
    await writeFile(regularFile, 'safe source\n', 'utf8');
    await mkdir(externalDirectory);
    await symlink(externalDirectory, selectedLink, process.platform === 'win32' ? 'junction' : 'dir');

    const regular = await sourcePackager.assertRegularSourceFile(regularFile);
    assert.equal(regular.isFile(), true);
    await assert.rejects(
      () => sourcePackager.assertRegularSourceFile(selectedLink),
      /symbolic links are not allowed in the web source release/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('selected source secret scan rejects private-key material without echoing it', async () => {
  assert.equal(typeof sourcePackager.assertNoWebSourceSecrets, 'function');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dgbook-source-secret-scan-'));
  const safeFile = 'src/safe.ts';
  const secretFile = 'src/leaked-key.txt';
  const privateKeyMaterial = '-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----\n';

  try {
    await mkdir(path.join(directory, 'src'), { recursive: true });
    await writeFile(path.join(directory, safeFile), 'export const safe = true;\n', 'utf8');
    await writeFile(path.join(directory, secretFile), privateKeyMaterial, 'utf8');

    await assert.doesNotReject(() => sourcePackager.assertNoWebSourceSecrets({
      rootDirectory: directory,
      files: [safeFile],
    }));
    await assert.rejects(
      () => sourcePackager.assertNoWebSourceSecrets({
        rootDirectory: directory,
        files: [safeFile, secretFile],
      }),
      (error) => {
        assert.match(error.message, /private key header/i);
        assert.match(error.message, /src\/leaked-key\.txt/u);
        assert.equal(error.message.includes(privateKeyMaterial), false);
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('selected source secret scan rejects AWS access-key identifiers', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dgbook-source-aws-scan-'));
  const secretFile = 'src/cloud-config.txt';
  const accessKey = 'AKIA1234567890ABCDEF';

  try {
    await mkdir(path.join(directory, 'src'), { recursive: true });
    await writeFile(path.join(directory, secretFile), `AWS_ACCESS_KEY_ID=${accessKey}\n`, 'utf8');
    await assert.rejects(
      () => sourcePackager.assertNoWebSourceSecrets({
        rootDirectory: directory,
        files: [secretFile],
      }),
      (error) => {
        assert.match(error.message, /aws access key/i);
        assert.equal(error.message.includes(accessKey), false);
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('selected source secret scan rejects URLs containing passwords', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dgbook-source-url-scan-'));
  const secretFile = 'src/runtime-config.txt';
  const credentialUrl = 'postgres://release-user:super-secret@example.invalid/dgbook';

  try {
    await mkdir(path.join(directory, 'src'), { recursive: true });
    await writeFile(path.join(directory, secretFile), `DATABASE_URL=${credentialUrl}\n`, 'utf8');
    await assert.rejects(
      () => sourcePackager.assertNoWebSourceSecrets({
        rootDirectory: directory,
        files: [secretFile],
      }),
      (error) => {
        assert.match(error.message, /url containing a password/i);
        assert.equal(error.message.includes(credentialUrl), false);
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('staging-directory secret scan inspects every nested regular file', async () => {
  assert.equal(typeof sourcePackager.assertNoWebSourceSecretsInDirectory, 'function');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dgbook-stage-secret-scan-'));
  const secretFile = path.join('unexpected', 'cloud.txt');

  try {
    await mkdir(path.join(directory, 'expected'), { recursive: true });
    await mkdir(path.join(directory, 'unexpected'), { recursive: true });
    await writeFile(path.join(directory, 'expected', 'safe.ts'), 'export const safe = true;\n', 'utf8');
    await writeFile(path.join(directory, secretFile), 'AWS_ACCESS_KEY_ID=ASIA1234567890ABCDEF\n', 'utf8');

    await assert.rejects(
      () => sourcePackager.assertNoWebSourceSecretsInDirectory(directory),
      (error) => {
        assert.match(error.message, /aws access key/i);
        assert.match(error.message, /unexpected\/cloud\.txt/u);
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('collects source files without Git from controlled roots and excludes generated or transient files', async () => {
  assert.equal(typeof sourcePackager.collectWebSourceFiles, 'function');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dgbook-source-enumeration-'));
  const files = {
    included: [
      '.node-version',
      'package.json',
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'apps/web/src/app/page.tsx',
      'apps/web/src/platform/auth/credentials.ts',
      'packages/widgets/src/index.ts',
      ...REQUIRED_WEB_SOURCE_RUNTIME_FILES,
    ],
    excluded: [
      'apps/web/node_modules/vendor/index.js',
      'apps/web/.next/server/app.js',
      'apps/web/.next-task8-final/server/app.js',
      'apps/web/output/browser-report.json',
      'apps/web/artifacts/archive.tar.gz',
      'apps/web/coverage/coverage-final.json',
      'apps/web/.data/dgbook.sqlite',
      'apps/web/.data/runtime-metadata.json',
      'apps/web/src/page.tsx.tmp',
      'apps/web/src/debug.log',
      'apps/web/.git/config',
      'apps/web/src/.ssh/config',
      'apps/web/src/.aws/credentials',
      'apps/web/config/service-account.json',
      'apps/web/config/deploy-token.txt',
      'apps/web/src/fixtures/source-backup.tar.gz',
      'apps/web/public/media.staging/tts/unaccepted.wav',
      'artifacts/web-source-release/archive.tar.gz',
      'output/playwright/login.png',
      'scripts/private-release-helper.mjs',
    ],
  };

  try {
    for (const file of [...files.included, ...files.excluded]) {
      const absolute = path.join(directory, file);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, `fixture: ${file}\n`, 'utf8');
    }

    const selected = await sourcePackager.collectWebSourceFiles({ repositoryRoot: directory });
    assert.deepEqual(selected, [...files.included].sort());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('controlled source enumeration fails closed on a selected symbolic link', async () => {
  assert.equal(typeof sourcePackager.collectWebSourceFiles, 'function');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dgbook-source-symlink-'));
  const externalDirectory = await mkdtemp(path.join(os.tmpdir(), 'dgbook-source-outside-'));
  const selectedLink = path.join(directory, 'apps', 'web', 'src', 'linked');

  try {
    await mkdir(path.dirname(selectedLink), { recursive: true });
    await writeFile(path.join(externalDirectory, 'outside.ts'), 'export const outside = true;\n', 'utf8');
    await symlink(externalDirectory, selectedLink, process.platform === 'win32' ? 'junction' : 'dir');

    await assert.rejects(
      () => sourcePackager.collectWebSourceFiles({ repositoryRoot: directory }),
      /symbolic links are not allowed in the web source release/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(externalDirectory, { recursive: true, force: true });
  }
});

test('source package audit fails closed when any authoritative runtime file is absent', () => {
  assert.equal(typeof sourcePackager.assertRequiredWebSourceFiles, 'function');
  assert.doesNotThrow(() => sourcePackager.assertRequiredWebSourceFiles([
    ...REQUIRED_WEB_SOURCE_RUNTIME_FILES,
    'apps/web/package.json',
  ]));
  for (const missing of REQUIRED_WEB_SOURCE_RUNTIME_FILES) {
    assert.throws(
      () => sourcePackager.assertRequiredWebSourceFiles(
        REQUIRED_WEB_SOURCE_RUNTIME_FILES.filter((file) => file !== missing),
      ),
      new RegExp(`required web runtime source files are missing: ${missing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    );
  }
});

test('source archive media files must exactly equal the tracked 40-file runtime contract', async () => {
  assert.equal(typeof sourcePackager.assertExactWebMediaFiles, 'function');
  const repositoryRoot = path.resolve(import.meta.dirname, '..');
  const verified = await verifyWebRuntimeMedia({ repositoryRoot });
  const { contract, targetPaths: expected } = verified;
  const sourceFiles = ['package.json', 'apps/web/src/app/page.tsx', ...expected];

  assert.doesNotThrow(() => sourcePackager.assertExactWebMediaFiles(sourceFiles, contract));
  assert.throws(
    () => sourcePackager.assertExactWebMediaFiles(sourceFiles.filter((file) => file !== expected[0]), contract),
    /media exact-set mismatch.*missing/i,
  );
  assert.throws(
    () => sourcePackager.assertExactWebMediaFiles([...sourceFiles, 'apps/web/public/media/tts/unapproved.wav'], contract),
    /media exact-set mismatch.*extra/i,
  );
  assert.throws(
    () => sourcePackager.assertExactWebMediaFiles([...sourceFiles, expected[0].toUpperCase()], contract),
    /media exact-set mismatch.*extra/i,
  );
});

test('source release verifies the tracked runtime media contract before copying files', async () => {
  const source = await readFile(new URL('./prepare-web-source-release.mjs', import.meta.url), 'utf8');
  const resolveAccepted = source.indexOf('verifyWebRuntimeMedia({ repositoryRoot: rootDir })');
  const exactSet = source.indexOf('assertExactWebMediaFiles(files, runtimeMedia.contract)');
  const clearPackage = source.indexOf('await rm(packageDir');
  assert.ok(resolveAccepted >= 0);
  assert.ok(exactSet > resolveAccepted);
  assert.ok(clearPackage > exactSet, 'accepted media exact-set must be checked before package mutation');
  assert.doesNotMatch(source, /web-media-cutover-plan\.mjs/);
  assert.match(source, /runtimeMedia:\s*\{[\s\S]*?contractId:[\s\S]*?contractSha256:[\s\S]*?fileCount:[\s\S]*?totalBytes:/);
});

test('source release scans selected source and the complete staging directory before archiving', async () => {
  const source = await readFile(new URL('./prepare-web-source-release.mjs', import.meta.url), 'utf8');
  const exactSet = source.indexOf('assertExactWebMediaFiles(files, runtimeMedia.contract)');
  const selectedScan = source.indexOf('await assertNoWebSourceSecrets({ rootDirectory: rootDir, files })');
  const clearPackage = source.indexOf('await rm(packageDir');
  const writeStageManifest = source.indexOf("await writeFile(path.join(packageDir, 'deploy-source-manifest.json')");
  const stagedScan = source.indexOf('await assertNoWebSourceSecretsInDirectory(packageDir)');
  const createArchive = source.indexOf("run('archive web source release'");

  assert.ok(selectedScan > exactSet, 'selected source scan must follow authoritative file selection');
  assert.ok(clearPackage > selectedScan, 'selected source scan must finish before package mutation');
  assert.ok(stagedScan > writeStageManifest, 'staging scan must include the generated package manifest');
  assert.ok(createArchive > stagedScan, 'the complete staging directory must be scanned before tar creation');
});

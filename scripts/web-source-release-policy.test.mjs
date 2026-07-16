import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  MAX_WEB_SOURCE_RELEASE_BYTES,
  REQUIRED_WEB_SOURCE_RUNTIME_FILES,
  shouldPackageWebSourceFile,
} from './web-source-release-policy.mjs';

const p1RuntimeFiles = [
  'textbook/5g/generated/p1-demo-content.json',
  'textbook/5g/generated/lesson-ast/P01.json',
  'textbook/5g/generated/lesson-ast/P02.json',
  'textbook/5g/generated/lesson-ast/P03.json',
];

test('packages only the single web media target and rejects every legacy or transient media root', () => {
  const policySource = readFileSync('scripts/web-source-release-policy.mjs', 'utf8');
  assert.equal(policySource.includes('site/public/media'), false, 'legacy media root must not remain in the active source-release closure');
  for (const file of [
    'apps/web/public/media/tts/manifest.json',
    'apps/web/public/media/tts/qwen-cherry/p01-story-speech-006.wav',
    'apps/web/public/media/tts/qwen-cherry/p02-story-speech-001.wav',
    'apps/web/public/media/tts/qwen-cherry/p03-story-speech-001.wav',
    'apps/web/public/media/manim/p03-complaint-timeline.png',
  ]) assert.equal(shouldPackageWebSourceFile(file), true, file);

  for (const file of [
    'site/public/media/tts/manifest.json',
    'site/public/media/home/student-home.png',
    'site/public/media/capability-maps/p1.svg',
    'apps/web/public/media.staging/tts/manifest.json',
    'apps/web/public/media.staging-task9/tts/manifest.json',
    'apps/web/public/media.rollback/tts/manifest.json',
    'apps/web/public/media.rollback-task9/tts/manifest.json',
    'apps/web/public/media.quarantine/tts/manifest.json',
    'apps/web/public/media.quarantine-task9/tts/manifest.json',
    'apps/web/public/media.failed-task9/tts/manifest.json',
    'apps/web/public/.media-staging/tts/manifest.json',
  ]) assert.equal(shouldPackageWebSourceFile(file), false, file);
});

test('keeps runtime source roots and rejects reproducible output', () => {
  assert.equal(shouldPackageWebSourceFile('apps/web/src/app/page.tsx'), true);
  assert.equal(shouldPackageWebSourceFile('package.json'), true);
  for (const file of [
    'apps/web/node_modules/vendor/index.js',
    'apps/web/.next/server/app.js',
    'apps/web/.next-task8-final/server/app.js',
    'apps/web/output/browser-report.json',
    'apps/web/artifacts/archive.tar.gz',
    'apps/web/coverage/coverage-final.json',
    'apps/web/src/page.tsx.tmp',
    'apps/web/src/debug.log',
    'apps/web/.data/runtime-metadata.json',
    'packages/widgets/dist/index.js',
  ]) assert.equal(shouldPackageWebSourceFile(file), false, file);
  assert.equal(MAX_WEB_SOURCE_RELEASE_BYTES, 256 * 1024 * 1024);
});

test('packages exactly the four authoritative P1 runtime content files and traces each one', () => {
  assert.deepEqual(REQUIRED_WEB_SOURCE_RUNTIME_FILES, p1RuntimeFiles);
  for (const file of p1RuntimeFiles) assert.equal(shouldPackageWebSourceFile(file), true, file);
  for (const file of [
    'textbook/5g/generated/lesson-ast/P04.json',
    'textbook/5g/generated/p1-demo-content.backup.json',
    'textbook/5g/widgets/P01-lesson-animation-001.json',
    'content/5g/5g.docx',
  ]) assert.equal(shouldPackageWebSourceFile(file), false, file);

  const nextConfig = readFileSync('apps/web/next.config.mjs', 'utf8');
  assert.match(nextConfig, /outputFileTracingRoot:\s*repositoryRoot/);
  for (const file of p1RuntimeFiles) {
    const relativeToWeb = `../../${file}`;
    assert.equal(
      nextConfig.includes(`'${relativeToWeb}'`),
      true,
      `${relativeToWeb} must be an explicit standalone trace include`,
    );
  }
});

test('rejects secrets and persistent SQLite files even when Git would otherwise select them', () => {
  for (const file of [
    'apps/web/.env',
    'apps/web/.env.production.local',
    'apps/web/.npmrc',
    'apps/web/config/deploy.key',
    'apps/web/config/deploy.pem',
    'apps/web/config/deploy.p12',
    'apps/web/config/id_rsa',
    'apps/web/.data/dgbook.sqlite',
    'apps/web/.data/dgbook.sqlite-wal',
    'apps/web/.data/dgbook.sqlite-shm',
    'apps/web/.data/dgbook.sqlite-journal',
    'apps/web/.data/dgbook.sqlite3',
    'apps/web/.data/dgbook.sqlite3-wal',
    'apps/web/.data/dgbook.sqlite3-shm',
    'apps/web/.data/dgbook.sqlite3-journal',
  ]) {
    assert.equal(shouldPackageWebSourceFile(file), false, file);
  }
});

test('rejects hidden paths, credential payload names, and nested archives inside source roots', () => {
  for (const file of [
    'apps/web/.git/config',
    'apps/web/src/.ssh/config',
    'apps/web/src/.aws/credentials',
    'apps/web/src/.azure/accessTokens.json',
    'apps/web/src/.gnupg/private-keys-v1.d/key',
    'packages/shared/.cache/generated.json',
    'apps/web/config/credentials.json',
    'apps/web/config/credentials',
    'apps/web/config/google-credentials.yaml',
    'apps/web/config/service-account.json',
    'apps/web/config/service-account-key',
    'apps/web/config/service_account-key.yml',
    'apps/web/config/deploy-token.txt',
    'apps/web/config/deploy-token',
    'apps/web/config/deploy_token.toml',
    'apps/web/src/fixtures/backup.zip',
    'apps/web/src/fixtures/source.tar.gz',
    'packages/widgets/test-data/recording.7z',
  ]) {
    assert.equal(shouldPackageWebSourceFile(file), false, file);
  }

  assert.equal(shouldPackageWebSourceFile('.node-version'), true);
  assert.equal(shouldPackageWebSourceFile('apps/web/src/platform/auth/credentials.ts'), true);
  assert.equal(shouldPackageWebSourceFile('apps/web/src/features/archive/ArchivePanel.tsx'), true);
});

test('pins the production runtime and native SQLite ABI to the Node 20 deployment baseline', () => {
  const rootPackage = JSON.parse(readFileSync('package.json', 'utf8'));
  const webPackage = JSON.parse(readFileSync('apps/web/package.json', 'utf8'));
  const lockfile = readFileSync('pnpm-lock.yaml', 'utf8');

  assert.equal(existsSync('.node-version'), true, '.node-version must pin the deployment runtime');
  assert.equal(readFileSync('.node-version', 'utf8').trim(), '20.20.2');
  assert.equal(rootPackage.engines?.node, '20.20.2');
  assert.equal(webPackage.dependencies?.['better-sqlite3'], '11.10.0');
  assert.equal(shouldPackageWebSourceFile('.node-version'), true);
  assert.match(lockfile, /better-sqlite3:\r?\n\s+specifier: 11\.10\.0\r?\n\s+version: 11\.10\.0/);
  assert.match(lockfile, /^\s{2}better-sqlite3@11\.10\.0:/m);
  assert.doesNotMatch(lockfile, /^\s{2}better-sqlite3@12\.11\.1:/m);
});

test('traces the complete better-sqlite3 dynamic runtime dependency closure', () => {
  const webPackage = JSON.parse(readFileSync('apps/web/package.json', 'utf8'));
  const nextConfig = readFileSync('apps/web/next.config.mjs', 'utf8');
  const lockfile = readFileSync('pnpm-lock.yaml', 'utf8');

  assert.equal(webPackage.dependencies?.bindings, '1.5.0');
  assert.equal(webPackage.dependencies?.['file-uri-to-path'], '1.0.0');
  assert.match(lockfile, /bindings:\r?\n\s+specifier: 1\.5\.0\r?\n\s+version: 1\.5\.0/);
  assert.match(lockfile, /file-uri-to-path:\r?\n\s+specifier: 1\.0\.0\r?\n\s+version: 1\.0\.0/);
  assert.equal(nextConfig.includes("'./node_modules/bindings/**/*'"), true);
  assert.equal(nextConfig.includes("'./node_modules/file-uri-to-path/**/*'"), true);
});

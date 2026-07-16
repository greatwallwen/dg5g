import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const auditScript = fileURLToPath(new URL('./audit-textbook-boundaries.mjs', import.meta.url));

test('reports apps/web/src as runtime code and distinguishes authoring from verified runtime media', async (t) => {
  const root = await createFixture(t);
  const result = runAudit(root);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(result.report.summary.authoringMediaRoots, ['site/public/media']);
  assert.deepEqual(result.report.summary.runtimeVerifiedMediaRoots, ['apps/web/public/media']);
  assert.equal(result.report.summary.codeRoots.includes('apps/web/src'), true);
  assert.equal(result.report.summary.codeRoots.includes('site/src'), false);
  assert.equal(result.report.summary.contentRoots.includes('site/public/media'), true);
  assert.equal(result.report.summary.contentRoots.includes('apps/web/public/media'), true);
  assert.deepEqual(result.report.summary.allowedAssetCodePaths, ['apps/web/src/app/icon.svg']);
});

test('rejects binary media added to apps/web/src outside the exact Next metadata exception', async (t) => {
  const root = await createFixture(t);
  await writeFixtureFile(root, 'apps/web/src/features/leaked-screen.png', 'not-a-real-png');

  const result = runAudit(root);

  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(result.report.failures.some(({ code, message }) => (
    code === 'code-binary-asset'
      && message.includes('apps/web/src/features/leaked-screen.png')
      && message.includes('code root apps/web/src')
  )), true);
});

test('rejects source code in both authoring and verified runtime media roots', async (t) => {
  const authoringRoot = await createFixture(t);
  await writeFixtureFile(authoringRoot, 'site/public/media/leaked-authoring.ts', 'export {}');
  const authoringResult = runAudit(authoringRoot);
  assert.equal(authoringResult.status, 1, authoringResult.stderr || authoringResult.stdout);
  assert.equal(authoringResult.report.failures.some(({ code, message }) => (
    code === 'content-source-code' && message.includes('site/public/media/leaked-authoring.ts')
  )), true);

  const runtimeRoot = await createFixture(t);
  await writeFixtureFile(runtimeRoot, 'apps/web/public/media/leaked-runtime.mjs', 'export {}');
  const runtimeResult = runAudit(runtimeRoot);
  assert.equal(runtimeResult.status, 1, runtimeResult.stderr || runtimeResult.stdout);
  assert.equal(runtimeResult.report.failures.some(({ code, message }) => (
    code === 'content-source-code' && message.includes('apps/web/public/media/leaked-runtime.mjs')
  )), true);
});

test('requires both the authoring media source and verified runtime media closure', async (t) => {
  const runtimeMissing = await createFixture(t, { runtimeMedia: false });
  const runtimeResult = runAudit(runtimeMissing);
  assert.equal(runtimeResult.status, 1, runtimeResult.stderr || runtimeResult.stdout);
  assert.equal(runtimeResult.report.failures.some(({ code, message }) => (
    code === 'required-path' && message.includes('missing apps/web/public/media')
  )), true);

  const authoringMissing = await createFixture(t, { authoringMedia: false });
  const authoringResult = runAudit(authoringMissing);
  assert.equal(authoringResult.status, 1, authoringResult.stderr || authoringResult.stdout);
  assert.equal(authoringResult.report.failures.some(({ code, message }) => (
    code === 'required-path' && message.includes('missing site/public/media')
  )), true);
});

async function createFixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dgbook-textbook-boundaries-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const manifest = {
    bookId: '5g',
    outputs: {
      outline: 'textbook/5g/outline.json',
      projects: 'textbook/5g/projects',
      widgets: 'textbook/5g/widgets',
      media: 'site/public/media/5g',
      manim: 'site/public/media/manim',
      tts: 'site/public/media/tts',
    },
  };

  await writeFixtureFile(root, 'config/textbooks/5g/textbook.manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFixtureFile(root, 'textbook/5g/outline.json', '{}\n');
  await mkdir(path.join(root, 'textbook/5g/projects'), { recursive: true });
  await mkdir(path.join(root, 'textbook/5g/widgets'), { recursive: true });
  await writeFixtureFile(root, 'packages/edugame-assets/asset-manifest.json', '{}\n');
  await writeFixtureFile(root, 'docs/architecture/textbook-asset-code-boundaries.md', '# fixture\n');
  await writeFixtureFile(root, 'apps/web/src/app/icon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>\n');
  if (options.authoringMedia !== false) await mkdir(path.join(root, 'site/public/media'), { recursive: true });
  if (options.runtimeMedia !== false) await mkdir(path.join(root, 'apps/web/public/media'), { recursive: true });
  return root;
}

async function writeFixtureFile(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

function runAudit(root) {
  const result = spawnSync(process.execPath, [auditScript], {
    cwd: root,
    encoding: 'utf8',
  });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`audit emitted invalid JSON: ${error.message}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return { ...result, report };
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('standalone release copies the single web public tree and declares no legacy media roots', async () => {
  const source = await readFile(new URL('./prepare-web-release.mjs', import.meta.url), 'utf8');

  assert.match(source, /copyIfExists\(path\.join\(appDir, 'public'\), path\.join\(packageDir, 'apps', 'web', 'public'\)\)/);
  assert.doesNotMatch(source, /path\.join\(rootDir, 'site', 'public', 'media'/);
  assert.match(source, /mediaRoots:\s*\['apps\/web\/public\/media'\]/);
  assert.doesNotMatch(source, /site\/public\/media\/(?:tts|capability-maps|home)/);
});

test('standalone release verifies the accepted 40-file target before mutating its package directory', async () => {
  const source = await readFile(new URL('./prepare-web-release.mjs', import.meta.url), 'utf8');
  const accepted = source.indexOf('resolveAcceptedMediaCutoverManifest({ repositoryRoot: rootDir })');
  const audited = source.indexOf('auditExactMediaTree({');
  const passed = source.indexOf('targetMediaAudit.passed');
  const clearPackage = source.indexOf('await rm(packageDir');
  assert.ok(accepted >= 0);
  assert.ok(audited > accepted);
  assert.ok(passed > audited);
  assert.ok(clearPackage > passed, 'target exact-tree audit must pass before package mutation');
});

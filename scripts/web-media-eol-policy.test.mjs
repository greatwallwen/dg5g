import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { auditAcceptedMediaGitCheckout } from './web-media-eol-policy.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('keeps all 40 accepted media files byte-exact in cached Git checkout policy', async () => {
  const report = await auditAcceptedMediaGitCheckout({ repositoryRoot });

  assert.equal(report.fileCount, 40);
  assert.equal(report.cachedAttributeChecks, 80);
  assert.equal(report.committedBlobChecks, 40);
  assert.deepEqual(report.issues, []);
  assert.equal(report.passed, true);
});

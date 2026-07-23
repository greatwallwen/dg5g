import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  buildWebRuntimeMediaContract,
  verifyWebRuntimeMedia,
} from './web-runtime-media-contract.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

test('tracked runtime media contract is complete and independent from historical artifacts', async () => {
  const contract = buildWebRuntimeMediaContract();
  assert.equal(contract.contractId, 'tracked-runtime-media-v1');
  assert.equal(contract.summary.fileCount, 40);
  assert.equal(contract.summary.totalBytes, 12_627_129);
  assert.equal(contract.entries.length, 40);
  assert.equal(new Set(contract.entries.map(({ targetPath }) => targetPath)).size, 40);

  const verified = await verifyWebRuntimeMedia({ repositoryRoot });
  assert.deepEqual(verified.targetAudit, {
    passed: true,
    expectedFileCount: 40,
    actualFileCount: 40,
    actualTotalBytes: 12_627_129,
    issues: [],
  });
});

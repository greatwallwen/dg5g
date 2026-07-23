import assert from 'node:assert/strict';
import test from 'node:test';

import { removeRuntimeAuditDirectory } from './runtime-audit-temp.mjs';

test('temporary runtime database cleanup retries transient Windows locks', async () => {
  const calls = [];
  await removeRuntimeAuditDirectory('D:/AppData/Temp/dgbook-runtime-audit-test', {
    remove: async (directory, options) => calls.push({ directory, options }),
  });

  assert.deepEqual(calls, [{
    directory: 'D:/AppData/Temp/dgbook-runtime-audit-test',
    options: {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 250,
    },
  }]);
});

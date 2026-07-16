import assert from 'node:assert/strict';
import test from 'node:test';

import { buildActiveWorkspaceAudit } from './audit-active-workspace.mjs';

test('active audit permits only explicit regenerable or superseded paths', () => {
  const audit = buildActiveWorkspaceAudit({
    candidates: [
      { path: 'apps/web/.next' },
      { path: 'artifacts/web-source-release/dgbook-web-source' },
      {
        path: 'output/playwright/task8-final5-20260716T0452Z',
        evidenceRole: 'superseded',
        supersededBy: 'output/playwright/task8-final6-20260716T0455Z',
      },
      { path: 'output/playwright/unindexed-run', evidenceRole: 'unknown' },
      { path: 'apps/web/database/dgbook.db' },
      { path: 'apps/web/public/media.rollback-task9-media-20260716t2116z' },
    ],
    protectedPaths: ['content/5g/5g.docx', 'apps/web/database', 'apps/web/public/media'],
    evidenceIssues: [],
  });

  assert.equal(audit.passed, true);
  assert.deepEqual(audit.removablePaths, [
    'apps/web/.next',
    'artifacts/web-source-release/dgbook-web-source',
    'output/playwright/task8-final5-20260716T0452Z',
  ]);
  assert.deepEqual(audit.protectedPaths, [
    'apps/web/database',
    'apps/web/database/dgbook.db',
    'apps/web/public/media',
    'apps/web/public/media.rollback-task9-media-20260716t2116z',
    'content/5g/5g.docx',
    'output/playwright/unindexed-run',
  ]);
  assert.deepEqual(audit.forbiddenRuntimeRefs, []);
  assert.deepEqual(audit.decisions.find(({ path }) => path.includes('final5')), {
    path: 'output/playwright/task8-final5-20260716T0452Z',
    disposition: 'removable',
    reason: 'superseded-evidence:playwright-output',
    role: 'superseded',
    supersededBy: 'output/playwright/task8-final6-20260716T0455Z',
  });
});

test('active audit fails closed when the evidence index is not trustworthy', () => {
  const audit = buildActiveWorkspaceAudit({
    candidates: [{ path: 'apps/web/.next' }],
    protectedPaths: [],
    evidenceIssues: [{ code: 'release-evidence-unconfirmed', path: 'artifacts/release' }],
  });

  assert.equal(audit.passed, false);
  assert.deepEqual(audit.removablePaths, []);
  assert.deepEqual(audit.forbiddenRuntimeRefs, [
    'evidence-index:release-evidence-unconfirmed:artifacts/release',
  ]);
  assert.deepEqual(audit.decisions, [{
    path: 'apps/web/.next',
    disposition: 'protected',
    reason: 'evidence-index-untrusted',
    role: 'unknown',
  }]);
});


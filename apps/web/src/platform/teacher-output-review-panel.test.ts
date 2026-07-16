import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import * as outputReviewPanel from '../features/review/output-review-panel.tsx';

test('teacher console uses the submitted-output queue as its only review panel', () => {
  const panelPath = resolve(
    process.cwd(),
    'apps/web/src/features/review/output-review-panel.tsx',
  );
  assert.equal(existsSync(panelPath), true, 'real output review panel must exist');

  const panel = readFileSync(panelPath, 'utf8');
  assert.match(panel, /fetch\('\/api\/teacher\/outputs'/);
  assert.match(panel, /\/api\/teacher\/outputs\/\$\{selected\.outputId\}\/reviews/);
  assert.match(panel, /expectedStateRevision/);
  assert.match(panel, /rubricScores/);
  assert.match(panel, /selected\.rubric\.map/);
  assert.match(panel, /selected\.fieldSchema\.map/);
  assert.doesNotMatch(panel, /const rubric\s*=/);
  assert.match(panel, /data-output-review-panel/);

  const view = readFileSync(resolve(
    process.cwd(),
    'apps/web/src/features/classroom/teacher-console-view.tsx',
  ), 'utf8');
  const inspector = readFileSync(resolve(
    process.cwd(),
    'apps/web/src/features/classroom/teacher-console-inspector.tsx',
  ), 'utf8');
  assert.match(view, /<TeacherConsoleInspector p=\{p\}/);
  assert.match(inspector, /import \{ OutputReviewPanel \}/);
  assert.match(inspector, /<OutputReviewPanel/);
  assert.doesNotMatch(`${view}\n${inspector}`, /data-selected-student-id/);
});

test('teacher output fields render primitive values and unwrap structured value envelopes without object blobs', () => {
  const formatOutputFieldValue = (
    outputReviewPanel as typeof outputReviewPanel & {
      formatOutputFieldValue: (value: unknown) => string;
    }
  ).formatOutputFieldValue;
  assert.equal(typeof formatOutputFieldValue, 'function');
  assert.equal(formatOutputFieldValue('设备身份已核对'), '设备身份已核对');
  assert.equal(formatOutputFieldValue(90), '90');
  assert.equal(formatOutputFieldValue(['位置证据', '身份证据']), '位置证据、身份证据');
  assert.equal(formatOutputFieldValue(undefined), '未填写');
  assert.equal(formatOutputFieldValue({
    value: 'BBU-01 / 槽位3',
    sources: [{ sourceNodeId: 'P1T1-N02' }],
  }), 'BBU-01 / 槽位3');
  const fallback = formatOutputFieldValue({ unexpected: 'defensive fallback' });
  assert.doesNotMatch(fallback, /\[object Object\]/);
  assert.match(fallback, /defensive fallback/);
});

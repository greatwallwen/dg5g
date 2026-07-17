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
  const detail = readFileSync(resolve(
    process.cwd(),
    'apps/web/src/features/review/output-review-detail.tsx',
  ), 'utf8');
  const certification = readFileSync(resolve(
    process.cwd(),
    'apps/web/src/features/review/output-review-certification.tsx',
  ), 'utf8');
  const reviewSource = `${panel}\n${detail}\n${certification}`;
  assert.match(panel, /fetch\('\/api\/teacher\/outputs'/);
  assert.match(panel, /\/api\/teacher\/outputs\/\$\{selected\.outputId\}\/reviews/);
  assert.match(panel, /expectedStateRevision/);
  assert.match(panel, /expectedOutputVersion/);
  assert.match(panel, /rubricScores/);
  assert.match(panel, /annotations/);
  assert.match(reviewSource, /selected\.rubric\.map/);
  assert.match(panel, /selected\.fieldSchema\.map/);
  assert.doesNotMatch(panel, /const rubric\s*=/);
  assert.match(panel, /data-output-review-panel/);
  for (const marker of [
    'data-review-origin',
    'data-review-field',
    'data-review-evidence',
    'data-review-source',
    'data-review-gap',
    'data-review-next-action',
    'data-review-version-diff',
    'data-review-assessment-dimension',
    'data-review-history',
    'data-review-annotation',
    'data-review-rubric',
    'data-review-disabled-reasons',
  ]) assert.match(reviewSource, new RegExp(marker));

  const queueRoute = readFileSync(resolve(
    process.cwd(),
    'apps/web/src/app/api/teacher/outputs/route.ts',
  ), 'utf8');
  assert.match(queueRoute, /ProfessionalOutputPortfolioReader/);
  assert.match(queueRoute, /buildP1PortfolioDetailModel/);

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

test('teacher certification blockers explain every client-side rubric and assessment gate', () => {
  const certificationBlockers = (
    outputReviewPanel as typeof outputReviewPanel & {
      certificationBlockers: (input: {
        rubric: Array<{ key: string; label: string; maxScore: number }>;
        scores: Record<string, number>;
        assessment?: { passed: boolean; origin: 'demo' | 'user' };
      }) => string[];
    }
  ).certificationBlockers;
  assert.equal(typeof certificationBlockers, 'function');
  const rubric = [
    { key: 'evidence', label: '证据完整度', maxScore: 50 },
    { key: 'judgement', label: '职业判断', maxScore: 50 },
  ];
  assert.deepEqual(certificationBlockers({ rubric, scores: {} }), [
    '请完成全部量规评分。',
    '当前没有可用于认证的真实正式测试达标记录。',
  ]);
  assert.deepEqual(certificationBlockers({
    rubric,
    scores: { evidence: 24, judgement: 55 },
    assessment: { passed: true, origin: 'user' },
  }), [
    '证据完整度不得低于 25 分。',
    '职业判断不得超过 50 分。',
  ]);
  assert.deepEqual(certificationBlockers({
    rubric,
    scores: { evidence: 40, judgement: 39 },
    assessment: { passed: true, origin: 'user' },
  }), ['量规总分必须达到 80 分。']);
  assert.deepEqual(certificationBlockers({
    rubric,
    scores: { evidence: 40, judgement: 40 },
    assessment: { passed: true, origin: 'user' },
  }), []);
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

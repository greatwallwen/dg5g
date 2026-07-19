import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
  ExpiredIssuedAssessment,
  PausedIssuedAssessment,
} from './formal-assessment-client-state.ts';
import {
  ExpiredAssessmentView,
  PausedAssessmentView,
} from './formal-assessment-paper-content.tsx';

test('paused assessment renders the complete saved paper read-only with a frozen timer', () => {
  const markup = renderToStaticMarkup(
    <PausedAssessmentView issued={pausedAssessment()} remainingSeconds={245} />,
  );

  assert.match(markup, /data-assessment-state="paused"/);
  assert.match(markup, /data-assessment-id="assessment-paused-1"/);
  assert.match(markup, /04:05/);
  assert.match(markup, /草稿 V2/);
  for (const dimension of [
    'evidenceClassification',
    'linkReconstruction',
    'defectiveOutputRevision',
    'professionalConclusion',
  ]) assert.match(markup, new RegExp(`data-assessment-question="${dimension}"`));
  assert.match(markup, /<input disabled=""[^>]*checked="" value="nameplate-photo"/);
  assert.match(markup, /value="source-device" selected=""/);
  assert.match(markup, /已确认设备铭牌与源端口/);
  assert.doesNotMatch(markup, /type="submit"|保存草稿|提交正式测试|x-assessment-token/);
});

test('expired classroom assessment stays read-only and cannot start an unbound restart', () => {
  const paused = pausedAssessment();
  const expired: ExpiredIssuedAssessment = { ...paused, state: 'expired' };
  const markup = renderToStaticMarkup(
    <ExpiredAssessmentView allowRestart={false} draft={expired.draft} issued={expired} message="" />,
  );
  assert.match(markup, /data-assessment-state="expired"/);
  assert.match(markup, /只读/);
  assert.doesNotMatch(markup, /restart=true|开始新测试/);
});

function pausedAssessment(): PausedIssuedAssessment {
  return {
    assessmentId: 'assessment-paused-1',
    serverNow: '2026-07-18T08:05:00.000Z',
    expiresAt: '2026-07-18T08:09:05.000Z',
    state: 'paused',
    draft: {
      revision: 2,
      answers: {
        evidenceClassification: 'nameplate-photo',
        linkReconstruction: ['source-device', 'source-port'],
        defectiveOutputRevision: ['restore-source'],
        professionalConclusion: {
          confirmedFact: '已确认设备铭牌与源端口',
          evidenceGap: '对端端口照片仍需复核',
          risk: '链路方向结论可能失真',
          action: '补拍对端端口并更新证据表',
        },
      },
    },
    paper: {
      nodeId: 'P1T1-N02',
      title: '室内设备与链路证据正式测试',
      questionVersion: 'p01-n02-v1',
      passScore: 80,
      durationMinutes: 15,
      questions: [
        {
          id: 'evidenceClassification', dimension: 'evidenceClassification',
          prompt: '选择身份直接证据', helpText: '按可复核性判断。', kind: 'single-choice',
          options: [{ id: 'nameplate-photo', label: '铭牌照片' }],
        },
        {
          id: 'linkReconstruction', dimension: 'linkReconstruction',
          prompt: '重建链路', helpText: '按方向排序。', kind: 'ordering',
          options: [
            { id: 'source-device', label: '源设备' },
            { id: 'source-port', label: '源端口' },
          ],
        },
        {
          id: 'defectiveOutputRevision', dimension: 'defectiveOutputRevision',
          prompt: '修订成果', helpText: '选择修订动作。', kind: 'multiple-choice',
          options: [{ id: 'restore-source', label: '补齐来源' }],
        },
        {
          id: 'professionalConclusion', dimension: 'professionalConclusion',
          prompt: '职业结论', helpText: '写出四段结论。', kind: 'structured-conclusion',
        },
      ],
    },
  };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { assessmentDimensionKeys } from '../../platform/formal-assessment-contract.ts';
import { p01OutputFieldDefinitions } from './p01-output-definition.ts';
import { buildP1PortfolioDetailModel, type P1PortfolioDetailFacts } from './p1-portfolio-detail-model.ts';
import { P1PortfolioDetailView } from './p1-portfolio-detail-view.tsx';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const definition = {
  taskId: 'P01' as const,
  taskTitle: '室内信息采集',
  outputTitle: '室内设备与链路证据表',
  fieldDefinitions: p01OutputFieldDefinitions,
  assessmentNodeId: 'P1T1-N02',
  outputNodeId: 'P1T1-N04',
};

test('renders real fields, evidence, sources, version diff, annotations, review history, and diagnostics', () => {
  const html = renderToStaticMarkup(
    <P1PortfolioDetailView displayName="学生三" model={buildP1PortfolioDetailModel(definition, facts())} />,
  );

  assert.match(html, /data-portfolio-detail="P01"/);
  assert.match(html, /data-portfolio-formation="formed"/);
  assert.match(html, /data-portfolio-delivery="demo-only"/);
  assert.match(html, /演示数据/);
  assert.match(html, /室内设备与链路证据表/);
  assert.equal((html.match(/data-portfolio-field=/g) ?? []).length, 20);
  for (const { key } of p01OutputFieldDefinitions) {
    assert.match(html, new RegExp(`data-portfolio-field="${key}"`));
  }
  assert.match(html, /data-portfolio-evidence="ev-room"/);
  assert.match(html, /src="\/media\/5g\/image29.png"/);
  assert.match(html, /alt="HY-01机房全景"/);
  assert.match(html, /data-portfolio-source="P1T1-N01:attempt-scope"/);
  assert.match(html, /href="\/learn\/P1T1-N01"/);
  assert.match(html, /补拍柜号与设备同框照片/);
  assert.match(html, /data-version-diff="1:2"/);
  assert.match(html, /位置证据已补齐/);
  assert.equal((html.match(/data-review-history=/g) ?? []).length, 2);
  assert.equal((html.match(/data-assessment-dimension=/g) ?? []).length, 4);
  assert.match(html, /总分 92/);
  assert.match(html, /href="\/learn\/P1T1-N02\/test"/);
  assert.equal((html.match(/data-primary-action="true"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /dangerouslySetInnerHTML|answers_json|response_json|modelAnswer/);
});

test('renders a truthful unformed page without fake version, score, fields, or certification', () => {
  const html = renderToStaticMarkup(
    <P1PortfolioDetailView
      displayName="学生一"
      model={buildP1PortfolioDetailModel(definition, { taskId: 'P01' })}
    />,
  );

  assert.match(html, /data-portfolio-formation="unformed"/);
  assert.match(html, /尚未形成/);
  assert.match(html, /继续形成成果/);
  assert.doesNotMatch(html, /data-portfolio-field=|data-version-diff=|data-assessment-dimension=/);
  assert.doesNotMatch(html, /v0|0分|教师确认|教师认证|能力达成/);
  assert.equal((html.match(/data-primary-action="true"/g) ?? []).length, 1);
});

function facts(): P1PortfolioDetailFacts {
  const base = Object.fromEntries(p01OutputFieldDefinitions.map(({ key }) => [key, `已填写：${key}`]));
  return {
    taskId: 'P01',
    output: {
      head: {
        outputId: 'output-p01', studentId: 'stu-03', taskId: 'P01', currentVersion: 2,
        stateRevision: 6, status: 'verified', origin: 'demo',
      },
      submissionCount: 2,
      versions: [
        {
          outputId: 'output-p01', taskId: 'P01', version: 1, schemaVersion: 1,
          fields: { ...base, locationEvidence: '柜号未同框' }, upstreamRefs: [],
          evidenceLinks: { siteRoom: [evidence()] },
          evidenceGaps: {},
          fieldSources: [{ fieldKey: 'siteRoom', sourceNodeId: 'P1T1-N01', sourceAttemptId: 'attempt-scope' }],
        },
        {
          outputId: 'output-p01', taskId: 'P01', version: 2, schemaVersion: 1,
          fields: { ...base, locationEvidence: '位置证据已补齐' }, upstreamRefs: [],
          evidenceLinks: { siteRoom: [evidence()] },
          evidenceGaps: {},
          fieldSources: [{ fieldKey: 'siteRoom', sourceNodeId: 'P1T1-N01', sourceAttemptId: 'attempt-scope' }],
        },
      ],
      reviewHistory: [
        {
          reviewId: 'review-return', reviewerId: 'teacher-01', status: 'returned', outputVersion: 1,
          feedback: '补齐位置证据', reviewedAt: '2026-07-16T08:00:00.000Z', origin: 'demo',
          annotations: [{ fieldKey: 'locationEvidence', comment: '补拍柜号与设备同框照片' }],
        },
        {
          reviewId: 'review-verify', reviewerId: 'teacher-01', status: 'verified', outputVersion: 2,
          score: 94, feedback: '证据闭环', reviewedAt: '2026-07-16T09:00:00.000Z', origin: 'demo',
          annotations: [],
        },
      ],
    },
    assessment: {
      assessmentId: 'assessment-p01', attemptId: 'formal-p01', nodeId: 'P1T1-N02',
      questionVersion: 'p01-n02-v1', totalScore: 92, passed: true, origin: 'demo',
      completedAt: '2026-07-16T07:00:00.000Z', remediationTargets: [],
      dimensions: Object.fromEntries(assessmentDimensionKeys.map((key) => [key, {
        score: 23, maxScore: 25 as const, feedback: `${key} 诊断`,
      }])) as P1PortfolioDetailFacts['assessment'] extends infer T
        ? T extends { dimensions: infer D } ? D : never
        : never,
    },
  };
}

function evidence() {
  return {
    evidenceId: 'ev-room', title: 'HY-01机房全景', kind: 'photo' as const,
    assetUrl: '/media/5g/image29.png', metadata: { annotation: '站点与机房同框' }, origin: 'demo' as const,
  };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { assessmentDimensionKeys } from '../../platform/formal-assessment-contract.ts';
import { p01OutputFieldDefinitions } from './p01-output-definition.ts';
import {
  buildP1PortfolioDetailModel,
  diffProfessionalOutputVersions,
  type P1PortfolioDetailFacts,
  type PortfolioVersionFact,
} from './p1-portfolio-detail-model.ts';

const task = {
  taskId: 'P01' as const,
  taskTitle: '室内信息采集',
  outputTitle: '室内设备与链路证据表',
  fieldDefinitions: p01OutputFieldDefinitions,
  assessmentNodeId: 'P1T1-N02',
  outputNodeId: 'P1T1-N04',
};

test('an absent output stays unformed without invented fields, versions, scores, or certification', () => {
  const model = buildP1PortfolioDetailModel(task, { taskId: 'P01' });

  assert.equal(model.formation, 'unformed');
  assert.equal(model.deliveryState, 'not-deliverable');
  assert.equal(model.statusLabel, '尚未形成');
  assert.equal(model.currentVersion, undefined);
  assert.deepEqual(model.versions, []);
  assert.deepEqual(model.reviewTimeline, []);
  assert.equal(model.assessment, undefined);
  assert.doesNotMatch(JSON.stringify(model), /v0|0分|教师确认|教师认证|能力达成/);
});

test('a demo V1 to V2 result keeps ten ordered fields, version-bound annotations, and four real diagnostics', () => {
  const model = buildP1PortfolioDetailModel(task, demoFacts());

  assert.equal(model.formation, 'formed');
  assert.equal(model.deliveryState, 'demo-only');
  assert.equal(model.originLabel, '演示数据');
  assert.equal(model.statusLabel, '教师确认');
  assert.equal(model.currentVersion, 2);
  assert.deepEqual(model.versions[1]?.fields.map(({ key }) => key), p01OutputFieldDefinitions.map(({ key }) => key));
  assert.deepEqual(model.versions[1]?.diffFromPrevious?.changedFields.map(({ fieldKey }) => fieldKey), [
    'locationEvidence',
    'evidenceGap',
  ]);
  assert.deepEqual(model.versions[0]?.fields.find(({ key }) => key === 'locationEvidence')?.annotations, [{
    reviewId: 'review-return',
    outputVersion: 1,
    reviewStatus: 'returned',
    comment: '补拍柜号与设备同框照片。',
  }]);
  assert.deepEqual(model.versions[1]?.fields.find(({ key }) => key === 'evidenceGap')?.annotations, [{
    reviewId: 'review-verify',
    outputVersion: 2,
    reviewStatus: 'verified',
    comment: '缺口已闭环。',
  }]);
  assert.deepEqual(model.reviewTimeline.map(({ status, outputVersion }) => ({ status, outputVersion })), [
    { status: 'returned', outputVersion: 1 },
    { status: 'verified', outputVersion: 2 },
  ]);
  assert.deepEqual(model.assessment?.dimensions.map(({ key }) => key), assessmentDimensionKeys);
  assert.equal(model.assessment?.totalScore, 92);
  assert.equal(model.assessment?.originLabel, '演示数据');
  assert.equal(model.assessment?.nodeHref, '/learn/P1T1-N02/test');
  assert.doesNotMatch(JSON.stringify(model), /answers_json|answers|response_json|correctAnswer|modelAnswer/);
});

test('version diff ignores CRLF and evidence ordering but reports real evidence and source changes', () => {
  const previous = version(1, {
    siteRoom: 'HY-01\r\n01号机房',
    collectionScope: ['设备', '链路'],
  }, {
    siteRoom: [evidence('ev-b'), evidence('ev-a')],
  }, [source('siteRoom', 'P1T1-N01', 'attempt-a')]);
  const current = version(2, {
    siteRoom: 'HY-01\n01号机房 ',
    collectionScope: ['设备', '链路'],
  }, {
    siteRoom: [evidence('ev-c'), evidence('ev-a')],
  }, [source('siteRoom', 'P1T1-N02', 'attempt-b')]);

  const diff = diffProfessionalOutputVersions(previous, current, ['siteRoom', 'collectionScope']);

  assert.deepEqual(diff.changedFields.map(({ fieldKey }) => fieldKey), ['siteRoom']);
  assert.deepEqual(diff.changedFields[0]?.addedEvidenceIds, ['ev-c']);
  assert.deepEqual(diff.changedFields[0]?.removedEvidenceIds, ['ev-b']);
  assert.deepEqual(diff.changedFields[0]?.addedSources, [source('siteRoom', 'P1T1-N02', 'attempt-b')]);
  assert.deepEqual(diff.changedFields[0]?.removedSources, [source('siteRoom', 'P1T1-N01', 'attempt-a')]);
  assert.deepEqual(diff.integrityWarnings, ['siteRoom 字段移除了可追溯来源 P1T1-N01 / attempt-a']);
});

test('only a user-origin verified output is a verified deliverable and malformed diagnosis is omitted', () => {
  const facts = demoFacts();
  facts.output!.head.origin = 'user';
  facts.assessment = {
    ...facts.assessment!,
    totalScore: 99,
    dimensions: { ...facts.assessment!.dimensions, professionalConclusion: undefined } as never,
  };

  const model = buildP1PortfolioDetailModel(task, facts);

  assert.equal(model.deliveryState, 'verified-deliverable');
  assert.equal(model.originLabel, '真实学习记录');
  assert.equal(model.assessment, undefined);
});

function demoFacts(): P1PortfolioDetailFacts {
  const v1Fields = completeFields({
    locationEvidence: '柜号未同框',
    evidenceGap: '缺少柜号全景',
  });
  const v2Fields = completeFields({
    locationEvidence: 'HY-01 / 01号机房 / 02号柜同框可见',
    evidenceGap: '柜号全景已补采，接地仍登记待复核',
  });
  return {
    taskId: 'P01',
    output: {
      head: {
        outputId: 'output-p01', studentId: 'stu-03', taskId: 'P01', currentVersion: 2,
        stateRevision: 6, status: 'verified', origin: 'demo',
      },
      submissionCount: 2,
      versions: [
        version(1, v1Fields, {
          locationEvidence: [evidence('room-overview')],
          evidenceGap: [evidence('grounding-gap')],
        }, [source('locationEvidence', 'P1T1-N01', 'scope-attempt')]),
        version(2, v2Fields, {
          locationEvidence: [evidence('room-overview')],
          evidenceGap: [evidence('grounding-gap')],
        }, [source('locationEvidence', 'P1T1-N01', 'scope-attempt')]),
      ],
      reviewHistory: [
        {
          reviewId: 'review-return', reviewerId: 'teacher-01', status: 'returned', outputVersion: 1,
          feedback: '补齐位置证据。', reviewedAt: '2026-07-16T08:00:00.000Z', origin: 'demo',
          annotations: [{ fieldKey: 'locationEvidence', comment: '补拍柜号与设备同框照片。' }],
        },
        {
          reviewId: 'review-verify', reviewerId: 'teacher-01', status: 'verified', outputVersion: 2,
          score: 94, feedback: '证据闭环。', reviewedAt: '2026-07-16T09:00:00.000Z', origin: 'demo',
          annotations: [{ fieldKey: 'evidenceGap', comment: '缺口已闭环。' }],
        },
      ],
    },
    assessment: {
      assessmentId: 'assessment-p01', attemptId: 'formal-p01', nodeId: 'P1T1-N02',
      questionVersion: 'p01-n02-v1', totalScore: 92, passed: true, origin: 'demo',
      completedAt: '2026-07-16T07:00:00.000Z',
      dimensions: Object.fromEntries(assessmentDimensionKeys.map((key, index) => [key, {
        score: index === 0 ? 23 : 23, maxScore: 25 as const, feedback: `${key} 诊断`,
      }])) as P1PortfolioDetailFacts['assessment'] extends infer T
        ? T extends { dimensions: infer D } ? D : never
        : never,
      remediationTargets: [],
    },
  };
}

function version(
  number: number,
  fields: Record<string, string | number | string[]>,
  evidenceLinks: PortfolioVersionFact['evidenceLinks'] = {},
  fieldSources: PortfolioVersionFact['fieldSources'] = [],
): PortfolioVersionFact {
  return {
    outputId: 'output-p01', taskId: 'P01', version: number, schemaVersion: 1,
    fields, upstreamRefs: [], evidenceLinks, fieldSources,
  };
}

function evidence(evidenceId: string): PortfolioVersionFact['evidenceLinks'][string][number] {
  return {
    evidenceId, title: `证据 ${evidenceId}`, kind: 'photo', assetUrl: `/media/${evidenceId}.png`,
    metadata: { annotation: evidenceId }, origin: 'demo',
  };
}

function source(fieldKey: string, sourceNodeId: string, sourceAttemptId: string) {
  return { fieldKey, sourceNodeId, sourceAttemptId };
}

function completeFields(overrides: Record<string, string> = {}): Record<string, string> {
  return Object.fromEntries(p01OutputFieldDefinitions.map(({ key }) => [key, overrides[key] ?? `已填写：${key}`]));
}

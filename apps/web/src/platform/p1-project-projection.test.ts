import assert from 'node:assert/strict';
import test from 'node:test';
import { loadP1DemoContent } from '../features/platform/p1-content.ts';
import { buildP1PortfolioViewModel } from '../features/portfolio/p1-portfolio-model.ts';
import { p01OutputFieldKeys } from '../features/portfolio/p01-output-definition.ts';
import { migrateDatabase } from './db/migrations.ts';
import { seedDemo } from './db/demo-seed.ts';
import { createTestDatabase } from './db/test-database.ts';
import { projectP1Project, readP1ProjectProjection } from './p1-project-projection.ts';
import type { StudentLearningSnapshot } from './learning-read-model.ts';
import { ProfessionalOutputRepository } from './professional-output-repository.ts';
import {
  completePolicyGaps,
  seedLegalProfessionalOutputSubmissionFacts,
} from './professional-output-policy-test-support.ts';

test('projects the authoritative P01 to P03 chain for each seeded student', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);

    const studentOne = readP1ProjectProjection('stu-01', fixture.database);
    const studentTwo = readP1ProjectProjection('stu-02', fixture.database);
    const studentThree = readP1ProjectProjection('stu-03', fixture.database);

    assert.equal(studentOne.studentVersion, 0);
    assert.equal(studentOne.snapshotVersion, 6);
    assert.equal(Object.hasOwn(studentOne, 'globalVersion'), false);

    assert.deepEqual(studentOne.tasks.map(({ taskId }) => taskId), ['P01', 'P02', 'P03']);
    assert.deepEqual(studentOne.tasks.map(({ nodes }) => nodes.length), [4, 4, 4]);
    assert.equal(new Set(studentOne.tasks.flatMap(({ nodes }) => nodes.map(({ nodeId }) => nodeId))).size, 12);

    assert.equal(studentOne.tasks[0].nextNodeId, 'P1T1-N01');
    assert.equal(studentTwo.tasks[0].nextNodeId, 'P1T1-N01');
    assert.equal(studentThree.tasks[2].nextNodeId, undefined);
    assert.equal(studentTwo.tasks[0].outputOrigin, 'demo');
    assert.equal(studentTwo.tasks[0].outputStatus, 'returned');
    assert.equal(studentTwo.tasks[0].state, 'output-pending');
    assert.equal(studentTwo.tasks[0].nodeTestHighestScore, 88);
    assert.equal(studentTwo.tasks[0].taskScoreOrigin, 'demo');
    assert.equal(studentThree.tasks.every(({ outputOrigin }) => outputOrigin === 'demo'), true);
    assert.equal(studentThree.tasks.every(({ outputStatus }) => outputStatus === 'verified'), true);
    assert.equal(studentThree.tasks.every(({ state }) => state === 'verified'), true);
    assert.equal(studentThree.portfolioStatus, 'demo-complete');

    assert.equal(studentOne.tasks[1].state, 'locked');
    assert.equal(studentOne.tasks[1].nextNodeId, undefined);
    assert.ok(studentOne.tasks[1].nodes.every((node) => node.href === undefined));
    assert.ok(studentOne.tasks[2].nodes.every((node) => node.href === undefined));
    assert.deepEqual(studentOne.tasks[2].nodes.map(({ nodeId }) => nodeId), [
      'P1T3-N01',
      'P1T3-N02',
      'P1T3-N03',
      'P1T3-N04',
    ]);
  } finally {
    fixture.cleanup();
  }
});

test('uses generated P1 content, immutable output heads and frozen scores without inventing values', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const content = loadP1DemoContent();
    const projection = readP1ProjectProjection('stu-02', fixture.database);

    assert.equal(projection.projectTitle, content.project.title);
    assert.equal(projection.finalOutputTitle, content.project.finalOutput);
    assert.deepEqual(
      projection.tasks.map(({ title, taskOutputTitle }) => ({ title, taskOutputTitle })),
      content.tasks.map(({ title, taskOutputTitle }) => ({ title, taskOutputTitle })),
    );
    assert.equal(projection.tasks[0].outputStatus, 'returned');
    assert.equal(projection.tasks[0].currentOutputVersion, 1);
    assert.equal(projection.tasks[0].verifiedOutputReference, undefined);
    assert.equal(projection.tasks[0].taskCompositeScore, undefined);
    assert.equal(projection.tasks[1].taskCompositeScore, undefined);
    assert.equal(projection.projectCompositeScore, undefined);
    assert.equal(projection.portfolioStatus, 'collecting');
  } finally {
    fixture.cleanup();
  }
});

test('a returned v1 revised and resubmitted as v2 is current on both project and portfolio projections', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    seedLegalProfessionalOutputSubmissionFacts(fixture.database, 'stu-01');
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'projection-output-p01');
    const firstFields = completeP01Fields('v1');
    const evidenceGaps = completePolicyGaps('P01');
    const draft = repository.saveDraft({
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 0,
      fields: firstFields,
      upstreamRefs: [],
      evidenceGaps,
    });
    const submitted = repository.submit({
      outputId: draft.head.outputId,
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 1,
      fields: draft.versions[0]!.fields,
      upstreamRefs: [],
      evidenceGaps,
    });
    const returned = repository.reviewSubmitted({
      teacherId: 'teacher-01',
      classId: 'demo-class',
      outputId: submitted.head.outputId,
      expectedStateRevision: 2,
      expectedOutputVersion: 1,
      action: 'return',
      feedback: '请补齐连接方向证据并标注两端端口。',
    });
    const revised = repository.saveDraft({
      outputId: returned.output.head.outputId,
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 3,
      fields: { ...firstFields, connectionDirection: 'v2' },
      upstreamRefs: [],
      evidenceGaps,
    });
    repository.submit({
      outputId: revised.head.outputId,
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 4,
      fields: revised.versions.at(-1)!.fields,
      upstreamRefs: [],
      evidenceGaps,
    });

    const projection = readP1ProjectProjection('stu-01', fixture.database);
    const portfolio = buildP1PortfolioViewModel(projection);

    assert.equal(projection.tasks[0].currentOutputVersion, 2);
    assert.equal(projection.tasks[0].outputOrigin, 'user');
    assert.equal(projection.tasks[0].outputStatus, 'resubmitted');
    assert.equal(projection.tasks[0].teacherFeedback, undefined);
    assert.equal(projection.tasks[0].verifiedOutputReference, undefined);
    assert.equal(portfolio.items[0]?.versionLabel, 'v2');
    assert.equal(portfolio.items[0]?.teacherFeedback, '暂无教师反馈');
    assert.equal(portfolio.packageStatus, 'not-formed');
  } finally {
    fixture.cleanup();
  }
});

test('project completion requires all three certified task facts and rejects a mixed forged combination', () => {
  const content = loadP1DemoContent();
  const learning = certifiedLearningFixture('user');

  const complete = projectP1Project(content, learning);
  assert.equal(complete.portfolioStatus, 'complete');
  assert.equal(complete.projectCompositeScore, 90);
  assert.ok(complete.tasks.every(({ realTaskCertified }) => realTaskCertified));

  learning.tasks[2]!.realTaskCertified = false;
  const mixed = projectP1Project(content, learning);
  assert.equal(mixed.portfolioStatus, 'collecting');
  assert.equal(mixed.projectCompositeScore, undefined);
});

function completeP01Fields(value: string): Record<string, string> {
  return Object.fromEntries(p01OutputFieldKeys.map((fieldKey) => [fieldKey, `${value}: ${fieldKey}`]));
}

function certifiedLearningFixture(origin: 'demo' | 'user'): StudentLearningSnapshot {
  const content = loadP1DemoContent();
  const outputNodes = new Set(content.tasks.map(({ nodes }) => nodes[3]!.id));
  return {
    version: 20,
    globalVersion: 30,
    studentId: 'stu-certification',
    nodes: content.tasks.flatMap((task) => task.nodes.map((node) => ({
      nodeId: node.id,
      axes: {
        access: 'open' as const,
        learning: 'practice-passed' as const,
        formalTest: 'not-required' as const,
        output: outputNodes.has(node.id) ? 'verified' as const : 'not-required' as const,
        certification: 'achieved' as const,
      },
      state: 'achieved' as const,
      stateTrail: ['available', 'achieved'],
      completedSections: [],
      classroomSubmitted: false,
      attempts: [],
      ...(outputNodes.has(node.id) ? {
        evidence: {
          outputId: `output-${task.taskId}`,
          taskId: task.taskId,
          nodeId: node.id,
          status: 'verified' as const,
          content: {},
          createdAt: '2026-07-16T08:00:00.000Z',
          updatedAt: '2026-07-16T09:00:00.000Z',
          origin,
          version: 1,
          stateRevision: 3,
        },
        review: {
          reviewId: `review-${task.taskId}`,
          outputId: `output-${task.taskId}`,
          status: 'verified' as const,
          score: 90,
          reviewedAt: '2026-07-16T09:00:00.000Z',
          outputVersion: 1,
          origin,
        },
      } : {}),
      prerequisites: [],
      nextRequirement: '已完成',
      taskAdvanceReady: outputNodes.has(node.id),
      origin,
    }))),
    tasks: content.tasks.map((task, index) => ({
      taskId: task.taskId,
      nodeTestHighestScore: 90,
      outputRubricScore: 90,
      taskCompositeScore: 90,
      origin,
      realTaskCertified: origin === 'user',
      demoTaskCertified: origin === 'demo',
      frozenFormalAttemptId: `formal-${task.taskId}-${index}`,
      frozenFormalScore: 90,
    })),
    projectCompositeScore: 90,
    projectCompositeOrigin: origin,
  };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadP1DemoContent } from '../features/platform/p1-content.ts';
import { buildP1PortfolioViewModel } from '../features/portfolio/p1-portfolio-model.ts';
import { p01OutputFieldKeys } from '../features/portfolio/p01-output-definition.ts';
import { migrateDatabase } from './db/migrations.ts';
import { seedDemo } from './db/demo-seed.ts';
import { createTestDatabase } from './db/test-database.ts';
import { readP1ProjectProjection } from './p1-project-projection.ts';
import { ProfessionalOutputRepository } from './professional-output-repository.ts';

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
    assert.equal(studentTwo.tasks[0].nextNodeId, 'P1T1-N04');
    assert.equal(studentThree.tasks[2].nextNodeId, undefined);
    assert.equal(studentTwo.tasks[0].outputOrigin, 'demo');
    assert.equal(studentThree.tasks.every(({ outputOrigin }) => outputOrigin === 'demo'), true);
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
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'projection-output-p01');
    const firstFields = completeP01Fields('v1');
    const draft = repository.saveDraft({
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 0,
      fields: firstFields,
      upstreamRefs: [],
    });
    const submitted = repository.submit({
      outputId: draft.head.outputId,
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 1,
      fields: draft.versions[0]!.fields,
      upstreamRefs: [],
    });
    const returned = repository.reviewSubmitted({
      teacherId: 'teacher-01',
      classId: 'demo-class',
      outputId: submitted.head.outputId,
      expectedStateRevision: 2,
      action: 'return',
      feedback: '补齐连接方向证据。',
    });
    const revised = repository.saveDraft({
      outputId: returned.output.head.outputId,
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 3,
      fields: { ...firstFields, connectionDirection: 'v2' },
      upstreamRefs: [],
    });
    repository.submit({
      outputId: revised.head.outputId,
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 4,
      fields: revised.versions.at(-1)!.fields,
      upstreamRefs: [],
    });

    const projection = readP1ProjectProjection('stu-01', fixture.database);
    const portfolio = buildP1PortfolioViewModel(projection);

    assert.equal(projection.tasks[0].currentOutputVersion, 2);
    assert.equal(projection.tasks[0].outputOrigin, 'user');
    assert.equal(projection.tasks[0].outputStatus, 'submitted');
    assert.equal(projection.tasks[0].teacherFeedback, undefined);
    assert.equal(projection.tasks[0].verifiedOutputReference, undefined);
    assert.equal(portfolio.items[0]?.versionLabel, 'v2');
    assert.equal(portfolio.items[0]?.teacherFeedback, '暂无教师反馈');
    assert.equal(portfolio.packageStatus, 'not-formed');
  } finally {
    fixture.cleanup();
  }
});

function completeP01Fields(value: string): Record<string, string> {
  return Object.fromEntries(p01OutputFieldKeys.map((fieldKey) => [fieldKey, `${value}: ${fieldKey}`]));
}

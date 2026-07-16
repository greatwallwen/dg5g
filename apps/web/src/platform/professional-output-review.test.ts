import assert from 'node:assert/strict';
import test from 'node:test';
import { seedBase } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { ProfessionalOutputRepository } from './professional-output-repository.ts';

test('teacher verification freezes 80/90 as 86 without changing the N02 attempt history', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'output-review-p01');
    const draft = repository.saveDraft({
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 0,
      fields: { evidencePackage: '已完成室内信息采集成果' },
      upstreamRefs: [],
    });
    const submitted = repository.submit({
      outputId: draft.head.outputId,
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: draft.head.stateRevision,
      fields: draft.versions[0]!.fields,
      upstreamRefs: [],
    });
    fixture.database.prepare(`
      INSERT INTO formal_attempts (attempt_id, student_id, node_id, game_id, score)
      VALUES ('attempt-review-80', 'stu-01', 'P1T1-N02', 'node-test', 80)
    `).run();
    const attemptsBefore = fixture.database.prepare(`
      SELECT attempt_id AS attemptId, score FROM formal_attempts
      WHERE student_id = 'stu-01' AND node_id = 'P1T1-N02' ORDER BY attempt_id
    `).all();
    const globalBefore = topicVersion('global');

    const result = repository.reviewSubmitted({
      teacherId: 'teacher-01',
      classId: 'demo-class',
      outputId: submitted.head.outputId,
      expectedStateRevision: submitted.head.stateRevision,
      action: 'verify',
      feedback: '证据完整，达到岗位交付标准。',
      rubricScores: { evidenceCompleteness: 40, professionalJudgement: 50 },
    });

    assert.equal(result.output.head.status, 'verified');
    assert.equal(result.output.head.stateRevision, submitted.head.stateRevision + 1);
    assert.equal(result.review.score, 90);
    assert.deepEqual(result.frozenTaskScore, {
      studentId: 'stu-01',
      taskId: 'P01',
      snapshotVersion: globalBefore + 1,
      provisionalScore: 86,
      officialScore: 86,
      details: {
        nodeId: 'P1T1-N02',
        nodeTestHighestScore: 80,
        outputId: submitted.head.outputId,
        outputVersion: 1,
        outputRubricScore: 90,
        rubricScores: { evidenceCompleteness: 40, professionalJudgement: 50 },
        taskCompositeScore: 86,
        weights: { nodeTest: 0.4, professionalOutput: 0.6 },
      },
    });
    assert.equal(topicVersion('global'), globalBefore + 1);
    assert.equal(topicVersion('learning:stu-01'), submitted.head.stateRevision + 1);
    assert.deepEqual(fixture.database.prepare(`
      SELECT attempt_id AS attemptId, score FROM formal_attempts
      WHERE student_id = 'stu-01' AND node_id = 'P1T1-N02' ORDER BY attempt_id
    `).all(), attemptsBefore);
  } finally {
    fixture.cleanup();
  }

  function topicVersion(topic: string): number {
    return fixture.database.prepare('SELECT version FROM snapshot_versions WHERE topic = ?')
      .pluck().get(topic) as number;
  }
});

test('teacher review queue contains only current submitted outputs from the teacher class', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const ids = ['submitted-stu-01', 'draft-stu-02'];
    const repository = new ProfessionalOutputRepository(fixture.database, () => ids.shift()!);
    const submittedDraft = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields: { result: 'stu-01 submitted result' }, upstreamRefs: [],
    });
    repository.submit({
      outputId: submittedDraft.head.outputId,
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 1,
      fields: submittedDraft.versions[0]!.fields, upstreamRefs: [],
    });
    repository.saveDraft({
      studentId: 'stu-02', taskId: 'P01', expectedStateRevision: 0,
      fields: { result: 'stu-02 draft result' }, upstreamRefs: [],
    });

    const queue = repository.listSubmittedForTeacher('teacher-01', 'demo-class');
    assert.equal(queue.length, 1);
    assert.deepEqual(queue[0], {
      outputId: 'submitted-stu-01',
      studentId: 'stu-01',
      studentName: '学生一',
      taskId: 'P01',
      nodeId: 'P1T1-N04',
      status: 'submitted',
      currentVersion: 1,
      stateRevision: 2,
      fields: { result: 'stu-01 submitted result' },
    });
    assert.deepEqual(repository.listSubmittedForTeacher('teacher-outside', 'demo-class'), []);
  } finally {
    fixture.cleanup();
  }
});

test('returning a submitted output records feedback and advances revision without freezing a score', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'output-return-p01');
    const draft = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields: { result: 'missing evidence index' }, upstreamRefs: [],
    });
    const submitted = repository.submit({
      outputId: draft.head.outputId,
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 1,
      fields: draft.versions[0]!.fields, upstreamRefs: [],
    });
    const globalBefore = topicVersion('global');
    const studentBefore = topicVersion('learning:stu-01');

    const result = repository.reviewSubmitted({
      teacherId: 'teacher-01',
      classId: 'demo-class',
      outputId: submitted.head.outputId,
      expectedStateRevision: submitted.head.stateRevision,
      action: 'return',
      feedback: '请补充照片编号与对象的一一对应关系。',
    });

    assert.equal(result.output.head.status, 'returned');
    assert.equal(result.output.head.stateRevision, 3);
    assert.deepEqual(result.review, {
      reviewId: 'output-return-p01:review:r3',
      outputId: 'output-return-p01',
      reviewerId: 'teacher-01',
      status: 'returned',
      feedback: '请补充照片编号与对象的一一对应关系。',
    });
    assert.equal(result.frozenTaskScore, undefined);
    assert.equal(topicVersion('global'), globalBefore + 1);
    assert.equal(topicVersion('learning:stu-01'), studentBefore + 1);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM frozen_task_scores WHERE student_id = 'stu-01' AND task_id = 'P01'
    `).pluck().get(), 0);
    assert.equal(repository.listSubmittedForTeacher('teacher-01', 'demo-class').length, 0);
  } finally {
    fixture.cleanup();
  }

  function topicVersion(topic: string): number {
    return fixture.database.prepare('SELECT version FROM snapshot_versions WHERE topic = ?')
      .pluck().get(topic) as number;
  }
});

test('portfolio facts expose the current head, current-version review, and frozen score without fields', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'portfolio-output-p01');
    const draft = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields: { privateEvidence: 'must not leave repository aggregate' }, upstreamRefs: [],
    });
    const submitted = repository.submit({
      outputId: draft.head.outputId,
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 1,
      fields: draft.versions[0]!.fields, upstreamRefs: [],
    });
    fixture.database.prepare(`
      INSERT INTO formal_attempts (attempt_id, student_id, node_id, score)
      VALUES ('portfolio-attempt', 'stu-01', 'P1T1-N02', 80)
    `).run();
    repository.reviewSubmitted({
      teacherId: 'teacher-01', classId: 'demo-class', outputId: submitted.head.outputId,
      expectedStateRevision: 2, action: 'verify', feedback: '通过', rubricScores: { result: 90 },
    });

    const facts = repository.readPortfolioFacts('stu-01');
    assert.equal(facts.length, 1);
    assert.equal('fields' in facts[0]!, false);
    assert.deepEqual(facts[0]!.review, {
      reviewId: 'portfolio-output-p01:review:r3',
      status: 'verified',
      score: 90,
      feedback: '通过',
    });
    assert.equal(facts[0]!.frozenTaskScore?.officialScore, 86);
    assert.deepEqual({
      taskId: facts[0]!.taskId,
      outputId: facts[0]!.outputId,
      currentVersion: facts[0]!.currentVersion,
      status: facts[0]!.status,
    }, {
      taskId: 'P01', outputId: 'portfolio-output-p01', currentVersion: 1, status: 'verified',
    });
  } finally {
    fixture.cleanup();
  }
});

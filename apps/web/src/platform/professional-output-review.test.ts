import assert from 'node:assert/strict';
import test from 'node:test';
import { seedBase } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { p01OutputFieldKeys } from '../features/portfolio/p01-output-definition.ts';
import { assessmentDimensionKeys } from './formal-assessment-contract.ts';
import {
  ProfessionalOutputNotFoundError,
  ProfessionalOutputRepository,
} from './professional-output-repository.ts';
import {
  completePolicyGaps,
  maximumPolicyRubricScores,
  seedLegalProfessionalOutputPracticeFacts,
  seedLegalProfessionalOutputSubmissionFacts,
} from './professional-output-policy-test-support.ts';
import { TeacherCertificationPolicyError } from './teacher-certification-policy.ts';

test('teacher verification freezes 80/100 as 92 without changing the N02 attempt history', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedLegalProfessionalOutputPracticeFacts(fixture.database, 'stu-01', 'P01');
    insertUserFormalAssessment(fixture.database, 'attempt-review-80', 80, '2026-07-16T08:00:00.000Z');
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'output-review-p01');
    const evidenceGaps = completePolicyGaps('P01');
    const draft = repository.saveDraft({
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 0,
      fields: completeP01Fields('已完成室内信息采集成果'),
      upstreamRefs: [],
      evidenceGaps,
    });
    const submitted = repository.submit({
      outputId: draft.head.outputId,
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: draft.head.stateRevision,
      fields: draft.versions[0]!.fields,
      upstreamRefs: [],
      evidenceGaps,
    });
    insertUserFormalAssessment(fixture.database, 'attempt-review-later-70', 70, '2026-07-16T09:00:00.000Z');
    const attemptsBefore = fixture.database.prepare(`
      SELECT attempt_id AS attemptId, score FROM formal_attempts
      WHERE student_id = 'stu-01' AND node_id = 'P1T1-N02' ORDER BY attempt_id
    `).all();
    const globalBefore = topicVersion('global');
    const rubricScores = maximumPolicyRubricScores('P01');

    const result = repository.reviewSubmitted({
      teacherId: 'teacher-01',
      classId: 'demo-class',
      outputId: submitted.head.outputId,
      expectedStateRevision: submitted.head.stateRevision,
      expectedOutputVersion: submitted.head.currentVersion,
      action: 'verify',
      feedback: '证据完整，达到岗位交付标准。',
      rubricScores,
    });

    assert.equal(result.output.head.status, 'verified');
    assert.equal(result.output.head.stateRevision, submitted.head.stateRevision + 1);
    assert.equal(result.review.score, 100);
    assert.deepEqual(result.frozenTaskScore, {
      studentId: 'stu-01',
      taskId: 'P01',
      snapshotVersion: globalBefore + 1,
      provisionalScore: 92,
      officialScore: 92,
      details: {
        reviewId: result.review.reviewId,
        formulaVersion: 'task-score-40-60-v1',
        nodeTestAttemptId: 'attempt-review-80',
        attemptId: 'attempt-review-80',
        assessmentId: 'assessment-attempt-review-80',
        questionVersion: 'p01-n02-v1',
        test: {
          nodeId: 'P1T1-N02',
          gameId: 'P1T1-N02-server-assessment',
          score: 80,
          weight: 0.4,
        },
        output: {
          outputId: submitted.head.outputId,
          version: 1,
          rubricScore: 100,
          weight: 0.6,
        },
        rubric: rubricScores,
        taskCompositeScore: 92,
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

test('teacher verification never launders a demo-only formal score into a user frozen task score', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'demo-score-output-p01');
    const fields = completeP01Fields('demo score must remain labelled');
    const evidenceGaps = completePolicyGaps('P01');
    repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields, upstreamRefs: [], evidenceGaps,
    });
    fixture.database.prepare(`
      UPDATE professional_outputs SET status = 'submitted', state_revision = 2
      WHERE output_id = 'demo-score-output-p01'
    `).run();
    fixture.database.prepare(`
      INSERT INTO formal_attempts (
        attempt_id, student_id, node_id, game_id, score, origin
      ) VALUES (
        'demo-only-formal-score', 'stu-01', 'P1T1-N02', 'node-test', 100, 'demo'
      )
    `).run();

    assert.throws(() => repository.reviewSubmitted({
      teacherId: 'teacher-01', classId: 'demo-class',
      outputId: 'demo-score-output-p01', expectedStateRevision: 2,
      expectedOutputVersion: 1,
      action: 'verify', feedback: '成果本身通过。',
      rubricScores: maximumPolicyRubricScores('P01'),
    }), TeacherCertificationPolicyError);

    assert.equal(repository.read('stu-01', 'P01')?.head.status, 'submitted');
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM frozen_task_scores
      WHERE student_id = 'stu-01' AND task_id = 'P01'
    `).pluck().get(), 0);
    assert.equal(fixture.database.prepare(`
      SELECT origin FROM formal_attempts WHERE attempt_id = 'demo-only-formal-score'
    `).pluck().get(), 'demo');
  } finally {
    fixture.cleanup();
  }
});

test('teacher review queue contains only current user-origin submitted outputs from the teacher class', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedLegalProfessionalOutputSubmissionFacts(fixture.database, 'stu-01');
    const ids = ['submitted-stu-01', 'draft-stu-02', 'demo-submitted-stu-03'];
    const repository = new ProfessionalOutputRepository(fixture.database, () => ids.shift()!);
    const submittedFields = completeP01Fields('stu-01 submitted result');
    const evidenceGaps = completePolicyGaps('P01');
    const submittedDraft = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields: submittedFields, upstreamRefs: [], evidenceGaps,
    });
    repository.submit({
      outputId: submittedDraft.head.outputId,
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 1,
      fields: submittedDraft.versions[0]!.fields, upstreamRefs: [], evidenceGaps,
    });
    repository.saveDraft({
      studentId: 'stu-02', taskId: 'P01', expectedStateRevision: 0,
      fields: completeP01Fields('stu-02 draft result'), upstreamRefs: [],
    });
    repository.saveDraft({
      studentId: 'stu-03', taskId: 'P01', expectedStateRevision: 0,
      fields: completeP01Fields('stu-03 demo submitted result'), upstreamRefs: [],
    });
    fixture.database.prepare(`
      UPDATE professional_outputs
      SET status = 'submitted', origin = 'demo'
      WHERE output_id = 'demo-submitted-stu-03'
    `).run();

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
      fields: submittedFields,
    });
    assert.deepEqual(repository.listSubmittedForTeacher('teacher-outside', 'demo-class'), []);
  } finally {
    fixture.cleanup();
  }
});

test('direct teacher review rejects a demo submitted output without a user review, event, or frozen score', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedLegalProfessionalOutputSubmissionFacts(fixture.database, 'stu-01');
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'demo-review-p01');
    repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields: completeP01Fields('demo output must stay read-only'), upstreamRefs: [],
      evidenceGaps: completePolicyGaps('P01'),
    });
    fixture.database.prepare(`
      UPDATE professional_outputs
      SET status = 'submitted', origin = 'demo'
      WHERE output_id = 'demo-review-p01'
    `).run();
    const before = reviewMutationFacts(fixture.database, 'demo-review-p01');

    assert.throws(() => repository.reviewSubmitted({
      teacherId: 'teacher-01', classId: 'demo-class', outputId: 'demo-review-p01',
      expectedStateRevision: 1, expectedOutputVersion: 1,
      action: 'verify', feedback: 'Demo output cannot become a user certification.',
      rubricScores: maximumPolicyRubricScores('P01'),
    }), ProfessionalOutputNotFoundError);

    assert.deepEqual(reviewMutationFacts(fixture.database, 'demo-review-p01'), before);
  } finally {
    fixture.cleanup();
  }
});

test('returning a submitted output records feedback and advances revision without freezing a score', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedLegalProfessionalOutputSubmissionFacts(fixture.database, 'stu-01');
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'output-return-p01');
    const evidenceGaps = completePolicyGaps('P01');
    const draft = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields: completeP01Fields('missing evidence index'), upstreamRefs: [], evidenceGaps,
    });
    const submitted = repository.submit({
      outputId: draft.head.outputId,
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 1,
      fields: draft.versions[0]!.fields, upstreamRefs: [], evidenceGaps,
    });
    const globalBefore = topicVersion('global');
    const studentBefore = topicVersion('learning:stu-01');

    const result = repository.reviewSubmitted({
      teacherId: 'teacher-01',
      classId: 'demo-class',
      outputId: submitted.head.outputId,
      expectedStateRevision: submitted.head.stateRevision,
      expectedOutputVersion: submitted.head.currentVersion,
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
    seedLegalProfessionalOutputPracticeFacts(fixture.database, 'stu-01', 'P01');
    insertUserFormalAssessment(fixture.database, 'portfolio-attempt', 80, '2026-07-16T08:00:00.000Z');
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'portfolio-output-p01');
    const evidenceGaps = completePolicyGaps('P01');
    const draft = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields: completeP01Fields('must not leave repository aggregate'), upstreamRefs: [], evidenceGaps,
    });
    const submitted = repository.submit({
      outputId: draft.head.outputId,
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 1,
      fields: draft.versions[0]!.fields, upstreamRefs: [], evidenceGaps,
    });
    repository.reviewSubmitted({
      teacherId: 'teacher-01', classId: 'demo-class', outputId: submitted.head.outputId,
      expectedStateRevision: 2, expectedOutputVersion: 1,
      action: 'verify', feedback: '通过', rubricScores: maximumPolicyRubricScores('P01'),
    });

    const facts = repository.readPortfolioFacts('stu-01');
    assert.equal(facts.length, 1);
    assert.equal('fields' in facts[0]!, false);
    assert.deepEqual(facts[0]!.review, {
      reviewId: 'portfolio-output-p01:review:r3',
      status: 'verified',
      score: 100,
      feedback: '通过',
    });
    assert.equal(facts[0]!.frozenTaskScore?.officialScore, 92);
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

function completeP01Fields(value: string): Record<string, string> {
  return Object.fromEntries(p01OutputFieldKeys.map((fieldKey) => [fieldKey, `${value}: ${fieldKey}`]));
}

function reviewMutationFacts(
  database: ReturnType<typeof createTestDatabase>['database'],
  outputId: string,
): Record<string, unknown> {
  return {
    head: database.prepare(`
      SELECT status, state_revision AS stateRevision, origin
      FROM professional_outputs WHERE output_id = ?
    `).get(outputId),
    reviews: database.prepare(`
      SELECT COUNT(*) FROM output_reviews WHERE output_id = ? AND origin = 'user'
    `).pluck().get(outputId),
    events: database.prepare(`
      SELECT COUNT(*) FROM learning_events
      WHERE json_extract(payload_json, '$.outputId') = ? AND origin = 'user'
    `).pluck().get(outputId),
    frozen: database.prepare(`
      SELECT COUNT(*) FROM frozen_task_scores
      WHERE student_id = 'stu-01' AND task_id = 'P01' AND origin = 'user'
    `).pluck().get(),
    learningSnapshot: database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'learning:stu-01'
    `).pluck().get(),
    globalSnapshot: database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'global'
    `).pluck().get(),
  };
}

function insertUserFormalAssessment(
  database: ReturnType<typeof createTestDatabase>['database'],
  attemptId: string,
  score: number,
  completedAt: string,
): void {
  const assessmentId = `assessment-${attemptId}`;
  database.prepare(`
    INSERT INTO formal_assessment_instances (
      assessment_id, node_id, game_id, question_version, status, closed_at
    ) VALUES (?, 'P1T1-N02', 'P1T1-N02-server-assessment', 'p01-n02-v1', 'closed', ?)
  `).run(assessmentId, completedAt);
  const dimensions = Object.fromEntries(assessmentDimensionKeys.map((key) => [key, {
    score: score / 4, maxScore: 25, feedback: `${key} feedback`,
  }]));
  database.prepare(`
    INSERT INTO formal_attempts (
      attempt_id, student_id, node_id, assessment_id, game_id, score,
      completed_at, question_version, answers_json, diagnostics_json, origin
    ) VALUES (?, 'stu-01', 'P1T1-N02', ?, 'P1T1-N02-server-assessment', ?, ?, 'p01-n02-v1', '{}', ?, 'user')
  `).run(attemptId, assessmentId, score, completedAt, JSON.stringify({
    assessmentId, attemptId, studentId: 'stu-01', nodeId: 'P1T1-N02',
    gameId: 'P1T1-N02-server-assessment', questionVersion: 'p01-n02-v1',
    totalScore: score, passed: score >= 80, dimensions, remediationTargets: [],
    origin: 'user', completedAt,
  }));
}

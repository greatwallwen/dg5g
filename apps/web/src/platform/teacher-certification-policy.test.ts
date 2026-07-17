import assert from 'node:assert/strict';
import test from 'node:test';
import { professionalOutputSchemaForTask } from '../features/portfolio/output-schema.ts';
import { loadSelfStudyCatalog } from '../features/textbook-scene/self-study-content.ts';
import { assessmentDimensionKeys } from './formal-assessment-contract.ts';
import { getFormalAssessmentDefinition } from './formal-assessment-catalog.server.ts';
import { seedBase } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import {
  ProfessionalOutputRepository,
  type ReviewProfessionalOutputInput,
} from './professional-output-repository.ts';
import { ProfessionalOutputPortfolioReader } from './professional-output-portfolio-reader.ts';
import {
  assertTeacherCertificationPolicy,
  TeacherCertificationPolicyError,
} from './teacher-certification-policy.ts';

test('teacher certification policy independently rejects a demo-origin output head', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    insertSubmittedOutput(fixture.database, 'cert-policy-demo-origin');
    fixture.database.prepare(`
      UPDATE professional_outputs SET origin = 'demo'
      WHERE output_id = 'cert-policy-demo-origin'
    `).run();
    const head = {
      outputId: 'cert-policy-demo-origin', studentId: 'stu-01', taskId: 'P01' as const,
      currentVersion: 1, origin: 'demo' as const,
    };

    assert.throws(() => assertTeacherCertificationPolicy(fixture.database, head, {
      teacherId: 'teacher-01', classId: 'demo-class', outputId: head.outputId,
      expectedStateRevision: 2, expectedOutputVersion: 1,
      action: 'return', feedback: 'Replace the missing field evidence before resubmitting.',
      annotations: {},
    }), TeacherCertificationPolicyError);
  } finally {
    fixture.cleanup();
  }
});

test('teacher verify rejects a non-catalog rubric before review, head, score, event, or snapshot writes', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    insertSubmittedOutput(fixture.database, 'cert-policy-rubric');
    const repository = new ProfessionalOutputRepository(fixture.database);
    const before = certificationFacts(fixture.database, 'cert-policy-rubric');

    assert.throws(() => repository.reviewSubmitted({
      teacherId: 'teacher-01',
      classId: 'demo-class',
      outputId: 'cert-policy-rubric',
      expectedStateRevision: 2,
      expectedOutputVersion: 1,
      action: 'verify',
      rubricScores: { forgedCriterion: 90 },
    }), /rubric|criterion/i);

    assert.deepEqual(certificationFacts(fixture.database, 'cert-policy-rubric'), before);
  } finally {
    fixture.cleanup();
  }
});

test('teacher return rejects annotations for unknown output fields before every durable write', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    insertSubmittedOutput(fixture.database, 'cert-policy-annotation');
    const repository = new ProfessionalOutputRepository(fixture.database);
    const before = certificationFacts(fixture.database, 'cert-policy-annotation');
    const command = {
      teacherId: 'teacher-01',
      classId: 'demo-class',
      outputId: 'cert-policy-annotation',
      expectedStateRevision: 2,
      expectedOutputVersion: 1,
      action: 'return',
      feedback: '请按字段批注修订后再次提交。',
      annotations: { forgedField: '不存在的成果字段。' },
    } as unknown as ReviewProfessionalOutputInput;

    assert.throws(() => repository.reviewSubmitted(command), /annotation|field/i);
    assert.deepEqual(certificationFacts(fixture.database, 'cert-policy-annotation'), before);
  } finally {
    fixture.cleanup();
  }
});

test('teacher verify atomically persists field annotations and a 40/60 frozen audit snapshot', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    insertSubmittedOutput(fixture.database, 'cert-policy-valid');
    insertUserFormalAssessment(fixture.database, 'cert-valid-80', 80, 'p01-n02-v1');
    const repository = new ProfessionalOutputRepository(fixture.database);
    const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01');
    const rubricScores = maximumRubricScores();
    const before = certificationFacts(fixture.database, 'cert-policy-valid');

    const result = repository.reviewSubmitted({
      teacherId: 'teacher-01',
      classId: 'demo-class',
      outputId: 'cert-policy-valid',
      expectedStateRevision: 2,
      expectedOutputVersion: 1,
      action: 'verify',
      feedback: '证据链完整，字段与照片索引可以复核。',
      rubricScores,
      annotations: {
        [schema.fields[0]!.key]: '位置证据已完成交叉核验。',
      },
    } as ReviewProfessionalOutputInput);

    assert.equal(result.output.head.status, 'verified');
    assert.deepEqual(fixture.database.prepare(`
      SELECT status, score, origin FROM output_reviews WHERE review_id = ?
    `).get(result.review.reviewId), { status: 'verified', score: 100, origin: 'user' });
    assert.deepEqual(fixture.database.prepare(`
      SELECT field_key AS fieldKey, comment
      FROM output_review_annotations WHERE review_id = ?
    `).all(result.review.reviewId), [{
      fieldKey: schema.fields[0]!.key,
      comment: '位置证据已完成交叉核验。',
    }]);
    assert.deepEqual(result.frozenTaskScore?.details, {
      reviewId: result.review.reviewId,
      formulaVersion: 'task-score-40-60-v1',
      nodeTestAttemptId: 'cert-valid-80',
      attemptId: 'cert-valid-80',
      assessmentId: 'assessment-cert-valid-80',
      questionVersion: 'p01-n02-v1',
      test: {
        nodeId: 'P1T1-N02',
        gameId: 'P1T1-N02-server-assessment',
        score: 80,
        weight: 0.4,
      },
      output: {
        outputId: 'cert-policy-valid',
        version: 1,
        rubricScore: 100,
        weight: 0.6,
      },
      rubric: rubricScores,
      taskCompositeScore: 92,
    });
    const after = certificationFacts(fixture.database, 'cert-policy-valid');
    assert.deepEqual(after.head, { status: 'verified', currentVersion: 1, stateRevision: 3 });
    assert.equal(after.reviews, 1);
    assert.equal(after.annotations, 1);
    assert.equal(after.frozen, 1);
    assert.equal(after.events, 1);
    assert.equal(after.learningSnapshot, Number(before.learningSnapshot) + 1);
    assert.equal(after.globalSnapshot, Number(before.globalSnapshot) + 1);
    const frozenBeforeLaterTest = fixture.database.prepare(`
      SELECT score_id AS scoreId, snapshot_version AS snapshotVersion,
        official_score AS officialScore, details_json AS detailsJson
      FROM frozen_task_scores WHERE student_id = 'stu-01' AND task_id = 'P01'
    `).get();
    insertUserFormalAssessment(fixture.database, 'cert-later-100', 100, 'p01-n02-v1');
    fixture.database.prepare(`
      UPDATE formal_attempts
      SET completed_at = '2026-07-16T09:00:00.000Z',
        diagnostics_json = json_set(
          diagnostics_json, '$.completedAt', '2026-07-16T09:00:00.000Z'
        )
      WHERE attempt_id = 'cert-later-100'
    `).run();
    fixture.database.prepare(`
      UPDATE formal_assessment_instances SET closed_at = '2026-07-16T09:00:00.000Z'
      WHERE assessment_id = 'assessment-cert-later-100'
    `).run();
    assert.equal(
      new ProfessionalOutputPortfolioReader(fixture.database).read('stu-01', 'P01')
        .assessment?.attemptId,
      'cert-valid-80',
    );
    assert.throws(() => repository.reviewSubmitted({
      teacherId: 'teacher-01', classId: 'demo-class', outputId: 'cert-policy-valid',
      expectedStateRevision: 3, expectedOutputVersion: 1,
      action: 'verify', rubricScores,
    }), /status verified|cannot be changed/i);
    assert.deepEqual(fixture.database.prepare(`
      SELECT score_id AS scoreId, snapshot_version AS snapshotVersion,
        official_score AS officialScore, details_json AS detailsJson
      FROM frozen_task_scores WHERE student_id = 'stu-01' AND task_id = 'P01'
    `).get(), frozenBeforeLaterTest);
  } finally {
    fixture.cleanup();
  }
});

test('teacher certification rejection matrix leaves every review fact unchanged', () => {
  const invalidities = [
    'rubric-missing', 'rubric-extra', 'rubric-over-max',
    'rubric-total-79', 'rubric-dimension',
    'vague-return', 'formal-none', 'formal-invalid', 'formal-demo',
    'old-version', 'stale-cas',
  ] as const;
  for (const invalidity of invalidities) {
    const fixture = createTestDatabase();
    try {
      migrateDatabase(fixture.database);
      seedBase(fixture.database);
      const outputId = `cert-policy-${invalidity}`;
      insertSubmittedOutput(fixture.database, outputId);
      if (invalidity !== 'formal-none') {
        insertUserFormalAssessment(
          fixture.database,
          `cert-${invalidity}`,
          invalidity === 'formal-invalid' ? 100 : 80,
          invalidity === 'formal-invalid' ? 'forged-v9' : 'p01-n02-v1',
          invalidity === 'formal-demo' ? 'demo' : 'user',
        );
      }
      const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01');
      const weakDimension = schema.rubric[0]!;
      const rubricScores = maximumRubricScores();
      if (invalidity === 'rubric-missing') delete rubricScores[weakDimension.criterion];
      if (invalidity === 'rubric-extra') rubricScores.forgedCriterion = 1;
      if (invalidity === 'rubric-over-max') {
        rubricScores[weakDimension.criterion] = weakDimension.maxScore + 1;
      }
      if (invalidity === 'rubric-total-79') {
        Object.assign(rubricScores, rubricTotal79());
      }
      if (invalidity === 'rubric-dimension') {
        rubricScores[weakDimension.criterion] = weakDimension.maxScore / 2 - 1;
      }
      if (invalidity === 'old-version') appendSubmittedVersion(fixture.database, outputId);
      const command = invalidity === 'vague-return'
        ? {
            teacherId: 'teacher-01', classId: 'demo-class', outputId,
            expectedStateRevision: 2, expectedOutputVersion: 1,
            action: 'return', feedback: '退回',
          }
        : {
            teacherId: 'teacher-01', classId: 'demo-class', outputId,
            expectedStateRevision: invalidity === 'old-version' ? 3
              : invalidity === 'stale-cas' ? 1 : 2,
            expectedOutputVersion: 1,
            action: 'verify', rubricScores,
          };
      const repository = new ProfessionalOutputRepository(fixture.database);
      const before = certificationFacts(fixture.database, outputId);

      assert.throws(
        () => repository.reviewSubmitted(command as ReviewProfessionalOutputInput),
        /rubric|criterion|feedback|formal|assessment|catalog|question|version|revision|conflict/i,
        invalidity,
      );
      assert.deepEqual(certificationFacts(fixture.database, outputId), before, invalidity);
    } finally {
      fixture.cleanup();
    }
  }
});

function insertSubmittedOutput(
  database: ReturnType<typeof createTestDatabase>['database'],
  outputId: string,
): void {
  const fields = Object.fromEntries(
    professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01').fields
      .map(({ key }) => [key, `已完成：${key}`]),
  );
  const fieldsJson = JSON.stringify(fields);
  database.prepare(`
    INSERT INTO professional_outputs (
      output_id, student_id, task_id, node_id, status, content_json,
      current_version, state_revision, origin
    ) VALUES (?, 'stu-01', 'P01', 'P1T1-N04', 'submitted', ?, 1, 2, 'user')
  `).run(outputId, fieldsJson);
  database.prepare(`
    INSERT INTO professional_output_versions (
      output_id, task_id, version, schema_version, fields_json, upstream_refs_json
    ) VALUES (?, 'P01', 1, 1, ?, '[]')
  `).run(outputId, fieldsJson);
}

function certificationFacts(
  database: ReturnType<typeof createTestDatabase>['database'],
  outputId: string,
): Record<string, unknown> {
  return {
    head: database.prepare(`
      SELECT status, current_version AS currentVersion, state_revision AS stateRevision
      FROM professional_outputs WHERE output_id = ?
    `).get(outputId),
    reviews: database.prepare(`
      SELECT COUNT(*) FROM output_reviews WHERE output_id = ?
    `).pluck().get(outputId),
    annotations: database.prepare(`
      SELECT COUNT(*) FROM output_review_annotations
      WHERE review_id IN (SELECT review_id FROM output_reviews WHERE output_id = ?)
    `).pluck().get(outputId),
    frozen: database.prepare(`
      SELECT COUNT(*) FROM frozen_task_scores WHERE student_id = 'stu-01' AND task_id = 'P01'
    `).pluck().get(),
    events: database.prepare(`
      SELECT COUNT(*) FROM learning_events
      WHERE json_extract(payload_json, '$.outputId') = ?
    `).pluck().get(outputId),
    learningSnapshot: database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'learning:stu-01'
    `).pluck().get(),
    globalSnapshot: database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'global'
    `).pluck().get(),
  };
}

function maximumRubricScores(): Record<string, number> {
  return Object.fromEntries(
    professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01').rubric
      .map(({ criterion, maxScore }) => [criterion, maxScore]),
  );
}

function rubricTotal79(): Record<string, number> {
  const rubric = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01').rubric;
  return Object.fromEntries(rubric.map(({ criterion, maxScore }, index) => [
    criterion,
    index < 2 ? maxScore / 2 : index === rubric.length - 1 ? maxScore - 1 : maxScore,
  ]));
}

function insertUserFormalAssessment(
  database: ReturnType<typeof createTestDatabase>['database'],
  attemptId: string,
  score: number,
  questionVersion: string,
  origin: 'demo' | 'user' = 'user',
): void {
  const definition = getFormalAssessmentDefinition('P1T1-N02');
  assert.ok(definition);
  const assessmentId = `assessment-${attemptId}`;
  const completedAt = '2026-07-16T08:00:00.000Z';
  database.prepare(`
    INSERT INTO formal_assessment_instances (
      assessment_id, node_id, game_id, question_version, status, closed_at
    ) VALUES (?, 'P1T1-N02', ?, ?, 'closed', ?)
  `).run(assessmentId, definition.gameId, questionVersion, completedAt);
  const dimensions = Object.fromEntries(assessmentDimensionKeys.map((key) => [key, {
    score: score / 4,
    maxScore: 25,
    feedback: `${key} feedback`,
  }]));
  database.prepare(`
    INSERT INTO formal_attempts (
      attempt_id, student_id, node_id, assessment_id, game_id, score,
      completed_at, question_version, answers_json, diagnostics_json, origin
    ) VALUES (?, 'stu-01', 'P1T1-N02', ?, ?, ?, ?, ?, '{}', ?, ?)
  `).run(
    attemptId,
    assessmentId,
    definition.gameId,
    score,
    completedAt,
    questionVersion,
    JSON.stringify({
      assessmentId,
      attemptId,
      studentId: 'stu-01',
      nodeId: 'P1T1-N02',
      gameId: definition.gameId,
      questionVersion,
      totalScore: score,
      passed: score >= 80,
      dimensions,
      remediationTargets: [],
      origin,
      completedAt,
    }),
    origin,
  );
}

function appendSubmittedVersion(
  database: ReturnType<typeof createTestDatabase>['database'],
  outputId: string,
): void {
  const fieldsJson = JSON.stringify(Object.fromEntries(
    professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01').fields
      .map(({ key }) => [key, `第二版：${key}`]),
  ));
  database.prepare(`
    INSERT INTO professional_output_versions (
      output_id, task_id, version, schema_version, fields_json, upstream_refs_json
    ) VALUES (?, 'P01', 2, 1, ?, '[]')
  `).run(outputId, fieldsJson);
  database.prepare(`
    UPDATE professional_outputs
    SET content_json = ?, current_version = 2, state_revision = 3
    WHERE output_id = ?
  `).run(fieldsJson, outputId);
}

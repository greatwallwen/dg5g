import assert from 'node:assert/strict';
import test from 'node:test';
import { p1Activities } from '../features/learning-activities/activity-catalog.ts';
import { ActivityRepository } from '../features/learning-activities/activity-repository.ts';
import { professionalOutputSchemaForTask } from '../features/portfolio/output-schema.ts';
import { loadSelfStudyCatalog } from '../features/textbook-scene/self-study-content.ts';
import { assessmentDimensionKeys } from './formal-assessment-contract.ts';
import { getFormalAssessmentDefinition } from './formal-assessment-catalog.server.ts';
import { seedBase } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import {
  describeLearningCommandError,
  parseProfessionalOutputCommand,
} from './learning-command-service.ts';
import { ProfessionalOutputRepository } from './professional-output-repository.ts';
import { ProfessionalOutputSubmissionPolicyError } from './professional-output-submission-policy.ts';

test('professional output command parser preserves evidence gaps for the repository policy', () => {
  assert.deepEqual(parseProfessionalOutputCommand({
    expectedStateRevision: 0,
    fields: { deviceIdentity: 'BBU-01' },
    upstreamRefs: [],
    evidenceLinks: {},
    evidenceGaps: {
      deviceIdentity: {
        gapText: '铭牌被遮挡',
        nextActionText: '补拍铭牌并复核台账',
      },
    },
  }).evidenceGaps, {
    deviceIdentity: {
      gapText: '铭牌被遮挡',
      nextActionText: '补拍铭牌并复核台账',
    },
  });
});

test('submission policy failures map to an explicit unprocessable API problem', () => {
  assert.deepEqual(
    describeLearningCommandError(new ProfessionalOutputSubmissionPolicyError('submission blocked')),
    { status: 422, body: { error: 'submission blocked' } },
  );
});

test('submit rejects fields without evidence or a complete gap before every durable write', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ProfessionalOutputRepository(
      fixture.database,
      () => 'submission-policy-no-evidence',
    );
    const before = mutationCounts(fixture.database, 'stu-01');

    assert.throws(() => repository.submit({
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 0,
      fields: completeFields('P01'),
      upstreamRefs: [],
      evidenceLinks: {},
      evidenceGaps: {},
    }), /evidence/i);

    assert.deepEqual(mutationCounts(fixture.database, 'stu-01'), before);
  } finally {
    fixture.cleanup();
  }
});

test('valid submit emits one exact canonical user event after truthful user prerequisites', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedP01UserActivities(fixture.database);
    insertUserFormalAssessment(fixture.database, {
      taskId: 'P01',
      attemptId: 'submission-valid-formal',
      score: 80,
      questionVersion: 'p01-n02-v1',
    });
    const repository = new ProfessionalOutputRepository(
      fixture.database,
      () => 'submission-policy-valid',
    );

    const submitted = repository.submit({
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 0,
      fields: completeFields('P01'),
      upstreamRefs: [],
      evidenceLinks: {},
      evidenceGaps: completeGaps('P01'),
    });

    assert.equal(submitted.head.status, 'submitted');
    assert.deepEqual(fixture.database.prepare(`
      SELECT event_type AS eventType, origin, payload_json AS payloadJson
      FROM learning_events
      WHERE json_extract(payload_json, '$.outputId') = 'submission-policy-valid'
    `).all().map((row) => {
      const event = row as { eventType: string; origin: string; payloadJson: string };
      return { eventType: event.eventType, origin: event.origin, payload: JSON.parse(event.payloadJson) };
    }), [{
      eventType: 'evidence_submitted',
      origin: 'user',
      payload: {
        outputId: 'submission-policy-valid',
        taskId: 'P01',
        version: 1,
        stateRevision: 1,
      },
    }]);
  } finally {
    fixture.cleanup();
  }
});

test('submit requires current-task N01 through N04 user practice facts and a valid formal pass', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ProfessionalOutputRepository(
      fixture.database,
      () => 'submission-policy-no-prerequisites',
    );
    const before = mutationCounts(fixture.database, 'stu-01');

    assert.throws(() => repository.submit({
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 0,
      fields: completeFields('P01'),
      upstreamRefs: [],
      evidenceLinks: {},
      evidenceGaps: completeGaps('P01'),
    }), /activity|practice|source|formal|assessment/i);
    assert.deepEqual(mutationCounts(fixture.database, 'stu-01'), before);
  } finally {
    fixture.cleanup();
  }
});

test('submit rejects demo-only provenance and a catalog-unknown formal assessment with zero writes', () => {
  for (const invalidity of ['demo-sources', 'unknown-question-version'] as const) {
    const fixture = createTestDatabase();
    try {
      migrateDatabase(fixture.database);
      seedBase(fixture.database);
      seedP01UserActivities(fixture.database);
      if (invalidity === 'demo-sources') {
        fixture.database.prepare(`
          UPDATE practice_attempts SET origin = 'demo'
          WHERE student_id = 'stu-01' AND node_id IN ('P1T1-N01', 'P1T1-N02', 'P1T1-N03')
        `).run();
      }
      insertUserFormalAssessment(fixture.database, {
        taskId: 'P01',
        attemptId: `submission-${invalidity}`,
        score: 100,
        questionVersion: invalidity === 'unknown-question-version' ? 'forged-v9' : 'p01-n02-v1',
      });
      const outputId = `submission-policy-${invalidity}`;
      const repository = new ProfessionalOutputRepository(fixture.database, () => outputId);
      const before = mutationCounts(fixture.database, 'stu-01');

      assert.throws(() => repository.submit({
        studentId: 'stu-01',
        taskId: 'P01',
        expectedStateRevision: 0,
        fields: completeFields('P01'),
        upstreamRefs: [],
        evidenceLinks: {},
        evidenceGaps: completeGaps('P01'),
      }), /user|source|formal|assessment|catalog|question/i, invalidity);
      assert.deepEqual(mutationCounts(fixture.database, 'stu-01'), before, invalidity);
    } finally {
      fixture.cleanup();
    }
  }
});

test('an upstream-only change is a material returned-output revision', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedGeneratedTaskUserActivities(fixture.database, 'P03');
    insertUserFormalAssessment(fixture.database, {
      taskId: 'P03',
      attemptId: 'submission-p03-formal',
      score: 80,
      questionVersion: 'p03-n02-v1',
    });
    insertReturnedP03WithAdvancedP02(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database);

    const result = repository.submit({
      outputId: 'submission-returned-p03',
      studentId: 'stu-01',
      taskId: 'P03',
      expectedStateRevision: 3,
      fields: completeFields('P03'),
      upstreamRefs: [{ outputId: 'submission-upstream-p02', version: 2 }],
      evidenceLinks: {},
      evidenceGaps: completeGaps('P03'),
    });

    assert.equal(result.head.status, 'submitted');
    assert.equal(result.head.currentVersion, 2);
    assert.deepEqual(result.versions[1]?.upstreamRefs, [
      { outputId: 'submission-upstream-p02', version: 2 },
    ]);
  } finally {
    fixture.cleanup();
  }
});

test('submission prerequisite matrix rejects each missing user node, missing source, partial gap, and score 79 with zero writes', () => {
  const invalidities = [
    'missing-N01', 'missing-N02', 'missing-N03', 'missing-N04',
    'missing-source', 'partial-gap', 'formal-79',
  ] as const;
  for (const invalidity of invalidities) {
    const fixture = createTestDatabase();
    try {
      migrateDatabase(fixture.database);
      seedBase(fixture.database);
      seedP01UserActivities(fixture.database);
      insertUserFormalAssessment(fixture.database, {
        taskId: 'P01',
        attemptId: `submission-${invalidity}`,
        score: invalidity === 'formal-79' ? 79 : 80,
        questionVersion: 'p01-n02-v1',
      });
      if (invalidity.startsWith('missing-N')) {
        fixture.database.prepare(`
          DELETE FROM practice_attempts WHERE student_id = 'stu-01' AND node_id = ?
        `).run(`P1T1-${invalidity.slice(8)}`);
      }
      if (invalidity === 'missing-source') {
        fixture.database.prepare(`
          UPDATE practice_attempts SET artifact_json = '{}'
          WHERE student_id = 'stu-01' AND node_id = 'P1T1-N03'
        `).run();
      }
      const gaps = completeGaps('P01');
      if (invalidity === 'partial-gap') gaps.siteRoom!.nextActionText = '';
      const outputId = `submission-policy-${invalidity}`;
      const repository = new ProfessionalOutputRepository(fixture.database, () => outputId);
      const before = mutationCounts(fixture.database, 'stu-01');

      assert.throws(() => repository.submit({
        studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
        fields: completeFields('P01'), upstreamRefs: [], evidenceLinks: {}, evidenceGaps: gaps,
      }), /activity|practice|source|evidence|formal|assessment|80/i, invalidity);
      assert.deepEqual(mutationCounts(fixture.database, 'stu-01'), before, invalidity);
    } finally {
      fixture.cleanup();
    }
  }
});

test('P02 and P03 reject draft, returned, historical, other-student, and demo upstreams with zero writes', () => {
  const cases = [
    'draft', 'returned', 'historical', 'other-student', 'demo-submitted', 'demo-verified',
  ] as const;
  for (const taskId of ['P02', 'P03'] as const) {
    for (const invalidity of cases) {
      const fixture = createTestDatabase();
      try {
        migrateDatabase(fixture.database);
        seedBase(fixture.database);
        seedGeneratedTaskUserActivities(fixture.database, taskId);
        insertUserFormalAssessment(fixture.database, {
          taskId,
          attemptId: `submission-${taskId}-${invalidity}`,
          score: 80,
          questionVersion: taskId === 'P02' ? 'p02-n02-v1' : 'p03-n02-v1',
        });
        const upstreamId = `submission-upstream-${taskId}-${invalidity}`;
        const upstreamTask = taskId === 'P02' ? 'P01' : 'P02';
        insertUpstreamHead(fixture.database, {
          outputId: upstreamId,
          taskId: upstreamTask,
          studentId: invalidity === 'other-student' ? 'stu-02' : 'stu-01',
          status: invalidity === 'demo-verified' ? 'verified'
            : invalidity === 'returned' ? 'returned'
            : invalidity === 'draft' ? 'draft' : 'submitted',
          currentVersion: invalidity === 'historical' ? 2 : 1,
          origin: invalidity.startsWith('demo-') ? 'demo' : 'user',
        });
        const targetId = `submission-target-${taskId}-${invalidity}`;
        const repository = new ProfessionalOutputRepository(fixture.database, () => targetId);
        const before = mutationCounts(fixture.database, 'stu-01');

        assert.throws(() => repository.submit({
          studentId: 'stu-01', taskId, expectedStateRevision: 0,
          fields: completeFields(taskId),
          upstreamRefs: [{ outputId: upstreamId, version: 1 }],
          evidenceLinks: {}, evidenceGaps: completeGaps(taskId),
        }), /upstream|current|submitted|verified|student/i, `${taskId}:${invalidity}`);
        assert.deepEqual(mutationCounts(fixture.database, 'stu-01'), before, `${taskId}:${invalidity}`);
      } finally {
        fixture.cleanup();
      }
    }
  }
});

test('stale CAS and an unchanged returned output fail without changing any durable fact', () => {
  for (const invalidity of ['stale-cas', 'returned-unchanged'] as const) {
    const fixture = createTestDatabase();
    try {
      migrateDatabase(fixture.database);
      seedBase(fixture.database);
      seedP01UserActivities(fixture.database);
      insertUserFormalAssessment(fixture.database, {
        taskId: 'P01', attemptId: `submission-${invalidity}`,
        score: 80, questionVersion: 'p01-n02-v1',
      });
      const repository = new ProfessionalOutputRepository(fixture.database, () => `submission-${invalidity}`);
      const draft = repository.saveDraft({
        studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
        fields: completeFields('P01'), upstreamRefs: [], evidenceLinks: {}, evidenceGaps: completeGaps('P01'),
      });
      if (invalidity === 'returned-unchanged') {
        fixture.database.prepare(`
          UPDATE professional_outputs SET status = 'returned', state_revision = 3
          WHERE output_id = ?
        `).run(draft.head.outputId);
      }
      const before = mutationCounts(fixture.database, 'stu-01');

      assert.throws(() => repository.submit({
        outputId: draft.head.outputId,
        studentId: 'stu-01', taskId: 'P01',
        expectedStateRevision: invalidity === 'stale-cas' ? 0 : 3,
        fields: completeFields('P01'), upstreamRefs: [], evidenceLinks: {}, evidenceGaps: completeGaps('P01'),
      }), /revision|conflict/i, invalidity);
      assert.deepEqual(mutationCounts(fixture.database, 'stu-01'), before, invalidity);
    } finally {
      fixture.cleanup();
    }
  }
});

test('a persisted other-student source cannot be laundered through a truthful current draft', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedP01UserActivities(fixture.database);
    insertUserFormalAssessment(fixture.database, {
      taskId: 'P01', attemptId: 'submission-other-source-formal',
      score: 80, questionVersion: 'p01-n02-v1',
    });
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'submission-other-source');
    const draft = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields: completeFields('P01'), upstreamRefs: [], evidenceLinks: {}, evidenceGaps: completeGaps('P01'),
    });
    fixture.database.prepare(`
      INSERT INTO practice_attempts (
        attempt_id, student_id, activity_id, node_id, response_json,
        result_json, artifact_json, passed, origin
      ) VALUES (
        'submission-other-student-attempt', 'stu-02',
        'P1T1-N01-micro-01', 'P1T1-N01', '{}', '{}', '{}', 1, 'user'
      )
    `).run();
    fixture.database.prepare(`
      INSERT INTO output_field_sources (
        output_id, version, field_key, source_node_id, source_attempt_id
      ) VALUES (?, 1, 'siteRoom', 'P1T1-N01', 'submission-other-student-attempt')
    `).run(draft.head.outputId);
    const before = mutationCounts(fixture.database, 'stu-01');

    assert.throws(() => repository.submit({
      outputId: draft.head.outputId,
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 1,
      fields: completeFields('P01'), upstreamRefs: [], evidenceLinks: {}, evidenceGaps: completeGaps('P01'),
    }), /student|source|attempt/i);
    assert.deepEqual(mutationCounts(fixture.database, 'stu-01'), before);
  } finally {
    fixture.cleanup();
  }
});

test('changing a returned output and then reverting to the returned facts is still rejected', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedP01UserActivities(fixture.database);
    insertUserFormalAssessment(fixture.database, {
      taskId: 'P01', attemptId: 'submission-revert-formal',
      score: 80, questionVersion: 'p01-n02-v1',
    });
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'submission-revert');
    const originalFields = completeFields('P01');
    const gaps = completeGaps('P01');
    const draft = repository.saveDraft({
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 0,
      fields: originalFields, upstreamRefs: [], evidenceLinks: {}, evidenceGaps: gaps,
    });
    fixture.database.prepare(`
      INSERT INTO output_reviews (
        review_id, output_id, reviewer_id, status, feedback, origin
      ) VALUES ('submission-revert-review', ?, 'teacher-01', 'returned', '请补充链路方向后重新提交。', 'user')
    `).run(draft.head.outputId);
    fixture.database.prepare(`
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES (
        'submission-revert-returned', 'stu-01', 'P1T1-N04', 'classroom',
        'teacher_returned',
        '{"reviewId":"submission-revert-review","version":1,"stateRevision":3}', 'user'
      )
    `).run();
    fixture.database.prepare(`
      UPDATE professional_outputs SET status = 'returned', state_revision = 3
      WHERE output_id = ?
    `).run(draft.head.outputId);
    repository.saveDraft({
      outputId: draft.head.outputId,
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 3,
      fields: { ...originalFields, connectionDirection: '临时改动' },
      upstreamRefs: [], evidenceLinks: {}, evidenceGaps: gaps,
    });
    const before = mutationCounts(fixture.database, 'stu-01');

    assert.throws(() => repository.submit({
      outputId: draft.head.outputId,
      studentId: 'stu-01', taskId: 'P01', expectedStateRevision: 4,
      fields: originalFields, upstreamRefs: [], evidenceLinks: {}, evidenceGaps: gaps,
    }), /revised version/i);
    assert.deepEqual(mutationCounts(fixture.database, 'stu-01'), before);
  } finally {
    fixture.cleanup();
  }
});

function completeFields(taskId: 'P01' | 'P02' | 'P03'): Record<string, string> {
  return Object.fromEntries(
    professionalOutputSchemaForTask(loadSelfStudyCatalog(), taskId).fields
      .map(({ key }) => [key, `已完成：${key}`]),
  );
}

function completeGaps(taskId: 'P01' | 'P02' | 'P03'): Record<string, {
  gapText: string;
  nextActionText: string;
}> {
  return Object.fromEntries(
    professionalOutputSchemaForTask(loadSelfStudyCatalog(), taskId).fields.map(({ key }) => [key, {
      gapText: `现场证据缺口：${key}`,
      nextActionText: `补采并复核：${key}`,
    }]),
  );
}

function insertUpstreamHead(
  database: ReturnType<typeof createTestDatabase>['database'],
  input: {
    outputId: string;
    taskId: 'P01' | 'P02';
    studentId: string;
    status: 'draft' | 'submitted' | 'returned' | 'verified';
    currentVersion: number;
    origin?: 'demo' | 'user';
  },
): void {
  const fieldsJson = JSON.stringify(completeFields(input.taskId));
  database.prepare(`
    INSERT INTO professional_outputs (
      output_id, student_id, task_id, node_id, status, content_json,
      current_version, state_revision, origin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.outputId,
    input.studentId,
    input.taskId,
    input.taskId === 'P01' ? 'P1T1-N04' : 'P1T2-N04',
    input.status,
    fieldsJson,
    input.currentVersion,
    input.currentVersion,
    input.origin ?? 'user',
  );
  const insert = database.prepare(`
    INSERT INTO professional_output_versions (
      output_id, task_id, version, schema_version, fields_json, upstream_refs_json
    ) VALUES (?, ?, ?, 1, ?, '[]')
  `);
  for (let version = 1; version <= input.currentVersion; version += 1) {
    insert.run(input.outputId, input.taskId, version, fieldsJson);
  }
}

function seedP01UserActivities(
  database: ReturnType<typeof createTestDatabase>['database'],
): void {
  const responses: Record<string, unknown> = {
    'P1T1-N01-micro-01': { assignments: {
      'room-01-cabinets': 'in-scope',
      'shared-operator-cabinet': 'out-of-scope',
      'room-02-cabinets': 'out-of-scope',
    } },
    'P1T1-N02-foundation-01': { assignments: {
      'room-overview': 'location',
      'device-nameplate': 'identity',
      'two-ended-port-trace': 'link',
    } },
    'P1T1-N02-application-01': { order: ['bbu-port', 'odf-in', 'odf-out', 'aau-port'] },
    'P1T1-N02-transfer-01': { fields: {
      siteId: 'HY-01', roomId: '01', cabinetId: 'K02',
      deviceId: 'BBU-01', nearPort: 'BBU-1/0', farPort: 'AAU-1',
    } },
    'P1T1-N03-micro-01': { states: {
      power: 'confirmed', grounding: 'missing',
      transport: 'confirmed', environment: 'conflicting',
    } },
  };
  const repository = new ActivityRepository(database);
  for (const [activityId, response] of Object.entries(responses)) {
    const activity = p1Activities.find(({ activity: item }) => item.id === activityId);
    assert.ok(activity);
    const result = repository.recordEvaluatedAttempt({
      attemptId: `submission-source-${activityId}`,
      studentId: 'stu-01',
      activity,
      response,
      delivery: { channel: 'self-study' },
    });
    assert.equal(result.passed, true, activityId);
  }
  database.prepare(`
    INSERT INTO practice_attempts (
      attempt_id, student_id, activity_id, node_id, response_json,
      result_json, artifact_json, passed, origin
    ) VALUES (
      'submission-source-P1T1-N04-micro-01', 'stu-01',
      'P1T1-N04-micro-01', 'P1T1-N04', '{}', '{}', '{}', 1, 'user'
    )
  `).run();
}

function seedGeneratedTaskUserActivities(
  database: ReturnType<typeof createTestDatabase>['database'],
  taskId: 'P02' | 'P03',
): void {
  const prefix = taskId === 'P02' ? 'P1T2' : 'P1T3';
  const activityIds = [
    `${prefix}-N01-micro-01`,
    `${prefix}-N02-foundation-01`,
    `${prefix}-N02-application-01`,
    `${prefix}-N02-transfer-01`,
    `${prefix}-N03-micro-01`,
    `${prefix}-N04-micro-01`,
  ];
  const insert = database.prepare(`
    INSERT INTO practice_attempts (
      attempt_id, student_id, activity_id, node_id, response_json,
      result_json, artifact_json, passed, origin
    ) VALUES (?, 'stu-01', ?, ?, '{}', '{}', '{}', 1, 'user')
  `);
  for (const activityId of activityIds) {
    insert.run(`submission-source-${activityId}`, activityId, activityId.slice(0, 8));
  }
}

function insertUserFormalAssessment(
  database: ReturnType<typeof createTestDatabase>['database'],
  input: {
    taskId: 'P01' | 'P02' | 'P03';
    attemptId: string;
    score: number;
    questionVersion: string;
  },
): void {
  const nodeId = {
    P01: 'P1T1-N02',
    P02: 'P1T2-N02',
    P03: 'P1T3-N02',
  }[input.taskId];
  const definition = getFormalAssessmentDefinition(nodeId);
  assert.ok(definition);
  const assessmentId = `assessment-${input.attemptId}`;
  const completedAt = '2026-07-16T08:00:00.000Z';
  database.prepare(`
    INSERT INTO formal_assessment_instances (
      assessment_id, node_id, game_id, question_version, status, closed_at
    ) VALUES (?, ?, ?, ?, 'closed', ?)
  `).run(assessmentId, nodeId, definition.gameId, input.questionVersion, completedAt);
  const dimensionScores = input.score === 79 ? [20, 20, 20, 19] : assessmentDimensionKeys
    .map(() => input.score / assessmentDimensionKeys.length);
  const dimensions = Object.fromEntries(assessmentDimensionKeys.map((key, index) => {
    const dimensionScore = dimensionScores[index]!;
    const remediationTarget = dimensionScore < 20
      ? definition.grading[key].remediationTarget
      : undefined;
    return [key, {
      score: dimensionScore,
      maxScore: 25,
      feedback: `${key} feedback`,
      ...(remediationTarget ? { remediationTarget } : {}),
    }];
  }));
  const remediationTargets = assessmentDimensionKeys.flatMap((key, index) => (
    dimensionScores[index]! < 20 ? [definition.grading[key].remediationTarget] : []
  ));
  database.prepare(`
    INSERT INTO formal_attempts (
      attempt_id, student_id, node_id, assessment_id, game_id, score,
      completed_at, question_version, answers_json, diagnostics_json, origin
    ) VALUES (?, 'stu-01', ?, ?, ?, ?, ?, ?, '{}', ?, 'user')
  `).run(
    input.attemptId,
    nodeId,
    assessmentId,
    definition.gameId,
    input.score,
    completedAt,
    input.questionVersion,
    JSON.stringify({
      assessmentId,
      attemptId: input.attemptId,
      studentId: 'stu-01',
      nodeId,
      gameId: definition.gameId,
      questionVersion: input.questionVersion,
      totalScore: input.score,
      passed: input.score >= 80,
      dimensions,
      remediationTargets,
      origin: 'user',
      completedAt,
    }),
  );
}

function insertReturnedP03WithAdvancedP02(
  database: ReturnType<typeof createTestDatabase>['database'],
): void {
  const p02FieldsJson = JSON.stringify(completeFields('P02'));
  database.prepare(`
    INSERT INTO professional_outputs (
      output_id, student_id, task_id, node_id, status, content_json,
      current_version, state_revision, origin
    ) VALUES (
      'submission-upstream-p02', 'stu-01', 'P02', 'P1T2-N04',
      'submitted', ?, 2, 2, 'user'
    )
  `).run(p02FieldsJson);
  const insertVersion = database.prepare(`
    INSERT INTO professional_output_versions (
      output_id, task_id, version, schema_version, fields_json, upstream_refs_json
    ) VALUES ('submission-upstream-p02', 'P02', ?, 1, ?, '[]')
  `);
  insertVersion.run(1, p02FieldsJson);
  insertVersion.run(2, p02FieldsJson);

  const p03FieldsJson = JSON.stringify(completeFields('P03'));
  database.prepare(`
    INSERT INTO professional_outputs (
      output_id, student_id, task_id, node_id, status, content_json,
      current_version, state_revision, origin
    ) VALUES (
      'submission-returned-p03', 'stu-01', 'P03', 'P1T3-N04',
      'returned', ?, 1, 3, 'user'
    )
  `).run(p03FieldsJson);
  database.prepare(`
    INSERT INTO professional_output_versions (
      output_id, task_id, version, schema_version, fields_json, upstream_refs_json
    ) VALUES (
      'submission-returned-p03', 'P03', 1, 1, ?,
      '[{"outputId":"submission-upstream-p02","version":1}]'
    )
  `).run(p03FieldsJson);
  const insertGap = database.prepare(`
    INSERT INTO output_evidence_gaps (
      output_id, version, field_key, gap_text, next_action_text
    ) VALUES ('submission-returned-p03', 1, ?, ?, ?)
  `);
  for (const [fieldKey, gap] of Object.entries(completeGaps('P03'))) {
    insertGap.run(fieldKey, gap.gapText, gap.nextActionText);
  }
}

function mutationCounts(
  database: ReturnType<typeof createTestDatabase>['database'],
  studentId: string,
): Record<string, number> {
  const outputIds = database.prepare(`
    SELECT output_id FROM professional_outputs WHERE student_id = ?
  `).all(studentId) as Array<{ output_id: string }>;
  const ids = outputIds.map(({ output_id: outputId }) => outputId);
  const outputIdSet = new Set(ids);
  const countOwned = (table: string, column = 'output_id') => database.prepare(`
    SELECT ${column} AS outputId FROM ${table}
  `).all().filter((row) => outputIdSet.has((row as { outputId: string }).outputId)).length;
  return {
    heads: ids.length,
    versions: countOwned('professional_output_versions'),
    links: countOwned('output_evidence_links'),
    gaps: countOwned('output_evidence_gaps'),
    sources: countOwned('output_field_sources'),
    events: database.prepare(`
      SELECT COUNT(*) FROM learning_events
      WHERE student_id = ? AND event_type IN ('evidence_draft_saved', 'evidence_submitted')
    `).pluck().get(studentId) as number,
    learningSnapshot: database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = ?
    `).pluck().get(`learning:${studentId}`) as number,
    globalSnapshot: database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'global'
    `).pluck().get() as number,
  };
}

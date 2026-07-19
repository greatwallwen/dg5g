import assert from 'node:assert/strict';
import test from 'node:test';
import { seedBase, seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { LearningReadModel } from './learning-read-model.ts';
import { createLearningCommandService } from './learning-command-service.ts';
import { getNodeLearningPolicy } from './learning-policy.ts';
import { LearningRepository } from './learning-repository.ts';
import { seedUserFormalAssessment } from './professional-output-policy-test-support.ts';
import { readHighestValidUserFormalAssessment } from './validated-user-formal-assessment.ts';

test('a first valid user submission opens P02 and a later teacher return never relocks it', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedUserFormalAssessment(fixture.database, 'stu-01', 'P01', 80, 'advance-p01');
    const model = new LearningReadModel(new LearningRepository(fixture.database));

    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T2-N01').state, 'locked');

    fixture.database.exec(`
      INSERT INTO professional_outputs (
        output_id, student_id, task_id, node_id, status, content_json,
        current_version, state_revision, origin
      ) VALUES ('advance-output', 'stu-01', 'P01', 'P1T1-N04', 'submitted', '{}', 1, 1, 'user');
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES ('advance-submit', 'stu-01', 'P1T1-N04', 'self-study', 'evidence_submitted',
        '{"taskId":"P01","outputId":"advance-output","version":1,"stateRevision":1}', 'user');
    `);
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T2-N01').state, 'available');

    fixture.database.exec(`
      UPDATE professional_outputs
      SET status = 'returned', state_revision = 3
      WHERE output_id = 'advance-output';
      INSERT INTO output_reviews (
        review_id, output_id, reviewer_id, status, feedback, origin
      ) VALUES ('advance-return', 'advance-output', 'teacher-01', 'returned', 'revise', 'user');
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES ('advance-return-event', 'stu-01', 'P1T1-N04', 'classroom', 'teacher_returned',
        '{"reviewId":"advance-return","version":1}', 'user');
    `);
    const returnedSnapshot = model.readStudentSnapshot('stu-01');
    assert.equal(requiredNode(returnedSnapshot, 'P1T2-N01').state, 'available');
    assert.equal(requiredNode(returnedSnapshot, 'P1T1-N04').taskAdvanceReady, true);
    assert.equal(requiredNode(returnedSnapshot, 'P1T1-N04').axes.output, 'returned');
    assert.equal(requiredNode(returnedSnapshot, 'P1T1-N04').axes.certification, 'pending-review');
  } finally {
    fixture.cleanup();
  }
});

test('N02 to N03 requires both user practice and a catalog-valid user score at the 80 boundary', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    for (const activityId of [
      'P1T1-N02-foundation-01',
      'P1T1-N02-application-01',
      'P1T1-N02-transfer-01',
    ]) insertPassedPractice(fixture.database, 'stu-01', activityId, 'P1T1-N02');
    seedUserFormalAssessment(fixture.database, 'stu-01', 'P01', 79, 'edge-79');
    const model = new LearningReadModel(new LearningRepository(fixture.database));

    const belowBoundary = readHighestValidUserFormalAssessment(
      fixture.database,
      'stu-01',
      'P1T1-N02',
    );
    assert.equal(belowBoundary?.totalScore, 79);
    assert.equal(belowBoundary?.passed, false);
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N03').state, 'locked');
    seedUserFormalAssessment(fixture.database, 'stu-01', 'P01', 80, 'edge-80');
    assert.equal(
      readHighestValidUserFormalAssessment(fixture.database, 'stu-01', 'P1T1-N02')?.totalScore,
      80,
    );
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N03').state, 'available');

    seedUserFormalAssessment(fixture.database, 'stu-02', 'P01', 100, 'formal-without-practice');
    assert.equal(requiredNode(model.readStudentSnapshot('stu-02'), 'P1T1-N03').state, 'locked');
    for (const activityId of [
      'P1T1-N02-foundation-01',
      'P1T1-N02-application-01',
      'P1T1-N02-transfer-01',
    ]) insertPassedPractice(fixture.database, 'stu-03', activityId, 'P1T1-N02');
    assert.equal(requiredNode(model.readStudentSnapshot('stu-03'), 'P1T1-N03').state, 'locked');
  } finally {
    fixture.cleanup();
  }
});

test('malformed or orphan submissions and invalid formal rows never unlock downstream nodes', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedUserFormalAssessment(fixture.database, 'stu-01', 'P01', 100, 'demo-only');
    fixture.database.exec(`
      UPDATE formal_attempts
      SET origin = 'demo', diagnostics_json = json_set(diagnostics_json, '$.origin', 'demo')
      WHERE attempt_id = 'demo-only-attempt';
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES ('demo-submit', 'stu-01', 'P1T1-N04', 'self-study', 'evidence_submitted',
        '{"taskId":"P01","outputId":"demo-output","version":1,"stateRevision":1}', 'demo');

      INSERT INTO formal_attempts (attempt_id, student_id, node_id, score, origin)
      VALUES ('bare-forged-100', 'stu-02', 'P1T1-N02', 100, 'demo');
      INSERT INTO professional_outputs (
        output_id, student_id, task_id, node_id, status, content_json,
        current_version, state_revision, origin
      ) VALUES ('bare-output', 'stu-02', 'P01', 'P1T1-N04', 'submitted', '{}', 1, 1, 'demo');
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES ('bare-submit', 'stu-02', 'P1T1-N04', 'self-study', 'evidence_submitted',
        '{"taskId":"P01","outputId":"bare-output","version":1,"stateRevision":1}', 'demo');
    `);
    seedUserFormalAssessment(fixture.database, 'stu-03', 'P01', 100, 'malformed-event');
    fixture.database.exec(`
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES
        ('wrong-task', 'stu-03', 'P1T1-N04', 'self-study', 'evidence_submitted',
          '{"taskId":"P02","outputId":"output","version":1,"stateRevision":1}', 'user'),
        ('bad-version', 'stu-03', 'P1T1-N04', 'self-study', 'evidence_submitted',
          '{"taskId":"P01","outputId":"output","version":0,"stateRevision":1}', 'user');
    `);
    const model = new LearningReadModel(new LearningRepository(fixture.database));

    for (const studentId of ['stu-01', 'stu-02', 'stu-03']) {
      assert.equal(requiredNode(model.readStudentSnapshot(studentId), 'P1T2-N01').state, 'locked');
    }
  } finally {
    fixture.cleanup();
  }
});

test('formal-test lifecycle axes come from relational assessment instances and runs', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    fixture.database.exec(`
      INSERT INTO classroom_lesson_runs (
        lesson_run_id, session_id, lesson_id, task_id, node_id, status, teaching_cursor_json
      ) VALUES ('axis-lesson', 'demo-class', 'axis-lesson', 'P01', 'P1T1-N02', 'active', '{}');
      INSERT INTO classroom_assessment_runs (
        run_id, lesson_run_id, session_id, node_id, game_id, status, started_at, expires_at
      ) VALUES ('axis-run', 'axis-lesson', 'demo-class', 'P1T1-N02',
        'P1T1-N02-server-assessment', 'paused',
        '2026-07-17T01:00:00.000Z', '2099-07-17T01:15:00.000Z');
      INSERT INTO formal_assessment_instances (
        assessment_id, session_id, classroom_run_id, node_id, game_id,
        question_version, status, opened_at, expires_at
      ) VALUES ('axis-assessment', 'demo-class', 'axis-run', 'P1T1-N02',
        'P1T1-N02-server-assessment', 'p01-n02-v1', 'running',
        '2026-07-17T01:00:00.000Z', '2099-07-17T01:15:00.000Z');
      INSERT INTO formal_assessment_tokens (
        token_hash, assessment_id, student_id, node_id, question_version, expires_at
      ) VALUES ('axis-token', 'axis-assessment', 'stu-01', 'P1T1-N02',
        'p01-n02-v1', '2099-07-17T01:15:00.000Z');
    `);
    const model = new LearningReadModel(new LearningRepository(fixture.database));
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N02').axes.formalTest, 'paused');

    fixture.database.exec(`
      UPDATE formal_assessment_instances
      SET expires_at = '2020-07-17T01:15:00.000Z'
      WHERE assessment_id = 'axis-assessment'
    `);
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N02').axes.formalTest, 'expired');

    fixture.database.exec(`
      UPDATE formal_assessment_instances
      SET expires_at = '2099-07-17T01:15:00.000Z'
      WHERE assessment_id = 'axis-assessment'
    `);
    fixture.database.exec(`UPDATE classroom_assessment_runs SET status = 'running' WHERE run_id = 'axis-run'`);
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N02').axes.formalTest, 'in-progress');

    fixture.database.exec(`UPDATE classroom_assessment_runs SET status = 'reviewing' WHERE run_id = 'axis-run'`);
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N02').axes.formalTest, 'expired');

    fixture.database.exec(`
      UPDATE classroom_assessment_runs SET status = 'expired' WHERE run_id = 'axis-run';
      UPDATE formal_assessment_instances
      SET status = 'closed', closure_reason = 'expired', closed_at = '2026-07-17T01:15:00.000Z'
      WHERE assessment_id = 'axis-assessment';
    `);
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N02').axes.formalTest, 'expired');
  } finally {
    fixture.cleanup();
  }
});

test('only the policy-required passed practice activities satisfy P01 micro-practice', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const model = new LearningReadModel(new LearningRepository(fixture.database));
    const insertPractice = fixture.database.prepare(`
      INSERT INTO practice_attempts (
        attempt_id, student_id, activity_id, node_id, response_json,
        result_json, artifact_json, passed, origin
      ) VALUES (?, 'stu-01', ?, ?, '{}', '{}', '{}', ?, 'user')
    `);
    fixture.database.exec(`
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES
        ('arbitrary-pass', 'stu-01', 'P1T1-N01', 'self-study', 'micro_practice_passed', '{}', 'user'),
        ('all-sections', 'stu-01', 'P1T1-N01', 'self-study', 'section_completed',
          '{"sectionId":"understand","completed":true}', 'user'),
        ('class-submit', 'stu-01', 'P1T1-N01', 'classroom', 'classroom_submitted',
          '{"completed":true}', 'user')
    `);
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N01').state, 'learning');
    insertPractice.run('failed-required', 'P1T1-N01-micro-01', 'P1T1-N01', 0);
    insertPractice.run('passed-remediation', 'P1T1-N02-remediation-revision-01', 'P1T1-N02', 1);
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N01').state, 'learning');
    insertPractice.run('passed-required', 'P1T1-N01-micro-01', 'P1T1-N01', 1);
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N01').state, 'achieved');
  } finally {
    fixture.cleanup();
  }
});

test('N02 requires all three base activities and ignores remediation-only passes', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    insertPassedPractice(fixture.database, 'stu-01', 'P1T1-N01-micro-01', 'P1T1-N01');
    insertPassedPractice(fixture.database, 'stu-01', 'P1T1-N02-foundation-01', 'P1T1-N02');
    insertPassedPractice(fixture.database, 'stu-01', 'P1T1-N02-application-01', 'P1T1-N02');
    insertPassedPractice(fixture.database, 'stu-01', 'P1T1-N02-remediation-revision-01', 'P1T1-N02');
    seedUserFormalAssessment(fixture.database, 'stu-01', 'P01', 80, 'n02-pass');
    const model = new LearningReadModel(new LearningRepository(fixture.database));
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N02').state, 'learning');
    insertPassedPractice(fixture.database, 'stu-01', 'P1T1-N02-transfer-01', 'P1T1-N02');
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N02').state, 'achieved');
  } finally {
    fixture.cleanup();
  }
});

test('lower user score shadows higher demo score and zero remains a real submitted attempt', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    insertP01PrerequisitePractice(fixture.database, 'stu-01', true);
    seedUserFormalAssessment(fixture.database, 'stu-01', 'P01', 100, 'demo-high');
    fixture.database.exec(`
      UPDATE formal_attempts
      SET origin = 'demo', diagnostics_json = json_set(diagnostics_json, '$.origin', 'demo')
      WHERE attempt_id = 'demo-high-attempt';
    `);
    seedUserFormalAssessment(fixture.database, 'stu-01', 'P01', 0, 'user-zero');
    const node = requiredNode(
      new LearningReadModel(new LearningRepository(fixture.database)).readStudentSnapshot('stu-01'),
      'P1T1-N02',
    );
    assert.equal(node.bestFormalScore, 0);
    assert.deepEqual(node.attempts.map(({ score, origin }) => ({ score, origin })), [
      { score: 0, origin: 'user' },
    ]);
    assert.equal(node.state, 'micro-practice-passed');
  } finally {
    fixture.cleanup();
  }
});

test('a forged user frozen task fact cannot shadow a valid task score or certify the task', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.exec(`
      INSERT INTO frozen_task_scores (
        score_id, student_id, task_id, snapshot_version,
        provisional_score, official_score, details_json, origin
      ) VALUES
        ('demo-higher-stu3-p01', 'stu-03', 'P01', 7, 99, 99, '{"taskCompositeScore":99}', 'demo'),
        ('user-lower-stu3-p01', 'stu-03', 'P01', 8, 0, 0, '{"taskCompositeScore":0}', 'user');
    `);
    const snapshot = new LearningReadModel(new LearningRepository(fixture.database))
      .readStudentSnapshot('stu-03');
    assert.equal(snapshot.tasks[0]?.taskCompositeScore, 94);
    assert.equal(snapshot.tasks[0]?.origin, 'demo');
    assert.equal(snapshot.tasks[0]?.realTaskCertified, false);
    assert.equal(snapshot.tasks[0]?.demoTaskCertified, true);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM frozen_task_scores
      WHERE student_id = 'stu-03' AND task_id = 'P01' AND origin = 'demo'
    `).pluck().get() as number >= 2, true);
  } finally {
    fixture.cleanup();
  }
});

test('user output version shadows demo return and only a review bound to the current version applies', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    insertP01PrerequisitePractice(fixture.database, 'stu-01', true);
    seedUserFormalAssessment(fixture.database, 'stu-01', 'P01', 80, 'certified-read');
    fixture.database.exec(`
      INSERT INTO professional_outputs (
        output_id, student_id, task_id, node_id, status, content_json,
        current_version, state_revision, origin
      ) VALUES ('mixed-output', 'stu-01', 'P01', 'P1T1-N04', 'returned',
        '{"version":1}', 1, 3, 'demo');
      INSERT INTO professional_output_versions (
        output_id, task_id, version, fields_json, upstream_refs_json
      ) VALUES ('mixed-output', 'P01', 1, '{"version":1}', '[]');
      INSERT INTO output_reviews (
        review_id, output_id, reviewer_id, status, feedback, origin
      ) VALUES ('demo-return-v1', 'mixed-output', 'teacher-01', 'returned', 'revise v1', 'demo');
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES ('demo-return-event', 'stu-01', 'P1T1-N04', 'classroom', 'teacher_returned',
        '{"reviewId":"demo-return-v1","version":1}', 'demo');
      UPDATE professional_outputs SET status = 'submitted', content_json = '{"version":2}',
        current_version = 2, state_revision = 5, origin = 'user'
      WHERE output_id = 'mixed-output';
      INSERT INTO professional_output_versions (
        output_id, task_id, version, fields_json, upstream_refs_json
      ) VALUES ('mixed-output', 'P01', 2, '{"version":2}', '[]');
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES ('user-submit-v2', 'stu-01', 'P1T1-N04', 'self-study', 'evidence_submitted',
        '{"taskId":"P01","outputId":"mixed-output","version":2,"stateRevision":5}', 'user');
    `);
    const model = new LearningReadModel(new LearningRepository(fixture.database));
    const submitted = requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N04');
    assert.equal(submitted.state, 'awaiting-review');
    assert.equal(submitted.evidence?.origin, 'user');
    assert.equal(submitted.review, undefined);

    fixture.database.exec(`
      INSERT INTO output_reviews (
        review_id, output_id, reviewer_id, status, score, feedback, origin
      ) VALUES ('user-verify-v2', 'mixed-output', 'teacher-01', 'verified', 90, 'verified v2', 'user');
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES ('user-verify-event-v2', 'stu-01', 'P1T1-N04', 'classroom', 'teacher_verified',
        '{"reviewId":"user-verify-v2","version":2}', 'user');
      UPDATE professional_outputs SET status = 'verified', state_revision = 6
      WHERE output_id = 'mixed-output';
    `);
    const unfrozen = model.readStudentSnapshot('stu-01');
    const verified = requiredNode(unfrozen, 'P1T1-N04');
    assert.equal(verified.state, 'awaiting-review');
    assert.equal(verified.axes.output, 'verified');
    assert.equal(verified.axes.certification, 'pending-review');
    assert.equal(verified.review?.outputVersion, 2);
    assert.equal(verified.review?.origin, 'user');
    assert.equal(unfrozen.tasks[0]?.taskCompositeScore, undefined);

    fixture.database.prepare(`
      INSERT INTO frozen_task_scores (
        score_id, student_id, task_id, snapshot_version,
        provisional_score, official_score, details_json, origin
      ) VALUES ('certified-read-score', 'stu-01', 'P01', 1, 86, 86, ?, 'user')
    `).run(JSON.stringify({
      nodeTestAttemptId: 'certified-read-attempt',
      assessmentId: 'certified-read-assessment',
      questionVersion: 'p01-n02-v1',
      taskCompositeScore: 86,
      reviewId: 'user-verify-v2',
      formulaVersion: 'task-score-40-60-v1',
      test: {
        nodeId: 'P1T1-N02',
        gameId: 'P1T1-N02-server-assessment',
        score: 80,
      },
      output: { outputId: 'mixed-output', version: 2, rubricScore: 90 },
    }));
    const certified = model.readStudentSnapshot('stu-01');
    assert.equal(requiredNode(certified, 'P1T1-N04').state, 'achieved');
    assert.equal(requiredNode(certified, 'P1T1-N04').axes.certification, 'achieved');
    assert.equal(certified.tasks[0]?.taskCompositeScore, 86);
    assert.equal(certified.tasks[0]?.frozenFormalAttemptId, 'certified-read-attempt');
  } finally {
    fixture.cleanup();
  }
});

test('clean, returned, and complete demo personas project consistently with visible origins', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const model = new LearningReadModel(new LearningRepository(fixture.database));
    const clean = model.readStudentSnapshot('stu-01');
    const returned = model.readStudentSnapshot('stu-02');
    const complete = model.readStudentSnapshot('stu-03');

    assert.equal(clean.nodes.every(({ attempts, evidence }) => attempts.length === 0 && evidence === undefined), true);
    assert.equal(clean.tasks.every(({ nodeTestHighestScore, taskCompositeScore }) => (
      nodeTestHighestScore === undefined && taskCompositeScore === undefined
    )), true);
    assert.equal(requiredNode(clean, 'P1T1-N02').axes.access, 'locked');
    assert.equal(requiredNode(returned, 'P1T1-N04').state, 'available');
    assert.equal(requiredNode(returned, 'P1T1-N04').axes.access, 'open');
    assert.equal(requiredNode(returned, 'P1T1-N04').origin, undefined);
    assert.equal(requiredNode(returned, 'P1T1-N04').evidence?.origin, 'demo');
    assert.equal(requiredNode(returned, 'P1T1-N04').review?.origin, 'demo');
    assert.equal(returned.tasks[0]?.nodeTestHighestScore, 88);
    assert.equal(returned.tasks[0]?.origin, 'demo');
    assert.equal(returned.tasks[0]?.taskCompositeScore, undefined);
    assert.equal(complete.nodes.every(({ axes }) => axes.access === 'open'), true);
    for (const nodeId of ['P1T1-N02', 'P1T2-N02', 'P1T3-N02']) {
      const node = requiredNode(complete, nodeId);
      assert.equal(node.state, 'available');
      assert.equal(node.axes.learning, 'not-started');
      assert.equal(node.axes.formalTest, 'ready');
      assert.equal(node.axes.certification, 'not-reached');
      assert.equal(node.bestFormalScore, undefined);
    }
    for (const nodeId of ['P1T1-N04', 'P1T2-N04', 'P1T3-N04']) {
      const node = requiredNode(complete, nodeId);
      assert.equal(node.taskAdvanceReady, false);
      assert.equal(node.axes.certification, 'not-reached');
      assert.equal(node.evidence?.origin, 'demo');
    }
    assert.deepEqual(complete.tasks.map(({ nodeTestHighestScore }) => nodeTestHighestScore), [93, 91, 90]);
    assert.deepEqual(complete.tasks.map(({ taskId, taskCompositeScore, origin }) => ({
      taskId, taskCompositeScore, origin,
    })), [
      { taskId: 'P01', taskCompositeScore: 94, origin: 'demo' },
      { taskId: 'P02', taskCompositeScore: 92, origin: 'demo' },
      { taskId: 'P03', taskCompositeScore: 91, origin: 'demo' },
    ]);
    assert.equal(complete.projectCompositeScore, 92);
    assert.equal(complete.tasks.every(({ realTaskCertified }) => !realTaskCertified), true);
    assert.equal(complete.tasks.every(({ demoTaskCertified }) => demoTaskCertified), true);

    const actor = {
      userId: 'stu-03', username: 'student03', displayName: '学生三',
      role: 'student' as const, classId: 'demo-class', studentId: 'stu-03',
    };
    const access = createLearningCommandService(fixture.database);
    for (const nodeId of ['P1T1-N02', 'P1T2-N02', 'P1T3-N02']) {
      assert.equal(access.requireNodeAccess(actor, nodeId).kind, 'open');
    }
  } finally {
    fixture.cleanup();
  }
});

test('class read uses the same student projections and one shared global snapshot version', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new LearningRepository(fixture.database);
    const snapshot = new LearningReadModel(repository).readClassSnapshot('teacher-01', 'demo-class');
    assert.deepEqual(snapshot.students.map(({ studentId }) => studentId), ['stu-01', 'stu-02', 'stu-03']);
    assert.equal(snapshot.students.every(({ globalVersion }) => globalVersion === snapshot.version), true);
    assert.equal(requiredNode(snapshot.students[0]!, 'P1T1-N01').state, 'available');
    assert.equal(requiredNode(snapshot.students[1]!, 'P1T1-N04').state, 'available');
    assert.equal(requiredNode(snapshot.students[2]!, 'P1T3-N04').state, 'available');
  } finally {
    fixture.cleanup();
  }
});

test('a published node with an empty activity policy fails closed on legacy generic pass events', () => {
  const fixture = createTestDatabase();
  const policy = getNodeLearningPolicy('P1T1-N01')!;
  const originalActivityIds = policy.requiredActivityIds;
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    policy.requiredActivityIds = [];
    fixture.database.exec(`
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES ('legacy-only', 'stu-01', 'P1T1-N01', 'self-study',
        'micro_practice_passed', '{"demo":true}', 'demo');
    `);
    const node = requiredNode(
      new LearningReadModel(new LearningRepository(fixture.database)).readStudentSnapshot('stu-01'),
      'P1T1-N01',
    );
    assert.equal(node.state, 'available');
    assert.equal(node.stateTrail.includes('micro-practice-passed'), false);
  } finally {
    policy.requiredActivityIds = originalActivityIds;
    fixture.cleanup();
  }
});

test('legacy demo pass history neither advances nor taints a user activity milestone', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    fixture.database.exec(`
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES ('legacy-demo-history', 'stu-01', 'P1T1-N01', 'self-study',
        'micro_practice_passed', '{"demo":true}', 'demo');
    `);
    insertPassedPractice(fixture.database, 'stu-01', 'P1T1-N01-micro-01', 'P1T1-N01');
    const node = requiredNode(
      new LearningReadModel(new LearningRepository(fixture.database)).readStudentSnapshot('stu-01'),
      'P1T1-N01',
    );
    assert.equal(node.state, 'achieved');
    assert.equal(node.origin, 'user');
  } finally {
    fixture.cleanup();
  }
});

test('demo prerequisite access does not replace user-owned node progress', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    insertPassedPractice(fixture.database, 'stu-01', 'P1T1-N01-micro-01', 'P1T1-N01', 'demo');
    for (const activityId of [
      'P1T1-N02-foundation-01',
      'P1T1-N02-application-01',
      'P1T1-N02-transfer-01',
    ]) insertPassedPractice(fixture.database, 'stu-01', activityId, 'P1T1-N02');
    seedUserFormalAssessment(fixture.database, 'stu-01', 'P01', 80, 'all-user-formal');
    const model = new LearningReadModel(new LearningRepository(fixture.database));
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N01').origin, undefined);
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N01').state, 'available');
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N02').state, 'achieved');
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N02').origin, 'user');

    insertPassedPractice(fixture.database, 'stu-01', 'P1T1-N01-micro-01', 'P1T1-N01', 'user', 'replacement');
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N01').origin, 'user');
    assert.equal(requiredNode(model.readStudentSnapshot('stu-01'), 'P1T1-N02').origin, 'user');
  } finally {
    fixture.cleanup();
  }
});

test('forged user frozen scores cannot replace the fully certified demo project origin', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const model = new LearningReadModel(new LearningRepository(fixture.database));
    const before = model.readStudentSnapshot('stu-03');
    assert.equal(before.projectCompositeOrigin, 'demo');
    assert.equal(before.tasks.every(({ demoTaskCertified }) => demoTaskCertified), true);

    fixture.database.exec(`
      INSERT INTO frozen_task_scores (
        score_id, student_id, task_id, snapshot_version,
        provisional_score, official_score, details_json, origin
      ) VALUES ('forged-user-p03', 'stu-03', 'P03', 99, 100, 100, '{"taskCompositeScore":100}', 'user');
    `);
    const after = model.readStudentSnapshot('stu-03');
    assert.equal(after.projectCompositeOrigin, 'demo');
    assert.equal(after.tasks.every(({ demoTaskCertified }) => demoTaskCertified), true);
    assert.equal(after.tasks.some(({ realTaskCertified }) => realTaskCertified), false);
  } finally {
    fixture.cleanup();
  }
});

function insertP01PrerequisitePractice(
  database: ReturnType<typeof createTestDatabase>['database'],
  studentId: string,
  throughN04: boolean,
) {
  const attempts = [
    ['P1T1-N01-micro-01', 'P1T1-N01'],
    ['P1T1-N02-foundation-01', 'P1T1-N02'],
    ['P1T1-N02-application-01', 'P1T1-N02'],
    ['P1T1-N02-transfer-01', 'P1T1-N02'],
    ['P1T1-N03-micro-01', 'P1T1-N03'],
    ...(throughN04 ? [['P1T1-N04-micro-01', 'P1T1-N04']] : []),
  ];
  for (const [activityId, nodeId] of attempts) {
    insertPassedPractice(database, studentId, activityId!, nodeId!);
  }
}

function insertPassedPractice(
  database: ReturnType<typeof createTestDatabase>['database'],
  studentId: string,
  activityId: string,
  nodeId: string,
  origin: 'demo' | 'user' = 'user',
  suffix = '',
) {
  database.prepare(`
    INSERT INTO practice_attempts (
      attempt_id, student_id, activity_id, node_id, passed, origin
    ) VALUES (?, ?, ?, ?, 1, ?)
  `).run(`${studentId}-${activityId}${suffix}`, studentId, activityId, nodeId, origin);
}

function requiredNode(snapshot: ReturnType<LearningReadModel['readStudentSnapshot']>, nodeId: string) {
  const node = snapshot.nodes.find((candidate) => candidate.nodeId === nodeId);
  assert.ok(node, `missing node ${nodeId}`);
  return node;
}

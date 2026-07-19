import assert from 'node:assert/strict';
import test from 'node:test';
import { seedBase, seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { LearningReadModel, type StudentLearningSnapshot } from './learning-read-model.ts';
import { LearningRepository } from './learning-repository.ts';
import { seedUserFormalAssessment } from './professional-output-policy-test-support.ts';

test('an orphan user submission event never unlocks or advances the output task', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedUserFormalAssessment(fixture.database, 'stu-01', 'P01', 80, 'orphan-user-event');
    fixture.database.exec(`
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES ('orphan-user-submit', 'stu-01', 'P1T1-N04', 'self-study', 'evidence_submitted',
        '{"taskId":"P01","outputId":"missing-output","version":1,"stateRevision":1}', 'user');
    `);

    const snapshot = readSnapshot(fixture.database, 'stu-01');
    assert.equal(requiredNode(snapshot, 'P1T1-N04').taskAdvanceReady, false);
    assert.equal(requiredNode(snapshot, 'P1T2-N01').state, 'locked');
  } finally {
    fixture.cleanup();
  }
});

test('a submission event cannot borrow a professional output from another origin', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedUserFormalAssessment(fixture.database, 'stu-01', 'P01', 80, 'cross-demo-output');
    seedUserFormalAssessment(fixture.database, 'stu-02', 'P01', 80, 'cross-user-output');
    fixture.database.exec(`
      INSERT INTO professional_outputs (
        output_id, student_id, task_id, node_id, status, content_json,
        current_version, state_revision, origin
      ) VALUES
        ('cross-demo-output', 'stu-01', 'P01', 'P1T1-N04', 'submitted', '{}', 1, 1, 'demo'),
        ('cross-user-output', 'stu-02', 'P01', 'P1T1-N04', 'submitted', '{}', 1, 1, 'user');
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES
        ('cross-user-event', 'stu-01', 'P1T1-N04', 'self-study', 'evidence_submitted',
          '{"taskId":"P01","outputId":"cross-demo-output","version":1,"stateRevision":1}', 'user'),
        ('cross-demo-event', 'stu-02', 'P1T1-N04', 'self-study', 'evidence_submitted',
          '{"taskId":"P01","outputId":"cross-user-output","version":1,"stateRevision":1}', 'demo');
    `);

    for (const studentId of ['stu-01', 'stu-02']) {
      const snapshot = readSnapshot(fixture.database, studentId);
      assert.equal(requiredNode(snapshot, 'P1T1-N04').taskAdvanceReady, false);
      assert.equal(requiredNode(snapshot, 'P1T2-N01').state, 'locked');
    }
  } finally {
    fixture.cleanup();
  }
});

test('stale or identity-mismatched submissions never unlock the next task', () => {
  const adversarialCases: ReadonlyArray<{
    name: string;
    outputId?: string;
    outputStudentId?: string;
    outputTaskId?: string;
    outputNodeId?: string;
    outputVersion?: number;
    outputRevision?: number;
    outputStatus?: 'draft' | 'submitted' | 'returned' | 'verified';
    eventVersion?: number;
    eventRevision?: number;
  }> = [
    { name: 'different output id', outputId: 'other-output' },
    { name: 'different student', outputStudentId: 'stu-02' },
    { name: 'different task', outputTaskId: 'P02' },
    { name: 'different node', outputNodeId: 'P1T2-N04' },
    { name: 'older output version', outputVersion: 2 },
    { name: 'future output version', eventVersion: 2 },
    { name: 'future state revision', eventRevision: 2 },
    { name: 'stale submitted revision', outputRevision: 2 },
    { name: 'draft head', outputStatus: 'draft', outputRevision: 2 },
    { name: 'returned without a later revision', outputStatus: 'returned' },
    { name: 'verified without a later revision', outputStatus: 'verified' },
  ];

  for (const adversarial of adversarialCases) {
    const fixture = createTestDatabase();
    try {
      migrateDatabase(fixture.database);
      seedBase(fixture.database);
      seedUserFormalAssessment(fixture.database, 'stu-01', 'P01', 80, `mismatch-${adversarial.name}`);
      fixture.database.prepare(`
        INSERT INTO professional_outputs (
          output_id, student_id, task_id, node_id, status, content_json,
          current_version, state_revision, origin
        ) VALUES (?, ?, ?, ?, ?, '{}', ?, ?, 'user')
      `).run(
        adversarial.outputId ?? 'bound-output',
        adversarial.outputStudentId ?? 'stu-01',
        adversarial.outputTaskId ?? 'P01',
        adversarial.outputNodeId ?? 'P1T1-N04',
        adversarial.outputStatus ?? 'submitted',
        adversarial.outputVersion ?? 1,
        adversarial.outputRevision ?? 1,
      );
      fixture.database.prepare(`
        INSERT INTO learning_events (
          event_id, student_id, node_id, channel, event_type, payload_json, origin
        ) VALUES (?, 'stu-01', 'P1T1-N04', 'self-study', 'evidence_submitted', ?, 'user')
      `).run(`mismatch-${adversarial.name}`, JSON.stringify({
        taskId: 'P01',
        outputId: 'bound-output',
        version: adversarial.eventVersion ?? 1,
        stateRevision: adversarial.eventRevision ?? 1,
      }));

      const snapshot = readSnapshot(fixture.database, 'stu-01');
      assert.equal(
        requiredNode(snapshot, 'P1T1-N04').taskAdvanceReady,
        false,
        adversarial.name,
      );
      assert.equal(requiredNode(snapshot, 'P1T2-N01').state, 'locked', adversarial.name);
    } finally {
      fixture.cleanup();
    }
  }
});

test('unbound submission history cannot forge revising or resubmitted output axes', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    fixture.database.exec(`
      INSERT INTO professional_outputs (
        output_id, student_id, task_id, node_id, status, content_json,
        current_version, state_revision, origin
      ) VALUES
        ('draft-boundary', 'stu-01', 'P01', 'P1T1-N04', 'draft', '{}', 2, 3, 'user'),
        ('submitted-boundary', 'stu-02', 'P01', 'P1T1-N04', 'submitted', '{}', 2, 3, 'user');
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES
        ('draft-stale-submit', 'stu-01', 'P1T1-N04', 'self-study', 'evidence_submitted',
          '{"taskId":"P01","outputId":"draft-boundary","version":1,"stateRevision":1}', 'user'),
        ('draft-orphan-submit', 'stu-01', 'P1T1-N04', 'self-study', 'evidence_submitted',
          '{"taskId":"P01","outputId":"missing-draft-output","version":2,"stateRevision":3}', 'user'),
        ('submitted-stale-submit', 'stu-02', 'P1T1-N04', 'self-study', 'evidence_submitted',
          '{"taskId":"P01","outputId":"submitted-boundary","version":1,"stateRevision":1}', 'user'),
        ('submitted-current-submit', 'stu-02', 'P1T1-N04', 'self-study', 'evidence_submitted',
          '{"taskId":"P01","outputId":"submitted-boundary","version":2,"stateRevision":3}', 'user');
    `);

    assert.equal(requiredNode(readSnapshot(fixture.database, 'stu-01'), 'P1T1-N04').axes.output, 'editing');
    assert.equal(requiredNode(readSnapshot(fixture.database, 'stu-02'), 'P1T1-N04').axes.output, 'submitted');
  } finally {
    fixture.cleanup();
  }
});

test('a bound return and current submission distinguish resubmitted from active revision work', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    fixture.database.exec(`
      INSERT INTO professional_outputs (
        output_id, student_id, task_id, node_id, status, content_json,
        current_version, state_revision, origin
      ) VALUES ('axis-output', 'stu-01', 'P01', 'P1T1-N04', 'submitted', '{}', 2, 4, 'user');
      INSERT INTO professional_output_versions (
        output_id, task_id, version, fields_json, upstream_refs_json
      ) VALUES
        ('axis-output', 'P01', 1, '{}', '[]'),
        ('axis-output', 'P01', 2, '{}', '[]');
      INSERT INTO output_reviews (
        review_id, output_id, reviewer_id, status, feedback, origin
      ) VALUES ('axis-return-v1', 'axis-output', 'teacher-01', 'returned', 'revise v1', 'user');
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin, occurred_at
      ) VALUES
        ('axis-submit-v1', 'stu-01', 'P1T1-N04', 'self-study', 'evidence_submitted',
          '{"taskId":"P01","outputId":"axis-output","version":1,"stateRevision":2}', 'user', '2026-07-17T01:00:00.000Z'),
        ('axis-return-event-v1', 'stu-01', 'P1T1-N04', 'classroom', 'teacher_returned',
          '{"taskId":"P01","outputId":"axis-output","version":1,"stateRevision":3,"reviewId":"axis-return-v1"}', 'user', '2026-07-17T01:30:00.000Z'),
        ('axis-submit-v2', 'stu-01', 'P1T1-N04', 'self-study', 'evidence_submitted',
          '{"taskId":"P01","outputId":"axis-output","version":2,"stateRevision":4}', 'user', '2026-07-17T02:00:00.000Z');
    `);
    assert.equal(requiredNode(readSnapshot(fixture.database, 'stu-01'), 'P1T1-N04').axes.output, 'resubmitted');

    fixture.database.exec(`
      UPDATE professional_outputs
      SET status = 'draft', current_version = 3, state_revision = 5
      WHERE output_id = 'axis-output';
    `);
    const revising = requiredNode(readSnapshot(fixture.database, 'stu-01'), 'P1T1-N04');
    assert.equal(revising.axes.output, 'revising');
    assert.equal(revising.taskAdvanceReady, true);
    assert.equal(revising.state, 'locked');
    assert.equal(revising.axes.access, 'locked');
  } finally {
    fixture.cleanup();
  }
});

test('a returned submission remains a monotonic prerequisite while its next draft version is edited', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedUserFormalAssessment(fixture.database, 'stu-01', 'P01', 80, 'monotonic-draft');
    fixture.database.exec(`
      INSERT INTO professional_outputs (
        output_id, student_id, task_id, node_id, status, content_json,
        current_version, state_revision, origin
      ) VALUES ('monotonic-output', 'stu-01', 'P01', 'P1T1-N04', 'draft', '{}', 2, 4, 'user');
      INSERT INTO professional_output_versions (
        output_id, task_id, version, fields_json, upstream_refs_json
      ) VALUES
        ('monotonic-output', 'P01', 1, '{}', '[]'),
        ('monotonic-output', 'P01', 2, '{}', '[]');
      INSERT INTO output_reviews (
        review_id, output_id, reviewer_id, status, feedback, origin
      ) VALUES ('monotonic-return-v1', 'monotonic-output', 'teacher-01', 'returned', 'revise v1', 'user');
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin, occurred_at
      ) VALUES
        ('monotonic-submit-v1', 'stu-01', 'P1T1-N04', 'self-study', 'evidence_submitted',
          '{"taskId":"P01","outputId":"monotonic-output","version":1,"stateRevision":2}', 'user', '2026-07-17T01:00:00.000Z'),
        ('monotonic-return-event-v1', 'stu-01', 'P1T1-N04', 'classroom', 'teacher_returned',
          '{"taskId":"P01","outputId":"monotonic-output","version":1,"stateRevision":3,"reviewId":"monotonic-return-v1"}', 'user', '2026-07-17T01:30:00.000Z');
    `);

    const snapshot = readSnapshot(fixture.database, 'stu-01');
    assert.equal(requiredNode(snapshot, 'P1T1-N04').taskAdvanceReady, true);
    assert.equal(requiredNode(snapshot, 'P1T1-N04').axes.output, 'revising');
    assert.equal(requiredNode(snapshot, 'P1T2-N01').axes.access, 'open');
  } finally {
    fixture.cleanup();
  }
});

test('a task-tampered output cannot project evidence or certify either task', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      UPDATE professional_outputs SET task_id = 'P99'
      WHERE output_id = 'demo-output-stu-03-p01'
    `).run();

    const snapshot = readSnapshot(fixture.database, 'stu-03');
    assert.equal(requiredNode(snapshot, 'P1T1-N04').evidence, undefined);
    assert.equal(requiredNode(snapshot, 'P1T1-N04').axes.certification, 'not-reached');
    assert.equal(snapshot.tasks[0]?.taskCompositeScore, undefined);
    assert.equal(snapshot.tasks[0]?.demoTaskCertified, false);
    assert.equal(snapshot.tasks[1]?.taskCompositeScore, 92);
  } finally {
    fixture.cleanup();
  }
});

function readSnapshot(
  database: ReturnType<typeof createTestDatabase>['database'],
  studentId: string,
): StudentLearningSnapshot {
  return new LearningReadModel(new LearningRepository(database)).readStudentSnapshot(studentId);
}

function requiredNode(snapshot: StudentLearningSnapshot, nodeId: string) {
  const node = snapshot.nodes.find((candidate) => candidate.nodeId === nodeId);
  assert.ok(node, `Expected node ${nodeId}.`);
  return node;
}

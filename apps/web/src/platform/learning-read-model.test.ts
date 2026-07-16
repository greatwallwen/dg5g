import assert from 'node:assert/strict';
import test from 'node:test';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { LearningReadModel, REQUIRED_SELF_STUDY_SECTIONS } from './learning-read-model.ts';
import { LearningRepository } from './learning-repository.ts';

test('projects one authoritative twelve-node student snapshot from SQLite facts', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const snapshot = new LearningReadModel(new LearningRepository(fixture.database))
      .readStudentSnapshot('stu-02');

    assert.equal(snapshot.studentId, 'stu-02');
    assert.equal(snapshot.version, 0);
    assert.equal(snapshot.globalVersion, 2);
    assert.equal(snapshot.nodes.length, 12);
    assert.deepEqual(snapshot.nodes.map(({ nodeId }) => nodeId), [
      'P1T1-N01', 'P1T1-N02', 'P1T1-N03', 'P1T1-N04',
      'P1T2-N01', 'P1T2-N02', 'P1T2-N03', 'P1T2-N04',
      'P1T3-N01', 'P1T3-N02', 'P1T3-N03', 'P1T3-N04',
    ]);

    const testedNode = requiredNode(snapshot, 'P1T1-N02');
    assert.equal(testedNode.state, 'achieved');
    assert.equal(testedNode.bestFormalScore, 88);
    assert.equal(testedNode.attempts.length, 1);
    assert.equal(testedNode.attempts[0]?.attemptId, 'demo-attempt-stu-02-p1t1-n02-v2');

    const outputNode = requiredNode(snapshot, 'P1T1-N04');
    assert.equal(outputNode.state, 'achieved');
    assert.equal(outputNode.evidence?.outputId, 'demo-output-stu-02-p1t1-n04');
    assert.equal(outputNode.evidence?.status, 'verified');
    assert.equal(outputNode.evidence?.version, 1);
    assert.equal(outputNode.evidence?.stateRevision, 1);
    assert.equal(outputNode.review?.status, 'verified');
    assert.equal(outputNode.review?.score, 90);

    const p02Entry = requiredNode(snapshot, 'P1T2-N01');
    assert.equal(p02Entry.state, 'achieved');
    assert.deepEqual(p02Entry.prerequisites, [{
      nodeId: 'P1T1-N04',
      condition: 'achieved',
      state: 'achieved',
      met: true,
    }]);
    assert.equal(requiredNode(snapshot, 'P1T2-N02').state, 'available');

    assert.deepEqual(snapshot.tasks, [
      { taskId: 'P01', nodeTestHighestScore: 88, outputRubricScore: 90, taskCompositeScore: 89 },
      { taskId: 'P02', nodeTestHighestScore: undefined, outputRubricScore: undefined },
      { taskId: 'P03', nodeTestHighestScore: undefined, outputRubricScore: undefined },
    ]);
    assert.equal(snapshot.projectCompositeScore, undefined);
  } finally {
    fixture.cleanup();
  }
});

test('uses the latest frozen official task score instead of recomputing mutable facts', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.prepare(`
      INSERT INTO frozen_task_scores (
        score_id, student_id, task_id, snapshot_version,
        provisional_score, official_score, details_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'later-frozen-stu-02-p01',
      'stu-02',
      'P01',
      3,
      77,
      77,
      JSON.stringify({ source: 'frozen-authority-test', taskCompositeScore: 77 }),
    );

    const snapshot = new LearningReadModel(new LearningRepository(fixture.database))
      .readStudentSnapshot('stu-02');

    assert.deepEqual(snapshot.tasks[0], {
      taskId: 'P01',
      nodeTestHighestScore: 88,
      outputRubricScore: 90,
      taskCompositeScore: 77,
    });
  } finally {
    fixture.cleanup();
  }
});

test('projects a stable class membership at one shared global snapshot version', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const repository = new LearningRepository(fixture.database);
    repository.appendEvent({
      eventId: 'class-snapshot-event',
      studentId: 'stu-01',
      nodeId: 'P1T1-N01',
      channel: 'self-study',
      eventType: 'section_completed',
      payload: { sectionId: 'case', completed: true },
    }, 0);
    repository.appendEvent({
      eventId: 'class-snapshot-practice',
      studentId: 'stu-01',
      nodeId: 'P1T1-N01',
      channel: 'classroom',
      eventType: 'classroom_activity_submitted',
      payload: { completed: true },
    }, 1);

    const snapshot = new LearningReadModel(repository).readClassSnapshot('teacher-01', 'demo-class');
    assert.equal(snapshot.classId, 'demo-class');
    assert.equal(snapshot.version, 4);
    assert.deepEqual(snapshot.students.map(({ studentId }) => studentId), ['stu-01', 'stu-02', 'stu-03']);
    assert.deepEqual(snapshot.students.map(({ globalVersion }) => globalVersion), [4, 4, 4]);
    assert.deepEqual(snapshot.students.map(({ version }) => version), [2, 0, 0]);
    assert.deepEqual(requiredNode(snapshot.students[0]!, 'P1T1-N01').completedSections, ['case']);
    assert.equal(requiredNode(snapshot.students[0]!, 'P1T1-N01').state, 'achieved');
  } finally {
    fixture.cleanup();
  }
});

test('micro-practice projection rejects incomplete client events but keeps the direct seed event', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    fixture.database.exec(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES
        ('strict-game-missing-formal', 'strict-game-missing-formal', 'Strict A', 'student', 'disabled'),
        ('strict-game-missing-complete', 'strict-game-missing-complete', 'Strict B', 'student', 'disabled'),
        ('strict-game-valid', 'strict-game-valid', 'Strict C', 'student', 'disabled'),
        ('strict-class-missing-complete', 'strict-class-missing-complete', 'Strict D', 'student', 'disabled'),
        ('strict-class-valid', 'strict-class-valid', 'Strict E', 'student', 'disabled'),
        ('strict-seed-direct', 'strict-seed-direct', 'Strict F', 'student', 'disabled');
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json
      ) VALUES
        ('strict-a', 'strict-game-missing-formal', 'P1T1-N01', 'game', 'game_completed', '{"completed":true}'),
        ('strict-b', 'strict-game-missing-complete', 'P1T1-N01', 'game', 'game_completed', '{"formal":false}'),
        ('strict-c', 'strict-game-valid', 'P1T1-N01', 'game', 'game_completed', '{"completed":true,"formal":false}'),
        ('strict-d', 'strict-class-missing-complete', 'P1T1-N01', 'classroom', 'classroom_submitted', '{}'),
        ('strict-e', 'strict-class-valid', 'P1T1-N01', 'classroom', 'classroom_activity_submitted', '{"completed":true}'),
        ('strict-f', 'strict-seed-direct', 'P1T1-N01', 'self-study', 'micro_practice_passed', '{}');
    `);
    const readModel = new LearningReadModel(new LearningRepository(fixture.database));
    const node = (studentId: string) => requiredNode(readModel.readStudentSnapshot(studentId), 'P1T1-N01');

    assert.equal(node('strict-game-missing-formal').state, 'learning');
    assert.equal(node('strict-game-missing-complete').state, 'learning');
    assert.equal(node('strict-game-valid').state, 'achieved');
    assert.equal(node('strict-class-missing-complete').state, 'learning');
    assert.equal(node('strict-class-missing-complete').classroomSubmitted, false);
    assert.equal(node('strict-class-valid').state, 'achieved');
    assert.equal(node('strict-class-valid').classroomSubmitted, true);
    assert.equal(node('strict-seed-direct').state, 'achieved');
    assert.equal(node('strict-seed-direct').classroomSubmitted, false);
  } finally {
    fixture.cleanup();
  }
});

test('all four required self-study sections plus an N02 pass advance while one missing section does not', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    fixture.database.exec(`
      INSERT INTO users (id, username, display_name, role, password_hash)
      VALUES
        ('four-sections', 'four-sections', 'Four Sections', 'student', 'disabled'),
        ('three-sections', 'three-sections', 'Three Sections', 'student', 'disabled');
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json
      ) VALUES
        ('four-prerequisite', 'four-sections', 'P1T1-N01', 'self-study', 'micro_practice_passed', '{}'),
        ('three-prerequisite', 'three-sections', 'P1T1-N01', 'self-study', 'micro_practice_passed', '{}'),
        ('four-understand', 'four-sections', 'P1T1-N02', 'self-study', 'section_completed', '{"sectionId":"understand","completed":true}'),
        ('four-evidence', 'four-sections', 'P1T1-N02', 'self-study', 'section_completed', '{"sectionId":"evidence","completed":true}'),
        ('four-explain', 'four-sections', 'P1T1-N02', 'self-study', 'section_completed', '{"sectionId":"explain","completed":true}'),
        ('four-practice', 'four-sections', 'P1T1-N02', 'self-study', 'section_completed', '{"sectionId":"practice","completed":true}'),
        ('three-understand', 'three-sections', 'P1T1-N02', 'self-study', 'section_completed', '{"sectionId":"understand","completed":true}'),
        ('three-evidence', 'three-sections', 'P1T1-N02', 'self-study', 'section_completed', '{"sectionId":"evidence","completed":true}'),
        ('three-explain', 'three-sections', 'P1T1-N02', 'self-study', 'section_completed', '{"sectionId":"explain","completed":true}');
      INSERT INTO formal_attempts (attempt_id, student_id, node_id, game_id, score)
      VALUES
        ('four-attempt', 'four-sections', 'P1T1-N02', 'node-test', 84),
        ('three-attempt', 'three-sections', 'P1T1-N02', 'node-test', 84);
    `);
    const readModel = new LearningReadModel(new LearningRepository(fixture.database));
    const complete = requiredNode(readModel.readStudentSnapshot('four-sections'), 'P1T1-N02');
    const incomplete = requiredNode(readModel.readStudentSnapshot('three-sections'), 'P1T1-N02');

    assert.deepEqual(complete.completedSections, [...REQUIRED_SELF_STUDY_SECTIONS]);
    assert.equal(complete.state, 'achieved');
    assert.ok(complete.stateTrail.includes('micro-practice-passed'));
    assert.ok(complete.stateTrail.includes('formal-test-passed'));
    assert.deepEqual(incomplete.completedSections, REQUIRED_SELF_STUDY_SECTIONS.slice(0, 3));
    assert.equal(incomplete.state, 'learning');
    assert.equal(incomplete.stateTrail.includes('micro-practice-passed'), false);
  } finally {
    fixture.cleanup();
  }
});

test('forms the project composite only when all three task test and verified rubric scores exist', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    fixture.database.exec(`
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json
      ) VALUES
        ('project-p3-n02-practice', 'stu-03', 'P1T3-N02', 'self-study', 'micro_practice_passed', '{}'),
        ('project-p3-n03-practice', 'stu-03', 'P1T3-N03', 'self-study', 'micro_practice_passed', '{}'),
        ('project-p3-n04-practice', 'stu-03', 'P1T3-N04', 'self-study', 'micro_practice_passed', '{}');
      INSERT INTO formal_attempts (
        attempt_id, student_id, node_id, game_id, score
      ) VALUES ('project-p3-n02-attempt', 'stu-03', 'P1T3-N02', 'node-test', 80);
      INSERT INTO professional_outputs (
        output_id, student_id, task_id, node_id, status, submitted_at,
        current_version, state_revision
      ) VALUES (
        'project-p3-n04-output', 'stu-03', 'P03', 'P1T3-N04', 'verified', CURRENT_TIMESTAMP,
        1, 1
      );
      INSERT INTO professional_output_versions (
        output_id, task_id, version, schema_version, fields_json, upstream_refs_json
      ) VALUES ('project-p3-n04-output', 'P03', 1, 1, '{}', '[]');
      INSERT INTO output_reviews (
        review_id, output_id, reviewer_id, status, score, feedback
      ) VALUES (
        'project-p3-n04-review', 'project-p3-n04-output', 'teacher-01', 'verified', 90, 'verified'
      );
      INSERT INTO frozen_task_scores (
        score_id, student_id, task_id, snapshot_version,
        provisional_score, official_score, details_json
      ) VALUES (
        'project-p3-frozen-score', 'stu-03', 'P03', 2, 86, 86,
        '{"nodeTestHighestScore":80,"outputRubricScore":90,"taskCompositeScore":86}'
      );
    `);

    const snapshot = new LearningReadModel(new LearningRepository(fixture.database))
      .readStudentSnapshot('stu-03');
    assert.deepEqual(snapshot.tasks, [
      { taskId: 'P01', nodeTestHighestScore: 93, outputRubricScore: 94, taskCompositeScore: 94 },
      { taskId: 'P02', nodeTestHighestScore: 91, outputRubricScore: 92, taskCompositeScore: 92 },
      { taskId: 'P03', nodeTestHighestScore: 80, outputRubricScore: 90, taskCompositeScore: 86 },
    ]);
    assert.equal(snapshot.projectCompositeScore, 91);
    assert.equal(requiredNode(snapshot, 'P1T3-N04').state, 'achieved');
  } finally {
    fixture.cleanup();
  }
});

function requiredNode(snapshot: ReturnType<LearningReadModel['readStudentSnapshot']>, nodeId: string) {
  const node = snapshot.nodes.find((candidate) => candidate.nodeId === nodeId);
  assert.ok(node, `missing node ${nodeId}`);
  return node;
}

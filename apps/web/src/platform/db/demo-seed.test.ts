import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPassword } from '../auth/password.ts';
import {
  DEMO_STUDENT_IDS,
  readDemoSeed,
  resetDemo,
  seedBase,
  seedDemo,
} from './demo-seed.ts';
import { migrateDatabase } from './migrations.ts';
import { createTestDatabase } from './test-database.ts';

test('three demo personas are rebuilt from complete truthful demo facts', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    assertTruthfulPersonas(fixture.database);
  } finally {
    fixture.cleanup();
  }
});

test('base and demo seeding are deterministic and keep one teacher with exactly three students', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    seedBase(fixture.database);
    seedDemo(fixture.database);
    const first = mutableCounts(fixture.database);
    seedDemo(fixture.database);
    assert.deepEqual(mutableCounts(fixture.database), first);
    assert.deepEqual(fixture.database.prepare('SELECT id FROM users ORDER BY id').pluck().all(), [
      'stu-01', 'stu-02', 'stu-03', 'teacher-01',
    ]);
    assert.equal(fixture.database.prepare("SELECT COUNT(*) FROM users WHERE role = 'teacher'").pluck().get(), 1);
    assert.equal(fixture.database.prepare("SELECT COUNT(*) FROM users WHERE role = 'student'").pluck().get(), 3);
    assert.equal(fixture.database.prepare('SELECT COUNT(*) FROM classroom_members').pluck().get(), 3);
    const passwordRows = fixture.database.prepare(`
      SELECT password_hash AS passwordHash FROM users
    `).all() as Array<{ passwordHash: string }>;
    assert.equal(passwordRows.every(({ passwordHash }) => verifyPassword('123456', passwordHash)), true);
  } finally {
    fixture.cleanup();
  }
});

test('seeded facts are explicitly demo while later user facts remain authoritative on repeated seed', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    for (const table of [
      'learning_events', 'practice_attempts', 'formal_attempts',
      'professional_outputs', 'output_reviews', 'frozen_task_scores',
    ]) {
      assert.equal(fixture.database.prepare(
        `SELECT COUNT(*) FROM ${table} WHERE origin != 'demo'`,
      ).pluck().get(), 0, `${table} seed facts must be demo origin`);
    }
    fixture.database.exec(`
      UPDATE professional_outputs
      SET origin = 'user', content_json = '{"user":"kept"}'
      WHERE output_id = 'demo-output-stu-02-p01';
      INSERT INTO formal_attempts (
        attempt_id, student_id, node_id, game_id, score, origin
      ) VALUES ('user-lower-score', 'stu-02', 'P1T1-N02', 'p01-n02-formal', 0, 'user');
    `);
    seedDemo(fixture.database);
    assert.deepEqual(fixture.database.prepare(`
      SELECT origin, content_json AS contentJson
      FROM professional_outputs WHERE output_id = 'demo-output-stu-02-p01'
    `).get(), { origin: 'user', contentJson: '{"user":"kept"}' });
    assert.equal(fixture.database.prepare(
      "SELECT score FROM formal_attempts WHERE attempt_id = 'user-lower-score'",
    ).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }
});

test('reset is transactional, preserves stable rows, removes all scoped runtime, and advances topics', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const evidenceCount = count(fixture.database, 'SELECT COUNT(*) FROM evidence_library');
    fixture.database.exec(`
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES ('user-transient', 'stu-01', 'P1T1-N01', 'self-study', 'section_completed', '{}', 'user');
      INSERT INTO practice_attempts (
        attempt_id, student_id, activity_id, node_id, passed, origin
      ) VALUES ('user-transient-practice', 'stu-01', 'P1T1-N01-micro-01', 'P1T1-N01', 1, 'user');
      INSERT INTO formal_assessment_instances (
        assessment_id, node_id, game_id, question_version, status
      ) VALUES ('user-transient-assessment', 'P1T1-N02', 'node-test', 'p01-n02-v1', 'running');
      INSERT INTO formal_assessment_tokens (
        token_hash, assessment_id, student_id, node_id, question_version, expires_at
      ) VALUES ('user-transient-token', 'user-transient-assessment', 'stu-01', 'P1T1-N02',
        'p01-n02-v1', '2099-01-01T00:00:00Z');
      INSERT INTO classroom_participation (
        session_id, student_id, state, mode
      ) VALUES ('demo-class', 'stu-01', 'joined', 'follow');
    `);
    const before = topicVersions(fixture.database);
    resetDemo(fixture.database);
    const afterFirst = topicVersions(fixture.database);
    assertTopicsAdvanced(before, afterFirst);
    assertTruthfulPersonas(fixture.database);
    assert.equal(count(fixture.database, "SELECT COUNT(*) FROM users"), 4);
    assert.equal(count(fixture.database, "SELECT COUNT(*) FROM classroom_members"), 3);
    assert.equal(count(fixture.database, "SELECT COUNT(*) FROM evidence_library"), evidenceCount);
    assert.equal(count(fixture.database, "SELECT COUNT(*) FROM classroom_participation"), 0);
    assert.equal(count(fixture.database, "SELECT COUNT(*) FROM learning_events WHERE event_id = 'user-transient'"), 0);
    assert.equal(count(fixture.database, "SELECT COUNT(*) FROM practice_attempts WHERE attempt_id = 'user-transient-practice'"), 0);
    assert.equal(count(fixture.database, "SELECT COUNT(*) FROM formal_assessment_instances WHERE assessment_id = 'user-transient-assessment'"), 0);

    resetDemo(fixture.database);
    const afterSecond = topicVersions(fixture.database);
    assertTopicsAdvanced(afterFirst, afterSecond);
    assertTruthfulPersonas(fixture.database);

    const invalidSeed = structuredClone(readDemoSeed());
    invalidSeed.demo.practiceAttempts[0]!.activityId = 'missing-activity';
    const stableBeforeFailure = mutableCounts(fixture.database);
    assert.throws(() => resetDemo(fixture.database, invalidSeed), /Unknown demo practice activity/);
    assert.deepEqual(mutableCounts(fixture.database), stableBeforeFailure);
    assertTruthfulPersonas(fixture.database);
  } finally {
    fixture.cleanup();
  }
});

test('frozen demo score snapshots never exceed the monotonic global snapshot', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    const globalVersion = fixture.database.prepare(
      "SELECT version FROM snapshot_versions WHERE topic = 'global'",
    ).pluck().get() as number;
    const maximumFrozen = fixture.database.prepare(
      'SELECT MAX(snapshot_version) FROM frozen_task_scores',
    ).pluck().get() as number;
    assert.equal(maximumFrozen <= globalVersion, true);
  } finally {
    fixture.cleanup();
  }
});

function assertTruthfulPersonas(database: ReturnType<typeof createTestDatabase>['database']) {
  for (const table of [
    'learning_events', 'practice_attempts', 'formal_attempts',
    'professional_outputs', 'frozen_task_scores',
  ]) {
    assert.equal(count(database, `SELECT COUNT(*) FROM ${table} WHERE student_id = 'stu-01'`), 0);
  }
  assert.deepEqual(database.prepare(`
    SELECT node_id AS nodeId, is_active AS isActive
    FROM self_study_cursors WHERE student_id = 'stu-01'
  `).get(), { nodeId: 'P1T1-N01', isActive: 1 });

  assert.equal(count(database, "SELECT COUNT(*) FROM practice_attempts WHERE student_id = 'stu-02'"), 6);
  const returned = database.prepare(`
    SELECT output_id AS outputId, status, current_version AS currentVersion,
      origin, content_json AS contentJson
    FROM professional_outputs WHERE student_id = 'stu-02' AND task_id = 'P01'
  `).get() as { outputId: string; status: string; currentVersion: number; origin: string; contentJson: string };
  assert.deepEqual(
    { status: returned.status, currentVersion: returned.currentVersion, origin: returned.origin },
    { status: 'returned', currentVersion: 1, origin: 'demo' },
  );
  const returnedFields = JSON.parse(returned.contentJson) as Record<string, unknown>;
  assert.deepEqual(Object.keys(returnedFields).sort(), [
    'collectionScope', 'connectionDirection', 'deviceIdentity', 'endpointA', 'endpointB',
    'evidenceGap', 'locationEvidence', 'photoIndex', 'riskAndReviewConclusion', 'siteRoom',
  ]);
  assert.equal(Object.values(returnedFields).every((value) => typeof value === 'string' && value.length > 0), true);
  assert.equal(count(database, `
    SELECT COUNT(*) FROM output_evidence_links WHERE output_id = '${returned.outputId}' AND version = 1
  `) > 0, true);
  assert.deepEqual(database.prepare(`
    SELECT status, origin FROM output_reviews WHERE output_id = ?
  `).get(returned.outputId), { status: 'returned', origin: 'demo' });
  assert.equal(count(database, `
    SELECT COUNT(*) FROM output_review_annotations AS annotation
    INNER JOIN output_reviews AS review ON review.review_id = annotation.review_id
    WHERE review.output_id = '${returned.outputId}'
  `) > 0, true);
  assert.equal(count(database, "SELECT COUNT(*) FROM frozen_task_scores WHERE student_id = 'stu-02'"), 0);

  assert.equal(count(database, "SELECT COUNT(*) FROM practice_attempts WHERE student_id = 'stu-03'") >= 6, true);
  const p01Attempt = database.prepare(`
    SELECT assessment_id AS assessmentId, question_version AS questionVersion,
      diagnostics_json AS diagnosticsJson, answers_json AS answersJson, origin
    FROM formal_attempts WHERE student_id = 'stu-03' AND node_id = 'P1T1-N02'
  `).get() as { assessmentId: string; questionVersion: string; diagnosticsJson: string; answersJson: string; origin: string };
  assert.equal(p01Attempt.assessmentId.length > 0, true);
  assert.equal(p01Attempt.questionVersion, 'p01-n02-v1');
  assert.equal(Object.keys(JSON.parse(p01Attempt.diagnosticsJson).dimensions).length, 4);
  assert.equal(Object.keys(JSON.parse(p01Attempt.answersJson)).length, 4);
  assert.equal(p01Attempt.origin, 'demo');
  assert.equal(count(database, `
    SELECT COUNT(*) FROM professional_outputs
    WHERE student_id = 'stu-03' AND status = 'verified' AND origin = 'demo'
  `), 3);
  const completeP01 = database.prepare(`
    SELECT output_id AS outputId, current_version AS currentVersion
    FROM professional_outputs WHERE student_id = 'stu-03' AND task_id = 'P01'
  `).get() as { outputId: string; currentVersion: number };
  assert.equal(completeP01.currentVersion, 2);
  const versions = database.prepare(`
    SELECT version, fields_json AS fieldsJson
    FROM professional_output_versions WHERE output_id = ? ORDER BY version
  `).all(completeP01.outputId) as Array<{ version: number; fieldsJson: string }>;
  assert.equal(versions.length, 2);
  const v1 = JSON.parse(versions[0]!.fieldsJson);
  const v2 = JSON.parse(versions[1]!.fieldsJson);
  assert.notEqual(v1.locationEvidence, v2.locationEvidence);
  assert.notEqual(v1.evidenceGap, v2.evidenceGap);
  assert.deepEqual(database.prepare(`
    SELECT status, origin FROM output_reviews
    WHERE output_id = ? ORDER BY reviewed_at, review_id
  `).all(completeP01.outputId), [
    { status: 'returned', origin: 'demo' },
    { status: 'verified', origin: 'demo' },
  ]);
}

function mutableCounts(database: ReturnType<typeof createTestDatabase>['database']) {
  return Object.fromEntries([
    'learning_events', 'practice_attempts', 'formal_assessment_instances', 'formal_assessment_tokens',
    'formal_attempts', 'professional_outputs', 'professional_output_versions', 'output_evidence_links',
    'output_reviews', 'output_review_annotations', 'self_study_cursors', 'frozen_task_scores',
  ].map((table) => [table, count(database, `SELECT COUNT(*) FROM ${table}`)]));
}

function count(database: ReturnType<typeof createTestDatabase>['database'], sql: string): number {
  return database.prepare(sql).pluck().get() as number;
}

function topicVersions(database: ReturnType<typeof createTestDatabase>['database']) {
  const read = database.prepare('SELECT version FROM snapshot_versions WHERE topic = ?').pluck();
  return {
    global: read.get('global') as number,
    classroom: read.get('classroom:demo-class') as number,
    students: Object.fromEntries(DEMO_STUDENT_IDS.map((id) => [
      id, read.get(`learning:${id}`) as number,
    ])) as Record<(typeof DEMO_STUDENT_IDS)[number], number>,
  };
}

function assertTopicsAdvanced(before: ReturnType<typeof topicVersions>, after: ReturnType<typeof topicVersions>) {
  assert.equal(after.global > before.global, true);
  assert.equal(after.classroom > before.classroom, true);
  for (const studentId of DEMO_STUDENT_IDS) {
    assert.equal(
      after.students[studentId] > before.students[studentId],
      true,
      `${studentId}: ${before.students[studentId]} -> ${after.students[studentId]}`,
    );
  }
}

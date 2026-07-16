import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyPassword } from '../auth/password.ts';
import { LearningReadModel } from '../learning-read-model.ts';
import { getNodeLearningPolicy } from '../learning-policy.ts';
import { LearningRepository } from '../learning-repository.ts';
import { readDemoSeed, resetDemo, seedBase, seedDemo } from './demo-seed.ts';
import { migrateDatabase } from './migrations.ts';
import { createTestDatabase } from './test-database.ts';

test('repeated base and demo seeds keep the stable 1-teacher/3-student classroom', () => {
  const testDatabase = createTestDatabase();
  const previousDemoPassword = process.env.DGBOOK_DEMO_PASSWORD;
  delete process.env.DGBOOK_DEMO_PASSWORD;

  try {
    migrateDatabase(testDatabase.database);
    seedBase(testDatabase.database);
    const firstPasswordRows = readPasswordRows();
    seedBase(testDatabase.database);
    seedDemo(testDatabase.database);
    seedDemo(testDatabase.database);
    const repeatedPasswordRows = readPasswordRows();

    const count = (sql: string) => testDatabase.database.prepare(sql).pluck().get() as number;
    const userIds = testDatabase.database.prepare(
      'SELECT id FROM users ORDER BY id',
    ).pluck().all() as string[];

    assert.equal(count("SELECT COUNT(*) FROM users WHERE role = 'teacher'"), 1);
    assert.equal(count("SELECT COUNT(*) FROM users WHERE role = 'student'"), 3);
    assert.equal(count('SELECT COUNT(*) FROM users'), 4);
    assert.equal(count('SELECT COUNT(*) FROM classroom_sessions'), 1);
    assert.equal(count('SELECT COUNT(*) FROM classroom_members'), 3);
    assert.equal(count('SELECT COUNT(*) FROM classroom_participation'), 0);
    assert.equal(testDatabase.database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'classroom:demo-class'
    `).pluck().get(), 0);
    assert.deepEqual(userIds, ['stu-01', 'stu-02', 'stu-03', 'teacher-01']);
    assert.deepEqual(repeatedPasswordRows, firstPasswordRows);
    for (const user of repeatedPasswordRows) {
      assert.equal(verifyPassword('123456', user.passwordHash), true, user.id);
      assert.equal(verifyPassword('wrong-password', user.passwordHash), false, user.id);
    }
    assert.deepEqual(
      testDatabase.database.prepare(`
        SELECT
          class_id AS classId,
          status,
          active_node_id AS activeNodeId,
          active_unit_id AS activeUnitId
        FROM classroom_sessions
      `).get(),
      {
        classId: 'demo-class',
        status: 'paused',
        activeNodeId: 'P1T1-N02',
        activeUnitId: 'P01-ku-02',
      },
    );
  } finally {
    restoreDemoPassword(previousDemoPassword);
    testDatabase.cleanup();
  }

  function readPasswordRows(): Array<{ id: string; passwordHash: string }> {
    return testDatabase.database.prepare(`
      SELECT id, password_hash AS passwordHash
      FROM users
      ORDER BY id
    `).all() as Array<{ id: string; passwordHash: string }>;
  }
});

test('repeated seed repairs only the untouched legacy classroom and preserves real teaching state', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    seedBase(testDatabase.database);
    testDatabase.database.prepare(`
      UPDATE classroom_sessions
      SET status = 'preparing', active_node_id = NULL, active_unit_id = NULL
      WHERE session_id = 'demo-class'
    `).run();

    seedBase(testDatabase.database);
    assert.deepEqual(readClassroomState(), {
      status: 'paused',
      activeNodeId: 'P1T1-N02',
      activeUnitId: 'P01-ku-02',
      revision: 0,
      stateJson: '{}',
    });

    testDatabase.database.prepare(`
      UPDATE classroom_sessions
      SET
        status = 'active',
        active_node_id = 'P1T2-N03',
        active_unit_id = 'P02-ku-03',
        revision = 7,
        state_json = '{"phase":"practice"}',
        updated_at = '2026-07-15T08:30:00.000Z'
      WHERE session_id = 'demo-class'
    `).run();
    testDatabase.database.prepare(`
      DELETE FROM snapshot_versions WHERE topic = 'classroom:demo-class'
    `).run();

    seedBase(testDatabase.database);
    assert.equal(testDatabase.database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'classroom:demo-class'
    `).pluck().get(), 7);
    testDatabase.database.prepare(`
      UPDATE snapshot_versions SET version = 11
      WHERE topic = 'classroom:demo-class'
    `).run();
    seedDemo(testDatabase.database);
    assert.deepEqual(readClassroomState(), {
      status: 'active',
      activeNodeId: 'P1T2-N03',
      activeUnitId: 'P02-ku-03',
      revision: 7,
      stateJson: '{"phase":"practice"}',
    });
    assert.equal(testDatabase.database.prepare(`
      SELECT updated_at FROM classroom_sessions WHERE session_id = 'demo-class'
    `).pluck().get(), '2026-07-15T08:30:00.000Z');
    assert.equal(testDatabase.database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'classroom:demo-class'
    `).pluck().get(), 11);
  } finally {
    testDatabase.cleanup();
  }

  function readClassroomState() {
    return testDatabase.database.prepare(`
      SELECT
        status,
        active_node_id AS activeNodeId,
        active_unit_id AS activeUnitId,
        revision,
        state_json AS stateJson
      FROM classroom_sessions
      WHERE session_id = 'demo-class'
    `).get();
  }
});

test('repeated demo seed never overwrites persisted classroom learning facts', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    seedDemo(testDatabase.database);
    testDatabase.database.exec(`
      UPDATE learning_events
      SET payload_json = '{"masteryPercent":99,"source":"live"}'
      WHERE event_id = 'demo-event-stu-01-p1t1-n01';
      UPDATE formal_attempts
      SET score = 81, duration_seconds = 777
      WHERE attempt_id = 'demo-attempt-stu-02-p1t1-n02-v2';
      UPDATE professional_outputs
      SET status = 'returned', content_json = '{"source":"live"}'
      WHERE output_id = 'demo-output-stu-02-p1t1-n04';
      UPDATE output_reviews
      SET status = 'returned', score = 81, feedback = 'live feedback'
      WHERE review_id = 'demo-review-stu-02-p1t1-n04';
      UPDATE self_study_cursors
      SET node_id = 'P1T2-N02', unit_id = 'P02-ku-02', position_ms = 9876
      WHERE student_id = 'stu-01' AND is_active = 1;
      UPDATE frozen_task_scores
      SET provisional_score = 81, official_score = NULL, details_json = '{"source":"live"}'
      WHERE score_id = 'demo-task-score-stu-02-p01-v2';
      UPDATE snapshot_versions
      SET version = 5, updated_at = '2026-07-15T08:45:00.000Z'
      WHERE topic = 'global';
    `);

    const before = readMutableFacts();
    seedDemo(testDatabase.database);
    seedDemo(testDatabase.database);

    assert.deepEqual(readMutableFacts(), before);
  } finally {
    testDatabase.cleanup();
  }

  function readMutableFacts() {
    return {
      event: testDatabase.database.prepare(`
        SELECT payload_json AS payloadJson FROM learning_events
        WHERE event_id = 'demo-event-stu-01-p1t1-n01'
      `).get(),
      attempt: testDatabase.database.prepare(`
        SELECT score, duration_seconds AS durationSeconds FROM formal_attempts
        WHERE attempt_id = 'demo-attempt-stu-02-p1t1-n02-v2'
      `).get(),
      output: testDatabase.database.prepare(`
        SELECT status, content_json AS contentJson FROM professional_outputs
        WHERE output_id = 'demo-output-stu-02-p1t1-n04'
      `).get(),
      review: testDatabase.database.prepare(`
        SELECT status, score, feedback FROM output_reviews
        WHERE review_id = 'demo-review-stu-02-p1t1-n04'
      `).get(),
      cursor: testDatabase.database.prepare(`
        SELECT node_id AS nodeId, unit_id AS unitId, position_ms AS positionMs
        FROM self_study_cursors
        WHERE student_id = 'stu-01' AND is_active = 1
      `).get(),
      frozenScore: testDatabase.database.prepare(`
        SELECT provisional_score AS provisionalScore, official_score AS officialScore,
          details_json AS detailsJson
        FROM frozen_task_scores
        WHERE score_id = 'demo-task-score-stu-02-p01-v2'
      `).get(),
      snapshot: testDatabase.database.prepare(`
        SELECT version, updated_at AS updatedAt
        FROM snapshot_versions WHERE topic = 'global'
      `).get(),
    };
  }
});

test('upgrades legacy stu-02 demo score by appending immutable v2 facts', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    seedBase(testDatabase.database);
    testDatabase.database.exec(`
      INSERT INTO formal_attempts (
        attempt_id, student_id, node_id, game_id, score, duration_seconds,
        mistake_knowledge_point_ids_json
      ) VALUES (
        'demo-attempt-stu-02-p1t1-n02', 'stu-02', 'P1T1-N02', 'node-test', 74, 224,
        '["P1T1-N02-kp-boundary"]'
      );
      INSERT INTO frozen_task_scores (
        score_id, student_id, task_id, snapshot_version,
        provisional_score, official_score, details_json
      ) VALUES (
        'demo-task-score-stu-02-p1t1-v1', 'stu-02', 'P1T1', 1,
        74, NULL, '{"source":"demo-seed"}'
      );
    `);

    seedDemo(testDatabase.database);
    seedDemo(testDatabase.database);

    assert.deepEqual(testDatabase.database.prepare(`
      SELECT attempt_id AS attemptId, score
      FROM formal_attempts
      WHERE student_id = 'stu-02' AND node_id = 'P1T1-N02'
      ORDER BY attempt_id
    `).all(), [
      { attemptId: 'demo-attempt-stu-02-p1t1-n02', score: 74 },
      { attemptId: 'demo-attempt-stu-02-p1t1-n02-v2', score: 88 },
    ]);
    assert.deepEqual(testDatabase.database.prepare(`
      SELECT
        score_id AS scoreId,
        task_id AS taskId,
        snapshot_version AS snapshotVersion,
        provisional_score AS provisionalScore,
        official_score AS officialScore
      FROM frozen_task_scores
      WHERE student_id = 'stu-02'
      ORDER BY snapshot_version, score_id
    `).all(), [
      {
        scoreId: 'demo-task-score-stu-02-p1t1-v1',
        taskId: 'P1T1',
        snapshotVersion: 1,
        provisionalScore: 74,
        officialScore: null,
      },
      {
        scoreId: 'demo-task-score-stu-02-p01-v2',
        taskId: 'P01',
        snapshotVersion: 2,
        provisionalScore: 89,
        officialScore: 89,
      },
    ]);

    const snapshot = new LearningReadModel(new LearningRepository(testDatabase.database))
      .readStudentSnapshot('stu-02');
    assert.deepEqual(snapshot.tasks[0], {
      taskId: 'P01',
      nodeTestHighestScore: 88,
      outputRubricScore: 90,
      taskCompositeScore: 89,
    });
    assert.equal(snapshot.globalVersion, 2);
  } finally {
    testDatabase.cleanup();
  }
});

test('upgrades the legacy stu-03 P01 entry event by appending an immutable passed fact', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    seedBase(testDatabase.database);
    testDatabase.database.prepare(`
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'demo-event-stu-03-p1t1-n01',
      'stu-03',
      'P1T1-N01',
      'self-study',
      'micro_practice_started',
      JSON.stringify({ source: 'legacy-demo-seed' }),
    );

    seedDemo(testDatabase.database);
    seedDemo(testDatabase.database);

    assert.deepEqual(testDatabase.database.prepare(`
      SELECT event_id AS eventId, event_type AS eventType
      FROM learning_events
      WHERE student_id = 'stu-03' AND node_id = 'P1T1-N01'
      ORDER BY event_id
    `).all(), [
      {
        eventId: 'demo-event-stu-03-p1t1-n01',
        eventType: 'micro_practice_started',
      },
      {
        eventId: 'demo-event-stu-03-p1t1-n01-v2',
        eventType: 'micro_practice_passed',
      },
    ]);

    const snapshot = new LearningReadModel(new LearningRepository(testDatabase.database))
      .readStudentSnapshot('stu-03');
    assert.equal(requiredLearningNode(snapshot, 'P1T1-N01').state, 'achieved');
    assert.equal(requiredLearningNode(snapshot, 'P1T1-N04').state, 'achieved');
    assert.equal(requiredLearningNode(snapshot, 'P1T2-N01').state, 'achieved');
    assert.equal(requiredLearningNode(snapshot, 'P1T2-N04').state, 'achieved');
    assert.equal(requiredLearningNode(snapshot, 'P1T3-N01').state, 'achieved');
    assert.equal(requiredLearningNode(snapshot, 'P1T3-N02').state, 'available');
  } finally {
    testDatabase.cleanup();
  }
});

test('uses DGBOOK_DEMO_PASSWORD and preserves hashes that already authenticate it', () => {
  const testDatabase = createTestDatabase();
  const previousDemoPassword = process.env.DGBOOK_DEMO_PASSWORD;
  process.env.DGBOOK_DEMO_PASSWORD = 'review-override-password';

  try {
    migrateDatabase(testDatabase.database);
    seedBase(testDatabase.database);
    const firstPasswordRows = testDatabase.database.prepare(`
      SELECT id, password_hash AS passwordHash
      FROM users
      ORDER BY id
    `).all() as Array<{ id: string; passwordHash: string }>;

    seedBase(testDatabase.database);
    const repeatedPasswordRows = testDatabase.database.prepare(`
      SELECT id, password_hash AS passwordHash
      FROM users
      ORDER BY id
    `).all() as Array<{ id: string; passwordHash: string }>;

    assert.equal(firstPasswordRows.length, 4);
    assert.deepEqual(repeatedPasswordRows, firstPasswordRows);
    for (const user of repeatedPasswordRows) {
      assert.equal(verifyPassword('review-override-password', user.passwordHash), true, user.id);
      assert.equal(verifyPassword('123456', user.passwordHash), false, user.id);
    }
  } finally {
    restoreDemoPassword(previousDemoPassword);
    testDatabase.cleanup();
  }
});

test('keeps the fully seeded database structurally intact', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    seedDemo(testDatabase.database);
    assert.equal(testDatabase.database.pragma('integrity_check', { simple: true }), 'ok');
  } finally {
    testDatabase.cleanup();
  }
});

test('staggers the three seeded students across P01, P02, and P03 without inventing roster size', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    seedDemo(testDatabase.database);

    assert.deepEqual(testDatabase.database.prepare(`
      SELECT student_id AS studentId, node_id AS nodeId, unit_id AS unitId, is_active AS isActive
      FROM self_study_cursors
      ORDER BY student_id
    `).all(), [
      { studentId: 'stu-01', nodeId: 'P1T1-N02', unitId: 'P01-ku-02', isActive: 1 },
      { studentId: 'stu-02', nodeId: 'P1T2-N02', unitId: 'P02-ku-02', isActive: 1 },
      { studentId: 'stu-03', nodeId: 'P1T3-N02', unitId: 'P03-ku-02', isActive: 1 },
    ]);
    assert.equal(testDatabase.database.prepare(`
      SELECT COUNT(*) FROM classroom_members WHERE session_id = 'demo-class'
    `).pluck().get(), 3);
  } finally {
    testDatabase.cleanup();
  }
});

test('seeds completed P01/P02 facts through N02 tests and N04 reviews without N04 task-pixi attempts', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    seedDemo(testDatabase.database);

    const completedTasks = [
      { studentId: 'stu-02', taskId: 'P1T1' },
      { studentId: 'stu-03', taskId: 'P1T1' },
      { studentId: 'stu-03', taskId: 'P1T2' },
    ] as const;

    for (const completed of completedTasks) {
      const outputTaskId = completed.taskId === 'P1T1' ? 'P01' : 'P02';
      const microPracticeFacts = testDatabase.database.prepare(`
        SELECT node_id AS nodeId, event_type AS eventType
        FROM learning_events
        WHERE student_id = ? AND node_id LIKE ?
        ORDER BY node_id, event_id
      `).all(completed.studentId, `${completed.taskId}-N%`) as Array<{
        nodeId: string;
        eventType: string;
      }>;
      assert.deepEqual(microPracticeFacts, [1, 2, 3, 4].map((index) => ({
        nodeId: `${completed.taskId}-N0${index}`,
        eventType: 'micro_practice_passed',
      })), `${completed.studentId}/${completed.taskId} micro-practice facts`);
      for (const fact of microPracticeFacts) {
        assert.equal(getNodeLearningPolicy(fact.nodeId)?.requiresMicroPractice, true, fact.nodeId);
      }

      const attempts = testDatabase.database.prepare(`
        SELECT node_id AS nodeId, game_id AS gameId, score
        FROM formal_attempts
        WHERE student_id = ? AND node_id LIKE ?
        ORDER BY attempt_id
      `).all(completed.studentId, `${completed.taskId}-N%`) as Array<{
        nodeId: string;
        gameId: string | null;
        score: number;
      }>;
      assert.equal(attempts.length, 1, `${completed.studentId}/${completed.taskId} formal attempt count`);
      assert.equal(attempts[0].nodeId, `${completed.taskId}-N02`);
      assert.equal(attempts[0].gameId, 'node-test');
      assert.ok(attempts[0].score >= 80, `${completed.studentId}/${completed.taskId} score`);

      assert.deepEqual(testDatabase.database.prepare(`
        SELECT
          output.task_id AS taskId,
          output.node_id AS nodeId,
          output.status AS outputStatus,
          review.status AS reviewStatus
        FROM professional_outputs AS output
        JOIN output_reviews AS review ON review.output_id = output.output_id
        WHERE output.student_id = ? AND output.task_id = ?
      `).get(completed.studentId, outputTaskId), {
        taskId: outputTaskId,
        nodeId: `${completed.taskId}-N04`,
        outputStatus: 'verified',
        reviewStatus: 'verified',
      });
      const version = testDatabase.database.prepare(`
        SELECT
          head.current_version AS currentVersion,
          head.state_revision AS stateRevision,
          version.version,
          version.task_id AS taskId,
          version.upstream_refs_json AS upstreamRefsJson
        FROM professional_outputs AS head
        JOIN professional_output_versions AS version
          ON version.output_id = head.output_id AND version.version = head.current_version
        WHERE head.student_id = ? AND head.task_id = ?
      `).get(completed.studentId, outputTaskId) as {
        currentVersion: number;
        stateRevision: number;
        version: number;
        taskId: string;
        upstreamRefsJson: string;
      };
      assert.equal(version.currentVersion, 1);
      assert.equal(version.stateRevision, 1);
      assert.equal(version.version, 1);
      assert.equal(version.taskId, outputTaskId);
      const upstreamRefs = JSON.parse(version.upstreamRefsJson) as Array<{
        outputId: string;
        version: number;
      }>;
      if (outputTaskId === 'P01') {
        assert.deepEqual(upstreamRefs, []);
      } else {
        assert.equal(upstreamRefs.length, 1);
        assert.equal(upstreamRefs[0]?.version, 1);
        assert.equal(testDatabase.database.prepare(`
          SELECT task_id FROM professional_outputs WHERE output_id = ?
        `).pluck().get(upstreamRefs[0]?.outputId), 'P01');
      }
    }

    assert.equal(testDatabase.database.prepare(`
      SELECT COUNT(*) FROM formal_attempts
      WHERE node_id LIKE '%-N04' OR game_id = 'task-pixi'
    `).pluck().get(), 0);
    const frozenScores = testDatabase.database.prepare(`
      SELECT student_id AS studentId, task_id AS taskId
      FROM frozen_task_scores
      ORDER BY student_id, task_id
    `).all();
    assert.deepEqual(frozenScores, [
      { studentId: 'stu-02', taskId: 'P01' },
      { studentId: 'stu-03', taskId: 'P01' },
      { studentId: 'stu-03', taskId: 'P02' },
    ]);
    assert.equal(JSON.stringify(readDemoSeed()).includes('P1-T1'), false);
  } finally {
    testDatabase.cleanup();
  }
});

test('keeps frozen demo scores at or behind the monotonic global snapshot version', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    seedDemo(testDatabase.database);

    const globalVersion = testDatabase.database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'global'
    `).pluck().get() as number;
    const futureScoreCount = testDatabase.database.prepare(`
      SELECT COUNT(*)
      FROM frozen_task_scores AS score
      JOIN snapshot_versions AS snapshot ON snapshot.topic = 'global'
      WHERE score.snapshot_version > snapshot.version
    `).pluck().get() as number;
    assert.ok(globalVersion >= 1);
    assert.equal(futureScoreCount, 0);

    testDatabase.database.prepare(`
      UPDATE snapshot_versions SET version = 5 WHERE topic = 'global'
    `).run();
    resetDemo(testDatabase.database);
    assert.equal(testDatabase.database.prepare(`
      SELECT version FROM snapshot_versions WHERE topic = 'global'
    `).pluck().get(), 5);
  } finally {
    testDatabase.cleanup();
  }
});

test('reset demo removes mutable demo changes and restores deterministic rows', () => {
  const testDatabase = createTestDatabase();

  try {
    migrateDatabase(testDatabase.database);
    seedDemo(testDatabase.database);
    testDatabase.database.prepare(`
      UPDATE formal_attempts
      SET score = 1
      WHERE attempt_id = 'demo-attempt-stu-02-p1t1-n02-v2'
    `).run();
    testDatabase.database.prepare(`
      INSERT INTO professional_outputs (output_id, student_id, task_id, node_id)
      VALUES ('transient-output', 'stu-02', 'P1T1', 'P1T1-N04')
    `).run();
    testDatabase.database.exec(`
      UPDATE classroom_sessions
      SET status = 'active', active_node_id = 'P1T3-N04', active_unit_id = 'P03-ku-04'
      WHERE session_id = 'demo-class';
      UPDATE learning_events
      SET payload_json = '{"source":"live"}'
      WHERE event_id = 'demo-event-stu-01-p1t1-n01';
      UPDATE professional_outputs
      SET status = 'returned', content_json = '{"source":"live"}'
      WHERE output_id = 'demo-output-stu-02-p1t1-n04';
      UPDATE self_study_cursors
      SET node_id = 'P1T3-N01', position_ms = 9999
      WHERE student_id = 'stu-01' AND is_active = 1;
    `);

    resetDemo(testDatabase.database);
    resetDemo(testDatabase.database);

    assert.equal(testDatabase.database.prepare(`
      SELECT score
      FROM formal_attempts
      WHERE attempt_id = 'demo-attempt-stu-02-p1t1-n02-v2'
    `).pluck().get(), 88);
    assert.equal(testDatabase.database.prepare(`
      SELECT COUNT(*) FROM professional_outputs WHERE output_id = 'transient-output'
    `).pluck().get(), 0);
    assert.deepEqual(testDatabase.database.prepare(`
      SELECT status, active_node_id AS activeNodeId, active_unit_id AS activeUnitId
      FROM classroom_sessions WHERE session_id = 'demo-class'
    `).get(), {
      status: 'paused',
      activeNodeId: 'P1T1-N02',
      activeUnitId: 'P01-ku-02',
    });
    assert.deepEqual(JSON.parse(testDatabase.database.prepare(`
      SELECT payload_json FROM learning_events
      WHERE event_id = 'demo-event-stu-01-p1t1-n01'
    `).pluck().get() as string), { masteryPercent: 92, evidenceStatus: 'verified' });
    assert.deepEqual(testDatabase.database.prepare(`
      SELECT status, content_json AS contentJson FROM professional_outputs
      WHERE output_id = 'demo-output-stu-02-p1t1-n04'
    `).get(), {
      status: 'verified',
      contentJson: '{"kind":"indoor-device-link-evidence-sheet","version":1}',
    });
    assert.deepEqual(testDatabase.database.prepare(`
      SELECT node_id AS nodeId, unit_id AS unitId, position_ms AS positionMs
      FROM self_study_cursors
      WHERE student_id = 'stu-01' AND is_active = 1
    `).get(), {
      nodeId: 'P1T1-N02',
      unitId: 'P01-ku-02',
      positionMs: 0,
    });
  } finally {
    testDatabase.cleanup();
  }
});

function restoreDemoPassword(previousValue: string | undefined): void {
  if (previousValue === undefined) delete process.env.DGBOOK_DEMO_PASSWORD;
  else process.env.DGBOOK_DEMO_PASSWORD = previousValue;
}

function requiredLearningNode(
  snapshot: ReturnType<LearningReadModel['readStudentSnapshot']>,
  nodeId: string,
) {
  const node = snapshot.nodes.find((candidate) => candidate.nodeId === nodeId);
  assert.ok(node, `missing learning node ${nodeId}`);
  return node;
}

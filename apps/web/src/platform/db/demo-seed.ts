import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import type { AppDatabase } from './database.ts';

export const DEMO_TEACHER_ID = 'teacher-01';
export const DEMO_STUDENT_IDS = ['stu-01', 'stu-02', 'stu-03'] as const;
export const DEMO_CLASS_ID = 'demo-class';

type UserRole = 'teacher' | 'student';
type LearningChannel = 'self-study' | 'classroom' | 'game';
type OutputStatus = 'draft' | 'submitted' | 'returned' | 'verified';
type ReviewStatus = 'returned' | 'verified';

interface DemoSeed {
  base: {
    users: Array<{
      id: string;
      username: string;
      displayName: string;
      role: UserRole;
      isActive: boolean;
    }>;
    classrooms: Array<{
      sessionId: string;
      classId: string;
      name: string;
      teacherId: string;
      status: 'preparing' | 'active' | 'paused' | 'closed';
      activeNodeId: string | null;
      activeUnitId: string | null;
    }>;
    memberships: Array<{ sessionId: string; studentId: string }>;
  };
  demo: {
    events: Array<{
      eventId: string;
      studentId: string;
      nodeId: string;
      channel: LearningChannel;
      eventType: string;
      payload: Record<string, unknown>;
    }>;
    attempts: Array<{
      attemptId: string;
      studentId: string;
      nodeId: string;
      gameId?: string;
      score: number;
      durationSeconds?: number;
      mistakeKnowledgePointIds: string[];
    }>;
    outputs: Array<{
      outputId: string;
      studentId: string;
      taskId: string;
      nodeId: string;
      status: OutputStatus;
      content: Record<string, unknown>;
    }>;
    reviews: Array<{
      reviewId: string;
      outputId: string;
      reviewerId: string;
      status: ReviewStatus;
      score?: number;
      feedback?: string;
    }>;
    cursors: Array<{
      studentId: string;
      nodeId: string;
      unitId?: string;
      actionId?: string;
      actionIndex: number;
      positionMs: number;
    }>;
    frozenTaskScores: Array<{
      scoreId: string;
      studentId: string;
      taskId: string;
      snapshotVersion: number;
      provisionalScore: number;
      officialScore: number | null;
      details: Record<string, unknown>;
    }>;
  };
}

export function seedBase(database: AppDatabase, seed = readDemoSeed()): void {
  validateStableBase(seed);
  const demoPassword = process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
  const readPasswordHash = database.prepare(
    'SELECT password_hash FROM users WHERE id = ?',
  ).pluck();
  const upsertUser = database.prepare(`
    INSERT INTO users (
      id, username, display_name, role, password_hash, is_active, updated_at
    ) VALUES (
      @id, @username, @displayName, @role, @passwordHash, @isActive, CURRENT_TIMESTAMP
    )
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      display_name = excluded.display_name,
      role = excluded.role,
      password_hash = excluded.password_hash,
      is_active = excluded.is_active,
      updated_at = CURRENT_TIMESTAMP
  `);
  const upsertClassroom = database.prepare(`
    INSERT INTO classroom_sessions (
      session_id, class_id, name, teacher_id, status, active_node_id, active_unit_id,
      updated_at
    ) VALUES (
      @sessionId, @classId, @name, @teacherId, @status, @activeNodeId, @activeUnitId,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(session_id) DO UPDATE SET
      class_id = excluded.class_id,
      name = excluded.name,
      teacher_id = excluded.teacher_id,
      status = CASE
        WHEN classroom_sessions.status = 'preparing'
          AND classroom_sessions.active_node_id IS NULL
        THEN excluded.status
        ELSE classroom_sessions.status
      END,
      active_node_id = CASE
        WHEN classroom_sessions.status = 'preparing'
          AND classroom_sessions.active_node_id IS NULL
        THEN excluded.active_node_id
        ELSE classroom_sessions.active_node_id
      END,
      active_unit_id = CASE
        WHEN classroom_sessions.status = 'preparing'
          AND classroom_sessions.active_node_id IS NULL
        THEN excluded.active_unit_id
        ELSE classroom_sessions.active_unit_id
      END,
      updated_at = CASE
        WHEN classroom_sessions.status = 'preparing'
          AND classroom_sessions.active_node_id IS NULL
        THEN CURRENT_TIMESTAMP
        ELSE classroom_sessions.updated_at
      END
  `);
  const upsertMembership = database.prepare(`
    INSERT INTO classroom_members (session_id, student_id)
    VALUES (@sessionId, @studentId)
    ON CONFLICT(session_id, student_id) DO NOTHING
  `);
  const ensureClassroomTopic = database.prepare(`
    INSERT INTO snapshot_versions (topic, version, updated_at)
    SELECT 'classroom:' || session_id, revision, updated_at
    FROM classroom_sessions
    WHERE session_id = @sessionId
    ON CONFLICT(topic) DO UPDATE SET
      version = MAX(snapshot_versions.version, excluded.version),
      updated_at = CASE
        WHEN excluded.version > snapshot_versions.version THEN excluded.updated_at
        ELSE snapshot_versions.updated_at
      END
  `);

  database.transaction(() => {
    for (const user of seed.base.users) {
      const storedHash = readPasswordHash.get(user.id);
      const passwordHash = typeof storedHash === 'string' && verifyPassword(demoPassword, storedHash)
        ? storedHash
        : hashPassword(demoPassword);
      upsertUser.run({ ...user, passwordHash, isActive: Number(user.isActive) });
    }
    for (const classroom of seed.base.classrooms) {
      upsertClassroom.run(classroom);
      ensureClassroomTopic.run({ sessionId: classroom.sessionId });
    }
    for (const membership of seed.base.memberships) upsertMembership.run(membership);
  })();
}

export function seedDemo(database: AppDatabase, seed = readDemoSeed()): void {
  seedBase(database, seed);
  const upsertEvent = database.prepare(`
    INSERT INTO learning_events (
      event_id, student_id, node_id, channel, event_type, payload_json
    ) VALUES (
      @eventId, @studentId, @nodeId, @channel, @eventType, @payloadJson
    )
    ON CONFLICT(event_id) DO NOTHING
  `);
  const upsertAttempt = database.prepare(`
    INSERT INTO formal_attempts (
      attempt_id, student_id, node_id, game_id, score, duration_seconds,
      mistake_knowledge_point_ids_json
    ) VALUES (
      @attemptId, @studentId, @nodeId, @gameId, @score, @durationSeconds,
      @mistakeKnowledgePointIdsJson
    )
    ON CONFLICT(attempt_id) DO NOTHING
  `);
  const upsertOutput = database.prepare(`
    INSERT INTO professional_outputs (
      output_id, student_id, task_id, node_id, status, content_json,
      current_version, state_revision, updated_at
    ) VALUES (
      @outputId, @studentId, @taskId, @nodeId, @status, @contentJson,
      1, 1, CURRENT_TIMESTAMP
    )
    ON CONFLICT(output_id) DO NOTHING
  `);
  const upsertOutputVersion = database.prepare(`
    INSERT INTO professional_output_versions (
      output_id, task_id, version, schema_version, fields_json, upstream_refs_json
    ) VALUES (
      @outputId, @taskId, 1, 1, @fieldsJson, @upstreamRefsJson
    )
    ON CONFLICT(output_id, version) DO NOTHING
  `);
  const upsertReview = database.prepare(`
    INSERT INTO output_reviews (
      review_id, output_id, reviewer_id, status, score, feedback
    ) VALUES (
      @reviewId, @outputId, @reviewerId, @status, @score, @feedback
    )
    ON CONFLICT(review_id) DO NOTHING
  `);
  const upsertCursor = database.prepare(`
    INSERT INTO self_study_cursors (
      student_id, node_id, unit_id, action_id, action_index, position_ms, is_active, updated_at
    ) VALUES (
      @studentId, @nodeId, @unitId, @actionId, @actionIndex, @positionMs,
      CASE WHEN EXISTS (
        SELECT 1 FROM self_study_cursors
        WHERE student_id = @studentId AND is_active = 1
      ) THEN 0 ELSE 1 END,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(student_id, node_id) DO NOTHING
  `);
  const upsertFrozenScore = database.prepare(`
    INSERT INTO frozen_task_scores (
      score_id, student_id, task_id, snapshot_version, provisional_score,
      official_score, details_json
    ) VALUES (
      @scoreId, @studentId, @taskId, @snapshotVersion, @provisionalScore,
      @officialScore, @detailsJson
    )
    ON CONFLICT(score_id) DO NOTHING
  `);
  const advanceGlobalSnapshot = database.prepare(`
    INSERT INTO snapshot_versions (topic, version, updated_at)
    VALUES ('global', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(topic) DO UPDATE SET
      version = MAX(snapshot_versions.version, excluded.version),
      updated_at = CASE
        WHEN excluded.version > snapshot_versions.version THEN CURRENT_TIMESTAMP
        ELSE snapshot_versions.updated_at
      END
  `);

  database.transaction(() => {
    for (const event of seed.demo.events) {
      upsertEvent.run({ ...event, payloadJson: JSON.stringify(event.payload) });
    }
    for (const attempt of seed.demo.attempts) {
      upsertAttempt.run({
        gameId: null,
        durationSeconds: null,
        ...attempt,
        mistakeKnowledgePointIdsJson: JSON.stringify(attempt.mistakeKnowledgePointIds),
      });
    }
    for (const output of seed.demo.outputs) {
      const taskId = canonicalOutputTaskId(output.taskId);
      const fieldsJson = JSON.stringify(output.content);
      const upstreamTaskId = taskId === 'P02' ? 'P01' : taskId === 'P03' ? 'P02' : undefined;
      const upstream = upstreamTaskId
        ? seed.demo.outputs.find((candidate) => (
          candidate.studentId === output.studentId
          && canonicalOutputTaskId(candidate.taskId) === upstreamTaskId
        ))
        : undefined;
      const upstreamRefsJson = JSON.stringify(upstream
        ? [{ outputId: upstream.outputId, version: 1 }]
        : []);
      upsertOutput.run({ ...output, taskId, contentJson: fieldsJson });
      upsertOutputVersion.run({
        outputId: output.outputId,
        taskId,
        fieldsJson,
        upstreamRefsJson,
      });
    }
    for (const review of seed.demo.reviews) {
      upsertReview.run({ score: null, feedback: null, ...review });
    }
    for (const cursor of seed.demo.cursors) {
      upsertCursor.run({ unitId: null, actionId: null, ...cursor });
    }
    const requiredSnapshotVersion = seed.demo.frozenTaskScores.reduce(
      (maximum, frozenScore) => Math.max(maximum, frozenScore.snapshotVersion),
      0,
    );
    advanceGlobalSnapshot.run(requiredSnapshotVersion);
    for (const frozenScore of seed.demo.frozenTaskScores) {
      upsertFrozenScore.run({
        ...frozenScore,
        detailsJson: JSON.stringify(frozenScore.details),
      });
    }
  })();
}

function canonicalOutputTaskId(taskId: string): 'P01' | 'P02' | 'P03' {
  const canonical = ({ P1T1: 'P01', P1T2: 'P02', P1T3: 'P03' } as const)[taskId as 'P1T1'];
  if (!canonical && !['P01', 'P02', 'P03'].includes(taskId)) {
    throw new Error(`Unsupported seeded professional output task: ${taskId}.`);
  }
  return (canonical ?? taskId) as 'P01' | 'P02' | 'P03';
}

export function resetDemo(database: AppDatabase, seed = readDemoSeed()): void {
  const studentPlaceholders = DEMO_STUDENT_IDS.map(() => '?').join(', ');
  database.transaction(() => {
    database.prepare('DELETE FROM classroom_sessions WHERE session_id = ?').run(DEMO_CLASS_ID);
    database.prepare(`DELETE FROM professional_outputs WHERE student_id IN (${studentPlaceholders})`)
      .run(...DEMO_STUDENT_IDS);
    database.prepare(`DELETE FROM self_study_cursors WHERE student_id IN (${studentPlaceholders})`)
      .run(...DEMO_STUDENT_IDS);
    database.prepare(`DELETE FROM formal_attempts WHERE student_id IN (${studentPlaceholders})`)
      .run(...DEMO_STUDENT_IDS);
    database.prepare(`DELETE FROM learning_events WHERE student_id IN (${studentPlaceholders})`)
      .run(...DEMO_STUDENT_IDS);
    database.prepare(`DELETE FROM frozen_task_scores WHERE student_id IN (${studentPlaceholders})`)
      .run(...DEMO_STUDENT_IDS);
    seedDemo(database, seed);
  })();
}

export function readDemoSeed(seedPath = resolveDemoSeedPath()): DemoSeed {
  return JSON.parse(readFileSync(seedPath, 'utf8')) as DemoSeed;
}

export function resolveDemoSeedPath(): string {
  const candidates = [
    join(process.cwd(), 'database', 'demo-seed.json'),
    join(process.cwd(), 'apps', 'web', 'database', 'demo-seed.json'),
    fileURLToPath(new URL('../../../database/demo-seed.json', import.meta.url)),
  ];
  const seedPath = candidates.find((candidate) => existsSync(candidate));
  if (!seedPath) throw new Error('Unable to locate apps/web/database/demo-seed.json.');
  return seedPath;
}

function validateStableBase(seed: DemoSeed): void {
  const teacherIds = seed.base.users
    .filter((user) => user.role === 'teacher')
    .map((user) => user.id);
  const studentIds = seed.base.users
    .filter((user) => user.role === 'student')
    .map((user) => user.id)
    .sort();
  const classIds = seed.base.classrooms.map((classroom) => classroom.classId);
  const membershipIds = seed.base.memberships
    .filter((membership) => membership.sessionId === DEMO_CLASS_ID)
    .map((membership) => membership.studentId)
    .sort();

  if (
    teacherIds.length !== 1
    || teacherIds[0] !== DEMO_TEACHER_ID
    || studentIds.join(',') !== [...DEMO_STUDENT_IDS].sort().join(',')
    || classIds.length !== 1
    || classIds[0] !== DEMO_CLASS_ID
    || membershipIds.join(',') !== [...DEMO_STUDENT_IDS].sort().join(',')
  ) {
    throw new Error('Demo seed must define the stable teacher, students, class, and memberships.');
  }
}

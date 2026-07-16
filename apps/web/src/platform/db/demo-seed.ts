import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readActivityDefinition } from '../../features/learning-activities/activity-catalog.ts';
import { seedP01EvidenceLibrary } from '../../features/portfolio/evidence-library.ts';
import { hashPassword, verifyPassword } from '../auth/password.ts';
import { SnapshotClock } from '../snapshot-clock.ts';
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
    practiceAttempts: Array<{
      attemptId: string;
      studentId: string;
      activityId: string;
      nodeId: string;
      response: Record<string, unknown>;
    }>;
    assessmentInstances: Array<{
      assessmentId: string;
      nodeId: string;
      gameId: string;
      questionVersion: string;
      status: 'preparing' | 'running' | 'closed';
    }>;
    attempts: Array<{
      attemptId: string;
      studentId: string;
      nodeId: string;
      assessmentId: string;
      gameId: string;
      questionVersion: string;
      score: number;
      durationSeconds?: number;
      completedAt: string;
      answers: Record<string, unknown>;
      diagnostics: Record<string, unknown>;
    }>;
    outputs: Array<{
      outputId: string;
      studentId: string;
      taskId: string;
      nodeId: string;
      status: OutputStatus;
      currentVersion: number;
      stateRevision: number;
      versions: Array<{
        version: number;
        fields: Record<string, unknown>;
        upstreamRefs: Array<{ outputId: string; version: number }>;
        evidenceLinks: Record<string, string[]>;
      }>;
    }>;
    reviews: Array<{
      reviewId: string;
      outputId: string;
      outputVersion: number;
      reviewerId: string;
      status: ReviewStatus;
      score?: number;
      feedback?: string;
      annotations: Record<string, string>;
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
  const ensureLearningTopic = database.prepare(`
    INSERT INTO snapshot_versions (topic, version, updated_at)
    VALUES ('learning:' || @id, 0, CURRENT_TIMESTAMP)
    ON CONFLICT(topic) DO NOTHING
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
      if (user.role === 'student') ensureLearningTopic.run(user);
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
  seedP01EvidenceLibrary(database);
  const upsertEvent = database.prepare(`
    INSERT INTO learning_events (
      event_id, student_id, node_id, channel, event_type, payload_json, origin
    ) VALUES (
      @eventId, @studentId, @nodeId, @channel, @eventType, @payloadJson, 'demo'
    )
    ON CONFLICT(event_id) DO NOTHING
  `);
  const upsertPracticeAttempt = database.prepare(`
    INSERT INTO practice_attempts (
      attempt_id, student_id, activity_id, node_id, response_json,
      result_json, artifact_json, passed, origin
    ) VALUES (
      @attemptId, @studentId, @activityId, @nodeId, @responseJson,
      @resultJson, @artifactJson, 1, 'demo'
    )
    ON CONFLICT(attempt_id) DO NOTHING
  `);
  const upsertAssessmentInstance = database.prepare(`
    INSERT INTO formal_assessment_instances (
      assessment_id, node_id, game_id, question_version, status,
      opened_at, closed_at
    ) VALUES (
      @assessmentId, @nodeId, @gameId, @questionVersion, @status,
      CURRENT_TIMESTAMP,
      CASE WHEN @status = 'closed' THEN CURRENT_TIMESTAMP ELSE NULL END
    )
    ON CONFLICT(assessment_id) DO NOTHING
  `);
  const upsertAttempt = database.prepare(`
    INSERT INTO formal_attempts (
      attempt_id, student_id, node_id, assessment_id, game_id, score, duration_seconds,
      mistake_knowledge_point_ids_json, question_version, answers_json,
      diagnostics_json, completed_at, origin
    ) VALUES (
      @attemptId, @studentId, @nodeId, @assessmentId, @gameId, @score, @durationSeconds,
      '[]', @questionVersion, @answersJson, @diagnosticsJson, @completedAt, 'demo'
    )
    ON CONFLICT(attempt_id) DO NOTHING
  `);
  const upsertOutput = database.prepare(`
    INSERT INTO professional_outputs (
      output_id, student_id, task_id, node_id, status, content_json,
      submitted_at, current_version, state_revision, origin, updated_at
    ) VALUES (
      @outputId, @studentId, @taskId, @nodeId, @status, @contentJson,
      CASE WHEN @status = 'draft' THEN NULL ELSE CURRENT_TIMESTAMP END,
      @currentVersion, @stateRevision, 'demo', CURRENT_TIMESTAMP
    )
    ON CONFLICT(output_id) DO NOTHING
  `);
  const upsertOutputVersion = database.prepare(`
    INSERT INTO professional_output_versions (
      output_id, task_id, version, schema_version, fields_json, upstream_refs_json
    ) VALUES (
      @outputId, @taskId, @version, 1, @fieldsJson, @upstreamRefsJson
    )
    ON CONFLICT(output_id, version) DO NOTHING
  `);
  const upsertEvidenceLink = database.prepare(`
    INSERT INTO output_evidence_links (output_id, version, field_key, evidence_id)
    VALUES (@outputId, @version, @fieldKey, @evidenceId)
    ON CONFLICT(output_id, version, field_key, evidence_id) DO NOTHING
  `);
  const upsertReview = database.prepare(`
    INSERT INTO output_reviews (
      review_id, output_id, reviewer_id, status, score, feedback, origin
    ) VALUES (
      @reviewId, @outputId, @reviewerId, @status, @score, @feedback, 'demo'
    )
    ON CONFLICT(review_id) DO NOTHING
  `);
  const upsertAnnotation = database.prepare(`
    INSERT INTO output_review_annotations (review_id, field_key, comment)
    VALUES (@reviewId, @fieldKey, @comment)
    ON CONFLICT(review_id, field_key) DO NOTHING
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
      official_score, details_json, origin
    ) VALUES (
      @scoreId, @studentId, @taskId, @snapshotVersion, @provisionalScore,
      @officialScore, @detailsJson, 'demo'
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
    for (const attempt of seed.demo.practiceAttempts) {
      const definition = readActivityDefinition(attempt.activityId);
      if (!definition || definition.activity.nodeId !== attempt.nodeId) {
        throw new Error(`Unknown demo practice activity: ${attempt.activityId}.`);
      }
      const artifact = {
        type: 'learning-activity-artifact',
        activityId: attempt.activityId,
        nodeId: attempt.nodeId,
        kind: definition.activity.kind,
        response: attempt.response,
        transferTarget: definition.activity.transferTarget,
      };
      upsertPracticeAttempt.run({
        ...attempt,
        responseJson: JSON.stringify(attempt.response),
        resultJson: JSON.stringify({ passed: true, feedback: definition.activity.feedback.passed }),
        artifactJson: JSON.stringify(artifact),
      });
    }
    for (const instance of seed.demo.assessmentInstances) upsertAssessmentInstance.run(instance);
    for (const attempt of seed.demo.attempts) {
      upsertAttempt.run({
        durationSeconds: null,
        ...attempt,
        answersJson: JSON.stringify(attempt.answers),
        diagnosticsJson: JSON.stringify(attempt.diagnostics),
      });
    }
    for (const output of seed.demo.outputs) {
      const taskId = canonicalOutputTaskId(output.taskId);
      const current = output.versions.find(({ version }) => version === output.currentVersion);
      if (!current || output.versions.length === 0) {
        throw new Error(`Demo output has no current version: ${output.outputId}.`);
      }
      upsertOutput.run({ ...output, taskId, contentJson: JSON.stringify(current.fields) });
      for (const version of output.versions) {
        upsertOutputVersion.run({
          outputId: output.outputId,
          taskId,
          version: version.version,
          fieldsJson: JSON.stringify(version.fields),
          upstreamRefsJson: JSON.stringify(version.upstreamRefs),
        });
        for (const [fieldKey, evidenceIds] of Object.entries(version.evidenceLinks)) {
          for (const evidenceId of evidenceIds) {
            upsertEvidenceLink.run({ outputId: output.outputId, version: version.version, fieldKey, evidenceId });
          }
        }
      }
    }
    for (const review of seed.demo.reviews) {
      upsertReview.run({ score: null, feedback: null, ...review });
      for (const [fieldKey, comment] of Object.entries(review.annotations)) {
        upsertAnnotation.run({ reviewId: review.reviewId, fieldKey, comment });
      }
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
  validateStableBase(seed);
  const studentPlaceholders = DEMO_STUDENT_IDS.map(() => '?').join(', ');
  database.transaction(() => {
    database.prepare(`
      DELETE FROM formal_assessment_instances
      WHERE session_id = ? OR assessment_id IN (
        SELECT assessment_id FROM formal_assessment_tokens
        WHERE student_id IN (${studentPlaceholders})
        UNION
        SELECT assessment_id FROM formal_attempts
        WHERE student_id IN (${studentPlaceholders}) AND assessment_id IS NOT NULL
      )
    `).run(DEMO_CLASS_ID, ...DEMO_STUDENT_IDS, ...DEMO_STUDENT_IDS);
    database.prepare(`DELETE FROM professional_outputs WHERE student_id IN (${studentPlaceholders})`)
      .run(...DEMO_STUDENT_IDS);
    database.prepare(`DELETE FROM practice_attempts WHERE student_id IN (${studentPlaceholders})`)
      .run(...DEMO_STUDENT_IDS);
    database.prepare(`DELETE FROM self_study_cursors WHERE student_id IN (${studentPlaceholders})`)
      .run(...DEMO_STUDENT_IDS);
    database.prepare(`DELETE FROM formal_attempts WHERE student_id IN (${studentPlaceholders})`)
      .run(...DEMO_STUDENT_IDS);
    database.prepare(`DELETE FROM learning_events WHERE student_id IN (${studentPlaceholders})`)
      .run(...DEMO_STUDENT_IDS);
    database.prepare(`DELETE FROM frozen_task_scores WHERE student_id IN (${studentPlaceholders})`)
      .run(...DEMO_STUDENT_IDS);
    database.prepare('DELETE FROM classroom_commands WHERE session_id = ?').run(DEMO_CLASS_ID);
    database.prepare('DELETE FROM device_presence WHERE session_id = ?').run(DEMO_CLASS_ID);
    database.prepare('DELETE FROM classroom_participation WHERE session_id = ?').run(DEMO_CLASS_ID);
    const classroom = seed.base.classrooms.find(({ sessionId }) => sessionId === DEMO_CLASS_ID)!;
    database.prepare(`
      UPDATE classroom_sessions
      SET name = @name, teacher_id = @teacherId, status = @status,
        active_node_id = @activeNodeId, active_unit_id = @activeUnitId,
        state_json = '{}', revision = revision + 1, updated_at = CURRENT_TIMESTAMP,
        closed_at = NULL
      WHERE session_id = @sessionId
    `).run(classroom);
    seedDemo(database, seed);
    validateSeededPersonas(database);
    new SnapshotClock(database).advance([
      ...DEMO_STUDENT_IDS.map((studentId) => `learning:${studentId}` as const),
      `classroom:${DEMO_CLASS_ID}`,
    ]);
  })();
}

function validateSeededPersonas(database: AppDatabase): void {
  const count = (sql: string, ...parameters: unknown[]) => (
    database.prepare(sql).pluck().get(...parameters) as number
  );
  if (
    count("SELECT COUNT(*) FROM learning_events WHERE student_id = 'stu-01'") !== 0
    || count("SELECT COUNT(*) FROM practice_attempts WHERE student_id = 'stu-01'") !== 0
    || count("SELECT COUNT(*) FROM formal_attempts WHERE student_id = 'stu-01'") !== 0
    || count("SELECT COUNT(*) FROM professional_outputs WHERE student_id = 'stu-01'") !== 0
    || count("SELECT COUNT(*) FROM professional_outputs WHERE student_id = 'stu-02' AND status = 'returned'") !== 1
    || count("SELECT COUNT(*) FROM professional_outputs WHERE student_id = 'stu-03' AND status = 'verified'") !== 3
  ) {
    throw new Error('Demo persona validation failed; reset was rolled back.');
  }
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

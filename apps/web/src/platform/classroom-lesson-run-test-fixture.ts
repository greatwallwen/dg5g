import {
  ClassroomLessonRunRepository,
  type StoredClassroomLessonRun,
} from './classroom-lesson-run-repository.ts';
import type { AppDatabase } from './db/database.ts';
import type { ClassroomLessonId } from './teaching-cursor.ts';

export function provisionClassroomAssessmentParticipants(
  database: AppDatabase,
  input: {
    runId: string;
    studentIds: readonly string[];
    openedAt: string;
    expiresAt: string;
  },
): void {
  for (const studentId of input.studentIds) {
    const assessmentId = `${input.runId}-provisioned-${studentId}`;
    database.prepare(`
      INSERT INTO formal_assessment_instances (
        assessment_id, session_id, classroom_run_id, node_id, game_id,
        question_version, status, opened_at, expires_at, created_at
      ) VALUES (?, 'demo-class', ?, 'P1T1-N02', 'P1T1-N02-server-assessment',
        'p01-n02-v1', 'running', ?, ?, ?)
    `).run(assessmentId, input.runId, input.openedAt, input.expiresAt, input.openedAt);
    database.prepare(`
      INSERT INTO formal_assessment_tokens (
        token_hash, assessment_id, student_id, node_id, question_version,
        issued_at, expires_at
      ) VALUES (?, ?, ?, 'P1T1-N02', 'p01-n02-v1', ?, ?)
    `).run(
      `fixture-provision-${input.runId}-${studentId}`,
      assessmentId,
      studentId,
      input.openedAt,
      input.expiresAt,
    );
  }
}

export function startActiveLessonRun(
  database: AppDatabase,
  sessionId: string,
  options: {
    lessonId?: ClassroomLessonId;
    now?: Date;
  } = {},
): StoredClassroomLessonRun {
  const repository = new ClassroomLessonRunRepository(database);
  const revision = Number(database.prepare(`
    SELECT revision FROM classroom_sessions WHERE session_id = ?
  `).pluck().get(sessionId));
  const now = options.now ?? new Date('2026-07-13T01:59:58.000Z');
  const prepared = repository.startLessonRun({
    sessionId,
    lessonId: options.lessonId ?? 'P01-L2',
    expectedRevision: revision,
  }, now).run;
  return repository.transitionLessonRun({
    sessionId,
    lessonRunId: prepared.lessonRunId,
    expectedRevision: prepared.revision,
    nextStatus: 'active',
  }, new Date(now.getTime() + 1_000)).run;
}

import {
  ClassroomLessonRunRepository,
  type StoredClassroomLessonRun,
} from './classroom-lesson-run-repository.ts';
import type { AppDatabase } from './db/database.ts';
import type { ClassroomLessonId } from './teaching-cursor.ts';

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

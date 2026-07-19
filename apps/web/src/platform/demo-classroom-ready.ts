import {
  ClassroomLessonRunConflictError,
  ClassroomLessonRunNotFoundError,
  ClassroomLessonRunRepository,
  type StoredClassroomLessonRun,
} from './classroom-lesson-run-repository.ts';
import type { AppDatabase } from './db/database.ts';
import { DEMO_CLASS_ID } from './db/demo-seed.ts';

interface DemoClassroomAuthorityRow {
  revision: number;
  active_lesson_run_id: string | null;
}

/**
 * Gives the product runtime one truthful "continue teaching" position without
 * changing the generic demo facts used by repository tests. Existing live
 * lesson state is preserved; only a classroom with no open run is provisioned.
 */
export function ensureDemoClassroomReady(
  database: AppDatabase,
  now = new Date(),
): StoredClassroomLessonRun {
  const repository = new ClassroomLessonRunRepository(database);
  const authority = database.prepare(`
    SELECT revision, active_lesson_run_id
    FROM classroom_sessions
    WHERE session_id = ?
  `).get(DEMO_CLASS_ID) as DemoClassroomAuthorityRow | undefined;
  if (!authority) throw new ClassroomLessonRunNotFoundError(DEMO_CLASS_ID);

  const existing = repository.readOpenLessonRun(DEMO_CLASS_ID);
  if (existing) {
    if (authority.active_lesson_run_id !== existing.lessonRunId) {
      throw new ClassroomLessonRunConflictError(
        'Demo classroom open lesson run is not the active classroom authority.',
      );
    }
    return existing;
  }
  if (authority.active_lesson_run_id) {
    throw new ClassroomLessonRunConflictError(
      'Demo classroom points to a lesson run that is not open.',
    );
  }

  const prepared = repository.startLessonRun({
    sessionId: DEMO_CLASS_ID,
    lessonId: 'P01-L2',
    expectedRevision: authority.revision,
  }, now).run;
  const active = repository.transitionLessonRun({
    sessionId: DEMO_CLASS_ID,
    lessonRunId: prepared.lessonRunId,
    expectedRevision: prepared.revision,
    nextStatus: 'active',
  }, new Date(now.getTime() + 1)).run;
  return repository.transitionLessonRun({
    sessionId: DEMO_CLASS_ID,
    lessonRunId: active.lessonRunId,
    expectedRevision: active.revision,
    nextStatus: 'paused',
  }, new Date(now.getTime() + 2)).run;
}

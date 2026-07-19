import {
  ClassroomLessonRunConflictError,
  ClassroomLessonRunNotFoundError,
  ClassroomLessonRunRepository,
} from './classroom-lesson-run-repository.ts';
import type { AppDatabase } from './db/database.ts';
import { DEMO_CLASS_ID } from './db/demo-seed.ts';
import { SnapshotClock } from './snapshot-clock.ts';

interface DemoClassroomAuthorityRow {
  status: string;
  active_lesson_run_id: string | null;
  active_node_id: string | null;
  active_unit_id: string | null;
  state_json: string;
}

/**
 * Normalizes a freshly seeded demo classroom to the first-lesson workbench.
 * An existing open lesson remains authoritative and is never replaced here.
 */
export function ensureDemoClassroomReady(database: AppDatabase): void {
  const authority = database.prepare(`
    SELECT status, active_lesson_run_id, active_node_id, active_unit_id, state_json
    FROM classroom_sessions
    WHERE session_id = ?
  `).get(DEMO_CLASS_ID) as DemoClassroomAuthorityRow | undefined;
  if (!authority) throw new ClassroomLessonRunNotFoundError(DEMO_CLASS_ID);

  const openRun = new ClassroomLessonRunRepository(database).readOpenLessonRun(DEMO_CLASS_ID);
  if (openRun) {
    if (authority.active_lesson_run_id !== openRun.lessonRunId) {
      throw new ClassroomLessonRunConflictError(
        'Demo classroom open lesson run is not the active classroom authority.',
      );
    }
    return;
  }
  if (authority.active_lesson_run_id) {
    throw new ClassroomLessonRunConflictError(
      'Demo classroom points to a lesson run that is not open.',
    );
  }

  const alreadyReady = authority.status === 'preparing'
    && authority.active_node_id === null
    && authority.active_unit_id === null
    && authority.state_json === '{}';
  if (alreadyReady) return;

  database.transaction(() => {
    const result = database.prepare(`
      UPDATE classroom_sessions
      SET status = 'preparing', active_node_id = NULL, active_unit_id = NULL,
        active_lesson_run_id = NULL, state_json = '{}',
        revision = revision + 1, updated_at = CURRENT_TIMESTAMP, closed_at = NULL
      WHERE session_id = ?
    `).run(DEMO_CLASS_ID);
    if (result.changes === 1) {
      new SnapshotClock(database).advance([`classroom:${DEMO_CLASS_ID}`]);
    }
  })();
}

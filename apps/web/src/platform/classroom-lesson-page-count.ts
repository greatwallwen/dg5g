import { teacherSlidesForSession } from './fixtures/session-fixtures.ts';
import { classroomLessonPageCountFromCatalog } from './classroom-lesson-page-catalog.ts';

export function classroomLessonPageCount(nodeId: string): number {
  return classroomLessonPageCountFromCatalog(nodeId, teacherSlidesForSession(nodeId).length);
}

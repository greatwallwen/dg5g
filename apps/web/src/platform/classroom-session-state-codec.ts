import { initialLessonState } from './classroom-state.ts';
import type { ClassroomSessionStateV1 } from './classroom-session-repository.ts';

export function encodeClassroomSessionState(
  state: ClassroomSessionStateV1,
  activeNodeId: string,
  activeUnitId: string,
  revision: number,
): string | undefined {
  if (state.schemaVersion !== 1
    || state.lesson.activeNodeId !== activeNodeId
    || state.lesson.activeUnitId !== activeUnitId
    || state.lesson.revision !== revision
    || state.lesson.playback.revision !== revision) return undefined;
  const {
    activeNodeId: _activeNodeId,
    activeUnitId: _activeUnitId,
    revision: _revision,
    ...lesson
  } = state.lesson;
  return JSON.stringify({ ...state, lesson });
}

export function initialClassroomSessionState(row: {
  session_id: string;
  active_node_id: string | null;
  active_unit_id: string | null;
  revision: number;
}): ClassroomSessionStateV1 {
  const activeNodeId = row.active_node_id ?? `${row.session_id}-unassigned`;
  const activeUnitId = row.active_unit_id ?? activeNodeId;
  const lesson = initialLessonState(activeNodeId, activeUnitId);
  lesson.revision = row.revision;
  lesson.playback.revision = row.revision;
  return {
    schemaVersion: 1,
    lesson,
    teacherSlideId: `${activeNodeId}-S01`,
    teacherSlideIndex: 1,
    sceneMode: 'learning',
    activityState: 'not_pushed',
    reviewState: 'not_started',
  };
}

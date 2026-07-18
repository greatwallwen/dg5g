import type { ClassroomSessionStateV1 } from './classroom-session-repository.ts';
import type { TeachingCursor } from './teaching-cursor.ts';

export function withTeachingCursorCompatibility(
  state: ClassroomSessionStateV1,
  cursor: TeachingCursor | undefined,
): ClassroomSessionStateV1 {
  if (!cursor) return state;
  return {
    ...state,
    lesson: {
      phase: cursor.phase === 'assessment' ? 'challenge' : cursor.phase,
      activeNodeId: cursor.nodeId,
      activeUnitId: cursor.unitId,
      revision: cursor.revision,
      playback: {
        sceneId: `${cursor.nodeId}-lesson`,
        actionId: cursor.actionId,
        actionIndex: cursor.actionIndex,
        status: cursor.playbackStatus,
        positionMs: cursor.positionMs,
        rate: cursor.rate,
        revision: cursor.revision,
        audioOwner: cursor.audioOwner,
      },
    },
    currentSlideId: cursor.actionId,
    teacherSlideId: cursor.actionId,
    teacherSlideIndex: cursor.pageIndex + 1,
    sceneMode: cursor.phase === 'assessment'
      ? 'challenge'
      : cursor.phase === 'review' ? 'review' : 'learning',
    playbackCursor: {
      sceneId: `${cursor.nodeId}-lesson`,
      actionId: cursor.actionId,
      actionIndex: cursor.actionIndex,
      updatedAt: cursor.updatedAt,
    },
  };
}

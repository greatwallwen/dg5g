import type {
  ActivityState,
  ClassroomCommand,
  ClassroomLessonState,
  CommandAckState,
  LessonPhase,
  PageId,
  ReviewState,
  StudentSyncState,
  TextbookSceneMode,
} from './models.ts';
import type {
  ClassroomSessionStateV1,
  TeacherClassroomMutation,
} from './classroom-session-repository.ts';

export function assertExpectedRevision(value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('Expected classroom revision must be a non-negative integer.');
  }
}

export function normalizeTtl(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value!)) : 15_000;
}

export function canAdvanceAck(current: CommandAckState, next: CommandAckState): boolean {
  if (current === 'expired' || current === 'applied') return false;
  if (current === 'failed') return next === 'applied';
  if (next === 'failed') return true;
  const rank: Record<CommandAckState, number> = {
    queued: 0,
    delivered: 1,
    applied: 2,
    failed: 3,
    expired: 3,
  };
  return rank[next] > rank[current];
}

export function assertHeartbeatRevision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Heartbeat revision must be a safe non-negative integer.');
  }
}

export function assertCommandMatchesState(
  input: TeacherClassroomMutation,
  command: ClassroomCommand,
): void {
  const lesson = input.next.state.lesson;
  if ((input.command.studentId !== undefined && input.command.studentId.trim().length === 0)
    || command.phase !== lesson.phase
    || command.nodeId !== input.next.activeNodeId
    || command.nodeId !== lesson.activeNodeId
    || command.unitId !== input.next.activeUnitId
    || command.unitId !== lesson.activeUnitId
    || command.route !== `/classroom/${input.sessionId}`) {
    throw new Error('Classroom command must match the authoritative classroom state.');
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isLessonPhase(value: unknown): value is LessonPhase {
  return value === 'prepare' || value === 'lecture' || value === 'question'
    || value === 'practice' || value === 'challenge' || value === 'review' || value === 'close';
}

export function isPlaybackStatus(value: unknown): value is ClassroomLessonState['playback']['status'] {
  return value === 'idle' || value === 'playing' || value === 'paused' || value === 'ended';
}

export function isAudioOwner(value: unknown): value is ClassroomLessonState['playback']['audioOwner'] {
  return value === 'teacher' || value === 'projector';
}

export function isSceneMode(value: unknown): value is TextbookSceneMode {
  return value === 'course-map' || value === 'task-map' || value === 'learning'
    || value === 'challenge' || value === 'review';
}

export function isActivityState(value: unknown): value is ActivityState {
  return value === 'not_pushed' || value === 'pushed' || value === 'submitted' || value === 'reviewing';
}

export function isReviewState(value: unknown): value is ReviewState {
  return value === 'not_started' || value === 'reviewing' || value === 'completed';
}

export function isStudentSyncState(value: unknown): value is StudentSyncState {
  return value === 'idle' || value === 'requested' || value === 'forced';
}

export function isPageId(value: unknown): value is PageId {
  return typeof value === 'string';
}

export function isPlaybackCursor(
  value: unknown,
): value is NonNullable<ClassroomSessionStateV1['playbackCursor']> {
  return isRecord(value)
    && typeof value.sceneId === 'string'
    && typeof value.actionId === 'string'
    && Number.isInteger(value.actionIndex);
}

export function isFormalTest(
  value: unknown,
): value is NonNullable<ClassroomSessionStateV1['formalTest']> {
  return isRecord(value)
    && typeof value.assessmentId === 'string'
    && typeof value.gameId === 'string'
    && typeof value.nodeId === 'string'
    && (value.status === 'idle' || value.status === 'running'
      || value.status === 'paused' || value.status === 'review')
    && typeof value.durationSeconds === 'number';
}

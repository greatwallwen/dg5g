import type {
  ClassroomAudioOwner,
  ClassroomLessonState,
  ClassroomPlaybackState,
  LessonPhase,
} from './models.ts';

export type ClassroomLessonIntent =
  | { type: 'phase_changed'; phase: LessonPhase }
  | { type: 'playback_started'; actionId: string; actionIndex: number; rate: number }
  | { type: 'playback_paused' }
  | { type: 'playback_seeked'; positionMs: number }
  | { type: 'playback_ended' }
  | { type: 'audio_owner_changed'; audioOwner: ClassroomAudioOwner };

export type ClassroomLessonEvent =
  | { type: 'phase_changed'; phase: LessonPhase; revision: number; at: string; positionMs: number }
  | {
      type: 'playback_started';
      actionId: string;
      actionIndex: number;
      revision: number;
      startedAt: string;
      positionMs: number;
      rate: number;
    }
  | { type: 'playback_paused'; revision: number; at: string; positionMs: number }
  | { type: 'playback_seeked'; revision: number; at: string; positionMs: number }
  | { type: 'playback_ended'; revision: number; at: string; positionMs: number }
  | { type: 'audio_owner_changed'; audioOwner: ClassroomAudioOwner; revision: number; at: string; positionMs: number };

const legalPhaseTransitions: Record<LessonPhase, ReadonlySet<LessonPhase>> = {
  prepare: new Set(['lecture']),
  lecture: new Set(['question', 'practice', 'review', 'close']),
  question: new Set(['lecture', 'practice', 'review']),
  practice: new Set(['lecture', 'challenge', 'review']),
  challenge: new Set(['review']),
  review: new Set(['lecture', 'close']),
  close: new Set(),
};

export function initialLessonState(activeNodeId: string, activeUnitId = activeNodeId): ClassroomLessonState {
  return {
    phase: 'prepare',
    activeNodeId,
    activeUnitId,
    revision: 0,
    playback: {
      sceneId: `${activeNodeId}-lesson`,
      actionId: `${activeNodeId}-lesson-case`,
      actionIndex: 0,
      status: 'idle',
      positionMs: 0,
      rate: 1,
      revision: 0,
      audioOwner: 'teacher',
    },
  };
}

export function canStudentInteract(phase: LessonPhase): boolean {
  return phase === 'question' || phase === 'practice' || phase === 'challenge';
}

export function parseClassroomLessonIntent(value: unknown): ClassroomLessonIntent | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === 'phase_changed' && isLessonPhase(candidate.phase)) {
    return { type: 'phase_changed', phase: candidate.phase };
  }
  if (candidate.type === 'playback_started'
    && typeof candidate.actionId === 'string'
    && Number.isInteger(candidate.actionIndex)
    && typeof candidate.rate === 'number') {
    return {
      type: 'playback_started',
      actionId: candidate.actionId,
      actionIndex: candidate.actionIndex as number,
      rate: candidate.rate,
    };
  }
  if (candidate.type === 'playback_paused' || candidate.type === 'playback_ended') {
    return { type: candidate.type };
  }
  if (candidate.type === 'playback_seeked' && typeof candidate.positionMs === 'number') {
    return { type: 'playback_seeked', positionMs: candidate.positionMs };
  }
  if (candidate.type === 'audio_owner_changed' && (candidate.audioOwner === 'teacher' || candidate.audioOwner === 'projector')) {
    return { type: 'audio_owner_changed', audioOwner: candidate.audioOwner };
  }
  return null;
}

export function playbackPositionAt(playback: ClassroomPlaybackState, now: Date): number {
  if (playback.status !== 'playing' || !playback.startedAt) return clampPosition(playback.positionMs);
  const startedAt = Date.parse(playback.startedAt);
  if (!Number.isFinite(startedAt)) return clampPosition(playback.positionMs);
  const elapsed = Math.max(0, now.getTime() - startedAt);
  return clampPosition(playback.positionMs + elapsed * playback.rate);
}

export function applyClassroomLessonIntent(
  current: ClassroomLessonState,
  intent: ClassroomLessonIntent,
  now: Date,
): ClassroomLessonState {
  return reduceClassroomLessonState(current, materializeClassroomLessonEvent(current, intent, now));
}

export function materializeClassroomLessonEvent(
  current: ClassroomLessonState,
  intent: ClassroomLessonIntent,
  now: Date,
): ClassroomLessonEvent {
  const revision = current.revision + 1;
  const at = now.toISOString();
  const positionMs = playbackPositionAt(current.playback, now);

  if (intent.type === 'phase_changed') return { ...intent, revision, at, positionMs };
  if (intent.type === 'playback_started') {
    const sameAction = current.playback.actionId === intent.actionId;
    return {
      ...intent,
      revision,
      startedAt: at,
      positionMs: sameAction ? current.playback.positionMs : 0,
      rate: clampRate(intent.rate),
    };
  }
  if (intent.type === 'playback_seeked') {
    return { ...intent, revision, at, positionMs: clampPosition(intent.positionMs) };
  }
  return { ...intent, revision, at, positionMs };
}

export function reduceClassroomLessonState(
  current: ClassroomLessonState,
  event: ClassroomLessonEvent,
): ClassroomLessonState {
  if (!Number.isInteger(event.revision) || event.revision <= current.revision) return current;

  if (event.type === 'phase_changed') {
    if (!legalPhaseTransitions[current.phase].has(event.phase)) return current;
    const shouldPause = current.playback.status === 'playing' && event.phase !== 'lecture';
    return {
      ...current,
      phase: event.phase,
      revision: event.revision,
      playback: shouldPause
        ? { ...current.playback, status: 'paused', startedAt: undefined, positionMs: clampPosition(event.positionMs), revision: event.revision }
        : { ...current.playback, revision: event.revision },
    };
  }

  if (event.type === 'playback_started') {
    if (current.phase !== 'lecture') return current;
    return updatePlayback(current, event.revision, {
      actionId: event.actionId,
      actionIndex: Math.max(0, Math.trunc(event.actionIndex)),
      status: 'playing',
      startedAt: event.startedAt,
      positionMs: clampPosition(event.positionMs),
      rate: clampRate(event.rate),
    });
  }

  if (event.type === 'playback_paused') {
    return updatePlayback(current, event.revision, {
      status: 'paused',
      startedAt: undefined,
      positionMs: clampPosition(event.positionMs),
    });
  }

  if (event.type === 'playback_seeked') {
    return updatePlayback(current, event.revision, {
      startedAt: current.playback.status === 'playing' ? event.at : undefined,
      positionMs: clampPosition(event.positionMs),
    });
  }

  if (event.type === 'playback_ended') {
    return updatePlayback(current, event.revision, {
      status: 'ended',
      startedAt: undefined,
      positionMs: clampPosition(event.positionMs),
    });
  }

  return updatePlayback(current, event.revision, {
    audioOwner: event.audioOwner,
    status: 'paused',
    startedAt: undefined,
    positionMs: clampPosition(event.positionMs),
  });
}

function updatePlayback(
  current: ClassroomLessonState,
  revision: number,
  patch: Partial<ClassroomPlaybackState>,
): ClassroomLessonState {
  return {
    ...current,
    revision,
    playback: { ...current.playback, ...patch, revision },
  };
}

function clampPosition(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function clampRate(value: number): number {
  return Number.isFinite(value) ? Math.min(2, Math.max(0.5, value)) : 1;
}

function isLessonPhase(value: unknown): value is LessonPhase {
  return value === 'prepare'
    || value === 'lecture'
    || value === 'question'
    || value === 'practice'
    || value === 'challenge'
    || value === 'review'
    || value === 'close';
}

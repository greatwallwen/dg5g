import {
  ClassroomSessionRepository,
  type AckDraft,
  type DeviceHeartbeat,
} from './classroom-session-repository.ts';
import { getDatabase } from './db/database.ts';
import type {
  ClassroomCommand,
  ClassroomDeviceSnapshot,
  CommandAck,
  DevicePresence,
  LessonPhase,
} from './models.ts';

type CommandDraft = {
  studentId?: string;
  phase: LessonPhase;
  route: string;
  nodeId: string;
  unitId: string;
  revision: number;
  ttlMs?: number;
};

export function recordDeviceHeartbeat(
  sessionId: string,
  heartbeat: DeviceHeartbeat,
  now = new Date(),
): DevicePresence {
  return repository().recordHeartbeat(sessionId, heartbeat, now);
}

export function recordCommandAck(
  sessionId: string,
  draft: AckDraft,
  now = new Date(),
): CommandAck {
  return repository().recordAck(sessionId, draft, now);
}

export function classroomDeviceSnapshot(
  sessionId: string,
  now = new Date(),
): ClassroomDeviceSnapshot {
  return repository().readDeviceSnapshot(sessionId, now);
}

/**
 * Compatibility entry point for older callers. New teacher writes should use
 * ClassroomSessionService so the state mutation and command share one CAS.
 */
export function publishClassroomCommand(
  sessionId: string,
  draft: CommandDraft,
  now = new Date(),
): ClassroomCommand {
  const store = repository();
  const current = store.readSession(sessionId);
  if (!current) throw new Error(`Classroom session not found: ${sessionId}`);
  if (draft.revision !== current.revision + 1) {
    throw new Error('Classroom command revision must equal the next session revision.');
  }
  const lesson = {
    ...current.state.lesson,
    phase: draft.phase,
    activeNodeId: draft.nodeId,
    activeUnitId: draft.unitId,
    revision: draft.revision,
    playback: { ...current.state.lesson.playback, revision: draft.revision },
  };
  return store.commitTeacherMutation({
    sessionId,
    expectedRevision: current.revision,
    next: {
      status: current.status === 'closed' ? 'closed' : 'active',
      activeNodeId: draft.nodeId,
      activeUnitId: draft.unitId,
      state: { ...current.state, lesson },
    },
    command: {
      ...(draft.studentId ? { studentId: draft.studentId } : {}),
      phase: draft.phase,
      route: draft.route,
      nodeId: draft.nodeId,
      unitId: draft.unitId,
      ...(draft.ttlMs === undefined ? {} : { ttlMs: draft.ttlMs }),
    },
  }, now).command;
}

function repository(): ClassroomSessionRepository {
  return new ClassroomSessionRepository(getDatabase());
}

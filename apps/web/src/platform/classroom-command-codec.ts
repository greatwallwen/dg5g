import type { ClassroomCommand, LessonPhase } from './models.ts';

export function parseClassroomCommandRow(row: {
  command_id: string;
  session_id: string;
  target_student_id: string | null;
  payload_json: string;
  revision: number;
  created_at: string;
  expires_at: string | null;
}): ClassroomCommand | undefined {
  let payload: unknown;
  try { payload = JSON.parse(row.payload_json); } catch { return undefined; }
  if (!isRecord(payload)
    || !isLessonPhase(payload.phase)
    || typeof payload.route !== 'string'
    || typeof payload.nodeId !== 'string'
    || typeof payload.unitId !== 'string'
    || !row.expires_at) return undefined;
  return {
    commandId: row.command_id,
    sessionId: row.session_id,
    ...(row.target_student_id ? { studentId: row.target_student_id } : {}),
    phase: payload.phase,
    route: payload.route,
    nodeId: payload.nodeId,
    unitId: payload.unitId,
    revision: row.revision,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isLessonPhase(value: unknown): value is LessonPhase {
  return value === 'prepare' || value === 'lecture' || value === 'question'
    || value === 'practice' || value === 'challenge' || value === 'review' || value === 'close';
}

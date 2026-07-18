import type { AppDatabase } from './db/database.ts';

export function queueClassroomCommandRecipients(
  database: AppDatabase,
  input: {
    commandId: string;
    sessionId: string;
    acknowledgedAt: string;
    observedAt: Date;
    targetStudentId?: string;
    deviceId?: string;
  },
): void {
  const healthySince = new Date(input.observedAt.getTime() - 16_000).toISOString();
  database.prepare(`
    INSERT INTO command_acks (command_id, device_id, state, acknowledged_at)
    SELECT ?, device.device_id, 'queued', ?
    FROM device_presence AS device
    INNER JOIN classroom_members AS member
      ON member.session_id = device.session_id
      AND member.student_id = device.user_id
    INNER JOIN users AS user ON user.id = member.student_id
    INNER JOIN classroom_participation AS participation
      ON participation.session_id = device.session_id
      AND participation.student_id = device.user_id
    WHERE device.session_id = ?
      AND device.role = 'student'
      AND device.client_kind = 'browser'
      AND device.last_heartbeat_at >= ?
      AND user.role = 'student'
      AND user.is_active = 1
      AND participation.state = 'joined'
      AND participation.mode = 'follow'
      AND (? IS NULL OR device.user_id = ?)
      AND (? IS NULL OR device.device_id = ?)
    ON CONFLICT(command_id, device_id) DO NOTHING
  `).run(
    input.commandId,
    input.acknowledgedAt,
    input.sessionId,
    healthySince,
    input.targetStudentId ?? null,
    input.targetStudentId ?? null,
    input.deviceId ?? null,
    input.deviceId ?? null,
  );
}

export function isClassroomCommandRecipient(
  database: AppDatabase,
  input: {
    sessionId: string;
    deviceId: string;
    studentId: string;
    observedAt: Date;
  },
): boolean {
  const healthySince = new Date(input.observedAt.getTime() - 16_000).toISOString();
  return database.prepare(`
    SELECT 1
    FROM device_presence AS device
    INNER JOIN classroom_participation AS participation
      ON participation.session_id = device.session_id
      AND participation.student_id = device.user_id
    WHERE device.session_id = ?
      AND device.device_id = ?
      AND device.user_id = ?
      AND device.role = 'student'
      AND device.client_kind = 'browser'
      AND device.last_heartbeat_at >= ?
      AND participation.state = 'joined'
      AND participation.mode = 'follow'
  `).pluck().get(
    input.sessionId,
    input.deviceId,
    input.studentId,
    healthySince,
  ) === 1;
}

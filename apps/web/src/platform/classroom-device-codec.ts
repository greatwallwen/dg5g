import type { ClassroomPageState, DevicePresence } from './models.ts';

export type ClassroomDeviceRow = {
  device_id: string;
  session_id: string;
  user_id: string;
  role: 'teacher' | 'student' | 'projector';
  client_kind: DevicePresence['clientKind'];
  visibility_state: DevicePresence['visibilityState'];
  helper_state: DevicePresence['helperState'];
  page_state: ClassroomPageState;
  last_heartbeat_at: string | null;
  last_applied_revision: number;
};

export function devicePresenceFromRow(row: ClassroomDeviceRow, now: Date): DevicePresence {
  const lastHeartbeatAt = row.last_heartbeat_at ?? '';
  const heartbeatTime = Date.parse(lastHeartbeatAt);
  const age = Number.isFinite(heartbeatTime) ? now.getTime() - heartbeatTime : Number.POSITIVE_INFINITY;
  const syncHealth = age > 16_000
    ? 'offline' as const
    : row.page_state === 'error' || age > 6_000 ? 'degraded' as const : 'online' as const;
  return {
    deviceId: row.device_id,
    actorRole: row.role,
    ...(row.role === 'student' ? { studentId: row.user_id } : {}),
    clientKind: row.client_kind,
    visibilityState: row.visibility_state,
    syncHealth,
    helperState: syncHealth,
    pageState: row.page_state,
    lastHeartbeatAt,
    lastAppliedRevision: row.last_applied_revision,
  };
}

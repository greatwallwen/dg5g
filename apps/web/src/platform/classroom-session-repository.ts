import { randomUUID } from 'node:crypto';
import type { AppDatabase } from './db/database.ts';
import { initialLessonState } from './classroom-state.ts';
import { SnapshotClock } from './snapshot-clock.ts';
import type {
  ActivityState,
  ClassroomDeviceSnapshot,
  ClassroomCommand,
  ClassroomLessonState,
  ClassroomPageState,
  CommandAck,
  CommandAckState,
  DevicePresence,
  FormalTestSession,
  LessonPhase,
  PageId,
  ReviewState,
  StudentSyncState,
  TextbookSceneMode,
} from './models.ts';
import {
  assertCommandMatchesState,
  assertExpectedRevision,
  assertHeartbeatRevision,
  canAdvanceAck,
  isActivityState,
  isAudioOwner,
  isFormalTest,
  isLessonPhase,
  isPageId,
  isPlaybackCursor,
  isPlaybackStatus,
  isRecord,
  isReviewState,
  isSceneMode,
  isStudentSyncState,
  normalizeTtl,
} from './classroom-session-invariants.ts';

export type ClassroomSessionStatus = 'preparing' | 'active' | 'paused' | 'closed';

export interface ClassroomSessionStateV1 {
  schemaVersion: 1;
  lesson: ClassroomLessonState;
  currentPageId?: PageId;
  currentSlideId?: string;
  teacherSlideId: string;
  teacherSlideIndex: number;
  sceneMode: TextbookSceneMode;
  studentSyncState?: StudentSyncState;
  syncRequestId?: string;
  playbackCursor?: {
    sceneId: string;
    actionId: string;
    actionIndex: number;
    actionType?: 'speech' | 'spotlight' | 'laser' | 'caption';
    targetId?: string;
    caption?: string;
    updatedAt?: string;
  } | null;
  activityState: ActivityState;
  reviewState: ReviewState;
  formalTest?: Pick<FormalTestSession, 'assessmentId' | 'gameId' | 'nodeId' | 'status' | 'durationSeconds' | 'startedAt'>;
}

export interface StoredClassroomSession {
  sessionId: string;
  classId: string;
  teacherId: string;
  name: string;
  status: ClassroomSessionStatus;
  activeNodeId?: string;
  activeUnitId?: string;
  revision: number;
  state: ClassroomSessionStateV1;
  updatedAt: string;
}

export interface TeacherClassroomMutation {
  sessionId: string;
  expectedRevision: number;
  next: {
    status: ClassroomSessionStatus;
    activeNodeId: string;
    activeUnitId: string;
    state: ClassroomSessionStateV1;
  };
  command: {
    studentId?: string;
    phase: LessonPhase;
    route: string;
    nodeId: string;
    unitId: string;
    ttlMs?: number;
  };
}

export interface DeviceHeartbeat {
  deviceId: string;
  actorRole: DevicePresence['actorRole'];
  studentId?: string;
  pageState: ClassroomPageState;
  lastAppliedRevision: number;
}

export interface AckDraft {
  commandId: string;
  deviceId: string;
  studentId: string;
  state: Extract<CommandAckState, 'delivered' | 'applied' | 'failed'>;
  reason?: string;
}

export class ClassroomSessionNotFoundError extends Error {
  override readonly name = 'ClassroomSessionNotFoundError';

  constructor(sessionId: string) {
    super(`Classroom session not found: ${sessionId}`);
  }
}

export class ClassroomRevisionConflictError extends Error {
  override readonly name = 'ClassroomRevisionConflictError';

  constructor(
    readonly sessionId: string,
    readonly expectedRevision: number,
    readonly currentRevision: number,
  ) {
    super(`Classroom revision conflict: expected ${expectedRevision}, current ${currentRevision}.`);
  }
}

export class ClassroomStateCorruptError extends Error {
  override readonly name = 'ClassroomStateCorruptError';
}

type SessionRow = {
  session_id: string;
  class_id: string;
  teacher_id: string;
  name: string;
  status: ClassroomSessionStatus;
  active_node_id: string | null;
  active_unit_id: string | null;
  revision: number;
  state_json: string;
  updated_at: string;
};

type DeviceRow = {
  device_id: string;
  session_id: string;
  user_id: string;
  role: 'teacher' | 'student' | 'projector';
  helper_state: DevicePresence['helperState'];
  page_state: ClassroomPageState;
  last_heartbeat_at: string | null;
  last_applied_revision: number;
};

type CommandRow = {
  command_id: string;
  session_id: string;
  revision: number;
  target_student_id: string | null;
  payload_json: string;
  created_at: string;
  expires_at: string | null;
};

type AckRow = {
  command_id: string;
  device_id: string;
  user_id: string;
  state: CommandAckState;
  reason: string | null;
  acknowledged_at: string;
};

export class ClassroomSessionRepository {
  private readonly clock: SnapshotClock;

  constructor(private readonly database: AppDatabase) {
    this.clock = new SnapshotClock(database);
  }

  readSession(sessionId: string): StoredClassroomSession | undefined {
    const row = this.database.prepare(`
      SELECT
        session_id, class_id, teacher_id, name, status, active_node_id,
        active_unit_id, revision, state_json, updated_at
      FROM classroom_sessions
      WHERE session_id = ?
    `).get(sessionId) as SessionRow | undefined;
    if (!row) return undefined;
    return sessionFromRow(row);
  }

  commitTeacherMutation(
    input: TeacherClassroomMutation,
    now = new Date(),
  ): { session: StoredClassroomSession; command: ClassroomCommand } {
    assertExpectedRevision(input.expectedRevision);
    const nextRevision = input.expectedRevision + 1;
    const at = now.toISOString();
    const ttlMs = normalizeTtl(input.command.ttlMs);
    const command: ClassroomCommand = {
      commandId: `${input.sessionId}-r${nextRevision}-${randomUUID().slice(0, 8)}`,
      sessionId: input.sessionId,
      ...(input.command.studentId ? { studentId: input.command.studentId } : {}),
      phase: input.command.phase,
      route: input.command.route,
      nodeId: input.command.nodeId,
      unitId: input.command.unitId,
      revision: nextRevision,
      createdAt: at,
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    assertCommandMatchesState(input, command);
    const nextState = { ...input.next.state, syncRequestId: command.commandId };
    const stateJson = encodeState(
      nextState,
      input.next.activeNodeId,
      input.next.activeUnitId,
      nextRevision,
    );

    const transaction = this.database.transaction(() => {
      if (command.studentId && !this.isActiveStudentMember(input.sessionId, command.studentId)) {
        throw new Error('Targeted classroom command requires an active member of this session.');
      }
      const mutation = this.database.prepare(`
        UPDATE classroom_sessions
        SET status = ?, active_node_id = ?, active_unit_id = ?, revision = revision + 1,
            state_json = ?, updated_at = ?
        WHERE session_id = ? AND revision = ?
      `).run(
        input.next.status,
        input.next.activeNodeId,
        input.next.activeUnitId,
        stateJson,
        at,
        input.sessionId,
        input.expectedRevision,
      );
      if (mutation.changes === 0) this.throwMutationMiss(input.sessionId, input.expectedRevision);

      this.database.prepare(`
        INSERT INTO classroom_commands (
          command_id, session_id, revision, kind, target_student_id,
          payload_json, created_at, expires_at
        ) VALUES (?, ?, ?, 'classroom_state', ?, ?, ?, ?)
      `).run(
        command.commandId,
        command.sessionId,
        command.revision,
        command.studentId ?? null,
        JSON.stringify({
          phase: command.phase,
          route: command.route,
          nodeId: command.nodeId,
          unitId: command.unitId,
        }),
        command.createdAt,
        command.expiresAt,
      );
      this.database.prepare(`
        INSERT INTO command_acks (command_id, device_id, state, acknowledged_at)
        SELECT ?, device.device_id, 'queued', ?
        FROM device_presence AS device
        INNER JOIN classroom_members AS member
          ON member.session_id = device.session_id
          AND member.student_id = device.user_id
        INNER JOIN users AS user ON user.id = member.student_id
        WHERE device.session_id = ?
          AND device.role = 'student'
          AND user.role = 'student'
          AND user.is_active = 1
          AND (? IS NULL OR device.user_id = ?)
      `).run(
        command.commandId,
        at,
        command.sessionId,
        command.studentId ?? null,
        command.studentId ?? null,
      );
      this.advanceSnapshotTopics(input.sessionId, at);
      const session = this.readSession(input.sessionId);
      if (!session) throw new ClassroomSessionNotFoundError(input.sessionId);
      return { session, command };
    });
    return transaction.immediate();
  }

  recordHeartbeat(
    sessionId: string,
    input: DeviceHeartbeat,
    now = new Date(),
  ): DevicePresence {
    const at = now.toISOString();
    assertHeartbeatRevision(input.lastAppliedRevision);
    const lastAppliedRevision = input.lastAppliedRevision;
    const transaction = this.database.transaction(() => {
      const session = this.database.prepare(`
        SELECT teacher_id, revision FROM classroom_sessions WHERE session_id = ?
      `).get(sessionId) as { teacher_id: string; revision: number } | undefined;
      if (!session) throw new ClassroomSessionNotFoundError(sessionId);
      if (lastAppliedRevision > session.revision) {
        throw new Error('Heartbeat revision cannot exceed the current classroom revision.');
      }
      const userId = this.resolveHeartbeatUser(sessionId, session.teacher_id, input);
      const current = this.database.prepare(`
        SELECT session_id, user_id, role FROM device_presence WHERE device_id = ?
      `).get(input.deviceId) as Pick<DeviceRow, 'session_id' | 'user_id' | 'role'> | undefined;
      if (current && (current.session_id !== sessionId || current.user_id !== userId || current.role !== input.actorRole)) {
        throw new Error('Classroom helper device is already bound to another identity.');
      }
      const helperState: DevicePresence['helperState'] = input.pageState === 'error' ? 'degraded' : 'online';
      this.database.prepare(`
        INSERT INTO device_presence (
          device_id, session_id, user_id, role, helper_state, page_state,
          last_heartbeat_at, last_applied_revision
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(device_id) DO UPDATE SET
          helper_state = excluded.helper_state,
          page_state = excluded.page_state,
          last_heartbeat_at = excluded.last_heartbeat_at,
          last_applied_revision = MAX(device_presence.last_applied_revision, excluded.last_applied_revision)
      `).run(
        input.deviceId,
        sessionId,
        userId,
        input.actorRole,
        helperState,
        input.pageState,
        at,
        lastAppliedRevision,
      );
      if (input.actorRole === 'student') this.queueLatestCommandForDevice(sessionId, input.deviceId, userId, at, now);
      this.advanceSnapshotTopics(sessionId, at);
      return {
        deviceId: input.deviceId,
        actorRole: input.actorRole,
        ...(input.actorRole === 'student' ? { studentId: userId } : {}),
        helperState,
        pageState: input.pageState,
        lastHeartbeatAt: at,
        lastAppliedRevision: Math.max(current
          ? this.readDeviceLastAppliedRevision(input.deviceId)
          : 0, lastAppliedRevision),
      } satisfies DevicePresence;
    });
    return transaction.immediate();
  }

  readDeviceSnapshot(sessionId: string, now = new Date()): ClassroomDeviceSnapshot {
    if (!this.readSession(sessionId)) throw new ClassroomSessionNotFoundError(sessionId);
    const latest = this.database.prepare(`
      SELECT
        command_id, session_id, revision, target_student_id, payload_json,
        created_at, expires_at
      FROM classroom_commands
      WHERE session_id = ?
      ORDER BY revision DESC
      LIMIT 1
    `).get(sessionId) as CommandRow | undefined;
    const latestCommand = latest ? commandFromRow(latest) : undefined;
    const command = latestCommand && now.getTime() <= Date.parse(latestCommand.expiresAt)
      ? latestCommand
      : undefined;
    const deviceRows = this.database.prepare(`
      SELECT
        device_id, session_id, user_id, role, helper_state, page_state,
        last_heartbeat_at, last_applied_revision
      FROM device_presence
      WHERE session_id = ? AND role IN ('teacher', 'student')
      ORDER BY device_id
    `).all(sessionId) as DeviceRow[];
    const devices = deviceRows.map((row) => deviceFromRow(row, now));
    const acks = !latest
      ? []
      : (this.database.prepare(`
          SELECT ack.command_id, ack.device_id, device.user_id, ack.state,
            ack.reason, ack.acknowledged_at
          FROM command_acks AS ack
          INNER JOIN device_presence AS device ON device.device_id = ack.device_id
          WHERE ack.command_id = ?
          ORDER BY ack.device_id
        `).all(latest.command_id) as AckRow[]).map((row) => {
          const ack = ackFromRow(row);
          if (!latestCommand
            || now.getTime() <= Date.parse(latestCommand.expiresAt)
            || ack.state === 'applied'
            || ack.state === 'failed') return ack;
          return { ...ack, state: 'expired' as const, at: latestCommand.expiresAt };
        });
    return { command, devices, acks };
  }

  recordAck(sessionId: string, input: AckDraft, now = new Date()): CommandAck {
    const at = now.toISOString();
    const transaction = this.database.transaction(() => {
      const commandRow = this.database.prepare(`
        SELECT
          command_id, session_id, revision, target_student_id, payload_json,
          created_at, expires_at
        FROM classroom_commands
        WHERE command_id = ? AND session_id = ?
      `).get(input.commandId, sessionId) as CommandRow | undefined;
      if (!commandRow) {
        if (!this.readSession(sessionId)) throw new ClassroomSessionNotFoundError(sessionId);
        throw new Error('Classroom command was not found.');
      }
      const command = commandFromRow(commandRow);
      if (now.getTime() > Date.parse(command.expiresAt)) throw new Error('Classroom command has expired.');
      const device = this.database.prepare(`
        SELECT
          device_id, session_id, user_id, role, helper_state, page_state,
          last_heartbeat_at, last_applied_revision
        FROM device_presence
        WHERE device_id = ? AND session_id = ?
      `).get(input.deviceId, sessionId) as DeviceRow | undefined;
      if (!device) throw new Error('Classroom helper device was not found.');
      if (device.role !== 'student' || device.user_id !== input.studentId) {
        throw new Error('Classroom helper device identity does not match the acknowledgement.');
      }
      if (!this.isActiveStudentMember(sessionId, input.studentId)) {
        throw new Error('Classroom acknowledgement requires an active member of this class session.');
      }
      if (command.studentId && command.studentId !== input.studentId) {
        throw new Error('Classroom command targets another student.');
      }
      const currentRow = this.database.prepare(`
        SELECT ack.command_id, ack.device_id, device.user_id, ack.state,
          ack.reason, ack.acknowledged_at
        FROM command_acks AS ack
        INNER JOIN device_presence AS device ON device.device_id = ack.device_id
        WHERE ack.command_id = ? AND ack.device_id = ?
      `).get(input.commandId, input.deviceId) as AckRow | undefined;
      if (currentRow && !canAdvanceAck(currentRow.state, input.state)) return ackFromRow(currentRow);

      this.database.prepare(`
        INSERT INTO command_acks (
          command_id, device_id, state, reason, acknowledged_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(command_id, device_id) DO UPDATE SET
          state = excluded.state,
          reason = excluded.reason,
          acknowledged_at = excluded.acknowledged_at
      `).run(
        input.commandId,
        input.deviceId,
        input.state,
        input.reason ?? null,
        at,
      );
      if (input.state === 'applied') {
        this.database.prepare(`
          UPDATE device_presence
          SET last_applied_revision = MAX(last_applied_revision, ?)
          WHERE device_id = ? AND session_id = ?
        `).run(command.revision, input.deviceId, sessionId);
      }
      this.advanceSnapshotTopics(sessionId, at);
      return {
        commandId: input.commandId,
        deviceId: input.deviceId,
        studentId: input.studentId,
        state: input.state,
        at,
        ...(input.reason ? { reason: input.reason } : {}),
      } satisfies CommandAck;
    });
    return transaction.immediate();
  }

  private throwMutationMiss(sessionId: string, expectedRevision: number): never {
    const currentRevision = this.database.prepare(`
      SELECT revision FROM classroom_sessions WHERE session_id = ?
    `).pluck().get(sessionId) as number | undefined;
    if (currentRevision === undefined) throw new ClassroomSessionNotFoundError(sessionId);
    throw new ClassroomRevisionConflictError(sessionId, expectedRevision, currentRevision);
  }

  private resolveHeartbeatUser(
    sessionId: string,
    teacherId: string,
    input: DeviceHeartbeat,
  ): string {
    if (input.actorRole === 'teacher') {
      if (input.studentId) throw new Error('Teacher heartbeat cannot claim a student identity.');
      return teacherId;
    }
    if (!input.studentId) throw new Error('Student heartbeat requires a student identity.');
    const isMember = this.database.prepare(`
      SELECT 1
      FROM classroom_members AS member
      INNER JOIN users AS user ON user.id = member.student_id
      WHERE member.session_id = ?
        AND member.student_id = ?
        AND user.role = 'student'
        AND user.is_active = 1
    `).pluck().get(sessionId, input.studentId) === 1;
    if (!isMember) throw new Error('Student heartbeat requires an active member of this class session.');
    return input.studentId;
  }

  private isActiveStudentMember(sessionId: string, studentId: string): boolean {
    return this.database.prepare(`
      SELECT 1
      FROM classroom_members AS member
      INNER JOIN users AS user ON user.id = member.student_id
      WHERE member.session_id = ?
        AND member.student_id = ?
        AND user.role = 'student'
        AND user.is_active = 1
    `).pluck().get(sessionId, studentId) === 1;
  }

  private queueLatestCommandForDevice(
    sessionId: string,
    deviceId: string,
    studentId: string,
    at: string,
    now: Date,
  ): void {
    const latest = this.database.prepare(`
      SELECT command_id, target_student_id, expires_at
      FROM classroom_commands
      WHERE session_id = ?
      ORDER BY revision DESC
      LIMIT 1
    `).get(sessionId) as Pick<CommandRow, 'command_id' | 'target_student_id' | 'expires_at'> | undefined;
    if (!latest
      || !latest.expires_at
      || now.getTime() > Date.parse(latest.expires_at)
      || (latest.target_student_id && latest.target_student_id !== studentId)) return;
    this.database.prepare(`
      INSERT INTO command_acks (command_id, device_id, state, acknowledged_at)
      VALUES (?, ?, 'queued', ?)
      ON CONFLICT(command_id, device_id) DO NOTHING
    `).run(latest.command_id, deviceId, at);
  }

  private readDeviceLastAppliedRevision(deviceId: string): number {
    return this.database.prepare(`
      SELECT last_applied_revision FROM device_presence WHERE device_id = ?
    `).pluck().get(deviceId) as number;
  }

  private advanceSnapshotTopics(sessionId: string, at: string): void {
    this.clock.advance([`classroom:${sessionId}`], at);
  }
}

function sessionFromRow(row: SessionRow): StoredClassroomSession {
  return {
    sessionId: row.session_id,
    classId: row.class_id,
    teacherId: row.teacher_id,
    name: row.name,
    status: row.status,
    ...(row.active_node_id ? { activeNodeId: row.active_node_id } : {}),
    ...(row.active_unit_id ? { activeUnitId: row.active_unit_id } : {}),
    revision: row.revision,
    state: decodeState(row),
    updatedAt: row.updated_at,
  };
}

function decodeState(row: SessionRow): ClassroomSessionStateV1 {
  let value: unknown;
  try {
    value = JSON.parse(row.state_json);
  } catch {
    throw new ClassroomStateCorruptError(`Invalid classroom state JSON: ${row.session_id}`);
  }
  if (!isRecord(value)) {
    throw new ClassroomStateCorruptError(`Classroom state must be an object: ${row.session_id}`);
  }
  if (Object.keys(value).length === 0) return initialState(row);
  if (value.schemaVersion !== 1) {
    throw new ClassroomStateCorruptError(`Unsupported classroom state schema: ${row.session_id}`);
  }
  return decodeVersionOneState(row, value);
}

function decodeVersionOneState(
  row: SessionRow,
  value: Record<string, unknown>,
): ClassroomSessionStateV1 {
  const storedLesson = requireRecord(value.lesson, row.session_id, 'lesson');
  const playback = requireRecord(storedLesson.playback, row.session_id, 'lesson.playback');
  if (!isLessonPhase(storedLesson.phase)
    || typeof playback.sceneId !== 'string'
    || typeof playback.actionId !== 'string'
    || !Number.isInteger(playback.actionIndex)
    || !isPlaybackStatus(playback.status)
    || typeof playback.positionMs !== 'number'
    || typeof playback.rate !== 'number'
    || playback.revision !== row.revision
    || !isAudioOwner(playback.audioOwner)
    || typeof value.teacherSlideId !== 'string'
    || !Number.isInteger(value.teacherSlideIndex)
    || !isSceneMode(value.sceneMode)
    || !isActivityState(value.activityState)
    || !isReviewState(value.reviewState)) {
    throw new ClassroomStateCorruptError(`Invalid classroom state schema: ${row.session_id}`);
  }
  if (storedLesson.activeNodeId !== undefined && storedLesson.activeNodeId !== row.active_node_id) {
    throw new ClassroomStateCorruptError(`Classroom active node conflicts with columns: ${row.session_id}`);
  }
  if (storedLesson.activeUnitId !== undefined && storedLesson.activeUnitId !== row.active_unit_id) {
    throw new ClassroomStateCorruptError(`Classroom active unit conflicts with columns: ${row.session_id}`);
  }
  const activeNodeId = row.active_node_id ?? `${row.session_id}-unassigned`;
  const activeUnitId = row.active_unit_id ?? activeNodeId;
  const lesson: ClassroomLessonState = {
    phase: storedLesson.phase,
    activeNodeId,
    activeUnitId,
    revision: row.revision,
    playback: {
      sceneId: playback.sceneId,
      actionId: playback.actionId,
      actionIndex: playback.actionIndex as number,
      status: playback.status,
      ...(typeof playback.startedAt === 'string' ? { startedAt: playback.startedAt } : {}),
      positionMs: playback.positionMs,
      rate: playback.rate,
      revision: row.revision,
      audioOwner: playback.audioOwner,
    },
  };
  return {
    schemaVersion: 1,
    lesson,
    ...(isPageId(value.currentPageId) ? { currentPageId: value.currentPageId } : {}),
    ...(typeof value.currentSlideId === 'string' ? { currentSlideId: value.currentSlideId } : {}),
    teacherSlideId: value.teacherSlideId,
    teacherSlideIndex: value.teacherSlideIndex as number,
    sceneMode: value.sceneMode,
    ...(isStudentSyncState(value.studentSyncState) ? { studentSyncState: value.studentSyncState } : {}),
    ...(typeof value.syncRequestId === 'string' ? { syncRequestId: value.syncRequestId } : {}),
    ...(isPlaybackCursor(value.playbackCursor) ? { playbackCursor: value.playbackCursor } : {}),
    activityState: value.activityState,
    reviewState: value.reviewState,
    ...(isFormalTest(value.formalTest) ? { formalTest: value.formalTest } : {}),
  };
}

function encodeState(
  state: ClassroomSessionStateV1,
  activeNodeId: string,
  activeUnitId: string,
  revision: number,
): string {
  if (state.schemaVersion !== 1
    || state.lesson.activeNodeId !== activeNodeId
    || state.lesson.activeUnitId !== activeUnitId
    || state.lesson.revision !== revision
    || state.lesson.playback.revision !== revision) {
    throw new ClassroomStateCorruptError('Teacher mutation state does not match authoritative classroom columns.');
  }
  const {
    activeNodeId: _activeNodeId,
    activeUnitId: _activeUnitId,
    revision: _revision,
    ...lesson
  } = state.lesson;
  return JSON.stringify({ ...state, lesson });
}

function initialState(row: SessionRow): ClassroomSessionStateV1 {
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

function requireRecord(value: unknown, sessionId: string, field: string): Record<string, unknown> {
  if (isRecord(value)) return value;
  throw new ClassroomStateCorruptError(`Invalid ${field} in classroom state: ${sessionId}`);
}

function commandFromRow(row: CommandRow): ClassroomCommand {
  let payload: unknown;
  try {
    payload = JSON.parse(row.payload_json);
  } catch {
    throw new ClassroomStateCorruptError(`Invalid classroom command payload: ${row.command_id}`);
  }
  if (!isRecord(payload)
    || !isLessonPhase(payload.phase)
    || typeof payload.route !== 'string'
    || typeof payload.nodeId !== 'string'
    || typeof payload.unitId !== 'string'
    || !row.expires_at) {
    throw new ClassroomStateCorruptError(`Invalid classroom command payload: ${row.command_id}`);
  }
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

function deviceFromRow(row: DeviceRow, now: Date): DevicePresence {
  const lastHeartbeatAt = row.last_heartbeat_at ?? '';
  const heartbeatTime = Date.parse(lastHeartbeatAt);
  const helperState = !Number.isFinite(heartbeatTime) || now.getTime() - heartbeatTime > 6_000
    ? 'offline' as const
    : row.page_state === 'error' ? 'degraded' as const : 'online' as const;
  return {
    deviceId: row.device_id,
    actorRole: row.role === 'student' ? 'student' : 'teacher',
    ...(row.role === 'student' ? { studentId: row.user_id } : {}),
    helperState,
    pageState: row.page_state,
    lastHeartbeatAt,
    lastAppliedRevision: row.last_applied_revision,
  };
}

function ackFromRow(row: AckRow): CommandAck {
  return {
    commandId: row.command_id,
    deviceId: row.device_id,
    studentId: row.user_id,
    state: row.state,
    at: row.acknowledged_at,
    ...(row.reason ? { reason: row.reason } : {}),
  };
}

import type { AppDatabase } from './db/database.ts';
import { getNodeLearningPolicy, type P1NodeId } from './learning-policy.ts';
import { SnapshotClock } from './snapshot-clock.ts';

export interface SelfStudyCursor {
  studentId: string;
  nodeId: P1NodeId;
  unitId?: string;
  actionId?: string;
  actionIndex: number;
  positionMs: number;
}

export type SelfStudyCursorDraft = Omit<SelfStudyCursor, 'studentId' | 'nodeId'>;

export class SelfStudyCursorStudentNotActiveError extends Error {
  override readonly name = 'SelfStudyCursorStudentNotActiveError';
}

interface CursorRow {
  studentId: string;
  nodeId: P1NodeId;
  unitId: string | null;
  actionId: string | null;
  actionIndex: number;
  positionMs: number;
  isActive: number;
  updatedAt: string;
}

interface NormalizedCursorDraft {
  unitId: string | null;
  actionId: string | null;
  actionIndex: number;
  positionMs: number;
}

export class SelfStudyCursorRepository {
  private readonly clock: SnapshotClock;

  constructor(private readonly database: AppDatabase) {
    this.clock = new SnapshotClock(database);
  }

  read(studentId: string, nodeId: P1NodeId): SelfStudyCursor | undefined {
    assertNonEmpty('studentId', studentId);
    assertNodeId(nodeId);
    const row = this.readRow(studentId, nodeId);
    return row ? cursorFromRow(row) : undefined;
  }

  readActive(studentId: string): SelfStudyCursor | undefined {
    assertNonEmpty('studentId', studentId);
    const row = this.database.prepare(`
      SELECT
        student_id AS studentId,
        node_id AS nodeId,
        unit_id AS unitId,
        action_id AS actionId,
        action_index AS actionIndex,
        position_ms AS positionMs,
        is_active AS isActive,
        updated_at AS updatedAt
      FROM self_study_cursors
      WHERE student_id = ? AND is_active = 1
      LIMIT 1
    `).get(studentId) as CursorRow | undefined;
    return row ? cursorFromRow(row) : undefined;
  }

  readAll(studentId: string): SelfStudyCursor[] {
    assertNonEmpty('studentId', studentId);
    const rows = this.database.prepare(`
      SELECT
        student_id AS studentId,
        node_id AS nodeId,
        unit_id AS unitId,
        action_id AS actionId,
        action_index AS actionIndex,
        position_ms AS positionMs,
        is_active AS isActive,
        updated_at AS updatedAt
      FROM self_study_cursors
      WHERE student_id = ?
      ORDER BY updated_at DESC, node_id
    `).all(studentId) as CursorRow[];
    return rows.map(cursorFromRow);
  }

  save(
    studentId: string,
    nodeId: P1NodeId,
    draft: SelfStudyCursorDraft,
    now = new Date(),
  ): SelfStudyCursor {
    assertNonEmpty('studentId', studentId);
    assertNodeId(nodeId);
    const normalized = normalizeDraft(draft);
    const timestamp = normalizeNow(now);
    return this.database.transaction(() => {
      this.requireActiveStudent(studentId);
      const latest = this.readLatestRow(studentId);
      if (latest && this.isAtOrBefore(timestamp, latest.updatedAt)) {
        return cursorFromRow(latest);
      }
      const existing = this.readRow(studentId, nodeId);
      if (existing && existing.isActive === 1 && sameCursor(existing, normalized)) {
        this.database.prepare(`
          UPDATE self_study_cursors SET updated_at = ?
          WHERE student_id = ? AND node_id = ?
        `).run(timestamp, studentId, nodeId);
        return cursorFromRow({ ...existing, updatedAt: timestamp });
      }
      this.database.prepare(`
        UPDATE self_study_cursors
        SET is_active = 0
        WHERE student_id = ? AND node_id <> ? AND is_active = 1
      `).run(studentId, nodeId);
      this.database.prepare(`
        INSERT INTO self_study_cursors (
          student_id, node_id, unit_id, action_id, action_index,
          position_ms, is_active, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(student_id, node_id) DO UPDATE SET
          unit_id = excluded.unit_id,
          action_id = excluded.action_id,
          action_index = excluded.action_index,
          position_ms = excluded.position_ms,
          is_active = 1,
          updated_at = excluded.updated_at
      `).run(
        studentId,
        nodeId,
        normalized.unitId,
        normalized.actionId,
        normalized.actionIndex,
        normalized.positionMs,
        timestamp,
      );
      this.clock.advance([`learning:${studentId}`], timestamp);
      const saved = this.readRow(studentId, nodeId);
      if (!saved) throw new Error(`Self-study cursor mutation did not persist: ${studentId}/${nodeId}.`);
      return cursorFromRow(saved);
    }).immediate();
  }

  private requireActiveStudent(studentId: string): void {
    const activeStudent = this.database.prepare(`
      SELECT 1 FROM users
      WHERE id = ? AND role = 'student' AND is_active = 1
    `).pluck().get(studentId);
    if (activeStudent !== 1) {
      throw new SelfStudyCursorStudentNotActiveError(`Active student not found: ${studentId}.`);
    }
  }

  private readRow(studentId: string, nodeId: P1NodeId): CursorRow | undefined {
    return this.database.prepare(`
      SELECT
        student_id AS studentId,
        node_id AS nodeId,
        unit_id AS unitId,
        action_id AS actionId,
        action_index AS actionIndex,
        position_ms AS positionMs,
        is_active AS isActive,
        updated_at AS updatedAt
      FROM self_study_cursors
      WHERE student_id = ? AND node_id = ?
    `).get(studentId, nodeId) as CursorRow | undefined;
  }

  private readLatestRow(studentId: string): CursorRow | undefined {
    return this.database.prepare(`
      SELECT
        student_id AS studentId,
        node_id AS nodeId,
        unit_id AS unitId,
        action_id AS actionId,
        action_index AS actionIndex,
        position_ms AS positionMs,
        is_active AS isActive,
        updated_at AS updatedAt
      FROM self_study_cursors
      WHERE student_id = ?
      ORDER BY julianday(updated_at) DESC, node_id
      LIMIT 1
    `).get(studentId) as CursorRow | undefined;
  }

  private isAtOrBefore(candidate: string, current: string): boolean {
    return this.database.prepare(`
      SELECT julianday(?) <= julianday(?)
    `).pluck().get(candidate, current) === 1;
  }

}

function cursorFromRow(row: CursorRow): SelfStudyCursor {
  return {
    studentId: row.studentId,
    nodeId: row.nodeId,
    ...(row.unitId === null ? {} : { unitId: row.unitId }),
    ...(row.actionId === null ? {} : { actionId: row.actionId }),
    actionIndex: row.actionIndex,
    positionMs: row.positionMs,
  };
}

function sameCursor(row: CursorRow, draft: NormalizedCursorDraft): boolean {
  return row.unitId === draft.unitId
    && row.actionId === draft.actionId
    && row.actionIndex === draft.actionIndex
    && row.positionMs === draft.positionMs;
}

function normalizeDraft(draft: SelfStudyCursorDraft): NormalizedCursorDraft {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) throw new TypeError('cursor draft must be an object.');
  return {
    unitId: normalizeOptionalId('unitId', draft.unitId),
    actionId: normalizeOptionalId('actionId', draft.actionId),
    actionIndex: normalizeNonNegativeInteger('actionIndex', draft.actionIndex),
    positionMs: normalizeNonNegativeInteger('positionMs', draft.positionMs),
  };
}

function normalizeOptionalId(field: string, value: string | undefined): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
    throw new TypeError(`${field} must be a non-empty string of at most 200 characters.`);
  }
  return value;
}

function normalizeNonNegativeInteger(field: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${field} must be a non-negative safe integer.`);
  }
  return value;
}

function assertNodeId(nodeId: string): asserts nodeId is P1NodeId {
  if (!getNodeLearningPolicy(nodeId)) throw new TypeError(`Unsupported P1 node: ${nodeId}.`);
}

function assertNonEmpty(field: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function normalizeNow(now: Date): string {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('now must be a valid Date.');
  return now.toISOString();
}

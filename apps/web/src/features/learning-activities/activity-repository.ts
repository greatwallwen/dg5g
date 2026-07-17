import type { AppDatabase } from '../../platform/db/database.ts';
import { SnapshotClock } from '../../platform/snapshot-clock.ts';
import {
  parseActivityDeliveryContext,
  type ActivityDeliveryContext,
} from './activity-delivery-context.ts';
import type {
  ActivityAttemptResult,
  ActivityProgressDto,
} from './activity-definition.ts';
import { evaluateActivity } from './activity-evaluator.ts';
import type { ServerActivityDefinition } from './activity-rules.ts';

export interface RecordEvaluatedAttemptInput {
  attemptId: string;
  studentId: string;
  activity: ServerActivityDefinition;
  response: unknown;
  delivery: ActivityDeliveryContext;
}

interface AttemptRow {
  studentId: string;
  activityId: string;
  responseJson: string;
  resultJson: string;
  deliveryChannel: 'self-study' | 'classroom';
  classroomSessionId: string | null;
  classroomRunId: string | null;
}

export class ActivityAttemptConflictError extends Error {
  constructor(readonly attemptId: string) {
    super(`Activity attempt id is already bound to different immutable facts: ${attemptId}.`);
    this.name = 'ActivityAttemptConflictError';
  }
}

export class ActivityRepository {
  private readonly clock: SnapshotClock;

  constructor(private readonly database: AppDatabase) {
    this.clock = new SnapshotClock(database);
  }

  recordEvaluatedAttempt(
    input: RecordEvaluatedAttemptInput,
    authorizeNewAttempt: () => void = () => undefined,
  ): ActivityAttemptResult {
    assertNonEmpty('attemptId', input.attemptId);
    assertNonEmpty('studentId', input.studentId);
    const delivery = parseActivityDeliveryContext(input.delivery);
    const response = normalizeResponse(input.response);
    const transaction = this.database.transaction(() => {
      const existing = this.readAttemptRow(input.attemptId);
      if (existing) {
        if (!sameAttemptFacts(existing, input, response, delivery)) {
          throw new ActivityAttemptConflictError(input.attemptId);
        }
        const replay = parseStoredResult(existing.resultJson);
        if (!replay || replay.attemptId !== input.attemptId) {
          throw new ActivityAttemptConflictError(input.attemptId);
        }
        return replay;
      }

      authorizeNewAttempt();
      const attemptedAt = new Date().toISOString();
      const attemptNumber = Number(this.database.prepare(`
        SELECT COUNT(*) + 1
        FROM practice_attempts
        WHERE student_id = ? AND activity_id = ? AND origin = 'user'
      `).pluck().get(input.studentId, input.activity.activity.id));
      const evaluated = evaluateActivity(input.activity, response);
      const versions = this.clock.advance([`learning:${input.studentId}`], attemptedAt);
      const result: ActivityAttemptResult = {
        attemptId: input.attemptId,
        canonicalActivityId: input.activity.activity.id,
        attemptNumber,
        ...evaluated,
        delivery,
        snapshotVersion: versions.globalVersion,
      };
      this.database.prepare(`
        INSERT INTO practice_attempts (
          attempt_id, student_id, activity_id, node_id, response_json, result_json,
          artifact_json, passed, origin, delivery_channel, classroom_session_id,
          classroom_run_id, attempt_number, attempted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?, ?)
      `).run(
        input.attemptId,
        input.studentId,
        input.activity.activity.id,
        input.activity.activity.nodeId,
        JSON.stringify(response),
        JSON.stringify(result),
        JSON.stringify(result.artifact),
        result.passed ? 1 : 0,
        delivery.channel,
        delivery.channel === 'classroom' ? delivery.sessionId : null,
        delivery.channel === 'classroom' ? delivery.classroomRunId : null,
        attemptNumber,
        attemptedAt,
      );
      return result;
    });
    return transaction.immediate();
  }

  readAttempt(studentId: string, attemptId: string): ActivityAttemptResult | undefined {
    const row = this.database.prepare(`
      SELECT result_json AS resultJson
      FROM practice_attempts WHERE student_id = ? AND attempt_id = ?
    `).get(studentId, attemptId) as { resultJson: string } | undefined;
    return row ? parseStoredResult(row.resultJson) : undefined;
  }

  readProgress(studentId: string, canonicalActivityId: string): ActivityProgressDto {
    assertNonEmpty('studentId', studentId);
    assertNonEmpty('canonicalActivityId', canonicalActivityId);
    const totals = this.database.prepare(`
      SELECT COUNT(*) AS attemptCount, COALESCE(MAX(passed), 0) AS passed
      FROM practice_attempts
      WHERE student_id = ? AND activity_id = ? AND origin = 'user'
    `).get(studentId, canonicalActivityId) as { attemptCount: number; passed: number };
    const last = this.database.prepare(`
      SELECT result_json AS resultJson
      FROM practice_attempts
      WHERE student_id = ? AND activity_id = ? AND origin = 'user'
      ORDER BY attempt_number DESC, attempted_at DESC, attempt_id DESC
      LIMIT 1
    `).get(studentId, canonicalActivityId) as { resultJson: string } | undefined;
    const lastAttempt = last ? parseStoredResult(last.resultJson) : undefined;
    return {
      canonicalActivityId,
      passed: totals.passed === 1,
      attemptCount: Number(totals.attemptCount),
      ...(lastAttempt ? { lastAttempt } : {}),
    };
  }

  readTopicVersion(topic: `learning:${string}`): number {
    try {
      return this.clock.read(topic).version;
    } catch {
      return 0;
    }
  }

  private readAttemptRow(attemptId: string): AttemptRow | undefined {
    return this.database.prepare(`
      SELECT student_id AS studentId, activity_id AS activityId,
        response_json AS responseJson, result_json AS resultJson,
        delivery_channel AS deliveryChannel,
        classroom_session_id AS classroomSessionId,
        classroom_run_id AS classroomRunId
      FROM practice_attempts WHERE attempt_id = ?
    `).get(attemptId) as AttemptRow | undefined;
  }
}

function sameAttemptFacts(
  existing: AttemptRow,
  input: RecordEvaluatedAttemptInput,
  response: Record<string, unknown>,
  delivery: ActivityDeliveryContext,
): boolean {
  if (existing.studentId !== input.studentId
    || existing.activityId !== input.activity.activity.id
    || canonicalJson(JSON.parse(existing.responseJson) as unknown) !== canonicalJson(response)
    || existing.deliveryChannel !== delivery.channel) return false;
  return delivery.channel === 'self-study'
    ? existing.classroomSessionId === null && existing.classroomRunId === null
    : existing.classroomSessionId === delivery.sessionId
      && existing.classroomRunId === delivery.classroomRunId;
}

function normalizeResponse(value: unknown): Record<string, unknown> {
  const response = isRecord(value) ? value : {};
  const serialized = JSON.stringify(response);
  if (serialized === undefined) return {};
  const parsed = JSON.parse(serialized) as unknown;
  return isRecord(parsed) ? parsed : {};
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function parseStoredResult(source: string): ActivityAttemptResult | undefined {
  try {
    const result = JSON.parse(source) as ActivityAttemptResult;
    return result && typeof result === 'object' && typeof result.attemptId === 'string'
      ? result
      : undefined;
  } catch {
    return undefined;
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import type { AppDatabase } from '../../platform/db/database.ts';
import type {
  ActivityAttemptResult,
  ActivityDefinition,
} from './activity-definition.ts';
import { evaluateActivity } from './activity-evaluator.ts';

export interface RecordEvaluatedAttemptInput {
  attemptId: string;
  studentId: string;
  activity: ActivityDefinition;
  response: unknown;
  expectedVersion: number;
}

interface AttemptRow {
  studentId: string;
  activityId: string;
  resultJson: string;
}

export class ActivityAttemptVersionConflictError extends Error {
  constructor(expectedVersion: number, actualVersion: number) {
    super(`Activity attempt expected version ${expectedVersion}, received ${actualVersion}.`);
    this.name = 'ActivityAttemptVersionConflictError';
  }
}

export class ActivityRepository {
  constructor(private readonly database: AppDatabase) {}

  recordEvaluatedAttempt(input: RecordEvaluatedAttemptInput): ActivityAttemptResult {
    assertNonEmpty('attemptId', input.attemptId);
    assertNonEmpty('studentId', input.studentId);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new TypeError('expectedVersion must be a non-negative safe integer.');
    }
    return this.database.transaction(() => {
      const existing = this.database.prepare(`
        SELECT student_id AS studentId, activity_id AS activityId, result_json AS resultJson
        FROM practice_attempts WHERE attempt_id = ?
      `).get(input.attemptId) as AttemptRow | undefined;
      if (existing && (existing.studentId !== input.studentId || existing.activityId !== input.activity.id)) {
        throw new TypeError('attemptId does not identify this student activity.');
      }
      const actualVersion = existing
        ? Number((JSON.parse(existing.resultJson) as { version?: number }).version ?? 1)
        : 0;
      if (actualVersion !== input.expectedVersion) {
        throw new ActivityAttemptVersionConflictError(input.expectedVersion, actualVersion);
      }
      const response = isRecord(input.response) ? input.response : {};
      const result: ActivityAttemptResult = {
        ...evaluateActivity(input.activity, response),
        version: actualVersion + 1,
      };
      const values = [
        JSON.stringify(response),
        JSON.stringify(result),
        JSON.stringify(result.artifact),
        result.passed ? 1 : 0,
      ] as const;
      if (existing) {
        this.database.prepare(`
          UPDATE practice_attempts
          SET response_json = ?, result_json = ?, artifact_json = ?, passed = ?,
              attempted_at = CURRENT_TIMESTAMP
          WHERE attempt_id = ?
        `).run(...values, input.attemptId);
      } else {
        this.database.prepare(`
          INSERT INTO practice_attempts (
            attempt_id, student_id, activity_id, node_id, response_json,
            result_json, artifact_json, passed, origin
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user')
        `).run(
          input.attemptId,
          input.studentId,
          input.activity.id,
          input.activity.nodeId,
          ...values,
        );
      }
      return result;
    })();
  }

  readAttempt(studentId: string, attemptId: string): ActivityAttemptResult | undefined {
    const row = this.database.prepare(`
      SELECT result_json AS resultJson
      FROM practice_attempts WHERE student_id = ? AND attempt_id = ?
    `).get(studentId, attemptId) as { resultJson: string } | undefined;
    return row ? JSON.parse(row.resultJson) as ActivityAttemptResult : undefined;
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

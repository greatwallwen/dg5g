import type { AppDatabase } from './db/database.ts';
import {
  getFormalAssessmentDefinitions,
  getFormalAssessmentValidationPolicy,
} from './formal-assessment-catalog.server.ts';
import {
  assessmentDimensionKeys,
  type AssessmentDimensionKey,
} from './formal-assessment-contract.ts';
import {
  validatePersistedAssessmentDiagnostic,
  type PersistedAssessmentCandidate,
  type ValidatedPersistedAssessmentDiagnostic,
} from './persisted-assessment-diagnostic.ts';

export interface ClassroomAssessmentRunWindow {
  sessionId: string;
  classroomRunId: string;
  nodeId: string;
  gameId: string;
  startedAt: Date;
  observedAt: Date;
}

export type ClassroomAssessmentSnapshotStatus =
  | 'running'
  | 'paused'
  | 'reviewing'
  | 'closed'
  | 'expired';

export interface ClassroomAssessmentRunSnapshot {
  status: ClassroomAssessmentSnapshotStatus;
  runId: string;
  lessonRunId: string;
  nodeId: string;
  gameId: string;
  revision: number;
  startedAt: string;
  expiresAt: string;
  reviewStartedAt?: string;
  remainingSecondsWhenPaused?: number;
  closeReason?: 'all-submitted' | 'time-expired' | 'teacher-collected' | 'lesson-ended';
  eligibleCount: number;
  submittedCount: number;
  playingCount: number;
  passedCount: number;
  submissionPercent: number;
  passRatePercent?: number;
  canBeginReview: boolean;
  errorDistribution?: Array<{
    dimension: AssessmentDimensionKey;
    incorrectCount: number;
    percent: number;
  }>;
}

interface ClassroomAssessmentRunRow {
  runId: string;
  lessonRunId: string;
  sessionId: string;
  nodeId: string;
  gameId: string;
  status: ClassroomAssessmentSnapshotStatus;
  startedAt: string;
  expiresAt: string;
  reviewStartedAt: string | null;
  remainingSecondsWhenPaused: number | null;
  closeReason: ClassroomAssessmentRunSnapshot['closeReason'] | null;
  revision: number;
}

export function readClassroomAssessmentRunSnapshot(
  database: AppDatabase,
  input: {
    sessionId: string;
    lessonRunId: string;
    nodeId: string;
    passScore: number;
    observedAt: Date;
  },
): ClassroomAssessmentRunSnapshot | undefined {
  const openRow = database.prepare(`
    SELECT run_id AS runId, lesson_run_id AS lessonRunId, session_id AS sessionId,
      node_id AS nodeId, game_id AS gameId, status, started_at AS startedAt,
      expires_at AS expiresAt,
      remaining_seconds_when_paused AS remainingSecondsWhenPaused,
      review_started_at AS reviewStartedAt, closed_reason AS closeReason, revision
    FROM classroom_assessment_runs
    WHERE session_id = ? AND lesson_run_id = ?
      AND status IN ('running', 'paused', 'reviewing')
    ORDER BY julianday(started_at) DESC, run_id DESC
    LIMIT 1
  `).get(input.sessionId, input.lessonRunId) as ClassroomAssessmentRunRow | undefined;
  if (openRow && openRow.nodeId !== input.nodeId) {
    throw new Error('Classroom assessment run is incoherent with the active lesson cut.');
  }
  const row = openRow ?? database.prepare(`
    SELECT run_id AS runId, lesson_run_id AS lessonRunId, session_id AS sessionId,
      node_id AS nodeId, game_id AS gameId, status, started_at AS startedAt,
      expires_at AS expiresAt,
      remaining_seconds_when_paused AS remainingSecondsWhenPaused,
      review_started_at AS reviewStartedAt, closed_reason AS closeReason, revision
    FROM classroom_assessment_runs
    WHERE session_id = ? AND lesson_run_id = ? AND node_id = ?
    ORDER BY julianday(started_at) DESC, run_id DESC
    LIMIT 1
  `).get(input.sessionId, input.lessonRunId, input.nodeId) as ClassroomAssessmentRunRow | undefined;
  if (!row) return undefined;
  assertCoherentAssessmentRun(row, input);

  const attempts = readValidatedClassroomRunAttempts(database, {
    sessionId: input.sessionId,
    classroomRunId: row.runId,
    nodeId: row.nodeId,
    gameId: row.gameId,
    startedAt: new Date(row.startedAt),
    observedAt: input.observedAt,
  });
  const instanceCounts = database.prepare(`
    SELECT COUNT(*) AS eligibleCount,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS playingCount
    FROM formal_assessment_instances
    WHERE session_id = ? AND classroom_run_id = ?
      AND node_id = ? AND game_id = ?
  `).get(input.sessionId, row.runId, row.nodeId, row.gameId) as {
    eligibleCount: number;
    playingCount: number | null;
  };
  const eligibleCount = Number(instanceCounts.eligibleCount);
  const playingCount = Number(instanceCounts.playingCount ?? 0);
  const submittedCount = attempts.length;
  const passedCount = attempts.filter(({ totalScore }) => totalScore >= input.passScore).length;
  const canBeginReview = row.reviewStartedAt === null && submittedCount > 0 && (
    submittedCount === eligibleCount
    || row.status === 'expired'
    || row.closeReason === 'teacher-collected'
  );
  return {
    status: row.status,
    runId: row.runId,
    lessonRunId: row.lessonRunId,
    nodeId: row.nodeId,
    gameId: row.gameId,
    revision: row.revision,
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    ...(row.reviewStartedAt ? { reviewStartedAt: row.reviewStartedAt } : {}),
    ...(row.remainingSecondsWhenPaused === null
      ? {} : { remainingSecondsWhenPaused: row.remainingSecondsWhenPaused }),
    ...(row.closeReason ? { closeReason: row.closeReason } : {}),
    eligibleCount,
    submittedCount,
    playingCount,
    passedCount,
    submissionPercent: percentage(submittedCount, eligibleCount),
    ...(submittedCount === 0 ? {} : {
      passRatePercent: percentage(passedCount, submittedCount),
    }),
    canBeginReview,
    ...(row.status !== 'reviewing' || submittedCount === 0 ? {} : {
      errorDistribution: assessmentDimensionKeys.map((dimension) => {
        const incorrectCount = attempts.filter(
          (attempt) => attempt.dimensions[dimension].score < 20,
        ).length;
        return { dimension, incorrectCount, percent: percentage(incorrectCount, submittedCount) };
      }),
    }),
  };
}

export function readValidatedClassroomRunAttempts(
  database: AppDatabase,
  window: ClassroomAssessmentRunWindow,
): ValidatedPersistedAssessmentDiagnostic[] {
  const policy = getFormalAssessmentValidationPolicy(window.nodeId);
  const windowStartedAt = window.startedAt.getTime();
  const windowObservedAt = window.observedAt.getTime();
  if (!policy || !Number.isFinite(windowStartedAt) || !Number.isFinite(windowObservedAt)) return [];
  const candidates = database.prepare(`
    SELECT attempt.attempt_id AS attemptId, attempt.student_id AS studentId,
      attempt.node_id AS nodeId, attempt.assessment_id AS assessmentId,
      attempt.game_id AS gameId, attempt.question_version AS questionVersion,
      attempt.score, attempt.diagnostics_json AS diagnosticsJson,
      attempt.origin, attempt.completed_at AS completedAt,
      instance.assessment_id AS instanceAssessmentId,
      instance.node_id AS instanceNodeId, instance.game_id AS instanceGameId,
      instance.question_version AS instanceQuestionVersion,
      instance.status AS instanceStatus
    FROM formal_attempts AS attempt
    INNER JOIN formal_assessment_instances AS instance
      ON instance.assessment_id = attempt.assessment_id
    INNER JOIN classroom_members AS member
      ON member.session_id = instance.session_id
      AND member.student_id = attempt.student_id
    WHERE instance.session_id = ?
      AND instance.classroom_run_id = ?
      AND instance.node_id = ?
      AND instance.game_id = ?
      AND attempt.origin = 'user'
    ORDER BY julianday(attempt.completed_at) DESC, attempt.attempt_id DESC
  `).all(
    window.sessionId,
    window.classroomRunId,
    window.nodeId,
    window.gameId,
  ) as PersistedAssessmentCandidate[];
  const latestByStudent = new Map<string, ValidatedPersistedAssessmentDiagnostic>();
  for (const candidate of candidates) {
    const completedAt = Date.parse(candidate.completedAt);
    if (!Number.isFinite(completedAt)
      || completedAt < windowStartedAt
      || completedAt > windowObservedAt
      || latestByStudent.has(candidate.studentId)) continue;
    const validated = validatePersistedAssessmentDiagnostic(candidate, policy);
    if (validated) latestByStudent.set(candidate.studentId, validated);
  }
  return [...latestByStudent.values()];
}

function assertCoherentAssessmentRun(
  row: ClassroomAssessmentRunRow,
  input: { sessionId: string; lessonRunId: string; nodeId: string; observedAt: Date },
): void {
  const gameMatches = getFormalAssessmentDefinitions(input.nodeId)
    .some(({ gameId }) => gameId === row.gameId);
  if (row.sessionId !== input.sessionId
    || row.lessonRunId !== input.lessonRunId
    || row.nodeId !== input.nodeId
    || !gameMatches
    || !Number.isSafeInteger(row.revision)
    || row.revision < 0
    || !isIsoInstant(row.startedAt)
    || !isIsoInstant(row.expiresAt)
    || row.reviewStartedAt !== null && !isIsoInstant(row.reviewStartedAt)
    || row.remainingSecondsWhenPaused !== null
      && (!Number.isSafeInteger(row.remainingSecondsWhenPaused)
        || row.remainingSecondsWhenPaused < 0)
    || !Number.isFinite(input.observedAt.getTime())) {
    throw new Error('Classroom assessment run is incoherent with the active lesson cut.');
  }
}

function isIsoInstant(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1_000) / 10;
}

import type { AppDatabase } from './db/database.ts';
import { getFormalAssessmentValidationPolicy } from './formal-assessment-catalog.server.ts';
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

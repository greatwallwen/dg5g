import type { AppDatabase } from './db/database.ts';
import {
  getFormalAssessmentDefinitionByVersion,
  getFormalAssessmentValidationPolicy,
} from './formal-assessment-catalog.server.ts';
import {
  validatePersistedAssessmentDiagnostic,
  type PersistedAssessmentCandidate,
  type ValidatedPersistedAssessmentDiagnostic,
} from './persisted-assessment-diagnostic.ts';

export function readHighestValidUserFormalAssessment(
  database: AppDatabase,
  studentId: string,
  nodeId: string,
  minimumScore = 0,
): ValidatedPersistedAssessmentDiagnostic | undefined {
  const validationPolicy = getFormalAssessmentValidationPolicy(nodeId);
  if (!validationPolicy) return undefined;
  const candidates = database.prepare(`
    SELECT attempt.attempt_id AS attemptId, attempt.assessment_id AS assessmentId,
      attempt.student_id AS studentId, attempt.node_id AS nodeId,
      attempt.game_id AS gameId, attempt.question_version AS questionVersion,
      attempt.score, attempt.diagnostics_json AS diagnosticsJson,
      attempt.origin, attempt.completed_at AS completedAt,
      assessment.assessment_id AS instanceAssessmentId,
      assessment.node_id AS instanceNodeId, assessment.game_id AS instanceGameId,
      assessment.question_version AS instanceQuestionVersion,
      assessment.status AS instanceStatus
    FROM formal_attempts AS attempt
    INNER JOIN formal_assessment_instances AS assessment
      ON assessment.assessment_id = attempt.assessment_id
    WHERE attempt.student_id = ? AND attempt.node_id = ? AND attempt.origin = 'user'
    ORDER BY attempt.score DESC, julianday(attempt.completed_at) DESC, attempt.attempt_id DESC
  `).all(studentId, nodeId) as PersistedAssessmentCandidate[];
  for (const candidate of candidates) {
    const validated = validatePersistedAssessmentDiagnostic(candidate, validationPolicy);
    if (!validated || validated.totalScore < minimumScore) continue;
    const definition = getFormalAssessmentDefinitionByVersion(nodeId, validated.questionVersion);
    if (!definition || definition.gameId !== validated.gameId) continue;
    return validated;
  }
  return undefined;
}

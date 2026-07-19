import type { AppDatabase } from './db/database.ts';
import type { SubmittedIssuedAssessmentPaper } from './formal-assessment-contract.ts';
import {
  getFormalAssessmentDefinitionByVersion,
  getFormalAssessmentValidationPolicy,
  projectAssessmentPaper,
} from './formal-assessment-catalog.server.ts';
import { FormalAssessmentAttemptRepository } from './formal-assessment-attempt-repository.ts';
import {
  validatePersistedAssessmentDiagnostic,
  type PersistedAssessmentCandidate,
} from './persisted-assessment-diagnostic.ts';
import { SnapshotClock } from './snapshot-clock.ts';

export interface SubmittedAssessmentInstance {
  assessmentId: string;
  nodeId: string;
  gameId: string;
  questionVersion: string;
  expiresAt: string | null;
}

export function projectSubmittedAssessment(
  database: AppDatabase,
  instance: SubmittedAssessmentInstance,
  studentId: string,
  serverNow: string,
): SubmittedIssuedAssessmentPaper | undefined {
  if (!instance.expiresAt) return undefined;
  const policy = getFormalAssessmentValidationPolicy(instance.nodeId);
  const candidate = database.prepare(`
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
    WHERE attempt.assessment_id = ? AND attempt.student_id = ? AND attempt.origin = 'user'
    ORDER BY julianday(attempt.completed_at) DESC, attempt.attempt_id DESC
    LIMIT 1
  `).get(instance.assessmentId, studentId) as PersistedAssessmentCandidate | undefined;
  const validated = candidate && policy
    ? validatePersistedAssessmentDiagnostic(candidate, policy)
    : undefined;
  if (!validated || validated.origin !== 'user') return undefined;
  const definition = getFormalAssessmentDefinitionByVersion(
    validated.nodeId,
    validated.questionVersion,
  );
  if (!definition
    || definition.gameId !== instance.gameId
    || definition.gameId !== validated.gameId) return undefined;
  const versions = new SnapshotClock(database);
  return {
    paper: projectAssessmentPaper(definition),
    assessmentId: instance.assessmentId,
    serverNow,
    expiresAt: instance.expiresAt,
    state: 'submitted',
    draft: new FormalAssessmentAttemptRepository(database).readDraft(instance.assessmentId, studentId),
    result: {
      assessmentId: validated.assessmentId,
      attemptId: validated.attemptId,
      nodeId: validated.nodeId,
      questionVersion: validated.questionVersion,
      totalScore: validated.totalScore,
      passed: validated.passed,
      dimensions: validated.dimensions,
      remediationTargets: validated.remediationTargets,
      origin: 'user',
      completedAt: validated.completedAt,
      version: versions.read(`learning:${studentId}`).version,
      globalVersion: versions.read('global').version,
      paper: projectAssessmentPaper(definition),
    },
  };
}

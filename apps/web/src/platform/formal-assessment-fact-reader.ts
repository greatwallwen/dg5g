import type { AppDatabase } from './db/database.ts';
import type { LearningOrigin } from './learning-origin.ts';
import type {
  StoredFormalAssessmentInstance,
  StoredFormalAttempt,
} from './learning-repository.ts';

interface FormalAttemptRow {
  attemptId: string;
  studentId: string;
  nodeId: string;
  assessmentId: string | null;
  gameId: string | null;
  score: number;
  durationSeconds: number | null;
  mistakeKnowledgePointIdsJson: string;
  completedAt: string;
  questionVersion: string | null;
  answersJson: string;
  diagnosticsJson: string;
  origin: LearningOrigin;
  instanceAssessmentId?: string | null;
  instanceNodeId?: string | null;
  instanceGameId?: string | null;
  instanceQuestionVersion?: string | null;
  instanceStatus?: string | null;
}

interface FormalAssessmentInstanceRow {
  assessmentId: string;
  nodeId: string;
  gameId: string;
  questionVersion: string;
  status: StoredFormalAssessmentInstance['status'];
  classroomRunStatus: StoredFormalAssessmentInstance['classroomRunStatus'] | null;
  expiresAt: string | null;
  closureReason: StoredFormalAssessmentInstance['closureReason'] | null;
  createdAt: string;
  origin: LearningOrigin;
}

export interface FormalAssessmentLearningFacts {
  assessmentInstances: StoredFormalAssessmentInstance[];
  attempts: StoredFormalAttempt[];
}

export function readFormalAssessmentLearningFacts(
  database: AppDatabase,
  studentId: string,
): FormalAssessmentLearningFacts {
  const assessmentInstances = database.prepare(`
    WITH student_assessments AS (
      SELECT assessment_id AS assessmentId, MAX(isUser) AS isUser
      FROM (
        SELECT assessment_id, CASE WHEN origin = 'user' THEN 1 ELSE 0 END AS isUser
        FROM formal_attempts WHERE student_id = ? AND assessment_id IS NOT NULL
        UNION ALL
        SELECT assessment_id, 1 AS isUser
        FROM formal_assessment_tokens WHERE student_id = ?
        UNION ALL
        SELECT assessment_id, 1 AS isUser
        FROM formal_assessment_drafts WHERE student_id = ?
      )
      GROUP BY assessment_id
    )
    SELECT
      instance.assessment_id AS assessmentId,
      instance.node_id AS nodeId,
      instance.game_id AS gameId,
      instance.question_version AS questionVersion,
      instance.status,
      assessment_run.status AS classroomRunStatus,
      instance.expires_at AS expiresAt,
      instance.closure_reason AS closureReason,
      instance.created_at AS createdAt,
      CASE WHEN student_assessments.isUser = 1 THEN 'user' ELSE 'demo' END AS origin
    FROM student_assessments
    INNER JOIN formal_assessment_instances AS instance
      ON instance.assessment_id = student_assessments.assessmentId
    LEFT JOIN classroom_assessment_runs AS assessment_run
      ON assessment_run.run_id = instance.classroom_run_id
    ORDER BY COALESCE(instance.opened_at, instance.created_at), instance.assessment_id
  `).all(studentId, studentId, studentId) as FormalAssessmentInstanceRow[];
  const attempts = database.prepare(`
    SELECT
      attempt.attempt_id AS attemptId,
      attempt.student_id AS studentId,
      attempt.node_id AS nodeId,
      attempt.assessment_id AS assessmentId,
      attempt.game_id AS gameId,
      attempt.score,
      attempt.duration_seconds AS durationSeconds,
      attempt.mistake_knowledge_point_ids_json AS mistakeKnowledgePointIdsJson,
      attempt.completed_at AS completedAt,
      attempt.question_version AS questionVersion,
      attempt.answers_json AS answersJson,
      attempt.diagnostics_json AS diagnosticsJson,
      attempt.origin,
      instance.assessment_id AS instanceAssessmentId,
      instance.node_id AS instanceNodeId,
      instance.game_id AS instanceGameId,
      instance.question_version AS instanceQuestionVersion,
      instance.status AS instanceStatus
    FROM formal_attempts AS attempt
    LEFT JOIN formal_assessment_instances AS instance
      ON instance.assessment_id = attempt.assessment_id
    WHERE attempt.student_id = ?
    ORDER BY attempt.completed_at, attempt.attempt_id
  `).all(studentId) as FormalAttemptRow[];

  return {
    assessmentInstances: assessmentInstances.map(toStoredAssessmentInstance),
    attempts: attempts.map(toStoredAttempt),
  };
}

function toStoredAttempt(row: FormalAttemptRow): StoredFormalAttempt {
  const mistakeKnowledgePointIds = parseJson(row.mistakeKnowledgePointIdsJson);
  return {
    attemptId: row.attemptId,
    studentId: row.studentId,
    nodeId: row.nodeId,
    ...(row.assessmentId === null ? {} : { assessmentId: row.assessmentId }),
    ...(row.gameId === null ? {} : { gameId: row.gameId }),
    score: row.score,
    ...(row.durationSeconds === null ? {} : { durationSeconds: row.durationSeconds }),
    mistakeKnowledgePointIds: Array.isArray(mistakeKnowledgePointIds)
      ? mistakeKnowledgePointIds.filter((value): value is string => typeof value === 'string')
      : [],
    completedAt: row.completedAt,
    ...(row.questionVersion === null ? {} : { questionVersion: row.questionVersion }),
    answers: parseJson(row.answersJson),
    diagnostics: parseJson(row.diagnosticsJson),
    origin: row.origin,
    ...(row.instanceAssessmentId ? { instanceAssessmentId: row.instanceAssessmentId } : {}),
    ...(row.instanceNodeId ? { instanceNodeId: row.instanceNodeId } : {}),
    ...(row.instanceGameId ? { instanceGameId: row.instanceGameId } : {}),
    ...(row.instanceQuestionVersion ? { instanceQuestionVersion: row.instanceQuestionVersion } : {}),
    ...(row.instanceStatus ? { instanceStatus: row.instanceStatus } : {}),
  };
}

function toStoredAssessmentInstance(
  row: FormalAssessmentInstanceRow,
): StoredFormalAssessmentInstance {
  return {
    assessmentId: row.assessmentId,
    nodeId: row.nodeId,
    gameId: row.gameId,
    questionVersion: row.questionVersion,
    status: row.status,
    ...(row.classroomRunStatus === null ? {} : { classroomRunStatus: row.classroomRunStatus }),
    ...(row.expiresAt === null ? {} : { expiresAt: row.expiresAt }),
    ...(row.closureReason === null ? {} : { closureReason: row.closureReason }),
    createdAt: row.createdAt,
    origin: row.origin,
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

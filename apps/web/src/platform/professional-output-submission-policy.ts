import { professionalOutputSchemaForTask, validateProfessionalOutputSubmission } from '../features/portfolio/output-schema.ts';
import { loadSelfStudyCatalog } from '../features/textbook-scene/self-study-content.ts';
import type { AppDatabase } from './db/database.ts';
import { getNodeLearningPolicy } from './learning-policy.ts';
import type { ProfessionalOutputFieldSource } from './professional-output-provenance.ts';
import type { NormalizedProfessionalOutputWrite } from './professional-output-write-normalizer.ts';
import { readHighestValidUserFormalAssessment } from './validated-user-formal-assessment.ts';

export class ProfessionalOutputSubmissionPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfessionalOutputSubmissionPolicyError';
  }
}

export function assertProfessionalOutputSubmissionPolicy(
  database: AppDatabase,
  command: NormalizedProfessionalOutputWrite,
  fieldSources: readonly ProfessionalOutputFieldSource[],
): void {
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), command.taskId);
  validateProfessionalOutputSubmission(schema, command.fields);
  for (const { key } of schema.fields) {
    const hasEvidence = (command.evidenceLinks[key]?.length ?? 0) > 0;
    const gap = command.evidenceGaps[key];
    const hasCompleteGap = Boolean(gap?.gapText.trim() && gap.nextActionText.trim());
    if (!hasEvidence && !hasCompleteGap) {
      throw new ProfessionalOutputSubmissionPolicyError(
        `Professional output field requires evidence or a complete evidence gap: ${key}.`,
      );
    }
  }
  assertUserPracticeAndSourceCoverage(database, command, fieldSources);
  assertFormalAssessmentPass(database, command);
  assertCurrentUpstream(database, command);
}

const taskPrefix = {
  P01: 'P1T1',
  P02: 'P1T2',
  P03: 'P1T3',
} as const;

const upstreamTask = {
  P02: 'P01',
  P03: 'P02',
} as const;

function assertUserPracticeAndSourceCoverage(
  database: AppDatabase,
  command: NormalizedProfessionalOutputWrite,
  fieldSources: readonly ProfessionalOutputFieldSource[],
): void {
  const prefix = taskPrefix[command.taskId];
  const requiredPolicies = [1, 2, 3, 4].map((index) => {
    const nodeId = `${prefix}-N0${index}`;
    const policy = getNodeLearningPolicy(nodeId);
    if (!policy || policy.taskId !== command.taskId) {
      throw new ProfessionalOutputSubmissionPolicyError(`Learning policy is unavailable: ${nodeId}.`);
    }
    return policy;
  });
  const attempts = database.prepare(`
    SELECT attempt_id AS attemptId, student_id AS studentId,
      activity_id AS activityId, node_id AS nodeId, passed, origin
    FROM practice_attempts
    WHERE student_id = ? AND node_id LIKE ?
  `).all(command.studentId, `${prefix}-N0%`) as Array<{
    attemptId: string;
    studentId: string;
    activityId: string;
    nodeId: string;
    passed: 0 | 1;
    origin: 'demo' | 'user';
  }>;
  const validById = new Map(attempts
    .filter(({ passed, origin }) => passed === 1 && origin === 'user')
    .map((attempt) => [attempt.attemptId, attempt]));
  for (const policy of requiredPolicies) {
    for (const activityId of policy.requiredActivityIds) {
      if (!attempts.some((attempt) => (
        attempt.studentId === command.studentId
        && attempt.activityId === activityId
        && attempt.nodeId === policy.nodeId
        && attempt.passed === 1
        && attempt.origin === 'user'
      ))) {
        throw new ProfessionalOutputSubmissionPolicyError(
          `A passed user practice attempt is required before submission: ${activityId}.`,
        );
      }
    }
  }
  const sourceNodes = new Set<string>();
  for (const source of fieldSources) {
    const attempt = validById.get(source.sourceAttemptId);
    const policy = getNodeLearningPolicy(source.sourceNodeId);
    if (!attempt
      || !policy
      || policy.taskId !== command.taskId
      || !policy.requiredActivityIds.includes(attempt.activityId)
      || attempt.studentId !== command.studentId
      || attempt.nodeId !== source.sourceNodeId) {
      throw new ProfessionalOutputSubmissionPolicyError(
        `Professional output source must be this student's passed user attempt: ${source.sourceAttemptId}.`,
      );
    }
    sourceNodes.add(source.sourceNodeId);
  }
  for (const policy of requiredPolicies.slice(0, 3)) {
    if (!sourceNodes.has(policy.nodeId)) {
      throw new ProfessionalOutputSubmissionPolicyError(
        `Professional output requires user source coverage from ${policy.nodeId}.`,
      );
    }
  }
}

function assertFormalAssessmentPass(
  database: AppDatabase,
  command: NormalizedProfessionalOutputWrite,
): void {
  const nodeId = `${taskPrefix[command.taskId]}-N02`;
  const minimumScore = getNodeLearningPolicy(nodeId)?.formalPassScore ?? 80;
  if (!readHighestValidUserFormalAssessment(database, command.studentId, nodeId, minimumScore)) {
    throw new ProfessionalOutputSubmissionPolicyError(
      `A catalog-valid user formal assessment score of at least ${minimumScore} is required: ${nodeId}.`,
    );
  }
}

function assertCurrentUpstream(
  database: AppDatabase,
  command: NormalizedProfessionalOutputWrite,
): void {
  if (command.taskId === 'P01') return;
  const reference = command.upstreamRefs[0];
  const expectedTask = upstreamTask[command.taskId];
  const row = reference ? database.prepare(`
    SELECT student_id AS studentId, task_id AS taskId, status,
      current_version AS currentVersion
    FROM professional_outputs WHERE output_id = ?
  `).get(reference.outputId) as {
    studentId: string;
    taskId: string;
    status: string;
    currentVersion: number;
  } | undefined : undefined;
  if (!reference
    || !row
    || row.studentId !== command.studentId
    || row.taskId !== expectedTask
    || row.currentVersion !== reference.version
    || (row.status !== 'submitted' && row.status !== 'verified')) {
    throw new ProfessionalOutputSubmissionPolicyError(
      `${command.taskId} requires this student's current submitted or verified ${expectedTask} output.`,
    );
  }
}

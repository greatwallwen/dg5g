import { p1Activities } from '../features/learning-activities/activity-catalog.ts';
import { professionalOutputSchemaForTask } from '../features/portfolio/output-schema.ts';
import { loadSelfStudyCatalog } from '../features/textbook-scene/self-study-content.ts';
import type { AppDatabase } from './db/database.ts';
import { assessmentDimensionKeys } from './formal-assessment-contract.ts';
import { getFormalAssessmentDefinition } from './formal-assessment-catalog.server.ts';
import { getNodeLearningPolicy, type P1TaskId } from './learning-policy.ts';

export type PolicyTaskId = Extract<P1TaskId, 'P01' | 'P02' | 'P03'>;

const taskPrefix: Record<PolicyTaskId, 'P1T1' | 'P1T2' | 'P1T3'> = {
  P01: 'P1T1',
  P02: 'P1T2',
  P03: 'P1T3',
};

const p01Responses: Record<string, Record<string, unknown>> = {
  'P1T1-N01-micro-01': {
    assignments: {
      'room-01-cabinets': 'in-scope',
      'shared-operator-cabinet': 'out-of-scope',
      'room-02-cabinets': 'out-of-scope',
    },
  },
  'P1T1-N02-foundation-01': {
    assignments: {
      'room-overview': 'location',
      'device-nameplate': 'identity',
      'two-ended-port-trace': 'link',
    },
  },
  'P1T1-N02-application-01': {
    order: ['bbu-port', 'odf-in', 'odf-out', 'aau-port'],
  },
  'P1T1-N02-transfer-01': {
    fields: {
      siteId: 'HY-01',
      roomId: '01',
      cabinetId: 'K02',
      deviceId: 'BBU-01',
      nearPort: 'BBU-1/0',
      farPort: 'AAU-1',
    },
  },
  'P1T1-N03-micro-01': {
    states: {
      power: 'confirmed',
      grounding: 'missing',
      transport: 'confirmed',
      environment: 'conflicting',
    },
  },
};

export function completePolicyFields(taskId: PolicyTaskId): Record<string, string> {
  return Object.fromEntries(
    professionalOutputSchemaForTask(loadSelfStudyCatalog(), taskId).fields
      .map(({ key }) => [key, `Completed field: ${key}`]),
  );
}

export function completePolicyGaps(taskId: PolicyTaskId): Record<string, {
  gapText: string;
  nextActionText: string;
}> {
  return Object.fromEntries(
    professionalOutputSchemaForTask(loadSelfStudyCatalog(), taskId).fields.map(({ key }) => [key, {
      gapText: `Evidence gap recorded for ${key}`,
      nextActionText: `Collect and cross-check evidence for ${key}`,
    }]),
  );
}

export function legalSubmissionEvidence(taskId: PolicyTaskId): {
  evidenceGaps: ReturnType<typeof completePolicyGaps>;
} {
  return { evidenceGaps: completePolicyGaps(taskId) };
}

export function maximumPolicyRubricScores(taskId: PolicyTaskId): Record<string, number> {
  return Object.fromEntries(
    professionalOutputSchemaForTask(loadSelfStudyCatalog(), taskId).rubric
      .map(({ criterion, maxScore }) => [criterion, maxScore]),
  );
}

export function outputMutationCounts(database: AppDatabase, studentId: string): Record<string, unknown> {
  return {
    heads: database.prepare('SELECT COUNT(*) FROM professional_outputs WHERE student_id = ?')
      .pluck().get(studentId),
    versions: database.prepare(`
      SELECT COUNT(*) FROM professional_output_versions AS version
      JOIN professional_outputs AS output ON output.output_id = version.output_id
      WHERE output.student_id = ?
    `).pluck().get(studentId),
    links: database.prepare(`
      SELECT COUNT(*) FROM output_evidence_links AS link
      JOIN professional_outputs AS output ON output.output_id = link.output_id
      WHERE output.student_id = ?
    `).pluck().get(studentId),
    sources: database.prepare(`
      SELECT COUNT(*) FROM output_field_sources AS source
      JOIN professional_outputs AS output ON output.output_id = source.output_id
      WHERE output.student_id = ?
    `).pluck().get(studentId),
    events: database.prepare(`
      SELECT COUNT(*) FROM learning_events
      WHERE student_id = ? AND event_type IN ('evidence_draft_saved', 'evidence_submitted')
    `).pluck().get(studentId),
    snapshot: database.prepare('SELECT version FROM snapshot_versions WHERE topic = ?')
      .pluck().get(`learning:${studentId}`),
  };
}

/**
 * Inserts truthful user-owned prerequisite facts without advancing snapshot clocks.
 * This keeps repository tests focused on the mutations made by the command under test.
 */
export function seedLegalProfessionalOutputSubmissionFacts(
  database: AppDatabase,
  studentId: string,
  taskIds: readonly PolicyTaskId[] = ['P01'],
): void {
  for (const taskId of taskIds) {
    seedLegalProfessionalOutputPracticeFacts(database, studentId, taskId);
    seedUserFormalAssessment(database, studentId, taskId, 80);
  }
}

export function seedLegalProfessionalOutputPracticeFacts(
  database: AppDatabase,
  studentId: string,
  taskId: PolicyTaskId,
): void {
  seedUserPracticeFacts(database, studentId, taskId);
}

export function seedUserFormalAssessment(
  database: AppDatabase,
  studentId: string,
  taskId: PolicyTaskId,
  score: number,
  identity = `policy-fixture-${studentId}-${taskId}`,
): void {
  const nodeId = `${taskPrefix[taskId]}-N02`;
  const definition = getFormalAssessmentDefinition(nodeId);
  if (!definition) throw new TypeError(`Formal assessment definition is unavailable: ${nodeId}.`);
  const attemptId = `${identity}-attempt`;
  const assessmentId = `${identity}-assessment`;
  const completedAt = '2026-07-16T08:00:00.000Z';
  database.prepare(`
    INSERT OR IGNORE INTO formal_assessment_instances (
      assessment_id, node_id, game_id, question_version, status, closed_at
    ) VALUES (?, ?, ?, ?, 'closed', ?)
  `).run(
    assessmentId,
    nodeId,
    definition.gameId,
    definition.paper.questionVersion,
    completedAt,
  );
  const dimensionScore = score / assessmentDimensionKeys.length;
  const dimensions = Object.fromEntries(assessmentDimensionKeys.map((key) => [key, {
    score: dimensionScore,
    maxScore: 25,
    feedback: `${key} verified fixture feedback`,
    ...(dimensionScore < 20
      ? { remediationTarget: definition.grading[key].remediationTarget }
      : {}),
  }]));
  const remediationTargets = dimensionScore < 20
    ? assessmentDimensionKeys.map((key) => definition.grading[key].remediationTarget)
    : [];
  database.prepare(`
    INSERT OR IGNORE INTO formal_attempts (
      attempt_id, student_id, node_id, assessment_id, game_id, score,
      completed_at, question_version, answers_json, diagnostics_json, origin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, 'user')
  `).run(
    attemptId,
    studentId,
    nodeId,
    assessmentId,
    definition.gameId,
    score,
    completedAt,
    definition.paper.questionVersion,
    JSON.stringify({
      assessmentId,
      attemptId,
      studentId,
      nodeId,
      gameId: definition.gameId,
      questionVersion: definition.paper.questionVersion,
      totalScore: score,
      passed: score >= 80,
      dimensions,
      remediationTargets,
      origin: 'user',
      completedAt,
    }),
  );
}

function seedUserPracticeFacts(
  database: AppDatabase,
  studentId: string,
  taskId: PolicyTaskId,
): void {
  const prefix = taskPrefix[taskId];
  const required = [1, 2, 3, 4].flatMap((index) => {
    const policy = getNodeLearningPolicy(`${prefix}-N0${index}`);
    if (!policy || policy.taskId !== taskId) {
      throw new TypeError(`Learning policy is unavailable: ${prefix}-N0${index}.`);
    }
    return policy.requiredActivityIds.map((activityId) => ({ activityId, nodeId: policy.nodeId }));
  });
  const insert = database.prepare(`
    INSERT OR IGNORE INTO practice_attempts (
      attempt_id, student_id, activity_id, node_id, response_json,
      result_json, artifact_json, passed, origin, attempted_at
    ) VALUES (?, ?, ?, ?, ?, '{"passed":true}', ?, 1, 'user', ?)
  `);
  for (const { activityId, nodeId } of required) {
    const response = taskId === 'P01' ? (p01Responses[activityId] ?? {}) : {};
    const definition = p1Activities.find(({ activity }) => activity.id === activityId);
    const artifact = definition ? {
      type: 'learning-activity-artifact',
      activityId,
      nodeId,
      kind: definition.activity.kind,
      response,
      transferTarget: definition.activity.transferTarget,
    } : {};
    insert.run(
      `policy-fixture-${studentId}-${activityId}`,
      studentId,
      activityId,
      nodeId,
      JSON.stringify(response),
      JSON.stringify(artifact),
      '2026-07-16T07:00:00.000Z',
    );
  }
}

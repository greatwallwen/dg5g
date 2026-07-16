import type { AppDatabase } from './db/database.ts';

export type GeneratedOutputTaskId = 'P02' | 'P03';

export interface ProfessionalOutputFieldSource {
  fieldKey: string;
  sourceNodeId: string;
  sourceAttemptId: string;
}

const sourceActivityByField: Record<GeneratedOutputTaskId, Record<string, {
  activityId: string;
  nodeId: string;
}>> = {
  P02: {
    sectorIdentity: { activityId: 'P1T2-N01-micro-01', nodeId: 'P1T2-N01' },
    azimuth: { activityId: 'P1T2-N02-foundation-01', nodeId: 'P1T2-N02' },
    tilt: { activityId: 'P1T2-N02-foundation-01', nodeId: 'P1T2-N02' },
    height: { activityId: 'P1T2-N02-application-01', nodeId: 'P1T2-N02' },
    environment: { activityId: 'P1T2-N02-transfer-01', nodeId: 'P1T2-N02' },
    judgement: { activityId: 'P1T2-N03-micro-01', nodeId: 'P1T2-N03' },
  },
  P03: {
    complaintBaseline: { activityId: 'P1T3-N01-micro-01', nodeId: 'P1T3-N01' },
    reproductionConditions: { activityId: 'P1T3-N02-foundation-01', nodeId: 'P1T3-N02' },
    businessEvidence: { activityId: 'P1T3-N02-application-01', nodeId: 'P1T3-N02' },
    networkEvidence: { activityId: 'P1T3-N02-application-01', nodeId: 'P1T3-N02' },
    comparison: { activityId: 'P1T3-N02-transfer-01', nodeId: 'P1T3-N02' },
    judgement: { activityId: 'P1T3-N03-micro-01', nodeId: 'P1T3-N03' },
  },
};

export function deriveGeneratedOutputFieldSources(
  database: AppDatabase,
  studentId: string,
  taskId: GeneratedOutputTaskId,
  fields: Record<string, unknown>,
): ProfessionalOutputFieldSource[] {
  const mapping = sourceActivityByField[taskId];
  const activityIds = [...new Set(Object.values(mapping).map(({ activityId }) => activityId))];
  const placeholders = activityIds.map(() => '?').join(', ');
  const rows = database.prepare(`
    SELECT attempt_id AS attemptId, activity_id AS activityId, node_id AS nodeId
    FROM practice_attempts
    WHERE student_id = ? AND passed = 1 AND activity_id IN (${placeholders})
    ORDER BY activity_id,
      CASE origin WHEN 'user' THEN 0 ELSE 1 END,
      julianday(attempted_at) DESC, attempt_id DESC
  `).all(studentId, ...activityIds) as Array<{
    attemptId: string;
    activityId: string;
    nodeId: string;
  }>;
  const selected = new Map<string, { attemptId: string; nodeId: string }>();
  for (const { activityId, ...attempt } of rows) {
    if (!selected.has(activityId)) selected.set(activityId, attempt);
  }
  return Object.entries(mapping).flatMap(([fieldKey, source]) => {
    if (!(fieldKey in fields)) return [];
    const attempt = selected.get(source.activityId);
    return attempt && attempt.nodeId === source.nodeId ? [{
      fieldKey,
      sourceNodeId: source.nodeId,
      sourceAttemptId: attempt.attemptId,
    }] : [];
  });
}

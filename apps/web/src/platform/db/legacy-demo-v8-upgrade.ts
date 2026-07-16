import legacyDemoV8Facts from '../../../database/legacy-demo-v8-facts.json';
import type { AppDatabase } from './database.ts';

const legacyCursorByStudent = Object.fromEntries(
  legacyDemoV8Facts.cursors.map(({ studentId, nodeId, actionId }) => [
    studentId,
    { nodeId, actionId },
  ]),
) as Record<string, { nodeId: string; actionId: string }>;

const legacyFactIds = {
  learning_events: legacyDemoV8Facts.learningEvents,
  formal_attempts: legacyDemoV8Facts.formalAttempts,
  professional_outputs: legacyDemoV8Facts.professionalOutputs,
  frozen_task_scores: legacyDemoV8Facts.frozenTaskScores,
} as const;

export function upgradeLegacyDemoV8Facts(
  database: AppDatabase,
  demoStudentIds: readonly string[],
): void {
  const studentPlaceholders = demoStudentIds.map(() => '?').join(', ');
  const legacyFacts = [
    {
      table: 'professional_outputs',
      idColumn: 'output_id',
      ids: legacyFactIds.professional_outputs,
    },
    {
      table: 'learning_events',
      idColumn: 'event_id',
      ids: legacyFactIds.learning_events,
    },
    {
      table: 'formal_attempts',
      idColumn: 'attempt_id',
      ids: legacyFactIds.formal_attempts,
    },
    {
      table: 'frozen_task_scores',
      idColumn: 'score_id',
      ids: legacyFactIds.frozen_task_scores,
    },
  ] as const;
  const affectedStudents = new Set<string>();

  for (const legacy of legacyFacts) {
    const idPlaceholders = legacy.ids.map(() => '?').join(', ');
    const rows = database.prepare(`
      SELECT ${legacy.idColumn} AS factId, student_id AS studentId
      FROM ${legacy.table}
      WHERE origin = 'demo'
        AND student_id IN (${studentPlaceholders})
        AND ${legacy.idColumn} IN (${idPlaceholders})
    `).all(...demoStudentIds, ...legacy.ids) as Array<{
      factId: string;
      studentId: string;
    }>;
    const remove = database.prepare(`
      DELETE FROM ${legacy.table}
      WHERE ${legacy.idColumn} = ? AND origin = 'demo'
    `);
    for (const row of rows) {
      if (remove.run(row.factId).changes > 0) affectedStudents.add(row.studentId);
    }
  }

  const hasAuthoritativeRuntimeFact = database.prepare(`
    SELECT EXISTS (
      SELECT 1 FROM learning_events WHERE student_id = @studentId
      UNION ALL
      SELECT 1 FROM formal_attempts WHERE student_id = @studentId
      UNION ALL
      SELECT 1 FROM practice_attempts WHERE student_id = @studentId
      UNION ALL
      SELECT 1 FROM professional_outputs WHERE student_id = @studentId
      UNION ALL
      SELECT 1 FROM frozen_task_scores WHERE student_id = @studentId
    )
  `).pluck();
  const removeLegacyCursor = database.prepare(`
    DELETE FROM self_study_cursors
    WHERE student_id = @studentId AND node_id = @nodeId AND action_id = @actionId
  `);
  for (const studentId of affectedStudents) {
    const cursor = legacyCursorByStudent[studentId];
    if (!cursor || Number(hasAuthoritativeRuntimeFact.get({ studentId })) !== 0) continue;
    removeLegacyCursor.run({ studentId, ...cursor });
  }
}

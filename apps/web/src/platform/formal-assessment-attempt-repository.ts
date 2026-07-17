import type { AppDatabase } from './db/database.ts';
import type {
  AssessmentDraftAnswers,
  AssessmentDraftDto,
} from './formal-assessment-contract.ts';
import { assertAssessmentDraftSerializedSize } from './formal-assessment-limits.ts';

interface DraftRow {
  answersJson: string;
  revision: number;
  updatedAt: string;
}

export interface SaveAssessmentDraftCommand {
  assessmentId: string;
  studentId: string;
  answers: AssessmentDraftAnswers;
  expectedRevision: number;
  updatedAt: string;
}

export class AssessmentDraftRevisionConflictError extends Error {
  constructor() {
    super('The formal assessment draft has a newer revision.');
    this.name = 'AssessmentDraftRevisionConflictError';
  }
}

export class FormalAssessmentAttemptRepository {
  constructor(private readonly database: AppDatabase) {}

  readDraft(assessmentId: string, studentId: string): AssessmentDraftDto {
    const row = this.database.prepare(`
      SELECT answers_json AS answersJson, state_revision AS revision,
        updated_at AS updatedAt
      FROM formal_assessment_drafts
      WHERE assessment_id = ? AND student_id = ?
    `).get(assessmentId, studentId) as DraftRow | undefined;
    if (!row) return { answers: {}, revision: 0 };
    return {
      answers: parseDraftAnswers(row.answersJson),
      revision: row.revision,
      updatedAt: row.updatedAt,
    };
  }

  saveDraft(command: SaveAssessmentDraftCommand): AssessmentDraftDto {
    if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) {
      throw new TypeError('Draft expectedRevision must be a non-negative safe integer.');
    }
    const answersJson = JSON.stringify(command.answers);
    assertAssessmentDraftSerializedSize(answersJson);
    return this.database.transaction(() => {
      const currentRevision = this.database.prepare(`
        SELECT state_revision
        FROM formal_assessment_drafts
        WHERE assessment_id = ? AND student_id = ?
      `).pluck().get(command.assessmentId, command.studentId) as number | undefined;
      if ((currentRevision ?? 0) !== command.expectedRevision
        || (currentRevision === undefined && command.expectedRevision !== 0)) {
        throw new AssessmentDraftRevisionConflictError();
      }

      const nextRevision = command.expectedRevision + 1;
      const changed = currentRevision === undefined
        ? this.database.prepare(`
            INSERT INTO formal_assessment_drafts (
              assessment_id, student_id, answers_json, state_revision, updated_at
            ) VALUES (?, ?, ?, ?, ?)
          `).run(
            command.assessmentId,
            command.studentId,
            answersJson,
            nextRevision,
            command.updatedAt,
          )
        : this.database.prepare(`
            UPDATE formal_assessment_drafts
            SET answers_json = ?, state_revision = ?, updated_at = ?
            WHERE assessment_id = ? AND student_id = ? AND state_revision = ?
          `).run(
            answersJson,
            nextRevision,
            command.updatedAt,
            command.assessmentId,
            command.studentId,
            command.expectedRevision,
          );
      if (changed.changes !== 1) throw new AssessmentDraftRevisionConflictError();
      return this.readDraft(command.assessmentId, command.studentId);
    }).immediate();
  }
}

function parseDraftAnswers(value: string): AssessmentDraftAnswers {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as AssessmentDraftAnswers
      : {};
  } catch {
    return {};
  }
}

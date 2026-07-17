import {
  professionalOutputSchemaForTask,
  validateProfessionalOutputSubmission,
} from '../features/portfolio/output-schema.ts';
import { loadSelfStudyCatalog } from '../features/textbook-scene/self-study-content.ts';
import type { AppDatabase } from './db/database.ts';
import type { P1OutputTaskId } from './professional-output-repository.ts';
import type {
  NormalizedProfessionalOutputReview,
  ProfessionalOutputRubricScores,
} from './professional-output-review-store.ts';
import type { ValidatedPersistedAssessmentDiagnostic } from './persisted-assessment-diagnostic.ts';
import { readHighestValidUserFormalAssessment } from './validated-user-formal-assessment.ts';

export interface TeacherCertificationHead {
  outputId: string;
  studentId: string;
  taskId: P1OutputTaskId;
  currentVersion: number;
}

export interface TeacherCertificationDecision {
  annotations: Record<string, string>;
  rubricScores?: ProfessionalOutputRubricScores;
  outputRubricScore?: number;
  formalAssessment?: ValidatedPersistedAssessmentDiagnostic;
}

export class TeacherCertificationPolicyError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'TeacherCertificationPolicyError';
  }
}

export function assertTeacherCertificationPolicy(
  database: AppDatabase,
  head: TeacherCertificationHead,
  command: NormalizedProfessionalOutputReview,
): TeacherCertificationDecision {
  if (command.expectedOutputVersion !== head.currentVersion) {
    throw new TeacherCertificationPolicyError(
      `Teacher review must target current output version ${head.currentVersion}.`,
    );
  }
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), head.taskId);
  const row = database.prepare(`
    SELECT fields_json AS fieldsJson
    FROM professional_output_versions
    WHERE output_id = ? AND task_id = ? AND version = ?
  `).get(head.outputId, head.taskId, head.currentVersion) as { fieldsJson: string } | undefined;
  if (!row) {
    throw new TeacherCertificationPolicyError('Current submitted output version is unavailable.');
  }
  validateProfessionalOutputSubmission(schema, JSON.parse(row.fieldsJson));

  const allowedFields = new Set(schema.fields.map(({ key }) => key));
  for (const fieldKey of Object.keys(command.annotations)) {
    if (!allowedFields.has(fieldKey)) {
      throw new TeacherCertificationPolicyError(`Unknown output annotation field: ${fieldKey}.`);
    }
  }
  if (command.action === 'return') {
    if (!isActionableFeedback(command.feedback)) {
      throw new TeacherCertificationPolicyError('Return feedback must describe a specific revision action.');
    }
    return { annotations: command.annotations };
  }

  const rubricScores = validateRubricScores(command.rubricScores, schema.rubric);
  const outputRubricScore = Object.values(rubricScores).reduce((sum, score) => sum + score, 0);
  const nodeId = {
    P01: 'P1T1-N02',
    P02: 'P1T2-N02',
    P03: 'P1T3-N02',
  }[head.taskId];
  const formalAssessment = readHighestValidUserFormalAssessment(
    database,
    head.studentId,
    nodeId,
    80,
  );
  if (!formalAssessment) {
    throw new TeacherCertificationPolicyError(
      `Teacher verification requires a catalog-valid user formal assessment: ${nodeId}.`,
    );
  }
  return {
    annotations: command.annotations,
    rubricScores,
    outputRubricScore,
    formalAssessment,
  };
}

function validateRubricScores(
  value: ProfessionalOutputRubricScores | undefined,
  rubric: Array<{ criterion: string; maxScore: number }>,
): ProfessionalOutputRubricScores {
  if (!value) throw new TeacherCertificationPolicyError('rubricScores are required for verification.');
  const received = Object.keys(value);
  const expected = rubric.map(({ criterion }) => criterion);
  if (received.length !== expected.length || received.some((key) => !expected.includes(key))) {
    throw new TeacherCertificationPolicyError('rubricScores must exactly match the generated rubric criteria.');
  }
  const scores = Object.fromEntries(rubric.map(({ criterion, maxScore }) => {
    const score = value[criterion];
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > maxScore) {
      throw new TeacherCertificationPolicyError(`${criterion} must be between 0 and ${maxScore}.`);
    }
    if (score < maxScore * 0.5) {
      throw new TeacherCertificationPolicyError(`${criterion} must reach at least 50% of its rubric maximum.`);
    }
    return [criterion, score];
  }));
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
  if (total < 80) {
    throw new TeacherCertificationPolicyError('Teacher verification rubric total must reach 80.');
  }
  return scores;
}

function isActionableFeedback(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim();
  return normalized.length >= 8 && !['退回修改', '请修改后提交', '不通过，请修改'].includes(normalized);
}

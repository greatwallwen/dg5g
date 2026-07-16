import type { ProfessionalOutputFieldValue } from '@/platform/professional-output-repository';
import type { P1TaskId } from '../platform/p1-content.ts';
import type { SelfStudyCatalog } from '../textbook-scene/self-study-types.ts';
import { p01OutputFieldDefinitions } from './p01-output-definition.ts';

export interface ProfessionalOutputFieldSchema {
  key: string;
  label: string;
  required: true;
  valueType: 'text';
}

export interface ProfessionalOutputSchema {
  taskId: P1TaskId;
  fields: ProfessionalOutputFieldSchema[];
  rubric: Array<{ criterion: string; maxScore: number }>;
  totalScore: 100;
}

export type ProfessionalOutputFields = Record<string, ProfessionalOutputFieldValue>;

export class ProfessionalOutputSchemaError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = 'ProfessionalOutputSchemaError';
  }
}

export function professionalOutputSchemaForTask(
  catalog: SelfStudyCatalog,
  taskId: P1TaskId,
): ProfessionalOutputSchema {
  const source = Object.values(catalog).find((document) => (
    document.taskId === taskId && document.content.kind === 'deep'
  ));
  if (!source || source.content.kind !== 'deep') {
    throw new ProfessionalOutputSchemaError(`Generated professional output schema is unavailable for ${taskId}.`);
  }
  const fieldDefinitions = taskId === 'P01'
    ? p01OutputFieldDefinitions
    : Object.entries(source.content.outputTemplate).map(([key, label]) => ({ key, label }));
  const fields = fieldDefinitions.map(({ key, label: descriptor }) => {
    if (!key.trim() || typeof descriptor !== 'string' || !descriptor.trim()) {
      throw new ProfessionalOutputSchemaError(`${taskId} outputTemplate contains an invalid field definition.`);
    }
    return {
      key,
      label: descriptor.trim(),
      required: true,
      valueType: 'text',
    } satisfies ProfessionalOutputFieldSchema;
  });
  if (fields.length === 0) {
    throw new ProfessionalOutputSchemaError(`${taskId} outputTemplate must contain fields.`);
  }
  const rubric = source.content.rubric.map(({ criterion, maxScore }) => ({ criterion, maxScore }));
  const totalScore = rubric.reduce((sum, item) => sum + item.maxScore, 0);
  if (rubric.length === 0 || totalScore !== 100) {
    throw new ProfessionalOutputSchemaError(`${taskId} rubric must total 100 points.`);
  }
  return { taskId, fields, rubric, totalScore: 100 };
}

export function validateProfessionalOutputDraft(
  schema: ProfessionalOutputSchema,
  value: unknown,
): ProfessionalOutputFields {
  if (!isRecord(value)) {
    throw new ProfessionalOutputSchemaError('Professional output fields must be an object.');
  }
  const allowed = new Map(schema.fields.map((field) => [field.key, field]));
  const validated: ProfessionalOutputFields = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    const field = allowed.get(key);
    if (!field) {
      throw new ProfessionalOutputSchemaError(`Unknown professional output field: ${key}.`);
    }
    if (field.valueType === 'text') {
      if (typeof fieldValue !== 'string') {
        throw new ProfessionalOutputSchemaError(
          `Professional output text field must be a non-empty string: ${key}.`,
        );
      }
      if (fieldValue.trim().length === 0) {
        throw new ProfessionalOutputSchemaError(
          `Required professional output field is incomplete: ${field.label} (${key}).`,
        );
      }
      validated[key] = fieldValue;
    }
  }
  return validated;
}

export function validateProfessionalOutputSubmission(
  schema: ProfessionalOutputSchema,
  value: unknown,
): ProfessionalOutputFields {
  const validated = validateProfessionalOutputDraft(schema, value);
  for (const field of schema.fields) {
    if (!hasMeaningfulValue(validated[field.key])) {
      throw new ProfessionalOutputSchemaError(
        `Required professional output field is incomplete: ${field.label} (${field.key}).`,
      );
    }
  }
  return validated;
}

export function isProfessionalOutputComplete(
  schema: ProfessionalOutputSchema,
  value: unknown,
): boolean {
  try {
    validateProfessionalOutputSubmission(schema, value);
    return true;
  } catch (error) {
    if (error instanceof ProfessionalOutputSchemaError) return false;
    throw error;
  }
}

function hasMeaningfulValue(value: ProfessionalOutputFieldValue | undefined): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return Array.isArray(value) && value.length > 0 && value.every((item) => item.trim().length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

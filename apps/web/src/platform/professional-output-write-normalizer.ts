import { professionalOutputSchemaForTask } from '../features/portfolio/output-schema.ts';
import { loadSelfStudyCatalog } from '../features/textbook-scene/self-study-content.ts';
import type {
  P1OutputTaskId,
  ProfessionalOutputEvidenceGap,
  ProfessionalOutputFieldValue,
  ProfessionalOutputUpstreamRef,
  WriteProfessionalOutputInput,
} from './professional-output-repository.ts';

export interface NormalizedProfessionalOutputWrite {
  outputId?: string;
  studentId: string;
  taskId: P1OutputTaskId;
  expectedStateRevision: number;
  fields: Record<string, ProfessionalOutputFieldValue>;
  fieldsJson: string;
  upstreamRefs: ProfessionalOutputUpstreamRef[];
  upstreamRefsJson: string;
  evidenceLinks: Record<string, string[]>;
  evidenceLinksJson: string;
  evidenceGaps: Record<string, ProfessionalOutputEvidenceGap>;
  evidenceGapsJson: string;
}

export function normalizeProfessionalOutputWrite(
  input: WriteProfessionalOutputInput,
): NormalizedProfessionalOutputWrite {
  assertNonEmpty('studentId', input.studentId);
  assertTaskId(input.taskId);
  if (input.outputId !== undefined) assertNonEmpty('outputId', input.outputId);
  if (!Number.isSafeInteger(input.expectedStateRevision) || input.expectedStateRevision < 0) {
    throw new TypeError('expectedStateRevision must be a non-negative safe integer.');
  }
  if (!isRecord(input.fields) || Object.keys(input.fields).length === 0) {
    throw new TypeError('fields must be a non-empty object.');
  }
  const allowedFieldKeys = new Set(
    professionalOutputSchemaForTask(loadSelfStudyCatalog(), input.taskId)
      .fields.map(({ key }) => key),
  );
  const fields = Object.fromEntries(Object.entries(input.fields).map(([key, value]) => {
    assertNonEmpty('field name', key);
    if (!allowedFieldKeys.has(key)) {
      throw new TypeError(`Unsupported ${input.taskId} professional output field: ${key}.`);
    }
    if (typeof value === 'string') return [key, value];
    if (typeof value === 'number' && Number.isFinite(value)) return [key, value];
    if (Array.isArray(value)
      && value.every((item) => typeof item === 'string')) return [key, [...value]];
    throw new TypeError(`Unsupported professional output field: ${key}.`);
  })) as Record<string, ProfessionalOutputFieldValue>;
  if (!Array.isArray(input.upstreamRefs)) throw new TypeError('upstreamRefs must be an array.');
  const seen = new Set<string>();
  const upstreamRefs = input.upstreamRefs.map((reference, index) => {
    if (!isRecord(reference)) throw new TypeError(`upstreamRefs[${index}] must be an object.`);
    const outputId = reference.outputId;
    const version = reference.version;
    assertNonEmpty(`upstreamRefs[${index}].outputId`, outputId as string);
    if (!Number.isSafeInteger(version) || Number(version) <= 0) {
      throw new TypeError(`upstreamRefs[${index}].version must be a positive safe integer.`);
    }
    const identity = `${String(outputId)}:${Number(version)}`;
    if (seen.has(identity)) throw new TypeError('upstreamRefs must be unique.');
    seen.add(identity);
    return { outputId: String(outputId), version: Number(version) };
  });
  const evidenceInput = input.evidenceLinks ?? {};
  if (!isRecord(evidenceInput)) throw new TypeError('evidenceLinks must be an object.');
  const evidenceLinks = Object.fromEntries(Object.entries(evidenceInput).map(([fieldKey, value]) => {
    assertNonEmpty('evidence field name', fieldKey);
    if (!Array.isArray(value)) {
      throw new TypeError(`evidenceLinks.${fieldKey} must be an array.`);
    }
    const ids = value.map((evidenceId, index) => {
      if (typeof evidenceId !== 'string' || !evidenceId.trim()) {
        throw new TypeError(`evidenceLinks.${fieldKey}[${index}] must be a non-empty string.`);
      }
      return evidenceId.trim();
    });
    return [fieldKey, [...new Set(ids)].sort()];
  })) as Record<string, string[]>;
  const evidenceGapInput = input.evidenceGaps ?? {};
  if (!isRecord(evidenceGapInput)) throw new TypeError('evidenceGaps must be an object.');
  const evidenceGaps = Object.fromEntries(Object.entries(evidenceGapInput).map(([fieldKey, value]) => {
    assertNonEmpty('evidence gap field name', fieldKey);
    if (!isRecord(value)) {
      throw new TypeError(`evidenceGaps.${fieldKey} must be an object.`);
    }
    const gapText = normalizeGapPart(value, fieldKey, 'gapText');
    const nextActionText = normalizeGapPart(value, fieldKey, 'nextActionText');
    if (!gapText && !nextActionText) {
      throw new TypeError(`Evidence gap must include gapText or nextActionText: ${fieldKey}.`);
    }
    return [fieldKey, { gapText, nextActionText }];
  })) as Record<string, ProfessionalOutputEvidenceGap>;
  return {
    ...(input.outputId === undefined ? {} : { outputId: input.outputId }),
    studentId: input.studentId,
    taskId: input.taskId,
    expectedStateRevision: input.expectedStateRevision,
    fields,
    fieldsJson: stableJson(fields),
    upstreamRefs,
    upstreamRefsJson: stableJson(upstreamRefs),
    evidenceLinks,
    evidenceLinksJson: stableJson(evidenceLinks),
    evidenceGaps,
    evidenceGapsJson: stableJson(evidenceGaps),
  };
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeGapPart(
  value: Record<string, unknown>,
  fieldKey: string,
  part: 'gapText' | 'nextActionText',
): string {
  if (!Object.hasOwn(value, part)) return '';
  const supplied = value[part];
  if (typeof supplied !== 'string') {
    throw new TypeError(`evidenceGaps.${fieldKey}.${part} must be a string.`);
  }
  return supplied.trim();
}

function assertTaskId(taskId: string): asserts taskId is P1OutputTaskId {
  if (!['P01', 'P02', 'P03'].includes(taskId)) {
    throw new TypeError(`Unsupported P1 output task: ${String(taskId)}.`);
  }
}

function assertNonEmpty(field: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

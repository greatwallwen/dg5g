import {
  assessmentDimensionKeys,
  type AssessmentAnswers,
  type AssessmentDimensionDiagnosis,
  type AssessmentDimensionKey,
  type AssessmentDraftAnswers,
  type ProfessionalConclusionAnswer,
  type RemediationTarget,
} from './formal-assessment-contract.ts';
import type { FormalAssessmentDefinition } from './formal-assessment-catalog.server.ts';
import {
  assertAssessmentDraftSerializedSize,
  FORMAL_ASSESSMENT_DRAFT_MAX_ARRAY_LENGTH,
  FORMAL_ASSESSMENT_DRAFT_MAX_STRING_LENGTH,
} from './formal-assessment-limits.ts';

export function normalizeDraftAnswers(value: AssessmentDraftAnswers): AssessmentDraftAnswers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Assessment draft answers must be an object.');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !assessmentDimensionKeys.includes(key as AssessmentDimensionKey))) {
    throw new TypeError('Assessment draft answers contain an unsupported dimension.');
  }
  const normalized: AssessmentDraftAnswers = {};
  if (Object.hasOwn(record, 'evidenceClassification')) {
    if (typeof record.evidenceClassification !== 'string') {
      throw new TypeError('Draft evidence classification must be a string.');
    }
    assertDraftString(record.evidenceClassification);
    normalized.evidenceClassification = record.evidenceClassification;
  }
  for (const key of ['linkReconstruction', 'defectiveOutputRevision'] as const) {
    if (!Object.hasOwn(record, key)) continue;
    const items = record[key];
    if (!Array.isArray(items)
      || items.length > FORMAL_ASSESSMENT_DRAFT_MAX_ARRAY_LENGTH
      || items.some((item) => typeof item !== 'string')) {
      throw new TypeError(`Draft ${key} must be a string array.`);
    }
    items.forEach(assertDraftString);
    normalized[key] = [...items];
  }
  if (Object.hasOwn(record, 'professionalConclusion')) {
    const conclusion = record.professionalConclusion;
    if (!conclusion || typeof conclusion !== 'object' || Array.isArray(conclusion)) {
      throw new TypeError('Draft professional conclusion must be an object.');
    }
    const conclusionRecord = conclusion as Record<string, unknown>;
    const allowed = ['confirmedFact', 'evidenceGap', 'risk', 'action'] as const;
    if (Object.keys(conclusionRecord).some((key) => !allowed.includes(key as typeof allowed[number]))
      || Object.values(conclusionRecord).some((item) => typeof item !== 'string')) {
      throw new TypeError('Draft professional conclusion contains an invalid field.');
    }
    Object.values(conclusionRecord).forEach((item) => assertDraftString(item as string));
    normalized.professionalConclusion = { ...conclusionRecord } as Partial<ProfessionalConclusionAnswer>;
  }
  assertAssessmentDraftSerializedSize(JSON.stringify(normalized));
  return normalized;
}

export function validateDraftOptions(
  definition: FormalAssessmentDefinition,
  answers: AssessmentDraftAnswers,
): void {
  const allowedFor = (dimension: AssessmentDimensionKey) => new Set(
    definition.paper.questions.find(({ id }) => id === dimension)?.options?.map(({ id }) => id) ?? [],
  );
  const evidence = answers.evidenceClassification;
  if (evidence) {
    if (!allowedFor('evidenceClassification').has(evidence)) {
      throw new TypeError('Draft evidence classification contains an unknown option.');
    }
  }

  const linkOptions = allowedFor('linkReconstruction');
  if ((answers.linkReconstruction?.length ?? 0) > linkOptions.size
    || answers.linkReconstruction?.some((optionId) => optionId !== '' && !linkOptions.has(optionId))) {
    throw new TypeError('Draft link reconstruction contains an unknown option or too many positions.');
  }

  const revisionOptions = allowedFor('defectiveOutputRevision');
  const revisions = answers.defectiveOutputRevision ?? [];
  if (revisions.length > revisionOptions.size
    || new Set(revisions).size !== revisions.length
    || revisions.some((optionId) => !revisionOptions.has(optionId))) {
    throw new TypeError('Draft defective output revision contains an unknown, duplicate, or excess option.');
  }
}

function assertDraftString(value: string): void {
  if (value.length > FORMAL_ASSESSMENT_DRAFT_MAX_STRING_LENGTH) {
    throw new TypeError('Assessment draft string exceeds the maximum length.');
  }
}

export function normalizeAnswers(value: AssessmentAnswers): AssessmentAnswers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Assessment answers must be an object.');
  }
  const record = value as unknown as Record<string, unknown>;
  if (Object.keys(record).length !== assessmentDimensionKeys.length
    || assessmentDimensionKeys.some((key) => !Object.hasOwn(record, key))) {
    throw new TypeError('Assessment answers must contain exactly the four assessment dimensions.');
  }
  if (typeof record.evidenceClassification !== 'string'
    || !Array.isArray(record.linkReconstruction)
    || record.linkReconstruction.some((item) => typeof item !== 'string')
    || !Array.isArray(record.defectiveOutputRevision)
    || record.defectiveOutputRevision.some((item) => typeof item !== 'string')
    || !record.professionalConclusion
    || typeof record.professionalConclusion !== 'object'
    || Array.isArray(record.professionalConclusion)) {
    throw new TypeError('Assessment answers have invalid value types.');
  }
  return {
    evidenceClassification: record.evidenceClassification,
    linkReconstruction: [...record.linkReconstruction] as string[],
    defectiveOutputRevision: [...record.defectiveOutputRevision] as string[],
    professionalConclusion: normalizeProfessionalConclusion(record.professionalConclusion),
  };
}

export function validateAnswerOptions(
  definition: FormalAssessmentDefinition,
  answers: AssessmentAnswers,
): void {
  const allowedFor = (dimension: AssessmentDimensionKey) => new Set(
    definition.paper.questions.find(({ id }) => id === dimension)?.options?.map(({ id }) => id) ?? [],
  );
  const evidenceOptions = allowedFor('evidenceClassification');
  if (!evidenceOptions.has(answers.evidenceClassification)) {
    throw new TypeError('Evidence classification contains an unknown option.');
  }

  const linkOptions = allowedFor('linkReconstruction');
  if (answers.linkReconstruction.length !== linkOptions.size
    || new Set(answers.linkReconstruction).size !== linkOptions.size
    || answers.linkReconstruction.some((optionId) => !linkOptions.has(optionId))) {
    throw new TypeError('Link reconstruction must contain each allowed option exactly once.');
  }

  const revisionOptions = allowedFor('defectiveOutputRevision');
  if (new Set(answers.defectiveOutputRevision).size !== answers.defectiveOutputRevision.length
    || answers.defectiveOutputRevision.some((optionId) => !revisionOptions.has(optionId))) {
    throw new TypeError('Defective output revision contains an unknown or duplicate option.');
  }
}

export function gradeAnswers(definition: FormalAssessmentDefinition, answers: AssessmentAnswers) {
  const dimensions = {} as Record<AssessmentDimensionKey, AssessmentDimensionDiagnosis>;
  const evidenceScore = definition.grading.evidenceClassification.acceptedOptionIds
    ?.includes(answers.evidenceClassification) ? 25 : 0;
  dimensions.evidenceClassification = diagnosis(
    evidenceScore,
    evidenceScore === 25 ? '设备身份的直接证据选择准确。' : '需要区分位置环境、端口状态与设备身份的直接证据。',
    definition.grading.evidenceClassification.remediationTarget,
  );

  const expectedOrder = definition.grading.linkReconstruction.orderedOptionIds ?? [];
  const orderMatches = expectedOrder.reduce(
    (count, optionId, index) => count + (answers.linkReconstruction[index] === optionId ? 1 : 0),
    0,
  );
  const linkScore = expectedOrder.length === 0 ? 0 : Math.round(orderMatches * 25 / expectedOrder.length);
  dimensions.linkReconstruction = diagnosis(
    linkScore,
    linkScore === 25 ? '链路对象与连接方向完整。' : '链路必须同时保留两端设备、两端端口和中间线缆方向。',
    definition.grading.linkReconstruction.remediationTarget,
  );

  const selected = new Set(answers.defectiveOutputRevision);
  const required = definition.grading.defectiveOutputRevision.requiredOptionIds ?? [];
  const forbidden = definition.grading.defectiveOutputRevision.forbiddenOptionIds ?? [];
  const revisionUnits = required.filter((optionId) => selected.has(optionId)).length
    - forbidden.filter((optionId) => selected.has(optionId)).length;
  const revisionScore = Math.max(0, Math.min(25, Math.round(revisionUnits * 25 / Math.max(1, required.length))));
  dimensions.defectiveOutputRevision = diagnosis(
    revisionScore,
    revisionScore === 25 ? '修订动作恢复了字段来源、照片索引和连接方向。' : '修订应保留证据缺口，并补齐字段来源、照片索引与方向。',
    definition.grading.defectiveOutputRevision.remediationTarget,
  );

  const criteria = definition.grading.professionalConclusion.conclusionCriteria;
  const conclusionFields = ['confirmedFact', 'evidenceGap', 'risk', 'action'] as const;
  const conclusionMatches = criteria ? conclusionFields.filter((field) => {
    const answer = answers.professionalConclusion[field].toLocaleLowerCase('zh-CN');
    const meaningfulCharacters = Array.from(answer.replace(/\s/g, '')).length;
    return meaningfulCharacters >= criteria.minimumCharacters
      && criteria[field].every((variants) => variants.some((term) => answer.includes(term)));
  }).length : 0;
  const conclusionScore = Math.round(conclusionMatches * 25 / conclusionFields.length);
  dimensions.professionalConclusion = diagnosis(
    conclusionScore,
    conclusionScore === 25 ? '结论区分了已确认事实、证据缺口、风险与复核动作。' : '职业结论需要说明已确认事实、未确认风险和可执行的复核动作。',
    definition.grading.professionalConclusion.remediationTarget,
  );

  const totalScore = assessmentDimensionKeys.reduce((total, key) => total + dimensions[key].score, 0);
  const remediationTargets = uniqueTargets(assessmentDimensionKeys
    .filter((key) => dimensions[key].score < 20)
    .map((key) => definition.grading[key].remediationTarget));
  return { dimensions, totalScore, remediationTargets };
}

function normalizeProfessionalConclusion(value: object): ProfessionalConclusionAnswer {
  const record = value as Record<string, unknown>;
  const keys = ['confirmedFact', 'evidenceGap', 'risk', 'action'] as const;
  if (Object.keys(record).length !== keys.length
    || keys.some((key) => !Object.hasOwn(record, key) || typeof record[key] !== 'string')) {
    throw new TypeError('Professional conclusion must contain exactly four text fields.');
  }
  const normalized = Object.fromEntries(
    keys.map((key) => [key, (record[key] as string).trim()]),
  ) as unknown as ProfessionalConclusionAnswer;
  if (keys.some((key) => normalized[key].length > 2_000)) {
    throw new TypeError('Professional conclusion fields must not exceed 2000 characters.');
  }
  return normalized;
}

function diagnosis(
  score: number,
  feedback: string,
  remediationTarget: RemediationTarget,
): AssessmentDimensionDiagnosis {
  return {
    score,
    maxScore: 25,
    feedback,
    ...(score < 20 ? { remediationTarget } : {}),
  };
}

function uniqueTargets(targets: RemediationTarget[]): RemediationTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.nodeId}:${target.sectionId}:${target.activityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

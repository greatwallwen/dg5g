import {
  assessmentDimensionKeys,
  type AssessmentDimensionDiagnosis,
  type AssessmentDimensionKey,
  type RemediationTarget,
} from '../../platform/formal-assessment-contract.ts';
import type { LearningOrigin } from '../../platform/learning-origin.ts';
import type {
  P1OutputTaskId,
  ProfessionalOutputFieldValue,
  ProfessionalOutputEvidenceGap,
  ProfessionalOutputHead,
  ProfessionalOutputStatus,
  ProfessionalOutputUpstreamRef,
} from '../../platform/professional-output-repository.ts';
import { projectOutputWorkflow, type OutputWorkflowState } from './output-workflow-state.ts';
import type { P01EvidenceKind } from './evidence-library.ts';
import {
  diffProfessionalOutputVersions,
  type ProfessionalOutputVersionDiff,
} from './professional-output-version-diff.ts';

export { diffProfessionalOutputVersions } from './professional-output-version-diff.ts';

export interface ProfessionalOutputFieldSourceFact {
  fieldKey: string;
  sourceNodeId: string;
  sourceAttemptId: string;
}

export interface PortfolioEvidenceFact {
  evidenceId: string;
  title: string;
  kind: P01EvidenceKind;
  assetUrl: string;
  metadata: Record<string, string>;
  origin: LearningOrigin;
}

export interface PortfolioVersionFact {
  outputId: string;
  taskId: P1OutputTaskId;
  version: number;
  schemaVersion: 1;
  fields: Record<string, ProfessionalOutputFieldValue>;
  upstreamRefs: ProfessionalOutputUpstreamRef[];
  evidenceLinks: Record<string, PortfolioEvidenceFact[]>;
  evidenceGaps: Record<string, ProfessionalOutputEvidenceGap>;
  fieldSources: ProfessionalOutputFieldSourceFact[];
}

export interface PortfolioReviewFact {
  reviewId: string;
  reviewerId: string;
  status: 'returned' | 'verified';
  outputVersion: number;
  score?: number;
  feedback?: string;
  reviewedAt: string;
  origin: LearningOrigin;
  annotations: Array<{ fieldKey: string; comment: string }>;
}

export interface PortfolioAssessmentFact {
  assessmentId: string;
  attemptId: string;
  nodeId: string;
  questionVersion: string;
  totalScore: number;
  passed: boolean;
  dimensions: Record<AssessmentDimensionKey, AssessmentDimensionDiagnosis>;
  remediationTargets: RemediationTarget[];
  origin: LearningOrigin;
  completedAt: string;
}

export interface P1PortfolioDetailFacts {
  taskId: P1OutputTaskId;
  output?: {
    head: ProfessionalOutputHead & { origin: LearningOrigin };
    versions: PortfolioVersionFact[];
    submissionCount: number;
    reviewHistory: PortfolioReviewFact[];
  };
  assessment?: PortfolioAssessmentFact;
  assessmentLinkStatus?: 'legacy-unlinked';
}

export interface P1PortfolioDetailTaskDefinition {
  taskId: P1OutputTaskId;
  taskTitle: string;
  outputTitle: string;
  fieldDefinitions: Array<{ key: string; label: string }>;
  assessmentNodeId: string;
  outputNodeId: string;
}

export type PortfolioDetailFormation = 'unformed' | 'formed';
export type PortfolioDeliveryState = 'not-deliverable' | 'demo-only' | 'verified-deliverable';

export interface P1PortfolioDetailFieldViewModel {
  key: string;
  label: string;
  value: ProfessionalOutputFieldValue;
  displayValue: string;
  evidence: Array<PortfolioEvidenceFact & { originLabel: string }>;
  evidenceGap?: ProfessionalOutputEvidenceGap;
  sources: Array<ProfessionalOutputFieldSourceFact & { label: string; href: string }>;
  annotations: Array<{
    reviewId: string;
    outputVersion: number;
    reviewStatus: 'returned' | 'verified';
    comment: string;
  }>;
  unknownField: boolean;
}

export interface P1PortfolioDetailViewModel {
  taskId: P1OutputTaskId;
  taskTitle: string;
  outputTitle: string;
  formation: PortfolioDetailFormation;
  deliveryState: PortfolioDeliveryState;
  statusLabel: string;
  workflowState?: OutputWorkflowState;
  origin?: LearningOrigin;
  originLabel?: string;
  currentVersion?: number;
  outputHref: string;
  versions: Array<{
    version: number;
    isCurrent: boolean;
    fields: P1PortfolioDetailFieldViewModel[];
    diffFromPrevious?: ProfessionalOutputVersionDiff;
  }>;
  reviewTimeline: Array<PortfolioReviewFact & { originLabel: string }>;
  assessmentLinkStatus?: 'legacy-unlinked';
  assessment?: {
    assessmentId: string;
    attemptId: string;
    nodeId: string;
    nodeHref: string;
    questionVersion: string;
    totalScore: number;
    passed: boolean;
    origin: LearningOrigin;
    originLabel: string;
    completedAt: string;
    dimensions: Array<AssessmentDimensionDiagnosis & { key: AssessmentDimensionKey; label: string }>;
    remediationTargets: RemediationTarget[];
  };
}

export function buildP1PortfolioDetailModel(
  definition: P1PortfolioDetailTaskDefinition,
  facts: P1PortfolioDetailFacts,
): P1PortfolioDetailViewModel {
  const base = {
    taskId: definition.taskId,
    taskTitle: definition.taskTitle,
    outputTitle: definition.outputTitle,
    outputHref: `/learn/${definition.outputNodeId}?section=output`,
  };
  const output = facts.taskId === definition.taskId ? facts.output : undefined;
  const current = output?.versions.find(({ version }) => version === output.head.currentVersion);
  if (!output || !current) {
    return {
      ...base,
      formation: 'unformed',
      deliveryState: 'not-deliverable',
      statusLabel: '尚未形成',
      versions: [],
      reviewTimeline: [],
    };
  }

  const workflow = projectOutputWorkflow(output);
  const orderedKeys = definition.fieldDefinitions.map(({ key }) => key);
  const labels = new Map(definition.fieldDefinitions.map(({ key, label }) => [key, label]));
  const reviews = [...output.reviewHistory].sort(compareReview);
  const versions = [...output.versions].sort((left, right) => left.version - right.version);
  const projectedVersions = versions.map((version, index) => ({
    version: version.version,
    isCurrent: version.version === output.head.currentVersion,
    fields: projectFields(version, reviews, orderedKeys, labels),
    ...(index === 0 ? {} : {
      diffFromPrevious: diffProfessionalOutputVersions(versions[index - 1]!, version, orderedKeys),
    }),
  }));
  const assessment = projectAssessment(facts.assessment, definition.assessmentNodeId);
  return {
    ...base,
    formation: 'formed',
    deliveryState: output.head.origin === 'demo'
      ? 'demo-only'
      : output.head.status === 'verified' ? 'verified-deliverable' : 'not-deliverable',
    statusLabel: workflow.label,
    workflowState: workflow.state,
    origin: output.head.origin,
    originLabel: originLabel(output.head.origin),
    currentVersion: output.head.currentVersion,
    versions: projectedVersions,
    reviewTimeline: reviews.map((review) => ({ ...review, originLabel: originLabel(review.origin) })),
    ...(facts.assessmentLinkStatus ? { assessmentLinkStatus: facts.assessmentLinkStatus } : {}),
    ...(assessment ? { assessment } : {}),
  };
}

function projectFields(
  version: PortfolioVersionFact,
  reviews: PortfolioReviewFact[],
  orderedKeys: readonly string[],
  labels: ReadonlyMap<string, string>,
): P1PortfolioDetailFieldViewModel[] {
  const extras = Object.keys(version.fields).filter((key) => !labels.has(key)).sort();
  return [...orderedKeys, ...extras].filter((key) => Object.hasOwn(version.fields, key)).map((key) => ({
    key,
    label: labels.get(key) ?? `未知字段：${key}`,
    value: version.fields[key]!,
    displayValue: displayValue(version.fields[key]!),
    evidence: (version.evidenceLinks[key] ?? []).map((item) => ({
      ...item,
      originLabel: item.origin === 'demo' ? '演示证据' : '学习证据',
    })),
    ...(version.evidenceGaps[key] ? { evidenceGap: version.evidenceGaps[key] } : {}),
    sources: version.fieldSources.filter(({ fieldKey }) => fieldKey === key).map((source) => ({
      ...source,
      label: `来自 ${source.sourceNodeId} 岗位练习`,
      href: `/learn/${source.sourceNodeId}`,
    })),
    annotations: reviews.flatMap((review) => review.outputVersion === version.version
      ? review.annotations.filter(({ fieldKey }) => fieldKey === key).map(({ comment }) => ({
        reviewId: review.reviewId,
        outputVersion: review.outputVersion,
        reviewStatus: review.status,
        comment,
      }))
      : []),
    unknownField: !labels.has(key),
  }));
}

function projectAssessment(
  assessment: PortfolioAssessmentFact | undefined,
  expectedNodeId: string,
): P1PortfolioDetailViewModel['assessment'] {
  if (!assessment || assessment.nodeId !== expectedNodeId) return undefined;
  const entries = Object.entries(assessment.dimensions);
  if (entries.length !== assessmentDimensionKeys.length) return undefined;
  const dimensions = assessmentDimensionKeys.map((key) => assessment.dimensions[key]);
  if (dimensions.some((item) => !validDiagnosis(item))) return undefined;
  const total = dimensions.reduce((sum, item) => sum + item.score, 0);
  if (total !== assessment.totalScore || assessment.passed !== (total >= 80)) return undefined;
  return {
    assessmentId: assessment.assessmentId,
    attemptId: assessment.attemptId,
    nodeId: assessment.nodeId,
    nodeHref: `/learn/${assessment.nodeId}/test`,
    questionVersion: assessment.questionVersion,
    totalScore: assessment.totalScore,
    passed: assessment.passed,
    origin: assessment.origin,
    originLabel: originLabel(assessment.origin),
    completedAt: assessment.completedAt,
    dimensions: assessmentDimensionKeys.map((key) => ({
      ...assessment.dimensions[key], key, label: dimensionLabels[key],
    })),
    remediationTargets: assessment.remediationTargets,
  };
}

function validDiagnosis(value: AssessmentDimensionDiagnosis | undefined): value is AssessmentDimensionDiagnosis {
  return Boolean(value && value.maxScore === 25 && Number.isFinite(value.score)
    && value.score >= 0 && value.score <= 25 && value.feedback.trim());
}

const dimensionLabels: Record<AssessmentDimensionKey, string> = {
  evidenceClassification: '证据分类',
  linkReconstruction: '链路重建',
  defectiveOutputRevision: '错误成果修订',
  professionalConclusion: '职业结论表达',
};

function originLabel(origin: LearningOrigin): string {
  return origin === 'demo' ? '演示数据' : '真实学习记录';
}

function displayValue(value: ProfessionalOutputFieldValue): string {
  return Array.isArray(value) ? value.join('；') : String(value);
}

function compareReview(left: PortfolioReviewFact, right: PortfolioReviewFact): number {
  return left.reviewedAt.localeCompare(right.reviewedAt) || left.reviewId.localeCompare(right.reviewId);
}

export const assessmentDimensionKeys = [
  'evidenceClassification',
  'linkReconstruction',
  'defectiveOutputRevision',
  'professionalConclusion',
] as const;

export type AssessmentDimensionKey = (typeof assessmentDimensionKeys)[number];

export interface RemediationTarget {
  nodeId: string;
  sectionId: 'practice';
  activityId: string;
}

export interface AssessmentOption {
  id: string;
  label: string;
}

export type AssessmentQuestion = {
  id: AssessmentDimensionKey;
  dimension: AssessmentDimensionKey;
  prompt: string;
  helpText: string;
  kind: 'single-choice' | 'ordering' | 'multiple-choice' | 'structured-conclusion';
  options?: AssessmentOption[];
};

export interface AssessmentPaper {
  nodeId: string;
  title: string;
  questionVersion: string;
  passScore: number;
  durationMinutes: number;
  questions: AssessmentQuestion[];
}

export interface ProfessionalConclusionAnswer {
  confirmedFact: string;
  evidenceGap: string;
  risk: string;
  action: string;
}

export interface AssessmentAnswers {
  evidenceClassification: string;
  linkReconstruction: string[];
  defectiveOutputRevision: string[];
  professionalConclusion: ProfessionalConclusionAnswer;
}

export type AssessmentDraftAnswers = Partial<{
  evidenceClassification: string;
  linkReconstruction: string[];
  defectiveOutputRevision: string[];
  professionalConclusion: Partial<ProfessionalConclusionAnswer>;
}>;

export interface AssessmentDraftDto {
  answers: AssessmentDraftAnswers;
  revision: number;
  updatedAt?: string;
}

export interface AssessmentDimensionDiagnosis {
  score: number;
  maxScore: 25;
  feedback: string;
  remediationTarget?: RemediationTarget;
}

export interface AssessmentDiagnosis {
  assessmentId: string;
  attemptId: string;
  nodeId: string;
  questionVersion: string;
  totalScore: number;
  passed: boolean;
  dimensions: Record<AssessmentDimensionKey, AssessmentDimensionDiagnosis>;
  remediationTargets: RemediationTarget[];
  correction?: {
    level: 1 | 2 | 3;
    stage: 'diagnosis' | 'rule-location' | 'worked-correction';
    guidance: string[];
    rotateNext: boolean;
  };
  origin: 'user';
  completedAt: string;
  version: number;
  globalVersion: number;
  paper: AssessmentPaper;
}

export interface IssuedAssessmentSnapshot {
  paper: AssessmentPaper;
  assessmentId: string;
  serverNow: string;
  expiresAt: string;
  state: 'in-progress' | 'paused' | 'expired';
  draft: AssessmentDraftDto;
}

export type ActiveIssuedAssessmentPaper = IssuedAssessmentSnapshot & {
  state: 'in-progress';
  attemptToken: string;
};

export type IssuedAssessmentPaper = ActiveIssuedAssessmentPaper | (IssuedAssessmentSnapshot & {
  state: 'paused' | 'expired';
  attemptToken?: never;
});

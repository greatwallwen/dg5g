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

export type ProfessionalConclusionField = 'confirmedFact' | 'evidenceGap' | 'risk' | 'action';

export type AssessmentQuestion = {
  id: AssessmentDimensionKey;
  dimension: AssessmentDimensionKey;
  prompt: string;
  helpText: string;
  kind: 'single-choice' | 'ordering' | 'multiple-choice' | 'structured-conclusion';
  options?: AssessmentOption[];
  conclusionOptions?: Record<ProfessionalConclusionField, AssessmentOption[]>;
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
  origin: 'user';
  completedAt: string;
  version: number;
  globalVersion: number;
  paper: AssessmentPaper;
}

export interface IssuedAssessmentPaper {
  paper: AssessmentPaper;
  attemptToken: string;
  assessmentId: string;
  expiresAt: string;
}

import type {
  P1PortfolioDetailFieldViewModel,
  P1PortfolioDetailViewModel,
} from '@/features/portfolio/p1-portfolio-detail-model';

export interface ReviewRubricCriterion {
  key: string;
  label: string;
  maxScore: number;
}

export interface ReviewQueueItem {
  outputId: string;
  studentId: string;
  studentName: string;
  taskId: 'P01' | 'P02' | 'P03';
  nodeId: string;
  status: 'submitted';
  currentVersion: number;
  stateRevision: number;
  fields: Record<string, unknown>;
  fieldSchema: Array<{ key: string; label: string }>;
  rubric: ReviewRubricCriterion[];
  detail: P1PortfolioDetailViewModel;
}

export interface QueueResponse {
  outputs: ReviewQueueItem[];
  error?: string;
}

export type ReviewField = P1PortfolioDetailFieldViewModel;

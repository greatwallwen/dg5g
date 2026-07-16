import type { ProfessionalOutputHead } from '../../platform/professional-output-repository.ts';

export type OutputWorkflowState =
  | 'editing'
  | 'submitted'
  | 'returned'
  | 'revising'
  | 'resubmitted'
  | 'verified';

export interface OutputWorkflowProjection {
  state: OutputWorkflowState;
  label: '编辑中' | '已提交' | '教师退回' | '修订中' | '再次提交' | '教师确认';
  origin?: ProfessionalOutputHead['origin'];
}

export interface OutputWorkflowFacts {
  head: ProfessionalOutputHead;
  submissionCount: number;
  reviewHistory: Array<{ reviewId: string; status: 'returned' | 'verified' }>;
}

export function projectOutputWorkflow(facts: OutputWorkflowFacts): OutputWorkflowProjection {
  const origin = facts.head.origin;
  if (facts.head.status === 'verified') return { state: 'verified', label: '教师确认', origin };
  if (facts.head.status === 'returned') return { state: 'returned', label: '教师退回', origin };
  if (facts.head.status === 'submitted') {
    return facts.submissionCount > 1
      ? { state: 'resubmitted', label: '再次提交', origin }
      : { state: 'submitted', label: '已提交', origin };
  }
  return facts.reviewHistory.some(({ status }) => status === 'returned')
    ? { state: 'revising', label: '修订中', origin }
    : { state: 'editing', label: '编辑中', origin };
}

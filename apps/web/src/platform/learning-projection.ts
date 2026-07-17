import type { NodeLearningState } from './learning-status';

export type PrerequisiteCondition =
  | 'micro-practice-passed'
  | 'formal-test-passed'
  | 'professional-output-submitted-once'
  | 'teacher-verified';
export type EvidenceReviewState = 'not-submitted' | 'submitted' | 'returned' | 'verified';

export interface LearningPrerequisite {
  nodeId: string;
  condition: PrerequisiteCondition;
}

export interface ProjectionPolicy {
  prerequisites: LearningPrerequisite[];
  publicationStatus: 'published' | 'not-open';
  requiresMicroPractice: boolean;
  requiresFormalTest: boolean;
  formalPassScore?: number;
  requiresProfessionalOutput: boolean;
  professionalOutputTitle?: string;
  requiresTeacherVerification: boolean;
}

export interface LearningFacts {
  hasActivity: boolean;
  microPracticePassed: boolean;
  bestFormalTestScore?: number;
  evidenceReviewStatus: EvidenceReviewState;
  formalAssessmentState?: 'in-progress' | 'paused' | 'expired';
  outputState?: 'editing' | 'submitted' | 'returned' | 'revising' | 'resubmitted' | 'verified';
  teacherVerified?: boolean;
}

export interface PrerequisiteProgress {
  nodeId: string;
  microPracticePassed: boolean;
  formalTestPassed: boolean;
  professionalOutputSubmittedOnce: boolean;
  teacherVerified: boolean;
}

export interface NodeLearningProjection {
  state: NodeLearningState;
  stateTrail: NodeLearningState[];
  achieved: boolean;
  completionPercent: number;
  nextRequirement: string;
  axes: NodeStateAxes;
}

export interface NodeStateAxes {
  access: 'unpublished' | 'locked' | 'open';
  learning: 'not-started' | 'in-progress' | 'practice-passed';
  formalTest: 'not-required' | 'ready' | 'in-progress' | 'paused' | 'failed' | 'passed' | 'expired';
  output: 'not-required' | 'editing' | 'submitted' | 'returned' | 'revising' | 'resubmitted' | 'verified';
  certification: 'not-reached' | 'pending-review' | 'achieved';
}

export function arePrerequisitesMet(
  prerequisites: LearningPrerequisite[],
  progress: PrerequisiteProgress[],
): boolean {
  const progressByNode = new Map(progress.map((item) => [item.nodeId, item]));
  return prerequisites.every((prerequisite) => {
    const current = progressByNode.get(prerequisite.nodeId);
    if (!current) return false;
    switch (prerequisite.condition) {
      case 'micro-practice-passed':
        return current.microPracticePassed;
      case 'formal-test-passed':
        return current.formalTestPassed;
      case 'professional-output-submitted-once':
        return current.professionalOutputSubmittedOnce;
      case 'teacher-verified':
        return current.teacherVerified;
    }
  });
}

export function deriveNodeLearningProjection(
  policy: ProjectionPolicy,
  facts: LearningFacts,
  prerequisiteProgress: PrerequisiteProgress[],
): NodeLearningProjection {
  const axes = deriveNodeStateAxes(policy, facts, prerequisiteProgress);
  if (axes.access !== 'open') return projection(['locked'], '先完成前置能力节点', axes);
  if (axes.learning === 'not-started') return projection(['available'], '开始学习', axes);

  const states: NodeLearningState[] = ['learning'];
  if (policy.requiresMicroPractice) {
    if (axes.learning !== 'practice-passed') return projection(states, '完成微练习', axes);
    states.push('micro-practice-passed');
  }

  if (policy.requiresFormalTest) {
    const passScore = policy.formalPassScore ?? 80;
    if (axes.formalTest !== 'passed') {
      return projection(states, `正式测试达到 ${passScore} 分`, axes);
    }
    states.push('formal-test-passed');
  }

  if (policy.requiresProfessionalOutput) {
    if (axes.output === 'editing') {
      return projection(states, `提交《${policy.professionalOutputTitle ?? '专业产出'}》`, axes);
    }
    states.push('evidence-submitted', 'awaiting-review');
    if (axes.output === 'returned' || axes.output === 'revising') {
      states.push('returned');
      return projection(states, '按教师反馈修订并重新提交', axes);
    }
    if (axes.certification !== 'achieved') {
      return projection(states, '等待教师按量规复核', axes);
    }
  }

  if (policy.requiresTeacherVerification) states.push('teacher-verified');
  states.push('achieved');
  return projection(states, '进入下一能力节点', axes);
}

export function deriveNodeStateAxes(
  policy: ProjectionPolicy,
  facts: LearningFacts,
  prerequisiteProgress: PrerequisiteProgress[],
): NodeStateAxes {
  const access: NodeStateAxes['access'] = policy.publicationStatus !== 'published'
    ? 'unpublished'
    : arePrerequisitesMet(policy.prerequisites, prerequisiteProgress)
      ? 'open'
      : 'locked';
  const learning: NodeStateAxes['learning'] = !facts.hasActivity
    ? 'not-started'
    : policy.requiresMicroPractice && facts.microPracticePassed
      ? 'practice-passed'
      : 'in-progress';
  const passScore = policy.formalPassScore ?? 80;
  const formalTest: NodeStateAxes['formalTest'] = !policy.requiresFormalTest
    ? 'not-required'
    : facts.bestFormalTestScore !== undefined && facts.bestFormalTestScore >= passScore
      ? 'passed'
      : facts.formalAssessmentState === 'in-progress' || facts.formalAssessmentState === 'paused'
        ? facts.formalAssessmentState
        : facts.bestFormalTestScore !== undefined
          ? 'failed'
          : facts.formalAssessmentState ?? 'ready';
  const output: NodeStateAxes['output'] = !policy.requiresProfessionalOutput
    ? 'not-required'
    : facts.outputState
      ?? (facts.evidenceReviewStatus === 'not-submitted' ? 'editing' : facts.evidenceReviewStatus);
  const requirementsPassed = learning === 'practice-passed'
    && (!policy.requiresFormalTest || formalTest === 'passed')
    && (!policy.requiresProfessionalOutput || output === 'verified');
  const certification: NodeStateAxes['certification'] = policy.requiresTeacherVerification
    ? facts.teacherVerified === true && output === 'verified'
      ? 'achieved'
      : ['submitted', 'returned', 'revising', 'resubmitted', 'verified'].includes(output)
        ? 'pending-review'
        : 'not-reached'
    : requirementsPassed
      ? 'achieved'
      : 'not-reached';
  return { access, learning, formalTest, output, certification };
}

function projection(
  stateTrail: NodeLearningState[],
  nextRequirement: string,
  axes: NodeStateAxes,
): NodeLearningProjection {
  const state = stateTrail.at(-1) ?? 'locked';
  const completionPercent: Record<NodeLearningState, number> = {
    locked: 0,
    available: 0,
    learning: 20,
    'micro-practice-passed': 40,
    'formal-test-passed': 60,
    'evidence-submitted': 75,
    'awaiting-review': 80,
    returned: 70,
    'teacher-verified': 95,
    achieved: 100,
  };
  return {
    state,
    stateTrail,
    achieved: state === 'achieved',
    completionPercent: completionPercent[state],
    nextRequirement,
    axes,
  };
}

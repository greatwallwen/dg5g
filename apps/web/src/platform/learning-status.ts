export type NodeLearningState =
  | 'locked'
  | 'available'
  | 'learning'
  | 'micro-practice-passed'
  | 'formal-test-passed'
  | 'evidence-submitted'
  | 'awaiting-review'
  | 'returned'
  | 'teacher-verified'
  | 'achieved';

export const nodeLearningStateLabel: Record<NodeLearningState, string> = {
  locked: '未解锁',
  available: '可学习',
  learning: '学习中',
  'micro-practice-passed': '微练习通过',
  'formal-test-passed': '正式测试达标',
  'evidence-submitted': '专业产出已提交',
  'awaiting-review': '待教师复核',
  returned: '退回修订',
  'teacher-verified': '教师认证',
  achieved: '能力达成',
};

export type LearningStateTone = 'locked' | 'current' | 'achieved' | 'review' | 'fault';

export const nodeLearningStateTone: Record<NodeLearningState, LearningStateTone> = {
  locked: 'locked',
  available: 'current',
  learning: 'current',
  'micro-practice-passed': 'current',
  'formal-test-passed': 'current',
  'evidence-submitted': 'review',
  'awaiting-review': 'review',
  returned: 'review',
  'teacher-verified': 'review',
  achieved: 'achieved',
};

export const nodeLearningStateOrder: Record<NodeLearningState, number> = {
  locked: 0,
  available: 1,
  learning: 2,
  'micro-practice-passed': 3,
  'formal-test-passed': 4,
  'evidence-submitted': 5,
  'awaiting-review': 6,
  returned: 7,
  'teacher-verified': 8,
  achieved: 9,
};

/** Workflow completion only. This percentage is never a test or composite score. */
export const nodeLearningStateCompletionPercent: Record<NodeLearningState, number> = {
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

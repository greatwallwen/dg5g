import type {
  P1DeepNodeContent,
  P1NodeId,
  P1SelfStudyContent,
  P1SelfStudyPractice,
  P1StandardNodeContent,
  P1TaskId,
} from '../platform/p1-content.ts';

export type SelfStudySectionId = 'problem' | 'figure' | 'steps' | 'correction' | 'practice' | 'output';

export const selfStudySectionDefinitions: ReadonlyArray<{
  id: SelfStudySectionId;
  label: '问题' | '看图' | '步骤' | '纠偏' | '练习' | '记录';
  playbackTarget: string;
}> = [
  { id: 'problem', label: '问题', playbackTarget: 'learning-case' },
  { id: 'figure', label: '看图', playbackTarget: 'learning-visual' },
  { id: 'steps', label: '步骤', playbackTarget: 'learning-procedure' },
  { id: 'correction', label: '纠偏', playbackTarget: 'learning-correction' },
  { id: 'practice', label: '练习', playbackTarget: 'learning-practice' },
  { id: 'output', label: '记录', playbackTarget: 'learning-output' },
];

export type SelfStudyPractice = P1SelfStudyPractice;
export type DeepSelfStudyContent = P1DeepNodeContent;
export type StandardSelfStudyContent = P1StandardNodeContent;
export type SelfStudyContent = P1SelfStudyContent;

export interface SelfStudyDocument {
  projectId: 'P1';
  projectTitle: string;
  taskId: P1TaskId;
  taskTitle: string;
  taskOutputTitle: string;
  nodeId: P1NodeId;
  nodeTitle: string;
  nodeGoal: string;
  sourceKnowledgeUnitId: string;
  content: SelfStudyContent;
}

export type SelfStudyCatalog = Record<P1NodeId, SelfStudyDocument>;

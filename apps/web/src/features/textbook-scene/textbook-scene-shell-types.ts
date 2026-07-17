import type { GraphData, TextbookSceneMode } from '@/platform/models';
import type { LearningProgressSnapshot } from '@/features/skill-tree/skill-progress-client';
import type { SelfStudyCatalog, SelfStudySectionId } from './self-study-types';

export type TextbookSceneShellProps = {
  displayName: string;
  graph: GraphData;
  selfStudyCatalog: SelfStudyCatalog;
  initialMode?: TextbookSceneMode;
  initialNodeId?: string;
  initialSection?: SelfStudySectionId;
  focusedActivityId?: string;
  initialSnapshot: LearningProgressSnapshot;
  sessionId: string;
  surface?: 'sample' | 'student' | 'map';
  autoFocus?: boolean;
  serverNow?: string;
};

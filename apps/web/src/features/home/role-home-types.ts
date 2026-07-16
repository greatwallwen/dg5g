import type { AuthenticatedActor } from '../../platform/auth/actor.ts';
import type {
  ClassScoreSnapshot,
  SnapshotSubmissionMetrics,
} from '../../platform/authoritative-snapshot.ts';
import type { AuthoritativeDomFacts } from '../snapshot/snapshot-dom-facts.ts';

export type RoleHomeActionIcon = 'arrow' | 'book' | 'grid' | 'map';

export interface RoleHomeAction {
  label: string;
  href: string;
  icon: RoleHomeActionIcon;
}

export interface LearningContextSnapshot {
  project: { id: string; title: string; finalOutput: string };
  task: { id: string; title: string; why: string; outputTitle: string };
  node: { id: string; title: string; goal: string };
  completionStandard: string;
  href: string;
  access: {
    kind: 'open' | 'locked';
    label: string;
    requiredNodeIds: string[];
  };
  progress: {
    stateLabel: string;
    completionPercent: number;
    nextRequirement: string;
    nodeTestHighestScore?: number;
    taskCompositeScore?: number;
    projectCompositeScore?: number;
  };
}

export interface StudentHomeSnapshot {
  displayName: string;
  authoritativeFacts?: AuthoritativeDomFacts;
  selfStudy?: LearningContextSnapshot;
  activeClassroom?: {
    className: string;
    routeSessionId: string;
    participation: {
      state: 'not-joined' | 'joined' | 'left';
      mode: 'follow' | 'self';
    };
    context: LearningContextSnapshot;
  };
  dataIssue?: string;
}

export interface WeakPointSnapshot {
  id: string;
  label: string;
  affectedCount: number;
}

export interface TeachingPositionSnapshot {
  projectId: string;
  projectTitle: string;
  taskId: string;
  taskTitle: string;
  nodeId: string;
  nodeTitle: string;
  unitId?: string;
}

export interface TeacherWorkbenchSnapshot {
  displayName: string;
  courseTitle: string;
  classroom: {
    id: string;
    name: string;
    status: 'preparing' | 'active' | 'paused' | 'closed';
    revision: number;
  };
  lastPosition?: TeachingPositionSnapshot;
  classSummary: {
    memberCount: number;
    joinedCount: number;
    followingCount: number;
    submissions: SnapshotSubmissionMetrics;
    weakPoints: WeakPointSnapshot[];
  };
  classScores: ClassScoreSnapshot;
  lessonOptions: Array<{ nodeId: string; title: string }>;
  dataIssue?: string;
}

export type RoleHomeActor = AuthenticatedActor;

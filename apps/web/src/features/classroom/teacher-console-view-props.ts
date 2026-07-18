import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ClassroomLessonIntent } from '@/platform/classroom-state';
import type {
  ClassScoreSnapshot,
  SnapshotSubmissionMetrics,
} from '@/platform/authoritative-snapshot';
import type { ClassSession, PlaybackScene, Task } from '@/platform/models';
import type { SessionPatch } from './use-class-session';
import type { AuthoritativeDomFacts } from '../snapshot/snapshot-dom-facts';
import type { P01TeachingPage } from '../textbook-scene/classroom-lesson-model';

export interface TeacherConsoleViewProps {
  authoritativeFacts: AuthoritativeDomFacts;
  displayName: string;
  playbackOpen: boolean;
  setPlaybackOpen: Dispatch<SetStateAction<boolean>>;
  unitIndex: number;
  controlMode: string;
  profile: any;
  unit: any;
  rosterStats: {
    total: number;
    follow: number;
    self: number;
    needsHelp: number;
    submitted: number;
  };
  controlsAvailable: boolean;
  connectionStatus: 'offline' | 'online' | 'degraded';
  onlineStudentDeviceCount: number;
  session: ClassSession;
  inspectorOpen: boolean;
  closeInspector: () => void;
  setInspectorOpen: Dispatch<SetStateAction<boolean>>;
  inspectorButtonRef: RefObject<HTMLButtonElement>;
  inspectorTab: 'script' | 'learning' | 'review';
  setInspectorTab: Dispatch<SetStateAction<'script' | 'learning' | 'review'>>;
  deliveryStats: { applied: number; failed: number; pending: number };
  teacherScript: string[];
  teachingPage?: P01TeachingPage;
  formalAssessment: SnapshotSubmissionMetrics['activeAssessment'];
  classScores: ClassScoreSnapshot;
  submittedAnswers: string[];
  connection: { state: string };
  verificationActionState: string;
  activePlayback: PlaybackScene;
  update: (patch: SessionPatch) => void;
  submitIntent: (intent: ClassroomLessonIntent) => Promise<boolean>;
  task: Task;
  go: (index: number) => void;
  startFormalTest: () => void;
  pushPage: () => void;
  forceFollow: () => void;
  releaseFollowLock: () => void;
  beginReview: () => void;
  verificationMessage: string;
}

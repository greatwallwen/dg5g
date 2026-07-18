import type { NodeLearningState } from './learning-status';
import type { LearningOrigin } from './learning-origin';
import type { NodeStateAxes } from './learning-projection';
import type { ClassroomLessonRunStatus, TeachingCursor } from './teaching-cursor';

export type { NodeLearningState } from './learning-status';

export type PageId =
  | 'P1-TEXTBOOK-COURSE-HOME'
  | 'P1-TEXTBOOK-PROJECT-P1'
  | 'P1-TEXTBOOK-TASK-P1T1'
  | 'P1-STUDENT-SELF-N01'
  | 'P1-GRAPH-COURSE'
  | 'P1-TEACH-CONSOLE-N01'
  | 'P1-TEACH-PROJECTOR-N01'
  | 'P1-STUDENT-FOLLOW-N01';

export type ProjectStatus = 'completed' | 'active' | 'locked';
export type NodeStatus = 'completed' | 'active' | 'next' | 'locked';
export type MetricStatus = 'pass' | 'fail' | 'review';
export type GovernanceStatus = 'approved' | 'review' | 'needs-media' | 'draft';
export type OutputMode = 'resource-package' | 'direct-render';
export type StudentMode = 'follow' | 'self';
export type StudentSyncState = 'idle' | 'requested' | 'forced';
export type ActivityState = 'not_pushed' | 'pushed' | 'submitted' | 'reviewing';
export type SubmissionState = 'draft' | 'submitted' | 'reviewed';
export type ReviewState = 'not_started' | 'reviewing' | 'completed';
export type SelfStudyState = 'not_started' | 'in_progress' | 'completed';
export type StudentRiskLevel = 'ok' | 'watch' | 'help';
export type SkillMasteryState = 'locked' | 'available' | 'learning' | 'mastered';
export type SkillLearningChannel = 'self-study' | 'classroom' | 'game';
export type SkillLearningEventType = 'section_completed' | 'classroom_submitted' | 'game_completed' | 'evidence_submitted' | 'teacher_returned' | 'teacher_verified';
export type EvidenceReviewStatus = 'not-submitted' | 'submitted' | 'returned' | 'verified';
export type TextbookSceneMode = 'course-map' | 'task-map' | 'learning' | 'challenge' | 'review';
export type TextbookUnitKind = 'case' | 'concept' | 'procedure' | 'evidence' | 'review' | 'output';
export type TaskMasteryState = 'learning' | 'challenge-ready' | 'mastered' | 'verified';
export type AchievementLevel = 'locked' | 'available' | 'learned' | 'passed' | 'mastered' | 'excellent';
export type CurriculumGraphNodeKind = 'role' | 'work-task' | 'capability' | 'project' | 'textbook-task' | 'skill' | 'activity' | 'achievement';
export type CurriculumGraphReveal = 'overview' | 'route' | 'detail';
export type LessonPhase = 'prepare' | 'lecture' | 'question' | 'practice' | 'challenge' | 'review' | 'close';
export type ClassroomPlaybackStatus = 'idle' | 'playing' | 'paused' | 'ended';
export type ClassroomAudioOwner = 'teacher' | 'projector';

export interface ClassroomPlaybackState {
  sceneId: string;
  actionId: string;
  actionIndex: number;
  status: ClassroomPlaybackStatus;
  startedAt?: string;
  positionMs: number;
  rate: number;
  revision: number;
  audioOwner: ClassroomAudioOwner;
}

export interface ClassroomLessonState {
  phase: LessonPhase;
  activeNodeId: string;
  activeUnitId: string;
  playback: ClassroomPlaybackState;
  revision: number;
}

export type CommandAckState = 'queued' | 'delivered' | 'applied' | 'failed' | 'expired';
export type ClassroomHelperState = 'offline' | 'connecting' | 'online' | 'degraded';
export type ClassroomPageState = 'closed' | 'opening' | 'ready' | 'hidden' | 'error';
export type ClassroomSyncHealth = 'online' | 'degraded' | 'offline';
export type ClassroomClientKind = 'browser' | 'helper-simulator';
export type ClassroomVisibilityState = 'visible' | 'hidden';

export interface ClassroomCommand {
  commandId: string;
  sessionId: string;
  studentId?: string;
  phase: LessonPhase;
  route: string;
  nodeId: string;
  unitId: string;
  revision: number;
  createdAt: string;
  expiresAt: string;
}

export interface DevicePresence {
  deviceId: string;
  actorRole: 'teacher' | 'student' | 'projector';
  studentId?: string;
  clientKind: ClassroomClientKind;
  visibilityState: ClassroomVisibilityState;
  syncHealth: ClassroomSyncHealth;
  helperState: ClassroomHelperState;
  pageState: ClassroomPageState;
  lastHeartbeatAt: string;
  lastAppliedRevision: number;
}

export interface CommandAck {
  commandId: string;
  deviceId: string;
  studentId?: string;
  state: CommandAckState;
  at: string;
  reason?: string;
}

export interface ClassroomDeviceSnapshot {
  command?: ClassroomCommand;
  devices: DevicePresence[];
  acks: CommandAck[];
}

export interface GameAttemptSummary {
  attemptId: string;
  assessmentId?: string;
  gameId: string;
  nodeId: string;
  score: number;
  durationSeconds?: number;
  formal: boolean;
  completedAt: string;
  mistakeKnowledgePointIds: string[];
  origin?: LearningOrigin;
}

export interface FormalTestParticipant {
  studentId: string;
  state: 'waiting' | 'playing' | 'submitted';
  score?: number;
  durationSeconds?: number;
}

export interface FormalTestSession {
  assessmentId: string;
  /** Shared classroom run identity; distinct from each student's assessment instance. */
  runId?: string;
  gameId: string;
  nodeId: string;
  status: 'idle' | 'running' | 'paused' | 'review';
  durationSeconds: number;
  startedAt?: string;
  extendedSeconds: number;
  participants: FormalTestParticipant[];
}

export interface SkillLearningEvent {
  eventId: string;
  studentId: string;
  nodeId: string;
  channel: SkillLearningChannel;
  type: SkillLearningEventType;
  at: string;
  sectionId?: string;
  taskId?: string;
  score?: number;
  stars?: number;
  completed?: boolean;
  mistakeKnowledgePointIds?: string[];
  gameId?: string;
  attemptId?: string;
  durationSeconds?: number;
  formal?: boolean;
  evidenceText?: string;
  feedback?: string;
}

export interface SkillProgress {
  studentId: string;
  nodeId: string;
  access?: NodeStateAxes['access'];
  axes?: NodeStateAxes;
  state: SkillMasteryState;
  masteryPercent: number;
  completedSectionIds: string[];
  requiredSectionIds: string[];
  classroomSubmitted: boolean;
  /** Highest formal-test score when at least one formal attempt exists. */
  gameScore?: number;
  gameStars: number;
  mistakeKnowledgePointIds: string[];
  masteredAt?: string;
  updatedAt?: string;
  achievementLevel?: AchievementLevel;
  gameAttempts?: GameAttemptSummary[];
  firstGameScore?: number;
  bestGameScore?: number;
  latestGameScore?: number;
  attemptCount?: number;
  evidenceSubmitted: boolean;
  evidenceReviewStatus: EvidenceReviewStatus;
  evidenceText?: string;
  teacherFeedback?: string;
  teacherVerified: boolean;
  learningState?: NodeLearningState;
  learningStateTrail?: NodeLearningState[];
  microPracticePassed?: boolean;
  formalTestPassed?: boolean;
  prerequisiteNodeIds?: string[];
  requiresFormalTest?: boolean;
  requiresProfessionalOutput?: boolean;
  requiresTeacherVerification?: boolean;
  professionalOutputId?: string;
  professionalOutputVersion?: number;
  origin?: LearningOrigin;
}

export interface TaskMasteryProgress {
  studentId: string;
  taskId: string;
  state: TaskMasteryState;
  masteredNodeIds: string[];
  requiredNodeIds: string[];
  /** Task node-test score when that score has been formed. */
  gameScore?: number;
  evidenceSubmitted: boolean;
  teacherVerified: boolean;
  masteryPercent: number;
  updatedAt?: string;
  taskScore?: number;
  formalGameScores?: Array<{ nodeId: string; gameId: string; score: number }>;
  nodeTestAverage?: number;
  pixiFormalScore?: number;
  professionalOutputScore?: number;
  provisionalScore?: number;
  officialScore?: number;
  origin?: LearningOrigin;
}

export interface ProjectMasteryProgress {
  studentId: string;
  projectId: 'P1';
  taskIds: Array<'P01' | 'P02' | 'P03'>;
  completedTaskIds: Array<'P01' | 'P02' | 'P03'>;
  taskScores: Array<{ taskId: 'P01' | 'P02' | 'P03'; provisionalScore: number; officialScore?: number }>;
  provisionalScore: number;
  officialScore?: number;
  state: 'learning' | 'awaiting-review' | 'completed';
  outcomeTitle: '5G网络信息采集成果包';
}

export type RouteTarget =
  | { kind: 'course-home'; href: string; pageId: PageId }
  | { kind: 'project'; href: string; pageId: PageId; projectId: string }
  | { kind: 'task'; href: string; pageId: PageId; taskId: string }
  | { kind: 'node'; href: string; pageId: PageId; nodeId: string }
  | { kind: 'graph'; href: string; pageId: PageId; focusNodeId?: string }
  | { kind: 'teacher'; href: string; pageId: PageId; sessionId: string }
  | { kind: 'projector'; href: string; pageId: PageId; sessionId: string }
  | { kind: 'student-follow'; href: string; pageId: PageId; sessionId: string };

export interface Course {
  courseId: string;
  title: string;
  badge: string;
  description: string;
  headline: string;
  subhead: string;
  stats: Array<{ label: string; value: string }>;
  projectIds: string[];
  focusProjectId: string;
  focusTaskId: string;
}

export interface Project {
  projectId: string;
  title: string;
  subtitle: string;
  status: ProjectStatus;
  taskIds: string[];
  summary: string;
  role: string;
}

export interface Task {
  taskId: string;
  projectId: string;
  title: string;
  subtitle: string;
  goal: string;
  output: string[];
  nodeIds: string[];
  evidenceFrom: string;
  conclusion: string;
  metrics: KpiMetric[];
  standards: string[];
}

export interface KpiMetric {
  id: string;
  dimension: string;
  name: string;
  current: string;
  target: string;
  status: MetricStatus;
  source: string;
}

export interface AbilityNode {
  nodeId: string;
  taskId: string;
  title: string;
  shortTitle: string;
  goal: string;
  action: string;
  output: string;
  assessment: string;
  status: NodeStatus;
  index: number;
  sourceBasis?: string[];
  workProcess?: string;
  resourcePolicy?: string;
  reviewStatus?: GovernanceStatus;
  versionTag?: string;
}

export interface TextbookLearningUnit {
  unitId: string;
  taskId: 'P01' | 'P02' | 'P03';
  capabilityNodeId: string;
  kind: TextbookUnitKind;
  title: string;
  question: string;
  summary: string;
  points: string[];
  steps: string[];
  visualId: string;
  counterexample: string;
  correction: string;
  action: string;
  output: string;
  requiredEvidence: string;
  nextUnitId?: string;
}

export interface ResourceCard {
  resourceId: string;
  nodeId: string;
  title: string;
  description: string;
  type: 'student-page' | 'teacher-slide' | 'projector' | 'table' | 'activity';
  routeTarget: RouteTarget;
  learningGoal?: string;
  learningAction?: string;
  assessmentOutput?: string;
  auditStatus?: GovernanceStatus;
  outputMode?: OutputMode;
}

export interface Activity {
  activityId: string;
  nodeId: string;
  title: string;
  activityType: 'sort-flow' | 'mark-evidence' | 'quick-check';
  output: string;
  prompts: string[];
  questions?: ActivityQuestion[];
}

export interface ActivityQuestion {
  id: string;
  type: 'single-choice' | 'true-false';
  prompt: string;
  options: string[];
  correctAnswer?: string;
  explanation?: string;
}

export interface Assessment {
  assessmentId: string;
  nodeId: string;
  title: string;
  rubric: string[];
}

export interface TeacherSlide {
  slideId: string;
  nodeId: string;
  pageIndex: number;
  title: string;
  subtitle: string;
  focus: string;
  visualTitle: string;
  script: string[];
  questions: Array<{ id: string; prompt: string; thinkingTime: string }>;
}

export interface StudentProgress {
  studentId: string;
  name: string;
  group: string;
  mode: StudentMode;
  currentSlideIndex: number;
  handledSyncRequestId?: string;
  selfStudyState: SelfStudyState;
  submissionState: SubmissionState;
  evidenceCount: number;
  lastAction: string;
  risk: StudentRiskLevel;
  firstGameScore?: number;
  bestGameScore?: number;
  latestGameScore?: number;
  attemptCount?: number;
  gameDurationSeconds?: number;
  activeNodeId?: string;
  mistakeKnowledgePointIds?: string[];
  evidenceReviewStatus?: EvidenceReviewStatus;
  evidenceText?: string;
  teacherFeedback?: string;
  teacherVerified?: boolean;
}

export interface ClassSession {
  sessionId: string;
  sessionStatus?: 'preparing' | 'active' | 'paused' | 'closed';
  activeLessonRunId?: string;
  lessonRunStatus?: ClassroomLessonRunStatus;
  teachingCursor?: TeachingCursor;
  currentPageId?: PageId;
  currentSlideId?: string;
  teacherSlideId: string;
  teacherSlideIndex: number;
  sceneMode?: TextbookSceneMode;
  activeTaskId?: 'P01' | 'P02' | 'P03';
  activeNodeId?: string;
  activeUnitId?: string;
  lessonState?: ClassroomLessonState;
  activeCommand?: ClassroomCommand;
  devicePresence?: DevicePresence[];
  commandAcks?: CommandAck[];
  studentMode: StudentMode;
  studentSyncState?: StudentSyncState;
  syncRequestId?: string;
  handledSyncRequestId?: string;
  playbackCursor?: {
    sceneId: string;
    actionId: string;
    actionIndex: number;
    actionType?: 'speech' | 'spotlight' | 'laser' | 'caption';
    targetId?: string;
    caption?: string;
    updatedAt?: string;
  } | null;
  lastUpdatedAt?: string;
  activityState: ActivityState;
  submissionState: SubmissionState;
  submissionAnswers?: string[];
  reviewState: ReviewState;
  selfStudyState?: SelfStudyState;
  selfStudyAnswers?: string[];
  selfStudyCompletedAt?: string;
  studentRoster: StudentProgress[];
  studentProgress?: StudentProgress;
  formalTest?: FormalTestSession;
}

export type PlaybackLayer = 'content' | 'teacher' | 'projector' | 'student-follow' | 'graph';

export interface PlaybackAction {
  id: string;
  type: 'speech' | 'spotlight' | 'laser' | 'caption';
  targetId?: string;
  elementId?: string;
  widgetId?: string;
  caption?: string;
  spokenText?: string;
  displayText?: string;
  audioId?: string;
  audioUrl?: string;
  durationMs?: number;
  layer?: PlaybackLayer;
  focusKind?: 'spotlight' | 'laser';
}

export interface PlaybackScene {
  sceneId: string;
  title: string;
  presenterId?: string;
  defaultStartActionId?: string;
  actions: PlaybackAction[];
}

export interface LearningRecord {
  userId: string;
  activityId: string;
  nodeId: string;
  score: number;
  completed: boolean;
  events: Array<{ type: string; at: string; payload?: Record<string, unknown> }>;
}

export interface GraphData {
  projects: Project[];
  tasks: Task[];
  nodes: AbilityNode[];
  semanticEdges: SemanticEdge[];
  edges: SemanticEdge[];
  bindings: ResourceCard[];
  routes: RouteTarget[];
  views: Array<{ id: string; title: string; focusNodeId?: string }>;
  curriculumNodes: CurriculumGraphNode[];
  expertSvgSrc: string;
}

export interface CurriculumGraphNode {
  id: string;
  kind: CurriculumGraphNodeKind;
  title: string;
  subtitle?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  revealAt: CurriculumGraphReveal;
  clusterId?: string;
  nodeId?: string;
  taskId?: 'P01' | 'P02' | 'P03';
  projectId?: string;
  score?: number;
  locked?: boolean;
  action?: 'learn' | 'formal-test' | 'professional-output';
}

export type SemanticEdgeKind = 'prerequisite' | 'evidence' | 'output' | 'review' | 'assessment';

export interface SemanticEdge {
  edgeId: string;
  from: string;
  to: string;
  label: string;
  kind: SemanticEdgeKind;
}

export type CourseModel = Course;
export type ClassroomSessionModel = ClassSession;
export type PlaybackSceneModel = PlaybackScene;

export interface CapabilityMapModel {
  chapterId: string;
  title: string;
  svgSrc: string;
  chapters?: Project[];
  tasks?: Task[];
  nodes?: AbilityNode[];
  semanticEdges?: SemanticEdge[];
  routeLine: Array<{ id: string; label: string; summary: string }>;
  taskNodes: Array<{ id: string; label: string; status: NodeStatus }>;
  resources: ResourceCard[];
  assessmentOutputs: Assessment[];
}

export interface SpeechAudioManifestItem {
  audioId: string;
  url: string;
  providerId: 'qwen-tts' | 'kokoro-tts' | 'voxcpm-tts' | string;
  voice: string;
  modelId: string;
  textHash?: string;
}

export interface SpeechAudioManifest {
  version: number;
  generatedAt: string;
  items: Record<string, SpeechAudioManifestItem>;
}

export interface QualityGateReport {
  fileLineViolations: Array<{ path: string; lines: number; limit: number }>;
  invalidLinks: string[];
  missingPlaybackTargets: string[];
  meaninglessGraphEdges: string[];
  hasConsoleErrors: boolean;
  hasGarbledText: boolean;
}

import type { NodeLearningState } from './learning-status.ts';
import {
  getNodeLearningPolicy,
  nodeLearningPolicies,
  type P1NodeId,
  type P1TaskId,
} from './learning-policy.ts';
import {
  deriveNodeLearningProjection,
  type EvidenceReviewState,
  type PrerequisiteCondition,
  type PrerequisiteProgress,
} from './learning-projection.ts';
import {
  calculateProjectCompositeScore,
  calculateTaskCompositeScore,
  type TaskScoreProjection,
} from './learning-mastery.ts';
import {
  LearningRepository,
  type StoredFormalAttempt,
  type StoredFrozenTaskScore,
  type StoredLearningEvent,
  type StoredOutputReview,
  type StoredProfessionalOutput,
  type StudentLearningFacts,
} from './learning-repository.ts';

export const REQUIRED_SELF_STUDY_SECTIONS = [
  'understand',
  'evidence',
  'explain',
  'practice',
] as const;

export interface FormalAttemptProjection {
  attemptId: string;
  nodeId: string;
  gameId?: string;
  score: number;
  durationSeconds?: number;
  mistakeKnowledgePointIds: string[];
  completedAt: string;
}

export interface NodeEvidenceProjection {
  outputId: string;
  taskId: P1TaskId;
  nodeId: string;
  status: StoredProfessionalOutput['status'];
  content: unknown;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
  version?: number;
  stateRevision?: number;
}

export interface OutputReviewProjection {
  reviewId: string;
  outputId: string;
  status: StoredOutputReview['status'];
  score?: number;
  feedback?: string;
  reviewedAt: string;
}

export interface NodePrerequisiteProjection {
  nodeId: string;
  condition: PrerequisiteCondition;
  state: NodeLearningState;
  met: boolean;
}

export interface StudentNodeLearningSnapshot {
  nodeId: P1NodeId;
  state: NodeLearningState;
  stateTrail: NodeLearningState[];
  completedSections: string[];
  classroomSubmitted: boolean;
  attempts: FormalAttemptProjection[];
  evidence?: NodeEvidenceProjection;
  review?: OutputReviewProjection;
  prerequisites: NodePrerequisiteProjection[];
  bestFormalScore?: number;
  nextRequirement: string;
}

export interface StudentLearningSnapshot {
  version: number;
  globalVersion: number;
  studentId: string;
  nodes: StudentNodeLearningSnapshot[];
  tasks: Array<TaskScoreProjection & { taskId: P1TaskId }>;
  projectCompositeScore?: number;
}

export interface ClassLearningSnapshot {
  classId: string;
  version: number;
  students: StudentLearningSnapshot[];
}

export class LearningReadModel {
  private readonly repository: LearningRepository;

  constructor(repository: LearningRepository) {
    this.repository = repository;
  }

  readStudentSnapshot(studentId: string): StudentLearningSnapshot {
    return projectStudentLearningFacts(this.repository.readStudentFacts(studentId));
  }

  readClassSnapshot(teacherId: string, classId: string): ClassLearningSnapshot {
    const facts = this.repository.readClassStudentFacts(teacherId, classId);
    const students = facts.students.map(projectStudentLearningFacts);
    return { classId, version: facts.globalVersion, students };
  }
}

function projectStudentLearningFacts(facts: StudentLearningFacts): StudentLearningSnapshot {
  const snapshots = new Map<string, StudentNodeLearningSnapshot>();

  for (const policy of nodeLearningPolicies) {
    const events = facts.events.filter(({ nodeId }) => nodeId === policy.nodeId);
    const storedAttempts = facts.attempts.filter(({ nodeId }) => nodeId === policy.nodeId);
    const attempts = storedAttempts.map(toAttemptProjection);
    const sections = completedSections(events);
    const classroomSubmitted = events.some(isCompletedClassroomSubmission);
    const evidence = latestOutputForNode(facts.outputs, policy.nodeId);
    const storedReview = evidence ? latestReviewForOutput(facts.reviews, evidence.outputId) : undefined;
    const review = storedReview ? toReviewProjection(storedReview) : undefined;
    const prerequisites = policy.prerequisites.map((prerequisite): NodePrerequisiteProjection => {
      const prior = snapshots.get(prerequisite.nodeId);
      return {
        nodeId: prerequisite.nodeId,
        condition: prerequisite.condition,
        state: prior?.state ?? 'locked',
        met: prerequisiteMet(prior),
      };
    });
    const prerequisiteProgress: PrerequisiteProgress[] = prerequisites.map((prerequisite) => {
      const prior = snapshots.get(prerequisite.nodeId);
      return {
        nodeId: prerequisite.nodeId,
        achieved: prior?.state === 'achieved',
        formalTestPassed: prior?.stateTrail.includes('formal-test-passed') ?? false,
        professionalOutputSubmitted: prior?.stateTrail.includes('evidence-submitted') ?? false,
      };
    });
    const bestFormalScore = storedAttempts.length
      ? Math.max(...storedAttempts.map(({ score }) => score))
      : undefined;
    const projection = deriveNodeLearningProjection(policy, {
      hasActivity: events.length > 0 || storedAttempts.length > 0 || evidence !== undefined,
      microPracticePassed: events.some(isMicroPracticePass)
        || REQUIRED_SELF_STUDY_SECTIONS.every((sectionId) => sections.includes(sectionId)),
      bestFormalTestScore: bestFormalScore,
      evidenceReviewStatus: evidenceReviewState(evidence, review),
    }, prerequisiteProgress);
    const node: StudentNodeLearningSnapshot = {
      nodeId: policy.nodeId,
      state: projection.state,
      stateTrail: projection.stateTrail,
      completedSections: sections,
      classroomSubmitted,
      attempts,
      ...(evidence ? { evidence: toEvidenceProjection(evidence, policy.taskId) } : {}),
      ...(review ? { review } : {}),
      prerequisites,
      ...(bestFormalScore === undefined ? {} : { bestFormalScore }),
      nextRequirement: projection.nextRequirement,
    };
    snapshots.set(policy.nodeId, node);
  }

  const nodes = nodeLearningPolicies.map(({ nodeId }) => requiredSnapshot(snapshots, nodeId));
  const taskIds: P1TaskId[] = ['P01', 'P02', 'P03'];
  const tasks = taskIds.map((taskId) => {
    const taskPolicies = nodeLearningPolicies.filter((policy) => policy.taskId === taskId);
    const testNodeIds = new Set(taskPolicies
      .filter(({ assessmentRole }) => assessmentRole === 'node-test')
      .map(({ nodeId }) => nodeId));
    const scores = facts.attempts
      .filter(({ nodeId }) => testNodeIds.has(nodeId as P1NodeId))
      .map(({ score }) => score);
    const nodeTestHighestScore = scores.length ? Math.max(...scores) : undefined;
    const outputPolicy = taskPolicies.find(({ requiresProfessionalOutput }) => requiresProfessionalOutput);
    const output = outputPolicy ? latestOutputForNode(facts.outputs, outputPolicy.nodeId) : undefined;
    const outputReview = output ? latestReviewForOutput(facts.reviews, output.outputId) : undefined;
    const outputRubricScore = output?.status === 'verified'
      && outputReview?.status === 'verified'
      && outputReview.score !== undefined
      ? outputReview.score
      : undefined;
    const scoreProjection = calculateTaskCompositeScore({ nodeTestHighestScore, outputRubricScore });
    const frozenScore = latestFrozenTaskScoreForTask(facts.frozenTaskScores, taskId);
    return {
      taskId,
      nodeTestHighestScore: scoreProjection.nodeTestHighestScore,
      outputRubricScore: scoreProjection.outputRubricScore,
      ...(frozenScore?.officialScore === undefined
        ? {}
        : { taskCompositeScore: frozenScore.officialScore }),
    };
  });

  return {
    version: facts.version,
    globalVersion: facts.globalVersion,
    studentId: facts.studentId,
    nodes,
    tasks,
    projectCompositeScore: calculateProjectCompositeScore(tasks.map(({ taskCompositeScore }) => taskCompositeScore)),
  };
}

function toAttemptProjection(attempt: StoredFormalAttempt): FormalAttemptProjection {
  return {
    attemptId: attempt.attemptId,
    nodeId: attempt.nodeId,
    ...(attempt.gameId === undefined ? {} : { gameId: attempt.gameId }),
    score: attempt.score,
    ...(attempt.durationSeconds === undefined ? {} : { durationSeconds: attempt.durationSeconds }),
    mistakeKnowledgePointIds: attempt.mistakeKnowledgePointIds,
    completedAt: attempt.completedAt,
  };
}

function toEvidenceProjection(output: StoredProfessionalOutput, taskId: P1TaskId): NodeEvidenceProjection {
  return {
    outputId: output.outputId,
    taskId,
    nodeId: output.nodeId,
    status: output.status,
    ...(output.currentVersion > 0 ? { version: output.currentVersion } : {}),
    stateRevision: output.stateRevision,
    content: output.content,
    ...(output.submittedAt === undefined ? {} : { submittedAt: output.submittedAt }),
    createdAt: output.createdAt,
    updatedAt: output.updatedAt,
  };
}

function latestFrozenTaskScoreForTask(
  scores: StoredFrozenTaskScore[],
  taskId: P1TaskId,
): StoredFrozenTaskScore | undefined {
  return scores.filter((score) => canonicalFrozenTaskId(score.taskId) === taskId).at(-1);
}

function canonicalFrozenTaskId(taskId: string): P1TaskId | undefined {
  const aliases: Record<string, P1TaskId> = {
    P01: 'P01',
    P02: 'P02',
    P03: 'P03',
    P1T1: 'P01',
    P1T2: 'P02',
    P1T3: 'P03',
  };
  return aliases[taskId];
}

function toReviewProjection(review: StoredOutputReview): OutputReviewProjection {
  return {
    reviewId: review.reviewId,
    outputId: review.outputId,
    status: review.status,
    ...(review.score === undefined ? {} : { score: review.score }),
    ...(review.feedback === undefined ? {} : { feedback: review.feedback }),
    reviewedAt: review.reviewedAt,
  };
}

function latestOutputForNode(outputs: StoredProfessionalOutput[], nodeId: string): StoredProfessionalOutput | undefined {
  return outputs.filter((output) => output.nodeId === nodeId).at(-1);
}

function latestReviewForOutput(reviews: StoredOutputReview[], outputId: string): StoredOutputReview | undefined {
  return reviews.filter((review) => review.outputId === outputId).at(-1);
}

function evidenceReviewState(
  output: StoredProfessionalOutput | undefined,
  review: OutputReviewProjection | undefined,
): EvidenceReviewState {
  if (!output || output.status === 'draft') return 'not-submitted';
  if (review?.status === 'verified' && output.status === 'verified') return 'verified';
  if (review?.status === 'returned' || output.status === 'returned') return 'returned';
  return 'submitted';
}

function prerequisiteMet(prior: StudentNodeLearningSnapshot | undefined): boolean {
  return prior?.state === 'achieved';
}

function isMicroPracticePass(event: StoredLearningEvent): boolean {
  if (event.eventType === 'micro_practice_passed') return true;
  if (event.eventType === 'game_completed') {
    return isRecord(event.payload)
      && event.payload.completed === true
      && event.payload.formal === false;
  }
  return isCompletedClassroomSubmission(event);
}

function isCompletedClassroomSubmission(event: StoredLearningEvent): boolean {
  return ['classroom_submitted', 'classroom_activity_submitted'].includes(event.eventType)
    && isRecord(event.payload)
    && event.payload.completed === true;
}

function completedSections(events: StoredLearningEvent[]): string[] {
  const completed = new Set(events.flatMap((event) => {
    if (event.eventType !== 'section_completed' || !isRecord(event.payload)) return [];
    const sectionId = event.payload.sectionId;
    return event.payload.completed === true
      && typeof sectionId === 'string'
      && sectionId.trim().length > 0
      ? [sectionId]
      : [];
  }));
  const required = REQUIRED_SELF_STUDY_SECTIONS.filter((sectionId) => completed.delete(sectionId));
  return [...required, ...completed];
}

function requiredSnapshot(
  snapshots: Map<string, StudentNodeLearningSnapshot>,
  nodeId: P1NodeId,
): StudentNodeLearningSnapshot {
  const snapshot = snapshots.get(nodeId);
  if (!snapshot || !getNodeLearningPolicy(nodeId)) throw new Error(`Missing canonical learning snapshot for ${nodeId}.`);
  return snapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

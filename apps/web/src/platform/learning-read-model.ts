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
  type NodeStateAxes,
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
  type StoredPracticeAttempt,
  type StoredProfessionalOutput,
  type StudentLearningFacts,
} from './learning-repository.ts';
import type { LearningOrigin } from './learning-origin.ts';
import {
  getFormalAssessmentDefinitionByVersion,
  getFormalAssessmentValidationPolicy,
} from './formal-assessment-catalog.server.ts';
import { validatePersistedAssessmentDiagnostic } from './persisted-assessment-diagnostic.ts';
import { currentUserFormalAssessmentState } from './formal-assessment-state-projection.ts';
import {
  currentOutputState,
  hasValidPrerequisiteOutputSubmission,
  hasValidUserOutputSubmission,
} from './bound-output-submission.ts';

export const REQUIRED_SELF_STUDY_SECTIONS = [
  'problem',
  'figure',
  'steps',
  'correction',
] as const;

export interface FormalAttemptProjection {
  attemptId: string;
  nodeId: string;
  assessmentId?: string;
  gameId?: string;
  score: number;
  durationSeconds?: number;
  mistakeKnowledgePointIds: string[];
  completedAt: string;
  questionVersion?: string;
  answers?: unknown;
  diagnostics?: unknown;
  origin?: LearningOrigin;
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
  origin?: LearningOrigin;
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
  outputVersion?: number;
  origin?: LearningOrigin;
}

export interface NodePrerequisiteProjection {
  nodeId: string;
  condition: PrerequisiteCondition;
  state: NodeLearningState;
  met: boolean;
}

export interface StudentNodeLearningSnapshot {
  nodeId: P1NodeId;
  axes: NodeStateAxes;
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
  taskAdvanceReady: boolean;
  origin?: LearningOrigin;
}

export interface StudentLearningSnapshot {
  version: number;
  globalVersion: number;
  studentId: string;
  nodes: StudentNodeLearningSnapshot[];
  tasks: StudentTaskLearningSnapshot[];
  projectCompositeScore?: number;
  projectCompositeOrigin?: LearningOrigin;
}

export interface StudentTaskLearningSnapshot extends TaskScoreProjection {
  taskId: P1TaskId;
  origin?: LearningOrigin;
  realTaskCertified: boolean;
  demoTaskCertified: boolean;
  frozenFormalAttemptId?: string;
  frozenFormalScore?: number;
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
    const userEvents = facts.events.filter((event) => (
      event.nodeId === policy.nodeId && event.origin === 'user'
    ));
    const progressEvents = userEvents.filter(({ eventType }) => eventType !== 'micro_practice_passed');
    const practiceAttempts = preferUserOrigin(
      facts.practiceAttempts.filter(({ nodeId }) => nodeId === policy.nodeId),
    );
    const userPracticeAttempts = facts.practiceAttempts.filter((attempt) => (
      attempt.nodeId === policy.nodeId && attempt.origin === 'user'
    ));
    const storedAttempts = preferUserOrigin(facts.attempts.filter(({ nodeId }) => nodeId === policy.nodeId));
    const validUserAttempts = validUserFormalAttempts(facts.attempts, policy.nodeId);
    const attempts = storedAttempts.map(toAttemptProjection);
    const sections = completedSections(progressEvents);
    const classroomSubmitted = practiceAttempts.some(
      ({ deliveryChannel }) => deliveryChannel === 'classroom',
    );
    const evidence = latestOutputForNode(facts, policy.taskId, policy.nodeId);
    const storedReview = evidence
      ? latestReviewForOutput(facts.reviews, evidence)
      : undefined;
    const review = storedReview ? toReviewProjection(storedReview) : undefined;
    const userEvidence = latestOutputForNode(
      facts,
      policy.taskId,
      policy.nodeId,
      'user',
    );
    const userStoredReview = userEvidence
      ? latestReviewForOutput(facts.reviews, userEvidence)
      : undefined;
    const userReview = userStoredReview ? toReviewProjection(userStoredReview) : undefined;
    const taskTestNodeId = nodeLearningPolicies.find((candidate) => (
      candidate.taskId === policy.taskId && candidate.assessmentRole === 'node-test'
    ))?.nodeId;
    const nodeCertification = policy.requiresTeacherVerification
      ? findCertifiedTaskScore({
          facts,
          taskId: policy.taskId,
          testNodeId: taskTestNodeId,
          outputNodeId: policy.nodeId,
          output: userEvidence,
          outputReview: userStoredReview,
        })
      : undefined;
    const prerequisites = policy.prerequisites.map((prerequisite): NodePrerequisiteProjection => {
      const prior = snapshots.get(prerequisite.nodeId);
      const progress = prerequisiteProgressForNode(facts, prerequisite.nodeId);
      return {
        nodeId: prerequisite.nodeId,
        condition: prerequisite.condition,
        state: prior?.state ?? 'locked',
        met: prerequisiteFactMet(prerequisite.condition, progress),
      };
    });
    const prerequisiteProgress: PrerequisiteProgress[] = [...new Set(
      policy.prerequisites.map(({ nodeId }) => nodeId),
    )].map((nodeId) => prerequisiteProgressForNode(facts, nodeId));
    const bestFormalScore = validUserAttempts.length
      ? Math.max(...validUserAttempts.map(({ score }) => score))
      : undefined;
    const projection = deriveNodeLearningProjection(policy, {
      hasActivity: progressEvents.length > 0 || userPracticeAttempts.length > 0
        || validUserAttempts.length > 0 || userEvidence !== undefined,
      microPracticePassed: microPracticePassed(policy.requiredActivityIds, userPracticeAttempts),
      bestFormalTestScore: bestFormalScore,
      evidenceReviewStatus: evidenceReviewState(userEvidence, userReview),
      formalAssessmentState: currentUserFormalAssessmentState(
        facts.assessmentInstances,
        policy.nodeId,
      ),
      outputState: currentOutputState(
        facts,
        policy.taskId,
        policy.nodeId,
        userEvidence,
        userReview,
      ),
      teacherVerified: nodeCertification?.origin === 'user',
    }, prerequisiteProgress);
    const prerequisiteOriginFacts = prerequisites.flatMap((prerequisite) => {
      if (!prerequisite.met) return [];
      const prerequisiteOrigin = snapshots.get(prerequisite.nodeId)?.origin;
      return prerequisiteOrigin ? [{ origin: prerequisiteOrigin }] : [];
    });
    const passedPracticeFacts = policy.requiredActivityIds.flatMap((activityId) => (
      userPracticeAttempts.filter((attempt) => attempt.activityId === activityId && attempt.passed)
    ));
    const milestoneOriginGroups: Array<Array<{ origin: LearningOrigin }>> = [
      prerequisiteOriginFacts,
      passedPracticeFacts,
    ];
    if (projection.stateTrail.includes('formal-test-passed')) {
      milestoneOriginGroups.push(validUserAttempts.filter((attempt) => (
        attempt.score >= (policy.formalPassScore ?? Number.POSITIVE_INFINITY)
      )));
    }
    if (projection.stateTrail.includes('evidence-submitted') && evidence) {
      milestoneOriginGroups.push([evidence]);
    }
    if ((projection.state === 'returned' || projection.stateTrail.includes('teacher-verified')) && storedReview) {
      milestoneOriginGroups.push([storedReview]);
    }
    const origin = projection.state === 'locked'
      ? undefined
      : projection.state === 'learning'
        ? activeOrigin(
            prerequisiteOriginFacts,
            progressEvents,
            practiceAttempts,
            storedAttempts,
            evidence ? [evidence] : [],
            storedReview ? [storedReview] : [],
          )
        : activeOrigin(...milestoneOriginGroups);
    const node: StudentNodeLearningSnapshot = {
      nodeId: policy.nodeId,
      axes: projection.axes,
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
      taskAdvanceReady: hasValidUserOutputSubmission(facts, policy.taskId, policy.nodeId),
      ...(origin ? { origin } : {}),
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
    const taskAttempts = [...testNodeIds].flatMap((nodeId) => (
      preferUserOrigin(validFormalAttempts(
        facts.attempts.filter(({ studentId }) => studentId === facts.studentId),
        nodeId,
      ))
    ));
    const scores = taskAttempts.map(({ score }) => score);
    const nodeTestHighestScore = scores.length ? Math.max(...scores) : undefined;
    const nodeTestScoreOrigin = activeOrigin(taskAttempts);
    const outputPolicy = taskPolicies.find(({ requiresProfessionalOutput }) => requiresProfessionalOutput);
    const output = outputPolicy
      ? latestOutputForNode(facts, taskId, outputPolicy.nodeId)
      : undefined;
    const outputReview = output
      ? latestReviewForOutput(facts.reviews, output)
      : undefined;
    const outputRubricScore = output?.status === 'verified'
      && outputReview?.status === 'verified'
      && outputReview.score !== undefined
      ? outputReview.score
      : undefined;
    const scoreProjection = calculateTaskCompositeScore({ nodeTestHighestScore, outputRubricScore });
    const certification = findCertifiedTaskScore({
      facts,
      taskId,
      testNodeId: [...testNodeIds][0],
      outputNodeId: outputPolicy?.nodeId,
      output,
      outputReview,
    });
    const taskScoreOrigin = certification?.origin ?? nodeTestScoreOrigin;
    return {
      taskId,
      nodeTestHighestScore: scoreProjection.nodeTestHighestScore,
      outputRubricScore: scoreProjection.outputRubricScore,
      ...(certification === undefined
        ? {}
        : {
          taskCompositeScore: certification.taskCompositeScore,
          frozenFormalAttemptId: certification.attemptId,
          frozenFormalScore: certification.formalScore,
        }),
      ...(taskScoreOrigin === undefined ? {} : { origin: taskScoreOrigin }),
      realTaskCertified: certification?.origin === 'user',
      demoTaskCertified: certification?.origin === 'demo',
    };
  });

  const projectCompositeScore = calculateProjectCompositeScore(
    tasks.map(({ taskCompositeScore }) => taskCompositeScore),
  );
  return {
    version: facts.version,
    globalVersion: facts.globalVersion,
    studentId: facts.studentId,
    nodes,
    tasks,
    projectCompositeScore,
    ...(projectCompositeScore === undefined ? {} : {
      projectCompositeOrigin: tasks.every(({ origin }) => origin === 'user') ? 'user' : 'demo',
    }),
  };
}

function toAttemptProjection(attempt: StoredFormalAttempt): FormalAttemptProjection {
  return {
    attemptId: attempt.attemptId,
    nodeId: attempt.nodeId,
    ...(attempt.assessmentId === undefined ? {} : { assessmentId: attempt.assessmentId }),
    ...(attempt.gameId === undefined ? {} : { gameId: attempt.gameId }),
    score: attempt.score,
    ...(attempt.durationSeconds === undefined ? {} : { durationSeconds: attempt.durationSeconds }),
    mistakeKnowledgePointIds: attempt.mistakeKnowledgePointIds,
    completedAt: attempt.completedAt,
    ...(attempt.questionVersion === undefined ? {} : { questionVersion: attempt.questionVersion }),
    answers: attempt.answers,
    diagnostics: attempt.diagnostics,
    origin: attempt.origin,
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
    origin: output.origin,
  };
}

interface CertifiedTaskScore {
  origin: LearningOrigin;
  attemptId: string;
  formalScore: number;
  taskCompositeScore: number;
}

function findCertifiedTaskScore({
  facts,
  taskId,
  testNodeId,
  outputNodeId,
  output,
  outputReview,
}: {
  facts: StudentLearningFacts;
  taskId: P1TaskId;
  testNodeId: P1NodeId | undefined;
  outputNodeId: P1NodeId | undefined;
  output: StoredProfessionalOutput | undefined;
  outputReview: StoredOutputReview | undefined;
}): CertifiedTaskScore | undefined {
  if (
    !testNodeId
    || !outputNodeId
    || !output
    || output.studentId !== facts.studentId
    || output.taskId !== taskId
    || output.nodeId !== outputNodeId
    || output.status !== 'verified'
    || !outputReview
    || outputReview.outputId !== output.outputId
    || outputReview.status !== 'verified'
    || outputReview.outputVersion !== output.currentVersion
    || outputReview.score === undefined
    || output.origin !== outputReview.origin
    || !facts.outputVersions.some((version) => (
      version.outputId === output.outputId
      && version.taskId === taskId
      && version.version === output.currentVersion
    ))
  ) return undefined;

  const policy = getFormalAssessmentValidationPolicy(testNodeId);
  if (!policy) return undefined;
  const candidates = facts.frozenTaskScores
    .filter((score) => score.studentId === facts.studentId && score.taskId === taskId)
    .slice()
    .reverse();
  for (const frozen of candidates) {
    if (frozen.origin !== output.origin || frozen.officialScore === undefined) continue;
    const details = isRecord(frozen.details) ? frozen.details : undefined;
    const testDetails = details && isRecord(details.test) ? details.test : undefined;
    const outputDetails = details && isRecord(details.output) ? details.output : undefined;
    const attemptId = stringValue(details?.nodeTestAttemptId) ?? stringValue(details?.attemptId);
    const attempt = attemptId
      ? facts.attempts.find((candidate) => candidate.attemptId === attemptId)
      : undefined;
    if (
      !details
      || !attempt
      || attempt.studentId !== facts.studentId
      || attempt.origin !== frozen.origin
    ) continue;
    const validated = validatePersistedAssessmentDiagnostic({
      attemptId: attempt.attemptId,
      studentId: attempt.studentId,
      nodeId: attempt.nodeId,
      assessmentId: attempt.assessmentId ?? null,
      gameId: attempt.gameId ?? null,
      questionVersion: attempt.questionVersion ?? null,
      score: attempt.score,
      diagnosticsJson: serializeDiagnostic(attempt.diagnostics),
      origin: attempt.origin,
      completedAt: attempt.completedAt,
      instanceAssessmentId: attempt.instanceAssessmentId ?? null,
      instanceNodeId: attempt.instanceNodeId ?? null,
      instanceGameId: attempt.instanceGameId ?? null,
      instanceQuestionVersion: attempt.instanceQuestionVersion ?? null,
      instanceStatus: attempt.instanceStatus ?? null,
    }, policy);
    const taskCompositeScore = numberValue(details.taskCompositeScore);
    const frozenNodeId = stringValue(testDetails?.nodeId) ?? stringValue(details.nodeId);
    const frozenGameId = stringValue(testDetails?.gameId);
    const frozenFormalScore = numberValue(testDetails?.score)
      ?? numberValue(details.nodeTestHighestScore);
    const frozenOutputId = stringValue(outputDetails?.outputId) ?? stringValue(details.outputId);
    const frozenOutputVersion = numberValue(outputDetails?.version)
      ?? numberValue(details.outputVersion);
    const frozenRubricScore = numberValue(outputDetails?.rubricScore)
      ?? numberValue(details.outputRubricScore);
    const frozenReviewId = stringValue(details.reviewId);
    const formulaVersion = stringValue(details.formulaVersion);
    const expectedComposite = calculateTaskCompositeScore({
      nodeTestHighestScore: validated?.totalScore,
      outputRubricScore: outputReview.score,
    }).taskCompositeScore;
    const catalogDefinition = validated
      ? getFormalAssessmentDefinitionByVersion(validated.nodeId, validated.questionVersion)
      : undefined;
    if (
      !validated?.passed
      || (frozen.origin === 'user' && catalogDefinition?.gameId !== validated.gameId)
      || validated.nodeId !== testNodeId
      || frozenNodeId !== testNodeId
      || (frozenGameId !== undefined && frozenGameId !== validated.gameId)
      || details.assessmentId !== validated.assessmentId
      || details.questionVersion !== validated.questionVersion
      || frozenFormalScore !== validated.totalScore
      || frozenOutputId !== output.outputId
      || frozenOutputVersion !== output.currentVersion
      || frozenRubricScore !== outputReview.score
      || (frozen.origin === 'user'
        ? frozenReviewId !== outputReview.reviewId
        : frozenReviewId !== undefined && frozenReviewId !== outputReview.reviewId)
      || (frozen.origin === 'user'
        ? formulaVersion !== 'task-score-40-60-v1'
        : formulaVersion !== undefined && formulaVersion !== 'task-score-40-60-v1')
      || taskCompositeScore === undefined
      || expectedComposite !== taskCompositeScore
      || frozen.provisionalScore !== taskCompositeScore
      || frozen.officialScore !== taskCompositeScore
    ) continue;
    return {
      origin: frozen.origin,
      attemptId: validated.attemptId,
      formalScore: validated.totalScore,
      taskCompositeScore,
    };
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function serializeDiagnostic(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
}

function toReviewProjection(review: StoredOutputReview): OutputReviewProjection {
  return {
    reviewId: review.reviewId,
    outputId: review.outputId,
    status: review.status,
    ...(review.score === undefined ? {} : { score: review.score }),
    ...(review.feedback === undefined ? {} : { feedback: review.feedback }),
    reviewedAt: review.reviewedAt,
    ...(review.outputVersion === undefined ? {} : { outputVersion: review.outputVersion }),
    origin: review.origin,
  };
}

function latestOutputForNode(
  facts: StudentLearningFacts,
  taskId: P1TaskId,
  nodeId: string,
  origin?: LearningOrigin,
): StoredProfessionalOutput | undefined {
  const outputs = facts.outputs.filter((output) => (
    output.studentId === facts.studentId
    && output.taskId === taskId
    && output.nodeId === nodeId
    && (origin === undefined || output.origin === origin)
  ));
  return preferUserOrigin(outputs).at(-1);
}

function latestReviewForOutput(
  reviews: StoredOutputReview[],
  output: StoredProfessionalOutput,
): StoredOutputReview | undefined {
  return reviews.filter((review) => (
    review.outputId === output.outputId
    && review.origin === output.origin
    && review.outputVersion === output.currentVersion
  )).at(-1);
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

function prerequisiteProgressForNode(
  facts: StudentLearningFacts,
  nodeId: string,
): PrerequisiteProgress {
  const policy = getNodeLearningPolicy(nodeId);
  const prerequisitePracticeAttempts = facts.practiceAttempts.filter((attempt) => (
    attempt.nodeId === nodeId
  ));
  const prerequisiteFormalAttempts = validFormalAttempts(facts.attempts, nodeId);
  const professionalOutputSubmittedOnce = policy
    ? hasValidPrerequisiteOutputSubmission(facts, policy.taskId, nodeId)
    : false;
  const output = policy
    ? latestOutputForNode(facts, policy.taskId, nodeId, 'user')
    : undefined;
  const review = output
    ? latestReviewForOutput(facts.reviews, output)
    : undefined;
  const testNodeId = policy
    ? nodeLearningPolicies.find((candidate) => (
        candidate.taskId === policy.taskId && candidate.assessmentRole === 'node-test'
      ))?.nodeId
    : undefined;
  return {
    nodeId,
    microPracticePassed: policy
      ? microPracticePassed(policy.requiredActivityIds, prerequisitePracticeAttempts)
      : false,
    formalTestPassed: policy?.requiresFormalTest === true
      && prerequisiteFormalAttempts.some(({ score }) => score >= (policy.formalPassScore ?? 80)),
    professionalOutputSubmittedOnce,
    teacherVerified: policy !== undefined && findCertifiedTaskScore({
      facts,
      taskId: policy.taskId,
      testNodeId,
      outputNodeId: policy.nodeId,
      output,
      outputReview: review,
    })?.origin === 'user',
  };
}

function prerequisiteFactMet(
  condition: PrerequisiteCondition,
  progress: PrerequisiteProgress,
): boolean {
  switch (condition) {
    case 'micro-practice-passed':
      return progress.microPracticePassed;
    case 'formal-test-passed':
      return progress.formalTestPassed;
    case 'professional-output-submitted-once':
      return progress.professionalOutputSubmittedOnce;
    case 'teacher-verified':
      return progress.teacherVerified;
  }
}

function validUserFormalAttempts(
  attempts: StoredFormalAttempt[],
  nodeId: string,
): StoredFormalAttempt[] {
  return validFormalAttempts(attempts, nodeId).filter(({ origin }) => origin === 'user');
}

function validFormalAttempts(
  attempts: StoredFormalAttempt[],
  nodeId: string,
): StoredFormalAttempt[] {
  const validationPolicy = getFormalAssessmentValidationPolicy(nodeId);
  if (!validationPolicy) return [];
  return attempts.filter((attempt) => {
    if (attempt.nodeId !== nodeId) return false;
    const validated = validatePersistedAssessmentDiagnostic({
      attemptId: attempt.attemptId,
      studentId: attempt.studentId,
      nodeId: attempt.nodeId,
      assessmentId: attempt.assessmentId ?? null,
      gameId: attempt.gameId ?? null,
      questionVersion: attempt.questionVersion ?? null,
      score: attempt.score,
      diagnosticsJson: serializeDiagnostic(attempt.diagnostics),
      origin: attempt.origin,
      completedAt: attempt.completedAt,
      instanceAssessmentId: attempt.instanceAssessmentId ?? null,
      instanceNodeId: attempt.instanceNodeId ?? null,
      instanceGameId: attempt.instanceGameId ?? null,
      instanceQuestionVersion: attempt.instanceQuestionVersion ?? null,
      instanceStatus: attempt.instanceStatus ?? null,
    }, validationPolicy);
    if (!validated) return false;
    const definition = getFormalAssessmentDefinitionByVersion(
      validated.nodeId,
      validated.questionVersion,
    );
    return attempt.origin === 'demo' || definition?.gameId === validated.gameId;
  });
}

function microPracticePassed(
  requiredActivityIds: readonly string[],
  attempts: StoredPracticeAttempt[],
): boolean {
  if (requiredActivityIds.length === 0) return false;
  return requiredActivityIds.every((activityId) => attempts.some((attempt) => (
    attempt.activityId === activityId && attempt.passed
  )));
}

function preferUserOrigin<Value extends { origin: LearningOrigin }>(facts: Value[]): Value[] {
  return facts.some(({ origin }) => origin === 'user')
    ? facts.filter(({ origin }) => origin === 'user')
    : facts;
}

function activeOrigin(
  ...groups: Array<Array<{ origin: LearningOrigin }>>
): LearningOrigin | undefined {
  const facts = groups.flat();
  if (facts.length === 0) return undefined;
  return facts.every(({ origin }) => origin === 'user') ? 'user' : 'demo';
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

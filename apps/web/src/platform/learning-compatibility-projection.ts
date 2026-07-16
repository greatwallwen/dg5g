import type { NodeLearningState, SkillProgress, TaskMasteryProgress } from './models.ts';
import type { LearningOrigin } from './learning-origin.ts';
import { nodeLearningStateCompletionPercent } from './learning-status.ts';
import { getNodeLearningPolicy, nodeLearningPolicies } from './learning-policy.ts';
import {
  REQUIRED_SELF_STUDY_SECTIONS,
  type StudentLearningSnapshot,
  type StudentNodeLearningSnapshot,
} from './learning-read-model.ts';

export interface LearningProgressSnapshot {
  version: number;
  globalVersion: number;
  studentId: string;
  progress: SkillProgress[];
  tasks: TaskMasteryProgress[];
  projectCompositeScore?: number;
  projectCompositeOrigin?: LearningOrigin;
}

export function projectStudentLearningSnapshot(snapshot: StudentLearningSnapshot): LearningProgressSnapshot {
  return {
    version: snapshot.version,
    globalVersion: snapshot.globalVersion,
    studentId: snapshot.studentId,
    progress: snapshot.nodes.map((node) => projectSkillProgress(snapshot.studentId, node)),
    tasks: snapshot.tasks.map((task) => projectTaskProgress(snapshot.studentId, task, snapshot.nodes)),
    ...(snapshot.projectCompositeScore === undefined ? {} : { projectCompositeScore: snapshot.projectCompositeScore }),
    ...(snapshot.projectCompositeOrigin ? { projectCompositeOrigin: snapshot.projectCompositeOrigin } : {}),
  };
}

export function completionPercentForState(state: NodeLearningState): number {
  return nodeLearningStateCompletionPercent[state];
}

function projectSkillProgress(studentId: string, node: StudentNodeLearningSnapshot): SkillProgress {
  const policy = getNodeLearningPolicy(node.nodeId);
  const attempts = node.attempts.map((attempt) => ({
    ...attempt,
    gameId: attempt.gameId ?? `${node.nodeId}-formal-test`,
    formal: true,
  }));
  const scores = attempts.map((attempt) => attempt.score);
  const bestFormalScore = node.bestFormalScore;
  const evidenceStatus = node.stateTrail.includes('teacher-verified')
    ? 'verified'
    : node.stateTrail.includes('returned')
      ? 'returned'
      : node.stateTrail.includes('evidence-submitted') ? 'submitted' : 'not-submitted';
  return {
    studentId,
    nodeId: node.nodeId,
    state: node.state === 'locked' ? 'locked' : node.state === 'available' ? 'available' : node.state === 'achieved' ? 'mastered' : 'learning',
    masteryPercent: nodeLearningStateCompletionPercent[node.state],
    completedSectionIds: node.completedSections,
    requiredSectionIds: [...REQUIRED_SELF_STUDY_SECTIONS],
    classroomSubmitted: node.classroomSubmitted,
    ...(bestFormalScore === undefined ? {} : { gameScore: bestFormalScore }),
    gameStars: bestFormalScore === undefined ? 0 : bestFormalScore >= 95 ? 3 : bestFormalScore >= 80 ? 2 : scores.length ? 1 : 0,
    mistakeKnowledgePointIds: attempts.at(-1)?.mistakeKnowledgePointIds ?? [],
    updatedAt: node.review?.reviewedAt ?? node.evidence?.updatedAt ?? attempts.at(-1)?.completedAt,
    achievementLevel: node.state === 'locked' ? 'locked' : node.state === 'available' ? 'available' : node.state === 'achieved' ? 'mastered' : 'learned',
    gameAttempts: attempts,
    firstGameScore: scores[0],
    bestGameScore: node.bestFormalScore,
    latestGameScore: scores.at(-1),
    attemptCount: attempts.length,
    evidenceSubmitted: evidenceStatus !== 'not-submitted',
    evidenceReviewStatus: evidenceStatus,
    evidenceText: evidenceText(node.evidence?.content),
    teacherFeedback: node.review?.feedback,
    teacherVerified: node.stateTrail.includes('teacher-verified'),
    learningState: node.state,
    learningStateTrail: node.stateTrail,
    microPracticePassed: policy?.requiresMicroPractice === true && node.stateTrail.includes('micro-practice-passed'),
    formalTestPassed: policy?.requiresFormalTest === true && node.stateTrail.includes('formal-test-passed'),
    prerequisiteNodeIds: node.prerequisites.map((item) => item.nodeId),
    requiresFormalTest: policy?.requiresFormalTest,
    requiresProfessionalOutput: policy?.requiresProfessionalOutput,
    requiresTeacherVerification: policy?.requiresTeacherVerification,
    professionalOutputId: node.evidence?.outputId,
    professionalOutputVersion: node.evidence?.version,
    ...(node.origin ? { origin: node.origin } : {}),
  };
}

function projectTaskProgress(
  studentId: string,
  task: StudentLearningSnapshot['tasks'][number],
  nodes: StudentNodeLearningSnapshot[],
): TaskMasteryProgress {
  const requiredNodeIds = nodeLearningPolicies
    .filter((policy) => policy.taskId === task.taskId)
    .map((policy) => policy.nodeId);
  const taskNodes = nodes.filter((node) => requiredNodeIds.includes(node.nodeId));
  const masteredNodeIds = taskNodes.filter((node) => node.state === 'achieved').map((node) => node.nodeId);
  const outputNode = taskNodes.find((node) => getNodeLearningPolicy(node.nodeId)?.requiresProfessionalOutput);
  const evidenceSubmitted = outputNode?.stateTrail.includes('evidence-submitted') ?? false;
  const teacherVerified = outputNode?.stateTrail.includes('teacher-verified') ?? false;
  const nodesComplete = masteredNodeIds.length === requiredNodeIds.length;
  const state = nodesComplete && teacherVerified
    ? 'verified'
    : evidenceSubmitted ? 'challenge-ready' : nodesComplete ? 'mastered' : 'learning';
  const masteryPercent = requiredNodeIds.length
    ? Math.round(taskNodes.reduce((sum, node) => sum + nodeLearningStateCompletionPercent[node.state], 0) / requiredNodeIds.length)
    : 0;
  return {
    studentId,
    taskId: task.taskId,
    state,
    masteredNodeIds,
    requiredNodeIds,
    ...(task.nodeTestHighestScore === undefined ? {} : { gameScore: task.nodeTestHighestScore }),
    evidenceSubmitted,
    teacherVerified,
    masteryPercent,
    taskScore: task.taskCompositeScore,
    nodeTestAverage: task.nodeTestHighestScore,
    professionalOutputScore: task.outputRubricScore,
    provisionalScore: task.taskCompositeScore,
    ...(teacherVerified && task.taskCompositeScore !== undefined
      ? { officialScore: task.taskCompositeScore }
      : {}),
    ...(task.origin ? { origin: task.origin } : {}),
  };
}

function evidenceText(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (!content || typeof content !== 'object') return undefined;
  const source = content as Record<string, unknown>;
  if (typeof source.evidenceText === 'string') return source.evidenceText;
  if (typeof source.text === 'string') return source.text;
  return undefined;
}

import { getDatabase, type AppDatabase } from './db/database.ts';
import { LearningReadModel, type StudentLearningSnapshot, type StudentNodeLearningSnapshot } from './learning-read-model.ts';
import { LearningRepository } from './learning-repository.ts';
import type { NodeLearningState } from './learning-status.ts';
import {
  loadP1DemoContent,
  type P1DemoContent,
  type P1NodeId,
  type P1TaskId,
} from '../features/platform/p1-content.ts';

export type TaskLearningState =
  | 'locked'
  | 'available'
  | 'learning'
  | 'output-pending'
  | 'verified'
  | 'complete';

export type ProfessionalOutputProjectionStatus =
  | 'not-started'
  | 'draft'
  | 'submitted'
  | 'returned'
  | 'verified';

export interface P1ProjectNodeProjection {
  nodeId: P1NodeId;
  title: string;
  goal: string;
  state: NodeLearningState;
  href?: string;
}

export interface P1ProjectTaskProjection {
  taskId: P1TaskId;
  runtimeTaskId: 'P1T1' | 'P1T2' | 'P1T3';
  title: string;
  why: string;
  taskOutputTitle: string;
  state: TaskLearningState;
  nodes: P1ProjectNodeProjection[];
  nextNodeId?: P1NodeId;
  outputStatus: ProfessionalOutputProjectionStatus;
  outputId?: string;
  currentOutputVersion?: number;
  teacherFeedback?: string;
  verifiedOutputReference?: {
    outputId: string;
    version: number;
  };
  nodeTestHighestScore?: number;
  outputRubricScore?: number;
  taskCompositeScore?: number;
}

export interface P1ProjectProjection {
  projectId: 'P1';
  projectTitle: string;
  finalOutputTitle: string;
  studentVersion: number;
  snapshotVersion: number;
  tasks: P1ProjectTaskProjection[];
  portfolioStatus: 'not-started' | 'collecting' | 'awaiting-review' | 'complete';
  projectCompositeScore?: number;
}

export function readP1ProjectProjection(
  studentId: string,
  database: AppDatabase = getDatabase(),
): P1ProjectProjection {
  const content = loadP1DemoContent();
  const learning = new LearningReadModel(new LearningRepository(database)).readStudentSnapshot(studentId);
  return projectP1Project(content, learning);
}

export function projectP1Project(
  content: P1DemoContent,
  learning: StudentLearningSnapshot,
): P1ProjectProjection {
  const nodesById = new Map(learning.nodes.map((node) => [node.nodeId, node]));
  const scoresByTask = new Map(learning.tasks.map((task) => [task.taskId, task]));
  const tasks = content.tasks.map((task): P1ProjectTaskProjection => {
    const nodes = task.nodes.map((definition): P1ProjectNodeProjection => {
      const snapshot = requiredNode(nodesById, definition.id);
      return {
        nodeId: definition.id,
        title: definition.title,
        goal: definition.goal,
        state: snapshot.state,
        ...(snapshot.state === 'locked' ? {} : { href: `/learn/${definition.id}` }),
      };
    });
    const outputNode = requiredNode(nodesById, task.nodes[3].id);
    const outputStatus = projectOutputStatus(outputNode);
    const outputId = outputNode.evidence?.outputId;
    const currentOutputVersion = outputNode.evidence?.version;
    const teacherFeedback = outputNode.review?.feedback;
    const verifiedOutputReference = outputStatus === 'verified'
      && outputId !== undefined
      && currentOutputVersion !== undefined
      ? { outputId, version: currentOutputVersion }
      : undefined;
    const taskScore = scoresByTask.get(task.taskId);
    const nextNode = nodes.find(({ state }) => state !== 'locked' && state !== 'achieved');

    return {
      taskId: task.taskId,
      runtimeTaskId: task.runtimeTaskId,
      title: task.title,
      why: task.why,
      taskOutputTitle: task.taskOutputTitle,
      state: projectTaskState(nodes, outputStatus),
      nodes,
      ...(nextNode ? { nextNodeId: nextNode.nodeId } : {}),
      outputStatus,
      ...(outputId === undefined ? {} : { outputId }),
      ...(currentOutputVersion === undefined ? {} : { currentOutputVersion }),
      ...(teacherFeedback === undefined ? {} : { teacherFeedback }),
      ...(verifiedOutputReference === undefined ? {} : { verifiedOutputReference }),
      ...(taskScore?.nodeTestHighestScore === undefined ? {} : { nodeTestHighestScore: taskScore.nodeTestHighestScore }),
      ...(taskScore?.outputRubricScore === undefined ? {} : { outputRubricScore: taskScore.outputRubricScore }),
      ...(taskScore?.taskCompositeScore === undefined ? {} : { taskCompositeScore: taskScore.taskCompositeScore }),
    };
  });

  return {
    projectId: 'P1',
    projectTitle: content.project.title,
    finalOutputTitle: content.project.finalOutput,
    studentVersion: learning.version,
    snapshotVersion: learning.globalVersion,
    tasks,
    portfolioStatus: projectPortfolioStatus(tasks),
    ...(learning.projectCompositeScore === undefined ? {} : { projectCompositeScore: learning.projectCompositeScore }),
  };
}

function requiredNode(
  snapshots: Map<P1NodeId, StudentNodeLearningSnapshot>,
  nodeId: P1NodeId,
): StudentNodeLearningSnapshot {
  const snapshot = snapshots.get(nodeId);
  if (!snapshot) throw new Error(`Missing learning snapshot for ${nodeId}.`);
  return snapshot;
}

function projectOutputStatus(node: StudentNodeLearningSnapshot): ProfessionalOutputProjectionStatus {
  if (!node.evidence) return 'not-started';
  if (node.evidence.status === 'returned') return 'returned';
  if (node.review?.status === 'verified' && node.evidence.status === 'verified') return 'verified';
  if (node.evidence.status === 'draft') return 'draft';
  return 'submitted';
}

function projectTaskState(
  nodes: P1ProjectNodeProjection[],
  outputStatus: ProfessionalOutputProjectionStatus,
): TaskLearningState {
  if (nodes.every(({ state }) => state === 'locked')) return 'locked';
  if (nodes.every(({ state }) => state === 'achieved')) return 'complete';
  if (outputStatus === 'verified') return 'verified';
  if (['draft', 'submitted', 'returned'].includes(outputStatus)) return 'output-pending';
  if (nodes.every(({ state }) => state === 'locked' || state === 'available')) return 'available';
  return 'learning';
}

function projectPortfolioStatus(
  tasks: P1ProjectTaskProjection[],
): P1ProjectProjection['portfolioStatus'] {
  if (tasks.every(({ verifiedOutputReference }) => verifiedOutputReference !== undefined)) return 'complete';
  if (tasks.some(({ outputStatus }) => outputStatus === 'submitted')) return 'awaiting-review';
  const hasActivity = tasks.some(({ nodes }) => nodes.some(
    ({ state }) => state !== 'locked' && state !== 'available',
  ));
  return hasActivity ? 'collecting' : 'not-started';
}

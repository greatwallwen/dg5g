import type { GraphAuthoritativeSnapshot } from '../../platform/authoritative-snapshot.ts';
import { nodeLearningPolicies, type P1NodeId, type P1TaskId } from '../../platform/learning-policy.ts';
import {
  nodeLearningStateCompletionPercent,
  type NodeLearningState,
} from '../../platform/learning-status.ts';
import { authoritativeDomFacts, type AuthoritativeDomFacts } from '../snapshot/snapshot-dom-facts.ts';
import type { LearningOrigin } from '../../platform/learning-origin.ts';
import type { NodeStateAxes } from '../../platform/learning-projection.ts';

export interface CanonicalGraphNodeProgress {
  nodeId: P1NodeId;
  access: NodeStateAxes['access'];
  axes: NodeStateAxes;
  learningState: NodeLearningState;
  stateCompletionPercent: number;
  nodeTestHighestScore?: number;
  nextRequirement: string;
  origin?: LearningOrigin;
}

export interface CanonicalGraphTaskProgress {
  taskId: P1TaskId;
  stateCompletionPercent: number;
  nodeTestHighestScore?: number;
  taskCompositeScore?: number;
  origin?: LearningOrigin;
}

export interface GraphSnapshotModel {
  mode: 'student' | 'teacher';
  authoritativeFacts: AuthoritativeDomFacts;
  snapshotVersion: number;
  sessionId: string;
  selectedNodeId?: P1NodeId;
  projectCompositeScore?: number;
  projectCompositeOrigin?: LearningOrigin;
  nodes: CanonicalGraphNodeProgress[];
  tasks: CanonicalGraphTaskProgress[];
  nodeHeatmap: Array<{
    nodeId: P1NodeId;
    stateCounts: Partial<Record<NodeLearningState, number>>;
  }>;
}

export function projectGraphSnapshot(snapshot: GraphAuthoritativeSnapshot): GraphSnapshotModel {
  const selectedNodeId = canonicalSelectedNode(snapshot.classroom.activeNodeId);
  if (snapshot.mode === 'student') {
    const nodes = snapshot.me.nodes.map((node): CanonicalGraphNodeProgress => ({
      nodeId: node.nodeId,
      access: node.axes.access,
      axes: node.axes,
      learningState: node.state,
      stateCompletionPercent: nodeLearningStateCompletionPercent[node.state],
      ...(node.nodeTestHighestScore === undefined ? {} : {
        nodeTestHighestScore: node.nodeTestHighestScore,
      }),
      nextRequirement: node.nextRequirement,
      ...(node.origin ? { origin: node.origin } : {}),
    }));
    return {
      mode: snapshot.mode,
      authoritativeFacts: authoritativeDomFacts(snapshot),
      snapshotVersion: snapshot.snapshotVersion,
      sessionId: snapshot.classroom.sessionId,
      selectedNodeId,
      ...(snapshot.me.projectCompositeScore === undefined ? {} : {
        projectCompositeScore: snapshot.me.projectCompositeScore,
      }),
      ...(snapshot.me.projectCompositeOrigin === undefined ? {} : {
        projectCompositeOrigin: snapshot.me.projectCompositeOrigin,
      }),
      nodes,
      tasks: snapshot.me.tasks.map((task): CanonicalGraphTaskProgress => ({
        taskId: task.taskId,
        stateCompletionPercent: task.stateCompletionPercent,
        ...(task.nodeTestHighestScore === undefined ? {} : {
          nodeTestHighestScore: task.nodeTestHighestScore,
        }),
        ...(task.taskCompositeScore === undefined ? {} : {
          taskCompositeScore: task.taskCompositeScore,
        }),
        ...(task.origin ? { origin: task.origin } : {}),
      })),
      nodeHeatmap: [],
    };
  }

  const nodes = nodeLearningPolicies.map((policy): CanonicalGraphNodeProgress => ({
    nodeId: policy.nodeId,
    access: 'open',
    axes: {
      access: 'open',
      learning: 'not-started',
      formalTest: policy.requiresFormalTest ? 'ready' : 'not-required',
      output: policy.requiresProfessionalOutput ? 'editing' : 'not-required',
      certification: 'not-reached',
    },
    learningState: 'available',
    stateCompletionPercent: nodeLearningStateCompletionPercent.available,
    nextRequirement: '选择节点进入授课',
  }));
  return {
    mode: snapshot.mode,
    authoritativeFacts: authoritativeDomFacts(snapshot),
    snapshotVersion: snapshot.snapshotVersion,
    sessionId: snapshot.classroom.sessionId,
    selectedNodeId,
    nodes,
    tasks: snapshot.tasks,
    nodeHeatmap: snapshot.nodeHeatmap,
  };
}

export function projectLegacyGraphNodes(
  records: ReadonlyArray<{
    nodeId: string;
    learningState?: NodeLearningState;
    access?: NodeStateAxes['access'];
    axes?: NodeStateAxes;
    bestGameScore?: number;
  }> | undefined,
): CanonicalGraphNodeProgress[] | undefined {
  if (!records) return undefined;
  return records.flatMap((record) => {
    const policy = nodeLearningPolicies.find(({ nodeId }) => nodeId === record.nodeId);
    if (!policy || !record.learningState) return [];
    return [{
      nodeId: policy.nodeId,
      access: record.axes?.access ?? record.access ?? 'locked',
      axes: record.axes ?? {
        access: record.access ?? 'locked',
        learning: 'not-started',
        formalTest: 'not-required',
        output: 'not-required',
        certification: 'not-reached',
      },
      learningState: record.learningState,
      stateCompletionPercent: nodeLearningStateCompletionPercent[record.learningState],
      ...(record.bestGameScore === undefined ? {} : { nodeTestHighestScore: record.bestGameScore }),
      nextRequirement: record.learningState === 'achieved' ? '能力已达成' : '继续完成当前节点',
    }];
  });
}

export function projectLegacyGraphTasks(
  records: ReadonlyArray<{ taskId: string; taskScore?: number; masteryPercent?: number }> | undefined,
  _nodes: CanonicalGraphNodeProgress[] | undefined,
): CanonicalGraphTaskProgress[] {
  if (!records) return [];
  return records.flatMap((record) => {
    if ((record.taskId !== 'P01' && record.taskId !== 'P02' && record.taskId !== 'P03')
      || record.masteryPercent === undefined) return [];
    return [{
      taskId: record.taskId,
      stateCompletionPercent: record.masteryPercent,
      ...(record.taskScore === undefined ? {} : { taskCompositeScore: record.taskScore }),
    }];
  });
}

function canonicalSelectedNode(nodeId: string | undefined): P1NodeId | undefined {
  return nodeLearningPolicies.some((policy) => policy.nodeId === nodeId)
    ? nodeId as P1NodeId
    : undefined;
}

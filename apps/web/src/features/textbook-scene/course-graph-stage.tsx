'use client';

import { SemanticCourseGraph, type GraphMotionState } from '@/features/capability-map/semantic-course-graph';
import type {
  CanonicalGraphNodeProgress,
  CanonicalGraphTaskProgress,
  GraphSnapshotModel,
} from '@/features/capability-map/graph-snapshot-model';
import type { GraphData, TextbookSceneMode } from '@/platform/models';
import type { P1TaskId } from '@/platform/learning-policy';
import {
  projectNodeAccess,
  projectTaskAccess,
  type NodeAccessProjection,
} from '@/platform/node-access-projection';

type CourseGraphStageProps = {
  actorMode: GraphSnapshotModel['mode'];
  graph: GraphData;
  heatmap: GraphSnapshotModel['nodeHeatmap'];
  mode: TextbookSceneMode;
  motionEnabled: boolean;
  motionState?: GraphMotionState;
  onInteraction: () => void;
  onNodeSelect: (nodeId: string) => void;
  onTaskSelect: (taskId: P1TaskId) => void;
  progress: CanonicalGraphNodeProgress[] | undefined;
  projectCompositeScore?: number;
  selectedNodeId: string;
  taskId: P1TaskId;
  taskProgress: CanonicalGraphTaskProgress[];
};

export function CourseGraphStage(p: CourseGraphStageProps) {
  function chooseWhenOpen(access: NodeAccessProjection, choose: () => void) {
    if (access.disabled) return;
    choose();
  }

  function selectNode(nodeId: string) {
    const access = projectNodeAccess(nodeId, p.progress);
    chooseWhenOpen(access, () => p.onNodeSelect(nodeId));
  }

  function selectTask(taskId: P1TaskId) {
    const access = projectTaskAccess(taskId, p.progress);
    chooseWhenOpen(access, () => p.onTaskSelect(taskId));
  }

  return <SemanticCourseGraph
    actorMode={p.actorMode}
    graph={p.graph}
    heatmap={p.heatmap}
    motionState={p.motionState ?? (p.motionEnabled ? 'active' : 'paused')}
    onInteraction={p.onInteraction}
    onNodeSelect={selectNode}
    onTaskSelect={selectTask}
    progress={p.progress}
    projectCompositeScore={p.projectCompositeScore}
    selectedNodeId={p.selectedNodeId}
    taskProgress={p.taskProgress}
  />;
}

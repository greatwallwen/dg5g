'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AccountMenu } from '@/features/auth/account-menu';
import type { WebRole } from '@/features/auth/role-session';
import {
  projectGraphSnapshot,
  type GraphSnapshotModel,
} from '@/features/capability-map/graph-snapshot-model';
import type { GraphAuthoritativeSnapshot } from '@/platform/authoritative-snapshot';
import { getNodeLearningPolicy, type P1TaskId } from '@/platform/learning-policy';
import type { GraphData } from '@/platform/models';
import { Icon } from '@/ui/foundation/icons';
import { CourseGraphStage } from './course-graph-stage';

type CourseMotionState = 'active' | 'paused' | 'reduced';

function ignoreGraphInteraction() {
  // The course overview owns navigation; graph interaction telemetry is optional here.
}

export function CourseOverview({ displayName, graph, role }: {
  displayName: string;
  graph: GraphData;
  role: WebRole;
}) {
  const router = useRouter();
  const [motionState, setMotionState] = useState<CourseMotionState>('active');
  const [snapshot, setSnapshot] = useState<GraphSnapshotModel>();

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches) setMotionState('reduced');
    const handleReducedMotion = (event: MediaQueryListEvent) => setMotionState((current) => (
      event.matches ? 'reduced' : current === 'reduced' ? 'active' : current
    ));
    reducedMotion.addEventListener('change', handleReducedMotion);
    let active = true;
    const refresh = () => fetch('/api/snapshot?audience=graph', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Graph snapshot failed: ${response.status}`);
        return response.json() as Promise<GraphAuthoritativeSnapshot>;
      })
      .then((next) => { if (active) setSnapshot(projectGraphSnapshot(next)); })
      .catch(() => undefined);
    void refresh();
    const interval = window.setInterval(refresh, 5_000);
    return () => {
      active = false;
      window.clearInterval(interval);
      reducedMotion.removeEventListener('change', handleReducedMotion);
    };
  }, []);

  function openNode(nodeId: string) {
    router.push(snapshot?.mode === 'teacher'
      ? `/teacher/sessions/${snapshot.sessionId}`
      : `/learn/${nodeId}`);
  }

  function openTask(taskId: P1TaskId) {
    openNode(({ P01: 'P1T1-N01', P02: 'P1T2-N01', P03: 'P1T3-N01' } as const)[taskId]);
  }

  const actorMode = snapshot?.mode ?? role;
  const selectedNodeId = snapshot?.selectedNodeId ?? '';
  const selectedTaskId = getNodeLearningPolicy(selectedNodeId)?.taskId ?? 'P01';
  const facts = snapshot?.authoritativeFacts;

  return (
    <main className="course-overview" data-course-home data-motion={motionState}
      data-class-size={facts?.classSize ?? 0}
      data-classroom-revision={facts?.classroomRevision ?? 0}
      data-formal-passed={facts?.formalPassed ?? 0}
      data-formal-submitted={facts?.formalSubmitted ?? 0}
      data-graph-progress={snapshot?.nodes.length ?? 0}
      data-role-overlay={actorMode}
      data-snapshot-version={facts?.snapshotVersion ?? 0}
      data-ui-surface="dark">
      <header className="overview-topbar">
        <div className="scene-brand"><span>DG</span><strong>5G网络优化（高级）</strong><small>课程能力图谱</small></div>
        <div className="overview-breadcrumb"><strong>课程全图</strong><span>/</span><small>{actorMode === 'teacher' ? '课堂热力视图' : '我的能力路径'}</small></div>
        <nav aria-label="课程图谱控制">
          <button aria-label={motionState === 'active' ? '暂停动效' : '开启动效'} className="scene-icon-button" onClick={() => setMotionState((value) => value === 'active' ? 'paused' : 'active')} type="button"><Icon name={motionState === 'active' ? 'pause' : 'play'} size={18} /></button>
          <AccountMenu displayName={displayName} role={role} />
        </nav>
      </header>
      <section className="overview-stage">
        <CourseGraphStage
          actorMode={actorMode}
          graph={graph}
          heatmap={snapshot?.nodeHeatmap ?? []}
          mode="course-map"
          motionEnabled={motionState === 'active'}
          motionState={motionState}
          onInteraction={ignoreGraphInteraction}
          onNodeSelect={openNode}
          onTaskSelect={openTask}
          progress={snapshot?.nodes}
          projectCompositeScore={snapshot?.projectCompositeScore}
          selectedNodeId={selectedNodeId}
          taskId={selectedTaskId}
          taskProgress={snapshot?.tasks ?? []}
        />
      </section>
    </main>
  );
}

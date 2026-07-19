'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TextbookSceneMode } from '@/platform/models';
import { createDemoTaskProfiles, getDemoTaskProfileForNode, type DemoTaskProfiles } from '@/features/platform/deep-textbook-demo-data';
import type { LearningProgressSnapshot } from '@/features/skill-tree/skill-progress-client';
import { fetchAuthoritativeSnapshot } from '@/features/snapshot/authoritative-snapshot-client';
import { skillGameForNode } from '@/platform/fixtures/skill-game-fixtures';
import { nodeLearningPolicies, type P1TaskId } from '@/platform/learning-policy';
import { projectNodeAccess, projectTaskAccess } from '@/platform/node-access-projection';
import { professionalOutputSchemaForTask } from '@/features/portfolio/output-schema';
import { projectStudentLearningSnapshot } from '@/platform/learning-compatibility-projection';
import { Icon } from '@/ui/foundation/icons';
import { AccountMenu } from '@/features/auth/account-menu';
import { projectLegacyGraphNodes, projectLegacyGraphTasks } from '@/features/capability-map/graph-snapshot-model';
import { navigateStudentGraphNode, type CourseGraphNodeAction } from '@/features/capability-map/course-graph-navigation';
import { WebPlaybackDock } from '@/features/playback/web-playback-dock';
import { ChallengeScene } from './challenge-scene';
import { CourseGraphStage } from './course-graph-stage';
import { FullscreenToggle } from './fullscreen-toggle';
import { playbackSceneForLearningUnit } from './learning-playback';
import { LearningScene } from './learning-scene';
import { persistReadingSection } from './textbook-scene-learning-facts';
import { classifyCompletedLearningNode } from './textbook-scene-policy';
import { profileForTask, SceneContext, SceneRail, UnavailableNodeNotice } from './textbook-scene-support';
import type { SelfStudyDocument } from './self-study-types';
import type { TextbookSceneShellProps } from './textbook-scene-shell-types';
type DemoTaskId = P1TaskId;
const graphTaskIdByDemoTask: Record<P1TaskId, string> = { P01: 'P1-T1', P02: 'P1-T2', P03: 'P1-T3' };
export function TextbookSceneShell(props: TextbookSceneShellProps) {
  const initialNodeId = props.initialNodeId ?? 'P1T1-N01';
  const destination = classifyCompletedLearningNode(initialNodeId);
  const profiles = createDemoTaskProfiles(props.selfStudyCatalog);
  const initialProfile = getDemoTaskProfileForNode(initialNodeId, profiles);
  const initialTaskId = destination.kind === 'unavailable' ? undefined : destination.taskId;
  if (!initialTaskId || !initialProfile || initialProfile.taskId !== initialTaskId) return <UnavailableNodeNotice nodeId={initialNodeId} />;
  return <SupportedTextbookSceneShell {...props} initialNodeId={initialNodeId} initialTaskId={initialTaskId} profiles={profiles} />;
}

function SupportedTextbookSceneShell({ displayName, focusedActivityId, graph, initialSection, initialSnapshot, selfStudyCatalog, profiles, initialMode = 'course-map', initialNodeId, initialTaskId, sessionId, surface = 'sample', autoFocus = true, serverNow }: TextbookSceneShellProps & { profiles: DemoTaskProfiles; initialNodeId: string; initialTaskId: DemoTaskId }) {
  const router = useRouter();
  const shellRef = useRef<HTMLDivElement>(null);
  const contextButtonRef = useRef<HTMLButtonElement>(null);
  const restoreContextFocusRef = useRef(false);
  const autoFocusTimer = useRef<number | null>(null);
  const snapshotRef = useRef(initialSnapshot);
  const [mode, setMode] = useState<TextbookSceneMode>(initialMode);
  const [taskId, setTaskId] = useState<DemoTaskId>(initialTaskId);
  const [selectedNodeId, setSelectedNodeId] = useState(initialNodeId);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [dockOpen, setDockOpen] = useState(true);
  const [pathOpen, setPathOpen] = useState(true);
  const [contextOpen, setContextOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unavailableNodeId, setUnavailableNodeId] = useState<string>();
  const profile = profileForTask(profiles, taskId)!;
  const unitIndex = Math.max(0, profile.units.findIndex((unit) => unit.capabilityNodeId === selectedNodeId));
  const unit = profile.units[unitIndex] ?? profile.units[0];
  const document = (selfStudyCatalog as Partial<Record<string, SelfStudyDocument>>)[selectedNodeId];
  const taskMastery = snapshot.tasks.find((item) => item.taskId === taskId);
  const nodeProgress = snapshot.progress.find((item) => item.nodeId === selectedNodeId);
  const outputSchema = useMemo(() => professionalOutputSchemaForTask(selfStudyCatalog, taskId), [selfStudyCatalog, taskId]);
  const playbackScenes = useMemo(() => [playbackSceneForLearningUnit(unit, profile.taskId)], [profile.taskId, unit]);
  const learningPlayback = playbackScenes[0];
  const gameConfig = useMemo(() => {
    const node = graph.nodes.find((item) => item.nodeId === selectedNodeId);
    const task = graph.tasks.find((item) => item.taskId === graphTaskIdByDemoTask[taskId]);
    if (!node || !task) throw new Error(`Missing graph binding for ${selectedNodeId} in ${taskId}`);
    return skillGameForNode(node, task);
  }, [graph.nodes, graph.tasks, selectedNodeId, taskId]);

  const commitSnapshot = (nextSnapshot: LearningProgressSnapshot) => { snapshotRef.current = nextSnapshot; setSnapshot(nextSnapshot); };
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) setMotionEnabled(false);
  }, []);

  useEffect(() => {
    if (!autoFocus || initialMode !== 'course-map') return;
    autoFocusTimer.current = window.setTimeout(() => {
      setTaskId('P01');
      setSelectedNodeId('P1T1-N01');
      setMode('task-map');
    }, 2500);
    return cancelAutoFocus;
  }, [autoFocus, initialMode]);
  useEffect(() => {
    if (mode !== 'challenge') return;
    const pollProgress = () => fetchStudentCut(sessionId).then(commitSnapshot).catch(() => undefined);
    const timer = window.setInterval(pollProgress, 5000);
    return () => window.clearInterval(timer);
  }, [mode, sessionId]);
  useLayoutEffect(() => {
    if (contextOpen || !restoreContextFocusRef.current) return;
    restoreContextFocusRef.current = false;
    contextButtonRef.current?.focus({ preventScroll: true });
  }, [contextOpen]);
  function cancelAutoFocus() {
    if (autoFocusTimer.current !== null) window.clearTimeout(autoFocusTimer.current);
    autoFocusTimer.current = null;
  }

  function chooseTask(nextTaskId: DemoTaskId) {
    cancelAutoFocus();
    const access = projectTaskAccess(nextTaskId, snapshot.progress);
    if (access.disabled) return;
    const nextProfile = profileForTask(profiles, nextTaskId);
    if (!nextProfile) {
      setUnavailableNodeId(`${nextTaskId}-profile`);
      return;
    }
    setTaskId(nextTaskId);
    setSelectedNodeId(nextProfile.units[0].capabilityNodeId);
    setMode('task-map');
  }

  function chooseNode(nodeId: string, accessProgress = snapshot.progress) {
    cancelAutoFocus();
    const access = projectNodeAccess(nodeId, accessProgress);
    if (access.disabled) return;
    const destination = classifyCompletedLearningNode(nodeId);
    const nextProfile = getDemoTaskProfileForNode(nodeId, profiles);
    if (destination.kind === 'unavailable' || !nextProfile || nextProfile.taskId !== destination.taskId) {
      setUnavailableNodeId(nodeId);
      return;
    }
    setTaskId(destination.taskId);
    setSelectedNodeId(nodeId);
    setMode('learning');
  }

  function chooseGraphNode(nodeId: string, action: CourseGraphNodeAction) {
    if (action === 'formal-test') {
      navigateStudentGraphNode((href) => router.push(href), nodeId, action);
      return;
    }
    chooseNode(nodeId);
  }

  async function completeNode() {
    setSaving(true);
    try {
      const nextSnapshot = await fetchStudentCut(sessionId);
      commitSnapshot(nextSnapshot);
      const refreshedNode = nextSnapshot.progress.find(({ nodeId }) => nodeId === selectedNodeId);
      const policy = nodeLearningPolicies.find(({ nodeId }) => nodeId === selectedNodeId);
      const requiredMilestone = policy?.requiresProfessionalOutput
        ? 'evidence-submitted'
        : 'micro-practice-passed';
      if (!refreshedNode?.learningStateTrail?.includes(requiredMilestone)) return;
      const destination = classifyCompletedLearningNode(selectedNodeId);
      if (destination.kind === 'unavailable') {
        setUnavailableNodeId(selectedNodeId);
        return;
      }
      if (destination.kind === 'challenge') {
        setMode('challenge');
        return;
      }
      const nextUnit = profile.units[unitIndex + 1];
      if (nextUnit) chooseNode(nextUnit.capabilityNodeId, nextSnapshot.progress);
      else setMode('challenge');
    } finally {
      setSaving(false);
    }
  }

  async function refreshAfterGame() {
    const next = await fetchStudentCut(sessionId).catch(() => null);
    if (next) commitSnapshot(next);
  }

  function continueAfterTest() {
    const nextUnit = profile.units[unitIndex + 1];
    if (nextUnit) chooseNode(nextUnit.capabilityNodeId);
    else setMode('task-map');
  }

  function closeContext() {
    restoreContextFocusRef.current = true;
    setContextOpen(false);
  }

  const graphProgress = useMemo(() => projectLegacyGraphNodes(snapshot.progress), [snapshot.progress]);
  const graphTaskProgress = useMemo(() => projectLegacyGraphTasks(snapshot.tasks, graphProgress), [graphProgress, snapshot.tasks]);
  const masteredCount = snapshot.progress.filter((item) => item.learningState === 'achieved').length;
  const selectedAccess = projectNodeAccess(selectedNodeId, snapshot.progress);
  const graphVisible = mode === 'course-map' || mode === 'task-map';
  if (unavailableNodeId) return <UnavailableNodeNotice nodeId={unavailableNodeId} />;
  if (selectedAccess.disabled) return <UnavailableNodeNotice access={selectedAccess} nodeId={selectedNodeId} />;
  if (!document) return <UnavailableNodeNotice nodeId={selectedNodeId} />;
  return (
    <div className={`textbook-scene-shell is-${mode} is-${surface}${dockOpen ? ' has-open-narration' : ''}`} data-deep-sample="P01-P02" data-scene-mode={mode} data-scene-surface={surface} data-ui-surface="dark" ref={shellRef}>
      <header className="scene-topbar">
        <Link className="scene-brand" href="/"><span>DG</span><strong>5G网络优化（高级）</strong><small>数字教材</small></Link>
        <div className="scene-location"><span>{graphVisible ? mode === 'course-map' ? '课程全图' : `${taskId} 能力路线` : `${taskId} / ${unit.title}`}</span><i><b style={{ width: `${(masteredCount / nodeLearningPolicies.length) * 100}%` }} /></i><small>{masteredCount}/{nodeLearningPolicies.length} 能力达成</small></div>
        <nav aria-label="教材视图控制">
          {mode === 'learning' ? <button aria-label={pathOpen ? '收起学习路径' : '展开学习路径'} aria-pressed={pathOpen} className="scene-icon-button" data-path-rail-toggle onClick={() => setPathOpen((value) => !value)} title="学习路径" type="button"><Icon name="follow" size={19} /></button> : null}
          {mode === 'learning' ? <button aria-label={contextOpen ? '收起节点信息' : '展开节点信息'} aria-pressed={contextOpen} className="scene-icon-button" data-context-drawer-toggle onClick={() => contextOpen ? closeContext() : setContextOpen(true)} ref={contextButtonRef} title="节点信息" type="button"><Icon name="layers" size={19} /></button> : null}
          <button aria-label="课程图谱" className="scene-icon-button" onClick={() => setMode('course-map')} title="课程图谱" type="button"><Icon name="map" size={19} /></button>
          <button aria-label={motionEnabled ? '暂停动效' : '开启动效'} aria-pressed={!motionEnabled} className="scene-icon-button" onClick={() => setMotionEnabled((value) => !value)} title={motionEnabled ? '暂停动效' : '开启动效'} type="button"><Icon name={motionEnabled ? 'pause' : 'play'} size={18} /></button>
          <FullscreenToggle targetRef={shellRef} />
          <AccountMenu displayName={displayName} role="student" />
        </nav>
      </header>

      <main className="scene-main">
        {graphVisible ? (
          <CourseGraphStage actorMode="student" graph={graph} heatmap={[]} mode={mode} motionEnabled={motionEnabled} onInteraction={cancelAutoFocus} onNodeSelect={chooseGraphNode} onTaskSelect={chooseTask} progress={graphProgress} projectCompositeScore={snapshot.projectCompositeScore} selectedNodeId={selectedNodeId} taskId={taskId} taskProgress={graphTaskProgress} />
        ) : mode === 'learning' ? (
          <div className={`learning-workspace${pathOpen ? ' is-path-open' : ' is-path-closed'}${contextOpen ? ' is-context-open' : ''}`}>
            <SceneRail profile={profile} progress={snapshot.progress} selectedNodeId={selectedNodeId} onNodeSelect={chooseNode} onReturnToMap={() => setMode('task-map')} />
            <div className="learning-scroll"><LearningScene
              completed={nodeProgress?.learningState === 'achieved'}
              document={document}
              focusedActivityId={selectedNodeId === initialNodeId ? focusedActivityId : undefined}
              initialSection={selectedNodeId === initialNodeId ? initialSection : undefined}
              onComplete={completeNode}
              onReadingComplete={(sectionId) => persistReadingSection({
                sectionId, selectedNodeId, setSaving, setSnapshot: commitSnapshot,
                snapshot: snapshotRef.current, taskId,
              })}
              saving={saving}
              serverNow={serverNow}
            /></div>
            {contextOpen ? <SceneContext mastery={taskMastery} onClose={closeContext} profile={profile} unit={unit} /> : null}
          </div>
        ) : (
          <ChallengeScene gameConfig={gameConfig} mastery={taskMastery} nodeProgress={nodeProgress} onContinue={continueAfterTest} onProgress={refreshAfterGame} onReturnToMap={() => setMode('task-map')} outputSchema={outputSchema} profile={profile} studentId={snapshot.studentId} studentVersion={snapshot.version} unit={unit} />
        )}
      </main>

      {mode === 'learning' ? (
        <footer className={`scene-playback-dock scene-narration-dock${dockOpen ? ' is-open' : ' is-collapsed'}`} data-narration-track={unit.capabilityNodeId} data-playback-mode="openmaic-one-way">
          <button aria-label={dockOpen ? '收起播放栏' : '展开播放栏'} className="dock-collapse" onClick={() => setDockOpen((value) => !value)} type="button"><Icon name={dockOpen ? 'close' : 'play'} size={15} /></button>
          {dockOpen ? <WebPlaybackDock key={learningPlayback.sceneId} scene={learningPlayback} variant="track" /> : null}
        </footer>
      ) : null}
    </div>
  );
}
async function fetchStudentCut(sessionId: string): Promise<LearningProgressSnapshot> {
  const studentCut = await fetchAuthoritativeSnapshot('student', sessionId);
  return projectStudentLearningSnapshot(studentCut.me.learning);
}

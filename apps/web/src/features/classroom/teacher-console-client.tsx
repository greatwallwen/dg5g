'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TeacherAuthoritativeSnapshot } from '@/platform/authoritative-snapshot';
import type { ClassSession, PlaybackScene, Task, TeacherSlide } from '@/platform/models';
import { getNodeLearningPolicy } from '@/platform/learning-policy';
import { playbackSceneForLearningUnit } from '@/features/textbook-scene/learning-playback';
import { TeacherConsoleView } from './teacher-console-view';
import { profileForNodeId } from '@/features/textbook-scene/shared-classroom-scene';
import { useClassSession } from './use-class-session';
import { TeacherSkillPulseProvider } from '@/features/skill-tree/teacher-skill-pulse';
import type { DemoTaskProfiles } from '@/features/platform/deep-textbook-demo-data';
import { useAuthoritativeSnapshot } from '@/features/snapshot/authoritative-snapshot-client';
import { projectTeacherConsoleSnapshot, projectTeacherSkillPulse } from './teacher-console-snapshot-model';
import { authoritativeDomFacts } from '@/features/snapshot/snapshot-dom-facts';
import { teachingPageAt } from '@/features/textbook-scene/classroom-lesson-model';
import { useClassroomPresence } from './classroom-presence-client';
type TeacherInspectorTab = 'script' | 'learning' | 'review';
export function TeacherConsoleClient({ displayName, slides, initialSession, initialSnapshot, task, playback, profiles }: { displayName: string; slides: TeacherSlide[]; initialSession: ClassSession; initialSnapshot: TeacherAuthoritativeSnapshot; task: Task; playback: PlaybackScene; profiles: DemoTaskProfiles }) {
  const [session, update, connection, submitIntent] = useClassSession(initialSession, { role: 'teacher' });
  const snapshot = useAuthoritativeSnapshot(initialSnapshot, 'teacher', initialSession.sessionId);
  useClassroomPresence({
    sessionId: initialSession.sessionId,
    surface: 'teacher-console',
    audience: 'teacher',
    pageState: session.sessionStatus === 'closed' ? 'closed' : 'ready',
    lastSeenClassroomRevision: session.lessonState?.revision ?? 0,
  });
  const inspectorButtonRef = useRef<HTMLButtonElement>(null);
  const restoreInspectorFocusRef = useRef(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<TeacherInspectorTab>('script');
  const [playbackOpen, setPlaybackOpen] = useState(false);
  const initialNodeId = slides[0]?.nodeId ?? initialSession.activeNodeId ?? 'P1T1-N01';
  const activeNodeId = session.activeNodeId ?? initialNodeId;
  const activePolicy = getNodeLearningPolicy(activeNodeId);
  const profile = profileForNodeId(activeNodeId, profiles);
  const unitIndex = Math.max(0, profile.units.findIndex((unit) => unit.capabilityNodeId === activeNodeId));
  const unit = profile.units[unitIndex] ?? profile.units[0];
  const teachingPage = unit.capabilityNodeId === 'P1T1-N02'
    ? teachingPageAt(session.lessonState?.playback.actionIndex)
    : undefined;
  const snapshotModel = projectTeacherConsoleSnapshot(snapshot, session.studentSyncState);
  const rosterStats = snapshotModel.rosterStats;
  const controlMode = snapshotModel.controlMode;
  const controlsAvailable = connection.state !== 'offline';
  const selectedNodeProgress = projectTeacherSkillPulse(snapshot, activeNodeId);
  const submittedAnswers = session.submissionAnswers ?? [];
  useLayoutEffect(() => {
    if (inspectorOpen || !restoreInspectorFocusRef.current) return;
    restoreInspectorFocusRef.current = false;
    inspectorButtonRef.current?.focus({ preventScroll: true });
  }, [inspectorOpen]);
  useEffect(() => {
    if (!inspectorOpen) return;
    const inspector = document.querySelector<HTMLElement>('[data-teacher-inspector]');
    if (!inspector) return;
    const mobileQuery = window.matchMedia('(max-width: 760px)');
    const focusable = () => {
      const visible: HTMLElement[] = [];
      const candidates = inspector.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      for (const element of candidates) {
        if (element.getClientRects().length > 0) visible.push(element);
      }
      return visible;
    };
    if (mobileQuery.matches) focusable()[0]?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeInspector();
        return;
      }
      if (event.key !== 'Tab' || !mobileQuery.matches) return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!inspector.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [inspectorOpen]);
  const teacherScript = useMemo(() => [
    `聚焦问题：${unit.question}`,
    `按工程顺序组织讲解：${unit.steps.join(' -> ')}`,
    `纠正常见错误：${unit.counterexample}`,
  ], [unit]);
  const activePlayback = useMemo(() => ({ ...playbackSceneForLearningUnit(unit, profile.taskId), presenterId: playback.presenterId }), [playback.presenterId, profile.taskId, unit]);
  async function go(index: number) {
    if (!controlsAvailable) return;
    const nextIndex = Math.max(0, Math.min(profile.units.length - 1, index));
    await submitIntent({ type: 'page_changed', pageIndex: nextIndex });
  }
  async function pushPage() {
    if (!controlsAvailable) return;
    update({
      activityState: 'pushed',
      studentSyncState: 'requested',
      syncRequestId: `${unit.id}-${Date.now()}`,
    });
    await submitIntent({ type: 'playback_seeked', positionMs: session.lessonState?.playback.positionMs ?? 0 });
  }
  async function forceFollow() {
    if (!controlsAvailable) return;
    const syncRequestId = `${unit.id}-force-${Date.now()}`;
    update({
      activityState: 'pushed',
      studentMode: 'follow',
      studentSyncState: 'forced',
      syncRequestId,
    });
    await submitIntent({ type: 'playback_seeked', positionMs: session.lessonState?.playback.positionMs ?? 0 });
  }
  function releaseFollowLock() {
    update({ studentMode: 'follow', studentSyncState: 'idle', syncRequestId: `${unit.id}-release-${Date.now()}` });
  }
  async function startFormalTest() {
    if (!controlsAvailable || !activePolicy?.requiresFormalTest) return;
    const formalTest = session.formalTest;
    if (!formalTest || formalTest.status === 'running') return;
    const phase = session.lessonState?.phase ?? 'prepare';
    if (phase === 'prepare' || phase === 'review') {
      if (!await submitIntent({ type: 'phase_changed', phase: 'lecture' })) return;
    }
    if (phase === 'prepare' || phase === 'review' || phase === 'lecture' || phase === 'question') {
      if (!await submitIntent({ type: 'phase_changed', phase: 'practice' })) return;
    }
    if (phase !== 'challenge' && phase !== 'close') {
      if (!await submitIntent({ type: 'phase_changed', phase: 'challenge' })) return;
    }
    update({
      sceneMode: 'challenge',
      formalTest: {
        ...formalTest,
        status: 'running',
        startedAt: new Date().toISOString(),
        participants: formalTest.participants.map((participant) => ({ ...participant, state: 'playing', score: undefined, durationSeconds: undefined })),
      },
    });
  }
  async function beginReview() {
    if (!controlsAvailable || snapshotModel.formalAssessment.submittedCount === 0) return;
    const phase = session.lessonState?.phase ?? 'prepare';
    if (phase === 'prepare' && !await submitIntent({ type: 'phase_changed', phase: 'lecture' })) return;
    if (phase !== 'review' && phase !== 'close') {
      await submitIntent({ type: 'phase_changed', phase: 'review' });
    }
  }
  function closeInspector() { restoreInspectorFocusRef.current = true; setInspectorOpen(false); }
  return <TeacherSkillPulseProvider progress={selectedNodeProgress}><TeacherConsoleView
    authoritativeFacts={authoritativeDomFacts(snapshot)}
    displayName={displayName}
    playbackOpen={playbackOpen}
    setPlaybackOpen={setPlaybackOpen}
    unitIndex={unitIndex}
    controlMode={controlMode}
    profile={profile}
    unit={unit}
    rosterStats={rosterStats}
    helperReady={controlsAvailable}
    helperStatus={snapshotModel.helper.status}
    deliveryStats={snapshotModel.helper.commandDelivery}
    onlineStudentDeviceCount={snapshotModel.helper.onlineStudentDeviceCount}
    session={session}
    inspectorOpen={inspectorOpen}
    closeInspector={closeInspector}
    setInspectorOpen={setInspectorOpen}
    inspectorButtonRef={inspectorButtonRef}
    inspectorTab={inspectorTab}
    setInspectorTab={setInspectorTab}
    teacherScript={teacherScript}
    teachingPage={teachingPage}
    formalAssessment={snapshotModel.formalAssessment}
    classScores={snapshotModel.classScores}
    submittedAnswers={submittedAnswers}
    connection={connection}
    verificationActionState="idle"
    activePlayback={activePlayback}
    update={update}
    submitIntent={submitIntent}
    task={task}
    go={go}
    startFormalTest={startFormalTest}
    pushPage={pushPage}
    forceFollow={forceFollow}
    releaseFollowLock={releaseFollowLock}
    beginReview={beginReview}
    verificationMessage=""
  /></TeacherSkillPulseProvider>;
}

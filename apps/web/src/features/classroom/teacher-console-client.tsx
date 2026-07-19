'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TeacherAuthoritativeSnapshot } from '@/platform/authoritative-snapshot';
import { playbackSceneForLearningUnit } from '@/features/textbook-scene/learning-playback';
import { NoActiveClassroomLessonView, TeacherConsoleView } from './teacher-console-view';
import { profileForNodeId, unitForNodeId } from '@/features/textbook-scene/shared-classroom-scene';
import { TeacherSkillPulseProvider } from '@/features/skill-tree/teacher-skill-pulse';
import type { DemoTaskProfiles } from '@/features/platform/deep-textbook-demo-data';
import { type AuthoritativeSnapshotConnection, useAuthoritativeSnapshotState } from '@/features/snapshot/authoritative-snapshot-client';
import { projectTeacherClassroomCut, projectTeacherConsoleSnapshot, projectTeacherSkillPulse } from './teacher-console-snapshot-model';
import { authoritativeDomFacts } from '@/features/snapshot/snapshot-dom-facts';
import { teachingPageFor } from '@/features/textbook-scene/p1-teaching-package';
import { useClassroomPresence } from './classroom-presence-client';
import { useClassroomCommands } from './use-classroom-commands';
import { canSubmitClassroomCursorCommands } from './classroom-command-client';
import { sessionFromTeacherSnapshot } from './teacher-console-view-props';

type TeacherInspectorTab = 'script' | 'learning' | 'review';

export function TeacherConsoleClient({
  displayName,
  initialSnapshot,
  profiles,
}: {
  displayName: string;
  initialSnapshot: TeacherAuthoritativeSnapshot;
  profiles: DemoTaskProfiles;
}) {
  const sessionId = initialSnapshot.classroom.sessionId;
  const { snapshot, connection, refreshNow } = useAuthoritativeSnapshotState(
    initialSnapshot,
    'teacher',
    sessionId,
  );
  useClassroomPresence({
    sessionId,
    surface: 'teacher-console',
    audience: 'teacher',
    pageState: snapshot.classroom.status === 'closed' ? 'closed' : 'ready',
    lastSeenClassroomRevision: snapshot.classroom.revision,
  });

  const activeLesson = snapshot.classroom.activeLesson;
  if (!activeLesson) {
    return <NoActiveClassroomLessonView
      connectionState={connection.state}
      displayName={displayName}
      facts={authoritativeDomFacts(snapshot)}
      sessionId={sessionId}
      surface="teacher"
    />;
  }

  return <ActiveTeacherConsole
    activeLesson={activeLesson}
    connection={connection}
    displayName={displayName}
    key={activeLesson.runId}
    profiles={profiles}
    refreshNow={refreshNow}
    snapshot={snapshot}
  />;
}

function ActiveTeacherConsole({
  activeLesson,
  connection,
  displayName,
  profiles,
  refreshNow,
  snapshot,
}: {
  activeLesson: NonNullable<TeacherAuthoritativeSnapshot['classroom']['activeLesson']>;
  connection: AuthoritativeSnapshotConnection;
  displayName: string;
  profiles: DemoTaskProfiles;
  refreshNow: () => void;
  snapshot: TeacherAuthoritativeSnapshot;
}) {
  const sessionId = snapshot.classroom.sessionId;
  const cut = projectTeacherClassroomCut(snapshot)!;
  const authority = useMemo(() => ({
    sessionId,
    lessonRunId: activeLesson.runId,
    classroomRevision: snapshot.classroom.revision,
    snapshotVersion: snapshot.snapshotVersion,
  }), [activeLesson.runId, sessionId, snapshot.classroom.revision, snapshot.snapshotVersion]);
  const commands = useClassroomCommands(authority, refreshNow);

  const inspectorButtonRef = useRef<HTMLButtonElement>(null);
  const restoreInspectorFocusRef = useRef(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorTab, setInspectorTab] = useState<TeacherInspectorTab>('script');
  const [playbackOpen, setPlaybackOpen] = useState(false);
  const teachingPage = cut.page;
  const pageCount = cut.pageCount;
  const pageIndex = cut.pageIndex;
  const pages = useMemo(() => Array.from(
    { length: pageCount },
    (_, index) => teachingPageFor(teachingPage.lessonId, index),
  ), [pageCount, teachingPage.lessonId]);
  const activeNodeId = teachingPage.nodeId;
  const profile = profileForNodeId(activeNodeId, profiles);
  const unit = unitForNodeId(activeNodeId, profiles);
  const session = sessionFromTeacherSnapshot(snapshot, cut.lessonState);
  const snapshotModel = projectTeacherConsoleSnapshot(snapshot, undefined);
  const controlsAvailable = connection.state !== 'offline';
  const cursorControlsAvailable = canSubmitClassroomCursorCommands(
    connection.state,
    activeLesson.status,
  );
  const selectedNodeProgress = projectTeacherSkillPulse(snapshot, activeNodeId);
  const activePlayback = useMemo(
    () => playbackSceneForLearningUnit(unit, profile.taskId),
    [profile.taskId, unit],
  );
  const teacherScript = useMemo(() => [
    `聚焦问题：${unit.question}`,
    `按工程顺序组织讲解：${unit.steps.join(' -> ')}`,
    `纠正常见错误：${unit.counterexample}`,
  ], [unit]);

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
    const focusable = () => [...inspector.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    )];
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
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [inspectorOpen]);

  async function go(nextPageIndex: number) {
    if (!cursorControlsAvailable || nextPageIndex < 0 || nextPageIndex >= pageCount) return;
    await commands.submitLessonIntent({ type: 'page_changed', pageIndex: nextPageIndex });
  }
  async function pushPage() {
    if (!cursorControlsAvailable) return;
    await commands.submitLessonIntent({
      type: 'playback_seeked',
      positionMs: cut.lessonState.playback.positionMs,
    });
  }
  async function submitCursorIntent(
    intent: Parameters<typeof commands.submitLessonIntent>[0],
  ): Promise<boolean> {
    if (!cursorControlsAvailable) return false;
    return commands.submitLessonIntent(intent);
  }
  async function startFormalTest() {
    const target = teachingPage.formalAssessment;
    if (!target) return;
    await commands.submitAssessment({
      type: 'start',
      lessonRunId: activeLesson.runId,
      nodeId: target.nodeId,
      gameId: target.gameId,
      expectedClassroomRevision: snapshot.classroom.revision,
    });
  }
  async function pauseFormalTest() {
    const assessment = snapshotModel.formalAssessment;
    if (!assessment.runId || assessment.revision === undefined) return;
    await commands.submitAssessment({ type: 'pause', runId: assessment.runId, expectedRevision: assessment.revision });
  }
  async function resumeFormalTest() {
    const assessment = snapshotModel.formalAssessment;
    if (!assessment.runId || assessment.revision === undefined) return;
    await commands.submitAssessment({ type: 'resume', runId: assessment.runId, expectedRevision: assessment.revision });
  }
  async function collectFormalTest() {
    const assessment = snapshotModel.formalAssessment;
    if (!assessment.runId || assessment.revision === undefined) return;
    await commands.submitAssessment({ type: 'collect', runId: assessment.runId, expectedRevision: assessment.revision });
  }
  async function beginReview() {
    const assessment = snapshotModel.formalAssessment;
    if (assessment.submittedCount === 0 || !assessment.canBeginReview
      || !assessment.runId || assessment.revision === undefined) return;
    await commands.submitAssessment({
      type: 'begin-review', runId: assessment.runId, expectedRevision: assessment.revision,
    });
  }
  async function endLesson() {
    const running = snapshotModel.formalAssessment.status === 'running'
      || snapshotModel.formalAssessment.status === 'paused'
      || snapshotModel.formalAssessment.status === 'reviewing';
    await commands.submitLessonLifecycle({ type: 'close', collectAssessment: running });
  }
  function closeInspector() {
    restoreInspectorFocusRef.current = true;
    setInspectorOpen(false);
  }

  return <TeacherSkillPulseProvider progress={selectedNodeProgress}><TeacherConsoleView
    authoritativeFacts={authoritativeDomFacts(snapshot)} displayName={displayName}
    playbackOpen={playbackOpen} setPlaybackOpen={setPlaybackOpen}
    pageIndex={pageIndex} pageCount={pageCount} pages={pages}
    controlMode={snapshotModel.controlMode} profile={profile} unit={unit}
    rosterStats={snapshotModel.rosterStats} controlsAvailable={controlsAvailable}
    cursorControlsAvailable={cursorControlsAvailable}
    connectionStatus={connection.state === 'online' ? 'online' : connection.state === 'offline' ? 'offline' : 'degraded'}
    deliveryStats={snapshotModel.helper.commandDelivery}
    onlineStudentDeviceCount={snapshotModel.helper.onlineStudentDeviceCount}
    session={session} inspectorOpen={inspectorOpen} closeInspector={closeInspector}
    setInspectorOpen={setInspectorOpen} inspectorButtonRef={inspectorButtonRef}
    inspectorTab={inspectorTab} setInspectorTab={setInspectorTab}
    teacherScript={teacherScript} teachingPage={teachingPage}
    formalAssessment={snapshotModel.formalAssessment} classScores={snapshotModel.classScores}
    submittedAnswers={[]} connection={connection} verificationActionState="idle"
    activePlayback={activePlayback} submitIntent={submitCursorIntent}
    go={go} startLesson={() => void commands.submitLessonLifecycle({ type: 'start' })}
    pauseLesson={() => void commands.submitLessonLifecycle({ type: 'pause' })}
    resumeLesson={() => void commands.submitLessonLifecycle({ type: 'resume' })}
    startFormalTest={startFormalTest} pauseFormalTest={pauseFormalTest}
    resumeFormalTest={resumeFormalTest} collectFormalTest={collectFormalTest}
    pushPage={pushPage} beginReview={beginReview} endLesson={endLesson}
    commandBusy={commands.busy} verificationMessage={commands.error ?? ''}
  /></TeacherSkillPulseProvider>;
}

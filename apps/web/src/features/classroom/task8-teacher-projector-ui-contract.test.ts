import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { ProjectorAuthoritativeSnapshot } from '@/platform/authoritative-snapshot';
import {
  assessmentRemainingSeconds,
} from './projector-client.tsx';
import { synchronizeAssessmentCountdownBaseline } from './teacher-console-view-props.ts';
import { teacherPrimaryActionForPhase } from './teacher-console-view.tsx';

test('teacherPrimaryActionForPhase exposes one contextual action for every classroom phase', () => {
  assert.equal(teacherPrimaryActionForPhase({
    phase: 'challenge',
    formalTestAvailable: true,
    formalTestRunning: false,
    hasNextNode: true,
    controlsAvailable: true,
  }), 'start-formal-test');
  assert.equal(teacherPrimaryActionForPhase({
    phase: 'review',
    formalTestAvailable: true,
    formalTestRunning: false,
    hasNextNode: true,
    controlsAvailable: true,
  }), 'next-page');
  assert.equal(teacherPrimaryActionForPhase({
    phase: 'lecture',
    formalTestAvailable: true,
    formalTestRunning: false,
    hasNextNode: true,
    controlsAvailable: true,
  }), 'push-page');
  assert.equal(teacherPrimaryActionForPhase({
    phase: 'lecture',
    formalTestAvailable: true,
    formalTestRunning: false,
    hasNextNode: true,
    controlsAvailable: false,
  }), 'reconnect-session');
  assert.notEqual(teacherPrimaryActionForPhase({
    phase: 'challenge',
    formalTestAvailable: true,
    formalTestRunning: true,
    hasNextNode: true,
    controlsAvailable: true,
  }), 'start-formal-test');
  assert.equal(teacherPrimaryActionForPhase({
    phase: 'lecture',
    formalTestAvailable: false,
    controlsAvailable: false,
    classroomStatus: 'closed',
  }), 'return-workbench');
});

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

test('teacher and projector roots declare their primary-action and motion contracts', () => {
  const teacher = source('./teacher-console-view.tsx');
  const projector = source('./projector-client.tsx');

  assert.match(teacher, /data-primary-action-policy="exactly-one"/);
  assert.match(teacher, /data-motion=/);
  assert.match(teacher, /data-inspector-open=/);
  assert.match(teacher, /data-primary-action/);
  assert.match(teacher, /data-session-action="reconnect-session"/);
  assert.match(teacher, /课堂连接/);
  assert.doesNotMatch(teacher, /重连课堂助手|启动课堂助手/);
  assert.match(teacher, /formalAssessment\.submittedCount === 0/);
  assert.match(teacher, /data-session-action="begin-review"/);
  assert.match(projector, /data-primary-action-policy="none"/);
  assert.match(projector, /data-motion="paused"/);
  assert.match(projector, /data-session-action="previous-page"/);
  assert.match(projector, /data-session-action="next-page"/);
  assert.match(projector, /data-session-action="back-to-teacher"/);
  assert.match(projector, /useClassroomCommands/);
  assert.match(projector, /responseView: 'projector'/);
  assert.match(projector, /canSubmitClassroomCursorCommands/);
  assert.doesNotMatch(projector, /snapshot\.helper\.canPush/);
  assert.match(projector, /errorDistribution/);
  assert.doesNotMatch(projector, /studentName|studentIdentifier|participant\.studentId|answers\.map/u);
});

test('teacher console supports Escape close, focus return and a modal inspector backdrop', () => {
  const client = source('./teacher-console-client.tsx');
  const inspector = source('./teacher-console-inspector.tsx');

  assert.match(client, /event\.key === 'Escape'/);
  assert.match(client, /inspectorButtonRef\.current\?\.focus/);
  assert.match(inspector, /data-teacher-inspector-backdrop/);
  assert.match(inspector, /aria-modal="true"/);
});

test('zero student devices is a non-blocking preparation warning', () => {
  const inspector = source('./teacher-console-inspector.tsx');
  assert.match(inspector, /当前无学生设备在线，不影响备课/);
  assert.doesNotMatch(inspector, /启动课堂助手后才能控制学生屏幕/);
});

test('mobile teacher topbar keeps account actions inside the viewport', () => {
  const css = source('../../app/digital-classroom-task8.css');
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.scene-teacher-console \.scene-classroom-topbar nav[\s\S]*overflow: hidden/);
  assert.match(css, /\.scene-teacher-console \.teacher-helper-pill,[\s\S]*\.scene-teacher-console \.account-menu-identity[\s\S]*display: none/);
});

test('teacher and projector render one authoritative cut and command mutations only refresh it', () => {
  const teacher = source('./teacher-console-client.tsx');
  const projector = source('./projector-client.tsx');
  const commands = source('./use-classroom-commands.ts');
  for (const client of [teacher, projector]) {
    assert.match(client, /useAuthoritativeSnapshotState/);
    assert.doesNotMatch(client, /useClassSession\(/);
    assert.match(client, /activeLesson/);
    assert.match(client, /pageCount/);
    assert.doesNotMatch(client, /P01-L1/);
  }
  assert.match(commands, /refreshNow/);
  assert.doesNotMatch(commands, /setSession|fetchSession|createClassSessionPoller/);
});

test('teacher and projector do not fabricate a lesson when the active cut has none', () => {
  const teacher = source('./teacher-console-client.tsx');
  const projector = source('./projector-client.tsx');
  const noActiveView = source('./teacher-console-view.tsx');
  for (const client of [teacher, projector]) {
    assert.match(client, /NoActiveClassroomLessonView/);
    assert.doesNotMatch(client, /p1TeachingPackage\[0\]|fallbackLesson/);
  }
  assert.match(noActiveView, /data-no-active-lesson/);
  assert.match(teacher, /teachingPageFor\(teachingPage\.lessonId, index\)/);
  assert.match(projector, /teachingPageFor\(activeLesson\.lessonId, currentPageIndex\)/);
});

test('cursor controls require an active lesson while reconnect remains available when busy', () => {
  const teacherClient = source('./teacher-console-client.tsx');
  const teacherView = source('./teacher-console-view.tsx');
  const projector = source('./projector-client.tsx');
  assert.match(teacherClient, /canSubmitClassroomCursorCommands\([\s\S]*activeLesson\.status/);
  assert.match(projector, /canSubmitClassroomCursorCommands\([\s\S]*activeLesson\.status/);
  assert.match(teacherView, /disabled=\{!p\.cursorControlsAvailable \|\| p\.commandBusy/);
  assert.match(teacherView, /action === 'reconnect-session'[\s\S]*className="is-primary"/);
  assert.doesNotMatch(
    teacherView.match(/if \(action === 'reconnect-session'\)[^;]+;/)?.[0] ?? '',
    /disabled|\.\.\.common/,
  );
});

test('assessment controls use server clocks and the narrow assessment command endpoint', () => {
  const teacher = source('./teacher-console-client.tsx');
  const projector = source('./projector-client.tsx');
  const commandClient = source('./classroom-command-client.ts');
  assert.match(commandClient, /\/assessment/);
  for (const command of ['start', 'pause', 'resume', 'collect', 'begin-review']) {
    assert.match(teacher, new RegExp(`type: ['"]${command}['"]`));
  }
  assert.match(projector, /expiresAt/);
  assert.match(projector, /serverNow/);
  assert.match(projector, /remainingSecondsWhenPaused/);
  assert.doesNotMatch(projector, /06:00/);
});

test('projector countdown follows the server clock and freezes while paused', () => {
  const running = {
    status: 'running',
    expiresAt: '2026-07-18T10:01:00.000Z',
  } as ProjectorAuthoritativeSnapshot['submissions']['activeAssessment'];
  const paused = {
    status: 'paused',
    remainingSecondsWhenPaused: 42,
  } as ProjectorAuthoritativeSnapshot['submissions']['activeAssessment'];

  assert.equal(assessmentRemainingSeconds(running, '2026-07-18T10:00:00.000Z', 1_000), 59);
  assert.equal(assessmentRemainingSeconds(paused, '2026-07-18T10:00:00.000Z', 30_000), 42);
  assert.equal(assessmentRemainingSeconds(running, '2026-07-18T10:00:00.000Z', -1_000), 60);
});

test('same-version serverNow refresh resets the projector countdown baseline', () => {
  const running = {
    status: 'running',
    expiresAt: '2026-07-18T10:01:00.000Z',
  } as ProjectorAuthoritativeSnapshot['submissions']['activeAssessment'];
  const first = synchronizeAssessmentCountdownBaseline(
    undefined, 8, '2026-07-18T10:00:00.000Z', 1_000,
  );
  const sameCut = synchronizeAssessmentCountdownBaseline(
    first, 8, '2026-07-18T10:00:00.000Z', 1_500,
  );
  const refreshed = synchronizeAssessmentCountdownBaseline(
    sameCut, 8, '2026-07-18T10:00:01.000Z', 2_000,
  );

  assert.strictEqual(sameCut, first);
  assert.notStrictEqual(refreshed, first);
  assert.equal(refreshed.receivedAtMs, 2_000);
  assert.equal(assessmentRemainingSeconds(
    running,
    refreshed.serverNow,
    2_000 - refreshed.receivedAtMs,
  ), 59);
});

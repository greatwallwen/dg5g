import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ClassSession } from '../../platform/models.ts';
import { loadSelfStudyCatalog } from '../textbook-scene/self-study-content.ts';
import { createClassroomContentCatalog } from './classroom-follow-model.ts';
import { StudentFollowClient } from './student-follow-client.tsx';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test('renders the generated current unit only for joined follow participation', () => {
  const html = render('follow');
  assert.match(html, /data-classroom-current-unit="P1T1-N02"/);
  assert.match(html, /data-student-mode="follow"/);
  assert.doesNotMatch(html, /scene-follow-path|data-student-self-control/);
});

test('self participation preserves the personal return target and hides teacher content', () => {
  const html = render('self');
  assert.match(html, /data-classroom-self-status/);
  assert.match(html, /data-return-href="\/learn\/P1T1-N02"/);
  assert.doesNotMatch(html, /data-classroom-current-unit/);
});

test('missing participation renders an honest joining entry state', () => {
  const html = render('missing');
  assert.match(html, /data-classroom-entry-status/);
  assert.doesNotMatch(html, /同步在线|data-classroom-current-unit/);
});

test('missing participation waits for the student to explicitly join', () => {
  const source = readFileSync(new URL('./student-follow-client.tsx', import.meta.url), 'utf8');

  assert.equal((source.match(/joinStudentClassroom\(/g) ?? []).length, 1);
  assert.doesNotMatch(source, /joinAttempted/);
});

test('a closed classroom hides the teacher unit and keeps the actor return target', () => {
  const html = render('follow', 'closed');
  assert.match(html, /data-classroom-entry-status/);
  assert.match(html, /课堂已结束/);
  assert.match(html, /data-return-href="\/learn\/P1T1-N02"/);
  assert.doesNotMatch(html, /data-classroom-current-unit/);
});

function render(
  mode: 'follow' | 'self' | 'missing',
  sessionStatus: 'active' | 'closed' = 'active',
): string {
  const participation = mode === 'missing' ? null : {
    sessionId: 'demo-class',
    studentId: 'stu-01',
    state: 'joined' as const,
    mode,
    joinedAt: '2026-07-16T01:00:00.000Z',
    updatedAt: '2026-07-16T01:00:00.000Z',
  };
  return renderToStaticMarkup(createElement(StudentFollowClient, {
    contentCatalog: createClassroomContentCatalog(loadSelfStudyCatalog()),
    displayName: '学生一',
    initialParticipation: { participation, joinedCount: participation ? 1 : 0, followingCount: mode === 'follow' ? 1 : 0 },
    initialSession: session,
    returnTarget: { href: '/learn/P1T1-N02', nodeId: 'P1T1-N02' },
    sessionStatus,
    studentId: 'stu-01',
  }));
}

const session = {
  sessionId: 'demo-class',
  teacherSlideId: 'P1T1-N02-S01',
  teacherSlideIndex: 1,
  activeNodeId: 'P1T1-N02',
  activeUnitId: 'P01-ku-02',
  studentMode: 'follow',
  activityState: 'pushed',
  submissionState: 'draft',
  reviewState: 'not_started',
  studentRoster: [],
  lessonState: {
    phase: 'lecture',
    activeNodeId: 'P1T1-N02',
    activeUnitId: 'P01-ku-02',
    revision: 4,
    playback: {
      sceneId: 'P1T1-N02-playback', actionId: 'P1T1-N02-a1', actionIndex: 0,
      status: 'idle', positionMs: 0, rate: 1, revision: 4, audioOwner: 'teacher',
    },
  },
} as ClassSession;

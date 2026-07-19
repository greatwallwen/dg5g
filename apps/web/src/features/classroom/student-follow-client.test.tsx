import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { p1Activities } from '../learning-activities/activity-catalog.ts';
import { createClassroomActivityCatalog } from './classroom-follow-model.ts';
import { StudentFollowClient } from './student-follow-client.tsx';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const activityCatalog = createClassroomActivityCatalog(p1Activities.map(({ activity }) => activity));

test('joined follow renders exact P02 and P03 application activities, never foundation fallbacks', () => {
  for (const task of ['P02', 'P03'] as const) {
    const number = task === 'P02' ? '2' : '3';
    const html = render(studentSnapshot({
      lessonId: `${task}-L1`, taskId: task, nodeId: `P1T${number}-N02`, unitId: `${task}-ku-02`,
      pageId: `${task}-L1-P03`, pageIndex: 2, actionId: `P1T${number}-N02-S03`, actionIndex: 2,
      phase: 'practice', revision: 9,
    }, 'follow'));
    assert.match(html, new RegExp(`data-classroom-activity="P1T${number}-N02-application-01"`));
    assert.doesNotMatch(html, new RegExp(`P1T${number}-N02-foundation-01`));
  }
});

test('self participation preserves its return target and hides teacher content', () => {
  const html = render(studentSnapshot(defaultCursor, 'self'));
  assert.match(html, /data-primary-action-policy="exactly-one"/);
  assert.match(html, /data-primary-action="true"[^>]*data-return-to-teacher/);
  assert.match(html, /data-classroom-self-status/);
  assert.match(html, /data-return-href="\/learn\/P1T1-N02"/);
  assert.doesNotMatch(html, /data-classroom-current-page/);
});

test('missing participation renders an honest joining entry state', () => {
  const html = render(studentSnapshot(defaultCursor, 'missing'));
  assert.match(html, /data-classroom-entry-status/);
  assert.match(html, /data-classroom-join="true"[^>]*data-primary-action="true"|data-primary-action="true"[^>]*data-classroom-join="true"/);
  assert.doesNotMatch(html, /data-classroom-current-page/);
});

test('paused follower retains the authoritative page read-only', () => {
  const snapshot = studentSnapshot(defaultCursor, 'follow');
  snapshot.classroom.status = 'paused';
  snapshot.classroom.activeLesson.status = 'paused';
  const html = render(snapshot);
  assert.match(html, /data-session-status="paused"/);
  assert.match(html, /data-classroom-current-page="P01-L1-P03"/);
  assert.match(html, /data-read-only="true"/);
  assert.doesNotMatch(html, /activity-submit/);
});

test('client has one authoritative snapshot stream and same-cut participation presence', () => {
  const source = readFileSync(new URL('./student-follow-client.tsx', import.meta.url), 'utf8');

  assert.equal((source.match(/useAuthoritativeSnapshotState\(/g) ?? []).length, 1);
  assert.doesNotMatch(source, /useClassSession/);
  assert.match(source, /snapshot\.participation/);
  assert.match(source, /refreshAfterSnapshotVersion/);
  assert.match(source, /lastSeenClassroomRevision:\s*snapshot\.classroom\.revision/);
  assert.doesNotMatch(source, /initialParticipation|setParticipation|useState\([^)]*participation/i);
  assert.doesNotMatch(source, /SelfStudyCursor|self-study-cursor|revision\s*%\s*4/);
});

function render(initialSnapshot: any): string {
  return renderToStaticMarkup(createElement(StudentFollowClient, {
    activityCatalog,
    displayName: '学生一',
    initialSnapshot,
    returnTarget: { href: '/learn/P1T1-N02', nodeId: 'P1T1-N02' },
  }));
}

const defaultCursor = {
  lessonId: 'P01-L1', taskId: 'P01', nodeId: 'P1T1-N02', unitId: 'P01-ku-02',
  pageId: 'P01-L1-P03', pageIndex: 2, actionId: 'P1T1-N02-S03', actionIndex: 2,
  phase: 'practice', revision: 4,
};

function studentSnapshot(
  cursor: Record<string, unknown>,
  mode: 'follow' | 'self' | 'missing',
): any {
  return {
    audience: 'student', snapshotVersion: 12,
    generatedAt: '2026-07-18T00:00:00.000Z', serverNow: '2026-07-18T00:00:00.000Z',
    participation: mode === 'missing' ? null : {
      sessionId: 'demo-class', studentId: 'stu-01', state: 'joined', mode,
      joinedAt: '2026-07-16T01:00:00.000Z', updatedAt: '2026-07-16T01:00:00.000Z',
    },
    classroom: {
      sessionId: 'demo-class', classId: 'demo-class', revision: cursor.revision, status: 'active',
      activeLesson: {
        runId: 'lesson-run-p1', lessonId: cursor.lessonId, status: 'active',
        revision: cursor.revision, pageCount: 6,
        cursor: {
          lessonRunId: 'lesson-run-p1', playbackStatus: 'idle', positionMs: 0,
          rate: 1, audioOwner: 'teacher', updatedAt: '2026-07-18T00:00:00.000Z',
          ...cursor,
        },
      },
      activeTaskId: cursor.taskId, activeNodeId: cursor.nodeId, activeUnitId: cursor.unitId,
    },
    project: { projectId: 'P1', projectTitle: 'P1', finalOutputTitle: 'output', taskIds: ['P01', 'P02', 'P03'] },
    membership: { classSize: 3, joinedCount: 1, followingCount: 1 },
    submissions: {}, classScores: { distribution: [] }, helper: {},
    me: { studentId: 'stu-01', nodes: [], tasks: [], project: {}, learning: { nodes: [] } },
  };
}

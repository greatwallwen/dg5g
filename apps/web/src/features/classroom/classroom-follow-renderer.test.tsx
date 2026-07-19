import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { p1Activities } from '../learning-activities/activity-catalog.ts';
import {
  buildClassroomFollowViewModel,
  createClassroomActivityCatalog,
} from './classroom-follow-model.ts';
import {
  ClassroomFollowRenderer,
  ClassroomStudentModeRenderer,
} from './classroom-follow-renderer.tsx';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const activityCatalog = createClassroomActivityCatalog(p1Activities.map(({ activity }) => activity));

test('renders the exact P02 application activity and classroom delivery contract', () => {
  const model = followModel({
    lessonId: 'P02-L1', taskId: 'P02', nodeId: 'P1T2-N02', unitId: 'P02-ku-02',
    pageId: 'P02-L1-P03', pageIndex: 2, actionId: 'P1T2-N02-S03', actionIndex: 2,
    phase: 'practice', revision: 9,
  });
  const html = renderToStaticMarkup(createElement(ClassroomFollowRenderer, { model }));
  const source = readFileSync(new URL('./classroom-follow-renderer.tsx', import.meta.url), 'utf8');

  assert.match(html, /data-classroom-current-page="P02-L1-P03"/);
  assert.match(html, /data-classroom-activity="P1T2-N02-application-01"/);
  assert.match(html, /data-activity-kind="link-reconstruction"/);
  assert.equal((html.match(/data-primary-action="true"/g) ?? []).length, 1);
  assert.doesNotMatch(html, /P1T2-N02-foundation-01/);
  assert.match(source, /channel: 'classroom'/);
  assert.match(source, /sessionId: model\.sessionId/);
  assert.match(source, /classroomRunId: model\.cursor\.lessonRunId/);
  assert.doesNotMatch(source, /revision\s*%\s*4/);
  assert.match(html, /data-classroom-visual="antenna-posture"/);
  assert.match(html, /data-classroom-visual-renderer="scene-visual"/);
});

test('renders page-owned visuals for P1T1-N01 and P03 without node-pattern fallback', () => {
  const p01 = renderToStaticMarkup(createElement(ClassroomFollowRenderer, {
    model: followModel({
      lessonId: 'P01-L1', taskId: 'P01', nodeId: 'P1T1-N01', unitId: 'P01-ku-01',
      pageId: 'P01-L1-P01', pageIndex: 0, actionId: 'P1T1-N01-S01', actionIndex: 0,
      phase: 'lecture', revision: 8,
    }),
  }));
  const p03 = renderToStaticMarkup(createElement(ClassroomFollowRenderer, {
    model: followModel({
      lessonId: 'P03-L1', taskId: 'P03', nodeId: 'P1T3-N02', unitId: 'P03-ku-02',
      pageId: 'P03-L1-P03', pageIndex: 2, actionId: 'P1T3-N02-S03', actionIndex: 2,
      phase: 'practice', revision: 10,
    }),
  }));

  assert.match(p01, /data-classroom-visual="indoor-boundary"/);
  assert.match(p03, /data-classroom-visual="route"/);
});

test('no-activity page renders no workbench or completion surface', () => {
  const model = followModel({
    lessonId: 'P01-L1', taskId: 'P01', nodeId: 'P1T1-N02', unitId: 'P01-ku-02',
    pageId: 'P01-L1-P02', pageIndex: 1, actionId: 'P1T1-N02-S02', actionIndex: 1,
    phase: 'lecture', revision: 10,
  });
  const html = renderToStaticMarkup(createElement(ClassroomFollowRenderer, { model }));

  assert.match(html, /data-classroom-current-page="P01-L1-P02"/);
  assert.doesNotMatch(html, /data-classroom-activity|data-activity-id|activity-submit/);
  assert.equal((html.match(/data-primary-action="true"/g) ?? []).length, 1);
});

test('paused follow keeps the current page and activity materials read-only', () => {
  const snapshot = studentSnapshot({
    lessonId: 'P03-L1', taskId: 'P03', nodeId: 'P1T3-N02', unitId: 'P03-ku-02',
    pageId: 'P03-L1-P03', pageIndex: 2, actionId: 'P1T3-N02-S03', actionIndex: 2,
    phase: 'practice', revision: 11,
  });
  snapshot.classroom.status = 'paused';
  snapshot.classroom.activeLesson.status = 'paused';
  const result = buildClassroomFollowViewModel(snapshot, activityCatalog);
  assert.equal(result.ok, true);
  const html = renderToStaticMarkup(createElement(ClassroomFollowRenderer, { model: result.value }));

  assert.match(html, /data-classroom-current-page="P03-L1-P03"/);
  assert.match(html, /data-classroom-activity="P1T3-N02-application-01"/);
  assert.match(html, /data-classroom-activity-read-only="true"/);
  assert.doesNotMatch(html, /activity-submit/);
});

test('formal assessment and professional output remain separate destinations', () => {
  const assessment = followModel({
    lessonId: 'P02-L1', taskId: 'P02', nodeId: 'P1T2-N02', unitId: 'P02-ku-02',
    pageId: 'P02-L1-P06', pageIndex: 5, actionId: 'P1T2-N02-S06', actionIndex: 5,
    phase: 'assessment', revision: 12,
  });
  const assessmentHtml = renderToStaticMarkup(createElement(ClassroomFollowRenderer, { model: assessment }));
  assert.match(assessmentHtml, /data-classroom-formal-assessment="P1T2-N02-server-assessment"/);
  assert.match(assessmentHtml, /data-classroom-activity="P1T2-N02-transfer-01"/);

  const output = followModel({
    lessonId: 'P02-L1', taskId: 'P02', nodeId: 'P1T2-N04', unitId: 'P02-ku-04',
    pageId: 'P02-L1-P05', pageIndex: 4, actionId: 'P1T2-N04-S05', actionIndex: 4,
    phase: 'practice', revision: 13,
  });
  const outputHtml = renderToStaticMarkup(createElement(ClassroomFollowRenderer, { model: output }));
  assert.match(outputHtml, /data-classroom-professional-output="P02"/);
  assert.match(outputHtml, /data-classroom-activity="P1T2-N04-micro-01"/);
});

test('self mode only announces teacher updates and never renders the teacher page', () => {
  const html = renderToStaticMarkup(createElement(ClassroomStudentModeRenderer, {
    screen: {
      kind: 'self', hasTeacherUpdate: true, teacherRevision: 12,
      returnTarget: { href: '/learn/P1T2-N03', nodeId: 'P1T2-N03' },
    },
  }));
  assert.match(html, /data-classroom-self-status/);
  assert.match(html, /教师课堂已更新/);
  assert.match(html, /data-return-href="\/learn\/P1T2-N03"/);
  assert.doesNotMatch(html, /data-classroom-current-page/);
});

function followModel(cursor: Record<string, unknown>) {
  const result = buildClassroomFollowViewModel(studentSnapshot(cursor), activityCatalog);
  assert.equal(result.ok, true);
  return result.value;
}

function studentSnapshot(cursor: Record<string, unknown>): any {
  return {
    audience: 'student', snapshotVersion: 12,
    generatedAt: '2026-07-18T00:00:00.000Z', serverNow: '2026-07-18T00:00:00.000Z',
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

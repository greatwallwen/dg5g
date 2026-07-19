import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { p1Activities } from '../learning-activities/activity-catalog.ts';
import { p1TeachingPackage } from '../textbook-scene/p1-teaching-package.ts';
import { resolveClassroomLessonPage } from '@/platform/classroom-lesson-page-catalog.ts';

const sourceUrl = new URL('./classroom-follow-model.ts', import.meta.url);

async function loadModel(): Promise<any> {
  assert.equal(existsSync(sourceUrl), true, 'classroom follow model must exist');
  return import(sourceUrl.href);
}

test('projects every canonical activity id to its real client-safe ActivityPublicDto', async () => {
  const model = await loadModel();
  const projection = model.createClassroomActivityCatalog(
    p1Activities.map(({ activity }) => activity),
  );

  assert.equal(Object.keys(projection).length, p1Activities.length);
  for (const { activity } of p1Activities) {
    assert.deepEqual(projection[activity.id], activity);
  }
  assert.equal(
    projection['P1T2-N02-application-01'].kind,
    'link-reconstruction',
  );
  assert.equal(
    projection['P1T3-N02-application-01'].kind,
    'link-reconstruction',
  );
});

test('projects explicit supported visual metadata for all 24 canonical teaching pages', () => {
  const pages = p1TeachingPackage.flatMap((lesson) => lesson.pages);
  assert.equal(pages.length, 24);

  for (const page of pages) {
    const pageIndex = p1TeachingPackage
      .find((lesson) => lesson.id === page.lessonId)!
      .pages.findIndex(({ id }) => id === page.id);
    const resolved = resolveClassroomLessonPage({
      lessonId: page.lessonId,
      pageId: page.id,
      pageIndex,
      phase: 'lecture',
      actionId: `${page.nodeId}-S${String(pageIndex + 1).padStart(2, '0')}`,
      actionIndex: pageIndex,
      taskId: page.taskId,
      nodeId: page.nodeId,
      unitId: `${page.taskId}-ku-${page.nodeId.slice(-2)}`,
    });
    assert.deepEqual(
      { renderer: resolved?.visualRenderer, visualId: resolved?.visualId },
      page.classroomVisual,
      page.id,
    );
  }

  const page = (id: string) => pages.find((candidate) => candidate.id === id)!;
  assert.deepEqual(page('P01-L1-P01').classroomVisual, {
    renderer: 'scene-visual', visualId: 'indoor-boundary',
  }, 'P1T1-N01 keeps its page-owned indoor boundary visual');
  assert.equal(page('P02-L1-P04').classroomVisual.visualId, 'outdoor-obstacle');
  assert.equal(page('P03-L1-P03').classroomVisual.visualId, 'route');
});

test('builds the exact authoritative lesson page and current canonical activity', async () => {
  const model = await loadModel();
  const activities = model.createClassroomActivityCatalog(
    p1Activities.map(({ activity }) => activity),
  );
  const snapshot = studentSnapshot({
    lessonId: 'P02-L1',
    taskId: 'P02',
    nodeId: 'P1T2-N02',
    unitId: 'P02-ku-02',
    pageId: 'P02-L1-P03',
    pageIndex: 2,
    actionId: 'P1T2-N02-S03',
    actionIndex: 2,
    phase: 'practice',
    revision: 9,
  });
  const result = model.buildClassroomFollowViewModel(
    snapshot,
    activities,
    { href: '/learn/P1T3-N02', nodeId: 'P1T3-N02' },
  );

  assert.equal(result.ok, true);
  assert.equal(result.value.cursor.lessonId, 'P02-L1');
  assert.equal(result.value.cursor.pageId, 'P02-L1-P03');
  assert.equal(result.value.cursor.pageIndex, 2);
  assert.equal(result.value.cursor.pageCount, 6);
  assert.equal(result.value.cursor.revision, 9);
  assert.equal(result.value.classroomActivity.activity.id, 'P1T2-N02-application-01');
  assert.equal(result.value.classroomActivity.activity.kind, 'link-reconstruction');
  assert.equal(result.value.returnToSelfStudy.href, '/learn/P1T3-N02');

  const staleAction = structuredClone(snapshot);
  staleAction.classroom.activeLesson.cursor.actionId = 'P1T2-N02-S02';
  const unavailable = model.buildClassroomFollowViewModel(staleAction, activities);
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.reason, 'cursor-mismatch');

  const stalePageCount = structuredClone(snapshot);
  stalePageCount.classroom.activeLesson.pageCount = 7;
  assert.equal(model.buildClassroomFollowViewModel(stalePageCount, activities).ok, false);
});

test('self mode preserves its return target and only announces a newer teacher revision', async () => {
  const model = await loadModel();
  const returnTarget = { href: '/learn/P1T2-N03', nodeId: 'P1T2-N03' };
  const screen = model.selectClassroomStudentScreen({
    participation: { state: 'joined', mode: 'self', lastFollowedRevision: 4 },
    teacherRevision: 5,
    returnTarget,
  });

  assert.equal(screen.kind, 'self');
  assert.equal(screen.hasTeacherUpdate, true);
  assert.deepEqual(screen.returnTarget, returnTarget);
  assert.equal('currentUnit' in screen, false);
});

test('activity draft resets whenever the generated activity identity changes', async () => {
  const model = await loadModel();
  const answered = { activityId: 'P1T1-N02-foundation-1', answer: '旧答案', feedback: '旧反馈' };
  assert.deepEqual(model.alignClassroomActivityDraft(answered, answered.activityId), answered);
  assert.deepEqual(model.alignClassroomActivityDraft(answered, 'P1T1-N03-micro-1'), {
    activityId: 'P1T1-N03-micro-1',
    answer: '',
    feedback: '',
  });
});

test('paused followers retain the current page read-only while closed sessions return to entry', async () => {
  const model = await loadModel();
  const input = {
    participation: { state: 'joined' as const, mode: 'follow' as const, lastFollowedRevision: 4 },
    teacherRevision: 5,
    returnTarget: { href: '/learn/P1T1-N02' as const, nodeId: 'P1T1-N02' as const },
  };

  assert.equal(model.selectClassroomStudentScreen({ ...input, sessionStatus: 'paused' }).kind, 'follow');
  assert.equal(model.selectClassroomStudentScreen({ ...input, sessionStatus: 'closed' }).kind, 'entry');
});

test('no-activity pages stay activity-free and paused pages remain readable', async () => {
  const model = await loadModel();
  const activities = model.createClassroomActivityCatalog(
    p1Activities.map(({ activity }) => activity),
  );
  const snapshot = studentSnapshot({
    lessonId: 'P01-L1', taskId: 'P01', nodeId: 'P1T1-N02', unitId: 'P01-ku-02',
    pageId: 'P01-L1-P02', pageIndex: 1, actionId: 'P1T1-N02-S02', actionIndex: 1,
    phase: 'lecture', revision: 11,
  });
  snapshot.classroom.status = 'paused';
  snapshot.classroom.activeLesson.status = 'paused';
  snapshot.classroom.activeLesson.pageCount = 6;

  const result = model.buildClassroomFollowViewModel(snapshot, activities);
  assert.equal(result.ok, true);
  assert.equal(result.value.readOnly, true);
  assert.equal(result.value.classroomActivity, undefined);
});

test('formal assessment and professional output targets remain independent of activities', async () => {
  const model = await loadModel();
  const activities = model.createClassroomActivityCatalog(
    p1Activities.map(({ activity }) => activity),
  );
  const assessment = model.buildClassroomFollowViewModel(studentSnapshot({
    lessonId: 'P02-L1', taskId: 'P02', nodeId: 'P1T2-N02', unitId: 'P02-ku-02',
    pageId: 'P02-L1-P06', pageIndex: 5, actionId: 'P1T2-N02-S06', actionIndex: 5,
    phase: 'assessment', revision: 12,
  }), activities);
  assert.equal(assessment.ok, true);
  assert.equal(assessment.value.classroomActivity.activity.id, 'P1T2-N02-transfer-01');
  assert.equal(assessment.value.formalAssessment.gameId, 'P1T2-N02-server-assessment');

  const output = model.buildClassroomFollowViewModel(studentSnapshot({
    lessonId: 'P02-L1', taskId: 'P02', nodeId: 'P1T2-N04', unitId: 'P02-ku-04',
    pageId: 'P02-L1-P05', pageIndex: 4, actionId: 'P1T2-N04-S05', actionIndex: 4,
    phase: 'practice', revision: 13,
  }), activities);
  assert.equal(output.ok, true);
  assert.equal(output.value.classroomActivity.activity.id, 'P1T2-N04-micro-01');
  assert.equal(output.value.professionalOutput.taskId, 'P02');
});

function studentSnapshot(cursor: Record<string, unknown>): any {
  return {
    audience: 'student',
    snapshotVersion: 12,
    generatedAt: '2026-07-18T00:00:00.000Z',
    serverNow: '2026-07-18T00:00:00.000Z',
    classroom: {
      sessionId: 'demo-class',
      classId: 'demo-class',
      revision: cursor.revision,
      status: 'active',
      activeLesson: {
        runId: 'lesson-run-p02',
        lessonId: cursor.lessonId,
        status: 'active',
        revision: cursor.revision,
        cursor: {
          lessonRunId: 'lesson-run-p02',
          playbackStatus: 'idle',
          positionMs: 0,
          rate: 1,
          audioOwner: 'teacher',
          updatedAt: '2026-07-18T00:00:00.000Z',
          ...cursor,
        },
        pageCount: 6,
      },
      activeTaskId: cursor.taskId,
      activeNodeId: cursor.nodeId,
      activeUnitId: cursor.unitId,
    },
    project: { projectId: 'P1', projectTitle: 'P1', finalOutputTitle: 'output', taskIds: ['P01', 'P02', 'P03'] },
    membership: { classSize: 3, joinedCount: 1, followingCount: 1 },
    submissions: {},
    classScores: { distribution: [] },
    helper: {},
    me: { studentId: 'stu-01', nodes: [], tasks: [], project: {}, learning: { nodes: [] } },
  };
}

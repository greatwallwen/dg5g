import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classroomLessonPageCountFromCatalog,
  classroomLessonPageFor,
  resolveClassroomLessonPage,
} from './classroom-lesson-page-catalog.ts';

const lessonIds = ['P01-L1', 'P01-L2', 'P02-L1', 'P03-L1'] as const;

test('catalog exposes exactly six bounded pages for every published classroom lesson', () => {
  for (const lessonId of lessonIds) {
    assert.equal(classroomLessonPageCountFromCatalog(lessonId, 99), 6, lessonId);
    assert.equal(classroomLessonPageFor(lessonId, 0)?.pageId, `${lessonId}-P01`);
    assert.equal(classroomLessonPageFor(lessonId, 5)?.pageId, `${lessonId}-P06`);
    assert.equal(classroomLessonPageFor(lessonId, -1), undefined);
    assert.equal(classroomLessonPageFor(lessonId, 6), undefined);
  }
});

test('catalog resolves an exact page cursor and rejects stale page or action coordinates', () => {
  const p02Page = resolveClassroomLessonPage({
    lessonId: 'P02-L1',
    pageId: 'P02-L1-P02',
    pageIndex: 1,
    phase: 'lecture',
    actionId: 'P1T2-N02-S02',
    actionIndex: 1,
  });
  assert.deepEqual(p02Page && {
    lessonId: p02Page.lessonId,
    taskId: p02Page.taskId,
    nodeId: p02Page.nodeId,
    unitId: p02Page.unitId,
    pageId: p02Page.pageId,
    pageIndex: p02Page.pageIndex,
    actionId: p02Page.actionId,
    actionIndex: p02Page.actionIndex,
    phase: p02Page.phase,
    canonicalActivityIds: p02Page.canonicalActivityIds,
  }, {
    lessonId: 'P02-L1',
    taskId: 'P02',
    nodeId: 'P1T2-N02',
    unitId: 'P02-ku-02',
    pageId: 'P02-L1-P02',
    pageIndex: 1,
    actionId: 'P1T2-N02-S02',
    actionIndex: 1,
    phase: 'lecture',
    canonicalActivityIds: ['P1T2-N02-foundation-01'],
  });

  for (const changed of [
    { pageId: 'P02-L1-P03' },
    { pageIndex: 2 },
    { actionId: 'P1T2-N01-S02' },
    { actionIndex: 0 },
  ]) {
    assert.equal(resolveClassroomLessonPage({
      lessonId: 'P02-L1',
      pageId: 'P02-L1-P02',
      pageIndex: 1,
      phase: 'lecture',
      actionId: 'P1T2-N02-S02',
      actionIndex: 1,
      ...changed,
    }), undefined);
  }
});

test('legacy node page counts remain truthful and never restore the N02 twelve-page fallback', () => {
  assert.equal(classroomLessonPageCountFromCatalog('P1T1-N02', 12), 6);
  assert.equal(classroomLessonPageCountFromCatalog('unknown-node', 4), 4);
});

test('formal assessments and professional outputs remain distinct from canonical activities', () => {
  const outputPage = classroomLessonPageFor('P02-L1', 4);
  assert.equal(outputPage?.professionalOutput?.kind, 'professional-output');
  assert.deepEqual(outputPage?.canonicalActivityIds, ['P1T2-N04-micro-01']);
  assert.equal(outputPage?.canonicalActivityIds.includes('P02'), false);

  const assessmentPage = classroomLessonPageFor('P02-L1', 5);
  assert.equal(assessmentPage?.formalAssessment?.kind, 'formal-assessment');
  assert.deepEqual(assessmentPage?.canonicalActivityIds, ['P1T2-N02-transfer-01']);
  assert.equal(
    assessmentPage?.canonicalActivityIds.includes('P1T2-N02-server-assessment'),
    false,
  );
});

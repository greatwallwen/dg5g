import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInitialTeachingCursor,
  parseTeachingCursor,
  resolveCanonicalActivityId,
} from './teaching-cursor.ts';
import { classroomLessonPageFor } from './classroom-lesson-page-catalog.ts';

test('creates and parses the exact authoritative cursor for a stable lesson anchor', () => {
  const cursor = createInitialTeachingCursor({
    lessonRunId: 'lesson-run-001',
    lessonId: 'P01-L1',
    revision: 1,
    now: new Date('2026-07-17T01:00:00.000Z'),
  });

  assert.deepEqual(Object.keys(cursor).sort(), [
    'actionId', 'actionIndex', 'audioOwner', 'lessonId', 'lessonRunId', 'nodeId',
    'pageId', 'pageIndex', 'phase', 'playbackStatus', 'positionMs', 'rate',
    'revision', 'taskId', 'unitId', 'updatedAt',
  ].sort());
  assert.deepEqual(
    {
      lessonId: cursor.lessonId,
      taskId: cursor.taskId,
      nodeId: cursor.nodeId,
      unitId: cursor.unitId,
      pageId: cursor.pageId,
      pageIndex: cursor.pageIndex,
      phase: cursor.phase,
    },
    {
      lessonId: 'P01-L1',
      taskId: 'P01',
      nodeId: 'P1T1-N01',
      unitId: 'P01-ku-01',
      pageId: 'P01-L1-P01',
      pageIndex: 0,
      phase: 'lecture',
    },
  );
  assert.deepEqual(parseTeachingCursor(JSON.parse(JSON.stringify(cursor))), cursor);
  assert.equal(resolveCanonicalActivityId({
    ...cursor,
    actionId: 'P1T1-N01-micro-01',
  }), 'P1T1-N01-micro-01');
  assert.equal('canonicalActivityId' in cursor, false);
});

test('rejects a syntactically valid cursor whose relational identities conflict', () => {
  const cursor = createInitialTeachingCursor({
    lessonRunId: 'lesson-run-001',
    lessonId: 'P01-L1',
    revision: 1,
    now: new Date('2026-07-17T01:00:00.000Z'),
  });

  assert.equal(parseTeachingCursor({ ...cursor, taskId: 'P02' }), undefined);
  assert.equal(parseTeachingCursor({ ...cursor, nodeId: 'P1T2-N01' }), undefined);
  assert.equal(parseTeachingCursor({ ...cursor, unitId: 'P01-ku-99' }), undefined);
  assert.equal(parseTeachingCursor({ ...cursor, pageId: 'P01-L2-P01' }), undefined);
  assert.equal(parseTeachingCursor(cursor, { expectedLessonRunId: 'lesson-run-other' }), undefined);
});

test('accepts all 24 canonical lesson pages and rejects every independently forged coordinate', () => {
  for (const lessonId of ['P01-L1', 'P01-L2', 'P02-L1', 'P03-L1'] as const) {
    for (let pageIndex = 0; pageIndex < 6; pageIndex += 1) {
      const page = classroomLessonPageFor(lessonId, pageIndex);
      assert.ok(page);
      const cursor = {
        ...createInitialTeachingCursor({
          lessonRunId: `lesson-run-${lessonId}`,
          lessonId,
          revision: 7,
          now: new Date('2026-07-17T01:00:00.000Z'),
        }),
        lessonId: page.lessonId,
        taskId: page.taskId,
        nodeId: page.nodeId,
        unitId: page.unitId,
        pageId: page.pageId,
        pageIndex: page.pageIndex,
        actionId: page.actionId,
        actionIndex: page.actionIndex,
        phase: 'practice' as const,
      };
      assert.deepEqual(parseTeachingCursor(cursor), cursor, `${lessonId} page ${pageIndex}`);

      const otherIndex = pageIndex === 0 ? 1 : 0;
      const otherPage = classroomLessonPageFor(lessonId, otherIndex);
      assert.ok(otherPage);
      for (const forged of [
        { pageId: otherPage.pageId },
        { pageIndex: otherPage.pageIndex },
        { actionId: otherPage.actionId },
        { actionIndex: otherPage.actionIndex },
        { nodeId: otherPage.nodeId === page.nodeId ? 'P1T1-N04' : otherPage.nodeId },
        { unitId: otherPage.unitId === page.unitId ? 'P01-ku-04' : otherPage.unitId },
      ]) {
        assert.equal(
          parseTeachingCursor({ ...cursor, ...forged }),
          undefined,
          `${lessonId} page ${pageIndex} accepted ${JSON.stringify(forged)}`,
        );
      }
    }
  }
});

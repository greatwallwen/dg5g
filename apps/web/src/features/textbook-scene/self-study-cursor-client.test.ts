import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSelfStudyCursorClient,
  selfStudySectionFromCursor,
} from './self-study-cursor-client.ts';

test('self-study cursor client sends only cursor fields to the actor-scoped node route', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const cursor = {
    studentId: 'stu-01', nodeId: 'P1T1-N02', unitId: 'P01-ku-02',
    actionId: 'figure', actionIndex: 1, positionMs: 0,
  } as const;
  const client = createSelfStudyCursorClient(async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json({ cursor });
  });

  await client.read('P1T1-N02');
  await client.save('P1T1-N02', {
    unitId: 'P01-ku-02', actionId: 'figure', actionIndex: 1, positionMs: 0,
  });

  assert.deepEqual(calls.map(({ url }) => url), [
    '/api/self-study/cursors/P1T1-N02',
    '/api/self-study/cursors/P1T1-N02',
  ]);
  assert.equal(calls[1]?.init?.method, 'PUT');
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    unitId: 'P01-ku-02', actionId: 'figure', actionIndex: 1, positionMs: 0,
  });
  assert.equal(String(calls[1]?.init?.body).includes('studentId'), false);
  assert.ok(calls.every(({ init }) => init?.credentials === 'same-origin'));
});

test('cursor restoration accepts six canonical sections and seeded legacy playback ids', () => {
  for (const [actionId, expected] of [
    ['problem', 'problem'],
    ['figure', 'figure'],
    ['steps', 'steps'],
    ['correction', 'correction'],
    ['practice', 'practice'],
    ['output', 'output'],
    ['P1T1-N02-lesson-case', 'problem'],
    ['P1T1-N02-lesson-visual', 'figure'],
    ['P1T1-N02-lesson-procedure', 'steps'],
    ['P1T1-N02-lesson-correction', 'correction'],
    ['P1T1-N02-lesson-practice', 'practice'],
    ['P1T1-N02-lesson-output', 'output'],
  ] as const) {
    assert.equal(selfStudySectionFromCursor({ actionId }), expected, actionId);
  }
  assert.equal(selfStudySectionFromCursor({ actionId: 'not-a-section' }), undefined);
});

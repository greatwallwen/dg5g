import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSelfStudyCursorPersistenceCoordinator,
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
  }, '2026-07-17T08:00:00.001Z');

  assert.deepEqual(calls.map(({ url }) => url), [
    '/api/self-study/cursors/P1T1-N02',
    '/api/self-study/cursors/P1T1-N02',
  ]);
  assert.equal(calls[1]?.init?.method, 'PUT');
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    unitId: 'P01-ku-02', actionId: 'figure', actionIndex: 1, positionMs: 0,
    mutationAt: '2026-07-17T08:00:00.001Z',
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

test('cursor persistence ignores a late restore after local section interaction', async () => {
  const restored = deferred<{ actionId: string }>();
  const coordinator = createSelfStudyCursorPersistenceCoordinator(async () => undefined);

  const pending = coordinator.restore(restored.promise);
  coordinator.markLocalInteraction();
  restored.resolve({ actionId: 'problem' });

  assert.equal(await pending, undefined);
});

test('cursor persistence serializes writes and coalesces rapid changes to the latest section', async () => {
  const first = deferred<void>();
  const second = deferred<void>();
  const saved: string[] = [];
  const coordinator = createSelfStudyCursorPersistenceCoordinator(async (_nodeId, draft) => {
    saved.push(draft.actionId ?? '');
    await (saved.length === 1 ? first.promise : second.promise);
  });

  const problem = coordinator.schedule('P1T1-N02', cursor('problem'));
  const figure = coordinator.schedule('P1T1-N02', cursor('figure'));
  const steps = coordinator.schedule('P1T1-N02', cursor('steps'));
  assert.deepEqual(saved, ['problem']);

  first.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(saved, ['problem', 'steps']);

  second.resolve();
  await Promise.all([problem, figure, steps]);
  assert.deepEqual(saved, ['problem', 'steps']);
});

test('cleanup scheduling cannot overtake the newest queued cursor', async () => {
  const first = deferred<void>();
  const final = deferred<void>();
  const saved: string[] = [];
  const coordinator = createSelfStudyCursorPersistenceCoordinator(async (_nodeId, draft) => {
    saved.push(draft.actionId ?? '');
    await (saved.length === 1 ? first.promise : final.promise);
  });

  const problem = coordinator.schedule('P1T1-N02', cursor('problem'));
  const figure = coordinator.schedule('P1T1-N02', cursor('figure'));
  const cleanup = coordinator.schedule('P1T1-N02', cursor('output'));
  first.resolve();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(saved, ['problem', 'output']);

  final.resolve();
  await Promise.all([problem, figure, cleanup]);
  assert.deepEqual(saved, ['problem', 'output']);
});

test('unload flush dispatches the newest cursor immediately with a newer mutation order', async () => {
  const first = deferred<void>();
  const flushed = deferred<void>();
  const saved: Array<{ actionId: string; mutationAt: string }> = [];
  const coordinator = createSelfStudyCursorPersistenceCoordinator(
    async (_nodeId, draft, mutationAt) => {
      saved.push({ actionId: draft.actionId ?? '', mutationAt });
      await (saved.length === 1 ? first.promise : flushed.promise);
    },
    () => 1_000,
  );

  const pending = coordinator.schedule('P1T1-N02', cursor('problem'));
  const unload = coordinator.flush('P1T1-N02', cursor('output'));

  assert.deepEqual(saved.map(({ actionId }) => actionId), ['problem', 'output']);
  assert.ok(Date.parse(saved[1]!.mutationAt) > Date.parse(saved[0]!.mutationAt));

  flushed.resolve();
  await unload;
  first.resolve();
  await pending;
});

function cursor(actionId: 'problem' | 'figure' | 'steps' | 'correction' | 'practice' | 'output') {
  return { unitId: 'P01-ku-02', actionId, actionIndex: 0, positionMs: 0 };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

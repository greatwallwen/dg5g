import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClassSession } from '@/platform/models';
import { createHttpClassroomTransport, selectNewerClassSession } from './classroom-transport.ts';

const session = { sessionId: 'P1T1-N02' } as ClassSession;

test('uses the session cookie and sends no client-controlled role or student identity', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const transport = createHttpClassroomTransport(async (input, init) => {
    calls.push({ input: String(input), init });
    return Response.json({ session });
  });

  const result = await transport.fetchSession('P1T1-N02', 'student', 'stu-01');

  assert.equal(result.ok, true);
  assert.equal(calls[0]?.input, '/api/class-sessions/P1T1-N02');
  assert.equal(calls[0]?.init?.cache, 'no-store');
  assert.equal(new Headers(calls[0]?.init?.headers).has('x-dgbook-class-role'), false);
});

test('translates student UI state into a narrow action without authority fields', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const transport = createHttpClassroomTransport(async (input, init) => {
    calls.push({ input: String(input), init });
    return Response.json({ session });
  });

  await transport.patchSession('P1T1-N02', 'student', 'stu-01', {
    activityState: 'submitted',
    submissionState: 'submitted',
    submissionAnswers: ['AAU nameplate', 'fiber label'],
    studentProgress: {
      studentId: 'stu-02',
      name: 'Forged name',
      mode: 'self',
      currentSlideIndex: 3,
      evidenceCount: 999,
      risk: 'ok',
      bestGameScore: 100,
    },
  });

  assert.equal(calls[0]?.init?.method, 'PATCH');
  assert.equal(new Headers(calls[0]?.init?.headers).has('x-dgbook-class-role'), false);
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    action: {
      type: 'activity_submitted',
      answers: ['AAU nameplate', 'fiber label'],
      mode: 'self',
      currentSlideIndex: 3,
    },
  });
});

test('keeps teacher patches revision-guarded on the teacher-only patch protocol', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const transport = createHttpClassroomTransport(async (input, init) => {
    calls.push({ input: String(input), init });
    return Response.json({ session });
  });

  await transport.patchSession('P1T1-N02', 'teacher', undefined, { reviewState: 'reviewing' }, 4);

  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    patch: { reviewState: 'reviewing' },
    expectedRevision: 4,
  });
});

test('submits teacher intent with an expected server revision', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const transport = createHttpClassroomTransport(async (input, init) => {
    calls.push({ input: String(input), init });
    return Response.json({ session, command: { commandId: 'cmd-1' } });
  });

  await transport.submitIntent('P1T1-N02', { type: 'phase_changed', phase: 'lecture' }, 4);

  assert.equal(calls[0]?.input, '/api/class-sessions/P1T1-N02');
  assert.equal(new Headers(calls[0]?.init?.headers).has('x-dgbook-class-role'), false);
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    intent: { type: 'phase_changed', phase: 'lecture' },
    expectedRevision: 4,
  });
});

test('returns an explicit transport failure instead of silently succeeding', async () => {
  const transport = createHttpClassroomTransport(async () => Response.json({ error: 'Helper unavailable' }, { status: 503 }));

  const result = await transport.fetchSession('P1T1-N02', 'teacher');

  assert.deepEqual(result, { ok: false, status: 503, error: 'Helper unavailable' });
});

test('preserves the authoritative revision returned by a conflict response', async () => {
  const transport = createHttpClassroomTransport(async () => Response.json({
    error: 'Classroom revision conflict',
    currentRevision: 7,
  }, { status: 409 }));

  const result = await transport.patchSession(
    'P1T1-N02',
    'teacher',
    undefined,
    { reviewState: 'reviewing' },
    4,
  );

  assert.deepEqual(result, {
    ok: false,
    status: 409,
    error: 'Classroom revision conflict',
    currentRevision: 7,
  });
});

test('orders classroom snapshots by authoritative revision before wall-clock timestamps', () => {
  const current = {
    ...session,
    lastUpdatedAt: '2026-07-13T02:00:10.000Z',
    lessonState: { revision: 4 },
  } as ClassSession;
  const newerRevision = {
    ...session,
    lastUpdatedAt: '2026-07-13T02:00:00.000Z',
    lessonState: { revision: 5 },
  } as ClassSession;
  const staleRevision = {
    ...session,
    lastUpdatedAt: '2026-07-13T02:00:20.000Z',
    lessonState: { revision: 3 },
  } as ClassSession;

  assert.equal(selectNewerClassSession(current, newerRevision).lessonState?.revision, 5);
  assert.equal(selectNewerClassSession(current, staleRevision).lessonState?.revision, 4);
});

test('does not roll an applied helper acknowledgement back on an equal classroom revision', () => {
  const current = {
    ...session,
    lastUpdatedAt: '2026-07-13T02:00:00.000Z',
    lessonState: { revision: 5 },
    commandAcks: [{ commandId: 'cmd-5', deviceId: 'device-stu-01', studentId: 'stu-01', state: 'applied', at: '2026-07-13T02:00:02.000Z' }],
  } as ClassSession;
  const delayed = {
    ...session,
    lastUpdatedAt: '2026-07-13T02:00:00.000Z',
    lessonState: { revision: 5 },
    commandAcks: [{ commandId: 'cmd-5', deviceId: 'device-stu-01', studentId: 'stu-01', state: 'queued', at: '2026-07-13T02:00:01.000Z' }],
  } as ClassSession;

  assert.equal(selectNewerClassSession(current, delayed).commandAcks?.[0]?.state, 'applied');
});

test('keeps applied acknowledgements monotonic when the classroom revision advances', () => {
  const current = {
    ...session,
    lessonState: { revision: 5 },
    commandAcks: [{ commandId: 'cmd-5', deviceId: 'device-stu-01', studentId: 'stu-01', state: 'applied', at: '2026-07-13T02:00:02.000Z' }],
  } as ClassSession;
  const incoming = {
    ...session,
    lessonState: { revision: 6 },
    commandAcks: [{ commandId: 'cmd-5', deviceId: 'device-stu-01', studentId: 'stu-01', state: 'queued', at: '2026-07-13T02:00:01.000Z' }],
  } as ClassSession;

  const selected = selectNewerClassSession(current, incoming);

  assert.equal(selected.lessonState?.revision, 6);
  assert.equal(selected.commandAcks?.[0]?.state, 'applied');
});

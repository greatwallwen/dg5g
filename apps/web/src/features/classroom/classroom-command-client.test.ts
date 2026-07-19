import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canSubmitClassroomCursorCommands,
  createClassroomCommandClient,
  createClassroomCommandRunner,
} from './classroom-command-client.ts';

test('lesson cursor command sends the active lesson CAS and exposes only command metadata', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const client = createClassroomCommandClient(async (input, init) => {
    calls.push({ input: String(input), init });
    return Response.json({
      session: { lessonState: { revision: 8 } },
      command: { revision: 8 },
    });
  });

  const result = await client.submitLessonIntent({
    sessionId: 'demo-class',
    lessonRunId: 'lesson-run-p02',
    expectedRevision: 7,
    intent: { type: 'page_changed', pageIndex: 5 },
    responseView: 'projector',
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls[0]?.input, '/api/class-sessions/demo-class/lesson?view=projector');
  assert.equal(calls[0]?.init?.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    lessonRunId: 'lesson-run-p02',
    expectedRevision: 7,
    intent: { type: 'page_changed', pageIndex: 5 },
  });
});

test('assessment commands use the narrow POST contract with both revision clocks', async () => {
  const bodies: unknown[] = [];
  const client = createClassroomCommandClient(async (_input, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ runId: 'assessment-run', revision: 3 });
  });

  assert.equal((await client.submitAssessment('demo-class', {
    type: 'start',
    lessonRunId: 'lesson-run-p02',
    nodeId: 'P1T2-N02',
    gameId: 'P1T2-N02-server-assessment',
    expectedClassroomRevision: 7,
  })).ok, true);
  assert.equal((await client.submitAssessment('demo-class', {
    type: 'pause', runId: 'assessment-run', expectedRevision: 3,
  })).ok, true);
  assert.deepEqual(bodies, [
    { command: {
      type: 'start', lessonRunId: 'lesson-run-p02', nodeId: 'P1T2-N02',
      gameId: 'P1T2-N02-server-assessment', expectedClassroomRevision: 7,
    } },
    { command: { type: 'pause', runId: 'assessment-run', expectedRevision: 3 } },
  ]);
});

test('lesson lifecycle close explicitly collects a running assessment before ending class', async () => {
  const calls: Array<{ input: string; body: unknown }> = [];
  const client = createClassroomCommandClient(async (input, init) => {
    calls.push({ input: String(input), body: JSON.parse(String(init?.body)) });
    return Response.json({ command: { revision: 9 } });
  });

  const result = await client.submitLessonLifecycle({
    sessionId: 'demo-class', lessonRunId: 'lesson-run-p02', expectedRevision: 8,
    command: { type: 'close', collectAssessment: true },
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [{
    input: '/api/class-sessions/demo-class/lesson',
    body: {
      lessonRunId: 'lesson-run-p02', expectedRevision: 8,
      command: { type: 'close', collectAssessment: true },
    },
  }]);
});

test('command runner blocks stale follow-up CAS until a newer authoritative cut arrives', async () => {
  const expected: number[] = [];
  let refreshCount = 0;
  const runner = createClassroomCommandRunner({
    authority: {
      sessionId: 'demo-class', lessonRunId: 'lesson-run-p02', classroomRevision: 7,
      snapshotVersion: 20,
    },
    client: {
      submitLessonIntent: async (input) => {
        expected.push(input.expectedRevision);
        return { ok: true };
      },
      submitAssessment: async () => ({ ok: true }),
      submitLessonLifecycle: async () => ({ ok: true }),
    },
    refreshNow: () => { refreshCount += 1; },
  });

  assert.equal(await runner.submitLessonIntent({ type: 'phase_changed', phase: 'practice' }), true);
  assert.equal(runner.isAwaitingAuthoritativeCut(), true);
  assert.equal(await runner.submitLessonIntent({ type: 'phase_changed', phase: 'challenge' }), false);
  runner.synchronizeAuthority({
    sessionId: 'demo-class', lessonRunId: 'lesson-run-p02', classroomRevision: 7,
    snapshotVersion: 20,
  });
  assert.equal(await runner.submitLessonIntent({ type: 'phase_changed', phase: 'challenge' }), false);
  runner.synchronizeAuthority({
    sessionId: 'demo-class', lessonRunId: 'lesson-run-p02', classroomRevision: 8,
    snapshotVersion: 21,
  });
  assert.equal(runner.isAwaitingAuthoritativeCut(), false);
  assert.equal(await runner.submitLessonIntent({ type: 'phase_changed', phase: 'challenge' }), true);
  assert.deepEqual(expected, [7, 8]);
  assert.equal(refreshCount, 2);
});

test('semantic 409 refreshes without waiting forever and remains retryable', async () => {
  let attempts = 0;
  let refreshCount = 0;
  const runner = createClassroomCommandRunner({
    authority: {
      sessionId: 'demo-class', lessonRunId: 'lesson-run-p02', classroomRevision: 7,
      snapshotVersion: 20,
    },
    client: {
      submitLessonIntent: async () => {
        attempts += 1;
        return { ok: false, status: 409, error: 'Lesson is paused.' };
      },
      submitAssessment: async () => ({ ok: true }),
      submitLessonLifecycle: async () => ({ ok: true }),
    },
    refreshNow: () => { refreshCount += 1; },
  });

  assert.equal(await runner.submitLessonIntent({ type: 'page_changed', pageIndex: 1 }), false);
  assert.equal(runner.isAwaitingAuthoritativeCut(), false);
  assert.equal(await runner.submitLessonIntent({ type: 'page_changed', pageIndex: 1 }), false);
  assert.equal(runner.isAwaitingAuthoritativeCut(), false);
  assert.equal(runner.lastError(), 'Lesson is paused.');
  assert.equal(attempts, 2);
  assert.equal(refreshCount, 2);
});

test('revision 409 waits for a newer cut and cursor commands require an active lesson', async () => {
  const runner = createClassroomCommandRunner({
    authority: {
      sessionId: 'demo-class', lessonRunId: 'lesson-run-p02', classroomRevision: 7,
      snapshotVersion: 20,
    },
    client: {
      submitLessonIntent: async () => ({
        ok: false, status: 409, error: 'Revision conflict.', currentRevision: 8,
      }),
      submitAssessment: async () => ({ ok: true }),
      submitLessonLifecycle: async () => ({ ok: true }),
    },
    refreshNow: () => {},
  });

  assert.equal(await runner.submitLessonIntent({ type: 'page_changed', pageIndex: 1 }), false);
  assert.equal(runner.isAwaitingAuthoritativeCut(), true);
  assert.equal(canSubmitClassroomCursorCommands('online', 'active'), true);
  assert.equal(canSubmitClassroomCursorCommands('degraded', 'active'), true);
  assert.equal(canSubmitClassroomCursorCommands('online', 'paused'), false);
  assert.equal(canSubmitClassroomCursorCommands('online', 'preparing'), false);
  assert.equal(canSubmitClassroomCursorCommands('offline', 'active'), false);
  assert.equal(canSubmitClassroomCursorCommands('online', undefined), false);
});

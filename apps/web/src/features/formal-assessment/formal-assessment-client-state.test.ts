import assert from 'node:assert/strict';
import test from 'node:test';
import type { ActiveIssuedAssessmentPaper, IssuedAssessmentPaper } from '@/platform/formal-assessment-contract.ts';
import {
  createDraftSaveCoordinator,
  createClassroomAssessmentResumeCoordinator,
  adoptSubmittedAssessmentResult,
  expireIssuedAssessment,
  isAssessmentAttemptActive,
  pauseIssuedAssessment,
  projectClassroomIssuedAssessment,
  type PausedIssuedAssessment,
} from './formal-assessment-client-state.ts';

test('formed result closes attempt activity even while its token prop remains unchanged', () => {
  assert.equal(isAssessmentAttemptActive('token', false, false), true);
  assert.equal(isAssessmentAttemptActive('token', false, true), false);
  assert.equal(isAssessmentAttemptActive(undefined, false, false), false);
});

test('a paused snapshot projects an active attempt to a tokenless paper before render', () => {
  const active = issued('in-progress');
  const projected = projectClassroomIssuedAssessment({
    classroomRunId: 'run-1',
    currentIssued: active,
    observation: { runId: 'run-1', status: 'paused' },
    savedDraft: active.draft,
    timing: { serverNow: active.serverNow, expiresAt: active.expiresAt },
  });

  assert.equal(projected.state, 'paused');
  assert.equal(Object.hasOwn(projected, 'attemptToken'), false);
});

test('cancelling autosave drops its queued follow-up and blocks future PATCH scheduling', async () => {
  const firstSave = deferred<{ revision: number }>();
  const calls: string[] = [];
  const coordinator = createDraftSaveCoordinator({
    initialRevision: 2,
    save: async (answers) => {
      calls.push(answers.evidenceClassification ?? '');
      return firstSave.promise;
    },
  });

  coordinator.schedule({ evidenceClassification: 'already-in-flight' });
  coordinator.schedule({ evidenceClassification: 'queued-before-pause' });
  assert.deepEqual(calls, ['already-in-flight']);
  coordinator.cancel();
  firstSave.resolve({ revision: 3 });
  await coordinator.whenIdle();
  assert.equal(coordinator.revision(), 2);
  coordinator.schedule({ evidenceClassification: 'after-terminal-snapshot' });
  coordinator.retry();
  await Promise.resolve();

  assert.deepEqual(calls, ['already-in-flight']);
});

test('draft autosave retries the same local answers from the authoritative conflict revision', async () => {
  const calls: Array<{ answer: string; expectedRevision: number }> = [];
  const coordinator = createDraftSaveCoordinator({
    initialRevision: 2,
    save: async (answers, expectedRevision) => {
      calls.push({
        answer: answers.evidenceClassification ?? '',
        expectedRevision,
      });
      return calls.length === 1
        ? { revision: 3, retry: true }
        : { revision: 4 };
    },
  });

  coordinator.schedule({ evidenceClassification: 'latest-local-answer' });
  await coordinator.whenIdle();

  assert.deepEqual(calls, [
    { answer: 'latest-local-answer', expectedRevision: 2 },
    { answer: 'latest-local-answer', expectedRevision: 3 },
  ]);
  assert.equal(coordinator.revision(), 4);
});

test('draft autosave bounds automatic conflict rebasing and leaves the answer for explicit retry', async () => {
  const calls: number[] = [];
  const errors: unknown[] = [];
  const coordinator = createDraftSaveCoordinator({
    initialRevision: 2,
    save: async (_answers, expectedRevision) => {
      calls.push(expectedRevision);
      return { revision: expectedRevision + 1, retry: true };
    },
    onError: (error) => errors.push(error),
  });

  coordinator.schedule({ evidenceClassification: 'contended-answer' });
  await coordinator.whenIdle();

  assert.deepEqual(calls, [2, 3]);
  assert.equal(errors.length, 1);
  assert.equal(coordinator.revision(), 4);
});

test('same-run running snapshots share one resume request across repeated and in-flight observations', async () => {
  const pending = deferred<ActiveIssuedAssessmentPaper>();
  const paused = issued('paused');
  let requestCount = 0;
  const coordinator = createClassroomAssessmentResumeCoordinator({
    classroomRunId: 'run-1',
    paused,
    resume: async () => {
      requestCount += 1;
      return pending.promise;
    },
  });

  assert.equal(await coordinator.observe({ runId: 'other-run', status: 'running' }), undefined);
  assert.equal(await coordinator.observe({ runId: 'run-1', status: 'paused' }), undefined);
  const first = coordinator.observe({ runId: 'run-1', status: 'running' });
  const repeated = coordinator.observe({ runId: 'run-1', status: 'running' });
  assert.equal(requestCount, 1);

  const resumed = issued('in-progress');
  pending.resolve(resumed);
  assert.strictEqual(await first, resumed);
  assert.strictEqual(await repeated, resumed);
  assert.strictEqual(
    await coordinator.observe({ runId: 'run-1', status: 'running' }),
    resumed,
  );
  assert.equal(requestCount, 1);
});

test('a re-pause invalidates an in-flight resumed token and the next running epoch fetches fresh', async () => {
  const requests = [deferred<ActiveIssuedAssessmentPaper>(), deferred<ActiveIssuedAssessmentPaper>()];
  let requestCount = 0;
  const coordinator = createClassroomAssessmentResumeCoordinator({
    classroomRunId: 'run-1', paused: issued('paused'),
    resume: () => requests[requestCount++]!.promise,
  });
  const staleRequest = coordinator.observe({ runId: 'run-1', status: 'running' });
  await coordinator.observe({ runId: 'run-1', status: 'paused' });
  requests[0]!.resolve({ ...issued('in-progress'), attemptToken: 'stale-token-012345678901234567890123' });
  assert.equal(await staleRequest, undefined);

  const freshRequest = coordinator.observe({ runId: 'run-1', status: 'running' });
  assert.equal(requestCount, 2);
  const fresh = { ...issued('in-progress'), attemptToken: 'fresh-token-012345678901234567890123' };
  requests[1]!.resolve(fresh);
  assert.strictEqual(await freshRequest, fresh);
});

test('resume adopts a newer authoritative draft committed before the pause snapshot arrived', async () => {
  const paused = issued('paused');
  const committed = {
    ...issued('in-progress'),
    draft: {
      revision: paused.draft.revision + 1,
      answers: { evidenceClassification: 'delayed-committed-server-answer' },
    },
  };
  const coordinator = createClassroomAssessmentResumeCoordinator({
    classroomRunId: 'run-1', paused, resume: async () => committed,
  });

  assert.strictEqual(
    await coordinator.observe({ runId: 'run-1', status: 'running' }),
    committed,
  );
});

test('resume adopts a submitted terminal result for the same assessment without requesting a replacement', async () => {
  const paused = issued('paused');
  const submitted = {
    ...paused,
    state: 'submitted',
    result: { assessmentId: paused.assessmentId, attemptId: 'attempt-1' },
  } as unknown as IssuedAssessmentPaper;
  let requestCount = 0;
  const coordinator = createClassroomAssessmentResumeCoordinator({
    classroomRunId: 'run-1',
    paused,
    resume: async () => {
      requestCount += 1;
      return submitted;
    },
  });

  assert.strictEqual(
    await coordinator.observe({ runId: 'run-1', status: 'running' }),
    submitted,
  );
  assert.strictEqual(
    await coordinator.observe({ runId: 'run-1', status: 'running' }),
    submitted,
  );
  assert.equal(requestCount, 1);
});

test('resume rejects a replacement assessment or changed draft and repeated snapshots do not retry', async () => {
  const paused = issued('paused');
  for (const invalid of [
    { ...issued('in-progress'), assessmentId: 'replacement-assessment' },
    {
      ...issued('in-progress'),
      draft: { ...issued('in-progress').draft, answers: { evidenceClassification: 'changed' } },
    },
  ]) {
    let requestCount = 0;
    const coordinator = createClassroomAssessmentResumeCoordinator({
      classroomRunId: 'run-1',
      paused,
      resume: async () => {
        requestCount += 1;
        return invalid;
      },
    });

    await assert.rejects(
      coordinator.observe({ runId: 'run-1', status: 'running' }),
      /assessment|draft/i,
    );
    assert.equal(
      await coordinator.observe({ runId: 'run-1', status: 'running' }),
      undefined,
    );
    assert.equal(requestCount, 1);
  }
});

test('a failed resume stays paused until one explicit retry succeeds', async () => {
  const paused = issued('paused');
  const resumed = issued('in-progress');
  let requestCount = 0;
  const coordinator = createClassroomAssessmentResumeCoordinator({
    classroomRunId: 'run-1',
    paused,
    resume: async () => {
      requestCount += 1;
      if (requestCount === 1) throw new Error('offline');
      return resumed;
    },
  });

  await assert.rejects(
    coordinator.observe({ runId: 'run-1', status: 'running' }),
    /offline/,
  );
  assert.equal(await coordinator.observe({ runId: 'run-1', status: 'running' }), undefined);
  assert.equal(requestCount, 1);
  assert.strictEqual(await coordinator.retry(), resumed);
  assert.equal(requestCount, 2);
  assert.strictEqual(await coordinator.observe({ runId: 'run-1', status: 'running' }), resumed);
  assert.equal(requestCount, 2);
});

test('snapshot pause removes the token while preserving the same assessment and latest saved draft', () => {
  const active = issued('in-progress');
  const savedDraft = {
    revision: 3,
    answers: { evidenceClassification: 'latest-server-draft' },
    updatedAt: '2026-07-18T08:04:59.000Z',
  };
  const paused = pauseIssuedAssessment(active, savedDraft, {
    serverNow: '2026-07-18T08:05:00.000Z',
    expiresAt: '2026-07-18T08:10:00.000Z',
  });

  assert.equal(paused.state, 'paused');
  assert.equal(paused.assessmentId, active.assessmentId);
  assert.strictEqual(paused.draft, savedDraft);
  assert.equal(Object.hasOwn(paused, 'attemptToken'), false);
});

test('snapshot terminal status produces an expired read-only issue without a token', () => {
  const active = issued('in-progress');
  const expired = expireIssuedAssessment(active, active.draft, {
    serverNow: '2026-07-18T08:15:00.000Z',
    expiresAt: '2026-07-18T08:15:00.000Z',
  });

  assert.equal(expired.state, 'expired');
  assert.equal(expired.assessmentId, active.assessmentId);
  assert.equal(Object.hasOwn(expired, 'attemptToken'), false);
});

test('a same-run closed snapshot waits for an in-flight submit response and then keeps its result', () => {
  const active = issued('in-progress');
  const held = projectClassroomIssuedAssessment({
    classroomRunId: 'run-1',
    currentIssued: active,
    observation: { runId: 'run-1', status: 'closed' },
    savedDraft: active.draft,
    submissionPending: true,
    timing: { serverNow: active.serverNow, expiresAt: active.expiresAt },
  });
  assert.strictEqual(held, active);

  const submitted = adoptSubmittedAssessmentResult(active, {
    assessmentId: active.assessmentId,
    attemptId: 'attempt-1',
  } as never);
  const projected = projectClassroomIssuedAssessment({
    classroomRunId: 'run-1',
    currentIssued: submitted,
    observation: { runId: 'run-1', status: 'closed' },
    savedDraft: active.draft,
    submissionPending: false,
    timing: { serverNow: active.serverNow, expiresAt: active.expiresAt },
  });

  assert.strictEqual(projected, submitted);
  assert.equal(projected.state, 'submitted');
  assert.equal(Object.hasOwn(projected, 'attemptToken'), false);
});

test('a pending response cannot preserve an assessment after the classroom binds another run', () => {
  const active = issued('in-progress');
  const projected = projectClassroomIssuedAssessment({
    classroomRunId: 'run-1',
    currentIssued: active,
    observation: { runId: 'run-2', status: 'running' },
    savedDraft: active.draft,
    submissionPending: true,
    timing: { serverNow: active.serverNow, expiresAt: active.expiresAt },
  });

  assert.equal(projected.state, 'expired');
  assert.equal(Object.hasOwn(projected, 'attemptToken'), false);
});

function issued(state: 'paused'): PausedIssuedAssessment;
function issued(state: 'in-progress'): ActiveIssuedAssessmentPaper;
function issued(state: 'paused' | 'in-progress'): IssuedAssessmentPaper {
  const common = {
    assessmentId: 'assessment-1',
    serverNow: '2026-07-18T08:00:00.000Z',
    expiresAt: '2026-07-18T08:10:00.000Z',
    draft: {
      revision: 2,
      answers: {
        evidenceClassification: 'nameplate-photo',
        linkReconstruction: ['source-device', 'source-port'],
      },
    },
    paper: {
      nodeId: 'P1T1-N02',
      title: '设备拓扑正式测试',
      questionVersion: 'p01-n02-v1',
      passScore: 80,
      durationMinutes: 15,
      questions: [],
    },
  };
  return state === 'in-progress'
    ? { ...common, state, attemptToken: 'resume-token-with-enough-entropy' }
    : { ...common, state };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

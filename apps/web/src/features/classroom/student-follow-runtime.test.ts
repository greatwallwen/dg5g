import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

const runtimeUrl = new URL('./student-follow-runtime.ts', import.meta.url);

test('joins and persists self/follow mode only through the participation gateway', async () => {
  assert.equal(existsSync(runtimeUrl), true, 'student follow runtime must exist');
  const runtime = await import(runtimeUrl.href);
  const calls: string[] = [];
  const gateway = gatewayFixture(calls);

  const joined = await runtime.joinStudentClassroom(gateway, 'demo-class');
  const self = await runtime.changeStudentClassroomMode(gateway, 'demo-class', 'self');
  const follow = await runtime.changeStudentClassroomMode(gateway, 'demo-class', 'follow');

  assert.equal(joined.participation?.state, 'joined');
  assert.equal(self.participation?.mode, 'self');
  assert.equal(follow.participation?.mode, 'follow');
  assert.deepEqual(calls, [
    'join:demo-class',
    'mode:demo-class:self',
    'mode:demo-class:follow',
  ]);
});

test('leaves durably before navigation and never navigates when leave fails', async () => {
  assert.equal(existsSync(runtimeUrl), true, 'student follow runtime must exist');
  const runtime = await import(runtimeUrl.href);
  const calls: string[] = [];
  const gateway = gatewayFixture(calls);

  await runtime.leaveStudentClassroom(
    gateway,
    'demo-class',
    '/learn/P1T1-N02',
    (href: string) => calls.push(`navigate:${href}`),
  );
  assert.deepEqual(calls, ['leave:demo-class', 'navigate:/learn/P1T1-N02']);

  const failedCalls: string[] = [];
  await assert.rejects(() => runtime.leaveStudentClassroom(
    { ...gatewayFixture(failedCalls), leave: async () => {
      failedCalls.push('leave:demo-class');
      throw new Error('offline');
    } },
    'demo-class',
    '/learn/P1T1-N02',
    (href: string) => failedCalls.push(`navigate:${href}`),
  ), /offline/);
  assert.deepEqual(failedCalls, ['leave:demo-class']);
});

function gatewayFixture(calls: string[]) {
  return {
    async join(sessionId: string) {
      calls.push(`join:${sessionId}`);
      return snapshot('follow');
    },
    async setMode(sessionId: string, mode: 'follow' | 'self') {
      calls.push(`mode:${sessionId}:${mode}`);
      return snapshot(mode);
    },
    async leave(sessionId: string) {
      calls.push(`leave:${sessionId}`);
      return {
        ...snapshot('follow'),
        participation: { ...snapshot('follow').participation!, state: 'left' as const },
      };
    },
  };
}

function snapshot(mode: 'follow' | 'self') {
  return {
    participation: {
      sessionId: 'demo-class',
      studentId: 'stu-01',
      state: 'joined' as const,
      mode,
      joinedAt: '2026-07-16T01:00:00.000Z',
      updatedAt: '2026-07-16T01:00:00.000Z',
    },
    joinedCount: 1,
    followingCount: mode === 'follow' ? 1 : 0,
  };
}

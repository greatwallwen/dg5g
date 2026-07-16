import assert from 'node:assert/strict';
import test from 'node:test';
import type { ClassSession } from '@/platform/models';
import type { ClassroomTransport } from './classroom-transport.ts';
import { applyTeacherPatchWithRecovery } from './teacher-patch-mutation.ts';

function sessionAt(revision: number): ClassSession {
  return {
    sessionId: 'demo-class',
    lessonState: { revision },
  } as ClassSession;
}

function transportWith(overrides: Partial<ClassroomTransport>): ClassroomTransport {
  return {
    fetchSession: async () => ({ ok: false, status: 500, error: 'fetchSession not stubbed' }),
    patchSession: async () => ({ ok: false, status: 500, error: 'patchSession not stubbed' }),
    submitIntent: async () => ({ ok: false, status: 500, error: 'submitIntent not stubbed' }),
    ...overrides,
  };
}

test('uses the revision returned by one teacher patch for the next patch', async () => {
  const revisions: number[] = [];
  const transport = transportWith({
    patchSession: async (_sessionId, _role, _studentId, _patch, expectedRevision) => {
      revisions.push(expectedRevision ?? -1);
      return { ok: true as const, data: sessionAt((expectedRevision ?? 0) + 1) };
    },
  });

  const first = await applyTeacherPatchWithRecovery(
    transport,
    'demo-class',
    sessionAt(4),
    { reviewState: 'reviewing' },
  );
  assert.equal(first.ok, true);
  const second = await applyTeacherPatchWithRecovery(
    transport,
    'demo-class',
    first.session,
    { activityState: 'pushed' },
  );

  assert.equal(second.ok, true);
  assert.deepEqual(revisions, [4, 5]);
  assert.equal(second.session.lessonState?.revision, 6);
});

test('refreshes a conflicting teacher patch and safely retries the state assignment once', async () => {
  const revisions: number[] = [];
  let fetchCount = 0;
  const transport = transportWith({
    patchSession: async (_sessionId, _role, _studentId, _patch, expectedRevision) => {
      revisions.push(expectedRevision ?? -1);
      if (revisions.length === 1) {
        return {
          ok: false as const,
          status: 409,
          error: 'Classroom revision conflict',
          currentRevision: 5,
        };
      }
      return { ok: true as const, data: sessionAt(6) };
    },
    fetchSession: async () => {
      fetchCount += 1;
      return { ok: true as const, data: sessionAt(5) };
    },
  });

  const result = await applyTeacherPatchWithRecovery(
    transport,
    'demo-class',
    sessionAt(4),
    { reviewState: 'reviewing' },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(revisions, [4, 5]);
  assert.equal(fetchCount, 1);
  assert.equal(result.session.lessonState?.revision, 6);
});

test('marks the revision unsafe when conflict recovery cannot refresh authority', async () => {
  const transport = transportWith({
    patchSession: async () => ({
      ok: false as const,
      status: 409,
      error: 'Classroom revision conflict',
      currentRevision: 8,
    }),
    fetchSession: async () => ({ ok: false as const, status: 0, error: 'offline' }),
  });

  const result = await applyTeacherPatchWithRecovery(
    transport,
    'demo-class',
    sessionAt(7),
    { reviewState: 'reviewing' },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.revisionSynchronized, false);
  assert.equal(result.currentRevision, 8);
  assert.equal(result.session.lessonState?.revision, 7);
});

test('does not retry a conflicted patch after navigation changes the active classroom', async () => {
  let active = true;
  let patchCount = 0;
  let fetchCount = 0;
  const transport = transportWith({
    patchSession: async () => {
      patchCount += 1;
      return {
        ok: false,
        status: 409,
        error: 'Classroom revision conflict',
        currentRevision: 5,
      };
    },
    fetchSession: async () => {
      fetchCount += 1;
      active = false;
      return { ok: true, data: sessionAt(5) };
    },
  });

  const result = await applyTeacherPatchWithRecovery(
    transport,
    'old-class',
    sessionAt(4),
    { reviewState: 'reviewing' },
    () => active,
  );

  assert.equal(result.ok, false);
  assert.equal(fetchCount, 1);
  assert.equal(patchCount, 1);
});

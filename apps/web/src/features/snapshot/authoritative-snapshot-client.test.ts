import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAuthoritativeSnapshotController,
  fetchAuthoritativeSnapshot,
  useAuthoritativeSnapshotState,
} from './authoritative-snapshot-client.ts';

test('snapshot client requests the actor-scoped no-store endpoint and returns the matching cut', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const cut = {
    audience: 'teacher',
    snapshotVersion: 8,
    serverNow: '2026-07-18T08:00:00.000Z',
    classroom: { sessionId: 'demo-class', revision: 4, status: 'active' },
  };
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return Response.json(cut);
  };

  const snapshot = await fetchAuthoritativeSnapshot('teacher', 'demo-class', fetchImpl);

  assert.deepEqual(snapshot, cut);
  assert.deepEqual(calls, [{
    input: '/api/snapshot?audience=teacher&sessionId=demo-class',
    init: { cache: 'no-store', credentials: 'same-origin' },
  }]);
});

test('snapshot client rejects failed responses and mismatched audience bodies', async () => {
  await assert.rejects(
    fetchAuthoritativeSnapshot('projector', 'demo-class', async () => (
      Response.json({ error: 'forbidden' }, { status: 403 })
    )),
    /Snapshot request failed \(403\): forbidden/,
  );
  await assert.rejects(
    fetchAuthoritativeSnapshot('projector', 'demo-class', async () => (
      Response.json({
        audience: 'teacher',
        snapshotVersion: 8,
        serverNow: '2026-07-18T08:00:00.000Z',
        classroom: { sessionId: 'demo-class', revision: 4, status: 'active' },
      })
    )),
    /Snapshot response audience mismatch/,
  );
});

test('snapshot client rejects a different session and an incoherent classroom cut', async () => {
  await assert.rejects(
    fetchAuthoritativeSnapshot('projector', 'demo-class', async () => Response.json({
      audience: 'projector',
      snapshotVersion: 8,
      serverNow: '2026-07-18T08:00:00.000Z',
      classroom: { sessionId: 'other-class', revision: 4, status: 'active' },
    })),
    /Snapshot response session mismatch/,
  );

  await assert.rejects(
    fetchAuthoritativeSnapshot('projector', 'demo-class', async () => Response.json({
      audience: 'projector',
      snapshotVersion: 8,
      serverNow: '2026-07-18T08:00:00.000Z',
      classroom: { sessionId: 'demo-class', status: 'active' },
    })),
    /Snapshot classroom cut is incomplete/,
  );

  await assert.rejects(
    fetchAuthoritativeSnapshot('projector', 'demo-class', async () => Response.json({
      audience: 'projector',
      snapshotVersion: 8,
      serverNow: '2026-07-18T08:00:00.000Z',
      classroom: {
        sessionId: 'demo-class',
        revision: 5,
        status: 'active',
        activeLesson: { revision: 4, cursor: { revision: 3 } },
      },
    })),
    /Snapshot classroom cut is incoherent/,
  );

  await assert.rejects(
    fetchAuthoritativeSnapshot('student', 'demo-class', async () => Response.json({
      ...studentSnapshotCut(8, 'follow'),
      participation: {
        ...studentSnapshotCut(8, 'follow').participation,
        studentId: 'stu-02',
      },
    })),
    /student participation cut is incoherent/i,
  );
});

test('snapshot controller accepts a same-version cut to refresh serverNow', async () => {
  const clock = new ManualClock();
  const initialSnapshot = snapshotCut({ serverNow: '2026-07-18T08:00:00.000Z' });
  const refreshedSnapshot = snapshotCut({ serverNow: '2026-07-18T08:00:01.000Z' });
  const controller = createAuthoritativeSnapshotController({
    audience: 'teacher',
    sessionId: 'demo-class',
    initialSnapshot,
    clock,
    getPollContext: () => ({ visible: true, online: true }),
    fetchSnapshot: async () => refreshedSnapshot,
  });

  controller.start();
  await settleAsyncWork();

  assert.equal(controller.getState().snapshot.serverNow, '2026-07-18T08:00:01.000Z');
  assert.equal(controller.getState().connection.state, 'online');
  controller.stop();
});

test('snapshot controller rejects a stale cut and keeps the last complete snapshot', async () => {
  const clock = new ManualClock();
  const initialSnapshot = snapshotCut({ snapshotVersion: 8, classroomRevision: 4 });
  const controller = createAuthoritativeSnapshotController({
    audience: 'teacher',
    sessionId: 'demo-class',
    initialSnapshot,
    clock,
    getPollContext: () => ({ visible: true, online: true }),
    fetchSnapshot: async () => snapshotCut({ snapshotVersion: 7, classroomRevision: 3 }),
  });

  controller.start();
  await settleAsyncWork();

  assert.strictEqual(controller.getState().snapshot, initialSnapshot);
  assert.equal(controller.getState().connection.state, 'degraded');
  assert.match(controller.getState().connection.lastError ?? '', /stale/i);
  controller.stop();
});

test('snapshot controller keeps its last complete cut while exposing degraded and offline failures', async () => {
  const clock = new ManualClock();
  const initialSnapshot = snapshotCut();
  let online = true;
  let rejectRequest = false;
  const controller = createAuthoritativeSnapshotController({
    audience: 'teacher',
    sessionId: 'demo-class',
    initialSnapshot,
    clock,
    getPollContext: () => ({ visible: true, online }),
    fetchSnapshot: async () => {
      if (rejectRequest) throw new Error('temporary transport failure');
      return initialSnapshot;
    },
  });

  controller.start();
  await settleAsyncWork();
  rejectRequest = true;
  controller.refreshNow();
  await settleAsyncWork();
  assert.strictEqual(controller.getState().snapshot, initialSnapshot);
  assert.equal(controller.getState().connection.state, 'degraded');
  assert.equal(controller.getState().connection.lastSyncedAt, initialSnapshot.serverNow);

  online = false;
  controller.refreshNow();
  assert.equal(controller.getState().connection.state, 'offline');
  await settleAsyncWork();
  assert.strictEqual(controller.getState().snapshot, initialSnapshot);
  assert.equal(controller.getState().connection.state, 'offline');
  controller.stop();
});

test('student mutation transitions wait for a newer authoritative cut and concurrent tabs converge', async () => {
  const leftClock = new ManualClock();
  const rightClock = new ManualClock();
  const initial = studentSnapshotCut(8, null);
  let current = initial;
  const left = createAuthoritativeSnapshotController({
    audience: 'student',
    sessionId: 'demo-class',
    initialSnapshot: initial,
    clock: leftClock,
    getPollContext: () => ({ visible: true, online: true }),
    fetchSnapshot: async () => current,
  });
  const right = createAuthoritativeSnapshotController({
    audience: 'student',
    sessionId: 'demo-class',
    initialSnapshot: initial,
    clock: rightClock,
    getPollContext: () => ({ visible: true, online: true }),
    fetchSnapshot: async () => current,
  });
  left.start();
  right.start();
  await settleAsyncWork();

  let transitionReleased = false;
  const transition = left.refreshAfterSnapshotVersion(8).then((snapshot) => {
    transitionReleased = true;
    return snapshot;
  });
  await settleAsyncWork();
  assert.equal(transitionReleased, false, 'an equal-version confirmation cannot release the transition');

  current = studentSnapshotCut(9, 'self');
  left.refreshNow();
  right.refreshNow();
  await settleAsyncWork();
  const confirmed = await transition;

  assert.equal(confirmed.participation?.mode, 'self');
  assert.equal(left.getState().snapshot.participation?.mode, 'self');
  assert.equal(right.getState().snapshot.participation?.mode, 'self');
  left.stop();
  right.stop();
});

test('exports a hook state API for snapshot, connection, and refreshNow consumers', () => {
  assert.equal(typeof useAuthoritativeSnapshotState, 'function');
});

function snapshotCut(overrides: {
  audience?: 'teacher';
  sessionId?: string;
  snapshotVersion?: number;
  classroomRevision?: number;
  serverNow?: string;
} = {}): any {
  const classroomRevision = overrides.classroomRevision ?? 4;
  return {
    audience: overrides.audience ?? 'teacher',
    snapshotVersion: overrides.snapshotVersion ?? 8,
    generatedAt: '2026-07-18T07:59:59.000Z',
    serverNow: overrides.serverNow ?? '2026-07-18T08:00:00.000Z',
    classroom: {
      sessionId: overrides.sessionId ?? 'demo-class',
      classId: 'class-1',
      revision: classroomRevision,
      status: 'active',
    },
  };
}

function studentSnapshotCut(
  snapshotVersion: number,
  mode: 'follow' | 'self' | null,
): any {
  return {
    audience: 'student',
    snapshotVersion,
    generatedAt: '2026-07-18T07:59:59.000Z',
    serverNow: '2026-07-18T08:00:00.000Z',
    classroom: {
      sessionId: 'demo-class', classId: 'demo-class', revision: 4, status: 'active',
    },
    participation: mode === null ? null : {
      sessionId: 'demo-class', studentId: 'stu-01', state: 'joined', mode,
      joinedAt: '2026-07-18T07:59:59.000Z', updatedAt: '2026-07-18T07:59:59.000Z',
    },
    me: { studentId: 'stu-01' },
  };
}

async function settleAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

class ManualClock {
  #nextId = 1;
  #timers = new Map<number, () => void>();

  setTimeout = (run: () => void): number => {
    const id = this.#nextId++;
    this.#timers.set(id, run);
    return id;
  };

  clearTimeout = (id: number): void => { this.#timers.delete(id); };
}

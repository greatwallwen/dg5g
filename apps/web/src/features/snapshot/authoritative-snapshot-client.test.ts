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

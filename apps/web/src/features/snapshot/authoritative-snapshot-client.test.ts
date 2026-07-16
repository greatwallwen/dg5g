import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAuthoritativeSnapshot } from './authoritative-snapshot-client.ts';

test('snapshot client requests the actor-scoped no-store endpoint and returns the matching cut', async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return Response.json({ audience: 'teacher', snapshotVersion: 8 });
  };

  const snapshot = await fetchAuthoritativeSnapshot('teacher', 'demo-class', fetchImpl);

  assert.deepEqual(snapshot, { audience: 'teacher', snapshotVersion: 8 });
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
      Response.json({ audience: 'teacher', snapshotVersion: 8 })
    )),
    /Snapshot response audience mismatch/,
  );
});

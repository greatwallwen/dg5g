import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchCurrentActor,
  logoutCurrentActor,
  readDemoIdentity,
} from './role-session.ts';

test('logout rejects a non-success response and still clears the cached actor', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === '/api/auth/me') {
      return Response.json({
        actor: {
          userId: 'student-01',
          username: 'student01',
          displayName: '学生一',
          role: 'student',
        },
      });
    }
    return new Response(null, { status: 503 });
  };

  try {
    await fetchCurrentActor();
    assert.equal(readDemoIdentity()?.account, 'student01');
    await assert.rejects(logoutCurrentActor(), /503/);
    assert.equal(readDemoIdentity(), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

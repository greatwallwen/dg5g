import assert from 'node:assert/strict';
import test from 'node:test';
import { createClassroomParticipationClient } from './classroom-participation-client.ts';

test('participation client uses actor-cookie endpoints without client identity fields', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = createClassroomParticipationClient(async (input, init) => {
    calls.push({ url: String(input), init });
    return Response.json({
      participation: { sessionId: 'demo-class', studentId: 'stu-01', state: 'joined', mode: 'follow' },
      joinedCount: 1,
      followingCount: 1,
    });
  });

  await client.read('demo-class');
  await client.join('demo-class');
  await client.setMode('demo-class', 'self');
  await client.leave('demo-class');

  assert.deepEqual(calls.map(({ url }) => url), Array(4).fill('/api/class-sessions/demo-class/participation'));
  assert.deepEqual(calls.map(({ init }) => init?.method ?? 'GET'), ['GET', 'PUT', 'PATCH', 'DELETE']);
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), { mode: 'self' });
  assert.equal(calls.some(({ init }) => String(init?.body).includes('studentId')), false);
  assert.ok(calls.every(({ init }) => init?.credentials === 'same-origin'));
});

test('participation client surfaces a non-success response instead of pretending mutation success', async () => {
  const client = createClassroomParticipationClient(async () => Response.json(
    { error: 'Classroom session is not active' },
    { status: 409 },
  ));
  await assert.rejects(() => client.join('demo-class'), {
    name: 'ClassroomParticipationClientError',
    message: 'Classroom session is not active',
  });
});

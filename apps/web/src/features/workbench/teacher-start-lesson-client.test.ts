import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('startTeacherLesson waits for a matching active SQLite response before navigating', async () => {
  const { startTeacherLesson } = await clientModule();
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  const destinations: string[] = [];
  let releaseResponse: (response: Response) => void = () => undefined;
  const responsePromise = new Promise<Response>((resolve) => { releaseResponse = resolve; });
  let requestCount = 0;

  const pending = startTeacherLesson({
    sessionId: 'demo-class',
    nodeId: 'P1T1-N02',
    expectedRevision: 7,
    request: async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      requestCount += 1;
      return requestCount === 1 ? responsePromise : Response.json({
        session: { sessionStatus: 'active', activeLessonRunId: 'lesson-run-8' },
      });
    },
    navigate: (href: string) => destinations.push(href),
  });
  await Promise.resolve();

  assert.deepEqual(destinations, []);
  assert.equal(calls[0]?.input, '/api/class-sessions/demo-class/lesson');
  assert.equal(calls[0]?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    nodeId: 'P1T1-N02',
    command: 'prepare',
    expectedRevision: 7,
  });

  releaseResponse(Response.json({
    session: {
      sessionStatus: 'preparing',
      activeLessonRunId: 'lesson-run-8',
      lessonState: { revision: 8 },
      activeNodeId: 'P1T1-N02',
      activeUnitId: 'P01-ku-02',
    },
  }));
  await pending;

  assert.equal(calls[1]?.init?.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    lessonRunId: 'lesson-run-8',
    command: { type: 'start' },
    expectedRevision: 8,
  });
  assert.deepEqual(destinations, ['/teacher/sessions/demo-class']);
});

test('startTeacherLesson stays on the workbench for errors or a mismatched active node', async () => {
  const { startTeacherLesson } = await clientModule();
  for (const response of [
    Response.json({ error: 'Classroom node is not published' }, { status: 400 }),
    Response.json({
      session: { sessionStatus: 'active', activeNodeId: 'P1T1-N03', activeUnitId: 'P01-ku-03' },
    }),
  ]) {
    const destinations: string[] = [];
    await assert.rejects(
      startTeacherLesson({
        sessionId: 'demo-class',
        nodeId: 'P1T1-N02',
        expectedRevision: 7,
        request: async () => response,
        navigate: (href: string) => destinations.push(href),
      }),
      /not published|did not create an authoritative lesson run/i,
    );
    assert.deepEqual(destinations, []);
  }
});

test('startTeacherLesson exposes a conflict revision without navigating or replaying', async () => {
  const { startTeacherLesson } = await clientModule();
  const destinations: string[] = [];
  let requestCount = 0;

  const result = await startTeacherLesson({
    sessionId: 'demo-class',
    nodeId: 'P1T1-N02',
    expectedRevision: 7,
    request: async () => {
      requestCount += 1;
      return Response.json({
        error: 'Classroom revision conflict',
        currentRevision: 8,
      }, { status: 409 });
    },
    navigate: (href: string) => destinations.push(href),
  });

  assert.deepEqual(result, { status: 'conflict', currentRevision: 8 });
  assert.equal(requestCount, 1);
  assert.deepEqual(destinations, []);
});

test('the workbench stores the conflict revision for the next user click', () => {
  const source = readFileSync(new URL('./teacher-start-lesson-client.tsx', import.meta.url), 'utf8');

  assert.match(source, /const \[revision, setRevision\] = useState\(expectedRevision\)/);
  assert.match(source, /expectedRevision:\s*revision/);
  assert.match(source, /result\.status === 'conflict'/);
  assert.match(source, /setRevision\(result\.currentRevision\)/);
  assert.match(source, /状态已刷新，请再次点击/);
});

test('the clean workbench renders P01 lesson 1 as the primary two-click path', () => {
  const client = readFileSync(new URL('./teacher-start-lesson-client.tsx', import.meta.url), 'utf8');
  const workbench = readFileSync(new URL('./teacher-workbench.tsx', import.meta.url), 'utf8');

  assert.match(client, /data-start-lesson-primary/);
  assert.match(client, /data-primary-action=\{primary \? 'true' : undefined\}/);
  assert.match(client, /recommendedNodeId/);
  assert.match(workbench, /primary=\{model\.newLesson\.trigger\.primary\}/);
  assert.match(workbench, /recommendedNodeId=\{model\.newLesson\.recommendedNodeId\}/);
  assert.doesNotMatch(workbench, /className="role-home-primary is-disabled"/);
});

async function clientModule() {
  try {
    return await import('./teacher-start-lesson-client.tsx');
  } catch (error) {
    assert.fail(`teacher start-lesson client is not implemented: ${String(error)}`);
  }
}

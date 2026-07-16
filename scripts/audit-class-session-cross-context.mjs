#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './utils/playwright-browser.mjs';

const baseUrl = normalizeBaseUrl(readArg('--base-url', 'http://127.0.0.1:3157/'));
const sessionId = readArg('--session-id', 'demo-class');
const outDir = path.resolve(process.cwd(), readArg('--out', 'output/playwright/class-session-cross-context'));
const password = process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
const helperToken = process.env.DGBOOK_HELPER_TOKEN ?? 'dgbook-helper-demo-2026';
const report = {
  baseUrl,
  sessionId,
  checkedAt: new Date().toISOString(),
  classroom: {},
  participation: {},
  cursors: {},
  contexts: {},
  privacy: {},
};

assert(sessionId === 'demo-class', 'cross-context demo audit accepts only the real SQLite demo-class session');
await mkdir(outDir, { recursive: true });
const browser = await launchChromium({ headless: true });
const contexts = {};
try {
  contexts.teacher = await loginContext('teacher01', { width: 1440, height: 900 });
  contexts.studentFollow = await loginContext('student01', { width: 390, height: 844 });
  contexts.studentSelf = await loginContext('student02', { width: 390, height: 844 });
  contexts.studentLeft = await loginContext('student03', { width: 390, height: 844 });
  contexts.projector = await loginContext('teacher01', { width: 1440, height: 900 });

  report.classroom.helper = await refreshAuditHelper(contexts.teacher);
  report.classroom.activation = await ensureClassroomActive(contexts.teacher);

  await participationMutation(contexts.studentFollow, 'PUT');
  await participationMutation(contexts.studentFollow, 'PATCH', { mode: 'follow' });
  await participationMutation(contexts.studentSelf, 'PUT');
  await participationMutation(contexts.studentSelf, 'PATCH', { mode: 'self' });
  await participationMutation(contexts.studentLeft, 'PUT');
  await participationMutation(contexts.studentLeft, 'DELETE');

  report.participation.follow = await readParticipation(contexts.studentFollow);
  report.participation.self = await readParticipation(contexts.studentSelf);
  report.participation.left = await readParticipation(contexts.studentLeft);
  assertParticipation(report.participation);

  report.cursors.beforeClassroomMutation = await saveAndReadTwoCursors(contexts.studentSelf);
  await refreshAuditHelper(contexts.teacher);
  report.classroom.pageSynchronization = await auditPageSynchronization({
    projector: contexts.projector,
    studentFollow: contexts.studentFollow,
    studentSelf: contexts.studentSelf,
  });
  report.cursors.afterClassroomMutation = await readTwoCursors(contexts.studentSelf);
  assertDeepEqual(
    report.cursors.afterClassroomMutation,
    report.cursors.beforeClassroomMutation,
    'projector page revision overwrote the self-study student personal cursor',
  );

  const projectorSession = await apiJson(
    await contexts.projector.request.get(url(`/api/class-sessions/${sessionId}?view=projector`)),
    'projector class-session projection',
  );
  const projectorSnapshot = await apiJson(
    await contexts.projector.request.get(url(`/api/snapshot?audience=projector&sessionId=${sessionId}`)),
    'authoritative projector snapshot',
  );
  assertNoPersonLevelData(projectorSession.session, 'projector class-session projection');
  assertNoPersonLevelData(projectorSnapshot, 'authoritative projector snapshot');
  report.privacy = {
    classSessionProjection: 'no person-level fields',
    authoritativeSnapshot: 'no person-level fields',
  };

  await captureRolePage('teacher', contexts.teacher, `/teacher/sessions/${sessionId}`, '.teacher-console');
  await captureRolePage(
    'student-follow',
    contexts.studentFollow,
    `/classroom/${sessionId}`,
    '.follow-app[data-student-mode="follow"]',
    { joinedCount: '2', followingCount: '1' },
  );
  await captureRolePage(
    'student-self',
    contexts.studentSelf,
    `/classroom/${sessionId}`,
    '.follow-app[data-student-mode="self"]',
    { joinedCount: '2', followingCount: '1' },
  );
  await captureRolePage('projector', contexts.projector, `/present/${sessionId}`, '.projector-app');
} finally {
  await Promise.all(Object.values(contexts).map((context) => context.close()));
  await browser.close();
}

await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`class session cross-context audit passed: ${path.join(outDir, 'report.json')}`);

async function ensureClassroomActive(context) {
  const before = await readTeacherSession(context);
  if (before.sessionStatus === 'active') {
    return { beforeStatus: before.sessionStatus, afterStatus: before.sessionStatus, revision: before.lessonState.revision };
  }
  assert(before.sessionStatus !== 'closed', 'demo-class is closed and cannot accept student participation');
  const nextPhase = nextLegalPhase(before.lessonState.phase);
  assert(nextPhase, `demo-class phase ${before.lessonState.phase} cannot be activated`);
  const mutation = await teacherIntent(context, before.lessonState.revision, nextPhase);
  assert(mutation.session.sessionStatus === 'active', 'teacher intent did not activate demo-class');
  return {
    beforeStatus: before.sessionStatus,
    afterStatus: mutation.session.sessionStatus,
    phase: mutation.session.lessonState.phase,
    revision: mutation.session.lessonState.revision,
  };
}

async function auditPageSynchronization({ projector, studentFollow, studentSelf }) {
  const [projectorPage, followPage, selfPage] = await Promise.all([
    projector.newPage(),
    studentFollow.newPage(),
    studentSelf.newPage(),
  ]);
  try {
    await Promise.all([
      projectorPage.goto(url(`/present/${sessionId}`), { waitUntil: 'networkidle' }),
      followPage.goto(url(`/classroom/${sessionId}`), { waitUntil: 'networkidle' }),
      selfPage.goto(url(`/classroom/${sessionId}`), { waitUntil: 'networkidle' }),
    ]);
    const projectorRoot = projectorPage.locator('.projector-app').first();
    const followRoot = followPage.locator('.follow-app[data-student-mode="follow"]').first();
    const selfRoot = selfPage.locator('.follow-app[data-student-mode="self"]').first();
    await Promise.all([
      projectorRoot.waitFor({ state: 'visible', timeout: 15_000 }),
      followRoot.waitFor({ state: 'visible', timeout: 15_000 }),
      selfRoot.waitFor({ state: 'visible', timeout: 15_000 }),
    ]);

    const before = await readTeacherSession(projector);
    assert(before.lessonState.activeNodeId === 'P1T1-N02', 'cross-context page audit requires the P1T1-N02 reference lesson');
    const beforeRevision = before.lessonState.revision;
    const beforePageIndex = before.lessonState.playback.actionIndex;
    const targetPageIndex = beforePageIndex < 11 ? beforePageIndex + 1 : beforePageIndex - 1;
    const action = targetPageIndex > beforePageIndex ? 'next-page' : 'previous-page';
    const control = projectorPage.locator(`[data-session-action="${action}"]`).first();
    await control.waitFor({ state: 'visible', timeout: 15_000 });
    assert(await control.isEnabled(), `projector ${action} control is disabled with a live helper`);
    await control.click();

    await projectorPage.waitForFunction(
      (pageIndex) => Number(document.querySelector('.scene-projector-topbar')?.getAttribute('data-slide-index')) === pageIndex + 1,
      targetPageIndex,
      { timeout: 15_000 },
    );
    await followPage.waitForFunction(
      (revision) => Number(document.querySelector('.follow-app')?.getAttribute('data-classroom-revision')) === revision,
      beforeRevision + 1,
      { timeout: 20_000 },
    );
    await selfPage.waitForFunction(
      (revision) => Number(document.querySelector('.classroom-self-status')?.getAttribute('data-teacher-revision')) === revision,
      beforeRevision + 1,
      { timeout: 25_000 },
    );

    const after = await readTeacherSession(projector);
    assert(after.lessonState.revision === beforeRevision + 1, 'projector page intent did not advance exactly one server revision');
    assert(after.lessonState.playback.actionIndex === targetPageIndex, 'projector page intent did not persist the target page');
    assert(after.lessonState.playback.actionId === `P1T1-N02-S${String(targetPageIndex + 1).padStart(2, '0')}`, 'projector page intent left a stale action identity');
    return {
      action,
      fromPageIndex: beforePageIndex,
      toPageIndex: targetPageIndex,
      fromRevision: beforeRevision,
      toRevision: after.lessonState.revision,
      followRevision: Number(await followRoot.getAttribute('data-classroom-revision')),
      selfTeacherRevision: Number(await selfPage.locator('.classroom-self-status').getAttribute('data-teacher-revision')),
      selfCursorPolicy: 'teacher update prompt only; personal cursor unchanged',
    };
  } finally {
    await Promise.all([projectorPage.close(), followPage.close(), selfPage.close()]);
  }
}

async function refreshAuditHelper(context) {
  const endpoint = url(`/api/class-sessions/${sessionId}/helper`);
  const results = [];
  for (const studentId of ['stu-01', 'stu-02', 'stu-03']) {
    const response = await context.request.patch(endpoint, {
      headers: { 'x-dgbook-helper-token': helperToken },
      data: {
        kind: 'heartbeat',
        actorRole: 'student',
        deviceId: `audit-device-${studentId}`,
        studentId,
        pageState: 'ready',
        lastAppliedRevision: 0,
      },
    });
    await apiJson(response, `audit helper heartbeat for ${studentId}`);
    results.push(studentId);
  }
  return { status: 'online', students: results };
}

async function teacherIntent(context, expectedRevision, phase) {
  return apiJson(await context.request.patch(url(`/api/class-sessions/${sessionId}`), {
    data: { intent: { type: 'phase_changed', phase }, expectedRevision },
  }), `teacher transition to ${phase}`);
}

async function readTeacherSession(context) {
  const payload = await apiJson(
    await context.request.get(url(`/api/class-sessions/${sessionId}`)),
    'teacher class-session read',
  );
  return payload.session;
}

async function participationMutation(context, method, data) {
  const endpoint = url(`/api/class-sessions/${sessionId}/participation`);
  const response = method === 'PUT'
    ? await context.request.put(endpoint)
    : method === 'PATCH'
      ? await context.request.patch(endpoint, { data })
      : await context.request.delete(endpoint);
  return apiJson(response, `${method} classroom participation`);
}

async function readParticipation(context) {
  return apiJson(
    await context.request.get(url(`/api/class-sessions/${sessionId}/participation`)),
    'classroom participation read',
  );
}

function assertParticipation(participation) {
  assert(participation.follow.participation?.state === 'joined', 'student01 did not remain joined');
  assert(participation.follow.participation?.mode === 'follow', 'student01 is not in follow mode');
  assert(participation.self.participation?.state === 'joined', 'student02 did not remain joined');
  assert(participation.self.participation?.mode === 'self', 'student02 is not in self mode');
  assert(participation.left.participation?.state === 'left', 'student03 did not explicitly leave');
  for (const snapshot of Object.values(participation)) {
    assert(snapshot.joinedCount === 2, `joinedCount diverged: ${snapshot.joinedCount}`);
    assert(snapshot.followingCount === 1, `followingCount diverged: ${snapshot.followingCount}`);
  }
}

async function saveAndReadTwoCursors(context) {
  await putCursor(context, 'P1T1-N01', { actionIndex: 0, positionMs: 1_111 });
  await putCursor(context, 'P1T1-N02', { actionIndex: 1, positionMs: 2_222 });
  return readTwoCursors(context);
}

async function putCursor(context, nodeId, data) {
  return apiJson(
    await context.request.put(url(`/api/self-study/cursors/${nodeId}`), { data }),
    `save ${nodeId} cursor`,
  );
}

async function readTwoCursors(context) {
  const [nodeOne, nodeTwo] = await Promise.all([
    apiJson(await context.request.get(url('/api/self-study/cursors/P1T1-N01')), 'read P1T1-N01 cursor'),
    apiJson(await context.request.get(url('/api/self-study/cursors/P1T1-N02')), 'read P1T1-N02 cursor'),
  ]);
  assert(nodeOne.cursor.positionMs === 1_111, 'P1T1-N01 personal cursor did not persist');
  assert(nodeTwo.cursor.positionMs === 2_222, 'P1T1-N02 personal cursor did not persist');
  return { P1T1N01: nodeOne.cursor, P1T1N02: nodeTwo.cursor };
}

async function captureRolePage(role, context, route, selector, expectedCounts) {
  const page = await context.newPage();
  try {
    const response = await page.goto(url(route), { waitUntil: 'networkidle' });
    assert(response?.ok(), `${role} page returned ${response?.status() ?? 'no response'}`);
    const root = page.locator(selector).first();
    await root.waitFor({ state: 'visible', timeout: 15_000 });
    if (expectedCounts) {
      assert(await root.getAttribute('data-joined-count') === expectedCounts.joinedCount, `${role} joined count is stale`);
      assert(await root.getAttribute('data-following-count') === expectedCounts.followingCount, `${role} following count is stale`);
    }
    if (role === 'projector') {
      for (const action of ['previous-page', 'next-page', 'back-to-teacher']) {
        assert(await page.locator(`[data-session-action="${action}"]`).count() === 1, `projector is missing ${action}`);
      }
      const unexpectedActions = await page.locator('[data-session-action]:not([data-session-action="previous-page"]):not([data-session-action="next-page"]):not([data-session-action="back-to-teacher"])').count();
      assert(unexpectedActions === 0, 'projector exposed an unsupported teacher operation');
      assert(await page.locator('[data-student-id], [data-participant-id], [data-person-id]').count() === 0, 'projector exposed a person-level row');
      const visibleText = await page.locator('body').innerText();
      for (const studentId of ['stu-01', 'stu-02', 'stu-03']) {
        assert(!visibleText.includes(studentId), `projector rendered ${studentId}`);
      }
    }
    report.contexts[role] = {
      route,
      title: await page.title(),
      roleScope: await root.getAttribute('data-role-scope').catch(() => role),
    };
    await page.screenshot({ path: path.join(outDir, `${role}.png`), fullPage: true });
  } finally {
    await page.close();
  }
}

function assertNoPersonLevelData(value, label) {
  const serialized = JSON.stringify(value);
  for (const forbidden of ['studentRoster', 'studentProgress', 'studentId', 'students', 'participants', 'displayName']) {
    assert(!hasKey(value, forbidden), `${label} leaked key ${forbidden}`);
  }
  for (const studentId of ['stu-01', 'stu-02', 'stu-03']) {
    assert(!serialized.includes(studentId), `${label} leaked ${studentId}`);
  }
}

function hasKey(value, key) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => hasKey(item, key));
  return Object.prototype.hasOwnProperty.call(value, key)
    || Object.values(value).some((item) => hasKey(item, key));
}

function nextLegalPhase(phase) {
  return {
    prepare: 'lecture',
    lecture: 'question',
    question: 'lecture',
    practice: 'lecture',
    challenge: 'review',
    review: 'lecture',
  }[phase];
}

async function apiJson(response, label) {
  const body = await response.json().catch(() => undefined);
  assert(response.ok(), `${label} returned ${response.status()}: ${JSON.stringify(body)}`);
  return body;
}

async function loginContext(username, viewport) {
  const context = await browser.newContext({ viewport });
  const response = await context.request.post(url('/api/auth/login'), { data: { username, password } });
  assert(response.ok(), `${username} login returned ${response.status()}`);
  return context;
}

function assertDeepEqual(actual, expected, message) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function url(route) { return new URL(route.replace(/^\//, ''), baseUrl).toString(); }
function normalizeBaseUrl(value) { return value.endsWith('/') ? value : `${value}/`; }
function readArg(name, fallback) { const index = process.argv.indexOf(name); return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback; }
function assert(condition, message) { if (!condition) throw new Error(message); }

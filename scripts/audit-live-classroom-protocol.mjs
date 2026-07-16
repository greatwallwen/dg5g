#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const baseUrl = normalizeBaseUrl(readArg('--base-url', process.env.DGBOOK_WEB_DEMO_BASE_URL || 'http://8.153.206.97/'));
const sessionId = readArg('--session', 'demo-class');
const outPath = path.resolve(readArg('--out', 'output/runtime/live-classroom-protocol-report.json'));
const password = process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
const helperToken = process.env.DGBOOK_HELPER_TOKEN;
const report = {
  baseUrl,
  sessionId,
  checkedAt: new Date().toISOString(),
  authentication: {},
  teacher: {},
  students: [],
  helper: {},
};

const unauthorized = await fetch(api(`/api/class-sessions/${encodeURIComponent(sessionId)}`), { cache: 'no-store' });
assert(unauthorized.status === 401, `anonymous classroom read expected 401, received ${unauthorized.status}`);
report.authentication.anonymousStatus = unauthorized.status;

const teacherCookie = await login('teacher01');
const teacherSession = await getJson(`/api/class-sessions/${encodeURIComponent(sessionId)}`, teacherCookie);
const teacherClass = await getJson('/api/learning/class/demo-class', teacherCookie);
const studentIds = teacherClass.students?.map((student) => student.studentId).sort();
assert(JSON.stringify(studentIds) === JSON.stringify(['stu-01', 'stu-02', 'stu-03']), `teacher class roster mismatch: ${JSON.stringify(studentIds)}`);
assert(teacherSession.session?.sessionId, 'teacher session response is incomplete');
report.teacher = {
  classId: teacherClass.classId,
  classVersion: teacherClass.version,
  sessionRevision: teacherSession.session.lessonState?.revision ?? 0,
  activeNodeId: teacherSession.session.activeNodeId,
  roster: studentIds,
};

for (const [username, expectedStudentId] of [
  ['student01', 'stu-01'],
  ['student02', 'stu-02'],
  ['student03', 'stu-03'],
]) {
  const cookie = await login(username);
  const learning = await getJson('/api/learning/me', cookie);
  const classroom = await getJson(`/api/class-sessions/${encodeURIComponent(sessionId)}`, cookie);
  assert(learning.studentId === expectedStudentId, `${username} received another student's learning snapshot`);
  assert(classroom.session?.studentProgress?.studentId === expectedStudentId, `${username} received another student's classroom projection`);
  report.students.push({
    username,
    studentId: expectedStudentId,
    learningVersion: learning.version,
    classroomRevision: classroom.session.lessonState?.revision ?? 0,
    activeNodeId: classroom.session.activeNodeId,
  });
}

const helperUrl = api(`/api/class-sessions/${encodeURIComponent(sessionId)}/helper`);
const helperDenied = await fetch(helperUrl, { cache: 'no-store' });
assert(helperDenied.status === 403, `helper endpoint without token expected 403, received ${helperDenied.status}`);
report.helper.unauthorizedStatus = helperDenied.status;
if (helperToken) {
  const helperResponse = await fetch(helperUrl, {
    cache: 'no-store',
    headers: { 'x-dgbook-helper-token': helperToken },
  });
  assert(helperResponse.ok, `authenticated helper read returned ${helperResponse.status}`);
  const helper = await helperResponse.json();
  report.helper.authenticated = true;
  report.helper.lessonRevision = helper.lesson?.revision ?? 0;
} else {
  report.helper.authenticated = false;
  report.helper.note = 'DGBOOK_HELPER_TOKEN not configured; privileged helper read skipped';
}

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`live classroom protocol audit passed: ${outPath}`);

async function login(username) {
  const response = await fetch(api('/api/auth/login'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert(response.ok, `${username} login returned ${response.status}`);
  const setCookie = response.headers.get('set-cookie');
  assert(setCookie, `${username} login did not issue a session cookie`);
  report.authentication[username] = response.status;
  return setCookie.split(';', 1)[0];
}

async function getJson(route, cookie) {
  const response = await fetch(api(route), {
    cache: 'no-store',
    headers: { cookie },
  });
  const body = await response.json().catch(() => ({}));
  assert(response.ok, `${route} returned ${response.status}: ${body.error ?? 'unknown error'}`);
  return body;
}

function api(route) {
  return new URL(route.replace(/^\//, ''), baseUrl).toString();
}

function normalizeBaseUrl(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './utils/playwright-browser.mjs';

const baseUrl = normalizeBaseUrl(readArg('--base-url', 'http://127.0.0.1:3157/'));
const sessionId = readArg('--session-id', 'demo-class');
const outDir = path.resolve(process.cwd(), readArg('--out', 'output/playwright/class-session-sync'));
const isolated = process.env.DGBOOK_AUDIT_ISOLATED_SQLITE === '1';
const password = process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
const expectedActors = new Map([
  ['teacher01', { role: 'teacher', userId: 'teacher-01' }],
  ['student01', { role: 'student', userId: 'stu-01' }],
  ['student02', { role: 'student', userId: 'stu-02' }],
  ['student03', { role: 'student', userId: 'stu-03' }],
]);
const report = {
  schema: 'dgbook.class-session-sync/v2',
  baseUrl,
  sessionId,
  isolated,
  checkedAt: new Date().toISOString(),
  authority: 'GET /api/snapshot only',
  helperRequired: false,
  checks: [],
};

assert.equal(sessionId, 'demo-class', 'sync audit accepts only the exact demo-class roster');
await mkdir(outDir, { recursive: true });
const browser = await launchChromium({ headless: true });
const contexts = [];
try {
  const teacher = await loginContext('teacher01');
  const students = await Promise.all(['student01', 'student02', 'student03'].map(loginContext));
  contexts.push(teacher, ...students);

  const [teacherSnapshot, projectorSnapshot, ...studentSnapshots] = await Promise.all([
    readSnapshot(teacher, 'teacher'),
    readSnapshot(teacher, 'projector'),
    ...students.map((context) => readSnapshot(context, 'student')),
  ]);
  assert.equal(teacherSnapshot.membership.classSize, 3);
  assert.deepEqual(
    teacherSnapshot.students.map(({ studentId }) => studentId).sort(),
    ['stu-01', 'stu-02', 'stu-03'],
  );
  assertProjectorPrivacy(projectorSnapshot);
  for (const snapshot of [projectorSnapshot, ...studentSnapshots]) {
    assert.deepEqual(classroomFacts(snapshot), classroomFacts(teacherSnapshot));
    assert.deepEqual(aggregateFacts(snapshot), aggregateFacts(teacherSnapshot));
  }
  report.checks.push({
    name: 'teacher projector and three students share one authoritative classroom cut',
    status: 'passed',
    snapshotVersion: teacherSnapshot.snapshotVersion,
    classroom: classroomFacts(teacherSnapshot),
  });

  const active = teacherSnapshot.classroom.activeLesson;
  if (active) {
    const exact = teachingPosition(teacherSnapshot);
    for (const [label, snapshot] of [
      ['projector', projectorSnapshot],
      ...studentSnapshots.map((snapshot, index) => [`student0${index + 1}`, snapshot]),
    ]) assert.deepEqual(teachingPosition(snapshot), exact, `${label} teaching position differs`);
    report.checks.push({
      name: 'lessonId pageId pageIndex pageCount and revision parity',
      status: 'passed',
      ...exact,
    });
  } else {
    report.checks.push({ name: 'no active lesson parity', status: 'passed' });
  }

  const [teacherSurface, projectorSurface, studentSurface] = await Promise.all([
    capture(teacher, `/teacher/sessions/${sessionId}`, '.teacher-console', 'teacher'),
    capture(teacher, `/present/${sessionId}`, '.projector-app', 'projector'),
    capture(students[0], `/classroom/${sessionId}`, '.follow-app', 'student01'),
  ]);
  assert.equal(teacherSurface.classroomRevision, teacherSnapshot.classroom.revision);
  assert.equal(projectorSurface.classroomRevision, projectorSnapshot.classroom.revision);
  assert.equal(studentSurface.classroomRevision, studentSnapshots[0].classroom.revision);
  if (active) {
    assert.equal(teacherSurface.lessonId, active.lessonId);
    assert.equal(teacherSurface.pageId, active.cursor.pageId);
    assert.equal(teacherSurface.pageIndex, active.cursor.pageIndex);
    assert.equal(projectorSurface.pageIndex, active.cursor.pageIndex);
    if (studentSnapshots[0].participation?.state === 'joined'
      && studentSnapshots[0].participation.mode === 'follow') {
      assert.equal(studentSurface.pageId, active.cursor.pageId);
    }
  }
  report.checks.push({
    name: 'route DOM facts agree with authoritative snapshots',
    status: 'passed',
    teacher: teacherSurface,
    projector: projectorSurface,
    student01: studentSurface,
  });
} finally {
  await Promise.allSettled(contexts.map((context) => context.close()));
  await browser.close();
}

await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`class session sync audit passed: ${path.join(outDir, 'report.json')}`);

async function loginContext(username) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const response = await context.request.post(url('/api/auth/login'), { data: { username, password } });
  const body = await response.json().catch(() => ({}));
  assert(response.ok(), `${username} login returned ${response.status()}`);
  const actor = body.actor ?? body;
  const expected = expectedActors.get(username);
  assert(expected);
  assert.equal(actor.role, expected.role, `${username} role differs`);
  assert.equal(actor.userId ?? actor.id, expected.userId, `${username} identity differs`);
  return context;
}

async function readSnapshot(context, audience) {
  const response = await context.request.get(url(
    `/api/snapshot?audience=${encodeURIComponent(audience)}&sessionId=${encodeURIComponent(sessionId)}`,
  ));
  const body = await response.json().catch(() => ({}));
  assert(response.ok(), `${audience} snapshot returned ${response.status()}: ${JSON.stringify(body)}`);
  assert.equal(body.audience, audience);
  return body;
}

async function capture(context, route, selector, label) {
  const page = await context.newPage();
  try {
    const response = await page.goto(url(route), { waitUntil: 'domcontentloaded' });
    assert(response?.ok(), `${label} page returned ${response?.status() ?? 'no response'}`);
    const root = page.locator(selector).first();
    await root.waitFor({ state: 'visible', timeout: 20_000 });
    const facts = {
      classroomRevision: numberAttribute(await root.getAttribute('data-classroom-revision'), `${label} revision`),
      lessonId: await root.getAttribute('data-teaching-lesson'),
      pageId: await root.getAttribute('data-teaching-page')
        ?? await page.locator('[data-classroom-current-page]').first().getAttribute('data-classroom-current-page').catch(() => null),
      pageIndex: await page.locator('[data-slide-index]').first().getAttribute('data-slide-index')
        .then((value) => value === null ? null : numberAttribute(value, `${label} page index`) - 1)
        .catch(() => null),
      mode: await root.getAttribute('data-student-mode'),
    };
    await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: true });
    return facts;
  } finally {
    await page.close();
  }
}

function classroomFacts(snapshot) {
  return {
    snapshotVersion: snapshot.snapshotVersion,
    classroom: snapshot.classroom,
    membership: snapshot.membership,
  };
}

function aggregateFacts(snapshot) {
  return {
    project: snapshot.project,
    submissions: snapshot.submissions,
    classScores: snapshot.classScores,
  };
}

function teachingPosition(snapshot) {
  const active = snapshot.classroom.activeLesson;
  assert(active, 'active lesson is required');
  const cursor = active.cursor;
  assert.equal(snapshot.classroom.revision, active.revision);
  assert.equal(active.revision, cursor.revision);
  return {
    lessonId: active.lessonId,
    pageId: cursor.pageId,
    pageIndex: cursor.pageIndex,
    pageCount: active.pageCount,
    revision: cursor.revision,
  };
}

function assertProjectorPrivacy(snapshot) {
  const serialized = JSON.stringify(snapshot);
  for (const forbidden of ['stu-01', 'stu-02', 'stu-03', 'student01', 'student02', 'student03']) {
    assert.equal(serialized.includes(forbidden), false, `projector leaked ${forbidden}`);
  }
  for (const key of ['students', 'studentId', 'participation', 'me', 'displayName', 'username']) {
    assert.equal(hasKey(snapshot, key), false, `projector leaked key ${key}`);
  }
}

function hasKey(value, key) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => hasKey(item, key));
  return Object.hasOwn(value, key) || Object.values(value).some((item) => hasKey(item, key));
}

function numberAttribute(value, label) {
  const parsed = Number(value);
  assert.equal(Number.isSafeInteger(parsed), true, `${label} is invalid: ${value}`);
  return parsed;
}

function url(route) { return new URL(route.replace(/^\//, ''), baseUrl).toString(); }
function normalizeBaseUrl(value) { return value.endsWith('/') ? value : `${value}/`; }
function readArg(name, fallback) { const index = process.argv.indexOf(name); return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback; }

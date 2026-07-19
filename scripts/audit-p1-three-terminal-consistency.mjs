#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './utils/playwright-browser.mjs';

const baseUrl = normalizeBaseUrl(readArg('--base-url', 'http://127.0.0.1:3157/'));
const sessionId = readArg('--session-id', 'demo-class');
const outDir = path.resolve(process.cwd(), readArg('--out', 'output/playwright/p1-three-terminal-consistency'));
const password = process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
const checks = [];
const failures = [];
const consoleErrors = [];
const MAX_SNAPSHOT_WINDOW_ATTEMPTS = 8;
const expectedActors = new Map([
  ['teacher01', { role: 'teacher', userId: 'teacher-01' }],
  ['student01', { role: 'student', userId: 'stu-01' }],
  ['student02', { role: 'student', userId: 'stu-02' }],
  ['student03', { role: 'student', userId: 'stu-03' }],
]);

assert.equal(sessionId, 'demo-class', 'P1 consistency audit accepts only the exact demo-class roster.');
await mkdir(outDir, { recursive: true });
const browser = await launchChromium({ headless: true });
const contexts = [];

try {
  const teacher = await authenticatedContext('teacher01');
  const students = await Promise.all(['student01', 'student02', 'student03'].map(authenticatedContext));
  contexts.push(teacher, ...students);

  const {
    teacherSnapshot,
    projectorSnapshot,
    teacherGraph,
    studentSnapshots,
    studentGraphs,
  } = await captureStableSnapshotWindow(teacher, students);

  const expectedCommon = commonOf(teacherSnapshot);
  for (const [label, snapshot] of [
    ['projector', projectorSnapshot],
    ['teacher graph', teacherGraph],
    ...studentSnapshots.map((snapshot, index) => [`student ${index + 1}`, snapshot]),
    ...studentGraphs.map((snapshot, index) => [`student graph ${index + 1}`, snapshot]),
  ]) {
    assert.deepEqual(commonOf(snapshot), expectedCommon, `${label} common facts differ`);
  }
  checks.push({
    name: 'all audiences share one authoritative snapshot cut',
    status: 'passed',
    snapshotVersion: teacherSnapshot.snapshotVersion,
    revision: teacherSnapshot.classroom.revision,
  });

  assert.equal(teacherSnapshot.membership.classSize, 3, 'demo-class must contain exactly three students');
  assert.equal(teacherSnapshot.students.length, 3, 'teacher snapshot must contain exactly three students');
  assert.deepEqual(
    teacherSnapshot.students.map(({ studentId }) => studentId).sort(),
    ['stu-01', 'stu-02', 'stu-03'],
    'teacher snapshot roster is not the exact demo roster',
  );

  for (let index = 0; index < studentSnapshots.length; index += 1) {
    const student = studentSnapshots[index];
    const graph = studentGraphs[index];
    const teacherStudent = teacherSnapshot.students.find(({ studentId }) => studentId === student.me.studentId);
    assert.ok(teacherStudent, `teacher cut omitted ${student.me.studentId}`);
    assert.deepEqual(student.me.nodes, teacherStudent.nodes, `${student.me.studentId} node facts differ`);
    assert.deepEqual(student.me.tasks, teacherStudent.tasks, `${student.me.studentId} task facts differ`);
    assert.equal(student.me.projectCompositeScore, teacherStudent.projectCompositeScore);
    assert.equal(graph.mode, 'student');
    assert.deepEqual(graph.me.nodes, student.me.nodes, `${student.me.studentId} graph node facts differ`);
    assert.deepEqual(graph.me.tasks, student.me.tasks, `${student.me.studentId} graph task facts differ`);
    for (const graphTask of graph.me.tasks) {
      const studentTask = student.me.tasks.find(({ taskId }) => taskId === graphTask.taskId);
      assert.equal(
        graphTask.stateCompletionPercent,
        studentTask?.stateCompletionPercent,
        `${student.me.studentId} ${graphTask.taskId} graph stateCompletionPercent differs`,
      );
    }
  }
  checks.push({ name: 'student teacher and graph personal facts match', status: 'passed', students: 3 });

  assert.equal(teacherGraph.mode, 'teacher');
  assertNamedMetrics(teacherSnapshot);
  assertProjectorPrivacy(projectorSnapshot);
  checks.push({ name: 'named score and submission metrics', status: 'passed' });
  checks.push({ name: 'projector has aggregate facts and zero personal data', status: 'passed' });

  if (consoleErrors.length) throw new Error(`browser console errors:\n${consoleErrors.join('\n')}`);
} catch (error) {
  failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  await Promise.allSettled(contexts.map((context) => context.close()));
  await browser.close();
}

const report = {
  schema: 'dgbook.p1-three-terminal-consistency/v2',
  generatedAt: new Date().toISOString(),
  baseUrl,
  sessionId,
  actors: [...expectedActors.keys()],
  authority: 'GET /api/snapshot only',
  helperRequired: false,
  checks,
  consoleErrors,
  failures,
};
await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (failures.length) throw new Error(`P1 three-terminal consistency audit failed:\n- ${failures.join('\n- ')}`);
console.log(`P1 three-terminal consistency audit passed: ${path.join(outDir, 'report.json')}`);

async function authenticatedContext(username) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const response = await context.request.post(api('/api/auth/login'), {
    data: { username, password },
  });
  const body = await response.json().catch(() => ({}));
  assert(response.ok(), `${username} login returned ${response.status()}`);
  const actor = body.actor ?? body;
  const expected = expectedActors.get(username);
  assert(expected, `unexpected audit account ${username}`);
  assert.equal(actor.role, expected.role, `${username} role differs`);
  assert.equal(actor.userId ?? actor.id, expected.userId, `${username} identity differs`);
  context.on('page', (page) => observePage(page, username));
  return context;
}

async function readSnapshot(context, audience) {
  const response = await context.request.get(api(
    `/api/snapshot?audience=${encodeURIComponent(audience)}&sessionId=${encodeURIComponent(sessionId)}`,
  ));
  const body = await response.json().catch(() => ({}));
  assert(response.ok(), `${audience} snapshot returned ${response.status()}: ${JSON.stringify(body)}`);
  assert.equal(body.audience, audience, `${audience} snapshot returned the wrong audience`);
  return body;
}

async function captureStableSnapshotWindow(teacher, students) {
  await suppressAuditPresenceWrites(teacher, students[0]);
  checks.push({
    name: 'audit browser presence writes are suppressed during the stable-cut proof',
    status: 'passed',
  });
  const openSurfaces = await openFourSnapshotSurfaces(teacher, students[0]);
  let lastWindow;
  try {
    await openSurfaces.teacher.page.waitForTimeout(1_200);
    for (let attempt = 1; attempt <= MAX_SNAPSHOT_WINDOW_ATTEMPTS; attempt += 1) {
      const teacherV1 = await readSnapshot(teacher, 'teacher');
      const [projectorSnapshot, teacherGraph, studentSnapshots, studentGraphs, surfaces] = await Promise.all([
        readSnapshot(teacher, 'projector'),
        readSnapshot(teacher, 'graph'),
        Promise.all(students.map((context) => readSnapshot(context, 'student'))),
        Promise.all(students.map((context) => readSnapshot(context, 'graph'))),
        readOpenSurfaceFacts(openSurfaces),
      ]);
      const teacherV2 = await readSnapshot(teacher, 'teacher');
      const surfaceVersions = Object.fromEntries(Object.entries(surfaces).map(([label, facts]) => [
        label,
        integerAttribute(facts['data-snapshot-version'], `${label} data-snapshot-version`),
      ]));
      lastWindow = {
        attempt,
        v1: teacherV1.snapshotVersion,
        v2: teacherV2.snapshotVersion,
        revisionV1: teacherV1.classroom.revision,
        revisionV2: teacherV2.classroom.revision,
        surfaceVersions,
      };
      const surfaceCutMatches = Object.values(surfaceVersions)
        .every((version) => version === teacherV1.snapshotVersion);
      if (teacherV1.snapshotVersion !== teacherV2.snapshotVersion
        || teacherV1.classroom.revision !== teacherV2.classroom.revision
        || !surfaceCutMatches) {
        await openSurfaces.teacher.page.waitForTimeout(250);
        continue;
      }

      const middleSnapshots = [projectorSnapshot, teacherGraph, ...studentSnapshots, ...studentGraphs];
      const expectedCommon = commonOf(teacherV1);
      for (const [index, snapshot] of [...middleSnapshots, teacherV2].entries()) {
        assert.deepEqual(commonOf(snapshot), expectedCommon, `stable window common facts differ at snapshot ${index + 1}`);
      }
      assert.deepEqual(teacherV2.students, teacherV1.students, 'teacher personal facts changed inside a stable version window');
      assertSurfaceFacts(surfaces, {
        teacher: teacherV2,
        projector: projectorSnapshot,
        student: studentSnapshots[0],
        graph: studentGraphs[0],
      });
      await captureOpenSurfaceScreenshots(openSurfaces);
      checks.push({
        name: 'teacher V1 to four terminals to teacher V2 stable handshake',
        status: 'passed',
        attempt,
        snapshotVersion: teacherV2.snapshotVersion,
        revision: teacherV2.classroom.revision,
      });
      return {
        teacherSnapshot: teacherV2,
        projectorSnapshot,
        teacherGraph,
        studentSnapshots,
        studentGraphs,
      };
    }
    throw new Error(`authoritative snapshot did not stabilize within ${MAX_SNAPSHOT_WINDOW_ATTEMPTS} attempts: ${JSON.stringify(lastWindow)}`);
  } finally {
    await Promise.allSettled(Object.values(openSurfaces).map(({ page }) => page.close()));
  }
}

async function suppressAuditPresenceWrites(...auditContexts) {
  const presencePattern = `**/api/class-sessions/${sessionId}/presence*`;
  await Promise.all(auditContexts.map((context) => context.route(presencePattern, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({ status: 204, body: '' });
  })));
}

async function openFourSnapshotSurfaces(teacher, student) {
  const definitions = [
    { key: 'student', context: student, route: '/student/home', selector: '[data-student-home]', label: 'student-home' },
    { key: 'teacher', context: teacher, route: `/teacher/sessions/${sessionId}`, selector: '.teacher-console', label: 'teacher-session' },
    { key: 'projector', context: teacher, route: `/present/${sessionId}`, selector: '.projector-app', label: 'projector' },
    { key: 'graph', context: student, route: '/course', selector: '[data-course-home]', label: 'student-graph' },
  ];
  const pages = [];
  try {
    const entries = await Promise.all(definitions.map(async (definition) => {
      const page = await definition.context.newPage();
      pages.push(page);
      const response = await page.goto(api(definition.route), { waitUntil: 'domcontentloaded' });
      assert(response?.ok(), `${definition.label} returned ${response?.status() ?? 'no response'}`);
      const root = page.locator(definition.selector).first();
      await root.waitFor({ state: 'visible', timeout: 20_000 });
      await page.waitForFunction(
        (target) => document.querySelector(target)?.getAttribute('data-snapshot-version') !== null,
        definition.selector,
        { timeout: 20_000 },
      );
      return [definition.key, { ...definition, page, root }];
    }));
    return Object.fromEntries(entries);
  } catch (error) {
    await Promise.allSettled(pages.map((page) => page.close()));
    throw error;
  }
}

async function readOpenSurfaceFacts(openSurfaces) {
  const attributes = [
    'data-snapshot-version',
    'data-classroom-revision',
    'data-class-size',
    'data-formal-submitted',
    'data-formal-passed',
  ];
  const entries = await Promise.all(Object.entries(openSurfaces).map(async ([key, { root }]) => [
    key,
    Object.fromEntries(await Promise.all(attributes.map(async (name) => [name, await root.getAttribute(name)]))),
  ]));
  return Object.fromEntries(entries);
}

async function captureOpenSurfaceScreenshots(openSurfaces) {
  await Promise.all(Object.values(openSurfaces).map(({ label, page }) => (
    page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: true })
  )));
}

function assertSurfaceFacts(surfaces, snapshots) {
  for (const label of ['student', 'teacher', 'projector', 'graph']) {
    const surface = surfaces[label];
    const snapshot = snapshots[label];
    assert.equal(integerAttribute(surface['data-snapshot-version'], `${label} data-snapshot-version`), snapshot.snapshotVersion);
    assert.equal(integerAttribute(surface['data-classroom-revision'], `${label} data-classroom-revision`), snapshot.classroom.revision);
    for (const [attribute, expected] of [
      ['data-class-size', snapshot.membership.classSize],
      ['data-formal-submitted', snapshot.submissions.activeAssessment.submittedCount],
      ['data-formal-passed', snapshot.submissions.activeAssessment.passedCount],
    ]) {
      if (surface[attribute] !== null) {
        assert.equal(integerAttribute(surface[attribute], `${label} ${attribute}`), expected);
      }
    }
  }
  checks.push({ name: 'four terminal DOM data attributes match authoritative API facts', status: 'passed', surfaces });
}

function integerAttribute(value, name) {
  const parsed = Number(value);
  assert.equal(Number.isSafeInteger(parsed), true, `${name} is not a safe integer: ${value}`);
  return parsed;
}

function commonOf(snapshot) {
  const common = structuredClone(snapshot);
  for (const field of ['audience', 'me', 'students', 'weakPoints', 'mode', 'nodeHeatmap', 'tasks', 'participation', 'serverNow']) {
    delete common[field];
  }
  // helper.observedAt is an observation timestamp, not classroom authority; helper is optional telemetry.
  if (common.helper) delete common.helper.observedAt;
  delete common.helper;
  return common;
}

function assertNamedMetrics(snapshot) {
  assert.equal(typeof snapshot.submissions.classroomActivity.submittedCount, 'number');
  assert.equal(typeof snapshot.submissions.activeAssessment.submittedCount, 'number');
  assert.equal(typeof snapshot.submissions.professionalOutputs.submittedAwaitingReviewCount, 'number');
  const serialized = JSON.stringify(snapshot.classScores);
  for (const forbidden of ['"score"', '"grade"', '"submittedCount":']) {
    assert.equal(serialized.includes(forbidden), false, `ambiguous metric key leaked: ${forbidden}`);
  }
  for (const student of snapshot.students) {
    for (const task of student.tasks) {
      if ('taskCompositeScore' in task) assert.equal(typeof task.taskCompositeScore, 'number');
      if ('nodeTestHighestScore' in task) assert.equal(typeof task.nodeTestHighestScore, 'number');
    }
    if ('projectCompositeScore' in student) assert.equal(typeof student.projectCompositeScore, 'number');
  }
}

function assertProjectorPrivacy(snapshot) {
  const serialized = JSON.stringify(snapshot);
  for (const forbidden of [
    'stu-01', 'stu-02', 'stu-03', 'student01', 'student02', 'student03',
  ]) assert.equal(serialized.includes(forbidden), false, `projector leaked ${forbidden}`);
  const forbiddenKeys = new Set([
    'studentId', 'students', 'participants', 'roster', 'devices', 'acks',
    'displayName', 'username', 'deviceId', 'outputId', 'feedback', 'answers', 'evidenceText',
    'participation', 'me', 'weakPoints', 'nodeHeatmap',
  ]);
  visit(snapshot, (key) => assert.equal(forbiddenKeys.has(key), false, `projector leaked key ${key}`));
}

function visit(value, check) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    check(key);
    visit(nested, check);
  }
}

function observePage(page, actor) {
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${actor}: ${message.text()}`);
  });
  page.on('pageerror', (error) => consoleErrors.push(`${actor}: ${error.message}`));
}

function api(route) {
  return new URL(route.replace(/^\//, ''), baseUrl).toString();
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function normalizeBaseUrl(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

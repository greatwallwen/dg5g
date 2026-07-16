#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Image2FixtureManager } from './capture-image2-implementation.mjs';
import { launchChromium } from './utils/playwright-browser.mjs';
import { normalizeBaseUrl } from './utils/image2-visual-audit.mjs';

const baseUrl = normalizeBaseUrl(readArg('--base-url', 'http://127.0.0.1:3157/'));
const outDir = path.resolve(process.cwd(), readArg('--out', 'output/playwright/p1-complete-journey'));
const password = process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
const report = {
  tool: 'audit-p1-complete-journey',
  baseUrl,
  checkedAt: new Date().toISOString(),
  actors: ['teacher01', 'stu-01', 'stu-02', 'stu-03'],
  checkpoints: [],
  screenshots: [],
  browserErrors: [],
  failures: [],
};

await mkdir(outDir, { recursive: true });
const browser = await launchChromium({ headless: true });
const fixture = new Image2FixtureManager({
  browser,
  baseUrl,
  password,
  consoleErrors: report.browserErrors,
});

try {
  const teacher = await fixture.context('teacher01');
  const students = {
    'stu-01': await fixture.context('stu-01'),
    'stu-02': await fixture.context('stu-02'),
    'stu-03': await fixture.context('stu-03'),
  };

  await assertTeacherEntry(teacher);
  const cursorBefore = await readCursor(students['stu-02'], 'P1T2-N02');
  const activation = await activateClassroom(teacher, fixture);
  report.checkpoints.push({ name: 'teacher-started-p1t1-n02', ...activation });

  for (const [actor, context] of Object.entries(students)) {
    await fixture.api(context, 'PUT', '/api/class-sessions/demo-class/participation');
    await fixture.api(context, 'PATCH', '/api/class-sessions/demo-class/participation', {
      mode: actor === 'stu-02' ? 'self' : 'follow',
    });
  }
  const joined = await Promise.all(Object.entries(students).map(async ([actor, context]) => ({
    actor,
    ...(await fixture.api(context, 'GET', '/api/class-sessions/demo-class/participation')),
  })));
  assert(joined.every(({ participation }) => participation?.state === 'joined'), 'all three students must join the demo classroom');
  assert(joined.every(({ joinedCount }) => joinedCount === 3), 'joined count must be three for every student cut');
  report.checkpoints.push({
    name: 'three-students-joined',
    joinedCount: 3,
    modes: Object.fromEntries(joined.map(({ actor, participation }) => [actor, participation.mode])),
  });

  const beforeSwitch = await readTeacherSession(teacher, fixture);
  const toPhase = nextPhase(beforeSwitch.lessonState.phase);
  const switched = await fixture.api(teacher, 'PATCH', '/api/class-sessions/demo-class', {
    intent: { type: 'phase_changed', phase: toPhase },
    expectedRevision: beforeSwitch.lessonState.revision,
  });
  assert(switched.session.lessonState.revision === beforeSwitch.lessonState.revision + 1, 'teacher page switch must advance revision once');
  const followPages = await Promise.all(['stu-01', 'stu-03'].map((actor) => assertStudentModePage(
    students[actor], actor, 'follow', switched.session.lessonState.revision,
  )));
  const selfPage = await assertStudentModePage(students['stu-02'], 'stu-02', 'self');
  assert(selfPage.mode === 'self', 'self-study student was forced back into follow mode');
  report.checkpoints.push({
    name: 'teacher-switch-follow-isolation',
    revision: switched.session.lessonState.revision,
    followingStudents: followPages.map(({ actor }) => actor),
    selfStudent: selfPage.actor,
  });

  await fixture.api(students['stu-02'], 'DELETE', '/api/class-sessions/demo-class/participation');
  await fixture.api(students['stu-02'], 'PUT', '/api/class-sessions/demo-class/participation');
  await fixture.api(students['stu-02'], 'PATCH', '/api/class-sessions/demo-class/participation', { mode: 'self' });
  const cursorAfter = await readCursor(students['stu-02'], 'P1T2-N02');
  assert(JSON.stringify(cursorAfter) === JSON.stringify(cursorBefore), 'leave/rejoin overwrote the student self-study cursor');
  report.checkpoints.push({ name: 'leave-rejoin-preserves-personal-progress', cursorBefore, cursorAfter });

  const outputs = [];
  for (const flow of [
    ['stu-01', 'P01', 'P1T1'],
    ['stu-02', 'P02', 'P1T2'],
    ['stu-03', 'P03', 'P1T3'],
  ]) {
    const [actor, taskId, nodePrefix] = flow;
    const output = await fixture.ensureOutputState(actor, taskId, nodePrefix, 'submitted');
    outputs.push({ actor, taskId, outputId: output.head.outputId, stateRevision: output.head.stateRevision });
  }
  report.checkpoints.push({ name: 'three-task-professional-outputs-submitted', outputs });

  for (const output of outputs) await fixture.verifyOutput(output.outputId);
  for (const output of outputs) {
    const verified = await fixture.api(students[output.actor], 'GET', `/api/outputs/${output.taskId}`);
    assert(verified.head.status === 'verified', `${output.actor} ${output.taskId} was not teacher verified`);
  }
  report.checkpoints.push({ name: 'teacher-verified-three-professional-outputs', count: outputs.length });

  const portfolioPage = await students['stu-03'].newPage();
  await goto(portfolioPage, '/student/projects/p1/portfolio');
  await portfolioPage.locator('[data-p1-portfolio="complete"]').waitFor({ state: 'visible', timeout: 20_000 });
  assert(await portfolioPage.locator('[data-p1-portfolio-item]').count() === 3, 'complete portfolio must contain three task outputs');
  await screenshot(portfolioPage, 'portfolio-complete.png');
  await portfolioPage.close();

  const graphPage = await students['stu-03'].newPage();
  await goto(graphPage, '/course');
  await graphPage.locator('[data-semantic-course-graph]').waitFor({ state: 'visible', timeout: 20_000 });
  assert(await graphPage.locator('[data-graph-node-id="P03"]').count() === 1, 'graph omitted P03 after completion');
  await screenshot(graphPage, 'course-graph-after-completion.png');
  await graphPage.close();

  const snapshots = await Promise.all([
    fixture.api(teacher, 'GET', '/api/snapshot?audience=teacher&sessionId=demo-class'),
    fixture.api(teacher, 'GET', '/api/snapshot?audience=projector&sessionId=demo-class'),
    fixture.api(students['stu-03'], 'GET', '/api/snapshot?audience=graph&sessionId=demo-class'),
    fixture.api(students['stu-03'], 'GET', '/api/snapshot?audience=student&sessionId=demo-class'),
  ]);
  const versions = snapshots.map(({ snapshotVersion }) => snapshotVersion);
  assert(new Set(versions).size === 1, `final audience snapshot versions diverged: ${versions.join(',')}`);
  report.checkpoints.push({
    name: 'portfolio-and-graph-authoritative-update',
    snapshotVersion: versions[0],
    portfolio: 'complete',
    graph: 'P03-present',
  });
} catch (error) {
  report.failures.push(String(error?.stack ?? error));
} finally {
  await fixture.close();
  await browser.close();
}

if (report.browserErrors.length) report.failures.push(`browser errors: ${report.browserErrors.join(' | ')}`);
await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ report: path.join(outDir, 'report.json'), failures: report.failures.length }, null, 2));
if (report.failures.length) process.exit(1);

async function assertTeacherEntry(context) {
  const page = await context.newPage();
  await goto(page, '/teacher/workbench');
  const primary = page.locator('[data-primary-action]').first();
  await primary.waitFor({ state: 'visible', timeout: 20_000 });
  assert((await primary.innerText()).includes('P1T1-N02'), 'teacher primary action must name P1T1-N02');
  await primary.click();
  await page.waitForURL((url) => url.pathname === '/teacher/sessions/demo-class', { timeout: 20_000 });
  await page.locator('[data-role-scope="teacher"]').waitFor({ state: 'visible', timeout: 20_000 });
  await screenshot(page, 'teacher-entry-p1t1-n02.png');
  await page.close();
}

async function activateClassroom(teacher, fixture) {
  const before = await readTeacherSession(teacher, fixture);
  if (before.sessionStatus === 'active') {
    return { activeNodeId: before.activeNodeId, revision: before.lessonState.revision, alreadyActive: true };
  }
  const phase = nextPhase(before.lessonState.phase);
  const result = await fixture.api(teacher, 'PATCH', '/api/class-sessions/demo-class', {
    intent: { type: 'phase_changed', phase },
    expectedRevision: before.lessonState.revision,
  });
  assert(result.session.activeNodeId === 'P1T1-N02', 'teacher session did not start at P1T1-N02');
  return { activeNodeId: result.session.activeNodeId, revision: result.session.lessonState.revision, alreadyActive: false };
}

async function readTeacherSession(teacher, fixture) {
  return (await fixture.api(teacher, 'GET', '/api/class-sessions/demo-class')).session;
}

async function assertStudentModePage(context, actor, mode, revision) {
  const page = await context.newPage();
  await goto(page, '/classroom/demo-class');
  const root = page.locator(`[data-student-mode="${mode}"]`);
  await root.waitFor({ state: 'visible', timeout: 20_000 });
  if (revision !== undefined && mode === 'follow') {
    await page.waitForFunction((expected) => Number(document.querySelector('[data-classroom-revision]')?.getAttribute('data-classroom-revision')) >= expected, revision);
  }
  await screenshot(page, `${actor}-${mode}.png`);
  await page.close();
  return { actor, mode };
}

async function readCursor(context, nodeId) {
  const response = await context.request.get(new URL(`/api/self-study/cursors/${nodeId}`, baseUrl).toString());
  if (!response.ok()) throw new Error(`cursor ${nodeId} returned ${response.status()}`);
  const body = await response.json();
  return body.cursor ?? body;
}

async function goto(page, route) {
  const response = await page.goto(new URL(route, baseUrl).toString(), { waitUntil: 'networkidle', timeout: 60_000 });
  assert(response?.ok(), `${route} returned ${response?.status() ?? 'no response'}`);
}

async function screenshot(page, fileName) {
  const target = path.join(outDir, fileName);
  await page.screenshot({ path: target, fullPage: true, animations: 'disabled' });
  report.screenshots.push(path.relative(process.cwd(), target).replaceAll('\\', '/'));
}

function nextPhase(phase) {
  return ({ prepare: 'lecture', lecture: 'question', question: 'lecture', practice: 'lecture', challenge: 'review', review: 'lecture' })[phase] ?? 'lecture';
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './utils/playwright-browser.mjs';

const baseUrl = normalizeBaseUrl(readArg('--base-url', 'http://127.0.0.1:3157/'));
const outDir = path.resolve(process.cwd(), readArg('--out', 'output/playwright/live-p01-classroom-ui'));
const password = process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
const allowRemoteMutation = process.argv.includes('--allow-remote-mutation');
const remote = !['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname);
const sessionId = 'demo-class';
const report = {
  schema: 'dgbook.live-p01-classroom-ui/v1',
  baseUrl,
  checkedAt: new Date().toISOString(),
  actors: ['teacher01', 'teacher01:projector', 'student01', 'student02', 'student03'],
  actions: {},
  metrics: {},
  practice: {},
  cleanup: 'pending',
  browserErrors: [],
  failures: [],
};

if (remote) {
  assert.equal(
    allowRemoteMutation,
    true,
    'remote classroom mutation requires the explicit --allow-remote-mutation flag',
  );
}
await mkdir(outDir, { recursive: true });

let browser;
let teacherPage;
const contexts = [];
let failure;
try {
  browser = await launchChromium({ headless: true });
  const teacher = await loginActor(browser, 'teacher01', 'teacher');
  contexts.push(teacher.context);
  teacherPage = teacher.page;

  await resetDemoFromWorkbench(teacherPage);
  const teacherClickStartedAt = Date.now();
  await teacherPage.locator('summary[data-primary-action][aria-label="开始 P01 第一课时"]').click();
  await teacherPage.locator('[data-start-lesson-node="P1T1-N01"]').click();
  await teacherPage.waitForURL(url(`/teacher/sessions/${sessionId}`), { timeout: 20_000 });
  await teacherPage.locator('.teacher-console[data-teaching-lesson="P01-L1"][data-slide-index="1"]')
    .waitFor({ state: 'visible', timeout: 20_000 });
  report.actions.teacherEntry = {
    clicks: 2,
    elapsedMs: Date.now() - teacherClickStartedAt,
    lesson: 'P01-L1',
    node: 'P1T1-N01',
  };

  const projectorActor = await loginActor(browser, 'teacher01', 'projector-source');
  contexts.push(projectorActor.context);
  await projectorActor.page.locator(`a[href="/teacher/sessions/${sessionId}"]`).click();
  await projectorActor.page.waitForURL(url(`/teacher/sessions/${sessionId}`), { timeout: 20_000 });
  const [projectorPage] = await Promise.all([
    projectorActor.context.waitForEvent('page'),
    projectorActor.page.locator(`a[target="_blank"][href="/present/${sessionId}"]`).click(),
  ]);
  observePage(projectorPage, 'projector');
  await projectorPage.locator('.projector-app').waitFor({ state: 'visible', timeout: 20_000 });

  const studentEntryStartedAt = Date.now();
  const students = [];
  for (const username of ['student01', 'student02', 'student03']) {
    const actor = await loginActor(browser, username, username);
    contexts.push(actor.context);
    const href = await actor.page.locator('[data-role-home-primary]').getAttribute('href');
    assert.equal(href, `/classroom/${sessionId}`, `${username} home did not expose the active classroom`);
    await actor.page.locator('[data-role-home-primary]').click();
    await actor.page.waitForURL(url(`/classroom/${sessionId}`), { timeout: 20_000 });
    await actor.page.locator('[data-classroom-entry-status]').waitFor({ state: 'visible', timeout: 20_000 });
    await actor.page.locator('[data-classroom-join]').click();
    await actor.page.locator('.follow-app[data-student-mode="follow"]')
      .waitFor({ state: 'visible', timeout: 20_000 });
    students.push(actor);
  }
  report.metrics.threeStudentEntryMs = Date.now() - studentEntryStartedAt;
  assert(
    report.metrics.threeStudentEntryMs <= 120_000,
    `three students needed ${report.metrics.threeStudentEntryMs}ms to enter`,
  );

  await Promise.all(students.map(({ page }) => completePracticeWithRetry(page)));
  const feedback = await Promise.all(students.map(({ page }) => (
    page.locator('[data-activity-id="P1T1-N01-micro-01"] .self-study-practice-feedback p').innerText()
  )));
  assert.equal(new Set(feedback).size, 1, 'three students received inconsistent canonical practice feedback');
  report.practice = {
    students: 3,
    wrongAttempt: 'targeted feedback shown',
    retry: 'enabled and reset response',
    finalAttempt: 'passed',
    consistentFeedback: true,
  };

  const selfPage = students[1].page;
  await selfPage.locator('.classroom-mode-actions button').click();
  await selfPage.locator('.follow-app[data-student-mode="self"] [data-classroom-self-status]')
    .waitFor({ state: 'visible', timeout: 20_000 });
  const selfRevisionBefore = Number(await selfPage.locator('.classroom-self-status').getAttribute('data-teacher-revision'));

  const syncStartedAt = Date.now();
  await teacherPage.locator('.slide-rail button').nth(1).click();
  await Promise.all([
    teacherPage.locator('.teacher-console[data-slide-index="2"]').waitFor({ state: 'visible', timeout: 5_000 }),
    projectorPage.locator('.scene-projector-topbar[data-slide-index="2"]').waitFor({ state: 'visible', timeout: 5_000 }),
    students[0].page.locator('[data-classroom-current-page="P01-L1-P02"]').waitFor({ state: 'visible', timeout: 5_000 }),
    students[2].page.locator('[data-classroom-current-page="P01-L1-P02"]').waitFor({ state: 'visible', timeout: 5_000 }),
  ]);
  report.metrics.teacherSyncMs = Date.now() - syncStartedAt;
  assert(report.metrics.teacherSyncMs <= 2_000, `teacher synchronization took ${report.metrics.teacherSyncMs}ms`);
  await selfPage.waitForFunction((before) => {
    const status = document.querySelector('.classroom-self-status');
    return Number(status?.getAttribute('data-teacher-revision')) > before
      && document.querySelector('[data-classroom-current-page]') === null;
  }, selfRevisionBefore, { timeout: 15_000 });
  report.actions.selfStudyIsolation = 'teacher revision observed without classroom page takeover';

  const previous = projectorPage.locator('[data-session-action="previous-page"]');
  const next = projectorPage.locator('[data-session-action="next-page"]');
  const back = projectorPage.locator('[data-session-action="back-to-teacher"]');
  await Promise.all([previous.waitFor({ state: 'visible' }), next.waitFor({ state: 'visible' }), back.waitFor({ state: 'visible' })]);
  assert.equal(await back.getAttribute('href'), `/teacher/sessions/${sessionId}`);
  await previous.click();
  await teacherPage.locator('.teacher-console[data-slide-index="1"]').waitFor({ state: 'visible', timeout: 5_000 });
  await next.click();
  await teacherPage.locator('.teacher-console[data-slide-index="2"]').waitFor({ state: 'visible', timeout: 5_000 });
  report.actions.projectorControls = 'previous, next, and return controls available; previous and next persisted';

  await openTeacherMoreActions(teacherPage);
  await teacherPage.locator('[data-session-action="pause-lesson"]').click();
  await Promise.all(students.map(({ page }) => page.locator('.follow-app[data-session-status="paused"]')
    .waitFor({ state: 'visible', timeout: 20_000 })));
  await teacherPage.locator('[data-primary-action][data-session-action="resume-lesson"]')
    .waitFor({ state: 'visible', timeout: 10_000 });
  await teacherPage.locator('[data-primary-action][data-session-action="resume-lesson"]').click();
  await Promise.all(students.map(({ page }) => page.locator('.follow-app[data-session-status="active"]')
    .waitFor({ state: 'visible', timeout: 20_000 })));
  report.actions.pauseResume = 'passed';

  await teacherPage.screenshot({ path: path.join(outDir, 'teacher-p01-l1.png'), fullPage: true });
  await projectorPage.screenshot({ path: path.join(outDir, 'projector-p01-l1.png'), fullPage: true });
  await students[0].page.screenshot({ path: path.join(outDir, 'student-follow.png'), fullPage: true });
  await selfPage.screenshot({ path: path.join(outDir, 'student-self.png'), fullPage: true });

  await openTeacherMoreActions(teacherPage);
  await teacherPage.locator('[data-session-action="end-lesson"]').click();
  await Promise.all([
    teacherPage.locator('[data-no-active-lesson="true"]').waitFor({ state: 'visible', timeout: 10_000 }),
    projectorPage.locator('[data-no-active-lesson="true"]').waitFor({ state: 'visible', timeout: 10_000 }),
    ...students.map(({ page }) => page.locator('.follow-app[data-session-status="preparing"]')
      .waitFor({ state: 'visible', timeout: 20_000 })),
  ]);
  for (const { page } of students) {
    assert.equal(await page.locator('[data-classroom-current-page]').count(), 0);
  }
  report.actions.closeLesson = 'lesson run closed; teacher, projector, and three students converged on preparing with no classroom page';

  if (report.browserErrors.length) {
    throw new Error(`browser errors:\n${report.browserErrors.map((item) => JSON.stringify(item)).join('\n')}`);
  }
} catch (error) {
  failure = error;
  report.failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  if (teacherPage && !teacherPage.isClosed()) {
    try {
      await resetDemoFromWorkbench(teacherPage);
      report.cleanup = 'online demo reset to clean preparing state';
    } catch (error) {
      report.cleanup = `failed: ${error instanceof Error ? error.message : String(error)}`;
      if (!failure) failure = error;
    }
  }
  await Promise.allSettled(contexts.map((context) => context.close()));
  await browser?.close().catch(() => undefined);
  await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

if (failure) throw failure;
console.log(`live P01 classroom UI audit passed: ${path.join(outDir, 'report.json')}`);

async function loginActor(browserInstance, username, label) {
  const context = await browserInstance.newContext({ viewport: username.startsWith('student')
    ? { width: 390, height: 844 }
    : { width: 1440, height: 900 } });
  const page = await context.newPage();
  observePage(page, label);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('input[autocomplete="username"]').fill(username);
  await page.locator('input[autocomplete="current-password"]').fill(password);
  await page.locator('.login-submit').click();
  await page.waitForURL((target) => target.pathname !== '/', { timeout: 20_000 });
  return { context, page, username };
}

async function resetDemoFromWorkbench(page) {
  if (!page.url().endsWith('/teacher/workbench')) {
    await page.goto(url('/teacher/workbench'), { waitUntil: 'domcontentloaded' });
  }
  await page.locator('[data-demo-reset] button').waitFor({ state: 'visible', timeout: 20_000 });
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-demo-reset] button').click();
  await page.locator('[data-demo-reset] [role="status"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-start-lesson-primary="true"]').waitFor({ state: 'visible', timeout: 20_000 });
}

async function completePracticeWithRetry(page) {
  const card = page.locator('[data-activity-id="P1T1-N01-micro-01"]');
  await card.waitFor({ state: 'visible', timeout: 20_000 });
  const fieldsets = card.locator('fieldset');
  assert.equal(await fieldsets.count(), 3, 'P1T1-N01 classroom practice must expose three concrete materials');
  for (let index = 0; index < 3; index += 1) {
    await fieldsets.nth(index).locator('input[value="in-scope"]').check();
  }
  await card.locator('.activity-submit').click();
  await page.locator('[data-activity-id="P1T1-N01-micro-01"].is-wrong')
    .waitFor({ state: 'visible', timeout: 20_000 });
  await card.locator('[data-self-study-retry="P1T1-N01-micro-01"]').click();
  await fieldsets.nth(0).locator('input[value="in-scope"]').check();
  await fieldsets.nth(1).locator('input[value="out-of-scope"]').check();
  await fieldsets.nth(2).locator('input[value="out-of-scope"]').check();
  await card.locator('.activity-submit').click();
  await page.locator('[data-activity-id="P1T1-N01-micro-01"].is-correct[data-activity-attempt-count="2"]')
    .waitFor({ state: 'visible', timeout: 20_000 });
}

async function openTeacherMoreActions(page) {
  const details = page.locator('.teacher-more-actions');
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
}

function observePage(page, actor) {
  page.on('console', (message) => {
    if (message.type() === 'error') report.browserErrors.push({ actor, kind: 'console', message: message.text(), url: page.url() });
  });
  page.on('pageerror', (error) => report.browserErrors.push({ actor, kind: 'pageerror', message: error.message, url: page.url() }));
  page.on('response', (response) => {
    if (response.status() >= 500) report.browserErrors.push({ actor, kind: 'http', status: response.status(), url: response.url() });
  });
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function normalizeBaseUrl(value) {
  return value.endsWith('/') ? value : `${value}/`;
}

function url(route) {
  return new URL(route, baseUrl).toString();
}

#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './utils/playwright-browser.mjs';
import {
  authenticateImage2Context,
  normalizeBaseUrl,
} from './utils/image2-visual-audit.mjs';

const SESSION_ID = 'demo-class';
const VIEWPORT = { width: 1440, height: 1000 };
const DEFAULT_BASE_URL = 'http://8.153.206.97/';
const DEFAULT_OUT_DIR = 'output/playwright/dgbook-p1-user-guide';
const DEMO_RESET_CONFIRMATION = 'RESET_THREE_DEMO_STUDENTS';
const ASSESSMENT_NODE_ID = 'P1T1-N02';
const ASSESSMENT_GAME_ID = 'P1T1-N02-server-assessment';
const expectedFiles = [
  '01-login-gateway.png',
  '02-account-logout.png',
  '03-student-home-four-questions.png',
  '04-p1-project-three-tasks.png',
  '05-p01-node-chain.png',
  '06-n02-problem.png',
  '07-n02-annotated-figure.png',
  '08-n02-reasoning-examples.png',
  '09-n02-counterexamples.png',
  '10-n02-practice-feedback.png',
  '11-n02-output-rubric.png',
  '12-student-classroom-entry.png',
  '13-student-classroom-follow.png',
  '14-student-self-mode.png',
  '15-formal-assessment-paper.png',
  '16-formal-assessment-diagnosis.png',
  '17-n04-output-form.png',
  '18-output-return-revise.png',
  '19-p1-portfolio.png',
  '20-portfolio-output-evidence.png',
  '21-portfolio-version-diff.png',
  '22-capability-map-student.png',
  '23-teacher-workbench.png',
  '24-teacher-p01-lesson1.png',
  '25-teacher-p01-lesson2.png',
  '26-teacher-classroom-controls.png',
  '27-projector-formal-test.png',
  '28-projector-anonymous-review.png',
  '29-teacher-output-review.png',
  '30-projector-controls.png',
];

export async function runDgbookP1UserGuideCapture(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const outDir = path.resolve(process.cwd(), options.outDir ?? DEFAULT_OUT_DIR);
  const password = options.password ?? process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
  const allowRemoteMutation = options.allowRemoteMutation === true;
  const headless = options.headless !== false;
  assertMutationPermission(baseUrl, allowRemoteMutation);

  const report = {
    schema: 'dgbook.p1-user-guide-capture/v1',
    baseUrl,
    outDir: path.relative(process.cwd(), outDir).replaceAll('\\', '/'),
    checkedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    reset: { requested: true, completed: false },
    actors: ['student01', 'student02', 'student03', 'teacher01'],
    captures: [],
    browserErrors: [],
    failures: [],
  };

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  let browser;
  let failure;
  const contexts = [];
  const pages = [];
  try {
    browser = await launchChromium({ headless });
    const S1 = await createContext(browser, 'student01', report);
    const S2 = await createContext(browser, 'student02', report);
    const S3 = await createContext(browser, 'student03', report);
    const T = await createContext(browser, 'teacher01', report);
    contexts.push(S1, S2, S3, T);

    // S1 is deliberately anonymous for the gateway shot, then becomes the
    // student01 browser context for the remainder of the one-pass capture.
    const loginPage = await S1.newPage();
    pages.push(loginPage);
    await capture(report, loginPage, outDir, baseUrl, '01-login-gateway.png', {
      route: '/', ready: 'main[data-login-role="gateway"]', fullPage: true,
    });

    await Promise.all([
      authenticateImage2Context(S1, 'stu-01', baseUrl, password),
      authenticateImage2Context(S2, 'stu-02', baseUrl, password),
      authenticateImage2Context(S3, 'stu-03', baseUrl, password),
      authenticateImage2Context(T, 'teacher01', baseUrl, password),
    ]);
    await resetDemo(T, baseUrl);
    report.reset.completed = true;

    const studentOne = await S1.newPage();
    const studentTwo = await S2.newPage();
    const studentThree = await S3.newPage();
    const teacherPage = await T.newPage();
    pages.push(studentOne, studentTwo, studentThree, teacherPage);

    await capture(report, studentOne, outDir, baseUrl, '02-account-logout.png', {
      route: '/student/home', ready: '[data-student-home] [data-account-menu="student"]', fullPage: false,
    });
    await capture(report, studentOne, outDir, baseUrl, '03-student-home-four-questions.png', {
      route: '/student/home', ready: '[data-student-home-primary-path]', fullPage: true,
    });
    await capture(report, studentThree, outDir, baseUrl, '04-p1-project-three-tasks.png', {
      route: '/student/projects/p1', ready: '[data-p1-project="P1"] [data-p1-task="P03"]', fullPage: true,
    });
    await capture(report, studentOne, outDir, baseUrl, '05-p01-node-chain.png', {
      route: '/student/projects/p1#p1-task-P01', ready: '[data-p1-task="P01"]', fullPage: true,
    });

    await openPage(studentThree, baseUrl, '/learn/P1T1-N02', '[data-self-study-renderer="P1T1-N02"]');
    await captureSelfStudySection(report, studentThree, outDir, baseUrl, 'problem', '06-n02-problem.png');
    await captureSelfStudySection(report, studentThree, outDir, baseUrl, 'figure', '07-n02-annotated-figure.png');
    await captureSelfStudySection(report, studentThree, outDir, baseUrl, 'steps', '08-n02-reasoning-examples.png');
    await captureSelfStudySection(report, studentThree, outDir, baseUrl, 'correction', '09-n02-counterexamples.png');
    await selectSelfStudySection(studentThree, 'practice');
    const practice = studentThree.locator('[data-activity-id="P1T1-N02-foundation-01"]').first();
    await practice.waitFor({ state: 'visible', timeout: 25_000 });
    await practice.locator('.activity-submit').click();
    await practice.locator('.self-study-practice-feedback:not([hidden])').waitFor({ state: 'visible', timeout: 25_000 });
    await capture(report, studentThree, outDir, baseUrl, '10-n02-practice-feedback.png', {
      ready: '[data-self-study-section="practice"]:not([hidden])',
      focus: '.self-study-practice-feedback:not([hidden])',
      fullPage: true,
    });
    await captureSelfStudySection(report, studentThree, outDir, baseUrl, 'output', '11-n02-output-rubric.png');

    // student03 supplies the complete, verified P01 form. student02 supplies
    // the genuine returned -> revising state. The seeded revision remains a
    // demo walkthrough; real resubmission is covered by the user-event journey.
    await capture(report, studentThree, outDir, baseUrl, '17-n04-output-form.png', {
      route: '/learn/P1T1-N04?mode=challenge', ready: '[data-professional-output="P01"]', fullPage: true,
    });
    await openPage(studentTwo, baseUrl, '/learn/P1T1-N04?mode=challenge', '[data-professional-output="P01"][data-output-workflow="returned"]');
    const revisionField = studentTwo.locator('[data-output-field] textarea').first();
    await revisionField.fill(`${await revisionField.inputValue()}（已按教师意见补充双端口复核证据）`);
    await studentTwo.locator('[data-professional-output="P01"][data-output-workflow="revising"]')
      .waitFor({ state: 'visible', timeout: 25_000 });
    await capture(report, studentTwo, outDir, baseUrl, '18-output-return-revise.png', {
      ready: '[data-professional-output="P01"][data-output-workflow="revising"]', fullPage: true,
    });
    await capture(report, studentThree, outDir, baseUrl, '19-p1-portfolio.png', {
      route: '/student/projects/p1/portfolio', ready: '[data-p1-portfolio-item="P03"]', fullPage: true,
    });
    await openPage(studentThree, baseUrl, '/student/projects/p1/portfolio/P01', '[data-portfolio-detail="P01"][data-portfolio-formation="formed"]');
    await capture(report, studentThree, outDir, baseUrl, '20-portfolio-output-evidence.png', {
      ready: '[data-portfolio-version="2"] [data-portfolio-evidence]',
      focus: '[data-portfolio-version="2"] [data-portfolio-evidence]', fullPage: false,
    });
    await capture(report, studentThree, outDir, baseUrl, '21-portfolio-version-diff.png', {
      ready: '[data-version-diff]', focus: '[data-version-diff]', fullPage: false,
    });
    await capture(report, studentThree, outDir, baseUrl, '22-capability-map-student.png', {
      route: '/course', ready: '[data-semantic-course-graph]', fullPage: false,
    });
    await capture(report, teacherPage, outDir, baseUrl, '23-teacher-workbench.png', {
      route: '/teacher/workbench', ready: '[data-teacher-workbench]', fullPage: true,
    });

    await closeOpenLesson(T, baseUrl);
    await startLesson(T, baseUrl, 'P01-L1');
    await openPage(teacherPage, baseUrl, `/teacher/sessions/${SESSION_ID}`, '.teacher-console[data-teaching-lesson="P01-L1"][data-teaching-page="P01-L1-P01"]');
    await openTeacherInspector(teacherPage, 'script');
    await capture(report, teacherPage, outDir, baseUrl, '24-teacher-p01-lesson1.png', {
      ready: '[data-teaching-script="P01-L1-P01"]', fullPage: false,
    });
    await closeTeacherInspector(teacherPage);
    const moreActions = teacherPage.locator('details.teacher-more-actions');
    await moreActions.locator('summary').click();
    await moreActions.locator('[data-session-action="pause-lesson"]').waitFor({ state: 'visible', timeout: 20_000 });
    await capture(report, teacherPage, outDir, baseUrl, '26-teacher-classroom-controls.png', {
      ready: 'details.teacher-more-actions[open]', fullPage: false,
    });

    const projectorPage = await T.newPage();
    pages.push(projectorPage);
    await capture(report, projectorPage, outDir, baseUrl, '30-projector-controls.png', {
      route: `/present/${SESSION_ID}`, ready: '.projector-app [data-session-action="next-page"]', fullPage: false,
    });

    await requestJson(S1, baseUrl, 'DELETE', `/api/class-sessions/${SESSION_ID}/participation`, undefined, { allow: [404, 409] });
    await capture(report, studentOne, outDir, baseUrl, '12-student-classroom-entry.png', {
      route: `/classroom/${SESSION_ID}`, ready: '.follow-app[data-student-mode="entry"] [data-classroom-join="true"]', fullPage: false,
    });
    await requestJson(S1, baseUrl, 'PUT', `/api/class-sessions/${SESSION_ID}/participation`);
    await studentOne.reload({ waitUntil: 'domcontentloaded' });
    await studentOne.locator('.follow-app[data-student-mode="follow"] [data-classroom-current-page]')
      .waitFor({ state: 'visible', timeout: 30_000 });
    await capture(report, studentOne, outDir, baseUrl, '13-student-classroom-follow.png', {
      ready: '.follow-app[data-student-mode="follow"]', fullPage: false,
    });
    await requestJson(S1, baseUrl, 'PATCH', `/api/class-sessions/${SESSION_ID}/participation`, { mode: 'self' });
    await studentOne.locator('.follow-app[data-student-mode="self"] [data-classroom-self-status]')
      .waitFor({ state: 'visible', timeout: 30_000 });
    await capture(report, studentOne, outDir, baseUrl, '14-student-self-mode.png', {
      ready: '.follow-app[data-student-mode="self"]', fullPage: false,
    });

    // The inspector exposes the seeded returned and verified examples without
    // turning demo-origin evidence into a user submission.
    if (await moreActions.getAttribute('open') !== null) await moreActions.locator('summary').click();
    await openTeacherInspector(teacherPage, 'review');
    await capture(report, teacherPage, outDir, baseUrl, '29-teacher-output-review.png', {
      ready: '[data-output-review-panel]', fullPage: false,
    });
    await closeTeacherInspector(teacherPage);

    await closeOpenLesson(T, baseUrl);
    await startLesson(T, baseUrl, 'P01-L2');
    await moveLessonPage(T, baseUrl, 4);
    await teacherPage.locator('.teacher-console[data-teaching-lesson="P01-L2"][data-teaching-page="P01-L2-P05"]')
      .waitFor({ state: 'visible', timeout: 30_000 });
    await openTeacherInspector(teacherPage, 'script');
    await capture(report, teacherPage, outDir, baseUrl, '25-teacher-p01-lesson2.png', {
      ready: '[data-teaching-script="P01-L2-P05"]', fullPage: false,
    });
    await closeTeacherInspector(teacherPage);

    for (const context of [S2, S3]) {
      await requestJson(context, baseUrl, 'PUT', `/api/class-sessions/${SESSION_ID}/participation`);
      await requestJson(context, baseUrl, 'PATCH', `/api/class-sessions/${SESSION_ID}/participation`, { mode: 'follow' });
    }
    await moveLessonPage(T, baseUrl, 5);
    await moveLessonPhase(T, baseUrl, 'practice');
    await moveLessonPhase(T, baseUrl, 'challenge');
    let snapshot = await readTeacherSnapshot(T, baseUrl);
    const activeLesson = requireActiveLesson(snapshot, 'P01-L2');
    await requestJson(T, baseUrl, 'POST', `/api/class-sessions/${SESSION_ID}/assessment`, {
      command: {
        type: 'start',
        lessonRunId: activeLesson.runId,
        nodeId: ASSESSMENT_NODE_ID,
        gameId: ASSESSMENT_GAME_ID,
        expectedClassroomRevision: snapshot.classroom.revision,
      },
    });
    snapshot = await waitForTeacherSnapshot(T, baseUrl, (value) => (
      value.submissions.activeAssessment.status === 'running'
    ), 'classroom formal assessment running');
    await projectorPage.locator(`[data-projector-formal-test="${ASSESSMENT_NODE_ID}"]`)
      .waitFor({ state: 'visible', timeout: 30_000 });
    await capture(report, projectorPage, outDir, baseUrl, '27-projector-formal-test.png', {
      ready: `[data-projector-formal-test="${ASSESSMENT_NODE_ID}"]`, fullPage: false,
    });

    const boundAssessmentRoute = `/api/learning/nodes/${ASSESSMENT_NODE_ID}/assessment?classroomSessionId=${SESSION_ID}`;
    const issued = await requestJson(S2, baseUrl, 'GET', boundAssessmentRoute);
    assert(issued.state === 'in-progress' && typeof issued.attemptToken === 'string',
      `student02 classroom paper expected in-progress, received ${issued.state ?? 'none'}`);
    const assessmentPage = await S2.newPage();
    pages.push(assessmentPage);
    await capture(report, assessmentPage, outDir, baseUrl, '15-formal-assessment-paper.png', {
      route: `/learn/${ASSESSMENT_NODE_ID}/test?classroomSessionId=${SESSION_ID}`,
      ready: `.formal-assessment-paper[data-assessment-paper="${ASSESSMENT_NODE_ID}"]`, fullPage: true,
    });
    // Opening the server-rendered page may rotate the opaque attempt token.
    // Re-read the authoritative attempt rather than submitting a captured token.
    const currentIssued = await requestJson(S2, baseUrl, 'GET', boundAssessmentRoute);
    assert(currentIssued.state === 'in-progress' && typeof currentIssued.attemptToken === 'string',
      `student02 classroom paper changed before submission: ${currentIssued.state ?? 'none'}`);
    const diagnosis = await requestJson(
      S2,
      baseUrl,
      'POST',
      `/api/learning/nodes/${ASSESSMENT_NODE_ID}/assessment`,
      { answers: answersForPaper(currentIssued.paper) },
      { headers: { 'x-assessment-token': currentIssued.attemptToken } },
    );
    assert(Number.isFinite(diagnosis.totalScore), 'student02 diagnosis omitted totalScore');
    await capture(report, assessmentPage, outDir, baseUrl, '16-formal-assessment-diagnosis.png', {
      route: `/learn/${ASSESSMENT_NODE_ID}/test?classroomSessionId=${SESSION_ID}`,
      ready: '[data-assessment-result] [data-assessment-dimension="professionalConclusion"]', fullPage: true,
    });

    snapshot = await waitForTeacherSnapshot(T, baseUrl, (value) => (
      value.submissions.activeAssessment.submittedCount >= 1
    ), 'one classroom assessment submission');
    let assessment = snapshot.submissions.activeAssessment;
    await assessmentCommand(T, baseUrl, {
      type: 'collect', runId: assessment.runId, expectedRevision: assessment.revision,
    });
    snapshot = await waitForTeacherSnapshot(T, baseUrl, (value) => (
      value.submissions.activeAssessment.status === 'closed'
    ), 'classroom formal assessment collected');
    assessment = snapshot.submissions.activeAssessment;
    await assessmentCommand(T, baseUrl, {
      type: 'begin-review', runId: assessment.runId, expectedRevision: assessment.revision,
    });
    await waitForTeacherSnapshot(T, baseUrl, (value) => (
      value.submissions.activeAssessment.status === 'reviewing'
      && value.submissions.activeAssessment.errorDistribution?.length === 4
    ), 'anonymous classroom review');
    await projectorPage.locator('[data-anonymous-review]')
      .waitFor({ state: 'visible', timeout: 30_000 });
    await assertProjectorPrivacy(projectorPage);
    await capture(report, projectorPage, outDir, baseUrl, '28-projector-anonymous-review.png', {
      ready: '[data-anonymous-review]', fullPage: false,
    });

    await validateCaptureSet(outDir, report);
  } catch (error) {
    failure = error;
    report.failures.push(String(error?.stack ?? error));
  } finally {
    await Promise.allSettled(pages.map((page) => page.close()));
    await Promise.allSettled(contexts.map((context) => context.close()));
    await browser?.close().catch(() => undefined);
    report.captures.sort((left, right) => left.file.localeCompare(right.file));
    report.summary = {
      expected: expectedFiles.length,
      captured: report.captures.length,
      browserErrors: report.browserErrors.length,
      failures: report.failures.length,
    };
    await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  if (failure) throw failure;
  return { report, reportPath: path.join(outDir, 'report.json') };
}

async function createContext(browser, actor, report) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    locale: 'zh-CN',
  });
  context.on('page', (page) => {
    page.on('pageerror', (error) => report.browserErrors.push({ actor, kind: 'pageerror', message: error.message, url: page.url() }));
    page.on('requestfailed', (request) => {
      const message = request.failure()?.errorText ?? 'request failed';
      if (!message.includes('ERR_ABORTED')) report.browserErrors.push({ actor, kind: 'requestfailed', message, url: request.url() });
    });
    page.on('response', (response) => {
      if (response.status() >= 500) report.browserErrors.push({ actor, kind: 'http', status: response.status(), url: response.url() });
    });
  });
  return context;
}

async function resetDemo(teacher, baseUrl) {
  const result = await requestJson(teacher, baseUrl, 'POST', '/api/demo/reset', {
    confirmation: DEMO_RESET_CONFIRMATION,
  });
  assert(result.reset === true, 'demo reset did not return reset=true');
  assert(Array.isArray(result.students) && result.students.length === 3, 'demo reset did not restore exactly three students');
}

async function captureSelfStudySection(report, page, outDir, baseUrl, sectionId, fileName) {
  await selectSelfStudySection(page, sectionId);
  await capture(report, page, outDir, baseUrl, fileName, {
    ready: `[data-self-study-section="${sectionId}"]:not([hidden])`, fullPage: true,
  });
}

async function selectSelfStudySection(page, sectionId) {
  const tab = page.locator(`[data-self-study-section-tab="${sectionId}"]`);
  await tab.waitFor({ state: 'visible', timeout: 25_000 });
  await tab.click();
  await page.locator(`[data-self-study-section="${sectionId}"]:not([hidden])`)
    .waitFor({ state: 'visible', timeout: 25_000 });
}

async function capture(report, page, outDir, baseUrl, file, options = {}) {
  if (options.route) await openPage(page, baseUrl, options.route, options.ready);
  else if (options.ready) await page.locator(options.ready).first().waitFor({ state: 'visible', timeout: 30_000 });
  if (options.focus) {
    const target = page.locator(options.focus).first();
    await target.waitFor({ state: 'visible', timeout: 25_000 });
    await target.evaluate((element) => element.scrollIntoView({ block: 'start', inline: 'nearest' }));
    await page.waitForTimeout(150);
  } else {
    await page.locator('body').press('Home').catch(() => undefined);
  }
  await waitForVisualStability(page);
  const screenshotPath = path.join(outDir, file);
  await page.screenshot({
    path: screenshotPath,
    fullPage: options.fullPage !== false,
    animations: 'disabled',
  });
  const bytes = await readFile(screenshotPath);
  report.captures.push({
    file,
    route: new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash,
    fullPage: options.fullPage !== false,
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}

async function openPage(page, baseUrl, route, ready) {
  const response = await page.goto(url(baseUrl, route), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  assert(response?.ok(), `${route} returned ${response?.status() ?? 'no response'}`);
  if (ready) await page.locator(ready).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function waitForVisualStability(page) {
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => undefined);
  await page.evaluate(async () => {
    await document.fonts?.ready;
    const pending = [...document.images]
      .filter((image) => !image.complete)
      .map((image) => new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      }));
    await Promise.race([
      Promise.all(pending),
      new Promise((resolve) => setTimeout(resolve, 4_000)),
    ]);
  });
  await page.waitForTimeout(250);
}

async function openTeacherInspector(page, tab) {
  const root = page.locator('.teacher-console');
  if (await root.getAttribute('data-inspector-open') !== 'true') {
    await page.locator('.teacher-topbar nav > button').first().click();
  }
  const inspector = page.locator('[data-teacher-inspector]');
  await inspector.waitFor({ state: 'visible', timeout: 20_000 });
  const tabButton = inspector.locator(`[data-teacher-inspector-tab="${tab}"]`);
  await tabButton.click();
  await inspector.locator(`.teacher-inspector-panel.is-${tab}:not([hidden])`)
    .waitFor({ state: 'visible', timeout: 20_000 });
}

async function closeTeacherInspector(page) {
  const inspector = page.locator('[data-teacher-inspector]');
  if (await inspector.count()) {
    await inspector.locator('header button').click();
    await inspector.waitFor({ state: 'detached', timeout: 20_000 });
  }
}

async function closeOpenLesson(teacher, baseUrl) {
  let snapshot = await readTeacherSnapshot(teacher, baseUrl);
  let active = snapshot.classroom.activeLesson;
  if (!active) return;
  if (active.status === 'preparing' || active.status === 'paused') {
    const type = active.status === 'preparing' ? 'start' : 'resume';
    await lessonLifecycle(teacher, baseUrl, snapshot, { type });
    snapshot = await waitForTeacherSnapshot(teacher, baseUrl, (value) => (
      value.classroom.activeLesson?.status === 'active'
    ), `lesson ${type}`);
    active = snapshot.classroom.activeLesson;
  }
  const assessment = snapshot.submissions.activeAssessment;
  const collectAssessment = assessment.lessonRunId === active.runId
    && ['running', 'paused', 'reviewing'].includes(assessment.status);
  await lessonLifecycle(teacher, baseUrl, snapshot, { type: 'close', collectAssessment });
  await waitForTeacherSnapshot(teacher, baseUrl, (value) => !value.classroom.activeLesson, 'closed open lesson');
}

async function startLesson(teacher, baseUrl, lessonId) {
  const before = await readTeacherSnapshot(teacher, baseUrl);
  assert(!before.classroom.activeLesson, `cannot start ${lessonId} while another lesson is open`);
  await requestJson(teacher, baseUrl, 'POST', `/api/class-sessions/${SESSION_ID}/lesson`, {
    lessonId,
    expectedRevision: before.classroom.revision,
  });
  let prepared = await waitForTeacherSnapshot(teacher, baseUrl, (value) => (
    value.classroom.activeLesson?.lessonId === lessonId
      && value.classroom.activeLesson?.status === 'preparing'
  ), `prepared ${lessonId}`);
  await lessonLifecycle(teacher, baseUrl, prepared, { type: 'start' });
  prepared = await waitForTeacherSnapshot(teacher, baseUrl, (value) => (
    value.classroom.activeLesson?.lessonId === lessonId
      && value.classroom.activeLesson?.status === 'active'
  ), `active ${lessonId}`);
  assert(prepared.classroom.activeLesson.pageCount === 6, `${lessonId} did not expose six pages`);
  return prepared.classroom.activeLesson;
}

async function lessonLifecycle(teacher, baseUrl, snapshot, command) {
  const active = snapshot.classroom.activeLesson;
  assert(active, `lesson lifecycle ${command.type} requires an active lesson`);
  return requestJson(teacher, baseUrl, 'PATCH', `/api/class-sessions/${SESSION_ID}/lesson`, {
    lessonRunId: active.runId,
    expectedRevision: snapshot.classroom.revision,
    command,
  });
}

async function moveLessonPage(teacher, baseUrl, pageIndex) {
  const snapshot = await readTeacherSnapshot(teacher, baseUrl);
  const active = requireActiveLesson(snapshot);
  if (active.cursor.pageIndex === pageIndex) return snapshot;
  await requestJson(teacher, baseUrl, 'PATCH', `/api/class-sessions/${SESSION_ID}/lesson`, {
    lessonRunId: active.runId,
    expectedRevision: snapshot.classroom.revision,
    intent: { type: 'page_changed', pageIndex },
  });
  return waitForTeacherSnapshot(teacher, baseUrl, (value) => (
    value.classroom.activeLesson?.cursor.pageIndex === pageIndex
  ), `lesson page ${pageIndex + 1}`);
}

async function moveLessonPhase(teacher, baseUrl, phase) {
  const snapshot = await readTeacherSnapshot(teacher, baseUrl);
  const active = requireActiveLesson(snapshot);
  const expectedPhase = phase === 'challenge' ? 'assessment' : phase;
  if (active.cursor.phase === expectedPhase) return snapshot;
  await requestJson(teacher, baseUrl, 'PATCH', `/api/class-sessions/${SESSION_ID}/lesson`, {
    lessonRunId: active.runId,
    expectedRevision: snapshot.classroom.revision,
    intent: { type: 'phase_changed', phase },
  });
  return waitForTeacherSnapshot(teacher, baseUrl, (value) => (
    value.classroom.activeLesson?.cursor.phase === expectedPhase
  ), `lesson phase ${expectedPhase}`);
}

async function assessmentCommand(teacher, baseUrl, command) {
  return requestJson(teacher, baseUrl, 'POST', `/api/class-sessions/${SESSION_ID}/assessment`, { command });
}

async function readTeacherSnapshot(teacher, baseUrl) {
  return requestJson(teacher, baseUrl, 'GET', `/api/snapshot?audience=teacher&sessionId=${SESSION_ID}`);
}

async function waitForTeacherSnapshot(teacher, baseUrl, predicate, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let latest;
  while (Date.now() < deadline) {
    latest = await readTeacherSnapshot(teacher, baseUrl);
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not become true within ${timeoutMs}ms; latest=${JSON.stringify(latest?.classroom ?? latest)}`);
}

function requireActiveLesson(snapshot, lessonId) {
  const active = snapshot.classroom.activeLesson;
  assert(active, 'authoritative teacher snapshot has no active lesson');
  if (lessonId) assert(active.lessonId === lessonId, `expected ${lessonId}, received ${active.lessonId}`);
  return active;
}

function answersForPaper(paper) {
  const answers = {
    evidenceClassification: '',
    linkReconstruction: [],
    defectiveOutputRevision: [],
    professionalConclusion: {
      confirmedFact: '现场照片能够确认设备铭牌与机柜位置。',
      evidenceGap: '远端端口照片缺失，链路方向仍需复核。',
      risk: '证据链未闭合会造成连接方向判断失真。',
      action: '补采远端端口及连续走线证据后重新复核。',
    },
  };
  for (const question of paper.questions ?? []) {
    const ids = (question.options ?? []).map(({ id }) => id);
    if (question.dimension === 'evidenceClassification') answers.evidenceClassification = ids[0] ?? '';
    if (question.dimension === 'linkReconstruction') answers.linkReconstruction = ids;
    if (question.dimension === 'defectiveOutputRevision') answers.defectiveOutputRevision = ids;
  }
  assert(answers.evidenceClassification, 'formal assessment paper has no evidence option');
  assert(answers.linkReconstruction.length, 'formal assessment paper has no link ordering options');
  assert(answers.defectiveOutputRevision.length, 'formal assessment paper has no output revision options');
  return answers;
}

async function assertProjectorPrivacy(page) {
  const text = await page.locator('body').innerText();
  for (const forbidden of ['student01', 'student02', 'student03', 'stu-01', 'stu-02', 'stu-03']) {
    assert(!text.includes(forbidden), `projector anonymous review leaked ${forbidden}`);
  }
  assert(await page.locator('[data-student-id], [data-person-id], [data-participant-id]').count() === 0,
    'projector anonymous review rendered a person-level row');
}

async function requestJson(context, baseUrl, method, route, data, options = {}) {
  const response = await context.request.fetch(url(baseUrl, route), {
    method,
    headers: options.headers,
    ...(data === undefined ? {} : { data }),
  });
  const body = await response.json().catch(() => ({}));
  if (options.allow?.includes(response.status())) return body;
  assert(response.ok(), `${method} ${route} returned ${response.status()}: ${JSON.stringify(body)}`);
  return body;
}

async function ensureEnabled(locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 25_000 });
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    if (await locator.isEnabled()) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${label} did not become enabled`);
}

async function validateCaptureSet(outDir, report) {
  const captured = new Set(report.captures.map(({ file }) => file));
  const missing = expectedFiles.filter((file) => !captured.has(file));
  const unexpected = [...captured].filter((file) => !expectedFiles.includes(file));
  assert(missing.length === 0, `missing guide screenshots: ${missing.join(', ')}`);
  assert(unexpected.length === 0, `unexpected guide screenshots: ${unexpected.join(', ')}`);
  assert(captured.size === expectedFiles.length, `expected ${expectedFiles.length} unique screenshots, received ${captured.size}`);
  for (const file of expectedFiles) {
    const bytes = await readFile(path.join(outDir, file));
    assert(bytes.byteLength > 10_000, `${file} is unexpectedly small (${bytes.byteLength} bytes)`);
  }
}

function assertMutationPermission(baseUrl, allowRemoteMutation) {
  const hostname = new URL(baseUrl).hostname.toLowerCase();
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  if (!local && !allowRemoteMutation) {
    throw new Error(
      `Refusing to reset or mutate remote demo ${baseUrl}. Re-run with --allow-remote-mutation after confirming no live demonstration is in progress.`,
    );
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function url(baseUrl, route) {
  return new URL(route.replace(/^\//, ''), baseUrl).toString();
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await runDgbookP1UserGuideCapture({
    baseUrl: readArg('--base-url', DEFAULT_BASE_URL),
    outDir: readArg('--out', DEFAULT_OUT_DIR),
    allowRemoteMutation: process.argv.includes('--allow-remote-mutation'),
    headless: !process.argv.includes('--headed'),
  });
  console.log(`DGBook P1 user-guide screenshots: ${result.reportPath}`);
}

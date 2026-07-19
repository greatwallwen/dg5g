#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './utils/playwright-browser.mjs';

const baseUrl = normalizeBaseUrl(readArg('--base-url', 'http://127.0.0.1:3157/'));
const sessionId = readArg('--session-id', 'demo-class');
const outDir = path.resolve(process.cwd(), readArg('--out', 'output/playwright/class-session-cross-context'));
const password = process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
const isolated = process.env.DGBOOK_AUDIT_ISOLATED_SQLITE === '1';
const lessons = ['P01-L1', 'P02-L1', 'P03-L1', 'P01-L2'];
const expectedActors = new Map([
  ['teacher01', { role: 'teacher', userId: 'teacher-01' }],
  ['student01', { role: 'student', userId: 'stu-01' }],
  ['student02', { role: 'student', userId: 'stu-02' }],
  ['student03', { role: 'student', userId: 'stu-03' }],
]);
const report = {
  schema: 'dgbook.class-session-cross-context/v2',
  baseUrl,
  sessionId,
  checkedAt: new Date().toISOString(),
  environment: { isolatedSqlite: isolated, helperRequired: false, helperEndpointCalls: 0 },
  actors: [],
  classroom: { lessons: [], controls: {}, pageSynchronization: [] },
  participation: {},
  cursors: {},
  assessment: {},
  privacy: {},
  contexts: {},
  failures: [],
  browserErrors: [],
};

assert.equal(sessionId, 'demo-class', 'cross-context audit accepts only the exact demo-class roster');
assert.equal(
  isolated,
  true,
  'stateful classroom acceptance requires DGBOOK_AUDIT_ISOLATED_SQLITE=1 and an isolated server database',
);
await mkdir(outDir, { recursive: true });

let browser;
const contexts = [];
let failure;
try {
  browser = await launchChromium({ headless: true });
  const teacher = await loginContext(browser, 'teacher01', { width: 1440, height: 900 });
  const projector = await loginContext(browser, 'teacher01', { width: 1440, height: 900 });
  const studentFollow = await loginContext(browser, 'student01', { width: 390, height: 844 });
  const studentSelf = await loginContext(browser, 'student02', { width: 390, height: 844 });
  const studentThree = await loginContext(browser, 'student03', { width: 390, height: 844 });
  contexts.push(teacher, projector, studentFollow, studentSelf, studentThree);

  await closeOpenLesson(teacher);
  const firstLesson = await startLesson(teacher, lessons[0]);
  await configureParticipation({ studentFollow, studentSelf, studentThree });
  report.cursors.beforeClassroomMutation = await saveAndReadSelfCursor(studentSelf);

  const pages = await openClassroomPages({ teacher, projector, studentFollow, studentSelf });
  try {
    await assertParticipationFromSnapshots({ teacher, projector, studentFollow, studentSelf, studentThree });
    await auditFullscreenControl(pages.projector);

    for (let lessonIndex = 0; lessonIndex < lessons.length; lessonIndex += 1) {
      const lessonId = lessons[lessonIndex];
      const active = lessonIndex === 0 ? firstLesson : await startLesson(teacher, lessonId);
      assert.equal(active.lessonId, lessonId);
      const visited = new Set();
      let parity = await assertTeachingParity(
        { teacher, projector, studentFollow, studentSelf },
        pages,
        lessonId,
        0,
      );
      visited.add(parity.pageId);

      if (lessonIndex === 0) {
        parity = await clickProjectorPageControl(
          pages.projector,
          '[data-session-action="next-page"]',
          1,
          teacher,
          { teacher, projector, studentFollow, studentSelf },
          pages,
          lessonId,
        );
        visited.add(parity.pageId);
        parity = await clickProjectorPageControl(
          pages.projector,
          '[data-session-action="previous-page"]',
          0,
          teacher,
          { teacher, projector, studentFollow, studentSelf },
          pages,
          lessonId,
        );
        report.classroom.controls.previous = 'passed';
        parity = await clickProjectorPageControl(
          pages.projector,
          '[data-session-action="next-page"]',
          1,
          teacher,
          { teacher, projector, studentFollow, studentSelf },
          pages,
          lessonId,
        );
      }

      for (let pageIndex = parity.pageIndex + 1; pageIndex < 6; pageIndex += 1) {
        parity = await clickProjectorPageControl(
          pages.projector,
          '[data-session-action="next-page"]',
          pageIndex,
          teacher,
          { teacher, projector, studentFollow, studentSelf },
          pages,
          lessonId,
        );
        visited.add(parity.pageId);
      }
      assert.equal(visited.size, 6, `${lessonId} did not expose exactly six unique pages`);
      report.classroom.lessons.push({
        lessonId,
        lessonRunId: active.runId,
        pageCount: 6,
        pages: [...visited],
        finalRevision: parity.revision,
      });

      if (lessonId !== 'P01-L2') await closeOpenLesson(teacher);
    }

    await auditAssessmentLifecycle(
      { teacher, projector, studentFollow, studentSelf },
      pages,
    );
    report.cursors.afterClassroomMutation = await readSelfCursor(studentSelf);
    assert.deepEqual(
      report.cursors.afterClassroomMutation,
      report.cursors.beforeClassroomMutation,
      'projector page revision overwrote the self-study student personal cursor',
    );
    await assertProjectorPrivacy(projector, pages.projector);
    await auditBackToTeacher(pages.projector);
    await closeOpenLesson(teacher);
  } finally {
    await Promise.allSettled(Object.values(pages).map((page) => page.close()));
  }

  if (report.browserErrors.length) {
    throw new Error(`browser errors:\n${report.browserErrors.map((item) => JSON.stringify(item)).join('\n')}`);
  }
} catch (error) {
  failure = error;
  report.failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  await Promise.allSettled(contexts.map((context) => context.close()));
  await browser?.close().catch(() => undefined);
  await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

if (failure) throw failure;
console.log(`class session cross-context audit passed: ${path.join(outDir, 'report.json')}`);

async function openClassroomPages({ teacher, projector, studentFollow, studentSelf }) {
  const pages = {
    teacher: await teacher.newPage(),
    projector: await projector.newPage(),
    follow: await studentFollow.newPage(),
    self: await studentSelf.newPage(),
  };
  await Promise.all([
    goto(pages.teacher, `/teacher/sessions/${sessionId}`, '.teacher-console', 'teacher'),
    goto(pages.projector, `/present/${sessionId}`, '.projector-app', 'projector'),
    goto(pages.follow, `/classroom/${sessionId}`, '.follow-app[data-student-mode="follow"]', 'student-follow'),
    goto(pages.self, `/classroom/${sessionId}`, '.follow-app[data-student-mode="self"]', 'student-self'),
  ]);
  report.contexts = {
    teacher: `/teacher/sessions/${sessionId}`,
    projector: `/present/${sessionId}`,
    follow: `/classroom/${sessionId}`,
    self: `/classroom/${sessionId}`,
  };
  return pages;
}

async function goto(page, route, selector, label) {
  const response = await page.goto(url(route), { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `${label} page returned ${response?.status() ?? 'no response'}`);
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 25_000 });
}

async function configureParticipation({ studentFollow, studentSelf, studentThree }) {
  for (const context of [studentFollow, studentSelf, studentThree]) {
    await requestJson(context, 'PUT', `/api/class-sessions/${sessionId}/participation`);
  }
  await requestJson(studentFollow, 'PATCH', `/api/class-sessions/${sessionId}/participation`, { mode: 'follow' });
  await requestJson(studentSelf, 'PATCH', `/api/class-sessions/${sessionId}/participation`, { mode: 'self' });
  await requestJson(studentThree, 'PATCH', `/api/class-sessions/${sessionId}/participation`, { mode: 'follow' });
}

async function assertParticipationFromSnapshots(contextsByRole) {
  const [teacher, projector, follow, self, third] = await Promise.all([
    readSnapshot(contextsByRole.teacher, 'teacher'),
    readSnapshot(contextsByRole.projector, 'projector'),
    readSnapshot(contextsByRole.studentFollow, 'student'),
    readSnapshot(contextsByRole.studentSelf, 'student'),
    readSnapshot(contextsByRole.studentThree, 'student'),
  ]);
  for (const snapshot of [teacher, projector, follow, self, third]) {
    assert.equal(snapshot.membership.classSize, 3);
    assert.equal(snapshot.membership.joinedCount, 3);
    assert.equal(snapshot.membership.followingCount, 2);
  }
  assert.deepEqual(
    { state: follow.participation?.state, mode: follow.participation?.mode },
    { state: 'joined', mode: 'follow' },
  );
  assert.deepEqual(
    { state: self.participation?.state, mode: self.participation?.mode },
    { state: 'joined', mode: 'self' },
  );
  assert.deepEqual(
    { state: third.participation?.state, mode: third.participation?.mode },
    { state: 'joined', mode: 'follow' },
  );
  assert.equal(Object.hasOwn(teacher, 'participation'), false);
  assert.equal(Object.hasOwn(projector, 'participation'), false);
  report.participation = {
    source: 'authoritative student snapshots',
    student01: 'joined/follow',
    student02: 'joined/self',
    student03: 'joined/follow',
    joinedCount: 3,
    followingCount: 2,
  };
}

async function startLesson(teacher, lessonId) {
  const before = await readSnapshot(teacher, 'teacher');
  assert.equal(before.classroom.activeLesson, undefined, `close the open lesson before starting ${lessonId}`);
  await requestJson(teacher, 'POST', `/api/class-sessions/${sessionId}/lesson`, {
    lessonId,
    expectedRevision: before.classroom.revision,
  });
  let prepared = await waitForTeacherSnapshot(
    teacher,
    (snapshot) => snapshot.classroom.activeLesson?.lessonId === lessonId,
    `prepared ${lessonId}`,
  );
  assert.equal(prepared.classroom.activeLesson.pageCount, 6, `${lessonId} pageCount is not six`);
  assert.equal(prepared.classroom.activeLesson.status, 'preparing');
  await lessonLifecycle(teacher, prepared, { type: 'start' });
  prepared = await waitForTeacherSnapshot(
    teacher,
    (snapshot) => snapshot.classroom.activeLesson?.lessonId === lessonId
      && snapshot.classroom.activeLesson.status === 'active',
    `active ${lessonId}`,
  );
  return prepared.classroom.activeLesson;
}

async function closeOpenLesson(teacher) {
  let snapshot = await readSnapshot(teacher, 'teacher');
  let active = snapshot.classroom.activeLesson;
  if (!active) return;
  if (active.status === 'preparing') {
    await lessonLifecycle(teacher, snapshot, { type: 'start' });
    snapshot = await waitForTeacherSnapshot(
      teacher,
      (candidate) => candidate.classroom.activeLesson?.status === 'active',
      'active lesson before close',
    );
    active = snapshot.classroom.activeLesson;
  }
  const assessment = snapshot.submissions.activeAssessment;
  const collectAssessment = assessment.lessonRunId === active.runId
    && ['running', 'paused', 'reviewing'].includes(assessment.status);
  await lessonLifecycle(teacher, snapshot, { type: 'close', collectAssessment });
  const closed = await waitForTeacherSnapshot(
    teacher,
    (candidate) => candidate.classroom.activeLesson === undefined,
    'closed lesson',
  );
  assert.equal(closed.classroom.activeLesson, undefined);
}

async function lessonLifecycle(teacher, snapshot, command) {
  const active = snapshot.classroom.activeLesson;
  assert(active, `lesson lifecycle ${command.type} requires an active lesson`);
  return requestJson(teacher, 'PATCH', `/api/class-sessions/${sessionId}/lesson`, {
    lessonRunId: active.runId,
    expectedRevision: snapshot.classroom.revision,
    command,
  });
}

async function clickProjectorPageControl(
  projectorPage,
  selector,
  targetPageIndex,
  teacher,
  contextsByRole,
  pages,
  lessonId,
) {
  const before = await readSnapshot(teacher, 'teacher');
  const control = projectorPage.locator(selector).first();
  await control.waitFor({ state: 'visible', timeout: 20_000 });
  await eventually(async () => await control.isEnabled(), `enabled projector control ${selector}`);
  await control.click();
  const parity = await assertTeachingParity(contextsByRole, pages, lessonId, targetPageIndex);
  assert.equal(
    parity.revision,
    before.classroom.revision + 1,
    'projector page intent did not advance exactly one server revision',
  );
  assert.equal(parity.pageIndex, targetPageIndex, 'projector page intent did not persist the target page');
  report.classroom.controls.next = 'passed without helper endpoint';
  return parity;
}

async function assertTeachingParity(contextsByRole, pages, lessonId, pageIndex) {
  const expectedPageId = `${lessonId}-P${String(pageIndex + 1).padStart(2, '0')}`;
  let cuts;
  await eventually(async () => {
    cuts = await Promise.all([
      readSnapshot(contextsByRole.teacher, 'teacher'),
      readSnapshot(contextsByRole.projector, 'projector'),
      readSnapshot(contextsByRole.studentFollow, 'student'),
      readSnapshot(contextsByRole.studentSelf, 'student'),
    ]);
    return cuts.every((snapshot) => {
      const active = snapshot.classroom.activeLesson;
      return active?.lessonId === lessonId
        && active.pageCount === 6
        && active.cursor.pageId === expectedPageId
        && active.cursor.pageIndex === pageIndex
        && snapshot.classroom.revision === active.revision
        && active.revision === active.cursor.revision;
    });
  }, `${lessonId} page ${pageIndex + 1} snapshot parity`, 25_000);

  const positions = cuts.map(teachingPosition);
  for (const position of positions.slice(1)) assert.deepEqual(position, positions[0]);
  const expected = positions[0];
  await Promise.all([
    pages.teacher.waitForFunction(({ lesson, page, index, revision }) => {
      const root = document.querySelector('.teacher-console');
      return root?.getAttribute('data-teaching-lesson') === lesson
        && root.getAttribute('data-teaching-page') === page
        && Number(root.getAttribute('data-slide-index')) === index + 1
        && Number(root.getAttribute('data-classroom-revision')) === revision;
    }, { lesson: lessonId, page: expectedPageId, index: pageIndex, revision: expected.revision }, { timeout: 25_000 }),
    pages.projector.waitForFunction(({ index, revision }) => {
      const root = document.querySelector('.projector-app');
      const topbar = document.querySelector('.scene-projector-topbar');
      return Number(root?.getAttribute('data-classroom-revision')) === revision
        && Number(topbar?.getAttribute('data-slide-index')) === index + 1;
    }, { index: pageIndex, revision: expected.revision }, { timeout: 25_000 }),
    pages.follow.waitForFunction(({ page, revision }) => {
      const root = document.querySelector('.follow-app[data-student-mode="follow"]');
      const current = document.querySelector('[data-classroom-current-page]');
      const renderer = document.querySelector('[data-classroom-follow-renderer]');
      return Number(root?.getAttribute('data-classroom-revision')) === revision
        && current?.getAttribute('data-classroom-current-page') === page
        && Number(renderer?.getAttribute('data-revision')) === revision;
    }, { page: expectedPageId, revision: expected.revision }, { timeout: 25_000 }),
    pages.self.waitForFunction((revision) => {
      const root = document.querySelector('.follow-app[data-student-mode="self"]');
      const status = document.querySelector('.classroom-self-status');
      return Number(root?.getAttribute('data-classroom-revision')) === revision
        && Number(status?.getAttribute('data-teacher-revision')) === revision
        && document.querySelector('[data-classroom-current-page]') === null;
    }, expected.revision, { timeout: 25_000 }),
  ]);
  const selfTeacherRevision = Number(
    await pages.self.locator('.classroom-self-status').getAttribute('data-teacher-revision'),
  );
  report.classroom.pageSynchronization.push({
    lessonId,
    pageId: expectedPageId,
    pageIndex,
    revision: expected.revision,
    selfTeacherRevision,
  });
  return expected;
}

function teachingPosition(snapshot) {
  const active = snapshot.classroom.activeLesson;
  assert(active);
  const cursor = active.cursor;
  return {
    lessonId: active.lessonId,
    pageId: cursor.pageId,
    pageIndex: cursor.pageIndex,
    pageCount: active.pageCount,
    revision: cursor.revision,
  };
}

async function auditFullscreenControl(projectorPage) {
  const control = projectorPage.locator('.projector-page-controls .scene-icon-button').first();
  await control.waitFor({ state: 'visible', timeout: 20_000 });
  const supported = await control.getAttribute('data-fullscreen-supported');
  assert(['true', 'false'].includes(supported), 'fullscreen support state is missing');
  if (supported === 'true') {
    await control.click();
    await projectorPage.waitForFunction(() => Boolean(document.fullscreenElement), undefined, { timeout: 10_000 });
    await projectorPage.waitForFunction(() => (
      document.querySelector('.projector-page-controls .scene-icon-button')?.getAttribute('aria-pressed') === 'true'
    ), undefined, { timeout: 10_000 });
    await control.click();
    await projectorPage.waitForFunction(() => !document.fullscreenElement, undefined, { timeout: 10_000 });
    await projectorPage.waitForFunction(() => (
      document.querySelector('.projector-page-controls .scene-icon-button')?.getAttribute('aria-pressed') === 'false'
    ), undefined, { timeout: 10_000 });
    report.classroom.controls.fullscreen = 'entered and exited';
  } else {
    report.classroom.controls.fullscreen = 'browser reported unsupported';
  }
}

async function auditBackToTeacher(projectorPage) {
  const back = projectorPage.locator('[data-session-action="back-to-teacher"]').first();
  assert.equal(await back.getAttribute('href'), `/teacher/sessions/${sessionId}`);
  await back.click();
  await projectorPage.waitForURL(url(`/teacher/sessions/${sessionId}`), { timeout: 20_000 });
  await projectorPage.locator('.teacher-console').first().waitFor({ state: 'visible', timeout: 20_000 });
  report.classroom.controls.backToTeacher = 'passed';
}

async function auditAssessmentLifecycle(contextsByRole, pages) {
  let snapshot = await readSnapshot(contextsByRole.teacher, 'teacher');
  assert.equal(snapshot.classroom.activeLesson?.lessonId, 'P01-L2');
  assert.equal(snapshot.classroom.activeLesson?.cursor.pageIndex, 5);
  snapshot = await submitPhase(contextsByRole.teacher, snapshot, 'practice');
  snapshot = await submitPhase(contextsByRole.teacher, snapshot, 'challenge');
  assert.equal(snapshot.classroom.activeLesson.cursor.phase, 'assessment');
  await assertTeachingParity(contextsByRole, pages, 'P01-L2', 5);

  const start = pages.teacher.locator('[data-primary-action][data-session-action="start-formal-test"]').first();
  await start.waitFor({ state: 'visible', timeout: 25_000 });
  await eventually(async () => await start.isEnabled(), 'enabled start formal assessment');
  await start.click();
  snapshot = await waitForAssessmentStatus(contextsByRole.teacher, 'running');
  const running = snapshot.submissions.activeAssessment;
  assert.equal(running.nodeId, 'P1T1-N02');
  assert.equal(running.eligibleCount, 3);
  assert.equal(running.submittedCount, 0);
  assert.equal(running.canBeginReview, false);
  await assertZeroSubmissionReviewGate(pages.teacher);

  const endpoint = `/api/learning/nodes/${running.nodeId}/assessment`;
  const boundEndpoint = `${endpoint}?classroomSessionId=${encodeURIComponent(sessionId)}`;
  const issued = await requestJson(contextsByRole.studentSelf, 'GET', boundEndpoint);
  assert.equal(issued.state, 'in-progress');
  const answers = answersForPaper(issued.paper);
  const partialDraft = { evidenceClassification: answers.evidenceClassification };
  const savedDraft = await requestJson(contextsByRole.studentSelf, 'PATCH', endpoint, {
    answers: partialDraft,
    expectedRevision: issued.draft.revision,
  }, { 'x-assessment-token': issued.attemptToken });
  assert.equal(savedDraft.revision, issued.draft.revision + 1);

  const assessmentPage = await contextsByRole.studentSelf.newPage();
  try {
    await goto(
      assessmentPage,
      `/learn/${running.nodeId}/test?classroomSessionId=${encodeURIComponent(sessionId)}`,
      `.formal-assessment-paper[data-assessment-paper="${running.nodeId}"]`,
      'student bound assessment',
    );
    assert.equal(
      await assessmentPage.locator(`input[name="evidenceClassification"][value="${cssEscape(answers.evidenceClassification)}"]`).isChecked(),
      true,
      'saved assessment draft did not bind to the student page',
    );

    await clickTeacherAssessmentControl(pages.teacher, 'pause-formal-test');
    const pausedSnapshot = await waitForAssessmentStatus(contextsByRole.teacher, 'paused');
    const paused = await requestJson(contextsByRole.studentSelf, 'GET', boundEndpoint);
    assert.equal(paused.assessmentId, issued.assessmentId);
    assert.equal(paused.state, 'paused');
    assert.deepEqual(paused.draft, savedDraft);
    assert.equal(Object.hasOwn(paused, 'attemptToken'), false);
    assert.equal(typeof pausedSnapshot.submissions.activeAssessment.remainingSecondsWhenPaused, 'number');
    await assessmentPage.reload({ waitUntil: 'domcontentloaded' });
    const pausedRoot = assessmentPage.locator(
      `.formal-assessment-paper[data-assessment-state="paused"][data-assessment-id="${issued.assessmentId}"]`,
    );
    await pausedRoot.waitFor({ state: 'visible', timeout: 25_000 });
    assert.equal(await pausedRoot.locator('[data-assessment-timer][data-timer-state="frozen"]').count(), 1);
    assert.equal(await pausedRoot.locator('input:not([disabled]), textarea:not([disabled]), button[type="submit"]').count(), 0);
    await assessmentPage.screenshot({ path: path.join(outDir, 'assessment-paused.png'), fullPage: true });

    await clickTeacherAssessmentControl(pages.teacher, 'resume-formal-test');
    await waitForAssessmentStatus(contextsByRole.teacher, 'running');
    const resumed = await requestJson(contextsByRole.studentSelf, 'GET', boundEndpoint);
    assert.equal(resumed.state, 'in-progress');
    assert.equal(resumed.assessmentId, issued.assessmentId);
    assert.deepEqual(resumed.draft, savedDraft);
    assert.notEqual(resumed.attemptToken, issued.attemptToken);
    await assessmentPage.locator(`.formal-assessment-paper[data-assessment-paper="${running.nodeId}"]`)
      .waitFor({ state: 'visible', timeout: 30_000 });

    const diagnosis = await requestJson(
      contextsByRole.studentSelf,
      'POST',
      endpoint,
      { answers: answersForPaper(resumed.paper) },
      { 'x-assessment-token': resumed.attemptToken },
    );
    assert.equal(diagnosis.assessmentId, issued.assessmentId);
    snapshot = await waitForTeacherSnapshot(
      contextsByRole.teacher,
      (candidate) => candidate.submissions.activeAssessment.submittedCount === 1,
      'one assessment submission',
    );
    assert.equal(snapshot.submissions.activeAssessment.canBeginReview, false);
    await assertZeroSubmissionReviewGate(pages.teacher, false);

    const collected = await assessmentCommand(contextsByRole.teacher, {
      type: 'collect',
      runId: running.runId,
      expectedRevision: snapshot.submissions.activeAssessment.revision,
    });
    assert.equal(collected.status, 'closed');
    snapshot = await waitForAssessmentStatus(contextsByRole.teacher, 'closed');
    assert.equal(snapshot.submissions.activeAssessment.canBeginReview, true);
    const reviewing = await assessmentCommand(contextsByRole.teacher, {
      type: 'begin-review',
      runId: running.runId,
      expectedRevision: snapshot.submissions.activeAssessment.revision,
    });
    assert.equal(reviewing.status, 'reviewing');
    assert.equal(reviewing.review.length, 4);
    assertNoPersonLevelData(reviewing, 'anonymous assessment review');
    snapshot = await waitForAssessmentStatus(contextsByRole.teacher, 'reviewing');
    assert.equal(snapshot.submissions.activeAssessment.errorDistribution.length, 4);
    await pages.projector.locator('[data-anonymous-review]').waitFor({ state: 'visible', timeout: 30_000 });
    await pages.projector.screenshot({ path: path.join(outDir, 'projector-anonymous-review.png'), fullPage: true });

    report.assessment = {
      runId: running.runId,
      assessmentId: issued.assessmentId,
      eligibleCount: 3,
      zeroSubmissionReviewGate: 'disabled',
      paused: { state: paused.state, frozenSeconds: pausedSnapshot.submissions.activeAssessment.remainingSecondsWhenPaused },
      resumed: { sameAssessment: true, sameDraft: true, newToken: true },
      submittedCount: 1,
      collected: true,
      anonymousReviewDimensions: reviewing.review.length,
    };
  } finally {
    await assessmentPage.close();
  }
}

async function submitPhase(teacher, snapshot, phase) {
  const active = snapshot.classroom.activeLesson;
  assert(active);
  await requestJson(teacher, 'PATCH', `/api/class-sessions/${sessionId}/lesson`, {
    lessonRunId: active.runId,
    expectedRevision: snapshot.classroom.revision,
    intent: { type: 'phase_changed', phase },
  });
  return waitForTeacherSnapshot(
    teacher,
    (candidate) => candidate.classroom.activeLesson?.cursor.phase
      === (phase === 'challenge' ? 'assessment' : phase),
    `phase ${phase}`,
  );
}

async function clickTeacherAssessmentControl(teacherPage, action) {
  const control = teacherPage.locator(`[data-primary-action][data-session-action="${action}"]`).first();
  await control.waitFor({ state: 'visible', timeout: 25_000 });
  await eventually(async () => await control.isEnabled(), `enabled teacher ${action}`);
  await control.click();
}

async function assertZeroSubmissionReviewGate(teacherPage, expectZero = true) {
  await teacherPage.waitForFunction((zero) => {
    const root = document.querySelector('.teacher-console');
    if (!root) return false;
    if (zero && root.getAttribute('data-formal-submitted') !== '0') return false;
    const controls = [...document.querySelectorAll('[data-session-action="begin-review"]')];
    return controls.length > 0 && controls.every((control) => control instanceof HTMLButtonElement && control.disabled);
  }, expectZero, { timeout: 25_000 });
}

async function assessmentCommand(teacher, command) {
  return requestJson(teacher, 'POST', `/api/class-sessions/${sessionId}/assessment`, { command });
}

async function waitForAssessmentStatus(teacher, status) {
  return waitForTeacherSnapshot(
    teacher,
    (snapshot) => snapshot.submissions.activeAssessment.status === status,
    `assessment ${status}`,
  );
}

function answersForPaper(paper) {
  const answers = {
    evidenceClassification: '',
    linkReconstruction: [],
    defectiveOutputRevision: [],
    professionalConclusion: {
      confirmedFact: 'Confirmed fact from the audited classroom evidence.',
      evidenceGap: 'One evidence gap remains recorded for review.',
      risk: 'The open gap could cause an unsupported conclusion.',
      action: 'Collect the missing evidence and repeat the review.',
    },
  };
  for (const question of paper.questions) {
    const optionIds = (question.options ?? []).map(({ id }) => id);
    if (question.dimension === 'evidenceClassification') answers.evidenceClassification = optionIds[0] ?? '';
    if (question.dimension === 'linkReconstruction') answers.linkReconstruction = optionIds;
    if (question.dimension === 'defectiveOutputRevision') answers.defectiveOutputRevision = optionIds;
  }
  assert(answers.evidenceClassification, 'assessment paper omitted an evidence option');
  assert(answers.linkReconstruction.length > 0, 'assessment paper omitted ordering options');
  assert(answers.defectiveOutputRevision.length > 0, 'assessment paper omitted revision options');
  return answers;
}

async function saveAndReadSelfCursor(context) {
  const payload = await requestJson(context, 'PUT', '/api/self-study/cursors/P1T1-N04', {
    unitId: 'P01-ku-06',
    actionId: 'output',
    actionIndex: 5,
    positionMs: 8_222,
  });
  assert.equal(payload.cursor.positionMs, 8_222);
  return readSelfCursor(context);
}

async function readSelfCursor(context) {
  const payload = await requestJson(context, 'GET', '/api/self-study/cursors/P1T1-N04');
  return payload.cursor;
}

async function assertProjectorPrivacy(context, page) {
  const snapshot = await readSnapshot(context, 'projector');
  assertNoPersonLevelData(snapshot, 'authoritative projector snapshot');
  const visibleText = await page.locator('body').innerText();
  for (const forbidden of ['stu-01', 'stu-02', 'stu-03', 'student01', 'student02', 'student03']) {
    assert.equal(visibleText.includes(forbidden), false, `projector rendered ${forbidden}`);
  }
  assert.equal(await page.locator('[data-student-id], [data-participant-id], [data-person-id]').count(), 0);
  report.privacy = {
    authoritativeSnapshot: 'no person-level fields',
    projectorDom: 'no person-level rows or identifiers',
  };
}

function assertNoPersonLevelData(value, label) {
  const serialized = JSON.stringify(value);
  for (const forbidden of ['studentRoster', 'studentProgress', 'studentId', 'students', 'participants', 'displayName', 'username', 'answers']) {
    assert.equal(hasKey(value, forbidden), false, `${label} leaked key ${forbidden}`);
  }
  for (const studentId of ['stu-01', 'stu-02', 'stu-03', 'student01', 'student02', 'student03']) {
    assert.equal(serialized.includes(studentId), false, `${label} leaked ${studentId}`);
  }
}

function hasKey(value, key) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => hasKey(item, key));
  return Object.hasOwn(value, key) || Object.values(value).some((item) => hasKey(item, key));
}

async function waitForTeacherSnapshot(teacher, predicate, label) {
  let latest;
  await eventually(async () => {
    latest = await readSnapshot(teacher, 'teacher');
    return predicate(latest);
  }, label, 25_000);
  return latest;
}

async function readSnapshot(context, audience) {
  return requestJson(
    context,
    'GET',
    `/api/snapshot?audience=${encodeURIComponent(audience)}&sessionId=${encodeURIComponent(sessionId)}`,
  );
}

async function requestJson(context, method, route, data, headers = {}) {
  const response = await context.request.fetch(url(route), {
    method,
    headers,
    ...(data === undefined ? {} : { data }),
  });
  const body = await response.json().catch(() => ({}));
  assert(response.ok(), `${method} ${route} returned ${response.status()}: ${JSON.stringify(body)}`);
  return body;
}

async function loginContext(activeBrowser, username, viewport) {
  const context = await activeBrowser.newContext({ viewport });
  const response = await context.request.post(url('/api/auth/login'), { data: { username, password } });
  const body = await response.json().catch(() => ({}));
  assert(response.ok(), `${username} login returned ${response.status()}`);
  const actor = body.actor ?? body;
  const expected = expectedActors.get(username);
  assert(expected, `unexpected audit account ${username}`);
  assert.equal(actor.role, expected.role, `${username} role differs`);
  assert.equal(actor.userId ?? actor.id, expected.userId, `${username} identity differs`);
  if (!report.actors.some((item) => item.username === username)) {
    report.actors.push({ username, role: expected.role, userId: expected.userId });
  }
  context.on('page', (page) => observePage(page, username));
  return context;
}

function observePage(page, actor) {
  page.on('console', (message) => {
    if (message.type() === 'error') report.browserErrors.push({ actor, kind: 'console', message: message.text(), url: page.url() });
  });
  page.on('pageerror', (error) => report.browserErrors.push({ actor, kind: 'pageerror', message: error.message, url: page.url() }));
  page.on('requestfailed', (request) => {
    const message = request.failure()?.errorText ?? 'request failed';
    if (!message.includes('ERR_ABORTED')) report.browserErrors.push({ actor, kind: 'requestfailed', message, url: request.url() });
  });
  page.on('response', (response) => {
    if (response.status() >= 500) report.browserErrors.push({ actor, kind: 'http', status: response.status(), url: response.url() });
  });
}

async function eventually(check, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`${label} did not become true within ${timeoutMs}ms${lastError ? `: ${lastError.message}` : ''}`);
}

function cssEscape(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function url(route) { return new URL(route.replace(/^\//, ''), baseUrl).toString(); }
function normalizeBaseUrl(value) { return value.endsWith('/') ? value : `${value}/`; }
function readArg(name, fallback) { const index = process.argv.indexOf(name); return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback; }

#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './utils/playwright-browser.mjs';

const baseUrl = normalizeBaseUrl(readArg('--base-url', 'http://127.0.0.1:3157/'));
const outDir = path.resolve(process.cwd(), readArg('--out', 'output/playwright/live-student01-postclass-closure'));
const password = process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
const allowRemoteMutation = process.argv.includes('--allow-remote-mutation');
const resetAfter = process.argv.includes('--reset-after');
const remote = !['127.0.0.1', 'localhost'].includes(new URL(baseUrl).hostname);
const previewActorExpectations = {
  student02: {
    displayName: '学生二',
    outputStatuses: { P01: 'returned' },
  },
  student03: {
    displayName: '学生三',
    outputStatuses: { P01: 'verified', P02: 'verified', P03: 'verified' },
    portfolioStatus: 'demo-complete',
  },
};
const report = {
  schema: 'dgbook.live-student01-postclass-closure/v1',
  baseUrl,
  checkedAt: new Date().toISOString(),
  actor: 'student01',
  untouchedPreviewActors: ['student02', 'student03'],
  learning: {},
  assessment: {},
  output: {},
  projections: {},
  cleanup: resetAfter ? 'pending' : 'preserve verified student01 state',
  browserErrors: [],
  failures: [],
};

if (remote) {
  assert.equal(
    allowRemoteMutation,
    true,
    'remote post-class mutation requires the explicit --allow-remote-mutation flag',
  );
}
await mkdir(outDir, { recursive: true });

let browser;
let teacher;
let student;
let failure;
try {
  browser = await launchChromium({ headless: true });
  teacher = await loginActor(browser, 'teacher01', { width: 1440, height: 900 });
  await resetDemoFromWorkbench(teacher.page);

  student = await loginActor(browser, 'student01', { width: 1440, height: 900 });
  await student.page.locator('[data-student-home]').waitFor({ state: 'visible', timeout: 20_000 });
  const homeEntryHref = await student.page.locator('[data-role-home-primary]').getAttribute('href');
  assert.equal(homeEntryHref, '/learn/P1T1-N01', 'clean student01 home must start at P1T1-N01');
  await student.page.screenshot({ path: path.join(outDir, '01-student-clean-home.png'), fullPage: true });

  await completeReading(student.page, 'P1T1-N01');
  await solveN01WithRetry(student.page);
  report.learning.N01 = 'four reading sections and canonical practice passed from user UI';

  await completeReading(student.page, 'P1T1-N02');
  await solveN02CorePractices(student.page);
  report.learning.N02 = 'four reading sections and three policy-required practices passed from user UI';

  await completeFormalAssessment(student.page);
  const assessmentScore = Number((await student.page.locator('[data-assessment-result="passed"] header > strong').innerText()).match(/\d+/)?.[0]);
  assert(assessmentScore >= 80, `formal assessment score ${assessmentScore} did not pass`);
  assert.equal(await student.page.locator('[data-assessment-dimension]').count(), 4);
  report.assessment = { nodeId: 'P1T1-N02', origin: 'user', score: assessmentScore, dimensions: 4 };
  await student.page.screenshot({ path: path.join(outDir, '02-formal-assessment-passed.png'), fullPage: true });

  await completeReading(student.page, 'P1T1-N03');
  await solveN03(student.page);
  report.learning.N03 = 'four reading sections and four-state judgement passed from user UI';

  await completeReading(student.page, 'P1T1-N04');
  await solveN04(student.page);
  report.learning.N04 = 'four reading sections and defective-sheet revision passed from user UI';

  await createAndSubmitOutput(student.page);
  await student.page.screenshot({ path: path.join(outDir, '03-output-v1-submitted.png'), fullPage: true });

  await startTeacherReviewLesson(teacher.page);
  const firstReview = await openReviewPanel(teacher.page);
  const outputId = firstReview.outputId;
  report.output.initial = { outputId, workflow: 'submitted', version: 1, evidenceFields: 9, evidenceGapFields: 1 };
  await returnOutput(teacher.page, outputId);
  report.output.returned = { workflow: 'returned', annotation: 'connectionDirection', feedback: true };

  await reviseAndResubmitOutput(student.page);
  report.output.revised = { workflow: 'resubmitted', version: 2 };
  await student.page.screenshot({ path: path.join(outDir, '04-output-v2-resubmitted.png'), fullPage: true });

  await teacher.page.reload({ waitUntil: 'domcontentloaded' });
  await openReviewPanel(teacher.page, outputId);
  const frozenScore = await verifyOutput(teacher.page, outputId);
  report.output.verified = { workflow: 'verified', frozenTaskScore: frozenScore };
  await teacher.page.screenshot({ path: path.join(outDir, '05-teacher-verification.png'), fullPage: true });

  await student.page.goto(url('/learn/P1T1-N04?mode=challenge'), { waitUntil: 'domcontentloaded' });
  const verifiedForm = student.page.locator('form[data-professional-output="P01"]');
  await verifiedForm.locator('[data-output-field]').first().waitFor({ state: 'visible', timeout: 20_000 });
  assert.equal(await verifiedForm.getAttribute('data-output-workflow'), 'verified');
  assert.equal(await verifiedForm.getAttribute('data-output-origin'), 'user');
  await student.page.screenshot({ path: path.join(outDir, '06-student-output-verified.png'), fullPage: true });

  await endOpenLesson(teacher.page);
  report.projections = await verifyStudentProjections(student.page, outputId, assessmentScore);
  report.previewActors = await verifyPreviewActorsUnchanged(browser);

  if (report.browserErrors.length) {
    throw new Error(`browser errors:\n${report.browserErrors.map((item) => JSON.stringify(item)).join('\n')}`);
  }
} catch (error) {
  failure = error;
  report.failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  if (resetAfter && teacher?.page && !teacher.page.isClosed()) {
    try {
      await resetDemoFromWorkbench(teacher.page);
      report.cleanup = 'online demo reset to clean preparing state';
    } catch (error) {
      report.cleanup = `failed: ${error instanceof Error ? error.message : String(error)}`;
      if (!failure) failure = error;
    }
  }
  await Promise.allSettled([teacher?.context.close(), student?.context.close()].filter(Boolean));
  await browser?.close().catch(() => undefined);
  await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

if (failure) throw failure;
console.log(`live student01 post-class closure passed: ${path.join(outDir, 'report.json')}`);

async function completeReading(page, nodeId) {
  await page.goto(url(`/learn/${nodeId}`), { waitUntil: 'domcontentloaded' });
  const renderer = page.locator(`[data-self-study-renderer="${nodeId}"]`);
  await renderer.waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(500);
  for (const section of ['problem', 'figure', 'steps', 'correction']) {
    await renderer.locator(`[data-self-study-section-tab="${section}"]`).click();
    await renderer.locator(`[data-self-study-section="${section}"]:not([hidden])`).waitFor({ state: 'visible' });
    await renderer.locator(`[data-complete-reading-section="${section}"]`).click();
    await page.waitForTimeout(500);
  }
  await renderer.locator('[data-self-study-section="practice"]:not([hidden])').waitFor({ state: 'visible' });
}

async function solveN01WithRetry(page) {
  const card = page.locator('[data-activity-id="P1T1-N01-micro-01"]');
  const fieldsets = card.locator('fieldset');
  await fieldsets.nth(0).locator('input[value="out-of-scope"]').check();
  await fieldsets.nth(1).locator('input[value="in-scope"]').check();
  await fieldsets.nth(2).locator('input[value="in-scope"]').check();
  await card.locator('.activity-submit').click();
  await card.locator('.self-study-practice-feedback:not([hidden])').waitFor({ state: 'visible' });
  assert.match(await card.innerText(), /错误反馈/);
  await card.locator('[data-self-study-retry="P1T1-N01-micro-01"]').click();
  await fieldsets.nth(0).locator('input[value="in-scope"]').check();
  await fieldsets.nth(1).locator('input[value="out-of-scope"]').check();
  await fieldsets.nth(2).locator('input[value="out-of-scope"]').check();
  await submitPassed(card, 2);
}

async function solveN02CorePractices(page) {
  const foundation = page.locator('[data-activity-id="P1T1-N02-foundation-01"]');
  await foundation.locator('input[name="P1T1-N02-foundation-01-room-overview"][value="location"]').check();
  await foundation.locator('input[name="P1T1-N02-foundation-01-device-nameplate"][value="identity"]').check();
  await foundation.locator('input[name="P1T1-N02-foundation-01-two-ended-port-trace"][value="link"]').check();
  await submitPassed(foundation, 1);

  const application = page.locator('[data-activity-id="P1T1-N02-application-01"]');
  await application.locator('input[name="P1T1-N02-application-01-selectedCandidate"][value="candidate-a"]').check();
  await application.locator('input[name="P1T1-N02-application-01-exclusionReason"][value="far-end-label-mismatch"]').check();
  await submitPassed(application, 1);

  const transfer = page.locator('[data-activity-id="P1T1-N02-transfer-01"]');
  const values = ['AAU-01', 'PWR-1', 'PWR-DC-17', 'DCDU-01', '-48V/12', 'DCDU-01 -48V/12 → AAU-01 PWR-1'];
  for (let index = 0; index < values.length; index += 1) {
    await transfer.locator('[data-structured-record-form] input').nth(index).fill(values[index]);
  }
  await submitPassed(transfer, 1);
}

async function completeFormalAssessment(page) {
  await page.goto(url('/learn/P1T1-N02/test'), { waitUntil: 'domcontentloaded' });
  const form = page.locator('.formal-assessment-paper[data-assessment-paper="P1T1-N02"]');
  await form.waitFor({ state: 'visible', timeout: 20_000 });
  await form.locator('input[name="evidenceClassification"][value="nameplate-photo"]').check();
  const order = form.locator('select[name="linkReconstruction"]');
  for (let index = 0; index < await order.count(); index += 1) {
    await order.nth(index).selectOption({ index: index + 1 });
  }
  for (const value of ['restore-source', 'add-photo-index', 'record-direction']) {
    await form.locator(`input[name="defectiveOutputRevision"][value="${value}"]`).check();
  }
  await form.locator('textarea[name="professionalConclusion.confirmedFact"]').fill('设备铭牌确认BBU-01身份，源端口照片确认CPRI-1端口。');
  await form.locator('textarea[name="professionalConclusion.evidenceGap"]').fill('对端端口照片模糊，当前无法确认AAU-01对端端口编号。');
  await form.locator('textarea[name="professionalConclusion.risk"]').fill('若直接形成链路结论，可能导致端口误判并影响成果交付。');
  await form.locator('textarea[name="professionalConclusion.action"]').fill('重新补拍对端端口清晰照片并核验编号后完成复核。');
  await form.locator('button[data-primary-action="true"]').click();
  await page.locator('[data-assessment-result="passed"]').waitFor({ state: 'visible', timeout: 30_000 });
}

async function solveN03(page) {
  const card = page.locator('[data-activity-id="P1T1-N03-micro-01"]');
  for (const [material, state] of Object.entries({
    power: 'confirmed', grounding: 'missing', transport: 'confirmed', environment: 'conflicting',
  })) {
    await card.locator(`input[name="P1T1-N03-micro-01-${material}"][value="${state}"]`).check();
  }
  await submitPassed(card, 1);
}

async function solveN04(page) {
  const card = page.locator('[data-activity-id="P1T1-N04-micro-01"]');
  const inputs = card.locator('[data-defective-sheet-revision] input');
  await inputs.nth(0).fill('IMG-024B');
  await inputs.nth(1).fill('IMG-021');
  await inputs.nth(2).fill('GAP-03 RESHOOT GROUNDING');
  await submitPassed(card, 1);
}

async function submitPassed(card, attemptCount) {
  await card.locator('.activity-submit').click();
  const activityId = await card.getAttribute('data-activity-id');
  await card.page().waitForFunction(({ id, count }) => {
    const element = document.querySelector(`[data-activity-id="${id}"]`);
    return element?.classList.contains('is-correct')
      && element.getAttribute('data-activity-attempt-count') === count;
  }, { id: activityId, count: String(attemptCount) }, { timeout: 20_000 });
}

async function createAndSubmitOutput(page) {
  await page.goto(url('/learn/P1T1-N04?mode=challenge'), { waitUntil: 'domcontentloaded' });
  const form = page.locator('form[data-professional-output="P01"]');
  await form.waitFor({ state: 'visible', timeout: 20_000 });
  assert.equal(await form.getAttribute('data-output-workflow'), 'editing');
  const keys = [
    'siteRoom', 'collectionScope', 'locationEvidence', 'deviceIdentity', 'endpointA',
    'endpointB', 'connectionDirection', 'photoIndex', 'evidenceGap', 'riskAndReviewConclusion',
  ];
  const gapFieldKey = 'riskAndReviewConclusion';
  for (const key of keys) {
    const field = form.locator(`[data-output-field="${key}"]`);
    const textarea = field.locator(`textarea[name="${key}"]`);
    const current = (await textarea.inputValue()).trim();
    await textarea.fill(current || `HY-01室内采集成果：${key}已由现场证据复核，可回查对应照片与活动记录。`);
    if (key === gapFieldKey) {
      await field.locator(`textarea[name="${key}.gapText"]`).fill('当前风险结论缺少整改后复拍照片，不能作为最终关闭依据。');
      await field.locator(`textarea[name="${key}.nextActionText"]`).fill('完成整改后补拍同角度照片，由复核人对照 V1 与 V2 再确认。');
    } else if (await field.locator('[data-evidence-id]').count() === 0) {
      await field.locator(`[data-evidence-picker="${key}"] select`).selectOption({ index: 1 });
    }
  }
  assert.equal(await form.locator('[data-output-source^="P1T1-N01:"]').count() > 0, true);
  assert.equal(await form.locator('[data-output-source^="P1T1-N02:"]').count() > 0, true);
  assert.equal(await form.locator('[data-output-source^="P1T1-N03:"]').count() > 0, true);
  assert.equal(await form.locator('[data-evidence-id]').count(), 9);
  assert.equal(await form.locator(`[data-evidence-gap="${gapFieldKey}"]`).getAttribute('data-gap-complete'), 'true');
  await form.getByRole('button', { name: '保存草稿', exact: true }).click();
  await form.locator('[role="status"]').filter({ hasText: '草稿已保存' }).waitFor({ state: 'visible', timeout: 20_000 });
  await form.getByRole('button', { name: '提交教师复核', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('form[data-professional-output="P01"]')?.getAttribute('data-output-workflow') === 'submitted');
  assert.equal(await form.getAttribute('data-output-workflow'), 'submitted');
}

async function startTeacherReviewLesson(page) {
  await page.goto(url('/teacher/workbench'), { waitUntil: 'domcontentloaded' });
  await page.locator('[data-start-lesson-primary="true"] summary[data-primary-action]').click();
  await page.locator('[data-start-lesson-node="P1T1-N01"]').click();
  await page.waitForURL(url('/teacher/sessions/demo-class'), { timeout: 20_000 });
  await page.locator('.teacher-console[data-teaching-lesson]').waitFor({ state: 'visible', timeout: 20_000 });
}

async function openReviewPanel(page, expectedOutputId) {
  const inspector = page.locator('[data-teacher-inspector]');
  const alreadyOpen = await inspector.waitFor({ state: 'visible', timeout: 2_000 }).then(() => true).catch(() => false);
  if (!alreadyOpen) await page.locator('button[aria-label="打开教师检查器"]').click();
  await inspector.waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('[data-teacher-inspector-tab="review"]').click();
  const panel = page.locator('[data-output-review-panel]');
  await panel.waitFor({ state: 'visible', timeout: 20_000 });
  const queueItem = expectedOutputId
    ? panel.locator(`[data-review-output-id="${expectedOutputId}"]`)
    : panel.locator('[data-review-output-id]').first();
  await queueItem.waitFor({ state: 'visible', timeout: 20_000 });
  const outputId = await queueItem.getAttribute('data-review-output-id');
  assert(outputId, 'teacher review queue item must expose an output id');
  await queueItem.click();
  return { panel, outputId };
}

async function returnOutput(page, outputId) {
  const panel = page.locator('[data-output-review-panel]');
  await panel.locator('[data-review-annotation="connectionDirection"] textarea').fill('请补充双端端口和连续路径证据。');
  await panel.getByLabel('教师整体反馈').fill('连接方向证据不足，请补齐双端端口和连续路径后重新提交。');
  await panel.locator('[data-review-action="return"]').click();
  await panel.locator('.output-review-message').filter({ hasText: '已退回修订' }).waitFor({ state: 'visible', timeout: 20_000 });
  await panel.locator(`[data-review-output-id="${outputId}"]`).waitFor({ state: 'detached', timeout: 20_000 });
}

async function reviseAndResubmitOutput(page) {
  await page.goto(url('/learn/P1T1-N04?mode=challenge'), { waitUntil: 'domcontentloaded' });
  const form = page.locator('form[data-professional-output="P01"]');
  await form.waitFor({ state: 'visible', timeout: 20_000 });
  assert.equal(await form.getAttribute('data-output-workflow'), 'returned');
  const direction = form.locator('textarea[name="connectionDirection"]');
  await direction.fill(`${await direction.inputValue()}；V2已补充BBU源端、ODF连续路径和AAU对端复核。`);
  assert.equal(await form.getAttribute('data-output-workflow'), 'revising');
  await form.getByRole('button', { name: '保存修订', exact: true }).click();
  await form.locator('[role="status"]').filter({ hasText: '草稿已保存' }).waitFor({ state: 'visible', timeout: 20_000 });
  await form.getByRole('button', { name: '再次提交教师复核', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('form[data-professional-output="P01"]')?.getAttribute('data-output-workflow') === 'resubmitted');
}

async function verifyOutput(page, outputId) {
  const panel = page.locator('[data-output-review-panel]');
  await panel.locator(`[data-review-output-id="${outputId}"]`).click();
  for (const rubric of await panel.locator('[data-review-rubric]').all()) {
    const input = rubric.locator('input[type="number"]');
    await input.fill(await input.getAttribute('max'));
  }
  await panel.locator('[data-review-disabled-reasons][data-state="ready"]').waitFor({ state: 'visible' });
  await panel.locator('[data-review-action="verify"]').click();
  const message = panel.locator('.output-review-message').filter({ hasText: '已完成教师认证' });
  await message.waitFor({ state: 'visible', timeout: 20_000 });
  return Number((await message.innerText()).match(/(\d+)\s*分/)?.[1]);
}

async function endOpenLesson(page) {
  const details = page.locator('.teacher-more-actions');
  if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
  await details.locator('[data-session-action="end-lesson"]').click();
  await page.locator('[data-no-active-lesson="true"]').waitFor({ state: 'visible', timeout: 20_000 });
}

async function verifyStudentProjections(page, outputId, assessmentScore) {
  await page.goto(url('/student/home'), { waitUntil: 'domcontentloaded' });
  await page.locator('[data-student-home]').waitFor({ state: 'visible', timeout: 20_000 });
  const homeText = await page.locator('[data-student-home]').innerText();
  assert.match(homeText, /P01|室内信息采集/);
  await page.screenshot({ path: path.join(outDir, '07-student-home-after-verification.png'), fullPage: true });

  await page.goto(url('/student/projects/p1'), { waitUntil: 'domcontentloaded' });
  const p01 = page.locator('[data-p1-task="P01"]');
  await p01.waitFor({ state: 'visible', timeout: 20_000 });
  await p01.locator('[data-p1-output-status="verified"]').waitFor({ state: 'attached', timeout: 20_000 });
  await page.screenshot({ path: path.join(outDir, '08-p1-project-after-verification.png'), fullPage: true });

  await page.goto(url('/student/projects/p1/portfolio/P01'), { waitUntil: 'domcontentloaded' });
  const detail = page.locator('[data-portfolio-detail="P01"]');
  await detail.waitFor({ state: 'visible', timeout: 20_000 });
  assert.equal(await detail.getAttribute('data-portfolio-formation'), 'formed');
  assert.equal(await detail.getAttribute('data-portfolio-delivery'), 'verified-deliverable');
  assert.equal(await detail.locator('[data-portfolio-field]').count() > 0, true);
  assert.equal(await detail.locator('[data-portfolio-evidence]').count() > 0, true);
  assert.equal(await detail.locator('[data-portfolio-source]').count() > 0, true);
  assert.equal(await detail.locator('[data-assessment-dimension]').count(), 4);
  assert.match(await detail.innerText(), new RegExp(`总分\\s*${assessmentScore}`));
  assert.doesNotMatch(await detail.innerText(), /演示状态/);
  await page.screenshot({ path: path.join(outDir, '09-p01-deliverable-detail.png'), fullPage: true });

  await page.goto(url('/course'), { waitUntil: 'domcontentloaded' });
  const graph = page.locator('[data-semantic-course-graph]');
  await graph.waitFor({ state: 'visible', timeout: 20_000 });
  const n02 = graph.locator('[data-graph-node-id="P1T1-N02"]');
  const n04 = graph.locator('[data-graph-node-id="P1T1-N04"]');
  await page.waitForFunction(() => ['P1T1-N02', 'P1T1-N04'].every((nodeId) => {
    const node = document.querySelector(`[data-graph-node-id="${nodeId}"]`);
    return node && !node.classList.contains('is-loading');
  }), undefined, { timeout: 20_000 });
  assert.match(await n02.getAttribute('class') ?? '', /is-mastered/);
  assert.match(await n04.getAttribute('class') ?? '', /is-mastered/);
  assert.equal(await n04.getAttribute('data-graph-node-state'), 'open');
  await page.screenshot({ path: path.join(outDir, '10-course-graph-p01-achieved.png'), fullPage: true });
  return { home: 'P01 current context visible', project: 'P01 verified', portfolio: `verified-deliverable:${outputId}`, graph: 'N02 and N04 mastered' };
}

async function verifyPreviewActorsUnchanged(browserInstance) {
  const previews = {};
  for (const [username, expectation] of Object.entries(previewActorExpectations)) {
    const actor = await loginActor(browserInstance, username, { width: 1440, height: 900 });
    try {
      const home = actor.page.locator('[data-student-home]');
      await home.waitFor({ state: 'visible', timeout: 20_000 });

      const identity = actor.page.locator('[data-account-menu="student"] .account-menu-identity');
      await identity.waitFor({ state: 'visible', timeout: 20_000 });
      const identityText = await identity.innerText();
      assert.match(identityText, new RegExp(expectation.displayName));
      for (const otherName of ['学生一', '学生二', '学生三']) {
        if (otherName !== expectation.displayName) {
          assert.doesNotMatch(identityText, new RegExp(otherName));
        }
      }

      await home.locator(
        '[data-student-home-recommendations] a[href="/student/projects/p1"]',
      ).click();
      await actor.page.waitForURL(url('/student/projects/p1'), { timeout: 20_000 });
      const project = actor.page.locator('[data-p1-project="P1"]');
      await project.waitFor({ state: 'visible', timeout: 20_000 });

      for (const [taskId, status] of Object.entries(expectation.outputStatuses)) {
        await project.locator(
          `[data-p1-task="${taskId}"] [data-p1-output-status="${status}"]`,
        ).waitFor({ state: 'attached', timeout: 20_000 });
      }
      if (expectation.portfolioStatus === 'demo-complete') {
        await project.locator(
          '[data-p1-portfolio-status="demo-complete"]',
        ).waitFor({ state: 'attached', timeout: 20_000 });
      }

      previews[username] = {
        displayName: expectation.displayName,
        outputStatuses: expectation.outputStatuses,
        ...(expectation.portfolioStatus
          ? { portfolioStatus: expectation.portfolioStatus }
          : {}),
      };
    } finally {
      await actor.context.close();
    }
  }
  return previews;
}

async function loginActor(browserInstance, username, viewport) {
  const context = await browserInstance.newContext({ viewport });
  const page = await context.newPage();
  observePage(page, username);
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  for (let attempt = 1; attempt <= 2 && new URL(page.url()).pathname === '/'; attempt += 1) {
    await page.locator('input[autocomplete="username"]').fill(username);
    await page.locator('input[autocomplete="current-password"]').fill(password);
    await page.locator('.login-submit').click();
    await page.locator('.login-submit:not([disabled])').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
    if (new URL(page.url()).pathname === '/') {
      await page.goto(url('/student/home'), { waitUntil: 'domcontentloaded' });
    }
  }
  assert.notEqual(new URL(page.url()).pathname, '/', `${username} UI login did not establish a protected session`);
  return { context, page, username };
}

async function resetDemoFromWorkbench(page) {
  if (!page.url().endsWith('/teacher/workbench')) await page.goto(url('/teacher/workbench'), { waitUntil: 'domcontentloaded' });
  await page.locator('[data-demo-reset] button').waitFor({ state: 'visible', timeout: 20_000 });
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-demo-reset] button').click();
  await page.locator('[data-demo-reset] [role="status"]').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('[data-start-lesson-primary="true"]').waitFor({ state: 'visible', timeout: 20_000 });
}

function observePage(page, actor) {
  page.on('console', (message) => {
    if (message.type() === 'error') report.browserErrors.push({ actor, kind: 'console', message: message.text(), url: page.url() });
  });
  page.on('pageerror', (error) => report.browserErrors.push({ actor, kind: 'pageerror', message: error.message, url: page.url() }));
  page.on('response', (response) => {
    if (response.status() === 409) report.browserErrors.push({
      actor, kind: 'conflict', status: 409, url: response.url(),
      method: response.request().method(), body: response.request().postData(),
    });
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

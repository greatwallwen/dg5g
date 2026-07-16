#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { launchChromium } from './utils/playwright-browser.mjs';

const root = process.cwd();
const host = '127.0.0.1';
const requestedPort = readArg('--port', '');
const port = requestedPort ? validatedPort(requestedPort) : await availablePort();
const baseUrl = `http://${host}:${port}/`;
const runId = readArg('--run-id', `task5-${Date.now().toString(36)}`);
const outDir = path.resolve(root, readArg('--out', 'output/playwright/task5-p1-output-portfolio'));
const outputRoot = path.resolve(root, 'output/playwright');
const databaseDirectory = await mkdtemp(path.join(os.tmpdir(), 'dgbook-task5-audit-'));
const databasePath = path.join(databaseDirectory, 'task5-audit.sqlite');
const distDirName = `.next-task5-audit-${process.pid}-${Date.now().toString(36)}`;
const distDirPath = path.join(root, 'apps/web', distDirName);
const tsconfigPath = path.join(root, 'apps/web', 'tsconfig.json');
const originalTsconfig = await readFile(tsconfigPath, 'utf8');
const demoPassword = process.env.DGBOOK_DEMO_PASSWORD ?? '123456';

assertNode20();
assertWithin(outputRoot, outDir, 'Audit output must stay under output/playwright.');
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const report = {
  tool: 'audit-p1-output-portfolio',
  runId,
  baseUrl,
  environment: {
    node: process.version,
    isolatedSqlite: true,
    sqliteLocation: 'os-temp (removed after run)',
    nextDistDir: `${distDirName} (removed after run)`,
    viewportSet: ['1440x900', '390x844'],
  },
  actorLogins: [],
  fixtureSteps: [],
  uiActions: [],
  checkpoints: [],
  screenshots: [],
  browserErrors: [],
  blockingIssues: [],
};

const auditEnv = {
  ...process.env,
  DGBOOK_SQLITE_PATH: databasePath,
  DGBOOK_AUDIT_ISOLATED_SQLITE: '1',
  DGBOOK_NEXT_DIST_DIR: distDirName,
  NEXT_TELEMETRY_DISABLED: '1',
};
const serverLogs = [];
let server;
let browser;
const contexts = [];

try {
  await runPnpm(['--filter', '@dgbook/web', 'db:reset:demo'], auditEnv);
  server = startServer(auditEnv, serverLogs);
  await waitForServer(baseUrl, 120_000);

  browser = await launchChromium({ headless: true });
  const teacher = await authenticatedContext(browser, 'teacher01', 'teacher');
  const student01 = await authenticatedContext(browser, 'student01', 'student');
  const student02 = await authenticatedContext(browser, 'student02', 'student');
  const student03 = await authenticatedContext(browser, 'student03', 'student');
  contexts.push(teacher, student01, student02, student03);

  const schemas = await loadGeneratedSchemas();
  const flows = [
    { actor: 'student01', context: student01, taskId: 'P01', nodePrefix: 'P1T1', score: 80 },
    { actor: 'student02', context: student02, taskId: 'P02', nodePrefix: 'P1T2', score: 84 },
    { actor: 'student03', context: student03, taskId: 'P03', nodePrefix: 'P1T3', score: 90 },
  ];

  for (const flow of flows) await prepareOutputAccess(flow);

  const submitted = new Map();
  for (const flow of flows) {
    const result = await draftReloadSubmitThroughUi(flow, schemas[flow.taskId]);
    submitted.set(flow.taskId, result);
  }

  const teacherPage = await openTeacherReviewPage(teacher, [...submitted.values()]);
  await capture(teacherPage, 'teacher-review-queue-desktop-1440.png', 1440, 900);
  await capture(teacherPage, 'teacher-review-queue-mobile-390.png', 390, 844);
  await teacherPage.setViewportSize({ width: 1440, height: 900 });

  const p01 = submitted.get('P01');
  check(p01, 'P01 submission is missing.');
  await returnOutputThroughUi(teacherPage, p01.outputId, '请补充冲突证据照片索引并明确补证路径。');

  const revisedP01 = await reviseReloadSubmitThroughUi(
    student01,
    flows[0],
    schemas.P01,
    p01.fields,
  );
  submitted.set('P01', revisedP01);

  const p01Verification = await verifyOutputThroughUi(
    teacherPage,
    revisedP01.outputId,
    schemas.P01,
    90,
  );
  check(p01Verification.frozenTaskScore?.officialScore === 86,
    `Expected P01 frozen task score 86, got ${p01Verification.frozenTaskScore?.officialScore}.`);

  for (const taskId of ['P02', 'P03']) {
    const output = submitted.get(taskId);
    check(output, `${taskId} submission is missing.`);
    await verifyOutputThroughUi(teacherPage, output.outputId, schemas[taskId], 90);
  }

  const finalP01 = await requestJson(student01, 'GET', '/api/outputs/P01');
  check(finalP01?.head.status === 'verified' && finalP01.head.currentVersion === 2,
    'Returned P01 must finish as current verified v2.');
  check(finalP01.versions.length === 2, 'P01 must preserve exactly v1 and v2 in this isolated run.');
  check(isDeepStrictEqual(revisedP01.aggregate.versions[0], p01.aggregate.versions[0]),
    'P01 immutable v1 changed while creating v2.');
  check(isDeepStrictEqual(finalP01.versions[0], p01.aggregate.versions[0]),
    'P01 immutable v1 changed after teacher verification.');
  check(isDeepStrictEqual(finalP01.versions[1], revisedP01.aggregate.versions[1]),
    'P01 immutable v2 changed after teacher verification.');

  await captureStudentVerified(student01, flows[0], 'student-output-verified-desktop-1440.png', 1440, 900);
  await captureStudentVerified(student01, flows[0], 'student-output-verified-mobile-390.png', 390, 844);

  const student03Outputs = {};
  for (const taskId of ['P01', 'P02', 'P03']) {
    const aggregate = await requestJson(student03, 'GET', `/api/outputs/${taskId}`);
    check(aggregate?.head.status === 'verified', `student03 ${taskId} is not verified.`);
    student03Outputs[taskId] = aggregate;
  }

  const portfolio = await captureAndAssertPortfolio(student03, student03Outputs);
  const remainingQueue = await requestJson(teacher, 'GET', '/api/teacher/outputs');
  const targetIds = new Set([...submitted.values()].map(({ outputId }) => outputId));
  check(!remainingQueue.outputs.some(({ outputId }) => targetIds.has(outputId)),
    'Verified target output remains in the submitted teacher queue.');

  const scoreCheckpoint = {
    name: 'frozen-40-60-score',
    nodeTestHighestScore: p01Verification.frozenTaskScore.details.nodeTestHighestScore,
    rubricScore: p01Verification.frozenTaskScore.details.outputRubricScore,
    weights: p01Verification.frozenTaskScore.details.weights,
    officialScore: p01Verification.frozenTaskScore.officialScore,
  };
  report.checkpoints.push(scoreCheckpoint, {
    name: 'portfolio-complete',
    projectCompositeScore: portfolio.projectCompositeScore,
    references: portfolio.references,
  });
} catch (error) {
  report.blockingIssues.push({
    code: 'task5-vertical-runtime-failure',
    message: String(error?.stack ?? error?.message ?? error),
  });
} finally {
  await Promise.all(contexts.map((context) => context.close().catch(() => undefined)));
  await browser?.close().catch(() => undefined);
  if (server) await stopServer(server);
  await writeFile(tsconfigPath, originalTsconfig, 'utf8');
  await writeFile(path.join(outDir, 'server.log'), `${serverLogs.join('')}\n`, 'utf8');
  if (report.browserErrors.length) {
    report.blockingIssues.push({ code: 'browser-errors', errors: report.browserErrors });
  }
  await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await removeWithRetry(databaseDirectory);
  await removeWithRetry(distDirPath);
}

console.log(JSON.stringify(report, null, 2));
if (report.blockingIssues.length) process.exit(1);

async function authenticatedContext(activeBrowser, username, expectedRole) {
  const context = await activeBrowser.newContext({ viewport: { width: 1440, height: 900 } });
  const response = await context.request.post(new URL('/api/auth/login', baseUrl).toString(), {
    data: { username, password: demoPassword },
  });
  const body = await response.json().catch(() => ({}));
  check(response.ok(), `Login failed for ${username}: ${response.status()}.`);
  const actor = body.actor ?? body;
  check(actor.role === expectedRole, `Unexpected role for ${username}: ${actor.role}.`);
  const me = await requestJson(context, 'GET', '/api/auth/me');
  check(me.actor?.username === username || me.username === username,
    `Authenticated actor mismatch for ${username}.`);
  report.actorLogins.push({ username, role: expectedRole, userId: actor.userId ?? actor.id });
  context.on('page', (page) => observePage(page, username));
  return context;
}

async function prepareOutputAccess({ actor, context, taskId, nodePrefix, score }) {
  let snapshot = await requestJson(context, 'GET', '/api/learning/me');
  snapshot = await appendPracticePass(context, snapshot, `${nodePrefix}-N02`, `${taskId}-n02`);
  snapshot = await requestJson(context, 'POST', `/api/learning/nodes/${nodePrefix}-N02/attempts`, {
    attemptId: `${runId}-${actor}-${taskId}-attempt-${randomUUID()}`,
    gameId: 'node-test',
    score,
    durationSeconds: 180,
    mistakeKnowledgePointIds: [],
    expectedVersion: snapshot.version,
  });
  snapshot = await appendPracticePass(context, snapshot, `${nodePrefix}-N03`, `${taskId}-n03`);
  snapshot = await appendPracticePass(context, snapshot, `${nodePrefix}-N04`, `${taskId}-n04`);
  const n02 = snapshot.nodes.find(({ nodeId }) => nodeId === `${nodePrefix}-N02`);
  const n04 = snapshot.nodes.find(({ nodeId }) => nodeId === `${nodePrefix}-N04`);
  check((n02?.bestFormalScore ?? -1) >= score, `${actor} ${taskId} N02 score was not persisted.`);
  check(n04?.stateTrail?.includes('micro-practice-passed'), `${actor} ${taskId} N04 is not writable.`);
  report.fixtureSteps.push({
    actor,
    taskId,
    mechanism: 'actor-scoped learning command API',
    n02HighestScore: n02.bestFormalScore,
    n04State: n04.state,
    snapshotVersion: snapshot.version,
  });
}

async function appendPracticePass(context, snapshot, nodeId, suffix) {
  return requestJson(context, 'POST', `/api/learning/nodes/${nodeId}/events`, {
    eventId: `${runId}-${suffix}-${randomUUID()}`,
    channel: 'game',
    eventType: 'game_completed',
    payload: { completed: true, formal: false, score: 100 },
    expectedVersion: snapshot.version,
  });
}

async function draftReloadSubmitThroughUi(flow, schema) {
  const page = await flow.context.newPage();
  await gotoOutputPage(page, flow);
  const form = outputForm(page, flow.taskId);
  check(await form.getAttribute('data-output-version') === '0', `${flow.taskId} did not start at v0.`);
  const fields = outputFields(flow.actor, schema, false);
  await fillOutputFields(page, schema, fields);
  const draftResponse = await clickAndReadResponse(
    page,
    `/api/outputs/${flow.taskId}/draft`,
    page.getByRole('button', { name: '保存草稿' }),
  );
  check(draftResponse.status === 200, `${flow.taskId} draft failed.`);
  await page.locator(`form[data-professional-output="${flow.taskId}"][data-output-version="1"][data-output-revision="1"]`).waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator(`form[data-professional-output="${flow.taskId}"][data-output-version="1"][data-output-revision="1"]`).waitFor();
  await assertOutputFields(page, schema, fields);
  const submitResponse = await clickAndReadResponse(
    page,
    `/api/outputs/${flow.taskId}/submit`,
    page.getByRole('button', { name: '提交教师复核' }),
  );
  check(submitResponse.status === 200, `${flow.taskId} submit failed.`);
  await page.locator(`form[data-professional-output="${flow.taskId}"][data-output-status="submitted"][data-output-revision="2"]`).waitFor();
  const aggregate = await requestJson(flow.context, 'GET', `/api/outputs/${flow.taskId}`);
  check(aggregate.head.status === 'submitted' && aggregate.head.currentVersion === 1,
    `${flow.taskId} authoritative aggregate is not submitted v1.`);
  report.uiActions.push({
    actor: flow.actor,
    action: 'draft-reload-submit',
    taskId: flow.taskId,
    outputId: aggregate.head.outputId,
    version: aggregate.head.currentVersion,
    stateRevision: aggregate.head.stateRevision,
    responses: { draft: draftResponse.status, submit: submitResponse.status },
  });
  await page.close();
  return { outputId: aggregate.head.outputId, fields, aggregate };
}

async function reviseReloadSubmitThroughUi(context, flow, schema, originalFields) {
  const page = await context.newPage();
  await gotoOutputPage(page, flow);
  await page.locator(`form[data-professional-output="P01"][data-output-status="returned"][data-output-revision="3"]`).waitFor();
  await capture(page, 'student-output-returned-desktop-1440.png', 1440, 900);
  await capture(page, 'student-output-returned-mobile-390.png', 390, 844);
  await page.setViewportSize({ width: 1440, height: 900 });
  const fields = { ...originalFields };
  const firstKey = schema.fields[0].key;
  fields[firstKey] = `${fields[firstKey]}；补充冲突证据照片 A-07，并登记复核人。`;
  await page.locator(`[data-output-field="${firstKey}"] textarea`).fill(fields[firstKey]);
  const draftResponse = await clickAndReadResponse(
    page,
    '/api/outputs/P01/draft',
    page.getByRole('button', { name: '保存草稿' }),
  );
  check(draftResponse.status === 200, 'P01 revision draft failed.');
  await page.locator('form[data-professional-output="P01"][data-output-version="2"][data-output-revision="4"]').waitFor();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('form[data-professional-output="P01"][data-output-version="2"][data-output-revision="4"]').waitFor();
  await assertOutputFields(page, schema, fields);
  const submitResponse = await clickAndReadResponse(
    page,
    '/api/outputs/P01/submit',
    page.getByRole('button', { name: '提交教师复核' }),
  );
  check(submitResponse.status === 200, 'P01 v2 resubmit failed.');
  await page.locator('form[data-professional-output="P01"][data-output-status="submitted"][data-output-version="2"][data-output-revision="5"]').waitFor();
  const aggregate = await requestJson(context, 'GET', '/api/outputs/P01');
  report.uiActions.push({
    actor: flow.actor,
    action: 'returned-revise-reload-resubmit',
    taskId: 'P01',
    outputId: aggregate.head.outputId,
    version: aggregate.head.currentVersion,
    stateRevision: aggregate.head.stateRevision,
  });
  await page.close();
  return { outputId: aggregate.head.outputId, fields, aggregate };
}

async function openTeacherReviewPage(context, outputs) {
  const page = await context.newPage();
  await page.goto(new URL('/teacher/sessions/demo-class', baseUrl).toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.locator('[data-teacher-inspector-tab="review"]').click();
  await page.locator('[data-output-review-panel]').waitFor({ state: 'visible' });
  for (const output of outputs) {
    await page.locator(`[data-review-output-id="${output.outputId}"]`).waitFor();
  }
  return page;
}

async function returnOutputThroughUi(page, outputId, feedback) {
  await selectTeacherOutput(page, outputId);
  await page.locator('[data-output-review-panel] textarea').fill(feedback);
  const response = await clickAndReadResponse(
    page,
    `/api/teacher/outputs/${outputId}/reviews`,
    page.locator('[data-review-action="return"]'),
  );
  check(response.status === 200 && response.body.output.head.status === 'returned',
    `Teacher return failed for ${outputId}.`);
  await page.locator(`[data-review-output-id="${outputId}"]`).waitFor({ state: 'detached' });
  report.uiActions.push({
    actor: 'teacher01',
    action: 'return-output',
    outputId,
    feedback,
    stateRevision: response.body.output.head.stateRevision,
  });
}

async function verifyOutputThroughUi(page, outputId, schema, totalScore) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-teacher-inspector-tab="review"]').click();
  await page.locator('[data-output-review-panel]').waitFor({ state: 'visible' });
  await selectTeacherOutput(page, outputId);
  const scores = rubricScores(schema, totalScore);
  const inputs = page.locator('.output-review-rubric input');
  check(await inputs.count() === schema.rubric.length, `Generated rubric input count mismatch for ${schema.taskId}.`);
  for (let index = 0; index < schema.rubric.length; index += 1) {
    await inputs.nth(index).fill(String(scores[schema.rubric[index].criterion]));
  }
  await page.locator('.output-review-rubric legend').filter({ hasText: `总分 ${totalScore}/100` }).waitFor();
  const response = await clickAndReadResponse(
    page,
    `/api/teacher/outputs/${outputId}/reviews`,
    page.locator('[data-review-action="verify"]'),
  );
  check(response.status === 200 && response.body.output.head.status === 'verified',
    `Teacher verification failed for ${outputId}.`);
  await page.locator(`[data-review-output-id="${outputId}"]`).waitFor({ state: 'detached' });
  report.uiActions.push({
    actor: 'teacher01',
    action: 'verify-generated-rubric',
    taskId: schema.taskId,
    outputId,
    rubricScores: scores,
    frozenTaskScore: response.body.frozenTaskScore?.officialScore,
  });
  return response.body;
}

async function selectTeacherOutput(page, outputId) {
  const button = page.locator(`[data-review-output-id="${outputId}"]`);
  await button.waitFor();
  await button.click();
  await page.locator(`[data-review-output-id="${outputId}"][aria-pressed="true"]`).waitFor();
}

async function captureStudentVerified(context, flow, filename, width, height) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await gotoOutputPage(page, flow);
  await page.locator(`form[data-professional-output="${flow.taskId}"][data-output-status="verified"]`).waitFor();
  await screenshot(page, filename);
  await page.close();
}

async function captureAndAssertPortfolio(context, aggregates) {
  const page = await context.newPage();
  await page.goto(new URL('/student/projects/p1/portfolio', baseUrl).toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.locator('[data-p1-portfolio="complete"]').waitFor();
  const references = await page.locator('[data-p1-package-reference]').evaluateAll((nodes) => (
    nodes.map((node) => node.getAttribute('data-p1-package-reference'))
  ));
  check(references.length === 3, `Portfolio must contain exactly three references, got ${references.length}.`);
  for (const taskId of ['P01', 'P02', 'P03']) {
    const aggregate = aggregates[taskId];
    const expected = `${taskId}:${aggregate.head.outputId}:v${aggregate.head.currentVersion}`;
    check(references.includes(expected), `Portfolio is missing current immutable reference ${expected}.`);
  }
  const scoreText = (await page.locator('.p1-portfolio-hero aside strong').textContent())?.trim() ?? '';
  const projectCompositeScore = Number(scoreText);
  check(Number.isFinite(projectCompositeScore) && projectCompositeScore > 0,
    `Portfolio project composite score is invalid: ${scoreText}.`);
  await capture(page, 'portfolio-complete-desktop-1440.png', 1440, 900);
  await capture(page, 'portfolio-complete-mobile-390.png', 390, 844);
  await page.close();
  return { references, projectCompositeScore };
}

async function gotoOutputPage(page, flow) {
  await page.goto(new URL(`/learn/${flow.nodePrefix}-N04?mode=challenge`, baseUrl).toString(), {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await outputForm(page, flow.taskId).waitFor({ state: 'visible', timeout: 30_000 });
}

function outputForm(page, taskId) {
  return page.locator(`form[data-professional-output="${taskId}"]`);
}

async function fillOutputFields(page, schema, fields) {
  for (const field of schema.fields) {
    await page.locator(`[data-output-field="${field.key}"] textarea`).fill(fields[field.key]);
  }
}

async function assertOutputFields(page, schema, fields) {
  for (const field of schema.fields) {
    const value = await page.locator(`[data-output-field="${field.key}"] textarea`).inputValue();
    check(value === fields[field.key], `${schema.taskId}.${field.key} did not survive reload.`);
  }
}

function outputFields(actor, schema, revised) {
  return Object.fromEntries(schema.fields.map(({ key, label }, index) => [
    key,
    `${actor} · ${schema.taskId} · 证据${String(index + 1).padStart(2, '0')} · ${label}${revised ? ' · 修订' : ''}`,
  ]));
}

function rubricScores(schema, targetTotal) {
  let remaining = targetTotal;
  const scores = Object.fromEntries(schema.rubric.map(({ criterion, maxScore }) => {
    const score = Math.min(maxScore, remaining);
    remaining -= score;
    return [criterion, score];
  }));
  check(remaining === 0, `${schema.taskId} rubric cannot represent ${targetTotal}.`);
  return scores;
}

async function loadGeneratedSchemas() {
  const source = JSON.parse(await readFile(
    path.join(root, 'textbook/5g/generated/p1-demo-content.json'),
    'utf8',
  ));
  return Object.fromEntries(source.tasks.map((task) => {
    const deepNode = task.nodes.find((node) => node.selfStudy?.kind === 'deep');
    check(deepNode, `Generated deep content is missing for ${task.taskId}.`);
    const fields = Object.entries(deepNode.selfStudy.outputTemplate).map(([key, label]) => ({ key, label }));
    const rubric = deepNode.selfStudy.rubric;
    check(rubric.reduce((sum, item) => sum + item.maxScore, 0) === 100,
      `Generated rubric for ${task.taskId} does not total 100.`);
    return [task.taskId, { taskId: task.taskId, fields, rubric }];
  }));
}

async function clickAndReadResponse(page, pathname, locator) {
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => (
      new URL(candidate.url()).pathname === pathname
      && candidate.request().method() === 'POST'
    ), { timeout: 30_000 }),
    locator.click(),
  ]);
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) throw new Error(`UI POST ${pathname} failed: ${response.status()} ${body.error ?? ''}`.trim());
  return { status: response.status(), body };
}

async function capture(page, filename, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(150);
  await screenshot(page, filename);
}

async function screenshot(page, filename) {
  const destination = path.join(outDir, filename);
  await page.screenshot({ path: destination, fullPage: true });
  report.screenshots.push(path.relative(root, destination).replaceAll('\\', '/'));
}

async function requestJson(context, method, route, data) {
  const response = await context.request.fetch(new URL(route, baseUrl).toString(), {
    method,
    ...(data === undefined ? {} : { data }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) {
    throw new Error(`${method} ${route} failed: ${response.status()} ${body.error ?? ''}`.trim());
  }
  return body;
}

function observePage(page, actor) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      report.browserErrors.push({ actor, kind: 'console', url: page.url(), message: message.text() });
    }
  });
  page.on('pageerror', (error) => {
    report.browserErrors.push({ actor, kind: 'pageerror', url: page.url(), message: String(error?.message ?? error) });
  });
  page.on('requestfailed', (request) => {
    const message = request.failure()?.errorText ?? 'request failed';
    if (message.includes('ERR_ABORTED')) return;
    report.browserErrors.push({ actor, kind: 'requestfailed', url: request.url(), message });
  });
  page.on('response', (response) => {
    if (response.status() >= 500) {
      report.browserErrors.push({ actor, kind: 'http', url: response.url(), status: response.status() });
    }
  });
}

function startServer(env, logs) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', `pnpm --dir apps/web exec next dev --hostname ${host} --port ${port}`]
    : ['--dir', 'apps/web', 'exec', 'next', 'dev', '--hostname', host, '--port', String(port)];
  const child = spawn(command, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => {
    logs.push(chunk.toString());
    process.stdout.write(`[next] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    logs.push(chunk.toString());
    process.stderr.write(`[next] ${chunk}`);
  });
  return child;
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error(`Next server did not become ready: ${lastError?.message ?? 'timeout'}`);
}

async function stopServer(child) {
  if (!child.pid || child.killed) return;
  if (process.platform === 'win32') {
    await runAllowFailure('cmd.exe', ['/d', '/s', '/c', `taskkill /pid ${child.pid} /T /F`]);
  } else {
    child.kill('SIGTERM');
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.unref();
  await delay(750);
}

async function removeWithRetry(target) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await delay(250 * (attempt + 1));
    }
  }
  report.blockingIssues.push({
    code: 'audit-cleanup-failure',
    target: path.basename(target),
    message: String(lastError?.message ?? lastError),
  });
}

function runPnpm(args, env) {
  return process.platform === 'win32'
    ? run('cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`], env)
    : run('pnpm', args, env);
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => code === 0
      ? resolve()
      : reject(new Error(`${command} ${args.join(' ')} exited with ${code}.`)));
  });
}

function runAllowFailure(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
      resolve();
    }, 8_000);
    child.on('error', () => { clearTimeout(timer); resolve(); });
    child.on('exit', () => { clearTimeout(timer); resolve(); });
  });
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const serverSocket = net.createServer();
    serverSocket.unref();
    serverSocket.on('error', reject);
    serverSocket.listen(0, host, () => {
      const address = serverSocket.address();
      const value = typeof address === 'object' && address ? address.port : 0;
      serverSocket.close(() => resolve(value));
    });
  });
}

function validatedPort(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1024 || number > 65535) throw new Error(`Invalid --port: ${value}`);
  return number;
}

function readArg(name, fallback) {
  const inline = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function assertNode20() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major !== 20) throw new Error(`Task 5 browser audit requires Node 20; current runtime is ${process.version}.`);
}

function assertWithin(parent, candidate, message) {
  const relative = path.relative(parent, candidate);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(message);
  }
}

function check(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

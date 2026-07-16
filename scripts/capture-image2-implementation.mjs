#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './utils/playwright-browser.mjs';
import {
  authenticateImage2Context,
  buildCaptureJobs,
  evaluateImage2Layout,
  normalizeBaseUrl,
  observeImage2Layout,
  readImage2Contract,
  waitForImage2Stability,
} from './utils/image2-visual-audit.mjs';

export async function runImage2ImplementationAudit(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? 'http://127.0.0.1:3157/');
  const outDir = path.resolve(process.cwd(), options.outDir ?? 'output/playwright/image2-implementation');
  const outputRoot = path.resolve(process.cwd(), 'output/playwright');
  if (outDir !== outputRoot && !outDir.startsWith(`${outputRoot}${path.sep}`)) {
    throw new Error(`Image2 audit output must stay under ${outputRoot}.`);
  }
  const password = options.password ?? process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
  const contract = await readImage2Contract(options.contractFile);
  const jobs = buildCaptureJobs(contract, options.filters);
  const browser = await launchChromium({ headless: options.headless !== false });
  const consoleErrors = [];
  const contexts = new Map();
  const pages = new Set();
  const fixture = new Image2FixtureManager({ browser, baseUrl, password, consoleErrors });
  const report = {
    tool: 'capture-image2-implementation',
    contractVersion: contract.version,
    baseUrl,
    checkedAt: new Date().toISOString(),
    matrix: { jobs: jobs.length, states: new Set(jobs.map(({ key }) => key)).size },
    captures: [],
    consoleErrors,
    failures: [],
  };

  // A new report must never inherit screenshots from a prior failed run.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  try {
    let lastFixtureKey = '';
    for (const job of jobs) {
      if (job.key !== lastFixtureKey) {
        await fixture.ensure(job.key);
        lastFixtureKey = job.key;
      }
      const contextKey = `${job.actor}|${job.viewportId}`;
      let context = contexts.get(contextKey);
      if (!context) {
        context = await browser.newContext({
          viewport: { width: job.profile.width, height: job.profile.height },
          reducedMotion: 'reduce',
          colorScheme: 'dark',
        });
        await authenticateImage2Context(context, job.actor, baseUrl, password);
        bindConsole(context, contextKey, consoleErrors);
        contexts.set(contextKey, context);
      }
      const stateKey = `${job.key}|${job.viewportId}`;
      let page = [...pages].find((candidate) => candidate.__image2StateKey === stateKey);
      if (!page) {
        page = await context.newPage();
        page.__image2StateKey = stateKey;
        pages.add(page);
        await openState(page, job, baseUrl);
      }
      const capture = await captureJob(page, job, contract, outDir, baseUrl);
      report.captures.push(capture);
      report.failures.push(...capture.failures.map((failure) => ({
        key: job.key,
        viewport: job.viewportId,
        capture: job.capture,
        ...failure,
      })));
    }
  } catch (error) {
    report.failures.push({ code: 'capture-runtime-failure', detail: String(error?.stack ?? error) });
  } finally {
    await Promise.all([...pages].map((page) => page.close().catch(() => undefined)));
    await fixture.close();
    await Promise.all([...contexts.values()].map((context) => context.close().catch(() => undefined)));
    await browser.close();
  }

  if (consoleErrors.length) {
    report.failures.push({ code: 'browser-console-errors', detail: consoleErrors });
  }
  report.summary = {
    captures: report.captures.length,
    screenshots: report.captures.filter(({ screenshotSha256 }) => screenshotSha256).length,
    failures: report.failures.length,
  };
  const reportPath = path.join(outDir, 'report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  if (options.strict !== false && report.failures.length) {
    throw new Error(`Image2 implementation audit failed with ${report.failures.length} issue(s). Report: ${reportPath}`);
  }
  return { report, reportPath };
}

async function captureJob(page, job, contract, outDir, baseUrl) {
  await positionCapture(page, job.capture);
  const observation = await observeImage2Layout(page, job.state);
  const failures = evaluateImage2Layout({ state: job.state, contract, profile: job.profile, observation });
  failures.push(...await keyboardFailures(page, job.state, observation));
  // Keyboard traversal can scroll the primary action into view. Restore the
  // requested capture position so a bottom capture is actually the page bottom.
  await positionCapture(page, job.capture);
  if (observation.skipLinks < 1) failures.push({ code: 'skip-link-missing', detail: job.key });
  const snapshot = await readSnapshotMetadata(page.context(), job.surfaceId, job.actor, baseUrl);
  const screenshotPath = path.join(outDir, job.fileName);
  await page.screenshot({
    path: screenshotPath,
    fullPage: job.capture === 'full-page',
    animations: 'disabled',
  });
  const screenshot = await import('node:fs/promises').then(({ readFile }) => readFile(screenshotPath));
  return {
    key: job.key,
    surface: job.surfaceId,
    state: job.stateId,
    actor: job.actor,
    setup: job.state.setup,
    viewport: job.viewportId,
    capture: job.capture,
    screenshot: path.relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
    screenshotSha256: createHash('sha256').update(screenshot).digest('hex'),
    actualUrl: observation.actualUrl,
    revision: snapshot.revision,
    snapshotVersion: snapshot.snapshotVersion,
    observation,
    failures,
  };
}

async function positionCapture(page, capture) {
  if (capture === 'bottom') {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(60);
    return;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function openState(page, job, baseUrl) {
  const target = new URL(`${job.state.route}${job.state.query ?? ''}`, baseUrl).toString();
  const response = await page.goto(target, { waitUntil: 'networkidle', timeout: 60_000 });
  if (!response?.ok()) throw new Error(`${job.key} returned ${response?.status() ?? 'no response'}`);
  if (job.surfaceId === 'login') {
    const role = job.stateId === 'teacher' ? 'teacher' : 'student';
    await page.locator(`[data-login-role-option="${role}"]`).click();
  }
  if (job.surfaceId.startsWith('n02-')) {
    const nav = page.locator('.self-study-head nav button');
    if (await nav.count() >= 2) await nav.nth(1).click();
  }
  await waitForImage2Stability(page, job.state).catch(() => undefined);
}

async function keyboardFailures(page, state, observation) {
  const failures = [];
  if (state.primaryActionPolicy === 'exactly-one' && observation.primaryActions.length === 1) {
    if (!page.__image2PrimaryKeyboardFocus) {
      page.__image2PrimaryKeyboardFocus = inspectPrimaryKeyboardFocus(page);
    }
    const focus = await page.__image2PrimaryKeyboardFocus;
    if (!focus.focused || !focus.native) failures.push({ code: 'primary-action-keyboard-unreachable', detail: focus });
    if (!focus.focusVisible || !(focus.outlineWidth > 0) || focus.outlineStyle === 'none') {
      failures.push({ code: 'focus-visible-missing', detail: focus });
    }
  }
  return failures;
}

async function inspectPrimaryKeyboardFocus(page) {
  const primary = page.locator('[data-primary-action]').first();
  const focusableCount = await page.locator(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[role="button"],[tabindex]:not([tabindex="-1"])',
  ).count();
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  let focused = false;
  for (let index = 0; index < Math.min(focusableCount + 3, 200); index += 1) {
    await page.keyboard.press('Tab');
    focused = await primary.evaluate((element) => document.activeElement === element).catch(() => false);
    if (focused) break;
  }
  return primary.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focused: document.activeElement === element,
      focusVisible: element.matches(':focus-visible'),
      native: ['A', 'BUTTON', 'INPUT'].includes(element.tagName) || element.getAttribute('role') === 'button',
      outlineWidth: parseFloat(style.outlineWidth || '0'),
      outlineStyle: style.outlineStyle,
    };
  }).catch(() => ({
    focused,
    focusVisible: false,
    native: false,
    outlineWidth: 0,
    outlineStyle: 'none',
  }));
}

async function readSnapshotMetadata(context, surfaceId, actor, baseUrl) {
  if (actor.startsWith('anonymous-')) return { revision: null, snapshotVersion: null };
  const audience = surfaceId === 'projector'
    ? 'projector'
    : surfaceId === 'course-graph' ? 'graph' : actor === 'teacher01' ? 'teacher' : 'student';
  const response = await context.request.get(new URL(`/api/snapshot?audience=${audience}&sessionId=demo-class`, baseUrl).toString());
  if (!response.ok()) return { revision: null, snapshotVersion: null };
  const snapshot = await response.json();
  return {
    revision: snapshot.classroom?.revision ?? snapshot.classroom?.lessonState?.revision ?? snapshot.classroomRevision ?? null,
    snapshotVersion: snapshot.snapshotVersion ?? null,
  };
}

export class Image2FixtureManager {
  constructor({ browser, baseUrl, password, consoleErrors }) {
    this.browser = browser;
    this.baseUrl = baseUrl;
    this.password = password;
    this.consoleErrors = consoleErrors;
    this.contexts = new Map();
    this.completed = new Set();
  }

  async context(actor) {
    let context = this.contexts.get(actor);
    if (context) return context;
    context = await this.browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await authenticateImage2Context(context, actor, this.baseUrl, this.password);
    bindConsole(context, `fixture:${actor}`, this.consoleErrors);
    this.contexts.set(actor, context);
    return context;
  }

  async ensure(key) {
    if (this.completed.has(key)) return;
    if (key === 'n04-p01/returned') await this.ensureOutputState('stu-01', 'P01', 'P1T1', 'returned');
    if (key === 'n04-p02/draft') await this.ensureOutputState('stu-02', 'P02', 'P1T2', 'draft');
    if (key === 'n04-p03/submitted') await this.ensureOutputState('stu-03', 'P03', 'P1T3', 'submitted');
    if (key === 'portfolio/complete') await this.ensureStudentThreePortfolioComplete();
    if (key.startsWith('teacher-session/') || key.startsWith('student-follow/') || key.startsWith('projector/')) {
      await this.ensureClassroomFixture();
    }
    this.completed.add(key);
  }

  async ensureOutputState(actor, taskId, nodePrefix, desired) {
    const context = await this.context(actor);
    let output = await this.api(context, 'GET', `/api/outputs/${taskId}`, undefined, {
      allowLocked: true,
      allowNull: true,
    });
    if (outputStateSatisfies(output?.head?.status, desired)) return output;
    await this.ensureOutputAccess(context, taskId, nodePrefix);
    output = await this.api(context, 'GET', `/api/outputs/${taskId}`, undefined, { allowNull: true });
    if (outputStateSatisfies(output?.head?.status, desired)) return output;
    if (!output || output.head.status === 'returned') {
      output = await this.writeOutputThroughUi(context, taskId, nodePrefix, output, desired === 'draft' ? 'draft' : 'submitted');
    } else if (output.head.status === 'draft' && desired !== 'draft') {
      output = await this.submitExistingOutput(context, taskId, nodePrefix);
    }
    if (desired === 'returned' && output?.head?.status === 'submitted') {
      const teacher = await this.context('teacher01');
      const queue = await this.api(teacher, 'GET', '/api/teacher/outputs');
      const item = queue.outputs.find((candidate) => candidate.outputId === output.head.outputId);
      if (!item) throw new Error(`${taskId} submitted output is absent from teacher queue`);
      await this.api(teacher, 'POST', `/api/teacher/outputs/${item.outputId}/reviews`, {
        expectedStateRevision: item.stateRevision,
        action: 'return',
        feedback: '请补齐关键证据索引和连接方向判断依据后修订。',
      });
      output = await this.api(context, 'GET', `/api/outputs/${taskId}`);
    }
    if (!outputStateSatisfies(output?.head?.status, desired)) {
      throw new Error(`${actor} ${taskId} expected ${desired}, received ${output?.head?.status}`);
    }
    return output;
  }

  async ensureOutputAccess(context, taskId, nodePrefix) {
    let learning = await this.api(context, 'GET', '/api/learning/me');
    learning = await this.learningEvent(context, learning, `${nodePrefix}-N02`, `${taskId}-n02`);
    if (needsFormalAttempt(learning, `${nodePrefix}-N02`)) {
      learning = await this.api(context, 'POST', `/api/learning/nodes/${nodePrefix}-N02/attempts`, {
        attemptId: `image2-${taskId}-${randomUUID()}`,
        gameId: 'node-test',
        score: 90,
        durationSeconds: 180,
        mistakeKnowledgePointIds: [],
        expectedVersion: learning.version,
      });
    }
    learning = await this.learningEvent(context, learning, `${nodePrefix}-N03`, `${taskId}-n03`);
    await this.learningEvent(context, learning, `${nodePrefix}-N04`, `${taskId}-n04`);
  }

  async learningEvent(context, learning, nodeId, suffix) {
    return this.api(context, 'POST', `/api/learning/nodes/${nodeId}/events`, {
      eventId: `image2-${suffix}-${randomUUID()}`,
      channel: 'game',
      eventType: 'game_completed',
      payload: { completed: true, formal: false, score: 100 },
      expectedVersion: learning.version,
    });
  }

  async writeOutputThroughUi(context, taskId, nodePrefix, existing, target) {
    const page = await context.newPage();
    try {
      await page.goto(new URL(`/learn/${nodePrefix}-N04?mode=challenge`, this.baseUrl).toString(), { waitUntil: 'networkidle' });
      const form = page.locator(`form[data-professional-output="${taskId}"]`);
      await form.waitFor({ state: 'visible', timeout: 20_000 });
      const fields = form.locator('[data-output-field] textarea');
      const count = await fields.count();
      for (let index = 0; index < count; index += 1) {
        const value = await fields.nth(index).inputValue();
        if (!value.trim()) await fields.nth(index).fill(`样张证据 ${taskId}-${index + 1}：现场对象、时间、位置、身份与连接方向均已记录，可由照片索引复核。`);
      }
      if (existing?.head?.status === 'returned' && count) {
        await fields.first().fill(`${await fields.first().inputValue()} 已按教师意见补齐复核路径。`);
      }
      if (target === 'draft') {
        await page.getByRole('button', { name: /保存草稿/ }).click();
      } else {
        await page.getByRole('button', { name: /提交教师复核/ }).click();
      }
      await page.waitForFunction(({ taskId, target }) => (
        document.querySelector(`form[data-professional-output="${taskId}"]`)?.getAttribute('data-output-status') === target
      ), { taskId, target }, { timeout: 20_000 });
    } finally {
      await page.close();
    }
    return this.api(context, 'GET', `/api/outputs/${taskId}`);
  }

  async submitExistingOutput(context, taskId, nodePrefix) {
    return this.writeOutputThroughUi(context, taskId, nodePrefix, await this.api(context, 'GET', `/api/outputs/${taskId}`), 'submitted');
  }

  async ensureStudentThreePortfolioComplete() {
    const student = await this.context('stu-03');
    const p03 = await this.ensureOutputState('stu-03', 'P03', 'P1T3', 'submitted');
    if (p03.head.status === 'submitted') await this.verifyOutput(p03.head.outputId);
    const portfolioResponse = await student.request.get(new URL('/api/learning/p1-project', this.baseUrl).toString());
    if (portfolioResponse.ok()) {
      const project = await portfolioResponse.json();
      if (project.packageStatus && project.packageStatus !== 'complete') {
        throw new Error(`stu-03 portfolio did not complete: ${project.packageStatus}`);
      }
    }
  }

  async verifyOutput(outputId) {
    const teacher = await this.context('teacher01');
    const queue = await this.api(teacher, 'GET', '/api/teacher/outputs');
    const item = queue.outputs.find((candidate) => candidate.outputId === outputId);
    if (!item) return;
    const rubricScores = Object.fromEntries(item.rubric.map(({ key, maxScore }) => [key, maxScore]));
    await this.api(teacher, 'POST', `/api/teacher/outputs/${outputId}/reviews`, {
      expectedStateRevision: item.stateRevision,
      action: 'verify',
      feedback: '样张证据完整，达到职业化成果标准。',
      rubricScores,
    });
  }

  async ensureClassroomFixture() {
    if (this.completed.has('fixture/classroom')) return;
    const teacher = await this.context('teacher01');
    let payload = await this.api(teacher, 'GET', '/api/class-sessions/demo-class');
    if (payload.session.activeNodeId !== 'P1T1-N02') {
      throw new Error(`Image2 classroom fixture expected P1T1-N02, received ${payload.session.activeNodeId ?? 'none'}`);
    }
    const phases = planClassroomActivationPhases(
      payload.session.sessionStatus,
      payload.session.lessonState.phase,
    );
    for (const phase of phases) {
      payload = await this.api(teacher, 'PATCH', '/api/class-sessions/demo-class', {
        intent: { type: 'phase_changed', phase },
        expectedRevision: payload.session.lessonState.revision,
      });
    }
    if (payload.session.sessionStatus !== 'active' || payload.session.lessonState.phase !== 'lecture') {
      throw new Error(`Image2 classroom fixture failed to reach active lecture: ${payload.session.sessionStatus}/${payload.session.lessonState.phase}`);
    }
    for (const [actor, mode] of [['stu-01', 'follow'], ['stu-02', 'self']]) {
      const context = await this.context(actor);
      await this.api(context, 'PUT', '/api/class-sessions/demo-class/participation');
      await this.api(context, 'PATCH', '/api/class-sessions/demo-class/participation', { mode });
    }
    const left = await this.context('stu-03');
    await this.api(left, 'PUT', '/api/class-sessions/demo-class/participation');
    await this.api(left, 'DELETE', '/api/class-sessions/demo-class/participation');
    this.completed.add('fixture/classroom');
  }

  async api(context, method, route, data, { allowLocked = false, allowNull = false } = {}) {
    const url = new URL(route, this.baseUrl).toString();
    const response = method === 'GET'
      ? await context.request.get(url)
      : method === 'POST'
        ? await context.request.post(url, data === undefined ? {} : { data })
        : method === 'PATCH'
          ? await context.request.patch(url, data === undefined ? {} : { data })
          : method === 'PUT'
            ? await context.request.put(url, data === undefined ? {} : { data })
            : await context.request.delete(url, data === undefined ? {} : { data });
    const body = await response.json().catch(() => null);
    if (apiResponseCanBeEmpty(response.status(), body, { allowLocked, allowNull })) return null;
    if (!response.ok()) throw new Error(`${method} ${route} returned ${response.status()}: ${JSON.stringify(body)}`);
    return body;
  }

  async close() {
    await Promise.all([...this.contexts.values()].map((context) => context.close().catch(() => undefined)));
  }
}

export function outputStateSatisfies(actual, desired) {
  return actual === desired || (desired === 'submitted' && actual === 'verified');
}

export function needsFormalAttempt(learning, nodeId, passScore = 80) {
  const node = learning?.nodes?.find((candidate) => candidate.nodeId === nodeId);
  return (node?.bestFormalScore ?? -1) < passScore;
}

export function apiResponseCanBeEmpty(status, body, { allowLocked = false, allowNull = false } = {}) {
  if (allowNull && status === 404) return true;
  return Boolean(allowLocked && status === 403 && body?.routeState === 'locked');
}

export function planClassroomActivationPhases(status, phase) {
  if (status === 'closed') throw new Error('Cannot prepare a closed classroom.');
  if (phase === 'close') throw new Error('Cannot leave a closed lesson phase.');
  if (status === 'active' && phase === 'lecture') return [];
  if (phase === 'prepare' || phase === 'question' || phase === 'practice' || phase === 'review') return ['lecture'];
  if (phase === 'challenge') return ['review', 'lecture'];
  if (phase === 'lecture') return ['question', 'lecture'];
  throw new Error(`Unknown classroom phase: ${phase}`);
}

function bindConsole(context, label, errors) {
  context.on('page', (page) => {
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
  });
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function csvArg(name) {
  const value = readArg(name, '');
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : undefined;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = await runImage2ImplementationAudit({
    baseUrl: readArg('--base-url', 'http://127.0.0.1:3157/'),
    outDir: readArg('--out', 'output/playwright/image2-implementation'),
    strict: !process.argv.includes('--allow-failures'),
    filters: {
      surfaceIds: csvArg('--surfaces'),
      stateKeys: csvArg('--states'),
      viewportIds: csvArg('--viewports'),
      captures: csvArg('--captures'),
    },
  });
  console.log(`Image2 captures: ${result.reportPath}`);
}

#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchChromium } from './utils/playwright-browser.mjs';

const baseUrl = normalizeBaseUrl(readArg('--base-url', 'http://127.0.0.1:3157/'));
const sessionId = readArg('--session-id', 'demo-class');
const outDir = path.resolve(process.cwd(), readArg('--out', 'output/playwright/class-session-sync'));
const isolated = process.env.DGBOOK_AUDIT_ISOLATED_SQLITE === '1';
const password = process.env.DGBOOK_DEMO_PASSWORD ?? '123456';
const report = { baseUrl, sessionId, isolated, checkedAt: new Date().toISOString(), checks: [] };

await mkdir(outDir, { recursive: true });
const browser = await launchChromium({ headless: true });
try {
  const teacher = await loginContext('teacher01');
  const student = await loginContext('student01');
  const projector = await loginContext('teacher01');
  const sessionRoute = `/api/class-sessions/${encodeURIComponent(sessionId)}`;

  if (isolated) {
    const response = await teacher.request.patch(url(sessionRoute), {
      data: { patch: { activeNodeId: 'P1T1-N02', activeTaskId: 'P01', sceneMode: 'learning' } },
    });
    assert(response.ok(), `teacher sync patch returned ${response.status()}`);
    report.checks.push({ name: 'isolated teacher mutation', status: 'passed' });
  } else {
    report.checks.push({ name: 'isolated teacher mutation', status: 'skipped' });
  }

  const [teacherSnapshot, studentSnapshot, projectorSnapshot] = await Promise.all([
    readSession(teacher, sessionRoute),
    readSession(student, sessionRoute),
    readSession(projector, `${sessionRoute}?view=projector`),
  ]);
  const activeNodeIds = [teacherSnapshot, studentSnapshot, projectorSnapshot].map((item) => item.activeNodeId);
  assert(new Set(activeNodeIds).size === 1, `classroom views disagree on active node: ${activeNodeIds.join(', ')}`);
  report.checks.push({ name: 'three-view active node parity', status: 'passed', activeNodeId: activeNodeIds[0] });

  await Promise.all([
    capture(teacher, `/teacher/sessions/${sessionId}`, '.teacher-console', 'teacher'),
    capture(student, `/classroom/${sessionId}`, '.follow-app', 'student'),
    capture(projector, `/present/${sessionId}`, '.projector-app', 'projector'),
  ]);
  await Promise.all([teacher.close(), student.close(), projector.close()]);
} finally {
  await browser.close();
}

await writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`class session sync audit passed: ${path.join(outDir, 'report.json')}`);

async function loginContext(username) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const response = await context.request.post(url('/api/auth/login'), { data: { username, password } });
  assert(response.ok(), `${username} login returned ${response.status()}`);
  return context;
}

async function readSession(context, route) {
  const response = await context.request.get(url(route));
  assert(response.ok(), `${route} returned ${response.status()}`);
  const body = await response.json();
  assert(body.session, `${route} omitted session`);
  return body.session;
}

async function capture(context, route, selector, label) {
  const page = await context.newPage();
  const response = await page.goto(url(route), { waitUntil: 'networkidle' });
  assert(response?.ok(), `${label} page returned ${response?.status() ?? 'no response'}`);
  await page.locator(selector).first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: true });
  report.checks.push({ name: `${label} page`, status: 'passed' });
  await page.close();
}

function url(route) { return new URL(route.replace(/^\//, ''), baseUrl).toString(); }
function normalizeBaseUrl(value) { return value.endsWith('/') ? value : `${value}/`; }
function readArg(name, fallback) { const index = process.argv.indexOf(name); return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback; }
function assert(condition, message) { if (!condition) throw new Error(message); }

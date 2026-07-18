import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  helperHealth,
  parseHelperArgs,
  simulatorPayload,
  shouldReloadForCommand,
  shouldApplyCommand,
  studentUsername,
  studentPageUrl,
} from './classroom-helper-core.mjs';

const demoEnv = { DGBOOK_DEMO_PASSWORD: 'test-password' };

test('parses one teacher helper with three deterministic students', () => {
  const config = parseHelperArgs([
    '--',
    '--base-url', 'http://8.153.206.97/',
    '--session', 'demo-class',
    '--students', 'stu-01,stu-02,stu-03',
    '--token', 'secret',
    '--headless',
  ], demoEnv);

  assert.deepEqual(config, {
    baseUrl: 'http://8.153.206.97',
    sessionId: 'demo-class',
    students: ['stu-01', 'stu-02', 'stu-03'],
    demoPassword: 'test-password',
    token: 'secret',
    healthPort: 17352,
    headless: true,
  });
});

test('builds the Cookie-gated student follow route without identity query parameters', () => {
  const config = parseHelperArgs(['--session', 'demo-class', '--students', 'stu-01'], demoEnv);

  assert.equal(studentPageUrl(config), 'http://127.0.0.1:3157/classroom/demo-class');
});

test('maps the configured member id to its real demo login account', () => {
  assert.equal(studentUsername('stu-03'), 'student03');
  assert.throws(() => studentUsername('external-student'), /student id/i);
});

test('applies only a newer command revision targeted to the student', () => {
  const broadcast = { commandId: 'cmd-5', revision: 5 };
  const targeted = { commandId: 'cmd-6', revision: 6, studentId: 'stu-02' };

  assert.equal(shouldApplyCommand(4, broadcast, 'stu-01', 'cmd-4'), true);
  assert.equal(shouldApplyCommand(5, broadcast, 'stu-01', 'cmd-5'), false);
  assert.equal(shouldApplyCommand(5, targeted, 'stu-01', 'cmd-5'), false);
  assert.equal(shouldApplyCommand(5, targeted, 'stu-02', 'cmd-5'), true);
});

test('accepts a new command id and reloads after the server revision epoch resets', () => {
  const restartedServerCommand = { commandId: 'cmd-new-r1', revision: 1 };

  assert.equal(shouldApplyCommand(4, restartedServerCommand, 'stu-01', 'cmd-old-r4'), true);
  assert.equal(shouldReloadForCommand(4, 'cmd-old-r4', restartedServerCommand), true);
  assert.equal(shouldApplyCommand(4, restartedServerCommand, 'stu-01', 'cmd-new-r1'), false);
  assert.equal(shouldReloadForCommand(4, 'cmd-new-r1', restartedServerCommand), false);
});

test('reports the exact local health contract', () => {
  const config = parseHelperArgs(['--session', 'demo-class', '--students', 'stu-01,stu-02,stu-03'], demoEnv);

  assert.deepEqual(helperHealth(config), {
    status: 'online',
    sessionId: 'demo-class',
    students: ['stu-01', 'stu-02', 'stu-03'],
  });
});

test('marks every helper request as an isolated simulator device', () => {
  assert.deepEqual(simulatorPayload({
    kind: 'heartbeat',
    actorRole: 'student',
    studentId: 'stu-01',
    clientKind: 'browser',
  }), {
    kind: 'heartbeat',
    actorRole: 'student',
    studentId: 'stu-01',
    clientKind: 'helper-simulator',
  });
});

test('rejects missing sessions and empty student lists', () => {
  assert.throws(() => parseHelperArgs(['--students', 'stu-01'], demoEnv), /session/i);
  assert.throws(() => parseHelperArgs(['--session', 'demo-class', '--students', ''], demoEnv), /student/i);
  assert.throws(() => parseHelperArgs(['--session', 'demo-class', '--students', 'stu-01'], {}), /password/i);
});

test('helper authenticates each browser with the HttpOnly actor Cookie and has no identity override', () => {
  const helper = readFileSync(new URL('./classroom-helper.mjs', import.meta.url), 'utf8');
  const core = readFileSync(new URL('./classroom-helper-core.mjs', import.meta.url), 'utf8');

  assert.match(helper, /\/api\/auth\/login/);
  assert.match(core, /DGBOOK_DEMO_PASSWORD/);
  assert.doesNotMatch(helper, /localStorage|addInitScript|studentIdentityStorage/);
  assert.doesNotMatch(core, /searchParams\.set\(['"]student/);
});

test('simulator never steals the operator focus or impersonates a real browser client', () => {
  const helper = readFileSync(new URL('./classroom-helper.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(helper, /bringToFront|\.focus\s*\(/);
  assert.match(helper, /simulatorPayload\(body\)/);
  assert.match(helper, /演示设备模拟器/);
  assert.doesNotMatch(helper, /studentMode|studentSyncState|selfStudy|personalCursor/);
});

test('blocks only browser presence before a simulator context can authenticate or open a page', () => {
  const helper = readFileSync(new URL('./classroom-helper.mjs', import.meta.url), 'utf8');
  const routePattern = "await context.route('**/api/class-sessions/*/presence*', (route) => route.abort('blockedbyclient'));";
  const routeIndex = helper.indexOf(routePattern);

  assert.notEqual(routeIndex, -1);
  assert.equal(helper.match(/browser\.newContext\(\)/g)?.length, 1);
  assert.equal(helper.match(/context\.route\(/g)?.length, 1);
  assert.ok(routeIndex > helper.indexOf('const context = await browser.newContext()'));
  assert.ok(routeIndex < helper.indexOf('context.request.post('));
  assert.ok(routeIndex < helper.indexOf('context.newPage()'));
  assert.ok(routeIndex < helper.indexOf('page.goto('));
  assert.doesNotMatch(helper, /context\.route\([^\n]*(?:participation|cursor)/i);
});

#!/usr/bin/env node
import http from 'node:http';
import { launchChromium } from './utils/playwright-browser.mjs';
import {
  helperHealth,
  parseHelperArgs,
  shouldApplyCommand,
  shouldReloadForCommand,
  studentUsername,
  studentPageUrl,
} from './classroom-helper-core.mjs';

if (process.argv.includes('--help')) {
  console.log('Usage: pnpm classroom-helper:start -- --session demo-class --students stu-01,stu-02,stu-03 [--base-url URL] [--token TOKEN] [--health-port 17352] [--headless]');
  process.exit(0);
}

const config = parseHelperArgs(process.argv.slice(2));
const helperApiUrl = `${config.baseUrl}/api/class-sessions/${encodeURIComponent(config.sessionId)}/helper`;
const browser = await launchChromium({ headless: config.headless });
const clients = new Map();
let stopping = false;

try {
  for (const studentId of config.students) {
    const context = await browser.newContext();
    const login = await context.request.post(`${config.baseUrl}/api/auth/login`, {
      data: { username: studentUsername(studentId), password: config.demoPassword },
    });
    const loginBody = await login.json().catch(() => null);
    if (!login.ok() || loginBody?.actor?.role !== 'student' || loginBody.actor.userId !== studentId) {
      await context.close();
      throw new Error(`Classroom Helper could not authenticate ${studentId}.`);
    }
    const page = await context.newPage();
    clients.set(studentId, {
      context,
      page,
      lastAppliedRevision: 0,
      lastAppliedCommandId: undefined,
      pageState: 'opening',
    });
    await page.goto(studentPageUrl(config, studentId), { waitUntil: 'domcontentloaded' });
    clients.get(studentId).pageState = 'ready';
  }
} catch (error) {
  await Promise.allSettled([...clients.values()].map(({ context }) => context.close()));
  await browser.close();
  throw error;
}

const healthServer = startHealthServer(config);
await heartbeatAll();
const heartbeatTimer = setInterval(() => { void heartbeatAll(); }, 2_000);
const commandTimer = setInterval(() => { void pollCommand(); }, 400);
console.log(`DGBook Classroom Helper online: ${config.sessionId} · ${config.students.join(', ')} · health ${config.healthPort}`);

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

async function pollCommand() {
  if (stopping) return;
  const response = await helperFetch(helperApiUrl).catch(() => null);
  if (!response?.ok) return;
  const body = await response.json().catch(() => null);
  const command = body?.command;
  if (!command) return;
  await Promise.all(config.students.map(async (studentId) => {
    const client = clients.get(studentId);
    if (!client || !shouldApplyCommand(
      client.lastAppliedRevision,
      command,
      studentId,
      client.lastAppliedCommandId,
    )) return;
    await acknowledge(studentId, client, command, 'delivered');
    try {
      client.pageState = 'opening';
      if (client.page.isClosed()) {
        client.page = await client.context.newPage();
      }
      await client.page.bringToFront();
      const expectedUrl = studentPageUrl(config, studentId);
      if (
        shouldReloadForCommand(client.lastAppliedRevision, client.lastAppliedCommandId, command)
        || !client.page.url().startsWith(expectedUrl.split('?')[0])
      ) {
        await client.page.goto(expectedUrl, { waitUntil: 'domcontentloaded' });
      }
      await client.page.waitForFunction(
        (revision) => Number(document.querySelector('[data-classroom-revision]')?.getAttribute('data-classroom-revision')) >= revision,
        command.revision,
        { timeout: 8_000 },
      );
      client.lastAppliedRevision = command.revision;
      client.lastAppliedCommandId = command.commandId;
      client.pageState = 'ready';
      await acknowledge(studentId, client, command, 'applied');
    } catch (error) {
      client.pageState = 'error';
      await acknowledge(studentId, client, command, 'failed', error instanceof Error ? error.message.slice(0, 180) : 'Student page failed to apply command');
    }
  }));
}

async function heartbeatAll() {
  if (stopping) return;
  await helperFetch(helperApiUrl, {
    kind: 'heartbeat',
    actorRole: 'teacher',
    deviceId: 'teacher-helper',
    pageState: 'ready',
    lastAppliedRevision: 0,
  }).catch(() => null);
  await Promise.all(config.students.map((studentId) => {
    const client = clients.get(studentId);
    if (!client) return Promise.resolve();
    const pageState = client.page.isClosed() ? 'closed' : client.pageState;
    return helperFetch(helperApiUrl, {
      kind: 'heartbeat',
      actorRole: 'student',
      deviceId: `device-${studentId}`,
      studentId,
      pageState,
      lastAppliedRevision: client.lastAppliedRevision,
    }).catch(() => null);
  }));
}

async function acknowledge(studentId, client, command, state, reason) {
  await helperFetch(helperApiUrl, {
    kind: 'ack',
    commandId: command.commandId,
    deviceId: `device-${studentId}`,
    studentId,
    state,
    reason,
  });
}

function helperFetch(url, body) {
  return fetch(url, {
    method: body ? 'PATCH' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-dgbook-helper-token': config.token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function startHealthServer(currentConfig) {
  const server = http.createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(helperHealth(currentConfig)));
  });
  server.listen(currentConfig.healthPort, '127.0.0.1');
  return server;
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(heartbeatTimer);
  clearInterval(commandTimer);
  await Promise.all([...clients.values()].map((client) => client.context.close().catch(() => undefined)));
  await browser.close().catch(() => undefined);
  await new Promise((resolve) => healthServer.close(resolve));
  process.exit(0);
}

#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { removeRuntimeAuditDirectory } from './runtime-audit-temp.mjs';

const port = readArg('--port', '3162');
const host = readArg('--host', '127.0.0.1');
const baseUrl = `http://${host}:${port}/`;
const runId = readArg('--run-id', `web-local-${Date.now().toString(36)}`);
const outRoot = path.join('output', 'playwright', runId);
const startCommand = process.platform === 'win32' ? 'cmd.exe' : 'pnpm';
const startArgs = process.platform === 'win32'
  ? ['/d', '/s', '/c', `pnpm --dir apps/web exec next start --hostname ${host} --port ${port}`]
  : ['--dir', 'apps/web', 'exec', 'next', 'start', '--hostname', host, '--port', port];

await mkdir(outRoot, { recursive: true });
const databaseDirectory = await mkdtemp(path.join(os.tmpdir(), 'dgbook-runtime-audit-'));
const databasePath = path.join(databaseDirectory, 'dgbook-audit.sqlite');
const auditEnv = {
  ...process.env,
  DGBOOK_SQLITE_PATH: databasePath,
  DGBOOK_AUDIT_ISOLATED_SQLITE: '1',
  DGBOOK_HELPER_TOKEN: process.env.DGBOOK_HELPER_TOKEN || randomBytes(32).toString('base64url'),
};

let server = null;
try {
  await assertPortAvailable(host, Number.parseInt(port, 10));
  await runPnpm(['--filter', '@dgbook/web', 'db:reset:demo'], auditEnv);

  server = spawn(
    startCommand,
    startArgs,
    { cwd: process.cwd(), env: auditEnv, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  server.stdout.on('data', (chunk) => process.stdout.write(`[next] ${chunk}`));
  server.stderr.on('data', (chunk) => process.stderr.write(`[next] ${chunk}`));

  await waitForServer(baseUrl, 60_000, server);
  await runAudit('web-media-runtime', [
    'scripts/audit-web-media-runtime.mjs',
    '--base-url', baseUrl,
    '--out', path.join(outRoot, 'web-media-runtime'),
  ], auditEnv);
  await runAudit('web-runtime', ['scripts/audit-web-runtime.mjs', '--base-url', baseUrl, '--out', path.join(outRoot, 'web-runtime')], auditEnv);
  await runAudit('p1-three-terminal-consistency', [
    'scripts/audit-p1-three-terminal-consistency.mjs',
    '--base-url', baseUrl,
    '--out', path.join(outRoot, 'p1-three-terminal-consistency'),
  ], auditEnv);
  await runAudit('self-study-closure', [
    'scripts/audit-self-study-closure.mjs',
    '--base-url', baseUrl,
    '--out', path.join(outRoot, 'self-study-closure'),
    '--allow-local-mutation',
    '--isolated-sqlite', databasePath,
  ], auditEnv);
  await runAudit('image2-layout', [
    'scripts/audit-image2-layout.mjs',
    '--base-url', baseUrl,
    '--out', path.join(outRoot, 'image2-layout'),
  ], auditEnv);
  await runAudit('class-session-cross-context', [
    'scripts/audit-class-session-cross-context.mjs',
    '--base-url', baseUrl,
    '--session-id', 'demo-class',
    '--out', path.join(outRoot, 'class-session-cross-context'),
  ], auditEnv);
  await runAudit('p1-complete-journey', [
    'scripts/audit-p1-complete-journey.mjs',
    '--base-url', baseUrl,
    '--out', path.join(outRoot, 'p1-complete-journey'),
  ], auditEnv);
  console.log(`web runtime audits passed: ${outRoot}`);
} finally {
  if (server) await stopServer(server);
  await removeRuntimeAuditDirectory(databaseDirectory);
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) return fallback;
  return process.argv[index + 1];
}

async function waitForServer(url, timeoutMs, serverProcess) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Next server exited before readiness with code ${serverProcess.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        await delay(150);
        if (serverProcess.exitCode !== null) {
          throw new Error(`Next server exited during readiness with code ${serverProcess.exitCode}.`);
        }
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(500);
  }
  throw new Error(`Next server did not become ready at ${url}: ${lastError?.message ?? 'timeout'}`);
}

function assertPortAvailable(hostname, portNumber) {
  if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65_535) {
    return Promise.reject(new Error(`Invalid runtime audit port: ${portNumber}`));
  }
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', (error) => reject(new Error(`Runtime audit port ${hostname}:${portNumber} is unavailable: ${error.message}`)));
    probe.listen({ host: hostname, port: portNumber, exclusive: true }, () => {
      probe.close((error) => error ? reject(error) : resolve());
    });
  });
}

async function runAudit(label, args, env) {
  console.log(`\n> local runtime audit: ${label}`);
  await run(process.execPath, args, env);
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`));
    });
  });
}

function runPnpm(args, env) {
  if (process.platform === 'win32') {
    return run('cmd.exe', ['/d', '/s', '/c', `pnpm ${args.join(' ')}`], env);
  }
  return run('pnpm', args, env);
}

async function stopServer(serverProcess) {
  if (!serverProcess.pid || serverProcess.killed) return;
  if (process.platform === 'win32') {
    await runAllowFailure('cmd.exe', ['/d', '/s', '/c', `taskkill /pid ${serverProcess.pid} /T /F`]);
    if (!serverProcess.killed) serverProcess.kill('SIGKILL');
  } else {
    serverProcess.kill('SIGTERM');
  }
  serverProcess.stdout?.destroy();
  serverProcess.stderr?.destroy();
  serverProcess.unref();
}

function runAllowFailure(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    const timer = setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
      resolve();
    }, 8_000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve();
    });
    child.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

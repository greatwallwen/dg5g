#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  DEFAULT_DEPLOY_PATHS,
  buildDeploymentPlan,
  executeDeploymentPlan,
  parseActivationSummary,
  publicDeploymentSummary,
  resolveReleaseId,
} from './web-source-deploy-plan.mjs';

// Shared transport phases: prepare, pre-switch, switch-and-health, rollback, prune.
const rootDir = process.cwd();

async function main() {
  const archive = path.resolve(rootDir, readArg('--archive', 'artifacts/web-source-release/dgbook-web-source.tar.gz'));
  const manifestPath = path.resolve(rootDir, readArg('--manifest', 'artifacts/web-source-release/dgbook-web-source.upload-manifest.json'));
  await assertFile(archive, 'archive');
  await assertFile(manifestPath, 'manifest');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const digest = await sha256(archive);
  if (manifest.sha256 !== digest) throw new Error('archive digest mismatch');
  assertDefaultManagedPaths();

  const config = {
    host: required(['DGBOOK_WEB_DEPLOY_HOST', 'DGBOOK_DEPLOY_HOST']),
    user: firstEnv(['DGBOOK_WEB_DEPLOY_USER', 'DGBOOK_DEPLOY_USER'], 'root'),
    port: validatePort(firstEnv(['DGBOOK_WEB_DEPLOY_PORT', 'DGBOOK_DEPLOY_PORT'], '22')),
    password: firstEnv(['DGBOOK_WEB_DEPLOY_PASSWORD', 'DGBOOK_DEPLOY_PASSWORD']),
    sshKey: firstEnv(['DGBOOK_WEB_DEPLOY_SSH_KEY', 'DGBOOK_DEPLOY_SSH_KEY']),
    knownHosts: firstEnv(['DGBOOK_WEB_DEPLOY_KNOWN_HOSTS', 'DGBOOK_DEPLOY_KNOWN_HOSTS']),
    strictHostKeyChecking: validateHostKeyPolicy(firstEnv(['DGBOOK_WEB_DEPLOY_STRICT_HOST_KEY_CHECKING', 'DGBOOK_DEPLOY_STRICT_HOST_KEY_CHECKING'], 'no')),
    service: firstEnv(['DGBOOK_WEB_DEPLOY_SERVICE'], 'dgbook-web'),
    publicHost: firstEnv(['DGBOOK_WEB_DEPLOY_PUBLIC_HOST'], required(['DGBOOK_WEB_DEPLOY_HOST', 'DGBOOK_DEPLOY_HOST'])),
    publicUrl: firstEnv(['DGBOOK_WEB_DEPLOY_PUBLIC_URL']),
    appPort: firstEnv(['DGBOOK_WEB_DEPLOY_APP_PORT'], '3157'),
    helperToken: firstEnv(['DGBOOK_HELPER_TOKEN']),
    hostname: firstEnv(['DGBOOK_WEB_DEPLOY_HOSTNAME'], '127.0.0.1'),
    nginx: firstEnv(['DGBOOK_WEB_DEPLOY_NGINX'], '1') !== '0',
    keepReleases: integerEnv(['DGBOOK_WEB_DEPLOY_KEEP_RELEASES'], 3, 1, 20),
  };
  if (!config.password && !config.sshKey) throw new Error('SSH authentication is not configured');

  const releaseId = resolveReleaseId({
    cliReleaseId: readArg('--release-id'),
    envReleaseId: firstEnv(['DGBOOK_WEB_DEPLOY_RELEASE_ID']),
    gitCommit: manifest.sourceGit?.commit,
    archiveSha256: digest,
  });
  const plan = buildDeploymentPlan({
    releaseId,
    archiveSha256: digest,
    service: config.service,
    publicHost: config.publicHost,
    hostname: config.hostname,
    appPort: config.appPort,
    helperToken: config.helperToken,
    keepReleases: config.keepReleases,
    nginx: config.nginx,
  });
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dgbook-web-source-deploy-'));

  try {
    config.identityFile = await secretFile(tempDir, 'deploy-key', config.sshKey, 0o600);
    config.knownHostsFile = await secretFile(tempDir, 'known-hosts', config.knownHosts, 0o600);
    const localFiles = { archive, manifest: manifestPath };
    const transport = {
      run: (phase, script) => remote(config, phase, script),
      upload: (name, remotePath) => upload(config, name, localFiles[name], remotePath),
    };
    const result = await executeDeploymentPlan({
      plan,
      transport,
      externalHealth: () => verifyExternalHealth(config, plan),
    });
    const activation = parseActivationSummary(result.activation?.stdout);
    console.log(JSON.stringify(publicDeploymentSummary({
      host: config.host,
      releaseId,
      archiveSha256: digest,
      ...activation,
    })));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function readArg(name, fallback = '') {
  const prefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function firstEnv(names, fallback = '') {
  for (const name of names) if (process.env[name]) return process.env[name];
  return fallback;
}

function required(names) {
  const value = firstEnv(Array.isArray(names) ? names : [names]);
  if (!value) throw new Error(`missing required configuration: ${Array.isArray(names) ? names.join(' or ') : names}`);
  return value;
}

function integerEnv(names, fallback, minimum, maximum) {
  const value = Number(firstEnv(names, String(fallback)));
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error('numeric deployment configuration is invalid');
  return value;
}

function assertDefaultManagedPaths() {
  const configuredBase = firstEnv(['DGBOOK_WEB_DEPLOY_BASE_DIR'], DEFAULT_DEPLOY_PATHS.baseDir);
  const configuredDrop = firstEnv(['DGBOOK_WEB_DEPLOY_DROP_DIR'], DEFAULT_DEPLOY_PATHS.dropDir);
  if (configuredBase !== DEFAULT_DEPLOY_PATHS.baseDir || configuredDrop !== DEFAULT_DEPLOY_PATHS.dropDir) {
    throw new Error('deployment paths must use the managed DGBook roots');
  }
}

function validatePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('SSH port is invalid');
  return String(port);
}

function validateHostKeyPolicy(value) {
  if (!['yes', 'no', 'accept-new'].includes(value)) throw new Error('host-key policy is invalid');
  return value;
}

async function assertFile(filePath, label) {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error(`${label} is not a file`);
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve);
  });
  return hash.digest('hex');
}

async function secretFile(tempDir, name, content, mode) {
  if (!content) return null;
  const filePath = path.join(tempDir, name);
  await writeFile(filePath, content.replace(/\r\n/g, '\n'), { mode });
  return filePath;
}

function sshArgs(config, tool) {
  const args = [tool === 'scp' ? '-P' : '-p', config.port, '-o', 'BatchMode=no'];
  if (config.knownHostsFile) args.push('-o', `UserKnownHostsFile=${config.knownHostsFile}`);
  args.push('-o', `StrictHostKeyChecking=${config.strictHostKeyChecking}`);
  if (config.identityFile) args.push('-i', config.identityFile);
  return args;
}

function target(config) {
  return `${config.user}@${config.host}`;
}

function withAuth(config, tool, args) {
  if (config.password) return { command: 'sshpass', args: ['-e', tool, ...args], env: { SSHPASS: config.password } };
  return { command: tool, args, env: {} };
}

async function upload(config, name, localPath, remotePath) {
  const invocation = withAuth(config, 'scp', [...sshArgs(config, 'scp'), localPath, `${target(config)}:${remotePath}`]);
  await run(invocation.command, invocation.args, { env: invocation.env, label: `upload-${name}` });
}

async function remote(config, phase, script) {
  const invocation = withAuth(config, 'ssh', [...sshArgs(config, 'ssh'), target(config), 'bash', '-s']);
  return run(invocation.command, invocation.args, { env: invocation.env, input: script, label: phase });
}

async function run(command, args, options) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.resume();
  if (options.input) child.stdin.end(options.input);
  else child.stdin.end();
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(`${options.label} failed with exit code ${code}`);
  return { stdout };
}

async function probeAuthenticatedPage(base, username, page) {
  const loginResponse = await fetch(new URL('/api/auth/login', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: '123456' }),
    redirect: 'manual',
    signal: AbortSignal.timeout(8_000),
  });
  const loginSucceeded = loginResponse.status >= 200 && loginResponse.status < 300;
  const setCookie = loginResponse.headers.get('set-cookie');
  await loginResponse.body?.cancel();
  if (!loginSucceeded || !setCookie) return false;

  let cookie = setCookie.split(';', 1)[0];
  if (!cookie) return false;
  try {
    const pageResponse = await fetch(new URL(page, base), {
      headers: { cookie },
      redirect: 'manual',
      signal: AbortSignal.timeout(8_000),
    });
    const pageSucceeded = pageResponse.status >= 200 && pageResponse.status < 300;
    await pageResponse.body?.cancel();
    return pageSucceeded;
  } finally {
    try {
      const logoutResponse = await fetch(new URL('/api/auth/logout', base), {
        method: 'POST',
        headers: { cookie },
        redirect: 'manual',
        signal: AbortSignal.timeout(8_000),
      });
      await logoutResponse.body?.cancel();
    } catch {
      // Health is determined by login and the protected page; logout is best-effort cleanup.
    }
    cookie = '';
  }
}

async function verifyExternalHealth(config, plan) {
  const base = normalizePublicUrl(config.publicUrl || `http://${config.publicHost}`);
  const attempts = integerEnv(['DGBOOK_WEB_DEPLOY_EXTERNAL_HEALTH_ATTEMPTS'], 6, 1, 30);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(new URL('/api/build-info', base), { signal: AbortSignal.timeout(8_000) });
      if (response.ok) {
        const body = await response.json();
        if (body.releaseId === plan.releaseId && body.sourceSha256 === plan.archiveSha256) {
          const courseResponse = await fetch(new URL('/course', base), {
            redirect: 'manual',
            signal: AbortSignal.timeout(8_000),
          });
          if (courseResponse.status >= 200 && courseResponse.status < 500) {
            const studentHealthy = await probeAuthenticatedPage(base, 'student01', '/student/home');
            const teacherHealthy = await probeAuthenticatedPage(base, 'teacher01', '/teacher/workbench');
            if (studentHealthy && teacherHealthy) return;
            break;
          }
        }
      }
    } catch {
      // Retry; transport rollback is triggered only after the final mismatch.
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error('public release health did not match the activated release');
}

function normalizePublicUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('public health URL is invalid');
  return url;
}

main().catch(() => {
  console.error('DGBook web deployment failed; inspect the retained release diagnostics.');
  process.exit(1);
});

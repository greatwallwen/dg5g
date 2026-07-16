#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = process.cwd();

function readArg(name, fallback = null) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function firstEnv(names, fallback = '') {
  for (const name of names) if (process.env[name]) return process.env[name];
  return fallback;
}

function required(names) {
  const value = firstEnv(Array.isArray(names) ? names : [names]);
  if (!value) throw new Error(`missing required env: ${Array.isArray(names) ? names.join(' or ') : names}`);
  return value;
}

function sh(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const archive = path.resolve(rootDir, readArg('--archive', 'artifacts/web-release/dgbook-web.tar.gz'));
  const manifestPath = path.resolve(rootDir, readArg('--manifest', 'artifacts/web-release/dgbook-web.upload-manifest.json'));
  await assertFile(archive, 'archive');
  await assertFile(manifestPath, 'manifest');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const digest = await sha256(archive);
  if (manifest.sha256 !== digest) throw new Error(`archive sha256 mismatch: ${digest}`);

  const config = {
    host: required(['DGBOOK_WEB_DEPLOY_HOST', 'DGBOOK_DEPLOY_HOST']),
    user: firstEnv(['DGBOOK_WEB_DEPLOY_USER', 'DGBOOK_DEPLOY_USER'], 'root'),
    port: firstEnv(['DGBOOK_WEB_DEPLOY_PORT', 'DGBOOK_DEPLOY_PORT'], '22'),
    password: firstEnv(['DGBOOK_WEB_DEPLOY_PASSWORD', 'DGBOOK_DEPLOY_PASSWORD']),
    sshKey: firstEnv(['DGBOOK_WEB_DEPLOY_SSH_KEY', 'DGBOOK_DEPLOY_SSH_KEY']),
    knownHosts: firstEnv(['DGBOOK_WEB_DEPLOY_KNOWN_HOSTS', 'DGBOOK_DEPLOY_KNOWN_HOSTS']),
    strictHostKeyChecking: firstEnv(['DGBOOK_WEB_DEPLOY_STRICT_HOST_KEY_CHECKING', 'DGBOOK_DEPLOY_STRICT_HOST_KEY_CHECKING'], 'no'),
    baseDir: firstEnv(['DGBOOK_WEB_DEPLOY_BASE_DIR'], '/var/www/dgbook-web'),
    dropDir: firstEnv(['DGBOOK_WEB_DEPLOY_DROP_DIR'], '/opt/dgbook-deploy/web'),
    service: firstEnv(['DGBOOK_WEB_DEPLOY_SERVICE'], 'dgbook-web'),
    publicHost: firstEnv(['DGBOOK_WEB_DEPLOY_PUBLIC_HOST'], firstEnv(['DGBOOK_WEB_DEPLOY_HOST', 'DGBOOK_DEPLOY_HOST'], '_')),
    appPort: firstEnv(['DGBOOK_WEB_DEPLOY_APP_PORT'], '3157'),
    hostname: firstEnv(['DGBOOK_WEB_DEPLOY_HOSTNAME'], '127.0.0.1'),
    helperToken: firstEnv(['DGBOOK_HELPER_TOKEN']),
    chown: firstEnv(['DGBOOK_WEB_DEPLOY_CHOWN'], ''),
    nginx: firstEnv(['DGBOOK_WEB_DEPLOY_NGINX'], '1') !== '0',
  };
  if (!config.password && !config.sshKey) throw new Error('set DGBOOK_WEB_DEPLOY_SSH_KEY or DGBOOK_WEB_DEPLOY_PASSWORD');
  const releaseId = readArg('--release-id', new Date().toISOString().replace(/\D/g, '').slice(0, 14));
  const remoteDrop = `${config.dropDir}/${releaseId}`;
  const releaseDir = `${config.baseDir}/releases/${releaseId}`;
  const currentLink = `${config.baseDir}/current`;

  if (dryRun) {
    console.log(JSON.stringify({ dryRun, host: config.host, releaseId, releaseDir, service: config.service, appPort: config.appPort }, null, 2));
    return;
  }

  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'dgbook-web-deploy-'));
  try {
    config.identityFile = await secretFile(tempDir, 'deploy-key', config.sshKey, 0o600);
    config.knownHostsFile = await secretFile(tempDir, 'known-hosts', config.knownHosts, 0o600);
    await remote(config, `mkdir -p ${sh(remoteDrop)} ${sh(`${config.baseDir}/releases`)}`);
    await upload(config, archive, `${remoteDrop}/dgbook-web.tar.gz`);
    await upload(config, manifestPath, `${remoteDrop}/dgbook-web.upload-manifest.json`);
    await remote(config, [
      `rm -rf ${sh(releaseDir)}`,
      `mkdir -p ${sh(releaseDir)}`,
      `tar -xzf ${sh(`${remoteDrop}/dgbook-web.tar.gz`)} -C ${sh(releaseDir)} --strip-components=1`,
      `test -f ${sh(`${releaseDir}/apps/web/server.js`)}`,
      `ln -sfn ${sh(releaseDir)} ${sh(currentLink)}`,
    ].join(' && '));
    await installService(config, currentLink);
    if (config.nginx) await installNginx(config);
    if (config.chown) await remote(config, `chown -R ${sh(config.chown)} ${sh(config.baseDir)}`);
    await remote(config, `systemctl daemon-reload && systemctl enable --now ${sh(config.service)} && systemctl restart ${sh(config.service)}`);
    if (config.nginx) await remote(config, 'nginx -t && systemctl reload nginx');
    await remote(config, `curl -fsS --max-time 12 http://${config.hostname}:${config.appPort}/ >/dev/null`);
    console.log(JSON.stringify({ deployed: true, host: config.host, releaseId, current: currentLink, service: config.service, sha256: digest }, null, 2));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function installService(config, currentLink) {
  const unit = `[Unit]
Description=DGBook 5G Next.js web
After=network.target

[Service]
Type=simple
WorkingDirectory=${currentLink}
Environment=NODE_ENV=production
Environment=PORT=${config.appPort}
Environment=HOSTNAME=${config.hostname}
${systemdEnvironment('DGBOOK_HELPER_TOKEN', config.helperToken)}
ExecStart=/usr/bin/env node apps/web/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`;
  await remote(config, `cat > /etc/systemd/system/${sh(`${config.service}.service`)} <<'EOF'\n${unit}EOF`);
}

function systemdEnvironment(name, value) {
  if (!value) return '';
  if (/[\r\n]/.test(value)) throw new Error(`${name} cannot contain a newline`);
  const escaped = String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  return `Environment="${name}=${escaped}"`;
}

async function installNginx(config) {
  const conf = `server {
    listen 80;
    server_name ${config.publicHost};
    client_max_body_size 64m;
    location / {
        proxy_pass http://${config.hostname}:${config.appPort};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`;
  await remote(config, `cat > /etc/nginx/conf.d/dgbook-web.conf <<'EOF'\n${conf}\nEOF`);
}

async function assertFile(filePath, label) {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error(`${label} is not a file: ${filePath}`);
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(filePath).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', resolve);
  });
  return hash.digest('hex');
}

async function secretFile(tempDir, name, content, mode) {
  if (!content) return null;
  const filePath = path.join(tempDir, name);
  await writeFile(filePath, content.replace(/\r\n/g, '\n'), { mode });
  return filePath;
}

function target(config) {
  return `${config.user}@${config.host}`;
}

function sshArgs(config, tool) {
  const args = [tool === 'scp' ? '-P' : '-p', config.port, '-o', 'BatchMode=no'];
  if (config.knownHostsFile) args.push('-o', `UserKnownHostsFile=${config.knownHostsFile}`);
  args.push('-o', `StrictHostKeyChecking=${config.strictHostKeyChecking}`);
  if (config.identityFile) args.push('-i', config.identityFile);
  return args;
}

function withAuth(config, tool, args) {
  if (config.password) return { command: 'sshpass', args: ['-e', tool, ...args], env: { SSHPASS: config.password } };
  return { command: tool, args, env: {} };
}

async function upload(config, localPath, remotePath) {
  const command = withAuth(config, 'scp', [...sshArgs(config, 'scp'), localPath, `${target(config)}:${remotePath}`]);
  await run(command.command, command.args, { env: command.env, quiet: true });
}

async function remote(config, script) {
  const command = withAuth(config, 'ssh', [...sshArgs(config, 'ssh'), target(config), 'bash', '-lc', script]);
  return run(command.command, command.args, { env: command.env, redact: [config.helperToken] });
}

async function run(command, args, options = {}) {
  const child = spawn(command, args, { cwd: rootDir, env: { ...process.env, ...(options.env ?? {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; if (!options.quiet) process.stdout.write(chunk); });
  child.stderr.on('data', (chunk) => { stderr += chunk; if (!options.quiet) process.stderr.write(chunk); });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(`${redactSecrets(`${command} ${args.join(' ')}`, options.redact)} failed with exit code ${code}\n${stderr || stdout}`);
  return { stdout, stderr };
}

function redactSecrets(value, secrets = []) {
  return secrets.filter(Boolean).reduce((safe, secret) => safe.replaceAll(secret, '[REDACTED]'), value);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

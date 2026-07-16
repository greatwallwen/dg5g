#!/usr/bin/env node
import { spawn } from 'node:child_process';

const auditUrl = process.env.DGBOOK_WEB_DEPLOY_AUDIT_URL || process.env.DGBOOK_WEB_PUBLIC_URL;
const auditOut = process.env.DGBOOK_WEB_DEPLOY_AUDIT_OUT || 'output/playwright/web-remote';
const skipDeploy = process.argv.includes('--skip-deploy');
const skipAudit = process.argv.includes('--skip-audit') || !auditUrl;
const deployTransport = process.env.DGBOOK_WEB_DEPLOY_TRANSPORT || 'ssh';
const forwardDeployArgs = readForwardDeployArgs(process.argv.slice(2));

if (!['ssh', 'paramiko'].includes(deployTransport)) {
  throw new Error('DGBOOK_WEB_DEPLOY_TRANSPORT must be ssh or paramiko');
}

const steps = [
  ['web structure', 'node', ['scripts/check-web-structure.mjs']],
  ['web typecheck', 'pnpm', ['--filter', '@dgbook/web', 'typecheck']],
  ['widgets typecheck', 'pnpm', ['--filter', '@dgbook/widgets', 'typecheck']],
  ['animation typecheck', 'pnpm', ['--filter', '@dgbook/animation', 'typecheck']],
  ['web build', 'pnpm', ['--filter', '@dgbook/web', 'build']],
  ['package web source', 'pnpm', ['deploy:web:source']],
];

if (!skipDeploy) {
  steps.push([
    `deploy web source (${deployTransport})`,
    deployTransport === 'paramiko' ? 'python' : 'node',
    [
      deployTransport === 'paramiko' ? 'scripts/deploy-web-source-paramiko.py' : 'scripts/deploy-web-source-ssh.mjs',
      ...forwardDeployArgs,
    ],
  ]);
}
if (!skipAudit) {
  steps.push([
    'remote runtime audit',
    'pnpm',
    ['audit:web-runtime', '--', '--base-url', auditUrl, '--out', auditOut],
  ]);
}

for (const [label, command, args] of steps) {
  await run(label, command, args);
}

if (skipAudit) {
  console.log('Skipped remote runtime audit: set DGBOOK_WEB_DEPLOY_AUDIT_URL to enable it.');
}

async function run(label, command, args) {
  console.log(`\n> ${label}`);
  const spec = commandSpec(command, args);
  const child = spawn(spec.command, spec.args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
  });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(`${label} failed with exit code ${code}`);
}

function commandSpec(command, args) {
  if (process.platform === 'win32' && command === 'pnpm') {
    return { command: 'cmd.exe', args: ['/d', '/s', '/c', ['pnpm', ...args].map(cmdArg).join(' ')] };
  }
  return { command, args };
}

function cmdArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function readForwardDeployArgs(args) {
  const inline = args.find((argument) => argument.startsWith('--release-id='));
  if (inline) return [inline];
  const index = args.indexOf('--release-id');
  if (index < 0) return [];
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error('--release-id requires a value');
  return ['--release-id', value];
}

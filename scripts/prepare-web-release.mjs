#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { verifyWebRuntimeMedia } from './web-runtime-media-contract.mjs';

const rootDir = process.cwd();
const appDir = path.join(rootDir, 'apps', 'web');
const outRoot = path.join(rootDir, 'artifacts', 'web-release');
const packageDir = path.join(outRoot, 'dgbook-web');
const archivePath = path.join(outRoot, 'dgbook-web.tar.gz');

async function main() {
  if (process.argv.includes('--build')) {
    await run('build web', pnpmCommand(), pnpmArgs(['--filter', '@dgbook/web', 'build']), { env: { DGBOOK_WEB_STANDALONE: '1' } });
  }
  await assertFile(path.join(appDir, '.next', 'standalone', 'apps', 'web', 'server.js'));
  const runtimeMedia = await verifyWebRuntimeMedia({ repositoryRoot: rootDir });
  if (!runtimeMedia.targetAudit.passed) {
    throw new Error(`web release media target failed exact-tree audit: ${JSON.stringify(runtimeMedia.targetAudit.issues)}`);
  }
  await rm(packageDir, { recursive: true, force: true });
  await mkdir(packageDir, { recursive: true });

  await copy(path.join(appDir, '.next', 'standalone'), packageDir);
  await copy(path.join(appDir, '.next', 'static'), path.join(packageDir, 'apps', 'web', '.next', 'static'));
  await copyIfExists(path.join(appDir, 'public'), path.join(packageDir, 'apps', 'web', 'public'));

  const manifest = {
    kind: 'dgbook-web-next',
    createdAt: new Date().toISOString(),
    sourceGit: gitInfo(),
    startCommand: 'node apps/web/server.js',
    routes: [
      '/',
      '/platform',
      '/samples/deep-textbook/P01-P02',
      '/projects/P1',
      '/tasks/P1-T1',
      '/tasks/P1-T2',
      '/tasks/P1-T3',
      '/maps/course?focus=P1T1-N01',
      '/maps/course?focus=P1T2-N01',
      '/maps/course?focus=P1T3-N01',
      '/learn/P1T1-N01',
      '/learn/P1T2-N01',
      '/learn/P1T3-N01',
      '/classroom/P1T1-N01',
      '/classroom/P1T2-N01',
      '/classroom/P1T3-N01',
      '/teacher/sessions/P1T1-N01',
      '/teacher/sessions/P1T2-N01',
      '/teacher/sessions/P1T3-N01',
      '/present/P1T1-N01',
      '/present/P1T2-N01',
      '/present/P1T3-N01',
    ],
    mediaRoots: ['apps/web/public/media'],
    runtimeMedia: {
      contractId: runtimeMedia.contract.contractId,
      contractSha256: runtimeMedia.contract.contractSha256,
      fileCount: runtimeMedia.contract.summary.fileCount,
      totalBytes: runtimeMedia.contract.summary.totalBytes,
    },
  };
  await writeFile(path.join(packageDir, 'deploy-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  await rm(archivePath, { force: true });
  await run('archive web release', tarCommand(), ['-czf', archivePath, '-C', outRoot, 'dgbook-web']);
  const digest = await sha256(archivePath);
  manifest.sha256 = digest;
  await writeFile(path.join(outRoot, 'dgbook-web.upload-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(`${archivePath}.sha256`, `${digest}  dgbook-web.tar.gz\n`, 'utf8');
  console.log(JSON.stringify({ archive: archivePath, sha256: digest, routes: manifest.routes }, null, 2));
}

async function copy(from, to) {
  await cp(from, to, { recursive: true, force: true });
}

async function copyIfExists(from, to) {
  try {
    const info = await stat(from);
    if (info.isDirectory()) await copy(from, to);
  } catch {
    // Optional media roots are allowed to be absent in stripped samples.
  }
}

async function assertFile(filePath) {
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error(`missing file: ${filePath}`);
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

async function run(label, command, args, options = {}) {
  console.log(`\n> ${label}`);
  const child = spawn(command, args, {
    cwd: rootDir,
    env: { ...process.env, ...(options.env ?? {}) },
    stdio: 'inherit',
    shell: process.platform === 'win32' && command.endsWith('.cmd'),
  });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(`${label} failed with exit code ${code}`);
}

function gitInfo() {
  return {
    commit: git(['rev-parse', 'HEAD']),
    branch: git(['branch', '--show-current']),
    dirty: Boolean(git(['status', '--porcelain'])),
  };
}

function git(args) {
  const result = spawnSync('git', args, { cwd: rootDir, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function pnpmCommand() {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function pnpmArgs(args) {
  return args;
}

function tarCommand() {
  return process.platform === 'win32' ? 'tar.exe' : 'tar';
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import {
  MAX_WEB_SOURCE_RELEASE_BYTES,
  REQUIRED_WEB_SOURCE_RUNTIME_FILES,
  WEB_SOURCE_DIRECTORY_ROOTS,
  WEB_SOURCE_ROOT_FILES,
  shouldPackageWebSourceFile,
} from './web-source-release-policy.mjs';
import { verifyWebRuntimeMedia } from './web-runtime-media-contract.mjs';

const rootDir = process.cwd();
const outRoot = path.join(rootDir, 'artifacts', 'web-source-release');
const packageDir = path.join(outRoot, 'dgbook-web-source');
const archivePath = path.join(outRoot, 'dgbook-web-source.tar.gz');
const webSourceSecretSignatures = Object.freeze([
  {
    label: 'private key header',
    pattern: /-----BEGIN (?:DSA |EC |ENCRYPTED |OPENSSH |RSA )?PRIVATE KEY-----/u,
  },
  {
    label: 'AWS access key identifier',
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/u,
  },
  {
    label: 'URL containing a password',
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/iu,
  },
]);

async function main() {
  const files = await collectWebSourceFiles({ repositoryRoot: rootDir });
  if (!files.length) throw new Error('no source files selected for web source release');
  assertRequiredWebSourceFiles(files);
  const runtimeMedia = await verifyWebRuntimeMedia({ repositoryRoot: rootDir });
  assertExactWebMediaFiles(files, runtimeMedia.contract);
  await assertNoWebSourceSecrets({ rootDirectory: rootDir, files });
  const estimatedBytes = await estimateBytes(files);
  console.log(JSON.stringify({
    preflight: 'web-source-release',
    files: files.length,
    estimatedBytes,
    maxBytes: MAX_WEB_SOURCE_RELEASE_BYTES,
    outputs: [packageDir, archivePath],
    regenerate: 'pnpm deploy:web:source',
  }, null, 2));
  if (estimatedBytes > MAX_WEB_SOURCE_RELEASE_BYTES) {
    throw new Error(`web source release estimate exceeds ${MAX_WEB_SOURCE_RELEASE_BYTES} bytes`);
  }

  await rm(packageDir, { recursive: true, force: true });
  await mkdir(packageDir, { recursive: true });

  for (const file of files) {
    await copyFileIntoPackage(file);
  }

  const manifest = {
    kind: 'dgbook-web-source',
    createdAt: new Date().toISOString(),
    sourceGit: collectGitInfo(),
    buildCommand: 'pnpm --filter @dgbook/web build',
    startCommand: 'node apps/web/server.js',
    routes: [
      '/',
      '/course',
      '/learn/P1T1-N01',
      '/learn/P1T2-N04',
      '/classroom/P1T1-N01',
      '/teacher/sessions/P1T1-N01',
      '/present/P1T1-N01',
    ],
    requiredRuntimeFiles: REQUIRED_WEB_SOURCE_RUNTIME_FILES,
    runtimeMedia: {
      contractId: runtimeMedia.contract.contractId,
      contractSha256: runtimeMedia.contract.contractSha256,
      fileCount: runtimeMedia.contract.summary.fileCount,
      totalBytes: runtimeMedia.contract.summary.totalBytes,
    },
    fileCount: files.length,
  };
  await writeFile(path.join(packageDir, 'deploy-source-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await assertNoWebSourceSecretsInDirectory(packageDir);

  await rm(archivePath, { force: true });
  await run('archive web source release', tarCommand(), ['-czf', archivePath, '-C', outRoot, 'dgbook-web-source']);
  manifest.sha256 = await sha256(archivePath);
  await writeFile(path.join(outRoot, 'dgbook-web-source.upload-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await writeFile(`${archivePath}.sha256`, `${manifest.sha256}  dgbook-web-source.tar.gz\n`, 'utf8');
  console.log(JSON.stringify({ archive: archivePath, sha256: manifest.sha256, files: files.length }, null, 2));
}

async function copyFileIntoPackage(relativePath) {
  const from = path.join(rootDir, relativePath);
  await assertRegularSourceFile(from);
  const to = path.join(packageDir, relativePath);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to);
}

async function estimateBytes(files) {
  let total = 0;
  for (const file of files) total += (await assertRegularSourceFile(path.join(rootDir, file))).size;
  return total;
}

export async function assertRegularSourceFile(filePath) {
  const info = await lstat(filePath);
  if (info.isSymbolicLink()) {
    throw new Error('symbolic links are not allowed in the web source release');
  }
  if (!info.isFile()) throw new Error('web source release candidates must be regular files');
  return info;
}

export async function assertNoWebSourceSecrets({ rootDirectory, files }) {
  const resolvedRoot = path.resolve(rootDirectory);
  for (const file of files) {
    const releasePath = normalizeReleasePath(file);
    const absolutePath = resolveContainedPath(resolvedRoot, releasePath);
    await assertRegularSourceFile(absolutePath);
    const content = await readFile(absolutePath, 'utf8');
    for (const signature of webSourceSecretSignatures) {
      if (signature.pattern.test(content)) {
        throw new Error(`web source secret scan rejected ${releasePath}: ${signature.label}`);
      }
    }
  }
  return true;
}

export async function assertNoWebSourceSecretsInDirectory(directory) {
  const resolvedRoot = path.resolve(directory);
  const files = [];
  await collectRegularFiles(resolvedRoot, resolvedRoot, files);
  return assertNoWebSourceSecrets({ rootDirectory: resolvedRoot, files });
}

export async function collectWebSourceFiles({ repositoryRoot = rootDir } = {}) {
  const selected = new Set();
  const resolvedRoot = path.resolve(repositoryRoot);

  for (const relativePath of [...WEB_SOURCE_ROOT_FILES, ...REQUIRED_WEB_SOURCE_RUNTIME_FILES]) {
    await addExistingSourceFile(resolvedRoot, relativePath, selected);
  }
  for (const relativeRoot of WEB_SOURCE_DIRECTORY_ROOTS) {
    await collectSourceDirectory(resolvedRoot, relativeRoot, selected);
  }

  return [...selected].sort();
}

async function addExistingSourceFile(repositoryRoot, relativePath, selected) {
  if (!shouldPackageWebSourceFile(relativePath)) return;
  try {
    await assertRegularSourceFile(path.join(repositoryRoot, relativePath));
    selected.add(normalizeReleasePath(relativePath));
  } catch (error) {
    if (isMissingFileError(error)) return;
    throw error;
  }
}

async function collectSourceDirectory(repositoryRoot, relativeDirectory, selected) {
  const normalizedDirectory = normalizeReleasePath(relativeDirectory).replace(/\/$/u, '');
  const absoluteDirectory = path.join(repositoryRoot, normalizedDirectory);
  let info;
  try {
    info = await lstat(absoluteDirectory);
  } catch (error) {
    if (isMissingFileError(error)) return;
    throw error;
  }
  if (info.isSymbolicLink()) {
    throw new Error('symbolic links are not allowed in the web source release');
  }
  if (!info.isDirectory()) throw new Error('web source release roots must be directories');

  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = `${normalizedDirectory}/${entry.name}`;
    const candidatePath = entry.isDirectory() ? `${relativePath}/dgbook-source-candidate` : relativePath;
    if (!shouldPackageWebSourceFile(candidatePath)) continue;
    if (entry.isSymbolicLink()) {
      throw new Error('symbolic links are not allowed in the web source release');
    }
    if (entry.isDirectory()) {
      await collectSourceDirectory(repositoryRoot, relativePath, selected);
      continue;
    }
    await addExistingSourceFile(repositoryRoot, relativePath, selected);
  }
}

async function collectRegularFiles(rootDirectory, directory, files) {
  const info = await lstat(directory);
  if (info.isSymbolicLink()) {
    throw new Error('symbolic links are not allowed in the web source release');
  }
  if (!info.isDirectory()) throw new Error('web source secret scan roots must be directories');

  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error('symbolic links are not allowed in the web source release');
    }
    if (entry.isDirectory()) {
      await collectRegularFiles(rootDirectory, absolutePath, files);
      continue;
    }
    files.push(normalizeReleasePath(path.relative(rootDirectory, absolutePath)));
  }
}

function normalizeReleasePath(filePath) {
  return filePath.replaceAll('\\', '/');
}

function resolveContainedPath(rootDirectory, relativePath) {
  const absolutePath = path.resolve(rootDirectory, relativePath);
  const relation = path.relative(rootDirectory, absolutePath);
  if (relation === '..' || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new Error('web source secret scan paths must stay inside the selected root');
  }
  return absolutePath;
}

function isMissingFileError(error) {
  return error && typeof error === 'object' && error.code === 'ENOENT';
}

export function assertRequiredWebSourceFiles(files) {
  const selectedFiles = new Set(files.map((file) => file.replaceAll('\\', '/')));
  const missing = REQUIRED_WEB_SOURCE_RUNTIME_FILES.filter((file) => !selectedFiles.has(file));
  if (missing.length > 0) {
    throw new Error(`required web runtime source files are missing: ${missing.join(', ')}`);
  }
}

export function assertExactWebMediaFiles(files, contract) {
  const normalizedFiles = files.map((file) => file.replaceAll('\\', '/'));
  const actual = normalizedFiles.filter((file) => file.toLowerCase().startsWith('apps/web/public/media/'));
  const expected = contract.entries.map(({ targetPath }) => targetPath);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((file) => !actualSet.has(file));
  const extra = actual.filter((file) => !expectedSet.has(file));
  if (actualSet.size !== actual.length) extra.push('duplicate media path');
  if (missing.length || extra.length) {
    throw new Error(`web source media exact-set mismatch; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`);
  }
  return true;
}

export function collectGitInfo() {
  return {
    commit: '',
    branch: '',
    dirty: false,
  };
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

async function run(label, command, args) {
  console.log(`\n> ${label}`);
  const child = spawn(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
  });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) throw new Error(`${label} failed with exit code ${code}`);
}

function tarCommand() {
  return process.platform === 'win32' ? 'tar.exe' : 'tar';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

#!/usr/bin/env node

import { lstat, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyWorkspacePath, normalizeWorkspacePath } from './active-workspace-policy.mjs';
import {
  DEFAULT_RELEASE_EVIDENCE_SPEC,
  evidenceMetadataForPath,
  loadDefaultReleaseEvidenceIndex,
} from './release-evidence-index.mjs';

const PROTECTED_ROOTS = [
  '.git',
  '.agents',
  '.codex',
  '.codegraph',
  '.playwright-cli',
  '.pnpm-store',
  'content',
  'textbook',
  'packages',
  'apps/web/database',
  'apps/web/.data',
  'apps/web/public/media',
  'site/public/media',
  'artifacts/media-cutover',
];

const EXPLICIT_REGENERABLE_CANDIDATES = [
  'apps/web/.next',
  'artifacts/web-source-release/dgbook-web-source',
];

export function buildActiveWorkspaceAudit({
  candidates = [],
  protectedPaths = [],
  evidenceIssues = [],
  forbiddenRuntimeRefs = [],
} = {}) {
  const evidenceFailures = evidenceIssues.map((issue) => [
    'evidence-index',
    String(issue?.code ?? 'unknown'),
    String(issue?.path ?? issue?.runId ?? 'unknown'),
  ].join(':'));
  const violations = [...forbiddenRuntimeRefs, ...evidenceFailures].sort(compareText);
  const evidenceTrusted = violations.length === 0;
  const decisions = [];
  const protectedSet = new Set();
  const removableSet = new Set();

  for (const candidate of candidates) {
    const path = normalizeWorkspacePath(candidate.path);
    const role = candidate.evidenceRole ?? candidate.role ?? 'not-evidence';
    if (!evidenceTrusted) {
      decisions.push({
        path,
        disposition: 'protected',
        reason: 'evidence-index-untrusted',
        role: 'unknown',
      });
      protectedSet.add(path);
      continue;
    }

    const policy = classifyWorkspacePath(path, {
      evidenceRole: role === 'not-evidence' ? undefined : role,
      isReparsePoint: candidate.isReparsePoint,
      hasReparseAncestor: candidate.hasReparseAncestor,
    });
    const decision = {
      path,
      disposition: policy.disposition,
      reason: policy.reason,
      role,
      ...(role === 'superseded' && candidate.supersededBy
        ? { supersededBy: candidate.supersededBy }
        : {}),
    };
    decisions.push(decision);
    (policy.disposition === 'removable' ? removableSet : protectedSet).add(path);
  }

  for (const inputPath of protectedPaths) {
    const path = normalizeWorkspacePath(inputPath);
    const policy = classifyWorkspacePath(path, { evidenceRole: 'unknown' });
    if (policy.disposition !== 'protected') {
      violations.push(`protected-path-removable:${path}`);
    }
    protectedSet.add(path);
  }

  decisions.sort((left, right) => compareText(left.path, right.path));
  return {
    forbiddenRuntimeRefs: [...new Set(violations)].sort(compareText),
    removablePaths: evidenceTrusted ? [...removableSet].sort(compareText) : [],
    protectedPaths: [...protectedSet].sort(compareText),
    passed: violations.length === 0,
    decisions,
  };
}

export async function auditActiveWorkspace({ repositoryRoot = process.cwd() } = {}) {
  const root = path.resolve(repositoryRoot);
  const evidenceIndex = await loadDefaultReleaseEvidenceIndex({ repositoryRoot: root });
  const forbiddenRuntimeRefs = [];
  const candidates = [];

  for (const relativePath of EXPLICIT_REGENERABLE_CANDIDATES) {
    if (await ordinaryPathExists(root, relativePath, forbiddenRuntimeRefs)) {
      candidates.push({ path: relativePath });
    }
  }

  for (const candidate of DEFAULT_RELEASE_EVIDENCE_SPEC.staleCandidates) {
    if (!await ordinaryPathExists(root, candidate.path, forbiddenRuntimeRefs)) continue;
    const metadata = evidenceMetadataForPath(evidenceIndex, candidate.path);
    candidates.push({
      path: candidate.path,
      evidenceRole: metadata.evidenceRole,
      supersededBy: metadata.supersededBy,
    });
  }

  const bytecodeCaches = await findPythonBytecodeCaches(
    root,
    path.join(root, 'scripts'),
    forbiddenRuntimeRefs,
  );
  candidates.push(...bytecodeCaches.map((relativePath) => ({ path: relativePath })));

  const protectedPaths = [...PROTECTED_ROOTS];
  for (const entry of evidenceIndex.entries) {
    if (['current', 'previous', 'final', 'unknown'].includes(entry.evidenceRole)) {
      protectedPaths.push(entry.path);
    }
  }

  return buildActiveWorkspaceAudit({
    candidates,
    protectedPaths: [...new Set(protectedPaths)],
    evidenceIssues: evidenceIndex.issues,
    forbiddenRuntimeRefs,
  });
}

async function ordinaryPathExists(root, relativePath, violations) {
  const absolutePath = path.resolve(root, ...relativePath.split('/'));
  try {
    const info = await lstat(absolutePath);
    if (info.isSymbolicLink()) {
      violations.push(`reparse-candidate:${relativePath}`);
      return false;
    }
    return info.isFile() || info.isDirectory();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function findPythonBytecodeCaches(root, directory, violations) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const found = [];
  for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath).replaceAll('\\', '/');
    if (entry.isSymbolicLink()) {
      violations.push(`reparse-under-scripts:${relativePath}`);
      continue;
    }
    if (!entry.isDirectory()) continue;
    if (entry.name === '__pycache__') {
      found.push(relativePath);
      continue;
    }
    found.push(...await findPythonBytecodeCaches(root, absolutePath, violations));
  }
  return found;
}

function compareText(left, right) {
  return String(left).localeCompare(String(right));
}

function optionValue(args, name) {
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main() {
  const audit = await auditActiveWorkspace({ repositoryRoot: process.cwd() });
  const decisionsPath = optionValue(process.argv.slice(2), '--decisions');
  if (decisionsPath) {
    if (!audit.passed) throw new Error('active workspace audit did not pass; refusing to write cleanup decisions');
    await writeFile(
      path.resolve(decisionsPath),
      `${JSON.stringify({ schema: 'dgbook-runtime-cleanup-decisions/v1', decisions: audit.decisions }, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    );
  }
  process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
  if (!audit.passed) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}


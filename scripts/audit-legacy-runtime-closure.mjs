#!/usr/bin/env node

import path from 'node:path';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const AUDIT_SCHEMA = 'dgbook.legacy-runtime-closure-audit/v1';
const DEFAULT_ENTRYPOINTS = Object.freeze([
  'dev',
  'build',
  'typecheck',
  'qa:gates',
  'deploy:web:source',
]);
const TOOL_PACKAGE_BY_BINARY = Object.freeze({
  astro: 'astro',
  next: 'next',
  tsc: 'typescript',
  tsx: 'tsx',
  vite: 'vite',
});
const REFERENCE_PATTERNS = Object.freeze([
  { target: '@dgbook/site', pattern: /@dgbook\/site/u },
  { target: 'deploy:sample', pattern: /deploy:sample(?::[\w-]+)*/u },
  { target: 'legacy-p1-media-source', pattern: /site[\\/]public[\\/]media(?:[\\/]|\b)/iu },
  { target: 'OpenMAIC', pattern: /OpenMAIC/iu },
  { target: 'site/src', pattern: /site[\\/]src(?:[\\/]|\b)/iu },
  { target: 'studio', pattern: /(?:^|[^\w])studio(?:[\\/]|\b)/iu },
]);

export function buildLegacyRuntimeClosureAudit({
  rootPackage,
  pnpmWorkspacePatterns = [],
  workspacePackages = [],
  sourceFiles = [],
  structures = [],
  entrypointScripts = DEFAULT_ENTRYPOINTS,
} = {}) {
  const root = normalizePackageRecord({ path: 'package.json', packageJson: rootPackage }, 'root package');
  const packages = [root, ...workspacePackages.map((record) => normalizePackageRecord(record, 'workspace package'))];
  const packageByName = new Map(packages.map((record) => [record.packageJson.name, record]));
  const packageByPath = new Map(packages.map((record) => [record.path, record]));
  const sourceByPath = new Map(sourceFiles.map(({ path: filePath, text }) => [normalizePath(filePath), String(text)]));
  const unknownCommands = [];
  const blockers = [];
  const commandRecords = [];
  const executableRoots = new Set();
  const queue = [...entrypointScripts]
    .sort((left, right) => left.localeCompare(right))
    .map((script) => ({ packagePath: root.path, script, via: 'entrypoint' }));
  const visited = new Set();

  while (queue.length > 0) {
    const next = queue.shift();
    const packageRecord = packageByPath.get(next.packagePath);
    if (!packageRecord) {
      addBlocker(blockers, {
        code: 'package-unresolved',
        path: next.packagePath,
        detail: next.script,
      });
      continue;
    }
    const visitKey = `${packageRecord.path}#${next.script}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    const command = packageRecord.packageJson.scripts?.[next.script];
    if (typeof command !== 'string' || command.trim() === '') {
      addBlocker(blockers, {
        code: 'script-missing',
        path: packageRecord.path,
        detail: next.script,
      });
      continue;
    }
    commandRecords.push({
      packageName: packageRecord.packageJson.name,
      packagePath: packageRecord.path,
      script: next.script,
      command,
      via: next.via,
    });
    const commandParts = splitCommand(command);
    for (const operator of commandParts.unsupportedOperators) {
      addUnknownCommand(unknownCommands, blockers, {
        packagePath: packageRecord.path,
        script: next.script,
        segment: command,
        reason: `unsupported-shell-operator:${operator}`,
      });
    }
    for (const segment of commandParts.segments) {
      const parsed = parseCommandSegment(segment);
      if (parsed.kind === 'pnpm-script') {
        const targetPackage = parsed.packageName
          ? packageByName.get(parsed.packageName)
          : packageRecord;
        if (!targetPackage) {
          addUnknownCommand(unknownCommands, blockers, {
            packagePath: packageRecord.path,
            script: next.script,
            segment,
            reason: `filter-package-unresolved:${parsed.packageName}`,
          });
        } else {
          queue.push({
            packagePath: targetPackage.path,
            script: parsed.script,
            via: visitKey,
          });
        }
        continue;
      }
      if (parsed.kind === 'node') {
        for (const executablePath of parsed.files) executableRoots.add(resolveCommandFile(packageRecord.path, executablePath));
        continue;
      }
      if (parsed.kind === 'external-tool' && packageProvidesTool(packageRecord.packageJson, parsed.binary)) continue;
      addUnknownCommand(unknownCommands, blockers, {
        packagePath: packageRecord.path,
        script: next.script,
        segment,
        reason: parsed.reason ?? `unrecognized-command:${parsed.binary ?? ''}`,
      });
    }
  }

  const { executableFiles, importBlockers } = resolveExecutableClosure(executableRoots, sourceByPath);
  blockers.push(...importBlockers);
  const references = scanActiveReferences(executableFiles, sourceByPath);
  references.push(...scanWorkspaceReferences({
    rootPackage: root.packageJson,
    pnpmWorkspacePatterns,
    workspacePackages,
    commandRecords,
    structures,
  }));
  deduplicateReferences(references);
  for (const reference of references.filter(({ blocking }) => blocking)) {
    addBlocker(blockers, {
      code: 'active-legacy-reference',
      path: reference.path,
      line: reference.line,
      target: reference.target,
      detail: reference.text,
    });
  }

  commandRecords.sort(compareCommandRecords);
  unknownCommands.sort(compareUnknownCommands);
  blockers.sort(compareBlockers);
  references.sort(compareReferences);

  return {
    schema: AUDIT_SCHEMA,
    passed: blockers.length === 0,
    entrypoints: [...entrypointScripts]
      .sort((left, right) => left.localeCompare(right))
      .map((script) => ({ packageName: root.packageJson.name, packagePath: root.path, script })),
    commands: commandRecords,
    executableFiles,
    references,
    unknownCommands,
    workspace: {
      rootPatterns: [...(Array.isArray(rootPackage?.workspaces) ? rootPackage.workspaces : [])].sort(),
      pnpmPatterns: [...pnpmWorkspacePatterns].sort(),
      packages: workspacePackages.map(({ path: packagePath, packageJson }) => ({
        path: normalizePath(packagePath),
        name: packageJson?.name,
      })).sort((left, right) => left.path.localeCompare(right.path)),
    },
    structures: [...structures].map(normalizeStructure).sort((left, right) => left.path.localeCompare(right.path)),
    blockers,
  };
}

export async function loadLegacyRuntimeClosureAudit({ repositoryRoot = process.cwd() } = {}) {
  const rootDirectory = path.resolve(repositoryRoot instanceof URL ? fileURLToPath(repositoryRoot) : repositoryRoot);
  const rootPackage = JSON.parse(await readFile(path.join(rootDirectory, 'package.json'), 'utf8'));
  const workspaceText = await readFile(path.join(rootDirectory, 'pnpm-workspace.yaml'), 'utf8');
  const pnpmWorkspacePatterns = parsePnpmWorkspacePatterns(workspaceText);
  const workspacePackagePaths = await expandWorkspacePackagePaths(rootDirectory, rootPackage.workspaces ?? []);
  const workspacePackages = await Promise.all(workspacePackagePaths.map(async (manifestPath) => ({
    path: manifestPath,
    packageJson: JSON.parse(await readFile(path.join(rootDirectory, ...manifestPath.split('/')), 'utf8')),
  })));
  const structures = await loadStructures(rootDirectory);

  const commandInventory = buildLegacyRuntimeClosureAudit({
    rootPackage,
    pnpmWorkspacePatterns,
    workspacePackages,
    sourceFiles: [],
    structures,
  });
  const sourceFiles = await loadExecutableSources(rootDirectory, commandInventory.executableFiles);
  return buildLegacyRuntimeClosureAudit({
    rootPackage,
    pnpmWorkspacePatterns,
    workspacePackages,
    sourceFiles,
    structures,
  });
}

function parsePnpmWorkspacePatterns(text) {
  const lines = String(text).split(/\r?\n/u);
  const patterns = [];
  let inPackages = false;
  for (const line of lines) {
    if (/^packages:\s*$/u.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages && /^\S/u.test(line)) break;
    if (!inPackages) continue;
    const match = line.match(/^\s+-\s+['"]?([^'"]+?)['"]?\s*$/u);
    if (match) patterns.push(normalizePath(match[1]));
    else if (line.trim() && !line.trim().startsWith('#')) throw new Error(`unrecognized pnpm workspace entry: ${line.trim()}`);
  }
  if (!inPackages || patterns.length === 0) throw new Error('pnpm workspace packages are required');
  return [...new Set(patterns)].sort();
}

async function expandWorkspacePackagePaths(rootDirectory, patterns) {
  const manifests = new Set();
  for (const rawPattern of patterns) {
    const pattern = normalizePath(rawPattern);
    if (pattern.endsWith('/*')) {
      const parent = pattern.slice(0, -2);
      const entries = await readdir(path.join(rootDirectory, ...parent.split('/')), { withFileTypes: true });
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        if (entry.isDirectory()) manifests.add(`${parent}/${entry.name}/package.json`);
      }
      continue;
    }
    if (/[*?{}[\]]/u.test(pattern)) throw new Error(`unsupported workspace pattern: ${pattern}`);
    manifests.add(`${pattern}/package.json`);
  }
  return [...manifests].sort();
}

async function loadExecutableSources(rootDirectory, executableRoots) {
  const sourceFiles = new Map();
  const queue = [...executableRoots].sort();
  const attempted = new Set();
  while (queue.length > 0) {
    const relativePath = normalizePath(queue.shift());
    if (attempted.has(relativePath)) continue;
    attempted.add(relativePath);
    const text = await readRepositoryText(rootDirectory, relativePath);
    if (text === undefined) continue;
    sourceFiles.set(relativePath, text);
    for (const specifier of relativeImports(text)) {
      const importedPath = await resolveFilesystemImport(rootDirectory, relativePath, specifier);
      if (importedPath && !attempted.has(importedPath)) {
        queue.push(importedPath);
        queue.sort();
      }
    }
  }
  return [...sourceFiles].map(([filePath, text]) => ({ path: filePath, text }));
}

async function resolveFilesystemImport(rootDirectory, fromPath, specifier) {
  const base = normalizePath(path.posix.join(path.posix.dirname(fromPath), specifier));
  const candidates = path.posix.extname(base)
    ? [base]
    : [`${base}.mjs`, `${base}.js`, `${base}.cjs`, `${base}.json`, `${base}/index.mjs`, `${base}/index.js`];
  for (const candidate of candidates) {
    if (await readRepositoryText(rootDirectory, candidate) !== undefined) return candidate;
  }
  return undefined;
}

async function readRepositoryText(rootDirectory, relativePath) {
  if (!relativePath || path.posix.isAbsolute(relativePath) || relativePath.startsWith('../')) return undefined;
  const absolutePath = path.resolve(rootDirectory, ...relativePath.split('/'));
  if (absolutePath !== rootDirectory && !absolutePath.startsWith(`${rootDirectory}${path.sep}`)) return undefined;
  try {
    return await readFile(absolutePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') return undefined;
    throw error;
  }
}

async function loadStructures(rootDirectory) {
  const paths = [
    'OpenMAIC',
    'apps/web/public/media',
    'site/astro.config.mjs',
    'site/package.json',
    'site/public/media',
    'site/public/media/5g',
    'site/public/media/manim/p01',
    'site/public/media/manim/p02',
    'site/public/media/manim/p03',
    'site/src',
    'studio',
    'scripts/archive-cloud-sample.mjs',
    'scripts/audit-cloud-sample-portability.mjs',
    'scripts/audit-cloud-sample-remote.mjs',
    'scripts/audit-cloud-sample-runtime.mjs',
    'scripts/cloud-sample-preflight.mjs',
    'scripts/deploy-cloud-sample-ssh.mjs',
    'scripts/prepare-cloud-sample-release.mjs',
    'scripts/prepare-cloud-sample.mjs',
    'scripts/smoke-cloud-sample-archive.mjs',
    'scripts/verify-cloud-sample-archive.mjs',
    'scripts/verify-cloud-sample.mjs',
  ];
  return Promise.all(paths.sort().map(async (relativePath) => {
    try {
      const stat = await lstat(path.join(rootDirectory, ...relativePath.split('/')));
      return {
        path: relativePath,
        exists: true,
        type: stat.isSymbolicLink() ? 'reparse-point' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other',
      };
    } catch (error) {
      if (error?.code === 'ENOENT') return { path: relativePath, exists: false, type: 'missing' };
      throw error;
    }
  }));
}

function normalizePackageRecord(record, label) {
  if (!record || typeof record !== 'object' || !record.packageJson || typeof record.packageJson !== 'object') {
    throw new TypeError(`${label} is required`);
  }
  const packagePath = normalizePath(record.path);
  if (!packagePath) throw new TypeError(`${label} path is required`);
  if (typeof record.packageJson.name !== 'string' || !record.packageJson.name) throw new TypeError(`${label} name is required`);
  return { path: packagePath, packageJson: record.packageJson };
}

function splitCommand(command) {
  const operators = [...command.matchAll(/&&|\|\||;|\||`|\$\(/gu)].map(([operator]) => operator);
  return {
    segments: command.split(/\s*(?:&&|\|\||;|\|)\s*/u).map((segment) => segment.trim()).filter(Boolean),
    unsupportedOperators: [...new Set(operators.filter((operator) => operator !== '&&'))].sort(),
  };
}

function parseCommandSegment(segment) {
  const tokens = tokenize(segment);
  if (tokens.length === 0) return { kind: 'unknown', reason: 'empty-command' };
  if (tokens[0] === 'pnpm') {
    let index = 1;
    let packageName;
    if (tokens[index] === '--filter') {
      packageName = tokens[index + 1];
      index += 2;
    }
    if (tokens[index] === 'run') index += 1;
    const script = tokens[index];
    if (!script || script.startsWith('-')) return { kind: 'unknown', reason: 'pnpm-script-unresolved' };
    return { kind: 'pnpm-script', packageName, script };
  }
  if (tokens[0] === 'node') {
    const files = tokens.slice(1).filter((token) => !token.startsWith('-') && /\.(?:c?js|mjs)$/iu.test(token));
    if (files.length === 0) return { kind: 'unknown', reason: 'node-entry-unresolved' };
    return { kind: 'node', files };
  }
  if (Object.hasOwn(TOOL_PACKAGE_BY_BINARY, tokens[0])) return { kind: 'external-tool', binary: tokens[0] };
  return { kind: 'unknown', binary: tokens[0] };
}

function tokenize(segment) {
  return [...segment.matchAll(/"([^"]*)"|'([^']*)'|([^\s]+)/gu)]
    .map((match) => match[1] ?? match[2] ?? match[3]);
}

function packageProvidesTool(packageJson, binary) {
  const packageName = TOOL_PACKAGE_BY_BINARY[binary];
  return [packageJson.dependencies, packageJson.devDependencies]
    .some((dependencies) => dependencies && Object.hasOwn(dependencies, packageName));
}

function resolveCommandFile(packageManifestPath, executablePath) {
  const packageDirectory = path.posix.dirname(packageManifestPath);
  return normalizePath(path.posix.join(packageDirectory === '.' ? '' : packageDirectory, executablePath));
}

function resolveExecutableClosure(executableRoots, sourceByPath) {
  const queue = [...executableRoots].sort();
  const visited = new Set();
  const blockers = [];
  while (queue.length > 0) {
    const filePath = queue.shift();
    if (visited.has(filePath)) continue;
    visited.add(filePath);
    const text = sourceByPath.get(filePath);
    if (text === undefined) {
      addBlocker(blockers, { code: 'executable-source-missing', path: filePath });
      continue;
    }
    for (const specifier of relativeImports(text)) {
      const importedPath = resolveRelativeImport(filePath, specifier, sourceByPath);
      if (!importedPath) {
        addBlocker(blockers, {
          code: 'local-import-unresolved',
          path: filePath,
          detail: specifier,
        });
      } else if (!visited.has(importedPath)) {
        queue.push(importedPath);
        queue.sort();
      }
    }
  }
  return { executableFiles: [...visited].sort(), importBlockers: blockers };
}

function relativeImports(text) {
  const imports = new Set();
  const patterns = [
    /(?:^|\n)\s*(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"](\.[^'"]+)['"]/gu,
    /import\(\s*['"](\.[^'"]+)['"]\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) imports.add(match[1]);
  }
  return [...imports].sort();
}

function resolveRelativeImport(fromPath, specifier, sourceByPath) {
  const base = normalizePath(path.posix.join(path.posix.dirname(fromPath), specifier));
  const candidates = path.posix.extname(base)
    ? [base]
    : [`${base}.mjs`, `${base}.js`, `${base}.cjs`, `${base}/index.mjs`, `${base}/index.js`];
  return candidates.find((candidate) => sourceByPath.has(candidate));
}

function scanActiveReferences(executableFiles, sourceByPath) {
  const references = [];
  for (const filePath of executableFiles) {
    const text = sourceByPath.get(filePath);
    if (text === undefined) continue;
    const lines = text.split(/\r?\n/u);
    for (let index = 0; index < lines.length; index += 1) {
      for (const { target, pattern } of REFERENCE_PATTERNS) {
        if (pattern.test(lines[index])) {
          references.push({
            target,
            path: filePath,
            line: index + 1,
            sourceKind: 'active-source',
            active: true,
            blocking: true,
            text: lines[index].trim(),
          });
        }
      }
    }
  }
  return references;
}

function scanWorkspaceReferences({
  rootPackage,
  pnpmWorkspacePatterns,
  workspacePackages,
  commandRecords,
  structures,
}) {
  const references = [];
  const rootPatterns = Array.isArray(rootPackage.workspaces) ? rootPackage.workspaces : [];
  for (const [pathName, patterns] of [
    ['package.json', rootPatterns],
    ['pnpm-workspace.yaml', pnpmWorkspacePatterns],
  ]) {
    for (const pattern of patterns) {
      const target = legacyWorkspaceTarget(pattern);
      if (!target) continue;
      references.push({
        target,
        path: pathName,
        sourceKind: 'workspace-pattern',
        active: true,
        blocking: true,
        text: String(pattern),
      });
    }
  }
  if (JSON.stringify([...rootPatterns].sort()) !== JSON.stringify([...pnpmWorkspacePatterns].sort())) {
    references.push({
      target: 'workspace-pattern-mismatch',
      path: 'pnpm-workspace.yaml',
      sourceKind: 'workspace-consistency',
      active: true,
      blocking: true,
      text: 'package.json workspaces and pnpm-workspace.yaml packages differ',
    });
  }
  for (const { path: manifestPath, packageJson } of workspacePackages) {
    const target = packageJson?.name === '@dgbook/site'
      ? '@dgbook/site'
      : packageJson?.name === '@dgbook/studio' ? 'studio' : undefined;
    if (!target) continue;
    references.push({
      target,
      path: normalizePath(manifestPath),
      sourceKind: 'workspace-package',
      active: true,
      blocking: true,
      text: String(packageJson.name),
    });
  }
  for (const [script, command] of Object.entries(rootPackage.scripts ?? {})) {
    if (script === 'deploy:sample' || script.startsWith('deploy:sample:')) {
      references.push({
        target: 'deploy:sample',
        path: 'package.json',
        sourceKind: 'root-script',
        active: false,
        blocking: true,
        text: `${script}: ${command}`,
      });
    }
    references.push(...referencesInText({
      path: 'package.json',
      text: String(command),
      sourceKind: 'root-script',
      active: commandRecords.some((record) => record.packagePath === 'package.json' && record.script === script),
      blocking: true,
      detail: `${script}: ${command}`,
    }));
  }
  for (const commandRecord of commandRecords.filter(({ packagePath }) => packagePath !== 'package.json')) {
    references.push(...referencesInText({
      path: commandRecord.packagePath,
      text: commandRecord.command,
      sourceKind: 'active-command',
      active: true,
      blocking: true,
      detail: `${commandRecord.script}: ${commandRecord.command}`,
    }));
  }
  for (const structure of structures.map(normalizeStructure)) {
    const target = legacyStructureTarget(structure.path);
    if (!target || !structure.exists) continue;
    references.push({
      target,
      path: structure.path,
      sourceKind: 'structure',
      active: false,
      blocking: false,
      text: `${structure.type}:${structure.path}`,
    });
  }
  return references;
}

function referencesInText({ path: filePath, text, sourceKind, active, blocking, detail }) {
  return REFERENCE_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ target }) => ({
      target,
      path: filePath,
      sourceKind,
      active,
      blocking,
      text: detail,
    }));
}

function legacyWorkspaceTarget(pattern) {
  const normalized = normalizePath(pattern);
  if (normalized === 'site') return '@dgbook/site';
  if (normalized === 'studio') return 'studio';
  return undefined;
}

function legacyStructureTarget(structurePath) {
  const normalized = normalizePath(structurePath);
  if (normalized === 'OpenMAIC' || normalized.startsWith('OpenMAIC/')) return 'OpenMAIC';
  if (normalized === 'site/src' || normalized.startsWith('site/src/')) return 'site/src';
  if (normalized === 'site/public/media' || normalized.startsWith('site/public/media/')) return 'legacy-p1-media-source';
  if (normalized === 'studio' || normalized.startsWith('studio/')) return 'studio';
  if (normalized === 'site/package.json' || normalized === 'site/astro.config.mjs') return '@dgbook/site';
  return undefined;
}

function deduplicateReferences(references) {
  const seen = new Set();
  for (let index = references.length - 1; index >= 0; index -= 1) {
    const reference = references[index];
    const key = JSON.stringify(reference);
    if (seen.has(key)) references.splice(index, 1);
    else seen.add(key);
  }
}

function addUnknownCommand(unknownCommands, blockers, record) {
  unknownCommands.push(record);
  addBlocker(blockers, {
    code: 'command-unrecognized',
    path: record.packagePath,
    detail: `${record.script}:${record.reason}:${record.segment}`,
  });
}

function addBlocker(blockers, blocker) {
  const key = JSON.stringify(blocker);
  if (!blockers.some((candidate) => JSON.stringify(candidate) === key)) blockers.push(blocker);
}

function normalizeStructure(structure) {
  return {
    path: normalizePath(structure.path),
    type: structure.type ?? 'missing',
    exists: structure.exists ?? structure.type !== 'missing',
  };
}

function normalizePath(input) {
  return String(input ?? '').replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/$/u, '');
}

function compareCommandRecords(left, right) {
  return left.packagePath.localeCompare(right.packagePath) || left.script.localeCompare(right.script);
}

function compareUnknownCommands(left, right) {
  return left.packagePath.localeCompare(right.packagePath)
    || left.script.localeCompare(right.script)
    || left.segment.localeCompare(right.segment);
}

function compareBlockers(left, right) {
  return left.code.localeCompare(right.code)
    || String(left.path ?? '').localeCompare(String(right.path ?? ''))
    || Number(left.line ?? 0) - Number(right.line ?? 0)
    || String(left.target ?? '').localeCompare(String(right.target ?? ''))
    || String(left.detail ?? '').localeCompare(String(right.detail ?? ''));
}

function compareReferences(left, right) {
  return left.path.localeCompare(right.path)
    || Number(left.line ?? 0) - Number(right.line ?? 0)
    || left.target.localeCompare(right.target);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const audit = await loadLegacyRuntimeClosureAudit({ repositoryRoot: process.cwd() });
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    process.exitCode = audit.passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

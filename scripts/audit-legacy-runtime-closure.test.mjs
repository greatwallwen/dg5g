import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildLegacyRuntimeClosureAudit } from './audit-legacy-runtime-closure.mjs';

const REPOSITORY_ROOT = new URL('../', import.meta.url);

test('traces recursive root, filtered workspace, executable, and import closure', () => {
  const audit = buildLegacyRuntimeClosureAudit({
    rootPackage: {
      name: 'fixture',
      workspaces: ['apps/*', 'packages/*'],
      scripts: {
        dev: 'pnpm web:dev',
        build: 'pnpm web:build',
        typecheck: 'pnpm web:typecheck',
        'qa:gates': 'pnpm audit:legacy',
        'web:dev': 'pnpm --filter @dgbook/web dev',
        'web:build': 'pnpm --filter @dgbook/web build',
        'web:typecheck': 'pnpm --filter @dgbook/web typecheck',
        'audit:legacy': 'node scripts/audit-legacy.mjs',
        'deploy:web:source': 'node scripts/prepare-release.mjs',
      },
    },
    pnpmWorkspacePatterns: ['apps/*', 'packages/*'],
    workspacePackages: [
      {
        path: 'apps/web/package.json',
        packageJson: {
          name: '@dgbook/web',
          scripts: { dev: 'next dev', build: 'next build', typecheck: 'tsc --noEmit' },
          dependencies: { next: '14.2.35' },
          devDependencies: { typescript: '^5.6.0' },
        },
      },
    ],
    sourceFiles: [
      {
        path: 'scripts/audit-legacy.mjs',
        text: "import './shared-audit.mjs';\nreadText('site/src/pages/index.astro');\n",
      },
      { path: 'scripts/shared-audit.mjs', text: "export const auditName = 'shared';\n" },
      { path: 'scripts/prepare-release.mjs', text: "export const release = 'web';\n" },
    ],
    structures: [],
  });

  assert.deepEqual(audit.entrypoints.map(({ script }) => script), [
    'build',
    'deploy:web:source',
    'dev',
    'qa:gates',
    'typecheck',
  ]);
  assert.deepEqual(audit.executableFiles, [
    'scripts/audit-legacy.mjs',
    'scripts/prepare-release.mjs',
    'scripts/shared-audit.mjs',
  ]);
  assert.equal(audit.references.some((reference) => (
    reference.target === 'site/src'
      && reference.path === 'scripts/audit-legacy.mjs'
      && reference.active === true
      && reference.blocking === true
  )), true);
  assert.equal(audit.passed, false);
});

test('fails closed on an unknown shell branch while still auditing later branches', () => {
  const audit = buildLegacyRuntimeClosureAudit({
    rootPackage: {
      name: 'fixture',
      scripts: {
        'qa:gates': 'mystery-tool audit || node scripts/later-branch.mjs',
      },
    },
    sourceFiles: [{
      path: 'scripts/later-branch.mjs',
      text: "export const retainedReference = 'OpenMAIC';\n",
    }],
    entrypointScripts: ['qa:gates'],
  });

  assert.equal(audit.passed, false);
  assert.equal(audit.unknownCommands.some(({ reason }) => reason === 'unsupported-shell-operator:||'), true);
  assert.deepEqual(audit.executableFiles, ['scripts/later-branch.mjs']);
  assert.equal(audit.references.some(({ target }) => target === 'OpenMAIC'), true);
});

test('reports legacy workspace, package-script, package, and structural references separately', () => {
  const audit = buildLegacyRuntimeClosureAudit({
    rootPackage: {
      name: 'fixture',
      workspaces: ['apps/*', 'packages/*', 'site', 'studio'],
      scripts: {
        dev: 'node scripts/dev.mjs',
        'qa:legacy-site': 'pnpm --filter @dgbook/site build',
        'deploy:sample:5g': 'node scripts/prepare-cloud-sample.mjs',
      },
    },
    pnpmWorkspacePatterns: ['apps/*', 'packages/*', 'site', 'studio'],
    workspacePackages: [
      { path: 'site/package.json', packageJson: { name: '@dgbook/site', scripts: { build: 'astro build' } } },
      { path: 'studio/package.json', packageJson: { name: '@dgbook/studio', scripts: { build: 'vite build' } } },
    ],
    sourceFiles: [{ path: 'scripts/dev.mjs', text: "export const app = 'web';\n" }],
    structures: [
      { path: 'OpenMAIC', type: 'directory', exists: true },
      { path: 'site/src', type: 'directory', exists: true },
      { path: 'site/public/media', type: 'directory', exists: true },
    ],
    entrypointScripts: ['dev'],
  });

  assert.equal(audit.references.some((reference) => (
    reference.target === 'studio'
      && reference.sourceKind === 'workspace-pattern'
      && reference.blocking === true
  )), true);
  assert.equal(audit.references.some((reference) => (
    reference.target === '@dgbook/site'
      && reference.sourceKind === 'workspace-package'
      && reference.blocking === true
  )), true);
  assert.equal(audit.references.some((reference) => (
    reference.target === 'deploy:sample'
      && reference.sourceKind === 'root-script'
      && reference.blocking === true
  )), true);
  assert.equal(audit.references.some((reference) => (
    reference.target === 'OpenMAIC'
      && reference.sourceKind === 'structure'
      && reference.blocking === false
  )), true);
  assert.equal(audit.references.some((reference) => (
    reference.target === 'site/src'
      && reference.sourceKind === 'structure'
      && reference.blocking === false
  )), true);
  assert.equal(audit.references.some((reference) => (
    reference.target === 'legacy-p1-media-source'
      && reference.sourceKind === 'structure'
      && reference.blocking === false
  )), true);
  assert.equal(audit.passed, false);
});

test('loads the current repository deterministically and reports a legacy-free active closure', async () => {
  const { loadLegacyRuntimeClosureAudit } = await import('./audit-legacy-runtime-closure.mjs');
  const audit = await loadLegacyRuntimeClosureAudit({ repositoryRoot: REPOSITORY_ROOT });

  assert.equal(audit.passed, true);
  assert.deepEqual(audit.entrypoints.map(({ script }) => script), [
    'build',
    'deploy:web:source',
    'dev',
    'qa:gates',
    'typecheck',
  ]);
  assert.deepEqual(audit.unknownCommands, []);
  assert.deepEqual(audit.blockers, []);
  assert.equal(audit.references.every(({ blocking }) => blocking === false), true);
  assert.equal(audit.executableFiles.includes('scripts/verify-accepted-web-media-release.mjs'), true);
  assert.equal(audit.executableFiles.includes('scripts/web-media-cutover-plan.mjs'), false);
});

test('CLI emits the current GREEN audit as JSON and exits zero', () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('./audit-legacy-runtime-closure.mjs', import.meta.url)),
  ], {
    cwd: fileURLToPath(REPOSITORY_ROOT),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const audit = JSON.parse(result.stdout);
  assert.equal(audit.passed, true);
  assert.equal(audit.schema, 'dgbook.legacy-runtime-closure-audit/v1');
});

test('does not mistake a quoted source snippet for a static import', () => {
  const audit = buildLegacyRuntimeClosureAudit({
    rootPackage: {
      name: 'fixture',
      scripts: { 'qa:gates': 'node scripts/inspect.mjs' },
    },
    sourceFiles: [{
      path: 'scripts/inspect.mjs',
      text: `const expectedSnippet = "from './not-an-import'";\nexport { expectedSnippet };\n`,
    }],
    entrypointScripts: ['qa:gates'],
  });

  assert.equal(audit.blockers.some(({ code }) => code === 'local-import-unresolved'), false);
  assert.equal(audit.passed, true);
});

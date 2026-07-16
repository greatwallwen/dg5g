import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(new URL('./quarantine-legacy-workspace.mjs', import.meta.url));

const LEGACY_SCRIPT_PATHS = [
  'scripts/prepare-cloud-sample.mjs',
  'scripts/verify-cloud-sample.mjs',
  'scripts/audit-cloud-sample-portability.mjs',
  'scripts/audit-cloud-sample-runtime.mjs',
  'scripts/audit-cloud-sample-remote.mjs',
  'scripts/smoke-cloud-sample-archive.mjs',
  'scripts/archive-cloud-sample.mjs',
  'scripts/verify-cloud-sample-archive.mjs',
  'scripts/cloud-sample-preflight.mjs',
  'scripts/deploy-cloud-sample-ssh.mjs',
  'scripts/prepare-cloud-sample-release.mjs',
  '.gitea/workflows/deploy-cloud-sample.yml',
  'scripts/audit-product-closure.mjs',
  'scripts/audit-product-maturity.mjs',
];

const EXPECTED_GROUPS = [
  { id: 'legacy-scripts', kind: 'regular', roots: LEGACY_SCRIPT_PATHS },
  {
    id: 'site-a',
    kind: 'regular',
    roots: ['site/src', 'site/astro.config.mjs', 'site/package.json', 'site/tsconfig.json'],
  },
  {
    id: 'site-b',
    kind: 'regular',
    roots: ['site/public/avatars', 'site/public/interactives', 'site/public/favicon.svg'],
  },
  { id: 'site-dependencies', kind: 'opaque', roots: ['site/node_modules'] },
  { id: 'studio', kind: 'opaque', roots: ['studio'] },
  { id: 'openmaic', kind: 'opaque', roots: ['OpenMAIC'] },
];

async function writeRepositoryFile(root, relativePath, content = relativePath) {
  const absolutePath = path.join(root, ...relativePath.split('/'));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content);
}

async function makeFixture(t, { createLinks = true } = {}) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'dgbook-legacy-quarantine-'));
  const repositoryRoot = path.join(base, 'repository');
  const quarantineRoot = path.join(base, 'external-quarantine');
  await mkdir(repositoryRoot, { recursive: true });
  await mkdir(quarantineRoot, { recursive: true });
  t.after(() => rm(base, { recursive: true, force: true }));

  await writeRepositoryFile(repositoryRoot, 'package.json', JSON.stringify({
    name: 'fixture',
    private: true,
    workspaces: ['apps/*', 'packages/*'],
    scripts: {
      dev: 'pnpm web:dev',
      build: 'pnpm web:build',
      typecheck: 'pnpm web:typecheck',
      'qa:gates': 'node scripts/fixture-qa.mjs',
      'deploy:web:source': 'node scripts/fixture-source-release.mjs',
      'web:dev': 'pnpm --filter @dgbook/web dev',
      'web:build': 'pnpm --filter @dgbook/web build',
      'web:typecheck': 'pnpm --filter @dgbook/web typecheck',
    },
  }, null, 2));
  await writeRepositoryFile(repositoryRoot, 'pnpm-workspace.yaml', "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
  await writeRepositoryFile(repositoryRoot, 'pnpm-lock.yaml', "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  apps/web: {}\n");
  await writeRepositoryFile(repositoryRoot, '.git/root-marker', 'outer git must remain');
  await writeRepositoryFile(repositoryRoot, 'packages/shared/marker.txt', 'must not be followed');
  await writeRepositoryFile(repositoryRoot, 'packages/shared/package.json', '{"name":"@dgbook/shared"}\n');
  await writeRepositoryFile(repositoryRoot, 'apps/web/package.json', JSON.stringify({
    name: '@dgbook/web',
    scripts: { dev: 'next dev', build: 'next build', typecheck: 'tsc --noEmit' },
    dependencies: { next: '14.2.35' },
    devDependencies: { typescript: '^5.6.0' },
  }));
  await writeRepositoryFile(repositoryRoot, 'scripts/fixture-qa.mjs', 'export const qa = true;\n');
  await writeRepositoryFile(repositoryRoot, 'scripts/fixture-source-release.mjs', 'export const source = true;\n');

  for (const relativePath of LEGACY_SCRIPT_PATHS) {
    await writeRepositoryFile(repositoryRoot, relativePath, `legacy:${relativePath}\n`);
  }
  await writeRepositoryFile(repositoryRoot, 'site/src/index.ts', 'export const legacy = true;\n');
  await writeRepositoryFile(repositoryRoot, 'site/astro.config.mjs', 'export default {};\n');
  await writeRepositoryFile(repositoryRoot, 'site/package.json', '{"name":"@dgbook/site"}\n');
  await writeRepositoryFile(repositoryRoot, 'site/tsconfig.json', '{}\n');
  await writeRepositoryFile(repositoryRoot, 'site/public/avatars/avatar.txt', 'avatar');
  await mkdir(path.join(repositoryRoot, 'site/public/interactives'), { recursive: true });
  await writeRepositoryFile(repositoryRoot, 'site/public/favicon.svg', '<svg/>');
  await writeRepositoryFile(repositoryRoot, 'site/public/media/protected.bin', 'protected-media');
  await writeRepositoryFile(repositoryRoot, 'site/node_modules/local.txt', 'dependency-cache');
  await writeRepositoryFile(repositoryRoot, 'studio/index.ts', 'export const studio = true;\n');
  await writeRepositoryFile(repositoryRoot, 'OpenMAIC/README.md', 'reference');
  await writeRepositoryFile(repositoryRoot, 'OpenMAIC/.git/config', '[remote "origin"]\n');

  if (createLinks) {
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    await mkdir(path.join(repositoryRoot, 'site/node_modules/@dgbook'), { recursive: true });
    await symlink(
      path.join(repositoryRoot, 'packages/shared'),
      path.join(repositoryRoot, 'site/node_modules/@dgbook/shared'),
      linkType,
    );
    await mkdir(path.join(repositoryRoot, 'studio/node_modules/@dgbook'), { recursive: true });
    await symlink(
      path.join(repositoryRoot, 'packages/shared'),
      path.join(repositoryRoot, 'studio/node_modules/@dgbook/shared'),
      linkType,
    );
  }

  return {
    base,
    repositoryRoot,
    quarantineRoot,
    sessionId: '20260716T000000Z-test-session',
    closureAuditLoader: async () => ({
      schema: 'dgbook.legacy-runtime-closure-audit/v1',
      passed: true,
      blockers: [],
    }),
  };
}

test('CLI help exposes dry-run, apply, and explicit restore without mutating the workspace', () => {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, '--help'], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--dry-run/u);
  assert.match(result.stdout, /--apply/u);
  assert.match(result.stdout, /--restore/u);
});

test('dry-run writes one sealed manifest with fixed groups, per-file hashes, and opaque summaries', async (t) => {
  const quarantine = await import('./quarantine-legacy-workspace.mjs');
  assert.equal(typeof quarantine.sealLegacyWorkspaceQuarantinePlan, 'function');
  assert.deepEqual(quarantine.LEGACY_WORKSPACE_GROUPS, EXPECTED_GROUPS);
  const fixture = await makeFixture(t);

  const plan = await quarantine.sealLegacyWorkspaceQuarantinePlan(fixture);

  assert.equal(plan.schema, 'dgbook.legacy-workspace-quarantine/v1');
  assert.equal(
    plan.manifestPath,
    path.join(fixture.quarantineRoot, fixture.sessionId, 'legacy', 'sealed-manifest.json'),
  );
  assert.deepEqual(plan.groups.map(({ id }) => id), EXPECTED_GROUPS.map(({ id }) => id));
  assert.equal(plan.groups.find(({ id }) => id === 'site-b').roots.some(({ relativePath }) => (
    relativePath.startsWith('site/public/media')
  )), false);
  assert.equal(plan.protectedMedia.relativePath, 'site/public/media');
  assert.match(plan.sealSha256, /^[a-f0-9]{64}$/u);
  for (const group of plan.groups) {
    for (const file of group.files) assert.match(file.sha256, /^[a-f0-9]{64}$/u);
  }
  const siteDependencies = plan.groups.find(({ id }) => id === 'site-dependencies');
  const studio = plan.groups.find(({ id }) => id === 'studio');
  const openmaic = plan.groups.find(({ id }) => id === 'openmaic');
  assert.equal(siteDependencies.reparsePoints.length, 1);
  assert.equal(studio.reparsePoints.length, 1);
  assert.equal(studio.files.some(({ relativePath }) => relativePath.includes('marker.txt')), false);
  assert.equal(openmaic.files.some(({ relativePath }) => relativePath === 'OpenMAIC/.git/config'), true);
  assert.equal(plan.groups.some(({ roots }) => roots.some(({ relativePath }) => relativePath === '.git')), false);
  assert.equal(await readFile(plan.manifestPath, 'utf8').then(JSON.parse).then(({ sealSha256 }) => sealSha256), plan.sealSha256);
  await assert.rejects(
    quarantine.sealLegacyWorkspaceQuarantinePlan(fixture),
    /write-once|already exists|session/i,
  );
});

test('apply moves fixed groups only and explicit restore completes a lossless round trip', async (t) => {
  const quarantine = await import('./quarantine-legacy-workspace.mjs');
  assert.equal(typeof quarantine.applyLegacyWorkspaceQuarantine, 'function');
  assert.equal(typeof quarantine.restoreLegacyWorkspaceQuarantine, 'function');
  const fixture = await makeFixture(t);
  const plan = await quarantine.sealLegacyWorkspaceQuarantinePlan(fixture);

  const applied = await quarantine.applyLegacyWorkspaceQuarantine({
    manifestPath: plan.manifestPath,
    closureAuditLoader: fixture.closureAuditLoader,
  });

  assert.equal(applied.state, 'quarantined');
  assert.deepEqual([...new Set(applied.actions.map(({ groupId }) => groupId))], EXPECTED_GROUPS.map(({ id }) => id));
  for (const group of plan.groups) {
    for (const root of group.roots) {
      await assert.rejects(access(root.sourcePath), /ENOENT/u);
      await access(root.targetPath);
    }
  }
  await access(path.join(fixture.repositoryRoot, 'site/public/media/protected.bin'));
  await access(path.join(fixture.repositoryRoot, '.git/root-marker'));
  await access(path.join(fixture.repositoryRoot, 'packages/shared/marker.txt'));
  assert.deepEqual((await readdirNames(path.join(fixture.repositoryRoot, 'site'))), ['public']);
  assert.deepEqual((await readdirNames(path.join(fixture.repositoryRoot, 'site/public'))), ['media']);

  const restored = await quarantine.restoreLegacyWorkspaceQuarantine({ manifestPath: plan.manifestPath });

  assert.equal(restored.state, 'restored');
  for (const group of plan.groups) {
    for (const root of group.roots) {
      await access(root.sourcePath);
      await assert.rejects(access(root.targetPath), /ENOENT/u);
    }
  }
  assert.equal(await readFile(path.join(fixture.repositoryRoot, 'OpenMAIC/.git/config'), 'utf8'), '[remote "origin"]\n');
  assert.equal(await readFile(path.join(fixture.repositoryRoot, '.git/root-marker'), 'utf8'), 'outer git must remain');
  assert.equal(await readFile(path.join(fixture.repositoryRoot, 'site/public/media/protected.bin'), 'utf8'), 'protected-media');
});

async function readdirNames(directory) {
  return (await import('node:fs/promises')).readdir(directory).then((names) => names.sort());
}

test('CLI dry-run seals a fixture plan and never applies it', async (t) => {
  const fixture = await makeFixture(t);
  const result = spawnSync(process.execPath, [
    SCRIPT_PATH,
    '--dry-run',
    '--root', fixture.repositoryRoot,
    '--quarantine-root', fixture.quarantineRoot,
    '--session', fixture.sessionId,
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.state, 'sealed-plan');
  assert.equal(summary.applied, false);
  await access(summary.manifestPath);
  await access(path.join(fixture.repositoryRoot, 'site/src/index.ts'));
});

test('planning refuses a red active audit before creating a session', async (t) => {
  const quarantine = await import('./quarantine-legacy-workspace.mjs');
  const fixture = await makeFixture(t);
  await assert.rejects(
    quarantine.sealLegacyWorkspaceQuarantinePlan({
      ...fixture,
      closureAuditLoader: async () => ({ passed: false, blockers: [{ code: 'fixture-red' }] }),
    }),
    /ACTIVE_AUDIT_RED/u,
  );
  await assert.rejects(access(path.join(fixture.quarantineRoot, fixture.sessionId)), /ENOENT/u);
});

test('planning refuses stale package, workspace, or lock importers before creating a session', async (t) => {
  const quarantine = await import('./quarantine-legacy-workspace.mjs');
  const fixture = await makeFixture(t);
  await writeRepositoryFile(fixture.repositoryRoot, 'pnpm-lock.yaml', "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  site: {}\n");
  await assert.rejects(
    quarantine.sealLegacyWorkspaceQuarantinePlan(fixture),
    /WORKSPACE_CLOSURE_RED/u,
  );
  await assert.rejects(access(path.join(fixture.quarantineRoot, fixture.sessionId)), /ENOENT/u);
});

test('planning requires site to have no ungrouped legacy residue', async (t) => {
  const quarantine = await import('./quarantine-legacy-workspace.mjs');
  const fixture = await makeFixture(t);
  await writeRepositoryFile(fixture.repositoryRoot, 'site/dist/stale.html', 'stale');
  await assert.rejects(
    quarantine.sealLegacyWorkspaceQuarantinePlan(fixture),
    /SITE_ROOT_BOUNDARY_DRIFT/u,
  );
  await assert.rejects(access(path.join(fixture.quarantineRoot, fixture.sessionId)), /ENOENT/u);
});

test('planning refuses protected media boundary drift and cross-volume opaque moves', async (t) => {
  const quarantine = await import('./quarantine-legacy-workspace.mjs');
  const mediaDrift = await makeFixture(t);
  await writeRepositoryFile(mediaDrift.repositoryRoot, 'site/public/unexpected.txt', 'unexpected');
  await assert.rejects(
    quarantine.sealLegacyWorkspaceQuarantinePlan(mediaDrift),
    /SITE_PUBLIC_BOUNDARY_DRIFT/u,
  );
  await assert.rejects(access(path.join(mediaDrift.quarantineRoot, mediaDrift.sessionId)), /ENOENT/u);

  const crossVolume = await makeFixture(t);
  await assert.rejects(
    quarantine.sealLegacyWorkspaceQuarantinePlan({
      ...crossVolume,
      volumeResolver: async (candidate) => (
        path.resolve(candidate).startsWith(path.resolve(crossVolume.repositoryRoot)) ? 'repository-volume' : 'quarantine-volume'
      ),
    }),
    /CROSS_VOLUME_FORBIDDEN/u,
  );
  await assert.rejects(access(path.join(crossVolume.quarantineRoot, crossVolume.sessionId)), /ENOENT/u);
});

test('apply completes all preflight checks before moving and rejects drift or target collisions', async (t) => {
  const quarantine = await import('./quarantine-legacy-workspace.mjs');
  const drifted = await makeFixture(t);
  const driftPlan = await quarantine.sealLegacyWorkspaceQuarantinePlan(drifted);
  await writeRepositoryFile(drifted.repositoryRoot, 'OpenMAIC/README.md', 'changed after seal');
  await assert.rejects(
    quarantine.applyLegacyWorkspaceQuarantine({
      manifestPath: driftPlan.manifestPath,
      closureAuditLoader: drifted.closureAuditLoader,
    }),
    /DRIFT/u,
  );
  await access(path.join(drifted.repositoryRoot, LEGACY_SCRIPT_PATHS[0]));
  await assert.rejects(access(driftPlan.payloadRoot), /ENOENT/u);

  const collision = await makeFixture(t);
  const collisionPlan = await quarantine.sealLegacyWorkspaceQuarantinePlan(collision);
  await writeRepositoryFile(collisionPlan.payloadRoot, 'sentinel.txt', 'collision');
  await assert.rejects(
    quarantine.applyLegacyWorkspaceQuarantine({
      manifestPath: collisionPlan.manifestPath,
      closureAuditLoader: collision.closureAuditLoader,
    }),
    /unique quarantine payload target|WRITE_ONCE_TARGET_EXISTS/u,
  );
  await access(path.join(collision.repositoryRoot, LEGACY_SCRIPT_PATHS[0]));
});

test('an injected apply fault reverses every completed move and publishes no receipt', async (t) => {
  const quarantine = await import('./quarantine-legacy-workspace.mjs');
  const fixture = await makeFixture(t);
  const plan = await quarantine.sealLegacyWorkspaceQuarantinePlan(fixture);
  await assert.rejects(
    quarantine.applyLegacyWorkspaceQuarantine({
      manifestPath: plan.manifestPath,
      closureAuditLoader: fixture.closureAuditLoader,
      faultAfterMoves: 5,
    }),
    /injected legacy quarantine fault/u,
  );
  for (const group of plan.groups) {
    for (const root of group.roots) {
      await access(root.sourcePath);
      await assert.rejects(access(root.targetPath), /ENOENT/u);
    }
  }
  await assert.rejects(access(path.join(plan.legacyRoot, 'apply-receipt.json')), /ENOENT/u);
  await access(path.join(fixture.repositoryRoot, 'site/public/media/protected.bin'));
});

test('apply rejects a re-sealed manifest whose declared group order was tampered', async (t) => {
  const quarantine = await import('./quarantine-legacy-workspace.mjs');
  const fixture = await makeFixture(t);
  const plan = await quarantine.sealLegacyWorkspaceQuarantinePlan(fixture);
  const tampered = JSON.parse(await readFile(plan.manifestPath, 'utf8'));
  tampered.groupOrder = [...tampered.groupOrder].reverse();
  delete tampered.sealSha256;
  tampered.sealSha256 = testSha256(testCanonicalJson(tampered));
  const content = `${JSON.stringify(tampered, null, 2)}\n`;
  await writeFile(plan.manifestPath, content);
  await writeFile(plan.manifestSha256Path, `${testSha256(content)}  sealed-manifest.json\n`);

  await assert.rejects(
    quarantine.applyLegacyWorkspaceQuarantine({
      manifestPath: plan.manifestPath,
      closureAuditLoader: fixture.closureAuditLoader,
    }),
    /GROUP_ORDER_DRIFT/u,
  );
  await access(path.join(fixture.repositoryRoot, LEGACY_SCRIPT_PATHS[0]));
});

test('an injected restore fault returns every restored root to quarantine and a later restore succeeds', async (t) => {
  const quarantine = await import('./quarantine-legacy-workspace.mjs');
  const fixture = await makeFixture(t);
  const plan = await quarantine.sealLegacyWorkspaceQuarantinePlan(fixture);
  await quarantine.applyLegacyWorkspaceQuarantine({
    manifestPath: plan.manifestPath,
    closureAuditLoader: fixture.closureAuditLoader,
  });

  await assert.rejects(
    quarantine.restoreLegacyWorkspaceQuarantine({
      manifestPath: plan.manifestPath,
      faultAfterRestores: 2,
    }),
    /injected legacy restore fault/u,
  );
  for (const group of plan.groups) {
    for (const root of group.roots) {
      await assert.rejects(access(root.sourcePath), /ENOENT/u);
      await access(root.targetPath);
    }
  }
  const restored = await quarantine.restoreLegacyWorkspaceQuarantine({ manifestPath: plan.manifestPath });
  assert.equal(restored.state, 'restored');
});

function testSha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function testCanonicalJson(value) {
  const sort = (candidate) => {
    if (Array.isArray(candidate)) return candidate.map(sort);
    if (candidate && typeof candidate === 'object') {
      return Object.fromEntries(Object.keys(candidate).sort().map((key) => [key, sort(candidate[key])]));
    }
    return candidate;
  };
  return JSON.stringify(sort(value));
}

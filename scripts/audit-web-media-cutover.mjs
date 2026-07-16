#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditExactMediaTree,
  auditPlannedMediaSources,
  buildMediaCutoverPlan,
  loadMediaCutoverManifest,
} from './web-media-cutover-plan.mjs';

export async function runWebMediaCutoverAudit({
  repositoryRoot,
  mode = 'planned',
  releaseId,
  createdAt = new Date().toISOString(),
}) {
  if (mode === 'planned') {
    const plan = await buildMediaCutoverPlan({ repositoryRoot, releaseId, createdAt });
    const sourceAudit = await auditPlannedMediaSources({ repositoryRoot, manifest: plan });
    return Object.freeze({
      schema: 'dgbook.web-media-cutover-audit/v1',
      mode,
      auditedAt: createdAt,
      passed: sourceAudit.passed,
      plan,
      sourceAudit,
    });
  }
  if (mode === 'verify-staging') {
    const plan = await loadMediaCutoverManifest({ repositoryRoot, releaseId });
    const treeAudit = await auditExactMediaTree({
      root: path.join(path.resolve(repositoryRoot), ...plan.stagingRoot.split('/')),
      entries: plan.entries,
    });
    return Object.freeze({
      schema: 'dgbook.web-media-cutover-audit/v1',
      mode,
      auditedAt: createdAt,
      passed: treeAudit.passed,
      plan,
      treeAudit,
    });
  }
  throw new Error(`unsupported read-only media cutover audit mode: ${mode}`);
}

async function main() {
  const repositoryRoot = path.resolve(import.meta.dirname, '..');
  const mode = readArg('--mode', 'planned');
  const releaseId = readArg('--release-id', process.env.DGBOOK_MEDIA_RELEASE_ID ?? defaultReleaseId());
  const report = await runWebMediaCutoverAudit({ repositoryRoot, mode, releaseId });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function defaultReleaseId() {
  return `task9-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}

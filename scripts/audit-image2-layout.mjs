#!/usr/bin/env node

import { runImage2ImplementationAudit } from './capture-image2-implementation.mjs';

const { report, reportPath } = await runImage2ImplementationAudit({
  baseUrl: readArg('--base-url', 'http://127.0.0.1:3157/'),
  outDir: readArg('--out', 'output/playwright/image2-layout'),
  strict: false,
  filters: {
    surfaceIds: csvArg('--surfaces'),
    stateKeys: csvArg('--states'),
    viewportIds: csvArg('--viewports'),
    captures: csvArg('--captures'),
  },
});

console.log(JSON.stringify({
  tool: 'audit-image2-layout',
  reportPath,
  summary: report.summary,
}, null, 2));

if (report.failures.length) {
  throw new Error(`Image2 layout gate failed with ${report.failures.length} issue(s). See ${reportPath}`);
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function csvArg(name) {
  const value = readArg(name, '');
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : undefined;
}

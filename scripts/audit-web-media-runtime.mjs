#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveAcceptedMediaCutoverManifest } from './web-media-cutover-plan.mjs';

export async function auditMediaUrls({ manifest, baseUrl, fetchImpl = fetch }) {
  const checks = [];
  const failures = [];
  for (const entry of manifest.entries) {
    const url = new URL(entry.url, baseUrl).toString();
    try {
      const response = await fetchImpl(url, { redirect: 'error' });
      const body = Buffer.from(await response.arrayBuffer());
      const sha256 = createHash('sha256').update(body).digest('hex').toUpperCase();
      const contentType = response.headers.get('content-type') ?? '';
      const cacheControl = response.headers.get('cache-control') ?? '';
      const codes = [];
      if (response.status !== 200) codes.push('status');
      if (body.byteLength !== entry.bytes) codes.push('bytes');
      if (sha256 !== entry.sha256) codes.push('sha256');
      if (!contentType || contentType.includes('text/html')) codes.push('content-type');
      if (entry.url === '/media/tts/manifest.json' && !/no-cache/i.test(cacheControl)) codes.push('manifest-cache');
      if (/^\/media\/(?:home|capability-maps|tts)\//.test(entry.url)
        && entry.url !== '/media/tts/manifest.json'
        && !/immutable/i.test(cacheControl)) codes.push('asset-cache');
      const check = {
        url: entry.url,
        status: response.status,
        bytes: body.byteLength,
        sha256,
        contentType,
        cacheControl,
        passed: codes.length === 0,
        codes,
      };
      checks.push(check);
      if (codes.length) failures.push(check);
    } catch (error) {
      const failure = { url: entry.url, passed: false, codes: ['request-error'], error: error instanceof Error ? error.message : String(error) };
      checks.push(failure);
      failures.push(failure);
    }
  }
  return Object.freeze({
    schema: 'dgbook.web-media-runtime-audit/v1',
    baseUrl: new URL(baseUrl).toString(),
    releaseId: manifest.releaseId,
    expectedFiles: manifest.summary.fileCount,
    expectedBytes: manifest.summary.totalBytes,
    checks,
    failures,
    passed: failures.length === 0 && checks.length === manifest.summary.fileCount,
  });
}

async function main() {
  const repositoryRoot = path.resolve(import.meta.dirname, '..');
  const baseUrl = readArg('--base-url', 'http://127.0.0.1:3157/');
  const out = readArg('--out');
  const accepted = await resolveAcceptedMediaCutoverManifest({ repositoryRoot });
  const report = await auditMediaUrls({ manifest: accepted.manifest, baseUrl });
  if (out) {
    const reportPath = path.join(out, 'report.json');
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ report: reportPath, files: report.checks.length, failures: report.failures.length }, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  if (!report.passed) process.exitCode = 1;
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

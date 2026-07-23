import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { auditMediaUrls } from './audit-web-media-runtime.mjs';
import { buildWebRuntimeMediaContract } from './web-runtime-media-contract.mjs';

const body = Buffer.from('verified media');
const entry = {
  url: '/media/tts/qwen-cherry/verified.wav',
  bytes: body.byteLength,
  sha256: createHash('sha256').update(body).digest('hex').toUpperCase(),
};
const manifest = {
  releaseId: 'runtime-test',
  summary: { fileCount: 1, totalBytes: body.byteLength },
  entries: [entry],
};

test('runtime media manifest is available from tracked source without historical artifacts', () => {
  const trackedManifest = buildWebRuntimeMediaContract();

  assert.equal(trackedManifest.contractId, 'tracked-runtime-media-v1');
  assert.equal(trackedManifest.summary.fileCount, 40);
  assert.equal(trackedManifest.summary.totalBytes, 12_627_129);
  assert.equal(trackedManifest.entries.length, 40);
  assert.ok(trackedManifest.entries.some(({ url }) => url.includes('/p01/')));
  assert.ok(trackedManifest.entries.some(({ url }) => url.includes('/p02/')));
  assert.ok(trackedManifest.entries.some(({ url }) => url.includes('/p03/')));
});

test('runtime media audit requires exact status, bytes, SHA, type and cache semantics', async () => {
  const success = await auditMediaUrls({
    manifest,
    baseUrl: 'http://127.0.0.1:3157/',
    fetchImpl: async () => new Response(body, {
      status: 200,
      headers: { 'content-type': 'audio/wav', 'cache-control': 'public, max-age=31536000, immutable' },
    }),
  });
  assert.equal(success.passed, true);
  assert.equal(success.failures.length, 0);

  const drift = await auditMediaUrls({
    manifest,
    baseUrl: 'http://127.0.0.1:3157/',
    fetchImpl: async () => new Response('wrong', {
      status: 404,
      headers: { 'content-type': 'text/html', 'cache-control': 'no-store' },
    }),
  });
  assert.equal(drift.passed, false);
  assert.deepEqual(drift.failures[0].codes, ['status', 'bytes', 'sha256', 'content-type', 'asset-cache']);
});

test('runtime media audit requires the TTS manifest to revalidate', async () => {
  const manifestBody = Buffer.from('{}');
  const ttsManifest = {
    releaseId: 'manifest-test',
    summary: { fileCount: 1, totalBytes: manifestBody.byteLength },
    entries: [{
      url: '/media/tts/manifest.json',
      bytes: manifestBody.byteLength,
      sha256: createHash('sha256').update(manifestBody).digest('hex').toUpperCase(),
    }],
  };
  const report = await auditMediaUrls({
    manifest: ttsManifest,
    baseUrl: 'http://127.0.0.1:3157/',
    fetchImpl: async () => new Response(manifestBody, {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=31536000, immutable' },
    }),
  });
  assert.equal(report.passed, false);
  assert.deepEqual(report.failures[0].codes, ['manifest-cache']);
});

test('Next public media headers keep immutable assets and revalidate the TTS manifest', async () => {
  const nextConfig = (await import('../apps/web/next.config.mjs')).default;
  const rules = await nextConfig.headers();
  const cacheValue = (source) => rules
    .find((rule) => rule.source === source)
    ?.headers.find((header) => header.key.toLowerCase() === 'cache-control')
    ?.value;

  assert.match(cacheValue('/media/home/:path*'), /max-age=31536000, immutable/u);
  assert.match(cacheValue('/media/capability-maps/:path*'), /max-age=31536000, immutable/u);
  assert.match(cacheValue('/media/tts/:path*'), /max-age=31536000, immutable/u);
  assert.match(cacheValue('/media/tts/manifest.json'), /no-cache, must-revalidate/u);
  assert.equal(rules.at(-1).source, '/media/tts/manifest.json');
});

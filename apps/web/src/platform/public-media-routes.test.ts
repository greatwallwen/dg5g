import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GET as getAvatar } from '../app/avatars/[...path]/route.ts';
import { GET as getCapabilityMap } from '../app/media/capability-maps/[...path]/route.ts';
import { GET as getHomeMedia } from '../app/media/home/[...path]/route.ts';
import { GET as getTtsMedia } from '../app/media/tts/[...path]/route.ts';

const originalCwd = process.cwd();
const repo = mkdtempSync(path.join(tmpdir(), 'dgbook-media-routes-'));
const immutable = 'public, max-age=31536000, immutable';
const manifestRevalidation = 'public, no-cache, must-revalidate';

before(() => {
  writeTarget('home/map.svg', '<svg>home</svg>');
  writeTarget('home/diagram.png', 'png');
  writeTarget('capability-maps/ch1.svg', '<svg>capability</svg>');
  writeTarget('capability-maps/photo.jpeg', 'jpeg');
  writeTarget('tts/voice.wav', 'wav');
  writeTarget('tts/clip.webm', 'webm');
  writeTarget('tts/manifest.json', '{"schema":"tts"}');
  writeTarget('tts/metadata.json', '{"stable":true}');
  write(path.join(repo, 'site', 'public', 'media', 'home', 'legacy.svg'), '<svg>legacy</svg>');
  write(path.join(repo, 'site', 'public', 'avatars', 'teacher.svg'), '<svg>avatar</svg>');
  process.chdir(repo);
});

after(() => {
  process.chdir(originalCwd);
  rmSync(repo, { force: true, recursive: true });
});

test('home and capability-map routes serve exact image content types as immutable assets', async () => {
  await assertAsset(getHomeMedia, ['map.svg'], 'image/svg+xml; charset=utf-8', immutable);
  await assertAsset(getHomeMedia, ['diagram.png'], 'image/png', immutable);
  await assertAsset(getCapabilityMap, ['ch1.svg'], 'image/svg+xml; charset=utf-8', immutable);
  await assertAsset(getCapabilityMap, ['photo.jpeg'], 'image/jpeg', immutable);
});

test('TTS route serves WAV, WebM, and JSON with exact content types', async () => {
  await assertAsset(getTtsMedia, ['voice.wav'], 'audio/wav', immutable);
  await assertAsset(getTtsMedia, ['clip.webm'], 'video/webm', immutable);
  await assertAsset(getTtsMedia, ['metadata.json'], 'application/json; charset=utf-8', immutable);
});

test('manifest responses require revalidation instead of immutable caching', async () => {
  await assertAsset(getTtsMedia, ['manifest.json'], 'application/json; charset=utf-8', manifestRevalidation);
});

test('media routes return 404 for legacy-only and unsafe paths', async () => {
  for (const parts of [
    ['legacy.svg'],
    ['..', 'map.svg'],
    ['%2e%2e', 'map.svg'],
    ['folder/map.svg'],
    ['bad\0name.svg'],
  ]) {
    const response = await getHomeMedia(request(parts), { params: { path: parts } });
    assert.equal(response.status, 404, parts.join('|'));
  }
});

test('avatar route keeps serving its existing asset fallback', async () => {
  const response = await getAvatar(request(['teacher.svg']), { params: { path: ['teacher.svg'] } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/svg+xml; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), immutable);
});

type MediaGet = (
  request: Request,
  context: { params: { path: string[] } },
) => Promise<Response>;

async function assertAsset(
  get: MediaGet,
  parts: string[],
  contentType: string,
  cacheControl: string,
): Promise<void> {
  const response = await get(request(parts), { params: { path: parts } });
  assert.equal(response.status, 200, parts.join('/'));
  assert.equal(response.headers.get('content-type'), contentType);
  assert.equal(response.headers.get('cache-control'), cacheControl);
}

function request(parts: string[]): Request {
  return new Request(`http://dgbook.test/media/${parts.map(encodeURIComponent).join('/')}`);
}

function writeTarget(relative: string, content: string): void {
  write(path.join(repo, 'apps', 'web', 'public', 'media', ...relative.split('/')), content);
}

function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

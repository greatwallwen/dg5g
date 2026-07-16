import assert from 'node:assert/strict';
import { after, afterEach, test } from 'node:test';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolvePublicAssetFile, resolvePublicMediaFile } from './public-media.ts';

const originalCwd = process.cwd();
const temporaryRoots: string[] = [];

afterEach(() => process.chdir(originalCwd));
after(() => {
  process.chdir(originalCwd);
  for (const root of temporaryRoots) rmSync(root, { force: true, recursive: true });
});

test('media resolver reads only apps/web/public/media from repo, app, and standalone cwd', () => {
  const repo = temporaryRoot('cwd');
  const target = path.join(repo, 'apps', 'web', 'public', 'media', 'home', 'map.svg');
  write(target, 'target');

  process.chdir(repo);
  assert.equal(resolvePublicMediaFile('home', ['map.svg']), target);

  process.chdir(path.join(repo, 'apps', 'web'));
  assert.equal(resolvePublicMediaFile('home', ['map.svg']), target);

  const standalone = path.join(repo, 'standalone');
  const standaloneTarget = path.join(standalone, 'apps', 'web', 'public', 'media', 'home', 'map.svg');
  write(standaloneTarget, 'standalone-target');
  process.chdir(standalone);
  assert.equal(resolvePublicMediaFile('home', ['map.svg']), standaloneTarget);
});

test('media resolver never falls back to legacy site media', () => {
  const repo = temporaryRoot('legacy');
  write(path.join(repo, 'site', 'public', 'media', 'home', 'legacy.svg'), 'legacy');
  process.chdir(repo);

  assert.equal(resolvePublicMediaFile('home', ['legacy.svg']), null);
});

test('media resolver rejects traversal, encoded escape, NUL, separators, and absolute input', () => {
  const repo = temporaryRoot('unsafe');
  write(path.join(repo, 'apps', 'web', 'public', 'media', 'home', 'secret.svg'), 'secret');
  process.chdir(repo);

  const unsafeParts = [
    ['..', 'secret.svg'],
    ['folder/../secret.svg'],
    ['folder\\..\\secret.svg'],
    ['%2e%2e', 'secret.svg'],
    ['%252e%252e', 'secret.svg'],
    ['%2fsecret.svg'],
    ['bad\0name.svg'],
    [path.join(repo, 'apps', 'web', 'public', 'media', 'home', 'secret.svg')],
    [''],
  ];

  for (const parts of unsafeParts) {
    assert.doesNotThrow(() => resolvePublicMediaFile('home', parts));
    assert.equal(resolvePublicMediaFile('home', parts), null, parts.join('|'));
  }
  assert.equal(resolvePublicMediaFile('../home', ['secret.svg']), null);
  assert.equal(resolvePublicMediaFile('home/other', ['secret.svg']), null);
});

test('media resolver requires exact casing and rejects case-colliding entries', () => {
  const repo = temporaryRoot('case');
  const home = path.join(repo, 'apps', 'web', 'public', 'media', 'home');
  write(path.join(home, 'Exact.svg'), 'exact');
  process.chdir(repo);

  assert.equal(resolvePublicMediaFile('home', ['Exact.svg']), path.join(home, 'Exact.svg'));
  assert.equal(resolvePublicMediaFile('home', ['exact.svg']), null);

  write(path.join(home, 'Collision.svg'), 'first');
  write(path.join(home, 'collision.svg'), 'second');
  const collisionNames = readdirSync(home).filter((name) => name.toLowerCase() === 'collision.svg');
  if (collisionNames.length > 1) {
    assert.equal(resolvePublicMediaFile('home', ['Collision.svg']), null);
    assert.equal(resolvePublicMediaFile('home', ['collision.svg']), null);
  }
});

test('media resolver rejects directories and reparse or symlink paths', (context) => {
  const repo = temporaryRoot('link');
  const media = path.join(repo, 'apps', 'web', 'public', 'media');
  mkdirSync(path.join(media, 'home', 'directory.svg'), { recursive: true });
  process.chdir(repo);
  assert.equal(resolvePublicMediaFile('home', ['directory.svg']), null);

  const outside = path.join(repo, 'outside');
  write(path.join(outside, 'escaped.svg'), 'outside');
  try {
    symlinkSync(outside, path.join(media, 'home', 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    context.skip(`symlink/junction unavailable: ${String(error)}`);
    return;
  }
  assert.equal(resolvePublicMediaFile('home', ['linked', 'escaped.svg']), null);
});

test('avatar resolver keeps its existing asset fallback', () => {
  const repo = temporaryRoot('avatar');
  const avatar = path.join(repo, 'site', 'public', 'avatars', 'teacher.svg');
  write(avatar, '<svg/>');
  process.chdir(repo);

  assert.equal(resolvePublicAssetFile('avatars', ['teacher.svg']), avatar);
});

function temporaryRoot(label: string): string {
  const root = mkdtempSync(path.join(tmpdir(), `dgbook-media-${label}-`));
  temporaryRoots.push(root);
  return root;
}

function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

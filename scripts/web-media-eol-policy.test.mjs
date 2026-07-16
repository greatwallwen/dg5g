import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '..');

const protectedTextAssets = [
  'apps/web/public/media/home/capability-map-expert-readable-v2.svg',
  'apps/web/public/media/manim/p02/p02-outdoor-site-survey/manifest.json',
  'apps/web/public/media/tts/manifest.json',
];

test('keeps byte-authoritative web media outside Git text conversion and textual diffs', async () => {
  const { stdout } = await execFileAsync(
    'git',
    ['check-attr', 'text', 'diff', '--', ...protectedTextAssets],
    { cwd: repositoryRoot },
  );

  const attributes = new Map();
  for (const line of stdout.trim().split(/\r?\n/u)) {
    const [file, attribute, value] = line.split(': ');
    attributes.set(`${file}:${attribute}`, value);
  }

  for (const file of protectedTextAssets) {
    assert.equal(attributes.get(`${file}:text`), 'unset', `${file} must be declared -text`);
    assert.equal(attributes.get(`${file}:diff`), 'unset', `${file} must be declared -diff`);
  }
});

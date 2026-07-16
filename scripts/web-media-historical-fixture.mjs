import { copyFile, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const sourceRepositoryRoot = path.resolve(import.meta.dirname, '..');
const protectedMediaRoot = path.join(sourceRepositoryRoot, 'apps', 'web', 'public', 'media');
const authoritativeInputs = [
  'textbook/5g/generated/p1-demo-content.json',
  'apps/web/src/features/textbook-scene/learning-playback.ts',
];
const historicalTargetFiles = [
  ['5g/p01-n02-topology-stage-v1.png', 1_650_087],
  ['tts/qwen-cherry/p01-story-speech-006.wav', 572_204],
  ['tts/qwen-cherry/p01-story-speech-011.wav', 453_164],
  ['tts/qwen-cherry/p01-story-speech-012.wav', 422_444],
  ['tts/qwen-cherry/p01-story-speech-013.wav', 483_884],
  ['tts/qwen-cherry/p01-story-speech-014.wav', 364_844],
  ['tts/qwen-cherry/p01-story-speech-016.wav', 541_484],
  ['tts/qwen-cherry/p01-story-speech-021.wav', 464_684],
  ['tts/qwen-cherry/p01-story-speech-023.wav', 541_484],
];

export async function createHistoricalMediaRepositoryFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'dgbook-media-history-'));
  const repositoryRoot = path.join(root, 'repo');
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    await rm(root, { recursive: true, force: true });
  };

  try {
    await mkdir(repositoryRoot, { recursive: true });
    await cp(
      protectedMediaRoot,
      path.join(repositoryRoot, 'site', 'public', 'media'),
      { recursive: true, force: false, errorOnExist: true },
    );
    for (const relativePath of authoritativeInputs) {
      await copyRelative(
        path.join(sourceRepositoryRoot, ...relativePath.split('/')),
        path.join(repositoryRoot, ...relativePath.split('/')),
      );
    }
    for (const [index, [relativePath, bytes]] of historicalTargetFiles.entries()) {
      const target = path.join(repositoryRoot, 'apps', 'web', 'public', 'media', ...relativePath.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      if (relativePath === '5g/p01-n02-topology-stage-v1.png') {
        await copyFile(path.join(protectedMediaRoot, ...relativePath.split('/')), target);
      } else {
        await writeFile(target, Buffer.alloc(bytes, index + 1));
      }
    }
    return Object.freeze({ root, repositoryRoot, cleanup });
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export async function withHistoricalMediaRepositoryFixture(callback) {
  const fixture = await createHistoricalMediaRepositoryFixture();
  try {
    return await callback(fixture);
  } finally {
    await fixture.cleanup();
  }
}

async function copyRelative(source, target) {
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}

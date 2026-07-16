import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createDemoTaskProfiles, getDemoUnitForNode } from '@/features/platform/deep-textbook-demo-data.ts';
import { loadSelfStudyCatalog } from '@/features/textbook-scene/self-study-content.ts';
import { playbackSceneForLearningUnit } from '@/features/textbook-scene/learning-playback.ts';
import type { PlaybackScene, SpeechAudioManifest } from './models.ts';
import { withManifestAudioUrls } from './audio-manifest-adapter.ts';
import { playbackSceneForSession } from './fixtures/session-fixtures.ts';

test('binds a matching Qwen manifest item only when its target audio file exists', () => {
  const spokenText = '当前讲稿正文';
  const scene = speechScene('P01-stage-speech-001', spokenText);
  const manifest = manifestFor('P01-stage-speech-001', spokenText, '/media/tts/qwen-cherry/p01-stage-speech-001.wav');

  const result = withManifestAudioUrls(scene, {
    manifest,
    resolveFile: (parts) => parts.join('/') === 'qwen-cherry/p01-stage-speech-001.wav'
      ? 'C:/target/media/tts/qwen-cherry/p01-stage-speech-001.wav'
      : null,
  });

  assert.equal(result.actions[0]?.audioUrl, '/media/tts/qwen-cherry/p01-stage-speech-001.wav');
});

test('leaves audio unbound when the current spoken text does not match the manifest', () => {
  const scene = speechScene('P01-stage-speech-001', '已经更新的教师讲稿');
  const manifest = manifestFor('P01-stage-speech-001', '旧教师讲稿', '/media/tts/qwen-cherry/p01-stage-speech-001.wav');

  const result = withManifestAudioUrls(scene, {
    manifest,
    resolveFile: () => 'C:/target/media/tts/qwen-cherry/p01-stage-speech-001.wav',
  });

  assert.equal(result.actions[0]?.audioUrl, undefined);
});

test('leaves audio unbound when the manifest URL has no physical target file', () => {
  const spokenText = '正文相同但文件尚未进入目标闭包';
  const scene = speechScene('P01-stage-speech-001', spokenText);
  const manifest = manifestFor('P01-stage-speech-001', spokenText, '/media/tts/qwen-cherry/p01-stage-speech-001.wav');

  const result = withManifestAudioUrls(scene, { manifest, resolveFile: () => null });

  assert.equal(result.actions[0]?.audioUrl, undefined);
});

test('rejects manifest URLs that can escape or disguise the TTS media root', () => {
  const spokenText = '路径也必须进入安全闭包';
  for (const url of [
    '/media/tts/../private.wav',
    '/media/tts/qwen-cherry\\escape.wav',
    '/media/tts/%2e%2e/private.wav',
    '/media/tts/qwen-cherry/%2fescape.wav',
    '/media/tts/qwen-cherry/bad\0.wav',
  ]) {
    let resolutionAttempts = 0;
    const result = withManifestAudioUrls(
      speechScene('P01-stage-speech-001', spokenText),
      {
        manifest: manifestFor('P01-stage-speech-001', spokenText, url),
        resolveFile: () => {
          resolutionAttempts += 1;
          return 'C:/target/media/tts/file.wav';
        },
      },
    );

    assert.equal(result.actions[0]?.audioUrl, undefined, url);
    assert.equal(resolutionAttempts, 0, url);
  }
});

test('does not bind non-Qwen manifest audio even when its text and file match', () => {
  const spokenText = '仅允许当前批准的 Qwen 提供方';
  const manifest = manifestFor('P01-stage-speech-001', spokenText, '/media/tts/qwen-cherry/p01-stage-speech-001.wav');
  manifest.items['P01-stage-speech-001']!.providerId = 'kokoro-tts';

  const result = withManifestAudioUrls(speechScene('P01-stage-speech-001', spokenText), {
    manifest,
    resolveFile: () => 'C:/target/media/tts/qwen-cherry/p01-stage-speech-001.wav',
  });

  assert.equal(result.actions[0]?.audioUrl, undefined);
});

test('keeps all fifteen current teacher actions on browser fallback', () => {
  const manifest = authoritativeManifest();
  let speechCount = 0;
  let boundCount = 0;

  for (const nodeId of ['P1T1-N02', 'P1T2-N02', 'P1T3-N02']) {
    const result = withManifestAudioUrls(playbackSceneForSession(nodeId), {
      manifest,
      resolveFile: resolveTargetTtsFile,
    });
    const speechActions = result.actions.filter((action) => action.type === 'speech');
    speechCount += speechActions.length;
    boundCount += speechActions.filter((action) => action.audioUrl).length;
  }

  assert.equal(speechCount, 15);
  assert.equal(boundCount, 0);
});

test('proves all six P01 N02 self-study tracks match the manifest and physical target', () => {
  const manifest = authoritativeManifest();
  const profiles = createDemoTaskProfiles(loadSelfStudyCatalog());
  const unit = getDemoUnitForNode('P1T1-N02', profiles);
  assert.ok(unit);
  const speechActions = playbackSceneForLearningUnit(unit, 'P01').actions.filter((action) => action.type === 'speech');

  assert.equal(speechActions.length, 6);
  for (const action of speechActions) {
    assert.ok(action.audioId);
    assert.ok(action.audioUrl);
    const item = manifest.items[action.audioId];
    assert.ok(item, action.audioId);
    assert.equal(item.providerId, 'qwen-tts', action.audioId);
    assert.equal(item.textHash, textHash(action.spokenText ?? ''), action.audioId);
    assert.equal(action.audioUrl, item.url, action.audioId);
    assert.ok(resolveTargetTtsFile(ttsParts(item.url)), action.audioId);
  }
});

function speechScene(audioId: string, spokenText: string): PlaybackScene {
  return {
    sceneId: 'P1T1-N02-playback',
    title: '课堂讲授',
    actions: [{ id: 'speech-action', type: 'speech', audioId, spokenText }],
  };
}

function manifestFor(audioId: string, spokenText: string, url: string): SpeechAudioManifest {
  return {
    version: 1,
    generatedAt: '2026-07-16T00:00:00.000Z',
    items: {
      [audioId]: {
        audioId,
        url,
        providerId: 'qwen-tts',
        voice: 'Cherry',
        modelId: 'qwen3-tts-flash',
        textHash: textHash(spokenText),
      },
    },
  };
}

function textHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function authoritativeManifest(): SpeechAudioManifest {
  return JSON.parse(readFileSync('apps/web/public/media/tts/manifest.json', 'utf8')) as SpeechAudioManifest;
}

function resolveTargetTtsFile(parts: string[]): string | null {
  const candidate = path.join(process.cwd(), 'apps', 'web', 'public', 'media', 'tts', ...parts);
  return existsSync(candidate) ? candidate : null;
}

function ttsParts(url: string): string[] {
  return url.slice('/media/tts/'.length).split('/');
}

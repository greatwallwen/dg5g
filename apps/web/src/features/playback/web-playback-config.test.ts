import assert from 'node:assert/strict';
import test from 'node:test';
import { webAudioDeliveryPolicy, webTtsConfig, webTtsCredentialEnv } from './web-playback-config.ts';

test('keeps the fixed lecturer on the registered narration playback path with static audio first', () => {
  assert.equal(webAudioDeliveryPolicy, 'pregenerated-first');
  assert.equal(webTtsCredentialEnv, 'TTS_QWEN_API_KEY');
  assert.deepEqual(webTtsConfig, {
    providerId: 'qwen-tts',
    modelId: 'qwen3-tts-flash',
    voice: 'Cherry',
    responseFormat: 'wav',
    fallbackProviderId: 'browser-native-tts',
  });
});

import type { RuntimeTTSProviderId, TeachingPresenter } from '@dgbook/animation';

export const webTtsProviderId: RuntimeTTSProviderId = 'qwen-tts';
export const webAudioDeliveryPolicy = 'pregenerated-first' as const;
export const webTtsCredentialEnv = 'TTS_QWEN_API_KEY' as const;
export const webTtsConfig = {
  providerId: webTtsProviderId,
  modelId: 'qwen3-tts-flash',
  voice: 'Cherry',
  responseFormat: 'wav',
  fallbackProviderId: 'browser-native-tts',
} as const;

export const webPresenter: TeachingPresenter = {
  id: 'teacher-zhang',
  name: '张老师',
  role: 'teacher',
  title: '5G网优实训导师',
  avatarUrl: '/avatars/teacher-zhang-v1.png',
  avatar: '/avatars/teacher-zhang-v1.png',
  avatarKind: 'preset',
  color: '#0891b2',
  language: 'zh-CN',
  lang: 'zh-CN',
  voiceProfileId: 'qwen-tts',
  voicePrompt: '清晰、自然、偏工程现场讲解的中文声音。',
};

import type {
  RuntimeTTSConfig,
  RuntimeTTSProviderId,
  SpeechGenerationRequest,
  SpeechGenerationResult,
  SpeechProviderConfig,
  VoxCPMBackend,
} from './types';

export const SPEECH_PROVIDERS: Record<RuntimeTTSProviderId, SpeechProviderConfig> = {
  'qwen-tts': {
    id: 'qwen-tts',
    label: 'Qwen3 TTS Flash',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    defaultModelId: 'qwen3-tts-flash',
    defaultVoice: 'Cherry',
    defaultResponseFormat: 'wav',
    supportsLivePreview: true,
  },
  'voxcpm-tts': {
    id: 'voxcpm-tts',
    label: 'VoxCPM2 Local',
    defaultBaseUrl: 'http://127.0.0.1:8000/v1',
    defaultModelId: 'voxcpm2',
    defaultVoice: 'voxcpm:auto',
    defaultResponseFormat: 'wav',
    supportsLivePreview: true,
    supportsReferenceAudio: true,
    supportsVoicePrompt: true,
  },
  'kokoro-tts': {
    id: 'kokoro-tts',
    label: 'Kokoro Local',
    defaultBaseUrl: 'http://127.0.0.1:8880/v1',
    defaultModelId: 'kokoro',
    defaultVoice: 'zf_xiaoxiao',
    defaultResponseFormat: 'mp3',
    supportsLivePreview: true,
  },
  'custom-openai-compatible-tts': {
    id: 'custom-openai-compatible-tts',
    label: 'OpenAI Compatible',
    defaultModelId: 'tts-1',
    defaultVoice: 'alloy',
    defaultResponseFormat: 'mp3',
    supportsLivePreview: true,
  },
  'browser-native-tts': {
    id: 'browser-native-tts',
    label: 'Browser Native',
    defaultVoice: 'default',
    supportsLivePreview: false,
  },
};

export function normalizeRuntimeTTSConfig(config?: Partial<RuntimeTTSConfig>): RuntimeTTSConfig {
  const providerId = config?.providerId ?? 'qwen-tts';
  const provider = SPEECH_PROVIDERS[providerId];
  return {
    providerId,
    baseUrl: config?.baseUrl ?? provider.defaultBaseUrl,
    modelId: config?.modelId ?? provider.defaultModelId,
    voice: config?.voice ?? provider.defaultVoice,
    speed: config?.speed ?? 1,
    apiKey: config?.apiKey,
    responseFormat: config?.responseFormat ?? provider.defaultResponseFormat,
    fallbackProviderId: config?.fallbackProviderId ?? 'browser-native-tts',
    providerOptions: config?.providerOptions,
  };
}

export function providerDefaultModel(providerId: RuntimeTTSProviderId): string {
  return SPEECH_PROVIDERS[providerId].defaultModelId ?? 'tts-1';
}

export function providerDefaultVoice(providerId: RuntimeTTSProviderId): string {
  return SPEECH_PROVIDERS[providerId].defaultVoice ?? 'default';
}

export function providerDefaultBaseUrl(providerId: RuntimeTTSProviderId): string {
  return SPEECH_PROVIDERS[providerId].defaultBaseUrl ?? '';
}

export function resolveSpeechEndpoint(config: RuntimeTTSConfig): string {
  const baseUrl = (config.baseUrl ?? providerDefaultBaseUrl(config.providerId)).replace(/\/+$/, '');
  if (!baseUrl) throw new Error('TTS baseUrl is required');
  if (config.providerId === 'qwen-tts') return resolveQwenEndpoint(baseUrl);
  if (config.providerId === 'voxcpm-tts') {
    const backend = normalizeVoxCPMBackend(config.providerOptions?.backend);
    if (backend === 'python-api') return `${stripV1(baseUrl)}/tts/upload`;
    if (backend === 'nano-vllm') return `${stripV1(baseUrl)}/generate`;
    return `${ensureV1(baseUrl)}/audio/speech`;
  }
  return `${ensureV1(baseUrl)}/audio/speech`;
}

export function getVoxCPMProfileVoiceId(profileId: string): string {
  return `voxcpm:profile:${profileId}`;
}

export function getVoxCPMProfileIdFromVoiceId(voiceId: string): string | null {
  return voiceId.startsWith('voxcpm:profile:') ? voiceId.slice('voxcpm:profile:'.length) : null;
}

export function buildAutoVoxCPMVoicePrompt(context: {
  presenterName?: string;
  role?: string;
  voicePrompt?: string;
  language?: string;
} = {}): string {
  const prompt = sanitizeVoicePrompt(context.voicePrompt);
  if (prompt) return prompt;
  const fallback = [context.role, context.presenterName, context.language]
    .map(sanitizeVoicePrompt)
    .filter(Boolean)
    .join(' ');
  return sanitizeVoicePrompt(fallback) || 'natural classroom voice';
}

export async function generateSpeechAudio(
  request: SpeechGenerationRequest,
): Promise<SpeechGenerationResult> {
  const config = normalizeRuntimeTTSConfig(request);
  const audioId = request.audioId ?? `speech_${Date.now()}`;
  if (config.providerId === 'browser-native-tts') {
    return { providerId: config.providerId, audioId, browserNative: true };
  }
  if (config.providerId === 'qwen-tts') {
    return generateQwenSpeechAudio(request, config, audioId);
  }

  const response = await fetch(resolveSpeechEndpoint(config), await buildFetchInit(request, config));
  if (!response.ok) {
    throw new Error(`TTS request failed: ${response.status} ${await response.text().catch(() => '')}`.trim());
  }

  const requestedFormat = config.responseFormat ?? SPEECH_PROVIDERS[config.providerId].defaultResponseFormat ?? 'mp3';
  const mimeType = response.headers.get('content-type') ?? mimeFromFormat(requestedFormat);
  const format = formatFromMime(mimeType, requestedFormat);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    providerId: config.providerId,
    audioId,
    base64: bytesToBase64(bytes),
    mimeType,
    format,
  };
}

async function buildFetchInit(
  request: SpeechGenerationRequest,
  config: RuntimeTTSConfig,
): Promise<RequestInit> {
  const headers: Record<string, string> = {};
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  if (config.providerId === 'qwen-tts') {
    if (!config.apiKey) throw new Error('DashScope API key is required for qwen-tts');
    const speed = request.speed ?? config.speed ?? 1;
    const rate = Math.max(-500, Math.min(500, Math.round((speed - 1) * 500)));
    headers['Content-Type'] = 'application/json; charset=utf-8';
    if (config.providerOptions?.sse !== false) headers['X-DashScope-SSE'] = 'enable';
    const body: Record<string, unknown> = {
      model: request.modelId ?? config.modelId ?? providerDefaultModel(config.providerId),
      input: {
        text: request.text,
        voice: normalizeQwenVoice(request.voice ?? config.voice),
        language_type: String(config.providerOptions?.languageType ?? 'Chinese'),
      },
    };
    if (rate !== 0) body.parameters = { rate };
    return { method: 'POST', headers, body: JSON.stringify(body) };
  }

  if (config.providerId === 'voxcpm-tts') {
    const backend = normalizeVoxCPMBackend(config.providerOptions?.backend);
    const targetText = buildVoxCPMTargetText(request.text, config);
    const referenceAudio = config.providerOptions?.referenceAudioBase64
      ? toVoxCPMDataAudioUrl(
          config.providerOptions.referenceAudioBase64,
          config.providerOptions.referenceAudioMimeType,
          config.providerOptions.referenceAudioName,
        )
      : undefined;
    if (backend === 'python-api') {
      const form = new FormData();
      form.set('text', targetText);
      form.set('cfg_value', String(config.providerOptions?.cfgValue ?? 2));
      form.set('inference_timesteps', String(config.providerOptions?.inferenceTimesteps ?? 10));
      form.set('normalize', String(config.providerOptions?.normalize ?? false));
      form.set('denoise', String(config.providerOptions?.denoise ?? false));
      if (config.providerOptions?.referenceAudioBase64) {
        const blob = base64ToBlob(
          config.providerOptions.referenceAudioBase64,
          config.providerOptions.referenceAudioMimeType ?? 'audio/wav',
        );
        const fileName = config.providerOptions.referenceAudioName ?? 'reference.wav';
        form.set('reference_audio', blob, fileName);
        if (config.providerOptions.promptText?.trim()) {
          form.set('prompt_audio', blob, fileName);
          form.set('prompt_text', config.providerOptions.promptText.trim());
        }
      }
      return { method: 'POST', headers, body: form };
    }

    if (backend === 'nano-vllm') {
      headers['Content-Type'] = 'application/json';
      return {
        method: 'POST',
        headers,
        body: JSON.stringify({
          target_text: targetText,
          cfg_value: config.providerOptions?.cfgValue ?? 2,
          prompt_text: config.providerOptions?.promptText?.trim() || undefined,
          ref_audio_wav_base64: config.providerOptions?.referenceAudioBase64,
          ref_audio_wav_format: getVoxCPMAudioFormat(config.providerOptions?.referenceAudioMimeType, config.providerOptions?.referenceAudioName),
          prompt_wav_base64: config.providerOptions?.promptText ? config.providerOptions.referenceAudioBase64 : undefined,
          prompt_wav_format: config.providerOptions?.promptText ? getVoxCPMAudioFormat(config.providerOptions?.referenceAudioMimeType, config.providerOptions?.referenceAudioName) : undefined,
        }),
      };
    }

    headers['Content-Type'] = 'application/json; charset=utf-8';
    const payload: Record<string, unknown> = {
      model: request.modelId ?? config.modelId ?? providerDefaultModel(config.providerId),
      input: targetText,
      voice: 'default',
      response_format: request.responseFormat ?? config.responseFormat ?? 'wav',
      stream: false,
    };
    if (referenceAudio) {
      payload.ref_audio = referenceAudio;
      if (config.providerOptions?.promptText?.trim()) {
        payload.prompt_audio = referenceAudio;
        payload.prompt_text = config.providerOptions.promptText.trim();
      }
    }
    return { method: 'POST', headers, body: JSON.stringify(payload) };
  }

  headers['Content-Type'] = 'application/json; charset=utf-8';
  const body: Record<string, unknown> = {
    model: request.modelId ?? config.modelId ?? providerDefaultModel(config.providerId),
    voice: request.voice ?? config.voice ?? providerDefaultVoice(config.providerId),
    input: request.text,
    speed: request.speed ?? config.speed ?? 1,
    response_format: request.responseFormat ?? config.responseFormat ?? 'mp3',
    stream: false,
  };
  return { method: 'POST', headers, body: JSON.stringify(body) };
}

async function generateQwenSpeechAudio(
  request: SpeechGenerationRequest,
  config: RuntimeTTSConfig,
  audioId: string,
): Promise<SpeechGenerationResult> {
  const response = await fetch(resolveSpeechEndpoint(config), await buildFetchInit(request, config));
  if (!response.ok) {
    throw new Error(`Qwen TTS request failed: ${response.status} ${await response.text().catch(() => '')}`.trim());
  }

  const responseText = await response.text();
  const packets = parseQwenResponsePackets(responseText);
  const audioUrl = findQwenAudioUrl(packets);
  if (audioUrl) {
    const audioResponse = await fetch(audioUrl, { signal: AbortSignal.timeout(180000) });
    if (!audioResponse.ok) {
      throw new Error(`Qwen TTS audio download failed: ${audioResponse.status} ${audioResponse.statusText}`);
    }
    const requestedFormat = config.responseFormat ?? 'wav';
    const mimeType = audioResponse.headers.get('content-type') ?? mimeFromFormat(requestedFormat);
    const downloadedBytes = new Uint8Array(await audioResponse.arrayBuffer());
    const format = formatFromMimeOrUrl(mimeType, audioUrl, requestedFormat);
    const bytes = format === 'wav' ? repairWavHeader(downloadedBytes) : downloadedBytes;
    return {
      providerId: config.providerId,
      audioId,
      base64: bytesToBase64(bytes),
      mimeType,
      format,
    };
  }

  const pcmChunks = findQwenAudioData(packets);
  if (pcmChunks.length > 0) {
    const bytes = wavFromPcm16Base64Chunks(pcmChunks, 24000);
    return {
      providerId: config.providerId,
      audioId,
      base64: bytesToBase64(bytes),
      mimeType: 'audio/wav',
      format: 'wav',
    };
  }

  throw new Error(`Qwen TTS response did not include audio data: ${responseText.slice(0, 500)}`);
}

function buildVoxCPMTargetText(text: string, config: RuntimeTTSConfig): string {
  const usePromptContinuation = Boolean(config.providerOptions?.promptText?.trim() && config.providerOptions?.referenceAudioBase64);
  if (usePromptContinuation) return text;
  const prompt = sanitizeVoicePrompt(
    config.providerOptions?.voicePrompt ||
      (config.voice && config.voice !== 'default' && config.voice !== 'voxcpm:auto' ? config.voice : ''),
  );
  return prompt ? `(${prompt})${text}` : text;
}

function normalizeVoxCPMBackend(value: unknown): VoxCPMBackend {
  return value === 'python-api' || value === 'nano-vllm' || value === 'vllm-omni'
    ? value
    : 'vllm-omni';
}

function ensureV1(baseUrl: string): string {
  return /\/v1$/i.test(baseUrl) ? baseUrl : `${baseUrl}/v1`;
}

function stripV1(baseUrl: string): string {
  return baseUrl.replace(/\/v1$/i, '');
}

function resolveQwenEndpoint(baseUrl: string): string {
  if (/\/services\/aigc\/multimodal-generation\/generation$/i.test(baseUrl)) return baseUrl;
  if (/\/api\/v1$/i.test(baseUrl)) return `${baseUrl}/services/aigc/multimodal-generation/generation`;
  if (/\/api$/i.test(baseUrl)) return `${baseUrl}/v1/services/aigc/multimodal-generation/generation`;
  return `${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`;
}

function mimeFromFormat(format: RuntimeTTSConfig['responseFormat']): string {
  if (format === 'wav') return 'audio/wav';
  if (format === 'opus') return 'audio/opus';
  if (format === 'aac') return 'audio/aac';
  if (format === 'flac') return 'audio/flac';
  return 'audio/mpeg';
}

function formatFromMime(mimeType: string, fallback: RuntimeTTSConfig['responseFormat']): RuntimeTTSConfig['responseFormat'] {
  if (mimeType.includes('audio/wav') || mimeType.includes('audio/x-wav')) return 'wav';
  if (mimeType.includes('audio/opus')) return 'opus';
  if (mimeType.includes('audio/aac')) return 'aac';
  if (mimeType.includes('audio/flac')) return 'flac';
  return fallback ?? 'mp3';
}

function formatFromMimeOrUrl(
  mimeType: string,
  url: string,
  fallback: RuntimeTTSConfig['responseFormat'],
): RuntimeTTSConfig['responseFormat'] {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('.wav')) return 'wav';
  if (lowerUrl.includes('.mp3')) return 'mp3';
  if (lowerUrl.includes('.flac')) return 'flac';
  if (lowerUrl.includes('.opus')) return 'opus';
  if (lowerUrl.includes('.aac')) return 'aac';
  return formatFromMime(mimeType, fallback);
}

function normalizeQwenVoice(value?: string): string {
  const voice = (value || '').trim();
  if (!voice || voice.startsWith('voxcpm:') || voice.startsWith('kokoro:')) return 'Cherry';
  if (voice.startsWith('qwen:')) return voice.slice('qwen:'.length) || 'Cherry';
  return voice;
}

function parseQwenResponsePackets(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{')) return [JSON.parse(trimmed)];

  const packets: unknown[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const data = line.trim().replace(/^data:\s*/i, '');
    if (!data || data === '[DONE]' || data === line.trim()) continue;
    try {
      packets.push(JSON.parse(data));
    } catch {
      // DashScope may send keepalive/comment lines in SSE mode.
    }
  }
  return packets;
}

function findQwenAudioUrl(packets: unknown[]): string | null {
  for (let i = packets.length - 1; i >= 0; i--) {
    const output = objectValue(packets[i], 'output');
    const audio = objectValue(output, 'audio');
    const url = stringValue(audio, 'url') || stringValue(output, 'audio_url');
    if (url) return url;
  }
  return null;
}

function findQwenAudioData(packets: unknown[]): string[] {
  const chunks: string[] = [];
  for (const packet of packets) {
    const output = objectValue(packet, 'output');
    const audio = objectValue(output, 'audio');
    const data = stringValue(audio, 'data') || stringValue(output, 'audio_data');
    if (data) chunks.push(data);
  }
  return chunks;
}

function objectValue(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  const next = (value as Record<string, unknown>)[key];
  return next && typeof next === 'object' ? next as Record<string, unknown> : null;
}

function stringValue(value: unknown, key: string): string {
  if (!value || typeof value !== 'object') return '';
  const next = (value as Record<string, unknown>)[key];
  return typeof next === 'string' ? next : '';
}

function wavFromPcm16Base64Chunks(chunks: string[], sampleRate: number): Uint8Array {
  const pcmParts = chunks.map(base64ToBytes);
  const pcmLength = pcmParts.reduce((total, part) => total + part.length, 0);
  const wav = new Uint8Array(44 + pcmLength);
  const view = new DataView(wav.buffer);
  writeAscii(wav, 0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true);
  writeAscii(wav, 8, 'WAVE');
  writeAscii(wav, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(wav, 36, 'data');
  view.setUint32(40, pcmLength, true);
  let offset = 44;
  for (const part of pcmParts) {
    wav.set(part, offset);
    offset += part.length;
  }
  return wav;
}

function repairWavHeader(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 44) return bytes;
  if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 12) !== 'WAVE') return bytes;
  if (readAscii(bytes, 36, 40) !== 'data') return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const riffSize = bytes.length - 8;
  const dataSize = bytes.length - 44;
  if (view.getUint32(4, true) === riffSize && view.getUint32(40, true) === dataSize) return bytes;
  const fixed = new Uint8Array(bytes);
  const fixedView = new DataView(fixed.buffer);
  fixedView.setUint32(4, riffSize, true);
  fixedView.setUint32(40, dataSize, true);
  return fixed;
}

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  let text = '';
  for (let index = start; index < end; index++) text += String.fromCharCode(bytes[index] ?? 0);
  return text;
}

function writeAscii(bytes: Uint8Array, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
}

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getVoxCPMAudioFormat(mimeType?: string, fileName?: string): string {
  const name = fileName?.toLowerCase() ?? '';
  if (mimeType?.includes('wav') || name.endsWith('.wav')) return 'wav';
  if (mimeType?.includes('mpeg') || mimeType?.includes('mp3') || name.endsWith('.mp3')) return 'mp3';
  if (mimeType?.includes('flac') || name.endsWith('.flac')) return 'flac';
  if (mimeType?.includes('ogg') || name.endsWith('.ogg')) return 'ogg';
  if (mimeType?.includes('webm') || name.endsWith('.webm')) return 'webm';
  return 'wav';
}

function toVoxCPMDataAudioUrl(base64: string, mimeType?: string, fileName?: string): string {
  if (base64.startsWith('data:audio/')) return base64;
  const format = getVoxCPMAudioFormat(mimeType, fileName);
  const mediaType = mimeType?.trim() ||
    (format === 'mp3' ? 'audio/mpeg'
      : format === 'flac' ? 'audio/flac'
        : format === 'ogg' ? 'audio/ogg'
          : format === 'webm' ? 'audio/webm'
            : 'audio/wav');
  return `data:${mediaType};base64,${base64}`;
}

function sanitizeVoicePrompt(value?: string): string {
  return (value || '')
    .replace(/[\p{C}]+/gu, ' ')
    .replace(/[()\uFF08\uFF09]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 200)
    .trim();
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const clean = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

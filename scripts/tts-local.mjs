#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { normalizeSpeechText } from './tts-normalizer.mjs';
import { textbookOutput } from './textbook-paths.mjs';

const root = process.cwd();
const command = process.argv[2] ?? 'help';
const args = process.argv.slice(3);
const kokoroGpuImage = 'ghcr.io/remsky/kokoro-fastapi-gpu:v0.3.0';
const kokoroCpuImage = 'ghcr.io/remsky/kokoro-fastapi-cpu:v0.3.0';
const runtimeDir = path.join(root, 'runtime', 'tts');
const sampleDir = path.join(runtimeDir, 'samples');
const voiceProfileDir = path.join(root, 'runtime', 'voice-profiles');
const voxcpmModelDir = path.join(runtimeDir, 'models', 'VoxCPM2');
const ttsPublicDir = path.join(root, 'site', 'public', 'media', 'tts');
const manifestPath = path.join(ttsPublicDir, 'manifest.json');
const qwenBaseUrl = 'https://dashscope.aliyuncs.com/api/v1';
const qwenTimeoutMs = Number(valueAfter('--timeout-ms') ?? 10 * 60 * 1000);
const qwenRetries = Math.max(1, Number(valueAfter('--retries') ?? 2));

if (command === 'setup') await setup();
else if (command === 'start') await start();
else if (command === 'health') await health(true);
else if (command === 'sample') await sample();
else if (command === 'clone') await cloneSample();
else if (command === 'build') await build();
else printHelp();

async function setup() {
  await mkdir(sampleDir, { recursive: true });
  await mkdir(ttsPublicDir, { recursive: true });
  await writeFile(path.join(runtimeDir, 'voxcpm-requirements.txt'), requirements(), 'utf-8');
  await ensureManifest();
  console.log('DGBook TTS runtime directories are ready.');
  if (hasDocker()) {
    const gpu = run('docker', ['pull', kokoroGpuImage], { allowFail: true, timeout: 30 * 60 * 1000 });
    if (gpu.status !== 0) run('docker', ['pull', kokoroCpuImage], { allowFail: true, timeout: 30 * 60 * 1000 });
  }
  await setupVoxCpmEnv();
  downloadVoxCpmModel();
}

async function start() {
  await mkdir(runtimeDir, { recursive: true });
  if (hasDocker() && !(await serviceOk('http://127.0.0.1:8880/v1/models'))) startKokoro();
  if (!(await serviceOk('http://127.0.0.1:8000/health'))) startVoxCpm();
  await wait(2500);
  await health(true);
}

async function health(print = false) {
  const provider = valueAfter('--provider') ? normalizeProvider(valueAfter('--provider')) : null;
  const cloudOnly = provider === 'qwen' || args.includes('--cloud-only');
  const items = cloudOnly
    ? [await checkQwen()]
    : [
        await check('kokoro', 'http://127.0.0.1:8880/v1/models'),
        await check('voxcpm', 'http://127.0.0.1:8000/health'),
      ];
  if (!cloudOnly && (dashScopeApiKey() || args.includes('--include-cloud'))) items.push(await checkQwen());
  if (print) {
    for (const item of items) console.log(`${item.ok ? 'OK' : 'FAIL'} ${item.name}: ${item.message}`);
  }
  if (items.some((item) => !item.ok)) process.exitCode = 1;
  return items;
}

async function sample() {
  await mkdir(sampleDir, { recursive: true });
  const text = valueAfter('--text') ?? 'DGBook local text to speech sample.';
  const provider = normalizeProvider(valueAfter('--provider') ?? defaultBuildProvider());
  const reference = valueAfter('--reference');
  const result = await requestSpeech(provider, {
    text,
    audioId: `sample-${provider}`,
    voice: valueAfter('--voice'),
    voicePrompt: valueAfter('--prompt'),
    ...(reference ? await referencePayload(reference) : {}),
  });
  const file = path.join(sampleDir, `${provider}-sample.${result.format}`);
  await writeFile(file, result.buffer);
  console.log(`Sample written: ${file}`);
}

async function cloneSample() {
  await mkdir(sampleDir, { recursive: true });
  await mkdir(voiceProfileDir, { recursive: true });
  const reference = valueAfter('--reference') ?? path.join(sampleDir, 'voxcpm-sample.wav');
  if (!existsSync(reference)) throw new Error(`Reference audio not found: ${reference}`);
  validateReferenceAudio(reference);

  const id = safeId(valueAfter('--id') ?? 'dgbook-clone-test');
  const name = valueAfter('--name') ?? 'DGBook cloned presenter';
  const prompt = valueAfter('--prompt') ?? 'clear, natural, steady Chinese engineering teacher voice';
  const text = valueAfter('--text') ?? 'This is a DGBook local voice clone sample generated from the reference audio.';
  const payload = await referencePayload(reference);
  const now = new Date().toISOString();
  const profile = {
    id,
    providerId: 'voxcpm-tts',
    kind: 'clone',
    name,
    voiceId: `voxcpm:profile:${id}`,
    voicePrompt: prompt,
    promptText: '',
    referenceAudioName: path.basename(reference),
    referenceAudioMimeType: payload.referenceAudioMimeType,
    referenceAudioBase64: payload.referenceAudioBase64,
    createdAt: now,
    updatedAt: now,
  };
  const profilePath = path.join(voiceProfileDir, `${id}.json`);
  await writeFile(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf-8');

  const result = await requestSpeech('voxcpm', {
    text,
    audioId: `clone-${id}`,
    voice: profile.voiceId,
    voicePrompt: prompt,
    ...payload,
  });
  const file = path.join(sampleDir, `${id}-clone.${result.format}`);
  await writeFile(file, result.buffer);
  console.log(`Voice profile written: ${profilePath}`);
  console.log(`Clone sample written: ${file}`);
}

async function build() {
  const project = valueAfter('--project');
  const provider = normalizeProvider(valueAfter('--provider') ?? defaultBuildProvider());
  const jobs = await collectJobs(project);
  const manifest = await ensureManifest();
  const concurrency = Math.max(1, Math.min(Number(valueAfter('--concurrency') ?? (provider === 'qwen' ? 3 : 1)), 6));
  let generated = 0;
  let cursor = 0;
  async function processJob(job) {
    const preparedJob = await hydrateVoiceProfile(job);
    const selectedProvider = selectProvider(provider, preparedJob);
    const effectiveVoice = resolveProviderVoice(selectedProvider, preparedJob.voice);
    const requestJob = { ...preparedJob, voice: effectiveVoice };
    job.action.voiceProfileId = voiceProfileIdFor(selectedProvider, effectiveVoice);
    const textHash = hashText(job.text);
    const expectedProviderId = providerIdFor(selectedProvider);
    const existing = reusableManifestItem(manifest, job.audioId, textHash, expectedProviderId, effectiveVoice);
    if (existing) {
      job.action.audioUrl = existing.url;
      manifest.items[job.audioId] = { ...existing, audioId: job.audioId };
      await persistTtsBuild(manifest, job);
      return;
    }
    const result = await requestSpeech(selectedProvider, requestJob);
    const voiceDir = providerVoiceDir(selectedProvider, effectiveVoice);
    const outDir = path.join(ttsPublicDir, voiceDir);
    const fileName = `${safeId(job.audioId)}.${result.format}`;
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, fileName), result.buffer);
    const url = `/media/tts/${voiceDir}/${fileName}`;
    job.action.audioUrl = url;
    manifest.items[job.audioId] = {
      audioId: job.audioId,
      url,
      providerId: expectedProviderId,
      voice: effectiveVoice,
      modelId: modelIdFor(selectedProvider),
      textHash,
    };
    generated++;
    await persistTtsBuild(manifest, job);
    console.log(`TTS cached: ${job.audioId} -> ${url}`);
  }
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      await processJob(job);
    }
  }));
  await writeFile(manifestPath, `${JSON.stringify({ ...manifest, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf-8');
  for (const file of new Set(jobs.map((job) => job.file))) {
    const job = jobs.find((item) => item.file === file);
    if (job?.kind === 'mdx') await writeMdxPlaybackScenes(job);
    else await writeJsonStable(file, job?.root);
  }
  console.log(`TTS build complete: ${generated} generated, ${jobs.length} speech actions checked.`);
}

async function persistTtsBuild(manifest, job) {
  await writeFile(manifestPath, `${JSON.stringify({ ...manifest, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf-8');
  if (job?.kind === 'mdx') await writeMdxPlaybackScenes(job);
  else await writeJsonStable(job.file, job.root);
}

async function requestSpeech(provider, job) {
  const selectedProvider = normalizeProvider(provider);
  if (selectedProvider === 'qwen') return requestQwenSpeech(job);
  const baseUrl = selectedProvider === 'kokoro' ? 'http://127.0.0.1:8880/v1' : 'http://127.0.0.1:8000/v1';
  const kokoroVoice = !job.voice || String(job.voice).startsWith('voxcpm:') ? 'zf_xiaoxiao' : job.voice;
  const payload = selectedProvider === 'kokoro'
    ? { model: 'kokoro', input: job.text, voice: kokoroVoice, response_format: 'mp3' }
    : {
        model: 'voxcpm2',
        input: job.text,
        voice: job.voice || 'voxcpm:auto',
        response_format: 'wav',
        voice_prompt: job.voicePrompt,
        reference_audio_base64: job.referenceAudioBase64,
        reference_audio_mime_type: job.referenceAudioMimeType,
        reference_audio_name: job.referenceAudioName,
        prompt_text: job.promptText,
      };
  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`${selectedProvider} TTS failed for ${job.audioId}: ${await response.text()}`);
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), format: selectedProvider === 'kokoro' ? 'mp3' : 'wav' };
}

async function requestQwenSpeech(job) {
  const apiKey = dashScopeApiKey();
  if (!apiKey) {
    throw new Error('DASHSCOPE_API_KEY is required for Qwen3 TTS. Set it in your shell, not in source code.');
  }
  const speed = Number(valueAfter('--speed') ?? 1);
  const rate = Math.max(-500, Math.min(500, Math.round((speed - 1) * 500)));
  const body = {
    model: valueAfter('--model') ?? 'qwen3-tts-flash',
    input: {
      text: job.text,
      voice: resolveQwenVoice(job.voice),
      language_type: valueAfter('--language-type') ?? 'Chinese',
    },
    ...(rate !== 0 ? { parameters: { rate } } : {}),
  };
  return withQwenRetries(job.audioId, async () => {
    const response = await fetch(`${qwenBaseUrl}/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(args.includes('--no-sse') ? {} : { 'X-DashScope-SSE': 'enable' }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(qwenTimeoutMs),
    });
    if (!response.ok) throw new Error(`qwen TTS failed for ${job.audioId}: ${await response.text()}`);
    const packets = parseQwenPackets(await response.text());
    const audioUrl = findQwenAudioUrl(packets);
    if (audioUrl) {
      const audio = await fetch(audioUrl, { signal: AbortSignal.timeout(qwenTimeoutMs) });
      if (!audio.ok) throw new Error(`qwen TTS audio download failed: ${audio.status} ${audio.statusText}`);
      const format = formatFromAudioResponse(audioUrl, audio.headers.get('content-type'));
      const buffer = Buffer.from(await audio.arrayBuffer());
      return { buffer: format === 'wav' ? repairWavHeader(buffer) : buffer, format };
    }
    const chunks = findQwenAudioData(packets);
    if (chunks.length > 0) return { buffer: Buffer.from(wavFromPcm16Base64Chunks(chunks, 24000)), format: 'wav' };
    throw new Error(`qwen TTS response missing audio URL/data for ${job.audioId}`);
  });
}

async function collectJobs(projectFilter) {
  return [
    ...(await collectWidgetJobs(projectFilter)),
    ...(await collectPageJobs(projectFilter)),
  ];
}

function reusableManifestItem(manifest, audioId, textHash, providerId, voice) {
  const direct = manifest.items[audioId];
  if (manifestItemUsable(direct, textHash, providerId, voice)) return direct;
  return Object.values(manifest.items).find((item) => manifestItemUsable(item, textHash, providerId, voice)) ?? null;
}

function manifestItemUsable(item, textHash, providerId, voice) {
  return item?.textHash === textHash
    && item.providerId === providerId
    && item.voice === voice
    && typeof item.url === 'string'
    && existsSync(path.join(root, 'site', 'public', item.url.replace(/^\//, '')));
}

async function withQwenRetries(audioId, operation) {
  let lastError;
  for (let attempt = 1; attempt <= qwenRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= qwenRetries) break;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Qwen TTS retry ${attempt}/${qwenRetries - 1} for ${audioId}: ${message}`);
      await wait(1600 * attempt);
    }
  }
  throw lastError;
}

async function collectWidgetJobs(projectFilter) {
  const widgetDir = textbookOutput('widgets');
  const files = (await readdir(widgetDir))
    .filter((file) => file.endsWith('.json') && (!projectFilter || file.startsWith(`${projectFilter}-`)))
    .map((file) => path.join(widgetDir, file));
  const jobs = [];
  for (const file of files) {
    const rootJson = JSON.parse(await readFile(file, 'utf-8'));
    if (rootJson.widget === 'lesson-animation' || rootJson.props?.artifact?.type === 'animation-slide') continue;
    const actions = rootJson.props?.artifact?.scene?.actions ?? [];
    for (const action of actions) {
      if (action.type !== 'speech') continue;
      const normalized = prepareSpeechAction(action);
      if (!normalized?.spokenText) continue;
      action.audioId = stringValue(action.audioId) || widgetSpeechAudioId(rootJson, action);
      action.speakerId ||= 'teacher';
      action.voiceProfileId ||= 'qwen:Cherry';
      jobs.push({
        kind: 'json',
        file,
        root: rootJson,
        action,
        audioId: action.audioId,
        text: normalized.spokenText,
        voice: action.voiceProfileId,
        voicePrompt: action.voicePrompt,
        promptText: action.promptText,
      });
    }
  }
  return jobs;
}

async function collectPageJobs(projectFilter) {
  const dir = textbookOutput('projects');
  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.mdx') && (!projectFilter || file.startsWith(`${projectFilter}-`)))
    .map((file) => path.join(dir, file));
  const jobs = [];
  for (const file of files) {
    const text = await readFile(file, 'utf-8');
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) continue;
    const line = match[1].match(/^playbackScenes:\s*(.+)$/m);
    if (!line) continue;
    const scenes = JSON.parse(line[1]);
    for (const scene of scenes) {
      for (const action of scene.actions ?? []) {
        if (action.type !== 'speech') continue;
        const normalized = prepareSpeechAction(action);
        if (!normalized?.spokenText) continue;
        action.audioId ||= `${scene.id}-${safeId(action.id)}`;
        action.speakerId ||= 'teacher';
        action.voiceProfileId ||= 'qwen:Cherry';
        jobs.push({
          kind: 'mdx',
          file,
          root: text,
          frontmatter: match[1],
          scenes,
          action,
          audioId: action.audioId,
          text: normalized.spokenText,
          voice: action.voiceProfileId,
          voicePrompt: action.voicePrompt,
          promptText: action.promptText,
        });
      }
    }
  }
  return jobs;
}

function prepareSpeechAction(action) {
  const source = stringValue(action.spokenText) || stringValue(action.text) || stringValue(action.content);
  if (!source) return null;
  const captionSource = stringValue(action.caption) || trimCaption(stringValue(action.text) || stringValue(action.displayText) || source);
  const normalized = normalizeSpeechText(source, { caption: captionSource });
  action.spokenText = normalized.spokenText;
  action.caption = normalized.caption || trimCaption(stringValue(action.text) || normalized.spokenText);
  return normalized;
}

async function hydrateVoiceProfile(job) {
  const profileId = getProfileId(job.voice);
  if (!profileId) return job;
  const file = path.join(voiceProfileDir, `${safeId(profileId)}.json`);
  if (!existsSync(file)) throw new Error(`Voice profile not found: ${file}`);
  const profile = JSON.parse(await readFile(file, 'utf-8'));
  return {
    ...job,
    voice: profile.voiceId || `voxcpm:profile:${profile.id}`,
    voicePrompt: profile.voicePrompt || job.voicePrompt,
    promptText: profile.promptText || job.promptText,
    referenceAudioName: profile.referenceAudioName,
    referenceAudioMimeType: profile.referenceAudioMimeType,
    referenceAudioBase64: profile.referenceAudioBase64,
  };
}

function selectProvider(provider, job) {
  if (provider === 'qwen') return 'qwen';
  return getProfileId(job.voice) ? 'voxcpm' : provider;
}

function normalizeProvider(provider) {
  const value = String(provider || '').toLowerCase();
  if (value === 'kokoro' || value === 'kokoro-tts') return 'kokoro';
  if (value === 'qwen' || value === 'qwen-tts' || value === 'dashscope') return 'qwen';
  return 'voxcpm';
}

function defaultBuildProvider() {
  return 'qwen';
}

function providerIdFor(provider) {
  if (provider === 'kokoro') return 'kokoro-tts';
  if (provider === 'qwen') return 'qwen-tts';
  return 'voxcpm-tts';
}

function modelIdFor(provider) {
  if (provider === 'kokoro') return 'kokoro';
  if (provider === 'qwen') return valueAfter('--model') ?? 'qwen3-tts-flash';
  return 'voxcpm2';
}

function voiceProfileIdFor(provider, voice) {
  if (provider === 'qwen') return `qwen:${voice || 'Cherry'}`;
  if (provider === 'kokoro') return `kokoro:${voice || 'zf_xiaoxiao'}`;
  return voice || 'voxcpm:auto';
}

function providerVoiceDir(provider, voice) {
  return `${safeId(provider)}-${safeId(voice || defaultVoiceFor(provider))}`;
}

function defaultVoiceFor(provider) {
  if (provider === 'qwen') return 'Cherry';
  if (provider === 'kokoro') return 'zf_xiaoxiao';
  return 'voxcpm-auto';
}

function resolveProviderVoice(provider, voice) {
  if (provider === 'kokoro') {
    return !voice || String(voice).startsWith('voxcpm:') || String(voice).startsWith('qwen:') ? 'zf_xiaoxiao' : voice;
  }
  if (provider === 'qwen') return resolveQwenVoice(voice);
  if (String(voice || '').startsWith('qwen:') || String(voice || '').startsWith('kokoro:')) return 'voxcpm:auto';
  return voice || 'voxcpm:auto';
}

function resolveQwenVoice(voice) {
  const value = String(voice || '').trim();
  if (!value || value.startsWith('voxcpm:') || value.startsWith('kokoro:')) return valueAfter('--voice') ?? 'Cherry';
  return value.startsWith('qwen:') ? value.slice('qwen:'.length) || 'Cherry' : value;
}

function getProfileId(voice) {
  const value = String(voice || '');
  return value.startsWith('voxcpm:profile:') ? value.slice('voxcpm:profile:'.length) : null;
}

async function referencePayload(reference) {
  const bytes = await readFile(reference);
  return {
    referenceAudioName: path.basename(reference),
    referenceAudioMimeType: mimeFromFile(reference),
    referenceAudioBase64: bytes.toString('base64'),
  };
}

function validateReferenceAudio(reference) {
  const bytes = spawnSync(voxcpmPython(), ['-c', `
import json
import numpy as np
import soundfile as sf
import sys
data, sr = sf.read(sys.argv[1], always_2d=False)
duration = len(data) / float(sr)
mono = data.mean(axis=1) if getattr(data, 'ndim', 1) > 1 else data
rms = float(np.sqrt(np.mean(np.square(mono)))) if len(mono) else 0.0
silent_ratio = float(np.mean(np.abs(mono) < 1e-4)) if len(mono) else 1.0
print(json.dumps({"duration": duration, "sampleRate": sr, "rms": rms, "silentRatio": silent_ratio}))
`, reference], { cwd: root, encoding: 'utf-8', stdio: 'pipe', timeout: 30000 });
  if (bytes.status !== 0) throw new Error(`Cannot inspect reference audio: ${bytes.stderr || bytes.stdout}`);
  const info = JSON.parse(bytes.stdout);
  if (info.duration < 3 || info.duration > 30) throw new Error(`Reference audio must be 3-30s, got ${info.duration.toFixed(1)}s`);
  if (info.sampleRate < 16000) throw new Error(`Reference audio sample rate must be >=16kHz, got ${info.sampleRate}`);
  if (info.silentRatio > 0.92 || info.rms < 0.001) throw new Error('Reference audio is too silent for voice cloning');
}

function mimeFromFile(file) {
  const name = file.toLowerCase();
  if (name.endsWith('.mp3')) return 'audio/mpeg';
  if (name.endsWith('.flac')) return 'audio/flac';
  if (name.endsWith('.ogg')) return 'audio/ogg';
  if (name.endsWith('.webm')) return 'audio/webm';
  return 'audio/wav';
}

function dashScopeApiKey() {
  const direct = process.env.DASHSCOPE_API_KEY || process.env.DASH_SCOPE_API_KEY;
  if (direct) return direct.trim();
  const file = process.env.DASHSCOPE_API_KEY_FILE;
  if (file && existsSync(file)) return readFileSync(file, 'utf-8').trim();
  return '';
}

function parseQwenPackets(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('{')) return [JSON.parse(trimmed)];
  const packets = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean.toLowerCase().startsWith('data:')) continue;
    const data = clean.slice(clean.indexOf(':') + 1).trim();
    if (!data || data === '[DONE]') continue;
    try {
      packets.push(JSON.parse(data));
    } catch {
      // Ignore SSE comments and keepalive rows.
    }
  }
  return packets;
}

function findQwenAudioUrl(packets) {
  for (let i = packets.length - 1; i >= 0; i--) {
    const output = packets[i]?.output;
    const url = output?.audio?.url || output?.audio_url;
    if (typeof url === 'string' && url) return url;
  }
  return '';
}

function findQwenAudioData(packets) {
  return packets.map((packet) => packet?.output?.audio?.data || packet?.output?.audio_data)
    .filter((value) => typeof value === 'string' && value);
}

function formatFromAudioResponse(url, contentType) {
  const mime = String(contentType || '').toLowerCase();
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('aac')) return 'aac';
  if (mime.includes('wav') || mime.includes('wave')) return 'wav';
  const value = url.toLowerCase();
  if (value.includes('.mp3')) return 'mp3';
  if (value.includes('.flac')) return 'flac';
  if (value.includes('.aac')) return 'aac';
  return 'wav';
}

function wavFromPcm16Base64Chunks(chunks, sampleRate) {
  const pcmParts = chunks.map((chunk) => Buffer.from(chunk.includes(',') ? chunk.slice(chunk.indexOf(',') + 1) : chunk, 'base64'));
  const pcmLength = pcmParts.reduce((total, part) => total + part.length, 0);
  const wav = Buffer.alloc(44 + pcmLength);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + pcmLength, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(pcmLength, 40);
  let offset = 44;
  for (const part of pcmParts) {
    part.copy(wav, offset);
    offset += part.length;
  }
  return wav;
}

function repairWavHeader(buffer) {
  if (buffer.length < 44) return buffer;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return buffer;
  if (buffer.toString('ascii', 36, 40) !== 'data') return buffer;
  const riffSize = buffer.length - 8;
  const dataSize = buffer.length - 44;
  if (buffer.readUInt32LE(4) === riffSize && buffer.readUInt32LE(40) === dataSize) return buffer;
  const fixed = Buffer.from(buffer);
  fixed.writeUInt32LE(riffSize, 4);
  fixed.writeUInt32LE(dataSize, 40);
  return fixed;
}

function startKokoro() {
  run('docker', ['rm', '-f', 'dgbook-kokoro'], { allowFail: true });
  let result = run('docker', ['run', '-d', '--name', 'dgbook-kokoro', '--gpus', 'all', '-p', '8880:8880', kokoroGpuImage], { allowFail: true });
  if (result.status !== 0) result = run('docker', ['run', '-d', '--name', 'dgbook-kokoro', '-p', '8880:8880', kokoroCpuImage], { allowFail: true });
  if (result.status !== 0) console.warn('Kokoro container did not start. Run Docker Desktop and retry.');
}

function startVoxCpm() {
  const python = voxcpmPython();
  const child = spawn(python, [path.join(root, 'scripts', 'tts-sidecar', 'voxcpm_server.py')], {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      DGBOOK_VOXCPM_PORT: '8000',
      DGBOOK_VOXCPM_DEVICE: process.env.DGBOOK_VOXCPM_DEVICE || 'cuda',
      DGBOOK_VOXCPM_MODEL: existsSync(path.join(voxcpmModelDir, 'model.safetensors')) ? voxcpmModelDir : 'openbmb/VoxCPM2',
    },
  });
  child.unref();
}

async function setupVoxCpmEnv() {
  const venv = path.join(runtimeDir, 'voxcpm-venv');
  if (!existsSync(path.join(venv, 'Scripts', 'python.exe'))) {
    const py = process.env.PYTHON || 'python';
    run(py, ['-m', 'venv', venv], { allowFail: true });
  }
  const python = voxcpmPython();
  run(python, ['-m', 'pip', 'install', '--upgrade', 'pip'], { allowFail: true, timeout: 10 * 60 * 1000 });
  run(python, ['-m', 'pip', 'install', '-r', path.join(runtimeDir, 'voxcpm-requirements.txt')], { allowFail: true, timeout: 30 * 60 * 1000 });
}

function downloadVoxCpmModel() {
  if (existsSync(path.join(voxcpmModelDir, 'model.safetensors'))) return;
  const python = voxcpmPython();
  run(python, ['-m', 'pip', 'install', 'modelscope>=1.24'], { allowFail: true, timeout: 10 * 60 * 1000 });
  run(python, ['-m', 'modelscope', 'download', '--model', 'OpenBMB/VoxCPM2', '--local_dir', voxcpmModelDir], {
    allowFail: true,
    timeout: 90 * 60 * 1000,
  });
}

function voxcpmPython() {
  const candidate = path.join(runtimeDir, 'voxcpm-venv', 'Scripts', 'python.exe');
  return existsSync(candidate) ? candidate : (process.env.PYTHON || 'python');
}

async function ensureManifest() {
  await mkdir(ttsPublicDir, { recursive: true });
  if (!existsSync(manifestPath)) {
    await writeFile(manifestPath, `${JSON.stringify({ version: 1, generatedAt: new Date(0).toISOString(), items: {} }, null, 2)}\n`, 'utf-8');
  }
  return JSON.parse(await readFile(manifestPath, 'utf-8'));
}

async function serviceOk(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1800) });
    return response.ok;
  } catch {
    return false;
  }
}

async function check(name, url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return { name, ok: response.ok, message: response.ok ? url : `${response.status} ${response.statusText}` };
  } catch (error) {
    return { name, ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function checkQwen() {
  const apiKey = dashScopeApiKey();
  if (!apiKey) return { name: 'qwen', ok: false, message: 'DASHSCOPE_API_KEY is not set' };
  try {
    const response = await fetch(`${qwenBaseUrl}/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen3-tts-flash',
        input: { text: 'DGBook TTS health check.', voice: 'Cherry', language_type: 'Chinese' },
      }),
      signal: AbortSignal.timeout(180000),
    });
    if (!response.ok) return { name: 'qwen', ok: false, message: `${response.status} ${await response.text()}` };
    const packets = parseQwenPackets(await response.text());
    return { name: 'qwen', ok: Boolean(findQwenAudioUrl(packets) || findQwenAudioData(packets).length), message: qwenBaseUrl };
  } catch (error) {
    return { name: 'qwen', ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

function hasDocker() {
  return run('docker', ['--version'], { allowFail: true }).status === 0;
}

function run(file, cmdArgs, options = {}) {
  const result = spawnSync(file, cmdArgs, {
    cwd: root,
    encoding: 'utf-8',
    stdio: options.allowFail ? 'pipe' : 'inherit',
    timeout: options.timeout ?? 30000,
  });
  if (!options.allowFail && result.status !== 0) process.exit(result.status ?? 1);
  return result;
}

async function writeJsonStable(file, json) {
  if (!json) return;
  await writeFile(file, `${JSON.stringify(json, null, 2)}\n`, 'utf-8');
}

async function writeMdxPlaybackScenes(job) {
  if (!job?.root || !job.scenes) return;
  const next = job.root.replace(/^playbackScenes:\s*.+$/m, `playbackScenes: ${JSON.stringify(job.scenes)}`);
  await writeFile(job.file, next, 'utf-8');
}

function requirements() {
  return [
    'fastapi>=0.115',
    'uvicorn[standard]>=0.30',
    'soundfile>=0.12',
    'numpy>=1.26',
    'voxcpm>=2.0.3',
    'modelscope>=1.24',
    '',
  ].join('\n');
}

function appendLog(file, data) {
  import('node:fs').then((fs) => fs.appendFile(file, data, () => undefined));
}

function valueAfter(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function safeId(value) {
  return String(value || 'default').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

function hashText(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function trimCaption(text) {
  const value = String(text).replace(/\s+/g, ' ').trim();
  return value.length > 36 ? `${value.slice(0, 35)}...` : value;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printHelp() {
  console.log(`DGBook local TTS

Commands:
  setup             prepare runtime dirs, Kokoro image, VoxCPM venv/model
  start             start Kokoro and VoxCPM local services
  health            check local TTS endpoints
  sample            generate one sample audio (--provider qwen|voxcpm|kokoro)
  clone             create a VoxCPM voice profile and clone sample
  build             cache speech audio and write audioUrl to widgets

Qwen3 TTS:
  Set DASHSCOPE_API_KEY in the shell, then run:
  node scripts/tts-local.mjs build --provider qwen --project P17 --voice Cherry
`);
}

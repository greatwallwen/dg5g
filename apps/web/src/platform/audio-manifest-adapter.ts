import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { PlaybackAction, PlaybackScene, SpeechAudioManifest } from './models';
import { resolvePublicMediaFile } from './public-media';

let cachedManifest: SpeechAudioManifest | null = null;

export interface ManifestAudioOptions {
  manifest?: SpeechAudioManifest | null;
  resolveFile?: (parts: string[]) => string | null;
}

export function withManifestAudioUrls(scene: PlaybackScene, options: ManifestAudioOptions = {}): PlaybackScene {
  const manifest = options.manifest === undefined ? readAudioManifest() : options.manifest;
  if (!manifest) return scene;
  const resolveFile = options.resolveFile ?? resolveMediaFile;
  return {
    ...scene,
    actions: scene.actions.map((action) => withActionAudioUrl(scene.sceneId, action, manifest, resolveFile)),
  };
}

export function readAudioManifest(): SpeechAudioManifest | null {
  if (cachedManifest) return cachedManifest;
  const manifestPath = resolveMediaFile(['manifest.json']);
  if (!manifestPath) return null;
  try {
    cachedManifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SpeechAudioManifest;
    return cachedManifest;
  } catch {
    return null;
  }
}

function withActionAudioUrl(
  sceneId: string,
  action: PlaybackAction,
  manifest: SpeechAudioManifest,
  resolveFile: (parts: string[]) => string | null,
): PlaybackAction {
  if (action.audioUrl) return action;
  const candidates = [
    action.audioId,
    action.id,
    `${sceneId}-${safeId(action.id)}`,
  ].filter(Boolean) as string[];
  const found = candidates.map((id) => manifest.items[id]).find(Boolean);
  if (!found || found.providerId !== 'qwen-tts') return action;
  if (!action.spokenText || !found.textHash || hashText(action.spokenText) !== found.textHash) return action;
  const parts = ttsMediaParts(found.url);
  if (!parts || !resolveFile(parts)) return action;
  return { ...action, audioId: found.audioId, audioUrl: found.url };
}

export function resolveMediaFile(parts: string[]): string | null {
  return resolvePublicMediaFile('tts', parts);
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'default';
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

function ttsMediaParts(url: string): string[] | null {
  const prefix = '/media/tts/';
  if (!url.startsWith(prefix)) return null;
  const parts = url.slice(prefix.length).split('/');
  return parts.length > 0 && parts.every((part) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(part))
    ? parts
    : null;
}

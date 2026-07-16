import {
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';

export function resolvePublicMediaFile(mediaDir: string, parts: string[]): string | null {
  const requested = [mediaDir, ...parts];
  if (!requested.every(isSafePathSegment)) return null;

  const cwd = path.resolve(process.cwd());
  const appCwd = path.basename(cwd).toLowerCase() === 'web'
    && path.basename(path.dirname(cwd)).toLowerCase() === 'apps';
  const rootSegments = appCwd ? ['public', 'media'] : ['apps', 'web', 'public', 'media'];
  const mediaRoot = resolveExactPath(cwd, rootSegments, 'directory');
  if (!mediaRoot) return null;
  return resolveExactPath(mediaRoot, requested, 'file');
}

export function resolvePublicAssetFile(assetDir: string, parts: string[]): string | null {
  const safeParts = parts.filter((part) => part && !part.includes('..'));
  const candidates = [
    path.resolve(process.cwd(), 'site', 'public', assetDir, ...safeParts),
    path.resolve(process.cwd(), '..', '..', 'site', 'public', assetDir, ...safeParts),
    path.resolve(process.cwd(), '..', 'site', 'public', assetDir, ...safeParts),
    path.resolve(process.cwd(), 'packages', 'animation', 'assets', assetDir, ...safeParts),
    path.resolve(process.cwd(), '..', '..', 'packages', 'animation', 'assets', assetDir, ...safeParts),
    path.resolve(process.cwd(), '..', 'packages', 'animation', 'assets', assetDir, ...safeParts),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function publicMediaHeaders(file: string): Record<string, string> {
  return {
    'Content-Type': publicMediaContentType(file),
    'Cache-Control': path.basename(file).toLowerCase() === 'manifest.json'
      ? 'public, no-cache, must-revalidate'
      : 'public, max-age=31536000, immutable',
  };
}

function publicMediaContentType(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.svg':
      return 'image/svg+xml; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.wav':
      return 'audio/wav';
    case '.mp3':
      return 'audio/mpeg';
    case '.webm':
      return 'video/webm';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

function isSafePathSegment(segment: string): boolean {
  return typeof segment === 'string'
    && segment.length > 0
    && segment.trim() === segment
    && !segment.includes('..')
    && !segment.includes('%')
    && !/[\\/\0:\u0001-\u001f\u007f]/.test(segment)
    && !segment.endsWith('.')
    && !path.isAbsolute(segment);
}

function resolveExactPath(
  base: string,
  segments: string[],
  expected: 'directory' | 'file',
): string | null {
  const baseReal = safeRealpath(base);
  if (!baseReal) return null;
  let current = base;

  try {
    for (const [index, segment] of segments.entries()) {
      const caseMatches = readdirSync(current).filter((name) => name.toLowerCase() === segment.toLowerCase());
      if (caseMatches.length !== 1 || caseMatches[0] !== segment) return null;

      current = path.join(current, segment);
      const stat = lstatSync(current);
      if (stat.isSymbolicLink()) return null;
      const final = index === segments.length - 1;
      if (final ? expected === 'file' ? !stat.isFile() : !stat.isDirectory() : !stat.isDirectory()) return null;

      const real = realpathSync.native(current);
      if (!isWithin(baseReal, real)) return null;
      if (!samePath(real, current)) return null;
    }
    return current;
  } catch {
    return null;
  }
}

function safeRealpath(value: string): string | null {
  try {
    return realpathSync.native(value);
  } catch {
    return null;
  }
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => path.resolve(value).replaceAll('\\', '/').toLowerCase();
  return normalize(left) === normalize(right);
}

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { NextResponse } from 'next/server';
import { resolvePublicAssetFile } from '@/platform/public-media';

export async function GET(_request: Request, { params }: { params: { path: string[] } }) {
  const file = resolvePublicAssetFile('avatars', params.path);
  if (!file) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(await readFile(file), {
    headers: {
      'Content-Type': contentType(file),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

function contentType(file: string): string {
  switch (extname(file).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.svg':
      return 'image/svg+xml; charset=utf-8';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

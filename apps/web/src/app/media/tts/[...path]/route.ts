import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { resolveMediaFile } from '@/platform/audio-manifest-adapter';
import { publicMediaHeaders } from '@/platform/public-media';

export async function GET(_request: Request, { params }: { params: { path: string[] } }) {
  const file = resolveMediaFile(params.path);
  if (!file) return new NextResponse('Not found', { status: 404 });
  const body = await readFile(file);
  return new NextResponse(body, {
    headers: publicMediaHeaders(file),
  });
}

import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { publicMediaHeaders, resolvePublicMediaFile } from '@/platform/public-media';

export async function GET(_request: Request, { params }: { params: { path: string[] } }) {
  const file = resolvePublicMediaFile('home', params.path);
  if (!file) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(await readFile(file), {
    headers: publicMediaHeaders(file),
  });
}

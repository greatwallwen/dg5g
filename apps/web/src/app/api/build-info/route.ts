import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    releaseId: process.env.DGBOOK_WEB_RELEASE_ID ?? 'development',
    sourceSha256: process.env.DGBOOK_WEB_SOURCE_SHA256 ?? null,
  });
}

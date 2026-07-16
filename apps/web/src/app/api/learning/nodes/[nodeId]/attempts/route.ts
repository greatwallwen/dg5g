import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { nodeId: string } }) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => undefined);
  if (body && typeof body === 'object' && !Array.isArray(body) && Object.hasOwn(body, 'score')) {
    return NextResponse.json(
      { error: 'Client-scored formal attempts are not accepted.' },
      { status: 400, headers: { 'cache-control': 'no-store' } },
    );
  }
  return NextResponse.json(
    {
      error: `The legacy formal-attempt endpoint is retired for ${params.nodeId}; use the server-graded assessment endpoint.`,
    },
    { status: 410, headers: { 'cache-control': 'no-store' } },
  );
}

import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, _context: { params: { studentId: string } }) {
  return retiredResponse(request);
}

export async function POST(request: Request, _context: { params: { studentId: string } }) {
  return retiredResponse(request);
}

export async function DELETE(request: Request, _context: { params: { studentId: string } }) {
  return retiredResponse(request);
}

function retiredResponse(request: Request) {
  if (!readActorFromRequest(request)) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  return NextResponse.json({
    error: 'Legacy skill-progress API has been retired',
    replacement: '/api/learning',
  }, { status: 410 });
}

import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import { createLearningCommandService, LearningAuthorizationError } from '@/platform/learning-command-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  try {
    return NextResponse.json(createLearningCommandService().readStudentSnapshot(actor));
  } catch (error) {
    if (error instanceof LearningAuthorizationError) {
      return NextResponse.json({ error: 'Student learning snapshots are available only to the authenticated student' }, { status: 403 });
    }
    throw error;
  }
}

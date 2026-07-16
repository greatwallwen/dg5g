import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import {
  createLearningCommandService,
  describeLearningCommandError,
  type LearningEventCommand,
} from '@/platform/learning-command-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { nodeId: string } }) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid learning event command' }, { status: 400 });
  }
  const command: LearningEventCommand = {
    eventId: body.eventId as string,
    nodeId: params.nodeId,
    channel: body.channel as LearningEventCommand['channel'],
    eventType: body.eventType as string,
    expectedVersion: body.expectedVersion as number,
    ...(body.payload === undefined ? {} : { payload: body.payload as Record<string, unknown> }),
    ...(body.occurredAt === undefined ? {} : { occurredAt: body.occurredAt as string }),
  };
  try {
    return NextResponse.json(createLearningCommandService().appendEvent(actor, command));
  } catch (error) {
    const problem = describeLearningCommandError(error);
    if (problem) return NextResponse.json(problem.body, { status: problem.status });
    throw error;
  }
}

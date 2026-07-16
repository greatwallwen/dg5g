import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import {
  createLearningCommandService,
  describeLearningCommandError,
  type FormalAttemptCommand,
} from '@/platform/learning-command-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { nodeId: string } }) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid formal attempt command' }, { status: 400 });
  }
  const command: FormalAttemptCommand = {
    attemptId: body.attemptId as string,
    nodeId: params.nodeId,
    score: body.score as number,
    expectedVersion: body.expectedVersion as number,
    ...(body.gameId === undefined ? {} : { gameId: body.gameId as string }),
    ...(body.durationSeconds === undefined ? {} : { durationSeconds: body.durationSeconds as number }),
    ...(body.mistakeKnowledgePointIds === undefined
      ? {}
      : { mistakeKnowledgePointIds: body.mistakeKnowledgePointIds as string[] }),
    ...(body.completedAt === undefined ? {} : { completedAt: body.completedAt as string }),
  };
  try {
    return NextResponse.json(createLearningCommandService().recordFormalAttempt(actor, command));
  } catch (error) {
    const problem = describeLearningCommandError(error);
    if (problem) return NextResponse.json(problem.body, { status: problem.status });
    throw error;
  }
}

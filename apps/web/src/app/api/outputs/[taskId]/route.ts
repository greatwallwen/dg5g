import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import {
  createLearningCommandService,
  describeLearningCommandError,
} from '@/platform/learning-command-service';

export const dynamic = 'force-dynamic';

export function GET(request: Request, { params }: { params: { taskId: string } }) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const outputId = new URL(request.url).searchParams.get('outputId');
  try {
    const envelope = createLearningCommandService().readProfessionalOutput(
      actor,
      params.taskId,
      outputId === null ? undefined : outputId,
    );
    return NextResponse.json(envelope);
  } catch (error) {
    const problem = describeLearningCommandError(error);
    if (problem) return NextResponse.json(problem.body, { status: problem.status });
    throw error;
  }
}

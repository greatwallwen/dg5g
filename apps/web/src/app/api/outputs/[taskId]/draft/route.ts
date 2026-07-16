import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import {
  createLearningCommandService,
  describeLearningCommandError,
  type ProfessionalOutputCommand,
} from '@/platform/learning-command-service';
import { loadSelfStudyCatalog } from '@/features/textbook-scene/self-study-content';
import {
  professionalOutputSchemaForTask,
  validateProfessionalOutputDraft,
} from '@/features/portfolio/output-schema';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { taskId: string } }) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid professional output command' }, { status: 400 });
  }
  const command: ProfessionalOutputCommand = {
    expectedStateRevision: body.expectedStateRevision as number,
    fields: body.fields as ProfessionalOutputCommand['fields'],
    upstreamRefs: body.upstreamRefs as ProfessionalOutputCommand['upstreamRefs'],
    ...(body.outputId === undefined ? {} : { outputId: body.outputId as string }),
  };
  try {
    return NextResponse.json(
      createLearningCommandService().saveProfessionalOutputDraft(
        actor,
        params.taskId,
        command,
        (taskId, fields) => validateProfessionalOutputDraft(
          professionalOutputSchemaForTask(loadSelfStudyCatalog(), taskId),
          fields,
        ),
      ),
    );
  } catch (error) {
    const problem = describeLearningCommandError(error);
    if (problem) return NextResponse.json(problem.body, { status: problem.status });
    throw error;
  }
}

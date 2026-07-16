import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import {
  createLearningCommandService,
  describeLearningCommandError,
  parseProfessionalOutputCommand,
} from '@/platform/learning-command-service';
import { loadSelfStudyCatalog } from '@/features/textbook-scene/self-study-content';
import {
  professionalOutputSchemaForTask,
  validateProfessionalOutputSubmission,
} from '@/features/portfolio/output-schema';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { taskId: string } }) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  try {
    const command = parseProfessionalOutputCommand(await request.json().catch(() => null));
    return NextResponse.json(
      createLearningCommandService().submitProfessionalOutput(
        actor,
        params.taskId,
        command,
        (taskId, fields) => validateProfessionalOutputSubmission(
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

import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import { getDatabase } from '@/platform/db/database';
import { loadSelfStudyCatalog } from '@/features/textbook-scene/self-study-content';
import {
  professionalOutputSchemaForTask,
  type ProfessionalOutputSchema,
} from '@/features/portfolio/output-schema';
import {
  ProfessionalOutputNotFoundError,
  ProfessionalOutputRepository,
  ProfessionalOutputStateError,
  ProfessionalOutputStateRevisionConflictError,
} from '@/platform/professional-output-repository';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { outputId: string } }) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (actor.role !== 'teacher') {
    return NextResponse.json({ error: 'Teacher role required' }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!isRecord(body)) return NextResponse.json({ error: 'Invalid review command' }, { status: 400 });
  try {
    const repository = new ProfessionalOutputRepository(getDatabase());
    const queueItem = repository.listSubmittedForTeacher(actor.userId, actor.classId)
      .find(({ outputId }) => outputId === params.outputId);
    if (!queueItem) throw new ProfessionalOutputNotFoundError(params.outputId);
    const rubricScores = body.action === 'verify'
      ? validateRubricScores(
        body.rubricScores,
        professionalOutputSchemaForTask(loadSelfStudyCatalog(), queueItem.taskId),
      )
      : undefined;
    const result = repository.reviewSubmitted({
      teacherId: actor.userId,
      classId: actor.classId,
      outputId: params.outputId,
      expectedStateRevision: body.expectedStateRevision as number,
      expectedOutputVersion: body.expectedOutputVersion as number,
      action: body.action as 'return' | 'verify',
      ...(typeof body.feedback === 'string' ? { feedback: body.feedback } : {}),
      ...(rubricScores ? { rubricScores } : {}),
      annotations: (body.annotations ?? {}) as Record<string, string>,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProfessionalOutputNotFoundError) {
      return NextResponse.json({ error: 'Professional output not found' }, { status: 404 });
    }
    if (error instanceof ProfessionalOutputStateRevisionConflictError) {
      return NextResponse.json({
        error: error.message,
        expectedStateRevision: error.expectedStateRevision,
        actualStateRevision: error.actualStateRevision,
      }, { status: 409 });
    }
    if (error instanceof ProfessionalOutputStateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof TypeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateRubricScores(
  value: unknown,
  schema: ProfessionalOutputSchema,
): Record<string, number> {
  if (!isRecord(value)) throw new TypeError('rubricScores must be an object.');
  const received = Object.keys(value);
  const expected = schema.rubric.map(({ criterion }) => criterion);
  if (received.length !== expected.length || received.some((key) => !expected.includes(key))) {
    throw new TypeError('rubricScores must exactly match the generated rubric.');
  }
  return Object.fromEntries(schema.rubric.map(({ criterion, maxScore }) => {
    const score = value[criterion];
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > maxScore) {
      throw new TypeError(`${criterion} must be between 0 and ${maxScore}.`);
    }
    return [criterion, score];
  }));
}

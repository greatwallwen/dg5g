import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import { getDatabase } from '@/platform/db/database';
import { ProfessionalOutputRepository } from '@/platform/professional-output-repository';
import { loadSelfStudyCatalog } from '@/features/textbook-scene/self-study-content';
import { professionalOutputSchemaForTask } from '@/features/portfolio/output-schema';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (actor.role !== 'teacher') {
    return NextResponse.json({ error: 'Teacher role required' }, { status: 403 });
  }
  const catalog = loadSelfStudyCatalog();
  const outputs = new ProfessionalOutputRepository(getDatabase())
    .listSubmittedForTeacher(actor.userId, actor.classId);
  return NextResponse.json({
    classId: actor.classId,
    outputs: outputs.map((output) => {
      const schema = professionalOutputSchemaForTask(catalog, output.taskId);
      return {
        ...output,
        fieldSchema: schema.fields.map(({ key, label }) => ({ key, label })),
        rubric: schema.rubric.map(({ criterion, maxScore }) => ({
          key: criterion,
          label: criterion,
          maxScore,
        })),
      };
    }),
  });
}

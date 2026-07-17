import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import { getDatabase } from '@/platform/db/database';
import { ProfessionalOutputRepository } from '@/platform/professional-output-repository';
import { loadSelfStudyCatalog } from '@/features/textbook-scene/self-study-content';
import { professionalOutputSchemaForTask } from '@/features/portfolio/output-schema';
import { loadP1DemoContent } from '@/features/platform/p1-content';
import { buildP1PortfolioDetailDefinition } from '@/features/portfolio/p1-portfolio-detail-definition';
import { buildP1PortfolioDetailModel } from '@/features/portfolio/p1-portfolio-detail-model';
import { ProfessionalOutputPortfolioReader } from '@/platform/professional-output-portfolio-reader';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (actor.role !== 'teacher') {
    return NextResponse.json({ error: 'Teacher role required' }, { status: 403 });
  }
  const database = getDatabase();
  const catalog = loadSelfStudyCatalog();
  const content = loadP1DemoContent();
  const detailReader = new ProfessionalOutputPortfolioReader(database);
  const outputs = new ProfessionalOutputRepository(database)
    .listSubmittedForTeacher(actor.userId, actor.classId);
  return NextResponse.json({
    classId: actor.classId,
    outputs: outputs.map((output) => {
      const schema = professionalOutputSchemaForTask(catalog, output.taskId);
      const detail = buildP1PortfolioDetailModel(
        buildP1PortfolioDetailDefinition(output.taskId, content, catalog),
        detailReader.read(output.studentId, output.taskId),
      );
      return {
        ...output,
        detail,
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

import { notFound } from 'next/navigation';
import {
  buildP1PortfolioDetailDefinition,
  parseP1PortfolioTaskId,
} from '../../../../../../features/portfolio/p1-portfolio-detail-definition.ts';
import { buildP1PortfolioDetailModel } from '../../../../../../features/portfolio/p1-portfolio-detail-model.ts';
import { P1PortfolioDetailView } from '../../../../../../features/portfolio/p1-portfolio-detail-view.tsx';
import { loadP1DemoContent } from '../../../../../../features/platform/p1-content.ts';
import { loadSelfStudyCatalog } from '../../../../../../features/textbook-scene/self-study-content.ts';
import { requireClassRole } from '../../../../../../platform/auth/server-actor.ts';
import { getDatabase } from '../../../../../../platform/db/database.ts';
import { ProfessionalOutputPortfolioReader } from '../../../../../../platform/professional-output-portfolio-reader.ts';

export const dynamic = 'force-dynamic';

export default async function P1PortfolioDetailPage({ params }: { params: { taskId: string } }) {
  const taskId = parseP1PortfolioTaskId(params.taskId);
  if (!taskId) notFound();
  const actor = await requireClassRole('student');
  const facts = new ProfessionalOutputPortfolioReader(getDatabase()).read(actor.studentId!, taskId);
  const definition = buildP1PortfolioDetailDefinition(
    taskId,
    loadP1DemoContent(),
    loadSelfStudyCatalog(),
  );
  return <P1PortfolioDetailView
    displayName={actor.displayName}
    model={buildP1PortfolioDetailModel(definition, facts)}
  />;
}

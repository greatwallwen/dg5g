import { P1PortfolioView } from '../../../../../features/portfolio/p1-portfolio-view.tsx';
import { buildP1PortfolioViewModel } from '../../../../../features/portfolio/p1-portfolio-model.ts';
import { requireClassRole } from '../../../../../platform/auth/server-actor.ts';
import { AuthoritativeSnapshotReader } from '../../../../../platform/authoritative-snapshot.ts';
import { getDatabase } from '../../../../../platform/db/database.ts';

export const dynamic = 'force-dynamic';

export default async function P1PortfolioPage() {
  const actor = await requireClassRole('student');
  const snapshot = new AuthoritativeSnapshotReader(getDatabase()).read(actor, 'student');
  const model = buildP1PortfolioViewModel({
    ...snapshot.me.project,
    studentVersion: snapshot.me.studentVersion,
    snapshotVersion: snapshot.snapshotVersion,
  });
  return <P1PortfolioView displayName={actor.displayName} model={model} />;
}

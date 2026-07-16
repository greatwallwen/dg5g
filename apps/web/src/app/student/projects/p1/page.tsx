import { P1ProjectView } from '../../../../features/projects/p1-project-view.tsx';
import { buildP1ProjectViewModel } from '../../../../features/projects/p1-project-model.ts';
import { AuthoritativeSnapshotReader } from '../../../../platform/authoritative-snapshot.ts';
import { requireClassRole } from '../../../../platform/auth/server-actor.ts';
import { getDatabase } from '../../../../platform/db/database.ts';

export const dynamic = 'force-dynamic';

export default async function P1ProjectPage() {
  const actor = await requireClassRole('student');
  const snapshot = new AuthoritativeSnapshotReader(getDatabase()).read(actor, 'student');
  const model = buildP1ProjectViewModel({
    ...snapshot.me.project,
    studentVersion: snapshot.me.studentVersion,
    snapshotVersion: snapshot.snapshotVersion,
  });
  return <P1ProjectView displayName={actor.displayName} model={model} />;
}

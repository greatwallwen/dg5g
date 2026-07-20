import { AuthenticatedGate } from '@/features/auth/role-gate';
import { projectGraphSnapshot } from '@/features/capability-map/graph-snapshot-model';
import { CourseOverview } from '@/features/textbook-scene/course-overview';
import { requireUser } from '@/platform/auth/server-actor';
import { AuthoritativeSnapshotReader } from '@/platform/authoritative-snapshot';
import { getDatabase } from '@/platform/db/database';
import { getCapabilityGraph } from '@/platform/mock-api';

export default async function CoursePage() {
  const actor = await requireUser();
  const graph = await getCapabilityGraph();
  const initialSnapshot = projectGraphSnapshot(new AuthoritativeSnapshotReader(getDatabase()).read(actor, 'graph'));
  return (
    <AuthenticatedGate>
      <CourseOverview displayName={actor.displayName} graph={graph} initialSnapshot={initialSnapshot} role={actor.role} />
    </AuthenticatedGate>
  );
}

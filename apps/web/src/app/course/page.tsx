import { AuthenticatedGate } from '@/features/auth/role-gate';
import { CourseOverview } from '@/features/textbook-scene/course-overview';
import { requireUser } from '@/platform/auth/server-actor';
import { getCapabilityGraph } from '@/platform/mock-api';

export default async function CoursePage() {
  const actor = await requireUser();
  const graph = await getCapabilityGraph();
  return (
    <AuthenticatedGate>
      <CourseOverview displayName={actor.displayName} graph={graph} role={actor.role} />
    </AuthenticatedGate>
  );
}

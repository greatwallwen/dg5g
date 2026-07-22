import { fetchAuthoritativeSnapshot } from '@/features/snapshot/authoritative-snapshot-client';
import type { LearningProgressSnapshot } from '@/features/skill-tree/skill-progress-client';
import { projectStudentLearningSnapshot } from '@/platform/learning-compatibility-projection';

export async function fetchStudentLearningCut(sessionId: string): Promise<LearningProgressSnapshot> {
  const studentCut = await fetchAuthoritativeSnapshot('student', sessionId);
  return projectStudentLearningSnapshot(studentCut.me.learning);
}

export function syncLearningUrl(nodeId: string): void {
  if (typeof window === 'undefined') return;
  const nextPath = `/learn/${nodeId}`;
  if (window.location.pathname === nextPath) return;
  window.history.pushState({ nodeId }, '', nextPath);
}

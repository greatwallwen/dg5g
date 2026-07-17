import { getFormalAssessmentDefinitionByVersion } from './formal-assessment-catalog.server.ts';
import type { StoredFormalAssessmentInstance } from './learning-repository.ts';

export function currentUserFormalAssessmentState(
  instances: StoredFormalAssessmentInstance[],
  nodeId: string,
): 'in-progress' | 'paused' | 'expired' | undefined {
  const current = instances.filter((instance) => {
    if (instance.nodeId !== nodeId || instance.origin !== 'user') return false;
    const definition = getFormalAssessmentDefinitionByVersion(nodeId, instance.questionVersion);
    return definition?.gameId === instance.gameId;
  }).at(-1);
  if (!current) return undefined;
  const expiresAt = current.expiresAt ? Date.parse(current.expiresAt) : Number.NaN;
  if (
    current.closureReason === 'expired'
    || current.closureReason === 'cancelled'
    || current.classroomRunStatus === 'expired'
    || current.classroomRunStatus === 'reviewing'
    || current.classroomRunStatus === 'closed'
    || (current.status === 'running' && Number.isFinite(expiresAt) && expiresAt <= Date.now())
  ) return 'expired';
  if (current.classroomRunStatus === 'paused') return 'paused';
  return current.status === 'running' ? 'in-progress' : undefined;
}

import type { SkillLearningEvent, SkillProgress } from '@/platform/models';
import type { ClassLearningSnapshot, StudentLearningSnapshot } from '@/platform/learning-read-model';
import {
  projectStudentLearningSnapshot,
  type LearningProgressSnapshot,
} from '@/platform/learning-compatibility-projection';

export type { ClassLearningSnapshot, StudentLearningSnapshot } from '@/platform/learning-read-model';
export { projectStudentLearningSnapshot } from '@/platform/learning-compatibility-projection';
export type { LearningProgressSnapshot } from '@/platform/learning-compatibility-projection';

export interface ClassLearningProgressSnapshot {
  classId: string;
  version: number;
  students: LearningProgressSnapshot[];
}

export type StudentWritableLearningEventType = Extract<
  SkillLearningEvent['type'],
  'section_completed' | 'classroom_submitted' | 'game_completed'
>;
export type StudentWritableLearningEvent = Omit<SkillLearningEvent, 'eventId' | 'studentId' | 'at' | 'type'>
  & Partial<Pick<SkillLearningEvent, 'eventId' | 'at'>>
  & { type: StudentWritableLearningEventType };

export class SkillProgressRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'SkillProgressRequestError';
    this.status = status;
  }
}

export async function fetchLearningProgress(): Promise<LearningProgressSnapshot> {
  const response = await fetch('/api/learning/me', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Skill progress request failed: ${response.status}`);
  return projectStudentLearningSnapshot(await response.json() as StudentLearningSnapshot);
}

export async function fetchSkillProgress(): Promise<SkillProgress[]> {
  return (await fetchLearningProgress()).progress;
}

export async function fetchClassLearningProgress(classId: string): Promise<ClassLearningProgressSnapshot> {
  const response = await fetch(`/api/learning/class/${encodeURIComponent(classId)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Class learning progress request failed: ${response.status}`);
  const body = await response.json() as ClassLearningSnapshot;
  return {
    classId: body.classId,
    version: body.version,
    students: body.students.map(projectStudentLearningSnapshot),
  };
}

export async function recordLearningEvent(
  event: StudentWritableLearningEvent,
  expectedVersion: number,
): Promise<LearningProgressSnapshot> {
  if (event.type === 'game_completed' && event.formal !== false) return recordFormalAttempt(event, expectedVersion);
  const payload = learningEventPayload(event);
  const response = await fetch(`/api/learning/nodes/${encodeURIComponent(event.nodeId)}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      eventId: event.eventId ?? globalThis.crypto.randomUUID(),
      channel: event.channel,
      eventType: event.type,
      ...(Object.keys(payload).length ? { payload } : {}),
      ...(event.at ? { occurredAt: event.at } : {}),
      expectedVersion,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new SkillProgressRequestError(body.error ?? `学习记录更新失败：${response.status}`, response.status);
  }
  return projectStudentLearningSnapshot(await response.json() as StudentLearningSnapshot);
}

export async function recordSkillEvent(
  event: StudentWritableLearningEvent,
  expectedVersion: number,
): Promise<LearningProgressSnapshot> {
  return recordLearningEvent(event, expectedVersion);
}

async function recordFormalAttempt(
  event: StudentWritableLearningEvent,
  expectedVersion: number,
): Promise<LearningProgressSnapshot> {
  const response = await fetch(`/api/learning/nodes/${encodeURIComponent(event.nodeId)}/attempts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      attemptId: event.attemptId ?? event.eventId ?? globalThis.crypto.randomUUID(),
      ...(event.gameId ? { gameId: event.gameId } : {}),
      score: event.score ?? 0,
      ...(event.durationSeconds === undefined ? {} : { durationSeconds: event.durationSeconds }),
      ...(event.mistakeKnowledgePointIds ? { mistakeKnowledgePointIds: event.mistakeKnowledgePointIds } : {}),
      ...(event.at ? { completedAt: event.at } : {}),
      expectedVersion,
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new SkillProgressRequestError(body.error ?? `Formal attempt update failed: ${response.status}`, response.status);
  }
  return projectStudentLearningSnapshot(await response.json() as StudentLearningSnapshot);
}

function learningEventPayload(event: StudentWritableLearningEvent): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of [
    'sectionId', 'taskId', 'score', 'stars', 'completed', 'mistakeKnowledgePointIds',
    'gameId', 'attemptId', 'durationSeconds', 'formal',
  ] as const) {
    if (event[key] !== undefined) payload[key] = event[key];
  }
  return payload;
}

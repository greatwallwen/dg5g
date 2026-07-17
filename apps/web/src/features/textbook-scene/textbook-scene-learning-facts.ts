import { recordLearningEvent, type LearningProgressSnapshot } from '@/features/skill-tree/skill-progress-client';
import type { P1TaskId } from '@/platform/learning-policy';

type ReadingSectionId = 'problem' | 'figure' | 'steps' | 'correction';

export async function persistReadingSection(input: {
  sectionId: ReadingSectionId;
  selectedNodeId: string;
  snapshot: LearningProgressSnapshot;
  taskId: P1TaskId;
  setSaving: (saving: boolean) => void;
  setSnapshot: (snapshot: LearningProgressSnapshot) => void;
}) {
  input.setSaving(true);
  try {
    input.setSnapshot(await recordLearningEvent({
      eventId: `${input.snapshot.studentId}:${input.selectedNodeId}:self-study:${input.sectionId}`,
      nodeId: input.selectedNodeId,
      taskId: input.taskId,
      channel: 'self-study',
      type: 'section_completed',
      sectionId: input.sectionId,
      completed: true,
    }, input.snapshot.version));
  } finally {
    input.setSaving(false);
  }
}

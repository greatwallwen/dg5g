import type { ClassSession, StudentProgress } from './models';

type SessionPatchFields = Pick<ClassSession, 'currentPageId' | 'currentSlideId' | 'teacherSlideId' | 'teacherSlideIndex' | 'sceneMode' | 'activeTaskId' | 'activeNodeId' | 'activeUnitId' | 'lessonState' | 'studentMode' | 'studentSyncState' | 'syncRequestId' | 'handledSyncRequestId' | 'playbackCursor' | 'activityState' | 'submissionState' | 'submissionAnswers' | 'reviewState' | 'selfStudyState' | 'selfStudyAnswers' | 'selfStudyCompletedAt' | 'lastUpdatedAt' | 'studentRoster' | 'formalTest'>;
export type StudentProgressPatch = Pick<StudentProgress, 'studentId'> & Partial<Omit<StudentProgress, 'studentId'>>;
export type SessionPatch = Partial<SessionPatchFields> & { studentProgress?: StudentProgressPatch };
export type SessionRole = 'teacher' | 'student' | 'projector';
export type SessionMessage = { sourceRole: SessionRole; sourceId: string; patch: SessionPatch; revision: number };

const allowedByRole: Record<SessionRole, Array<keyof SessionPatch>> = {
  teacher: ['currentPageId', 'currentSlideId', 'teacherSlideId', 'teacherSlideIndex', 'sceneMode', 'activeTaskId', 'activeNodeId', 'activeUnitId', 'studentMode', 'studentSyncState', 'syncRequestId', 'playbackCursor', 'activityState', 'reviewState', 'studentProgress', 'formalTest'],
  student: [],
  projector: [],
};

export function normalizeSessionPatch(role: SessionRole, patch: SessionPatch): SessionPatch {
  const permitted = filterPatch(patch, allowedByRole[role]);
  if (role === 'teacher' && permitted.studentProgress) {
    const { handledSyncRequestId: _helperOwnedAcknowledgement, ...reviewProgress } = permitted.studentProgress;
    permitted.studentProgress = reviewProgress;
  }
  if (role === 'teacher' && permitted.teacherSlideId) permitted.currentSlideId = permitted.teacherSlideId;
  if (hasSessionPatch(permitted) && patch.lastUpdatedAt) permitted.lastUpdatedAt = patch.lastUpdatedAt;
  return permitted;
}

export function hasSessionPatch(patch: SessionPatch): boolean {
  return Object.keys(patch).length > 0;
}

export function parseSessionMessage(value: unknown): SessionMessage | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<SessionMessage>;
  if (!isSessionRole(candidate.sourceRole)) return null;
  if (!candidate.patch || typeof candidate.patch !== 'object') return null;
  return {
    sourceRole: candidate.sourceRole,
    sourceId: String(candidate.sourceId ?? ''),
    patch: candidate.patch,
    revision: Number(candidate.revision ?? 0),
  };
}

export function mergeSessionPatch(current: ClassSession, patch: SessionPatch): ClassSession {
  const { studentProgress, ...rest } = patch;
  const next = { ...current, ...rest };
  if (studentProgress) {
    const mergedProgress = mergeStudentProgress(current.studentRoster ?? [], studentProgress);
    if (mergedProgress) {
      next.studentRoster = current.studentRoster.map((student) => student.studentId === mergedProgress.studentId ? mergedProgress : student);
      next.studentProgress = mergedProgress;
    }
  }
  return next;
}

export function isSessionRole(value: unknown): value is SessionRole {
  return value === 'teacher' || value === 'student' || value === 'projector';
}

function mergeStudentProgress(roster: StudentProgress[], progress: StudentProgressPatch): StudentProgress | undefined {
  const current = roster.find((item) => item.studentId === progress.studentId);
  return current ? { ...current, ...progress } : undefined;
}

function filterPatch(patch: SessionPatch, allowed: Array<keyof SessionPatch>): SessionPatch {
  const next: SessionPatch = {};
  for (const key of allowed) {
    if (key in patch) next[key] = patch[key] as never;
  }
  return next;
}

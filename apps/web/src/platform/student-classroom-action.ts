import type { SessionPatch } from './class-session-protocol.ts';
import type { StudentMode } from './models.ts';

export type StudentClassroomAction =
  | {
      type: 'navigation_changed';
      mode: StudentMode;
      currentSlideIndex: number;
    }
  | {
      type: 'activity_submitted';
      answers: string[];
      mode: StudentMode;
      currentSlideIndex: number;
    }
  | { type: 'refresh' };

export function parseStudentClassroomAction(value: unknown): StudentClassroomAction | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  if (value.type === 'refresh') {
    return hasExactKeys(value, ['type']) ? { type: 'refresh' } : null;
  }
  if (value.type === 'navigation_changed') {
    if (!hasExactKeys(value, ['type', 'mode', 'currentSlideIndex'])) return null;
    if (!isStudentMode(value.mode) || !isSlideIndex(value.currentSlideIndex)) return null;
    return {
      type: 'navigation_changed',
      mode: value.mode,
      currentSlideIndex: value.currentSlideIndex,
    };
  }
  if (value.type === 'activity_submitted') {
    if (!hasExactKeys(value, ['type', 'answers', 'mode', 'currentSlideIndex'])) return null;
    if (!isStudentMode(value.mode) || !isSlideIndex(value.currentSlideIndex)) return null;
    if (!Array.isArray(value.answers) || value.answers.length < 1 || value.answers.length > 20) return null;
    if (!value.answers.every((answer) => typeof answer === 'string' && answer.trim().length > 0 && answer.length <= 2_000)) return null;
    return {
      type: 'activity_submitted',
      answers: [...value.answers],
      mode: value.mode,
      currentSlideIndex: value.currentSlideIndex,
    };
  }
  return null;
}

export function studentClassroomActionFromPatch(patch: SessionPatch): StudentClassroomAction | null {
  const progress = patch.studentProgress;
  const mode = isStudentMode(progress?.mode) ? progress.mode : undefined;
  const currentSlideIndex = isSlideIndex(progress?.currentSlideIndex) ? progress.currentSlideIndex : undefined;
  if (Array.isArray(patch.submissionAnswers)) {
    if (!mode || currentSlideIndex === undefined) return null;
    return parseStudentClassroomAction({
      type: 'activity_submitted',
      answers: patch.submissionAnswers,
      mode,
      currentSlideIndex,
    });
  }
  if (mode && currentSlideIndex !== undefined) {
    return {
      type: 'navigation_changed',
      mode,
      currentSlideIndex,
    };
  }
  return progress ? { type: 'refresh' } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]);
}

function isStudentMode(value: unknown): value is StudentMode {
  return value === 'follow' || value === 'self';
}

function isSlideIndex(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 500;
}

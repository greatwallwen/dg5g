import { getNodeLearningPolicy } from './learning-policy.ts';

export type ClassroomLessonId = 'P01-L1' | 'P01-L2' | 'P02-L1' | 'P03-L1';
export type ClassroomLessonRunStatus = 'preparing' | 'active' | 'paused' | 'closed';
export type TeachingCursorPhase = 'lecture' | 'question' | 'practice' | 'assessment' | 'review' | 'close';
export type TeachingPlaybackStatus = 'idle' | 'playing' | 'paused' | 'ended';
export type TeachingAudioOwner = 'teacher' | 'projector';

export interface TeachingCursor {
  lessonRunId: string;
  lessonId: ClassroomLessonId;
  taskId: 'P01' | 'P02' | 'P03';
  nodeId: string;
  unitId: string;
  pageId: string;
  pageIndex: number;
  phase: TeachingCursorPhase;
  actionId: string;
  actionIndex: number;
  playbackStatus: TeachingPlaybackStatus;
  positionMs: number;
  rate: number;
  audioOwner: TeachingAudioOwner;
  revision: number;
  updatedAt: string;
}

export interface TeachingLessonAnchor {
  lessonId: ClassroomLessonId;
  taskId: TeachingCursor['taskId'];
  nodeId: string;
  unitId: string;
  pageId: string;
}

const lessonAnchors: Readonly<Record<ClassroomLessonId, TeachingLessonAnchor>> = {
  'P01-L1': {
    lessonId: 'P01-L1',
    taskId: 'P01',
    nodeId: 'P1T1-N01',
    unitId: 'P01-ku-01',
    pageId: 'P01-L1-P01',
  },
  'P01-L2': {
    lessonId: 'P01-L2',
    taskId: 'P01',
    nodeId: 'P1T1-N02',
    unitId: 'P01-ku-02',
    pageId: 'P01-L2-P01',
  },
  'P02-L1': {
    lessonId: 'P02-L1',
    taskId: 'P02',
    nodeId: 'P1T2-N01',
    unitId: 'P02-ku-01',
    pageId: 'P02-L1-P01',
  },
  'P03-L1': {
    lessonId: 'P03-L1',
    taskId: 'P03',
    nodeId: 'P1T3-N01',
    unitId: 'P03-ku-01',
    pageId: 'P03-L1-P01',
  },
};

const cursorKeys = [
  'lessonRunId',
  'lessonId',
  'taskId',
  'nodeId',
  'unitId',
  'pageId',
  'pageIndex',
  'phase',
  'actionId',
  'actionIndex',
  'playbackStatus',
  'positionMs',
  'rate',
  'audioOwner',
  'revision',
  'updatedAt',
] as const satisfies readonly (keyof TeachingCursor)[];

export function lessonAnchorFor(lessonId: ClassroomLessonId): TeachingLessonAnchor {
  return lessonAnchors[lessonId];
}

export function isClassroomLessonId(value: unknown): value is ClassroomLessonId {
  return typeof value === 'string' && value in lessonAnchors;
}

export function createInitialTeachingCursor(input: {
  lessonRunId: string;
  lessonId: ClassroomLessonId;
  revision: number;
  now?: Date;
}): TeachingCursor {
  const lessonRunId = input.lessonRunId.trim();
  if (!lessonRunId) throw new TypeError('Teaching cursor requires a lesson run id.');
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    throw new TypeError('Teaching cursor revision must be a safe non-negative integer.');
  }
  const anchor = lessonAnchorFor(input.lessonId);
  const updatedAt = (input.now ?? new Date()).toISOString();
  return {
    lessonRunId,
    lessonId: anchor.lessonId,
    taskId: anchor.taskId,
    nodeId: anchor.nodeId,
    unitId: anchor.unitId,
    pageId: anchor.pageId,
    pageIndex: 0,
    phase: 'lecture',
    actionId: `${anchor.nodeId}-S01`,
    actionIndex: 0,
    playbackStatus: 'idle',
    positionMs: 0,
    rate: 1,
    audioOwner: 'teacher',
    revision: input.revision,
    updatedAt,
  };
}

export function parseTeachingCursor(
  value: unknown,
  options: { expectedLessonRunId?: string } = {},
): TeachingCursor | undefined {
  if (!isRecord(value) || !hasExactCursorKeys(value)) return undefined;
  if (!isNonEmptyString(value.lessonRunId)
    || !isClassroomLessonId(value.lessonId)
    || !isTaskId(value.taskId)
    || !isNonEmptyString(value.nodeId)
    || !isNonEmptyString(value.unitId)
    || !isNonEmptyString(value.pageId)
    || !isSafeNonNegativeInteger(value.pageIndex)
    || !isTeachingCursorPhase(value.phase)
    || !isNonEmptyString(value.actionId)
    || !isSafeNonNegativeInteger(value.actionIndex)
    || !isTeachingPlaybackStatus(value.playbackStatus)
    || !isFiniteNonNegativeNumber(value.positionMs)
    || !isPlaybackRate(value.rate)
    || !isTeachingAudioOwner(value.audioOwner)
    || !isSafeNonNegativeInteger(value.revision)
    || !isValidIsoDate(value.updatedAt)) return undefined;
  const anchor = lessonAnchorFor(value.lessonId);
  const nodePolicy = getNodeLearningPolicy(value.nodeId);
  if (value.taskId !== anchor.taskId
    || nodePolicy?.taskId !== value.taskId
    || value.unitId !== `${value.taskId}-ku-${value.nodeId.slice(-2)}`
    || !value.pageId.startsWith(`${value.lessonId}-P`)
    || (options.expectedLessonRunId !== undefined
      && value.lessonRunId !== options.expectedLessonRunId)) return undefined;
  return value as unknown as TeachingCursor;
}

export function parseTeachingCursorJson(source: string): TeachingCursor | undefined {
  try {
    return parseTeachingCursor(JSON.parse(source) as unknown);
  } catch {
    return undefined;
  }
}

export function resolveCanonicalActivityId(
  cursor: Pick<TeachingCursor, 'nodeId' | 'actionId'>,
): string | undefined {
  const policy = getNodeLearningPolicy(cursor.nodeId);
  return policy?.requiredActivityIds.includes(cursor.actionId)
    ? cursor.actionId
    : undefined;
}

function hasExactCursorKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return keys.length === cursorKeys.length && cursorKeys.every((key) => key in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTaskId(value: unknown): value is TeachingCursor['taskId'] {
  return value === 'P01' || value === 'P02' || value === 'P03';
}

function isTeachingCursorPhase(value: unknown): value is TeachingCursorPhase {
  return value === 'lecture' || value === 'question' || value === 'practice'
    || value === 'assessment' || value === 'review' || value === 'close';
}

function isTeachingPlaybackStatus(value: unknown): value is TeachingPlaybackStatus {
  return value === 'idle' || value === 'playing' || value === 'paused' || value === 'ended';
}

function isTeachingAudioOwner(value: unknown): value is TeachingAudioOwner {
  return value === 'teacher' || value === 'projector';
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPlaybackRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0.5 && value <= 2;
}

function isValidIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

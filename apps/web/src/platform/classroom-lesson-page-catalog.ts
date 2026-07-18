import {
  p1TeachingPackage,
  type P1FormalAssessmentTarget,
  type P1ProfessionalOutputTarget,
  type P1TeachingLessonId,
  type P1TeachingTaskId,
} from '../features/textbook-scene/p1-teaching-package.ts';
import type { TeachingCursor, TeachingCursorPhase } from './teaching-cursor.ts';

export interface ClassroomLessonPageMetadata {
  lessonId: P1TeachingLessonId;
  taskId: P1TeachingTaskId;
  nodeId: string;
  unitId: string;
  pageId: string;
  pageIndex: number;
  actionId: string;
  actionIndex: number;
  canonicalActivityIds: readonly string[];
  formalAssessment?: P1FormalAssessmentTarget;
  professionalOutput?: P1ProfessionalOutputTarget;
}

export interface ResolvedClassroomLessonPage extends ClassroomLessonPageMetadata {
  phase: TeachingCursorPhase;
}

export type ClassroomLessonPagePosition = Pick<
  TeachingCursor,
  'lessonId' | 'pageId' | 'pageIndex' | 'phase' | 'actionId' | 'actionIndex'
> & Partial<Pick<TeachingCursor, 'taskId' | 'nodeId' | 'unitId'>>;

const lessonPageCatalog = new Map<P1TeachingLessonId, readonly ClassroomLessonPageMetadata[]>(
  p1TeachingPackage.map((lesson) => [
    lesson.id,
    lesson.pages.map((page, pageIndex) => ({
      lessonId: lesson.id,
      taskId: page.taskId,
      nodeId: page.nodeId,
      unitId: `${page.taskId}-ku-${page.nodeId.slice(-2)}`,
      pageId: page.id,
      pageIndex,
      actionId: `${page.nodeId}-S${String(pageIndex + 1).padStart(2, '0')}`,
      actionIndex: pageIndex,
      canonicalActivityIds: [...page.canonicalActivityIds],
      ...(page.formalAssessment ? { formalAssessment: page.formalAssessment } : {}),
      ...(page.professionalOutput ? { professionalOutput: page.professionalOutput } : {}),
    })),
  ]),
);

const lessonPageCountsByNodeId = new Map<string, Set<number>>();
for (const pages of lessonPageCatalog.values()) {
  for (const page of pages) {
    const counts = lessonPageCountsByNodeId.get(page.nodeId) ?? new Set<number>();
    counts.add(pages.length);
    lessonPageCountsByNodeId.set(page.nodeId, counts);
  }
}

/** Client-safe page catalog: contains no fixture, database, or native imports. */
export function classroomLessonPageCountFromCatalog(
  lessonIdOrNodeId: string,
  fallbackCount = 1,
): number {
  const lessonPages = lessonPageCatalog.get(lessonIdOrNodeId as P1TeachingLessonId);
  if (lessonPages) return lessonPages.length;
  const nodeCounts = lessonPageCountsByNodeId.get(lessonIdOrNodeId);
  if (nodeCounts?.size === 1) return [...nodeCounts][0]!;
  return Number.isFinite(fallbackCount)
    ? Math.max(1, Math.trunc(fallbackCount))
    : 1;
}

export function classroomLessonPageFor(
  lessonId: P1TeachingLessonId,
  pageIndex: number,
): ClassroomLessonPageMetadata | undefined {
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0) return undefined;
  return lessonPageCatalog.get(lessonId)?.[pageIndex];
}

export function resolveClassroomLessonPage(
  position: ClassroomLessonPagePosition,
): ResolvedClassroomLessonPage | undefined {
  if (!isTeachingCursorPhase(position.phase)) return undefined;
  const page = classroomLessonPageFor(position.lessonId, position.pageIndex);
  if (!page
    || page.pageId !== position.pageId
    || page.actionId !== position.actionId
    || page.actionIndex !== position.actionIndex
    || (position.taskId !== undefined && page.taskId !== position.taskId)
    || (position.nodeId !== undefined && page.nodeId !== position.nodeId)
    || (position.unitId !== undefined && page.unitId !== position.unitId)) return undefined;
  return { ...page, phase: position.phase };
}

function isTeachingCursorPhase(value: unknown): value is TeachingCursorPhase {
  return value === 'lecture' || value === 'question' || value === 'practice'
    || value === 'assessment' || value === 'review' || value === 'close';
}

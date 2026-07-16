const expandedLessonPageCounts: Readonly<Record<string, number>> = {
  // P01 N02 is the two-period, twelve-page reference teaching package.
  'P1T1-N02': 12,
};

/** Client-safe page catalog: contains no fixture, database, or native imports. */
export function classroomLessonPageCountFromCatalog(nodeId: string, fallbackCount: number): number {
  return expandedLessonPageCounts[nodeId] ?? Math.max(1, Math.trunc(fallbackCount));
}

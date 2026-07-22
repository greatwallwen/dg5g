import { sessionProfiles } from './fixtures/session-profiles.ts';

const expandedLessonPageCounts: Readonly<Record<string, number>> = {
  // P01 N02 is the two-period, twelve-page reference teaching package.
  'P1T1-N02': 12,
};

/** Shared page count derived from the same classroom profile declarations used to build teaching pages. */
export function classroomLessonPageCountFromCatalog(nodeId: string, fallbackCount: number): number {
  const declaredSlides = (sessionProfiles as Record<string, { slides: readonly unknown[] } | undefined>)[nodeId]?.slides.length;
  return expandedLessonPageCounts[nodeId]
    ?? declaredSlides
    ?? Math.max(1, Math.trunc(fallbackCount));
}

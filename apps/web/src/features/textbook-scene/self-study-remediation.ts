import {
  selfStudySectionDefinitions,
  type SelfStudyDocument,
  type SelfStudySectionId,
} from './self-study-types.ts';

export type SelfStudyNavigationTarget =
  | { kind: 'default' }
  | { kind: 'invalid' }
  | { kind: 'target'; sectionId: SelfStudySectionId; activityId?: string };

export function resolveSelfStudyNavigationTarget(
  document: SelfStudyDocument,
  query: { section?: string; activityId?: string },
): SelfStudyNavigationTarget {
  if (query.section === undefined && query.activityId === undefined) return { kind: 'default' };
  const sectionId = selfStudySectionDefinitions
    .find(({ id }) => id === query.section)?.id;
  if (!sectionId) return { kind: 'invalid' };
  if (query.activityId === undefined) return { kind: 'target', sectionId };
  if (sectionId !== 'practice' || !practiceIdsForDocument(document).includes(query.activityId)) {
    return { kind: 'invalid' };
  }
  return { kind: 'target', sectionId, activityId: query.activityId };
}

export function practiceIdsForDocument(document: SelfStudyDocument): string[] {
  const { content } = document;
  return content.kind === 'standard'
    ? content.microPractice.map(({ id }) => id)
    : [
      ...content.practices.foundation,
      ...content.practices.application,
      ...content.practices.transfer,
    ].map(({ id }) => id);
}

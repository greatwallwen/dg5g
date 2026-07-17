'use client';

import type {
  SelfStudyCursor,
  SelfStudyCursorDraft,
} from '../../platform/self-study-cursor-repository.ts';
import type { SelfStudySectionId } from './self-study-types.ts';

export class SelfStudyCursorClientError extends Error {
  override readonly name = 'SelfStudyCursorClientError';

  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function createSelfStudyCursorClient(fetchImpl: FetchLike = fetch) {
  return {
    read(nodeId: string) {
      return request(fetchImpl, nodeId, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
    },
    save(nodeId: string, draft: SelfStudyCursorDraft) {
      return request(fetchImpl, nodeId, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
    },
  };
}

export function readSelfStudyCursor(nodeId: string): Promise<SelfStudyCursor> {
  return createSelfStudyCursorClient().read(nodeId);
}

export function saveSelfStudyCursor(
  nodeId: string,
  draft: SelfStudyCursorDraft,
): Promise<SelfStudyCursor> {
  return createSelfStudyCursorClient().save(nodeId, draft);
}

const canonicalSectionIds = new Set<SelfStudySectionId>([
  'problem', 'figure', 'steps', 'correction', 'practice', 'output',
]);

export function selfStudySectionFromCursor(
  cursor: Pick<SelfStudyCursor, 'actionId'>,
): SelfStudySectionId | undefined {
  const actionId = cursor.actionId;
  if (!actionId) return undefined;
  if (canonicalSectionIds.has(actionId as SelfStudySectionId)) {
    return actionId as SelfStudySectionId;
  }
  if (/(?:lesson|learning)-(?:case|problem)$/.test(actionId)) return 'problem';
  if (/(?:lesson|learning)-(?:visual|evidence|figure)$/.test(actionId)) return 'figure';
  if (/(?:lesson|learning)-(?:procedure|example|steps)$/.test(actionId)) return 'steps';
  if (/(?:lesson|learning)-correction$/.test(actionId)) return 'correction';
  if (/(?:lesson|learning)-practice$/.test(actionId)) return 'practice';
  if (/(?:lesson|learning)-output$/.test(actionId)) return 'output';
  return undefined;
}

async function request(fetchImpl: FetchLike, nodeId: string, init: RequestInit): Promise<SelfStudyCursor> {
  const response = await fetchImpl(`/api/self-study/cursors/${encodeURIComponent(nodeId)}`, init);
  const body = await response.json().catch(() => ({})) as { cursor?: SelfStudyCursor; error?: string };
  if (!response.ok) {
    throw new SelfStudyCursorClientError(
      body.error ?? `Self-study cursor request failed (${response.status})`,
      response.status,
    );
  }
  if (!body.cursor) throw new SelfStudyCursorClientError('Self-study cursor response is incomplete', 502);
  return body.cursor;
}

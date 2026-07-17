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
    save(nodeId: string, draft: SelfStudyCursorDraft, mutationAt?: string) {
      return request(fetchImpl, nodeId, {
        method: 'PUT',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          ...(mutationAt === undefined ? {} : { mutationAt }),
        }),
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
  mutationAt?: string,
): Promise<SelfStudyCursor> {
  return createSelfStudyCursorClient().save(nodeId, draft, mutationAt);
}

export function createSelfStudyCursorPersistenceCoordinator(
  persist: (nodeId: string, draft: SelfStudyCursorDraft, mutationAt: string) => Promise<unknown>,
  now: () => number = Date.now,
) {
  let interactionRevision = 0;
  let lastMutationMs = 0;
  let queued: {
    nodeId: string;
    draft: SelfStudyCursorDraft;
    mutationAt: string;
  } | undefined;
  let running = false;
  let waiters: Array<() => void> = [];

  async function drain() {
    running = true;
    while (queued) {
      const current = queued;
      queued = undefined;
      try {
        await persist(current.nodeId, current.draft, current.mutationAt);
      } catch {
        // Reading navigation remains usable while an unavailable server is retried
        // by the next cursor write. Never allow an older request to overtake it.
      }
    }
    running = false;
    const completed = waiters;
    waiters = [];
    for (const resolve of completed) resolve();
  }

  return {
    markLocalInteraction() {
      interactionRevision += 1;
    },
    hasLocalInteraction() {
      return interactionRevision > 0;
    },
    async restore<T>(pending: Promise<T>): Promise<T | undefined> {
      const revisionAtStart = interactionRevision;
      const restored = await pending;
      return revisionAtStart === interactionRevision ? restored : undefined;
    },
    schedule(nodeId: string, draft: SelfStudyCursorDraft): Promise<void> {
      queued = { nodeId, draft, mutationAt: nextMutationAt() };
      const settled = new Promise<void>((resolve) => { waiters.push(resolve); });
      if (!running) void drain();
      return settled;
    },
    async flush(nodeId: string, draft: SelfStudyCursorDraft): Promise<void> {
      queued = undefined;
      try {
        await persist(nodeId, draft, nextMutationAt());
      } catch {
        // Unload persistence is best effort, but it is dispatched immediately.
      }
    },
  };

  function nextMutationAt(): string {
    lastMutationMs = Math.max(now(), lastMutationMs + 1);
    return new Date(lastMutationMs).toISOString();
  }
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

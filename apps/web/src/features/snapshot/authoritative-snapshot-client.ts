'use client';

import { useEffect, useState } from 'react';
import type {
  AuthoritativeSnapshot,
  SnapshotAudience,
} from '@/platform/authoritative-snapshot.ts';

type AudienceSnapshot<Audience extends SnapshotAudience> = Extract<
  AuthoritativeSnapshot,
  { audience: Audience }
>;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function fetchAuthoritativeSnapshot<Audience extends SnapshotAudience>(
  audience: Audience,
  sessionId: string,
  fetchImpl: FetchLike = fetch,
): Promise<AudienceSnapshot<Audience>> {
  const search = new URLSearchParams({ audience, sessionId });
  const response = await fetchImpl(`/api/snapshot?${search.toString()}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  const body = await response.json().catch(() => ({})) as {
    audience?: unknown;
    error?: unknown;
  };
  if (!response.ok) {
    const detail = typeof body.error === 'string' ? `: ${body.error}` : '';
    throw new Error(`Snapshot request failed (${response.status})${detail}`);
  }
  if (body.audience !== audience) throw new Error('Snapshot response audience mismatch.');
  return body as AudienceSnapshot<Audience>;
}

export function useAuthoritativeSnapshot<Audience extends SnapshotAudience>(
  initialSnapshot: AudienceSnapshot<Audience>,
  audience: Audience,
  sessionId: string,
  intervalMs = 1_500,
): AudienceSnapshot<Audience> {
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const next = await fetchAuthoritativeSnapshot(audience, sessionId);
        if (active) setSnapshot(next);
      } catch {
        // Keep the last complete authoritative cut during a transient poll failure.
      }
    }
    const timer = window.setInterval(() => void refresh(), intervalMs);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [audience, intervalMs, sessionId]);

  return snapshot;
}

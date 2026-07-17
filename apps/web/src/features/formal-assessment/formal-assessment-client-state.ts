import type { AssessmentDraftAnswers } from '@/platform/formal-assessment-contract';

interface DraftSaveCoordinatorOptions {
  initialRevision: number;
  save: (
    answers: AssessmentDraftAnswers,
    expectedRevision: number,
  ) => Promise<{ revision: number }>;
  onError?: (error: unknown) => void;
}

export interface DraftSaveCoordinator {
  schedule: (answers: AssessmentDraftAnswers) => void;
  retry: () => void;
  whenIdle: () => Promise<void>;
  revision: () => number;
}

export function createDraftSaveCoordinator(
  options: DraftSaveCoordinatorOptions,
): DraftSaveCoordinator {
  let revision = options.initialRevision;
  let pending: AssessmentDraftAnswers | undefined;
  let running = false;
  let stoppedAfterError = false;
  let idleResolvers: Array<() => void> = [];

  const resolveIdle = () => {
    const resolvers = idleResolvers;
    idleResolvers = [];
    resolvers.forEach((resolve) => resolve());
  };
  const drain = async () => {
    running = true;
    stoppedAfterError = false;
    while (pending) {
      const answers = pending;
      pending = undefined;
      try {
        const saved = await options.save(answers, revision);
        revision = saved.revision;
      } catch (error) {
        pending ??= answers;
        stoppedAfterError = true;
        options.onError?.(error);
        break;
      }
    }
    running = false;
    resolveIdle();
  };

  return {
    schedule(answers) {
      pending = answers;
      if (!running) void drain();
    },
    retry() {
      if (!running && pending && stoppedAfterError) void drain();
    },
    whenIdle() {
      if (!running) return Promise.resolve();
      return new Promise<void>((resolve) => idleResolvers.push(resolve));
    },
    revision: () => revision,
  };
}

export function remainingAssessmentSeconds(
  expiresAt: string,
  serverNow: string,
  performanceElapsedMs: number,
): number {
  const remainingMs = Date.parse(expiresAt) - Date.parse(serverNow) - performanceElapsedMs;
  if (!Number.isFinite(remainingMs)) return 0;
  return Math.max(0, Math.ceil(remainingMs / 1_000));
}

export function formatAssessmentTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

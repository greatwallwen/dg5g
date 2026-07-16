export type PollTier = 'active' | 'passive';
export type ClassroomPollingRole = 'teacher' | 'student' | 'projector';
export type RevisionDisposition = 'stale' | 'equal' | 'newer';

const POLL_INTERVALS: Record<PollTier, number> = {
  active: 1000,
  passive: 15000,
};

export interface PollClock {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timerId: number): void;
}

export interface ClassSessionPoller {
  start(): void;
  refreshNow(): void;
  stop(): void;
}

export function pollIntervalFor(tier: PollTier): number {
  return POLL_INTERVALS[tier];
}

export function resolvePollTier(input: {
  role: ClassroomPollingRole;
  visible: boolean;
  online: boolean;
  participationMode?: 'follow' | 'self';
  sessionStatus?: 'preparing' | 'active' | 'paused' | 'closed';
}): PollTier {
  if (!input.visible || !input.online) return 'passive';
  if (input.sessionStatus && input.sessionStatus !== 'active') return 'passive';
  if (input.role === 'student' && input.participationMode !== 'follow') return 'passive';
  return 'active';
}

export function classifyRevision(currentRevision: number, incomingRevision: number): RevisionDisposition {
  if (incomingRevision < currentRevision) return 'stale';
  if (incomingRevision === currentRevision) return 'equal';
  return 'newer';
}

export function createClassSessionPoller(input: {
  clock: PollClock;
  getTier: () => PollTier;
  poll: () => Promise<void>;
}): ClassSessionPoller {
  let running = false;
  let inFlight = false;
  let refreshQueued = false;
  let timerId: number | undefined;

  const clearTimer = () => {
    if (timerId === undefined) return;
    input.clock.clearTimeout(timerId);
    timerId = undefined;
  };

  const schedule = () => {
    clearTimer();
    if (!running) return;
    timerId = input.clock.setTimeout(() => {
      timerId = undefined;
      void run();
    }, pollIntervalFor(input.getTier()));
  };

  const run = async () => {
    if (!running) return;
    if (inFlight) {
      refreshQueued = true;
      return;
    }
    inFlight = true;
    try {
      await input.poll();
    } finally {
      inFlight = false;
      if (!running) return;
      if (refreshQueued) {
        refreshQueued = false;
        void run();
      } else {
        schedule();
      }
    }
  };

  return {
    start() {
      if (running) return;
      running = true;
      void run();
    },
    refreshNow() {
      if (!running) return;
      clearTimer();
      if (inFlight) refreshQueued = true;
      else void run();
    },
    stop() {
      running = false;
      refreshQueued = false;
      clearTimer();
    },
  };
}

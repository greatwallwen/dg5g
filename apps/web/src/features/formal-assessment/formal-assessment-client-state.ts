import type {
  ActiveIssuedAssessmentPaper,
  AssessmentDiagnosis,
  AssessmentDraftAnswers,
  AssessmentDraftDto,
  IssuedAssessmentPaper,
  IssuedAssessmentSnapshot,
  SubmittedIssuedAssessmentPaper,
} from '@/platform/formal-assessment-contract';

export type PausedIssuedAssessment = IssuedAssessmentSnapshot & {
  state: 'paused';
  attemptToken?: never;
};

export type ExpiredIssuedAssessment = IssuedAssessmentSnapshot & {
  state: 'expired';
  attemptToken?: never;
};

export type AttemptIssuedAssessment = ActiveIssuedAssessmentPaper
  | ExpiredIssuedAssessment
  | SubmittedIssuedAssessmentPaper;
export type ClassroomIssuedAssessment = ActiveIssuedAssessmentPaper
  | PausedIssuedAssessment
  | ExpiredIssuedAssessment
  | SubmittedIssuedAssessmentPaper;
export type ResumedIssuedAssessment = ActiveIssuedAssessmentPaper | SubmittedIssuedAssessmentPaper;

export function isAssessmentAttemptActive(
  attemptToken: string | undefined,
  expired: boolean,
  resultFormed: boolean,
): attemptToken is string {
  return Boolean(attemptToken) && !expired && !resultFormed;
}

export function isPausedIssuedAssessment(
  issued: IssuedAssessmentPaper,
): issued is PausedIssuedAssessment {
  return issued.state === 'paused';
}

export function isAttemptIssuedAssessment(
  issued: IssuedAssessmentPaper,
): issued is AttemptIssuedAssessment {
  return issued.state === 'in-progress' || issued.state === 'expired' || issued.state === 'submitted';
}

export function pauseIssuedAssessment(
  issued: ActiveIssuedAssessmentPaper,
  draft: AssessmentDraftDto,
  timing: { serverNow: string; expiresAt: string },
): PausedIssuedAssessment {
  const { attemptToken: _attemptToken, ...withoutToken } = issued;
  return {
    ...withoutToken,
    ...timing,
    draft,
    state: 'paused',
  };
}

export function expireIssuedAssessment(
  issued: ActiveIssuedAssessmentPaper | PausedIssuedAssessment,
  draft: AssessmentDraftDto,
  timing: { serverNow: string; expiresAt: string },
): ExpiredIssuedAssessment {
  const { attemptToken: _attemptToken, ...withoutToken } = issued;
  return {
    ...withoutToken,
    ...timing,
    draft,
    state: 'expired',
  };
}

export function adoptSubmittedAssessmentResult(
  issued: ActiveIssuedAssessmentPaper,
  result: AssessmentDiagnosis,
): SubmittedIssuedAssessmentPaper {
  if (result.assessmentId !== issued.assessmentId) {
    throw new Error('Submitted assessment result must keep the same assessment id.');
  }
  const { attemptToken: _attemptToken, ...withoutToken } = issued;
  return { ...withoutToken, state: 'submitted', result };
}

export function projectClassroomIssuedAssessment(input: {
  classroomRunId: string;
  currentIssued: ClassroomIssuedAssessment;
  observation: ClassroomAssessmentRunObservation;
  savedDraft: AssessmentDraftDto;
  submissionPending?: boolean;
  timing: { serverNow: string; expiresAt: string };
}): ClassroomIssuedAssessment {
  const sameRun = input.observation.runId === input.classroomRunId;
  if (sameRun && input.submissionPending && input.currentIssued.state === 'in-progress') {
    return input.currentIssued;
  }
  if (sameRun && input.observation.status === 'running') return input.currentIssued;
  if (sameRun && input.observation.status === 'paused') {
    return input.currentIssued.state === 'in-progress'
      ? pauseIssuedAssessment(input.currentIssued, input.savedDraft, input.timing)
      : input.currentIssued;
  }
  return input.currentIssued.state === 'expired' || input.currentIssued.state === 'submitted'
    ? input.currentIssued
    : expireIssuedAssessment(input.currentIssued, input.savedDraft, input.timing);
}

export interface ClassroomAssessmentRunObservation {
  runId?: string;
  status: 'idle' | 'running' | 'paused' | 'reviewing' | 'closed' | 'expired';
}

export interface ClassroomAssessmentResumeCoordinator {
  observe(
    observation: ClassroomAssessmentRunObservation,
  ): Promise<ResumedIssuedAssessment | undefined>;
  retry(): Promise<ResumedIssuedAssessment | undefined>;
}

export function createClassroomAssessmentResumeCoordinator(options: {
  classroomRunId: string;
  paused: PausedIssuedAssessment;
  resume: () => Promise<IssuedAssessmentPaper>;
}): ClassroomAssessmentResumeCoordinator {
  let inFlight: Promise<ResumedIssuedAssessment | undefined> | undefined;
  let resumed: ResumedIssuedAssessment | undefined;
  let failed = false;
  let epoch = 0;
  let lastObservation: ClassroomAssessmentRunObservation | undefined;

  const isResumedRun = (observation: ClassroomAssessmentRunObservation | undefined) => (
    observation?.runId === options.classroomRunId && observation.status === 'running'
  );
  const requestResume = () => {
    if (resumed) return Promise.resolve(resumed);
    if (!inFlight) {
      const requestEpoch = epoch;
      const request = options.resume().then((issued) => {
        const validated = validateResumedAssessment(options.paused, issued);
        if (requestEpoch !== epoch || !isResumedRun(lastObservation)) return undefined;
        resumed = validated;
        return validated;
      }).catch((error) => {
        if (requestEpoch !== epoch || !isResumedRun(lastObservation)) return undefined;
        failed = true;
        throw error;
      });
      inFlight = request;
      void request.then(
        () => { if (inFlight === request) inFlight = undefined; },
        () => { if (inFlight === request) inFlight = undefined; },
      );
    }
    return inFlight;
  };

  return {
    observe(observation) {
      const wasResumedRun = isResumedRun(lastObservation);
      lastObservation = observation;
      if (!isResumedRun(observation)) {
        if (wasResumedRun || inFlight || resumed) {
          epoch += 1;
          inFlight = undefined;
          resumed = undefined;
          failed = false;
        }
        return Promise.resolve(undefined);
      }
      if (resumed) return Promise.resolve(resumed);
      if (failed) return Promise.resolve(undefined);
      return requestResume();
    },
    retry() {
      if (!failed || !isResumedRun(lastObservation)) return Promise.resolve(resumed);
      failed = false;
      return requestResume();
    },
  };
}

function validateResumedAssessment(
  paused: PausedIssuedAssessment,
  issued: IssuedAssessmentPaper,
): ResumedIssuedAssessment {
  if ((issued.state !== 'in-progress' && issued.state !== 'submitted')
    || issued.assessmentId !== paused.assessmentId
    || issued.state === 'submitted' && issued.result.assessmentId !== paused.assessmentId) {
    throw new Error('Resumed assessment must keep the same assessment id.');
  }
  if (issued.draft.revision < paused.draft.revision
    || issued.draft.revision === paused.draft.revision
      && !sameDraftAnswers(issued.draft.answers, paused.draft.answers)) {
    throw new Error('Resumed assessment cannot regress or rewrite the paused draft revision.');
  }
  return issued;
}

function sameDraftAnswers(left: AssessmentDraftAnswers, right: AssessmentDraftAnswers): boolean {
  return left.evidenceClassification === right.evidenceClassification
    && sameStringArray(left.linkReconstruction, right.linkReconstruction)
    && sameStringArray(left.defectiveOutputRevision, right.defectiveOutputRevision)
    && left.professionalConclusion?.confirmedFact === right.professionalConclusion?.confirmedFact
    && left.professionalConclusion?.evidenceGap === right.professionalConclusion?.evidenceGap
    && left.professionalConclusion?.risk === right.professionalConclusion?.risk
    && left.professionalConclusion?.action === right.professionalConclusion?.action;
}

function sameStringArray(left: string[] | undefined, right: string[] | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

interface DraftSaveCoordinatorOptions {
  initialRevision: number;
  save: (
    answers: AssessmentDraftAnswers,
    expectedRevision: number,
  ) => Promise<{ revision: number; retry?: boolean }>;
  onError?: (error: unknown) => void;
}

export interface DraftSaveCoordinator {
  schedule: (answers: AssessmentDraftAnswers) => void;
  retry: () => void;
  cancel: () => void;
  whenIdle: () => Promise<void>;
  revision: () => number;
}

export function createDraftSaveCoordinator(
  options: DraftSaveCoordinatorOptions,
): DraftSaveCoordinator {
  let revision = options.initialRevision;
  let pending: AssessmentDraftAnswers | undefined;
  let running = false;
  let cancelled = false;
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
    let rebasedOnce = false;
    while (pending) {
      const answers = pending;
      pending = undefined;
      try {
        const expectedRevision = revision;
        const saved = await options.save(answers, revision);
        if (cancelled) break;
        revision = saved.revision;
        if (saved.retry) {
          pending ??= answers;
          if (saved.revision <= expectedRevision || rebasedOnce) {
            stoppedAfterError = true;
            options.onError?.(new Error('Draft changed again while resolving a revision conflict.'));
            break;
          }
          rebasedOnce = true;
        } else {
          rebasedOnce = false;
        }
      } catch (error) {
        if (cancelled) break;
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
      if (cancelled) return;
      pending = answers;
      if (!running) void drain();
    },
    retry() {
      if (cancelled) return;
      if (!running && pending && stoppedAfterError) void drain();
    },
    cancel() {
      cancelled = true;
      pending = undefined;
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

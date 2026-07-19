import type { P1TaskId } from './learning-policy.ts';
import type {
  StoredLearningEvent,
  StoredProfessionalOutput,
  StudentLearningFacts,
} from './learning-repository.ts';

export type CurrentOutputState =
  | 'editing'
  | 'submitted'
  | 'returned'
  | 'revising'
  | 'resubmitted'
  | 'verified';

interface OutputReviewState {
  status: 'returned' | 'verified';
}

type ValidOutputSubmission = StoredLearningEvent & {
  payload: {
    taskId: P1TaskId;
    outputId: string;
    version: number;
    stateRevision: number;
  };
};

export function hasValidUserOutputSubmission(
  facts: StudentLearningFacts,
  taskId: P1TaskId,
  nodeId: string,
): boolean {
  return validBoundOutputSubmissions(facts, taskId, nodeId)
    .some(({ origin }) => origin === 'user');
}

export function hasValidPrerequisiteOutputSubmission(
  facts: StudentLearningFacts,
  taskId: P1TaskId,
  nodeId: string,
): boolean {
  return validBoundOutputSubmissions(facts, taskId, nodeId).length > 0;
}

export function currentOutputState(
  facts: StudentLearningFacts,
  taskId: P1TaskId,
  nodeId: string,
  output: StoredProfessionalOutput | undefined,
  review: OutputReviewState | undefined,
): CurrentOutputState {
  if (!output) return 'editing';
  const currentSubmissions = validBoundOutputSubmissions(facts, taskId, nodeId)
    .filter((event) => (
      event.origin === 'user'
      && event.payload.outputId === output.outputId
      && event.payload.version === output.currentVersion
    ));
  const hasReturnedRevision = facts.reviews.some((candidate) => (
    candidate.origin === 'user'
    && candidate.outputId === output.outputId
    && candidate.status === 'returned'
    && candidate.outputVersion !== undefined
    && candidate.outputVersion <= output.currentVersion
    && hasPersistedOutputVersion(facts, output, taskId, candidate.outputVersion)
  ));
  if (output.status === 'draft') return hasReturnedRevision ? 'revising' : 'editing';
  if (output.status === 'returned' || review?.status === 'returned') return 'returned';
  if (output.status === 'verified' && review?.status === 'verified') return 'verified';
  return currentSubmissions.length > 0 && hasReturnedRevision
    ? 'resubmitted'
    : 'submitted';
}

function validBoundOutputSubmissions(
  facts: StudentLearningFacts,
  taskId: P1TaskId,
  nodeId: string,
): ValidOutputSubmission[] {
  return validOutputSubmissions(facts.events, taskId, nodeId).filter((event) => (
    event.studentId === facts.studentId
    && facts.outputs.some((output) => outputSupportsSubmission(
      facts,
      output,
      event,
      taskId,
      nodeId,
    ))
  ));
}

function outputSupportsSubmission(
  facts: StudentLearningFacts,
  output: StoredProfessionalOutput,
  event: ValidOutputSubmission,
  taskId: P1TaskId,
  nodeId: string,
): boolean {
  if (
    output.studentId !== facts.studentId
    || output.outputId !== event.payload.outputId
    || output.taskId !== taskId
    || output.nodeId !== nodeId
    || output.origin !== event.origin
    || output.currentVersion < event.payload.version
    || output.stateRevision < event.payload.stateRevision
  ) return false;

  if (output.currentVersion > event.payload.version) {
    return output.stateRevision > event.payload.stateRevision
      && hasPersistedOutputVersion(facts, output, taskId, event.payload.version)
      && hasBoundReview(facts, output, event.payload.version, 'returned');
  }

  if (output.status === 'submitted') {
    return output.stateRevision === event.payload.stateRevision;
  }
  if (output.status === 'returned' || output.status === 'verified') {
    return output.stateRevision > event.payload.stateRevision
      && hasBoundReview(facts, output, event.payload.version, output.status);
  }
  return output.stateRevision > event.payload.stateRevision
    && hasBoundReview(facts, output, event.payload.version, 'returned');
}

function hasPersistedOutputVersion(
  facts: StudentLearningFacts,
  output: StoredProfessionalOutput,
  taskId: P1TaskId,
  version: number,
): boolean {
  return version === output.currentVersion || facts.outputVersions.some((candidate) => (
    candidate.outputId === output.outputId
    && candidate.taskId === taskId
    && candidate.version === version
  ));
}

function hasBoundReview(
  facts: StudentLearningFacts,
  output: StoredProfessionalOutput,
  version: number,
  status: 'returned' | 'verified',
): boolean {
  return facts.reviews.some((review) => (
    review.outputId === output.outputId
    && review.origin === output.origin
    && review.outputVersion === version
    && review.status === status
  ));
}

function validOutputSubmissions(
  events: StoredLearningEvent[],
  taskId: P1TaskId,
  nodeId: string,
): ValidOutputSubmission[] {
  return events.flatMap((event) => {
    if (
      event.nodeId !== nodeId
      || event.eventType !== 'evidence_submitted'
      || !isRecord(event.payload)
    ) return [];
    const valid = hasExactKeys(event.payload, ['taskId', 'outputId', 'version', 'stateRevision'])
      && event.payload.taskId === taskId
      && typeof event.payload.outputId === 'string'
      && event.payload.outputId.trim().length > 0
      && Number.isInteger(event.payload.version)
      && Number(event.payload.version) >= 1
      && Number.isInteger(event.payload.stateRevision)
      && Number(event.payload.stateRevision) >= 1;
    return valid ? [{
      ...event,
      payload: {
        taskId,
        outputId: event.payload.outputId as string,
        version: Number(event.payload.version),
        stateRevision: Number(event.payload.stateRevision),
      },
    }] : [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(record).length === keys.length && keys.every((key) => Object.hasOwn(record, key));
}

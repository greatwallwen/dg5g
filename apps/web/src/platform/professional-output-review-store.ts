import type { AppDatabase } from './db/database.ts';
import { calculateTaskCompositeScore } from './learning-mastery.ts';
import { SnapshotClock } from './snapshot-clock.ts';
import type {
  P1OutputTaskId,
  ProfessionalOutputFieldValue,
  ProfessionalOutputStatus,
} from './professional-output-repository.ts';

export type ProfessionalOutputReviewAction = 'return' | 'verify';
export type ProfessionalOutputRubricScores = Record<string, number>;

export interface ReviewProfessionalOutputInput {
  teacherId: string;
  classId: string;
  outputId: string;
  expectedStateRevision: number;
  action: ProfessionalOutputReviewAction;
  feedback?: string;
  rubricScores?: ProfessionalOutputRubricScores;
}

export interface ProfessionalOutputReview {
  reviewId: string;
  outputId: string;
  reviewerId: string;
  status: 'returned' | 'verified';
  score?: number;
  feedback?: string;
}

export interface FrozenTaskScore {
  studentId: string;
  taskId: P1OutputTaskId;
  snapshotVersion: number;
  provisionalScore: number;
  officialScore: number;
  details: {
    nodeId: string;
    nodeTestHighestScore: number;
    outputId: string;
    outputVersion: number;
    outputRubricScore: number;
    rubricScores: ProfessionalOutputRubricScores;
    taskCompositeScore: number;
    weights: { nodeTest: 0.4; professionalOutput: 0.6 };
  };
}

export interface ProfessionalOutputReviewQueueItem {
  outputId: string;
  studentId: string;
  studentName: string;
  taskId: P1OutputTaskId;
  nodeId: string;
  status: 'submitted';
  currentVersion: number;
  stateRevision: number;
  fields: Record<string, ProfessionalOutputFieldValue>;
}

export interface ProfessionalOutputPortfolioFact {
  taskId: P1OutputTaskId;
  outputId: string;
  currentVersion: number;
  stateRevision: number;
  status: ProfessionalOutputStatus;
  review?: Pick<ProfessionalOutputReview, 'reviewId' | 'status' | 'score' | 'feedback'>;
  frozenTaskScore?: {
    snapshotVersion: number;
    provisionalScore: number;
    officialScore: number | null;
    details: Record<string, unknown>;
  };
}

export interface ProfessionalOutputReviewMutation {
  review: ProfessionalOutputReview;
  outputIdentity: { outputId: string; studentId: string; taskId: P1OutputTaskId };
  frozenTaskScore?: FrozenTaskScore;
}

export class ProfessionalOutputStateRevisionConflictError extends Error {
  constructor(
    readonly outputId: string | undefined,
    readonly expectedStateRevision: number,
    readonly actualStateRevision: number,
  ) {
    super(`Professional output state revision conflict: expected ${expectedStateRevision}, actual ${actualStateRevision}.`);
    this.name = 'ProfessionalOutputStateRevisionConflictError';
  }
}

export class ProfessionalOutputNotFoundError extends Error {
  constructor(readonly outputId?: string) {
    super('Professional output was not found.');
    this.name = 'ProfessionalOutputNotFoundError';
  }
}

export class ProfessionalOutputStateError extends Error {
  constructor(readonly status: ProfessionalOutputStatus) {
    super(`Professional output cannot be changed from status ${status}.`);
    this.name = 'ProfessionalOutputStateError';
  }
}

interface HeadRow {
  outputId: string;
  studentId: string;
  taskId: P1OutputTaskId;
  status: ProfessionalOutputStatus;
  currentVersion: number;
  stateRevision: number;
}

interface NormalizedReview {
  teacherId: string;
  classId: string;
  outputId: string;
  expectedStateRevision: number;
  action: ProfessionalOutputReviewAction;
  feedback?: string;
  rubricScores?: ProfessionalOutputRubricScores;
}

const outputNodeByTask: Record<P1OutputTaskId, string> = {
  P01: 'P1T1-N04',
  P02: 'P1T2-N04',
  P03: 'P1T3-N04',
};

const testNodeByTask: Record<P1OutputTaskId, string> = {
  P01: 'P1T1-N02',
  P02: 'P1T2-N02',
  P03: 'P1T3-N02',
};

export class ProfessionalOutputReviewStore {
  private readonly clock: SnapshotClock;

  constructor(private readonly database: AppDatabase) {
    this.clock = new SnapshotClock(database);
  }

  listSubmittedForTeacher(teacherId: string, classId: string): ProfessionalOutputReviewQueueItem[] {
    assertNonEmpty('teacherId', teacherId);
    assertNonEmpty('classId', classId);
    const rows = this.database.prepare(`
      SELECT output.output_id AS outputId, output.student_id AS studentId,
        student.display_name AS studentName, output.task_id AS taskId,
        output.node_id AS nodeId, output.status,
        output.current_version AS currentVersion,
        output.state_revision AS stateRevision, version.fields_json AS fieldsJson
      FROM professional_outputs AS output
      INNER JOIN users AS student ON student.id = output.student_id
      INNER JOIN professional_output_versions AS version
        ON version.output_id = output.output_id AND version.version = output.current_version
      WHERE output.status = 'submitted'
        AND EXISTS (
          SELECT 1 FROM classroom_sessions AS session
          INNER JOIN classroom_members AS member ON member.session_id = session.session_id
          WHERE session.teacher_id = ? AND session.class_id = ?
            AND member.student_id = output.student_id
        )
      ORDER BY output.updated_at, output.output_id
    `).all(teacherId, classId) as Array<Omit<ProfessionalOutputReviewQueueItem, 'fields'> & {
      fieldsJson: string;
    }>;
    return rows.map(({ fieldsJson, ...row }) => ({
      ...row,
      fields: JSON.parse(fieldsJson) as Record<string, ProfessionalOutputFieldValue>,
    }));
  }

  readPortfolioFacts(studentId: string): ProfessionalOutputPortfolioFact[] {
    assertNonEmpty('studentId', studentId);
    const heads = this.database.prepare(`
      SELECT output_id AS outputId, task_id AS taskId, status,
        current_version AS currentVersion, state_revision AS stateRevision
      FROM professional_outputs WHERE student_id = ? ORDER BY task_id
    `).all(studentId) as Array<Pick<ProfessionalOutputPortfolioFact,
      'outputId' | 'taskId' | 'status' | 'currentVersion' | 'stateRevision'>>;
    return heads.map((head) => this.projectPortfolioFact(studentId, head));
  }

  reviewSubmitted(input: ReviewProfessionalOutputInput): ProfessionalOutputReviewMutation {
    const command = normalizeReview(input);
    return this.database.transaction(() => {
      const head = this.readHead(command.outputId);
      if (!head || !this.teacherCanReviewStudent(command.teacherId, command.classId, head.studentId)) {
        throw new ProfessionalOutputNotFoundError(command.outputId);
      }
      if (head.stateRevision !== command.expectedStateRevision) {
        throw new ProfessionalOutputStateRevisionConflictError(
          head.outputId, command.expectedStateRevision, head.stateRevision,
        );
      }
      if (head.status !== 'submitted') throw new ProfessionalOutputStateError(head.status);

      const nextRevision = head.stateRevision + 1;
      const status: ProfessionalOutputReview['status'] = command.action === 'verify'
        ? 'verified'
        : 'returned';
      const reviewId = `${head.outputId}:review:r${nextRevision}`;
      const outputRubricScore = command.rubricScores
        ? Object.values(command.rubricScores).reduce((sum, score) => sum + score, 0)
        : undefined;
      this.insertReview(command, head, reviewId, status, outputRubricScore);
      this.database.prepare(`
        UPDATE professional_outputs SET status = ?, state_revision = ?, updated_at = CURRENT_TIMESTAMP
        WHERE output_id = ?
      `).run(status, nextRevision, head.outputId);
      this.appendReviewEvent(command, head, reviewId, status, nextRevision, outputRubricScore);
      const globalVersion = this.advanceSnapshotVersions(head.studentId);
      const frozenTaskScore = command.action === 'verify' && outputRubricScore !== undefined
        ? this.freezeTaskScore(head, outputRubricScore, command.rubricScores!, globalVersion, nextRevision)
        : undefined;
      return {
        review: {
          reviewId,
          outputId: head.outputId,
          reviewerId: command.teacherId,
          status,
          ...(outputRubricScore === undefined ? {} : { score: outputRubricScore }),
          ...(command.feedback === undefined ? {} : { feedback: command.feedback }),
        },
        outputIdentity: { outputId: head.outputId, studentId: head.studentId, taskId: head.taskId },
        ...(frozenTaskScore === undefined ? {} : { frozenTaskScore }),
      };
    })();
  }

  private projectPortfolioFact(
    studentId: string,
    head: Pick<ProfessionalOutputPortfolioFact,
      'outputId' | 'taskId' | 'status' | 'currentVersion' | 'stateRevision'>,
  ): ProfessionalOutputPortfolioFact {
    const review = this.readCurrentVersionReview(head);
    const frozenRow = this.database.prepare(`
      SELECT snapshot_version AS snapshotVersion, provisional_score AS provisionalScore,
        official_score AS officialScore, details_json AS detailsJson
      FROM frozen_task_scores WHERE student_id = ? AND task_id = ?
      ORDER BY snapshot_version DESC, frozen_at DESC LIMIT 1
    `).get(studentId, head.taskId) as {
      snapshotVersion: number; provisionalScore: number; officialScore: number | null; detailsJson: string;
    } | undefined;
    return {
      ...head,
      ...(review ? { review } : {}),
      ...(frozenRow ? { frozenTaskScore: {
        snapshotVersion: frozenRow.snapshotVersion,
        provisionalScore: frozenRow.provisionalScore,
        officialScore: frozenRow.officialScore,
        details: JSON.parse(frozenRow.detailsJson) as Record<string, unknown>,
      } } : {}),
    };
  }

  private readCurrentVersionReview(head: Pick<ProfessionalOutputPortfolioFact,
    'outputId' | 'status' | 'currentVersion'>): ProfessionalOutputPortfolioFact['review'] {
    const row = this.database.prepare(`
      SELECT review.review_id AS reviewId, review.status, review.score, review.feedback,
        (SELECT json_extract(event.payload_json, '$.version') FROM learning_events AS event
          WHERE json_extract(event.payload_json, '$.reviewId') = review.review_id
          ORDER BY event.occurred_at DESC, event.event_id DESC LIMIT 1) AS outputVersion
      FROM output_reviews AS review WHERE review.output_id = ?
      ORDER BY review.reviewed_at DESC, review.review_id DESC LIMIT 1
    `).get(head.outputId) as {
      reviewId: string; status: 'returned' | 'verified'; score: number | null;
      feedback: string | null; outputVersion: number | null;
    } | undefined;
    if (!row || (row.outputVersion !== head.currentVersion
      && !(row.outputVersion === null && row.status === head.status))) return undefined;
    return {
      reviewId: row.reviewId,
      status: row.status,
      ...(row.score === null ? {} : { score: row.score }),
      ...(row.feedback === null ? {} : { feedback: row.feedback }),
    };
  }

  private readHead(outputId: string): HeadRow | undefined {
    return this.database.prepare(`
      SELECT output_id AS outputId, student_id AS studentId, task_id AS taskId,
        status, current_version AS currentVersion, state_revision AS stateRevision
      FROM professional_outputs WHERE output_id = ?
    `).get(outputId) as HeadRow | undefined;
  }

  private teacherCanReviewStudent(teacherId: string, classId: string, studentId: string): boolean {
    return this.database.prepare(`
      SELECT 1 FROM classroom_sessions AS session
      INNER JOIN classroom_members AS member ON member.session_id = session.session_id
      WHERE session.teacher_id = ? AND session.class_id = ? AND member.student_id = ? LIMIT 1
    `).pluck().get(teacherId, classId, studentId) === 1;
  }

  private insertReview(
    command: NormalizedReview,
    head: HeadRow,
    reviewId: string,
    status: 'returned' | 'verified',
    score?: number,
  ): void {
    this.database.prepare(`
      INSERT INTO output_reviews (
        review_id, output_id, reviewer_id, status, score, feedback, origin
      ) VALUES (?, ?, ?, ?, ?, ?, 'user')
    `).run(reviewId, head.outputId, command.teacherId, status, score ?? null, command.feedback ?? null);
  }

  private appendReviewEvent(
    command: NormalizedReview,
    head: HeadRow,
    reviewId: string,
    status: 'returned' | 'verified',
    stateRevision: number,
    outputRubricScore?: number,
  ): void {
    this.database.prepare(`
      INSERT INTO learning_events (
        event_id, student_id, node_id, channel, event_type, payload_json, origin
      ) VALUES (?, ?, ?, 'classroom', ?, ?, 'user')
    `).run(
      `${head.outputId}:r${stateRevision}:teacher-${status}`,
      head.studentId,
      outputNodeByTask[head.taskId],
      status === 'verified' ? 'teacher_verified' : 'teacher_returned',
      JSON.stringify({
        outputId: head.outputId, taskId: head.taskId, version: head.currentVersion,
        stateRevision, reviewId, feedback: command.feedback,
        rubricScores: command.rubricScores, outputRubricScore,
      }),
    );
  }

  private advanceSnapshotVersions(studentId: string): number {
    return this.clock.advance([`learning:${studentId}`]).globalVersion;
  }

  private freezeTaskScore(
    head: HeadRow,
    outputRubricScore: number,
    rubricScores: ProfessionalOutputRubricScores,
    snapshotVersion: number,
    stateRevision: number,
  ): FrozenTaskScore | undefined {
    const nodeId = testNodeByTask[head.taskId];
    const nodeTestHighestScore = this.database.prepare(`
      SELECT MAX(score) FROM formal_attempts
      WHERE student_id = ? AND node_id = ? AND origin = 'user'
    `).pluck().get(head.studentId, nodeId) as number | null;
    if (nodeTestHighestScore === null || nodeTestHighestScore === undefined) return undefined;
    const taskCompositeScore = calculateTaskCompositeScore({
      nodeTestHighestScore, outputRubricScore,
    }).taskCompositeScore;
    if (taskCompositeScore === undefined) return undefined;
    const details: FrozenTaskScore['details'] = {
      nodeId, nodeTestHighestScore, outputId: head.outputId, outputVersion: head.currentVersion,
      outputRubricScore, rubricScores, taskCompositeScore,
      weights: { nodeTest: 0.4, professionalOutput: 0.6 },
    };
    this.database.prepare(`
      INSERT INTO frozen_task_scores (
        score_id, student_id, task_id, snapshot_version, provisional_score,
        official_score, details_json, origin
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'user')
    `).run(
      `${head.outputId}:score:r${stateRevision}`, head.studentId, head.taskId, snapshotVersion,
      taskCompositeScore, taskCompositeScore, JSON.stringify(details),
    );
    return {
      studentId: head.studentId, taskId: head.taskId, snapshotVersion,
      provisionalScore: taskCompositeScore, officialScore: taskCompositeScore, details,
    };
  }
}

function normalizeReview(input: ReviewProfessionalOutputInput): NormalizedReview {
  assertNonEmpty('teacherId', input.teacherId);
  assertNonEmpty('classId', input.classId);
  assertNonEmpty('outputId', input.outputId);
  if (!Number.isSafeInteger(input.expectedStateRevision) || input.expectedStateRevision < 0) {
    throw new TypeError('expectedStateRevision must be a non-negative safe integer.');
  }
  if (input.action !== 'return' && input.action !== 'verify') {
    throw new TypeError('action must be return or verify.');
  }
  const feedback = input.feedback?.trim();
  if (input.action === 'return' && !feedback) {
    throw new TypeError('feedback is required when returning an output.');
  }
  const rubricScores = input.rubricScores === undefined
    ? undefined
    : normalizedRubricScores(input.rubricScores);
  if (input.action === 'verify' && rubricScores === undefined) {
    throw new TypeError('rubricScores are required when verifying an output.');
  }
  return {
    teacherId: input.teacherId, classId: input.classId, outputId: input.outputId,
    expectedStateRevision: input.expectedStateRevision, action: input.action,
    ...(feedback ? { feedback } : {}),
    ...(rubricScores ? { rubricScores } : {}),
  };
}

function normalizedRubricScores(value: ProfessionalOutputRubricScores): ProfessionalOutputRubricScores {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new TypeError('rubricScores must be a non-empty object.');
  }
  const scores = Object.fromEntries(Object.entries(value).map(([criterion, score]) => {
    assertNonEmpty('rubric criterion', criterion);
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
      throw new TypeError(`rubric score must be between 0 and 100: ${criterion}.`);
    }
    return [criterion, score];
  })) as ProfessionalOutputRubricScores;
  const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
  if (total > 100) throw new TypeError('rubric score total must be between 0 and 100.');
  return scores;
}

function assertNonEmpty(field: string, value: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

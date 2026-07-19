import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthenticatedActor } from './auth/actor.ts';
import {
  ClassroomAssessmentRunRepository,
  type StoredClassroomAssessmentRun,
} from './classroom-assessment-run-repository.ts';
import { readValidatedClassroomRunAttempts } from './classroom-assessment-run-reader.ts';
import type { AppDatabase } from './db/database.ts';
import { assessmentDimensionKeys } from './formal-assessment-contract.ts';
import {
  getFormalAssessmentDefinition,
  getFormalAssessmentDefinitions,
} from './formal-assessment-catalog.server.ts';
import { AssessmentCatalogError, AssessmentClassroomWindowError } from './formal-assessment-service.ts';

export type ClassroomAssessmentCommand =
  | {
      type: 'start';
      lessonRunId: string;
      nodeId: string;
      gameId: string;
      expectedClassroomRevision: number;
      durationSeconds?: number;
    }
  | { type: 'pause' | 'resume' | 'collect' | 'begin-review'; runId: string; expectedRevision: number };

export interface AnonymousAssessmentDimension {
  dimension: string;
  incorrectCount: number;
  percent: number;
}

export interface ClassroomAssessmentRunDto {
  runId: string;
  lessonRunId: string;
  nodeId: string;
  gameId: string;
  status: StoredClassroomAssessmentRun['status'];
  revision: number;
  serverNow: string;
  startedAt: string;
  expiresAt: string;
  remainingSecondsWhenPaused?: number;
  closeReason?: StoredClassroomAssessmentRun['closedReason'];
  eligibleCount: number;
  submittedCount: number;
  canBeginReview: boolean;
  review: AnonymousAssessmentDimension[];
}

export class ClassroomAssessmentAuthorizationError extends Error {
  override readonly name = 'ClassroomAssessmentAuthorizationError';
}

export class ClassroomAssessmentRunNotFoundError extends Error {
  override readonly name = 'ClassroomAssessmentRunNotFoundError';
}

export class ClassroomAssessmentRunService {
  private readonly repository: ClassroomAssessmentRunRepository;
  private readonly randomId: () => string;
  private readonly randomToken: () => string;

  constructor(
    private readonly database: AppDatabase,
    options: {
      repository?: ClassroomAssessmentRunRepository;
      randomId?: () => string;
      randomToken?: () => string;
    } = {},
  ) {
    this.repository = options.repository ?? new ClassroomAssessmentRunRepository(database);
    this.randomId = options.randomId ?? randomUUID;
    this.randomToken = options.randomToken ?? (() => randomBytes(32).toString('base64url'));
  }

  execute(
    actor: AuthenticatedActor,
    sessionId: string,
    command: ClassroomAssessmentCommand,
    now = new Date(),
  ): ClassroomAssessmentRunDto {
    this.requireOwningTeacher(actor, sessionId);
    if (command.type === 'start') {
      const run = this.database.transaction(() => {
        const definition = getFormalAssessmentDefinition(command.nodeId);
        if (!definition || definition.gameId !== command.gameId) {
          throw new TypeError('Formal assessment game does not match its node.');
        }
        const studentIds = this.readActiveJoinedStudents(sessionId);
        if (studentIds.length === 0) {
          throw new TypeError('At least one joined student is required to start an assessment.');
        }
        const started = this.repository.startRun({
          sessionId,
          lessonRunId: command.lessonRunId,
          nodeId: command.nodeId,
          gameId: command.gameId,
          expectedClassroomRevision: command.expectedClassroomRevision,
          durationSeconds: command.durationSeconds ?? definition.paper.durationMinutes * 60,
        }, now);
        this.provisionParticipants({
          runId: started.runId,
          sessionId,
          nodeId: started.nodeId,
          gameId: started.gameId,
          expiresAt: started.expiresAt,
          studentIds,
        }, now);
        return started;
      }).immediate();
      return this.project(run, now);
    }

    const current = this.repository.readRun(command.runId);
    if (!current || current.sessionId !== sessionId) {
      throw new ClassroomAssessmentRunNotFoundError('Assessment run was not found in this classroom session.');
    }
    this.repository.expireIfDue(command.runId, now);
    let run: StoredClassroomAssessmentRun;
    if (command.type === 'pause') {
      run = this.repository.pauseRun(command.runId, command.expectedRevision, now);
    } else if (command.type === 'resume') {
      run = this.database.transaction(() => {
        const resumed = this.repository.resumeRun(command.runId, command.expectedRevision, now);
        this.reissueTokens(command.runId, now);
        return resumed;
      }).immediate();
    } else if (command.type === 'collect') {
      run = this.repository.collectRun(command.runId, command.expectedRevision, now);
    } else {
      run = this.repository.beginReview(command.runId, command.expectedRevision, now);
    }
    return this.project(run, now);
  }

  read(
    actor: AuthenticatedActor,
    sessionId: string,
    runId: string,
    now = new Date(),
  ): ClassroomAssessmentRunDto {
    this.requireOwningTeacher(actor, sessionId);
    const current = this.repository.readRun(runId);
    if (!current || current.sessionId !== sessionId) {
      throw new ClassroomAssessmentRunNotFoundError('Assessment run was not found in this classroom session.');
    }
    const run = this.repository.expireIfDue(runId, now);
    return this.project(run, now);
  }

  private requireOwningTeacher(actor: AuthenticatedActor, sessionId: string): void {
    const owner = this.database.prepare(`
      SELECT teacher_id AS teacherId, class_id AS classId
      FROM classroom_sessions WHERE session_id = ?
    `).get(sessionId) as { teacherId: string; classId: string } | undefined;
    if (!owner) throw new ClassroomAssessmentRunNotFoundError('Classroom session was not found.');
    if (actor.role !== 'teacher'
      || actor.userId !== owner.teacherId || actor.classId !== owner.classId) {
      throw new ClassroomAssessmentAuthorizationError(
        'Only the owning teacher can control a classroom assessment.',
      );
    }
  }

  private readActiveJoinedStudents(sessionId: string): string[] {
    return (this.database.prepare(`
      SELECT member.student_id AS studentId
      FROM classroom_members AS member
      INNER JOIN classroom_participation AS participation
        ON participation.session_id = member.session_id
        AND participation.student_id = member.student_id
      INNER JOIN users AS student
        ON student.id = member.student_id
      WHERE member.session_id = ? AND participation.state = 'joined'
        AND student.role = 'student' AND student.is_active = 1
      ORDER BY member.student_id
    `).all(sessionId) as Array<{ studentId: string }>).map(({ studentId }) => studentId);
  }

  private provisionParticipants(
    input: {
      runId: string;
      sessionId: string;
      nodeId: string;
      gameId: string;
      expiresAt: string;
      studentIds: readonly string[];
    },
    now: Date,
  ): void {
    const at = now.toISOString();
    for (const studentId of [...new Set(input.studentIds)].sort()) {
      const running = this.database.prepare(`
        SELECT DISTINCT instance.assessment_id AS assessmentId,
          instance.classroom_run_id AS classroomRunId
        FROM formal_assessment_instances AS instance
        INNER JOIN formal_assessment_tokens AS token
          ON token.assessment_id = instance.assessment_id AND token.student_id = ?
        WHERE instance.node_id = ? AND instance.status = 'running'
      `).all(studentId, input.nodeId) as Array<{
        assessmentId: string;
        classroomRunId: string | null;
      }>;
      if (running.some(({ classroomRunId }) => classroomRunId !== null)) {
        throw new AssessmentClassroomWindowError(
          `Student ${studentId} already has a running formal assessment.`,
        );
      }
      const standaloneAssessmentIds = running.map(({ assessmentId }) => assessmentId);
      for (const assessmentId of standaloneAssessmentIds) {
        this.database.prepare(`
          UPDATE formal_assessment_instances
          SET status = 'closed', closed_at = ?, closure_reason = 'cancelled'
          WHERE assessment_id = ? AND status = 'running' AND classroom_run_id IS NULL
        `).run(at, assessmentId);
        this.database.prepare(`
          UPDATE formal_assessment_tokens SET used_at = ?
          WHERE assessment_id = ? AND used_at IS NULL
        `).run(at, assessmentId);
      }
      const definitions = getFormalAssessmentDefinitions(input.nodeId);
      const priorAttempts = Number(this.database.prepare(`
        SELECT COUNT(*) FROM formal_attempts
        WHERE student_id = ? AND node_id = ? AND origin = 'user'
      `).pluck().get(studentId, input.nodeId));
      const definition = definitions[priorAttempts % definitions.length];
      if (!definition || definition.gameId !== input.gameId) {
        throw new AssessmentCatalogError(input.nodeId);
      }
      const assessmentId = `assessment-${this.randomId()}`;
      this.database.prepare(`
        INSERT INTO formal_assessment_instances (
          assessment_id, session_id, classroom_run_id, node_id, game_id,
          question_version, status, opened_at, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)
      `).run(
        assessmentId, input.sessionId, input.runId, input.nodeId, input.gameId,
        definition.paper.questionVersion, at, input.expiresAt, at,
      );
      this.insertToken({
        assessmentId,
        studentId,
        nodeId: input.nodeId,
        questionVersion: definition.paper.questionVersion,
        issuedAt: at,
        expiresAt: input.expiresAt,
      });
    }
  }

  private reissueTokens(runId: string, now: Date): void {
    const rows = this.database.prepare(`
      SELECT DISTINCT instance.assessment_id AS assessmentId,
        token.student_id AS studentId, instance.node_id AS nodeId,
        instance.question_version AS questionVersion, instance.expires_at AS expiresAt
      FROM formal_assessment_instances AS instance
      INNER JOIN formal_assessment_tokens AS token ON token.assessment_id = instance.assessment_id
      WHERE instance.classroom_run_id = ? AND instance.status = 'running'
      ORDER BY token.student_id
    `).all(runId) as Array<{
      assessmentId: string;
      studentId: string;
      nodeId: string;
      questionVersion: string;
      expiresAt: string;
    }>;
    const issuedAt = now.toISOString();
    for (const row of rows) this.insertToken({ ...row, issuedAt });
  }

  private insertToken(input: {
    assessmentId: string;
    studentId: string;
    nodeId: string;
    questionVersion: string;
    issuedAt: string;
    expiresAt: string;
  }): void {
    const token = this.randomToken();
    if (token.trim().length < 24) throw new Error('Formal assessment token entropy is insufficient.');
    this.database.prepare(`
      INSERT INTO formal_assessment_tokens (
        token_hash, assessment_id, student_id, node_id, question_version, issued_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      createHash('sha256').update(token).digest('hex'),
      input.assessmentId, input.studentId, input.nodeId,
      input.questionVersion, input.issuedAt, input.expiresAt,
    );
  }

  private project(run: StoredClassroomAssessmentRun, now: Date): ClassroomAssessmentRunDto {
    const counts = this.repository.readSubmissionCounts(run.runId);
    const canBeginReview = run.status !== 'reviewing' && counts.submitted > 0 && (
      counts.submitted === counts.eligible
      || run.status === 'expired'
      || run.closedReason === 'teacher-collected'
    );
    return {
      runId: run.runId,
      lessonRunId: run.lessonRunId,
      nodeId: run.nodeId,
      gameId: run.gameId,
      status: run.status,
      revision: run.revision,
      serverNow: now.toISOString(),
      startedAt: run.startedAt,
      expiresAt: run.expiresAt,
      ...(run.remainingSecondsWhenPaused === undefined
        ? {} : { remainingSecondsWhenPaused: run.remainingSecondsWhenPaused }),
      ...(run.closedReason ? { closeReason: run.closedReason } : {}),
      eligibleCount: counts.eligible,
      submittedCount: counts.submitted,
      canBeginReview,
      review: run.status === 'reviewing' ? this.readAnonymousReview(run, now) : [],
    };
  }

  private readAnonymousReview(
    run: StoredClassroomAssessmentRun,
    observedAt: Date,
  ): AnonymousAssessmentDimension[] {
    const attempts = readValidatedClassroomRunAttempts(this.database, {
      sessionId: run.sessionId,
      classroomRunId: run.runId,
      nodeId: run.nodeId,
      gameId: run.gameId,
      startedAt: new Date(run.startedAt),
      observedAt,
    });
    if (attempts.length === 0) return [];
    return assessmentDimensionKeys.map((dimension) => {
      const incorrectCount = attempts.filter(({ dimensions }) => dimensions[dimension].score < 20).length;
      return {
        dimension,
        incorrectCount,
        percent: Math.round((incorrectCount / attempts.length) * 100),
      };
    });
  }
}

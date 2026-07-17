import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AuthenticatedActor } from './auth/actor.ts';
import { getDatabase, type AppDatabase } from './db/database.ts';
import {
  type ActiveIssuedAssessmentPaper,
  type AssessmentAnswers,
  type AssessmentDraftAnswers,
  type AssessmentDraftDto,
  type AssessmentDiagnosis,
  type AssessmentPaper,
  type IssuedAssessmentPaper,
  type IssuedAssessmentSnapshot,
  type RemediationTarget,
} from './formal-assessment-contract.ts';
import {
  AssessmentDraftRevisionConflictError,
  FormalAssessmentAttemptRepository,
} from './formal-assessment-attempt-repository.ts';
import {
  gradeAnswers,
  normalizeAnswers,
  normalizeDraftAnswers,
  validateAnswerOptions,
  validateDraftOptions,
} from './formal-assessment-evaluator.server.ts';
import {
  getFormalAssessmentDefinition,
  getFormalAssessmentDefinitionByVersion,
  getFormalAssessmentDefinitions,
  projectAssessmentPaper,
  type FormalAssessmentDefinition,
} from './formal-assessment-catalog.server.ts';
import { createLearningCommandService, LearningAuthorizationError } from './learning-command-service.ts';
import { SnapshotClock } from './snapshot-clock.ts';
import { getWorkedCorrectionGuidance } from './formal-assessment-correction.server.ts';

export type {
  AssessmentAnswers,
  ActiveIssuedAssessmentPaper,
  AssessmentDraftAnswers,
  AssessmentDraftDto,
  AssessmentDiagnosis,
  AssessmentDimensionDiagnosis,
  AssessmentPaper,
  IssuedAssessmentPaper,
  IssuedAssessmentSnapshot,
  RemediationTarget,
} from './formal-assessment-contract.ts';
export { AssessmentDraftRevisionConflictError } from './formal-assessment-attempt-repository.ts';

export interface FormalAssessmentServiceOptions {
  now?: () => Date;
  randomId?: () => string;
  randomToken?: () => string;
  tokenTtlMs?: number;
}

export interface FormalAssessmentIssueContext {
  classroomSessionId?: string;
  restart?: boolean;
}

export class AssessmentCatalogError extends Error {
  constructor(readonly nodeId: string) {
    super(`Formal assessment is unavailable for ${nodeId}.`);
    this.name = 'AssessmentCatalogError';
  }
}

export class AssessmentTokenError extends Error {
  constructor(readonly code: 'invalid-token' | 'expired-token' | 'used-token') {
    super(code === 'expired-token'
      ? 'The formal assessment token has expired.'
      : code === 'used-token'
        ? 'The formal assessment token has already been used.'
        : 'The formal assessment token is invalid.');
    this.name = 'AssessmentTokenError';
  }
}

export class AssessmentRemediationRequiredError extends Error {
  constructor(readonly targets: RemediationTarget[]) {
    super('Complete the targeted relearning activities before starting another formal assessment.');
    this.name = 'AssessmentRemediationRequiredError';
  }
}

export class AssessmentClassroomWindowError extends Error {
  constructor(message = 'The classroom formal-assessment window is not active.') {
    super(message);
    this.name = 'AssessmentClassroomWindowError';
  }
}

interface TokenRow {
  assessmentId: string;
  studentId: string;
  nodeId: string;
  questionVersion: string;
  issuedAt: string;
  expiresAt: string;
  instanceExpiresAt: string | null;
  openedAt: string | null;
  usedAt: string | null;
  instanceNodeId: string;
  instanceQuestionVersion: string;
  instanceGameId: string;
  status: string;
  classroomSessionId: string | null;
  classroomRunId: string | null;
}

interface StudentAssessmentInstanceRow {
  assessmentId: string;
  nodeId: string;
  gameId: string;
  questionVersion: string;
  status: string;
  openedAt: string | null;
  expiresAt: string | null;
  closureReason: string | null;
  classroomSessionId: string | null;
  classroomRunId: string | null;
}

interface LatestAttemptRow {
  score: number;
  diagnosticsJson: string;
  completedAt: string;
}

export class FormalAssessmentService {
  private readonly now: () => Date;
  private readonly randomId: () => string;
  private readonly randomToken: () => string;

  constructor(
    private readonly database: AppDatabase,
    options: FormalAssessmentServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.randomId = options.randomId ?? randomUUID;
    this.randomToken = options.randomToken ?? (() => randomBytes(32).toString('base64url'));
  }

  openOrResume(
    actor: AuthenticatedActor,
    nodeId: string,
    context: FormalAssessmentIssueContext = {},
  ): IssuedAssessmentPaper {
    const studentId = requireStudent(actor);
    const definition = requireDefinition(nodeId);
    createLearningCommandService(this.database).requireFormalAssessmentReadiness(actor, nodeId);
    const now = this.now();
    const serverNow = now.toISOString();
    const classroomRun = context.classroomSessionId
      ? this.requireActiveClassroomRun(actor, nodeId, context.classroomSessionId, definition)
      : undefined;

    return this.database.transaction(() => {
      const missingTargets = this.readMissingRemediationTargets(studentId, definition);
      if (missingTargets.length > 0) throw new AssessmentRemediationRequiredError(missingTargets);

      const running = this.readStudentAssessmentInstance(studentId, nodeId, 'running');
      if (running) {
        if (running.expiresAt && now.getTime() >= Date.parse(running.expiresAt)) {
          this.expireInstance(running.assessmentId, serverNow);
          if (!context.restart) {
            return this.projectIssuedAssessment(running, studentId, serverNow, 'expired');
          }
        } else {
          if (context.restart) {
            throw new TypeError('A running formal assessment cannot be restarted.');
          }
          this.assertIssueContextMatches(running, classroomRun);
          return this.issueReplacementToken(running, studentId, serverNow);
        }
      }

      const latest = this.readStudentAssessmentInstance(studentId, nodeId);
      if (!context.restart && latest?.closureReason === 'expired') {
        return this.projectIssuedAssessment(latest, studentId, serverNow, 'expired');
      }
      if (context.restart && latest?.closureReason !== 'expired') {
        throw new TypeError('Only an expired formal assessment can be restarted.');
      }

      const selectedDefinition = this.selectDefinition(studentId, nodeId);
      const assessmentId = `assessment-${this.randomId()}`;
      const expiresAt = classroomRun?.expiresAt
        ?? new Date(now.getTime() + selectedDefinition.paper.durationMinutes * 60_000).toISOString();
      this.database.prepare(`
        INSERT INTO formal_assessment_instances (
          assessment_id, session_id, classroom_run_id, node_id, game_id,
          question_version, status, opened_at, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)
      `).run(
        assessmentId,
        classroomRun?.sessionId ?? null,
        classroomRun?.runId ?? null,
        nodeId,
        selectedDefinition.gameId,
        selectedDefinition.paper.questionVersion,
        serverNow,
        expiresAt,
        serverNow,
      );
      return this.issueReplacementToken({
        assessmentId,
        nodeId,
        gameId: selectedDefinition.gameId,
        questionVersion: selectedDefinition.paper.questionVersion,
        status: 'running',
        openedAt: serverNow,
        expiresAt,
        closureReason: null,
        classroomSessionId: classroomRun?.sessionId ?? null,
        classroomRunId: classroomRun?.runId ?? null,
      }, studentId, serverNow);
    }).immediate();
  }

  issuePaper(
    actor: AuthenticatedActor,
    nodeId: string,
    context: FormalAssessmentIssueContext = {},
  ): ActiveIssuedAssessmentPaper {
    const issued = this.openOrResume(actor, nodeId, context);
    if (issued.state !== 'in-progress') throw new AssessmentTokenError('expired-token');
    return issued;
  }

  private selectDefinition(studentId: string, nodeId: string): FormalAssessmentDefinition {
    const definitions = getFormalAssessmentDefinitions(nodeId);
    if (definitions.length === 0) throw new AssessmentCatalogError(nodeId);
    const completedAttemptCount = this.database.prepare(`
      SELECT COUNT(*)
      FROM formal_attempts
      WHERE student_id = ? AND node_id = ? AND origin = 'user'
    `).pluck().get(studentId, nodeId) as number;
    return definitions[completedAttemptCount % definitions.length];
  }

  private readStudentAssessmentInstance(
    studentId: string,
    nodeId: string,
    status?: 'running',
  ): StudentAssessmentInstanceRow | undefined {
    return this.database.prepare(`
      SELECT DISTINCT instance.assessment_id AS assessmentId,
        instance.node_id AS nodeId, instance.game_id AS gameId,
        instance.question_version AS questionVersion, instance.status,
        instance.opened_at AS openedAt, instance.expires_at AS expiresAt,
        instance.closure_reason AS closureReason,
        instance.session_id AS classroomSessionId,
        instance.classroom_run_id AS classroomRunId
      FROM formal_assessment_instances AS instance
      INNER JOIN formal_assessment_tokens AS token
        ON token.assessment_id = instance.assessment_id
      WHERE token.student_id = ? AND instance.node_id = ?
        ${status ? "AND instance.status = 'running'" : ''}
      ORDER BY julianday(COALESCE(instance.opened_at, instance.created_at)) DESC,
        instance.assessment_id DESC
      LIMIT 1
    `).get(studentId, nodeId) as StudentAssessmentInstanceRow | undefined;
  }

  private issueReplacementToken(
    instance: StudentAssessmentInstanceRow,
    studentId: string,
    serverNow: string,
  ): ActiveIssuedAssessmentPaper {
    if (!instance.expiresAt || !Number.isFinite(Date.parse(instance.expiresAt))) {
      throw new AssessmentTokenError('invalid-token');
    }
    const attemptToken = this.randomToken();
    if (attemptToken.trim().length < 24) {
      throw new Error('Formal assessment token entropy is insufficient.');
    }
    this.database.prepare(`
      INSERT INTO formal_assessment_tokens (
        token_hash, assessment_id, student_id, node_id, question_version, issued_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      hashToken(attemptToken),
      instance.assessmentId,
      studentId,
      instance.nodeId,
      instance.questionVersion,
      serverNow,
      instance.expiresAt,
    );
    return {
      ...this.projectIssuedAssessment(instance, studentId, serverNow, 'in-progress'),
      state: 'in-progress',
      attemptToken,
    };
  }

  private projectIssuedAssessment<State extends IssuedAssessmentSnapshot['state']>(
    instance: StudentAssessmentInstanceRow,
    studentId: string,
    serverNow: string,
    state: State,
  ): Omit<IssuedAssessmentSnapshot, 'state'> & { state: State } {
    if (!instance.expiresAt) throw new AssessmentTokenError('invalid-token');
    const definition = requireDefinitionVersion(instance.nodeId, instance.questionVersion);
    if (definition.gameId !== instance.gameId) {
      throw new AssessmentTokenError('invalid-token');
    }
    return {
      paper: projectAssessmentPaper(definition),
      assessmentId: instance.assessmentId,
      serverNow,
      expiresAt: instance.expiresAt,
      state,
      draft: new FormalAssessmentAttemptRepository(this.database)
        .readDraft(instance.assessmentId, studentId),
    };
  }

  private expireInstance(assessmentId: string, expiredAt: string): void {
    this.database.prepare(`
      UPDATE formal_assessment_instances
      SET status = 'closed', closed_at = ?, closure_reason = 'expired'
      WHERE assessment_id = ? AND status = 'running'
    `).run(expiredAt, assessmentId);
    this.database.prepare(`
      UPDATE formal_assessment_tokens
      SET used_at = ?
      WHERE assessment_id = ? AND used_at IS NULL
    `).run(expiredAt, assessmentId);
  }

  private assertIssueContextMatches(
    instance: StudentAssessmentInstanceRow,
    classroomRun: { sessionId: string; runId: string } | undefined,
  ): void {
    if (!classroomRun) {
      if (instance.classroomSessionId || instance.classroomRunId) {
        throw new AssessmentClassroomWindowError();
      }
      return;
    }
    if (instance.classroomSessionId !== classroomRun.sessionId
      || instance.classroomRunId !== classroomRun.runId) {
      throw new AssessmentClassroomWindowError();
    }
  }

  private requireActiveClassroomRun(
    actor: AuthenticatedActor,
    nodeId: string,
    sessionId: string,
    definition: FormalAssessmentDefinition,
  ): ActiveClassroomAssessmentRunRow {
    const row = this.database.prepare(`
      SELECT run.session_id AS sessionId, run.run_id AS runId,
        run.expires_at AS expiresAt, run.status
      FROM classroom_assessment_runs AS run
      INNER JOIN classroom_lesson_runs AS lesson
        ON lesson.lesson_run_id = run.lesson_run_id
        AND lesson.session_id = run.session_id
      INNER JOIN classroom_sessions AS classroom
        ON classroom.session_id = run.session_id
        AND classroom.active_lesson_run_id = lesson.lesson_run_id
      INNER JOIN classroom_members AS member
        ON member.session_id = classroom.session_id
        AND member.student_id = ?
      WHERE run.session_id = ?
        AND classroom.class_id = ?
        AND classroom.status = 'active'
        AND lesson.status IN ('active', 'paused')
        AND lesson.node_id = ?
        AND run.node_id = ?
        AND run.game_id = ?
        AND run.status IN ('running', 'paused')
      ORDER BY julianday(run.started_at) DESC, run.run_id DESC
      LIMIT 1
    `).get(
      actor.userId,
      sessionId,
      actor.classId,
      nodeId,
      nodeId,
      definition.gameId,
    ) as ActiveClassroomAssessmentRunRow | undefined;
    if (!row || row.status !== 'running' || Date.parse(row.expiresAt) <= this.now().getTime()) {
      throw new AssessmentClassroomWindowError();
    }
    return row;
  }

  saveDraft(
    actor: AuthenticatedActor,
    attemptToken: string,
    answers: AssessmentDraftAnswers,
    expectedRevision: number,
    expectedNodeId?: string,
  ): AssessmentDraftDto {
    const studentId = requireStudent(actor);
    if (typeof attemptToken !== 'string' || attemptToken.trim().length < 24) {
      throw new AssessmentTokenError('invalid-token');
    }
    const normalizedAnswers = normalizeDraftAnswers(answers);
    const updatedAt = this.now().toISOString();
    const outcome = this.database.transaction(() => {
      const token = this.readToken(hashToken(attemptToken));
      if (!token || token.studentId !== studentId) throw new AssessmentTokenError('invalid-token');
      if (token.usedAt !== null) throw new AssessmentTokenError('used-token');
      this.assertTokenInstanceBinding(token, expectedNodeId);
      if (Date.parse(token.instanceExpiresAt ?? '') <= Date.parse(updatedAt)) {
        this.expireInstance(token.assessmentId, updatedAt);
        return undefined;
      }
      this.requireClassroomRunStillOpen(token);
      const definition = requireDefinitionVersion(token.nodeId, token.questionVersion);
      validateDraftOptions(definition, normalizedAnswers);
      return new FormalAssessmentAttemptRepository(this.database).saveDraft({
        assessmentId: token.assessmentId,
        studentId,
        answers: normalizedAnswers,
        expectedRevision,
        updatedAt,
      });
    }).immediate();
    if (!outcome) throw new AssessmentTokenError('expired-token');
    return outcome;
  }

  submitAnswers(
    actor: AuthenticatedActor,
    attemptToken: string,
    answers: AssessmentAnswers,
    expectedNodeId?: string,
  ): AssessmentDiagnosis {
    const studentId = requireStudent(actor);
    if (typeof attemptToken !== 'string' || attemptToken.trim().length < 24) {
      throw new AssessmentTokenError('invalid-token');
    }
    const normalizedAnswers = normalizeAnswers(answers);
    const completedAt = this.now().toISOString();

    const outcome = this.database.transaction(() => {
      const token = this.readToken(hashToken(attemptToken));
      if (!token || token.studentId !== studentId) throw new AssessmentTokenError('invalid-token');
      if (token.usedAt !== null) throw new AssessmentTokenError('used-token');
      this.assertTokenInstanceBinding(token, expectedNodeId);
      if (Date.parse(token.instanceExpiresAt ?? '') <= Date.parse(completedAt)) {
        this.expireInstance(token.assessmentId, completedAt);
        return undefined;
      }
      this.requireClassroomRunStillOpen(token);

      const definition = requireDefinitionVersion(token.nodeId, token.questionVersion);
      validateAnswerOptions(definition, normalizedAnswers);
      const graded = gradeAnswers(definition, normalizedAnswers);
      const passed = graded.totalScore >= definition.paper.passScore;
      const correction = passed
        ? undefined
        : this.projectProgressiveCorrection(studentId, token.nodeId, definition.paper.passScore);
      const attemptId = `formal-attempt-${this.randomId()}`;
      const diagnosisBase = {
        assessmentId: token.assessmentId,
        attemptId,
        studentId,
        nodeId: token.nodeId,
        gameId: definition.gameId,
        questionVersion: token.questionVersion,
        totalScore: graded.totalScore,
        passed,
        dimensions: graded.dimensions,
        remediationTargets: graded.remediationTargets,
        origin: 'user' as const,
        completedAt,
      };
      const durationSeconds = Math.max(0, Math.round(
        (new Date(completedAt).getTime() - new Date(token.openedAt ?? token.issuedAt).getTime()) / 1_000,
      ));

      const consumed = this.database.prepare(`
        UPDATE formal_assessment_tokens SET used_at = ?
        WHERE assessment_id = ? AND student_id = ? AND used_at IS NULL
      `).run(completedAt, token.assessmentId, studentId);
      if (consumed.changes < 1) throw new AssessmentTokenError('used-token');
      this.database.prepare(`
        INSERT INTO formal_attempts (
          attempt_id, student_id, node_id, assessment_id, game_id, score, duration_seconds,
          mistake_knowledge_point_ids_json, completed_at, question_version, answers_json,
          diagnostics_json, origin
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')
      `).run(
        attemptId,
        studentId,
        token.nodeId,
        token.assessmentId,
        definition.gameId,
        graded.totalScore,
        durationSeconds,
        JSON.stringify(graded.remediationTargets.map(({ sectionId }) => sectionId)),
        completedAt,
        token.questionVersion,
        JSON.stringify(normalizedAnswers),
        JSON.stringify(diagnosisBase),
      );
      this.database.prepare(`
        UPDATE formal_assessment_instances
        SET status = 'closed', closed_at = ?, closure_reason = 'submitted'
        WHERE status = 'running' AND assessment_id = ?
      `).run(completedAt, token.assessmentId);
      const versions = new SnapshotClock(this.database).advance(
        [`learning:${studentId}`],
        completedAt,
      );

      return {
        ...diagnosisBase,
        ...(correction ? { correction } : {}),
        version: versions.topicVersions[`learning:${studentId}`],
        globalVersion: versions.globalVersion,
        paper: projectAssessmentPaper(definition),
      };
    }).immediate();
    if (!outcome) throw new AssessmentTokenError('expired-token');
    return outcome;
  }

  private readToken(tokenHash: string): TokenRow | undefined {
    return this.database.prepare(`
      SELECT token.assessment_id AS assessmentId, token.student_id AS studentId,
        token.node_id AS nodeId, token.question_version AS questionVersion,
        token.issued_at AS issuedAt, token.expires_at AS expiresAt, token.used_at AS usedAt,
        instance.node_id AS instanceNodeId,
        instance.question_version AS instanceQuestionVersion,
        instance.game_id AS instanceGameId,
        instance.status,
        instance.opened_at AS openedAt,
        instance.expires_at AS instanceExpiresAt,
        instance.session_id AS classroomSessionId,
        instance.classroom_run_id AS classroomRunId
      FROM formal_assessment_tokens AS token
      INNER JOIN formal_assessment_instances AS instance
        ON instance.assessment_id = token.assessment_id
      WHERE token.token_hash = ?
    `).get(tokenHash) as TokenRow | undefined;
  }

  private assertTokenInstanceBinding(token: TokenRow, expectedNodeId?: string): void {
    if (expectedNodeId !== undefined && token.nodeId !== expectedNodeId) {
      throw new AssessmentTokenError('invalid-token');
    }
    if (token.status !== 'running'
      || token.nodeId !== token.instanceNodeId
      || token.questionVersion !== token.instanceQuestionVersion
      || !token.instanceExpiresAt
      || token.expiresAt !== token.instanceExpiresAt) {
      throw new AssessmentTokenError('invalid-token');
    }
  }

  private requireClassroomRunStillOpen(token: TokenRow): void {
    if (token.classroomSessionId === null && token.classroomRunId === null) return;
    if (!token.classroomSessionId || !token.classroomRunId) {
      throw new AssessmentTokenError('invalid-token');
    }
    const stillOpen = this.database.prepare(`
      SELECT EXISTS(
        SELECT 1
        FROM classroom_assessment_runs AS run
        INNER JOIN classroom_lesson_runs AS lesson
          ON lesson.lesson_run_id = run.lesson_run_id
          AND lesson.session_id = run.session_id
        INNER JOIN classroom_sessions AS classroom
          ON classroom.session_id = run.session_id
          AND classroom.active_lesson_run_id = lesson.lesson_run_id
        INNER JOIN classroom_members AS member
          ON member.session_id = classroom.session_id
          AND member.student_id = ?
        WHERE run.run_id = ?
          AND run.session_id = ?
          AND run.node_id = ?
          AND run.game_id = ?
          AND run.status = 'running'
          AND run.expires_at = ?
          AND classroom.status = 'active'
          AND lesson.status IN ('active', 'paused')
      )
    `).pluck().get(
      token.studentId,
      token.classroomRunId,
      token.classroomSessionId,
      token.nodeId,
      token.instanceGameId,
      token.instanceExpiresAt,
    ) === 1;
    if (!stillOpen) {
      throw new AssessmentClassroomWindowError();
    }
  }

  private readMissingRemediationTargets(
    studentId: string,
    definition: FormalAssessmentDefinition,
  ): RemediationTarget[] {
    const latest = this.database.prepare(`
      SELECT score, diagnostics_json AS diagnosticsJson, completed_at AS completedAt
      FROM formal_attempts
      WHERE student_id = ? AND node_id = ? AND origin = 'user'
      ORDER BY julianday(completed_at) DESC, attempt_id DESC
      LIMIT 1
    `).get(
      studentId,
      definition.paper.nodeId,
    ) as LatestAttemptRow | undefined;
    if (!latest || latest.score >= definition.paper.passScore) return [];

    const targets = parseRemediationTargets(latest.diagnosticsJson);
    const completed = this.database.prepare(`
      SELECT EXISTS(
        SELECT 1 FROM practice_attempts
        WHERE student_id = @studentId
          AND node_id = @nodeId
          AND activity_id = @activityId
          AND passed = 1
          AND origin = 'user'
          AND julianday(attempted_at) > julianday(@completedAt)
      )
    `).pluck();
    return targets.filter((target) => completed.get({
      studentId,
      nodeId: target.nodeId,
      activityId: target.activityId,
      completedAt: latest.completedAt,
    }) !== 1);
  }

  private projectProgressiveCorrection(
    studentId: string,
    nodeId: string,
    passScore: number,
  ): NonNullable<AssessmentDiagnosis['correction']> {
    const priorFailureCount = this.database.prepare(`
      SELECT COUNT(*)
      FROM formal_attempts
      WHERE student_id = ? AND node_id = ? AND origin = 'user' AND score < ?
    `).pluck().get(studentId, nodeId, passScore) as number;
    const level = Math.min(3, priorFailureCount + 1) as 1 | 2 | 3;
    if (level === 1) {
      return {
        level,
        stage: 'diagnosis',
        guidance: ['先查看四个失分维度，再进入对应岗位活动完成定向补强。'],
        rotateNext: false,
      };
    }
    if (level === 2) {
      return {
        level,
        stage: 'rule-location',
        guidance: ['按位置、身份、方向三类证据规则定位错误，再用字段来源逐项复核。'],
        rotateNext: false,
      };
    }
    return {
      level,
      stage: 'worked-correction',
      guidance: getWorkedCorrectionGuidance(nodeId),
      rotateNext: true,
    };
  }
}

export function createFormalAssessmentService(
  database: AppDatabase = getDatabase(),
): FormalAssessmentService {
  return new FormalAssessmentService(database);
}

function requireStudent(actor: AuthenticatedActor): string {
  if (actor.role !== 'student' || !actor.studentId || actor.studentId !== actor.userId) {
    throw new LearningAuthorizationError();
  }
  return actor.studentId;
}

function requireDefinition(nodeId: string): FormalAssessmentDefinition {
  const definition = getFormalAssessmentDefinition(nodeId);
  if (!definition) throw new AssessmentCatalogError(nodeId);
  return definition;
}

function requireDefinitionVersion(nodeId: string, questionVersion: string): FormalAssessmentDefinition {
  const definition = getFormalAssessmentDefinitionByVersion(nodeId, questionVersion);
  if (!definition) throw new AssessmentTokenError('invalid-token');
  return definition;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

interface ActiveClassroomAssessmentRunRow {
  sessionId: string;
  runId: string;
  expiresAt: string;
  status: 'running' | 'paused';
}

function parseRemediationTargets(diagnosticsJson: string): RemediationTarget[] {
  try {
    const parsed = JSON.parse(diagnosticsJson) as { remediationTargets?: unknown };
    if (!Array.isArray(parsed.remediationTargets)) return [];
    return uniqueRemediationTargets(parsed.remediationTargets.flatMap((target) => {
      if (typeof target !== 'object' || target === null) return [];
      const record = target as Record<string, unknown>;
      if (typeof record.nodeId !== 'string' || typeof record.sectionId !== 'string') return [];
      if (record.sectionId === 'practice' && typeof record.activityId === 'string') {
        return [{
          nodeId: record.nodeId,
          sectionId: 'practice' as const,
          activityId: record.activityId,
        }];
      }
      const legacyActivityId = legacyRemediationActivityId(record.sectionId);
      return legacyActivityId ? [{
        nodeId: record.nodeId,
        sectionId: 'practice' as const,
        activityId: legacyActivityId,
      }] : [];
    }));
  } catch {
    return [];
  }
}

function uniqueRemediationTargets(targets: RemediationTarget[]): RemediationTarget[] {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.nodeId}:${target.sectionId}:${target.activityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function legacyRemediationActivityId(sectionId: string): string | undefined {
  return ({
    evidence: 'P1T1-N02-foundation-01',
    explain: 'P1T1-N02-application-01',
    practice: 'P1T1-N02-transfer-01',
    understand: 'P1T1-N02-transfer-01',
  } as Record<string, string>)[sectionId];
}

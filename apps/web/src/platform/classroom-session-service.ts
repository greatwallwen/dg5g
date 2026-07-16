import type { AuthenticatedActor } from './auth/actor.ts';
import {
  applyClassroomLessonIntent,
  initialLessonState,
  type ClassroomLessonIntent,
} from './classroom-state.ts';
import {
  projectClassSession,
  type ProjectorClassSession,
} from './class-session-projection.ts';
import {
  hasSessionPatch,
  normalizeSessionPatch,
  type SessionPatch,
} from './class-session-protocol.ts';
import {
  ClassroomRevisionConflictError,
  ClassroomSessionNotFoundError,
  ClassroomSessionRepository,
  type ClassroomSessionStateV1,
  type StoredClassroomSession,
} from './classroom-session-repository.ts';
import { ClassroomRosterRepository } from './classroom-roster-repository.ts';
import { initialClassSessionFor } from './fixtures/index.ts';
import {
  getNodeLearningPolicy,
  type NodeLearningPolicy,
} from './learning-policy.ts';
import type { ClassSession, ClassroomCommand, StudentProgress } from './models.ts';

export class ClassroomAuthorizationError extends Error {
  override readonly name = 'ClassroomAuthorizationError';
}

export class ClassroomIntentError extends Error {
  override readonly name = 'ClassroomIntentError';
}

export class ClassroomSessionService {
  constructor(
    private readonly repository: ClassroomSessionRepository,
    private readonly rosterRepository: ClassroomRosterRepository,
    private readonly readNodePolicy: (nodeId: string) => NodeLearningPolicy | undefined = getNodeLearningPolicy,
  ) {}

  read(
    actor: AuthenticatedActor,
    sessionId: string,
    view: 'projector',
    now?: Date,
  ): ProjectorClassSession | undefined;
  read(
    actor: AuthenticatedActor,
    sessionId: string,
    view?: 'actor',
    now?: Date,
  ): ClassSession | undefined;
  read(
    actor: AuthenticatedActor,
    sessionId: string,
    view: 'actor' | 'projector' = 'actor',
    now = new Date(),
  ): ClassSession | ProjectorClassSession | undefined {
    const aggregate = this.readAuthorizedAggregate(actor, sessionId);
    if (!aggregate) return undefined;
    const session = this.materialize(aggregate.session, aggregate.roster, now);
    if (view === 'projector') {
      this.requireProjectorRole(actor);
      return projectClassSession(session, 'projector');
    }
    return actor.role === 'student'
      ? projectClassSession(session, 'student', actor.studentId ?? '')
      : projectClassSession(session, 'teacher');
  }

  startLesson(
    actor: AuthenticatedActor,
    sessionId: string,
    input: { nodeId: string; expectedRevision: number },
    now = new Date(),
  ): { session: ClassSession; command: ClassroomCommand } {
    const aggregate = this.readAuthorizedAggregate(actor, sessionId);
    if (!aggregate) throw new ClassroomSessionNotFoundError(sessionId);
    this.requireOwningTeacher(actor, aggregate.session);
    const policy = this.readNodePolicy(input.nodeId);
    if (!policy
      || policy.nodeId !== input.nodeId
      || policy.publicationStatus !== 'published') {
      throw new ClassroomIntentError(`Classroom node is not published: ${input.nodeId}.`);
    }
    const activeNodeId = policy.nodeId;
    const activeUnitId = `${policy.taskId}-ku-${policy.nodeId.slice(-2)}`;
    const nextRevision = input.expectedRevision + 1;
    const lesson = initialLessonState(activeNodeId, activeUnitId);
    lesson.revision = nextRevision;
    lesson.playback.revision = nextRevision;
    const state: ClassroomSessionStateV1 = {
      schemaVersion: 1,
      lesson,
      currentPageId: 'P1-TEACH-CONSOLE-N01',
      currentSlideId: `${activeNodeId}-S01`,
      teacherSlideId: `${activeNodeId}-S01`,
      teacherSlideIndex: 1,
      sceneMode: 'learning',
      studentSyncState: 'idle',
      playbackCursor: {
        sceneId: lesson.playback.sceneId,
        actionId: lesson.playback.actionId,
        actionIndex: 0,
        updatedAt: now.toISOString(),
      },
      activityState: 'not_pushed',
      reviewState: 'not_started',
      formalTest: {
        assessmentId: `AS-${activeNodeId}`,
        gameId: `${activeNodeId}-formal-test`,
        nodeId: activeNodeId,
        status: 'idle',
        durationSeconds: 360,
      },
    };
    const mutation = this.repository.commitTeacherMutation({
      sessionId,
      expectedRevision: input.expectedRevision,
      next: {
        status: 'active',
        activeNodeId,
        activeUnitId,
        state,
      },
      command: {
        phase: 'prepare',
        route: `/classroom/${sessionId}`,
        nodeId: activeNodeId,
        unitId: activeUnitId,
      },
    }, now);
    return {
      command: mutation.command,
      session: this.materialize(mutation.session, undefined, now),
    };
  }

  applyTeacherIntent(
    actor: AuthenticatedActor,
    sessionId: string,
    intent: ClassroomLessonIntent,
    expectedRevision: number,
    now = new Date(),
  ): { session: ClassSession; command: ClassroomCommand } {
    const aggregate = this.readAuthorizedAggregate(actor, sessionId);
    if (!aggregate) throw new Error(`Classroom session not found: ${sessionId}`);
    this.requireOwningTeacher(actor, aggregate.session);
    assertSessionWritable(aggregate.session);
    assertTeachingPosition(
      aggregate.session.state.lesson.activeNodeId,
      aggregate.session.state.lesson.activeUnitId,
    );
    if (expectedRevision !== aggregate.session.revision) {
      throw new ClassroomRevisionConflictError(
        sessionId,
        expectedRevision,
        aggregate.session.revision,
      );
    }
    const lesson = applyClassroomLessonIntent(aggregate.session.state.lesson, intent, now);
    if (lesson === aggregate.session.state.lesson) {
      throw new ClassroomIntentError(`Illegal classroom intent: ${intent.type}.`);
    }
    const mutation = this.repository.commitTeacherMutation({
      sessionId,
      expectedRevision,
      next: {
        status: aggregate.session.status === 'closed' ? 'closed' : 'active',
        activeNodeId: lesson.activeNodeId,
        activeUnitId: lesson.activeUnitId,
        state: {
          ...aggregate.session.state,
          lesson,
          sceneMode: sceneModeForPhase(lesson.phase),
          playbackCursor: {
            sceneId: lesson.playback.sceneId,
            actionId: lesson.playback.actionId,
            actionIndex: lesson.playback.actionIndex,
            updatedAt: now.toISOString(),
          },
        },
      },
      command: {
        phase: lesson.phase,
        route: `/classroom/${sessionId}`,
        nodeId: lesson.activeNodeId,
        unitId: lesson.activeUnitId,
      },
    }, now);
    return {
      command: mutation.command,
      session: this.materialize(mutation.session, aggregate.roster, now),
    };
  }

  patchTeacherState(
    actor: AuthenticatedActor,
    sessionId: string,
    patch: SessionPatch,
    expectedRevision: number,
    now = new Date(),
  ): ClassSession {
    const aggregate = this.readAuthorizedAggregate(actor, sessionId);
    if (!aggregate) throw new Error(`Classroom session not found: ${sessionId}`);
    this.requireOwningTeacher(actor, aggregate.session);
    assertSessionWritable(aggregate.session);
    if (expectedRevision !== aggregate.session.revision) {
      throw new ClassroomRevisionConflictError(
        sessionId,
        expectedRevision,
        aggregate.session.revision,
      );
    }
    const normalized = normalizeSessionPatch('teacher', patch);
    if (!hasSessionPatch(normalized)) throw new ClassroomIntentError('Teacher patch has no shared classroom fields.');
    if (normalized.studentProgress) {
      throw new ClassroomIntentError('Student progress is not part of shared classroom state.');
    }
    const state = { ...aggregate.session.state };
    assignOptional(state, 'currentPageId', normalized.currentPageId);
    assignOptional(state, 'currentSlideId', normalized.currentSlideId);
    if (normalized.teacherSlideId !== undefined) state.teacherSlideId = normalized.teacherSlideId;
    if (normalized.teacherSlideIndex !== undefined) state.teacherSlideIndex = normalized.teacherSlideIndex;
    if (normalized.sceneMode !== undefined) state.sceneMode = normalized.sceneMode;
    assignOptional(state, 'studentSyncState', normalized.studentSyncState);
    assignOptional(state, 'syncRequestId', normalized.syncRequestId);
    if ('playbackCursor' in normalized) state.playbackCursor = normalized.playbackCursor;
    if (normalized.activityState !== undefined) state.activityState = normalized.activityState;
    if (normalized.reviewState !== undefined) state.reviewState = normalized.reviewState;
    if (normalized.formalTest) {
      state.formalTest = {
        assessmentId: normalized.formalTest.assessmentId,
        gameId: normalized.formalTest.gameId,
        nodeId: normalized.formalTest.nodeId,
        status: normalized.formalTest.status,
        durationSeconds: normalized.formalTest.durationSeconds,
        ...(normalized.formalTest.startedAt ? { startedAt: normalized.formalTest.startedAt } : {}),
      };
    }
    const activeNodeId = normalized.activeNodeId
      ?? aggregate.session.activeNodeId
      ?? aggregate.session.state.lesson.activeNodeId;
    const activeUnitId = normalized.activeUnitId
      ?? aggregate.session.activeUnitId
      ?? aggregate.session.state.lesson.activeUnitId;
    assertTeachingPosition(activeNodeId, activeUnitId);
    const nextRevision = expectedRevision + 1;
    state.lesson = {
      ...state.lesson,
      activeNodeId,
      activeUnitId,
      revision: nextRevision,
      playback: { ...state.lesson.playback, revision: nextRevision },
    };
    const mutation = this.repository.commitTeacherMutation({
      sessionId,
      expectedRevision,
      next: {
        status: aggregate.session.status,
        activeNodeId,
        activeUnitId,
        state,
      },
      command: {
        phase: state.lesson.phase,
        route: `/classroom/${sessionId}`,
        nodeId: activeNodeId,
        unitId: activeUnitId,
      },
    }, now);
    return this.materialize(mutation.session, aggregate.roster, now);
  }

  materialize(
    stored: StoredClassroomSession,
    roster?: StudentProgress[],
    now = new Date(),
  ): ClassSession {
    const studentRoster = roster ?? this.rosterRepository.readStudentRoster(
      stored.sessionId,
      stored.activeNodeId ?? stored.state.lesson.activeNodeId,
    );
    const fixture = initialClassSessionFor(stored.state.lesson.activeNodeId, studentRoster);
    const device = this.repository.readDeviceSnapshot(stored.sessionId, now);
    return {
      ...fixture,
      sessionId: stored.sessionId,
      sessionStatus: stored.status,
      currentPageId: stored.state.currentPageId ?? fixture.currentPageId,
      currentSlideId: stored.state.currentSlideId ?? fixture.currentSlideId,
      teacherSlideId: stored.state.teacherSlideId,
      teacherSlideIndex: stored.state.teacherSlideIndex,
      sceneMode: stored.state.sceneMode,
      activeNodeId: stored.activeNodeId,
      activeUnitId: stored.activeUnitId,
      lessonState: stored.state.lesson,
      activeCommand: device.command,
      devicePresence: device.devices,
      commandAcks: device.acks,
      studentSyncState: stored.state.studentSyncState,
      syncRequestId: stored.state.syncRequestId,
      playbackCursor: stored.state.playbackCursor,
      lastUpdatedAt: stored.updatedAt,
      activityState: stored.state.activityState,
      reviewState: stored.state.reviewState,
      studentRoster,
      formalTest: stored.state.formalTest
        ? {
            ...fixture.formalTest!,
            ...stored.state.formalTest,
            participants: fixture.formalTest?.participants ?? [],
          }
        : fixture.formalTest,
    };
  }

  private readAuthorizedAggregate(
    actor: AuthenticatedActor,
    sessionId: string,
  ): { session: StoredClassroomSession; roster: StudentProgress[] } | undefined {
    const session = this.repository.readSession(sessionId);
    if (!session) return undefined;
    if (actor.classId !== session.classId) {
      throw new ClassroomAuthorizationError('Class session is outside the authenticated class.');
    }
    if (actor.role === 'teacher' && actor.userId !== session.teacherId) {
      throw new ClassroomAuthorizationError('Teacher does not own this class session.');
    }
    const roster = this.rosterRepository.readStudentRoster(
      sessionId,
      session.activeNodeId ?? session.state.lesson.activeNodeId,
    );
    if (actor.role === 'student'
      && (!actor.studentId
        || actor.userId !== actor.studentId
        || !roster.some(({ studentId }) => studentId === actor.studentId))) {
      throw new ClassroomAuthorizationError('Student is not part of this class session.');
    }
    return { session, roster };
  }

  private requireProjectorRole(actor: AuthenticatedActor): 'projector' {
    if (actor.role !== 'teacher') {
      throw new ClassroomAuthorizationError('Only teachers can open the projector view.');
    }
    return 'projector';
  }

  private requireOwningTeacher(actor: AuthenticatedActor, session: StoredClassroomSession): void {
    if (actor.role !== 'teacher' || actor.userId !== session.teacherId) {
      throw new ClassroomAuthorizationError('Only the owning teacher can change classroom state.');
    }
  }
}

function sceneModeForPhase(phase: NonNullable<ClassSession['lessonState']>['phase']): NonNullable<ClassSession['sceneMode']> {
  if (phase === 'challenge') return 'challenge';
  if (phase === 'review') return 'review';
  return 'learning';
}

function assignOptional<
  T extends object,
  K extends keyof T,
>(target: T, key: K, value: T[K] | undefined): void {
  if (value === undefined) delete target[key];
  else target[key] = value;
}

function assertSessionWritable(session: StoredClassroomSession): void {
  if (session.status === 'closed') {
    throw new ClassroomIntentError('Closed classroom sessions are read-only.');
  }
}

function assertTeachingPosition(activeNodeId: string, activeUnitId: string): void {
  const policy = getNodeLearningPolicy(activeNodeId);
  if (!policy || policy.publicationStatus !== 'published') {
    throw new ClassroomIntentError(`Classroom node is not published: ${activeNodeId}.`);
  }
  const expectedUnitId = `${policy.taskId}-ku-${activeNodeId.slice(-2)}`;
  if (activeUnitId !== expectedUnitId) {
    throw new ClassroomIntentError(
      `Classroom unit ${activeUnitId} does not belong to ${activeNodeId}.`,
    );
  }
}

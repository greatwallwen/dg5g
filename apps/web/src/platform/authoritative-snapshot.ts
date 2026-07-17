import type { AuthenticatedActor } from './auth/actor.ts';
import { ClassroomParticipationRepository } from './classroom-participation-repository.ts';
import {
  ClassroomSessionNotFoundError,
  ClassroomSessionRepository,
  type ClassroomSessionStatus,
  type StoredClassroomSession,
} from './classroom-session-repository.ts';
import type { AppDatabase } from './db/database.ts';
import { loadP1DemoContent, type P1NodeId, type P1TaskId } from '../features/platform/p1-content.ts';
import { LearningReadModel, type StudentLearningSnapshot } from './learning-read-model.ts';
import { getNodeLearningPolicy, nodeLearningPolicies } from './learning-policy.ts';
import { LearningRepository } from './learning-repository.ts';
import type { NodeLearningState } from './learning-status.ts';
import { nodeLearningStateCompletionPercent } from './learning-status.ts';
import type { NodeStateAxes } from './learning-projection.ts';
import { projectP1Project, type P1ProjectProjection } from './p1-project-projection.ts';
import { SnapshotClock } from './snapshot-clock.ts';
import type { LearningOrigin } from './learning-origin.ts';
import { readValidatedClassroomRunAttempts } from './classroom-assessment-run-reader.ts';
import {
  assessmentDimensionKeys,
  type AssessmentDimensionKey,
} from './formal-assessment-contract.ts';

export type SnapshotAudience = 'student' | 'teacher' | 'projector' | 'graph';
export type ScoreDistributionRange = '90-100' | 'pass-89' | '60-below-pass' | 'below-60';

export interface SnapshotSubmissionMetrics {
  classroomActivity: {
    submittedCount: number;
    submissionPercent: number;
  };
  activeAssessment: {
    status: 'idle' | 'running' | 'paused' | 'review';
    eligibleCount: number;
    submittedCount: number;
    playingCount: number;
    passedCount: number;
    submissionPercent: number;
    passRatePercent?: number;
    errorDistribution?: Array<{
      dimension: AssessmentDimensionKey;
      incorrectCount: number;
      percent: number;
    }>;
  };
  professionalOutputs: {
    submittedAwaitingReviewCount: number;
    returnedCount: number;
    verifiedCount: number;
  };
}

export interface ClassScoreSnapshot {
  activeNodeTestHighestScore?: number;
  activeNodeTestAverageScore?: number;
  activeTaskCompositeAverageScore?: number;
  projectCompositeAverageScore?: number;
  distribution: Array<{ range: ScoreDistributionRange; count: number }>;
  demoData?: boolean;
}

export interface SnapshotCommon {
  snapshotVersion: number;
  generatedAt: string;
  classroom: {
    sessionId: string;
    classId: string;
    revision: number;
    status: ClassroomSessionStatus;
    activeTaskId?: P1TaskId;
    activeNodeId?: P1NodeId;
    activeUnitId?: string;
  };
  project: {
    projectId: 'P1';
    projectTitle: string;
    finalOutputTitle: string;
    taskIds: readonly ['P01', 'P02', 'P03'];
  };
  membership: {
    classSize: number;
    joinedCount: number;
    followingCount: number;
  };
  submissions: SnapshotSubmissionMetrics;
  classScores: ClassScoreSnapshot;
  helper: {
    status: 'offline' | 'online' | 'degraded';
    observedAt: string;
    onlineStudentDeviceCount: number;
    commandDelivery: { applied: number; pending: number; failed: number };
    canPush: boolean;
  };
}

export interface StudentSnapshotDetail {
  studentId: string;
  displayName: string;
  studentVersion: number;
  nodes: Array<{
    nodeId: P1NodeId;
    axes: NodeStateAxes;
    state: NodeLearningState;
    nodeTestHighestScore?: number;
    nextRequirement: string;
    origin?: LearningOrigin;
  }>;
  tasks: Array<{
    taskId: P1TaskId;
    stateCompletionPercent: number;
    nodeTestHighestScore?: number;
    taskCompositeScore?: number;
    origin?: LearningOrigin;
  }>;
  project: Omit<P1ProjectProjection, 'studentVersion' | 'snapshotVersion'>;
  projectCompositeScore?: number;
  projectCompositeOrigin?: LearningOrigin;
}

export interface StudentSelfSnapshotDetail extends StudentSnapshotDetail {
  learning: StudentLearningSnapshot;
}

export interface WeakPointSnapshot {
  nodeId: P1NodeId;
  attentionCount: number;
  stateCounts: Partial<Record<NodeLearningState, number>>;
}

type StudentGraphDetail = Pick<StudentSnapshotDetail,
  'studentId' | 'studentVersion' | 'nodes' | 'tasks' | 'projectCompositeScore' | 'projectCompositeOrigin'>;

export type AuthoritativeSnapshot =
  | (SnapshotCommon & { audience: 'student'; me: StudentSelfSnapshotDetail })
  | (SnapshotCommon & { audience: 'teacher'; students: StudentSnapshotDetail[]; weakPoints: WeakPointSnapshot[] })
  | (SnapshotCommon & { audience: 'projector' })
  | (SnapshotCommon & { audience: 'graph'; mode: 'student'; me: StudentGraphDetail })
  | (SnapshotCommon & {
      audience: 'graph';
      mode: 'teacher';
      nodeHeatmap: Array<{ nodeId: P1NodeId; stateCounts: Partial<Record<NodeLearningState, number>> }>;
      tasks: Array<{
        taskId: P1TaskId;
        stateCompletionPercent: number;
        taskCompositeScore?: number;
        origin?: LearningOrigin;
      }>;
    });

export type StudentAuthoritativeSnapshot = Extract<AuthoritativeSnapshot, { audience: 'student' }>;
export type TeacherAuthoritativeSnapshot = Extract<AuthoritativeSnapshot, { audience: 'teacher' }>;
export type ProjectorAuthoritativeSnapshot = Extract<AuthoritativeSnapshot, { audience: 'projector' }>;
export type GraphAuthoritativeSnapshot = Extract<AuthoritativeSnapshot, { audience: 'graph' }>;

export interface AuthoritativeSnapshotReadOptions {
  sessionId?: string;
  now?: Date;
}

export class AuthoritativeSnapshotAuthorizationError extends Error {
  override readonly name = 'AuthoritativeSnapshotAuthorizationError';
}

interface MemberRow {
  studentId: string;
  displayName: string;
}

interface ProjectedStudent {
  member: MemberRow;
  learning: StudentLearningSnapshot;
}

export class AuthoritativeSnapshotReader {
  constructor(private readonly database: AppDatabase) {}

  read(actor: AuthenticatedActor, audience: 'student', options?: AuthoritativeSnapshotReadOptions): StudentAuthoritativeSnapshot;
  read(actor: AuthenticatedActor, audience: 'teacher', options?: AuthoritativeSnapshotReadOptions): TeacherAuthoritativeSnapshot;
  read(actor: AuthenticatedActor, audience: 'projector', options?: AuthoritativeSnapshotReadOptions): ProjectorAuthoritativeSnapshot;
  read(actor: AuthenticatedActor, audience: 'graph', options?: AuthoritativeSnapshotReadOptions): GraphAuthoritativeSnapshot;
  read(
    actor: AuthenticatedActor,
    audience: SnapshotAudience,
    options: AuthoritativeSnapshotReadOptions = {},
  ): AuthoritativeSnapshot {
    assertAudienceRole(actor, audience);
    const observedAt = normalizeNow(options.now);
    const transaction = this.database.transaction(() => {
      const clock = new SnapshotClock(this.database);
      const openingVersion = clock.read('global');
      this.assertStoredActor(actor);
      const session = this.readAuthorizedSession(actor, options.sessionId);
      const members = this.readMembers(session.sessionId);
      assertActorMembership(actor, session, members);

      const learningReadModel = new LearningReadModel(new LearningRepository(this.database));
      const students = members.map((member): ProjectedStudent => ({
        member,
        learning: learningReadModel.readStudentSnapshot(member.studentId),
      }));
      const common = this.projectCommon(session, students, openingVersion, observedAt);
      const snapshot = this.cutAudience(actor, audience, common, students);
      const closingVersion = clock.read('global');
      if (closingVersion.version !== openingVersion.version
        || closingVersion.updatedAt !== openingVersion.updatedAt) {
        throw new Error('Authoritative snapshot version changed inside one SQLite read transaction.');
      }
      return snapshot;
    });
    return transaction.deferred();
  }

  private assertStoredActor(actor: AuthenticatedActor): void {
    const valid = actor.role === 'teacher'
      ? this.database.prepare(`
          SELECT EXISTS(
            SELECT 1
            FROM users AS actor
            INNER JOIN classroom_sessions AS classroom ON classroom.teacher_id = actor.id
            WHERE actor.id = ? AND actor.role = 'teacher' AND actor.is_active = 1
              AND classroom.class_id = ?
          )
        `).pluck().get(actor.userId, actor.classId)
      : this.database.prepare(`
          SELECT EXISTS(
            SELECT 1
            FROM users AS actor
            INNER JOIN classroom_members AS member ON member.student_id = actor.id
            INNER JOIN classroom_sessions AS classroom ON classroom.session_id = member.session_id
            WHERE actor.id = ? AND actor.role = 'student' AND actor.is_active = 1
              AND classroom.class_id = ?
          )
        `).pluck().get(actor.userId, actor.classId);
    if (valid !== 1) {
      throw new AuthoritativeSnapshotAuthorizationError('Authenticated actor is outside the requested class.');
    }
  }

  private readAuthorizedSession(actor: AuthenticatedActor, requestedSessionId?: string): StoredClassroomSession {
    const sessionId = requestedSessionId
      ? this.database.prepare(`
          SELECT session_id FROM classroom_sessions WHERE session_id = ?
        `).pluck().get(requestedSessionId)
      : this.database.prepare(`
          SELECT session_id
          FROM classroom_sessions
          WHERE class_id = ?
          ORDER BY CASE status
            WHEN 'active' THEN 0
            WHEN 'paused' THEN 1
            WHEN 'preparing' THEN 2
            ELSE 3
          END, updated_at DESC, session_id
          LIMIT 1
        `).pluck().get(actor.classId);
    if (typeof sessionId !== 'string') {
      throw new ClassroomSessionNotFoundError(requestedSessionId ?? actor.classId);
    }
    const session = new ClassroomSessionRepository(this.database).readSession(sessionId);
    if (!session) throw new ClassroomSessionNotFoundError(sessionId);
    if (session.classId !== actor.classId) {
      throw new AuthoritativeSnapshotAuthorizationError('Snapshot session is outside the actor class.');
    }
    if (actor.role === 'teacher' && session.teacherId !== actor.userId) {
      throw new AuthoritativeSnapshotAuthorizationError('Teacher does not own this classroom session.');
    }
    return session;
  }

  private readMembers(sessionId: string): MemberRow[] {
    return this.database.prepare(`
      SELECT member.student_id AS studentId, student.display_name AS displayName
      FROM classroom_members AS member
      INNER JOIN users AS student ON student.id = member.student_id
      WHERE member.session_id = ?
        AND student.role = 'student'
        AND student.is_active = 1
      ORDER BY member.student_id
    `).all(sessionId) as MemberRow[];
  }

  private projectCommon(
    session: StoredClassroomSession,
    students: ProjectedStudent[],
    version: { version: number; updatedAt: string },
    observedAt: Date,
  ): SnapshotCommon {
    const content = loadP1DemoContent();
    const participation = new ClassroomParticipationRepository(this.database);
    const activeNodeId = canonicalNodeId(session.activeNodeId);
    const activePolicy = activeNodeId ? getNodeLearningPolicy(activeNodeId) : undefined;
    const device = new ClassroomSessionRepository(this.database).readDeviceSnapshot(session.sessionId, observedAt);
    const joinedCount = participation.readJoinedStudentIds(session.sessionId).length;
    const followingCount = participation.readFollowingStudentIds(session.sessionId).length;
    const scoreFacts = activeNodeId
      ? students.flatMap(({ learning }) => {
          const node = learning.nodes.find(({ nodeId }) => nodeId === activeNodeId);
          return node?.bestFormalScore === undefined ? [] : [{ score: node.bestFormalScore, origin: node.origin }];
        })
      : [];
    const taskScoreFacts = activePolicy
      ? students.flatMap(({ learning }) => {
          const task = learning.tasks.find(({ taskId }) => taskId === activePolicy.taskId);
          return task?.taskCompositeScore === undefined ? [] : [{ score: task.taskCompositeScore, origin: task.origin }];
        })
      : [];
    const projectScoreFacts = students.flatMap(({ learning }) => (
      learning.projectCompositeScore === undefined ? [] : [{
        score: learning.projectCompositeScore,
        origin: learning.projectCompositeOrigin,
      }]
    ));
    const scores = scoreFacts.map(({ score }) => score);
    const taskScores = taskScoreFacts.map(({ score }) => score);
    const projectScores = projectScoreFacts.map(({ score }) => score);
    const classScores: ClassScoreSnapshot = {
      ...(scores.length === 0 ? {} : {
        activeNodeTestHighestScore: Math.max(...scores),
        activeNodeTestAverageScore: average(scores),
      }),
      ...(taskScores.length === 0 ? {} : { activeTaskCompositeAverageScore: average(taskScores) }),
      ...(projectScores.length === 0 ? {} : { projectCompositeAverageScore: average(projectScores) }),
      distribution: scoreDistribution(scores, activePolicy?.formalPassScore ?? 80),
      ...([...scoreFacts, ...taskScoreFacts, ...projectScoreFacts].some(({ origin }) => origin === 'demo')
        ? { demoData: true }
        : {}),
    };
    return {
      snapshotVersion: version.version,
      generatedAt: version.updatedAt,
      classroom: {
        sessionId: session.sessionId,
        classId: session.classId,
        revision: session.revision,
        status: session.status,
        ...(activePolicy ? { activeTaskId: activePolicy.taskId } : {}),
        ...(activeNodeId ? { activeNodeId } : {}),
        ...(session.activeUnitId ? { activeUnitId: session.activeUnitId } : {}),
      },
      project: {
        projectId: content.project.id,
        projectTitle: content.project.title,
        finalOutputTitle: content.project.finalOutput,
        taskIds: ['P01', 'P02', 'P03'],
      },
      membership: { classSize: students.length, joinedCount, followingCount },
      submissions: projectSubmissionMetrics(
        this.database,
        session,
        students,
        activeNodeId,
        activePolicy?.formalPassScore ?? 80,
        observedAt,
      ),
      classScores,
      helper: projectHelper(device, observedAt),
    };
  }

  private cutAudience(
    actor: AuthenticatedActor,
    audience: SnapshotAudience,
    common: SnapshotCommon,
    students: ProjectedStudent[],
  ): AuthoritativeSnapshot {
    if (audience === 'projector') return { ...common, audience };
    if (audience === 'student') {
      const student = requiredActorStudent(actor, students);
      return {
        ...common,
        audience,
        me: { ...projectStudentDetail(student), learning: student.learning },
      };
    }
    if (audience === 'teacher') {
      const details = students.map(projectStudentDetail);
      return { ...common, audience, students: details, weakPoints: projectWeakPoints(students) };
    }
    if (actor.role === 'student') {
      const detail = projectStudentDetail(requiredActorStudent(actor, students));
      return {
        ...common,
        audience,
        mode: 'student',
        me: {
          studentId: detail.studentId,
          studentVersion: detail.studentVersion,
          nodes: detail.nodes,
          tasks: detail.tasks,
          ...(detail.projectCompositeScore === undefined ? {} : {
            projectCompositeScore: detail.projectCompositeScore,
          }),
          ...(detail.projectCompositeOrigin === undefined ? {} : {
            projectCompositeOrigin: detail.projectCompositeOrigin,
          }),
        },
      };
    }
    const nodeHeatmap = projectWeakPoints(students)
      .map(({ nodeId, stateCounts }) => ({ nodeId, stateCounts }));
    return {
      ...common,
      audience,
      mode: 'teacher',
      nodeHeatmap,
      tasks: projectTeacherGraphTasks(nodeHeatmap, students),
    };
  }
}

function projectSubmissionMetrics(
  database: AppDatabase,
  session: StoredClassroomSession,
  students: ProjectedStudent[],
  activeNodeId: P1NodeId | undefined,
  passScore: number,
  observedAt: Date,
): SnapshotSubmissionMetrics {
  const classSize = students.length;
  const classroomSubmitted = !activeNodeId ? 0 : Number(database.prepare(`
    SELECT COUNT(DISTINCT attempt.student_id)
    FROM practice_attempts AS attempt
    INNER JOIN classroom_sessions AS classroom
      ON classroom.session_id = attempt.classroom_session_id
     AND classroom.active_lesson_run_id = attempt.classroom_run_id
    INNER JOIN classroom_members AS member
      ON member.session_id = classroom.session_id AND member.student_id = attempt.student_id
    INNER JOIN users AS student
      ON student.id = member.student_id AND student.role = 'student' AND student.is_active = 1
    WHERE classroom.session_id = ?
      AND attempt.node_id = ?
      AND attempt.delivery_channel = 'classroom'
      AND attempt.origin = 'user'
  `).pluck().get(session.sessionId, activeNodeId));
  const storedFormalTest = session.state.formalTest;
  const formalTest = storedFormalTest && activeNodeId && storedFormalTest.nodeId === activeNodeId
    ? storedFormalTest
    : undefined;
  const assessmentStatus = formalTest?.status ?? 'idle';
  const windowStartedAt = formalTest?.startedAt ? Date.parse(formalTest.startedAt) : Number.NaN;
  const windowObservedAt = observedAt.getTime();
  const validatedAttemptsInWindow = assessmentStatus === 'idle'
    || !formalTest
    || !formalTest.runId
    || !activeNodeId
    || !Number.isFinite(windowStartedAt)
    || !Number.isFinite(windowObservedAt)
    ? []
    : readValidatedClassroomRunAttempts(database, {
        sessionId: session.sessionId,
        classroomRunId: formalTest.runId,
        nodeId: activeNodeId,
        gameId: formalTest.gameId,
        startedAt: new Date(windowStartedAt),
        observedAt: new Date(windowObservedAt),
      });
  const attemptsInWindow = validatedAttemptsInWindow
    .map(({ studentId, totalScore }) => ({ studentId, score: totalScore }));
  const submittedCount = attemptsInWindow.length;
  const passedCount = attemptsInWindow.filter(({ score }) => score >= passScore).length;
  const playingCount = assessmentStatus === 'running'
    ? Math.max(0, classSize - submittedCount)
    : 0;
  const professionalOutputs = students.flatMap(({ learning }) => (
    learning.nodes.flatMap(({ evidence }) => evidence ? [evidence] : [])
  ));
  return {
    classroomActivity: {
      submittedCount: classroomSubmitted,
      submissionPercent: percent(classroomSubmitted, classSize),
    },
    activeAssessment: {
      status: assessmentStatus,
      eligibleCount: classSize,
      submittedCount,
      playingCount,
      passedCount,
      submissionPercent: percent(submittedCount, classSize),
      ...(submittedCount === 0 ? {} : { passRatePercent: percent(passedCount, submittedCount) }),
      ...(assessmentStatus !== 'review' || submittedCount === 0 ? {} : {
        errorDistribution: assessmentDimensionKeys.map((dimension) => {
          const incorrectCount = validatedAttemptsInWindow.filter(
            (attempt) => attempt.dimensions[dimension].score < 20,
          ).length;
          return { dimension, incorrectCount, percent: percent(incorrectCount, submittedCount) };
        }),
      }),
    },
    professionalOutputs: {
      submittedAwaitingReviewCount: professionalOutputs.filter(({ status }) => status === 'submitted').length,
      returnedCount: professionalOutputs.filter(({ status }) => status === 'returned').length,
      verifiedCount: professionalOutputs.filter(({ status }) => status === 'verified').length,
    },
  };
}

function projectHelper(
  device: ReturnType<ClassroomSessionRepository['readDeviceSnapshot']>,
  observedAt: Date,
): SnapshotCommon['helper'] {
  const liveStudentDevices = device.devices.filter(({ actorRole, helperState }) => (
    actorRole === 'student' && helperState !== 'offline'
  ));
  const degraded = liveStudentDevices.some(({ helperState }) => helperState === 'degraded');
  const status = liveStudentDevices.length === 0 ? 'offline' : degraded ? 'degraded' : 'online';
  return {
    status,
    observedAt: observedAt.toISOString(),
    onlineStudentDeviceCount: liveStudentDevices.length,
    commandDelivery: {
      applied: device.acks.filter(({ state }) => state === 'applied').length,
      pending: device.acks.filter(({ state }) => state === 'queued' || state === 'delivered').length,
      failed: device.acks.filter(({ state }) => state === 'failed' || state === 'expired').length,
    },
    canPush: liveStudentDevices.some(({ helperState }) => helperState === 'online'),
  };
}

function projectStudentDetail(student: ProjectedStudent): StudentSnapshotDetail {
  const fullProject = projectP1Project(loadP1DemoContent(), student.learning);
  const { studentVersion: _studentVersion, snapshotVersion: _snapshotVersion, ...project } = fullProject;
  const nodes: StudentSnapshotDetail['nodes'] = student.learning.nodes.map((node) => ({
    nodeId: node.nodeId,
    axes: node.axes,
    state: node.state,
    ...(node.bestFormalScore === undefined ? {} : { nodeTestHighestScore: node.bestFormalScore }),
    nextRequirement: node.nextRequirement,
    ...(node.origin ? { origin: node.origin } : {}),
  }));
  return {
    studentId: student.member.studentId,
    displayName: student.member.displayName,
    studentVersion: student.learning.version,
    nodes,
    tasks: student.learning.tasks.map((task) => ({
      taskId: task.taskId,
      stateCompletionPercent: projectStudentTaskCompletion(task.taskId, nodes),
      ...(task.nodeTestHighestScore === undefined ? {} : { nodeTestHighestScore: task.nodeTestHighestScore }),
      ...(task.taskCompositeScore === undefined ? {} : { taskCompositeScore: task.taskCompositeScore }),
      ...(task.origin ? { origin: task.origin } : {}),
    })),
    project,
    ...(student.learning.projectCompositeScore === undefined ? {} : {
      projectCompositeScore: student.learning.projectCompositeScore,
    }),
    ...(student.learning.projectCompositeOrigin === undefined ? {} : {
      projectCompositeOrigin: student.learning.projectCompositeOrigin,
    }),
  };
}

function projectStudentTaskCompletion(
  taskId: P1TaskId,
  nodes: StudentSnapshotDetail['nodes'],
): number {
  const taskNodeIds = new Set(nodeLearningPolicies
    .filter((policy) => policy.taskId === taskId)
    .map((policy) => policy.nodeId));
  let total = 0;
  let count = 0;
  for (const node of nodes) {
    if (!taskNodeIds.has(node.nodeId)) continue;
    total += nodeLearningStateCompletionPercent[node.state];
    count += 1;
  }
  return count === 0 ? 0 : Math.round(total / count);
}

function projectTeacherGraphTasks(
  heatmap: Array<{ nodeId: P1NodeId; stateCounts: Partial<Record<NodeLearningState, number>> }>,
  students: ProjectedStudent[],
): Array<{
  taskId: P1TaskId;
  stateCompletionPercent: number;
  taskCompositeScore?: number;
  origin?: LearningOrigin;
}> {
  return (['P01', 'P02', 'P03'] as const).map((taskId) => {
    const taskNodeIds = new Set(nodeLearningPolicies
      .filter((policy) => policy.taskId === taskId)
      .map((policy) => policy.nodeId));
    let weightedTotal = 0;
    let sampleCount = 0;
    for (const node of heatmap) {
      if (!taskNodeIds.has(node.nodeId)) continue;
      for (const [state, count] of Object.entries(node.stateCounts)) {
        const typedState = state as NodeLearningState;
        weightedTotal += nodeLearningStateCompletionPercent[typedState] * (count ?? 0);
        sampleCount += count ?? 0;
      }
    }
    const scoreFacts = students.flatMap(({ learning }) => {
      const task = learning.tasks.find((candidate) => candidate.taskId === taskId);
      return task?.taskCompositeScore === undefined
        ? []
        : [{ score: task.taskCompositeScore, origin: task.origin }];
    });
    const scoreOrigin = scoreFacts.some(({ origin }) => origin === 'demo')
      ? 'demo' as const
      : scoreFacts.length > 0 && scoreFacts.every(({ origin }) => origin === 'user')
        ? 'user' as const
        : undefined;
    return {
      taskId,
      stateCompletionPercent: sampleCount === 0 ? 0 : Math.round(weightedTotal / sampleCount),
      ...(scoreFacts.length === 0 ? {} : {
        taskCompositeScore: average(scoreFacts.map(({ score }) => score)),
      }),
      ...(scoreOrigin ? { origin: scoreOrigin } : {}),
    };
  });
}

function projectWeakPoints(students: ProjectedStudent[]): WeakPointSnapshot[] {
  return nodeLearningPolicies.map(({ nodeId }) => {
    const stateCounts: Partial<Record<NodeLearningState, number>> = {};
    let attentionCount = 0;
    for (const { learning } of students) {
      const state = learning.nodes.find((node) => node.nodeId === nodeId)?.state ?? 'locked';
      stateCounts[state] = (stateCounts[state] ?? 0) + 1;
      if (state !== 'achieved' && state !== 'teacher-verified') attentionCount += 1;
    }
    return { nodeId, attentionCount, stateCounts };
  });
}

function scoreDistribution(scores: number[], passScore: number): ClassScoreSnapshot['distribution'] {
  const counts: Record<ScoreDistributionRange, number> = {
    '90-100': 0,
    'pass-89': 0,
    '60-below-pass': 0,
    'below-60': 0,
  };
  for (const score of scores) {
    const range: ScoreDistributionRange = score >= 90
      ? '90-100'
      : score >= passScore
        ? 'pass-89'
        : score >= 60
          ? '60-below-pass'
          : 'below-60';
    counts[range] += 1;
  }
  return (Object.keys(counts) as ScoreDistributionRange[]).map((range) => ({ range, count: counts[range] }));
}

function canonicalNodeId(value: string | undefined): P1NodeId | undefined {
  return nodeLearningPolicies.some(({ nodeId }) => nodeId === value) ? value as P1NodeId : undefined;
}

function requiredActorStudent(actor: AuthenticatedActor, students: ProjectedStudent[]): ProjectedStudent {
  const student = students.find(({ member }) => member.studentId === actor.userId);
  if (!student) throw new AuthoritativeSnapshotAuthorizationError('Student is not an active classroom member.');
  return student;
}

function assertAudienceRole(actor: AuthenticatedActor, audience: SnapshotAudience): void {
  if (actor.role === 'student' && audience !== 'student' && audience !== 'graph') {
    throw new AuthoritativeSnapshotAuthorizationError(`Student cannot read ${audience} snapshot.`);
  }
  if (actor.role === 'student' && actor.studentId !== actor.userId) {
    throw new AuthoritativeSnapshotAuthorizationError('Student actor identity is inconsistent.');
  }
}

function assertActorMembership(
  actor: AuthenticatedActor,
  session: StoredClassroomSession,
  members: MemberRow[],
): void {
  if (actor.role === 'teacher') {
    if (session.teacherId !== actor.userId) {
      throw new AuthoritativeSnapshotAuthorizationError('Teacher does not own this classroom session.');
    }
    return;
  }
  if (!members.some(({ studentId }) => studentId === actor.userId)) {
    throw new AuthoritativeSnapshotAuthorizationError('Student is not an active classroom member.');
  }
}

function normalizeNow(now = new Date()): Date {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('now must be a valid Date.');
  return now;
}

function percent(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1_000) / 10;
}

function average(values: number[]): number {
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

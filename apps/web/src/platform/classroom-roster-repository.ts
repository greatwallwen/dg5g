import type { AppDatabase } from './db/database.ts';
import type { StudentProgress } from './models.ts';

interface ClassroomMemberRow {
  studentId: string;
  displayName: string;
  mode: 'follow' | 'self';
}

interface FormalAttemptRow {
  studentId: string;
  score: number;
  durationSeconds: number | null;
}

interface LearningEventRow {
  studentId: string;
  channel: 'self-study' | 'classroom' | 'game';
  eventType: string;
  payloadJson: string;
}

interface ProfessionalOutputRow {
  studentId: string;
  status: 'draft' | 'submitted' | 'returned' | 'verified';
}

export class ClassroomRosterNotFoundError extends Error {
  constructor(classroomSessionId: string) {
    super(`Classroom session not found: ${classroomSessionId}`);
    this.name = 'ClassroomRosterNotFoundError';
  }
}

export class ClassroomRosterRepository {
  private readonly database: AppDatabase;

  constructor(database: AppDatabase) {
    this.database = database;
  }

  readStudentRoster(classroomSessionId: string, nodeId: string): StudentProgress[] {
    return this.database.transaction(
      () => this.readStudentRosterSnapshot(classroomSessionId, nodeId),
    )();
  }

  private readStudentRosterSnapshot(classroomSessionId: string, nodeId: string): StudentProgress[] {
    const classroomExists = this.database.prepare(`
      SELECT EXISTS(
        SELECT 1 FROM classroom_sessions WHERE session_id = ?
      )
    `).pluck().get(classroomSessionId) === 1;
    if (!classroomExists) throw new ClassroomRosterNotFoundError(classroomSessionId);

    const members = this.database.prepare(`
      SELECT
        member.student_id AS studentId,
        user.display_name AS displayName,
        CASE
          WHEN participation.state = 'joined' THEN participation.mode
          ELSE 'self'
        END AS mode
      FROM classroom_sessions AS classroom
      JOIN classroom_members AS member
        ON member.session_id = classroom.session_id
      JOIN users AS user
        ON user.id = member.student_id
      LEFT JOIN classroom_participation AS participation
        ON participation.session_id = member.session_id
       AND participation.student_id = member.student_id
      WHERE classroom.session_id = ?
        AND user.role = 'student'
        AND user.is_active = 1
      ORDER BY member.joined_at, member.student_id
    `).all(classroomSessionId) as ClassroomMemberRow[];

    const attempts = this.database.prepare(`
      SELECT
        attempt.student_id AS studentId,
        attempt.score,
        attempt.duration_seconds AS durationSeconds
      FROM formal_attempts AS attempt
      JOIN classroom_members AS member
        ON member.student_id = attempt.student_id
      WHERE member.session_id = ?
        AND attempt.node_id = ?
      ORDER BY attempt.student_id, attempt.completed_at, attempt.attempt_id
    `).all(classroomSessionId, nodeId) as FormalAttemptRow[];
    const attemptsByStudent = new Map<string, FormalAttemptRow[]>();
    for (const attempt of attempts) {
      const studentAttempts = attemptsByStudent.get(attempt.studentId) ?? [];
      studentAttempts.push(attempt);
      attemptsByStudent.set(attempt.studentId, studentAttempts);
    }

    const learningEvents = this.database.prepare(`
      SELECT
        event.student_id AS studentId,
        event.channel,
        event.event_type AS eventType,
        event.payload_json AS payloadJson
      FROM learning_events AS event
      JOIN classroom_members AS member
        ON member.student_id = event.student_id
      WHERE member.session_id = ?
        AND event.node_id = ?
      ORDER BY event.student_id, event.occurred_at, event.event_id
    `).all(classroomSessionId, nodeId) as LearningEventRow[];
    const eventsByStudent = new Map<string, LearningEventRow[]>();
    for (const event of learningEvents) {
      const studentEvents = eventsByStudent.get(event.studentId) ?? [];
      studentEvents.push(event);
      eventsByStudent.set(event.studentId, studentEvents);
    }

    const outputs = this.database.prepare(`
      SELECT
        output.student_id AS studentId,
        output.status
      FROM professional_outputs AS output
      JOIN classroom_members AS member
        ON member.student_id = output.student_id
      WHERE member.session_id = ?
        AND output.node_id = ?
      ORDER BY output.student_id, output.updated_at, output.output_id
    `).all(classroomSessionId, nodeId) as ProfessionalOutputRow[];
    const outputByStudent = new Map(outputs.map((output) => [output.studentId, output]));

    return members.map((member) => {
      const studentAttempts = attemptsByStudent.get(member.studentId) ?? [];
      const studentEvents = eventsByStudent.get(member.studentId) ?? [];
      const firstAttempt = studentAttempts[0];
      const latestAttempt = studentAttempts.at(-1);
      const latestEvent = studentEvents.at(-1);
      const classroomSubmission = latestMatchingEvent(
        studentEvents,
        (event) => event.eventType === 'classroom_activity_submitted',
      );
      const classroomEvidenceCount = submittedAnswerCount(classroomSubmission);
      const output = outputByStudent.get(member.studentId);
      const bestGameScore = studentAttempts.length
        ? Math.max(...studentAttempts.map(({ score }) => score))
        : undefined;
      const selfStudyEvents = studentEvents.filter(({ channel }) => channel === 'self-study');
      const selfStudyState = selfStudyEvents.some(({ eventType }) => isCompletedLearningEvent(eventType))
        ? 'completed'
        : selfStudyEvents.length > 0 ? 'in_progress' : 'not_started';
      const submissionState = output
        ? output.status === 'draft'
          ? 'draft'
          : output.status === 'submitted' ? 'submitted' : 'reviewed'
        : classroomSubmission ? 'submitted' : 'draft';
      const outputEvidenceCount = output && output.status !== 'draft' ? 1 : 0;
      return {
        studentId: member.studentId,
        name: member.displayName,
        group: '待分组',
        mode: member.mode,
        currentSlideIndex: 1,
        selfStudyState,
        submissionState,
        evidenceCount: Math.max(classroomEvidenceCount, outputEvidenceCount),
        lastAction: describeLastAction(nodeId, output, latestAttempt, latestEvent),
        risk: bestGameScore === undefined
          ? 'watch'
          : bestGameScore >= 80 ? 'ok' : bestGameScore >= 60 ? 'watch' : 'help',
        activeNodeId: nodeId,
        ...(firstAttempt ? { firstGameScore: firstAttempt.score } : {}),
        ...(bestGameScore === undefined ? {} : { bestGameScore }),
        ...(latestAttempt ? {
          latestGameScore: latestAttempt.score,
          attemptCount: studentAttempts.length,
          ...(latestAttempt.durationSeconds === null
            ? {}
            : { gameDurationSeconds: latestAttempt.durationSeconds }),
        } : {}),
        ...(output && output.status !== 'draft' ? {
          evidenceReviewStatus: output.status,
          teacherVerified: output.status === 'verified',
        } : {}),
      } satisfies StudentProgress;
    });
  }
}

function isCompletedLearningEvent(eventType: string): boolean {
  return eventType.endsWith('_passed') || eventType.endsWith('_completed');
}

function latestMatchingEvent(
  events: LearningEventRow[],
  predicate: (event: LearningEventRow) => boolean,
): LearningEventRow | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (predicate(events[index]!)) return events[index];
  }
  return undefined;
}

function submittedAnswerCount(event: LearningEventRow | undefined): number {
  if (!event) return 0;
  const payload = parseJsonRecord(event.payloadJson);
  return Array.isArray(payload?.answers)
    ? payload.answers.filter((answer) => typeof answer === 'string' && answer.trim().length > 0).length
    : 0;
}

function parseJsonRecord(source: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(source) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function describeLastAction(
  nodeId: string,
  output: ProfessionalOutputRow | undefined,
  latestAttempt: FormalAttemptRow | undefined,
  latestEvent: LearningEventRow | undefined,
): string {
  if (output?.status === 'verified') return `${nodeId} 专业产出已通过教师认证。`;
  if (output?.status === 'returned') return `${nodeId} 专业产出已退回修订。`;
  if (output?.status === 'submitted') return `${nodeId} 专业产出已提交。`;
  if (output?.status === 'draft') return `${nodeId} 专业产出草稿已保存。`;
  if (latestAttempt) return `已完成 ${nodeId} 正式测试，最新 ${latestAttempt.score} 分。`;
  if (latestEvent?.eventType === 'classroom_activity_submitted') {
    return `已提交 ${submittedAnswerCount(latestEvent)} 条 ${nodeId} 课堂证据。`;
  }
  if (latestEvent && isCompletedLearningEvent(latestEvent.eventType)) {
    return `已完成 ${nodeId} 学习练习。`;
  }
  if (latestEvent) return `已开始 ${nodeId} 学习。`;
  return `暂无 ${nodeId} 学习记录。`;
}

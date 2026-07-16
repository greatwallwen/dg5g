import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import {
  ClassroomParticipationNotJoinedError,
  ClassroomParticipationRepository,
  ClassroomParticipationSessionInactiveError,
  ClassroomParticipationSessionNotFoundError,
  ClassroomParticipationStudentNotMemberError,
  type ClassroomParticipationMode,
} from '@/platform/classroom-participation-repository';
import { getDatabase, type AppDatabase } from '@/platform/db/database';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { sessionId: string };
}

interface SessionScope {
  database: AppDatabase;
  repository: ClassroomParticipationRepository;
  studentId: string;
}

interface SessionRow {
  classId: string;
}

export function GET(request: Request, { params }: RouteContext) {
  const scope = authorize(request, params.sessionId);
  if (scope instanceof NextResponse) return scope;
  return NextResponse.json(snapshot(scope.repository, params.sessionId, scope.studentId));
}

export async function PUT(request: Request, { params }: RouteContext) {
  const scope = authorize(request, params.sessionId);
  if (scope instanceof NextResponse) return scope;
  if (!await hasEmptyBody(request)) {
    return NextResponse.json({ error: 'Classroom join does not accept a request body.' }, { status: 400 });
  }
  try {
    scope.repository.join(params.sessionId, scope.studentId);
    return NextResponse.json(snapshot(scope.repository, params.sessionId, scope.studentId));
  } catch (error) {
    return participationError(error);
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const scope = authorize(request, params.sessionId);
  if (scope instanceof NextResponse) return scope;
  const body = await request.json().catch(() => undefined) as unknown;
  if (!isExactModeBody(body)) {
    return NextResponse.json({ error: 'Participation mode requires exactly one follow/self mode field.' }, { status: 400 });
  }
  try {
    scope.repository.setMode(params.sessionId, scope.studentId, body.mode);
    return NextResponse.json(snapshot(scope.repository, params.sessionId, scope.studentId));
  } catch (error) {
    return participationError(error);
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const scope = authorize(request, params.sessionId);
  if (scope instanceof NextResponse) return scope;
  if (!await hasEmptyBody(request)) {
    return NextResponse.json({ error: 'Classroom leave does not accept a request body.' }, { status: 400 });
  }
  try {
    scope.repository.leave(params.sessionId, scope.studentId);
    return NextResponse.json(snapshot(scope.repository, params.sessionId, scope.studentId));
  } catch (error) {
    return participationError(error);
  }
}

function authorize(request: Request, sessionId: string): SessionScope | NextResponse {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (actor.role !== 'student' || !actor.studentId || actor.studentId !== actor.userId) {
    return NextResponse.json({ error: 'Only students can manage classroom participation' }, { status: 403 });
  }
  const database = getDatabase();
  const session = database.prepare(`
    SELECT class_id AS classId FROM classroom_sessions WHERE session_id = ?
  `).get(sessionId) as SessionRow | undefined;
  if (!session) return NextResponse.json({ error: `Unknown classroom session: ${sessionId}.` }, { status: 404 });
  if (!actor.classId || actor.classId !== session.classId) {
    return NextResponse.json({ error: 'Class session is outside the authenticated class' }, { status: 403 });
  }
  const isMember = database.prepare(`
    SELECT EXISTS(
      SELECT 1
      FROM classroom_members AS member
      INNER JOIN users AS student ON student.id = member.student_id
      WHERE member.session_id = ? AND member.student_id = ?
        AND student.role = 'student' AND student.is_active = 1
    )
  `).pluck().get(sessionId, actor.studentId) === 1;
  if (!isMember) {
    return NextResponse.json({ error: 'Student is not part of this class session' }, { status: 403 });
  }
  return {
    database,
    repository: new ClassroomParticipationRepository(database),
    studentId: actor.studentId,
  };
}

function snapshot(repository: ClassroomParticipationRepository, sessionId: string, studentId: string) {
  return {
    participation: repository.read(sessionId, studentId) ?? null,
    joinedCount: repository.readJoinedStudentIds(sessionId).length,
    followingCount: repository.readFollowingStudentIds(sessionId).length,
  };
}

function participationError(error: unknown): NextResponse {
  if (error instanceof ClassroomParticipationSessionNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ClassroomParticipationSessionInactiveError
    || error instanceof ClassroomParticipationNotJoinedError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof ClassroomParticipationStudentNotMemberError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof TypeError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  throw error;
}

function isExactModeBody(value: unknown): value is { mode: ClassroomParticipationMode } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).length === 1
    && ('mode' in value)
    && (value.mode === 'follow' || value.mode === 'self');
}

async function hasEmptyBody(request: Request): Promise<boolean> {
  return (await request.text()).trim().length === 0;
}

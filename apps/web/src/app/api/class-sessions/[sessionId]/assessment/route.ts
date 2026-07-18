import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import {
  ClassroomAssessmentAuthorizationError,
  ClassroomAssessmentRunNotFoundError,
  ClassroomAssessmentRunService,
  type ClassroomAssessmentCommand,
} from '@/platform/classroom-assessment-run-service';
import {
  ClassroomAssessmentRunConflictError,
  ClassroomAssessmentRunRevisionConflictError,
} from '@/platform/classroom-assessment-run-repository';
import { getDatabase } from '@/platform/db/database';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: { sessionId: string } },
) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const command = parseCommand(body);
  if (!command) {
    return NextResponse.json({ error: 'Invalid classroom assessment command' }, { status: 400 });
  }
  try {
    const result = new ClassroomAssessmentRunService(getDatabase())
      .execute(actor, params.sessionId, command);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}

function parseCommand(value: unknown): ClassroomAssessmentCommand | undefined {
  if (!isExactRecord(value, ['command'])) return undefined;
  const command = value.command;
  if (!isRecord(command) || typeof command.type !== 'string') return undefined;
  if (command.type === 'start') {
    if (!hasExactKeys(command, [
      'type', 'lessonRunId', 'nodeId', 'gameId', 'expectedClassroomRevision',
    ], ['durationSeconds'])) return undefined;
    const lessonRunId = nonEmptyString(command.lessonRunId);
    const nodeId = nonEmptyString(command.nodeId);
    const gameId = nonEmptyString(command.gameId);
    const expectedClassroomRevision = revision(command.expectedClassroomRevision);
    const durationSeconds = command.durationSeconds === undefined
      ? undefined : positiveInteger(command.durationSeconds);
    if (!lessonRunId || !nodeId || !gameId || expectedClassroomRevision === undefined
      || (command.durationSeconds !== undefined && durationSeconds === undefined)) return undefined;
    return {
      type: 'start', lessonRunId, nodeId, gameId, expectedClassroomRevision,
      ...(durationSeconds === undefined ? {} : { durationSeconds }),
    };
  }
  if (!['pause', 'resume', 'collect', 'begin-review'].includes(command.type)
    || !hasExactKeys(command, ['type', 'runId', 'expectedRevision'])) return undefined;
  const runId = nonEmptyString(command.runId);
  const expectedRevision = revision(command.expectedRevision);
  if (!runId || expectedRevision === undefined) return undefined;
  return {
    type: command.type as 'pause' | 'resume' | 'collect' | 'begin-review',
    runId,
    expectedRevision,
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Classroom assessment request failed';
  if (error instanceof ClassroomAssessmentRunRevisionConflictError) {
    return NextResponse.json(
      { error: message, currentRevision: error.currentRevision },
      { status: 409 },
    );
  }
  if (error instanceof ClassroomAssessmentRunConflictError) {
    return NextResponse.json({ error: message }, { status: 409 });
  }
  if (error instanceof ClassroomAssessmentAuthorizationError) {
    return NextResponse.json({ error: message }, { status: 403 });
  }
  if (error instanceof ClassroomAssessmentRunNotFoundError) {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  if (error instanceof TypeError) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ error: message }, { status: 400 });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExactRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isRecord(value) && hasExactKeys(value, keys);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => required.includes(key) || optional.includes(key));
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function revision(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 3_600
    ? value : undefined;
}

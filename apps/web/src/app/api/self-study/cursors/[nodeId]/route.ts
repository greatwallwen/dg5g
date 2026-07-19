import { NextResponse } from 'next/server';
import {
  requireSelfStudyDocument,
  selfStudySectionDefinitions,
} from '@/features/textbook-scene/self-study-content';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import { getDatabase } from '@/platform/db/database';
import {
  createLearningCommandService,
  describeLearningCommandError,
} from '@/platform/learning-command-service';
import type { P1NodeId } from '@/platform/learning-policy';
import {
  SelfStudyCursorRepository,
  type SelfStudyCursorDraft,
} from '@/platform/self-study-cursor-repository';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { nodeId: string };
}

export function GET(request: Request, { params }: RouteContext) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (actor.role !== 'student' || !actor.studentId || actor.studentId !== actor.userId) {
    return NextResponse.json({ error: 'Only students can read a self-study cursor' }, { status: 403 });
  }
  const database = getDatabase();
  try {
    createLearningCommandService(database).requireNodeAccess(actor, params.nodeId);
    const cursor = new SelfStudyCursorRepository(database).read(actor.studentId, params.nodeId as P1NodeId);
    if (!cursor) {
      return NextResponse.json({ cursor: null });
    }
    return NextResponse.json({ cursor });
  } catch (error) {
    return cursorError(error);
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (actor.role !== 'student' || !actor.studentId || actor.studentId !== actor.userId) {
    return NextResponse.json({ error: 'Only students can save a self-study cursor' }, { status: 403 });
  }
  const database = getDatabase();
  try {
    createLearningCommandService(database).requireNodeAccess(actor, params.nodeId);
    const observedAt = new Date();
    const command = parseDraft(await request.json().catch(() => undefined), observedAt);
    validateGeneratedCursor(params.nodeId as P1NodeId, command.draft);
    const cursor = new SelfStudyCursorRepository(database).save(
      actor.studentId,
      params.nodeId as P1NodeId,
      command.draft,
      command.mutationAt ?? observedAt,
      observedAt,
    );
    return NextResponse.json({ cursor });
  } catch (error) {
    return cursorError(error);
  }
}

function parseDraft(value: unknown, observedAt: Date): { draft: SelfStudyCursorDraft; mutationAt?: Date } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Self-study cursor body must be an object.');
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(['unitId', 'actionId', 'actionIndex', 'positionMs', 'mutationAt']);
  if (Object.keys(record).some((key) => !allowed.has(key))
    || !Object.hasOwn(record, 'actionIndex')
    || !Object.hasOwn(record, 'positionMs')) {
    throw new TypeError('Self-study cursor body contains unsupported or missing fields.');
  }
  if (record.unitId !== undefined && typeof record.unitId !== 'string') {
    throw new TypeError('unitId must be a string.');
  }
  if (record.actionId !== undefined && typeof record.actionId !== 'string') {
    throw new TypeError('actionId must be a string.');
  }
  if (!Number.isSafeInteger(record.actionIndex) || Number(record.actionIndex) < 0) {
    throw new TypeError('actionIndex must be a non-negative safe integer.');
  }
  if (!Number.isSafeInteger(record.positionMs) || Number(record.positionMs) < 0) {
    throw new TypeError('positionMs must be a non-negative safe integer.');
  }
  const mutationAt = parseMutationAt(record.mutationAt, observedAt);
  return {
    draft: {
      ...(record.unitId === undefined ? {} : { unitId: record.unitId }),
      ...(record.actionId === undefined ? {} : { actionId: record.actionId }),
      actionIndex: Number(record.actionIndex),
      positionMs: Number(record.positionMs),
    },
    ...(mutationAt === undefined ? {} : { mutationAt }),
  };
}

function parseMutationAt(value: unknown, observedAt: Date): Date | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError('mutationAt must be an ISO timestamp.');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new TypeError('mutationAt must be an ISO timestamp.');
  }
  if (parsed.getTime() > observedAt.getTime() + 5_000) {
    throw new TypeError('mutationAt cannot be ahead of the server clock.');
  }
  return parsed;
}

function validateGeneratedCursor(nodeId: P1NodeId, draft: SelfStudyCursorDraft): void {
  const document = requireSelfStudyDocument(nodeId);
  if (draft.unitId !== undefined && draft.unitId !== document.sourceKnowledgeUnitId) {
    throw new TypeError(`unitId does not belong to ${nodeId}.`);
  }
  const sectionIndex = selfStudySectionDefinitions.findIndex(({ id }) => id === draft.actionId);
  if (sectionIndex < 0) {
    throw new TypeError(`actionId must be a canonical self-study section for ${nodeId}.`);
  }
  if (draft.actionIndex !== sectionIndex) {
    throw new TypeError(`actionIndex does not match ${draft.actionId} for ${nodeId}.`);
  }
}

function cursorError(error: unknown): NextResponse {
  const problem = describeLearningCommandError(error);
  if (problem) return NextResponse.json(problem.body, { status: problem.status });
  if (error instanceof TypeError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  throw error;
}

import { NextResponse } from 'next/server';
import { getDemoUnitForNode } from '@/features/platform/deep-textbook-demo-data';
import { playbackSceneForLearningUnit } from '@/features/textbook-scene/learning-playback';
import {
  loadDemoTaskProfiles,
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
      return NextResponse.json({ error: `Self-study cursor not found: ${params.nodeId}.` }, { status: 404 });
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
    const draft = parseDraft(await request.json().catch(() => undefined));
    validateGeneratedCursor(params.nodeId as P1NodeId, draft);
    const cursor = new SelfStudyCursorRepository(database).save(
      actor.studentId,
      params.nodeId as P1NodeId,
      draft,
    );
    return NextResponse.json({ cursor });
  } catch (error) {
    return cursorError(error);
  }
}

function parseDraft(value: unknown): SelfStudyCursorDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Self-study cursor body must be an object.');
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set(['unitId', 'actionId', 'actionIndex', 'positionMs']);
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
  return {
    ...(record.unitId === undefined ? {} : { unitId: record.unitId }),
    ...(record.actionId === undefined ? {} : { actionId: record.actionId }),
    actionIndex: Number(record.actionIndex),
    positionMs: Number(record.positionMs),
  };
}

function validateGeneratedCursor(nodeId: P1NodeId, draft: SelfStudyCursorDraft): void {
  const document = requireSelfStudyDocument(nodeId);
  if (draft.unitId !== undefined && draft.unitId !== document.sourceKnowledgeUnitId) {
    throw new TypeError(`unitId does not belong to ${nodeId}.`);
  }
  const profiles = loadDemoTaskProfiles();
  const unit = getDemoUnitForNode(nodeId, profiles);
  if (!unit) throw new TypeError(`Generated unit is unavailable for ${nodeId}.`);
  const playback = playbackSceneForLearningUnit(unit, document.taskId);
  const allowedActionIds = new Set(playback.actions.map(({ id }) => id));
  for (const section of selfStudySectionDefinitions) {
    allowedActionIds.add(`${nodeId}-lesson-${section.id}`);
  }
  if (document.content.kind === 'deep') {
    allowedActionIds.add(`${nodeId}-lesson-evidence`);
    allowedActionIds.add(`${nodeId}-lesson-example`);
  }
  if (draft.actionId !== undefined && !allowedActionIds.has(draft.actionId)) {
    throw new TypeError(`actionId does not belong to ${nodeId}.`);
  }
  if (draft.actionIndex >= Math.max(playback.actions.length, selfStudySectionDefinitions.length)) {
    throw new TypeError(`actionIndex is outside the generated content for ${nodeId}.`);
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

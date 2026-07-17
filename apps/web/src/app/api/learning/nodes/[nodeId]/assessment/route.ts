import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import {
  AssessmentCatalogError,
  AssessmentClassroomWindowError,
  AssessmentRemediationRequiredError,
  AssessmentTokenError,
  AssessmentDraftRevisionConflictError,
  createFormalAssessmentService,
} from '@/platform/formal-assessment-service';
import {
  AssessmentClassroomContextError,
  parseAssessmentClassroomSessionId,
  parseAssessmentRestart,
} from '@/platform/assessment-classroom-context';
import type {
  AssessmentAnswers,
  AssessmentDraftAnswers,
} from '@/platform/formal-assessment-contract';
import { describeLearningCommandError } from '@/platform/learning-command-service';
import {
  FORMAL_ASSESSMENT_BODY_MAX_BYTES,
} from '@/platform/formal-assessment-limits';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { nodeId: string };
}

export function GET(request: Request, { params }: RouteContext) {
  const actor = readActorFromRequest(request);
  if (!actor) return response({ error: 'Authentication required' }, 401);
  try {
    return response(
      createFormalAssessmentService().openOrResume(actor, params.nodeId, readIssueContext(request)),
      200,
    );
  } catch (error) {
    return assessmentError(error);
  }
}

function readIssueContext(request: Request): { classroomSessionId?: string; restart?: boolean } {
  const searchParams = new URL(request.url).searchParams;
  for (const key of searchParams.keys()) {
    if (key !== 'classroomSessionId' && key !== 'restart') {
      throw new AssessmentClassroomContextError(`Unsupported assessment query: ${key}.`);
    }
  }
  for (const key of ['classroomSessionId', 'restart']) {
    if (searchParams.getAll(key).length > 1) {
      throw new AssessmentClassroomContextError(`Only one assessment ${key} value is allowed.`);
    }
  }
  const classroomSessionId = parseAssessmentClassroomSessionId(searchParams.get('classroomSessionId'));
  const restart = parseAssessmentRestart(searchParams.get('restart'));
  return {
    ...(classroomSessionId ? { classroomSessionId } : {}),
    ...(restart ? { restart: true } : {}),
  };
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const actor = readActorFromRequest(request);
  if (!actor) return response({ error: 'Authentication required' }, 401);
  try {
    const body = await readBoundedAssessmentJson(request);
    const draft = parseDraftBody(body);
    const attemptToken = request.headers.get('x-assessment-token');
    if (!attemptToken) throw new TypeError('Assessment token header is required.');
    return response(createFormalAssessmentService().saveDraft(
      actor,
      attemptToken,
      draft.answers,
      draft.expectedRevision,
      params.nodeId,
    ), 200);
  } catch (error) {
    return assessmentError(error);
  }
}

async function readBoundedAssessmentJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > FORMAL_ASSESSMENT_BODY_MAX_BYTES) {
    throw new AssessmentRequestTooLargeError();
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        byteLength += value.byteLength;
        if (byteLength > FORMAL_ASSESSMENT_BODY_MAX_BYTES) {
          await reader.cancel();
          throw new AssessmentRequestTooLargeError();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const serialized = new TextDecoder().decode(bytes);
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new TypeError('Assessment request must contain valid JSON.');
  }
}

class AssessmentRequestTooLargeError extends Error {
  constructor() {
    super('Assessment request exceeds the maximum body size.');
    this.name = 'AssessmentRequestTooLargeError';
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const actor = readActorFromRequest(request);
  if (!actor) return response({ error: 'Authentication required' }, 401);
  try {
    const body = await readBoundedAssessmentJson(request);
    const answers = parseAnswerOnlyBody(body);
    const attemptToken = request.headers.get('x-assessment-token');
    if (!attemptToken) throw new TypeError('Assessment token header is required.');
    return response(
      createFormalAssessmentService().submitAnswers(actor, attemptToken, answers, params.nodeId),
      200,
    );
  } catch (error) {
    return assessmentError(error);
  }
}

function parseAnswerOnlyBody(value: unknown): AssessmentAnswers {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Assessment submission must be an object.');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || !Object.hasOwn(record, 'answers')) {
    throw new TypeError('Assessment submission accepts answers only.');
  }
  return record.answers as AssessmentAnswers;
}

function parseDraftBody(value: unknown): {
  answers: AssessmentDraftAnswers;
  expectedRevision: number;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Assessment draft must be an object.');
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 2
    || !Object.hasOwn(record, 'answers')
    || !Object.hasOwn(record, 'expectedRevision')
    || !Number.isSafeInteger(record.expectedRevision)
    || (record.expectedRevision as number) < 0) {
    throw new TypeError('Assessment draft accepts answers and a non-negative expectedRevision only.');
  }
  return {
    answers: record.answers as AssessmentDraftAnswers,
    expectedRevision: record.expectedRevision as number,
  };
}

function assessmentError(error: unknown): NextResponse {
  const learningProblem = describeLearningCommandError(error);
  if (learningProblem) return response(learningProblem.body, learningProblem.status);
  if (error instanceof AssessmentRequestTooLargeError) {
    return response({ error: error.message }, 413);
  }
  if (error instanceof AssessmentRemediationRequiredError) {
    return response({ error: error.message, remediationTargets: error.targets }, 409);
  }
  if (error instanceof AssessmentDraftRevisionConflictError) {
    return response({ error: error.message, draftState: 'revision-conflict' }, 409);
  }
  if (error instanceof AssessmentClassroomWindowError) {
    return response({ error: error.message, classroomWindow: 'unavailable' }, 409);
  }
  if (error instanceof AssessmentClassroomContextError) {
    return response({ error: error.message }, 400);
  }
  if (error instanceof AssessmentTokenError) {
    const status = error.code === 'used-token' ? 409 : error.code === 'expired-token' ? 410 : 400;
    return response({ error: error.message, tokenState: error.code }, status);
  }
  if (error instanceof AssessmentCatalogError) {
    return response({ error: error.message, nodeId: error.nodeId }, 404);
  }
  if (error instanceof TypeError) return response({ error: error.message }, 400);
  throw error;
}

function response(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

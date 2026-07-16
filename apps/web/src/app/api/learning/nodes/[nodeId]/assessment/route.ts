import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import {
  AssessmentCatalogError,
  AssessmentClassroomWindowError,
  AssessmentRemediationRequiredError,
  AssessmentTokenError,
  createFormalAssessmentService,
} from '@/platform/formal-assessment-service';
import {
  AssessmentClassroomContextError,
  parseAssessmentClassroomSessionId,
} from '@/platform/assessment-classroom-context';
import type { AssessmentAnswers } from '@/platform/formal-assessment-contract';
import { describeLearningCommandError } from '@/platform/learning-command-service';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: { nodeId: string };
}

export function GET(request: Request, { params }: RouteContext) {
  const actor = readActorFromRequest(request);
  if (!actor) return response({ error: 'Authentication required' }, 401);
  try {
    const classroomSessionId = readClassroomSessionIdQuery(request);
    return response(createFormalAssessmentService().issuePaper(actor, params.nodeId, {
      ...(classroomSessionId ? { classroomSessionId } : {}),
    }), 200);
  } catch (error) {
    return assessmentError(error);
  }
}

function readClassroomSessionIdQuery(request: Request): string | undefined {
  const searchParams = new URL(request.url).searchParams;
  for (const key of searchParams.keys()) {
    if (key !== 'classroomSessionId') {
      throw new AssessmentClassroomContextError(`Unsupported assessment query: ${key}.`);
    }
  }
  const values = searchParams.getAll('classroomSessionId');
  if (values.length > 1) {
    throw new AssessmentClassroomContextError('Only one classroom assessment session is allowed.');
  }
  return parseAssessmentClassroomSessionId(values[0]);
}

export async function POST(request: Request, { params }: RouteContext) {
  const actor = readActorFromRequest(request);
  if (!actor) return response({ error: 'Authentication required' }, 401);
  try {
    const body = await request.json().catch(() => undefined);
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

function assessmentError(error: unknown): NextResponse {
  const learningProblem = describeLearningCommandError(error);
  if (learningProblem) return response(learningProblem.body, learningProblem.status);
  if (error instanceof AssessmentRemediationRequiredError) {
    return response({ error: error.message, remediationTargets: error.targets }, 409);
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

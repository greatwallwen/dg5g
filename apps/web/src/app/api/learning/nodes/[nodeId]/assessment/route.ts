import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import {
  AssessmentCatalogError,
  AssessmentRemediationRequiredError,
  AssessmentTokenError,
  createFormalAssessmentService,
} from '@/platform/formal-assessment-service';
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
    return response(createFormalAssessmentService().issuePaper(actor, params.nodeId), 200);
  } catch (error) {
    return assessmentError(error);
  }
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

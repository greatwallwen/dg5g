import { NextResponse } from 'next/server';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import { getDatabase } from '@/platform/db/database';
import {
  DEMO_CLASS_ID,
  DEMO_STUDENT_IDS,
  DEMO_TEACHER_ID,
  resetDemo,
} from '@/platform/db/demo-seed';

export const dynamic = 'force-dynamic';

const confirmation = 'RESET_THREE_DEMO_STUDENTS';

export async function POST(request: Request) {
  const actor = readActorFromRequest(request);
  if (!actor) return json({ error: 'Authentication required' }, 401);
  if (actor.role !== 'teacher') return json({ error: 'Teacher role required' }, 403);
  if (actor.userId !== DEMO_TEACHER_ID || actor.classId !== DEMO_CLASS_ID) {
    return json({ error: 'Demo classroom ownership required' }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!isExactConfirmation(body)) {
    return json({ error: `confirmation must equal ${confirmation}` }, 400);
  }

  resetDemo(getDatabase());
  return json({ reset: true, students: [...DEMO_STUDENT_IDS] }, 200);
}

function isExactConfirmation(value: unknown): value is { confirmation: typeof confirmation } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && record.confirmation === confirmation;
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

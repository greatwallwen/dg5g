import { NextResponse } from 'next/server';
import { canReadClassLearning } from '@/platform/access-control';
import { readActorFromRequest } from '@/platform/auth/server-actor';
import { getDatabase } from '@/platform/db/database';
import { LearningReadModel } from '@/platform/learning-read-model';
import { LearningRepository } from '@/platform/learning-repository';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { classId: string } }) {
  const actor = readActorFromRequest(request);
  if (!actor) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!canReadClassLearning(actor, params.classId)) {
    return NextResponse.json({ error: 'Class learning snapshot is outside the authenticated teacher scope' }, { status: 403 });
  }
  const repository = new LearningRepository(getDatabase());
  if (!repository.teacherOwnsClass(actor.userId, params.classId)) {
    return NextResponse.json({ error: 'Class learning snapshot is outside the authenticated teacher scope' }, { status: 403 });
  }
  return NextResponse.json(new LearningReadModel(repository).readClassSnapshot(actor.userId, params.classId));
}

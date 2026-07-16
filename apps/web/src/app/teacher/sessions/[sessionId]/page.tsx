import { TeacherConsoleClient } from '@/features/classroom/teacher-console-client';
import { loadDemoTaskProfiles } from '@/features/textbook-scene/self-study-content';
import { ClassSessionUnavailable } from '@/features/classroom/class-session-unavailable';
import { AuthoritativeSnapshotReader } from '@/platform/authoritative-snapshot';
import { requireClassRole } from '@/platform/auth/server-actor';
import { getDatabase } from '@/platform/db/database';
import { ClassSessionAccessError } from '@/platform/fixtures';
import { getTeacherSession } from '@/platform/mock-api';

export default async function TeacherSessionPage({ params }: { params: { sessionId: string } }) {
  const actor = await requireClassRole('teacher');
  const database = getDatabase();
  let data;
  try {
    data = await getTeacherSession(params.sessionId);
  } catch (error) {
    if (error instanceof ClassSessionAccessError) {
      return <ClassSessionUnavailable displayName={actor.displayName} role="teacher" sessionId={params.sessionId} returnHref="/teacher/workbench" returnLabel="返回授课工作台" />;
    }
    throw error;
  }
  const snapshot = new AuthoritativeSnapshotReader(database)
    .read(actor, 'teacher', { sessionId: params.sessionId });
  return <TeacherConsoleClient displayName={actor.displayName} initialSnapshot={snapshot} slides={data.slides} initialSession={data.session} task={data.task} playback={data.playback} profiles={loadDemoTaskProfiles()} />;
}

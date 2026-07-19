import { StudentFollowClient } from '@/features/classroom/student-follow-client';
import { loadStudentFollowPage } from '@/features/classroom/student-follow-loader';
import { ClassSessionUnavailable } from '@/features/classroom/class-session-unavailable';
import { requireClassRole } from '@/platform/auth/server-actor';
import { getDatabase } from '@/platform/db/database';
import { redirect } from 'next/navigation';

export default async function StudentFollowPage({ params }: { params: { sessionId: string } }) {
  const actor = await requireClassRole('student');
  if (!actor.studentId) redirect('/');
  const data = loadStudentFollowPage(getDatabase(), actor, params.sessionId);
  if (!data) {
    return <ClassSessionUnavailable displayName={actor.displayName} role="student" sessionId={params.sessionId} returnHref="/student/home" returnLabel="返回学习首页" />;
  }
  return (
    <StudentFollowClient
      activityCatalog={data.activityCatalog}
      displayName={actor.displayName}
      initialSnapshot={data.initialSnapshot}
      returnTarget={data.returnTarget}
    />
  );
}

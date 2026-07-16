import { authorizeRoleHome } from '../../../features/home/authorize-role-home.ts';
import { readStudentHomeSnapshot } from '../../../features/home/role-home-read-model.ts';
import { StudentHome } from '../../../features/home/student-home.tsx';
import { buildStudentHomeViewModel } from '../../../features/home/student-home-model.ts';

export const dynamic = 'force-dynamic';

export default function StudentHomePage() {
  const actor = authorizeRoleHome('student', '/student/home');
  const snapshot = readStudentHomeSnapshot(actor);
  return <StudentHome model={buildStudentHomeViewModel(snapshot)} />;
}

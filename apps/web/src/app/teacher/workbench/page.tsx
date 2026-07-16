import { authorizeRoleHome } from '../../../features/home/authorize-role-home.ts';
import { readTeacherWorkbenchSnapshot } from '../../../features/home/role-home-read-model.ts';
import { TeacherWorkbench } from '../../../features/workbench/teacher-workbench.tsx';
import { buildTeacherWorkbenchViewModel } from '../../../features/workbench/teacher-workbench-model.ts';

export const dynamic = 'force-dynamic';

export default function TeacherWorkbenchPage() {
  const actor = authorizeRoleHome('teacher', '/teacher/workbench');
  const snapshot = readTeacherWorkbenchSnapshot(actor);
  return <TeacherWorkbench model={buildTeacherWorkbenchViewModel(snapshot)} />;
}

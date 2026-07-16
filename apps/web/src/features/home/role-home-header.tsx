import Link from 'next/link';
import { AccountMenu } from '../auth/account-menu.tsx';

export function RoleHomeHeader({
  displayName,
  role,
}: {
  displayName: string;
  role: 'student' | 'teacher';
}) {
  const homeHref = role === 'student' ? '/student/home' : '/teacher/workbench';
  return (
    <header className="role-home-topbar">
      <Link className="role-home-brand" href={homeHref}>
        <span>DG</span>
        <strong>5G网络优化（高级）</strong>
        <small>{role === 'student' ? '学生学习台' : '教师授课台'}</small>
      </Link>
      <div className="role-home-location">
        <strong>{role === 'student' ? '我的学习首页' : '授课工作台'}</strong>
        <small>任务优先 · 图谱辅助</small>
      </div>
      <AccountMenu displayName={displayName} role={role} />
    </header>
  );
}

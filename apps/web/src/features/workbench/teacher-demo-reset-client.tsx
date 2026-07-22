'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '../../ui/foundation/icons.tsx';

const confirmationCopy = '将三名演示学生恢复为：学生一未开始、学生二教师退回、学生三完整达成。课程、班级、账号和素材不会删除。确认重置吗？';

type ResetResult = {
  tone: 'success' | 'error';
  message: string;
};

export function TeacherDemoResetClient() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ResetResult>();

  async function reset() {
    if (pending || !window.confirm(confirmationCopy)) return;
    setPending(true);
    setResult(undefined);
    try {
      const response = await fetch('/api/demo/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmation: 'RESET_THREE_DEMO_STUDENTS' }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? '演示状态重置失败');
      }
      setResult({ tone: 'success', message: '重置成功：三名演示学生已恢复。' });
      router.refresh();
    } catch (error) {
      const detail = error instanceof Error ? error.message : '演示状态重置失败';
      setResult({ tone: 'error', message: `重置失败：${detail}` });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="teacher-demo-reset" data-demo-reset>
      <button className="role-home-secondary is-destructive" disabled={pending} onClick={reset} type="button">
        <Icon name="close" size={18} />
        {pending ? '正在重置…' : '重置三名演示学生'}
      </button>
      <small>恢复未开始 / 教师退回 / 完整达成三种演示状态</small>
      {result ? <p className={`teacher-demo-reset-result is-${result.tone}`} role={result.tone === 'error' ? 'alert' : 'status'}>{result.message}</p> : null}
    </div>
  );
}

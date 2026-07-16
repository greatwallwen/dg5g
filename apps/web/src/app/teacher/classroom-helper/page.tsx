import Link from 'next/link';
import { AuthoritativeSnapshotReader } from '@/platform/authoritative-snapshot';
import { requireClassRole } from '@/platform/auth/server-actor';
import { getDatabase } from '@/platform/db/database';

export const dynamic = 'force-dynamic';

export default async function ClassroomHelperPage({
  searchParams,
}: {
  searchParams: { sessionId?: string };
}) {
  const actor = await requireClassRole('teacher');
  const sessionId = searchParams.sessionId?.trim();
  const snapshot = new AuthoritativeSnapshotReader(getDatabase()).read(actor, 'teacher', {
    ...(sessionId ? { sessionId } : {}),
  });
  const returnHref = `/teacher/sessions/${snapshot.classroom.sessionId}`;

  return <main className="helper-reconnect-page" data-helper-reconnect-page data-helper-state={snapshot.helper.status}>
    <section>
      <span>课堂协同 / 连接恢复</span>
      <h1>{snapshot.helper.canPush ? '课堂助手已连接' : '重连课堂助手'}</h1>
      <p>{snapshot.helper.canPush
        ? `已有 ${snapshot.helper.onlineStudentDeviceCount} 台学生设备在线，可以返回授课页继续同步。`
        : '当前没有在线课堂助手。同步翻页、课堂跟随和正式测试启动已安全停用。'}</p>
      {!snapshot.helper.canPush ? <ol>
        <li>在部署主机打开 DGBook 工程目录。</li>
        <li>使用已配置的课堂助手令牌启动：<code>pnpm classroom-helper:start -- --session {snapshot.classroom.sessionId} --students stu-01,stu-02,stu-03</code></li>
        <li>助手显示在线后，点击“重新检测连接”。</li>
      </ol> : null}
      <div>
        <form method="get">
          <input name="sessionId" type="hidden" value={snapshot.classroom.sessionId} />
          <button data-helper-recheck type="submit">重新检测连接</button>
        </form>
        <Link href={returnHref}>返回授课页面</Link>
      </div>
    </section>
  </main>;
}

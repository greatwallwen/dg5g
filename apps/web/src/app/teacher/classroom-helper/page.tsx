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
        : '课堂连接正在恢复。恢复前不会推送新的同步指令，已在后台保留当前授课位置。'}</p>
      {!snapshot.helper.canPush ? <ol>
        <li>请先保持本页打开，系统会重新检测课堂连接。</li>
        <li>如连续检测仍未恢复，请联系现场技术支持处理。</li>
        <li>恢复后点击“返回授课页面”，继续当前课堂位置。</li>
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

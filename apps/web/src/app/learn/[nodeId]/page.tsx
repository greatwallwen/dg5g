import Link from 'next/link';
import { AccountMenu } from '@/features/auth/account-menu';
import { RoleGate } from '@/features/auth/role-gate';
import { TextbookSceneShell } from '@/features/textbook-scene/textbook-scene-shell';
import { loadSelfStudyCatalog, requireSelfStudyDocument } from '@/features/textbook-scene/self-study-content';
import { resolveSelfStudyNavigationTarget } from '@/features/textbook-scene/self-study-remediation';
import { NodeRouteAccessError, type NodeRouteClassification } from '@/platform/access-control';
import { requireClassRole } from '@/platform/auth/server-actor';
import { AuthoritativeSnapshotReader } from '@/platform/authoritative-snapshot';
import { getDatabase } from '@/platform/db/database';
import { projectStudentLearningSnapshot } from '@/platform/learning-compatibility-projection';
import { createLearningCommandService } from '@/platform/learning-command-service';
import { getNodeLearningPolicy } from '@/platform/learning-policy';
import { getCapabilityGraph } from '@/platform/mock-api';

export default async function StudentSelfPage({ params, searchParams }: {
  params: { nodeId: string };
  searchParams?: { mode?: string; section?: string; activityId?: string };
}) {
  const actor = await requireClassRole('student');
  const learning = createLearningCommandService();
  let destination: NodeRouteClassification;
  try {
    destination = learning.requireNodeAccess(actor, params.nodeId);
  } catch (error) {
    if (!(error instanceof NodeRouteAccessError)) throw error;
    destination = error.classification;
  }
  if (destination.kind !== 'open') {
    const title = destination.kind === 'not-found' ? '节点不存在' : destination.kind === 'locked' ? '节点尚未解锁' : '内容尚未开放';
    const prerequisites = destination.kind === 'locked' ? destination.prerequisiteNodeIds : [];
    return (
      <main className="textbook-scene-unavailable" data-node-route-state={destination.kind} data-node-unavailable={params.nodeId}>
        <AccountMenu displayName={actor.displayName} role="student" />
        <span>{title}</span>
        <h1>{params.nodeId}</h1>
        {prerequisites.length
          ? <p>需要先完成：{prerequisites.join('、')}</p>
          : <p>该节点没有可加载的教材、练习或提交功能，系统不会跳转到其他节点。</p>}
        <Link href="/course">返回课程能力图谱</Link>
      </main>
    );
  }
  const studentCut = new AuthoritativeSnapshotReader(getDatabase()).read(actor, 'student');
  const initialSnapshot = projectStudentLearningSnapshot(studentCut.me.learning);
  const selfStudyCatalog = loadSelfStudyCatalog();
  const document = requireSelfStudyDocument(params.nodeId, selfStudyCatalog);
  const navigationTarget = resolveSelfStudyNavigationTarget(document, {
    section: searchParams?.section,
    activityId: searchParams?.activityId,
  });
  if (navigationTarget.kind === 'invalid') {
    return (
      <main className="textbook-scene-unavailable" data-self-study-target="invalid">
        <AccountMenu displayName={actor.displayName} role="student" />
        <span>定向再学位置无效</span>
        <h1>{params.nodeId}</h1>
        <p>该学习段或练习不属于当前节点，请从节点首页重新进入。</p>
        <Link href={`/learn/${params.nodeId}`}>返回节点学习</Link>
      </main>
    );
  }
  const graph = await getCapabilityGraph(params.nodeId);
  const policy = getNodeLearningPolicy(params.nodeId);
  const initialMode = searchParams?.mode === 'learning'
    ? 'learning'
    : searchParams?.mode === 'challenge' || policy?.requiresProfessionalOutput
      ? 'challenge'
      : 'learning';
  return (
    <RoleGate
      description="登录后进入单知识点全屏学习，完成正文、练习、正式测试与所需专业产出后确认能力状态。"
      requiredRole="student"
      title="请先登录学生端"
    >
      <TextbookSceneShell
        autoFocus={false}
        displayName={actor.displayName}
        focusedActivityId={navigationTarget.kind === 'target' ? navigationTarget.activityId : undefined}
        graph={graph}
        initialMode={initialMode}
        initialNodeId={params.nodeId}
        initialSection={navigationTarget.kind === 'target' ? navigationTarget.sectionId : undefined}
        initialSnapshot={initialSnapshot}
        selfStudyCatalog={selfStudyCatalog}
        sessionId={studentCut.classroom.sessionId}
        surface="student"
      />
    </RoleGate>
  );
}

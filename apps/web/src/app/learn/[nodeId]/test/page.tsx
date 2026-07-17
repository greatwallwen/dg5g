import Link from 'next/link';
import { AccountMenu } from '@/features/auth/account-menu';
import { FormalAssessmentClient } from '@/features/formal-assessment/formal-assessment-client';
import { FormalAssessmentRemediationNotice } from '@/features/formal-assessment/formal-assessment-result';
import { NodeRouteAccessError, type NodeRouteClassification } from '@/platform/access-control';
import { requireClassRole } from '@/platform/auth/server-actor';
import {
  AssessmentCatalogError,
  AssessmentClassroomWindowError,
  AssessmentRemediationRequiredError,
  createFormalAssessmentService,
} from '@/platform/formal-assessment-service';
import {
  AssessmentClassroomContextError,
  parseAssessmentClassroomSessionId,
  parseAssessmentRestart,
} from '@/platform/assessment-classroom-context';
import {
  createLearningCommandService,
  FormalAssessmentReadinessError,
} from '@/platform/learning-command-service';

export const dynamic = 'force-dynamic';

export default async function FormalAssessmentPage({
  params,
  searchParams,
}: {
  params: { nodeId: string };
  searchParams: { classroomSessionId?: string | string[]; restart?: string | string[] };
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
    return (
      <main className="formal-assessment-page is-unavailable" data-node-route-state={destination.kind}>
        <AccountMenu displayName={actor.displayName} role="student" />
        <section>
          <span>正式测试不可进入</span>
          <h1>{params.nodeId}</h1>
          <p>{destination.kind === 'locked'
            ? `请先完成：${destination.prerequisiteNodeIds.join('、')}`
            : destination.kind === 'not-found' ? '节点不存在。' : '该节点尚未开放。'}</p>
          <Link href="/course">返回课程能力图谱</Link>
        </section>
      </main>
    );
  }

  const assessment = createFormalAssessmentService();
  try {
    const classroomSessionId = parseAssessmentClassroomSessionId(searchParams.classroomSessionId);
    const restart = parseAssessmentRestart(searchParams.restart);
    const issued = assessment.openOrResume(actor, params.nodeId, {
      ...(classroomSessionId ? { classroomSessionId } : {}),
      ...(restart ? { restart: true } : {}),
    });
    return (
      <main className="formal-assessment-page" data-formal-assessment={params.nodeId}>
        <AccountMenu displayName={actor.displayName} role="student" />
        <FormalAssessmentClient issued={issued} />
      </main>
    );
  } catch (error) {
    if (error instanceof AssessmentClassroomContextError
      || error instanceof AssessmentClassroomWindowError) {
      return (
        <main className="formal-assessment-page is-unavailable" data-assessment-entry="classroom-window-unavailable">
          <AccountMenu displayName={actor.displayName} role="student" />
          <section>
            <span>课堂正式测试不可进入</span>
            <h1>当前课堂测试窗口已关闭或不匹配</h1>
            <p>请返回课堂跟随页，等待教师重新启动当前节点的正式测试。</p>
            <Link href="/student/home">返回学习首页</Link>
          </section>
        </main>
      );
    }
    if (error instanceof FormalAssessmentReadinessError) {
      return (
        <main className="formal-assessment-page is-unavailable" data-formal-assessment={params.nodeId}>
          <AccountMenu displayName={actor.displayName} role="student" />
          <section data-assessment-entry="prerequisite-required">
            <span>正式测试前置活动尚未完成</span>
            <h1>先完成节点微练习</h1>
            <p>完成当前节点的自学活动并达到 micro-practice-passed 后，正式测试会自动开放。</p>
            <Link href={`/learn/${params.nodeId}`}>返回节点学习</Link>
          </section>
        </main>
      );
    }
    if (error instanceof AssessmentRemediationRequiredError) {
      return (
        <main className="formal-assessment-page" data-formal-assessment={params.nodeId}>
          <AccountMenu displayName={actor.displayName} role="student" />
          <FormalAssessmentRemediationNotice nodeId={params.nodeId} targets={error.targets} />
        </main>
      );
    }
    if (error instanceof AssessmentCatalogError) {
      return (
        <main className="formal-assessment-page is-unavailable" data-formal-assessment="unavailable">
          <AccountMenu displayName={actor.displayName} role="student" />
          <section><h1>该节点未配置服务端正式测试</h1><Link href={`/learn/${params.nodeId}`}>返回节点学习</Link></section>
        </main>
      );
    }
    throw error;
  }
}

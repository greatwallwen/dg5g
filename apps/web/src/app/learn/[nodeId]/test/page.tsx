import Link from 'next/link';
import { AccountMenu } from '@/features/auth/account-menu';
import { FormalAssessmentClient } from '@/features/formal-assessment/formal-assessment-client';
import { FormalAssessmentRemediationNotice } from '@/features/formal-assessment/formal-assessment-result';
import { NodeRouteAccessError, type NodeRouteClassification } from '@/platform/access-control';
import { requireClassRole } from '@/platform/auth/server-actor';
import {
  AssessmentCatalogError,
  AssessmentRemediationRequiredError,
  createFormalAssessmentService,
} from '@/platform/formal-assessment-service';
import { createLearningCommandService } from '@/platform/learning-command-service';

export const dynamic = 'force-dynamic';

export default async function FormalAssessmentPage({ params }: { params: { nodeId: string } }) {
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
    const issued = assessment.issuePaper(actor, params.nodeId);
    return (
      <main className="formal-assessment-page" data-formal-assessment={params.nodeId}>
        <AccountMenu displayName={actor.displayName} role="student" />
        <FormalAssessmentClient issued={issued} />
      </main>
    );
  } catch (error) {
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

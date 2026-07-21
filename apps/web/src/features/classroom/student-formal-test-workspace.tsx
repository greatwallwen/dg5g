'use client';

import Link from 'next/link';
import type { ClassSession, SkillProgress } from '@/platform/models';
import { skillGameForNode } from '@/platform/fixtures/skill-game-fixtures';
import { Icon } from '@/ui/foundation/icons';
import { projectChallengeScene } from '@/features/textbook-scene/challenge-scene-model';

export function StudentFormalTestWorkspace({
  classroomSessionId,
  evidence,
  evidenceState,
  nodeId,
  onEvidenceChange,
  onEvidenceSubmit,
  progress,
  student,
  title,
}: {
  classroomSessionId: string;
  evidence: string;
  evidenceState: 'idle' | 'saving' | 'error';
  gameConfig: ReturnType<typeof skillGameForNode>;
  nodeId: string;
  onEvidenceChange: (value: string) => void;
  onEvidenceSubmit: () => void;
  onProgress: (progress: SkillProgress[]) => void;
  progress?: SkillProgress;
  student: ClassSession['studentRoster'][number];
  studentId: string;
  studentVersion: number;
  title: string;
}) {
  const challenge = projectChallengeScene(nodeId, progress);
  if (challenge.kind === 'unavailable') {
    return <section className="student-formal-test-workspace is-unavailable" data-student-formal-test={nodeId}><h1>该节点未配置正式测试</h1></section>;
  }
  const passed = challenge.formalTestPassed;
  const evidenceReviewStatus = student.evidenceReviewStatus ?? progress?.evidenceReviewStatus ?? 'not-submitted';
  const evidenceReadOnly = evidenceReviewStatus === 'submitted' || evidenceReviewStatus === 'verified';
  const evidenceAction = evidenceReviewStatus === 'verified'
    ? 'certified'
    : evidenceReviewStatus === 'submitted'
      ? 'waiting-review'
      : evidenceReviewStatus === 'returned'
        ? 'resubmit'
        : 'submit';

  return (
    <section
      className="student-formal-test-workspace"
      data-classroom-skill-game={nodeId}
      data-evidence-action={evidenceAction}
      data-evidence-review-status={evidenceReviewStatus}
      data-p01-n02-formal-test={nodeId === 'P1T1-N02' ? 'true' : 'false'}
      data-student-formal-test={nodeId}
    >
      <div className="student-test-route">
        <span>正式测试</span><i className="is-active">1</i><b>设备与参数</b><i>2</i><b>关系与证据</b><i>3</i><b>验收结论</b>
      </div>
      <div className="student-test-main">
        <span>教师已启动正式测试</span>
        <h1>{title}</h1>
        <p>{nodeId} · 四项诊断 · 系统判分</p>
        <section className="formal-assessment-entry" data-classroom-assessment-entry={nodeId}>
          <span><Icon name="target" size={26} /></span>
          <div><small>独立正式测试</small><h2>进入安全测试页完成实际作答</h2><p>课堂状态继续同步；题面、一次性凭证与成绩由测试服务管理。</p></div>
          <Link href={`/learn/${nodeId}/test?classroomSessionId=${encodeURIComponent(classroomSessionId)}`}>进入正式测试</Link>
        </section>
      </div>
      {challenge.requiresProfessionalOutput ? <aside className="student-evidence-workspace">
        <small>任务成果</small>
        <strong>对象、证据、判断、下一步动作</strong>
        <textarea
          disabled={evidenceReadOnly}
          onChange={(event) => onEvidenceChange(event.target.value)}
          placeholder="机柜02对象已定位，端口与供电证据已核验，判断链路恢复，下一步复核告警日志。"
          value={evidence}
        />
        {evidenceReviewStatus === 'returned' ? (
          <p>教师反馈：{student.teacherFeedback ?? progress?.teacherFeedback ?? '请根据反馈补全后重新提交。'}</p>
        ) : null}
        {evidenceReviewStatus === 'verified' ? (
          <div className="evidence-certified"><Icon name="check" size={16} />教师已认证</div>
        ) : evidenceReviewStatus === 'submitted' ? (
          <div className="evidence-waiting"><Icon name="link" size={16} />任务成果已提交，等待教师复核</div>
        ) : (
          <button
            data-evidence-resubmit={evidenceReviewStatus === 'returned' ? 'true' : 'false'}
            disabled={!passed || evidence.trim().length < 16 || evidenceState === 'saving'}
            onClick={onEvidenceSubmit}
            type="button"
          >
            {evidenceState === 'saving'
              ? '正在提交'
              : evidenceReviewStatus === 'returned'
                ? '根据反馈重新提交'
                : evidenceState === 'error'
                  ? '重新提交任务成果'
                  : '提交任务成果'}
          </button>
        )}
      </aside> : <aside className="student-evidence-workspace is-not-required"><small>本节点完成标准</small><strong>正式测试达到 {challenge.formalPassScore} 分</strong><p>N02 不提交任务成果，也不进入教师认证。</p></aside>}
      <footer>
        <i />
        <span>已与教师课堂状态同步</span>
        <strong>{!challenge.requiresProfessionalOutput
          ? passed ? '正式测试达标，继续下一能力节点' : `正式测试达到 ${challenge.formalPassScore} 分后继续`
          : evidenceReviewStatus === 'verified'
          ? '任务成果已认证'
          : evidenceReviewStatus === 'submitted'
            ? '等待教师复核'
            : evidenceReviewStatus === 'returned'
              ? '请根据反馈修订后重新提交'
              : '完成测试后提交任务成果'}</strong>
      </footer>
    </section>
  );
}

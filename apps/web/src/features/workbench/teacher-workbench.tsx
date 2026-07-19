import Link from 'next/link';
import { Icon } from '../../ui/foundation/icons.tsx';
import { RoleHomeHeader } from '../home/role-home-header.tsx';
import { TeacherStartLessonClient } from './teacher-start-lesson-client.tsx';
import { TeacherDemoResetClient } from './teacher-demo-reset-client.tsx';
import type { TeacherWorkbenchViewModel } from './teacher-workbench-model.ts';

export function TeacherWorkbench({ model }: { model: TeacherWorkbenchViewModel }) {
  return (
    <main
      className="role-home-shell role-home-teacher"
      data-motion="paused"
      data-primary-action-policy="exactly-one"
      data-teacher-workbench
      data-ui-surface="dark"
    >
      <RoleHomeHeader displayName={model.displayName} role="teacher" />
      {model.kind === 'ready' ? <TeacherReady model={model} /> : <TeacherBlocked model={model} />}
    </main>
  );
}

function TeacherReady({ model }: { model: Extract<TeacherWorkbenchViewModel, { kind: 'ready' }> }) {
  const classroomActivity = model.classSummary.submissions.classroomActivity;
  const activeAssessment = model.classSummary.submissions.activeAssessment;
  const professionalOutputs = model.classSummary.submissions.professionalOutputs;
  return (
    <div className="role-home-body teacher-workbench-grid">
      <section className="role-home-card teacher-session-card" data-teacher-session-list>
        <div className="role-home-card-head">
          <div>
            <span className="role-home-kicker">当前课程</span>
            <h1>{model.courseTitle}</h1>
          </div>
          <span className={`role-home-state is-${model.classroom.status}`}>{classStatus(model.classroom.status)}</span>
        </div>
        <div className="teacher-class-line">
          <span><Icon name="teacher" size={20} /><small>演示班级</small><strong>{model.classroom.name}</strong></span>
          <span><Icon name="user" size={20} /><small>在班学生</small><strong>{model.classroom.memberCount} 人</strong></span>
        </div>
        <div className="teacher-last-position">
          <span className="role-home-kicker">最近一次授课位置</span>
          {model.lastPosition ? (
            <div>
              <span><small>项目</small><strong>{model.lastPosition.projectId} · {model.lastPosition.projectTitle}</strong></span>
              <Icon name="arrow" size={17} />
              <span><small>任务</small><strong>{model.lastPosition.taskId} · {model.lastPosition.taskTitle}</strong></span>
              <Icon name="arrow" size={17} />
              <span className="is-focus"><small>能力节点</small><strong>{model.lastPosition.nodeId} · {model.lastPosition.nodeTitle}</strong></span>
            </div>
          ) : <p>尚无可继续的授课位置，请从“开始新课”选择节点。</p>}
        </div>
      </section>

      <section className="role-home-card teacher-actions-card" data-teacher-workbench-actions>
        <span className="role-home-kicker">授课动作</span>
        <h2>从任务直接进入课堂</h2>
        {model.continueAction.href ? (
          <Link
            aria-label={`继续授课：${model.lastPosition ? `${model.lastPosition.nodeId} · ${model.lastPosition.nodeTitle}` : model.continueAction.label}`}
            className="role-home-primary teacher-continue-action"
            data-primary-action
            data-role-home-primary
            href={model.continueAction.href}
          >
            <Icon name="play" size={21} />
            <span>
              <strong>{model.continueAction.label}</strong>
              {model.lastPosition ? <small>{model.lastPosition.nodeId} · {model.lastPosition.nodeTitle}</small> : null}
            </span>
            <Icon name="arrow" size={19} />
          </Link>
        ) : null}
        <TeacherStartLessonClient
          expectedRevision={model.newLesson.expectedRevision}
          options={model.newLesson.options}
          primary={model.newLesson.trigger.primary}
          recommendedNodeId={model.newLesson.recommendedNodeId}
          sessionId={model.newLesson.sessionId}
          triggerLabel={model.newLesson.trigger.label}
        />
        <Link aria-label="课程能力图谱" className="role-home-secondary" href={model.graphAction.href}>
          <Icon name="map" size={19} />{model.graphAction.label}<Icon name="arrow" size={17} />
        </Link>
        <TeacherDemoResetClient />
      </section>

      <section className="role-home-card teacher-progress-card" data-teacher-workbench-progress>
        <div className="role-home-card-head">
          <div><span className="role-home-kicker">班级实时概览</span><h2>当前课堂进度</h2></div>
          <strong>{classroomActivity.submittedCount} / {model.classroom.memberCount}</strong>
        </div>
        <p>课堂活动已提交（按当前班级成员实时统计）</p>
        <div className="role-home-progress" aria-label={`课堂活动提交率 ${classroomActivity.submissionPercent}%`}><i style={{ width: `${classroomActivity.submissionPercent}%` }} /></div>
        <p>本轮正式测试已提交 {activeAssessment.submittedCount} / {activeAssessment.eligibleCount}，已达标 {activeAssessment.passedCount} 人</p>
        <div className="teacher-score-grid">
          {model.scoreCards.map((score) => (
            <article className={`is-${score.tone}`} key={score.label}>
              <small>{score.label}</small><strong>{score.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="role-home-card teacher-insight-card">
        <div className="teacher-review-count">
          <span><Icon name="file" size={20} />待批阅专业产出</span>
          <strong>{professionalOutputs.submittedAwaitingReviewCount}</strong>
          <small>仅统计“已提交、待教师复核”的专业产出</small>
        </div>
        <div className="teacher-weak-points">
          <span><Icon name="target" size={20} />班级薄弱点</span>
          {model.classSummary.weakPoints.length ? model.classSummary.weakPoints.map((point) => (
            <div key={point.id}><strong>{point.label}</strong><small>{point.affectedCount} 人涉及</small></div>
          )) : <p>当前暂无可归因的薄弱点记录。</p>}
        </div>
      </section>
    </div>
  );
}

function TeacherBlocked({ model }: { model: Extract<TeacherWorkbenchViewModel, { kind: 'blocked' }> }) {
  return <div className="role-home-body role-home-blocked"><section className="role-home-card"><Icon name="lock" size={34} /><span className="role-home-kicker">授课门禁</span><h1>{model.blocker.title}</h1><p>{model.blocker.detail}</p></section></div>;
}

function classStatus(status: 'preparing' | 'active' | 'paused' | 'closed') {
  return ({ preparing: '准备中', active: '授课中', paused: '已暂停 · 可继续', closed: '已结束' } as const)[status];
}

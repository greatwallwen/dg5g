'use client';

import React from 'react';
import Link from 'next/link';
import type { GameConfig } from '@dgbook/edugame-core';
import type { DemoTaskProfile } from '@/features/platform/deep-textbook-demo-data';
import { ProfessionalOutputForm } from '@/features/portfolio/professional-output-form';
import type { ProfessionalOutputSchema } from '@/features/portfolio/output-schema';
import { getNodeLearningPolicy } from '@/platform/learning-policy';
import type { SkillProgress, TaskMasteryProgress } from '@/platform/models';
import { Icon } from '@/ui/foundation/icons';
import { projectChallengeScene } from './challenge-scene-model';

export function ChallengeScene({
  profile,
  gameConfig,
  mastery,
  nodeProgress,
  outputSchema,
  unit,
  onContinue,
  onReturnToMap,
}: {
  profile: DemoTaskProfile;
  gameConfig: GameConfig;
  mastery?: TaskMasteryProgress;
  nodeProgress?: SkillProgress;
  outputSchema?: ProfessionalOutputSchema;
  unit: DemoTaskProfile['units'][number];
  studentId: string;
  studentVersion: number;
  onProgress: (progress: SkillProgress[]) => void;
  onContinue: () => void;
  onReturnToMap: () => void;
}) {
  const challenge = projectChallengeScene(unit.capabilityNodeId, nodeProgress);
  const policy = getNodeLearningPolicy(unit.capabilityNodeId);
  if (policy?.requiresProfessionalOutput) {
    if (!outputSchema || outputSchema.taskId !== profile.taskId) {
      return <UnavailableChallenge message="该节点的职业产出模板未加载" onReturnToMap={onReturnToMap} />;
    }
    return (
      <section className="challenge-scene is-professional-output" data-task-challenge={`${profile.taskId}-output`}>
        <ProfessionalOutputForm schema={outputSchema} teacherFeedback={nodeProgress?.teacherFeedback} />
        <button className="is-secondary challenge-map-return" onClick={onReturnToMap} type="button"><Icon name="map" size={17} />返回能力图谱</button>
      </section>
    );
  }
  if (challenge.kind === 'unavailable') {
    return <UnavailableChallenge message="该节点未配置正式测试" onReturnToMap={onReturnToMap} />;
  }
  const passed = challenge.formalTestPassed;
  const complete = challenge.achieved;
  const attempts = nodeProgress?.gameAttempts ?? [];
  const bestFormalScore = nodeProgress?.bestGameScore;
  return (
    <section className="challenge-scene" data-motion="paused" data-primary-action-policy="exactly-one" data-task-challenge={profile.taskId} data-task-mastery={mastery?.state ?? 'learning'}>
      <header className="challenge-scene-head">
        <div><span>{profile.taskId} · {unit.capabilityNodeId} · 正式测试</span><h1>{gameConfig.title}</h1><p>{unit.action}，得分将写入能力图谱与教师端成绩册。</p></div>
        <div className="challenge-score" data-formal-score-state={bestFormalScore === undefined ? 'untested' : 'formed'}><strong>{formalScoreLabel(bestFormalScore)}</strong>{bestFormalScore === undefined ? null : <span>/ 100</span>}<small>最高分 · {challenge.formalPassScore}分达标</small></div>
      </header>
      <div className="challenge-layout">
        <div className="challenge-game-stage">
          <section className="formal-assessment-entry" data-assessment-entry={unit.capabilityNodeId}>
            <span><Icon name="target" size={28} /></span>
            <div>
              <small>独立正式测试 · 服务端判分</small>
              <h2>题面与学习场景分离</h2>
              <p>进入后将生成一次性测试凭证。页面只提交实际作答，四项诊断与成绩由服务端形成。</p>
            </div>
            <Link data-primary-action={!passed ? 'true' : undefined} href={`/learn/${unit.capabilityNodeId}/test`}>
              {passed ? '查看并再次测试' : '进入正式测试'}
            </Link>
          </section>
        </div>
        <aside className="challenge-evidence-panel">
          <span>正式测试记录</span>
          <h2>{unit.title}</h2>
          <p>每次正式作答均保留；未达标后完成定向再学即可再次测试。</p>
          <div className="formal-score-grid"><div><small>首分</small><strong>{formalScoreLabel(nodeProgress?.firstGameScore)}</strong></div><div><small>最高分</small><strong>{formalScoreLabel(bestFormalScore)}</strong></div><div><small>最近分</small><strong>{formalScoreLabel(nodeProgress?.latestGameScore)}</strong></div></div>
          <ol className="formal-attempt-list">{attempts.length ? attempts.map((attempt, index) => <li key={attempt.attemptId}><span>第{index + 1}次</span><strong>{attempt.score}分</strong><small>{formalDurationLabel(attempt.durationSeconds)}</small></li>) : <li><span>尚未提交</span><small>完成三阶段后形成第1次成绩</small></li>}</ol>
          <div className="challenge-gate-list">
            <div className="is-done"><Icon name="check" size={17} /><span><strong>节点学习</strong><small>正文与微练习已完成</small></span></div>
            <div className={passed ? 'is-done' : ''}><Icon name={passed ? 'check' : 'target'} size={17} /><span><strong>正式测试</strong><small>{passed ? formalTestPassedLabel(bestFormalScore) : `达到${challenge.formalPassScore}分后测试达标`}</small></span></div>
          </div>
          <button data-primary-action={passed ? 'true' : undefined} disabled={!passed} onClick={onContinue} type="button"><Icon name="arrow" size={17} />{passed ? '继续下一能力节点' : `正式测试达到${challenge.formalPassScore}分后继续`}</button>
          {complete ? <div className="task-lit-banner"><Icon name="spark" size={22} /><span><strong>{unit.capabilityNodeId}测试达标</strong><small>继续学习后续能力节点</small></span></div> : null}
          <button className="is-secondary" onClick={onReturnToMap} type="button"><Icon name="map" size={17} />返回能力图谱</button>
        </aside>
      </div>
    </section>
  );
}

function UnavailableChallenge({ message, onReturnToMap }: { message: string; onReturnToMap: () => void }) {
  return <section className="challenge-scene is-unavailable" data-task-challenge="unavailable"><h1>{message}</h1><button className="is-secondary" onClick={onReturnToMap} type="button"><Icon name="map" size={17} />返回能力图谱</button></section>;
}

function formalScoreLabel(score: number | undefined): number | '尚未测试' {
  return score === undefined ? '尚未测试' : score;
}

function formalTestPassedLabel(score: number | undefined): string {
  return score === undefined ? '测试达标，成绩尚未形成' : `${score}分，测试达标`;
}

function formalDurationLabel(durationSeconds: number | undefined): string {
  if (durationSeconds === undefined) return '用时尚未形成';
  if (durationSeconds === 0) return '0分钟';
  return `${Math.max(1, Math.round(durationSeconds / 60))}分钟`;
}

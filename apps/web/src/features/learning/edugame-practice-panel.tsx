'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { GameConfig, LearningRecord } from '@dgbook/edugame-core';
import type { SkillProgress } from '@/platform/models';
import { getNodeLearningPolicy } from '@/platform/learning-policy';
import { Icon } from '@/ui/foundation/icons';
import { recordSkillEvent, SkillProgressRequestError } from '@/features/skill-tree/skill-progress-client';
import { createAttemptId } from './attempt-id';

const EduGameInteractive = dynamic(
  () => import('@dgbook/widgets/edugame-pixi').then((module) => module.EduGameInteractive),
  { ssr: false, loading: () => <div className="skill-game-loading"><span /><strong>正在准备专业挑战</strong></div> },
);

export function EduGamePracticePanel({
  gameConfig,
  nodeId,
  bestScore = 0,
  nodeProgress,
  onProgress,
  primaryAction = false,
  studentVersion,
}: {
  gameConfig: GameConfig;
  nodeId: string;
  bestScore?: number;
  nodeProgress?: SkillProgress;
  studentId?: string;
  studentVersion: number;
  primaryAction?: boolean;
  onProgress?: (progress: SkillProgress[]) => void;
}) {
  const [record, setRecord] = useState<LearningRecord | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [syncError, setSyncError] = useState('');
  const progressLoading = nodeProgress === undefined;
  const serverAttemptCount = progressLoading ? null : Math.min(3, nodeProgress.attemptCount ?? 0);
  const resolvedServerAttemptCount = serverAttemptCount ?? 0;
  const [localAttemptState, setLocalAttemptState] = useState({ nodeId, count: resolvedServerAttemptCount });
  const localAttemptCount = localAttemptState.nodeId === nodeId ? localAttemptState.count : resolvedServerAttemptCount;
  const effectiveScore = Math.max(bestScore, record?.score ?? 0);
  const policy = getNodeLearningPolicy(nodeId);
  const formalPassScore = policy?.requiresFormalTest ? policy.formalPassScore : undefined;
  const passed = !replaying && formalPassScore !== undefined && effectiveScore >= formalPassScore;
  const needsReplay = Boolean(record && !passed);
  const attemptCount = Math.min(3, Math.max(resolvedServerAttemptCount, localAttemptCount));
  const remainingAttempts = Math.max(0, 3 - attemptCount);
  const canRetry = remainingAttempts > 0 && !syncing;
  const attemptsExhausted = attemptCount >= 3 && !passed;
  const latestAttempt = nodeProgress?.gameAttempts?.at(-1);
  const replayScore = record?.score ?? latestAttempt?.score ?? effectiveScore;
  const replayStars = record?.stars ?? (replayScore >= 95 ? 3 : replayScore >= 80 ? 2 : 1);
  const replayDuration = record ? Math.max(1, Math.round(record.duration)) : latestAttempt?.durationSeconds ?? 0;
  const replayWeakPoints = record?.mistakes.map((mistake) => mistake.reason) ?? latestAttempt?.mistakeKnowledgePointIds ?? [];

  async function handleComplete(nextRecord: LearningRecord) {
    setRecord(nextRecord);
    setReplaying(false);
    setSyncing(true);
    setSyncError('');
    setLocalAttemptState((current) => ({
      nodeId,
      count: Math.min(3, Math.max(current.nodeId === nodeId ? current.count : 0, resolvedServerAttemptCount) + 1),
    }));
    try {
      const attemptId = createAttemptId();
      let snapshot = await recordSkillEvent({
        nodeId,
        channel: 'game',
        type: 'game_completed',
        score: nextRecord.score,
        stars: nextRecord.stars,
        completed: nextRecord.completed,
        gameId: nextRecord.game_id,
        attemptId,
        durationSeconds: Math.max(1, Math.round(nextRecord.duration)),
        formal: true,
        mistakeKnowledgePointIds: nextRecord.mistakes.map((mistake) => mistake.kp),
      }, studentVersion);
      if (nextRecord.completed && formalPassScore !== undefined && nextRecord.score >= formalPassScore) {
        snapshot = await recordSkillEvent({
          eventId: `${snapshot.studentId}:${attemptId}:practice-section`,
          nodeId,
          channel: 'self-study',
          type: 'section_completed',
          sectionId: 'practice',
          completed: true,
        }, snapshot.version);
      }
      onProgress?.(snapshot.progress);
    } catch (error) {
      if (error instanceof SkillProgressRequestError && error.status === 409) {
        setLocalAttemptState({ nodeId, count: 3 });
      }
      setSyncError(error instanceof SkillProgressRequestError ? error.message : '成绩回流失败，请检查网络后重试。');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="skill-game-panel" data-formal-test="true" data-skill-game={nodeId} data-skill-game-result={progressLoading ? 'loading' : passed ? 'passed' : attemptsExhausted ? 'exhausted' : record ? 'retry' : 'ready'}>
      <header>
        <div><span>正式测试 · 5–8分钟</span><h3>{gameConfig.title}</h3></div>
        <strong>{progressLoading ? '正在读取提交次数' : `已提交 ${attemptCount}/3 · 剩余 ${remainingAttempts} 次`}</strong>
      </header>
      {progressLoading ? (
        <section aria-live="polite" className="skill-game-progress-loading" data-game-progress-loading={nodeId}>
          <span><Icon name="link" size={24} /></span>
          <div><strong>正在读取正式测试记录</strong><p>确认已用次数与历史成绩后开放测试。</p></div>
        </section>
      ) : passed ? (
        <section className="skill-game-replay-frame" data-game-pass-summary={nodeId} data-game-replay-frame={nodeId}>
          <span><Icon name="check" size={20} /></span>
          <div><small>正式测试 · 达标</small><strong>{replayScore} 分 · {replayStars}/3 星</strong></div>
          <dl><div><dt>用时</dt><dd>{replayDuration || '—'} 秒</dd></div><div><dt>薄弱点</dt><dd>{replayWeakPoints.length ? replayWeakPoints.slice(0, 2).join('、') : '无'}</dd></div></dl>
          <button data-primary-action={primaryAction ? 'true' : undefined} disabled={!canRetry} onClick={() => { setRecord(null); setReplaying(true); setAttempt((value) => value + 1); }} type="button">{syncing ? '成绩回流中' : canRetry ? '复盘重试' : '正式机会已用完'}</button>
        </section>
      ) : attemptsExhausted ? (
        <section className="skill-game-fail-summary skill-game-exhausted-summary" data-game-attempts-exhausted={nodeId}>
          <span><Icon name="target" size={28} /></span>
          <div><small>三次正式机会已完成</small><strong>最高 {effectiveScore} 分 · 进入复盘</strong><p>{replayWeakPoints.length ? `重点复盘 ${replayWeakPoints.slice(0, 2).join('、')}` : '请结合正式测试记录复核对象、证据与判断链条。'}</p></div>
        </section>
      ) : needsReplay ? (
        <section className="skill-game-fail-summary" data-game-fail-summary={nodeId}>
          <span><Icon name="target" size={28} /></span>
          <div><small>{record?.completed ? `未达到${formalPassScore ?? '规定'}分门槛` : '本轮挑战失败'}</small><strong>{record?.score} 分 · 复盘后重试</strong><p>{record?.mistakes.length ? `优先修正 ${record.mistakes.slice(0, 2).map((mistake) => mistake.reason).join('；')}` : '重新检查对象、证据与复核标准的对应关系。'}</p></div>
          <button disabled={!canRetry} onClick={() => { setRecord(null); setReplaying(true); setAttempt((value) => value + 1); }} type="button">{syncing ? '成绩回流中' : canRetry ? '复盘后重试' : '正式机会已用完'}</button>
        </section>
      ) : <EduGameInteractive gameConfig={gameConfig} height={460} key={attempt} primaryAction={primaryAction} variant="embedded" onComplete={handleComplete} />}
      {syncing ? <footer aria-live="polite"><Icon name="link" size={18} /><div><strong>正在回流学习证据</strong><span>得分、星级与薄弱点将写入能力图谱</span></div></footer> : null}
      {syncError ? <footer className="is-error" role="alert"><Icon name="close" size={18} /><div><strong>成绩尚未写入</strong><span>{syncError}</span></div></footer> : null}
    </section>
  );
}

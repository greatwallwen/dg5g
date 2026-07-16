import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GameRuntime,
  getTemplate,
  listTemplates,
  normalizeGameConfig,
  createSfxPool,
  type GameConfig,
  type GameItem,
  type GameType,
  type LearningRecord,
  type SfxPool,
  type SfxPoolOptions,
} from '@dgbook/edugame-core';
import type { EduGameInteractiveProps } from './types';
import { BossReviewArcade } from './BossReviewArcade';
import { QuickHitArcade } from './QuickHitArcade';
import { QuizRushArcade } from './QuizRushArcade';
import { MemoryArcade } from './MemoryArcade';
import { DragArcade } from './DragArcade';
import { SortArcade } from './SortArcade';
import { PipeConnectArcade } from './PipeConnectArcade';
import { MazeTroubleshootArcade } from './MazeTroubleshootArcade';
import { CLASSIFICATION_REJECT_TARGET_ID, ClassificationRunArcade } from './ClassificationRunArcade';
import { Match3Arcade } from './Match3Arcade';
import { CoverageSurveyArcade } from './CoverageSurveyArcade';
import { TopologyRepairArcade } from './TopologyRepairArcade';
import { EvidenceChainArcade } from './EvidenceChainArcade';
import { BeamTuningArcade } from './BeamTuningArcade';
import { progressForSegments, splitIntoLevels, targetCount } from './level-segments';
import { ReviewCard } from './ReviewCard';
import { StageMilestones } from './StageMilestones';
import { buildAnswerRows } from './answer-rows';
import { compactText, expectedTargetLabel, targetLabel, uniqueTargets, wrongFeedback } from './feedback-helpers';
import { styles } from './styles';

const DEFAULT_MAX_LIVES = 5;

type ResultState = 'idle' | 'correct' | 'wrong' | 'complete';
type PracticeMode = 'full' | 'mistake-drill';
type ScoreMoment = { id: number; kind: 'correct' | 'wrong' | 'level' | 'finish'; label: string; points: string };
type WrongContext = { chosenTargetId?: string; chosenTargetLabel?: string };

export function EduGameInteractive({
  gameConfig,
  title,
  height = 720,
  variant = 'full',
  primaryAction = false,
  onComplete,
}: EduGameInteractiveProps & { onComplete?: (record: LearningRecord) => void }) {
  const config = useMemo(() => normalizeGameConfig((gameConfig ?? { title }) as Record<string, unknown>), [gameConfig, title]);
  const template = getTemplate(config.game_type);
  const playType: GameType = config.game_type === 'match-3' ? 'match-3' : (template?.mechanic_family ?? config.game_type);
  const playLabel = gameTypeLabel(config.game_type);
  const rootRef = useRef<HTMLElement | null>(null);
  const runtimeRef = useRef<GameRuntime | null>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [timeLeft, setTimeLeft] = useState(config.duration);
  const [result, setResult] = useState<ResultState>('idle');
  const [feedback, setFeedback] = useState('先看目标，再做一次明确判断。');
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<GameItem | null>(null);
  const [flipped, setFlipped] = useState<GameItem[]>([]);
  const [flipLocked, setFlipLocked] = useState(false);
  const [record, setRecord] = useState<LearningRecord | null>(null);
  const [levelStep, setLevelStep] = useState(0);
  const [phase, setPhase] = useState<'playing' | 'passed' | 'failed'>('playing');
  const [mistakeCount, setMistakeCount] = useState(0);
  const [started, setStarted] = useState(false);
  const [audioOn, setAudioOn] = useState(true);
  const [showAnswers, setShowAnswers] = useState(false);
  const [practiceKps, setPracticeKps] = useState<string[]>([]);
  const [scoreMoment, setScoreMoment] = useState<ScoreMoment | null>(null);
  const sfxRef = useRef<SfxPool | null>(null);
  const scoreMomentTimerRef = useRef<number | null>(null);
  const answerPeekTimerRef = useRef<number | null>(null);
  const allItems = useMemo(() => config.levels.flatMap((entry) => entry.items), [config.levels]);
  const activeItems = useMemo(() => (
    practiceKps.length ? buildMistakeDrillItems(allItems, practiceKps) : allItems
  ), [allItems, practiceKps]);
  const segments = useMemo(() => (
    config.levels.length > 1 && !practiceKps.length
      ? config.levels.map((entry) => entry.items)
      : splitIntoLevels(config.game_type, activeItems)
  ), [activeItems, config.game_type, config.levels, practiceKps.length]);
  const levelCount = Math.max(1, segments.length);
  const level = config.levels[Math.min(levelStep, config.levels.length - 1)] ?? config.levels[0];
  const items = segments[Math.min(levelStep, levelCount - 1)] ?? activeItems;
  const playItems = useMemo(() => (playType === 'memory-card' ? buildMemoryPairs(items) : items), [playType, items]);
  const segmentTargets = useMemo(() => segments.map((segment) => targetCount(config.game_type, playType === 'memory-card' ? buildMemoryPairs(segment) : segment)), [segments, config.game_type, playType]);
  const levelTarget = segmentTargets[Math.min(levelStep, levelCount - 1)] ?? targetCount(config.game_type, playItems);
  const maxLives = level?.mistake_limit ?? config.mistake_limit ?? DEFAULT_MAX_LIVES;
  const livesLeft = Math.max(0, maxLives - mistakeCount);
  const progress = progressForSegments(config.game_type, segmentTargets, levelStep, doneIds.length, levelTarget);
  const quizItem = items[doneIds.length % Math.max(1, items.length)];
  const quizTargets = useMemo(() => uniqueTargets(items), [items]);
  const answerRows = useMemo(() => buildAnswerRows(config.game_type, items, quizItem), [config.game_type, items, quizItem]);
  const activeAnswerRows = useMemo(() => {
    if (!started || record) return answerRows;
    const activeLabel = selected?.label ?? items.find((item) => !doneIds.includes(item.id))?.label ?? '';
    const scoped = answerRows.filter((row) => row.source === activeLabel);
    return scoped.length ? scoped : answerRows.slice(0, 1);
  }, [answerRows, doneIds, items, record, selected, started]);
  const bestKey = `dgbook-edugame-best:${config.game_id}`;
  const [best, setBest] = useState(0);
  const missionText = level?.goal ?? config.title;
  const professionalVariant = readUiText(config, 'professionalVariant');
  const cardMark = readUiText(config, 'cardMark') || '知识', instructionText = readUiText(config, 'instruction') || '先看目标，再完成本轮判断。';
  const progressPct = Math.round(progress * 100);
  const knowledgeChips = config.knowledge_points.slice(0, 3);
  const guideSteps = readUiList(config, 'onboarding').slice(0, 3);
  const practiceMode: PracticeMode = practiceKps.length ? 'mistake-drill' : 'full';
  const liveEvents = runtimeRef.current?.learningTracker.snapshot().events ?? [];
  const rewardPct = Math.min(100, Math.round(progress * 52 + Math.min(combo, 6) * 8));
  const rewardState = combo >= 4 ? '爆发' : combo >= 2 ? '连击' : started ? '蓄能' : '待命';
  const comboTier = combo >= 6 ? '王牌连击' : combo >= 3 ? '火力加成' : combo >= 1 ? '稳定命中' : '待起步';
  const timePressure = timeLeft <= Math.max(12, Math.round(config.duration * 0.18)) ? 'high' : timeLeft <= Math.max(24, Math.round(config.duration * 0.36)) ? 'mid' : 'safe';
  const riskState = livesLeft <= 1 ? 'danger' : livesLeft <= Math.ceil(maxLives / 2) ? 'watch' : 'safe';
  const badgeGoals = config.reward_rule?.badges?.slice(0, 3) ?? [];
  const badgeGoalCount = record ? Math.min(record.stars, badgeGoals.length) : Math.min(badgeGoals.length, Math.floor(progress * badgeGoals.length) + (combo >= 3 ? 1 : 0));
  const hudSteps = [
    `第 ${Math.min(levelStep + 1, levelCount)}/${levelCount} 关`,
    `目标 ${doneIds.length}/${levelTarget}`,
    `最好 ${best}`,
  ];

  useEffect(() => {
    restart();
    setBest(Number(localStorage.getItem(bestKey) ?? 0));
    return () => {
      if (scoreMomentTimerRef.current) window.clearTimeout(scoreMomentTimerRef.current);
      if (answerPeekTimerRef.current) window.clearTimeout(answerPeekTimerRef.current);
      sfxRef.current?.dispose();
      sfxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestKey, config]);

  useEffect(() => {
    if (record || !started) return;
    const timer = window.setInterval(() => {
      setTimeLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [record, started]);

  useEffect(() => {
    if (started && !record && timeLeft === 0) finish(false);
    // Settlement must run after render so onComplete cannot update the parent
    // from inside a state updater.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, started, timeLeft]);

  useEffect(() => {
    document.body.classList.toggle('dgbook-edugame-active', started && !record);
    return () => document.body.classList.remove('dgbook-edugame-active');
  }, [record, started]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      document.body.classList.toggle('dgbook-edugame-in-view', Boolean(entry?.isIntersecting && entry.intersectionRatio > 0.18));
    }, { threshold: [0, 0.18, 0.6] }); observer.observe(node);
    return () => { observer.disconnect(); document.body.classList.remove('dgbook-edugame-in-view'); };
  }, []);

  if (!template || template.status !== 'ready') {
    return <Placeholder config={config} />;
  }

  function emitLearningRecord(finalRecord: LearningRecord) {
    onComplete?.(finalRecord);
    publishLearningRecord(rootRef.current, finalRecord);
  }

  return (
    <section
      ref={rootRef}
      className="dg-edugame-interactive dg-edugame-pixi"
      data-edugame-runtime="pixi"
      data-edugame-game-type={config.game_type}
      data-edugame-play-type={playType}
      data-edugame-result={result}
      data-edugame-started={started ? 'true' : 'false'}
      data-edugame-phase={phase}
      data-edugame-practice-mode={practiceMode}
      data-edugame-practice-kps={practiceKps.length}
      data-edugame-mistakes={mistakeCount}
      data-edugame-combo={combo}
      data-edugame-record-events={record?.events.length ?? 0}
      data-edugame-live-events={liveEvents.length}
      data-edugame-event-types={liveEvents.map((event) => event.event_type).join(',')}
      data-edugame-pressure={timePressure}
      data-edugame-risk={riskState}
      data-edugame-lives-left={livesLeft}
      data-edugame-lives-max={maxLives}
      data-edugame-audio={audioOn ? 'on' : 'off'}
      data-edugame-game-motion="animated"
      data-edugame-challenge-mode="timed-combo-lives"
      data-edugame-variant={variant}
      style={{ minHeight: Math.min(height, 640) }}
    >
      <header className="eg-topbar">
        <div className="eg-title-copy">
          <span className="eg-eyebrow">{readUiText(config, 'arenaLabel') || '专项训练'}</span>
          <h3>{config.title}</h3>
          {practiceMode === 'mistake-drill' && <em className="eg-mode-badge">薄弱点再练</em>}
          <p>{playLabel} · {comboTier}</p>
          <ol className="eg-hud-route" aria-label="挑战路线">
            {hudSteps.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </div>
        <div className="eg-stats">
          <Stat label="得分" value={score} dataKey="score" />
          <Stat label="连击" value={`x${combo}`} />
          <Stat label="倒计时" value={`${timeLeft}s`} />
          <Stat label="机会" value={`${livesLeft}/${maxLives}`} dataKey="lives" />
          <button
            type="button"
            className="eg-audio-toggle"
            data-edugame-audio-toggle={audioOn ? 'on' : 'off'}
            aria-pressed={audioOn ? 'true' : 'false'}
            onClick={toggleAudio}
          >
            <span className="eg-audio-bars" aria-hidden="true"><i /><i /><i /></span>
            {audioOn ? '音乐开' : '音乐关'}
          </button>
          <button
            type="button"
            className="eg-answer-toggle"
            data-edugame-answer-toggle="true"
            aria-expanded={showAnswers ? 'true' : 'false'}
            onClick={toggleAnswers}
          >
            {started && !record ? '提示' : '正确答案'}
          </button>
          <button
            type="button"
            data-edugame-fullscreen="true"
            aria-label="全屏进行互动练习"
            onClick={() => document.fullscreenElement ? document.exitFullscreen() : rootRef.current?.requestFullscreen()}
          >
            全屏
          </button>
        </div>
      </header>
      <section className="eg-mission" aria-label="关卡目标" data-edugame-guide="true">
        <div className="eg-mission-copy">
          <span>关卡目标</span>
          <strong>{compactText(missionText, 96)}</strong>
          <p>{compactText(instructionText, 96)}</p>
        </div>
        <div className="eg-mission-meter" aria-label={`完成度 ${progressPct}%`}>
          <i style={{ width: `${progressPct}%` }} />
        </div>
        <div className="eg-reward-meter" data-edugame-reward-meter={rewardState} aria-label={`奖励能量 ${rewardPct}%`}>
          <span>奖励能量 · {rewardState}</span>
          <i><b style={{ width: `${rewardPct}%` }} /></i>
        </div>
        <div className="eg-pressure-meter" data-edugame-pressure-meter={riskState} aria-label={`剩余机会 ${livesLeft}/${maxLives}`}>
          <span>失误预算 · {livesLeft}/{maxLives}</span>
          <i>{Array.from({ length: maxLives }, (_, index) => <b key={index} className={index < livesLeft ? 'is-live' : 'is-lost'} />)}</i>
        </div>
        {badgeGoals.length > 0 && (
          <ol className="eg-badge-track" data-edugame-badge-track aria-label="徽章目标">
            {badgeGoals.map((badge, index) => (
              <li key={badge} data-edugame-badge-state={index < badgeGoalCount ? 'unlocked' : 'locked'}>
                <span>{index + 1}</span><strong>{compactText(badge, 10)}</strong>
              </li>
            ))}
          </ol>
        )}
        <StageMilestones progress={progress} doneCount={doneIds.length} targetCount={levelTarget} combo={combo} livesLeft={livesLeft} maxLives={maxLives} levelStep={levelStep} levelCount={levelCount} />
        <div className="eg-mission-radar" aria-hidden="true">
          <i /><i /><i />
        </div>
        {guideSteps.length > 0 && (
          <ol className="eg-guide-steps" aria-label="上手步骤">
            {guideSteps.map((step, index) => <li key={`${index}-${step}`}>{compactText(step, 28)}</li>)}
          </ol>
        )}
        {knowledgeChips.length > 0 && (
          <div className="eg-kp-tags" aria-label="知识点">
            {knowledgeChips.map((point) => <em key={point.id}>{point.name}</em>)}
          </div>
        )}
      </section>
      <section
        className={`eg-answer-panel${showAnswers ? ' is-open' : ''}`}
        data-edugame-answer-panel={showAnswers ? 'open' : 'closed'}
        hidden={!showAnswers}
        aria-label="本关正确答案"
      >
        <header>
          <strong>{started && !record ? '当前提示' : '本关正确答案'}</strong>
          <span>{started && !record ? '只显示当前对象，扣时间并清空连击。' : '用于复盘和纠错；挑战时尽量先独立判断。'}</span>
        </header>
        <ol>
          {activeAnswerRows.map((row) => (
            <li key={`${row.source}-${row.target}`} data-edugame-answer-item>
              <b>{compactText(row.source, 18)}</b>
              <span>{compactText(row.target, 30)}</span>
            </li>
          ))}
        </ol>
      </section>
      <main className="eg-layout eg-layout-arcade" data-edugame-play-area="true">
        <div className="eg-stage-badge" aria-hidden="true">
          <span>{playLabel}</span>
          <strong>{started ? comboTier : '准备挑战'}</strong>
        </div>
        {professionalVariant === 'topology-repair' ? (
          <TopologyRepairArcade items={items} targets={quizTargets} selected={selected} doneIds={doneIds} combo={combo} result={result} active={started && !record} levelStep={levelStep} onSelect={handleSelectItem} onDrop={handleDrop} />
        ) : professionalVariant === 'evidence-chain' ? (
          <EvidenceChainArcade items={items} targets={quizTargets} selected={selected} doneIds={doneIds} combo={combo} result={result} active={started && !record} levelStep={levelStep} onSelect={handleSelectItem} onDrop={handleDrop} />
        ) : professionalVariant === 'beam-tuning' ? (
          <BeamTuningArcade items={items} targets={quizTargets} selected={selected} doneIds={doneIds} combo={combo} result={result} active={started && !record} levelStep={levelStep} onSelect={handleSelectItem} onDrop={handleDrop} />
        ) : professionalVariant === 'coverage-survey' || readUiText(config, 'arenaVariant') === 'coverage-survey' ? (
          <CoverageSurveyArcade items={items} targets={quizTargets} selected={selected} doneIds={doneIds} combo={combo} result={result} active={started && !record} levelStep={levelStep} onSelect={handleSelectItem} onDrop={handleDrop} />
        ) : config.game_type === 'boss-review' ? (
          <BossReviewArcade
            config={config}
            items={items}
            doneIds={doneIds}
            score={score}
            combo={combo}
            progress={progress}
            result={result}
            active={started && !record}
            goal={level?.goal}
            levelStep={levelStep}
            levelCount={levelCount}
            onHit={handleQuickHit}
            onExpire={(item) => applyWrong(item, 'answer_wrong')}
          />
        ) : playType === 'quick-hit' ? (
          <QuickHitArcade
            config={config}
            items={items}
            doneIds={doneIds}
            score={score}
            combo={combo}
            progress={progress}
            result={result}
            active={started && !record}
            goal={level?.goal}
            onHit={handleQuickHit}
            onExpire={(item) => applyWrong(item, 'answer_wrong')}
          />
        ) : playType === 'quiz-rush' ? (
          <QuizRushArcade
            item={quizItem}
            targets={quizTargets}
            doneIds={doneIds}
            levelTarget={levelTarget}
            combo={combo}
            mistakeCount={mistakeCount}
            maxLives={maxLives}
            result={result}
            feedback={feedback}
            goal={level?.goal}
            active={started && !record}
            onGate={(gateId) => handleGate(quizItem, gateId)}
            onTimeout={(item) => applyWrong(item, 'answer_wrong', { chosenTargetLabel: '超时未选择' })}
            onDefeat={() => fail()}
          />
        ) : playType === 'memory-card' ? (
          <MemoryArcade items={playItems} flipped={flipped} doneIds={doneIds} combo={combo} goal={level?.goal} result={result} active={started && !record} cardMark={cardMark} onFlip={handleFlip} />
        ) : playType === 'sort-flow' ? (
          <SortArcade items={items} doneIds={doneIds} combo={combo} goal={level?.goal} result={result} active={started && !record} onPick={handleSort} />
        ) : playType === 'match-3' ? (
          <Match3Arcade
            items={items}
            doneIds={doneIds}
            combo={combo}
            goal={level?.goal}
            result={result}
            targetCount={levelTarget}
            active={started && !record}
            onMatch={(item, ids) => applyCorrect(item, 'match_success', ids)}
            onMiss={(item) => applyWrong(item, 'match_fail')}
            onDefeat={() => fail()}
          />
        ) : config.game_type === 'classification-run' ? (
          <ClassificationRunArcade items={items} targets={quizTargets} selected={selected} doneIds={doneIds} combo={combo} goal={level?.goal} result={result} active={started && !record} onSelect={handleSelectItem} onDrop={handleDrop} onExpire={handleClassificationExpire} />
        ) : config.game_type === 'pipe-connect' ? (
          <PipeConnectArcade items={items} targets={quizTargets} selected={selected} doneIds={doneIds} combo={combo} goal={level?.goal} result={result} active={started && !record} onSelect={handleSelectItem} onDrop={handleDrop} />
        ) : config.game_type === 'maze-troubleshoot' ? (
          <MazeTroubleshootArcade items={items} targets={quizTargets} selected={selected} doneIds={doneIds} combo={combo} goal={level?.goal} result={result} active={started && !record} onSelect={handleSelectItem} onDrop={handleDrop} />
        ) : (
          <DragArcade items={items} targets={quizTargets} selected={selected} doneIds={doneIds} combo={combo} goal={level?.goal} result={result} active={started && !record} onSelect={handleSelectItem} onDrop={handleDrop} />
        )}
      </main>
      {!started && !record && (
        <section className="eg-start-panel" aria-label="开始挑战">
          <span>准备开始</span>
          <strong>{compactText(missionText, 88)}</strong>
          <p>{compactText(instructionText, 96)}</p>
          <button type="button" data-edugame-start="true" data-primary-action={primaryAction ? 'true' : undefined} onClick={beginGame}>{readUiText(config, 'actionLabel') || '开始挑战'}</button>
        </section>
      )}
      <footer className="eg-feedback" data-edugame-feedback={feedback}>
        <strong>{result === 'complete' ? '复盘' : result === 'correct' ? '命中' : result === 'wrong' ? '修正' : '即时反馈'}</strong>
        <span>{feedback}</span>
        <small>最高记录 {best}</small>
      </footer>
      {record && (
        <ReviewCard
          record={record}
          phase={phase}
          best={best}
          onRetry={restart}
          onDrill={() => startMistakeDrill(record)}
          drillCount={record.mistakes.length}
          kpName={(kp) => runtimeRef.current?.knowledgeBinder.labelFor(kp) ?? kp}
          badges={badgeGoals}
          answerRows={answerRows}
        />
      )}
      {started && !record && combo > 1 && (
        <div className="eg-reward-toast" data-edugame-reward-toast>
          连击 x{combo}<small>连续判断正确，奖励加成</small>
        </div>
      )}
      {scoreMoment && (
        <div className={`eg-score-moment is-${scoreMoment.kind}`} data-edugame-score-moment={scoreMoment.kind} aria-live="polite">
          <strong>{scoreMoment.points}</strong><span>{scoreMoment.label}</span>
        </div>
      )}
      {started && !record && result !== 'idle' && (
        <div className={`eg-action-feedback is-${result}`} data-edugame-action-feedback={result} aria-live="polite">
          <i /><i /><strong>{result === 'correct' ? '命中' : result === 'wrong' ? '修正' : '完成'}</strong>
          <span>{result === 'correct' ? `连击 x${Math.max(1, combo)}` : result === 'wrong' ? `剩余 ${livesLeft}/${maxLives}` : '进入复盘'}</span>
        </div>
      )}
      <style>{styles}</style>
    </section>
  );

  function handleQuickHit(item: GameItem) {
    if (!started) return;
    if (doneIds.includes(item.id)) return;
    item.correct ? applyCorrect(item, 'answer_correct') : applyWrong(item, 'answer_wrong');
  }

  function handleGate(item: GameItem | undefined, gateId: string) {
    if (!started) return;
    if (!item) return;
    const chosenTargetLabel = targetLabel(gateId, quizTargets);
    runtimeRef.current?.ruleEngine.matchItem(item, gateId)
      ? applyCorrect(item, 'answer_correct')
      : applyWrong(item, 'answer_wrong', { chosenTargetId: gateId, chosenTargetLabel });
  }

  function handleFlip(item: GameItem) {
    if (!started) return;
    if (flipLocked) return;
    if (doneIds.includes(item.id)) return;
    if (flipped.some((entry) => entry.id === item.id)) return;
    const next = [...flipped, item].slice(-2);
    setFlipped(next);
    if (next.length === 2) {
      setFlipLocked(true);
      runtimeRef.current?.ruleEngine.memoryMatch(next[0]!, next[1]!)
        ? applyCorrect(item, 'match_success', next.map((entry) => entry.id))
        : applyWrong(item, 'match_fail', { chosenTargetLabel: next.map((entry) => entry.label).join(' + ') });
      window.setTimeout(() => {
        setFlipped([]);
        setFlipLocked(false);
      }, 650);
    } else {
      setResult('idle');
      setFeedback(`已翻开「${item.label}」，再找它对应的知识卡。`);
    }
  }

  function handleSelectItem(item: GameItem) {
    if (!started || record) return;
    setSelected(item);
    if (result !== 'complete') setResult('idle');
  }

  function handleClassificationExpire(item: GameItem) {
    if (!started || record) return;
    setSelected(null);
    applyWrong(item, 'drag_fail', { chosenTargetLabel: '超时未分流' });
  }

  function handleDrop(targetId: string) {
    if (!started) return;
    if (!selected) return;
    const matched = targetId === CLASSIFICATION_REJECT_TARGET_ID
      ? selected.correct === false
      : selected.correct !== false && runtimeRef.current?.ruleEngine.matchItem(selected, targetId);
    matched ? applyCorrect(selected, 'drag_success') : applyWrong(selected, 'drag_fail', { chosenTargetId: targetId, chosenTargetLabel: targetLabel(targetId, quizTargets) });
    setSelected(null);
  }

  function toggleAnswers() {
    const next = !showAnswers;
    setShowAnswers(next);
    if (next) {
      if (started && !record) {
        if (answerPeekTimerRef.current) window.clearTimeout(answerPeekTimerRef.current);
        const snapshot = runtimeRef.current?.applyHint({
          level: level?.level_id ?? '',
          playType,
          answerCount: activeAnswerRows.length,
        });
        setScore(snapshot?.score ?? Math.max(0, score - 6));
        setCombo(0);
        setTimeLeft((current) => Math.max(0, current - 10));
        answerPeekTimerRef.current = window.setTimeout(() => {
          setShowAnswers(false);
          answerPeekTimerRef.current = null;
        }, 3200);
        flashScoreMoment('wrong', '提示代价', '-10s');
      }
      setFeedback(started && !record ? '已打开当前对象提示，提示会扣时间并清空连击。' : '已展开本关答案参考；用于复盘和纠错。');
      sfxRef.current?.play('level');
    }
  }

  function toggleAudio() {
    const next = !audioOn;
    setAudioOn(next);
    sfxRef.current?.setMuted(!next);
    if (next && started && !record) {
      sfxRef.current?.startMusic(config.game_type);
      sfxRef.current?.play('level');
    } else {
      sfxRef.current?.stopMusic();
    }
  }

  function handleSort(item: GameItem) {
    if (!started) return;
    if (doneIds.includes(item.id)) return;
    const remaining = items.filter((entry) => !doneIds.includes(entry.id));
    const expectedOrder = Math.min(...remaining.map((entry) => entry.order ?? Number.POSITIVE_INFINITY));
    runtimeRef.current?.ruleEngine.sequenceMatch(item, expectedOrder) ? applyCorrect(item, 'answer_correct') : applyWrong(item, 'answer_wrong');
  }

  function applyCorrect(item: GameItem, event: 'answer_correct' | 'drag_success' | 'match_success', ids = [item.id]) {
    const next = runtimeRef.current?.applyCorrect({ item: item.id, kp: item.kp ?? item.target_id }, event);
    const nextScore = next?.score ?? score;
    const gain = Math.max(1, nextScore - score);
    setScore(nextScore);
    setCombo(next?.combo ?? combo + 1);
    setDoneIds((current) => [...new Set([...current, ...ids])]);
    setResult('correct');
    setFeedback(item.explanation || item.definition || '判断正确，继续保持连击。');
    flashScoreMoment('correct', (next?.combo ?? 0) > 1 ? '连击命中' : '判断命中', `+${gain}`);
    sfxRef.current?.play((next?.combo ?? 0) > 1 ? 'combo' : 'correct');
    const solved = new Set([...doneIds, ...ids]).size;
    if (solved >= levelTarget) {
      if (levelStep + 1 < levelCount) window.setTimeout(() => advanceLevel(), 350);
      else window.setTimeout(() => finish(true), 250);
    }
  }

  function applyWrong(item: GameItem, event: 'answer_wrong' | 'drag_fail' | 'match_fail', context: WrongContext = {}) {
    const expected = expectedTargetLabel(item, quizTargets);
    const reason = wrongFeedback(item, expected, context.chosenTargetLabel);
    const next = runtimeRef.current?.applyWrong({
      item: item.id,
      kp: item.kp ?? item.target_id,
      reason,
      expected,
      chosen: context.chosenTargetLabel ?? context.chosenTargetId ?? '',
    }, event);
    const nextScore = next?.score ?? Math.max(0, score - 6);
    const loss = Math.max(1, score - nextScore);
    setScore(nextScore);
    setCombo(0);
    setMistakeCount(next?.mistake_count ?? mistakeCount + 1);
    setResult('wrong');
    setFeedback(reason);
    flashScoreMoment('wrong', '证据不匹配', `-${loss}`);
    sfxRef.current?.play('wrong');
    if (next?.phase === 'failed') window.setTimeout(() => fail(), 250);
  }

  function advanceLevel() {
    if (answerPeekTimerRef.current) window.clearTimeout(answerPeekTimerRef.current);
    runtimeRef.current?.advanceLevel();
    setLevelStep((step) => step + 1);
    setDoneIds([]);
    setSelected(null);
    setFlipped([]);
    setFlipLocked(false);
    setResult('idle');
    setShowAnswers(false);
    setFeedback(`进入第 ${levelStep + 2}/${levelCount} 关，保持判断节奏。`);
    flashScoreMoment('level', '下一关', 'LEVEL');
    sfxRef.current?.play('level');
  }

  function fail() {
    if (record) return;
    setPhase('failed');
    setResult('complete');
    const finalRecord = runtimeRef.current?.complete(false);
    if (finalRecord) {
      setRecord(finalRecord);
      setScore(finalRecord.score);
      emitLearningRecord(finalRecord);
      localStorage.setItem(bestKey, String(Math.max(best, finalRecord.score)));
      setBest((current) => Math.max(current, finalRecord.score));
    }
    sfxRef.current?.stopMusic();
    setFeedback('失误次数超限，本关失败。复盘错题后点重试。');
    flashScoreMoment('wrong', '本关失败', 'FAIL');
    sfxRef.current?.play('fail');
  }

  function restart() {
    if (answerPeekTimerRef.current) {
      window.clearTimeout(answerPeekTimerRef.current);
      answerPeekTimerRef.current = null;
    }
    runtimeRef.current = new GameRuntime(config);
    if (!sfxRef.current) sfxRef.current = createSfxPool(config.ui?.audio as SfxPoolOptions | undefined);
    sfxRef.current.setMuted(!audioOn);
    sfxRef.current.stopMusic();
    setScore(0);
    setCombo(0);
    setDoneIds([]);
    setSelected(null);
    setFlipped([]);
    setFlipLocked(false);
    setRecord(null);
    setTimeLeft(config.duration);
    setResult('idle');
    setLevelStep(0);
    setMistakeCount(0);
    setPhase('playing');
    setStarted(false);
    setPracticeKps([]);
    setShowAnswers(false);
    setScoreMoment(null);
    setFeedback(readUiText(config, 'instruction') || '完成目标、获得连击，并查看复盘。');
  }

  function beginGame() {
    runtimeRef.current?.start();
    setStarted(true);
    setShowAnswers(false);
    setFeedback('挑战开始：观察目标、快速判断，错误会进入复盘。');
    sfxRef.current?.play('level');
    sfxRef.current?.startMusic(config.game_type);
  }

  function startMistakeDrill(source: LearningRecord) {
    const kps = [...new Set(source.mistakes.map((mistake) => mistake.kp).filter(Boolean))];
    if (!kps.length) {
      restart();
      return;
    }
    if (answerPeekTimerRef.current) {
      window.clearTimeout(answerPeekTimerRef.current);
      answerPeekTimerRef.current = null;
    }
    runtimeRef.current = new GameRuntime(config);
    runtimeRef.current.start();
    runtimeRef.current.learningTracker.record('mistake_drill_start', {
      mode: 'mistake-drill',
      sourceScore: source.score,
      mistakeKps: kps,
      mistakeCount: source.mistakes.length,
    });
    setPracticeKps(kps);
    setShowAnswers(false);
    setScore(0);
    setCombo(0);
    setDoneIds([]);
    setSelected(null);
    setFlipped([]);
    setFlipLocked(false);
    setRecord(null);
    setTimeLeft(config.duration);
    setResult('idle');
    setLevelStep(0);
    setMistakeCount(0);
    setPhase('playing');
    setStarted(true);
    setFeedback(`错题再练：本轮聚焦 ${kps.length} 个薄弱知识点。`);
    sfxRef.current?.play('level');
    sfxRef.current?.startMusic(config.game_type);
  }

  function finish(completed: boolean) {
    if (record) return;
    const finalRecord = runtimeRef.current?.complete(completed);
    if (!finalRecord) return;
    setRecord(finalRecord);
    setScore(finalRecord.score);
    setResult('complete');
    setPhase(finalRecord.completed ? 'passed' : 'failed');
    setShowAnswers(false);
    emitLearningRecord(finalRecord);
    setFeedback(finalRecord.completed ? '本轮完成，查看得分和薄弱点复盘。' : '时间结束，建议复盘错题后重试。');
    flashScoreMoment(finalRecord.completed ? 'finish' : 'wrong', finalRecord.completed ? '挑战完成' : '时间结束', finalRecord.completed ? 'DONE' : 'TIME');
    localStorage.setItem(bestKey, String(Math.max(best, finalRecord.score)));
    setBest(Math.max(best, finalRecord.score));
    sfxRef.current?.stopMusic();
    sfxRef.current?.play('finish');
  }

  function flashScoreMoment(kind: ScoreMoment['kind'], label: string, points: string) {
    if (scoreMomentTimerRef.current) window.clearTimeout(scoreMomentTimerRef.current);
    setScoreMoment({ id: Date.now(), kind, label, points });
    scoreMomentTimerRef.current = window.setTimeout(() => {
      setScoreMoment(null);
      scoreMomentTimerRef.current = null;
    }, 1180);
  }
}

function publishLearningRecord(target: HTMLElement | null, record: LearningRecord): void {
  const detail = { gameId: record.game_id, lessonId: record.lesson_id, record };
  if (target) {
    target.dispatchEvent(new CustomEvent('dgbook:edugame-complete', { detail, bubbles: true, composed: true }));
    return;
  }
  window.dispatchEvent(new CustomEvent('dgbook:edugame-complete', { detail }));
}

function Placeholder({ config }: { config: GameConfig }) {
  const templates = listTemplates();
  return <section className="dg-edugame-interactive dg-edugame-pixi eg-placeholder"><h3>{config.title}</h3><p>该玩法正在完善中，当前教材页不会挂载未完成玩法。</p><small>已注册 {templates.length} 类玩法。</small></section>;
}

function Stat({ label, value, dataKey }: { label: string; value: string | number; dataKey?: string }) {
  const props = dataKey ? { [`data-edugame-${dataKey}`]: value } : {};
  return <div className="eg-stat" {...props}><span>{label}</span><strong>{value}</strong></div>;
}

function buildMemoryPairs(items: GameItem[]): GameItem[] {
  return avoidAdjacentMemoryPairs(items.flatMap((item) => [
    { ...item, id: `${item.id}:term`, label: item.label, target_id: item.target_id || item.id },
    {
      ...item,
      id: `${item.id}:meaning`,
      label: item.definition || item.explanation || item.prompt || item.label,
      target_id: item.target_id || item.id,
    },
  ]).sort((a, b) => memoryDeckRank(a) - memoryDeckRank(b)));
}

function memoryDeckRank(card: GameItem): number {
  const seed = [...card.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const kindOffset = card.id.endsWith(':meaning') ? 17 : 5;
  return (seed * 23 + kindOffset) % 997;
}

function avoidAdjacentMemoryPairs(cards: GameItem[]): GameItem[] {
  const deck = [...cards];
  for (let index = 1; index < deck.length; index += 1) {
    if (deck[index - 1]?.target_id !== deck[index]?.target_id) continue;
    const swapIndex = deck.findIndex((card, candidate) => (
      candidate > index
      && card.target_id !== deck[index - 1]?.target_id
      && card.target_id !== deck[index + 1]?.target_id
    ));
    if (swapIndex > index) {
      [deck[index], deck[swapIndex]] = [deck[swapIndex]!, deck[index]!];
    }
  }
  return deck;
}

function buildMistakeDrillItems(items: GameItem[], kps: string[]): GameItem[] {
  const kpSet = new Set(kps);
  const matched = items.filter((item) => (
    kpSet.has(item.kp ?? '') || kpSet.has(item.target_id ?? '') || kpSet.has(item.id)
  ));
  if (!matched.length) return items;
  const ids = new Set(matched.map((item) => item.id));
  const minCount = Math.min(items.length, Math.max(3, matched.length));
  const filled = [...matched];
  for (const item of items) {
    if (filled.length >= minCount) break;
    if (!ids.has(item.id)) {
      ids.add(item.id);
      filled.push(item);
    }
  }
  return filled;
}

function readUiText(config: GameConfig, key: string): string {
  const value = config.ui?.[key];
  return typeof value === 'string' ? value : '';
}

function readUiList(config: GameConfig, key: string): string[] {
  const value = config.ui?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : [];
}

function gameTypeLabel(type: GameType): string {
  const labels: Partial<Record<GameType, string>> = {
    'quick-hit': '知识快打',
    'quiz-rush': '限时冲刺',
    'memory-card': '记忆翻牌',
    'drag-match': '证据配对',
    'sort-flow': '流程排序',
    'card-battle': '卡牌闯关',
    'boss-review': '综合复盘',
    'match-3': '分类连消',
    'pipe-connect': '管线连接',
    'maze-troubleshoot': '迷宫排障',
    'classification-run': '分类跑酷',
  };
  return labels[type] ?? '互动练习';
}

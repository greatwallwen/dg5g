'use client';

import { useEffect, useState } from 'react';
import { publicActivityFromPractice } from '../learning-activities/activity-definition.ts';
import { ActivityWorkbench } from '../learning-activities/activity-workbench.tsx';
import { practiceCardClassName } from '../learning-activities/practice-card-state.ts';
import { Icon } from '../../ui/foundation/icons.tsx';
import type { SelfStudyDocument, SelfStudyPractice } from './self-study-types.ts';

type PracticeLevel = 'foundation' | 'application' | 'transfer';
type PracticeRow = { level: PracticeLevel; levelLabel: string; practice: SelfStudyPractice };

export function PracticeSection({ document, passedIds, onPass, focusedActivityId }: {
  document: SelfStudyDocument;
  passedIds: string[];
  onPass: (practiceId: string) => void;
  focusedActivityId?: string;
}) {
  const rows = practiceRowsFor(document);
  const levels = (['foundation', 'application', 'transfer'] as const).filter((level) => (
    rows.some((row) => row.level === level)
  ));
  const focusedLevel = rows.find(({ practice }) => practice.id === focusedActivityId)?.level;
  const [activeLevel, setActiveLevel] = useState<PracticeLevel>(focusedLevel ?? levels[0] ?? 'foundation');

  useEffect(() => {
    if (focusedLevel) setActiveLevel(focusedLevel);
  }, [focusedLevel]);

  return (
    <div className="self-study-practice-layout">
      <header><span>分层练习</span><h2 id={`${document.nodeId}-practice-title`}>先做必做题，再按需要进阶</h2><p>必做题用于保存本节点记录；选做和挑战题可随时练习，不影响继续学习。</p></header>
      {levels.length > 1 ? (
        <nav aria-label="练习难度" className="self-study-practice-level-tabs" role="tablist">
          {levels.map((level) => {
            const levelRows = rows.filter((row) => row.level === level);
            const passedCount = levelRows.filter(({ practice }) => passedIds.includes(practice.id)).length;
            return (
              <button
                aria-selected={activeLevel === level}
                data-practice-level-tab={level}
                key={level}
                onClick={() => setActiveLevel(level)}
                role="tab"
                type="button"
              >
                <strong>{levelName(level)}</strong><small>{passedCount}/{levelRows.length}</small>
              </button>
            );
          })}
        </nav>
      ) : null}
      <div className="self-study-practice-level-panels">
        {levels.map((level) => (
          <section data-practice-level-panel={level} hidden={activeLevel !== level} key={level} role="tabpanel">
            {rows.filter((row) => row.level === level).map(({ levelLabel, practice }) => {
              const activity = publicActivityFromPractice(practice, document.nodeId);
              return activity ? (
                <ActivityWorkbench
                  activity={activity}
                  focused={focusedActivityId === practice.id}
                  key={practice.id}
                  level={level}
                  levelLabel={levelLabel}
                  onPass={() => onPass(practice.id)}
                  passed={passedIds.includes(practice.id)}
                />
              ) : (
                <WrittenPracticeCard
                  focused={focusedActivityId === practice.id}
                  key={practice.id}
                  level={level}
                  levelLabel={levelLabel}
                  onPass={() => onPass(practice.id)}
                  passed={passedIds.includes(practice.id)}
                  practice={practice}
                />
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}

function WrittenPracticeCard({ level, levelLabel, practice, passed, onPass, focused }: {
  level: PracticeLevel;
  levelLabel: string;
  practice: SelfStudyPractice;
  passed: boolean;
  onPass: () => void;
  focused: boolean;
}) {
  const [answer, setAnswer] = useState<'idle' | 'wrong' | 'correct'>(passed ? 'correct' : 'idle');
  const [response, setResponse] = useState('');
  useEffect(() => {
    if (passed) setAnswer('correct');
  }, [passed]);

  const correctChoice = `先核对材料，再按要求形成判断：${practice.expectedEvidence.join('；')}`;
  const choices = [
    '只记录一个结论，不说明材料中的证据、边界和后续动作。',
    correctChoice,
    '跳过材料核对，直接把当前能力节点标记为完成。',
  ];

  function submitResponse() {
    const correct = response === correctChoice;
    setAnswer(correct ? 'correct' : 'wrong');
    if (correct) onPass();
  }

  return (
    <article
      className={practiceCardClassName(answer)}
      data-activity-id={practice.id}
      data-practice-level={level}
      data-remediation-focus={focused || undefined}
    >
      <header><span>{levelLabel}</span><strong>{practice.prompt}</strong></header>
      <div className="self-study-practice-options">
        <fieldset className="activity-choice-field" data-written-practice-choice={practice.id}>
          <legend>选择最完整的岗位处理方式</legend>
          <div>
            {choices.map((choice, index) => (
              <button
                aria-pressed={response === choice}
                data-choice-option={`written-${index + 1}`}
                key={choice}
                onClick={() => setResponse(choice)}
                type="button"
              >
                <span>{String.fromCharCode(65 + index)}</span>
                {choice}
              </button>
            ))}
          </div>
        </fieldset>
        <button disabled={!response} onClick={submitResponse} type="button">提交答案</button>
      </div>
      <div className="self-study-practice-feedback" hidden={answer === 'idle'} role="status">
        <span>{answer === 'correct' ? '判断通过' : '错误反馈'}</span>
        <p>{practice.feedback}</p>
        <strong>{answer === 'correct' ? '应具备的证据' : '改正路径'}</strong>
        <ul>{(answer === 'correct' ? practice.expectedEvidence : practice.correctionPath).map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
      <button
        className="self-study-retry"
        data-self-study-retry={practice.id}
        disabled={!practice.retryable || answer === 'idle'}
        onClick={() => { setAnswer('idle'); setResponse(''); }}
        type="button"
      >
        <Icon name="arrow" size={14} />重新作答
      </button>
      <small>作答后显示错误反馈与改正路径。</small>
    </article>
  );
}

export function practiceIdsFor(document: SelfStudyDocument): string[] {
  return practiceRowsFor(document).map(({ practice }) => practice.id);
}

export function requiredPracticeIdsFor(document: SelfStudyDocument): string[] {
  return practiceRowsFor(document)
    .filter(({ level }) => level === 'foundation')
    .map(({ practice }) => practice.id);
}

function levelName(level: PracticeLevel): string {
  if (level === 'foundation') return '必做';
  if (level === 'application') return '选做';
  return '挑战';
}

function practiceRowsFor(document: SelfStudyDocument): PracticeRow[] {
  const { content } = document;
  if (content.kind === 'standard') {
    return content.microPractice.map((practice) => ({ level: 'foundation', levelLabel: '节点微练习', practice }));
  }
  return [
    ...content.practices.foundation.map((practice) => ({ level: 'foundation' as const, levelLabel: '必做练习', practice })),
    ...content.practices.application.map((practice) => ({ level: 'application' as const, levelLabel: '选做练习', practice })),
    ...content.practices.transfer.map((practice) => ({ level: 'transfer' as const, levelLabel: '挑战练习', practice })),
  ];
}

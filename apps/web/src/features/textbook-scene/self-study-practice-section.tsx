'use client';

import { useEffect, useState } from 'react';
import { publicActivityFromPractice } from '../learning-activities/activity-definition.ts';
import { ActivityWorkbench } from '../learning-activities/activity-workbench.tsx';
import { practiceCardClassName } from '../learning-activities/practice-card-state.ts';
import { Icon } from '../../ui/foundation/icons.tsx';
import type { SelfStudyDocument, SelfStudyPractice } from './self-study-types.ts';

type PracticeLevel = 'foundation' | 'application' | 'transfer';
type PracticeRow = { level: PracticeLevel; levelLabel: string; practice: SelfStudyPractice };

export function PracticeSection({ document, passedIds, onPass }: {
  document: SelfStudyDocument;
  passedIds: string[];
  onPass: (practiceId: string) => void;
}) {
  return (
    <div className="self-study-practice-layout">
      <header><span>分层练习</span><h2 id={`${document.nodeId}-practice-title`}>从基础判断到迁移应用</h2><p>每题都提供即时反馈、改正路径与重新作答。</p></header>
      <div>
        {practiceRowsFor(document).map(({ level, levelLabel, practice }) => {
          const activity = publicActivityFromPractice(practice, document.nodeId);
          return activity ? (
            <ActivityWorkbench
              activity={activity}
              key={practice.id}
              level={level}
              levelLabel={levelLabel}
              onPass={() => onPass(practice.id)}
              passed={passedIds.includes(practice.id)}
            />
          ) : (
            <WrittenPracticeCard
              key={practice.id}
              level={level}
              levelLabel={levelLabel}
              onPass={() => onPass(practice.id)}
              passed={passedIds.includes(practice.id)}
              practice={practice}
            />
          );
        })}
      </div>
    </div>
  );
}

function WrittenPracticeCard({ level, levelLabel, practice, passed, onPass }: {
  level: PracticeLevel;
  levelLabel: string;
  practice: SelfStudyPractice;
  passed: boolean;
  onPass: () => void;
}) {
  const [answer, setAnswer] = useState<'idle' | 'wrong' | 'correct'>(passed ? 'correct' : 'idle');
  const [response, setResponse] = useState('');
  useEffect(() => {
    if (passed) setAnswer('correct');
  }, [passed]);

  function answerCorrectly() {
    setAnswer('correct');
    onPass();
  }

  return (
    <article className={practiceCardClassName(answer)} data-practice-level={level}>
      <header><span>{levelLabel}</span><strong>{practice.prompt}</strong></header>
      <div className="self-study-practice-options">
        <label>
          <span>岗位作答记录</span>
          <textarea onChange={(event) => setResponse(event.target.value)} value={response} />
        </label>
        <button disabled={!response.trim()} onClick={answerCorrectly} type="button">提交练习记录</button>
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

function practiceRowsFor(document: SelfStudyDocument): PracticeRow[] {
  const { content } = document;
  if (content.kind === 'standard') {
    return content.microPractice.map((practice) => ({ level: 'foundation', levelLabel: '节点微练习', practice }));
  }
  return [
    ...content.practices.foundation.map((practice) => ({ level: 'foundation' as const, levelLabel: '基础练习', practice })),
    ...content.practices.application.map((practice) => ({ level: 'application' as const, levelLabel: '应用练习', practice })),
    ...content.practices.transfer.map((practice) => ({ level: 'transfer' as const, levelLabel: '迁移练习', practice })),
  ];
}

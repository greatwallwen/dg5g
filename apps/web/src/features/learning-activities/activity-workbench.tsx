'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  ActivityAttemptResult,
  ActivityPublicDto,
} from './activity-definition.ts';
import { ActivityControl } from './activity-controls.tsx';
import {
  activityPracticeCardState,
  practiceCardClassName,
} from './practice-card-state.ts';

export function ActivityWorkbench({ activity, level, levelLabel, passed, onPass, focused = false }: {
  activity: ActivityPublicDto;
  level: 'foundation' | 'application' | 'transfer';
  levelLabel: string;
  passed: boolean;
  onPass: () => void;
  focused?: boolean;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [attemptId, setAttemptId] = useState('');
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<ActivityAttemptResult | null>(null);
  const [requestError, setRequestError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues({});
    setOrder([]);
    setAttemptId('');
    setVersion(0);
    setResult(null);
    setRequestError('');
  }, [activity.id]);

  useEffect(() => {
    if (focused) cardRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [focused]);

  async function submitAttempt() {
    setSaving(true);
    setRequestError('');
    const currentAttemptId = attemptId || createAttemptId(activity.id);
    if (!attemptId) setAttemptId(currentAttemptId);
    try {
      const response = await fetch(`/api/learning/activities/${encodeURIComponent(activity.id)}/attempts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          attemptId: currentAttemptId,
          response: responseFor(activity, values, order),
          expectedVersion: version,
        }),
      });
      const payload = await response.json() as ActivityAttemptResult | { error?: string };
      if (!response.ok || !('version' in payload)) {
        throw new Error('error' in payload && payload.error ? payload.error : '练习提交失败，请稍后重试。');
      }
      setResult(payload);
      setVersion(payload.version);
      if (payload.passed) onPass();
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : '练习提交失败，请稍后重试。');
    } finally {
      setSaving(false);
    }
  }

  function retry() {
    setValues({});
    setOrder([]);
    setResult(null);
    setRequestError('');
  }

  return (
    <article
      className={`${practiceCardClassName(activityPracticeCardState({ persistedPassed: passed, result }))}${activityOwnsMaterials(activity) ? ' is-wide-activity' : ''}`}
      data-activity-id={activity.id}
      data-activity-kind={activity.kind}
      data-practice-level={level}
      data-remediation-focus={focused || undefined}
      ref={cardRef}
    >
      <header><span>{levelLabel}</span><strong>{activity.prompt}</strong></header>
      {!activityOwnsMaterials(activity) ? <div className="activity-materials">
        {activity.materials.map((material) => (
          <section data-activity-material={material.id} key={material.id}>
            <strong>{material.label}</strong><p>{material.detail}</p>
          </section>
        ))}
      </div> : null}
      <ActivityControl activity={activity} onOrderChange={setOrder} onValueChange={(key, value) => (
        setValues((current) => ({ ...current, [key]: value }))
      )} order={order} values={values} />
      <button className="activity-submit" disabled={saving} onClick={submitAttempt} type="button">
        {saving ? '正在检查' : '提交练习'}
      </button>
      <div className="self-study-practice-feedback" hidden={!result && !requestError} role="status">
        <span>{result?.passed ? '判断通过' : '错误反馈'}</span>
        <p>{requestError || result?.feedback || '请根据材料完成作答。'}</p>
        {!result?.passed && result?.correctionPath.length ? (
          <><strong>改正路径</strong><ul>{result.correctionPath.map((item) => <li key={item}>{item}</li>)}</ul></>
        ) : null}
      </div>
      <button
        className="self-study-retry"
        data-self-study-retry={activity.id}
        disabled={!activity.retryable || (!result && !requestError)}
        onClick={retry}
        type="button"
      >
        重新作答
      </button>
      <small>提交后会给出提示；本题记录会整理到学习档案：{studentFacingTransferTarget(activity.transferTarget)}</small>
    </article>
  );
}

function activityOwnsMaterials(activity: ActivityPublicDto): boolean {
  return activity.id === 'P1T1-N02-foundation-01'
    || activity.id === 'P1T1-N02-application-01'
    || activity.id === 'P1T1-N02-transfer-01';
}

function studentFacingTransferTarget(value: string): string {
  return value
    .replaceAll('汇入', '整理到')
    .replaceAll('专业成果', '证据表')
    .replaceAll('成果表', '证据表')
    .replaceAll('成果记录', '证据记录')
    .replaceAll('形成可直接', '整理成可')
    .replaceAll('生成可', '整理出可');
}

function responseFor(
  activity: ActivityPublicDto,
  values: Record<string, string>,
  order: string[],
): Record<string, unknown> {
  switch (activity.kind) {
    case 'scope-classification':
    case 'evidence-classification':
      return { assignments: values };
    case 'link-reconstruction':
      return { order };
    case 'structured-record':
      return { fields: values };
    case 'four-state-judgement':
      return { states: values };
    case 'defective-sheet-revision':
      return { revisions: values };
  }
}

function createAttemptId(activityId: string): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${activityId}:${suffix}`;
}

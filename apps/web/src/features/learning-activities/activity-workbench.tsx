'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  ActivityAttemptResult,
  ActivityProgressDto,
  ActivityPublicDto,
} from './activity-definition.ts';
import type { ActivityDeliveryContext } from './activity-delivery-context.ts';
import { ActivityControl } from './activity-controls.tsx';
import {
  activityPracticeCardState,
  practiceCardClassName,
} from './practice-card-state.ts';

export function ActivityWorkbench({
  activity,
  level,
  levelLabel,
  passed,
  onPass,
  onAttempt,
  delivery = selfStudyDelivery,
  focused = false,
  primaryAction = false,
}: {
  activity: ActivityPublicDto;
  level: 'foundation' | 'application' | 'transfer';
  levelLabel: string;
  passed: boolean;
  onPass: () => void;
  onAttempt?: (result: ActivityAttemptResult) => void;
  delivery?: ActivityDeliveryContext;
  focused?: boolean;
  primaryAction?: boolean;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [persistedPassed, setPersistedPassed] = useState(passed);
  const [attemptCount, setAttemptCount] = useState(0);
  const [result, setResult] = useState<ActivityAttemptResult | null>(null);
  const [requestError, setRequestError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValues({});
    setOrder([]);
    setPersistedPassed(passed);
    setAttemptCount(0);
    setResult(null);
    setRequestError('');
    let current = true;
    if (!shouldLoadActivityProgress(delivery)) return () => { current = false; };
    void fetch(`/api/learning/activities/${encodeURIComponent(activity.id)}/attempts`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
    }).then(async (response) => {
      if (!response.ok) return;
      const progress = await response.json() as ActivityProgressDto;
      if (!current || progress.canonicalActivityId !== activity.id) return;
      setPersistedPassed(progress.passed);
      setAttemptCount(progress.attemptCount);
      setResult(progress.lastAttempt ?? null);
      if (progress.passed) onPass();
    }).catch(() => undefined);
    return () => { current = false; };
  }, [activity.id, delivery.channel, passed]);

  useEffect(() => {
    if (focused) cardRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
  }, [focused]);

  async function submitAttempt() {
    setSaving(true);
    setRequestError('');
    const currentAttemptId = createAttemptId(activity.id);
    try {
      const response = await fetch(`/api/learning/activities/${encodeURIComponent(activity.id)}/attempts`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          attemptId: currentAttemptId,
          response: responseFor(activity, values, order),
          delivery,
        }),
      });
      const payload = await response.json() as ActivityAttemptResult | { error?: string };
      if (!response.ok || !('attemptId' in payload)) {
        throw new Error('error' in payload && payload.error ? payload.error : '练习提交失败，请稍后重试。');
      }
      setResult(payload);
      setAttemptCount(payload.attemptNumber);
      setPersistedPassed((current) => current || payload.passed);
      onAttempt?.(payload);
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
      className={practiceCardClassName(activityPracticeCardState({ persistedPassed, result }))}
      data-activity-attempt-count={attemptCount}
      data-activity-id={activity.id}
      data-activity-kind={activity.kind}
      data-practice-level={level}
      data-remediation-focus={focused || undefined}
      ref={cardRef}
    >
      <header><span>{levelLabel}</span><strong>{activity.prompt}</strong></header>
      <div className="activity-materials">
        {activity.materials.map((material) => (
          <section data-activity-material={material.id} key={material.id}>
            <strong>{material.label}</strong><p>{material.detail}</p>
          </section>
        ))}
      </div>
      <ActivityControl activity={activity} onOrderChange={setOrder} onValueChange={(key, value) => (
        setValues((current) => ({ ...current, [key]: value }))
      )} order={order} values={values} />
      <button className="activity-submit" data-primary-action={primaryAction || undefined} disabled={saving} onClick={submitAttempt} type="button">
        {saving ? '正在评估' : '提交岗位作答'}
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
      <small>服务端按本活动规则评估，作答记录可汇入：{activity.transferTarget}</small>
    </article>
  );
}

const selfStudyDelivery: ActivityDeliveryContext = { channel: 'self-study' };

export function shouldLoadActivityProgress(delivery: ActivityDeliveryContext): boolean {
  return delivery.channel === 'self-study';
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
      return activity.interaction.type === 'candidate-link-review'
        ? { review: values }
        : { order };
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

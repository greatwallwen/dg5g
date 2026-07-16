'use client';

import { useEffect, useState } from 'react';
import type {
  ActivityAttemptResult,
  ActivityDefinition,
} from './activity-definition.ts';

export function ActivityWorkbench({ activity, level, levelLabel, passed, onPass }: {
  activity: ActivityDefinition;
  level: 'foundation' | 'application' | 'transfer';
  levelLabel: string;
  passed: boolean;
  onPass: () => void;
}) {
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
      className={`self-study-practice-card is-${result?.passed || passed ? 'correct' : result ? 'wrong' : 'idle'}`}
      data-activity-kind={activity.kind}
      data-practice-level={level}
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
      <button disabled={saving} onClick={submitAttempt} type="button">
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

function ActivityControl({ activity, values, order, onValueChange, onOrderChange }: {
  activity: ActivityDefinition;
  values: Record<string, string>;
  order: string[];
  onValueChange: (key: string, value: string) => void;
  onOrderChange: (value: string[]) => void;
}) {
  if (activity.kind === 'link-reconstruction') {
    return (
      <div className="activity-sequence-builder">
        <ol>{order.map((id) => <li key={id}>{activity.materials.find((item) => item.id === id)?.label}</li>)}</ol>
        <div>{activity.materials.map((material) => (
          <button
            disabled={order.includes(material.id)}
            key={material.id}
            onClick={() => onOrderChange([...order, material.id])}
            type="button"
          >
            加入下一步：{material.label}
          </button>
        ))}</div>
      </div>
    );
  }

  if (activity.kind === 'structured-record' || activity.kind === 'defective-sheet-revision') {
    return (
      <div className="activity-record-form">
        {(activity.interaction.fields ?? []).map((field) => (
          <label key={field.id}>
            <span>{field.label}</span>
            <input
              onChange={(event) => onValueChange(field.id, event.target.value)}
              placeholder={field.placeholder}
              type="text"
              value={values[field.id] ?? ''}
            />
          </label>
        ))}
      </div>
    );
  }

  const valueName = activity.kind === 'four-state-judgement' ? '状态' : '分类';
  return (
    <div className="activity-classification-board">
      {activity.materials.map((material) => (
        <label key={material.id}>
          <span>{material.label}</span>
          <select onChange={(event) => onValueChange(material.id, event.target.value)} value={values[material.id] ?? ''}>
            <option value="">选择{valueName}</option>
            {(activity.interaction.categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>{category.label}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function responseFor(
  activity: ActivityDefinition,
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

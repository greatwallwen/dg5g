'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  certificationBlockers,
  OutputReviewCertification,
} from './output-review-certification';
import { formatOutputFieldValue, OutputReviewDetail } from './output-review-detail';
import type { QueueResponse, ReviewField, ReviewQueueItem } from './output-review-types';

export { certificationBlockers } from './output-review-certification';
export { formatOutputFieldValue } from './output-review-detail';

export function OutputReviewPanel() {
  const [outputs, setOutputs] = useState<ReviewQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [annotations, setAnnotations] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<'return' | 'verify' | null>(null);
  const [message, setMessage] = useState('');
  const selected = useMemo(
    () => outputs.find((output) => output.outputId === selectedId) ?? outputs[0],
    [outputs, selectedId],
  );
  const currentVersion = selected?.detail.versions.find(({ isCurrent }) => isCurrent);
  const currentFields: ReviewField[] = selected ? currentVersion?.fields ?? selected.fieldSchema.map(
    ({ key, label }) => ({
      key, label, value: formatOutputFieldValue(selected.fields[key]),
      displayValue: formatOutputFieldValue(selected.fields[key]),
      evidence: [], sources: [], annotations: [], unknownField: false,
    }),
  ) : [];
  const rubricScores = selected ? Object.fromEntries(
    selected.rubric.map(({ key }) => [key, scores[key] ?? 0]),
  ) : {};
  const totalScore = Object.values(rubricScores).reduce((sum, score) => sum + score, 0);
  const blockers = selected ? certificationBlockers({
    rubric: selected.rubric, scores, assessment: selected.detail.assessment,
  }) : [];
  const reviewAnnotations = Object.fromEntries(Object.entries(annotations)
    .flatMap(([key, value]) => value.trim() ? [[key, value.trim()]] : []));

  async function loadQueue() {
    setLoading(true);
    try {
      const response = await fetch('/api/teacher/outputs', { cache: 'no-store' });
      const body = await response.json() as QueueResponse;
      if (!response.ok) throw new Error(body.error ?? '读取批阅队列失败');
      setOutputs(body.outputs);
      setSelectedId((current) => body.outputs.some((item) => item.outputId === current)
        ? current : (body.outputs[0]?.outputId ?? ''));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '读取批阅队列失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadQueue(); }, []);

  function chooseOutput(outputId: string) {
    setSelectedId(outputId);
    setScores({});
    setAnnotations({});
    setFeedback('');
    setMessage('');
  }

  function updateScore(key: string, rawValue: string) {
    setScores((current) => {
      if (!rawValue.trim()) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: Number(rawValue) };
    });
  }

  async function submitReview(action: 'return' | 'verify') {
    if (!selected) return;
    if (action === 'return' && feedback.trim().length < 8) {
      setMessage('退回意见至少 8 个字符，并应指出证据问题与改正动作。');
      return;
    }
    if (action === 'verify' && blockers.length > 0) {
      setMessage(blockers.join(' '));
      return;
    }
    setSubmitting(action);
    setMessage('');
    try {
      const response = await fetch(`/api/teacher/outputs/${selected.outputId}/reviews`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          expectedStateRevision: selected.stateRevision,
          expectedOutputVersion: selected.currentVersion,
          action,
          ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
          ...(Object.keys(reviewAnnotations).length > 0 ? { annotations: reviewAnnotations } : {}),
          ...(action === 'verify' ? { rubricScores } : {}),
        }),
      });
      const body = await response.json() as { error?: string; frozenTaskScore?: { officialScore: number } };
      if (!response.ok) throw new Error(body.error ?? '批阅提交失败');
      setMessage(action === 'return'
        ? '已退回修订，字段批注和改正意见已进入学生成果版本链。'
        : `已完成教师认证，任务综合分冻结为 ${body.frozenTaskScore!.officialScore} 分。`);
      setScores({});
      setAnnotations({});
      setFeedback('');
      await loadQueue();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '批阅提交失败');
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <section className="teacher-review-panel output-review-panel" data-output-review-panel>
      <header><span>专业成果复核台</span><strong>{loading ? '正在同步…' : `${outputs.length} 份待复核`}</strong></header>
      {outputs.length > 0 ? (
        <nav aria-label="待批阅产出" className="output-review-queue">
          {outputs.map((output) => (
            <button aria-pressed={selected?.outputId === output.outputId}
              data-review-output-id={output.outputId} key={output.outputId}
              onClick={() => chooseOutput(output.outputId)} type="button">
              <strong>{output.studentName}</strong>
              <span>{output.taskId} · {output.nodeId}</span>
              <small>V{output.currentVersion} · {output.detail.statusLabel}</small>
            </button>
          ))}
        </nav>
      ) : !loading ? <p><b>队列状态</b>当前没有待批阅产出</p> : null}
      {selected ? (
        <>
          <OutputReviewDetail annotations={annotations} fields={currentFields}
            onAnnotationChange={(key, value) => setAnnotations((current) => ({ ...current, [key]: value }))}
            selected={selected} />
          <OutputReviewCertification blockers={blockers} feedback={feedback}
            onFeedbackChange={setFeedback} onScoreChange={updateScore}
            onSubmit={(action) => void submitReview(action)} scores={scores}
            selected={selected} submitting={submitting} totalScore={totalScore} />
        </>
      ) : null}
      {message ? <p aria-live="polite" className="output-review-message"><b>处理结果</b>{message}</p> : null}
    </section>
  );
}

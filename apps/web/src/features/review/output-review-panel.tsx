'use client';

import { useEffect, useMemo, useState } from 'react';

type OutputFieldValue = string | number | string[];

interface ReviewQueueItem {
  outputId: string;
  studentId: string;
  studentName: string;
  taskId: 'P01' | 'P02' | 'P03';
  nodeId: string;
  status: 'submitted';
  currentVersion: number;
  stateRevision: number;
  fields: Record<string, OutputFieldValue>;
  fieldSchema: Array<{ key: string; label: string }>;
  rubric: Array<{ key: string; label: string; maxScore: number }>;
}

interface QueueResponse {
  outputs: ReviewQueueItem[];
  error?: string;
}

export function OutputReviewPanel() {
  const [outputs, setOutputs] = useState<ReviewQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<'return' | 'verify' | null>(null);
  const [message, setMessage] = useState('');

  const selected = useMemo(
    () => outputs.find((output) => output.outputId === selectedId) ?? outputs[0],
    [outputs, selectedId],
  );
  const rubricScores = Object.fromEntries(
    (selected?.rubric ?? []).map(({ key }) => [key, scores[key] ?? 0]),
  );
  const totalScore = Object.values(rubricScores).reduce((sum, score) => sum + score, 0);

  async function loadQueue() {
    setLoading(true);
    try {
      const response = await fetch('/api/teacher/outputs', { cache: 'no-store' });
      const body = await response.json() as QueueResponse;
      if (!response.ok) throw new Error(body.error ?? '读取批阅队列失败');
      setOutputs(body.outputs);
      setSelectedId((current) => body.outputs.some((item) => item.outputId === current)
        ? current
        : (body.outputs[0]?.outputId ?? ''));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '读取批阅队列失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue();
  }, []);

  function chooseOutput(outputId: string) {
    setSelectedId(outputId);
    setScores({});
    setFeedback('');
    setMessage('');
  }

  async function submitReview(action: 'return' | 'verify') {
    if (!selected) return;
    if (action === 'return' && !feedback.trim()) {
      setMessage('退回修订时必须填写具体改正意见。');
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
          action,
          ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
          ...(action === 'verify' ? { rubricScores } : {}),
        }),
      });
      const body = await response.json() as {
        error?: string;
        frozenTaskScore?: { officialScore: number };
      };
      if (!response.ok) throw new Error(body.error ?? '批阅提交失败');
      const frozenScore = body.frozenTaskScore?.officialScore;
      setMessage(action === 'return'
        ? '已退回修订，学生将看到本次反馈。'
        : frozenScore === undefined
          ? '已完成教师认证；缺少节点测试成绩，暂不冻结任务综合分。'
          : `已完成教师认证，任务综合分冻结为 ${frozenScore} 分。`);
      setScores({});
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
      <header>
        <span>待批阅专业产出</span>
        <strong>{loading ? '正在同步…' : `${outputs.length} 份已提交产出`}</strong>
      </header>
      {outputs.length > 0 ? (
        <nav aria-label="待批阅产出" className="output-review-queue">
          {outputs.map((output) => (
            <button
              aria-pressed={selected?.outputId === output.outputId}
              data-review-output-id={output.outputId}
              key={output.outputId}
              onClick={() => chooseOutput(output.outputId)}
              type="button"
            >
              <strong>{output.studentName}</strong>
              <span>{output.taskId} · {output.nodeId}</span>
              <small>第 {output.currentVersion} 版</small>
            </button>
          ))}
        </nav>
      ) : !loading ? <p><b>队列状态</b>当前没有待批阅产出</p> : null}
      {selected ? (
        <>
          <p><b>当前产出</b>{selected.studentName} · {selected.taskId} · 版本 {selected.currentVersion}</p>
          <div className="output-review-fields">
            {selected.fieldSchema.map(({ key, label }) => (
              <p key={key}><b>{label}</b><span>{formatValue(selected.fields[key])}</span></p>
            ))}
          </div>
          <fieldset className="output-review-rubric">
            <legend>专业产出评价（总分 {totalScore}/100）</legend>
            {selected.rubric.map((criterion) => (
              <label key={criterion.key}>
                <span>{criterion.label} / {criterion.maxScore}</span>
                <input
                  max={criterion.maxScore}
                  min={0}
                  onChange={(event) => setScores((current) => ({
                    ...current,
                    [criterion.key]: Math.min(
                      criterion.maxScore,
                      Math.max(0, Number(event.target.value)),
                    ),
                  }))}
                  type="number"
                  value={scores[criterion.key] ?? 0}
                />
              </label>
            ))}
          </fieldset>
          <label>
            <span>教师反馈</span>
            <textarea
              onChange={(event) => setFeedback(event.target.value)}
              placeholder="指出证据缺口、判断问题或下一步改正路径"
              value={feedback}
            />
          </label>
          <div className="teacher-review-actions">
            <button data-review-action="return" disabled={submitting !== null}
              onClick={() => void submitReview('return')} type="button">
              {submitting === 'return' ? '正在退回…' : '退回修订'}
            </button>
            <button data-review-action="verify" disabled={submitting !== null || totalScore > 100}
              onClick={() => void submitReview('verify')} type="button">
              {submitting === 'verify' ? '正在认证…' : '确认认证并冻结成绩'}
            </button>
          </div>
        </>
      ) : null}
      {message ? <p aria-live="polite" className="output-review-message"><b>处理结果</b>{message}</p> : null}
    </section>
  );
}

function formatValue(value: OutputFieldValue | undefined): string {
  if (value === undefined || value === '') return '未填写';
  return Array.isArray(value) ? value.join('、') : String(value);
}

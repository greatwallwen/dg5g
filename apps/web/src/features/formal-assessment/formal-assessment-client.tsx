'use client';

import React, { useState } from 'react';
import type { FormEvent } from 'react';
import type {
  AssessmentAnswers,
  AssessmentDiagnosis,
  IssuedAssessmentPaper,
} from '@/platform/formal-assessment-contract';
import { FormalAssessmentResult } from './formal-assessment-result';

export function FormalAssessmentClient({ issued }: { issued: IssuedAssessmentPaper }) {
  const [result, setResult] = useState<AssessmentDiagnosis | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const answers = readAssessmentAnswers(new FormData(event.currentTarget));
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(
        `/api/learning/nodes/${encodeURIComponent(issued.paper.nodeId)}/assessment`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-assessment-token': issued.attemptToken,
          },
          body: JSON.stringify({ answers }),
        },
      );
      const body = await response.json().catch(() => ({})) as AssessmentDiagnosis & { error?: string };
      if (!response.ok) throw new Error(body.error ?? `正式测试提交失败：${response.status}`);
      setResult(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '正式测试提交失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  if (result) return <FormalAssessmentResult result={result} />;

  return (
    <form
      className="formal-assessment-paper"
      data-motion="paused"
      data-primary-action-policy="exactly-one"
      data-assessment-paper={issued.paper.nodeId}
      onSubmit={submit}
    >
      <header>
        <div>
          <span>{issued.paper.nodeId} · 独立正式测试</span>
          <h1>{issued.paper.title}</h1>
          <p>共四个分项，满分 100，达到 {issued.paper.passScore} 分即测试达标。提交后由系统统一判分。</p>
        </div>
        <div className="formal-assessment-meta">
          <strong>{issued.paper.durationMinutes} 分钟</strong>
          <small>题目版本 {issued.paper.questionVersion}</small>
        </div>
      </header>

      {issued.paper.questions.map((question, questionIndex) => (
        <fieldset data-assessment-question={question.id} key={question.id}>
          <legend><span>{String(questionIndex + 1).padStart(2, '0')}</span>{question.prompt}</legend>
          <p>{question.helpText}</p>
          {question.kind === 'single-choice'
            ? <div className="formal-assessment-options">{question.options?.map((option) => (
              <label key={option.id}>
                <input
                  name="evidenceClassification"
                  required
                  type="radio"
                  value={option.id}
                />
                <span>{option.label}</span>
              </label>
            ))}</div>
            : null}
          {question.kind === 'ordering'
            ? <div className="formal-assessment-ordering">{question.options?.map((_, index) => (
              <label key={`${question.id}-${index}`}>
                <span>第 {index + 1} 位</span>
                <select
                  defaultValue=""
                  name="linkReconstruction"
                  required
                >
                  <option value="">请选择链路对象</option>
                  {question.options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
            ))}</div>
            : null}
          {question.kind === 'multiple-choice'
            ? <div className="formal-assessment-options">{question.options?.map((option) => (
              <label key={option.id}>
                <input
                  name="defectiveOutputRevision"
                  type="checkbox"
                  value={option.id}
                />
                <span>{option.label}</span>
              </label>
            ))}</div>
            : null}
          {question.kind === 'structured-conclusion'
            ? <div className="formal-assessment-conclusion">
              <label>
                <span>已确认事实</span>
                <textarea minLength={14} name="professionalConclusion.confirmedFact" required rows={3} />
              </label>
              <label>
                <span>证据缺口</span>
                <textarea minLength={14} name="professionalConclusion.evidenceGap" required rows={3} />
              </label>
              <label>
                <span>业务风险</span>
                <textarea minLength={14} name="professionalConclusion.risk" required rows={3} />
              </label>
              <label>
                <span>复核动作</span>
                <textarea minLength={14} name="professionalConclusion.action" required rows={3} />
              </label>
            </div>
            : null}
        </fieldset>
      ))}

      {error ? <p className="formal-assessment-error" role="alert">{error}</p> : null}
      <footer>
        <p>提交后本 token 立即失效；页面不会接收或计算最终分数。</p>
        <button data-primary-action="true" disabled={submitting} type="submit">
          {submitting ? '正在提交并判分' : '提交正式测试'}
        </button>
      </footer>
    </form>
  );
}

export function readAssessmentAnswers(formData: FormData): AssessmentAnswers {
  const stringValue = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : '';
  };
  return {
    evidenceClassification: stringValue('evidenceClassification'),
    linkReconstruction: formData.getAll('linkReconstruction').filter(
      (value): value is string => typeof value === 'string',
    ),
    defectiveOutputRevision: formData.getAll('defectiveOutputRevision').filter(
      (value): value is string => typeof value === 'string',
    ),
    professionalConclusion: {
      confirmedFact: stringValue('professionalConclusion.confirmedFact'),
      evidenceGap: stringValue('professionalConclusion.evidenceGap'),
      risk: stringValue('professionalConclusion.risk'),
      action: stringValue('professionalConclusion.action'),
    },
  };
}

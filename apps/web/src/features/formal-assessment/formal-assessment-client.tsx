'use client';

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FormEvent } from 'react';
import type {
  AssessmentAnswers,
  AssessmentDiagnosis,
  AssessmentDraftDto,
  IssuedAssessmentPaper,
} from '@/platform/formal-assessment-contract';
import { FormalAssessmentResult } from './formal-assessment-result';
import {
  ExpiredAssessmentView,
  FormalAssessmentQuestions,
} from './formal-assessment-paper-content';
import {
  createDraftSaveCoordinator,
  formatAssessmentTime,
  remainingAssessmentSeconds,
} from './formal-assessment-client-state';

export function FormalAssessmentClient({ issued }: { issued: IssuedAssessmentPaper }) {
  const attemptToken = issued.state === 'in-progress' ? issued.attemptToken : undefined;
  const [result, setResult] = useState<AssessmentDiagnosis | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [expired, setExpired] = useState(issued.state === 'expired');
  const [savedDraft, setSavedDraft] = useState(issued.draft);
  const [remainingSeconds, setRemainingSeconds] = useState(() => remainingAssessmentSeconds(
    issued.expiresAt,
    issued.serverNow,
    0,
  ));
  const formRef = useRef<HTMLFormElement>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const expirySubmitAttemptedRef = useRef(false);
  const submittingRef = useRef(false);

  const draftCoordinator = useMemo(() => {
    if (!attemptToken) return undefined;
    return createDraftSaveCoordinator({
      initialRevision: issued.draft.revision,
      save: async (answers, expectedRevision) => {
        const response = await fetch(
          `/api/learning/nodes/${encodeURIComponent(issued.paper.nodeId)}/assessment`,
          {
            method: 'PATCH',
            headers: {
              'content-type': 'application/json',
              'x-assessment-token': attemptToken,
            },
            body: JSON.stringify({ answers, expectedRevision }),
          },
        );
        const body = await response.json().catch(() => ({})) as AssessmentDraftDto & { error?: string };
        if (!response.ok) {
          if (response.status === 410) setExpired(true);
          throw new Error(body.error ?? `草稿保存失败：${response.status}`);
        }
        setSavedDraft(body);
        setDraftError('');
        return body;
      },
      onError: (cause) => setDraftError(
        cause instanceof Error ? cause.message : '草稿暂未保存，请检查连接后继续。',
      ),
    });
  }, [attemptToken, issued.assessmentId, issued.draft.revision, issued.paper.nodeId]);

  async function postAnswers(answers: AssessmentAnswers, fromExpiry: boolean) {
    if (!attemptToken || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(
        `/api/learning/nodes/${encodeURIComponent(issued.paper.nodeId)}/assessment`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-assessment-token': attemptToken,
          },
          body: JSON.stringify({ answers }),
        },
      );
      const body = await response.json().catch(() => ({})) as AssessmentDiagnosis & { error?: string };
      if (!response.ok) {
        if (response.status === 410) setExpired(true);
        throw new Error(body.error ?? `正式测试提交失败：${response.status}`);
      }
      setResult(body);
    } catch (cause) {
      if (fromExpiry) {
        setExpired(true);
        setError('测试已到时，未形成成绩。已保留最近一次成功保存的只读草稿。');
      } else {
        setError(cause instanceof Error ? cause.message : '正式测试提交失败，请稍后重试。');
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void postAnswers(readAssessmentAnswers(new FormData(event.currentTarget)), false);
  }

  function scheduleDraftSave(event: FormEvent<HTMLFormElement>) {
    if (!draftCoordinator || expired) return;
    const form = event.currentTarget;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      draftCoordinator.schedule(readAssessmentAnswers(new FormData(form)));
    }, 500);
  }

  useEffect(() => {
    if (!attemptToken || expired) return undefined;
    const startedAt = performance.now();
    const tick = () => {
      const next = remainingAssessmentSeconds(
        issued.expiresAt,
        issued.serverNow,
        performance.now() - startedAt,
      );
      setRemainingSeconds(next);
      if (next === 0 && !expirySubmitAttemptedRef.current) {
        expirySubmitAttemptedRef.current = true;
        const form = formRef.current;
        if (form) void postAnswers(readAssessmentAnswers(new FormData(form)), true);
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [attemptToken, expired, issued.expiresAt, issued.serverNow]);

  useEffect(() => () => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
  }, []);

  if (result) return <FormalAssessmentResult result={result} />;
  if (issued.state === 'paused') {
    return (
      <section className="formal-assessment-entry" data-assessment-state="paused">
        <span>正式测试已暂停</span>
        <h1>等待教师恢复测试窗口</h1>
        <p>草稿保持只读，暂停不会由课堂翻页或课堂暂停自动触发。</p>
      </section>
    );
  }
  if (!attemptToken || expired) {
    return <ExpiredAssessmentView issued={issued} draft={savedDraft} message={error} />;
  }

  const draft = issued.draft.answers;
  return (
    <form
      className="formal-assessment-paper"
      data-motion="paused"
      data-primary-action-policy="exactly-one"
      data-assessment-paper={issued.paper.nodeId}
      onChange={scheduleDraftSave}
      onSubmit={submit}
      ref={formRef}
    >
      <header>
        <div>
          <span>{issued.paper.nodeId} · 独立正式测试</span>
          <h1>{issued.paper.title}</h1>
          <p>共四个分项，满分 100，达到 {issued.paper.passScore} 分即测试达标。提交后由服务端统一判分。</p>
        </div>
        <div className="formal-assessment-meta">
          <strong aria-live="polite" data-assessment-timer>{formatAssessmentTime(remainingSeconds)}</strong>
          <small>题目版本 {issued.paper.questionVersion} · 草稿 V{savedDraft.revision}</small>
        </div>
      </header>

      <FormalAssessmentQuestions draft={draft} paper={issued.paper} />

      {draftError ? (
        <div className="formal-assessment-error" role="alert">
          <p>{draftError}</p>
          <button onClick={() => draftCoordinator?.retry()} type="button">重试保存草稿</button>
        </div>
      ) : null}
      {error ? <p className="formal-assessment-error" role="alert">{error}</p> : null}
      <footer>
        <p>答案每次停止编辑 500ms 后按顺序保存；刷新不会重置试卷和倒计时。</p>
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

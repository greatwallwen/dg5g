'use client';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type {
  AssessmentAnswers,
  AssessmentDiagnosis,
  AssessmentDraftDto,
  IssuedAssessmentPaper,
} from '@/platform/formal-assessment-contract';
import type { StudentAuthoritativeSnapshot } from '@/platform/authoritative-snapshot';
import { FormalAssessmentResult } from './formal-assessment-result';
import { FormalAssessmentEntryClient } from './formal-assessment-classroom-client';
import { createAssessmentDraftSaver } from './formal-assessment-draft-saver';
import {
  ExpiredAssessmentView,
  FormalAssessmentQuestions,
  readAssessmentAnswers,
} from './formal-assessment-paper-content';
import {
  createDraftSaveCoordinator,
  formatAssessmentTime,
  isAssessmentAttemptActive,
  remainingAssessmentSeconds,
  type AttemptIssuedAssessment,
} from './formal-assessment-client-state';
const usePrePaintEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
export function FormalAssessmentClient({
  classroomSessionId,
  initialSnapshot,
  issued,
}: {
  classroomSessionId: string | undefined;
  initialSnapshot: StudentAuthoritativeSnapshot | undefined;
  issued: IssuedAssessmentPaper;
}) {
  return <FormalAssessmentEntryClient
    classroomSessionId={classroomSessionId}
    initialSnapshot={initialSnapshot}
    issued={issued}
    renderAttempt={(current, onDraftSaved, allowRestart, lifecycle) => <FormalAssessmentAttempt
      allowRestart={allowRestart}
      issued={current}
      onDraftSaved={onDraftSaved}
      onSubmissionPendingChange={lifecycle?.onSubmissionPendingChange}
      onSubmitted={lifecycle?.onSubmitted}
    />}
  />;
}
function FormalAssessmentAttempt({
  allowRestart,
  issued,
  onDraftSaved,
  onSubmissionPendingChange,
  onSubmitted,
}: {
  allowRestart: boolean;
  issued: AttemptIssuedAssessment;
  onDraftSaved?: (draft: AssessmentDraftDto) => void;
  onSubmissionPendingChange?: (pending: boolean) => void;
  onSubmitted?: (result: AssessmentDiagnosis) => void;
}) {
  const attemptToken = issued.state === 'in-progress' ? issued.attemptToken : undefined;
  const [result, setResult] = useState<AssessmentDiagnosis | null>(
    issued.state === 'submitted' ? issued.result : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [expired, setExpired] = useState(issued.state === 'expired');
  const [savedDraft, setSavedDraft] = useState(issued.draft);
  const [remainingSeconds, setRemainingSeconds] = useState(
    () => remainingAssessmentSeconds(issued.expiresAt, issued.serverNow, 0),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const expirySubmitAttemptedRef = useRef(false);
  const submittingRef = useRef(false);
  const activeTokenRef = useRef(attemptToken);
  const activityOpen = isAssessmentAttemptActive(attemptToken, expired, Boolean(result));

  const draftCoordinator = useMemo(() => {
    if (!attemptToken) return undefined;
    return createDraftSaveCoordinator({
      initialRevision: issued.draft.revision,
      save: createAssessmentDraftSaver({
        nodeId: issued.paper.nodeId,
        attemptToken,
        isCurrent: () => activeTokenRef.current === attemptToken,
        onExpired: () => { closeAttemptActivity(); setExpired(true); },
        onSaved: (draft) => {
          setSavedDraft(draft); onDraftSaved?.(draft); setDraftError('');
        },
      }),
      onError: (cause) => setDraftError(
        cause instanceof Error ? cause.message : '草稿暂未保存，请检查连接后继续。',
      ),
    });
  }, [attemptToken, issued.assessmentId, issued.draft.revision, issued.paper.nodeId]);

  function closeAttemptActivity() {
    activeTokenRef.current = undefined;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    draftCoordinator?.cancel();
  }

  async function postAnswers(answers: AssessmentAnswers, fromExpiry: boolean) {
    if (!activityOpen || activeTokenRef.current !== attemptToken || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    onSubmissionPendingChange?.(true);
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
      if (activeTokenRef.current !== attemptToken) return;
      if (!response.ok) {
        if (response.status === 410) { closeAttemptActivity(); setExpired(true); }
        throw new Error(body.error ?? `正式测试提交失败：${response.status}`);
      }
      if (body.assessmentId !== issued.assessmentId) {
        throw new Error('Submitted assessment response did not match the active assessment.');
      }
      closeAttemptActivity();
      onSubmitted?.(body);
      setResult(body);
    } catch (cause) {
      if (fromExpiry) {
        closeAttemptActivity();
        setExpired(true);
        setError('测试已到时，未形成成绩。已保留最近一次成功保存的只读草稿。');
      } else {
        setError(cause instanceof Error ? cause.message : '正式测试提交失败，请稍后重试。');
      }
    } finally {
      onSubmissionPendingChange?.(false);
      if (activeTokenRef.current === attemptToken) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void postAnswers(readAssessmentAnswers(new FormData(event.currentTarget)), false);
  }

  function scheduleDraftSave(event: FormEvent<HTMLFormElement>) {
    if (!draftCoordinator || !activityOpen || activeTokenRef.current !== attemptToken) return;
    const form = event.currentTarget;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      draftCoordinator.schedule(readAssessmentAnswers(new FormData(form)));
    }, 500);
  }

  useEffect(() => {
    if (!activityOpen) return undefined;
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
  }, [activityOpen, attemptToken, issued.expiresAt, issued.serverNow]);

  usePrePaintEffect(() => {
    if (!activityOpen) return undefined;
    activeTokenRef.current = attemptToken;
    return () => {
      if (activeTokenRef.current === attemptToken) activeTokenRef.current = undefined;
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      draftCoordinator?.cancel();
    };
  }, [activityOpen, attemptToken, draftCoordinator]);

  if (result) return <FormalAssessmentResult result={result} />;
  if (!attemptToken || expired) {
    return <ExpiredAssessmentView allowRestart={allowRestart} issued={issued} draft={savedDraft} message={error} />;
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

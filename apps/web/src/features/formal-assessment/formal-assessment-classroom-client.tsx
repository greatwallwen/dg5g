'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  ActiveIssuedAssessmentPaper,
  AssessmentDiagnosis,
  AssessmentDraftDto,
  IssuedAssessmentPaper,
} from '@/platform/formal-assessment-contract';
import type { StudentAuthoritativeSnapshot } from '@/platform/authoritative-snapshot';
import { useAuthoritativeSnapshotState } from '@/features/snapshot/authoritative-snapshot-client';
import { PausedAssessmentView } from './formal-assessment-paper-content';
import {
  adoptSubmittedAssessmentResult,
  createClassroomAssessmentResumeCoordinator,
  isAttemptIssuedAssessment,
  isPausedIssuedAssessment,
  projectClassroomIssuedAssessment,
  remainingAssessmentSeconds,
  type AttemptIssuedAssessment,
  type ClassroomIssuedAssessment,
  type PausedIssuedAssessment,
  type ResumedIssuedAssessment,
} from './formal-assessment-client-state';

const usePrePaintEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
export type ClassroomOpenIssuedAssessment = ActiveIssuedAssessmentPaper | PausedIssuedAssessment;
type RenderAttempt = (
  issued: AttemptIssuedAssessment,
  onDraftSaved: (draft: AssessmentDraftDto) => void,
  allowRestart: boolean,
  lifecycle?: {
    onSubmissionPendingChange: (pending: boolean) => void;
    onSubmitted: (result: AssessmentDiagnosis) => void;
  },
) => ReactNode;

export function FormalAssessmentEntryClient({
  classroomSessionId,
  initialSnapshot,
  issued,
  renderAttempt,
}: {
  classroomSessionId: string | undefined;
  initialSnapshot: StudentAuthoritativeSnapshot | undefined;
  issued: IssuedAssessmentPaper;
  renderAttempt: RenderAttempt;
}) {
  const assessment = initialSnapshot?.submissions.activeAssessment;
  if (classroomSessionId) {
    if (!initialSnapshot || !assessment?.runId || assessment.nodeId !== issued.paper.nodeId) {
      return <section className="formal-assessment-entry" data-assessment-state="unavailable">
        <span>课堂正式测试不可进入</span>
        <h1>无法确认当前课堂测试窗口</h1>
        <p>请返回课堂跟随页，等待教师重新启动当前节点的正式测试。</p>
      </section>;
    }
    if (isClassroomOpenIssuedAssessment(issued)) {
      return <ClassroomAssessmentClient
        classroomRunId={assessment.runId}
        classroomSessionId={classroomSessionId}
        initialIssued={issued}
        initialSnapshot={initialSnapshot}
        renderAttempt={renderAttempt}
      />;
    }
    return isAttemptIssuedAssessment(issued)
      ? <>{renderAttempt(issued, () => undefined, false)}</>
      : null;
  }
  if (isPausedIssuedAssessment(issued)) {
    return <PausedAssessmentView
      issued={issued}
      message="无法确认当前课堂测试窗口，请返回课堂跟随页后重试。"
      remainingSeconds={remainingAssessmentSeconds(issued.expiresAt, issued.serverNow, 0)}
    />;
  }
  if (!isAttemptIssuedAssessment(issued)) return null;
  return <>{renderAttempt(issued, () => undefined, !classroomSessionId)}</>;
}

export function ClassroomAssessmentClient({
  classroomRunId,
  classroomSessionId,
  initialIssued,
  initialSnapshot,
  renderAttempt,
}: {
  classroomRunId: string;
  classroomSessionId: string;
  initialIssued: ClassroomOpenIssuedAssessment;
  initialSnapshot: StudentAuthoritativeSnapshot;
  renderAttempt: RenderAttempt;
}) {
  const { snapshot } = useAuthoritativeSnapshotState(
    initialSnapshot, 'student', classroomSessionId, { participationMode: 'follow' },
  );
  const initialAssessment = initialSnapshot.submissions.activeAssessment;
  const [currentIssued, setCurrentIssued] = useState<ClassroomIssuedAssessment>(
    initialIssued,
  );
  const [savedDraft, setSavedDraft] = useState(initialIssued.draft);
  const [submissionPending, setSubmissionPending] = useState(false);
  const frozenRemainingSecondsRef = useRef(initialAssessment.remainingSecondsWhenPaused
    ?? remainingAssessmentSeconds(initialAssessment.expiresAt ?? initialIssued.expiresAt, initialSnapshot.serverNow, 0));
  const activeAssessment = snapshot.submissions.activeAssessment;
  const handleResumed = useCallback((resumed: ResumedIssuedAssessment) => {
    setSavedDraft(resumed.draft);
    setCurrentIssued(resumed);
  }, []);
  const handleSubmitted = useCallback((result: AssessmentDiagnosis) => {
    setCurrentIssued((current) => current.state === 'in-progress'
      && current.assessmentId === result.assessmentId
      ? adoptSubmittedAssessmentResult(current, result)
      : current);
  }, []);
  if (activeAssessment.runId === classroomRunId
    && activeAssessment.status === 'paused'
    && activeAssessment.remainingSecondsWhenPaused !== undefined) {
    frozenRemainingSecondsRef.current = activeAssessment.remainingSecondsWhenPaused;
  }

  const projectedIssued = projectClassroomIssuedAssessment({
    classroomRunId,
    currentIssued,
    observation: activeAssessment,
    savedDraft,
    submissionPending,
    timing: {
      serverNow: snapshot.serverNow,
      expiresAt: activeAssessment.expiresAt ?? currentIssued.expiresAt,
    },
  });
  usePrePaintEffect(() => {
    if (projectedIssued !== currentIssued) setCurrentIssued(projectedIssued);
  }, [currentIssued, projectedIssued]);

  if (isPausedIssuedAssessment(projectedIssued)) {
    return <ClassroomPausedAssessmentResume
      activeAssessment={activeAssessment}
      classroomRunId={classroomRunId}
      classroomSessionId={classroomSessionId}
      frozenRemainingSeconds={frozenRemainingSecondsRef.current}
      issued={projectedIssued}
      onResumed={handleResumed}
    />;
  }
  if (!isAttemptIssuedAssessment(projectedIssued)) return null;
  return <>{renderAttempt(projectedIssued, setSavedDraft, false, {
    onSubmissionPendingChange: setSubmissionPending,
    onSubmitted: handleSubmitted,
  })}</>;
}

function ClassroomPausedAssessmentResume({
  activeAssessment,
  classroomRunId,
  classroomSessionId,
  frozenRemainingSeconds,
  issued,
  onResumed,
}: {
  activeAssessment: StudentAuthoritativeSnapshot['submissions']['activeAssessment'];
  classroomRunId: string;
  classroomSessionId: string;
  frozenRemainingSeconds: number;
  issued: PausedIssuedAssessment;
  onResumed: (issued: ResumedIssuedAssessment) => void;
}) {
  const [resumeError, setResumeError] = useState('');
  const [resuming, setResuming] = useState(false);
  const lastObservedStatusRef = useRef<string>();
  const coordinator = useMemo(() => createClassroomAssessmentResumeCoordinator({
    classroomRunId,
    paused: issued,
    resume: () => fetchResumedClassroomAssessment(issued.paper.nodeId, classroomSessionId),
  }), [classroomRunId, classroomSessionId, issued]);

  useEffect(() => {
    let subscribed = true;
    const enteredRunning = activeAssessment.runId === classroomRunId
      && activeAssessment.status === 'running' && lastObservedStatusRef.current !== 'running';
    lastObservedStatusRef.current = activeAssessment.status;
    if (enteredRunning) {
      setResuming(true);
      setResumeError('');
    }
    void coordinator.observe({ runId: activeAssessment.runId, status: activeAssessment.status })
      .then((resumed) => {
        if (!subscribed) return;
        setResuming(false);
        if (!resumed) return;
        setResumeError('');
        onResumed(resumed);
      }).catch((cause) => {
        if (!subscribed) return;
        setResuming(false);
        setResumeError(cause instanceof Error ? cause.message : '恢复测试失败，请重试。');
      });
    return () => { subscribed = false; };
  }, [activeAssessment.runId, activeAssessment.status, classroomRunId, coordinator, onResumed]);

  async function retryResume() {
    setResuming(true);
    setResumeError('');
    try {
      const resumed = await coordinator.retry();
      if (resumed) onResumed(resumed);
      else setResumeError('当前课堂测试尚未恢复，请等待教师操作。');
    } catch (cause) {
      setResumeError(cause instanceof Error ? cause.message : '恢复测试失败，请重试。');
    } finally {
      setResuming(false);
    }
  }

  return <PausedAssessmentView
    issued={issued}
    message={resumeError || (resuming ? '教师已恢复测试，正在安全恢复同一份草稿。' : '')}
    onRetry={resumeError ? () => void retryResume() : undefined}
    remainingSeconds={frozenRemainingSeconds}
    retrying={resuming}
  />;
}

async function fetchResumedClassroomAssessment(
  nodeId: string,
  classroomSessionId: string,
): Promise<IssuedAssessmentPaper> {
  const search = new URLSearchParams({ classroomSessionId });
  const response = await fetch(
    `/api/learning/nodes/${encodeURIComponent(nodeId)}/assessment?${search.toString()}`,
    { method: 'GET', cache: 'no-store', credentials: 'same-origin' },
  );
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body && typeof body === 'object' && 'error' in body
      && typeof body.error === 'string' ? `：${body.error}` : '';
    throw new Error(`恢复正式测试失败（${response.status}）${detail}`);
  }
  if (!body || typeof body !== 'object') throw new Error('恢复正式测试响应不完整。');
  return body as IssuedAssessmentPaper;
}

function isClassroomOpenIssuedAssessment(
  issued: IssuedAssessmentPaper,
): issued is ClassroomOpenIssuedAssessment {
  return issued.state === 'in-progress' || issued.state === 'paused';
}

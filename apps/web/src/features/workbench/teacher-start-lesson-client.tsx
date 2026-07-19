'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '../../ui/foundation/icons.tsx';

type RequestLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface StartTeacherLessonInput {
  sessionId: string;
  nodeId: string;
  expectedRevision: number;
  navigate: (href: string) => void;
  request?: RequestLike;
}

export type StartTeacherLessonResult =
  | { status: 'started' }
  | { status: 'conflict'; currentRevision: number };

export async function startTeacherLesson({
  sessionId,
  nodeId,
  expectedRevision,
  navigate,
  request = fetch,
}: StartTeacherLessonInput): Promise<StartTeacherLessonResult> {
  const response = await request(
    `/api/class-sessions/${encodeURIComponent(sessionId)}/lesson`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nodeId, command: 'prepare', expectedRevision }),
    },
  );
  const body = await response.json().catch(() => ({})) as {
    error?: string;
    currentRevision?: number;
    session?: {
      sessionStatus?: string;
      activeNodeId?: string;
      activeUnitId?: string;
      activeLessonRunId?: string;
      lessonState?: { revision?: number };
    };
  };
  if (response.status === 409
    && Number.isInteger(body.currentRevision)
    && Number(body.currentRevision) >= 0) {
    return { status: 'conflict', currentRevision: Number(body.currentRevision) };
  }
  if (!response.ok) {
    throw new Error(body.error ?? `开始新课失败（${response.status}）`);
  }
  if (body.session?.sessionStatus !== 'preparing'
    || !body.session.activeLessonRunId
    || !Number.isSafeInteger(body.session.lessonState?.revision)) {
    throw new Error('Lesson preparation did not create an authoritative lesson run.');
  }
  const activeResponse = await request(
    `/api/class-sessions/${encodeURIComponent(sessionId)}/lesson`,
    {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lessonRunId: body.session.activeLessonRunId,
        command: { type: 'start' },
        expectedRevision: body.session.lessonState?.revision,
      }),
    },
  );
  const activeBody = await activeResponse.json().catch(() => ({})) as {
    error?: string;
    currentRevision?: number;
    session?: { sessionStatus?: string; activeLessonRunId?: string };
  };
  if (activeResponse.status === 409
    && Number.isInteger(activeBody.currentRevision)
    && Number(activeBody.currentRevision) >= 0) {
    return { status: 'conflict', currentRevision: Number(activeBody.currentRevision) };
  }
  if (!activeResponse.ok) {
    throw new Error(activeBody.error ?? `Start lesson failed (${activeResponse.status})`);
  }
  if (activeBody.session?.sessionStatus !== 'active'
    || activeBody.session.activeLessonRunId !== body.session.activeLessonRunId) {
    throw new Error('Lesson start did not activate the prepared lesson run.');
  }
  navigate(`/teacher/sessions/${sessionId}`);
  return { status: 'started' };
}

export function TeacherStartLessonClient({
  sessionId,
  expectedRevision,
  options,
  primary,
  recommendedNodeId,
  triggerLabel,
}: {
  sessionId: string;
  expectedRevision: number;
  options: Array<{ nodeId: string; title: string }>;
  primary: boolean;
  recommendedNodeId?: string;
  triggerLabel: string;
}) {
  const router = useRouter();
  const [revision, setRevision] = useState(expectedRevision);
  const [pendingNodeId, setPendingNodeId] = useState<string>();
  const [message, setMessage] = useState('');
  const orderedOptions = recommendedNodeId
    ? [...options].sort((left, right) => (
        Number(right.nodeId === recommendedNodeId) - Number(left.nodeId === recommendedNodeId)
      ))
    : options;

  useEffect(() => {
    setRevision(expectedRevision);
  }, [expectedRevision]);

  async function chooseLesson(nodeId: string) {
    setPendingNodeId(nodeId);
    setMessage('');
    try {
      const result = await startTeacherLesson({
        sessionId,
        nodeId,
        expectedRevision: revision,
        navigate: (href) => router.push(href),
      });
      if (result.status === 'conflict') {
        setRevision(result.currentRevision);
        setMessage('状态已刷新，请再次点击');
        setPendingNodeId(undefined);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '开始新课失败，请刷新后重试。');
      setPendingNodeId(undefined);
    }
  }

  return (
    <details
      aria-busy={pendingNodeId ? 'true' : 'false'}
      className={`teacher-new-lesson${primary ? ' is-primary' : ''}`}
      data-start-lesson-primary={primary ? 'true' : undefined}
    >
      <summary aria-label={triggerLabel} data-primary-action={primary ? 'true' : undefined}>
        <Icon name={primary ? 'play' : 'layers'} size={19} />{triggerLabel}<Icon name="arrow" size={17} />
      </summary>
      <div>
        <span>第二次点击后先写入课堂状态，再进入授课节点</span>
        {orderedOptions.map((option) => (
          <button
            data-start-lesson-node={option.nodeId}
            disabled={Boolean(pendingNodeId)}
            key={option.nodeId}
            onClick={() => void chooseLesson(option.nodeId)}
            type="button"
          >
            <strong>{option.nodeId}{option.nodeId === recommendedNodeId ? ' · 推荐' : ''}</strong>
            <small>{pendingNodeId === option.nodeId ? '正在开始课堂…' : option.title}</small>
            <Icon name="arrow" size={16} />
          </button>
        ))}
        {message ? <p aria-live="polite" className="teacher-new-lesson-message">{message}</p> : null}
      </div>
    </details>
  );
}

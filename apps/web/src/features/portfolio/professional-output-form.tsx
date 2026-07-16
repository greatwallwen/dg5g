'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type {
  ProfessionalOutputAggregate,
  ProfessionalOutputStatus,
  ProfessionalOutputUpstreamRef,
  WriteProfessionalOutputInput,
} from '@/platform/professional-output-repository';
import { Icon } from '@/ui/foundation/icons';
import {
  isProfessionalOutputComplete,
  validateProfessionalOutputDraft,
  validateProfessionalOutputSubmission,
  type ProfessionalOutputFields,
  type ProfessionalOutputSchema,
} from './output-schema';
import { OutputFieldsets } from './output-fieldsets';

export interface ProfessionalOutputFormState {
  fields: ProfessionalOutputFields;
  outputId?: string;
  currentVersion: number;
  stateRevision: number;
  status: ProfessionalOutputStatus;
  readOnly: boolean;
}

export type ProfessionalOutputClientCommand = Omit<
  WriteProfessionalOutputInput,
  'studentId' | 'taskId'
>;

export type ProfessionalOutputFetch = (input: string, init?: RequestInit) => Promise<Response>;

export class ProfessionalOutputRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ProfessionalOutputRequestError';
  }
}

export function createProfessionalOutputClient(
  taskId: ProfessionalOutputSchema['taskId'],
  request: ProfessionalOutputFetch = (input, init) => fetch(input, init),
) {
  const base = `/api/outputs/${taskId}`;
  return {
    read: () => requestJson<ProfessionalOutputAggregate | null>(request, base, { cache: 'no-store' }),
    saveDraft: (command: ProfessionalOutputClientCommand) => requestJson<ProfessionalOutputAggregate>(
      request,
      `${base}/draft`,
      jsonPost(command),
    ),
    submit: (command: ProfessionalOutputClientCommand) => requestJson<ProfessionalOutputAggregate>(
      request,
      `${base}/submit`,
      jsonPost(command),
    ),
  };
}

export function projectProfessionalOutputFormState(
  schema: ProfessionalOutputSchema,
  output: ProfessionalOutputAggregate | null | undefined,
): ProfessionalOutputFormState {
  if (!output) {
    return {
      fields: {},
      currentVersion: 0,
      stateRevision: 0,
      status: 'draft',
      readOnly: false,
    };
  }
  const current = output.versions.find(({ version }) => version === output.head.currentVersion);
  const allowedKeys = new Set(schema.fields.map(({ key }) => key));
  const fields = Object.fromEntries(
    Object.entries(current?.fields ?? {}).filter(([key]) => allowedKeys.has(key)),
  ) as ProfessionalOutputFields;
  return {
    fields,
    outputId: output.head.outputId,
    currentVersion: output.head.currentVersion,
    stateRevision: output.head.stateRevision,
    status: output.head.status,
    readOnly: output.head.status === 'submitted' || output.head.status === 'verified',
  };
}

export function ProfessionalOutputForm({
  schema,
  upstreamRefs: suppliedUpstreamRefs,
  initialOutput,
  teacherFeedback,
}: {
  schema: ProfessionalOutputSchema;
  upstreamRefs?: ProfessionalOutputUpstreamRef[];
  initialOutput?: ProfessionalOutputAggregate | null;
  teacherFeedback?: string;
}) {
  const client = useMemo(() => createProfessionalOutputClient(schema.taskId), [schema.taskId]);
  const [state, setState] = useState(() => projectProfessionalOutputFormState(schema, initialOutput));
  const [upstreamRefs, setUpstreamRefs] = useState<ProfessionalOutputUpstreamRef[]>(suppliedUpstreamRefs ?? []);
  const [loading, setLoading] = useState(initialOutput === undefined);
  const [saving, setSaving] = useState<'draft' | 'submit'>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialOutput !== undefined) return;
    let active = true;
    Promise.all([client.read(), loadUpstreamReference(schema.taskId)])
      .then(([output, references]) => {
        if (!active) return;
        setState(projectProfessionalOutputFormState(schema, output));
        setUpstreamRefs(references);
      })
      .catch((reason: unknown) => active && setError(errorMessage(reason)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [client, initialOutput, schema]);

  function updateField(key: string, value: string) {
    setState((current) => ({ ...current, fields: { ...current.fields, [key]: value } }));
    setNotice('');
    setError('');
  }

  async function persist(action: 'draft' | 'submit') {
    setSaving(action);
    setError('');
    setNotice('');
    try {
      const fields = action === 'draft'
        ? validateProfessionalOutputDraft(schema, state.fields)
        : validateProfessionalOutputSubmission(schema, state.fields);
      if (Object.keys(fields).length === 0) throw new Error('请至少填写一项证据后再保存草稿。');
      if (schema.taskId !== 'P01' && upstreamRefs.length !== 1) {
        throw new Error('上游任务产出尚未形成，暂不能保存本任务表单。');
      }
      const command: ProfessionalOutputClientCommand = {
        ...(state.outputId ? { outputId: state.outputId } : {}),
        expectedStateRevision: state.stateRevision,
        fields,
        upstreamRefs,
      };
      const output = action === 'draft'
        ? await client.saveDraft(command)
        : await client.submit(command);
      setState(projectProfessionalOutputFormState(schema, output));
      setNotice(action === 'draft' ? '草稿已保存，尚未提交教师。' : '专业产出已提交，等待教师复核。');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(undefined);
    }
  }

  if (loading) {
    return <section className="professional-output-loading" data-professional-output={schema.taskId}><span /><strong>正在恢复专业产出草稿</strong><small>读取当前版本与状态修订…</small></section>;
  }
  const complete = isProfessionalOutputComplete(schema, state.fields);
  const statusCopy = professionalOutputStatusCopy(state.status);
  return (
    <form className="professional-output-form" data-motion="paused" data-output-readonly={state.readOnly} data-output-revision={state.stateRevision} data-output-status={state.status} data-output-version={state.currentVersion} data-primary-action-policy={state.readOnly ? 'none' : 'exactly-one'} data-professional-output={schema.taskId} onSubmit={(event) => { event.preventDefault(); void persist('submit'); }}>
      <header>
        <div><span>{schema.taskId} · N04 职业成果</span><h1>{statusCopy.title}</h1><p>{statusCopy.description}</p></div>
        <dl><div><dt>版本</dt><dd>v{state.currentVersion}</dd></div><div><dt>状态修订</dt><dd>r{state.stateRevision}</dd></div><div><dt>量规</dt><dd>{schema.totalScore}分</dd></div></dl>
      </header>
      {state.status === 'returned' ? <p className="professional-output-feedback"><Icon name="arrow" size={17} /><span><strong>教师退回修订</strong>{teacherFeedback ?? '请按复核意见补齐证据链后重新提交。'}</span></p> : null}
      <div className="professional-output-workspace">
        <OutputFieldsets onFieldChange={updateField} readOnly={state.readOnly} schema={schema} values={state.fields} />
        <aside className="professional-output-rubric">
          <span>评价标准 · 总分 {schema.totalScore}</span>
          <ol>{schema.rubric.map(({ criterion, maxScore }) => <li key={criterion}><strong>{criterion}</strong><em>{maxScore}分</em></li>)}</ol>
          <p><Icon name="link" size={16} />所有字段与评分项均来自当前教材内容版本。</p>
        </aside>
      </div>
      {error ? <p className="professional-output-message is-error" role="alert">{error}</p> : null}
      {notice ? <p className="professional-output-message is-success" role="status">{notice}</p> : null}
      <footer className={state.readOnly ? 'professional-output-status' : 'professional-output-actions'}>
        <p><strong>{state.readOnly ? statusCopy.title : complete ? '字段完整，可提交复核' : '可先保存草稿'}</strong><small>{state.readOnly ? statusCopy.description : '保存草稿不会提交；提交前服务端将再次完整校验。'}</small></p>
        {!state.readOnly ? <div>
          <button disabled={state.readOnly || Boolean(saving)} onClick={() => void persist('draft')} type="button"><Icon name="file" size={17} />{saving === 'draft' ? '正在保存' : '保存草稿'}</button>
          <button className="is-primary" data-primary-action="true" disabled={state.readOnly || !complete || Boolean(saving)} type="submit"><Icon name="check" size={17} />{saving === 'submit' ? '正在提交' : '提交教师复核'}</button>
        </div> : null}
      </footer>
    </form>
  );
}

async function requestJson<T>(
  request: ProfessionalOutputFetch,
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await request(input, init);
  const body = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : `Professional output request failed (${response.status}).`;
    throw new ProfessionalOutputRequestError(response.status, message);
  }
  return body as T;
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

const upstreamTaskByTask: Partial<Record<ProfessionalOutputSchema['taskId'], ProfessionalOutputSchema['taskId']>> = {
  P02: 'P01',
  P03: 'P02',
};

async function loadUpstreamReference(
  taskId: ProfessionalOutputSchema['taskId'],
): Promise<ProfessionalOutputUpstreamRef[]> {
  const upstreamTaskId = upstreamTaskByTask[taskId];
  if (!upstreamTaskId) return [];
  const output = await createProfessionalOutputClient(upstreamTaskId).read();
  return output
    ? [{ outputId: output.head.outputId, version: output.head.currentVersion }]
    : [];
}

function professionalOutputStatusCopy(status: ProfessionalOutputStatus): { title: string; description: string } {
  if (status === 'submitted') return { title: '已提交 · 等待教师复核', description: '当前版本已锁定；教师退回后才能继续修订。' };
  if (status === 'verified') return { title: '教师已认证 · 能力达成', description: '当前职业成果已完成教师复核并进入项目成果包。' };
  if (status === 'returned') return { title: '退回修订 · 补齐证据', description: '保留历史版本，在新版本中完成修改并重新提交。' };
  return { title: '结构化专业产出', description: '按教材模板填写可回查证据，先保存草稿，确认完整后再提交。' };
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : '专业产出请求失败，请稍后重试。';
}

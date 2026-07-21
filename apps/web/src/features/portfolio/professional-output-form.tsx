'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { ProfessionalOutputEnvelope } from '@/platform/learning-command-service';
import type { ProfessionalOutputUpstreamRef } from '@/platform/professional-output-repository';
import { Icon } from '@/ui/foundation/icons';
import {
  isProfessionalOutputComplete,
  validateProfessionalOutputDraft,
  validateProfessionalOutputSubmission,
  type ProfessionalOutputSchema,
} from './output-schema';
import { OutputFieldsets } from './output-fieldsets';
import {
  createProfessionalOutputClient,
  loadUpstreamReference,
  professionalOutputErrorMessage,
  professionalOutputStatusCopy,
  projectProfessionalOutputFormState,
  reviseProfessionalOutputEvidence,
  reviseProfessionalOutputField,
  type ProfessionalOutputClientCommand,
} from './professional-output-form-model';

export {
  createProfessionalOutputClient,
  ProfessionalOutputRequestError,
  projectProfessionalOutputFormState,
  reviseProfessionalOutputEvidence,
  reviseProfessionalOutputField,
} from './professional-output-form-model';
export type {
  ProfessionalOutputClientCommand,
  ProfessionalOutputFetch,
  ProfessionalOutputFormState,
} from './professional-output-form-model';

export function ProfessionalOutputForm({
  schema,
  upstreamRefs: suppliedUpstreamRefs,
  initialEnvelope,
  teacherFeedback,
}: {
  schema: ProfessionalOutputSchema;
  upstreamRefs?: ProfessionalOutputUpstreamRef[];
  initialEnvelope?: ProfessionalOutputEnvelope | null;
  teacherFeedback?: string;
}) {
  const client = useMemo(() => createProfessionalOutputClient(schema.taskId), [schema.taskId]);
  const [state, setState] = useState(() => projectProfessionalOutputFormState(schema, initialEnvelope));
  const [upstreamRefs, setUpstreamRefs] = useState<ProfessionalOutputUpstreamRef[]>(suppliedUpstreamRefs ?? []);
  const [loading, setLoading] = useState(initialEnvelope === undefined);
  const [saving, setSaving] = useState<'draft' | 'submit'>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialEnvelope !== undefined) return;
    let active = true;
    Promise.all([client.read(), loadUpstreamReference(schema.taskId)])
      .then(([envelope, references]) => {
        if (!active) return;
        setState(projectProfessionalOutputFormState(schema, envelope));
        setUpstreamRefs(references);
      })
      .catch((reason: unknown) => active && setError(professionalOutputErrorMessage(reason)))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [client, initialEnvelope, schema]);

  function clearMessages() {
    setNotice('');
    setError('');
  }

  async function persist(action: 'draft' | 'submit') {
    setSaving(action);
    clearMessages();
    try {
      const fields = action === 'draft'
        ? validateProfessionalOutputDraft(schema, state.fields)
        : validateProfessionalOutputSubmission(schema, state.fields);
      if (Object.keys(fields).length === 0) throw new Error('请至少填写一项证据后再保存草稿。');
      if (schema.taskId !== 'P01' && upstreamRefs.length !== 1) {
        throw new Error('上游任务成果尚未形成，暂不能保存本任务表单。');
      }
      const command: ProfessionalOutputClientCommand = {
        ...(state.outputId ? { outputId: state.outputId } : {}),
        expectedStateRevision: state.stateRevision,
        fields,
        upstreamRefs,
        evidenceLinks: state.evidenceLinks,
      };
      const output = action === 'draft' ? await client.saveDraft(command) : await client.submit(command);
      setState(projectProfessionalOutputFormState(schema, {
        output, prefill: {}, evidenceLibrary: state.evidenceLibrary,
      }));
      setNotice(action === 'draft'
        ? '草稿已保存，还没有提交给教师。'
        : output.submissionCount > 1
          ? '修订后的证据表已再次提交，等待教师复核。'
          : '证据表已提交，等待教师复核。');
    } catch (reason) {
      setError(professionalOutputErrorMessage(reason));
    } finally {
      setSaving(undefined);
    }
  }

  if (loading) {
    return <section className="professional-output-loading" data-professional-output={schema.taskId}><span /><strong>正在恢复证据表草稿</strong><small>读取当前版本、前面练习结果与已选证据…</small></section>;
  }
  const complete = isProfessionalOutputComplete(schema, state.fields);
  const statusCopy = professionalOutputStatusCopy(state.workflow.state);
  const submitBlockedByReturn = state.workflow.state === 'returned';
  const visibleTeacherFeedback = teacherFeedback ?? state.teacherFeedback;
  return (
    <form className="professional-output-form" data-motion="paused" data-output-origin={state.workflow.origin} data-output-readonly={state.readOnly} data-output-revision={state.stateRevision} data-output-status={state.status} data-output-version={state.currentVersion} data-output-workflow={state.workflow.state} data-primary-action-policy={state.readOnly ? 'none' : 'exactly-one'} data-professional-output={schema.taskId} onSubmit={(event) => { event.preventDefault(); void persist('submit'); }}>
      <header>
        <div><span>{schema.taskId} · N04 任务成果表</span><h1>{statusCopy.title}</h1><p>{statusCopy.description}</p></div>
        <dl><div><dt>版本</dt><dd>v{state.currentVersion}</dd></div><div><dt>流程状态</dt><dd>{state.workflow.label}{state.workflow.origin === 'demo' ? ' · 演示数据' : ''}</dd></div><div><dt>量规</dt><dd>{schema.totalScore}分</dd></div></dl>
      </header>
      {(state.workflow.state === 'returned' || state.workflow.state === 'revising') ? <p className="professional-output-feedback"><Icon name="arrow" size={17} /><span><strong>教师退回修订{state.workflow.origin === 'demo' ? ' · 演示数据' : ''}</strong>{visibleTeacherFeedback ?? '请按复核意见补齐证据链后重新提交。'}</span></p> : null}
      <div className="professional-output-workspace">
        <OutputFieldsets evidenceLibrary={state.evidenceLibrary} evidenceLinks={state.evidenceLinks} fieldSources={state.fieldSources} onEvidenceChange={(fieldKey, ids) => { setState((current) => reviseProfessionalOutputEvidence(current, fieldKey, ids)); clearMessages(); }} onFieldChange={(key, value) => { setState((current) => reviseProfessionalOutputField(current, key, value)); clearMessages(); }} readOnly={state.readOnly} schema={schema} values={state.fields} />
        <aside className="professional-output-rubric">
          <span>评价标准 · 总分 {schema.totalScore}</span>
          <ol>{schema.rubric.map(({ criterion, maxScore }) => <li key={criterion}><strong>{criterion}</strong><em>{maxScore}分</em></li>)}</ol>
          <p><Icon name="link" size={16} />提交后，填写内容、练习来源和所选证据会一起形成可复核版本。</p>
        </aside>
      </div>
      {error ? <p className="professional-output-message is-error" role="alert">{error}</p> : null}
      {notice ? <p className="professional-output-message is-success" role="status">{notice}</p> : null}
      <footer className={state.readOnly ? 'professional-output-status' : 'professional-output-actions'}>
        <p><strong>{state.readOnly ? statusCopy.title : complete ? '十项证据填写完整，可提交复核' : '可先保存草稿'}</strong><small>{state.readOnly ? statusCopy.description : submitBlockedByReturn ? '请先修改字段或证据，再次提交才会形成新版本。' : '保存草稿不会提交；提交前请逐项核对证据来源和照片挂接。'}</small></p>
        {!state.readOnly ? <div>
          <button disabled={Boolean(saving)} onClick={() => void persist('draft')} type="button"><Icon name="file" size={17} />{saving === 'draft' ? '正在保存' : state.workflow.state === 'revising' ? '保存修订' : '保存草稿'}</button>
          <button className="is-primary" data-primary-action="true" disabled={!complete || submitBlockedByReturn || Boolean(saving)} type="submit"><Icon name="check" size={17} />{saving === 'submit' ? '正在提交' : state.workflow.state === 'revising' ? '再次提交教师复核' : '提交教师复核'}</button>
        </div> : null}
      </footer>
    </form>
  );
}

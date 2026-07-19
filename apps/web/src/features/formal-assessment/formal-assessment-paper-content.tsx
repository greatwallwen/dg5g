import React from 'react';
import type {
  AssessmentAnswers,
  AssessmentDraftAnswers,
  AssessmentDraftDto,
  AssessmentPaper,
  IssuedAssessmentPaper,
} from '@/platform/formal-assessment-contract';
import {
  formatAssessmentTime,
  type PausedIssuedAssessment,
} from './formal-assessment-client-state';

export function readAssessmentAnswers(formData: FormData): AssessmentAnswers {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === 'string' ? value : '';
  };
  const strings = (name: string) => formData.getAll(name).filter(
    (value): value is string => typeof value === 'string',
  );
  return {
    evidenceClassification: text('evidenceClassification'),
    linkReconstruction: strings('linkReconstruction'),
    defectiveOutputRevision: strings('defectiveOutputRevision'),
    professionalConclusion: {
      confirmedFact: text('professionalConclusion.confirmedFact'),
      evidenceGap: text('professionalConclusion.evidenceGap'),
      risk: text('professionalConclusion.risk'),
      action: text('professionalConclusion.action'),
    },
  };
}

export function FormalAssessmentQuestions({
  draft,
  paper,
  readOnly = false,
}: {
  draft: AssessmentDraftAnswers;
  paper: AssessmentPaper;
  readOnly?: boolean;
}) {
  return <>{paper.questions.map((question, questionIndex) => (
    <fieldset data-assessment-question={question.id} key={question.id}>
      <legend><span>{String(questionIndex + 1).padStart(2, '0')}</span>{question.prompt}</legend>
      <p>{question.helpText}</p>
      {question.kind === 'single-choice'
        ? <div className="formal-assessment-options">{question.options?.map((option) => (
          <label key={option.id}>
            <input
              defaultChecked={draft.evidenceClassification === option.id}
              disabled={readOnly}
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
              defaultValue={draft.linkReconstruction?.[index] ?? ''}
              disabled={readOnly}
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
              defaultChecked={draft.defectiveOutputRevision?.includes(option.id) ?? false}
              disabled={readOnly}
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
          <ConclusionField defaultValue={draft.professionalConclusion?.confirmedFact} label="已确认事实" name="confirmedFact" readOnly={readOnly} />
          <ConclusionField defaultValue={draft.professionalConclusion?.evidenceGap} label="证据缺口" name="evidenceGap" readOnly={readOnly} />
          <ConclusionField defaultValue={draft.professionalConclusion?.risk} label="业务风险" name="risk" readOnly={readOnly} />
          <ConclusionField defaultValue={draft.professionalConclusion?.action} label="复核动作" name="action" readOnly={readOnly} />
        </div>
        : null}
    </fieldset>
  ))}</>;
}

function ConclusionField({
  defaultValue,
  label,
  name,
  readOnly,
}: {
  defaultValue?: string;
  label: string;
  name: keyof NonNullable<AssessmentDraftAnswers['professionalConclusion']>;
  readOnly: boolean;
}) {
  return (
    <label>
      <span>{label}</span>
      <textarea
        defaultValue={defaultValue ?? ''}
        disabled={readOnly}
        minLength={14}
        name={`professionalConclusion.${name}`}
        required
        rows={3}
      />
    </label>
  );
}

export function PausedAssessmentView({
  issued,
  remainingSeconds,
  message = '',
  onRetry,
  retrying = false,
}: {
  issued: PausedIssuedAssessment;
  remainingSeconds: number;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <section
      aria-readonly="true"
      className="formal-assessment-paper"
      data-assessment-id={issued.assessmentId}
      data-assessment-state="paused"
      data-motion="paused"
      data-primary-action-policy={message && onRetry ? 'exactly-one' : 'none'}
    >
      <header>
        <div>
          <span>{issued.paper.nodeId} · 正式测试已暂停</span>
          <h1>{issued.paper.title}</h1>
          <p>教师恢复前，完整草稿保持只读；暂停不会消耗剩余作答时间。</p>
        </div>
        <div className="formal-assessment-meta">
          <strong aria-live="polite" data-assessment-timer data-timer-state="frozen">
            {formatAssessmentTime(remainingSeconds)}
          </strong>
          <small>题目版本 {issued.paper.questionVersion} · 草稿 V{issued.draft.revision}</small>
        </div>
      </header>

      <FormalAssessmentQuestions draft={issued.draft.answers} paper={issued.paper} readOnly />

      {message ? (
        <div className="formal-assessment-error" role="alert">
          <p>{message}</p>
          {onRetry ? (
            <button disabled={retrying} onClick={onRetry} type="button">
              {retrying ? '正在恢复测试' : '重新恢复测试'}
            </button>
          ) : null}
        </div>
      ) : null}
      <footer>
        <p>等待教师恢复同一课堂测试；系统不会保存、提交或创建新测试。</p>
      </footer>
    </section>
  );
}

export function ExpiredAssessmentView({
  allowRestart = true,
  issued,
  draft,
  message,
}: {
  allowRestart?: boolean;
  issued: IssuedAssessmentPaper;
  draft: AssessmentDraftDto;
  message: string;
}) {
  const values = flattenDraft(draft.answers);
  return (
    <section className="formal-assessment-entry" data-assessment-state="expired">
      <span>{issued.paper.nodeId} · 正式测试已到时</span>
      <h1>测试已到时，未形成成绩</h1>
      <p>{message || '本次没有生成正式测试成绩。最近一次成功保存的草稿保留为只读。'}</p>
      <div aria-label="已保存草稿（只读）" className="formal-assessment-expired-draft">
        <strong>已保存草稿 · 只读 · V{draft.revision}</strong>
        {values.length > 0
          ? <ul>{values.map(([key, value]) => <li key={key}><span>{key}</span><p>{value}</p></li>)}</ul>
          : <p>本次没有成功保存的答案。</p>}
      </div>
      {allowRestart ? (
        <a data-primary-action="true" href={`/learn/${issued.paper.nodeId}/test?restart=true`}>
          开始新测试
        </a>
      ) : null}
    </section>
  );
}

function flattenDraft(answers: AssessmentDraftAnswers): Array<[string, string]> {
  const values: Array<[string, string]> = [];
  if (answers.evidenceClassification) values.push(['证据分类', answers.evidenceClassification]);
  if (answers.linkReconstruction?.length) values.push(['链路重建', answers.linkReconstruction.join(' → ')]);
  if (answers.defectiveOutputRevision?.length) values.push(['成果修订', answers.defectiveOutputRevision.join('、')]);
  for (const [key, value] of Object.entries(answers.professionalConclusion ?? {})) {
    if (value) values.push([key, value]);
  }
  return values;
}

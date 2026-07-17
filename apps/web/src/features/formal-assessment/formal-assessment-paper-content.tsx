import React from 'react';
import type {
  AssessmentDraftAnswers,
  AssessmentDraftDto,
  AssessmentPaper,
  IssuedAssessmentPaper,
} from '@/platform/formal-assessment-contract';

export function FormalAssessmentQuestions({
  draft,
  paper,
}: {
  draft: AssessmentDraftAnswers;
  paper: AssessmentPaper;
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
          <ConclusionField defaultValue={draft.professionalConclusion?.confirmedFact} label="已确认事实" name="confirmedFact" />
          <ConclusionField defaultValue={draft.professionalConclusion?.evidenceGap} label="证据缺口" name="evidenceGap" />
          <ConclusionField defaultValue={draft.professionalConclusion?.risk} label="业务风险" name="risk" />
          <ConclusionField defaultValue={draft.professionalConclusion?.action} label="复核动作" name="action" />
        </div>
        : null}
    </fieldset>
  ))}</>;
}

function ConclusionField({
  defaultValue,
  label,
  name,
}: {
  defaultValue?: string;
  label: string;
  name: keyof NonNullable<AssessmentDraftAnswers['professionalConclusion']>;
}) {
  return (
    <label>
      <span>{label}</span>
      <textarea
        defaultValue={defaultValue ?? ''}
        minLength={14}
        name={`professionalConclusion.${name}`}
        required
        rows={3}
      />
    </label>
  );
}

export function ExpiredAssessmentView({
  issued,
  draft,
  message,
}: {
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
      <a data-primary-action="true" href={`/learn/${issued.paper.nodeId}/test?restart=true`}>
        开始新测试
      </a>
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

import { Icon } from '../../ui/foundation/icons.tsx';
import { studentRecordFieldLabel } from './student-record-field-label.ts';
import type { SelfStudyDocument } from './self-study-types.ts';

export function CorrectionSection({ document }: { document: SelfStudyDocument }) {
  const { content } = document;
  const counterexamples = content.kind === 'deep'
    ? content.counterexamples
    : [{ title: '常见错误', error: content.counterexample.error, correctionPath: content.counterexample.correctionPath }];
  return (
    <div className="self-study-correction-layout">
      <header><span>反例诊断</span><h2 id={`${document.nodeId}-correction-title`}>先找到错因，再沿改正路径补齐证据</h2></header>
      <div>
        {counterexamples.map((counterexample, index) => (
          <article data-self-study-counterexample={index + 1} key={`${counterexample.title}-${index}`}>
            <div><Icon name="close" size={19} /><span>错误做法</span><strong>{counterexample.title}</strong><p>{counterexample.error}</p></div>
            <ol><span>改正路径</span>{counterexample.correctionPath.map((step, stepIndex) => <li key={step}><i>{stepIndex + 1}</i>{step}</li>)}</ol>
          </article>
        ))}
      </div>
    </div>
  );
}

export function OutputSection({ document }: { document: SelfStudyDocument }) {
  const { content } = document;
  const template = content.kind === 'deep' ? content.outputTemplate : content.nodeRecordTemplate;
  const isTaskOutputNode = document.nodeId.endsWith('-N04');
  return (
    <div className="self-study-output-layout">
      <div className="self-study-output-template" data-self-study-output-template>
        <span>{isTaskOutputNode ? '任务成果表准备记录' : content.kind === 'deep' ? '节点整理记录模板' : '结构化节点记录'}</span>
        <h2 id={`${document.nodeId}-output-title`}>{document.nodeTitle} · 可复核记录</h2>
        {isTaskOutputNode ? (
          <p>当前就是{document.taskId}的任务成果页：先把前面节点的记录归集到表格，再进入成果表完成填写、保存、提交、退回修订和教师确认。</p>
        ) : (
          <p>本页用于整理这一节点的学习证据；任务成果表会在 {document.taskId} 的 N04 节点统一填写并提交复核。</p>
        )}
        <dl>{Object.entries(template).map(([field, value]) => <div key={field}><dt>{studentRecordFieldLabel(field)}</dt><dd>{templateValue(value)}</dd></div>)}</dl>
      </div>
      {content.kind === 'deep' ? (
        <div className="self-study-output-support">
          <article data-self-study-transfer>
            <span><Icon name="arrow" size={17} />迁移练习</span>
            <p><strong>场景：</strong>{content.transferTask.scenario}</p>
            <p><strong>交付物：</strong>{content.transferTask.deliverable}</p>
            <ul>{content.transferTask.successCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
          </article>
          <article data-self-study-rubric>
            <span><Icon name="check" size={17} />评价标准</span>
            <ol>{content.rubric.map(({ criterion, maxScore }) => <li key={criterion}><strong>{criterion}</strong><em>{maxScore} 分</em></li>)}</ol>
            <p>总分 {content.rubric.reduce((sum, item) => sum + item.maxScore, 0)} 分</p>
          </article>
        </div>
      ) : null}
    </div>
  );
}

function templateValue(value: unknown): string {
  if (typeof value === 'string') return value.trim() || '待填写';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.length ? value.map(templateValue).join('；') : '待填写';
  if (value && typeof value === 'object') {
    const fields = Object.keys(value as Record<string, unknown>);
    return fields.length ? fields.join('、') : '待填写';
  }
  return '待填写';
}

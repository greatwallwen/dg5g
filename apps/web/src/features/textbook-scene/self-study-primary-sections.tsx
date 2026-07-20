import { Icon, type IconName } from '../../ui/foundation/icons.tsx';
import type { DeepSelfStudyContent, SelfStudyDocument } from './self-study-types.ts';
import { AnnotatedEngineeringFigure } from './annotated-engineering-figure.tsx';

export function ProblemSection({ document }: { document: SelfStudyDocument }) {
  const { content } = document;
  const question = content.kind === 'deep' ? content.taskQuestion : document.nodeGoal;
  return (
    <div className="self-study-problem-grid">
      <div className="self-study-copy-block">
        <span>案例背景</span>
        <h2 id={`${document.nodeId}-problem-title`}>{question}</h2>
        {content.kind === 'deep' && content.beginnerScaffold ? (
          <BeginnerScaffold scaffold={content.beginnerScaffold} />
        ) : null}
        {content.caseBackground.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        {content.kind === 'deep' ? (
          <aside><strong>必要前置知识</strong><ul>{content.prerequisites.map((item) => <li key={item}>{item}</li>)}</ul></aside>
        ) : null}
      </div>
    </div>
  );
}

function BeginnerScaffold({ scaffold }: { scaffold: NonNullable<DeepSelfStudyContent['beginnerScaffold']> }) {
  return (
    <aside className="self-study-beginner-scaffold" data-beginner-scaffold="three-question">
      <header>
        <Icon name="spark" size={18} />
        <div>
          <span>新手先看这里</span>
          <strong>{scaffold.simpleMission}</strong>
        </div>
      </header>
      <p className="self-study-beginner-analogy">{scaffold.analogy}</p>
      <div className="self-study-beginner-questions">
        {scaffold.threeQuestions.map((question, index) => (
          <article data-beginner-question={question.id} key={question.id}>
            <span>{index + 1}</span>
            <h3>{question.question}</h3>
            <p><b>{question.evidenceType}</b>：{question.proves}</p>
            <small>不能证明：{question.cannotProve}</small>
            <ul>{question.outputFields.map((field) => <li key={field}>{field}</li>)}</ul>
          </article>
        ))}
      </div>
      <footer>
        <strong>做到什么算完成</strong>
        <ul>{scaffold.completionStandard.map((item) => <li key={item}>{item}</li>)}</ul>
      </footer>
    </aside>
  );
}

export function SelfStudyGlossary({ terms }: { terms: Array<{ term: string; definition: string }> }) {
  return (
    <aside className="self-study-glossary" data-self-study-glossary>
      <header><Icon name="book" size={18} /><span>术语查询</span></header>
      {terms.map(({ term, definition }) => (
        <details data-self-study-term={term} key={term}><summary>{term}</summary><p>{definition}</p></details>
      ))}
    </aside>
  );
}

export function FigureSection({ document }: { document: SelfStudyDocument }) {
  const { content } = document;
  return (
    <div className="self-study-figure-layout">
      <div>
        <span>带标注的工程关系图</span>
        <h2 id={`${document.nodeId}-figure-title`}>{content.kind === 'deep' ? '从图中找到判断所需证据' : '关系图与证据位置'}</h2>
        {content.kind === 'deep'
          ? content.annotatedFigures.map((figure, index) => (
            <div data-self-study-figure={figure.kind} key={`${figure.kind}-${index}`}>
              <AnnotatedEngineeringFigure evidenceLabels={figure.evidenceLabels} kind={figure.kind} />
            </div>
          ))
          : <RelationshipEvidenceFigure evidenceLabels={content.relationshipFigure.evidenceLabels} figureKind={content.relationshipFigure.kind} />}
      </div>
      {content.kind === 'deep' ? (
        <div className="self-study-figure-support">
          <aside className="self-study-evidence-rules">
            <span>判断依据</span>
            {content.evidenceRules.map((rule) => (
              <article key={rule.claim}>
                <strong>{rule.claim}</strong>
                <ul>{rule.requiredEvidence.map((item) => <li key={item}>{item}</li>)}</ul>
                <p><Icon name="link" size={14} />为什么：{rule.reason}</p>
              </article>
            ))}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function RelationshipEvidenceFigure({ figureKind, evidenceLabels }: { figureKind: string; evidenceLabels: string[] }) {
  const descriptor = figureDescriptor(figureKind);
  return (
    <figure className={`self-study-engineering-figure is-${descriptor.kind}`} data-self-study-figure={descriptor.kind}>
      <figcaption><Icon name={descriptor.icon} size={20} /><span>{descriptor.title}</span></figcaption>
      <div>
        {evidenceLabels.map((label, index) => (
          <article key={`${label}-${index}`}>
            <span>{index + 1}</span>
            <Icon name={descriptor.stepIcons[index % descriptor.stepIcons.length]!} size={24} />
            <strong>{label}</strong>
            {index < evidenceLabels.length - 1 ? <Icon name="arrow" size={17} /> : null}
          </article>
        ))}
      </div>
    </figure>
  );
}

export function StepsSection({ document }: { document: SelfStudyDocument }) {
  const { content } = document;
  const examples = content.kind === 'deep'
    ? content.examples
    : [{ title: '完整示例', evidence: content.example.evidence, reasoning: content.reasoningSteps, conclusion: content.example.conclusion }];
  return (
    <div className="self-study-steps-layout">
      <div>
        <span>逐步推理</span>
        <h2 id={`${document.nodeId}-steps-title`}>证据 → 判断 → 结论</h2>
        <ol className="self-study-reasoning">
          {content.reasoningSteps.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}
        </ol>
      </div>
      <div className="self-study-examples">
        {examples.map((example, index) => (
          <article data-self-study-example={index + 1} key={`${example.title}-${index}`}>
            <header><Icon name="check" size={17} /><strong>{example.title}</strong></header>
            <div><span>证据</span><ul>{example.evidence.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div><span>推理</span><ol>{example.reasoning.map((item) => <li key={item}>{item}</li>)}</ol></div>
            <p><strong>结论：</strong>{example.conclusion}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function figureDescriptor(kind: string): { kind: string; title: string; icon: IconName; stepIcons: IconName[] } {
  if (kind === 'topology') return { kind, title: '设备位置—身份—连接方向证据链', icon: 'bbu', stepIcons: ['room', 'bbu', 'link'] };
  if (kind === 'antenna') return { kind, title: '天线方位角—下倾角—挂高证据链', icon: 'aau', stepIcons: ['radio', 'target', 'gps'] };
  if (kind === 'complaint') return { kind, title: '投诉条件—复现动作—网络留痕证据链', icon: 'complaint', stepIcons: ['gps', 'complaint', 'log', 'signaling'] };
  return { kind, title: '节点对象与证据关系图', icon: 'layers', stepIcons: ['target', 'link', 'file'] };
}

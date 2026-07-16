import Link from 'next/link';
import React from 'react';
import type {
  AssessmentDiagnosis,
  RemediationTarget,
} from '@/platform/formal-assessment-contract';

const dimensionLabels: Record<keyof AssessmentDiagnosis['dimensions'], string> = {
  evidenceClassification: '证据分类',
  linkReconstruction: '链路重建',
  defectiveOutputRevision: '成果修订',
  professionalConclusion: '职业结论',
};

export function FormalAssessmentResult({ result }: { result: AssessmentDiagnosis }) {
  return (
    <section
      aria-live="polite"
      className={`formal-assessment-result ${result.passed ? 'is-passed' : 'is-remediation'}`}
      data-assessment-result={result.passed ? 'passed' : 'remediation'}
    >
      <header>
        <div>
          <span>{result.nodeId} · 服务端判分完成</span>
          <h2>{result.passed ? '正式测试达标' : '完成定向再学后可重试'}</h2>
          <p>{result.passed ? '本次成绩已写入学习档案。' : '以下诊断来自本次实际作答，历史成绩会继续保留。'}</p>
        </div>
        <strong>{result.totalScore}<small>/ 100</small></strong>
      </header>
      <div className="formal-assessment-dimensions">
        {Object.entries(result.dimensions).map(([key, dimension]) => (
          <article data-assessment-dimension={key} key={key}>
            <div>
              <span>{dimensionLabels[key as keyof typeof dimensionLabels]}</span>
              <strong>{dimension.score} / {dimension.maxScore}</strong>
            </div>
            <p>{dimension.feedback}</p>
            {dimension.remediationTarget
              ? <RemediationLink target={dimension.remediationTarget} />
              : <span className="formal-assessment-secure">本项已达到要求</span>}
          </article>
        ))}
      </div>
      <footer>
        {result.passed
          ? <Link href={`/learn/${encodeURIComponent(result.nodeId)}`}>返回节点继续学习</Link>
          : <p>依次完成上方定向活动，再回到本页即可创建新的正式测试。</p>}
      </footer>
    </section>
  );
}

export function FormalAssessmentRemediationNotice({
  nodeId,
  targets,
}: {
  nodeId: string;
  targets: RemediationTarget[];
}) {
  return (
    <section className="formal-assessment-result is-remediation" data-assessment-entry="remediation-required">
      <header>
        <div>
          <span>{nodeId} · 重试门禁</span>
          <h1>先完成定向再学</h1>
          <p>上次正式测试未达标。完成全部指定活动后，系统会自动开放新测试。</p>
        </div>
      </header>
      <div className="formal-assessment-remediation-list">
        {targets.map((target) => <RemediationLink key={`${target.nodeId}:${target.sectionId}`} target={target} />)}
      </div>
      <Link className="is-secondary" href={`/learn/${encodeURIComponent(nodeId)}`}>返回节点学习</Link>
    </section>
  );
}

function RemediationLink({ target }: { target: RemediationTarget }) {
  return (
    <Link href={`/learn/${encodeURIComponent(target.nodeId)}?section=${encodeURIComponent(target.sectionId)}`}>
      前往 {target.nodeId} · {sectionLabel(target.sectionId)}
    </Link>
  );
}

function sectionLabel(sectionId: string): string {
  return ({
    understand: '理解对象',
    evidence: '证据研判',
    explain: '链路解释',
    practice: '岗位练习',
  } as Record<string, string>)[sectionId] ?? sectionId;
}

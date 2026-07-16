import Link from 'next/link';
import { Icon } from '../../ui/foundation/icons.tsx';
import { RoleHomeHeader } from '../home/role-home-header.tsx';
import type {
  P1PortfolioDetailFieldViewModel,
  P1PortfolioDetailViewModel,
} from './p1-portfolio-detail-model.ts';

export function P1PortfolioDetailView({
  displayName,
  model,
}: {
  displayName: string;
  model: P1PortfolioDetailViewModel;
}) {
  return (
    <main
      className="role-home-shell p1-portfolio-detail-shell"
      data-motion="paused"
      data-portfolio-delivery={model.deliveryState}
      data-portfolio-detail={model.taskId}
      data-portfolio-formation={model.formation}
      data-primary-action-policy="exactly-one"
      data-ui-surface="dark"
    >
      <RoleHomeHeader displayName={displayName} role="student" />
      <div className="p1-portfolio-detail-body">
        <nav aria-label="成果详情导航" className="p1-project-breadcrumb">
          <Link href="/student/projects/p1/portfolio">项目成果包</Link>
          <Icon name="arrow" size={14} />
          <span>{model.taskId} · 成果详情</span>
        </nav>

        <header className={`p1-detail-hero is-${model.deliveryState}`}>
          <div>
            <span className="p1-project-kicker">{model.taskId} · {model.taskTitle}</span>
            <h1>{model.outputTitle}</h1>
            <p>{model.formation === 'unformed'
              ? '当前尚无实际成果版本。完成岗位活动并填写、提交后，这里才会出现字段、证据与复核记录。'
              : '以下内容直接读取不可变成果版本、字段证据、教师复核和正式测试诊断。'}</p>
          </div>
          <dl>
            <div><dt>当前状态</dt><dd>{model.statusLabel}</dd></div>
            {model.currentVersion === undefined ? null : <div><dt>当前版本</dt><dd>v{model.currentVersion}</dd></div>}
            {model.originLabel ? <div><dt>数据来源</dt><dd>{model.originLabel}</dd></div> : null}
          </dl>
        </header>

        {model.formation === 'unformed'
          ? <UnformedDetail />
          : <>
            <VersionHistory model={model} />
            <ReviewTimeline model={model} />
            <AssessmentDiagnosis model={model} />
          </>}

        <footer className="p1-detail-actions">
          <Link href="/student/projects/p1/portfolio"><Icon name="arrow" size={16} />返回成果包</Link>
          <Link className="is-primary" data-primary-action="true" href={model.outputHref}>
            {model.formation === 'unformed' ? '继续形成成果' : '返回当前任务'}<Icon name="arrow" size={16} />
          </Link>
        </footer>
      </div>
    </main>
  );
}

function UnformedDetail() {
  return <section className="p1-detail-unformed" data-portfolio-unformed>
    <Icon name="file" size={28} />
    <div>
      <h2>成果尚未形成</h2>
      <p>系统不会用成果名称、演示分数或空字段伪造可交付成果。请先完成真实填写和提交。</p>
    </div>
  </section>;
}

function VersionHistory({ model }: { model: P1PortfolioDetailViewModel }) {
  return <section className="p1-detail-versions" aria-labelledby="p1-detail-versions-title">
    <header><div><span className="p1-project-kicker">不可变版本</span><h2 id="p1-detail-versions-title">字段、证据与来源</h2></div><small>共 {model.versions.length} 个版本</small></header>
    {model.versions.map((version) => <article
      className={version.isCurrent ? 'is-current' : ''}
      data-portfolio-version={version.version}
      key={version.version}
    >
      <header><h3>V{version.version}</h3><span>{version.isCurrent ? '当前版本' : '历史版本'}</span></header>
      {version.diffFromPrevious ? <VersionDiff diff={version.diffFromPrevious} /> : <p className="p1-detail-no-diff">首个版本，暂无可比较修订。</p>}
      <div className="p1-detail-field-grid">
        {version.fields.map((field) => <PortfolioField field={field} key={field.key} />)}
      </div>
    </article>)}
  </section>;
}

function PortfolioField({ field }: { field: P1PortfolioDetailFieldViewModel }) {
  return <section className={field.unknownField ? 'is-integrity-warning' : ''} data-portfolio-field={field.key}>
    <header><span>{field.label}</span>{field.unknownField ? <em>数据完整性异常</em> : null}</header>
    <p>{field.displayValue}</p>
    <div className="p1-detail-evidence-list">
      {field.evidence.length === 0 ? <small>未挂接证据</small> : field.evidence.map((item) => <figure data-portfolio-evidence={item.evidenceId} key={item.evidenceId}>
        <img alt={item.title} src={item.assetUrl} />
        <figcaption><strong>{item.title}</strong><span>{item.originLabel}</span></figcaption>
      </figure>)}
    </div>
    <div className="p1-detail-source-list">
      {field.sources.length === 0 ? <small>无可追溯来源</small> : field.sources.map((source) => <Link
        data-portfolio-source={`${source.sourceNodeId}:${source.sourceAttemptId}`}
        href={source.href}
        key={`${source.sourceNodeId}:${source.sourceAttemptId}`}
      ><Icon name="link" size={14} />{source.label}</Link>)}
    </div>
    {field.annotations.map((annotation) => <blockquote key={`${annotation.reviewId}:${annotation.comment}`}>
      <span>{annotation.reviewStatus === 'returned' ? '退回批注' : '确认批注'}</span>
      <p>{annotation.comment}</p>
    </blockquote>)}
  </section>;
}

function VersionDiff({ diff }: { diff: NonNullable<P1PortfolioDetailViewModel['versions'][number]['diffFromPrevious']> }) {
  return <section className="p1-detail-diff" data-version-diff={`${diff.fromVersion}:${diff.toVersion}`}>
    <header><strong>V{diff.fromVersion} → V{diff.toVersion} 修订</strong><span>{diff.changedFields.length} 个字段变化</span></header>
    {diff.changedFields.length === 0 ? <p>字段、证据和来源均无变化。</p> : <ul>{diff.changedFields.map((field) => <li key={field.fieldKey}>
      <strong>{field.fieldKey}</strong>
      <span>{field.kind === 'added' ? '新增' : field.kind === 'removed' ? '移除' : '已修改'}</span>
      {field.addedEvidenceIds.length + field.removedEvidenceIds.length > 0
        ? <small>证据 +{field.addedEvidenceIds.length} / -{field.removedEvidenceIds.length}</small> : null}
    </li>)}</ul>}
    {diff.integrityWarnings.map((warning) => <p className="is-warning" key={warning}>{warning}</p>)}
  </section>;
}

function ReviewTimeline({ model }: { model: P1PortfolioDetailViewModel }) {
  return <section className="p1-detail-reviews" aria-labelledby="p1-detail-reviews-title">
    <header><span className="p1-project-kicker">教师复核</span><h2 id="p1-detail-reviews-title">退回与确认记录</h2></header>
    {model.reviewTimeline.length === 0 ? <p>尚无教师复核记录。</p> : <ol>{model.reviewTimeline.map((review) => <li data-review-history={review.reviewId} key={review.reviewId}>
      <header><strong>{review.status === 'returned' ? '教师退回' : '教师确认'} · V{review.outputVersion}</strong><span>{review.originLabel}</span></header>
      <p>{review.feedback ?? '本次仅记录状态，无整体意见。'}</p>
      {review.score === undefined ? null : <small>量规得分 {review.score}</small>}
    </li>)}</ol>}
  </section>;
}

function AssessmentDiagnosis({ model }: { model: P1PortfolioDetailViewModel }) {
  if (!model.assessment) return <section className="p1-detail-assessment"><h2>正式测试诊断</h2><p>尚未参加正式测试。</p></section>;
  return <section className="p1-detail-assessment" aria-labelledby="p1-detail-assessment-title">
    <header><div><span className="p1-project-kicker">正式测试诊断 · {model.assessment.originLabel}</span><h2 id="p1-detail-assessment-title">总分 {model.assessment.totalScore}</h2></div><Link href={model.assessment.nodeHref}>对应能力节点<Icon name="arrow" size={14} /></Link></header>
    <div>{model.assessment.dimensions.map((dimension) => <article data-assessment-dimension={dimension.key} key={dimension.key}>
      <span>{dimension.label}</span><strong>{dimension.score} / {dimension.maxScore}</strong><p>{dimension.feedback}</p>
    </article>)}</div>
    <small>题目版本 {model.assessment.questionVersion}</small>
  </section>;
}

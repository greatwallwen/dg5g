import type { ReviewField, ReviewQueueItem } from './output-review-types';

export function OutputReviewDetail({
  selected,
  fields,
  annotations,
  onAnnotationChange,
}: {
  selected: ReviewQueueItem;
  fields: ReviewField[];
  annotations: Record<string, string>;
  onAnnotationChange: (fieldKey: string, value: string) => void;
}) {
  return (
    <div className="output-review-detail" data-review-origin={selected.detail.origin}>
      <div className="output-review-facts">
        <span><small>学生</small><strong>{selected.studentName}</strong></span>
        <span><small>当前版本</small><strong>V{selected.currentVersion}</strong></span>
        <span><small>版本总数</small><strong>{selected.detail.versions.length} 个</strong></span>
        <span><small>当前状态</small><strong>{selected.detail.statusLabel}</strong></span>
      </div>
      <section className="output-review-fields" aria-label="成果字段与证据">
        <header><span>成果字段</span><strong>值、证据、来源与缺口同屏核验</strong></header>
        {fields.map((field) => (
          <article className="output-review-field" data-review-field={field.key} key={field.key}>
            <header><strong>{field.label}</strong><code>{field.key}</code></header>
            <p>{field.displayValue}</p>
            <div className="output-review-evidence">
              {field.evidence.length > 0 ? field.evidence.map((evidence) => (
                <figure data-review-evidence={evidence.evidenceId} key={evidence.evidenceId}>
                  <img alt={`${field.label}：${evidence.title}`} loading="lazy" src={evidence.assetUrl} />
                  <figcaption>
                    <strong>{evidence.title}</strong>
                    <span>{evidence.metadata.annotation ?? evidence.originLabel}</span>
                    <small>{evidence.evidenceId} · {evidence.originLabel}</small>
                  </figcaption>
                </figure>
              )) : <small>未挂接媒体证据，必须核验下方缺口登记。</small>}
            </div>
            {field.sources.length > 0 ? (
              <div className="output-review-sources">
                {field.sources.map((source) => (
                  <a data-review-source={`${source.sourceNodeId}:${source.sourceAttemptId}`}
                    href={source.href} key={`${source.sourceNodeId}:${source.sourceAttemptId}`}>
                    {source.sourceNodeId} · {source.sourceAttemptId}
                  </a>
                ))}
              </div>
            ) : null}
            {field.evidenceGap ? (
              <div className="output-review-gap" data-review-gap={field.key}>
                <span><b>证据缺口</b>{field.evidenceGap.gapText}</span>
                <span data-review-next-action={field.key}><b>下一动作</b>{field.evidenceGap.nextActionText}</span>
              </div>
            ) : null}
            {field.annotations.length > 0 ? (
              <ul className="output-review-existing-notes">
                {field.annotations.map((annotation) => (
                  <li key={annotation.reviewId}>
                    {annotation.reviewStatus === 'returned' ? '退回' : '确认'}：{annotation.comment}
                  </li>
                ))}
              </ul>
            ) : null}
            <label data-review-annotation={field.key}>
              <span>本次字段批注</span>
              <textarea
                onChange={(event) => onAnnotationChange(field.key, event.target.value)}
                placeholder="指出该字段的证据、判断或修订要求"
                value={annotations[field.key] ?? ''}
              />
            </label>
          </article>
        ))}
      </section>
      <VersionHistory selected={selected} />
      <AssessmentDiagnostics selected={selected} />
    </div>
  );
}

function VersionHistory({ selected }: { selected: ReviewQueueItem }) {
  const diffs = selected.detail.versions.flatMap(({ diffFromPrevious }) => (
    diffFromPrevious ? [diffFromPrevious] : []
  ));
  return (
    <section className="output-review-version-diff">
      <header><span>版本变化</span><strong>退回前后差异可追溯</strong></header>
      {diffs.length > 0 ? diffs.map((diff) => (
        <article data-review-version-diff={`${diff.fromVersion}:${diff.toVersion}`}
          key={`${diff.fromVersion}-${diff.toVersion}`}>
          <strong>V{diff.fromVersion} → V{diff.toVersion}</strong>
          {diff.changedFields.map((change) => (
            <div key={change.fieldKey}>
              <b>{fieldLabel(selected, change.fieldKey)}</b>
              <span>原值：{formatOutputFieldValue(change.beforeValue)}</span>
              <span>新值：{formatOutputFieldValue(change.afterValue)}</span>
              {change.beforeEvidenceGap || change.afterEvidenceGap ? (
                <>
                  <small>缺口登记：{change.beforeEvidenceGap?.gapText ?? '无'} → {change.afterEvidenceGap?.gapText ?? '无'}</small>
                  <small>下一动作：{change.beforeEvidenceGap?.nextActionText ?? '无'} → {change.afterEvidenceGap?.nextActionText ?? '无'}</small>
                </>
              ) : null}
              {change.addedEvidenceIds.length > 0 ? <small>新增证据：{change.addedEvidenceIds.join('、')}</small> : null}
              {change.removedEvidenceIds.length > 0 ? <small>移除证据：{change.removedEvidenceIds.join('、')}</small> : null}
              {change.addedSources.length > 0 ? <small>新增来源：{change.addedSources.map(formatSource).join('、')}</small> : null}
              {change.removedSources.length > 0 ? <small>移除来源：{change.removedSources.map(formatSource).join('、')}</small> : null}
            </div>
          ))}
          {diff.integrityWarnings.map((warning) => <p key={warning}>{warning}</p>)}
        </article>
      )) : <p>当前为首次提交版本，暂无历史差异。</p>}
      {selected.detail.reviewTimeline.length > 0 ? (
        <ol>
          {selected.detail.reviewTimeline.map((review) => (
            <li data-review-history={review.reviewId} key={review.reviewId}>
              <strong>V{review.outputVersion} · {review.status === 'returned' ? '教师退回' : '教师确认'}</strong>
              <span>{review.feedback ?? '未填写整体反馈'}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function AssessmentDiagnostics({ selected }: { selected: ReviewQueueItem }) {
  const assessment = selected.detail.assessment;
  return (
    <section className="output-review-diagnostics" data-review-diagnostics>
      <header><span>N02 正式测试诊断</span><strong>{assessment
        ? `${assessment.totalScore} 分 · ${assessment.originLabel}`
        : '没有可核验的正式测试记录'}</strong></header>
      {assessment ? (
        <div>
          {assessment.dimensions.map((dimension) => (
            <article data-review-assessment-dimension={dimension.key} key={dimension.key}>
              <span>{dimension.label}</span>
              <strong>{dimension.score}/{dimension.maxScore}</strong>
              <p>{dimension.feedback}</p>
            </article>
          ))}
        </div>
      ) : <p>{selected.detail.assessmentLinkStatus === 'legacy-unlinked'
        ? '历史认证没有绑定具体测试作答，已停止猜测关联；不能展示四维诊断。'
        : '不能认证：学生需要先完成真实正式测试并达到 80 分。'}</p>}
    </section>
  );
}

export function formatOutputFieldValue(value: unknown): string {
  if (value === undefined || value === '') return '未填写';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(formatOutputFieldValue).join('、');
  if (isRecord(value) && 'value' in value) return formatOutputFieldValue(value.value);
  if (isRecord(value)) return JSON.stringify(value);
  return String(value);
}

function fieldLabel(selected: ReviewQueueItem, key: string): string {
  return selected.fieldSchema.find((field) => field.key === key)?.label ?? key;
}

function formatSource(source: { sourceNodeId: string; sourceAttemptId: string }): string {
  return `${source.sourceNodeId} · ${source.sourceAttemptId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

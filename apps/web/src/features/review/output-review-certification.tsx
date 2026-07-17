import type { ReviewQueueItem, ReviewRubricCriterion } from './output-review-types';

export function OutputReviewCertification({
  selected,
  scores,
  totalScore,
  blockers,
  feedback,
  submitting,
  onScoreChange,
  onFeedbackChange,
  onSubmit,
}: {
  selected: ReviewQueueItem;
  scores: Record<string, number>;
  totalScore: number;
  blockers: string[];
  feedback: string;
  submitting: 'return' | 'verify' | null;
  onScoreChange: (key: string, rawValue: string) => void;
  onFeedbackChange: (value: string) => void;
  onSubmit: (action: 'return' | 'verify') => void;
}) {
  return (
    <>
      <fieldset className="output-review-rubric">
        <legend>专业产出评价（当前 {totalScore}/100）</legend>
        {selected.rubric.map((criterion) => (
          <label data-review-rubric={criterion.key} key={criterion.key}>
            <span>{criterion.label} / {criterion.maxScore}</span>
            <input
              max={criterion.maxScore}
              min={0}
              onChange={(event) => onScoreChange(criterion.key, event.target.value)}
              type="number"
              value={Object.hasOwn(scores, criterion.key) ? scores[criterion.key] : ''}
            />
          </label>
        ))}
      </fieldset>
      <div className="output-review-disabled-reasons" data-review-disabled-reasons
        data-state={blockers.length > 0 ? 'blocked' : 'ready'} id="review-certification-gates">
        <strong>{blockers.length > 0 ? '认证门禁尚未满足' : '认证门禁已满足'}</strong>
        {blockers.length > 0 ? <ul>{blockers.map((item) => <li key={item}>{item}</li>)}</ul>
          : <p>量规达标，且已核验真实正式测试记录。</p>}
      </div>
      <label>
        <span>教师整体反馈</span>
        <textarea
          onChange={(event) => onFeedbackChange(event.target.value)}
          placeholder="指出证据缺口、判断问题和下一步改正路径（退回至少 8 个字符）"
          value={feedback}
        />
      </label>
      <div className="teacher-review-actions">
        <button data-review-action="return" disabled={submitting !== null}
          onClick={() => onSubmit('return')} type="button">
          {submitting === 'return' ? '正在退回…' : '退回修订'}
        </button>
        <button aria-describedby="review-certification-gates" data-review-action="verify"
          disabled={submitting !== null || blockers.length > 0}
          onClick={() => onSubmit('verify')} type="button">
          {submitting === 'verify' ? '正在认证…' : '确认认证并冻结成绩'}
        </button>
      </div>
    </>
  );
}

export function certificationBlockers(input: {
  rubric: ReviewRubricCriterion[];
  scores: Record<string, number>;
  assessment?: { passed: boolean; origin: 'demo' | 'user' };
}): string[] {
  const blockers: string[] = [];
  const complete = input.rubric.every(({ key }) => (
    Object.hasOwn(input.scores, key) && Number.isFinite(input.scores[key])
  ));
  if (!complete) {
    blockers.push('请完成全部量规评分。');
  } else {
    const criterionBlockers = input.rubric.flatMap(({ key, label, maxScore }) => {
      const score = input.scores[key]!;
      if (score > maxScore) return [`${label}不得超过 ${maxScore} 分。`];
      const minimum = maxScore / 2;
      return score < minimum ? [`${label}不得低于 ${minimum} 分。`] : [];
    });
    blockers.push(...criterionBlockers);
    const total = input.rubric.reduce((sum, { key }) => sum + input.scores[key]!, 0);
    if (criterionBlockers.length === 0 && total < 80) blockers.push('量规总分必须达到 80 分。');
  }
  if (!input.assessment?.passed || input.assessment.origin !== 'user') {
    blockers.push('当前没有可用于认证的真实正式测试达标记录。');
  }
  return blockers;
}

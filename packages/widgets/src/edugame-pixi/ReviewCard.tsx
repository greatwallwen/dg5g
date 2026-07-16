import { compactMistakes, type LearningMistake, type LearningRecord } from '@dgbook/edugame-core';
import type { AnswerRow } from './answer-rows';

export interface ReviewCardProps {
  record: LearningRecord;
  phase: 'playing' | 'passed' | 'failed';
  best: number;
  onRetry: () => void;
  onDrill: () => void;
  drillCount: number;
  kpName: (kp: string) => string;
  badges?: string[];
  answerRows?: AnswerRow[];
}

export function ReviewCard({ record, phase, best, onRetry, onDrill, drillCount, kpName, badges = [], answerRows = [] }: ReviewCardProps) {
  const failed = phase === 'failed';
  const stars = Math.max(0, Math.min(3, record.stars));
  const badgeLabels = badges.length ? badges.slice(0, 3) : ['准确判断', '连续命中', '复盘完成'];
  const earnedBadge = failed ? '证据修复' : badgeLabels[Math.max(0, Math.min(stars - 1, badgeLabels.length - 1))] ?? '稳定通过';
  const rank = rankFor(record.score, failed);
  const bestDelta = Math.max(0, best - record.score);
  const nextChallenge = failed ? '先完成薄弱点再练' : stars >= 3 ? '挑战零失误' : '冲刺三星';
  const statusText = failed ? '还差一条证据链' : '已形成稳定判断';
  const guidance = failed
    ? '先复盘薄弱知识点，再重试本局；错误项会继续保留在学习记录里。'
    : '本轮判断已通过，可以继续阅读案例或挑战更高连击。';
  const route = failed || drillCount > 0
    ? ['锁定薄弱点', '只练相关证据', '回到完整挑战']
    : ['保持连击', '压缩用时', '挑战零失误'];
  const errorTrail = record.events
    .filter((event) => ['answer_wrong', 'drag_fail', 'match_fail'].includes(event.event_type))
    .slice(-4)
    .reverse();

  return (
    <section className="eg-review" data-edugame-phase={phase} data-edugame-review={failed ? 'failed' : 'passed'}>
      <header className="eg-review-head">
        <div><span className="eg-review-kicker">{failed ? '复盘建议' : '通关结果'}</span><strong>{statusText}</strong><p>{guidance}</p></div>
        <div className="eg-review-score"><span className="eg-review-num" data-edugame-score={record.score}>{record.score}</span><span className="eg-review-stars">{'★'.repeat(stars)}{'☆'.repeat(3 - stars)}</span><small>历史最高 {best}</small></div>
      </header>
      <ol className="eg-review-badges" data-edugame-review-badges aria-label="徽章达成">
        {badgeLabels.map((badge, index) => (
          <li key={badge} data-edugame-review-badge data-edugame-badge-state={!failed && index < stars ? 'unlocked' : 'locked'}>
            <span>{index + 1}</span><strong>{badge}</strong>
          </li>
        ))}
      </ol>
      <div className="eg-review-awards" data-edugame-review-awards>
        <Award id="rank" label="段位" value={rank.rank} note={rank.label} />
        <Award id="badge" label="徽章" value={earnedBadge} note={`${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`} />
        <Award id="best" label="历史" value={bestDelta ? `差 ${bestDelta} 分` : '本局最佳'} note={`最高 ${best}`} />
        <Award id="next" label="下一步" value={nextChallenge} note={record.mistakes.length ? `${record.mistakes.length} 个薄弱点` : '保持连击'} />
      </div>
      <ol className="eg-drill-route" data-edugame-drill-route>
        {route.map((step, index) => <li key={step} data-edugame-drill-step><span>{index + 1}</span><strong>{step}</strong></li>)}
      </ol>
      <dl className="eg-review-metrics" aria-label="本局数据">
        <Metric id="duration" label="用时" value={`${record.duration}s`} /><Metric id="events" label="操作" value={record.events.length} />
        <Metric id="mistakes" label="薄弱点" value={record.mistakes.length} /><Metric id="state" label="状态" value={record.completed ? '完成' : '待复盘'} />
      </dl>
      <div className="eg-review-block">
        <h4>薄弱知识点</h4>
        {record.mistakes.length === 0 ? <p className="eg-review-empty">没有明显薄弱点，判断稳定。</p> : <ul className="eg-review-list">{record.mistakes.map((mistake: LearningMistake) => <li key={mistake.kp}><strong>{kpName(mistake.kp)}</strong><span>错 {mistake.count} 次 · {mistake.reason}</span></li>)}</ul>}
        <small className="eg-review-summary">{compactMistakes(record.mistakes)}</small>
      </div>
      {errorTrail.length > 0 && (
        <div className="eg-review-block" data-edugame-error-trail>
          <h4>最近错误链路</h4>
          <ul className="eg-review-list eg-review-error-list">
            {errorTrail.map((event, index) => (
              <li key={`${event.time}-${index}`}>
                <strong>{payloadText(event.payload, 'chosen') || '未选择'}</strong>
                <span>应为 {payloadText(event.payload, 'expected') || kpName(event.kp ?? '')} · {payloadText(event.payload, 'reason') || '证据关系不匹配'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {answerRows.length > 0 && (
        <div className="eg-review-block" data-edugame-review-answers>
          <h4>答案参考</h4>
          <ul className="eg-review-list eg-review-answer-list">
            {answerRows.slice(0, 6).map((row) => <li key={`${row.source}-${row.target}`}><strong>{row.source}</strong><span>{row.target}</span></li>)}
          </ul>
        </div>
      )}
      <footer className="eg-review-foot">
        <div className="eg-review-actions">{failed && drillCount > 0 && <button type="button" className="eg-drill" data-edugame-review-cta="drill" onClick={onDrill}>只练薄弱点</button>}<button type="button" className="eg-retry" data-edugame-review-cta="retry" onClick={onRetry}>{failed ? '复盘后重试' : '再挑战一次'}</button></div>
        <small>{failed ? '目标：补齐证据链并减少错误。' : '目标：提高速度、连击和稳定性。'}</small>
      </footer>
    </section>
  );
}

function payloadText(payload: Record<string, unknown> | undefined, key: string): string {
  const value = payload?.[key];
  return typeof value === 'string' ? value : '';
}

function Award({ id, label, value, note }: { id: string; label: string; value: string; note: string }) {
  return <div data-edugame-award={id}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function Metric({ id, label, value }: { id: string; label: string; value: string | number }) {
  return <div data-edugame-review-metric={id}><dt>{label}</dt><dd>{value}</dd></div>;
}

function rankFor(score: number, failed: boolean): { rank: string; label: string } {
  if (failed) return { rank: '修复', label: '证据链待补齐' };
  if (score >= 95) return { rank: 'S', label: '专家级判断' };
  if (score >= 88) return { rank: 'A', label: '稳定交付' };
  if (score >= 75) return { rank: 'B', label: '基本达标' };
  return { rank: 'C', label: '需要复盘' };
}

import type { KpiMetric } from '@/platform/models';
import { Icon } from '@/ui/foundation/icons';
import type { GraphicTheme } from './graphic-system';

const checkpoints = [
  { id: 'route-start', label: '电梯口', detail: '投诉起点', state: '信号波动' },
  { id: 'route-boundary', label: 'A-B边界', detail: '切换尝试', state: '事件集中' },
  { id: 'route-canteen', label: '食堂入口', detail: '业务中断', state: '短时中断' },
  { id: 'route-end', label: '就餐区', detail: '业务恢复', state: '信号稳定' },
];

export function MobilityVisual({ compact = false, theme = 'light-engineering' }: { compact?: boolean; theme?: GraphicTheme }) {
  return (
    <div
      className={`mobility-visual engineering-graphic ${compact ? 'is-compact' : ''}`}
      data-graphic-system="engineering-line"
      data-graphic-theme={theme}
      data-playback-target="route-summary"
    >
      <div className="path-svg" aria-hidden="true">
        <svg viewBox="0 0 760 210" role="img">
          <path className="route-shadow" d="M35 106 C160 70 220 138 330 100 C446 58 490 144 610 104 C690 78 720 90 748 118" />
          <path className="route-main" d="M35 106 C160 70 220 138 330 100 C446 58 490 144 610 104 C690 78 720 90 748 118" />
          <path className="route-dash" d="M90 146 C190 184 252 174 342 140 C454 102 520 178 678 140" />
        </svg>
      </div>
      <div className="checkpoint-row">
        {checkpoints.map((item, index) => (
          <div className="checkpoint" data-playback-target={item.id} key={item.id}>
            <span className="checkpoint-ring">{index + 1}</span>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
            <em>{item.state}</em>
          </div>
        ))}
      </div>
      <div className="visual-legend">
        <span><i className="legend-line solid" />移动路径</span>
        <span><i className="legend-line dash" />信号强度波动</span>
        <span><Icon name="signaling" size={18} />切换事件</span>
      </div>
    </div>
  );
}

export function KpiEvidence({ metrics, theme = 'light-engineering' }: { metrics: KpiMetric[]; theme?: GraphicTheme }) {
  return (
    <div className="kpi-grid engineering-graphic" data-graphic-system="engineering-line" data-graphic-theme={theme}>
      {metrics.slice(0, 5).map((metric) => {
        const targetId = metric.id === 'handover' ? 'handover-rate' : metric.id === 'rebuild' ? 'rebuild-count' : metric.id;
        return (
          <div className={`kpi-card is-${metric.status}`} data-playback-target={targetId} id={targetId} key={metric.id}>
            <div className="kpi-icon">
              <Icon name={metric.status === 'pass' ? 'check' : metric.status === 'fail' ? 'kpi' : 'file'} size={22} />
            </div>
            <span>{metric.name}</span>
            <strong>{metric.current}</strong>
            <small>目标 {metric.target}</small>
            <em>{metric.status === 'pass' ? '已达标' : metric.status === 'fail' ? '未达标' : '待复核'}</em>
          </div>
        );
      })}
    </div>
  );
}

export function EvidenceTable({ metrics }: { metrics: KpiMetric[] }) {
  return (
    <table className="evidence-table">
      <thead>
        <tr>
          <th>维度</th>
          <th>关键指标</th>
          <th>当前值</th>
          <th>目标值</th>
          <th>状态</th>
          <th>来源</th>
        </tr>
      </thead>
      <tbody>
        {metrics.map((metric) => {
          const targetId = metric.id === 'handover' ? 'handover-rate-row' : metric.id === 'rebuild' ? 'rebuild-count-row' : `${metric.id}-row`;
          return (
            <tr data-playback-target={targetId} key={metric.id}>
              <td>{metric.dimension}</td>
              <td>{metric.name}</td>
              <td>{metric.current}</td>
              <td>{metric.target}</td>
              <td><span className={`status-pill is-${metric.status}`}>{metric.status === 'pass' ? '已达标' : metric.status === 'fail' ? '未达标' : '待复核'}</span></td>
              <td>{metric.source}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

import type { Task } from '@/platform/models';
import type { GraphicIconName } from '@/ui/foundation/icons';
import { GraphicNode, SemanticEdgeLine, type GraphicTheme } from './graphic-system';
import { EvidenceTable, KpiEvidence, MobilityVisual } from './mobility-visual';

export function ClassroomCoreVisual({ task, compact = false, theme = 'light-engineering' }: { task: Task; compact?: boolean; theme?: GraphicTheme }) {
  if (task.metrics.length > 0) return <MobilityVisual compact={compact} theme={theme} />;
  return <CollectionEvidenceVisual task={task} compact={compact} theme={theme} />;
}

export function ClassroomEvidenceBlock({ task, theme = 'light-engineering' }: { task: Task; theme?: GraphicTheme }) {
  if (task.metrics.length > 0) return <KpiEvidence metrics={task.metrics.slice(0, 4)} theme={theme} />;
  return (
    <div className="collection-evidence-grid engineering-graphic" data-graphic-system="engineering-line" data-graphic-theme={theme}>
      {task.standards.slice(0, 4).map((standard, index) => (
        <GraphicNode
          className="collection-evidence-card"
          detail={standard}
          icon={index === 0 ? 'target' : index === 1 ? 'log' : 'check'}
          key={standard}
          label={`复核点 ${index + 1}`}
          targetId={`p1-standard-${index + 1}`}
          tone={index === 0 ? 'evidence' : index === 1 ? 'review' : 'assessment'}
        />
      ))}
    </div>
  );
}

export function ClassroomEvidenceDetail({ task }: { task: Task }) {
  if (task.metrics.length > 0) return <EvidenceTable metrics={task.metrics.slice(0, 4)} />;
  return (
    <div className="collection-detail-table">
      <div><strong>输入证据</strong><span>{task.evidenceFrom}</span></div>
      <div><strong>复核标准</strong><span>{task.standards.join('、')}</span></div>
      <div><strong>交付成果</strong><span>{task.output.join('、')}</span></div>
    </div>
  );
}

export function ClassroomConclusion({ task, className }: { task: Task; className?: string }) {
  const target = task.metrics.length > 0 ? 'mobility-conclusion' : 'collection-conclusion';
  return <div className={className} data-playback-target={target}>{task.conclusion}</div>;
}

function CollectionEvidenceVisual({ task, compact = false, theme = 'light-engineering' }: { task: Task; compact?: boolean; theme?: GraphicTheme }) {
  const steps = collectionStepsForTask(task.taskId);
  return (
    <div
      className={`collection-visual engineering-graphic ${compact ? 'is-compact' : ''}`}
      data-graphic-system="engineering-line"
      data-graphic-theme={theme}
      data-playback-target="collection-flow"
    >
      <div className="collection-backdrop" />
      <div className="collection-flowline" aria-hidden="true" />
      <div className="collection-step-row">
        {steps.map((step, index) => (
          <GraphicNode
            className="collection-step"
            detail={step.detail}
            icon={step.icon}
            key={step.id}
            label={`${index + 1}. ${step.label}`}
            targetId={step.id}
            tone={index < 2 ? 'evidence' : 'assessment'}
          />
        ))}
      </div>
      <div className="collection-legend">
        <span><SemanticEdgeLine kind="evidence" />现场对象</span>
        <span><SemanticEdgeLine kind="output" />证据记录</span>
        <span><SemanticEdgeLine kind="assessment" />复核闭环</span>
      </div>
    </div>
  );
}

function collectionStepsForTask(taskId: string): Array<{ id: string; label: string; detail: string; icon: GraphicIconName }> {
  if (taskId === 'P1-T2') {
    return [
      { id: 'site-room', label: '室外对象', detail: '天馈、道路、建筑边界', icon: 'site' },
      { id: 'device-kit', label: '天馈参数', detail: '方位角、下倾角、高度', icon: 'aau' },
      { id: 'photo-log', label: '遮挡干扰', detail: '建筑、道路、外部干扰', icon: 'log' },
      { id: 'review-chain', label: '路线依据', detail: '证据支撑测试路线', icon: 'check' },
    ];
  }
  if (taskId === 'P1-T3') {
    return [
      { id: 'site-room', label: '投诉描述', detail: '时间、地点、业务现象', icon: 'complaint' },
      { id: 'device-kit', label: '终端业务', detail: '型号、业务、频次', icon: 'follow' },
      { id: 'photo-log', label: '网络证据', detail: '小区、KPI、日志', icon: 'kpi' },
      { id: 'review-chain', label: '复核线索', detail: '可派单、可定位', icon: 'check' },
    ];
  }
  return [
    { id: 'site-room', label: '站址/机房', detail: '站名、楼层、机房边界', icon: 'room' },
    { id: 'device-kit', label: '设备/配套', detail: 'AAU、BBU、RRU、电源', icon: 'rru' },
    { id: 'photo-log', label: '照片/日志', detail: '编号、坐标、采集时间', icon: 'log' },
    { id: 'review-chain', label: '复核证据链', detail: '对象、照片、日志互证', icon: 'check' },
  ];
}

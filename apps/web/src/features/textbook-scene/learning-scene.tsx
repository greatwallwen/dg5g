'use client';

import { Icon, type IconName } from '@/ui/foundation/icons';
import type { DemoTaskProfile, DemoUnit } from '@/features/platform/deep-textbook-demo-data';
import type { SelfStudyDocument, SelfStudySectionId } from './self-study-types.ts';
import { SelfStudyRenderer } from './self-study-renderer.tsx';

type LearningSceneProps = {
  document?: SelfStudyDocument;
  profile?: DemoTaskProfile;
  unit?: DemoUnit;
  completed: boolean;
  saving: boolean;
  onComplete: () => void;
  initialSection?: SelfStudySectionId;
  focusedActivityId?: string;
};

export function LearningScene({ document, profile, unit, completed, saving, onComplete, initialSection, focusedActivityId }: LearningSceneProps) {
  if (document) {
    return <SelfStudyRenderer
      completed={completed}
      document={document}
      focusedActivityId={focusedActivityId}
      initialSection={initialSection}
      onComplete={onComplete}
      saving={saving}
    />;
  }
  if (!profile || !unit) throw new Error('LearningScene requires either a self-study document or a legacy unit.');
  return <LegacyLearningStage completed={completed} onComplete={onComplete} profile={profile} saving={saving} unit={unit} />;
}

function LegacyLearningStage({ profile, unit, completed, saving, onComplete }: {
  profile: DemoTaskProfile;
  unit: DemoUnit;
  completed: boolean;
  saving: boolean;
  onComplete: () => void;
}) {
  return (
    <article className="learning-scene learning-stage-panel" data-image2-learning-stage="true" data-learning-unit={unit.id}>
      <header className="learning-scene-head">
        <div><span>{profile.taskId} · {unit.capabilityNodeId}</span><h1>{unit.title}</h1><p>{unit.question}</p></div>
        <div className="learning-unit-output"><small>节点成果</small><strong>{unit.output}</strong></div>
      </header>
      <div className="learning-stage-body">
        <section className="learning-case-visual"><SceneVisual visualId={unit.visualId} activeStep={2} /></section>
        <section className="learning-stage-copy"><span>判断依据</span><h2>{unit.summary}</h2><ol>{unit.points.map((point) => <li key={point}>{point}</li>)}</ol></section>
      </div>
      <footer className="learning-scene-footer">
        <span><Icon name={completed ? 'check' : 'target'} size={17} />{completed ? '该能力节点已达成' : unit.action}</span>
        <button disabled={saving} onClick={onComplete} type="button">{saving ? '正在记录' : '记录本节点学习完成'}<Icon name="arrow" size={17} /></button>
      </footer>
    </article>
  );
}

export function SceneVisual({ visualId, activeStep }: { visualId: string; activeStep: number }) {
  if (visualId === 'indoor-boundary') return <NodeFlow title="采集边界" icons={['site', 'room', 'grid']} labels={['站点A-3', '机房03', '机柜区B']} activeStep={activeStep} />;
  if (visualId === 'indoor-topology') return <NodeFlow title="设备拓扑" icons={['room', 'bbu', 'rru', 'link']} labels={['机柜02', 'BBU槽位3', 'AAU/RRU', '端口链']} activeStep={activeStep} />;
  if (visualId === 'indoor-condition') return <ConditionBoard />;
  if (visualId === 'indoor-evidence') return <NodeFlow title="证据闭环" icons={['room', 'file', 'gps', 'check']} labels={['对象', '影像编号', '时空日志', '复核结论']} activeStep={activeStep} />;
  if (visualId === 'outdoor-boundary') return <CoverageMap mode="boundary" />;
  if (visualId === 'antenna-posture') return <AntennaPosture />;
  if (visualId === 'outdoor-obstacle') return <CoverageMap mode="obstacle" />;
  return <CoverageMap mode="route" />;
}

function NodeFlow({ title, icons, labels, activeStep }: { title: string; icons: IconName[]; labels: string[]; activeStep: number }) {
  return (
    <div className="scene-node-flow" data-graphic-system="engineering-line" data-graphic-theme="dark-engineering">
      <span className="scene-visual-label">{title}</span>
      <div>{labels.map((label, index) => <article className={index <= activeStep ? 'is-active' : ''} key={label}><Icon name={icons[index]} size={23} /><strong>{label}</strong>{index < labels.length - 1 ? <i><Icon name="arrow" size={19} /></i> : null}</article>)}</div>
    </div>
  );
}

function ConditionBoard() {
  return (
    <div className="condition-board" data-graphic-system="engineering-line" data-graphic-theme="dark-engineering">
      <span className="scene-visual-label">运行条件联检</span>
      {[
        ['radio', '传输', '链路在线', '96%'],
        ['spark', '电源', '-48V稳定', '92%'],
        ['link', '接地', '阻值合格', '88%'],
        ['clock', '温控', '24.6°C', '90%'],
      ].map(([icon, label, value, percent]) => <article key={label}><Icon name={icon as IconName} size={21} /><span><strong>{label}</strong><small>{value}</small></span><i><b style={{ width: percent }} /></i></article>)}
    </div>
  );
}

function AntennaPosture() {
  return (
    <div className="antenna-visual" data-graphic-system="engineering-line" data-graphic-theme="dark-engineering">
      <span className="scene-visual-label">扇区姿态</span>
      <div className="antenna-mast"><Icon name="radio" size={46} /><i /></div>
      <div className="sector-fan"><i /><i /><i /></div>
      <dl><div><dt>方位角</dt><dd>135°</dd></div><div><dt>下倾角</dt><dd>6°</dd></div><div><dt>挂高</dt><dd>32m</dd></div></dl>
    </div>
  );
}

function CoverageMap({ mode }: { mode: 'boundary' | 'obstacle' | 'route' }) {
  return (
    <div className={`coverage-map-visual is-${mode}`} data-graphic-system="engineering-line" data-graphic-theme="dark-engineering">
      <span className="scene-visual-label">{mode === 'boundary' ? '覆盖边界' : mode === 'obstacle' ? '遮挡证据' : '验证路线'}</span>
      <div className="map-grid" />
      <span className="map-site"><Icon name="radio" size={27} /></span>
      <i className="map-sector" />
      <i className="map-road" />
      <i className="map-obstacle" />
      <i className="map-hotspot" />
      {mode === 'route' ? <svg viewBox="0 0 500 220" aria-hidden="true"><path d="M54 174 C110 112 160 188 225 122 S340 42 448 88" /><circle cx="54" cy="174" r="7" /><circle cx="225" cy="122" r="7" /><circle cx="448" cy="88" r="7" /></svg> : null}
      <div className="map-caption"><span>站点</span><span>道路热点</span><span>遮挡体</span><span>{mode === 'route' ? '采样路线' : '风险边界'}</span></div>
    </div>
  );
}

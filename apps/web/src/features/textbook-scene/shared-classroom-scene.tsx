'use client';

import type { DemoTaskProfile, DemoTaskProfiles, DemoUnit } from '@/features/platform/deep-textbook-demo-data';
import { getDemoTaskProfileForNode, getDemoUnitForNode } from '@/features/platform/deep-textbook-demo-data';
import { Icon } from '@/ui/foundation/icons';
import type { LessonPhase } from '@/platform/models';
import { SceneVisual } from './learning-scene';
import { P01N02LessonStage } from './p01-n02-lesson-stage';

export type ClassroomSceneSurface = 'teacher' | 'student' | 'projector';

export function profileForNodeId(nodeId: string, profiles: DemoTaskProfiles): DemoTaskProfile {
  const profile = getDemoTaskProfileForNode(nodeId, profiles);
  if (!profile) throw new Error(`No published demo task profile for ${nodeId}`);
  return profile;
}

export function unitForNodeId(nodeId: string, profiles: DemoTaskProfiles): DemoUnit {
  const unit = getDemoUnitForNode(nodeId, profiles);
  if (!unit) throw new Error(`No published demo unit for ${nodeId}`);
  return unit;
}

export function SharedClassroomScene({
  profile,
  unit,
  surface,
  pageIndex,
  actionIndex,
  phase,
  onTeachingPageChange,
  teachingPageControlsDisabled,
}: {
  profile: DemoTaskProfile;
  unit: DemoUnit;
  surface: ClassroomSceneSurface;
  pageIndex: number;
  actionIndex?: number;
  phase?: LessonPhase;
  onTeachingPageChange?: (pageIndex: number) => void;
  teachingPageControlsDisabled?: boolean;
}) {
  if (unit.capabilityNodeId === 'P1T1-N02') {
    return (
      <P01N02LessonStage
        actionIndex={actionIndex}
        controlsDisabled={teachingPageControlsDisabled}
        onPageChange={onTeachingPageChange}
        phase={phase}
        surface={surface}
      />
    );
  }
  return (
    <article className={`shared-classroom-scene is-${surface}`} data-shared-classroom-scene={unit.capabilityNodeId} data-scene-role={surface}>
      <header>
        <div><span>{profile.taskId} · {unit.capabilityNodeId}</span><h1>{unit.title}</h1><p>{unit.question}</p></div>
        <strong><small>任务节点</small>{Math.max(1, profile.units.findIndex((item) => item.capabilityNodeId === unit.capabilityNodeId) + 1)} / {profile.units.length}</strong>
      </header>
      <div className="shared-classroom-visual">
        {unit.capabilityNodeId === 'P1T1-N01'
          ? <IndoorScopeClassroomVisual />
          : <SceneVisual activeStep={Math.min(3, Math.max(0, pageIndex - 1))} visualId={unit.visualId} />}
      </div>
      <section className="shared-classroom-focus">
        <div><span>本页判断</span><strong>{unit.summary}</strong></div>
        <ol>{unit.points.map((point, index) => <li key={point}><span>{index + 1}</span>{point}</li>)}</ol>
      </section>
      <footer>
        <div><Icon name="message" size={18} /><span><small>当前问题</small><strong>{unit.question}</strong></span></div>
        <div><Icon name="file" size={18} /><span><small>学习成果</small><strong>{unit.output}</strong></span></div>
      </footer>
    </article>
  );
}

export function IndoorScopeClassroomVisual() {
  return (
    <div
      aria-label="室内采集范围工程关系图"
      className="classroom-scope-map"
      data-classroom-scope-map="true"
      data-graphic-system="engineering-line"
      data-graphic-theme="dark-engineering"
    >
      <span className="scene-visual-label">室内采集边界</span>
      <svg role="img" viewBox="0 0 920 500">
        <title>任务单、机房入口、01号机房、K01至K04机柜和排除对象关系图</title>
        <desc>任务单指定HY-01站01号机房K01至K04机柜；他网机柜和02号机房属于排除对象。</desc>
        <defs>
          <marker id="classroom-scope-arrow" markerHeight="9" markerWidth="9" orient="auto" refX="8" refY="4.5">
            <path d="M0 0 9 4.5 0 9Z" />
          </marker>
          <marker id="classroom-reject-arrow" markerHeight="9" markerWidth="9" orient="auto" refX="8" refY="4.5">
            <path d="M0 0 9 4.5 0 9Z" />
          </marker>
          <pattern id="classroom-reject-stripes" height="10" patternTransform="rotate(45)" patternUnits="userSpaceOnUse" width="10">
            <line x1="0" x2="0" y1="0" y2="10" />
          </pattern>
        </defs>

        <g className="scope-map-card is-task" data-scope-object="task-sheet" transform="translate(34 96)">
          <rect height="118" rx="16" width="188" />
          <text className="scope-map-eyebrow" x="20" y="32">任务单</text>
          <text x="20" y="65">HY-01站</text>
          <text x="20" y="91">01号机房 · K01—K04</text>
        </g>

        <path className="scope-map-flow" d="M222 155H278" markerEnd="url(#classroom-scope-arrow)" />

        <g className="scope-map-card is-entrance" data-scope-object="room-entrance" transform="translate(286 105)">
          <rect height="100" rx="16" width="178" />
          <text className="scope-map-eyebrow" x="20" y="34">现场核验</text>
          <text x="20" y="68">机房入口</text>
          <text className="scope-map-note" x="20" y="89">门牌与任务单一致</text>
        </g>

        <path className="scope-map-flow" d="M464 155H506" markerEnd="url(#classroom-scope-arrow)" />

        <g className="scope-map-room" data-scope-object="room-01">
          <rect height="284" rx="22" width="372" x="514" y="52" />
          <text className="scope-map-room-title" x="540" y="90">01号机房</text>
          <text className="scope-map-note" x="540" y="116">按机柜编号确认采集对象</text>
          {['K01', 'K02', 'K03', 'K04'].map((rack, index) => (
            <g className="scope-map-rack is-target" data-scope-object={rack} key={rack} transform={`translate(${540 + index * 69} 150)`}>
              <rect height="92" rx="12" width="54" />
              <path d="M10 25H44M10 43H44M10 61H44" />
              <text x="27" y="82">{rack}</text>
            </g>
          ))}
          <g className="scope-map-rack is-excluded" data-scope-object="other-operator-rack" transform="translate(816 150)">
            <rect height="92" rx="12" width="48" />
            <rect className="scope-map-stripes" height="92" rx="12" width="48" />
            <text x="24" y="40">他网</text>
            <text x="24" y="64">机柜</text>
          </g>
          <path className="scope-map-boundary" d="M530 136H803V260H530Z" />
          <text className="scope-map-target-label" x="540" y="294">采集范围：K01—K04</text>
          <text className="scope-map-reject-label" x="735" y="318">他网机柜不进入采集</text>
        </g>

        <path className="scope-map-reject-flow" d="M840 244V371H697" markerEnd="url(#classroom-reject-arrow)" />
        <g className="scope-map-card is-excluded" data-scope-object="room-02" transform="translate(704 354)">
          <rect height="82" rx="16" width="182" />
          <text className="scope-map-eyebrow" x="20" y="31">排除对象</text>
          <text x="20" y="59">02号机房</text>
        </g>

        <g className="scope-map-legend" transform="translate(34 354)">
          <rect height="98" rx="16" width="616" />
          <circle className="is-target" cx="28" cy="30" r="7" />
          <text className="scope-map-target-label" x="48" y="36">采集：01号机房内 K01—K04</text>
          <circle className="is-excluded" cx="28" cy="68" r="7" />
          <text className="scope-map-reject-label" x="48" y="74">排除对象：他网机柜、02号机房；需要记录排除依据</text>
        </g>
      </svg>
    </div>
  );
}

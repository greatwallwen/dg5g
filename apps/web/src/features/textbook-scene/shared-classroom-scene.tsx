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

export function SharedClassroomScene({ profile, unit, surface, pageIndex, actionIndex, phase }: {
  profile: DemoTaskProfile;
  unit: DemoUnit;
  surface: ClassroomSceneSurface;
  pageIndex: number;
  actionIndex?: number;
  phase?: LessonPhase;
}) {
  if (unit.capabilityNodeId === 'P1T1-N02') {
    return <P01N02LessonStage actionIndex={actionIndex} phase={phase} surface={surface} />;
  }
  return (
    <article className={`shared-classroom-scene is-${surface}`} data-shared-classroom-scene={unit.capabilityNodeId} data-scene-role={surface}>
      <header>
        <div><span>{profile.taskId} · {unit.capabilityNodeId}</span><h1>{unit.title}</h1><p>{unit.question}</p></div>
        <strong><small>共同场景</small>{pageIndex} / {profile.units.length}</strong>
      </header>
      <div className="shared-classroom-visual"><SceneVisual activeStep={Math.min(3, Math.max(0, pageIndex - 1))} visualId={unit.visualId} /></div>
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

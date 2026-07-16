import Link from 'next/link';
import type { DemoTaskProfile, DemoTaskProfiles } from '@/features/platform/deep-textbook-demo-data';
import type { SkillProgress, TaskMasteryProgress } from '@/platform/models';
import type { P1TaskId } from '@/platform/learning-policy';
import { projectNodeAccess, type NodeAccessProjection } from '@/platform/node-access-projection';
import { Icon } from '@/ui/foundation/icons';

export function SceneContext({ profile, unit, mastery, onClose }: { profile: DemoTaskProfile; unit: DemoTaskProfile['units'][number]; mastery?: TaskMasteryProgress; onClose: () => void }) {
  const completionPercent = mastery?.masteryPercent;
  const completionFormed = completionPercent !== undefined;
  return <aside className="scene-context" data-context-drawer data-state="open"><header><span>能力路径</span><button aria-label="收起节点信息" onClick={onClose} type="button"><Icon name="close" size={17} /></button><strong>{unit.capabilityNodeId}</strong><small>{unit.output}</small></header><section><span>学习动作</span><p>{unit.action}</p></section><section><span>评价证据</span><p>{unit.requiredEvidence}</p></section><section><span>教材依据</span><p>5G网络优化（高级）· {profile.taskId}</p><small>岗位任务 · {unit.title}</small></section><section className="context-mastery" data-mastery-state={completionFormed ? 'formed' : 'unformed'}><span>任务流程完成度</span><strong>{completionFormed ? `${completionPercent}%` : '尚未形成'}</strong><i><b style={completionFormed ? { width: `${completionPercent}%` } : undefined} /></i><small>{mastery?.state === 'verified' ? '教师已认证' : completionFormed ? '按统一学习状态计算' : '等待统一学习状态'}</small></section></aside>;
}

export function profileForTask(profiles: DemoTaskProfiles, taskId: P1TaskId): DemoTaskProfile | undefined {
  return (profiles as Partial<Record<P1TaskId, DemoTaskProfile>>)[taskId];
}

export function UnavailableNodeNotice({ nodeId, access }: { nodeId: string; access?: NodeAccessProjection }) {
  const prerequisites = access?.prerequisiteNodeIds ?? [];
  return <section className="textbook-scene-unavailable" data-node-access={access?.kind ?? 'unavailable'} data-node-unavailable={nodeId}><span>{access?.label ?? '内容未开放'}</span><h1>{nodeId}</h1><p>{access?.kind === 'loading' ? '正在读取统一学习状态，请稍候。' : prerequisites.length ? `需要先完成：${prerequisites.join('、')}` : '该节点尚未配置完整样张，系统不会回退到其他任务。'}</p><Link href="/course">返回课程能力图谱</Link></section>;
}

export function SceneRail({ profile, progress, selectedNodeId, onNodeSelect, onReturnToMap }: {
  profile: DemoTaskProfile;
  progress: SkillProgress[] | undefined;
  selectedNodeId: string;
  onNodeSelect: (nodeId: string) => void;
  onReturnToMap: () => void;
}) {
  return <aside className="scene-rail"><header><span>{profile.taskId}</span><strong>{profile.title}</strong><small>能力节点</small></header><ol>{profile.units.map((unit, index) => { const access = projectNodeAccess(unit.capabilityNodeId, progress); return <li key={unit.id}><button className={`${selectedNodeId === unit.capabilityNodeId ? 'is-active ' : ''}is-${access.state ?? access.kind}`} disabled={access.disabled} onClick={() => { if (!access.disabled) onNodeSelect(unit.capabilityNodeId); }} type="button"><span>{access.state === 'achieved' ? <Icon name="check" size={15} /> : index + 1}</span><p><strong>{unit.title}</strong><small>{access.label}</small></p></button></li>; })}</ol><button className="rail-map-button" onClick={onReturnToMap} type="button"><Icon name="map" size={16} />返回任务图谱</button></aside>;
}

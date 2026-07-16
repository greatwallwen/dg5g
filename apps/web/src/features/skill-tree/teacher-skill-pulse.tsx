'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { NodeLearningState } from '@/platform/models';
import { nodeLearningStateLabel } from '@/platform/learning-status';
import { Icon } from '@/ui/foundation/icons';

export interface TeacherSkillPulseProgress {
  learningState: NodeLearningState;
  stateCompletionPercent: number;
  nodeTestHighestScore?: number;
}

const TeacherSkillPulseContext = createContext<TeacherSkillPulseProgress | undefined>(undefined);

export function TeacherSkillPulseProvider({ progress, children }: { progress?: TeacherSkillPulseProgress; children: ReactNode }) {
  return <TeacherSkillPulseContext.Provider value={progress}>{children}</TeacherSkillPulseContext.Provider>;
}

export function TeacherSkillPulse({ nodeId, progress }: { nodeId: string; progress?: TeacherSkillPulseProgress }) {
  const liveProgress = progress ?? useContext(TeacherSkillPulseContext);
  progress = liveProgress;
  const state = liveProgress?.learningState ?? 'available';
  return (
    <section className={`teacher-skill-pulse is-${state}`} data-teacher-skill-pulse={nodeId}>
      <span><Icon name={state === 'achieved' ? 'check' : 'target'} size={19} /></span>
      <div><small>当前能力节点</small><strong>{nodeId}</strong></div>
      <div><small>样例学生</small><strong>{nodeLearningStateLabel[state]}</strong></div>
      <div><small>节点测试最高分</small><strong>{progress?.nodeTestHighestScore === undefined ? '尚未形成' : `${progress.nodeTestHighestScore} 分`}</strong></div>
      <b>{progress?.stateCompletionPercent ?? 0}%</b>
    </section>
  );
}

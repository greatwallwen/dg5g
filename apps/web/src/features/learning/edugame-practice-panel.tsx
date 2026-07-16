'use client';

import Link from 'next/link';
import type { GameConfig } from '@dgbook/edugame-core';
import type { SkillProgress } from '@/platform/models';

interface EduGamePracticePanelProps {
  gameConfig: GameConfig;
  nodeId: string;
  bestScore?: number;
  nodeProgress?: SkillProgress;
  studentId?: string;
  studentVersion: number;
  primaryAction?: boolean;
  onProgress?: (progress: SkillProgress[]) => void;
}

/**
 * Compatibility entry for old scene compositions.
 * Formal grading now lives exclusively on the independent server-graded route.
 */
export function EduGamePracticePanel({
  gameConfig,
  nodeId,
  bestScore = 0,
  nodeProgress,
  primaryAction = false,
}: EduGamePracticePanelProps) {
  return (
    <section
      className="skill-game-panel formal-assessment-entry"
      data-formal-test="retired"
      data-skill-game={nodeId}
      data-skill-game-result="independent-assessment"
    >
      <span aria-hidden="true">TEST</span>
      <div>
        <small>独立正式测试</small>
        <h2>{gameConfig.title}</h2>
        <p>
          题目与判分已迁移到独立安全页面。
          {nodeProgress === undefined
            ? ' 正在读取历史记录。'
            : ` 已记录 ${nodeProgress.attemptCount ?? 0} 次提交，历史最高 ${bestScore} 分。`}
        </p>
      </div>
      <Link
        data-primary-action={primaryAction ? 'true' : undefined}
        href={`/learn/${nodeId}/test`}
      >
        进入正式测试
      </Link>
    </section>
  );
}

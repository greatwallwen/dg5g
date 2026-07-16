type StageMilestonesProps = {
  progress: number;
  doneCount: number;
  targetCount: number;
  combo: number;
  livesLeft: number;
  maxLives: number;
  levelStep: number;
  levelCount: number;
};

type MilestoneState = 'done' | 'active' | 'locked' | 'danger';

export function StageMilestones({
  progress,
  doneCount,
  targetCount,
  combo,
  livesLeft,
  maxLives,
  levelStep,
  levelCount,
}: StageMilestonesProps) {
  const milestones: Array<{ id: string; label: string; value: string; state: MilestoneState }> = [
    {
      id: 'target-lock',
      label: '锁定目标',
      value: `${doneCount}/${targetCount}`,
      state: doneCount > 0 ? 'done' : 'active',
    },
    {
      id: 'combo-bonus',
      label: '连击奖励',
      value: combo >= 3 ? `x${combo}` : 'x3',
      state: combo >= 3 ? 'done' : combo > 0 ? 'active' : 'locked',
    },
    {
      id: 'delivery',
      label: '交付达标',
      value: `${levelStep + 1}/${levelCount}`,
      state: progress >= 1 ? 'done' : livesLeft <= Math.max(1, Math.ceil(maxLives * 0.25)) ? 'danger' : 'locked',
    },
  ];

  return (
    <ol className="eg-stage-milestones" data-edugame-stage-milestones aria-label="阶段奖励">
      {milestones.map((milestone) => (
        <li key={milestone.id} data-edugame-stage-milestone data-edugame-stage-state={milestone.state}>
          <span>{milestone.value}</span>
          <strong>{milestone.label}</strong>
        </li>
      ))}
    </ol>
  );
}

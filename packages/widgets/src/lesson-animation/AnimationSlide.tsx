import type { AnimationSlideScene } from '@dgbook/animation';
import { TeachingStage, type VideoCommand } from './TeachingStage';
import type { TimelineCommand } from './timeline-runtime';
import type { StageEffect, StageEffects } from './StageOverlays';

export function AnimationSlide({
  artifact,
  scene,
  activeTarget,
  annotation,
  visualEffect,
  videoCommand,
  timelineCommand,
}: {
  artifact?: unknown;
  scene: AnimationSlideScene;
  activeTarget: string | null;
  annotation: { target: string; content: string } | null;
  visualEffect: StageEffect | StageEffects;
  videoCommand: VideoCommand;
  timelineCommand?: TimelineCommand;
}) {
  return (
    <TeachingStage
      artifact={artifact}
      scene={scene}
      activeTarget={activeTarget}
      annotation={annotation}
      visualEffect={visualEffect}
      videoCommand={videoCommand}
      timelineCommand={timelineCommand}
    />
  );
}

export { animationSlideStyles } from './animationSlideStyles';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StageActionEngine,
  StageStateStore,
  createStageTeachingActionFromWidgetAction,
  type LessonAnimationProps,
  type StageStateSnapshot,
  type StageWidgetActionPayload,
} from '@dgbook/animation';
import { registerWidgetActionHandler } from '@dgbook/animation/playback';
import { AnimationSlide, animationSlideStyles } from './AnimationSlide';

export function LessonAnimation({
  instanceId,
  title,
  artifact,
  targets = [],
}: LessonAnimationProps) {
  const store = useMemo(() => new StageStateStore({ artifact, targets }), []);
  const actionEngine = useMemo(() => new StageActionEngine(store.toActionEngineCallbacks()), [store]);
  const [stageState, setStageState] = useState<StageStateSnapshot>(() => store.getSnapshot());

  useEffect(() => {
    store.updateContext({ artifact, targets });
    actionEngine.updateCallbacks(store.toActionEngineCallbacks());
    setStageState(store.getSnapshot());
  }, [actionEngine, artifact, store, targets]);

  useEffect(() => store.subscribe(setStageState), [store]);

  const applyAction = useCallback((rawType: string | undefined, payload: StageWidgetActionPayload = {}) => {
    if (store.applyControlAction(rawType, payload)) return;
    const action = createStageTeachingActionFromWidgetAction(rawType, payload);
    if (action) void actionEngine.execute(action);
  }, [actionEngine, store]);

  useEffect(() => {
    if (!instanceId) return undefined;
    return registerWidgetActionHandler(instanceId, (detail) => {
      applyAction(detail.type, detail.payload as StageWidgetActionPayload);
    });
  }, [applyAction, instanceId]);

  return (
    <section className="lesson-animation" data-widget-kind="lesson-animation" data-widget-id={instanceId}>
      <header className="la-header">
        <div>
          <div className="la-kicker">示意动画</div>
          <h3>{title}</h3>
        </div>
      </header>

      <div className="la-stage">
        <AnimationSlide
          artifact={artifact}
          scene={artifact.scene}
          activeTarget={stageState.activeTargets[0] ?? null}
          annotation={stageState.annotation}
          visualEffect={stageState.visualEffects}
          videoCommand={stageState.videoCommand}
          timelineCommand={stageState.timelineCommand}
        />
      </div>

      <style dangerouslySetInnerHTML={{ __html: styles }} />
    </section>
  );
}

const styles = `
${animationSlideStyles}
.lesson-animation { background: #ffffff; color: #102033; border: 1px solid #d8e0ea; border-radius: 8px; overflow: hidden; }
.la-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 14px; border-bottom: 1px solid #d8e0ea; background: #fff; }
.la-kicker { color: #0f766e; font-size: 11px; font-weight: 900; letter-spacing: 0; }
.la-header h3 { margin: 2px 0 0; color: #102033; font-size: 16px; line-height: 1.3; letter-spacing: 0; }
.la-stage { position: relative; aspect-ratio: 16 / 9; min-height: 360px; background: #f8fafc; overflow: hidden; }
@media (max-width: 720px) {
  .la-header { align-items: flex-start; flex-direction: column; }
  .la-stage { min-height: 260px; }
}
`;

'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimationPlaybackEngine, normalizeRuntimeTTSConfig, providerDefaultBaseUrl, sendWidgetAction, type EngineMode, type TeachingScene } from '@dgbook/animation';
import type { ClassroomPlaybackState } from '@/platform/models';
import { buildPlaybackCursor, toTeachingAction } from './web-playback-actions';
import { PlaybackFocusOverlay, type PlaybackFocusKind } from './playback-focus-overlay';
import { usePlaybackFocus } from './use-playback-focus';
import { webPresenter, webTtsConfig, webTtsProviderId } from './web-playback-config';
import { WebPlaybackDockView } from './web-playback-dock-view';
import { getActionCaption, getActionFocusKind, getActionTarget, getAuthoritativeMode } from './web-playback-dock-utils';
import type { WebPlaybackDockProps, WebPlaybackStateChange } from './web-playback-dock-types';
export type { WebPlaybackStateChange } from './web-playback-dock-types';
export function WebPlaybackDock({ scene, audioEnabled = true, authoritativePlayback, controlMode = 'interactive', variant = 'dock', pauseAfterActionIds = [], externalCursor, onCursorChange, onPlaybackStateChange }: WebPlaybackDockProps) {
  const [mode, setMode] = useState<EngineMode>('idle');
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState(scene.actions[0]?.caption ?? '课程讲解已就绪。');
  const [speaking, setSpeaking] = useState(false);
  const { clearFocus, focus, showFocus } = usePlaybackFocus();
  const presenter = webPresenter;
  const engineRef = useRef<AnimationPlaybackEngine | null>(null);
  const onCursorChangeRef = useRef(onCursorChange);
  const onPlaybackStateChangeRef = useRef(onPlaybackStateChange);
  const actionCaptionRef = useRef(scene.actions[0]?.caption ?? scene.title);
  const actionFocusKindRef = useRef<PlaybackFocusKind>('spotlight');
  const manualIndexRef = useRef(0);
  const speedRef = useRef(speed);
  const pendingStatusRef = useRef<{ actionId?: string; actionIndex?: number; at: number; status: WebPlaybackStateChange['status'] } | null>(null);
  const actions = scene.actions;
  const pauseAfterActionKey = pauseAfterActionIds.join('|');
  const pauseAfterActionSet = useMemo(() => new Set(pauseAfterActionIds), [pauseAfterActionKey]);
  const readOnly = controlMode === 'display' || !audioEnabled;
  const teachingScene = useMemo<TeachingScene>(() => ({ id: scene.sceneId, title: scene.title, type: 'content', order: 0, actions: actions.map(toTeachingAction) }), [actions, scene.sceneId, scene.title]);
  const publishCursor = useCallback((index: number) => { const action = actions[index]; if (!action || !onCursorChangeRef.current) return; onCursorChangeRef.current(buildPlaybackCursor(scene, action, index)); }, [actions, scene]);
  const publishPlaybackState = useCallback((change: WebPlaybackStateChange) => { pendingStatusRef.current = { status: change.status, actionId: change.status === 'playing' ? change.actionId : undefined, actionIndex: change.status === 'playing' ? change.actionIndex : undefined, at: Date.now() }; onPlaybackStateChangeRef.current?.(change); }, []);
  const previewAction = useCallback((index: number, options: { publish?: boolean } = {}) => {
    const action = actions[index];
    if (!action) return;
    manualIndexRef.current = index;
    setProgress(actions.length > 0 ? ((index + 1) / actions.length) * 100 : 0);
    const caption = action.caption ?? action.spokenText ?? scene.title;
    setTranscript(caption);
    const targetId = action.targetId ?? action.elementId;
    const focusKind = action.type === 'laser' ? 'laser' : action.focusKind ?? 'spotlight';
    if (targetId) showFocus(focusKind, targetId, caption);
    if (options.publish) publishCursor(index);
  }, [actions, publishCursor, scene.title, showFocus]);
  useEffect(() => { onCursorChangeRef.current = onCursorChange; }, [onCursorChange]);
  useEffect(() => { onPlaybackStateChangeRef.current = onPlaybackStateChange; }, [onPlaybackStateChange]);
  useEffect(() => {
    if (externalCursor === null) {
      clearFocus(); setSpeaking(false); setProgress(0);
      setTranscript(scene.actions[0]?.caption ?? '课程讲解已就绪。');
      return;
    }
    if (!externalCursor || externalCursor.sceneId !== scene.sceneId) return;
    previewAction(externalCursor.actionIndex, { publish: false });
  }, [clearFocus, externalCursor?.actionId, externalCursor?.actionIndex, externalCursor?.caption, externalCursor?.sceneId, externalCursor?.targetId, externalCursor?.updatedAt, previewAction, scene.actions, scene.sceneId]);
  useEffect(() => {
    if (!audioEnabled) {
      engineRef.current = null;
      return undefined;
    }
    const engine = new AnimationPlaybackEngine([teachingScene], {
      onModeChange: setMode,
      onProgress: (_sceneIndex, actionIndex, fraction) => {
        manualIndexRef.current = actionIndex;
        setProgress(Math.round(fraction * 100));
      },
      onActionStart: (_sceneIndex, actionIndex, action) => {
        manualIndexRef.current = actionIndex;
        const sourceAction = actions[actionIndex];
        const actionType = sourceAction?.type ?? action.type;
        const focusKind = getActionFocusKind(sourceAction, actionType);
        const caption = getActionCaption(sourceAction, action, scene.title);
        const targetId = getActionTarget(sourceAction, action);
        actionCaptionRef.current = caption;
        actionFocusKindRef.current = focusKind;
        if (caption) setTranscript(caption);
        if (targetId && actionType === 'speech') showFocus(focusKind, targetId, caption);
        else if (targetId && actionType === 'laser') showFocus('laser', targetId, caption);
        else if (targetId && action.type !== 'widget_timelineCue') showFocus('spotlight', targetId, caption);
        publishCursor(actionIndex);
        publishPlaybackState({ status: 'playing', actionId: sourceAction?.id ?? action.id, actionIndex, rate: speedRef.current });
      },
      onSpeechStart: (text, elementId) => {
        setSpeaking(true);
        setTranscript(text);
        if (elementId) showFocus(actionFocusKindRef.current, elementId, text);
      },
      onSpeechEnd: () => setSpeaking(false),
      onActionEnd: (_sceneIndex, _actionIndex, action) => {
        if (pauseAfterActionSet.has(action.id)) engineRef.current?.pause();
      },
      onSpotlight: (elementId) => showFocus(actionFocusKindRef.current, elementId, actionCaptionRef.current),
      onLaser: (elementId) => showFocus('laser', elementId, actionCaptionRef.current),
      onWidgetMessage: sendWidgetAction,
      onClearEffects: clearFocus,
      onComplete: () => {
        setMode('idle');
        setSpeaking(false);
        setProgress(100);
        publishPlaybackState({ status: 'ended' });
      },
    });
    engine.setTTSConfig(normalizeRuntimeTTSConfig(webTtsConfig));
    engine.setSpeed(speed);
    engine.setMuted(muted);
    engineRef.current = engine;
    return () => {
      engine.stop();
      engineRef.current = null;
    };
  }, [audioEnabled, clearFocus, pauseAfterActionSet, publishCursor, publishPlaybackState, scene.title, showFocus, teachingScene]);
  useEffect(() => {
    speedRef.current = speed;
    engineRef.current?.setSpeed(speed);
    engineRef.current?.setMuted(muted);
  }, [muted, speed]);
  useEffect(() => {
    if (!authoritativePlayback || authoritativePlayback.sceneId !== scene.sceneId) return;
    previewAction(authoritativePlayback.actionIndex, { publish: false });
    if (authoritativePlayback.rate !== speedRef.current) setSpeed(authoritativePlayback.rate);
    const pending = pendingStatusRef.current;
    const pendingMatches = pending?.status === authoritativePlayback.status
      && (pending.status !== 'playing'
        || (pending.actionId === authoritativePlayback.actionId && pending.actionIndex === authoritativePlayback.actionIndex));
    if (pendingMatches) pendingStatusRef.current = null;
    else if (pending && Date.now() - pending.at < 4000) return;
    else pendingStatusRef.current = null;
    const engine = engineRef.current;
    const engineMode = engine?.getMode() ?? 'idle';
    if (!audioEnabled) {
      setMode(getAuthoritativeMode(authoritativePlayback));
      setSpeaking(false);
      return;
    }
    if (authoritativePlayback.status === 'paused') {
      if (engineMode === 'playing') engine?.pause();
      setMode('paused');
      setSpeaking(false);
      return;
    }
    if (authoritativePlayback.status === 'idle' || authoritativePlayback.status === 'ended') {
      if (engineMode !== 'idle') engine?.stop();
      setMode('idle');
      setSpeaking(false);
      return;
    }
    if (engineMode === 'playing') {
      setMode('playing');
      setSpeaking(true);
    } else {
      // A newly mounted audio owner must be resumed by a user gesture.
      setMode('paused');
      setSpeaking(false);
    }
  }, [audioEnabled, authoritativePlayback, previewAction, scene.sceneId]);
  function toggle() {
    const engine = engineRef.current;
    if (!engine) return;
    const currentMode = engine.getMode();
    if (currentMode === 'idle') {
      setMode('playing');
      setSpeaking(true);
      const resumeAuthoritative = authoritativePlayback?.sceneId === scene.sceneId
        && (authoritativePlayback.status === 'paused' || authoritativePlayback.status === 'playing');
      const actionIndex = resumeAuthoritative ? authoritativePlayback.actionIndex : manualIndexRef.current;
      const positionMs = resumeAuthoritative ? authoritativePlayback.positionMs : 0;
      previewAction(actionIndex, { publish: true });
      engine.startAt(0, actionIndex, positionMs);
      return;
    }
    if (currentMode === 'playing') {
      setMode('paused');
      engine.pause();
      publishPlaybackState({ status: 'paused' });
    } else {
      setMode('playing');
      engine.resume();
      const action = actions[manualIndexRef.current];
      if (action) publishPlaybackState({ status: 'playing', actionId: action.id, actionIndex: manualIndexRef.current, rate: speedRef.current });
    }
  }
  function stop() {
    engineRef.current?.stop();
    setMode('idle'); setSpeaking(false); setProgress(0); clearFocus();
    setTranscript(scene.actions[0]?.caption ?? '课程讲解已就绪。');
    onCursorChangeRef.current?.(null);
    publishPlaybackState({ status: 'paused' });
  }
  function moveAction(direction: -1 | 1) {
    const engine = engineRef.current;
    const nextIndex = direction < 0
      ? Math.max(0, manualIndexRef.current - 1)
      : Math.min(actions.length - 1, manualIndexRef.current + 1);
    if (!engine || mode === 'idle') {
      previewAction(nextIndex, { publish: true });
      return;
    }
    if (direction < 0) engine.previous();
    else engine.next();
  }
  return (
    <section
      className="web-playback-shell"
      data-audio-enabled={audioEnabled ? 'true' : 'false'}
      data-authoritative-action-index={authoritativePlayback?.actionIndex}
      data-authoritative-status={authoritativePlayback?.status}
      data-playback-control-mode={controlMode}
      data-playback-revision={authoritativePlayback?.revision}
      data-playback-variant={variant}
      aria-label={readOnly ? '课程播报展示' : '课程播报控制'}
    >
      <PlaybackFocusOverlay focus={focus} />
      <WebPlaybackDockView
        presenter={presenter}
        mode={mode === 'playing' ? 'playing' : mode === 'paused' ? 'paused' : 'idle'}
        title={scene.title}
        status={mode === 'idle' ? '课程讲解已就绪。' : '正在讲解当前知识点。'}
        transcript={transcript}
        transcriptId={actions[manualIndexRef.current]?.id}
        progress={progress}
        speaking={speaking}
        muted={muted}
        readOnly={readOnly}
        speed={speed}
        ttsProvider={webTtsProviderId}
        ttsBaseUrl={providerDefaultBaseUrl(webTtsProviderId)}
        ttsModel={webTtsConfig.modelId}
        ttsVoice={webTtsConfig.voice}
        onToggle={toggle}
        onStop={stop}
        onPrev={() => moveAction(-1)}
        onNext={() => moveAction(1)}
        onSpeedChange={(nextSpeed) => { setSpeed(nextSpeed); engineRef.current?.setSpeed(nextSpeed); }}
        onMutedChange={(nextMuted) => { setMuted(nextMuted); engineRef.current?.setMuted(nextMuted); }}
      />
    </section>
  );
}

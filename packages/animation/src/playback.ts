import type { RuntimeTTSConfig, TeachingAction, TeachingScene } from './types';
import { normalizeTeachingAction } from './schema';
import { generateSpeechAudio, normalizeRuntimeTTSConfig } from './speech';
import { normalizePlaybackStart } from './playback-position';
import {
  WIDGET_ACTION_CLEAR_EFFECTS,
  WIDGET_ACTION_PAUSE_TIMELINE,
  WIDGET_ACTION_RESET_STAGE,
  WIDGET_ACTION_RESUME_TIMELINE,
  WIDGET_ACTION_RUN_CUE,
  WIDGET_ACTION_SET_TIMELINE_TIME,
  type WidgetMessageResult,
} from './widget-bridge';
import {
  actionTimePayload,
  captionTargetForSpeechAction,
  effectHoldMs,
  estimateSpeechDuration,
  findVideoElement,
  focusPolicyFor,
  focusTextPayload,
  playCustomVideo,
  requiredTarget,
  splitSpeechIntoChunks,
} from './playback-utils';

export type EngineMode = 'idle' | 'playing' | 'paused';
export type AnimationPlaybackScene = TeachingScene;
export type AnimationPlaybackAction = TeachingAction;

interface PlaybackActionCursor {
  sceneIndex: number;
  actionIndex: number;
  action: TeachingAction;
}

export interface AnimationPlaybackCallbacks {
  onModeChange?: (mode: EngineMode) => void;
  onProgress?: (sceneIndex: number, actionIndex: number, fraction: number) => void;
  onSpeechStart?: (text: string, elementId?: string) => void;
  onSpeechEnd?: () => void;
  onSpotlight?: (elementId: string, dimOpacity?: number) => void;
  onLaser?: (elementId: string, color?: string) => void;
  onWidgetMessage?: (
    widgetId: string | undefined,
    type: string,
    payload: Record<string, unknown>,
  ) => void | WidgetMessageResult | Promise<void | WidgetMessageResult>;
  onVideoStart?: (elementId: string) => void;
  onVideoEnd?: (elementId: string) => void;
  onSceneChange?: (sceneIndex: number, scene: AnimationPlaybackScene) => void;
  onActionStart?: (sceneIndex: number, actionIndex: number, action: TeachingAction) => void;
  onActionEnd?: (sceneIndex: number, actionIndex: number, action: TeachingAction) => void;
  onWidgetTimeout?: (widgetId: string | undefined, type: string) => void;
  onTimelineCue?: (action: TeachingAction) => void;
  onComplete?: () => void;
  onClearEffects?: () => void;
}

const DEFAULT_WIDGET_TIMEOUT_MS = 650;

export class AnimationPlaybackEngine {
  private scenes: AnimationPlaybackScene[] = [];
  private sceneIndex = 0;
  private actionIndex = 0;
  private mode: EngineMode = 'idle';
  private callbacks: AnimationPlaybackCallbacks;
  private speed = 1.0;
  private muted = false;
  private ttsConfig: RuntimeTTSConfig = normalizeRuntimeTTSConfig();

  private audio: HTMLAudioElement | null = null;
  private browserTTSActive = false;
  private browserTTSChunks: string[] = [];
  private browserTTSChunkIndex = 0;
  private browserTTSPausedChunks: string[] = [];
  private browserTTSWatchdog: ReturnType<typeof setTimeout> | null = null;
  private cachedVoices: SpeechSynthesisVoice[] | null = null;
  private voiceURI: string | null = null;
  private preferredLang: string | null = null;

  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackStart = 0;
  private fallbackRemaining = 0;

  private advanceTimer: ReturnType<typeof setTimeout> | null = null;
  private advanceStart = 0;
  private advanceRemaining = 0;
  private advanceAction: TeachingAction | null = null;
  private actionCursor: PlaybackActionCursor | null = null;
  private focusCursor: PlaybackActionCursor | null = null;
  private pendingPositionMs = 0;

  private activeVideo: HTMLVideoElement | null = null;
  private videoResolve: (() => void) | null = null;

  constructor(scenes: AnimationPlaybackScene[], callbacks: AnimationPlaybackCallbacks = {}) {
    this.scenes = scenes.map((scene) => ({
      ...scene,
      actions: scene.actions.map((action: TeachingAction) => normalizeTeachingAction(action)),
    }));
    this.callbacks = callbacks;
  }

  getMode(): EngineMode { return this.mode; }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.5, Math.min(2.0, speed));
    if (this.audio) this.audio.playbackRate = this.speed;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.audio) this.audio.muted = muted;
  }

  setVoice(voiceURI: string | null, lang?: string): void {
    this.voiceURI = voiceURI || null;
    this.preferredLang = lang || null;
  }

  setTTSConfig(config: RuntimeTTSConfig): void { this.ttsConfig = normalizeRuntimeTTSConfig(config); }

  getProgress() {
    const total = this.scenes.reduce((sum, scene) => sum + scene.actions.length, 0);
    const done =
      this.scenes.slice(0, this.sceneIndex).reduce((sum, scene) => sum + scene.actions.length, 0) +
      this.actionIndex;
    return {
      sceneIndex: this.sceneIndex,
      actionIndex: this.actionIndex,
      fraction: total > 0 ? done / total : 0,
    };
  }

  start(sceneIndex = 0): void {
    this.startAt(sceneIndex, 0, 0);
  }

  startAt(sceneIndex = 0, actionIndex = 0, positionMs = 0): void {
    if (this.mode !== 'idle') return;
    const boundedSceneIndex = Math.max(0, Math.min(this.scenes.length - 1, Math.trunc(sceneIndex)));
    const start = normalizePlaybackStart({
      sceneCount: this.scenes.length,
      actionCount: this.scenes[boundedSceneIndex]?.actions.length ?? 0,
      sceneIndex,
      actionIndex,
      positionMs,
    });
    this.sceneIndex = start.sceneIndex;
    this.actionIndex = start.actionIndex;
    this.pendingPositionMs = start.positionMs;
    this.setMode('playing');
    if (this.scenes[this.sceneIndex]) this.callbacks.onSceneChange?.(this.sceneIndex, this.scenes[this.sceneIndex]!);
    this.resetSceneWidgets(start.positionMs);
    this.broadcastWidgetAction(WIDGET_ACTION_RESUME_TIMELINE, { speed: this.speed });
    this.processNext();
  }

  pause(): void {
    if (this.mode !== 'playing') return;
    this.setMode('paused');

    if (this.browserTTSActive) {
      this.browserTTSPausedChunks = this.browserTTSChunks.slice(this.browserTTSChunkIndex);
      this.browserTTSActive = false;
      this.clearBrowserTTSWatchdog();
      window.speechSynthesis?.cancel();
    }

    if (this.audio && !this.audio.paused) this.audio.pause();
    if (this.activeVideo && !this.activeVideo.paused) this.activeVideo.pause();
    this.broadcastWidgetAction(WIDGET_ACTION_PAUSE_TIMELINE, {});

    if (this.fallbackTimer) {
      this.fallbackRemaining = Math.max(0, this.fallbackRemaining - (Date.now() - this.fallbackStart) * this.speed);
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }

    if (this.advanceTimer) {
      this.advanceRemaining = Math.max(0, this.advanceRemaining - (Date.now() - this.advanceStart) * this.speed);
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.setMode('playing');
    this.broadcastWidgetAction(WIDGET_ACTION_RESUME_TIMELINE, { speed: this.speed });

    if (this.browserTTSPausedChunks.length > 0) {
      this.browserTTSChunks = this.browserTTSPausedChunks;
      this.browserTTSChunkIndex = 0;
      this.browserTTSPausedChunks = [];
      this.browserTTSActive = true;
      void this.playBrowserTTSChunk();
      return;
    }

    if (this.audio?.paused) {
      this.audio.playbackRate = this.speed;
      void this.audio.play();
      return;
    }

    if (this.activeVideo?.paused) {
      void this.activeVideo.play();
      return;
    }

    if (this.fallbackRemaining > 0) {
      this.scheduleFallback(this.fallbackRemaining);
      return;
    }

    if (this.advanceAction && this.advanceRemaining > 0) {
      this.scheduleAdvance(this.advanceRemaining, this.advanceAction);
      return;
    }

    this.processNext();
  }

  stop(): void {
    this.clearAll();
    this.sceneIndex = 0;
    this.actionIndex = 0;
    this.setMode('idle');
  }

  next(): void {
    if (this.mode === 'idle') {
      this.start();
      return;
    }
    this.jumpRelative(1);
  }

  previous(): void {
    if (this.mode === 'idle') {
      this.start();
      return;
    }
    this.jumpRelative(-1);
  }

  private setMode(mode: EngineMode): void {
    this.mode = mode;
    this.callbacks.onModeChange?.(mode);
  }

  private processNext(): void {
    if (this.mode !== 'playing') return;

    const scene = this.scenes[this.sceneIndex];
    if (!scene) {
      this.handleComplete();
      return;
    }

    const action = scene.actions[this.actionIndex];
    if (!action) {
      this.sceneIndex++;
      this.actionIndex = 0;
      if (this.sceneIndex < this.scenes.length) {
        this.callbacks.onSceneChange?.(this.sceneIndex, this.scenes[this.sceneIndex]!);
      }
      this.processNext();
      return;
    }

    this.emitProgress();
    this.actionCursor = { sceneIndex: this.sceneIndex, actionIndex: this.actionIndex, action };
    this.callbacks.onActionStart?.(this.sceneIndex, this.actionIndex, action);
    const positionMs = this.pendingPositionMs;
    this.pendingPositionMs = 0;
    void this.executeAction(action, positionMs);
  }

  private async executeAction(action: TeachingAction, positionMs = 0): Promise<void> {
    switch (action.type) {
      case 'speech':
        this.executeSpeech(action, positionMs);
        return;
      case 'spotlight':
        this.beginFocus(action);
        this.callbacks.onSpotlight?.(requiredTarget(action), action.dimOpacity);
        void this.executeWidgetAction(action, 'SPOTLIGHT_ELEMENT', {
          target: requiredTarget(action),
          ...focusTextPayload(action),
          dimOpacity: action.dimOpacity,
          color: action.color,
          holdPolicy: focusPolicyFor(action) ?? 'hold',
          durationMs: action.durationMs,
          minHoldMs: action.holdMs,
          ...actionTimePayload(action),
        }); this.advanceAfter(effectHoldMs(action, 520), action);
        return;
      case 'laser':
        this.beginFocus(action);
        this.callbacks.onLaser?.(requiredTarget(action), action.color);
        void this.executeWidgetAction(action, 'LASER_ELEMENT', {
          target: requiredTarget(action),
          ...focusTextPayload(action),
          color: action.color,
          holdPolicy: focusPolicyFor(action) ?? 'hold',
          durationMs: action.durationMs,
          minHoldMs: action.holdMs,
          ...actionTimePayload(action),
        }); this.advanceAfter(effectHoldMs(action, 360), action);
        return;
      case 'play_video':
        await this.executeVideo({ ...action, elementId: requiredTarget(action) });
        if (this.mode !== 'playing') return;
        this.advanceNow(action);
        return;
      case 'widget_highlight':
        this.beginFocus(action);
        await this.executeWidgetAction(action, 'HIGHLIGHT_ELEMENT', { target: action.target ?? action.elementId ?? action.widgetId ?? '', ...actionTimePayload(action) });
        this.advanceAfter(action.delayMs ?? 300, action);
        return;
      case 'widget_setState':
        await this.executeWidgetAction(action, 'SET_WIDGET_STATE', { state: action.state ?? {} });
        this.advanceAfter(action.delayMs ?? 300, action);
        return;
      case 'widget_timelineCue':
        await this.executeWidgetAction(action, WIDGET_ACTION_RUN_CUE, {
          state: action.state ?? {},
          cueId: action.state?.cueId,
          target: action.state?.target ?? action.target ?? action.elementId,
          targets: action.state?.targets,
          effect: action.state?.effect ?? action.content,
          durationMs: action.durationMs,
          holdMs: action.holdMs,
          currentTimeMs: action.state?.currentTimeMs,
          timeMs: action.state?.timeMs,
        });
        this.callbacks.onTimelineCue?.(action);
        this.advanceAfter(action.delayMs ?? action.durationMs ?? 300, action);
        return;
      case 'widget_annotation':
        this.beginFocus(action);
        await this.executeWidgetAction(action, 'ANNOTATE_ELEMENT', {
          target: action.target ?? action.elementId ?? '',
          content: action.content ?? action.text ?? '',
          color: action.color,
        });
        this.advanceAfter(action.delayMs ?? 300, action);
        return;
      case 'widget_reveal':
        this.beginFocus(action);
        await this.executeWidgetAction(action, 'REVEAL_ELEMENT', { target: action.target ?? action.elementId ?? '' });
        this.advanceAfter(action.delayMs ?? 300, action);
        return;
    }
  }

  private async executeWidgetAction(action: TeachingAction, type: string, payload: Record<string, unknown>) {
    const widgetIds = this.resolveWidgetIds(action.widgetId);
    if (widgetIds.length === 0) {
      return;
    }
    for (const widgetId of widgetIds) {
      const result = await this.callbacks.onWidgetMessage?.(widgetId, type, payload);
      if (result && result.timedOut) this.callbacks.onWidgetTimeout?.(widgetId, type);
    }
  }

  private executeSpeech(action: TeachingAction, positionMs = 0): void {
    const rawText = action.text ?? action.content ?? '';
    const spokenText = action.spokenText ?? rawText;
    const visibleText = action.caption ?? action.displayText ?? rawText;
    const focusTarget = action.elementId ?? action.target;
    const captionTarget = captionTargetForSpeechAction(action, focusTarget);
    void this.executeWidgetAction(action, 'CAPTION_UPDATE', {
      target: captionTarget ?? focusTarget,
      targets: captionTarget ? [captionTarget] : focusTarget ? [focusTarget] : [],
      content: visibleText,
      caption: visibleText,
      speechId: action.id,
      color: action.color,
      ...actionTimePayload(action),
    });
    if (focusTarget && action.focusPolicy !== 'none') {
      this.beginFocus(action);
      this.callbacks.onSpotlight?.(focusTarget, action.dimOpacity);
      void this.executeWidgetAction(action, 'SPOTLIGHT_ELEMENT', {
        target: focusTarget,
        dimOpacity: action.dimOpacity,
        color: action.color,
        caption: visibleText,
        speechId: action.id,
        holdPolicy: action.focusPolicy ?? 'hold',
        ...actionTimePayload(action),
      });
    }
    this.callbacks.onSpeechStart?.(visibleText, focusTarget);

    if (this.muted) {
      this.scheduleFallback(Math.max(0, Math.min(2200, this.estimateDuration(spokenText)) - positionMs));
      return;
    }

    const audioUrl = (action as { audioUrl?: string }).audioUrl;
    if (audioUrl) {
      this.playAudioUrl(audioUrl, () => this.finishSpeech(), positionMs).catch(() => this.playBrowserOrFallback(spokenText));
      return;
    }

    if (this.ttsConfig.providerId !== 'browser-native-tts' && this.ttsConfig.baseUrl) {
      this.playRemoteTTS(spokenText, () => this.finishSpeech()).catch(() => this.playBrowserOrFallback(spokenText));
      return;
    }

    this.playBrowserOrFallback(spokenText);
  }

  private finishSpeech(): void {
    this.callbacks.onSpeechEnd?.();
    const action = this.scenes[this.sceneIndex]?.actions[this.actionIndex]; if (action) this.advanceNow(action);
  }

  private async playAudioUrl(url: string, onEnd: () => void, positionMs = 0): Promise<void> {
    this.stopAudio();
    this.audio = new Audio(url); window.dispatchEvent(new CustomEvent('dgbook:audio-playback', { detail: { type: 'audio-url', src: url, at: Date.now() } }));
    this.audio.playbackRate = this.speed;
    this.audio.muted = this.muted;
    if (positionMs > 0) {
      const seek = () => {
        if (!this.audio) return;
        const requestedSeconds = positionMs / 1000;
        const maxSeconds = Number.isFinite(this.audio.duration) ? Math.max(0, this.audio.duration - 0.05) : requestedSeconds;
        this.audio.currentTime = Math.min(requestedSeconds, maxSeconds);
      };
      if (this.audio.readyState >= 1) seek();
      else this.audio.addEventListener('loadedmetadata', seek, { once: true });
    }
    this.audio.addEventListener('ended', onEnd, { once: true });
    this.audio.addEventListener('error', onEnd, { once: true });
    await this.audio.play();
    window.dispatchEvent(new CustomEvent('dgbook:audio-playback', { detail: { type: 'audio-play-ok', src: url, at: Date.now() } }));
    this.audio.playbackRate = this.speed;
  }

  private async playRemoteTTS(text: string, onEnd: () => void): Promise<void> {
    const config = this.ttsConfig;
    if (!config.baseUrl) throw new Error('TTS baseUrl is required');
    const result = await generateSpeechAudio({
      text,
      providerId: config.providerId,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      modelId: config.modelId,
      voice: config.voice,
      speed: this.speed,
      responseFormat: config.responseFormat,
      providerOptions: config.providerOptions,
    });
    if (!result.base64) throw new Error('TTS provider did not return audio data');
    await this.playAudioUrl(`data:${result.mimeType ?? 'audio/mpeg'};base64,${result.base64}`, onEnd);
  }

  private playBrowserOrFallback(text: string): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) this.playBrowserTTS(text);
    else this.scheduleFallback(this.estimateDuration(text));
  }

  private playBrowserTTS(text: string): void {
    this.browserTTSChunks = this.splitIntoChunks(text);
    this.browserTTSChunkIndex = 0;
    this.browserTTSPausedChunks = [];
    this.browserTTSActive = true;
    void this.playBrowserTTSChunk();
  }

  private async playBrowserTTSChunk(): Promise<void> {
    if (this.mode !== 'playing') return;
    if (this.browserTTSChunkIndex >= this.browserTTSChunks.length) {
      this.browserTTSActive = false;
      this.browserTTSChunks = [];
      this.callbacks.onSpeechEnd?.();
      const action = this.scenes[this.sceneIndex]?.actions[this.actionIndex];
      if (action) this.advanceNow(action);
      return;
    }

    const chunkText = this.browserTTSChunks[this.browserTTSChunkIndex]!;
    const utterance = new SpeechSynthesisUtterance(chunkText);
    utterance.volume = this.muted ? 0 : 1;
    utterance.rate = this.speed;
    let settled = false;
    const finishChunk = () => {
      if (settled) return;
      settled = true;
      this.clearBrowserTTSWatchdog();
      this.browserTTSChunkIndex++;
      if (this.mode === 'playing') void this.playBrowserTTSChunk();
    };

    const voices = await this.ensureVoicesLoaded();
    const cjkRatio = chunkText.length > 0 ? (chunkText.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length / chunkText.length : 0;
    const lang = this.preferredLang ?? (cjkRatio > 0.3 ? 'zh-CN' : 'en-US');
    utterance.lang = lang;
    const selectedVoice = this.voiceURI ? voices.find((voice) => voice.voiceURI === this.voiceURI) : null;
    const matchingVoice = selectedVoice ?? voices.find((voice) => voice.lang.toLowerCase().startsWith(lang.toLowerCase()));
    if (matchingVoice) utterance.voice = matchingVoice;

    utterance.onend = finishChunk;

    utterance.onerror = (event) => {
      if (event.error === 'canceled') return;
      finishChunk();
    };

    this.clearBrowserTTSWatchdog();
    this.browserTTSWatchdog = setTimeout(() => {
      if (this.mode !== 'playing') return;
      window.speechSynthesis?.cancel();
      finishChunk();
    }, Math.min(12000, Math.max(2200, this.estimateDuration(chunkText) + 1200)) / this.speed);

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  private async ensureVoicesLoaded(): Promise<SpeechSynthesisVoice[]> {
    if (this.cachedVoices?.length) return this.cachedVoices;
    let voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      this.cachedVoices = voices;
      return voices;
    }
    await new Promise<void>((resolve) => {
      const done = () => {
        window.speechSynthesis.removeEventListener('voiceschanged', done);
        resolve();
      };
      window.speechSynthesis.addEventListener('voiceschanged', done);
      setTimeout(done, 2000);
    });
    voices = window.speechSynthesis.getVoices();
    this.cachedVoices = voices;
    return voices;
  }

  private async executeVideo(action: TeachingAction & { elementId: string }): Promise<void> {
    this.callbacks.onVideoStart?.(action.elementId);
    const timeoutMs = action.timeoutMs ?? 5 * 60 * 1000;
    const video = findVideoElement(action.elementId);

    if (!video) {
      await playCustomVideo(action.elementId, timeoutMs);
      this.callbacks.onVideoEnd?.(action.elementId);
      return;
    }

    this.activeVideo = video;
    await new Promise<void>((resolve) => {
      this.videoResolve = resolve;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        video.removeEventListener('ended', finish);
        video.removeEventListener('error', finish);
        this.activeVideo = null;
        this.videoResolve = null;
        this.callbacks.onVideoEnd?.(action.elementId);
        resolve();
      };

      const timeout = setTimeout(finish, timeoutMs);
      video.addEventListener('ended', finish);
      video.addEventListener('error', finish);
      video.playbackRate = this.speed;
      video.currentTime = 0;
      video.play().catch(finish);
    });
  }

  private scheduleFallback(ms: number): void {
    this.fallbackStart = Date.now();
    this.fallbackRemaining = ms;
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null;
      this.fallbackRemaining = 0;
      this.callbacks.onSpeechEnd?.();
      const action = this.scenes[this.sceneIndex]?.actions[this.actionIndex];
      if (action) this.advanceNow(action);
    }, ms / this.speed);
  }

  private estimateDuration(text: string): number {
    return estimateSpeechDuration(text);
  }

  private splitIntoChunks(text: string): string[] {
    return splitSpeechIntoChunks(text);
  }

  private advanceAfter(ms: number, action: TeachingAction): void {
    this.scheduleAdvance(ms, action);
  }

  private scheduleAdvance(ms: number, action: TeachingAction): void {
    this.advanceStart = Date.now();
    this.advanceRemaining = ms;
    this.advanceAction = action;
    this.advanceTimer = setTimeout(() => {
      this.advanceTimer = null;
      this.advanceRemaining = 0;
      this.advanceAction = null;
      if (this.mode !== 'playing') return;
      this.advanceNow(action);
    }, ms / this.speed);
  }

  private advanceNow(action: TeachingAction): void {
    const cursor = this.actionCursor;
    if (!cursor || cursor.action !== action) return;
    const { sceneIndex, actionIndex } = cursor;
    this.actionCursor = null;
    this.sceneIndex = sceneIndex;
    this.actionIndex = actionIndex + 1;
    this.callbacks.onActionEnd?.(sceneIndex, actionIndex, action);
    this.endFocus(action);
    this.processNext();
  }

  private emitProgress(): void {
    const progress = this.getProgress();
    this.callbacks.onProgress?.(progress.sceneIndex, progress.actionIndex, progress.fraction);
  }

  private handleComplete(): void {
    this.clearAll();
    this.setMode('idle');
    this.callbacks.onComplete?.();
  }

  private jumpRelative(direction: 1 | -1): void {
    const current = this.actionCursor ?? {
      sceneIndex: this.sceneIndex,
      actionIndex: Math.max(0, this.actionIndex - 1),
      action: this.scenes[this.sceneIndex]?.actions[Math.max(0, this.actionIndex - 1)] as TeachingAction,
    };
    const target = direction > 0
      ? this.findNextCursor(current.sceneIndex, current.actionIndex)
      : this.findPreviousCursor(current.sceneIndex, current.actionIndex);

    if (!target) {
      if (direction > 0) this.handleComplete();
      else this.jumpTo(0, 0, true);
      return;
    }

    this.jumpTo(target.sceneIndex, target.actionIndex, target.sceneIndex !== this.sceneIndex);
  }

  private jumpTo(sceneIndex: number, actionIndex: number, resetScene: boolean): void {
    this.interruptCurrentPlayback();
    this.sceneIndex = sceneIndex;
    this.actionIndex = actionIndex;
    this.actionCursor = null;
    this.focusCursor = null;
    this.setMode('playing');
    const scene = this.scenes[sceneIndex];
    if (scene) this.callbacks.onSceneChange?.(sceneIndex, scene);
    if (resetScene) this.resetSceneWidgets();
    this.broadcastWidgetAction(WIDGET_ACTION_RESUME_TIMELINE, { speed: this.speed });
    this.processNext();
  }

  private findNextCursor(sceneIndex: number, actionIndex: number): Pick<PlaybackActionCursor, 'sceneIndex' | 'actionIndex'> | null {
    for (let nextScene = sceneIndex; nextScene < this.scenes.length; nextScene += 1) {
      const start = nextScene === sceneIndex ? actionIndex + 1 : 0;
      if (this.scenes[nextScene]?.actions[start]) return { sceneIndex: nextScene, actionIndex: start };
    }
    return null;
  }

  private findPreviousCursor(sceneIndex: number, actionIndex: number): Pick<PlaybackActionCursor, 'sceneIndex' | 'actionIndex'> | null {
    for (let previousScene = sceneIndex; previousScene >= 0; previousScene -= 1) {
      const actions = this.scenes[previousScene]?.actions ?? [];
      const start = previousScene === sceneIndex ? actionIndex - 1 : actions.length - 1;
      if (start >= 0 && actions[start]) return { sceneIndex: previousScene, actionIndex: start };
    }
    return null;
  }

  private interruptCurrentPlayback(): void {
    const cursor = this.actionCursor;
    this.stopAudio();
    if (this.browserTTSActive || this.browserTTSPausedChunks.length > 0) {
      this.browserTTSActive = false;
      this.browserTTSChunks = [];
      this.browserTTSChunkIndex = 0;
      this.browserTTSPausedChunks = [];
      this.clearBrowserTTSWatchdog();
      window.speechSynthesis?.cancel();
    }
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
    if (this.activeVideo) {
      this.activeVideo.pause();
      this.activeVideo = null;
    }
    this.videoResolve?.();
    this.videoResolve = null;
    this.fallbackRemaining = 0;
    this.advanceRemaining = 0;
    this.advanceAction = null;
    if (cursor) this.callbacks.onActionEnd?.(cursor.sceneIndex, cursor.actionIndex, cursor.action);
    this.callbacks.onSpeechEnd?.();
    this.callbacks.onClearEffects?.();
    this.broadcastWidgetAction(WIDGET_ACTION_CLEAR_EFFECTS, {});
  }

  private clearAll(): void {
    this.pendingPositionMs = 0;
    this.stopAudio();
    if (this.browserTTSActive || this.browserTTSPausedChunks.length > 0) {
      this.browserTTSActive = false;
      this.browserTTSChunks = [];
      this.browserTTSChunkIndex = 0;
      this.browserTTSPausedChunks = [];
      this.clearBrowserTTSWatchdog();
      window.speechSynthesis?.cancel();
    }
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer);
      this.advanceTimer = null;
    }
    this.advanceRemaining = 0;
    this.advanceAction = null;
    this.actionCursor = null;
    this.focusCursor = null;
    if (this.activeVideo) {
      this.activeVideo.pause();
      this.activeVideo = null;
    }
    this.videoResolve?.();
    this.videoResolve = null;
    this.callbacks.onClearEffects?.();
    this.broadcastWidgetAction(WIDGET_ACTION_CLEAR_EFFECTS, {});
    this.broadcastWidgetAction(WIDGET_ACTION_RESET_STAGE, {});
  }

  private stopAudio(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio = null;
  }

  private clearBrowserTTSWatchdog(): void {
    if (!this.browserTTSWatchdog) return;
    clearTimeout(this.browserTTSWatchdog);
    this.browserTTSWatchdog = null;
  }

  private resetSceneWidgets(currentTimeMs = 0): void {
    this.broadcastWidgetAction(WIDGET_ACTION_RESET_STAGE, {});
    this.broadcastWidgetAction(WIDGET_ACTION_SET_TIMELINE_TIME, {
      currentTimeMs,
      timeMs: currentTimeMs,
      state: { currentTimeMs },
    });
  }

  private broadcastWidgetAction(type: string, payload: Record<string, unknown>): void {
    for (const widgetId of this.resolveWidgetIds()) {
      void this.callbacks.onWidgetMessage?.(widgetId, type, payload);
    }
  }

  private resolveWidgetIds(preferred?: string): string[] {
    const ids = new Set<string>();
    if (preferred) ids.add(preferred);
    const scene = this.scenes[this.sceneIndex];
    for (const action of scene?.actions ?? []) {
      if (action.widgetId) ids.add(action.widgetId);
    }
    return [...ids];
  }

  private beginFocus(action: TeachingAction): void {
    const policy = focusPolicyFor(action);
    if (!policy || policy === 'none') return;

    const previous = this.focusCursor;
    if (previous && previous.action !== action && focusPolicyFor(previous.action) === 'clear-on-next') {
      this.clearFocus(previous.action);
    }

    const cursor = this.actionCursor;
    this.focusCursor = cursor?.action === action ? cursor : { sceneIndex: this.sceneIndex, actionIndex: this.actionIndex, action };
  }

  private endFocus(action: TeachingAction): void {
    if (action.clearFocusOnEnd || action.focusPolicy === 'clear-on-end') {
      this.clearFocus(action);
    }
  }

  private clearFocus(action?: TeachingAction): void {
    if (action && this.focusCursor?.action !== action) return;
    if (!this.focusCursor) return;
    this.focusCursor = null;
    this.callbacks.onClearEffects?.();
    this.broadcastWidgetAction(WIDGET_ACTION_CLEAR_EFFECTS, {});
  }
}

export { AnimationPlaybackEngine as PlaybackEngine };
export type { AnimationPlaybackAction as PlaybackAction, AnimationPlaybackCallbacks as PlaybackCallbacks, AnimationPlaybackScene as PlaybackScene };
export { registerWidgetActionHandler, sendWidgetAction } from './widget-bridge';
export type { WidgetMessageResult, WidgetActionDetail } from './widget-bridge';


import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { RuntimeTTSConfig, TeachingPresenter } from '@dgbook/animation';

export type TeachingDockMode = 'idle' | 'playing' | 'paused';

export interface TeachingDockVoiceOption {
  id: string;
  label: string;
}

export interface TeachingDockProps {
  presenter: TeachingPresenter;
  presenters: TeachingPresenter[];
  mode: TeachingDockMode;
  title: string;
  status: string;
  transcript: string;
  transcriptId?: string;
  progress: number;
  speaking?: boolean;
  muted?: boolean;
  showStop?: boolean;
  showSettings?: boolean;
  readOnly?: boolean;
  speed: number;
  ttsProvider: RuntimeTTSConfig['providerId'];
  voiceURI?: string;
  voiceOptions?: TeachingDockVoiceOption[];
  ttsBaseUrl?: string;
  ttsModel?: string;
  ttsVoice?: string;
  onToggle: () => void;
  onStop?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSpeedChange: (speed: number) => void;
  onPresenterChange: (presenterId: string) => void;
  onTtsProviderChange: (providerId: RuntimeTTSConfig['providerId']) => void;
  onMutedChange?: (muted: boolean) => void;
  onVoiceURIChange?: (voiceURI: string) => void;
  onTtsBaseUrlChange?: (value: string) => void;
  onTtsModelChange?: (value: string) => void;
  onTtsVoiceChange?: (value: string) => void;
}

const TEXT = {
  ready: '\u6559\u5b66\u64ad\u62a5\u5df2\u5c31\u7eea\u3002',
  fallbackInitial: '\u8bb2',
  prev: '\u4e0a\u4e00\u6bb5',
  play: '\u64ad\u653e',
  pause: '\u6682\u505c',
  next: '\u4e0b\u4e00\u6bb5',
  stop: '\u505c\u6b62',
  speed: '\u8bed\u901f',
  mute: '\u9759\u97f3',
  unmute: '\u53d6\u6d88\u9759\u97f3',
  settings: '\u64ad\u62a5\u8bbe\u7f6e',
  presenter: '\u4eba\u50cf',
  browserVoice: '\u6d4f\u89c8\u5668\u58f0\u97f3',
  autoVoice: '\u81ea\u52a8\u4e2d\u6587\u58f0\u97f3',
};

type TranscriptEntry = {
  id: string;
  text: string;
};

const TRANSCRIPT_HISTORY_LIMIT = 10;
const TRANSCRIPT_CURRENT_LIMIT = 120;
const TRANSCRIPT_PAST_LIMIT = 82;

export function TeachingDock({
  presenter,
  presenters,
  mode,
  title,
  status,
  transcript,
  transcriptId,
  progress,
  speaking = false,
  muted = false,
  showStop = true,
  showSettings = true,
  readOnly = false,
  speed,
  ttsProvider,
  voiceURI = '',
  voiceOptions = [],
  ttsBaseUrl = '',
  ttsModel = '',
  ttsVoice = '',
  onToggle,
  onStop,
  onPrev,
  onNext,
  onSpeedChange,
  onPresenterChange,
  onTtsProviderChange,
  onMutedChange,
  onVoiceURIChange,
  onTtsBaseUrlChange,
  onTtsModelChange,
  onTtsVoiceChange,
}: TeachingDockProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [history, setHistory] = useState<TranscriptEntry[]>([]);
  const avatarSrc = presenter.avatar || presenter.avatarUrl;
  const [avatarFailed, setAvatarFailed] = useState(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const safeProgress = Math.max(0, Math.min(100, progress));
  const text = transcript || (mode === 'idle' ? TEXT.ready : status);
  const initials = useMemo(() => presenter.name.replace(/\s+/g, '').slice(0, 1) || TEXT.fallbackInitial, [presenter.name]);
  const showAvatarImage = Boolean(avatarSrc && !avatarFailed);

  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) return undefined;
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollTranscriptToEnd(node);
      window.setTimeout(() => scrollTranscriptToEnd(node), 60);
      window.setTimeout(() => scrollTranscriptToEnd(node), 180);
      window.setTimeout(() => scrollTranscriptToEnd(node), 360);
      scrollFrameRef.current = null;
    });
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [history]);

  useEffect(() => {
    const node = transcriptRef.current;
    if (!node) return;
    scrollTranscriptToEnd(node);
    window.setTimeout(() => scrollTranscriptToEnd(node), 120);
  }, [text]);

  useEffect(() => {
    const next = normalizeTranscriptText(text);
    if (!next || next === TEXT.ready || next.includes('\u5df2\u5c31\u7eea')) return;
    setHistory((previous) => {
      const id = transcriptId ?? `transcript-${next}`;
      const previousEntry = previous.find((entry) => entry.id === id);
      if (previousEntry?.text === next && previous[previous.length - 1]?.id === id) return previous;
      return [...previous.filter((entry) => entry.id !== id), { id, text: next }].slice(-TRANSCRIPT_HISTORY_LIMIT);
    });
  }, [text, transcriptId]);

  useEffect(() => {
    if (mode === 'idle' && progress === 0) setHistory([]);
  }, [mode, progress]);

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarSrc]);

  return (
    <section className="dg-teaching-dock-shell" aria-label={title} style={{ '--presenter-color': presenter.color } as CSSProperties}>
      <div className="dg-teaching-dock">
        <div className="dg-teaching-presenter">
          <span className={`dg-teaching-avatar ${speaking ? 'is-speaking' : ''}`}>
            {showAvatarImage ? <img src={avatarSrc} alt="" onError={() => setAvatarFailed(true)} /> : <b>{initials}</b>}
          </span>
          <span className="dg-teaching-identity">
            <strong>{presenter.name}</strong>
            <em>{presenter.title}</em>
          </span>
        </div>

        <div className="dg-teaching-transcript">
          <VoiceBars active={speaking || mode === 'playing'} />
          <div className="dg-teaching-transcript-text" ref={transcriptRef} aria-live="polite">
            {(history.length > 0 ? history : [{ id: 'initial', text }]).map((entry, index, items) => {
              const isCurrent = index === items.length - 1;
              return (
                <p key={entry.id} className={isCurrent ? 'is-current' : undefined} title={entry.text}>
                  {compactTranscriptText(entry.text, isCurrent ? TRANSCRIPT_CURRENT_LIMIT : TRANSCRIPT_PAST_LIMIT)}
                </p>
              );
            })}
          </div>
        </div>

        <div className="dg-teaching-controls">
          <button type="button" onClick={onPrev} disabled={readOnly || !onPrev} title={TEXT.prev} aria-label={TEXT.prev}>
            <Icon name="prev" />
          </button>
          <button className="is-primary" type="button" onClick={onToggle} disabled={readOnly} title={mode === 'playing' ? TEXT.pause : TEXT.play} aria-label={mode === 'playing' ? TEXT.pause : TEXT.play}>
            <Icon name={mode === 'playing' ? 'pause' : 'play'} />
          </button>
          <button type="button" onClick={onNext} disabled={readOnly || !onNext} title={TEXT.next} aria-label={TEXT.next}>
            <Icon name="next" />
          </button>
          {showStop && (
            <button type="button" onClick={onStop} disabled={readOnly || !onStop} title={TEXT.stop} aria-label={TEXT.stop}>
              <Icon name="stop" />
            </button>
          )}
          <select value={speed} onChange={(event) => onSpeedChange(Number(event.target.value))} disabled={readOnly} title={TEXT.speed} aria-label={TEXT.speed}>
            <option value={0.85}>0.85x</option>
            <option value={1}>1.0x</option>
            <option value={1.15}>1.15x</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
          </select>
          {onMutedChange && (
            <button type="button" onClick={() => onMutedChange(!muted)} disabled={readOnly} title={muted ? TEXT.unmute : TEXT.mute} aria-label={muted ? TEXT.unmute : TEXT.mute}>
              <Icon name={muted ? 'muted' : 'volume'} />
            </button>
          )}
          {showSettings && (
            <button type="button" onClick={() => setSettingsOpen((value) => !value)} disabled={readOnly} title={TEXT.settings} aria-label={TEXT.settings}>
              <Icon name="settings" />
            </button>
          )}
        </div>

        <div className="dg-teaching-progress" aria-hidden="true">
          <span style={{ width: `${safeProgress}%` }} />
        </div>
      </div>

      {settingsOpen && showSettings && (
        <div className="dg-teaching-settings">
          <label>
            <span>{TEXT.presenter}</span>
            <select value={presenter.id} onChange={(event) => onPresenterChange(event.target.value)}>
              {presenters.map((item) => (
                <option key={item.id} value={item.id}>{item.name} - {item.title}</option>
              ))}
            </select>
          </label>
          <label>
            <span>TTS</span>
            <select value={ttsProvider} onChange={(event) => onTtsProviderChange(event.target.value as RuntimeTTSConfig['providerId'])}>
              <option value="qwen-tts">Qwen3 TTS Flash</option>
              <option value="voxcpm-tts">VoxCPM2 Local</option>
              <option value="kokoro-tts">Kokoro Local</option>
              <option value="custom-openai-compatible-tts">OpenAI Compatible</option>
              <option value="browser-native-tts">Browser Native</option>
            </select>
          </label>
          {ttsProvider === 'browser-native-tts' ? (
            <label className="is-wide">
              <span>{TEXT.browserVoice}</span>
              <select value={voiceURI} onChange={(event) => onVoiceURIChange?.(event.target.value)}>
                <option value="">{TEXT.autoVoice}</option>
                {voiceOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="is-wide">
                <span>Base URL</span>
                <input value={ttsBaseUrl} onChange={(event) => onTtsBaseUrlChange?.(event.target.value)} placeholder={placeholderFor(ttsProvider, 'baseUrl')} />
              </label>
              <label>
                <span>Model</span>
                <input value={ttsModel} onChange={(event) => onTtsModelChange?.(event.target.value)} placeholder={placeholderFor(ttsProvider, 'model')} />
              </label>
              <label>
                <span>Voice</span>
                <input value={ttsVoice} onChange={(event) => onTtsVoiceChange?.(event.target.value)} placeholder={placeholderFor(ttsProvider, 'voice')} />
              </label>
            </>
          )}
        </div>
      )}
      <TeachingDockStyle />
    </section>
  );
}

function TeachingDockStyle() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const id = 'dg-teaching-dock-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = teachingDockStyles;
    document.head.appendChild(style);
  }, []);
  return null;
}

function scrollTranscriptToEnd(node: HTMLDivElement) {
  node.scrollTop = node.scrollHeight;
}

function VoiceBars({ active }: { active: boolean }) {
  return (
    <i className={`dg-teaching-bars ${active ? 'is-active' : ''}`} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => <b key={index} />)}
    </i>
  );
}

function normalizeTranscriptText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function isSameTranscriptWindow(previous: string, next: string) {
  const prev = normalizeTranscriptCompareText(previous);
  const current = normalizeTranscriptCompareText(next);
  if (prev.length < 12 || current.length < 12) return false;
  if (current.includes(prev) || prev.includes(current)) return true;
  const minLength = Math.min(prev.length, current.length);
  let samePrefix = 0;
  while (samePrefix < minLength && prev[samePrefix] === current[samePrefix]) samePrefix += 1;
  return samePrefix >= 18 && samePrefix / minLength > 0.68;
}

function normalizeTranscriptCompareText(value: string) {
  return normalizeTranscriptText(value).replace(/[，。；：、,.!?！？;:"“”'‘’…\s]/g, '');
}

function compactTranscriptText(value: string, limit: number) {
  const text = normalizeTranscriptText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function Icon({ name }: { name: 'play' | 'pause' | 'stop' | 'prev' | 'next' | 'settings' | 'volume' | 'muted' }) {
  const paths = {
    play: <path d="M8 5v14l11-7z" />,
    pause: <path d="M7 5h4v14H7zM13 5h4v14h-4z" />,
    stop: <path d="M6 6h12v12H6z" />,
    prev: <path d="M7 6h2v12H7zM10 12l9 6V6z" />,
    next: <path d="M15 6h2v12h-2zM5 18l9-6-9-6z" />,
    settings: <path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm8.5 4a7.8 7.8 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L15.9 3h-3.8l-.3 3.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.8 1l.3 3.1h3.8l.3-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z" />,
    volume: <path d="M4 9v6h4l5 4V5L8 9H4Zm13.5 3a4.5 4.5 0 0 0-2.1-3.8v7.6a4.5 4.5 0 0 0 2.1-3.8Z" />,
    muted: <path d="M4 9v6h4l5 4V5L8 9H4Zm12.2.1 1.8 1.8 1.8-1.8 1.2 1.2-1.8 1.7 1.8 1.8-1.2 1.2-1.8-1.8-1.8 1.8-1.2-1.2 1.8-1.8-1.8-1.7 1.2-1.2Z" />,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function placeholderFor(provider: RuntimeTTSConfig['providerId'], field: 'baseUrl' | 'model' | 'voice') {
  const values = {
    'qwen-tts': {
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
      model: 'qwen3-tts-flash',
      voice: 'Cherry',
    },
    'voxcpm-tts': {
      baseUrl: 'http://127.0.0.1:8000/v1',
      model: 'voxcpm2',
      voice: 'voxcpm:auto',
    },
    'kokoro-tts': {
      baseUrl: 'http://127.0.0.1:8880/v1',
      model: 'kokoro',
      voice: 'zf_xiaoxiao',
    },
    'custom-openai-compatible-tts': {
      baseUrl: 'http://127.0.0.1:8880/v1',
      model: 'tts-1',
      voice: 'alloy',
    },
    'browser-native-tts': {
      baseUrl: '',
      model: '',
      voice: 'default',
    },
  } satisfies Record<RuntimeTTSConfig['providerId'], Record<'baseUrl' | 'model' | 'voice', string>>;
  return values[provider][field];
}

export const teachingDockStyles = `
.dg-teaching-dock-shell { --presenter-color: #0891b2; position: relative; width: 100%; color: #102033; }
.dg-teaching-dock { position: relative; min-height: 84px; display: grid; grid-template-columns: minmax(156px, 176px) minmax(300px, 1fr) auto; align-items: center; gap: 12px; padding: 10px 12px 12px; border: 1px solid rgba(167,206,214,.9); border-radius: 16px; background: #fff; box-shadow: 0 18px 48px rgba(15,23,42,.16); overflow: hidden; }
.dg-teaching-presenter { display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; gap: 10px; min-width: 0; max-width: 176px; }
.dg-teaching-avatar { position: relative; width: 44px; height: 44px; border-radius: 999px; display: grid; place-items: center; overflow: hidden; flex: 0 0 auto; border: 2px solid var(--presenter-color); background: color-mix(in srgb, var(--presenter-color) 16%, white); color: var(--presenter-color); font-size: 18px; font-weight: 950; line-height: 1; }
.dg-teaching-avatar img { position: absolute; inset: 0; z-index: 2; display: block; width: 100%; height: 100%; object-fit: cover; background: #fff; }
.dg-teaching-avatar b { position: relative; z-index: 1; display: grid; place-items: center; width: 100%; height: 100%; letter-spacing: 0; text-align: center; }
.dg-teaching-avatar.is-speaking { box-shadow: 0 0 0 5px color-mix(in srgb, var(--presenter-color) 18%, transparent), 0 10px 26px rgba(15,23,42,.14); }
.dg-teaching-identity { min-width: 0; display: grid; gap: 2px; }
.dg-teaching-identity strong { display: block; max-width: 118px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #006b73; font-size: 13px; font-weight: 950; }
.dg-teaching-identity em { display: block; max-width: 118px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #102033; font-size: 12px; font-style: normal; font-weight: 850; }
.dg-teaching-transcript { min-width: 0; height: 62px; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: stretch; gap: 10px; border: 1px solid #cfe0e5; border-radius: 12px; background: #eef7f9; padding: 7px 12px; color: #244153; }
.dg-teaching-transcript-text { min-width: 0; max-height: 48px; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; white-space: normal; font-size: 13px; font-weight: 750; line-height: 1.42; scrollbar-width: thin; scroll-behavior: auto; }
.dg-teaching-transcript-text p { margin: 0 0 5px; color: #64748b; }
.dg-teaching-transcript-text p.is-current { color: #18364a; font-weight: 900; }
.dg-teaching-bars { display: inline-flex; align-items: center; align-self: center; gap: 3px; height: 18px; color: var(--presenter-color); }
.dg-teaching-bars b { width: 3px; height: 7px; border-radius: 999px; background: currentColor; opacity: .5; }
.dg-teaching-bars.is-active b { animation: dgTeachingBar .64s ease-in-out infinite alternate; opacity: .9; }
.dg-teaching-bars b:nth-child(2) { animation-delay: .1s; height: 11px; }
.dg-teaching-bars b:nth-child(3) { animation-delay: .2s; height: 15px; }
.dg-teaching-bars b:nth-child(4) { animation-delay: .3s; height: 10px; }
.dg-teaching-bars b:nth-child(5) { animation-delay: .4s; height: 13px; }
.dg-teaching-controls { display: flex; align-items: center; gap: 7px; }
.dg-teaching-controls button, .dg-teaching-controls select { height: 34px; border: 1px solid #d2e2e7; background: #fff; color: #33536a; border-radius: 10px; }
.dg-teaching-controls button { width: 34px; display: grid; place-items: center; padding: 0; }
.dg-teaching-controls button:disabled { opacity: .42; }
.dg-teaching-controls button.is-primary { width: 40px; height: 40px; border-color: var(--presenter-color); background: var(--presenter-color); color: #fff; box-shadow: 0 8px 22px color-mix(in srgb, var(--presenter-color) 28%, transparent); }
.dg-teaching-controls svg { width: 16px; height: 16px; fill: currentColor; }
.dg-teaching-controls select { width: 74px; padding: 0 6px; font-size: 12px; font-weight: 800; }
.dg-teaching-progress { position: absolute; left: 14px; right: 14px; bottom: 4px; height: 3px; border-radius: 999px; overflow: hidden; background: #dcebf0; }
.dg-teaching-progress span { display: block; height: 100%; border-radius: inherit; background: var(--presenter-color); transition: width .22s ease; }
.dg-teaching-settings { margin-top: 8px; display: grid; grid-template-columns: minmax(150px, 1fr) minmax(150px, 1fr); gap: 8px; padding: 10px; border: 1px solid #d8e7eb; border-radius: 14px; background: rgba(255,255,255,.94); box-shadow: 0 16px 36px rgba(15,23,42,.08); }
.dg-teaching-settings label { min-width: 0; display: grid; gap: 4px; }
.dg-teaching-settings label.is-wide { grid-column: 1 / -1; }
.dg-teaching-settings span { color: #607789; font-size: 12px; font-weight: 850; }
.dg-teaching-settings input, .dg-teaching-settings select { width: 100%; height: 34px; border: 1px solid #cbdde4; border-radius: 9px; background: #fff; color: #1c3548; padding: 0 9px; font-size: 12px; }
@keyframes dgTeachingBar { from { transform: scaleY(.55); } to { transform: scaleY(1.25); } }
@media (max-width: 900px) {
  .dg-teaching-dock { grid-template-columns: minmax(130px, auto) minmax(0, 1fr); }
  .dg-teaching-controls { grid-column: 1 / -1; justify-content: flex-end; }
}
@media (max-width: 620px) {
  .dg-teaching-dock { grid-template-columns: 1fr auto; gap: 8px; border-radius: 16px; }
  .dg-teaching-transcript { grid-column: 1 / -1; order: 3; }
  .dg-teaching-controls select, .dg-teaching-controls button:nth-last-child(1) { display: none; }
  .dg-teaching-settings { grid-template-columns: 1fr; }
}
`;

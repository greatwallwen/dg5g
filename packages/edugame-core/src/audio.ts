// EduGameKit sound pool. Plays short cues for correct/wrong/combo/fail/finish/level.
//
// Two backends, picked automatically:
//  - If an audio sprite file is configured (opts.src), Howler is lazily loaded.
//  - Otherwise the pool synthesizes the cue with the Web Audio API (no asset
//    needed, works offline, license-free). This keeps the game audible without
//    shipping any sound files. Falls back to silent if neither is available.

export type SfxName = 'correct' | 'wrong' | 'combo' | 'fail' | 'finish' | 'level';

export interface SfxPoolOptions {
  /** Sprite audio file(s) (webm/mp3). When empty the pool synthesizes cues. */
  src?: string[];
  /** Sprite map: name -> [startMs, durationMs]. Merged over DEFAULT_SPRITE. */
  sprite?: Partial<Record<SfxName, [number, number]>>;
  volume?: number;
  muted?: boolean;
  /** Set false to disable the Web Audio fallback and stay silent without a sprite. */
  synth?: boolean;
}

const DEFAULT_SPRITE: Record<SfxName, [number, number]> = {
  correct: [0, 300],
  combo: [400, 350],
  wrong: [800, 350],
  fail: [1200, 700],
  level: [2000, 500],
  finish: [2600, 1200],
};

// Synth voice per cue: notes (Hz) played in sequence, waveform, per-note duration,
// gap between notes, and relative loudness. Tuned to read as arcade game feedback.
type Voice = { freqs: number[]; type: 'sine' | 'square' | 'triangle' | 'sawtooth'; dur: number; gap: number; gain: number };
const VOICES: Record<SfxName, Voice> = {
  correct: { freqs: [660, 990], type: 'triangle', dur: 0.09, gap: 0.06, gain: 0.5 },
  combo: { freqs: [784, 1047, 1319], type: 'square', dur: 0.07, gap: 0.05, gain: 0.42 },
  wrong: { freqs: [196, 147], type: 'sawtooth', dur: 0.12, gap: 0.07, gain: 0.38 },
  fail: { freqs: [330, 247, 165], type: 'sawtooth', dur: 0.18, gap: 0.12, gain: 0.42 },
  level: { freqs: [523, 784], type: 'triangle', dur: 0.1, gap: 0.08, gain: 0.5 },
  finish: { freqs: [523, 659, 784, 1047], type: 'square', dur: 0.12, gap: 0.1, gain: 0.5 },
};

type MusicPattern = { scale: number[]; stepMs: number; type: Voice['type']; gain: number; bassEvery: number; pulseEvery: number };
const MUSIC_PATTERNS: Record<string, MusicPattern> = {
  'quick-hit': { scale: [220, 277, 330, 392, 494], stepMs: 340, type: 'triangle', gain: 0.075, bassEvery: 4, pulseEvery: 2 },
  'quiz-rush': { scale: [196, 247, 294, 330, 392], stepMs: 320, type: 'square', gain: 0.052, bassEvery: 3, pulseEvery: 1 },
  'drag-match': { scale: [196, 294, 330, 392, 440], stepMs: 440, type: 'triangle', gain: 0.066, bassEvery: 4, pulseEvery: 2 },
  'sort-flow': { scale: [165, 220, 247, 330, 370], stepMs: 500, type: 'sine', gain: 0.064, bassEvery: 4, pulseEvery: 3 },
  'pipe-connect': { scale: [174, 220, 261, 349, 392], stepMs: 410, type: 'triangle', gain: 0.068, bassEvery: 4, pulseEvery: 2 },
  'maze-troubleshoot': { scale: [147, 196, 220, 294, 330], stepMs: 540, type: 'sawtooth', gain: 0.04, bassEvery: 2, pulseEvery: 3 },
  'classification-run': { scale: [247, 330, 392, 494, 587], stepMs: 285, type: 'square', gain: 0.05, bassEvery: 5, pulseEvery: 1 },
  'match-3': { scale: [262, 330, 392, 523, 659], stepMs: 300, type: 'triangle', gain: 0.058, bassEvery: 4, pulseEvery: 2 },
  arcade: { scale: [220, 277, 330, 392, 494], stepMs: 430, type: 'triangle', gain: 0.072, bassEvery: 4, pulseEvery: 2 },
};

export class SfxPool {
  private howl: { play: (n: string) => void; mute: (m: boolean) => void; unload: () => void } | null = null;
  private ready = false;
  private muted: boolean;
  private readonly volume: number;
  private readonly useSynth: boolean;
  private ctx: any = null; // AudioContext (typed loosely so core stays DOM-lib-agnostic)
  private musicTimer: any = null;

  constructor(opts: SfxPoolOptions = {}) {
    this.muted = opts.muted ?? false;
    this.volume = opts.volume ?? 0.6;
    this.useSynth = opts.synth ?? true;
    if (opts.src && opts.src.length > 0) {
      void this.load(opts.src, { ...DEFAULT_SPRITE, ...(opts.sprite ?? {}) });
    }
  }

  private async load(src: string[], sprite: Record<string, [number, number]>): Promise<void> {
    try {
      const mod: any = await import('howler');
      const Howl = mod.Howl ?? mod.default?.Howl;
      if (!Howl) return;
      this.howl = new Howl({
        src,
        sprite,
        volume: this.volume,
        preload: true,
        html5: false,
        onload: () => {
          this.ready = true;
        },
        onloaderror: () => {
          this.ready = false;
          this.howl = null;
        },
      });
    } catch {
      this.howl = null; // package missing / load failed -> fall back to synth
    }
  }

  play(name: SfxName): void {
    if (this.muted) return;
    if (this.ready && this.howl) {
      try {
        this.howl.play(name);
        return;
      } catch {
        /* fall through to synth */
      }
    }
    if (this.useSynth) this.synth(name);
  }

  startMusic(style = 'arcade'): void {
    if (this.muted || !this.useSynth || this.musicTimer) return;
    const ctx = this.getContext();
    if (!ctx) return;
    const pattern = MUSIC_PATTERNS[style] ?? MUSIC_PATTERNS.arcade!;
    const scale = pattern.scale;
    let step = 0;
    const tick = () => {
      if (this.muted) return;
      const now = ctx.currentTime + 0.002;
      const freq = scale[step % scale.length]!;
      this.tone(ctx, freq, now, 0.1, pattern.type, pattern.gain);
      if (step % pattern.pulseEvery === 0) this.tone(ctx, freq * 2, now + 0.025, 0.035, 'square', pattern.gain * 0.24);
      if (step % pattern.bassEvery === 0) this.tone(ctx, freq / 2, now, 0.2, 'sine', pattern.gain * 0.72);
      step += 1;
    };
    tick();
    this.musicTimer = globalThis.setInterval(tick, pattern.stepMs);
  }

  stopMusic(): void {
    if (this.musicTimer) {
      globalThis.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private getContext(): any {
    if (typeof globalThis === 'undefined') return null;
    const AC = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
    if (!AC) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume?.().catch?.(() => {});
    return this.ctx;
  }

  private synth(name: SfxName): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const voice = VOICES[name];
    const start = ctx.currentTime + 0.001;
    voice.freqs.forEach((freq, i) => {
      const t = start + i * voice.gap;
      this.tone(ctx, freq, t, voice.dur, voice.type, voice.gain);
    });
  }

  private tone(ctx: any, freq: number, t: number, dur: number, type: Voice['type'], gainScale: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    const peak = Math.max(0.0001, this.volume * gainScale);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  setMuted(value: boolean): void {
    this.muted = value;
    if (value) this.stopMusic();
    try {
      this.howl?.mute(value);
    } catch {
      /* noop */
    }
  }

  dispose(): void {
    try {
      this.howl?.unload();
    } catch {
      /* noop */
    }
    this.howl = null;
    this.ready = false;
    this.stopMusic();
    try {
      this.ctx?.close?.();
    } catch {
      /* noop */
    }
    this.ctx = null;
  }
}

export function createSfxPool(audioConfig?: SfxPoolOptions): SfxPool {
  return new SfxPool(audioConfig);
}

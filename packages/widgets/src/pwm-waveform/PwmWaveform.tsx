import { useEffect, useRef, useState } from 'react';

export interface PwmWaveformProps {
  /** 频率 Hz, 1–5000 */
  frequency?: number;
  /** 占空比 %, 0–100 */
  dutyCycle?: number;
  /** 联动 LED 亮度 */
  ledLink?: boolean;
  /** 联动蜂鸣器(Web Audio API 输出方波) */
  buzzerLink?: boolean;
  /** 只读模式 — 在教材正文中嵌入时,作者可锁定参数 */
  readOnly?: boolean;
  /** 主色,跟随教材主题(默认青色) */
  accent?: string;
}

const CLAMP = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function PwmWaveform({
  frequency: initialFreq = 1,
  dutyCycle: initialDuty = 50,
  ledLink: initialLed = true,
  buzzerLink: initialBuz = false,
  readOnly = false,
  accent
}: PwmWaveformProps) {
  const [freq, setFreq] = useState(initialFreq);
  const [duty, setDuty] = useState(initialDuty);
  const [ledLink, setLedLink] = useState(initialLed);
  const [buzLink, setBuzLink] = useState(initialBuz);
  // 跟随宿主主题: 默认从 CSS 变量 --accent 取色,无变量时用青色兜底
  const [resolvedAccent, setResolvedAccent] = useState<string>(accent ?? '#22D3EE');
  useEffect(() => {
    if (accent) { setResolvedAccent(accent); return; }
    if (typeof window === 'undefined') return;
    const css = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    if (css) setResolvedAccent(css);
  }, [accent]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  // === 绘制波形 ===
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);

    // 主题色 + 文字色(从 CSS 变量读,兜底亮色与暗色)
    const styles = typeof window !== 'undefined' ? getComputedStyle(document.documentElement) : null;
    const muted = styles?.getPropertyValue('--muted').trim() || 'rgba(148,163,184,0.7)';
    const isDarkBg = (() => {
      const bg = styles?.getPropertyValue('--bg').trim() || '#0F172A';
      // 简易明暗判定: 取 hex 前两位
      const hex = bg.startsWith('#') ? bg.slice(1, 3) : 'F0';
      return parseInt(hex, 16) < 0x80;
    })();
    const gridColor = isDarkBg ? 'rgba(148,163,184,0.18)' : 'rgba(100,116,139,0.18)';

    // 网格
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += W / 10) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += H / 4) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // 电平标签
    ctx.fillStyle = muted;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('3.3V', 4, H * 0.18);
    ctx.fillText('0V',   4, H * 0.82);

    // 方波 — 显示 3 个周期
    const periods = 3;
    const dutyFrac = CLAMP(duty, 0, 100) / 100;
    const periodPx = W / periods;
    const yHigh = H * 0.2;
    const yLow  = H * 0.8;

    ctx.strokeStyle = resolvedAccent;
    ctx.lineWidth = 2.5;
    if (isDarkBg) {
      ctx.shadowColor = resolvedAccent;
      ctx.shadowBlur = 6;
    }
    ctx.beginPath();
    ctx.moveTo(0, yLow);
    for (let i = 0; i < periods; i++) {
      const x0 = i * periodPx;
      const xHighEnd = x0 + periodPx * dutyFrac;
      const xPeriodEnd = x0 + periodPx;
      ctx.lineTo(x0, yHigh);
      ctx.lineTo(xHighEnd, yHigh);
      ctx.lineTo(xHighEnd, yLow);
      ctx.lineTo(xPeriodEnd, yLow);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 频率/周期标注
    ctx.fillStyle = resolvedAccent;
    ctx.font = '12px ui-monospace, monospace';
    const T = (1000 / freq).toFixed(freq > 100 ? 2 : 1);
    ctx.fillText(`f = ${freq} Hz   T = ${T} ms   duty = ${duty}%`, W - 230, H - 8);
  }, [freq, duty, resolvedAccent]);

  // === 蜂鸣器 (Web Audio API 方波) ===
  useEffect(() => {
    if (!buzLink) {
      // stop
      try {
        oscRef.current?.stop();
        oscRef.current?.disconnect();
      } catch { /* may be already stopped */ }
      oscRef.current = null;
      return;
    }
    // start / update
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    const ac = audioCtxRef.current;
    // 限制可听范围 100–4000 Hz(超低或超高对扬声器无意义)
    const audibleFreq = CLAMP(freq, 100, 4000);

    if (!oscRef.current) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'square';
      osc.frequency.value = audibleFreq;
      gain.gain.value = (duty / 100) * 0.08;  // 占空比影响响度,封顶 0.08 保护耳朵
      osc.connect(gain).connect(ac.destination);
      osc.start();
      oscRef.current = osc;
      gainRef.current = gain;
    } else {
      oscRef.current.frequency.setValueAtTime(audibleFreq, ac.currentTime);
      gainRef.current!.gain.setValueAtTime((duty / 100) * 0.08, ac.currentTime);
    }
    return () => { /* 不在这里 stop,由 buzLink=false 触发 */ };
  }, [buzLink, freq, duty]);

  useEffect(() => () => {
    try { oscRef.current?.stop(); } catch { /* ignore */ }
    audioCtxRef.current?.close();
  }, []);

  // LED 亮度 = 占空比;频率 < 10 Hz 时显式闪烁
  const ledOpacity = duty / 100;
  const ledBlink = freq <= 10;
  const ledStyle: React.CSSProperties = ledBlink
    ? { animation: `pwm-blink ${1000 / freq}ms steps(2, end) infinite` }
    : { opacity: ledOpacity };

  // 使用 CSS 变量,容器风格自动跟随宿主主题
  const containerStyle: React.CSSProperties = {
    background: 'var(--panel, rgba(15,23,42,0.6))',
    border: '1px solid var(--border, rgba(34,211,238,0.25))',
    borderRadius: 12,
    padding: 16,
    color: 'var(--text, #E2E8F0)',
    fontFamily: 'var(--font-body, ui-sans-serif, system-ui, sans-serif)'
  };
  const canvasStyle: React.CSSProperties = {
    width: '100%', maxWidth: 520, height: 180,
    background: 'var(--code-bg, rgba(15,23,42,0.9))',
    borderRadius: 8,
    border: '1px solid var(--border, transparent)'
  };

  return (
    <div className="dgbook-pwm-waveform" style={containerStyle}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pwm-blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0.08; }
        }
      ` }} />

      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <canvas ref={canvasRef} width={520} height={180} style={canvasStyle} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 180, flex: '1 1 180px' }}>
          {/* LED */}
          {ledLink && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--muted, #94A3B8)' }}>LED:</div>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'var(--success, #A3E635)',
                boxShadow: `0 0 16px ${ledBlink ? 'var(--success, rgba(163,230,53,0.8))' : `rgba(163,230,53,${0.4 + ledOpacity * 0.4})`}`,
                ...ledStyle
              }} />
            </div>
          )}
          {/* 蜂鸣器图标 */}
          {buzLink && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--muted, #94A3B8)' }}>蜂鸣:</div>
              <div style={{ fontSize: 22 }}>🔊</div>
              <div style={{ fontSize: 11, color: 'var(--muted, #94A3B8)' }}>
                {freq < 100 ? '低频不可听' : freq > 4000 ? '超出可听' : `${freq} Hz`}
              </div>
            </div>
          )}
        </div>
      </div>

      {!readOnly && (
        <div style={{ marginTop: 16, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            <span>频率 <code style={{ color: 'var(--accent, #22D3EE)' }}>{freq} Hz</code></span>
            <input type="range" min={1} max={5000} step={1} value={freq}
              onChange={e => setFreq(Number(e.target.value))}
              style={{ accentColor: 'var(--accent, #22D3EE)' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
            <span>占空比 <code style={{ color: 'var(--accent, #22D3EE)' }}>{duty}%</code></span>
            <input type="range" min={0} max={100} step={1} value={duty}
              onChange={e => setDuty(Number(e.target.value))}
              style={{ accentColor: 'var(--accent, #22D3EE)' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={ledLink} onChange={e => setLedLink(e.target.checked)} />
            <span>LED 联动</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={buzLink} onChange={e => setBuzLink(e.target.checked)} />
            <span>蜂鸣器联动(可听)</span>
          </label>
        </div>
      )}
    </div>
  );
}

export default PwmWaveform;

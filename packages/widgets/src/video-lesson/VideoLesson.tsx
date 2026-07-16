import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface VideoLessonProps {
  videoId?: string;
  title?: string;
  src?: string;
  poster?: string;
  durationSeconds?: number;
  generationPrompt?: string;
  chapters?: string;
  transcript?: string;
  readOnly?: boolean;
}

interface ChapterItem {
  time: string;
  title: string;
}

export function VideoLesson({
  videoId = 'dgbook-video-lesson',
  title = '教学视频',
  src = '',
  poster,
  durationSeconds = 18,
  generationPrompt = '',
  chapters = '',
  transcript = '',
  readOnly: _readOnly = true,
}: VideoLessonProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<number | null>(null);
  const progressRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const durationMs = Math.max(3, durationSeconds) * 1000;
  const chapterItems = useMemo(() => parseChapters(chapters), [chapters]);
  const transcriptLines = useMemo(
    () => transcript.split(/\n+/).map((line) => line.trim()).filter(Boolean),
    [transcript],
  );

  const finish = useCallback(() => {
    setPlaying(false);
    progressRef.current = 1;
    setProgress(1);
    window.dispatchEvent(new CustomEvent('dgbook:animation-video-ended', { detail: { videoId } }));
  }, [videoId]);

  const start = useCallback(() => {
    if (src && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => finish());
    }
    progressRef.current = 0;
    setProgress(0);
    setPlaying(true);
  }, [finish, src]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    setPlaying(false);
  }, []);

  useEffect(() => {
    function handlePlay(event: Event) {
      if (!(event instanceof CustomEvent)) return;
      if (event.detail?.videoId === videoId) start();
    }
    window.addEventListener('dgbook:animation-play_video', handlePlay);
    return () => window.removeEventListener('dgbook:animation-play_video', handlePlay);
  }, [start, videoId]);

  useEffect(() => {
    if (!playing || src) return;
    const startedAt = performance.now() - progressRef.current * durationMs;
    const tick = (now: number) => {
      const next = Math.min(1, (now - startedAt) / durationMs);
      progressRef.current = next;
      setProgress(next);
      if (next >= 1) {
        finish();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [durationMs, finish, playing, src]);

  const activeStage = Math.min(2, Math.floor(progress * 3));

  return (
    <section data-video-id={videoId} style={shellStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>video lesson</div>
          <h3 style={titleStyle}>{title}</h3>
        </div>
        <button type="button" onClick={playing ? pause : start} style={playButtonStyle}>
          {playing ? '暂停' : progress >= 1 ? '重播' : '播放'}
        </button>
      </div>

      <div style={stageStyle}>
        {src ? (
          <video
            id={videoId}
            ref={videoRef}
            data-video-id={videoId}
            src={src}
            poster={poster}
            controls
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(event) => {
              const video = event.currentTarget;
              if (Number.isFinite(video.duration) && video.duration > 0) {
                const next = video.currentTime / video.duration;
                progressRef.current = next;
                setProgress(next);
              }
            }}
            onEnded={finish}
            style={videoStyle}
          />
        ) : (
          <div style={mockVideoStyle}>
            <div style={boardStyle}>
              <div style={{ ...chipStyle, transform: playing ? 'translateY(-2px)' : 'none' }}>5G gNB</div>
              <div style={pinStyle}>KPI</div>
              <div style={wireStyle}>
                <span style={{ ...pulseStyle, left: `${Math.min(92, progress * 100)}%`, opacity: playing ? 1 : 0.3 }} />
              </div>
              <div style={{ ...ledStyle, opacity: activeStage === 2 || playing ? 1 : 0.35 }} />
            </div>
            <div style={captionStyle}>
              {activeStage === 0 && '采集现网指标'}
              {activeStage === 1 && '定位弱覆盖与质差点'}
              {activeStage === 2 && '验证优化后指标改善'}
            </div>
          </div>
        )}
      </div>

      <div style={progressTrackStyle}>
        <div style={{ ...progressFillStyle, width: `${Math.round(progress * 100)}%` }} />
      </div>

      {(chapterItems.length > 0 || generationPrompt || transcriptLines.length > 0) && (
        <div style={metaGridStyle}>
          {chapterItems.length > 0 && (
            <div style={panelStyle}>
              <strong style={panelTitleStyle}>分镜节奏</strong>
              <div style={chapterListStyle}>
                {chapterItems.map((chapter) => (
                  <span key={`${chapter.time}-${chapter.title}`} style={chapterStyle}>
                    <code>{chapter.time}</code> {chapter.title}
                  </span>
                ))}
              </div>
            </div>
          )}
          {generationPrompt && (
            <div style={panelStyle}>
              <strong style={panelTitleStyle}>生成提示</strong>
              <p style={copyStyle}>{generationPrompt}</p>
            </div>
          )}
          {transcriptLines.length > 0 && (
            <div style={panelStyle}>
              <strong style={panelTitleStyle}>讲解稿</strong>
              {transcriptLines.map((line) => (
                <p key={line} style={copyStyle}>{line}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function parseChapters(value: string): ChapterItem[] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d{1,2}:\d{2})\s+(.+)$/);
      return match ? { time: match[1]!, title: match[2]! } : { time: '--:--', title: line };
    });
}

const shellStyle: React.CSSProperties = {
  padding: 18,
  background: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: 10,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  marginBottom: 14,
};

const eyebrowStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11,
  letterSpacing: 0.4,
  color: '#0891B2',
  textTransform: 'uppercase',
};

const titleStyle: React.CSSProperties = {
  margin: '2px 0 0',
  fontSize: 17,
  lineHeight: 1.35,
  color: '#0F172A',
};

const playButtonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 8,
  padding: '8px 14px',
  background: '#0891B2',
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

const stageStyle: React.CSSProperties = {
  overflow: 'hidden',
  borderRadius: 8,
  background: '#0F172A',
  aspectRatio: '16 / 9',
};

const videoStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  background: '#020617',
};

const mockVideoStyle: React.CSSProperties = {
  height: '100%',
  display: 'grid',
  gridTemplateRows: '1fr auto',
  background: 'linear-gradient(145deg, #0F172A 0%, #172554 100%)',
  color: '#E0F2FE',
};

const boardStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: 220,
};

const chipStyle: React.CSSProperties = {
  position: 'absolute',
  left: '10%',
  top: '34%',
  width: 130,
  height: 74,
  borderRadius: 8,
  background: '#111827',
  border: '1px solid #38BDF8',
  color: '#BAE6FD',
  display: 'grid',
  placeItems: 'center',
  fontFamily: 'ui-monospace, monospace',
  transition: 'transform .35s ease',
};

const pinStyle: React.CSSProperties = {
  position: 'absolute',
  left: '31%',
  top: '47%',
  fontFamily: 'ui-monospace, monospace',
  color: '#FDE68A',
};

const wireStyle: React.CSSProperties = {
  position: 'absolute',
  left: '39%',
  right: '23%',
  top: '52%',
  height: 4,
  borderRadius: 2,
  background: '#334155',
};

const pulseStyle: React.CSSProperties = {
  position: 'absolute',
  top: -5,
  width: 14,
  height: 14,
  borderRadius: '50%',
  background: '#FBBF24',
  boxShadow: '0 0 18px #FBBF24',
  transform: 'translateX(-50%)',
  transition: 'left .1s linear, opacity .2s ease',
};

const ledStyle: React.CSSProperties = {
  position: 'absolute',
  right: '11%',
  top: '39%',
  width: 76,
  height: 76,
  borderRadius: '50%',
  background: '#FACC15',
  boxShadow: '0 0 28px rgba(250,204,21,.78), inset 0 0 12px rgba(255,255,255,.45)',
  transition: 'opacity .25s ease',
};

const captionStyle: React.CSSProperties = {
  padding: '12px 16px',
  background: 'rgba(2, 6, 23, .55)',
  fontSize: 13,
  color: '#E0F2FE',
};

const progressTrackStyle: React.CSSProperties = {
  height: 5,
  marginTop: 12,
  background: '#E2E8F0',
  borderRadius: 999,
  overflow: 'hidden',
};

const progressFillStyle: React.CSSProperties = {
  height: '100%',
  background: '#0891B2',
  transition: 'width .12s linear',
};

const metaGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: 12,
  marginTop: 14,
};

const panelStyle: React.CSSProperties = {
  padding: 12,
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 8,
};

const panelTitleStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 8,
  fontSize: 13,
  color: '#0F172A',
};

const chapterListStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
};

const chapterStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderRadius: 999,
  background: '#EFF6FF',
  color: '#164E63',
  fontSize: 12,
};

const copyStyle: React.CSSProperties = {
  margin: '0 0 8px',
  color: '#475569',
  fontSize: 13,
  lineHeight: 1.65,
};

export default VideoLesson;

import type { EngineMode, TeachingPresenter } from '@dgbook/animation';
import { TeachingDock, type TeachingDockProps } from '@dgbook/widgets/teaching-dock';
import { getPlaybackMode } from './web-playback-dock-utils';

type WebPlaybackDockViewProps = Pick<TeachingDockProps,
  'title' | 'transcript' | 'transcriptId' | 'progress' | 'speaking' | 'muted' | 'readOnly' | 'speed' |
  'ttsProvider' | 'ttsBaseUrl' | 'ttsModel' | 'ttsVoice' | 'onToggle' | 'onStop' | 'onPrev' | 'onNext' |
  'onSpeedChange' | 'onMutedChange'> & {
  presenter: TeachingPresenter;
  status: string;
  mode: EngineMode;
};

export function WebPlaybackDockView({ presenter, mode, status, title, transcript, transcriptId, progress, speaking, muted, readOnly, speed, ttsProvider, ttsBaseUrl, ttsModel, ttsVoice, onToggle, onStop, onPrev, onNext, onSpeedChange, onMutedChange }: WebPlaybackDockViewProps) {
  return (
    <TeachingDock
      presenter={presenter}
      presenters={[presenter]}
      mode={getPlaybackMode(mode)}
      title={title}
      status={status}
      transcript={transcript}
      transcriptId={transcriptId}
      progress={progress}
      speaking={speaking}
      muted={muted}
      showStop
      showSettings={false}
      readOnly={readOnly}
      speed={speed}
      ttsProvider={ttsProvider}
      ttsBaseUrl={ttsBaseUrl}
      ttsModel={ttsModel}
      ttsVoice={ttsVoice}
      onToggle={onToggle}
      onStop={onStop}
      onPrev={onPrev}
      onNext={onNext}
      onSpeedChange={onSpeedChange}
      onPresenterChange={() => undefined}
      onTtsProviderChange={() => undefined}
      onMutedChange={onMutedChange}
    />
  );
}

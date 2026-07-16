import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PwmWaveform } from '../src/pwm-waveform';

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <PwmWaveform frequency={1} dutyCycle={50} ledLink buzzerLink={false} />
  </StrictMode>
);

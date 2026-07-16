import schema from './schema.json';

export const meta = {
  id: 'pwm-waveform',
  title: 'PWM 波形交互器',
  description: '拖滑块改占空比/频率,实时绘方波,联动 LED 亮度与蜂鸣器发声',
  version: '1.0.0',
  projects: ['P04', 'P10', 'P11', 'P12', 'P27', 'P28', 'P31', 'P37', 'P38'] as const,
  threads: ['pwm-control'] as const,
  schema,
} as const;

import schema from './schema.json';

const projects = ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18'] as const;

export const meta = {
  id: 'lesson-animation',
  title: '示意动画',
  description: '用于数字教材中的概念示意与过程演示，播报、人像和重点提示由教材播放器统一控制。',
  version: '0.1.0',
  projects,
  threads: ['5g-network-optimization'],
  schema,
} as const;

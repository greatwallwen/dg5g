import schema from './schema.json';

export const meta = {
  id: 'edugame-pixi',
  title: '教材游戏化互动',
  description: '面向知识点复习的闯关互动，包含新手提示、得分、连击、全屏和复盘反馈。',
  version: '0.1.0',
  projects: ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18'] as const,
  threads: [] as const,
  schema,
} as const;

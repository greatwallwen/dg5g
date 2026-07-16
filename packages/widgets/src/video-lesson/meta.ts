import schema from './schema.json';

export const meta = {
  id: 'video-lesson',
  title: '教学视频讲解',
  description: '承载真实教学视频或可审核的视频生成分镜,支持播放脚本同步控制',
  version: '1.0.0',
  projects: ['P04', 'P05', 'P10', 'P13', 'P19', 'P22', 'P36', 'P37', 'P38', 'P39', 'P40'] as const,
  threads: ['video-playback', 'tts-narration'] as const,
  schema,
} as const;

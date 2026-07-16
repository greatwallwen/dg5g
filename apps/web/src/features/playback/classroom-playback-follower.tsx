'use client';

import type { ClassroomPlaybackState, PlaybackScene } from '@/platform/models';
import { Icon } from '@/ui/foundation/icons';
import { followerFrame } from './classroom-playback-frame';
import { webPresenter } from './web-playback-config';

export function ClassroomPlaybackFollower({
  playback,
  scene,
}: {
  playback: ClassroomPlaybackState;
  scene: PlaybackScene;
}) {
  const frame = followerFrame(scene, playback);
  const statusLabel = frame.status === 'playing'
    ? '教师讲解中'
    : frame.status === 'paused'
      ? '教师已暂停'
      : frame.status === 'ended'
        ? '本段讲解完成'
        : '等待教师开始';

  return (
    <section
      aria-label="教师播报同步"
      className="classroom-playback-follower"
      data-action-id={frame.actionId}
      data-action-index={frame.actionIndex}
      data-classroom-revision={frame.revision}
      data-playback-status={frame.status}
      data-student-audio="muted"
    >
      <img alt="张老师" src={webPresenter.avatarUrl} />
      <div className="classroom-follower-presenter">
        <strong>{webPresenter.name}</strong>
        <small>{webPresenter.title} · 学生端静默同步</small>
      </div>
      <div className="classroom-follower-caption" aria-live="polite">
        <span><Icon name="radio" size={16} />{statusLabel}</span>
        <p>{frame.caption}</p>
      </div>
      <div className="classroom-follower-progress">
        <span>{frame.actionIndex + 1} / {scene.actions.length}</span>
        <progress aria-label="播报进度" max={100} value={frame.progress} />
      </div>
    </section>
  );
}

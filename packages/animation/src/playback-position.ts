export type PlaybackStartInput = {
  actionCount: number;
  actionIndex: number;
  positionMs: number;
  sceneCount: number;
  sceneIndex: number;
};

export type PlaybackStart = {
  actionIndex: number;
  positionMs: number;
  sceneIndex: number;
};

export function normalizePlaybackStart(input: PlaybackStartInput): PlaybackStart {
  const sceneCount = Math.max(1, Math.trunc(input.sceneCount));
  const actionCount = Math.max(1, Math.trunc(input.actionCount));
  return {
    sceneIndex: clampInteger(input.sceneIndex, 0, sceneCount - 1),
    actionIndex: clampInteger(input.actionIndex, 0, actionCount - 1),
    positionMs: Number.isFinite(input.positionMs) ? Math.max(0, Math.round(input.positionMs)) : 0,
  };
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

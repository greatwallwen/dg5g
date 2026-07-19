export const sceneVisualIds = [
  'indoor-boundary',
  'indoor-topology',
  'indoor-condition',
  'indoor-evidence',
  'outdoor-boundary',
  'antenna-posture',
  'outdoor-obstacle',
  'route',
] as const;

export type SceneVisualId = (typeof sceneVisualIds)[number];

export function sceneVisualIdFrom(value: string): SceneVisualId {
  switch (value) {
    case 'indoor-boundary':
    case 'indoor-topology':
    case 'indoor-condition':
    case 'indoor-evidence':
    case 'outdoor-boundary':
    case 'antenna-posture':
    case 'outdoor-obstacle':
    case 'route':
      return value;
    case 'device-topology':
      return 'indoor-topology';
    case 'relationship-evidence':
    case 'evidence-archive':
      return 'indoor-evidence';
    case 'learning-case':
      return 'indoor-boundary';
    case 'coverage-route':
    case 'complaint-facts':
    case 'complaint-reproduction':
    case 'complaint-evidence':
    case 'complaint-closure':
      return 'route';
    default:
      throw new Error(`Unsupported scene visual: ${value}`);
  }
}

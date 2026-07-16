import type { AnimationDiagnostic, LessonAnimationArtifact, TeachingAction, TeachingActionType, TeachingScene } from './types';

export const TEACHING_ACTION_TYPES: readonly TeachingActionType[] = [
  'speech',
  'spotlight',
  'laser',
  'widget_highlight',
  'widget_setState',
  'widget_timelineCue',
  'widget_annotation',
  'widget_reveal',
  'play_video',
];

export function normalizeTeachingAction(action: TeachingAction): TeachingAction {
  return action;
}

export function validateTeachingScene(scene: TeachingScene, artifact?: LessonAnimationArtifact): AnimationDiagnostic[] {
  const diagnostics: AnimationDiagnostic[] = [];
  const elementIds = collectAnimationArtifactTargetIds(artifact);

  if (!scene.actions || scene.actions.length === 0) {
    diagnostics.push(animationDiagnostic('scene-empty', 'error', 'Missing playback actions', `${scene.id} has no actions.`, undefined, scene.id));
    return diagnostics;
  }

  for (const action of scene.actions) {
    const normalized = normalizeTeachingAction(action);
    const actionId = action.id || `${scene.id}-action`;

    if (!(TEACHING_ACTION_TYPES as readonly string[]).includes(normalized.type)) {
      diagnostics.push(animationDiagnostic(
        `action-type-${actionId}`,
        'error',
        'Unsupported action type',
        `${actionId} uses unsupported action type ${action.type}.`,
        action.elementId ?? action.target ?? action.widgetId,
        scene.id,
      ));
    }

    if (normalized.type === 'speech' && !(normalized.spokenText ?? normalized.text ?? normalized.content ?? '').trim()) {
      diagnostics.push(animationDiagnostic(`speech-empty-${actionId}`, 'error', 'Speech text is empty', `${actionId} is missing text.`, undefined, scene.id));
    }

    if (normalized.type.startsWith('widget_') && !normalized.widgetId) {
      diagnostics.push(animationDiagnostic(
        `widget-id-${actionId}`,
        'error',
        'Widget action is missing widgetId',
        `${actionId} must specify widgetId.`,
        normalized.target ?? normalized.elementId,
        scene.id,
      ));
    }

    if (normalized.type === 'play_video' && !(normalized.elementId ?? normalized.target)) {
      diagnostics.push(animationDiagnostic(
        `video-target-empty-${actionId}`,
        'error',
        'Video action is missing target',
        `${actionId} must specify elementId or target.`,
        undefined,
        scene.id,
      ));
    }

    const target = normalized.elementId ?? normalized.target;
    const widgetLevel = target && (target === normalized.widgetId || /-lesson-animation-\d+/.test(target));
    const requiresElement =
      normalized.type === 'spotlight' ||
      normalized.type === 'laser' ||
      normalized.type === 'play_video' ||
      normalized.type === 'widget_highlight' ||
      normalized.type === 'widget_annotation' ||
      normalized.type === 'widget_reveal';
    if (requiresElement && target && !widgetLevel && elementIds.size > 0 && !elementIds.has(target)) {
      diagnostics.push(animationDiagnostic(
        `action-target-${actionId}`,
        'error',
        'Action target does not exist',
        `${actionId} references missing element ${target}.`,
        target,
        scene.id,
      ));
    }
  }

  if (artifact?.minDurationMs && (artifact.durationMs ?? artifact.scene.timeline?.durationMs ?? artifact.timeline?.durationMs ?? 0) < artifact.minDurationMs) {
    diagnostics.push(animationDiagnostic(
      'duration-too-short',
      'error',
      'Animation duration is too short',
      `Expected at least ${artifact.minDurationMs}ms, got ${artifact.durationMs ?? artifact.scene.timeline?.durationMs ?? artifact.timeline?.durationMs ?? 0}ms.`,
      undefined,
      scene.id,
    ));
  }

  const cues = artifact?.timeline?.cues ?? artifact?.scene?.timeline?.cues ?? [];
  if (cues.length > 0) {
    const elementIds = collectAnimationArtifactTargetIds(artifact);
    const cueTimes = cues.map((cue) => cue.atMs).filter((value): value is number => typeof value === 'number').sort((a, b) => a - b);
    for (let index = 1; index < cueTimes.length; index++) {
      if (cueTimes[index]! - cueTimes[index - 1]! > 8000) {
        diagnostics.push(animationDiagnostic('timeline-static-gap', 'error', 'Timeline has a long static gap', 'A timeline cue gap is longer than 8 seconds.', undefined, scene.id));
        break;
      }
    }
    for (const cue of cues) {
      for (const target of cue.targets ?? []) {
        if (elementIds.size > 0 && !elementIds.has(target)) {
          diagnostics.push(animationDiagnostic(`cue-target-${cue.id}`, 'error', 'Cue target does not exist', `${cue.id} references missing element ${target}.`, target, scene.id));
        }
      }
    }
  }

  if (!diagnostics.some((item) => animationDiagnosticIsError(item))) {
    diagnostics.push(animationDiagnostic('scene-valid', 'info', 'Playback script is valid', `${scene.id} passed action validation.`, undefined, scene.id));
  }
  return diagnostics;
}

export function animationDiagnostic(
  code: string,
  level: AnimationDiagnostic['level'],
  title: string,
  message: string,
  targetId?: string,
  sceneId?: string,
): AnimationDiagnostic {
  return { id: code, code, level, title, detail: message, message, ...(targetId ? { targetId } : {}), ...(sceneId ? { sceneId } : {}) };
}

export function animationDiagnosticIsError(item: AnimationDiagnostic): boolean {
  return item.level === 'error';
}

export function animationDiagnosticIsWarning(item: AnimationDiagnostic): boolean {
  return item.level === 'warning';
}

export function animationDiagnosticIsPass(item: AnimationDiagnostic): boolean {
  return item.level === 'info';
}

export function stripSlideHtmlText(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function estimateSlideTextUnits(value: string): number {
  const text = stripSlideHtmlText(value);
  let units = 0;
  for (const char of text) {
    if (/\s/.test(char)) units += 0.4;
    else if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(char)) units += 1;
    else if (/[A-Z0-9]/.test(char)) units += 0.72;
    else units += 0.56;
  }
  return units;
}

export function collectAnimationArtifactTargetIds(artifact?: LessonAnimationArtifact): Set<string> {
  const ids = new Set<string>();
  if (!artifact?.scene?.content?.canvas?.elements) return ids;
  for (const element of artifact.scene.content.canvas.elements) ids.add(element.id);
  return ids;
}

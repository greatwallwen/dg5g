import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { meta as pwmMeta } from './pwm-waveform/meta';
import { meta as eduGamePixiMeta } from './edugame-pixi/meta';
import { meta as videoLessonMeta } from './video-lesson/meta';
import { meta as lessonAnimationMeta } from './lesson-animation/meta';

export interface WidgetMeta {
  id: string;
  title: string;
  description: string;
  version: string;
  projects: readonly string[];
  threads: readonly string[];
  schema: Record<string, unknown>;
}

export interface WidgetEntry {
  meta: WidgetMeta;
  Component: LazyExoticComponent<ComponentType<Record<string, unknown>>>;
}

export const registry: Record<string, WidgetEntry> = {
  'pwm-waveform': {
    meta: pwmMeta as unknown as WidgetMeta,
    Component: lazy(() => import('./pwm-waveform').then(m => ({ default: m.PwmWaveform as unknown as ComponentType<Record<string, unknown>> })))
  },
  'edugame-pixi': {
    meta: eduGamePixiMeta as unknown as WidgetMeta,
    Component: lazy(() => import('./edugame-pixi').then(m => ({ default: m.EduGameInteractive as unknown as ComponentType<Record<string, unknown>> })))
  },
  'video-lesson': {
    meta: videoLessonMeta as unknown as WidgetMeta,
    Component: lazy(() => import('./video-lesson').then(m => ({ default: m.VideoLesson as unknown as ComponentType<Record<string, unknown>> })))
  },
  'lesson-animation': {
    meta: lessonAnimationMeta as unknown as WidgetMeta,
    Component: lazy(() => import('./lesson-animation').then(m => ({ default: m.LessonAnimation as unknown as ComponentType<Record<string, unknown>> })))
  }
};

export const list = (): WidgetMeta[] => Object.values(registry).map(e => e.meta);
export const get = (id: string): WidgetEntry | undefined => registry[id];

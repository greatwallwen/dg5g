// @dgbook/shared/types — 教材内容/widget/课程结构核心类型

export type ProjectId = `P${string}`;
export type ChapterId = `ch${number}`;
export type UnitId = `u${number}`;

export interface Chapter {
  id: ChapterId;
  no: number;
  title: string;
  icon: string;
  goal: string;
  units: UnitId[];
}

export interface Unit {
  id: UnitId;
  no: number;
  title: string;
  chapter: ChapterId;
  projects: ProjectId[];
  hours: number;
  deliverable: string;
}

export interface Thread {
  id: string;
  title: string;
  introducedIn: ProjectId;
  appliedIn: ProjectId[];
  summary: string;
}

export interface ProjectMeta {
  id: ProjectId;
  title: string;
  unit: UnitId;
  chapter: ChapterId;
  icon: string;
  threads: string[];
  estimatedPages: number;
  masterLines: number[];
}

export interface CourseOutline {
  title: string;
  subtitle?: string;
  audience: string;
  totalHours: number;
  weeks: number;
  prerequisites: string[];
  competencies: string[];
  chapters: Chapter[];
  units: Unit[];
  threads: Thread[];
  projects: ProjectMeta[];
}

// === Widget 实例(由 studio 配置发布,site 嵌入渲染) ===

export type WidgetStatus = 'draft' | 'in_review' | 'published' | 'archived';

export interface WidgetHistoryEntry {
  status: WidgetStatus;
  at: string;          // ISO timestamp
  by: string;
  comment?: string;
}

export interface WidgetInstance<P = Record<string, unknown>> {
  id: string;          // e.g. "P17-lesson-animation-001"
  widget: string;      // widget type id, e.g. "lesson-animation"
  version: string;     // semver
  props: P;
  project: ProjectId;
  anchor?: string;     // anchor in markdown (e.g. "task-3-buzzer")
  status: WidgetStatus;
  history: WidgetHistoryEntry[];
  preview?: string;    // optional preview image path
}

// === 评价量规 / 测验 ===

export interface RubricRow {
  item: string;
  pass: string;     // 合格
  good: string;     // 良好
  excellent: string;// 优秀
}

export interface QuizSingleChoice {
  type: 'single_choice';
  id: string;
  question: string;
  options: { key: string; text: string }[];
  answer: string;
  explanation?: string;
}

export type QuizItem = QuizSingleChoice;

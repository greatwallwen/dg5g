export type LessonAstBlockType =
  | 'heading'
  | 'paragraph'
  | 'list'
  | 'table'
  | 'figure'
  | 'code'
  | 'formula'
  | 'callout'
  | 'visual';

export type LessonAstAssetKind = 'image' | 'video' | 'audio' | 'table' | 'code' | 'formula' | 'document';

export interface LessonAst {
  version: 1;
  source: LessonAstSource;
  book: LessonAstBook;
  lessons: LessonAstLesson[];
}

export interface LessonAstSource {
  id: string;
  path?: string;
  title?: string;
  language?: string;
  checksum?: string;
}

export interface LessonAstBook {
  id: string;
  title: string;
  subtitle?: string;
  language?: string;
  metadata?: Record<string, string>;
}

export interface LessonAstLesson {
  id: string;
  title: string;
  order: number;
  summary?: string;
  unitId?: string;
  unitTitle?: string;
  sections: LessonAstSection[];
  assets?: LessonAstAsset[];
  metadata?: Record<string, string>;
}

export interface LessonAstSection {
  id: string;
  title: string;
  order: number;
  level?: number;
  objective?: string;
  blocks: LessonAstBlock[];
  metadata?: Record<string, string>;
}

export interface LessonAstBlockBase {
  id: string;
  type: LessonAstBlockType;
  order: number;
  text?: string;
  terms?: string[];
  visualHint?: string;
  metadata?: Record<string, string>;
}

export interface LessonAstHeadingBlock extends LessonAstBlockBase {
  type: 'heading';
  level: number;
  text: string;
}

export interface LessonAstParagraphBlock extends LessonAstBlockBase {
  type: 'paragraph' | 'callout';
  text: string;
}

export interface LessonAstListBlock extends LessonAstBlockBase {
  type: 'list';
  items: string[];
}

export interface LessonAstTableBlock extends LessonAstBlockBase {
  type: 'table';
  caption?: string;
  headers?: string[];
  rows: string[][];
}

export interface LessonAstFigureBlock extends LessonAstBlockBase {
  type: 'figure';
  assetId?: string;
  src?: string;
  alt?: string;
  caption?: string;
}

export interface LessonAstCodeBlock extends LessonAstBlockBase {
  type: 'code';
  language?: string;
  code: string;
}

export interface LessonAstFormulaBlock extends LessonAstBlockBase {
  type: 'formula';
  latex: string;
  caption?: string;
}

export interface LessonAstVisualBlock extends LessonAstBlockBase {
  type: 'visual';
  template?: string;
  title?: string;
  description?: string;
}

export type LessonAstBlock =
  | LessonAstHeadingBlock
  | LessonAstParagraphBlock
  | LessonAstListBlock
  | LessonAstTableBlock
  | LessonAstFigureBlock
  | LessonAstCodeBlock
  | LessonAstFormulaBlock
  | LessonAstVisualBlock;

export interface LessonAstAsset {
  id: string;
  kind: LessonAstAssetKind;
  src: string;
  title?: string;
  alt?: string;
  caption?: string;
  metadata?: Record<string, string>;
}

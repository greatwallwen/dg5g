import type { LessonAst, LessonAstBlock, LessonAstLesson, LessonAstSection } from './lesson-ast.ts';

export type KnowledgeAtomType = 'concept' | 'process' | 'metric' | 'tool' | 'decision' | 'case';

export interface KnowledgeAtom {
  id: string;
  sourceId: string;
  lessonId: string;
  sectionId: string;
  title: string;
  type: KnowledgeAtomType;
  terms: string[];
  evidenceRefs: string[];
  summary?: string;
  visualHint?: string;
  order: number;
}

export interface ExtractKnowledgeAtomsOptions {
  maxAtomsPerSection?: number;
  maxTermsPerAtom?: number;
  sourcePrefix?: string;
}

interface AtomCandidate {
  title: string;
  text: string;
  type: KnowledgeAtomType;
  terms: string[];
  evidenceRefs: string[];
  visualHint?: string;
}

const DEFAULT_MAX_ATOMS_PER_SECTION = 4;
const DEFAULT_MAX_TERMS_PER_ATOM = 8;

export function extractKnowledgeAtomsFromLessonAst(
  ast: LessonAst,
  options: ExtractKnowledgeAtomsOptions = {},
): KnowledgeAtom[] {
  const maxAtomsPerSection = Math.max(1, options.maxAtomsPerSection ?? DEFAULT_MAX_ATOMS_PER_SECTION);
  const maxTermsPerAtom = Math.max(1, options.maxTermsPerAtom ?? DEFAULT_MAX_TERMS_PER_ATOM);
  const atoms: KnowledgeAtom[] = [];

  for (const lesson of sortedByOrder(ast.lessons)) {
    for (const section of sortedByOrder(lesson.sections)) {
      const candidates = atomCandidatesForSection(section).slice(0, maxAtomsPerSection);
      for (const candidate of candidates) {
        const order = atoms.length + 1;
        atoms.push({
          id: stableAtomId(options.sourcePrefix ?? ast.book.id, lesson.id, section.id, order, candidate.title),
          sourceId: ast.source.id,
          lessonId: lesson.id,
          sectionId: section.id,
          title: candidate.title,
          type: candidate.type,
          terms: uniqueNonEmpty(candidate.terms).slice(0, maxTermsPerAtom),
          evidenceRefs: uniqueNonEmpty(candidate.evidenceRefs),
          summary: cleanText(candidate.text, 180),
          visualHint: candidate.visualHint,
          order,
        });
      }
    }
  }

  return atoms;
}

function atomCandidatesForSection(section: LessonAstSection): AtomCandidate[] {
  const blocks = sortedByOrder(section.blocks);
  const candidates: AtomCandidate[] = [];
  let currentHeading = section.title;
  let currentEvidence: string[] = [];

  for (const block of blocks) {
    if (block.type === 'heading') {
      currentHeading = block.text;
      currentEvidence = [block.id];
      continue;
    }

    const text = textForBlock(block);
    if (!text) continue;

    currentEvidence = currentEvidence.length > 0 ? currentEvidence : [block.id];
    candidates.push({
      title: titleForBlock(block, currentHeading, text),
      text,
      type: classifyAtom(block, text),
      terms: termsForBlock(block, text),
      evidenceRefs: [...currentEvidence, block.id],
      visualHint: visualHintForBlock(block),
    });
    currentEvidence = [];
  }

  if (candidates.length > 0) return candidates;

  return [{
    title: section.title,
    text: section.objective ?? section.title,
    type: 'concept',
    terms: termsFromText(section.title),
    evidenceRefs: [section.id],
  }];
}

function textForBlock(block: LessonAstBlock): string {
  if ('text' in block && block.text) return cleanText(block.text, 600);
  if (block.type === 'list') return cleanText(block.items.join('; '), 600);
  if (block.type === 'table') return cleanText([block.caption, ...(block.headers ?? []), ...block.rows.flat()].filter(Boolean).join(' '), 600);
  if (block.type === 'figure') return cleanText([block.caption, block.alt].filter(Boolean).join(' '), 600);
  if (block.type === 'code') return cleanText(block.code, 600);
  if (block.type === 'formula') return cleanText([block.caption, block.latex].filter(Boolean).join(' '), 600);
  if (block.type === 'visual') return cleanText([block.title, block.description, block.template].filter(Boolean).join(' '), 600);
  return '';
}

function titleForBlock(block: LessonAstBlock, heading: string, text: string): string {
  if (block.type === 'table' && block.caption) return cleanText(block.caption, 64);
  if (block.type === 'figure' && block.caption) return cleanText(block.caption, 64);
  if (block.type === 'visual' && block.title) return cleanText(block.title, 64);
  const firstSentence = text.split(/[。.!?！？；;]/u)[0];
  return cleanText(firstSentence || heading, 64);
}

function classifyAtom(block: LessonAstBlock, text: string): KnowledgeAtomType {
  const value = `${block.type} ${text}`.toLowerCase();
  if (block.type === 'table' || /kpi|指标|吞吐|时延|速率|比例|rate|latency|metric/.test(value)) return 'metric';
  if (block.type === 'code' || /工具|平台|算法|模型|tool|algorithm|model/.test(value)) return 'tool';
  if (/步骤|流程|过程|阶段|首先|然后|最后|process|procedure|step/.test(value)) return 'process';
  if (/选择|决策|判断|取舍|decision|choose|trade-off|tradeoff/.test(value)) return 'decision';
  if (/案例|场景|示例|case|example|scenario/.test(value)) return 'case';
  return 'concept';
}

function termsForBlock(block: LessonAstBlock, text: string): string[] {
  return uniqueNonEmpty([...(block.terms ?? []), ...termsFromText(text)]);
}

function visualHintForBlock(block: LessonAstBlock): string | undefined {
  if (block.visualHint) return block.visualHint;
  if (block.type === 'table') return 'kpi-dashboard';
  if (block.type === 'figure') return 'network-topology';
  if (block.type === 'list') return 'optimization-loop';
  if (block.type === 'formula') return 'metric-card';
  if (block.type === 'visual') return block.template;
  return undefined;
}

function termsFromText(text: string): string[] {
  const matches = text.match(/[A-Z][A-Z0-9-]{1,}|[a-zA-Z]+(?:-[a-zA-Z0-9]+)*|[\u4e00-\u9fff]{2,8}/gu) ?? [];
  return matches
    .map((term) => cleanText(term, 32))
    .filter((term) => term.length > 1 && !STOP_TERMS.has(term.toLowerCase()));
}

function stableAtomId(prefix: string, lessonId: string, sectionId: string, order: number, title: string): string {
  return [prefix, lessonId, sectionId, String(order).padStart(3, '0'), slug(title)].map(slug).join('-');
}

function sortedByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order);
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => cleanText(value, 80)).filter(Boolean))];
}

function cleanText(value: string, maxLength: number): string {
  const text = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 1)).trim();
}

function slug(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'item';
}

const STOP_TERMS = new Set([
  'and',
  'the',
  'for',
  'with',
  'from',
  'this',
  'that',
  'then',
  'into',
]);

import type { KnowledgeAtom, KnowledgeAtomType } from './knowledge-atoms.ts';

export type StoryboardBeatIntent = 'introduce' | 'explain' | 'demonstrate' | 'compare' | 'decide' | 'recap';

export interface StoryboardBeat {
  id: string;
  atomId: string;
  sourceId: string;
  title: string;
  intent: StoryboardBeatIntent;
  narration: string;
  visual: VisualScriptInput;
  evidenceRefs: string[];
  order: number;
  durationMs: number;
}

export interface VisualScriptInput {
  id: string;
  title: string;
  template: VisualTemplateId;
  focusTerms: string[];
  prompt: string;
  evidenceRefs: string[];
}

export interface VisualScriptOutput {
  id: string;
  title: string;
  template: VisualTemplateId;
  beats: StoryboardBeat[];
  minDurationMs: number;
  capabilities: VisualCapabilityHint[];
}

export type VisualScript = VisualScriptInput | VisualScriptOutput;

export type VisualTemplateId =
  | 'concept-map'
  | 'signaling-ladder'
  | 'network-topology'
  | 'kpi-dashboard'
  | 'parameter-decision-tree'
  | 'optimization-loop'
  | 'case-walkthrough'
  | 'manim-segment'
  | 'edugame-practice';

export type VisualCapabilityHint =
  | 'text-fit'
  | 'chart'
  | 'table'
  | 'flow'
  | 'packet-motion'
  | 'highlight'
  | 'caption-sync'
  | 'count-up'
  | 'manim-media'
  | 'edugame-interactive';

export interface CompileStoryboardBeatsOptions {
  beatDurationMs?: number;
  maxTermsPerBeat?: number;
  visualTemplateOverrides?: Partial<Record<KnowledgeAtomType, VisualTemplateId>>;
}

const DEFAULT_BEAT_DURATION_MS = 7200;
const DEFAULT_MAX_TERMS_PER_BEAT = 5;

export function compileStoryboardBeatsFromKnowledgeAtoms(
  atoms: KnowledgeAtom[],
  options: CompileStoryboardBeatsOptions = {},
): StoryboardBeat[] {
  const beatDurationMs = Math.max(1000, options.beatDurationMs ?? DEFAULT_BEAT_DURATION_MS);
  const maxTermsPerBeat = Math.max(1, options.maxTermsPerBeat ?? DEFAULT_MAX_TERMS_PER_BEAT);

  return [...atoms]
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((atom, index) => {
      const template = options.visualTemplateOverrides?.[atom.type] ?? templateForAtom(atom);
      const focusTerms = atom.terms.slice(0, maxTermsPerBeat);
      const order = index + 1;
      return {
        id: `${atom.id}-beat-${String(order).padStart(3, '0')}`,
        atomId: atom.id,
        sourceId: atom.sourceId,
        title: atom.title,
        intent: intentForAtom(atom.type),
        narration: narrationForAtom(atom, focusTerms),
        visual: {
          id: `${atom.id}-visual`,
          title: atom.title,
          template,
          focusTerms,
          prompt: visualPromptForAtom(atom, template, focusTerms),
          evidenceRefs: [...atom.evidenceRefs],
        },
        evidenceRefs: [...atom.evidenceRefs],
        order,
        durationMs: beatDurationMs,
      };
    });
}

export function compileVisualScriptFromStoryboardBeats(
  id: string,
  title: string,
  beats: StoryboardBeat[],
): VisualScriptOutput {
  const orderedBeats = [...beats].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const template = dominantTemplate(orderedBeats);
  return {
    id,
    title,
    template,
    beats: orderedBeats,
    minDurationMs: orderedBeats.reduce((total, beat) => total + beat.durationMs, 0),
    capabilities: capabilitiesForTemplate(template),
  };
}

function templateForAtom(atom: KnowledgeAtom): VisualTemplateId {
  if (isTemplateId(atom.visualHint)) return atom.visualHint;
  if (atom.type === 'process') return 'optimization-loop';
  if (atom.type === 'metric') return 'kpi-dashboard';
  if (atom.type === 'tool') return 'network-topology';
  if (atom.type === 'decision') return 'parameter-decision-tree';
  if (atom.type === 'case') return 'case-walkthrough';
  return 'concept-map';
}

function intentForAtom(type: KnowledgeAtomType): StoryboardBeatIntent {
  if (type === 'process' || type === 'tool') return 'demonstrate';
  if (type === 'metric') return 'compare';
  if (type === 'decision') return 'decide';
  if (type === 'case') return 'recap';
  return 'explain';
}

function narrationForAtom(atom: KnowledgeAtom, focusTerms: string[]): string {
  const termText = focusTerms.length > 0 ? ` Key terms: ${focusTerms.join(', ')}.` : '';
  const summary = atom.summary ? ` ${atom.summary}` : '';
  return `${atom.title}.${summary}${termText}`.replace(/\s+/g, ' ').trim();
}

function visualPromptForAtom(atom: KnowledgeAtom, template: VisualTemplateId, focusTerms: string[]): string {
  const terms = focusTerms.length > 0 ? ` Use labels for ${focusTerms.join(', ')}.` : '';
  return `${template}: ${atom.title}.${terms}`.replace(/\s+/g, ' ').trim();
}

function dominantTemplate(beats: StoryboardBeat[]): VisualTemplateId {
  const counts = new Map<VisualTemplateId, number>();
  for (const beat of beats) counts.set(beat.visual.template, (counts.get(beat.visual.template) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'concept-map';
}

function capabilitiesForTemplate(template: VisualTemplateId): VisualCapabilityHint[] {
  if (template === 'kpi-dashboard') return ['chart', 'table', 'count-up', 'caption-sync'];
  if (template === 'signaling-ladder') return ['flow', 'packet-motion', 'highlight', 'caption-sync'];
  if (template === 'network-topology') return ['flow', 'packet-motion', 'highlight'];
  if (template === 'parameter-decision-tree') return ['flow', 'highlight', 'caption-sync'];
  if (template === 'optimization-loop') return ['flow', 'chart', 'count-up', 'caption-sync'];
  if (template === 'case-walkthrough') return ['text-fit', 'highlight', 'caption-sync'];
  if (template === 'manim-segment') return ['manim-media', 'caption-sync'];
  if (template === 'edugame-practice') return ['edugame-interactive', 'caption-sync'];
  return ['text-fit', 'highlight'];
}

function isTemplateId(value: string | undefined): value is VisualTemplateId {
  return Boolean(value && TEMPLATE_IDS.has(value as VisualTemplateId));
}

const TEMPLATE_IDS = new Set<VisualTemplateId>([
  'concept-map',
  'signaling-ladder',
  'network-topology',
  'kpi-dashboard',
  'parameter-decision-tree',
  'optimization-loop',
  'case-walkthrough',
  'manim-segment',
  'edugame-practice',
]);

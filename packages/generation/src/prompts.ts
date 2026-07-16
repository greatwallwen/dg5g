import type { PromptId, PromptMessagePair } from './types.ts';

type PromptVars = Record<string, string | number | boolean | undefined>;

const SYSTEM_PROMPTS: Record<PromptId, string> = {
  'requirements-to-outlines': `You are an instructional designer for DGBook, a one-way digital textbook.
Generate scene outlines for a 5G network optimization lesson.
Return only JSON. No markdown fences.
Keep the course one-way: no student dialogue, discussion, debate, or Q&A tutor scenes.
Use animation beats from 5G domain content, not textbook shell headings such as 任务导入, 任务要求, 知识准备, or 任务实施.`,

  'slide-content': `You are a professional slide animation designer.
Generate a structured 1000x562 slide canvas for a DGBook lesson-animation widget.
Return only JSON with keys "background" and "elements".
Slides are visual aids, not scripts. Keep visual text concise and put explanation in later speech actions.
Do not use section-shell labels such as 任务导入, 任务要求, 知识准备, or 任务实施 as visible animation steps; use concrete 5G concepts, metrics, evidence, and operations instead.`,

  'slide-actions': `You are a professional instructional designer.
Generate teaching actions for a DGBook one-way animation slide.
Return only a JSON array. Each item is either:
{"type":"action","name":"spotlight|laser|play_video","params":{"elementId":"..."}}
or {"type":"text","content":"spoken narration"}.
Use an OpenMAIC-style teaching order: point first, then speak. A spotlight or laser action must immediately precede the speech that explains the target.
Speech length is counted separately from actions, so use enough visual actions to keep the lesson guided without adding visible text.
Keep spotlight/laser targets concrete and stable; never point at a whole widget when an element ID is available.
Do not repeat the same focus target for adjacent narration unless the second sentence adds a new technical reason.
Do not generate discussion, student dialogue, whiteboard actions, or Q&A actions.
Narration beats must explain domain evidence such as DT/CQT, RSRP, SINR, handover, routes, collection, retest, and signaling. Never narrate generic section-shell headings as animation beats.`,
};

const USER_PROMPTS: Record<PromptId, string> = {
  'requirements-to-outlines': `Project: {{projectId}} {{title}}
Chapter: {{chapterTitle}}
Unit: {{unitTitle}}
Topic: {{topic}}

Textbook excerpt:
{{sourceText}}

Extract keyPoints from concrete 5G knowledge in the excerpt: DT/CQT, RSRP, SINR, handover, routes, data collection, retest, signaling, neighbor cells, interference, access, or KPI evidence.
Do not use scaffold section labels such as 任务导入, 任务要求, 知识准备, 任务实施, 操作步骤, or 成果提交 as outline titles or keyPoints.

Return this exact JSON shape:
{
  "languageDirective": "Teach in Simplified Chinese for a 5G network optimization textbook.",
  "outlines": [
    {
      "id": "{{projectId}}-outline-01",
      "type": "slide",
      "title": "string",
      "description": "string",
      "keyPoints": ["string", "string", "string"],
      "teachingObjective": "string",
      "estimatedDuration": 60,
      "order": 1
    }
  ]
}

Create 3-5 outlines. At least one outline must be an animation-focused slide suitable for a pure lesson-animation widget.`,

  'slide-content': `Project: {{projectId}} {{title}}
Selected outline: {{outlineTitle}}
Description: {{outlineDescription}}
Key points:
{{keyPoints}}

Build the slide around these knowledge points. Do not turn chapter scaffolding labels into nodes or timeline beats.

Generate 30-60 structured slide elements. Supported element types: text, shape, line, chart, table, image, video, audio, latex, code.
Canvas must be 1000x562. Keep all elements inside bounds.
Text elements must be short, with maxLines and minFontSize when useful.
Use IDs prefixed by {{projectId}}.

Return:
{
  "background": {"type":"solid","color":"#f8fafc"},
  "elements": []
}`,

  'slide-actions': `Project: {{projectId}} {{title}}
Outline: {{outlineTitle}}
Key points:
{{keyPoints}}

Available elements:
{{elements}}

Use only the listed domain key points as narration beats. Avoid generic scaffold labels like 任务导入, 任务要求, 知识准备, or 任务实施.

Return 8-18 interleaved action/text objects. Only use element IDs from the list. Use speech text in Chinese.
Pattern requirement: action(spotlight/laser on element A) -> text(explain A) -> action(spotlight/laser on element B) -> text(explain B).`,
};

export function buildPrompt(id: PromptId, vars: PromptVars): PromptMessagePair {
  return {
    system: render(SYSTEM_PROMPTS[id], vars),
    user: render(USER_PROMPTS[id], vars),
  };
}

function render(template: string, vars: PromptVars): string {
  return template.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_match, key: string) => String(vars[key] ?? ''));
}

export function formatElementsForPrompt(elements: Array<{ id: string; type: string; content?: string; chartType?: string }>): string {
  return elements.map((element) => {
    const summary = element.type === 'text'
      ? String(element.content ?? '').replace(/<[^>]*>/g, '').slice(0, 50)
      : element.chartType ?? element.type;
    return `- id: "${element.id}", type: "${element.type}", summary: "${summary}"`;
  }).join('\n');
}

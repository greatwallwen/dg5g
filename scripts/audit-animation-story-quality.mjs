#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { textbookOutput } from './textbook-paths.mjs';

const root = process.cwd();
const widgetDir = textbookOutput('widgets');
const failures = [];
const rows = [];
const manimHashes = new Map();
const FORBIDDEN_VISIBLE_COPY = /可视化演示|配套约束|实验输出|技术实现|Manim\s*知识动画|知识链|知识点闭环|流程展示|步骤展示|任务流程|操作流程|照片、编号、坐标|照片编号坐标/;
const CONCEPTUAL_TERMS = /对象|口径|证据|判据|边界|指标|原因|根因|风险|复测|闭环|定位|覆盖|切换|信令|参数|KPI|告警|小区|网元|承载|注册|接入|会话|基线|趋势|责任|投诉|复现|归因|工单|业务|终端|无线|平台|场景|站址|机房|机柜|设备|端口|传输|接地|温控|天线|方位角|下倾角|DT|CQT|GPS|LOG|RSRP|SINR|PCI|TOPN|PM|CM|AAU|BBU|RRU|AMF|SMF|UPF|RRC|NAS|PDU|Cause/;

for (const file of readdirSync(widgetDir).filter((name) => name.endsWith('-lesson-animation-001.json'))) {
  auditWidget(path.join(widgetDir, file));
}

for (const [hash, projects] of manimHashes) {
  const unique = [...new Set(projects)];
  if (unique.length > 1) fail(unique.join(','), 'repeated-manim-spec', `Manim spec ${hash} reused by ${unique.join(', ')}`);
}

if (failures.length) {
  console.log(JSON.stringify({
    tool: 'audit-animation-story-quality',
    totals: { widgets: rows.length, failures: failures.length },
    rows,
    failures,
  }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    tool: 'audit-animation-story-quality',
    totals: { widgets: rows.length, failures: 0 },
    rows,
    failures,
  }, null, 2));
}

function auditWidget(file) {
  const data = JSON.parse(readFileSync(file, 'utf-8'));
  const project = data.project ?? path.basename(file).slice(0, 3);
  const artifact = data.props?.artifact ?? {};
  const elements = artifact.scene?.content?.canvas?.elements ?? [];
  const pages = artifact.pages ?? [];
  const cues = uniqueCues([...(artifact.timeline?.cues ?? []), ...(artifact.scene?.timeline?.cues ?? [])]);
  const actions = artifact.scene?.actions ?? [];
  const allActions = [...(artifact.actions ?? []), ...actions];
  const row = {
    project,
    pages: pages.length,
    cues: cues.length,
    actions: allActions.length,
    arrows: 0,
    repeatedGraphics: 0,
    longText: 0,
    focusEffects: 0,
    whiteboardCues: 0,
    knowledgeSpeech: 0,
    interleavedSpeech: 0,
    repeatedSpeech: 0,
    actionScript: 0,
  };

  if (pages.length < 4) fail(project, 'stage-page-count', `expected at least 4 stage pages, got ${pages.length}`);
  if (!cues.some((cue) => /transition|camera|pan|zoom/i.test(String(cue.effect ?? cue.content ?? '')))) {
    fail(project, 'missing-transition', 'stage pages need visible transition/camera cues');
  }
  if (actions.some((action) => action.type === 'speech') && !hasCaptionCue(cues, actions)) {
    fail(project, 'caption-sync', 'speech actions need captionUpdate cues/actions');
  }
  row.arrows = auditSemanticArrows(project, elements, cues, allActions);
  row.repeatedGraphics = auditRepeatedGraphics(project, elements);
  row.longText = auditLongCanvasText(project, elements, allActions);
  row.focusEffects = auditFocusEffects(project, pages, cues, allActions);
  row.whiteboardCues = auditWhiteboardDrawing(project, pages, cues);
  row.knowledgeSpeech = auditKnowledgeSpeech(project, allActions);
  row.interleavedSpeech = auditActionInterleaving(project, allActions);
  row.repeatedSpeech = auditRepeatedSpeech(project, allActions);
  row.actionScript = auditOpenMaicStyleActionScript(project, allActions);
  auditCueDensity(project, artifact, cues);
  auditForbiddenVisibleCopy(project, { pages, elements, cues, allActions });
  auditPhaseDensity(project, elements);
  recordManimSpec(project, artifact);
  rows.push(row);
}

function auditActionInterleaving(project, actions) {
  const speechActions = actions.filter((action) => action.type === 'speech');
  if (!speechActions.length) return 0;
  let interleaved = 0;
  let consecutiveSpeech = 0;
  actions.forEach((action, index) => {
    if (action.type === 'speech' && actions[index - 1]?.type === 'speech') consecutiveSpeech += 1;
  });
  if (consecutiveSpeech > 0) fail(project, 'consecutive-speech-actions', `${consecutiveSpeech} speech actions appear without visual action between them`);

  for (const speech of speechActions) {
    const index = actions.indexOf(speech);
    const target = speech.target ?? speech.elementId;
    const previous = actions.slice(Math.max(0, index - 4), index);
    const currentTimeMs = Number(speech.currentTimeMs);
    const hasPreviousFocus = previous.some((action) => {
      if (!['spotlight', 'laser'].includes(action.type)) return false;
      const actionTarget = action.target ?? action.elementId;
      return !target || !actionTarget || actionTarget === target;
    });
    const hasTimedFocus = Number.isFinite(currentTimeMs) && actions.some((action) => {
      if (!['spotlight', 'laser'].includes(action.type)) return false;
      const actionTarget = action.target ?? action.elementId;
      if (target && actionTarget && actionTarget !== target) return false;
      const actionTime = Number(action.currentTimeMs);
      return Number.isFinite(actionTime) && actionTime <= currentTimeMs && currentTimeMs - actionTime <= 2600;
    });
    if (hasPreviousFocus || hasTimedFocus) {
      interleaved += 1;
      continue;
    }
    fail(project, 'speech-without-prior-focus', `${speech.id ?? speech.title ?? '(speech)'} should be preceded by spotlight/laser on the same teaching target`);
  }

  const required = Math.max(1, Math.ceil(speechActions.length * 0.9));
  if (interleaved < required) fail(project, 'action-interleaving-ratio', `${interleaved}/${speechActions.length} speech actions have prior visual focus; expected ${required}`);
  return interleaved;
}

function auditKnowledgeSpeech(project, actions) {
  const speechActions = actions.filter((action) => action.type === 'speech' || action.spokenText || action.caption);
  if (speechActions.length < 4) fail(project, 'knowledge-speech-too-thin', `expected at least 4 speech/caption actions, got ${speechActions.length}`);
  let conceptual = 0;
  for (const action of speechActions) {
    const text = textOf(action.spokenText ?? action.text ?? action.caption ?? action.displayText ?? '');
    if (CONCEPTUAL_TERMS.test(text)) conceptual += 1;
  }
  const minimum = Math.max(3, Math.ceil(speechActions.length * 0.55));
  if (conceptual < minimum) fail(project, 'flow-without-knowledge', `speech/caption actions look process-only: ${conceptual}/${speechActions.length} contain knowledge terms`);
  return conceptual;
}

function auditRepeatedSpeech(project, actions) {
  const speechActions = actions.filter((action) => action.type === 'speech');
  const exact = new Map();
  const stems = new Map();
  for (const action of speechActions) {
    const text = normalizeSpeechText(action.spokenText ?? action.text ?? action.caption ?? '');
    if (text.length < 18) continue;
    exact.set(text, [...(exact.get(text) ?? []), action.id ?? action.title ?? '(speech)']);
    stems.set(text.slice(0, 28), [...(stems.get(text.slice(0, 28)) ?? []), action.id ?? action.title ?? '(speech)']);
  }
  let repeated = 0;
  for (const [text, ids] of exact) {
    if (ids.length <= 1) continue;
    repeated += ids.length;
    fail(project, 'repeated-speech', `same narration repeats ${ids.length} times: ${text.slice(0, 48)} (${ids.slice(0, 4).join(', ')})`);
  }
  for (const [stem, ids] of stems) {
    if (ids.length <= 3) continue;
    repeated += ids.length;
    fail(project, 'repeated-speech-stem', `narration stem repeats ${ids.length} times: ${stem} (${ids.slice(0, 4).join(', ')})`);
  }
  return repeated;
}

function auditOpenMaicStyleActionScript(project, actions) {
  const speechActions = actions.filter((action) => action.type === 'speech');
  let score = 0;
  for (const action of speechActions) {
    const target = action.target ?? action.elementId;
    const text = textOf(action.spokenText ?? action.text ?? '');
    const caption = textOf(action.caption ?? action.displayText ?? '');
    const dimOpacity = Number(action.dimOpacity);
    if (target && action.focusPolicy === 'none') {
      fail(project, 'speech-focus-disabled', `${action.id ?? action.title ?? '(speech)'} disables focus while speaking`);
    }
    if (Number.isFinite(dimOpacity) && dimOpacity > 0.02) {
      fail(project, 'spotlight-dim-too-heavy', `${action.id ?? action.title ?? '(speech)'} dimOpacity=${dimOpacity} makes the stage too dark`);
    }
    if (target && text.length > 0 && text.length < 32) {
      fail(project, 'thin-animation-speech', `${action.id ?? action.title ?? '(speech)'} has only ${text.length} spoken chars`);
    }
    if (caption.length > 0 && caption.length > 48) {
      fail(project, 'caption-too-long-for-dock', `${action.id ?? action.title ?? '(speech)'} caption has ${caption.length} chars`);
    }
    if (target && text.length >= 32 && action.focusPolicy !== 'none') score += 1;
  }
  for (const action of actions.filter((item) => item.type === 'spotlight' || item.type === 'laser')) {
    const dimOpacity = Number(action.dimOpacity);
    if (Number.isFinite(dimOpacity) && dimOpacity > 0.02) {
      fail(project, 'spotlight-dim-too-heavy', `${action.id ?? action.title ?? '(focus)'} dimOpacity=${dimOpacity} makes the stage too dark`);
    }
    if ((action.type === 'spotlight' || action.type === 'laser') && !(action.target ?? action.elementId)) {
      fail(project, 'focus-target-missing', `${action.id ?? action.title ?? '(focus)'} has no target`);
    }
  }
  return score;
}

function auditForbiddenVisibleCopy(project, payload) {
  for (const text of collectVisibleStrings(payload)) {
    if (FORBIDDEN_VISIBLE_COPY.test(textOf(text))) fail(project, 'visible-template-copy', `visible copy contains template wording: ${textOf(text).slice(0, 80)}`);
  }
}

function auditSemanticArrows(project, elements, cues, actions) {
  const cueTargets = new Set(cues.flatMap((cue) => cue.targets ?? []));
  const actionTargets = new Set(actions.flatMap((action) => [action.target, action.elementId]).filter(Boolean));
  const connectors = elements.filter((item) => item.type === 'line' && !String(item.id ?? '').includes('ladder-'));
  for (const line of connectors) {
    const semantic = line.semanticKind ?? line.edgeKind ?? line.data?.semanticKind;
    const hasSemantic = ['process', 'dependency', 'data-flow', 'cause', 'feedback'].includes(semantic);
    if (hasArrow(line) && !hasSemantic) {
      fail(project, 'arrow-semantic-kind', `${line.id} missing semantic edge kind`);
    }
    if (hasArrow(line) && !cueTargets.has(line.id) && !actionTargets.has(line.id) && !hasSemantic) {
      fail(project, 'meaningless-arrow', `${line.id} arrow has no semantic kind, timeline cue, or action target`);
    }
  }
  return connectors.filter(hasArrow).length;
}

function auditRepeatedGraphics(project, elements) {
  const groups = new Map();
  for (const element of elements) {
    if (!['shape', 'icon', 'chart', 'table'].includes(String(element.type ?? ''))) continue;
    const signature = JSON.stringify({
      type: element.type,
      role: element.role ?? '',
      layer: element.layer ?? '',
      phase: element.phase ?? '',
      left: roundTo(Number(element.left ?? 0), 4),
      top: roundTo(Number(element.top ?? 0), 4),
      width: roundTo(Number(element.width ?? 0), 4),
      height: roundTo(Number(element.height ?? 0), 4),
      fill: element.fill ?? '',
      outline: element.outline?.color ?? element.outline ?? '',
      content: textOf(element.content ?? element.label ?? element.title ?? ''),
    });
    groups.set(signature, [...(groups.get(signature) ?? []), element.id ?? '(no id)']);
  }
  let repeated = 0;
  for (const ids of groups.values()) {
    if (ids.length <= 1) continue;
    repeated += ids.length;
    fail(project, 'repeated-graphic', `same graphic is duplicated at the same position: ${ids.slice(0, 6).join(', ')}`);
  }
  return repeated;
}

function auditLongCanvasText(project, elements, actions) {
  let count = 0;
  for (const element of elements.filter((item) => item.type === 'text')) {
    const text = textOf(element.content ?? element.text ?? '');
    if (!text) continue;
    const maxLines = Math.max(1, Number(element.maxLines ?? 1));
    const budget = Number(element.textBudget);
    const hardLimit = Number.isFinite(budget) ? Math.max(34, Math.ceil(budget * 1.65)) : 72;
    const densityLimit = maxLines === 1 ? 38 : hardLimit;
    if (text.length > densityLimit || text.length > 96) {
      count += 1;
      fail(project, 'long-canvas-text', `${element.id ?? '(no id)'} has ${text.length} chars in a compact text element`);
    }
  }
  for (const action of actions.filter((item) => item.type === 'speech' || item.caption || item.displayText)) {
    const caption = textOf(action.displayText ?? action.caption ?? '');
    if (caption.length > 64) {
      count += 1;
      fail(project, 'long-action-caption', `${action.id ?? '(no id)'} caption has ${caption.length} chars`);
    }
  }
  return count;
}

function auditFocusEffects(project, pages, cues, actions) {
  const focusCount = cues.filter((cue) => /spotlight|laser/i.test(String(cue.effect ?? cue.content ?? ''))).length
    + actions.filter((action) => /spotlight|laser/i.test(String(action.type ?? action.effect ?? action.content ?? ''))).length;
  const expected = Math.min(4, Math.max(2, pages.length - 1));
  if (focusCount < expected) {
    fail(project, 'spotlight-laser-missing', `expected at least ${expected} spotlight/laser cues or actions, got ${focusCount}`);
  }
  return focusCount;
}

function auditPhaseDensity(project, elements) {
  for (let phase = 1; phase <= 6; phase += 1) {
    const visible = elements.filter((item) => isVisibleAtPhase(item, phase));
    const lines = visible.filter((item) => item.type === 'line');
    const arrows = lines.filter(hasArrow);
    const textChars = visible
      .filter((item) => item.type === 'text')
      .reduce((sum, item) => sum + textOf(item.content).length, 0);
    if (visible.length > 35) fail(project, 'phase-element-density', `phase ${phase} has ${visible.length} visible elements`);
    if (arrows.length > 5) fail(project, 'phase-arrow-density', `phase ${phase} has ${arrows.length} arrows`);
    if (textChars > 120) fail(project, 'phase-text-density', `phase ${phase} has ${textChars} visible text chars`);
  }
}

function recordManimSpec(project, artifact) {
  const spec = artifact.manimSpec ?? artifact.media?.manimSpec ?? artifact.template;
  if (!spec) return;
  const hash = createHash('sha1').update(JSON.stringify(spec)).digest('hex').slice(0, 10);
  manimHashes.set(hash, [...(manimHashes.get(hash) ?? []), project]);
}

function auditWhiteboardDrawing(project, pages, cues) {
  const drawCues = cues.filter((cue) => ['whiteboardText', 'whiteboardLine', 'whiteboardShape', 'whiteboardChart', 'whiteboardTable', 'whiteboardCode', 'whiteboardFormula'].includes(String(cue.effect ?? cue.content ?? '')));
  const clearCues = cues.filter((cue) => String(cue.effect ?? cue.content ?? '') === 'whiteboardClear');
  const expected = Math.max(2, Math.min(6, pages.length));
  if (drawCues.length < expected) {
    fail(project, 'whiteboard-drawing-missing', `expected at least ${expected} whiteboard drawing cues, got ${drawCues.length}`);
  }
  if (pages.length > 1 && clearCues.length < pages.length - 1) {
    fail(project, 'whiteboard-clear-missing', `expected whiteboard clear cues between stage pages, got ${clearCues.length}`);
  }
  return drawCues.length;
}

function auditCueDensity(project, artifact, cues) {
  const durationMs = Number(artifact.durationMs ?? artifact.timeline?.durationMs ?? artifact.scene?.timeline?.durationMs ?? 0);
  if (!durationMs) return;
  const perMinute = cues.length / (durationMs / 60000);
  const maxPerMinute = project === 'P17' ? 22 : 18;
  if (perMinute > maxPerMinute) {
    fail(project, 'cue-density-overload', `${cues.length} cues across ${Math.round(durationMs / 1000)}s equals ${perMinute.toFixed(1)}/min; reduce effect rotation and keep cues tied to knowledge beats`);
  }
  const byBeat = new Map();
  for (const cue of cues) {
    const beat = String(cue.beatId ?? cue.payload?.phase ?? 'global');
    byBeat.set(beat, (byBeat.get(beat) ?? 0) + 1);
  }
  const overloaded = [...byBeat.entries()].filter(([, count]) => count > 32);
  for (const [beat, count] of overloaded) {
    fail(project, 'beat-cue-overload', `${beat} has ${count} cues; split or remove decorative effects`);
  }
}

function hasCaptionCue(cues, actions) {
  return cues.some((cue) => cue.effect === 'captionUpdate')
    || actions.some((action) => action.type === 'captionUpdate' || action.effect === 'captionUpdate');
}

function isVisibleAtPhase(element, phase) {
  const itemPhase = Number(element.phase);
  if (!Number.isFinite(itemPhase) || itemPhase <= 0) return true;
  return itemPhase === phase;
}

function hasArrow(element) {
  return /arrow|triangle|marker/i.test(`${element.markerEnd ?? ''} ${element.endMarker ?? ''} ${(element.points ?? []).join?.(' ') ?? ''}`);
}

function collectVisibleStrings(value, key = '') {
  const visibleKeys = new Set(['title', 'label', 'text', 'caption', 'displayText', 'spokenText', 'summary', 'description', 'content']);
  if (value == null) return [];
  if (typeof value === 'string') return !key || visibleKeys.has(key) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((item) => collectVisibleStrings(item, key));
  if (typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([childKey, child]) => collectVisibleStrings(child, childKey));
}

function textOf(value) {
  return String(value ?? '').replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, '');
}

function normalizeSpeechText(value) {
  return textOf(value).replace(/\s+/g, '').replace(/[，。；：、,.!！?？]/g, '');
}

function fail(project, code, message) {
  failures.push({ project, code, message });
}

function uniqueCues(cues) {
  const seen = new Set();
  return cues.filter((cue) => {
    if (!cue?.id || seen.has(cue.id)) return false;
    seen.add(cue.id);
    return true;
  });
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

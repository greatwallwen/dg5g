#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { textbookOutput } from './textbook-paths.mjs';

const root = process.cwd();
const requestedProjects = valuesAfter('--project');
const allProjects = Array.from({ length: 18 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`);
const projects = process.argv.includes('--all')
  ? allProjects
  : requestedProjects.length ? requestedProjects : ['P01', 'P08', 'P14', 'P17'];
const focusedProjects = new Set(['P02', 'P10', 'P11', 'P14', 'P16', 'P18']);
const focusedTemplates = new Map([
  ['P02', { template: 'outdoor-site-survey', terms: ['地形', '站向', '邻区', '路迹', '照片', '归档'] }],
  ['P10', { template: 'parameter-governance-loop', terms: ['触发', '对象', '取值', '影响', '窗口', '留痕'] }],
  ['P11', { template: 'optimization-implementation', terms: ['定位', '动作', '排程', '执行', '观察', '复测'] }],
  ['P14', { template: 'kpi-source-pipeline', terms: ['口径', 'PM', 'DT', '告警', '清洗', '基线'] }],
  ['P16', { template: 'validation-delta', terms: ['前值', '目标', '差值', '异常', '结论', '固化'] }],
  ['P18', { template: 'signaling-fault-ladder', terms: ['RRC', 'NAS', 'PDU', 'Cause', '边界', '复测'] }],
]);
const thresholds = {
  default: { minDurationMs: 610000, minElements: 45, minCues: 95, maxCuesPerMinute: 18, maxCueGapMs: 8000, minEffects: 8, minSpeech: 7 },
  P17: { minDurationMs: 610000, minElements: 85, minCues: 130, maxCuesPerMinute: 22, maxCueGapMs: 8000, minEffects: 10, minSpeech: 18 },
};

const failures = [];
for (const project of projects) await validateProject(project);
report();

async function validateProject(project) {
  const file = path.join(textbookOutput('widgets'), `${project}-lesson-animation-001.json`);
  if (!existsSync(file)) {
    fail(project, 'widget-missing', `Missing widget artifact: ${path.relative(root, file)}`);
    return;
  }
  const widget = JSON.parse(await readFile(file, 'utf-8'));
  const artifact = widget.props?.artifact;
  const scene = artifact?.scene;
  const elements = scene?.content?.canvas?.elements ?? [];
  const actions = scene?.actions ?? [];
  const pages = artifact?.pages ?? [];
  const cues = uniqueCues([...(artifact?.timeline?.cues ?? []), ...(scene?.timeline?.cues ?? [])]);
  const durationMs = Number(artifact?.durationMs ?? artifact?.timeline?.durationMs ?? scene?.timeline?.durationMs ?? 0);
  const limit = thresholds[project] ?? thresholds.default;
  const effectTypes = new Set(cues.map((cue) => cue.effect).filter(Boolean));
  const speech = actions.filter((action) => action.type === 'speech');
  const elementIds = new Set(elements.map((element) => element.id));
  const elementById = new Map(elements.map((element) => [element.id, element]));

  min(project, 'duration', durationMs, limit.minDurationMs, 'ms');
  min(project, 'elements', elements.length, limit.minElements);
  min(project, 'timeline-cues', cues.length, limit.minCues);
  min(project, 'effect-types', effectTypes.size, limit.minEffects);
  min(project, 'speech-actions', speech.length, limit.minSpeech);
  min(project, 'stage-pages', pages.length, 6);
  maxCueDensity(project, cues.length, durationMs, limit.maxCuesPerMinute);
  if (focusedProjects.has(project)) validateFocusedKnowledge(project, artifact, elements, actions, cues);

  const pagePhases = new Set(pages.map((page) => Number(page.phase)).filter(Number.isFinite));
  for (let phase = 1; phase <= 6; phase += 1) {
    if (!pagePhases.has(phase)) fail(project, 'stage-page-phase-missing', `Missing page phase ${phase}.`);
  }

  const cueTimes = cues.map((cue) => Number(cue.atMs)).filter(Number.isFinite).sort((a, b) => a - b);
  for (let index = 1; index < cueTimes.length; index++) {
    if (cueTimes[index] - cueTimes[index - 1] > limit.maxCueGapMs) {
      fail(project, 'cue-gap', `Cue gap is ${cueTimes[index] - cueTimes[index - 1]}ms; max allowed is ${limit.maxCueGapMs}ms.`);
      break;
    }
  }

  for (const cue of cues) {
    const cueEnd = Number(cue.atMs ?? 0) + Number(cue.durationMs ?? 0) + Number(cue.holdMs ?? 0);
    if (durationMs > 0 && cueEnd > durationMs) {
      fail(project, 'cue-out-of-duration', `${cue.id} ends at ${cueEnd}ms beyond duration ${durationMs}ms.`);
    }
    if (cue.effect === 'exit') fail(project, 'cue-exit-disabled', `${cue.id} uses exit; generated teaching stages must use page transitions instead.`);
    if (cue.effect === 'whiteboardText' && plainText(cue.payload?.text ?? cue.payload?.content ?? '').length > 16) {
      fail(project, 'cue-whiteboard-text-too-long', `${cue.id} whiteboardText must stay a short teaching label.`);
    }
    for (const target of cue.targets ?? []) {
      if (!elementIds.has(target)) fail(project, 'cue-target-missing', `${cue.id} references missing element ${target}.`);
      const element = elementById.get(target);
      if ((cue.effect === 'captionUpdate' || cue.effect === 'typeText') && element?.role !== 'caption' && element?.timelineWritable !== true) {
        fail(project, 'cue-text-target', `${cue.id} ${cue.effect} must target a caption/timelineWritable text element, got ${target}.`);
      }
      if (['draw', 'flow', 'packetMove', 'pathFlow', 'whiteboardLine'].includes(cue.effect) && element?.type !== 'line') {
        fail(project, 'cue-line-target', `${cue.id} ${cue.effect} must target a line element, got ${target}.`);
      }
    }
  }

  for (const action of actions) {
    const target = action.elementId ?? action.target;
    if (requiresTarget(action.type) && target && !elementIds.has(target)) {
      fail(project, 'action-target-missing', `${action.id} references missing element ${target}.`);
    }
    if (String(action.type ?? '').startsWith('widget_') && !action.widgetId) {
      fail(project, 'widget-id-missing', `${action.id} is missing widgetId.`);
    }
  }

  for (const action of speech) {
    if (!action.spokenText) fail(project, 'speech-spoken-text', `${action.id} is missing spokenText.`);
    if (!action.caption) fail(project, 'speech-caption', `${action.id} is missing caption.`);
    for (const field of ['audioId', 'audioUrl', 'speakerId', 'voiceProfileId', 'voicePrompt', 'promptText']) {
      if (field in action) {
        fail(project, 'widget-tts-config', `${action.id} contains ${field}; lesson-animation artifacts must keep TTS config in page playbackScenes.`);
      }
    }
  }

  console.log(`${project}: ${durationMs}ms, ${elements.length} elements, ${cues.length} cues, ${effectTypes.size} effects, ${speech.length} speech`);
}

function validateFocusedKnowledge(project, artifact, elements, actions, cues) {
  const template = focusedTemplates.get(project);
  if (artifact?.template !== template.template) {
    fail(project, 'focused-template', `Expected template ${template.template}, got ${artifact?.template}.`);
  }
  const text = collectFocusedText(artifact, elements, actions, cues);
  const missingTerms = template.terms.filter((term) => !text.includes(term));
  if (missingTerms.length) fail(project, 'focused-knowledge-terms', `Missing focused terms: ${missingTerms.join(', ')}.`);
  const forbiddenTts = findForbiddenKeys(artifact, ['audioId', 'audioUrl', 'speakerId', 'voiceProfileId', 'voicePrompt', 'promptText']);
  if (forbiddenTts.length) fail(project, 'pure-animation-tts-config', `Artifact contains TTS keys: ${forbiddenTts.slice(0, 6).join(', ')}.`);
  const forbiddenPlayback = findForbiddenKeys(artifact, ['presenterId', 'avatarId', 'playbackScenes']);
  if (forbiddenPlayback.length) fail(project, 'pure-animation-playback-config', `Artifact contains playback/presenter keys: ${forbiddenPlayback.slice(0, 6).join(', ')}.`);
  const transitionCues = cues.filter((cue) => /transition|camera|pan|zoom/i.test(String(cue.effect ?? cue.content ?? '')));
  min(project, 'focused-transitions', transitionCues.length, 4);
  const spotlightCount = cues.filter((cue) => cue.effect === 'spotlight').length + actions.filter((action) => action.type === 'spotlight').length;
  min(project, 'focused-spotlight', spotlightCount, 6);
  validateArrowSemantics(project, elements, cues);
  validatePhaseDensity(project, elements);
}

function validateArrowSemantics(project, elements, cues) {
  const connectors = elements.filter(isConnectorLine);
  const arrows = connectors.filter(hasArrowHead);
  const cueTargets = new Set(cues.flatMap((cue) => cue.targets ?? []));
  for (const connector of connectors) {
    if (!String(connector.id ?? '').startsWith(`${project}-`)) fail(project, 'arrow-id-prefix', `${connector.id} lacks project prefix.`);
    if (!hasArrowHead(connector)) fail(project, 'arrow-marker', `${connector.id} is a connector without an arrow marker.`);
  }
  const animatedArrows = arrows.filter((line) => cueTargets.has(line.id));
  if (arrows.length > 0 && animatedArrows.length < Math.min(4, arrows.length)) {
    fail(project, 'arrow-timeline-semantics', `Only ${animatedArrows.length}/${arrows.length} arrow connectors are timeline targets.`);
  }
}

function validatePhaseDensity(project, elements) {
  for (let phase = 1; phase <= 6; phase += 1) {
    const visible = elements.filter((element) => isVisibleAtPhase(element, phase));
    const lines = visible.filter(isConnectorLine);
    const arrows = lines.filter(hasArrowHead);
    const textChars = visible
      .filter((element) => element.type === 'text')
      .reduce((total, element) => total + plainText(element.content).length, 0);
    if (visible.length > 42) fail(project, 'phase-density', `Phase ${phase} has ${visible.length} visible elements; max allowed is 42.`);
    if (lines.length > 5) fail(project, 'phase-line-density', `Phase ${phase} has ${lines.length} connector lines; max allowed is 5.`);
    if (arrows.length > 6) fail(project, 'phase-arrow-density', `Phase ${phase} has ${arrows.length} arrow connectors; max allowed is 6.`);
    if (textChars > 140) fail(project, 'phase-text-density', `Phase ${phase} has ${textChars} visible text chars; max allowed is 140.`);
  }
}

function min(project, code, actual, expected, unit = '') {
  if (actual < expected) fail(project, code, `Expected at least ${expected}${unit}, got ${actual}${unit}.`);
}

function maxCueDensity(project, cueCount, durationMs, maxPerMinute) {
  if (!durationMs || !maxPerMinute) return;
  const perMinute = cueCount / (durationMs / 60000);
  if (perMinute > maxPerMinute) {
    fail(project, 'cue-density-overload', `Cue density ${perMinute.toFixed(1)}/min exceeds ${maxPerMinute}/min; animation should explain beats, not rotate effects.`);
  }
}

function uniqueCues(cues) {
  const seen = new Set();
  return cues.filter((cue) => {
    if (!cue?.id || seen.has(cue.id)) return false;
    seen.add(cue.id);
    return true;
  });
}

function requiresTarget(type) {
  return ['spotlight', 'laser', 'play_video', 'widget_highlight', 'widget_annotation', 'widget_reveal'].includes(type);
}

function isConnectorLine(element) {
  if (element.type !== 'line') return false;
  const id = String(element.id ?? '');
  return !id.includes('ladder-') && !id.includes('lane-');
}

function hasArrowHead(element) {
  const points = Array.isArray(element.points) ? element.points.join(' ') : '';
  return /arrow|triangle|marker/i.test(`${points} ${element.markerEnd ?? ''} ${element.endMarker ?? ''}`);
}

function isVisibleAtPhase(element, phase) {
  const itemPhase = Number(element.phase);
  if (!Number.isFinite(itemPhase) || itemPhase <= 0) return true;
  return itemPhase === phase;
}

function plainText(value) {
  return String(value ?? '').replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, '');
}

function collectFocusedText(artifact, elements, actions, cues) {
  return [
    artifact?.template,
    artifact?.scene?.title,
    artifact?.scene?.description,
    ...((artifact?.pages ?? []).flatMap((page) => [page.id, page.title, page.phaseLabel])),
    ...elements.flatMap((item) => [item.id, item.title, item.alt, plainText(item.content), item.caption]),
    ...actions.flatMap((item) => [item.id, item.title, item.text, item.spokenText, item.caption, item.displayText]),
    ...cues.flatMap((item) => [item.id, item.effect, item.payload?.label, item.payload?.caption, item.payload?.text]),
  ].filter(Boolean).join('\n');
}

function findForbiddenKeys(value, forbidden, trail = []) {
  if (!value || typeof value !== 'object') return [];
  const hits = [];
  for (const [key, child] of Object.entries(value)) {
    const nextTrail = [...trail, key];
    if (forbidden.includes(key)) hits.push(nextTrail.join('.'));
    if (child && typeof child === 'object') hits.push(...findForbiddenKeys(child, forbidden, nextTrail));
  }
  return hits;
}

function fail(project, code, message) {
  record('error', project, code, message);
}

function record(level, project, code, message) {
  const line = `${level.toUpperCase()} ${project} ${code}: ${message}`;
  if (level === 'error') failures.push(line);
  console[level === 'error' ? 'error' : 'warn'](line);
}

function valuesAfter(flag) {
  const values = [];
  for (let index = 0; index < process.argv.length; index++) {
    if (process.argv[index] === flag && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function report() {
  if (failures.length > 0) {
    console.error(`Animation benchmark validation failed: ${failures.length} error(s).`);
    process.exitCode = 1;
  } else {
    console.log('Animation benchmark validation passed.');
  }
}

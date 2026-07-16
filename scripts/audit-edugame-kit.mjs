#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { textbookOutput } from './textbook-paths.mjs';

const root = process.cwd();
const failures = [];
const requiredGameTypes = [
  'quick-hit', 'memory-card', 'drag-match', 'sort-flow', 'card-battle', 'match-3',
  'boss-review', 'quiz-rush', 'pipe-connect', 'device-assemble', 'maze-troubleshoot',
  'tower-defense', '2048-merge', 'minesweeper-risk', 'rhythm-tap', 'timeline-build',
  'case-detective', 'knowledge-map', 'repair-sim', 'lab-procedure', 'classification-run',
  'resource-management', 'scenario-choice', 'checkpoint-adventure',
];
const readyTypes = new Set(requiredGameTypes);
const mechanicFamilies = new Set(['quick-hit', 'quiz-rush', 'memory-card', 'drag-match', 'sort-flow']);
const visibleCopyBannedTerms = [
  'token',
  'PixiJS',
  'OpenMAIC',
  'Manim 知识',
  '可视化演示',
  'Generated',
  'AI 动画',
  '教学舞台',
  '知识点闭环',
];

auditPackages();
auditTemplateRegistry();
auditReadyConsistency();
auditAssets();
auditWidgets();

if (failures.length) {
  for (const failure of failures) console.error(`ERROR ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`EduGameKit audit passed: ${requiredGameTypes.length} ready template(s), ${mechanicFamilies.size} routed implementation family(s).`);
}

function auditPackages() {
  for (const file of [
    'packages/edugame-core/package.json',
    'packages/edugame-core/src/runtime.ts',
    'packages/edugame-core/src/templates.ts',
    'packages/edugame-assets/asset-manifest.json',
    'packages/widgets/src/edugame-pixi/EduGameInteractiveV2.tsx',
    'packages/widgets/src/edugame-pixi/ReviewCard.tsx',
    'packages/widgets/src/edugame-pixi/PipeConnectArcade.tsx',
    'packages/widgets/src/edugame-pixi/MazeTroubleshootArcade.tsx',
    'packages/widgets/src/edugame-pixi/ClassificationRunArcade.tsx',
    'packages/widgets/src/edugame-pixi/Match3Arcade.tsx',
  ]) {
    if (!existsSync(path.join(root, file))) fail(`${file} missing`);
  }
}

function auditTemplateRegistry() {
  const source = read('packages/edugame-core/src/templates.ts');
  for (const gameType of requiredGameTypes) {
    if (!source.includes(`'${gameType}'`)) fail(`template registry missing ${gameType}`);
  }
  for (const gameType of readyTypes) {
    const pattern = new RegExp(`\\['${gameType}'[\\s\\S]*?\\]`);
    if (!pattern.test(source)) fail(`ready template tuple missing ${gameType}`);
  }
  for (const gameType of requiredGameTypes) {
    const pattern = new RegExp(`'${gameType}'\\s*:\\s*'([^']+)'`);
    const match = source.match(pattern);
    if (!match) fail(`template registry missing mechanic family for ${gameType}`);
    else if (!mechanicFamilies.has(match[1])) fail(`template ${gameType} maps to unknown mechanic family ${match[1]}`);
  }
}

// Derive the ready set from templates.ts so this audit can't silently drift
// from the registry's source of truth.
function readyTypesFromSource() {
  const source = read('packages/edugame-core/src/templates.ts');
  const match = source.match(/new Set<GameType>\(\[([^\]]*)\]\)/);
  if (!match) return null;
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

function auditReadyConsistency() {
  const fromSource = readyTypesFromSource();
  if (!fromSource) {
    fail('could not parse ready set from templates.ts');
    return;
  }
  const missing = [...readyTypes].filter((t) => !fromSource.has(t));
  const extra = [...fromSource].filter((t) => !readyTypes.has(t));
  if (missing.length || extra.length) {
    fail(`ready set drift: audit=[${[...readyTypes].join(',')}] vs templates.ts=[${[...fromSource].join(',')}]`);
  }
}

function auditAssets() {
  const manifest = readJson('packages/edugame-assets/asset-manifest.json');
  if (manifest.schema !== 'dgbook.edugame-assets/v1') fail('asset manifest schema mismatch');
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  if (assets.length < 3) fail('asset manifest needs at least 3 fallback assets');
  for (const asset of assets) {
    for (const key of ['asset_id', 'type', 'domain', 'object', 'format', 'license', 'tags', 'allowed_usage']) {
      if (!asset?.[key] || (Array.isArray(asset[key]) && asset[key].length === 0)) fail(`asset ${asset?.asset_id ?? '(unknown)'} missing ${key}`);
    }
  }
}

function auditWidgets() {
  const widgetDir = textbookOutput('widgets');
  if (!existsSync(widgetDir)) return;
  const files = readdirSync(widgetDir).filter((file) => file.endsWith('-edugame-interactive-001.json'));
  const courseGameTypes = new Set();
  if (files.length < 18) fail(`expected 18 edugame widgets, found ${files.length}`);
  for (const file of files) {
    const widget = JSON.parse(readFileSync(path.join(widgetDir, file), 'utf-8'));
    const config = widget.props?.gameConfig ?? {};
    if (config.game_type) courseGameTypes.add(config.game_type);
    if (widget.widget !== 'edugame-pixi') fail(`${file} widget must be edugame-pixi`);
    for (const key of ['game_id', 'game_type', 'lesson_id', 'title', 'duration', 'difficulty', 'asset_pack', 'knowledge_points', 'levels', 'score_rule', 'reward_rule']) {
      if (!(key in config)) fail(`${file} missing standard gameConfig.${key}`);
    }
    // A widget must map to a REGISTERED, READY game_type; otherwise the runtime
    // silently falls back to a placeholder page and the page ships with no game.
    if (config.game_type && !requiredGameTypes.includes(config.game_type)) {
      fail(`${file} game_type "${config.game_type}" is not a registered template`);
    } else if (config.game_type && !readyTypes.has(config.game_type)) {
      fail(`${file} game_type "${config.game_type}" is registered but not ready (would render placeholder)`);
    }
    auditPlayableConfig(file, config);
    auditVisibleCopy(file, config);
    if (/interactives\/[a-z-]+\//i.test(JSON.stringify(widget))) fail(`${file} still references external game exports`);
  }
  for (const gameType of ['pipe-connect', 'maze-troubleshoot', 'classification-run', 'match-3']) {
    if (!courseGameTypes.has(gameType)) fail(`course widgets must exercise ${gameType}`);
  }
}

function auditPlayableConfig(file, config) {
  const levels = Array.isArray(config.levels) ? config.levels : [];
  const firstLevel = levels[0] ?? {};
  const items = Array.isArray(firstLevel.items) ? firstLevel.items : [];
  const knowledgePoints = Array.isArray(config.knowledge_points) ? config.knowledge_points : [];
  const minItems = config.game_type === 'drag-match' ? 5 : 6;
  if (knowledgePoints.length < 3) fail(`${file} needs at least 3 knowledge points`);
  if (items.length < minItems) fail(`${file} ${config.game_type} needs at least ${minItems} items`);
  const itemIds = new Set();
  const kpIds = new Set(knowledgePoints.map((point) => point?.id).filter(Boolean));
  const targetIds = new Set(knowledgePoints.map((point) => point?.id).filter(Boolean));
  for (const item of items) {
    if (!item?.id || itemIds.has(item.id)) fail(`${file} item id missing or duplicated`);
    itemIds.add(item?.id);
    if (!hasText(item?.label)) fail(`${file} item ${item?.id ?? '(unknown)'} missing label`);
    if (!hasText(item?.target_id)) fail(`${file} item ${item?.id ?? '(unknown)'} missing target_id`);
    if (item?.target_id && !targetIds.has(item.target_id)) fail(`${file} item ${item.id} target_id ${item.target_id} not found in knowledge_points`);
    if (item?.kp && !kpIds.has(item.kp)) fail(`${file} item ${item.id} kp ${item.kp} not found in knowledge_points`);
  }
  if (config.game_type === 'drag-match') {
    const usedTargets = new Set(items.map((item) => item?.target_id).filter(Boolean));
    if (usedTargets.size < 3) fail(`${file} drag-match needs at least 3 active target gates`);
  }
  if (config.game_type === 'memory-card') {
    const labels = new Set(items.map((item) => String(item?.label ?? '').trim()));
    if (labels.size < 4) fail(`${file} memory-card needs diverse card labels`);
  }
  if (config.game_type === 'match-3') {
    const usedTargets = new Set(items.filter((item) => item?.correct !== false).map((item) => item?.target_id).filter(Boolean));
    if (usedTargets.size < 3) fail(`${file} match-3 needs at least 3 active categories`);
  }
}

function auditVisibleCopy(file, config) {
  const skippedKeys = new Set([
    'schema', 'template', 'templateId', 'id', 'game_id', 'widgetId', 'lesson_id',
    'legacyManifestId', 'asset_pack', 'game_type', 'gameType', 'kind', 'group',
  ]);
  const visit = (value, pathParts = []) => {
    if (typeof value === 'string') {
      for (const term of visibleCopyBannedTerms) {
        if (value.includes(term)) fail(`${file} visible copy contains banned term "${term}" at ${pathParts.join('.')}`);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, [...pathParts, String(index)]));
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, entry] of Object.entries(value)) {
      if (skippedKeys.has(key)) continue;
      visit(entry, [...pathParts, key]);
    }
  };
  visit(config);
}

function read(file) {
  return readFileSync(path.join(root, file), 'utf-8');
}

function readJson(file) {
  return JSON.parse(read(file));
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function fail(message) {
  failures.push(message);
}

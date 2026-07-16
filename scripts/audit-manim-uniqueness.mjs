#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  MANIM_KNOWLEDGE_PARAMETERS,
  MANIM_REQUIRED_TARGETS,
  MANIM_SCENE_TEMPLATE_ALIASES,
  MANIM_VISUAL_SIGNATURES,
  manimManifestCopyFor,
  manimSceneSpecFor,
} from './manim-scene-sources.mjs';
import { textbookOutput } from './textbook-paths.mjs';

const root = process.cwd();
const projectDir = textbookOutput('projects');
const generatedDir = path.join(root, 'tools', 'manim-scenes', 'generated');
const expectedProjectIds = Array.from({ length: 18 }, (_, index) => `P${String(index + 1).padStart(2, '0')}`);
const failures = [];
const warnings = [];
const TECHNICAL_COPY_TERMS = /\b(manim|template|scene|renderer|placeholder|python|webm|mp4|svg|ffmpeg|manifest)\b/i;
const MIN_VISUAL_PRIMITIVES = 4;
const MIN_KNOWLEDGE_EVIDENCE = 3;
const MIN_SCENE_GRAMMAR_DIVERSITY = 4;
const MIN_VISUAL_MODE_DIVERSITY = 8;
const MAX_SPEC_SIMILARITY = 0.92;
const MIN_PROFESSIONAL_PRIMITIVE_TERMS = 2;
const PROFESSIONAL_PRIMITIVE_TERMS = /floorplan|route|cabinet|evidence|road|grid|sector|building|obstruction|ray|voice|ticket|geo|log|closed|loop|drive|sample|ring|report|anomaly|cause|funnel|branch|verification|stamp|metric|axis|threshold|valley|lens|segment|hub|spoke|module|event|badge|workorder|rail|time|window|kpi|curve|topn|action|decision|risk|impact|radius|rollback|gate|trigger|cell|boundary|change|trace|ledger|pilot|site|wavefront|observation|retest|marker|bars|delta|validation|chart|sheet|binder|source|bucket|join|pipeline|normalized|rollout|monitor|review|baseline|target|acceptance|ue|gnb|core|message|reject|timer|gap/i;

const targets = readManimTargets();
const pageFiles = mapProjectPages();
const targetRows = auditTargets(targets);
const specRows = auditSceneSpecs(targets.entries);
const pageRows = expectedProjectIds.map((projectId) => auditProjectPage(projectId, targets.byProject.get(projectId)));
const generatedRows = auditGeneratedSources(targets.byProject);
const grammarRows = auditSceneGrammarAndVisualMode(targets.entries, specRows);

const report = {
  tool: 'audit-manim-uniqueness',
  totals: {
    expectedProjects: expectedProjectIds.length,
    targets: targets.entries.length,
    uniqueTemplates: new Set(targets.entries.map((target) => target.template)).size,
    uniqueSpecs: new Set(specRows.map((row) => row.specHash)).size,
    uniqueSpecShells: new Set(specRows.map((row) => row.specShellHash)).size,
    uniqueKnowledgeParameterHashes: new Set(specRows.map((row) => row.knowledgeParameterHash)).size,
    uniqueTitles: new Set(specRows.map((row) => normalizeCopy(row.title))).size,
    uniqueVisualSignatures: new Set(specRows.map((row) => row.visualSignature)).size,
    uniqueVisualMotifs: new Set(specRows.map((row) => row.visualMotif)).size,
    specSceneGrammarValues: grammarRows.filter((row) => row.source === 'spec' && row.sceneGrammar).length,
    specVisualModeValues: grammarRows.filter((row) => row.source === 'spec' && row.visualMode).length,
    manifestSceneGrammarValues: grammarRows.filter((row) => row.source === 'manifest' && row.sceneGrammar).length,
    manifestVisualModeValues: grammarRows.filter((row) => row.source === 'manifest' && row.visualMode).length,
    manifestKnowledgeParameterValues: grammarRows.filter((row) => row.source === 'manifest' && row.knowledgeParameterHash).length,
    uniqueSceneGrammars: new Set(grammarRows.map((row) => normalizeCopy(row.sceneGrammar)).filter(Boolean)).size,
    uniqueVisualModes: new Set(grammarRows.map((row) => normalizeCopy(row.visualMode)).filter(Boolean)).size,
    pageRows: pageRows.length,
    generatedSources: generatedRows.length,
    grammarRows: grammarRows.length,
    warnings: warnings.length,
    failures: failures.length,
  },
  targetRows,
  specRows,
  pageRows,
  generatedRows,
  grammarRows,
  warnings,
  failures,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;

function auditTargets(targetData) {
  const rows = targetData.entries.map((target) => ({ project: target.project, template: target.template }));
  if (targetData.entries.length !== expectedProjectIds.length) {
    fail('manim', 'target-count', `MANIM_REQUIRED_TARGETS has ${targetData.entries.length} targets, expected ${expectedProjectIds.length}`);
  }

  for (const projectId of expectedProjectIds) {
    const projectTargets = targetData.entries.filter((target) => target.project === projectId);
    if (projectTargets.length === 0) fail(projectId, 'target-missing', `${projectId} missing from MANIM_REQUIRED_TARGETS`);
    if (projectTargets.length > 1) fail(projectId, 'target-duplicate', `${projectId} appears ${projectTargets.length} times in MANIM_REQUIRED_TARGETS`);
  }

  const extraProjects = targetData.entries
    .map((target) => target.project)
    .filter((projectId) => !expectedProjectIds.includes(projectId));
  if (extraProjects.length) fail('manim', 'target-extra-project', `unexpected Manim projects: ${[...new Set(extraProjects)].join(', ')}`);

  for (const [template, projects] of groupBy(targetData.entries, (target) => target.template)) {
    if (projects.length <= 1) continue;
    fail('manim', 'template-not-unique', `Manim template "${template}" is reused by ${projects.map((target) => target.project).join(', ')}`);
  }

  const uniqueTemplates = new Set(targetData.entries.map((target) => target.template));
  if (uniqueTemplates.size !== expectedProjectIds.length) {
    fail('manim', 'unique-template-count', `Manim has ${uniqueTemplates.size} unique templates, expected ${expectedProjectIds.length}`);
  }

  const expectedVisualKeys = new Set(targetData.entries.map((target) => `${target.project}:${target.template}`));
  for (const target of targetData.entries) {
    const key = `${target.project}:${target.template}`;
    if (!MANIM_VISUAL_SIGNATURES[key]) {
      fail(target.project, 'visual-signature-missing', `${target.project} missing visual signature metadata for ${target.template}`);
    }
  }
  for (const key of Object.keys(MANIM_VISUAL_SIGNATURES)) {
    if (!expectedVisualKeys.has(key)) {
      fail('manim', 'visual-signature-extra', `visual signature metadata is not referenced by MANIM_REQUIRED_TARGETS: ${key}`);
    }
  }

  for (const [sceneTemplate, projects] of groupBy(targetData.entries, (target) => sceneTemplateForTarget(target))) {
    if (projects.length <= 1) continue;
    fail(
      'manim',
      'scene-spec-alias-not-unique',
      `Manim scene spec "${sceneTemplate}" is reused by ${projects.map((target) => target.project).join(', ')}`,
    );
  }

  const expectedKnowledgeKeys = new Set(targetData.entries.map((target) => `${target.project}:${target.template}`));
  for (const target of targetData.entries) {
    const key = `${target.project}:${target.template}`;
    if (!MANIM_KNOWLEDGE_PARAMETERS[key]) {
      fail(target.project, 'knowledge-parameters-missing', `${target.project} missing knowledge parameters for ${target.template}`);
    }
  }
  for (const key of Object.keys(MANIM_KNOWLEDGE_PARAMETERS)) {
    if (!expectedKnowledgeKeys.has(key)) {
      fail('manim', 'knowledge-parameters-extra', `knowledge parameters are not referenced by MANIM_REQUIRED_TARGETS: ${key}`);
    }
  }

  return rows;
}

function auditSceneSpecs(entries) {
  const rows = [];
  const bySpecHash = new Map();
  const byTitle = new Map();
  const byVisualSignature = new Map();
  const byLearningFocus = new Map();
  const byPrimitiveSet = new Map();
  const bySpecShellHash = new Map();
  const byKnowledgeParameterHash = new Map();
  const byKnowledgePoint = new Map();
  const byKnowledgeUnit = new Map();

  for (const target of entries) {
    const spec = manimSceneSpecFor(target.project, target.template);
    const copy = manimManifestCopyFor(target.project, target.template);
    const title = String(copy.title ?? '');
    const body = String(copy.body ?? '');
    const visualPrimitives = Array.isArray(spec.visualPrimitives) ? spec.visualPrimitives.map(String) : [];
    const visualSignature = String(spec.visualSignature ?? '');
    const visualMotif = String(spec.visualMotif ?? '');
    const learningFocus = String(spec.learningFocus ?? '');
    const knowledgeParameters = normalizeKnowledgeParameters(spec.knowledgeParameters);
    const sceneGrammar = sceneGrammarValue(spec);
    const visualMode = visualModeValue(spec);
    const specShellHash = hashString(stableJson({
      sceneTemplateId: spec.sceneTemplateId,
      generator: spec.generator,
      mode: spec.mode,
      sceneGrammar,
      visualMode,
      visualMotif,
      visualPrimitives,
    }));
    const knowledgeParameterHash = hashString(stableJson(knowledgeParameters));
    const specHash = hashString(stableJson({
      sceneTemplateId: spec.sceneTemplateId,
      generator: spec.generator,
      title: spec.title,
      subtitle: spec.subtitle,
      mode: spec.mode,
      sceneGrammar,
      visualMode,
      scenes: spec.scenes,
      items: spec.items,
      visualSignature,
      visualMotif,
      learningFocus,
      visualPrimitives,
      knowledgeParameters,
    }));
    const row = {
      project: target.project,
      template: target.template,
      sceneTemplate: spec.sceneTemplateId,
      generator: spec.generator,
      title,
      body,
      visualSignature,
      visualMotif,
      learningFocus,
      visualPrimitives,
      knowledgeParameters,
      sceneGrammar,
      visualMode,
      specShellHash,
      knowledgeParameterHash,
      specHash,
    };
    rows.push(row);
    pushMap(bySpecHash, specHash, row);
    pushMap(byTitle, normalizeCopy(title), row);
    pushMap(byVisualSignature, normalizeCopy(visualSignature), row);
    pushMap(byLearningFocus, normalizeCopy(learningFocus), row);
    pushMap(byPrimitiveSet, stableJson([...new Set(visualPrimitives)].sort()), row);
    pushMap(bySpecShellHash, specShellHash, row);
    pushMap(byKnowledgeParameterHash, knowledgeParameterHash, row);
    pushMap(byKnowledgePoint, normalizeCopy(knowledgeParameters.knowledgePoint), row);
    pushMap(byKnowledgeUnit, normalizeCopy(knowledgeParameters.unitId), row);

    if (!title.trim()) fail(target.project, 'manifest-title-empty', `${target.project} manifest title is empty`);
    if (!body.trim()) fail(target.project, 'manifest-body-empty', `${target.project} manifest body is empty`);
    if (TECHNICAL_COPY_TERMS.test(title) || TECHNICAL_COPY_TERMS.test(body)) {
      fail(target.project, 'manifest-copy-technical-term', `${target.project} manifest copy contains implementation wording`);
    }
    if (!visualSignature.trim()) fail(target.project, 'visual-signature-empty', `${target.project} visual signature is empty`);
    if (!visualMotif.trim()) fail(target.project, 'visual-motif-empty', `${target.project} visual motif is empty`);
    if (!learningFocus.trim()) fail(target.project, 'learning-focus-empty', `${target.project} learning focus is empty`);
    if (visualPrimitives.length < MIN_VISUAL_PRIMITIVES) {
      fail(target.project, 'visual-primitives-too-few', `${target.project} has ${visualPrimitives.length} visual primitives, expected at least ${MIN_VISUAL_PRIMITIVES}`);
    }
    if (new Set(visualPrimitives.map(normalizeCopy)).size !== visualPrimitives.length) {
      fail(target.project, 'visual-primitives-duplicate', `${target.project} repeats visual primitives`);
    }
    auditProfessionalVisualPrimitives(target, visualPrimitives);
    auditKnowledgeParameters(target, knowledgeParameters);
  }

  for (const group of bySpecHash.values()) {
    if (group.length <= 1) continue;
    fail(
      'manim',
      'scene-spec-duplicate',
      `Manim scene spec hash is reused by ${group.map((item) => `${item.project}:${item.template}`).join(', ')}`,
    );
  }

  for (const [title, group] of byTitle.entries()) {
    if (!title || group.length <= 1) continue;
    fail(
      'manim',
      'manifest-title-duplicate',
      `Manim manifest title "${group[0].title}" is reused by ${group.map((item) => item.project).join(', ')}`,
    );
  }

  for (const [signature, group] of byVisualSignature.entries()) {
    if (!signature || group.length <= 1) continue;
    fail(
      'manim',
      'visual-signature-duplicate',
      `Manim visual signature "${group[0].visualSignature}" is reused by ${group.map((item) => item.project).join(', ')}`,
    );
  }

  for (const [focus, group] of byLearningFocus.entries()) {
    if (!focus || group.length <= 1) continue;
    fail(
      'manim',
      'learning-focus-duplicate',
      `Manim learning focus is reused by ${group.map((item) => item.project).join(', ')}`,
    );
  }

  for (const [primitiveSet, group] of byPrimitiveSet.entries()) {
    if (!primitiveSet || group.length <= 1) continue;
    fail(
      'manim',
      'visual-primitive-set-duplicate',
      `Manim visual primitive set is reused by ${group.map((item) => item.project).join(', ')}`,
    );
  }

  for (const group of bySpecShellHash.values()) {
    if (group.length <= 1) continue;
    fail(
      'manim',
      'scene-spec-shell-duplicate',
      `Manim scene shell hash is reused by ${group.map((item) => `${item.project}:${item.template}`).join(', ')}`,
    );
  }

  for (const group of byKnowledgeParameterHash.values()) {
    if (group.length <= 1) continue;
    fail(
      'manim',
      'knowledge-parameters-duplicate',
      `Manim knowledge parameter hash is reused by ${group.map((item) => `${item.project}:${item.template}`).join(', ')}`,
    );
  }

  for (const [point, group] of byKnowledgePoint.entries()) {
    if (!point || group.length <= 1) continue;
    fail(
      'manim',
      'knowledge-point-duplicate',
      `Manim knowledge point is reused by ${group.map((item) => item.project).join(', ')}`,
    );
  }

  for (const [unitId, group] of byKnowledgeUnit.entries()) {
    if (!unitId || group.length <= 1) continue;
    fail(
      'manim',
      'knowledge-unit-duplicate',
      `Manim knowledge unit ${group[0].knowledgeParameters.unitId} is reused by ${group.map((item) => item.project).join(', ')}`,
    );
  }

  auditSpecSimilarity(rows);

  return rows;
}

function auditProfessionalVisualPrimitives(target, visualPrimitives) {
  const professionalHits = new Set(
    visualPrimitives
      .filter((primitive) => PROFESSIONAL_PRIMITIVE_TERMS.test(primitive))
      .map(normalizeCopy),
  );
  if (professionalHits.size < MIN_PROFESSIONAL_PRIMITIVE_TERMS) {
    fail(
      target.project,
      'visual-primitives-not-professional',
      `${target.project} has ${professionalHits.size} professional visual primitives, expected at least ${MIN_PROFESSIONAL_PRIMITIVE_TERMS}`,
    );
  }
}

function auditSpecSimilarity(rows) {
  const tokenRows = rows.map((row) => ({ row, tokens: similarityTokenSet(row) }));
  for (let leftIndex = 0; leftIndex < tokenRows.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < tokenRows.length; rightIndex += 1) {
      const left = tokenRows[leftIndex];
      const right = tokenRows[rightIndex];
      const score = jaccard(left.tokens, right.tokens);
      if (score < MAX_SPEC_SIMILARITY) continue;
      fail(
        'manim',
        'scene-spec-too-similar',
        `${left.row.project}:${left.row.template} and ${right.row.project}:${right.row.template} are too similar (${score.toFixed(2)})`,
      );
    }
  }
}

function similarityTokenSet(row) {
  const params = row.knowledgeParameters ?? {};
  const text = [
    row.sceneTemplate,
    row.generator,
    row.title,
    row.body,
    row.visualSignature,
    row.visualMotif,
    row.learningFocus,
    row.sceneGrammar,
    row.visualMode,
    params.unitId,
    params.knowledgePoint,
    params.engineeringObject,
    params.primaryMetric,
    params.decisionRule,
    ...(params.evidence ?? []),
    ...(row.visualPrimitives ?? []),
  ].join(' ');
  return charGramSet(text);
}

function charGramSet(value) {
  const normalized = normalizeCopy(value).replace(/[^\p{L}\p{N}]+/gu, '');
  const tokens = new Set();
  for (const word of String(value ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (word.length >= 2) tokens.add(word);
  }
  for (let index = 0; index < normalized.length - 2; index += 1) {
    tokens.add(normalized.slice(index, index + 3));
  }
  return tokens;
}

function jaccard(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function auditKnowledgeParameters(target, params) {
  for (const field of ['unitId', 'knowledgePoint', 'engineeringObject', 'primaryMetric', 'decisionRule']) {
    if (!String(params[field] ?? '').trim()) {
      fail(target.project, `knowledge-${field}-empty`, `${target.project} knowledgeParameters.${field} is empty`);
    }
  }
  if (!String(params.unitId).startsWith(`${target.project}-`)) {
    fail(target.project, 'knowledge-unit-project-mismatch', `${target.project} knowledge unit ${params.unitId} must start with ${target.project}-`);
  }
  if (!Array.isArray(params.evidence) || params.evidence.length < MIN_KNOWLEDGE_EVIDENCE) {
    fail(target.project, 'knowledge-evidence-too-few', `${target.project} has ${params.evidence.length} evidence parameters, expected at least ${MIN_KNOWLEDGE_EVIDENCE}`);
  }
  const parameterText = normalizeCopy([
    params.knowledgePoint,
    params.engineeringObject,
    params.primaryMetric,
    params.decisionRule,
    ...(params.evidence ?? []),
  ].join(' '));
  if (/\b(?:generic|template|placeholder|核心概念|5g工程对象)\b/i.test(parameterText)) {
    fail(target.project, 'knowledge-parameters-generic', `${target.project} knowledge parameters still look generic`);
  }
}

function auditSceneGrammarAndVisualMode(entries, specRows) {
  const rows = [];
  const specRowsByProject = new Map(specRows.map((row) => [row.project, row]));

  for (const target of entries) {
    const specRow = specRowsByProject.get(target.project);
    rows.push({
      source: 'spec',
      project: target.project,
      template: target.template,
      sceneGrammar: specRow?.sceneGrammar ?? '',
      visualMode: specRow?.visualMode ?? '',
    });

    const manifestPath = path.join(root, 'site', 'public', 'media', 'manim', target.project.toLowerCase(), target.template, 'manifest.json');
    const manifest = readJson(manifestPath);
    const manifestSceneGrammar = sceneGrammarValue(manifest);
    const manifestVisualMode = visualModeValue(manifest);
    const specKnowledgeParameters = specRow?.knowledgeParameters ?? {};
    const manifestKnowledgeParameters = normalizeKnowledgeParameters(manifest?.knowledgeParameters ?? manifest?.sceneGrammar?.knowledgeParameters);
    const manifestKnowledgeParameterHash = manifest ? hashString(stableJson(manifestKnowledgeParameters)) : '';
    rows.push({
      source: 'manifest',
      project: target.project,
      template: target.template,
      file: relative(manifestPath),
      exists: Boolean(manifest),
      sceneGrammar: manifestSceneGrammar,
      visualMode: manifestVisualMode,
      knowledgeParameterHash: manifestKnowledgeParameterHash,
    });

    if (!manifest) {
      warn(target.project, 'manifest-missing-for-scene-grammar', `${target.project} manifest is unavailable for scene grammar / visual mode audit`);
    } else if (!manifestKnowledgeParameterHash || !manifestKnowledgeParameters.unitId) {
      fail(target.project, 'manifest-knowledge-parameters-missing', `${target.project} manifest is missing knowledgeParameters`);
    } else if (manifestKnowledgeParameterHash !== hashString(stableJson(specKnowledgeParameters))) {
      fail(target.project, 'manifest-knowledge-parameters-mismatch', `${target.project} manifest knowledgeParameters do not match generated spec`);
    }
    if (manifestSceneGrammar && manifestVisualMode && manifestSceneGrammar === manifestVisualMode) {
      warn(target.project, 'manifest-scene-grammar-visual-mode-same', `${target.project} manifest scene grammar and visual mode are both "${manifestSceneGrammar}"`);
    }
  }

  auditOptionalDiversity(rows, 'spec', 'sceneGrammar', MIN_SCENE_GRAMMAR_DIVERSITY, 'spec-scene-grammar');
  auditOptionalDiversity(rows, 'spec', 'visualMode', MIN_VISUAL_MODE_DIVERSITY, 'spec-visual-mode');
  auditOptionalDiversity(rows, 'manifest', 'sceneGrammar', MIN_SCENE_GRAMMAR_DIVERSITY, 'manifest-scene-grammar');
  auditOptionalDiversity(rows, 'manifest', 'visualMode', MIN_VISUAL_MODE_DIVERSITY, 'manifest-visual-mode');

  return rows;
}

function auditOptionalDiversity(rows, source, field, minimum, codePrefix) {
  const presentRows = rows.filter((row) => row.source === source && row[field]);
  if (!presentRows.length) {
    warn('manim', `${codePrefix}-missing`, `no ${source} ${field} values found; skipping ${field} diversity gate for compatibility`);
    return;
  }

  const uniqueValues = new Set(presentRows.map((row) => normalizeCopy(row[field])).filter(Boolean));
  if (uniqueValues.size < minimum) {
    fail(
      'manim',
      `${codePrefix}-low-diversity`,
      `${source} ${field} has ${uniqueValues.size} unique values, expected at least ${minimum}`,
    );
  }
}

function auditProjectPage(projectId, target) {
  const pageFile = pageFiles.get(projectId) ?? '';
  const pagePath = pageFile ? path.join(projectDir, pageFile) : '';
  const pageText = pagePath ? readText(pagePath) : '';
  const expectedBase = target ? `/media/manim/${projectId.toLowerCase()}/${target.template}/` : '';
  const expectedVideo = target ? `${expectedBase}${projectId.toLowerCase()}-${target.template}.webm` : '';
  const expectedPoster = target ? `${expectedBase}poster.png` : '';
  const refs = collectPageManimRefs(pageText, projectId);

  if (!pageFile) {
    fail(projectId, 'page-missing', `${projectId} page file missing`);
  }
  if (!target) {
    fail(projectId, 'target-missing-for-page', `${projectId} has no Manim target`);
  }
  if (refs.video.length !== 1) {
    fail(projectId, 'page-video-ref-count', `${projectId} page has ${refs.video.length} Manim video src references, expected 1`);
  }
  if (refs.poster.length !== 1) {
    fail(projectId, 'page-poster-ref-count', `${projectId} page has ${refs.poster.length} Manim poster references, expected 1`);
  }
  if (target && refs.video.length === 1 && refs.video[0] !== expectedVideo) {
    fail(projectId, 'page-video-ref-target', `${projectId} page video is ${refs.video[0]}, expected ${expectedVideo}`);
  }
  if (target && refs.poster.length === 1 && refs.poster[0] !== expectedPoster) {
    fail(projectId, 'page-poster-ref-target', `${projectId} page poster is ${refs.poster[0]}, expected ${expectedPoster}`);
  }

  return {
    project: projectId,
    template: target?.template ?? '',
    pageFile,
    expectedVideo,
    expectedPoster,
    videoRefs: refs.video,
    posterRefs: refs.poster,
  };
}

function auditGeneratedSources(targetsByProject) {
  const rows = [];
  const byFingerprint = new Map();
  const expectedFiles = new Set();

  for (const projectId of expectedProjectIds) {
    const target = targetsByProject.get(projectId);
    if (!target) continue;
    const file = path.join(generatedDir, `${projectId.toLowerCase()}-${target.template}.py`);
    expectedFiles.add(path.basename(file));
    const source = readText(file);
    if (!source) {
      fail(projectId, 'generated-source-missing', `generated Manim source missing: ${relative(file)}`);
      rows.push({ project: projectId, template: target.template, file: relative(file), exists: false, structureHash: '' });
      continue;
    }
    const structure = manimStructure(source);
    const structureHash = hashString(structure);
    const spec = manimSceneSpecFor(projectId, target.template);
    const sourceVisualSignature = sourceHeaderValue(source, 'dgbook-visual-signature');
    const sourceVisualPrimitives = sourceHeaderValue(source, 'dgbook-visual-primitives')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const sourceKnowledgeParameters = sourceHeaderValue(source, 'dgbook-knowledge-parameters');
    const row = {
      project: projectId,
      template: target.template,
      file: relative(file),
      exists: true,
      structureHash,
      sourceVisualSignature,
      sourceVisualPrimitives,
      sourceKnowledgeParameters,
    };
    rows.push(row);
    if (!sourceVisualSignature) {
      fail(projectId, 'generated-source-visual-signature-missing', `${projectId} generated Manim source is missing dgbook visual signature header`);
    }
    if (sourceVisualSignature && sourceVisualSignature !== spec.visualSignature) {
      fail(projectId, 'generated-source-visual-signature-mismatch', `${projectId} generated visual signature is ${sourceVisualSignature}, expected ${spec.visualSignature}`);
    }
    if (sourceVisualPrimitives.length < MIN_VISUAL_PRIMITIVES) {
      fail(projectId, 'generated-source-visual-primitives-missing', `${projectId} generated Manim source has ${sourceVisualPrimitives.length} visual primitive headers`);
    }
    if (!sourceKnowledgeParameters) {
      fail(projectId, 'generated-source-knowledge-parameters-missing', `${projectId} generated Manim source is missing dgbook knowledge parameter header`);
    } else {
      const params = normalizeKnowledgeParameters(spec.knowledgeParameters);
      for (const expected of [params.unitId, params.knowledgePoint, params.primaryMetric]) {
        if (expected && !sourceKnowledgeParameters.includes(expected)) {
          fail(projectId, 'generated-source-knowledge-parameters-mismatch', `${projectId} generated knowledge parameter header does not include "${expected}"`);
        }
      }
    }
    if (!byFingerprint.has(structureHash)) byFingerprint.set(structureHash, []);
    byFingerprint.get(structureHash).push(row);
  }

  for (const group of byFingerprint.values()) {
    if (group.length <= 1) continue;
    fail(
      'manim',
      'generated-source-structure-duplicate',
      `generated Manim source structure is reused by ${group.map((item) => `${item.project}:${item.template}`).join(', ')}`,
    );
  }

  if (existsSync(generatedDir)) {
    for (const file of readdirSync(generatedDir).filter((item) => /^p\d{2}-.+\.py$/i.test(item)).sort()) {
      if (expectedFiles.has(file)) continue;
      fail('manim', 'generated-source-extra', `stale generated Manim source is not referenced by MANIM_REQUIRED_TARGETS: ${relative(path.join(generatedDir, file))}`);
    }
  }

  return rows;
}

function readManimTargets() {
  const entries = MANIM_REQUIRED_TARGETS.map((target) => ({
    project: target.project,
    template: target.template,
  }));
  return {
    entries,
    byProject: new Map(entries.map((target) => [target.project, target])),
  };
}

function collectPageManimRefs(text, projectId) {
  const video = [];
  const poster = [];
  const projectPrefix = `/media/manim/${projectId.toLowerCase()}/`;
  for (const tagMatch of String(text ?? '').matchAll(/<video\b[^>]*>/gi)) {
    const tag = tagMatch[0];
    const src = attrValue(tag, 'src');
    const posterRef = attrValue(tag, 'poster');
    if (src?.startsWith(projectPrefix)) video.push(src);
    if (posterRef?.startsWith(projectPrefix)) poster.push(posterRef);
  }
  return { video, poster };
}

function attrValue(tag, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`, 'i');
  const match = String(tag ?? '').match(pattern);
  return match?.[1] ?? match?.[2] ?? '';
}

function sourceHeaderValue(source, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(source ?? '').match(new RegExp(`^#\\s*${escaped}:\\s*(.+)$`, 'mi'));
  return match?.[1]?.trim() ?? '';
}

function normalizeKnowledgeParameters(value) {
  const params = value && typeof value === 'object' ? value : {};
  return {
    unitId: String(params.unitId ?? ''),
    knowledgePoint: String(params.knowledgePoint ?? ''),
    engineeringObject: String(params.engineeringObject ?? ''),
    primaryMetric: String(params.primaryMetric ?? ''),
    evidence: Array.isArray(params.evidence) ? params.evidence.map(String).filter(Boolean) : [],
    decisionRule: String(params.decisionRule ?? ''),
  };
}

function manimStructure(source) {
  return String(source ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/#[^\n]*/g, '')
    .replace(/\bP\d{2}\b/gi, 'PXX')
    .replace(/\bp\d{2}\b/gi, 'pxx')
    .replace(/class\s+\w+\(Scene\):/g, 'class SceneClass(Scene):')
    .replace(/("""|''')[\s\S]*?\1/g, '"""STR"""')
    .replace(/"([^"\\]|\\.)*"/g, '"STR"')
    .replace(/'([^'\\]|\\.)*'/g, "'STR'")
    .replace(/\b\d+(?:\.\d+)?\b/g, 'NUM')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function mapProjectPages() {
  const result = new Map();
  if (!existsSync(projectDir)) return result;
  for (const file of readdirSync(projectDir).filter((item) => item.endsWith('.mdx'))) {
    const projectId = file.match(/^(P\d{2})-/)?.[1];
    if (projectId && !result.has(projectId)) result.set(projectId, file);
  }
  return result;
}

function groupBy(values, keyFn) {
  const result = new Map();
  for (const value of values) {
    const key = keyFn(value);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(value);
  }
  return result;
}

function pushMap(map, key, value) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

function readText(file) {
  try {
    return readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
}

function readJson(file) {
  const text = readText(file);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    warn('manim', 'manifest-json-invalid', `could not parse JSON: ${relative(file)}`);
    return null;
  }
}

function hashString(value) {
  return createHash('sha1').update(String(value ?? '')).digest('hex').slice(0, 12);
}

function sceneTemplateForTarget(target) {
  return MANIM_SCENE_TEMPLATE_ALIASES[`${target.project}:${target.template}`] ?? target.template;
}

function normalizeCopy(value) {
  return String(value ?? '').replace(/\s+/g, '').toLowerCase();
}

function sceneGrammarValue(value) {
  const grammar = value?.sceneGrammar;
  if (typeof grammar === 'string') return grammar.trim();
  return String(grammar?.grammar ?? grammar?.mode ?? value?.mode ?? '').trim();
}

function visualModeValue(value) {
  return String(value?.visualMode ?? value?.sceneGrammar?.visualMode ?? value?.visualMotif ?? '').trim();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function fail(scope, code, message) {
  failures.push({ scope, code, message });
}

function warn(scope, code, message) {
  warnings.push({ scope, code, message });
}

#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractFile = 'docs/design/image2/image2-route-contract.json';
const documents = [
  'docs/design/image2/README.md',
  'docs/architecture/image2-ui-reference-loop.md',
  contractFile,
];
const viewportProfiles = {
  'desktop-1440': { width: 1440, height: 900, coverage: 'full' },
  'desktop-1920': { width: 1920, height: 1080, coverage: 'full' },
  'mobile-390': { width: 390, height: 844, coverage: 'full' },
};
const expectedMatrix = new Map(Object.entries({
  'login/student': ['/', '', 'anonymous-student'],
  'login/teacher': ['/', '', 'anonymous-teacher'],
  'student-home/P01-current': ['/student/home', '', 'stu-01'],
  'student-home/P02-current': ['/student/home', '', 'stu-02'],
  'student-home/P03-current': ['/student/home', '', 'stu-03'],
  'teacher-workbench/current': ['/teacher/workbench', '', 'teacher01'],
  'p1-project/P01-current': ['/student/projects/p1', '', 'stu-01'],
  'p1-project/P02-current': ['/student/projects/p1', '', 'stu-02'],
  'p1-project/P03-current': ['/student/projects/p1', '', 'stu-03'],
  'n02-p01/figure': ['/learn/P1T1-N02', '', 'stu-01'],
  'n02-p02/figure': ['/learn/P1T2-N02', '', 'stu-02'],
  'n02-p03/figure': ['/learn/P1T3-N02', '', 'stu-03'],
  'formal-test/open': ['/learn/P1T1-N02', '?mode=challenge', 'stu-01'],
  'n04-p01/returned': ['/learn/P1T1-N04', '?mode=challenge', 'stu-01'],
  'n04-p02/draft': ['/learn/P1T2-N04', '?mode=challenge', 'stu-02'],
  'n04-p03/submitted': ['/learn/P1T3-N04', '?mode=challenge', 'stu-03'],
  'portfolio/incomplete': ['/student/projects/p1/portfolio', '', 'stu-01'],
  'portfolio/complete': ['/student/projects/p1/portfolio', '', 'stu-03'],
  'teacher-session/teaching': ['/teacher/sessions/demo-class', '', 'teacher01'],
  'student-follow/follow': ['/classroom/demo-class', '', 'stu-01'],
  'student-follow/self': ['/classroom/demo-class', '', 'stu-02'],
  'student-follow/entry-or-left': ['/classroom/demo-class', '', 'stu-03'],
  'projector/active': ['/present/demo-class', '', 'teacher01'],
  'course-graph/P1-current': ['/course', '', 'stu-03'],
}));
const expectedReferences = new Map(Object.entries({
  'login/student': 'docs/design/image2/dgbook-image2-login-dark-v4.png',
  'course-graph/P1-current': 'docs/design/image2/dgbook-image2-capability-graph-dark-v4.png',
  'n02-p01/figure': 'docs/design/image2/dgbook-image2-learning-dark-v4.png',
  'teacher-session/teaching': 'docs/design/image2/dgbook-image2-teacher-dark-v4.png',
  'student-follow/follow': 'docs/design/image2/dgbook-image2-student-follow-dark-v4.png',
  'formal-test/open': 'docs/design/image2/dgbook-image2-pixi-dark-v4.png',
}));
const noPrimary = new Set(['n04-p03/submitted', 'portfolio/incomplete', 'portfolio/complete', 'projector/active']);
const atMostOnePrimary = new Set();
const longPages = new Set([
  'p1-project/P01-current', 'p1-project/P02-current', 'p1-project/P03-current',
  'n04-p01/returned', 'n04-p02/draft', 'n04-p03/submitted',
  'portfolio/incomplete', 'portfolio/complete',
]);

export function validateImage2Contract(candidate) {
  const issues = [];
  const issue = (code, detail) => issues.push({ code, detail });
  if (candidate?.version !== 2) issue('contract-version-invalid', candidate?.version ?? null);
  if (!sameJson(candidate?.viewportProfiles, viewportProfiles)) issue('viewport-profiles-invalid', candidate?.viewportProfiles ?? null);
  validateSharedPolicies(candidate, issue);

  const states = flattenStates(candidate, issue);
  if (states.size !== expectedMatrix.size) issue('state-count-invalid', `${states.size}/${expectedMatrix.size}`);
  if (!sameSet(new Set(states.keys()), new Set(expectedMatrix.keys()))) issue('state-matrix-invalid', [...states.keys()]);

  for (const [key, expected] of expectedMatrix) {
    const state = states.get(key);
    if (!state) continue;
    const [route, query, actor] = expected;
    if (state.route !== route) issue('state-route-invalid', `${key}: ${state.route ?? '<missing>'} != ${route}`);
    if (state.query !== query) issue('state-query-invalid', `${key}: ${state.query ?? '<missing>'} != ${query}`);
    if (state.actor !== actor) issue('state-actor-invalid', `${key}: ${state.actor ?? '<missing>'} != ${actor}`);
    validateState(key, state, issue);
  }

  const directReferences = new Map([...states].flatMap(([key, state]) => state?.reference ? [[key, state.reference]] : []));
  if (!sameMap(directReferences, expectedReferences)) issue('direct-reference-map-invalid', Object.fromEntries(directReferences));
  for (const [key, state] of states) {
    const direct = typeof state?.reference === 'string' && state.reference.length > 0;
    const derived = Array.isArray(state?.derivedFrom) && state.derivedFrom.length > 0;
    if (direct === derived) {
      issue('state-reference-source-invalid', key);
      continue;
    }
    if (derived) {
      for (const sourceKey of state.derivedFrom) {
        if (!expectedReferences.has(sourceKey)) issue('derived-reference-not-authoritative', `${key}: ${sourceKey}`);
      }
    }
  }

  const serialized = JSON.stringify(candidate);
  if (/\/(?:teacher\/sessions|classroom|present)\/P1T1-N02/.test(serialized)) issue('legacy-node-session-route', 'P1T1-N02');
  if (serialized.includes('?state=formal-test')) issue('legacy-formal-query', '?state=formal-test');
  return issues;
}

function validateSharedPolicies(candidate, issue) {
  const interaction = candidate?.interactionPolicies;
  if (!sameJson(interaction?.primaryAction, {
    selector: '[data-primary-action]', allowedPolicies: ['exactly-one', 'at-most-one', 'none'],
  })) issue('primary-action-contract-invalid', interaction?.primaryAction ?? null);
  if (interaction?.overflow?.documentTolerancePx !== 1
    || interaction?.overflow?.hideDocumentOverflowAllowed !== false
    || interaction?.overflow?.clickableIntersectionRequired !== true
    || interaction?.overflow?.stickyContentGapPx !== 16) {
    issue('overflow-contract-invalid', interaction?.overflow ?? null);
  }
  if (interaction?.keyboard?.focusVisibleRequired !== true
    || interaction?.keyboard?.focusReturnRequired !== true
    || !sameJson(interaction?.keyboard?.activationKeys, ['Enter', 'Space'])
    || interaction?.keyboard?.drawerCloseKey !== 'Escape'
    || interaction?.keyboard?.skipLinkRequired !== true) {
    issue('keyboard-contract-invalid', interaction?.keyboard ?? null);
  }
  if (interaction?.reducedMotion?.mediaQuery !== '(prefers-reduced-motion: reduce)'
    || interaction?.reducedMotion?.requiredSelector !== '[data-motion]'
    || !sameJson(interaction?.reducedMotion?.allowedValues, ['paused', 'reduced'])
    || interaction?.reducedMotion?.nonEssentialMotion !== 'disabled') {
    issue('reduced-motion-contract-invalid', interaction?.reducedMotion ?? null);
  }
  const capture = candidate?.capturePolicy;
  if (capture?.fileNameTemplate !== '<surface>--<state>--<actor>--<viewport>.png'
    || !sameJson(capture?.requiredReportFields, [
      'contractVersion', 'setup', 'screenshotSha256', 'actualUrl', 'actor', 'state', 'revision', 'snapshotVersion',
    ])
    || !sameJson(capture?.stabilityWaits, ['fonts', 'images', 'critical-api', 'state-selector', 'motion-paused'])) {
    issue('capture-contract-invalid', capture ?? null);
  }
}

function validateState(key, state, issue) {
  if (!isNonEmptyRecord(state.setup)) issue('state-setup-invalid', key);
  if (!sameSet(new Set(state.viewportProfiles ?? []), new Set(Object.keys(viewportProfiles)))) issue('state-viewports-invalid', key);
  if (!sameJson(state.checks, ['overflow', 'keyboard', 'reduced-motion', 'primary-action'])) issue('state-checks-invalid', key);
  if (!Array.isArray(state.allowedInternalScrollers)) issue('state-scrollers-invalid', key);
  if (!nonEmptyStrings(state.requiredSelectors)) issue('state-selectors-invalid', key);
  const expectedPrimary = noPrimary.has(key) ? 'none' : atMostOnePrimary.has(key) ? 'at-most-one' : 'exactly-one';
  if (state.primaryActionPolicy !== expectedPrimary) issue('state-primary-action-invalid', `${key}: ${state.primaryActionPolicy ?? '<missing>'}`);
  if (expectedPrimary === 'exactly-one' && !state.requiredSelectors?.includes('[data-primary-action]')) issue('state-primary-selector-missing', key);
  const expectedCaptures = longPages.has(key) ? ['viewport', 'full-page', 'bottom'] : ['viewport'];
  if (!sameJson(state.screenshotPolicy?.captures, expectedCaptures)) issue('state-screenshot-policy-invalid', key);
  if (!Array.isArray(state.regions) || state.regions.length === 0) {
    issue('state-regions-invalid', key);
    return;
  }
  const names = state.regions.map((region) => region?.name);
  if (new Set(names).size !== names.length) issue('state-region-name-duplicate', key);
  for (const region of state.regions) {
    if (typeof region?.name !== 'string' || !region.name.trim()) issue('state-region-name-invalid', key);
    if (typeof region?.selector !== 'string' || !state.requiredSelectors?.includes(region.selector)) {
      issue('state-region-selector-invalid', `${key}: ${region?.selector ?? '<missing>'}`);
    }
  }
}

function flattenStates(contract, issue = () => undefined) {
  const states = new Map();
  const surfaceIds = new Set();
  if (!Array.isArray(contract?.surfaces)) {
    issue('contract-surfaces-invalid', 'surfaces must be an array');
    return states;
  }
  for (const surface of contract.surfaces) {
    if (typeof surface?.id !== 'string' || !surface.id.trim()) {
      issue('surface-id-invalid', surface?.id ?? null);
      continue;
    }
    if (surfaceIds.has(surface.id)) issue('surface-id-duplicate', surface.id);
    surfaceIds.add(surface.id);
    if (!Array.isArray(surface.states) || surface.states.length === 0) {
      issue('surface-states-invalid', surface.id);
      continue;
    }
    const stateIds = new Set();
    for (const state of surface.states) {
      if (typeof state?.id !== 'string' || !state.id.trim()) {
        issue('state-id-invalid', surface.id);
        continue;
      }
      if (stateIds.has(state.id)) issue('state-id-duplicate', `${surface.id}/${state.id}`);
      stateIds.add(state.id);
      states.set(`${surface.id}/${state.id}`, state);
    }
  }
  return states;
}

function read(file) {
  const absolute = path.join(root, file);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : '';
}

function readJson(file) {
  try {
    return JSON.parse(read(file));
  } catch {
    return null;
  }
}

function isNonEmptyRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function nonEmptyStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim());
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameSet(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function sameMap(left, right) {
  return left.size === right.size && [...left].every(([key, value]) => right.get(key) === value);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = [];
  for (const file of documents) {
    if (!existsSync(path.join(root, file))) failures.push({ code: 'file-missing', detail: file });
  }
  const contract = readJson(contractFile);
  failures.push(...validateImage2Contract(contract));
  const states = flattenStates(contract);
  const references = [...new Set([...states.values()].flatMap((state) => state.reference ? [state.reference] : []))];
  for (const reference of references) {
    const absolute = path.join(root, reference);
    if (!existsSync(absolute)) failures.push({ code: 'reference-missing', detail: reference });
    else if (statSync(absolute).size < 100_000) failures.push({ code: 'reference-too-small', detail: reference });
  }
  const documentation = documents.filter((file) => file.endsWith('.md')).map(read).join('\n');
  for (const marker of ['version 2', '390x844', 'demo-class', '?mode=challenge', 'derivedFrom', 'exactly-one', 'reduced-motion']) {
    if (!documentation.includes(marker)) failures.push({ code: 'documentation-marker-missing', detail: marker });
  }
  const report = {
    tool: 'audit-image2-reference',
    contract: contractFile,
    version: contract?.version ?? null,
    summary: {
      failures: failures.length,
      surfaces: contract?.surfaces?.length ?? 0,
      states: states.size,
      images: references.length,
      viewportProfiles: Object.keys(contract?.viewportProfiles ?? {}).length,
      documents: documents.length,
    },
    states: [...states].map(([key, state]) => ({
      key, actor: state.actor, route: `${state.route}${state.query}`, viewportProfiles: state.viewportProfiles,
      primaryActionPolicy: state.primaryActionPolicy,
      ...(state.reference ? { reference: state.reference } : { derivedFrom: state.derivedFrom }),
    })),
    references,
    documents,
    failures,
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
}

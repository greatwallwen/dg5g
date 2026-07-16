import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractFile = path.join(root, 'docs/design/image2/image2-route-contract.json');
const expectedViewportProfiles = {
  'desktop-1440': { width: 1440, height: 900, coverage: 'full' },
  'desktop-1920': { width: 1920, height: 1080, coverage: 'full' },
  'mobile-390': { width: 390, height: 844, coverage: 'full' },
};
const expectedMatrix = new Map(Object.entries({
  'login/student': ['/', '', 'anonymous-student'],
  'login/teacher': ['/', '', 'anonymous-teacher'],
  'student-home/P01-current': ['/student/home', '', 'stu-01'],
  'student-home/P01-returned': ['/student/home', '', 'stu-02'],
  'student-home/P03-current': ['/student/home', '', 'stu-03'],
  'teacher-workbench/current': ['/teacher/workbench', '', 'teacher01'],
  'p1-project/P01-current': ['/student/projects/p1', '', 'stu-01'],
  'p1-project/P01-returned': ['/student/projects/p1', '', 'stu-02'],
  'p1-project/demo-complete': ['/student/projects/p1', '', 'stu-03'],
  'n02-p01/figure': ['/learn/P1T1-N02', '', 'stu-03'],
  'n02-p02/figure': ['/learn/P1T2-N02', '', 'stu-03'],
  'n02-p03/figure': ['/learn/P1T3-N02', '', 'stu-03'],
  'formal-test/open': ['/learn/P1T1-N02/test', '', 'stu-03'],
  'n04-p01/returned': ['/learn/P1T1-N04', '?mode=challenge', 'stu-02'],
  'n04-p02/verified': ['/learn/P1T2-N04', '?mode=challenge', 'stu-03'],
  'n04-p03/verified': ['/learn/P1T3-N04', '?mode=challenge', 'stu-03'],
  'portfolio/incomplete': ['/student/projects/p1/portfolio', '', 'stu-01'],
  'portfolio/demo-complete': ['/student/projects/p1/portfolio', '', 'stu-03'],
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
const noPrimaryAction = new Set(['p1-project/demo-complete', 'n04-p02/verified', 'n04-p03/verified', 'portfolio/incomplete', 'portfolio/demo-complete', 'projector/active']);
const atMostOnePrimaryAction = new Set();
const longPageStates = new Set([
  'p1-project/P01-current', 'p1-project/P01-returned', 'p1-project/demo-complete',
  'n04-p01/returned', 'n04-p02/verified', 'n04-p03/verified',
  'portfolio/incomplete', 'portfolio/demo-complete',
]);

test('defines the complete Image2 v2 surface, state, actor and 390px matrix', () => {
  const contract = readContract();
  assert.equal(contract.version, 2);
  assert.deepEqual(contract.viewportProfiles, expectedViewportProfiles);
  assert.deepEqual(contract.interactionPolicies.primaryAction, {
    selector: '[data-primary-action]',
    allowedPolicies: ['exactly-one', 'at-most-one', 'none'],
  });
  assert.equal(contract.interactionPolicies.overflow.documentTolerancePx, 1);
  assert.equal(contract.interactionPolicies.overflow.hideDocumentOverflowAllowed, false);
  assert.equal(contract.interactionPolicies.keyboard.focusVisibleRequired, true);
  assert.equal(contract.interactionPolicies.keyboard.focusReturnRequired, true);
  assert.deepEqual(contract.interactionPolicies.keyboard.activationKeys, ['Enter', 'Space']);
  assert.equal(contract.interactionPolicies.reducedMotion.mediaQuery, '(prefers-reduced-motion: reduce)');
  assert.equal(contract.interactionPolicies.reducedMotion.requiredSelector, '[data-motion]');
  assert.equal(contract.capturePolicy.fileNameTemplate, '<surface>--<state>--<actor>--<viewport>.png');
  assert.deepEqual(contract.capturePolicy.requiredReportFields, [
    'contractVersion', 'setup', 'screenshotSha256', 'actualUrl', 'actor', 'state', 'revision', 'snapshotVersion',
  ]);
  assert.deepEqual(contract.capturePolicy.stabilityWaits, ['fonts', 'images', 'critical-api', 'state-selector', 'motion-paused']);

  const states = flattenStates(contract);
  assert.equal(states.size, expectedMatrix.size, 'contract must contain the full 24-state sample journey');
  assert.deepEqual(new Set(states.keys()), new Set(expectedMatrix.keys()));

  for (const [key, [route, query, actor]] of expectedMatrix) {
    const state = states.get(key);
    assert.ok(state, key);
    assert.equal(state.route, route, `${key} route`);
    assert.equal(state.query, query, `${key} query`);
    assert.equal(state.actor, actor, `${key} actor`);
    assert.equal(typeof state.setup, 'object', `${key} setup must be explicit`);
    assert.ok(Object.keys(state.setup).length > 0, `${key} setup must not be empty`);
    assert.deepEqual(new Set(state.viewportProfiles), new Set(Object.keys(expectedViewportProfiles)), `${key} viewport profiles`);
    assert.deepEqual(state.checks, ['overflow', 'keyboard', 'reduced-motion', 'primary-action'], `${key} checks`);
    assert.ok(Array.isArray(state.allowedInternalScrollers), `${key} internal scrollers`);
    assert.ok(Array.isArray(state.requiredSelectors) && state.requiredSelectors.length > 0, `${key} selectors`);
    assert.ok(Array.isArray(state.regions) && state.regions.length > 0, `${key} regions`);
    const regionNames = state.regions.map(({ name }) => name);
    assert.equal(new Set(regionNames).size, regionNames.length, `${key} region names must be unique`);
    for (const region of state.regions) {
      assert.match(region.name, /\S/, `${key} region name`);
      assert.ok(state.requiredSelectors.includes(region.selector), `${key} region selector must be required`);
    }
    const expectedPolicy = noPrimaryAction.has(key)
      ? 'none'
      : atMostOnePrimaryAction.has(key) ? 'at-most-one' : 'exactly-one';
    assert.equal(state.primaryActionPolicy, expectedPolicy, `${key} primary action policy`);
    if (expectedPolicy === 'exactly-one') assert.ok(state.requiredSelectors.includes('[data-primary-action]'), `${key} primary selector`);
    const expectedCaptures = longPageStates.has(key) ? ['viewport', 'full-page', 'bottom'] : ['viewport'];
    assert.deepEqual(state.screenshotPolicy.captures, expectedCaptures, `${key} screenshot policy`);
  }
});

test('login audit uses the single credential form instead of a role selector', () => {
  const states = flattenStates(readContract());
  for (const key of ['login/student', 'login/teacher']) {
    const state = states.get(key);
    assert.ok(state, key);
    assert.equal(Object.hasOwn(state.setup, 'loginRole'), false, `${key} must not model a role picker`);
    assert.ok(state.requiredSelectors.includes('.login-form-v3'), `${key} credential form`);
    assert.ok(state.requiredSelectors.includes('input[autocomplete="username"]'), `${key} username input`);
    assert.ok(state.requiredSelectors.includes('input[autocomplete="current-password"]'), `${key} password input`);
    assert.equal(
      state.requiredSelectors.some((selector) => selector.includes('data-login-role-option')),
      false,
      `${key} must not require a deleted role option`,
    );
  }
});

test('keeps exactly six direct V4 state references and resolves every derived state to them', () => {
  const contract = readContract();
  const states = flattenStates(contract);
  const references = new Map([...states].flatMap(([key, state]) => state.reference ? [[key, state.reference]] : []));
  assert.deepEqual(references, expectedReferences);

  for (const [key, state] of states) {
    const hasReference = typeof state.reference === 'string' && state.reference.length > 0;
    const hasDerivation = Array.isArray(state.derivedFrom) && state.derivedFrom.length > 0;
    assert.notEqual(hasReference, hasDerivation, `${key} must define exactly one visual source`);
    if (hasReference) {
      assert.equal(existsSync(path.join(root, state.reference)), true, `${key} reference must exist`);
      continue;
    }
    for (const sourceKey of state.derivedFrom) {
      assert.ok(expectedReferences.has(sourceKey), `${key} must derive directly from an authoritative V4 state: ${sourceKey}`);
    }
  }
});

test('uses real demo-class routes and the independent formal-assessment route', () => {
  const contractText = readFileSync(contractFile, 'utf8');
  for (const route of ['/teacher/sessions/demo-class', '/classroom/demo-class', '/present/demo-class']) {
    assert.match(contractText, new RegExp(route.replaceAll('/', '\\/')));
  }
  assert.doesNotMatch(contractText, /\/(?:teacher\/sessions|classroom|present)\/P1T1-N02/);
  assert.doesNotMatch(contractText, /\?state=formal-test/);
  assert.match(contractText, /\/learn\/P1T1-N02\/test/);
  assert.equal((contractText.match(/\?mode=challenge/g) ?? []).length, 3);
});

test('uses persisted demo prerequisites and truthful N04/portfolio terminal states', () => {
  const states = flattenStates(readContract());
  const returnedHome = states.get('student-home/P01-returned');
  assert.equal(returnedHome?.setup.currentTask, 'P01');
  assert.equal(returnedHome?.setup.outputStatus, 'returned');
  assert.ok(returnedHome?.requiredSelectors.includes('[data-student-current-task="P01"]'));
  const returnedProject = states.get('p1-project/P01-returned');
  assert.equal(returnedProject?.setup.currentTask, 'P01');
  assert.equal(returnedProject?.setup.outputStatus, 'returned');
  assert.ok(returnedProject?.requiredSelectors.includes('[data-p1-current-task="P01"]'));
  const demoProject = states.get('p1-project/demo-complete');
  assert.equal(demoProject?.setup.packageStatus, 'demo-complete');
  assert.equal(demoProject?.primaryActionPolicy, 'none');
  assert.ok(demoProject?.requiredSelectors.includes('[data-p1-portfolio-status="demo-complete"]'));

  for (const key of ['n02-p01/figure', 'n02-p02/figure', 'n02-p03/figure', 'formal-test/open']) {
    assert.equal(states.get(key)?.actor, 'stu-03', `${key} must use the seeded completed-prerequisite learner`);
  }
  const formal = states.get('formal-test/open');
  assert.ok(formal?.requiredSelectors.includes('[data-formal-assessment="P1T1-N02"]'));
  assert.ok(formal?.requiredSelectors.includes('[data-assessment-paper="P1T1-N02"]'));
  assert.equal(formal?.requiredSelectors.some((selector) => selector.includes('challenge-game-stage')), false);

  assert.equal(states.get('n04-p01/returned')?.actor, 'stu-02');
  assert.equal(states.get('n04-p01/returned')?.setup.editorState, 'revising');
  assert.ok(states.get('n04-p01/returned')?.requiredSelectors.includes('[data-output-status="returned"]'));
  for (const key of ['n04-p02/verified', 'n04-p03/verified']) {
    assert.equal(states.get(key)?.actor, 'stu-03');
    assert.ok(states.get(key)?.requiredSelectors.includes('[data-output-status="verified"]'));
  }
  const portfolio = states.get('portfolio/demo-complete');
  assert.equal(portfolio?.setup.packageStatus, 'demo-complete');
  assert.ok(portfolio?.requiredSelectors.includes('[data-p1-portfolio="demo-complete"]'));
  assert.equal(states.has('portfolio/complete'), false);
});

test('audit rejects drift in routes, mobile coverage, formal query and interaction contracts', async () => {
  const { validateImage2Contract } = await import('./audit-image2-reference.mjs');
  const contract = readContract();
  assert.deepEqual(validateImage2Contract(contract), [], 'the committed v2 contract must pass the exported validator');

  for (const mutate of [
    (candidate) => { candidate.version = 1; },
    (candidate) => { delete candidate.viewportProfiles['mobile-390']; },
    (candidate) => { stateAt(candidate, 'teacher-session/teaching').route = '/teacher/sessions/P1T1-N02'; },
    (candidate) => { stateAt(candidate, 'formal-test/open').query = '?state=formal-test'; },
    (candidate) => { stateAt(candidate, 'student-home/P01-current').primaryActionPolicy = 'none'; },
    (candidate) => { stateAt(candidate, 'n04-p02/verified').screenshotPolicy.captures = ['viewport']; },
    (candidate) => { delete candidate.interactionPolicies.keyboard; },
    (candidate) => { delete candidate.interactionPolicies.reducedMotion; },
  ]) {
    const candidate = structuredClone(contract);
    mutate(candidate);
    assert.notEqual(validateImage2Contract(candidate).length, 0, mutate.toString());
  }
});

function readContract() {
  assert.equal(existsSync(contractFile), true, 'Image2 route contract is missing');
  return JSON.parse(readFileSync(contractFile, 'utf8'));
}

function flattenStates(contract) {
  const entries = [];
  for (const surface of contract.surfaces ?? []) {
    for (const state of surface.states ?? []) entries.push([`${surface.id}/${state.id}`, state]);
  }
  return new Map(entries);
}

function stateAt(contract, key) {
  const state = flattenStates(contract).get(key);
  assert.ok(state, key);
  return state;
}

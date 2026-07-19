import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildCaptureJobs,
  evaluateImage2Layout,
  flattenImage2States,
  image2ScreenshotName,
  waitForImage2Stability,
} from './utils/image2-visual-audit.mjs';
import {
  Image2FixtureManager,
  apiResponseCanBeEmpty,
  classroomPageIntentRequest,
  classroomLessonIntentRequest,
  formalAssessmentOpenFixturePlan,
  outputStateSatisfies,
  planClassroomActivationPhases,
} from './capture-image2-implementation.mjs';

const contract = {
  version: 2,
  viewportProfiles: {
    desktop: { width: 1440, height: 900 },
    mobile: { width: 390, height: 844 },
  },
  interactionPolicies: {
    overflow: { documentTolerancePx: 1, hideDocumentOverflowAllowed: false },
  },
  surfaces: [
    {
      id: 'sample',
      states: [
        {
          id: 'ready',
          actor: 'stu-01',
          route: '/student/home',
          query: '',
          setup: { fixture: 'demo-seed' },
          viewportProfiles: ['desktop', 'mobile'],
          primaryActionPolicy: 'exactly-one',
          requiredSelectors: ['[data-sample]', '[data-primary-action]'],
          regions: [{ name: 'sample', selector: '[data-sample]' }],
          screenshotPolicy: { captures: ['viewport', 'full-page', 'bottom'] },
        },
      ],
    },
  ],
};

test('flattens the route contract and expands every viewport/capture without collisions', () => {
  const states = flattenImage2States(contract);
  assert.equal(states.length, 1);
  assert.equal(states[0].key, 'sample/ready');

  const jobs = buildCaptureJobs(contract);
  assert.equal(jobs.length, 6);
  assert.deepEqual(
    jobs.map(({ viewportId, capture }) => `${viewportId}:${capture}`),
    [
      'desktop:viewport',
      'desktop:full-page',
      'desktop:bottom',
      'mobile:viewport',
      'mobile:full-page',
      'mobile:bottom',
    ],
  );
  assert.equal(new Set(jobs.map(({ fileName }) => fileName)).size, jobs.length);
  assert.equal(
    image2ScreenshotName('sample', 'ready', 'stu-01', 'mobile', 'bottom'),
    'sample--ready--stu-01--mobile--bottom.png',
  );
  assert.equal(
    image2ScreenshotName('sample', 'ready', 'stu-01', 'mobile', 'viewport'),
    'sample--ready--stu-01--mobile.png',
  );
});

test('accepts a complete exactly-one surface at the one-pixel overflow tolerance', () => {
  const failures = evaluateImage2Layout({
    state: contract.surfaces[0].states[0],
    contract,
    profile: contract.viewportProfiles.mobile,
    observation: healthyObservation({ documentScrollWidth: 391 }),
  });
  assert.deepEqual(failures, []);
});

test('rejects hidden overflow, clipped controls, missing regions and duplicate primary actions', () => {
  const observation = healthyObservation({
    documentScrollWidth: 392,
    htmlOverflowX: 'hidden',
    bodyOverflowX: 'clip',
    primaryActions: [visibleAction(), visibleAction()],
    selectorCounts: { '[data-sample]': 0, '[data-primary-action]': 2 },
    regionRects: [{ name: 'sample', selector: '[data-sample]', count: 0, width: 0, height: 0 }],
    clickables: [{ tag: 'button', label: '继续学习', left: -4, right: 120, width: 124, height: 36, visible: true }],
  });
  const codes = evaluateImage2Layout({
    state: contract.surfaces[0].states[0],
    contract,
    profile: contract.viewportProfiles.mobile,
    observation,
  }).map(({ code }) => code);

  for (const code of [
    'document-horizontal-overflow',
    'document-overflow-hidden',
    'primary-action-count',
    'required-selector-missing',
    'required-region-missing',
    'clickable-horizontal-clipping',
  ]) assert.ok(codes.includes(code), code);
});

test('does not treat intentional internal scrollers or panned SVG nodes as document clipping', () => {
  const observation = healthyObservation({
    clickables: [
      { tag: 'button', label: '横向课程节点', left: 438, right: 574, width: 136, height: 44, visible: true, insideAllowedScroller: true, svg: false },
      { tag: 'g', label: '画布节点', left: -280, right: -150, width: 130, height: 52, visible: true, insideAllowedScroller: false, svg: true },
      { tag: 'a', label: '正常入口', left: 16, right: 374, width: 358, height: 44, visible: true, insideAllowedScroller: false, svg: false },
    ],
  });
  const failures = evaluateImage2Layout({
    state: contract.surfaces[0].states[0],
    contract,
    profile: contract.viewportProfiles.mobile,
    observation,
  });

  assert.deepEqual(failures, []);
});

test('none policy rejects disabled fake primary actions and invalid motion values', () => {
  const state = {
    ...contract.surfaces[0].states[0],
    primaryActionPolicy: 'none',
    requiredSelectors: ['[data-sample]'],
  };
  const observation = healthyObservation({
    primaryActions: [{ ...visibleAction(), enabled: false }],
    primaryActionPolicyMarkers: ['none'],
    motionValues: ['active'],
  });
  const codes = evaluateImage2Layout({
    state,
    contract,
    profile: contract.viewportProfiles.desktop,
    observation,
  }).map(({ code }) => code);
  assert.ok(codes.includes('primary-action-count'));
  assert.ok(codes.includes('motion-state-invalid'));
});

test('waits for an animation-free quiet window without weakening the running-animation gate', async () => {
  const waits = [];
  let fixedDelayCalls = 0;
  const page = {
    waitForLoadState: async () => undefined,
    evaluate: async () => undefined,
    locator: () => ({ first: () => ({ waitFor: async () => undefined }) }),
    waitForFunction: async (predicate, argument, options) => {
      waits.push({ source: String(predicate), argument, options });
    },
    waitForTimeout: async () => { fixedDelayCalls += 1; },
  };

  await waitForImage2Stability(page, { requiredSelectors: ['[data-ready]'] });

  const animationWait = waits.find(({ source }) => source.includes('getAnimations'));
  assert.ok(animationWait, 'stability must wait for document animations to settle');
  assert.match(animationWait.source, /playState\s*===\s*['"]running['"]/);
  assert.ok(animationWait.argument.quietWindowMs >= 80);
  assert.ok(animationWait.options.timeout <= 1_000);
  assert.equal(fixedDelayCalls, 0, 'a condition-based quiet window replaces the fixed delay');

  const utilitySource = readFileSync(new URL('./utils/image2-visual-audit.mjs', import.meta.url), 'utf8');
  assert.match(utilitySource, /getClientRects\(\)\.length > 0/);
  assert.match(utilitySource, /document\.images[\s\S]*window\.scrollTo\(0, Math\.min\(y, limit\)\)/);
  assert.match(utilitySource, /window\.scrollTo\(original\.x, original\.y\)/);
  assert.match(utilitySource, /overflowY[\s\S]*element\.scrollHeight > element\.clientHeight[\s\S]*scroller\.scrollTop = Math\.min/);

  const failures = evaluateImage2Layout({
    state: contract.surfaces[0].states[0],
    contract,
    profile: contract.viewportProfiles.desktop,
    observation: healthyObservation({ runningAnimations: 1 }),
  });
  assert.ok(failures.some(({ code }) => code === 'reduced-motion-running-animation'));
});

test('keeps returned, submitted, and verified output states distinct', () => {
  assert.equal(outputStateSatisfies('submitted', 'submitted'), true);
  assert.equal(outputStateSatisfies('verified', 'verified'), true);
  assert.equal(outputStateSatisfies('returned', 'returned'), true);
  assert.equal(outputStateSatisfies('verified', 'submitted'), false);
  assert.equal(outputStateSatisfies('verified', 'draft'), false);
  assert.equal(outputStateSatisfies('verified', 'returned'), false);
  assert.equal(outputStateSatisfies(undefined, 'submitted'), false);
});

test('fixture setup never forges learning events or client-reported formal scores', () => {
  const source = readFileSync(new URL('./capture-image2-implementation.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /game_completed/);
  assert.doesNotMatch(source, /score:\s*90/);
  assert.doesNotMatch(source, /\/api\/learning\/nodes\/\$\{nodePrefix\}-N02\/attempts/);
  assert.doesNotMatch(source, /needsFormalAttempt|ensureOutputAccess|learningEvent/);
  assert.match(source, /n04-p01\/returned[\s\S]*stu-02[\s\S]*P01[\s\S]*returned/);
  assert.match(source, /editorState === 'revising'[\s\S]*\[data-output-field\] textarea[\s\S]*\.fill\(/);
  assert.match(source, /n04-p02\/verified[\s\S]*stu-03[\s\S]*P02[\s\S]*verified/);
  assert.match(source, /n04-p03\/verified[\s\S]*stu-03[\s\S]*P03[\s\S]*verified/);
  assert.match(source, /const envelope = await this\.api[\s\S]*const output = envelope\?\.output/);
  assert.match(source, /portfolio\/demo-complete/);
  assert.match(source, /snapshot\?\.me\?\.project\?\.portfolioStatus/);
});

test('capture navigation does not wait for idle on continuously polled classroom surfaces', () => {
  const source = readFileSync(new URL('./capture-image2-implementation.mjs', import.meta.url), 'utf8');
  const openState = source.slice(source.indexOf('async function openState'), source.indexOf('async function', source.indexOf('async function openState') + 1));
  assert.match(openState, /waitUntil: 'domcontentloaded'/);
  assert.match(openState, /waitForLoadState\('load'\)/);
  assert.match(openState, /await waitForImage2Stability\(page, job\.state\);/);
  assert.doesNotMatch(openState, /waitForImage2Stability[\s\S]*?catch/);
  assert.doesNotMatch(openState, /networkidle/);
});

test('classroom activity fixture moves through the narrow authoritative page intent', () => {
  assert.deepEqual(classroomPageIntentRequest('demo-class', {
    activeLessonRunId: 'lesson-run-p01-l2',
    lessonState: { revision: 12 },
  }, 3), {
    route: '/api/class-sessions/demo-class/lesson',
    data: {
      lessonRunId: 'lesson-run-p01-l2',
      expectedRevision: 12,
      intent: { type: 'page_changed', pageIndex: 3 },
    },
  });
});

test('formal-test fixture reaches readiness only through canonical public learning commands', () => {
  const plan = formalAssessmentOpenFixturePlan();
  assert.equal(plan.actor, 'stu-03');
  assert.equal(plan.nodeId, 'P1T1-N02');
  assert.equal(plan.assessmentRoute, '/api/learning/nodes/P1T1-N02/assessment');
  assert.deepEqual(plan.scope, {
    activityId: 'P1T1-N01-micro-01',
    route: '/api/learning/activities/P1T1-N01-micro-01/attempts',
    data: {
      attemptId: 'image2-stu-03-P1T1-N01-micro-01',
      delivery: { channel: 'self-study' },
      response: {
        assignments: {
          'room-01-cabinets': 'in-scope',
          'shared-operator-cabinet': 'out-of-scope',
          'room-02-cabinets': 'out-of-scope',
        },
      },
    },
  });
  assert.deepEqual(plan.sections.map(({ sectionId }) => sectionId), [
    'problem', 'figure', 'steps', 'correction',
  ]);
  for (const section of plan.sections) {
    assert.deepEqual(Object.keys(section.data).sort(), ['channel', 'eventId', 'eventType', 'payload']);
    assert.equal(section.data.eventType, 'section_completed');
    assert.deepEqual(section.data.payload, { sectionId: section.sectionId, completed: true });
  }
  assert.deepEqual(plan.practices.map(({ activityId }) => activityId), [
    'P1T1-N02-foundation-01',
    'P1T1-N02-application-01',
    'P1T1-N02-transfer-01',
  ]);
  for (const practice of plan.practices) {
    assert.deepEqual(Object.keys(practice.data).sort(), ['attemptId', 'delivery', 'response']);
    assert.equal(practice.data.attemptId, `image2-stu-03-${practice.activityId}`);
    assert.deepEqual(practice.data.delivery, { channel: 'self-study' });
  }
});

test('formal-test fixture advances section events with each authoritative student version and is idempotent', async () => {
  const manager = Object.create(Image2FixtureManager.prototype);
  manager.completed = new Set();
  manager.context = async (actor) => ({ actor });
  const calls = [];
  let sectionVersion = 7;
  manager.api = async (_context, method, route, data) => {
    calls.push({ method, route, data });
    if (route.endsWith('/attempts')) return { passed: true };
    if (method === 'POST' && route.endsWith('/events')) {
      assert.equal(data.expectedVersion, sectionVersion);
      sectionVersion += 1;
      return { version: sectionVersion };
    }
    if (route === '/api/learning/me') {
      return calls.filter((call) => call.route === route).length === 1
        ? { version: sectionVersion }
        : { version: sectionVersion, nodes: [{ nodeId: 'P1T1-N02', axes: { learning: 'practice-passed' } }] };
    }
    if (route.endsWith('/assessment')) {
      return { state: 'in-progress', attemptToken: 'server-issued-token-with-enough-entropy' };
    }
    throw new Error(`Unexpected fixture call: ${method} ${route}`);
  };

  await manager.ensureFormalAssessmentOpen();
  assert.deepEqual(
    calls.filter(({ route }) => route.endsWith('/events')).map(({ data }) => data.expectedVersion),
    [7, 8, 9, 10],
  );
  assert.equal(calls.filter(({ route }) => route.endsWith('/attempts')).length, 4);
  assert.equal(calls.at(-1).route, '/api/learning/nodes/P1T1-N02/assessment');
  const callCount = calls.length;
  await manager.ensureFormalAssessmentOpen();
  assert.equal(calls.length, callCount, 'completed fixture must not replay within one audit run');
});

test('plans the shortest legal path to an active lecture classroom', () => {
  assert.deepEqual(planClassroomActivationPhases('paused', 'prepare'), ['lecture']);
  assert.deepEqual(planClassroomActivationPhases('paused', 'lecture'), ['question', 'lecture']);
  assert.deepEqual(planClassroomActivationPhases('active', 'lecture'), []);
  assert.deepEqual(planClassroomActivationPhases('active', 'question'), ['lecture']);
  assert.deepEqual(planClassroomActivationPhases('active', 'challenge'), ['review', 'lecture']);
  assert.throws(() => planClassroomActivationPhases('closed', 'lecture'), /closed classroom/i);
  assert.throws(() => planClassroomActivationPhases('active', 'close'), /closed lesson phase/i);
});

test('plans Image2 teaching cursor changes through the narrow lesson CAS endpoint', () => {
  assert.deepEqual(classroomLessonIntentRequest('demo-class', {
    activeLessonRunId: 'lesson-run-p01-l1',
    lessonState: { revision: 7 },
  }, 'lecture'), {
    route: '/api/class-sessions/demo-class/lesson',
    data: {
      lessonRunId: 'lesson-run-p01-l1',
      expectedRevision: 7,
      intent: { type: 'phase_changed', phase: 'lecture' },
    },
  });
  assert.throws(
    () => classroomLessonIntentRequest('demo-class', { lessonState: { revision: 7 } }, 'lecture'),
    /active lesson run/i,
  );
});

test('classroom fixture prepares and starts a real P01-L2 lesson before cursor intents', () => {
  const source = readFileSync(new URL('./capture-image2-implementation.mjs', import.meta.url), 'utf8');
  const fixture = source.slice(source.indexOf('async ensureClassroomFixture()'), source.indexOf('async api(', source.indexOf('async ensureClassroomFixture()')));
  assert.match(fixture, /POST', '\/api\/class-sessions\/demo-class\/lesson'/);
  assert.match(fixture, /lessonId: 'P01-L2'/);
  assert.match(fixture, /lessonRunStatus === 'preparing'/);
  assert.match(fixture, /command: \{ type: 'start' \}/);
  assert.ok(fixture.indexOf("command: { type: 'start' }") < fixture.indexOf('classroomLessonIntentRequest'));
});

test('only treats an explicit locked-route 403 as an allowed pre-unlock empty output', () => {
  assert.equal(apiResponseCanBeEmpty(404, { error: 'missing' }, { allowNull: true }), true);
  assert.equal(apiResponseCanBeEmpty(403, { routeState: 'locked' }, { allowLocked: true }), true);
  assert.equal(apiResponseCanBeEmpty(403, { routeState: 'open' }, { allowLocked: true }), false);
  assert.equal(apiResponseCanBeEmpty(403, { routeState: 'locked' }, {}), false);
  assert.equal(apiResponseCanBeEmpty(500, { routeState: 'locked' }, { allowLocked: true }), false);
});

test('restores the requested capture position after a real keyboard traversal check', () => {
  const source = readFileSync(new URL('./capture-image2-implementation.mjs', import.meta.url), 'utf8');
  assert.match(source, /page\.keyboard\.press\('Tab'\)/);
  assert.doesNotMatch(source, /primary\.focus\(/);
  assert.match(source, /keyboardFailures\([\s\S]*?positionCapture\(page, job\.capture\)/);
});

test('clears only a bounded Image2 output directory before every capture run', () => {
  const source = readFileSync(new URL('./capture-image2-implementation.mjs', import.meta.url), 'utf8');
  assert.match(source, /outputRoot = path\.resolve\(process\.cwd\(\), 'output\/playwright'\)/);
  assert.match(source, /await rm\(outDir, \{ recursive: true, force: true \}\);[\s\S]*?await mkdir\(outDir/);
});

test('captures demo-seed Image2 role homes before a classroom audit activates the shared session', () => {
  const source = readFileSync(new URL('./run-web-runtime-audits.mjs', import.meta.url), 'utf8');
  const image2Index = source.indexOf("await runAudit('image2-layout'");
  const classroomIndex = source.indexOf("await runAudit('class-session-cross-context'");

  assert.ok(image2Index >= 0, 'Image2 audit is wired');
  assert.ok(classroomIndex >= 0, 'classroom cross-context audit is wired');
  assert.ok(image2Index < classroomIndex, 'classroom activation must not pollute demo-seed home states');
});

function healthyObservation(overrides = {}) {
  return {
    actualUrl: 'http://127.0.0.1:3157/student/home',
    viewportWidth: 390,
    viewportHeight: 844,
    documentScrollWidth: 390,
    htmlOverflowX: 'visible',
    bodyOverflowX: 'visible',
    primaryActions: [visibleAction()],
    primaryActionPolicyMarkers: ['exactly-one'],
    motionValues: ['paused'],
    selectorCounts: { '[data-sample]': 1, '[data-primary-action]': 1 },
    regionRects: [{ name: 'sample', selector: '[data-sample]', count: 1, width: 300, height: 240 }],
    clickables: [{ tag: 'a', label: '继续学习', left: 16, right: 374, width: 358, height: 44, visible: true }],
    runningAnimations: 0,
    ...overrides,
  };
}

function visibleAction() {
  return { label: '继续学习', visible: true, enabled: true, left: 16, right: 374, width: 358, height: 44 };
}

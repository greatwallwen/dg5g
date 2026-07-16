import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildP0Phase1TruthClosureAudit,
  loadP0Phase1TruthClosureAudit,
  runFocusedPhase1ContractTests,
} from './audit-p0-phase1-truth-closure.mjs';

const PUBLIC_ROUTES = [
  'apps/web/src/app/platform/page.tsx',
  'apps/web/src/app/resources/page.tsx',
  'apps/web/src/app/governance/page.tsx',
  'apps/web/src/app/delivery/page.tsx',
];

test('fails closed when truth facts, public routes, and actor-owned detail routing are absent', () => {
  const audit = buildP0Phase1TruthClosureAudit({
    files: {},
    demoSeed: { base: { users: [] }, demo: {} },
    focusedTests: { passed: false, command: 'fixture', status: 1 },
  });

  assert.equal(audit.passed, false);
  assert.equal(audit.blockers.some(({ id }) => id === 'public-anonymous-routes'), true);
  assert.equal(audit.blockers.some(({ id }) => id === 'authentic-p01-activities'), true);
  assert.equal(audit.blockers.some(({ id }) => id === 'three-truthful-personas'), true);
  assert.equal(audit.blockers.some(({ id }) => id === 'actor-owned-portfolio-detail-route'), true);
  assert.equal(audit.blockers.some(({ id }) => id === 'focused-truth-contract-tests'), true);
});

test('accepts only the complete Phase1 truth closure contract', () => {
  const audit = buildP0Phase1TruthClosureAudit(completeFixture());

  assert.equal(audit.passed, true, JSON.stringify(audit.blockers, null, 2));
  assert.deepEqual(audit.blockers, []);
  assert.equal(audit.checks.length, 10);
  assert.equal(audit.checks.every(({ passed }) => passed), true);
});

test('rejects a detail route that can take student identity from the URL', () => {
  const fixture = completeFixture();
  fixture.files['apps/web/src/app/student/projects/p1/portfolio/[taskId]/page.tsx'] = `
    export default function Page({ params }) {
      return read(params.studentId, params.taskId);
    }
  `;

  const audit = buildP0Phase1TruthClosureAudit(fixture);

  assert.equal(audit.passed, false);
  assert.equal(audit.blockers.some(({ id }) => id === 'actor-owned-portfolio-detail-route'), true);
});

test('loads the repository deterministically when the focused contract runner is green', async () => {
  const audit = await loadP0Phase1TruthClosureAudit({
    repositoryRoot: new URL('../', import.meta.url),
    focusedTests: { passed: true, command: 'injected-green', status: 0 },
  });

  assert.equal(audit.passed, true, JSON.stringify(audit.blockers, null, 2));
  assert.equal(audit.schema, 'dgbook.p0-phase1-truth-closure-audit/v1');
  assert.equal(audit.checks.find(({ id }) => id === 'actor-owned-portfolio-detail-route')?.passed, true);
});

test('root package exposes one stable Phase1 audit command', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  assert.equal(
    packageJson.scripts?.['audit:p0-phase1-truth-closure'],
    'node scripts/audit-p0-phase1-truth-closure.mjs',
  );
});

test('focused Phase1 runner executes the real contracts without Windows cmd shim errors', () => {
  const result = runFocusedPhase1ContractTests({ repositoryRoot: new URL('../', import.meta.url) });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.passed, true);
});

function completeFixture() {
  const files = Object.fromEntries(PUBLIC_ROUTES.map((route) => [route, `
    export const dynamic = 'force-static';
    export default function PublicPage() { return null; }
  `]));
  files['textbook/5g/generated/p1-demo-content.json'] = JSON.stringify({
    tasks: [{
      nodes: [
        node('P1T1-N01', 'scope-classification'),
        deepNode('P1T1-N02', [
          'evidence-classification',
          'link-reconstruction',
          'structured-record',
        ]),
        node('P1T1-N03', 'four-state-judgement'),
        node('P1T1-N04', 'defective-sheet-revision'),
      ],
    }],
  });
  files['apps/web/src/app/api/learning/nodes/[nodeId]/assessment/route.ts'] = `
    function parseAnswerOnlyBody(value) {
      const record = value;
      if (Object.keys(record).length !== 1 || !Object.hasOwn(record, 'answers')) throw new TypeError();
      return record.answers;
    }
  `;
  files['apps/web/src/app/student/projects/p1/portfolio/[taskId]/page.tsx'] = `
    const actor = await requireClassRole('student');
    const taskId = parseP1PortfolioTaskId(params.taskId);
    const facts = reader.read(actor.studentId, taskId);
  `;

  const p01Fields = {
    siteRoom: 'site', collectionScope: 'scope', locationEvidence: 'v1-location',
    deviceIdentity: 'identity', endpointA: 'a', endpointB: 'b',
    connectionDirection: 'direction', photoIndex: 'photos', evidenceGap: 'v1-gap',
    riskAndReviewConclusion: 'conclusion',
  };
  const dimensions = Object.fromEntries([
    'evidenceClassification', 'linkReconstruction',
    'defectiveOutputRevision', 'professionalConclusion',
  ].map((key) => [key, { score: 25, maxScore: 25, feedback: key }]));
  const p01Evidence = Object.fromEntries(Object.keys(p01Fields).map((key) => [key, [`evidence-${key}`]]));
  const demoSeed = {
    base: {
      users: [
        { id: 'teacher-01', role: 'teacher' },
        { id: 'stu-01', role: 'student' },
        { id: 'stu-02', role: 'student' },
        { id: 'stu-03', role: 'student' },
      ],
    },
    demo: {
      events: [],
      practiceAttempts: [
        { studentId: 'stu-02' },
        { studentId: 'stu-03' },
      ],
      assessmentInstances: [],
      attempts: [
        assessment('stu-02', 'P01', dimensions),
        assessment('stu-03', 'P01', dimensions),
        assessment('stu-03', 'P02', dimensions),
        assessment('stu-03', 'P03', dimensions),
      ],
      outputs: [
        {
          outputId: 'stu2-p01', studentId: 'stu-02', taskId: 'P01', status: 'returned', currentVersion: 1,
          versions: [{ version: 1, fields: p01Fields, evidenceLinks: p01Evidence }],
        },
        {
          outputId: 'stu3-p01', studentId: 'stu-03', taskId: 'P01', status: 'verified', currentVersion: 2,
          versions: [
            { version: 1, fields: p01Fields, evidenceLinks: p01Evidence },
            {
              version: 2,
              fields: { ...p01Fields, locationEvidence: 'v2-location', evidenceGap: 'v2-gap' },
              evidenceLinks: p01Evidence,
            },
          ],
        },
        output('stu-03', 'P02'),
        output('stu-03', 'P03'),
      ],
      reviews: [
        { outputId: 'stu2-p01', status: 'returned' },
        { outputId: 'stu3-p01', status: 'verified' },
      ],
      frozenTaskScores: [
        frozen('stu-03', 'P01'), frozen('stu-03', 'P02'), frozen('stu-03', 'P03'),
      ],
    },
  };
  return {
    files,
    demoSeed,
    focusedTests: { passed: true, command: 'fixture', status: 0 },
  };
}

function practice(kind) {
  return {
    prompt: `real ${kind} material`,
    activityKind: kind,
    materials: [{ id: kind, label: kind, detail: kind }],
    interaction: { type: `${kind}-interaction` },
    targetedFeedback: { passed: 'passed', failed: 'failed' },
    correctionPath: ['retry'],
    retryable: true,
  };
}

function node(id, kind) {
  const activity = practice(kind);
  activity.id = `${id}-micro-01`;
  return { id, selfStudy: { kind: 'standard', microPractice: [activity] } };
}

function deepNode(id, kinds) {
  const foundation = practice(kinds[0]);
  const application = practice(kinds[1]);
  const transfer = practice(kinds[2]);
  foundation.id = `${id}-foundation-01`;
  application.id = `${id}-application-01`;
  transfer.id = `${id}-transfer-01`;
  return {
    id,
    selfStudy: {
      kind: 'deep',
      practices: {
        foundation: [foundation],
        application: [application],
        transfer: [transfer],
      },
    },
  };
}

function assessment(studentId, taskId, dimensions) {
  return {
    attemptId: `${studentId}-${taskId}-attempt`,
    studentId,
    nodeId: `P1T${Number(taskId.slice(2))}-N02`,
    assessmentId: `${studentId}-${taskId}-assessment`,
    questionVersion: `${taskId}-v1`,
    score: 100,
    diagnostics: {
      attemptId: `${studentId}-${taskId}-attempt`,
      assessmentId: `${studentId}-${taskId}-assessment`,
      questionVersion: `${taskId}-v1`,
      dimensions,
      totalScore: 100,
      passed: true,
      origin: 'demo',
    },
  };
}

function output(studentId, taskId) {
  return {
    outputId: `${studentId}-${taskId}`,
    studentId,
    taskId,
    status: 'verified',
    currentVersion: 1,
    versions: [{ version: 1, fields: { result: taskId }, evidenceLinks: { result: [`evidence-${taskId}`] } }],
  };
}

function frozen(studentId, taskId) {
  return {
    studentId,
    taskId,
    details: {
      source: 'demo-seed',
      nodeTestAttemptId: `${studentId}-${taskId}-attempt`,
      assessmentId: `${studentId}-${taskId}-assessment`,
      questionVersion: `${taskId}-v1`,
    },
  };
}

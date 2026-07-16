#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const AUDIT_SCHEMA = 'dgbook.p0-phase1-truth-closure-audit/v1';
const PUBLIC_ROUTE_PATHS = Object.freeze([
  'apps/web/src/app/platform/page.tsx',
  'apps/web/src/app/resources/page.tsx',
  'apps/web/src/app/governance/page.tsx',
  'apps/web/src/app/delivery/page.tsx',
]);
const GENERATED_CONTENT_PATH = 'textbook/5g/generated/p1-demo-content.json';
const ASSESSMENT_ROUTE_PATH = 'apps/web/src/app/api/learning/nodes/[nodeId]/assessment/route.ts';
const PORTFOLIO_DETAIL_ROUTE_PATH = 'apps/web/src/app/student/projects/p1/portfolio/[taskId]/page.tsx';
const P01_ACTIVITY_KINDS = Object.freeze([
  'scope-classification',
  'evidence-classification',
  'link-reconstruction',
  'structured-record',
  'four-state-judgement',
  'defective-sheet-revision',
]);
const P01_BASE_ACTIVITY_IDS = Object.freeze([
  'P1T1-N01-micro-01',
  'P1T1-N02-foundation-01',
  'P1T1-N02-application-01',
  'P1T1-N02-transfer-01',
  'P1T1-N03-micro-01',
  'P1T1-N04-micro-01',
]);
const P01_OUTPUT_FIELDS = Object.freeze([
  'siteRoom',
  'collectionScope',
  'locationEvidence',
  'deviceIdentity',
  'endpointA',
  'endpointB',
  'connectionDirection',
  'photoIndex',
  'evidenceGap',
  'riskAndReviewConclusion',
]);
const DIAGNOSIS_DIMENSIONS = Object.freeze([
  'evidenceClassification',
  'linkReconstruction',
  'defectiveOutputRevision',
  'professionalConclusion',
]);
const FORBIDDEN_GENERIC_PRACTICE_COPY = Object.freeze([
  '只凭单一现象下结论',
  '按提示补齐可复核证据',
]);
const FOCUSED_TEST_FILES = Object.freeze([
  'src/features/platform-overview/public-platform-model.test.ts',
  'src/features/learning-activities/activity-evaluator.test.ts',
  'src/platform/formal-assessment-service.test.ts',
  'src/platform/db/demo-seed.test.ts',
  'src/platform/authoritative-snapshot.test.ts',
  'src/features/portfolio/p1-portfolio-detail-model.test.ts',
  'src/features/portfolio/p1-portfolio-model.test.ts',
  'src/features/portfolio/p1-portfolio-view.test.tsx',
  'src/platform/professional-output-portfolio-reader.test.ts',
  'src/platform/p1-portfolio-detail-route.test.ts',
]);

export function buildP0Phase1TruthClosureAudit({ files = {}, demoSeed, focusedTests } = {}) {
  const checks = [];
  const addCheck = (id, passed, detail) => checks.push({ id, passed: passed === true, detail });
  const publicSources = PUBLIC_ROUTE_PATHS.map((filePath) => files[filePath]);
  const publicRoutesPresent = publicSources.every((source) => typeof source === 'string' && source.trim());
  const publicRoutesStayAnonymous = publicSources.every((source) => typeof source === 'string' && !(
    /requireClassRole|readActorFromRequest|getDatabase|LearningRepository|ProfessionalOutputRepository/u.test(source)
  ));
  addCheck(
    'public-anonymous-routes',
    publicRoutesPresent && publicRoutesStayAnonymous,
    publicRoutesPresent
      ? '四个公开页面存在，且页面入口不读取登录角色或学习数据库。'
      : `缺少公开页面：${PUBLIC_ROUTE_PATHS.filter((filePath) => !files[filePath]).join(', ')}`,
  );

  const generatedText = files[GENERATED_CONTENT_PATH];
  addCheck(
    'generic-practice-copy-zero',
    typeof generatedText === 'string'
      && FORBIDDEN_GENERIC_PRACTICE_COPY.every((copy) => !generatedText.includes(copy)),
    '生成态 P1 教材不得回退到两条固定通用练习文案。',
  );

  const generatedContent = parseJson(generatedText);
  const p01Activities = readP01Activities(generatedContent);
  addCheck(
    'authentic-p01-activities',
    sameStrings(p01Activities.map(({ activityKind }) => activityKind), P01_ACTIVITY_KINDS)
      && p01Activities.every(isAuthenticActivity),
    `P01 六类岗位活动：${p01Activities.map(({ activityKind }) => activityKind).join(', ') || '未读取'}`,
  );

  const assessmentRoute = files[ASSESSMENT_ROUTE_PATH] ?? '';
  addCheck(
    'formal-assessment-answer-only',
    assessmentRoute.includes('parseAnswerOnlyBody')
      && /Object\.keys\(record\)\.length\s*!==\s*1/u.test(assessmentRoute)
      && /Object\.hasOwn\(record,\s*['"]answers['"]\)/u.test(assessmentRoute)
      && !/Object\.hasOwn\(record,\s*['"]score['"]\)/u.test(assessmentRoute),
    '正式测试 POST 只接受 answers；伪造 score 由聚焦契约测试实测拒绝。',
  );

  const persona = inspectPersonas(demoSeed);
  addCheck('three-truthful-personas', persona.passed, persona.detail);

  const outputClosure = inspectP01OutputClosure(demoSeed);
  addCheck('p01-output-evidence-and-revision', outputClosure.passed, outputClosure.detail);

  const originClosure = inspectDemoOriginsAndFrozenScores(demoSeed);
  addCheck('demo-origin-and-frozen-scores', originClosure.passed, originClosure.detail);

  const diagnosisClosure = inspectFourDimensionDiagnosis(demoSeed);
  addCheck('four-dimension-diagnostics', diagnosisClosure.passed, diagnosisClosure.detail);

  const detailRoute = files[PORTFOLIO_DETAIL_ROUTE_PATH] ?? '';
  addCheck(
    'actor-owned-portfolio-detail-route',
    detailRoute.includes('parseP1PortfolioTaskId(params.taskId)')
      && /requireClassRole\(['"]student['"]\)/u.test(detailRoute)
      && /\.read\(actor\.studentId!?\s*,\s*taskId\)/u.test(detailRoute)
      && !/params\.studentId|searchParams|[?&]studentId=/u.test(detailRoute),
    '动态成果详情只接受 taskId，并从已登录学生 actor 派生所有权。',
  );

  addCheck(
    'focused-truth-contract-tests',
    focusedTests?.passed === true && focusedTests?.status === 0,
    focusedTests?.passed
      ? `${focusedTests.command}：通过；包含当前 assessment 隔离、伪造分数拒绝与成果详情契约。`
      : `${focusedTests?.command ?? '未执行'}：失败或缺失（status ${focusedTests?.status ?? 'unknown'}）。`,
  );

  const blockers = checks.filter(({ passed }) => !passed).map(({ id, detail }) => ({ id, detail }));
  return {
    schema: AUDIT_SCHEMA,
    passed: blockers.length === 0,
    checks,
    focusedTestFiles: [...FOCUSED_TEST_FILES],
    blockers,
  };
}

export async function loadP0Phase1TruthClosureAudit({
  repositoryRoot = process.cwd(),
  focusedTests,
} = {}) {
  const rootDirectory = resolveRoot(repositoryRoot);
  const filePaths = [
    ...PUBLIC_ROUTE_PATHS,
    GENERATED_CONTENT_PATH,
    ASSESSMENT_ROUTE_PATH,
    PORTFOLIO_DETAIL_ROUTE_PATH,
  ];
  const files = Object.fromEntries(await Promise.all(filePaths.map(async (filePath) => [
    filePath,
    await readRepositoryText(rootDirectory, filePath),
  ])));
  const demoSeed = parseJson(await readRepositoryText(rootDirectory, 'apps/web/database/demo-seed.json'));
  const testResult = focusedTests ?? runFocusedPhase1ContractTests({ repositoryRoot: rootDirectory });
  return buildP0Phase1TruthClosureAudit({ files, demoSeed, focusedTests: testResult });
}

export function runFocusedPhase1ContractTests({ repositoryRoot = process.cwd() } = {}) {
  const rootDirectory = resolveRoot(repositoryRoot);
  const executable = 'pnpm';
  const args = ['-C', 'apps/web', 'exec', 'tsx', '--test', ...FOCUSED_TEST_FILES];
  const result = spawnSync(executable, args, {
    cwd: rootDirectory,
    encoding: 'utf8',
    windowsHide: true,
    shell: process.platform === 'win32',
    maxBuffer: 16 * 1024 * 1024,
  });
  const status = result.status ?? 1;
  return {
    passed: status === 0,
    status,
    command: `pnpm -C apps/web exec tsx --test ${FOCUSED_TEST_FILES.join(' ')}`,
    stdout: tail(result.stdout),
    stderr: tail(result.stderr || result.error?.message),
  };
}

function inspectPersonas(seed) {
  const base = isRecord(seed?.base) ? seed.base : {};
  const demo = isRecord(seed?.demo) ? seed.demo : {};
  const users = array(base.users);
  const teachers = users.filter(({ role }) => role === 'teacher');
  const students = users.filter(({ role }) => role === 'student');
  const exactActors = teachers.length === 1
    && teachers[0]?.id === 'teacher-01'
    && sameStrings(students.map(({ id }) => id).sort(), ['stu-01', 'stu-02', 'stu-03']);
  const practice = array(demo.practiceAttempts);
  const attempts = array(demo.attempts);
  const outputs = array(demo.outputs);
  const events = array(demo.events);
  const studentOneIsNew = [practice, attempts, outputs, events]
    .every((facts) => facts.every(({ studentId }) => studentId !== 'stu-01'));
  const studentTwoOutput = outputs.find(({ studentId, taskId }) => studentId === 'stu-02' && taskId === 'P01');
  const studentTwoReturned = studentTwoOutput?.status === 'returned'
    && studentTwoOutput.currentVersion === 1
    && array(demo.reviews).some(({ outputId, status }) => outputId === studentTwoOutput.outputId && status === 'returned');
  const studentThreeOutputs = outputs
    .filter(({ studentId }) => studentId === 'stu-03')
    .sort((left, right) => String(left.taskId).localeCompare(String(right.taskId)));
  const studentThreeComplete = sameStrings(studentThreeOutputs.map(({ taskId }) => taskId), ['P01', 'P02', 'P03'])
    && studentThreeOutputs.every(({ status, versions }) => status === 'verified' && array(versions).length > 0)
    && ['P01', 'P02', 'P03'].every((taskId) => attempts.some(({ studentId, nodeId }) => (
      studentId === 'stu-03' && nodeId === `P1T${Number(taskId.slice(2))}-N02`
    )));
  return {
    passed: exactActors && studentOneIsNew && studentTwoReturned && studentThreeComplete,
    detail: `actor=${exactActors}; stu01-new=${studentOneIsNew}; stu02-returned=${studentTwoReturned}; stu03-P01/P02/P03=${studentThreeComplete}`,
  };
}

function inspectP01OutputClosure(seed) {
  const outputs = array(seed?.demo?.outputs);
  const output = outputs.find(({ studentId, taskId }) => studentId === 'stu-03' && taskId === 'P01');
  const versions = array(output?.versions).sort((left, right) => Number(left.version) - Number(right.version));
  const v1 = versions.find(({ version }) => version === 1);
  const v2 = versions.find(({ version }) => version === 2);
  const fields = isRecord(v2?.fields) ? v2.fields : {};
  const evidenceLinks = isRecord(v2?.evidenceLinks) ? v2.evidenceLinks : {};
  const exactFields = sameStrings(Object.keys(fields), P01_OUTPUT_FIELDS);
  const everyFieldHasEvidence = P01_OUTPUT_FIELDS.every((field) => (
    Array.isArray(evidenceLinks[field]) && evidenceLinks[field].length > 0
  ));
  const changedFields = v1 && v2 ? changedFieldKeys(v1.fields, v2.fields) : [];
  return {
    passed: output?.status === 'verified'
      && output?.currentVersion === 2
      && exactFields
      && everyFieldHasEvidence
      && sameStrings(changedFields, ['evidenceGap', 'locationEvidence']),
    detail: `ten-fields=${exactFields}; all-evidence=${everyFieldHasEvidence}; V1/V2 changed=${changedFields.join(', ') || 'none'}`,
  };
}

function inspectDemoOriginsAndFrozenScores(seed) {
  const attempts = array(seed?.demo?.attempts);
  const frozen = array(seed?.demo?.frozenTaskScores);
  const studentThreeFrozen = frozen.filter(({ studentId }) => studentId === 'stu-03');
  const valid = sameStrings(studentThreeFrozen.map(({ taskId }) => taskId), ['P01', 'P02', 'P03'])
    && studentThreeFrozen.every(({ details }) => {
      if (!isRecord(details) || details.source !== 'demo-seed') return false;
      const attempt = attempts.find(({ attemptId }) => attemptId === details.nodeTestAttemptId);
      return attempt
        && attempt.assessmentId === details.assessmentId
        && attempt.questionVersion === details.questionVersion
        && attempt.diagnostics?.origin === 'demo';
    });
  return {
    passed: valid,
    detail: `demo frozen identities=${valid ? 'P01/P02/P03 exact' : 'missing or mismatched'}`,
  };
}

function inspectFourDimensionDiagnosis(seed) {
  const attempts = array(seed?.demo?.attempts);
  const attempt = attempts.find(({ studentId, nodeId }) => studentId === 'stu-03' && nodeId === 'P1T1-N02');
  const diagnostics = isRecord(attempt?.diagnostics) ? attempt.diagnostics : {};
  const dimensions = isRecord(diagnostics.dimensions) ? diagnostics.dimensions : {};
  const exactDimensions = sameStrings(Object.keys(dimensions), DIAGNOSIS_DIMENSIONS);
  const identityMatches = diagnostics.attemptId === attempt?.attemptId
    && diagnostics.assessmentId === attempt?.assessmentId
    && diagnostics.questionVersion === attempt?.questionVersion
    && diagnostics.origin === 'demo';
  return {
    passed: exactDimensions && identityMatches,
    detail: `four-dimensions=${exactDimensions}; attempt identity=${identityMatches}`,
  };
}

function readP01Activities(content) {
  const task = array(content?.tasks)[0];
  const nodes = array(task?.nodes).filter(({ id }) => /^P1T1-N0[1-4]$/u.test(String(id)));
  const activities = nodes.flatMap(({ selfStudy }) => {
    if (selfStudy?.kind === 'standard') return array(selfStudy.microPractice);
    if (selfStudy?.kind === 'deep') {
      return ['foundation', 'application', 'transfer'].flatMap((level) => array(selfStudy.practices?.[level]));
    }
    return [];
  });
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  return P01_BASE_ACTIVITY_IDS.map((activityId) => byId.get(activityId)).filter(Boolean);
}

function isAuthenticActivity(activity) {
  return typeof activity?.activityKind === 'string'
    && typeof activity?.prompt === 'string'
    && activity.prompt.trim().length > 0
    && array(activity.materials).length > 0
    && typeof activity?.interaction?.type === 'string'
    && typeof activity?.targetedFeedback?.passed === 'string'
    && typeof activity?.targetedFeedback?.failed === 'string'
    && array(activity.correctionPath).length > 0
    && activity.retryable === true;
}

function changedFieldKeys(left, right) {
  const leftRecord = isRecord(left) ? left : {};
  const rightRecord = isRecord(right) ? right : {};
  return [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])]
    .filter((key) => JSON.stringify(leftRecord[key]) !== JSON.stringify(rightRecord[key]))
    .sort();
}

function sameStrings(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(text) {
  if (typeof text !== 'string') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function resolveRoot(value) {
  return path.resolve(value instanceof URL ? fileURLToPath(value) : value);
}

async function readRepositoryText(rootDirectory, relativePath) {
  try {
    return await readFile(path.join(rootDirectory, ...relativePath.split('/')), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  }
}

function tail(value, maximum = 4_000) {
  const text = String(value ?? '');
  return text.length <= maximum ? text : text.slice(-maximum);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const audit = await loadP0Phase1TruthClosureAudit({ repositoryRoot: process.cwd() });
    process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
    process.exitCode = audit.passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

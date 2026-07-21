import assert from 'node:assert/strict';
import test from 'node:test';
import { loadP1DemoContent } from '../platform/p1-content.ts';

const deepNodeIds = ['P1T1-N02', 'P1T2-N02', 'P1T3-N02'] as const;
const deepFigureKinds = {
  'P1T1-N02': 'topology',
  'P1T2-N02': 'antenna',
  'P1T3-N02': 'complaint',
} as const;
const standardNodeIds = [
  'P1T1-N01', 'P1T1-N03', 'P1T1-N04',
  'P1T2-N01', 'P1T2-N03', 'P1T2-N04',
  'P1T3-N01', 'P1T3-N03', 'P1T3-N04',
] as const;

const generated = loadP1DemoContent();

test('the three N02 nodes meet the deep self-study content cardinalities', () => {
  const violations = deepNodeIds.flatMap((nodeId) => deepContentViolations(
    nodeId,
    contentRecord(nodeId),
  ));

  assert.deepEqual(violations, []);
});

test('the other nine P1 nodes meet the standard self-study content contract', () => {
  const violations = standardNodeIds.flatMap((nodeId) => standardContentViolations(
    nodeId,
    contentRecord(nodeId),
  ));

  assert.deepEqual(violations, []);
});

test('student-facing P1 copy avoids internal field names and unsupported engineering conclusions', () => {
  const p1 = JSON.stringify(generated);
  for (const forbidden of [
    '服务端规则',
    '字段标识',
    'objectId',
    'fieldName',
    'photoIds',
    '对象主键',
    'siteCoordinate',
    'sectorIds',
    'rootCauseHypothesis',
    '当前运行条件可交付',
    '允许范围内',
    '按安全规程记录供电值',
    '汇入',
    '专业成果',
  ]) {
    assert.doesNotMatch(p1, new RegExp(forbidden), forbidden);
  }

  const n03 = JSON.stringify(contentRecord('P1T1-N03'));
  assert.match(n03, /授权/);
  assert.match(n03, /阈值|设备手册|现场规程/);
  assert.match(n03, /待复核/);

  const n04TemplateKeys = Object.keys(record(contentRecord('P1T1-N04').nodeRecordTemplate));
  assert.ok(n04TemplateKeys.length > 0);
  for (const key of n04TemplateKeys) assert.doesNotMatch(key, /objectId|fieldName|photoIds/);
});

test('P1 standard nodes carry the new safety and figure constraints from the walkthrough audit', () => {
  const n01Figure = record(contentRecord('P1T1-N01').relationshipFigure);
  assert.equal(n01Figure.kind, 'indoor-scope-boundary');

  const n02 = JSON.stringify(contentRecord('P1T1-N02'));
  assert.match(n02, /前传接口/);
  assert.doesNotMatch(n02, /eCPRI\/CPRI/);

  for (const nodeId of ['P1T2-N01', 'P1T2-N02', 'P1T2-N03', 'P1T2-N04', 'P1T3-N01', 'P1T3-N02', 'P1T3-N03', 'P1T3-N04']) {
    const node = JSON.stringify(contentRecord(nodeId));
    assert.match(node, /授权|允许采集|现场负责人/, `${nodeId} must explain authorization boundary`);
    assert.match(node, /安全|不拆|不进入|不接触/, `${nodeId} must explain test safety`);
    assert.match(node, /隐私|脱敏|测试SIM|测试 SIM/, `${nodeId} must explain privacy or test SIM boundary`);
    assert.match(node, /案例数据不等于行业统一阈值|教师给定阈值|现场规程/, `${nodeId} must explain threshold source`);
  }
});

function deepContentViolations(nodeId: string, content: JsonRecord): string[] {
  const violations: string[] = [];
  atLeast(violations, nodeId, 'caseBackground', nonEmptyStrings(content.caseBackground).length, 1);
  if (!nonEmpty(content.taskQuestion)) violations.push(`${nodeId}: taskQuestion must be non-empty`);
  atLeast(violations, nodeId, 'prerequisites', nonEmptyStrings(content.prerequisites).length, 1);
  atLeast(violations, nodeId, 'glossary', array(content.glossary).filter(hasTermDefinition).length, 3);
  const figures = array(content.annotatedFigures).filter(isRecord);
  atLeast(violations, nodeId, 'annotatedFigures', figures.length, 1);
  const expectedFigureKind = deepFigureKinds[nodeId as keyof typeof deepFigureKinds];
  if (!figures.some((figure) => (
    figure.kind === expectedFigureKind
    && nonEmptyStrings(figure.evidenceLabels).length > 0
  ))) {
    violations.push(`${nodeId}: annotatedFigures must include one labelled ${expectedFigureKind} figure`);
  }
  atLeast(violations, nodeId, 'evidenceRules', array(content.evidenceRules).filter(hasEvidenceRule).length, 1);
  atLeast(violations, nodeId, 'reasoningSteps', nonEmptyStrings(content.reasoningSteps).length, 4);
  atLeast(violations, nodeId, 'examples', array(content.examples).filter(isCompleteExample).length, 2);

  const counterexamples = array(content.counterexamples).filter(isRecord);
  atLeast(violations, nodeId, 'counterexamples', counterexamples.length, 2);
  atLeast(
    violations,
    nodeId,
    'counterexamples with correction paths',
    counterexamples.filter((item) => nonEmptyStrings(item.correctionPath).length > 0).length,
    2,
  );

  const practices = record(content.practices);
  for (const level of ['foundation', 'application', 'transfer'] as const) {
    atLeast(violations, nodeId, `practices.${level}`, array(practices[level]).filter(isRecord).length, 1);
  }

  const transferTask = record(content.transferTask);
  if (!nonEmpty(transferTask.scenario) || !nonEmpty(transferTask.deliverable)) {
    violations.push(`${nodeId}: transferTask scenario and deliverable must be non-empty`);
  }
  atLeast(
    violations,
    nodeId,
    'transferTask.successCriteria',
    nonEmptyStrings(transferTask.successCriteria).length,
    1,
  );

  const rubric = array(content.rubric).filter(isRecord);
  const rubricTotal = rubric.reduce(
    (sum, item) => sum + (typeof item.maxScore === 'number' ? item.maxScore : 0),
    0,
  );
  if (rubric.length === 0 || rubric.some((item) => !nonEmpty(item.criterion))) {
    violations.push(`${nodeId}: rubric must contain named criteria`);
  }
  if (rubricTotal !== 100) violations.push(`${nodeId}: rubric total expected 100, received ${rubricTotal}`);
  if (Object.keys(record(content.outputTemplate)).length === 0) {
    violations.push(`${nodeId}: outputTemplate must be a non-empty structured object`);
  }

  return violations;
}

function standardContentViolations(nodeId: string, content: JsonRecord): string[] {
  const violations: string[] = [];
  atLeast(violations, nodeId, 'caseBackground', nonEmptyStrings(content.caseBackground).length, 1);
  atLeast(violations, nodeId, 'glossary', array(content.glossary).filter(hasTermDefinition).length, 3);

  const relationshipFigure = record(content.relationshipFigure);
  if (!nonEmpty(relationshipFigure.kind) || nonEmptyStrings(relationshipFigure.evidenceLabels).length === 0) {
    violations.push(`${nodeId}: relationshipFigure must be one labelled figure`);
  }

  atLeast(violations, nodeId, 'reasoningSteps', nonEmptyStrings(content.reasoningSteps).length, 3);

  const example = record(content.example);
  if (nonEmptyStrings(example.evidence).length === 0 || !nonEmpty(example.conclusion)) {
    violations.push(`${nodeId}: example must contain evidence and a conclusion`);
  }

  const counterexample = record(content.counterexample);
  if (!nonEmpty(counterexample.error) || nonEmptyStrings(counterexample.correctionPath).length === 0) {
    violations.push(`${nodeId}: counterexample must contain an error and correction path`);
  }

  const practices = array(content.microPractice).filter(isRecord);
  atLeast(violations, nodeId, 'retryable microPractice', practices.filter(isRetryablePractice).length, 1);
  if (!practices.some(hasFeedbackAndCorrection)) {
    violations.push(`${nodeId}: microPractice feedback and correction must be non-empty`);
  }

  if (Object.keys(record(content.nodeRecordTemplate)).length === 0) {
    violations.push(`${nodeId}: nodeRecordTemplate must be a non-empty structured object`);
  }

  return violations;
}

function contentRecord(nodeId: string): JsonRecord {
  const node = generated.tasks.flatMap((task) => task.nodes)
    .find((candidate) => candidate.id === nodeId);
  return record(node?.selfStudy);
}

function hasTermDefinition(value: unknown): boolean {
  const item = record(value);
  return nonEmpty(item.term) && nonEmpty(item.definition);
}

function hasEvidenceRule(value: unknown): boolean {
  const item = record(value);
  return nonEmpty(item.claim)
    && nonEmptyStrings(item.requiredEvidence).length > 0
    && nonEmpty(item.reason);
}

function isCompleteExample(value: unknown): boolean {
  const item = record(value);
  return nonEmpty(item.title)
    && nonEmptyStrings(item.evidence).length > 0
    && nonEmptyStrings(item.reasoning).length > 0
    && nonEmpty(item.conclusion);
}

function isRetryablePractice(value: JsonRecord): boolean {
  return value.retryable === true;
}

function hasFeedbackAndCorrection(value: JsonRecord): boolean {
  return nonEmpty(value.feedback) && nonEmptyStrings(value.correctionPath).length > 0;
}

function atLeast(
  violations: string[],
  nodeId: string,
  field: string,
  actual: number,
  minimum: number,
): void {
  if (actual < minimum) violations.push(`${nodeId}: ${field} expected >=${minimum}, received ${actual}`);
}

function nonEmptyStrings(value: unknown): string[] {
  return array(value).filter((item): item is string => nonEmpty(item));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormalAssessmentResult } from '../features/formal-assessment/formal-assessment-result.tsx';

test('independent assessment page authenticates and gates the node before issuing a paper', () => {
  const source = read('app/learn/[nodeId]/test/page.tsx');
  const auth = source.indexOf("requireClassRole('student')");
  const gate = source.indexOf('requireNodeAccess(actor, params.nodeId)');
  const issue = source.indexOf('issuePaper(actor, params.nodeId)');
  assert.ok(auth >= 0);
  assert.ok(gate > auth);
  assert.ok(issue > gate);
});

test('assessment client submits only answers and contains no server grading material', () => {
  const client = read('features/formal-assessment/formal-assessment-client.tsx');
  const result = read('features/formal-assessment/formal-assessment-result.tsx');
  const page = read('app/learn/[nodeId]/test/page.tsx');
  assert.match(client, /body:\s*JSON\.stringify\(\{ answers \}\)/);
  assert.match(client, /'x-assessment-token':\s*issued\.attemptToken/);
  for (const forbidden of ['correct:', 'targetId:', 'modelAnswer']) {
    assert.equal(`${client}\n${result}\n${page}`.includes(forbidden), false, forbidden);
  }
});

test('assessment client uses native uncontrolled selectors so real radio and checkbox clicks persist', () => {
  const client = read('features/formal-assessment/formal-assessment-client.tsx');
  assert.match(client, /new FormData\(event\.currentTarget\)/);
  assert.match(client, /name="evidenceClassification"/);
  assert.match(client, /name="linkReconstruction"/);
  assert.match(client, /name="defectiveOutputRevision"/);
  assert.doesNotMatch(client, /checked=\{/);
});

test('public assessment contract is isolated from the server-private grading catalog', () => {
  const client = read('features/formal-assessment/formal-assessment-client.tsx');
  const contract = read('platform/formal-assessment-contract.ts');
  const privateCatalog = read('platform/formal-assessment-catalog.server.ts');
  assert.match(client, /from '@\/platform\/formal-assessment-contract'/);
  for (const key of [
    'acceptedOptionIds',
    'orderedOptionIds',
    'requiredOptionIds',
    'forbiddenOptionIds',
    'conclusionCriteria',
  ]) {
    assert.equal(contract.includes(key), false, key);
    assert.equal(client.includes(key), false, key);
    assert.equal(privateCatalog.includes(key), true, key);
  }
});

test('failed result renders every dimension and a concrete targeted relearning link', () => {
  const markup = renderToStaticMarkup(<FormalAssessmentResult result={{
    assessmentId: 'assessment-1',
    attemptId: 'attempt-1',
    nodeId: 'P1T1-N02',
    questionVersion: 'p01-n02-v1',
    totalScore: 55,
    passed: false,
    dimensions: {
      evidenceClassification: {
        score: 0,
        maxScore: 25,
        feedback: '需要复核证据分类。',
        remediationTarget: { nodeId: 'P1T1-N02', sectionId: 'evidence' },
      },
      linkReconstruction: { score: 15, maxScore: 25, feedback: '需要复核链路。' },
      defectiveOutputRevision: { score: 20, maxScore: 25, feedback: '修订基本完整。' },
      professionalConclusion: { score: 20, maxScore: 25, feedback: '结论基本完整。' },
    },
    remediationTargets: [{ nodeId: 'P1T1-N02', sectionId: 'evidence' }],
    origin: 'user',
    completedAt: '2026-07-16T10:00:00.000Z',
    version: 2,
    globalVersion: 3,
    paper: {
      nodeId: 'P1T1-N02',
      title: '正式测试',
      questionVersion: 'p01-n02-v1',
      passScore: 80,
      durationMinutes: 15,
      questions: [],
    },
  }} />);
  assert.match(markup, /证据分类/);
  assert.match(markup, /链路重建/);
  assert.match(markup, /成果修订/);
  assert.match(markup, /职业结论/);
  assert.match(markup, /href="\/learn\/P1T1-N02\?section=evidence"/);
});

test('P01 formal challenge enters the independent assessment instead of a client-scored game', () => {
  const source = read('features/textbook-scene/challenge-scene.tsx');
  assert.match(source, /\/learn\/\$\{unit\.capabilityNodeId\}\/test/);
  assert.doesNotMatch(source, /<EduGamePracticePanel/);
  assert.doesNotMatch(source, /最多三次|三次正式机会/);
});

test('classroom formal-test workspace hands students to the same server-graded assessment', () => {
  const source = read('features/classroom/student-formal-test-workspace.tsx');
  assert.match(source, /\/learn\/\$\{nodeId\}\/test/);
  assert.doesNotMatch(source, /<EduGamePracticePanel/);
  assert.doesNotMatch(source, /最多提交三次|Math\.min\(3/);
});

test('retired embedded game cannot reintroduce client scoring or a permanent attempt cap', () => {
  const source = read('features/learning/edugame-practice-panel.tsx');
  assert.match(source, /\/learn\/\$\{nodeId\}\/test/);
  assert.doesNotMatch(source, /recordSkillEvent|score:\s*nextRecord\.score|Math\.min\(3|attemptsExhausted/);
});

test('formal assessment owns a responsive engineering workspace stylesheet', () => {
  const styles = read('app/formal-assessment.css');
  const layout = read('app/layout.tsx');
  assert.match(layout, /import '\.\/formal-assessment\.css'/);
  for (const selector of [
    '.formal-assessment-page',
    '.formal-assessment-paper',
    '.formal-assessment-dimensions',
    '.formal-assessment-entry',
    '@media (max-width: 760px)',
  ]) assert.equal(styles.includes(selector), true, selector);
});

function read(path: string): string {
  const sourceRoot = existsSync(resolve(process.cwd(), 'apps/web/src'))
    ? resolve(process.cwd(), 'apps/web/src')
    : resolve(process.cwd(), 'src');
  return readFileSync(resolve(sourceRoot, path), 'utf8');
}

import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import type { ProfessionalOutputEnvelope } from '../../platform/learning-command-service.ts';
import type {
  ProfessionalOutputAggregate,
  ProfessionalOutputStatus,
} from '../../platform/professional-output-repository.ts';
import { p01EvidenceLibrary } from './evidence-library.ts';
import { p01OutputFieldKeys } from './p01-output-definition.ts';
import { loadSelfStudyCatalog } from '../textbook-scene/self-study-content.ts';
import { professionalOutputSchemaForTask } from './output-schema.ts';
import {
  createProfessionalOutputClient,
  ProfessionalOutputForm,
  projectProfessionalOutputFormState,
} from './professional-output-form.tsx';
import * as outputFormModule from './professional-output-form.tsx';

Object.assign(globalThis, { React });

test('persisted P01 values override prefill while both persisted and derived sources remain visible', () => {
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01');
  const output = aggregate('draft', 0, [], {
    siteRoom: '学生核对后的 HY-01 / 01号机房',
  }, {
    siteRoom: ['P01-EV-ROOM-OVERVIEW'],
  }, [{
    fieldKey: 'siteRoom',
    sourceNodeId: 'P1T1-N02',
    sourceAttemptId: 'persisted-attempt',
  }]);
  const state = projectProfessionalOutputFormState(schema, envelope(output, {
    siteRoom: {
      value: '自动预填机房',
      sources: [{ sourceNodeId: 'P1T1-N01', sourceAttemptId: 'prefill-attempt' }],
    },
    collectionScope: {
      value: '自动预填采集范围',
      sources: [{ sourceNodeId: 'P1T1-N01', sourceAttemptId: 'prefill-attempt' }],
    },
  }));

  assert.equal(state.fields.siteRoom, '学生核对后的 HY-01 / 01号机房');
  assert.equal(state.fields.collectionScope, '自动预填采集范围');
  assert.deepEqual(state.evidenceLinks, { siteRoom: ['P01-EV-ROOM-OVERVIEW'] });
  assert.deepEqual(state.fieldSources.filter(({ fieldKey }) => fieldKey === 'siteRoom'), [
    { fieldKey: 'siteRoom', sourceNodeId: 'P1T1-N01', sourceAttemptId: 'prefill-attempt' },
    { fieldKey: 'siteRoom', sourceNodeId: 'P1T1-N02', sourceAttemptId: 'persisted-attempt' },
  ]);
  assert.equal(state.workflow.state, 'editing');
  assert.equal(state.readOnly, false);
});

test('all six persisted workflow states render exact event-derived labels and read-only policy', () => {
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01');
  const cases: Array<{
    output: ProfessionalOutputAggregate;
    workflow: string;
    label: string;
    readOnly: boolean;
  }> = [
    { output: aggregate('draft', 0), workflow: 'editing', label: '编辑中', readOnly: false },
    { output: aggregate('submitted', 1), workflow: 'submitted', label: '已提交', readOnly: true },
    { output: aggregate('returned', 1, [returnedReview()]), workflow: 'returned', label: '教师退回', readOnly: false },
    { output: aggregate('draft', 1, [returnedReview()]), workflow: 'revising', label: '修订中', readOnly: false },
    { output: aggregate('submitted', 2, [returnedReview()]), workflow: 'resubmitted', label: '再次提交', readOnly: true },
    { output: aggregate('verified', 1, [verifiedReview()]), workflow: 'verified', label: '教师确认', readOnly: true },
  ];

  for (const item of cases) {
    const html = renderToStaticMarkup(createElement(ProfessionalOutputForm, {
      schema,
      upstreamRefs: [],
      initialEnvelope: envelope(item.output),
    }));
    assert.match(html, new RegExp(`data-output-workflow="${item.workflow}"`), item.workflow);
    assert.match(html, new RegExp(item.label), item.workflow);
    assert.match(html, new RegExp(`data-output-readonly="${item.readOnly}"`), item.workflow);
    if (item.readOnly) assert.doesNotMatch(html, /data-primary-action="true"/, item.workflow);
  }
});

test('N04 labels demo workflow state and teacher feedback while user output stays unlabelled', () => {
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01');
  const demoReview = { ...returnedReview(), origin: 'demo' as const };
  const render = (origin: 'demo' | 'user') => renderToStaticMarkup(createElement(ProfessionalOutputForm, {
    schema,
    upstreamRefs: [],
    initialEnvelope: envelope(aggregate(
      'returned', 1, [origin === 'demo' ? demoReview : returnedReview()],
      completeFields(), {}, [], origin,
    )),
  }));

  const demo = render('demo');
  assert.match(demo, /data-output-origin="demo"/);
  assert.match(demo, /<dd>教师退回 · 演示数据<\/dd>/);
  assert.match(demo, /<strong>教师退回修订 · 演示数据<\/strong>/);

  const user = render('user');
  assert.match(user, /data-output-origin="user"/);
  assert.doesNotMatch(user, /演示数据/);
});

test('the exact ten P01 fields show source chips and whitelisted built-in evidence preview/remove controls', () => {
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01');
  const output = aggregate('draft', 0, [], completeFields(), {
    siteRoom: ['P01-EV-ROOM-OVERVIEW'],
  }, [{
    fieldKey: 'siteRoom', sourceNodeId: 'P1T1-N01', sourceAttemptId: 'scope-attempt',
  }]);
  const html = renderToStaticMarkup(createElement(ProfessionalOutputForm, {
    schema,
    upstreamRefs: [],
    initialEnvelope: envelope(output),
  }));

  assert.equal((html.match(/data-output-field=/g) ?? []).length, 10);
  for (const fieldKey of p01OutputFieldKeys) assert.match(html, new RegExp(`data-output-field="${fieldKey}"`));
  assert.match(html, /data-output-source="P1T1-N01:scope-attempt"/);
  assert.match(html, /data-evidence-picker="siteRoom"/);
  assert.match(html, /P01-EV-ROOM-OVERVIEW/);
  assert.match(html, /HY-01机房与采集环境全景/);
  assert.match(html, /href="\/media\/5g\/image29.png"/);
  assert.match(html, /data-evidence-remove="P01-EV-ROOM-OVERVIEW"/);
  assert.doesNotMatch(html, /type="file"|上传证据/);
  assert.doesNotMatch(html, /P01-EV-BBU-NAMEPLATE[^]*data-evidence-picker="siteRoom"/);
  assert.doesNotMatch(html, /字段标识|服务端/);
  assert.match(html, /填写提示|挂接证据/);
});

test('returned edits project revising immediately and evidence edits are included as semantic revision', () => {
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01');
  const returned = projectProfessionalOutputFormState(
    schema,
    envelope(aggregate('returned', 1, [returnedReview()], completeFields())),
  );
  assert.equal(returned.workflow.state, 'returned');

  const reviseProfessionalOutputField = (
    outputFormModule as typeof outputFormModule & {
      reviseProfessionalOutputField: (state: typeof returned, key: string, value: string) => typeof returned;
    }
  ).reviseProfessionalOutputField;
  const reviseProfessionalOutputEvidence = (
    outputFormModule as typeof outputFormModule & {
      reviseProfessionalOutputEvidence: (state: typeof returned, key: string, ids: string[]) => typeof returned;
    }
  ).reviseProfessionalOutputEvidence;
  assert.equal(typeof reviseProfessionalOutputField, 'function');
  assert.equal(typeof reviseProfessionalOutputEvidence, 'function');

  const fieldRevision = reviseProfessionalOutputField(returned, 'connectionDirection', 'BBU → ODF → AAU');
  assert.equal(fieldRevision.workflow.state, 'revising');
  assert.equal(fieldRevision.fields.connectionDirection, 'BBU → ODF → AAU');

  const evidenceRevision = reviseProfessionalOutputEvidence(
    returned,
    'connectionDirection',
    ['P01-EV-ODF-PATH'],
  );
  assert.equal(evidenceRevision.workflow.state, 'revising');
  assert.deepEqual(evidenceRevision.evidenceLinks.connectionDirection, ['P01-EV-ODF-PATH']);
});

test('an empty unsubmitted envelope remains editing and never renders achieved or teacher-confirmed copy', () => {
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01');
  const html = renderToStaticMarkup(createElement(ProfessionalOutputForm, {
    schema,
    upstreamRefs: [],
    initialEnvelope: envelope(null),
  }));
  assert.match(html, /data-output-workflow="editing"/);
  assert.match(html, /编辑中/);
  assert.doesNotMatch(html, /能力达成|教师确认|成果已认证/);
  assert.match(html, /data-primary-action="true"[^>]*disabled/);
});

test('the client uses one envelope read and sends evidence links on draft and submit commands', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const draftEnvelope = envelope(aggregate('draft', 0));
  const draft = draftEnvelope.output!;
  const submitted = aggregate('submitted', 1);
  const responses = [draftEnvelope, draft, submitted];
  const client = createProfessionalOutputClient('P01', async (input, init) => {
    calls.push({ url: String(input), ...(init ? { init } : {}) });
    return Response.json(responses.shift());
  });
  const fields = completeFields();
  const evidenceLinks = { siteRoom: ['P01-EV-ROOM-OVERVIEW'] };

  assert.equal((await client.read()).output?.head.taskId, 'P01');
  assert.equal((await client.saveDraft({
    expectedStateRevision: 0, fields, upstreamRefs: [], evidenceLinks,
  })).head.status, 'draft');
  assert.equal((await client.submit({
    outputId: 'output-p01', expectedStateRevision: 1, fields, upstreamRefs: [], evidenceLinks,
  })).head.status, 'submitted');
  assert.deepEqual(calls.map(({ url, init }) => ({
    url,
    method: init?.method,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  })), [
    { url: '/api/outputs/P01', method: undefined, body: undefined },
    {
      url: '/api/outputs/P01/draft', method: 'POST',
      body: { expectedStateRevision: 0, fields, upstreamRefs: [], evidenceLinks },
    },
    {
      url: '/api/outputs/P01/submit', method: 'POST',
      body: { outputId: 'output-p01', expectedStateRevision: 1, fields, upstreamRefs: [], evidenceLinks },
    },
  ]);
});

function envelope(
  output: ProfessionalOutputAggregate | null,
  prefill: ProfessionalOutputEnvelope['prefill'] = {},
): ProfessionalOutputEnvelope {
  return { output, prefill, evidenceLibrary: p01EvidenceLibrary };
}

function aggregate(
  status: ProfessionalOutputStatus,
  submissionCount: number,
  reviewHistory: ProfessionalOutputAggregate['reviewHistory'] = [],
  fields: Record<string, string> = completeFields(),
  evidenceLinks: Record<string, string[]> = {},
  fieldSources: ProfessionalOutputAggregate['versions'][number]['fieldSources'] = [],
  origin: 'demo' | 'user' = 'user',
): ProfessionalOutputAggregate {
  return {
    head: {
      outputId: 'output-p01', studentId: 'stu-01', taskId: 'P01',
      currentVersion: 1, stateRevision: status === 'draft' ? 1 : 2, status, origin,
    },
    versions: [{
      outputId: 'output-p01', taskId: 'P01', version: 1, schemaVersion: 1,
      fields, upstreamRefs: [], evidenceLinks, fieldSources,
    }],
    submissionCount,
    reviewHistory,
  };
}

function completeFields(): Record<string, string> {
  return Object.fromEntries(p01OutputFieldKeys.map((key) => [key, `已填写：${key}`]));
}

function returnedReview(): ProfessionalOutputAggregate['reviewHistory'][number] {
  return {
    reviewId: 'review-returned', reviewerId: 'teacher-01', status: 'returned',
    feedback: '补齐连接方向证据', reviewedAt: '2026-07-16T08:00:00.000Z',
    outputVersion: 1, origin: 'user',
  };
}

function verifiedReview(): ProfessionalOutputAggregate['reviewHistory'][number] {
  return {
    reviewId: 'review-verified', reviewerId: 'teacher-01', status: 'verified',
    score: 90, feedback: '成果证据完整', reviewedAt: '2026-07-16T09:00:00.000Z',
    outputVersion: 1, origin: 'user',
  };
}

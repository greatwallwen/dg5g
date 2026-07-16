import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import type { ProfessionalOutputAggregate } from '../../platform/professional-output-repository.ts';
import { loadSelfStudyCatalog } from '../textbook-scene/self-study-content.ts';
import { professionalOutputSchemaForTask } from './output-schema.ts';
import {
  createProfessionalOutputClient,
  ProfessionalOutputForm,
  projectProfessionalOutputFormState,
} from './professional-output-form.tsx';

Object.assign(globalThis, { React });

test('a persisted draft restores its current immutable version while submitted output becomes read-only', () => {
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P02');
  const fields = Object.fromEntries(schema.fields.map(({ key, label }) => [key, `草稿：${label}`]));
  const draft = aggregate('draft', fields);

  assert.deepEqual(projectProfessionalOutputFormState(schema, draft), {
    fields,
    outputId: 'output-p02',
    currentVersion: 2,
    stateRevision: 4,
    status: 'draft',
    readOnly: false,
  });
  assert.equal(projectProfessionalOutputFormState(schema, {
    ...draft,
    head: { ...draft.head, status: 'submitted' },
  }).readOnly, true);

  function aggregate(
    status: ProfessionalOutputAggregate['head']['status'],
    versionFields: Record<string, string>,
  ): ProfessionalOutputAggregate {
    return {
      head: {
        outputId: 'output-p02',
        studentId: 'stu-01',
        taskId: 'P02',
        currentVersion: 2,
        stateRevision: 4,
        status,
      },
      versions: [{
        outputId: 'output-p02',
        taskId: 'P02',
        version: 2,
        schemaVersion: 1,
        fields: versionFields,
        upstreamRefs: [{ outputId: 'output-p01', version: 1 }],
        evidenceLinks: {},
        fieldSources: [],
      }],
      submissionCount: status === 'submitted' ? 1 : 0,
      reviewHistory: [],
    };
  }
});

test('submitted output renders generated fields read-only with immutable version and state revision', () => {
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01');
  const submitted = outputAggregate('submitted', 2);
  const html = renderToStaticMarkup(createElement(ProfessionalOutputForm, {
    schema,
    upstreamRefs: [],
    initialOutput: submitted,
  }));

  assert.match(html, /已提交 · 等待教师复核/);
  assert.match(html, /data-output-version="1"/);
  assert.match(html, /data-output-revision="2"/);
  assert.equal((html.match(/已提交 · 等待教师复核/g) ?? []).length, 2);
  assert.match(html, /readonly=""/);
  assert.doesNotMatch(html, /professional-output-actions/);
  assert.equal((html.match(/data-primary-action=/g) ?? []).length, 0);
  assert.doesNotMatch(html, /保存草稿|提交教师复核/);
});

test('editable and returned outputs expose submit as the only primary action', () => {
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01');
  for (const initialOutput of [null, outputAggregate('returned', 3)]) {
    const html = renderToStaticMarkup(createElement(ProfessionalOutputForm, {
      schema,
      upstreamRefs: [],
      initialOutput,
    }));
    assert.match(html, /class="professional-output-actions"/);
    assert.equal((html.match(/data-primary-action="true"/g) ?? []).length, 1);
    assert.match(html, /data-primary-action="true"[^>]*type="submit"/);
    assert.doesNotMatch(html, /data-primary-action="true"[^>]*>[^<]*保存草稿/);
  }
});

test('every output field keeps a stable marker and real textarea semantics', () => {
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P03');
  const html = renderToStaticMarkup(createElement(ProfessionalOutputForm, {
    schema,
    upstreamRefs: [{ outputId: 'output-p02', version: 1 }],
    initialOutput: null,
  }));
  assert.equal((html.match(/data-output-field=/g) ?? []).length, schema.fields.length);
  assert.equal((html.match(/<textarea/g) ?? []).length, schema.fields.length);
});

test('the form client keeps draft save and final submit as separate actor-scoped commands', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const draft = outputAggregate('draft', 1);
  const submitted = outputAggregate('submitted', 2);
  const responses = [draft, submitted];
  const client = createProfessionalOutputClient('P01', async (input, init) => {
    calls.push({ url: String(input), ...(init ? { init } : {}) });
    return Response.json(responses.shift());
  });
  const fields = { stationAndRoom: '海河路站 / 01号机房' };

  assert.equal((await client.saveDraft({
    expectedStateRevision: 0,
    fields,
    upstreamRefs: [],
  })).head.status, 'draft');
  assert.equal((await client.submit({
    outputId: 'output-p01',
    expectedStateRevision: 1,
    fields,
    upstreamRefs: [],
  })).head.status, 'submitted');
  assert.deepEqual(calls.map(({ url, init }) => ({
    url,
    method: init?.method,
    body: JSON.parse(String(init?.body)),
  })), [
    {
      url: '/api/outputs/P01/draft',
      method: 'POST',
      body: { expectedStateRevision: 0, fields, upstreamRefs: [] },
    },
    {
      url: '/api/outputs/P01/submit',
      method: 'POST',
      body: { outputId: 'output-p01', expectedStateRevision: 1, fields, upstreamRefs: [] },
    },
  ]);
});

function outputAggregate(
  status: ProfessionalOutputAggregate['head']['status'],
  stateRevision: number,
): ProfessionalOutputAggregate {
  return {
    head: {
      outputId: 'output-p01',
      studentId: 'stu-01',
      taskId: 'P01',
      currentVersion: 1,
      stateRevision,
      status,
    },
    versions: [{
      outputId: 'output-p01',
      taskId: 'P01',
      version: 1,
      schemaVersion: 1,
      fields: { stationAndRoom: '海河路站 / 01号机房' },
      upstreamRefs: [],
      evidenceLinks: {},
      fieldSources: [],
    }],
    submissionCount: status === 'submitted' ? 1 : 0,
    reviewHistory: [],
  };
}

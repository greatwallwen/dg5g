import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { loadSelfStudyCatalog } from '../textbook-scene/self-study-content.ts';
import {
  professionalOutputSchemaForTask,
  validateProfessionalOutputDraft,
  validateProfessionalOutputSubmission,
} from './output-schema.ts';
import { OutputFieldsets } from './output-fieldsets.tsx';
import { p01OutputFieldDefinitions, p01OutputFieldKeys } from './p01-output-definition.ts';

test('P01 uses the exact ten-field indoor evidence sheet while P02 and P03 retain generated schemas', () => {
  const catalog = loadSelfStudyCatalog();
  const p01 = professionalOutputSchemaForTask(catalog, 'P01');
  assert.deepEqual(p01.fields.map(({ key }) => key), p01OutputFieldKeys);
  assert.deepEqual(p01.fields.map(({ key, label }) => ({ key, label })), p01OutputFieldDefinitions);
  assert.equal(p01.fields.length, 10);
  assert.equal(p01.totalScore, 100);

  for (const taskId of ['P02', 'P03'] as const) {
    const source = Object.values(catalog).find((document) => (
      document.taskId === taskId && document.content.kind === 'deep'
    ));
    assert.ok(source && source.content.kind === 'deep');

    const schema = professionalOutputSchemaForTask(catalog, taskId);
    assert.deepEqual(schema.fields.map(({ key }) => key), Object.keys(source.content.outputTemplate));
    assert.ok(schema.fields.every(({ required }) => required));
    assert.deepEqual(schema.rubric, source.content.rubric);
    assert.equal(schema.totalScore, 100);
  }
});

test('every output field declares its evidence-or-complete-gap policy explicitly', () => {
  const catalog = loadSelfStudyCatalog();
  for (const taskId of ['P01', 'P02', 'P03'] as const) {
    const schema = professionalOutputSchemaForTask(catalog, taskId);
    assert.ok(schema.fields.length > 0);
    for (const field of schema.fields) {
      assert.deepEqual(field.evidencePolicy, {
        requirement: 'evidence-or-gap',
        completeGapRequires: ['gapText', 'nextActionText'],
      }, `${taskId}:${field.key}`);
    }
  }
});

test('generated fieldsets visibly cover each task evidence domain without a second field list', () => {
  const catalog = loadSelfStudyCatalog();
  const expectedCopy = {
    P01: /位置|机房|身份|端口|链路/,
    P02: /站点|方位|下倾|挂高|遮挡|覆盖/,
    P03: /时间|地点|业务|终端|复现|证据/,
  } as const;
  for (const taskId of ['P01', 'P02', 'P03'] as const) {
    const schema = professionalOutputSchemaForTask(catalog, taskId);
    const html = renderToStaticMarkup(createElement(OutputFieldsets, {
      schema,
      values: {},
      readOnly: false,
      onFieldChange: () => undefined,
    }));
    assert.equal((html.match(/data-output-field=/g) ?? []).length, schema.fields.length);
    for (const field of schema.fields) assert.match(html, new RegExp(escapeRegExp(field.label)));
    assert.match(html, expectedCopy[taskId]);
    assert.equal((html.match(/required=""/g) ?? []).length, schema.fields.length);
  }
});

test('submission validation requires every generated field to contain meaningful evidence', () => {
  const catalog = loadSelfStudyCatalog();
  for (const taskId of ['P01', 'P02', 'P03'] as const) {
    const schema = professionalOutputSchemaForTask(catalog, taskId);
    const complete = Object.fromEntries(schema.fields.map(({ key, label }) => [key, `已填写：${label}`]));
    assert.deepEqual(validateProfessionalOutputSubmission(schema, complete), complete);

    const missing = { ...complete };
    delete missing[schema.fields[0]!.key];
    assert.throws(() => validateProfessionalOutputSubmission(schema, missing), /required professional output field/i);
    assert.throws(() => validateProfessionalOutputSubmission(schema, {
      ...complete,
      [schema.fields[0]!.key]: '   ',
    }), /required professional output field/i);
  }
});

test('P01 submission errors name the missing Chinese field and reject the superseded five-field template', () => {
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01');
  const complete = Object.fromEntries(schema.fields.map(({ key, label }) => [key, `已填写：${label}`]));

  assert.throws(
    () => validateProfessionalOutputSubmission(schema, {}),
    /站点与机房位置证据/,
  );
  const missingLocation = { ...complete };
  delete missingLocation.locationEvidence;
  assert.throws(
    () => validateProfessionalOutputSubmission(schema, missingLocation),
    /设备位置证据/,
  );
  assert.throws(
    () => validateProfessionalOutputDraft(schema, {
      objectId: 'legacy', fieldName: 'legacy', value: 'legacy', photoIds: 'IMG-001', gap: 'none',
    }),
    /unknown professional output field/i,
  );
});

test('draft validation allows incomplete generated fields but rejects every unknown field', () => {
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), 'P01');
  const [first] = schema.fields;
  assert.ok(first);
  assert.deepEqual(validateProfessionalOutputDraft(schema, { [first.key]: '已采集的部分证据' }), {
    [first.key]: '已采集的部分证据',
  });
  assert.throws(
    () => validateProfessionalOutputDraft(schema, { [first.key]: '有效', inventedField: '伪造字段' }),
    /unknown professional output field: inventedField/i,
  );
});

test('every current text field rejects numeric, array, and blank command values', () => {
  const catalog = loadSelfStudyCatalog();
  for (const taskId of ['P01', 'P02', 'P03'] as const) {
    const schema = professionalOutputSchemaForTask(catalog, taskId);
    const field = schema.fields[0]!;
    for (const invalid of [0, 100, ['证据A'], [], '', '   ']) {
      assert.throws(
        () => validateProfessionalOutputDraft(schema, { [field.key]: invalid }),
        new RegExp(`${field.key}|text|non-empty`, 'i'),
        `${taskId}:${JSON.stringify(invalid)}`,
      );
    }
  }
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

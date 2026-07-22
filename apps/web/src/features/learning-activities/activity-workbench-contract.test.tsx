import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { p01BaseActivities, p1Activities } from './activity-catalog.ts';
import {
  choicesForActivityField,
  choicesForScopeReason,
} from './activity-choice-field.tsx';
import { ActivityControl } from './activity-controls.tsx';
import { evaluateActivity } from './activity-evaluator.ts';
import { ActivityWorkbench } from './activity-workbench.tsx';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test('six activity kinds render purpose-built control contracts', () => {
  const markup = p01BaseActivities.map(({ activity }) => renderToStaticMarkup(
    <ActivityWorkbench
      activity={activity}
      level="foundation"
      levelLabel="岗位活动"
      onPass={() => undefined}
      passed={false}
    />,
  ));

  assert.match(markup[0]!, /data-classification-board="scope-classification"/);
  assert.match(markup[0]!, /data-scope-reason-board="P1T1-N01-micro-01"/);
  assert.match(markup[0]!, /排除理由/);
  assert.match(markup[1]!, /data-evidence-match-board="P1T1-N02-foundation-01"/);
  assert.equal((markup[1]!.match(/data-evidence-match-card=/g) ?? []).length, 3);
  assert.equal((markup[1]!.match(/data-evidence-match-target=/g) ?? []).length, 3);
  assert.match(markup[1]!, /先选一张证据卡，再选择它能直接证明的问题/);
  assert.equal((markup[1]!.match(/data-three-question-dropzone=/g) ?? []).length, 3);
  assert.equal((markup[1]!.match(/data-three-question-card=/g) ?? []).length, 3);
  assert.match(markup[2]!, /data-link-path-board="true"/);
  assert.equal((markup[2]!.match(/data-link-path-slot=/g) ?? []).length, 4);
  assert.equal((markup[2]!.match(/data-link-path-candidate=/g) ?? []).length, 4);
  assert.match(markup[3]!, /data-record-flip-card="P1T1-N02-transfer-01"/);
  assert.match(markup[3]!, /data-record-evidence-form="true"/);
  assert.equal((markup[3]!.match(/<select/g) ?? []).length, 6);
  assert.match(markup[4]!, /<table[^>]*data-four-state-matrix="true"/);
  assert.equal((markup[4]!.match(/type="radio"/g) ?? []).length, 20);
  assert.match(markup[5]!, /<table[^>]*data-defective-sheet-revision="true"/);
  assert.match(markup[5]!, /缺陷原值/);
  assert.match(markup[5]!, /修订值/);
  assert.equal((markup[5]!.match(/<select/g) ?? []).length, 3);
});

test('all P1 micro-practice record fields use explicit choices instead of free text', () => {
  for (const { activity } of p1Activities) {
    const markup = renderToStaticMarkup(
      <ActivityWorkbench
        activity={activity}
        level="foundation"
        levelLabel="岗位活动"
        onPass={() => undefined}
        passed={false}
      />,
    );
    assert.doesNotMatch(markup, /<textarea/i, activity.id);
    assert.doesNotMatch(markup, /<input[^>]+type="text"/i, activity.id);
    if (activity.kind === 'structured-record' || activity.kind === 'defective-sheet-revision') {
      for (const field of activity.interaction.fields) {
        assert.ok(choicesForActivityField(activity.id, field.id).length >= 3, `${activity.id}/${field.id}`);
      }
    }
  }
});

test('N01 exposes selectable exclusion reasons that satisfy the original server rule', () => {
  const definition = p01BaseActivities[0]!;
  const reasons = {
    'shared-operator-cabinet': choicesForScopeReason('shared-operator-cabinet')[0]!,
    'room-02-cabinets': choicesForScopeReason('room-02-cabinets')[0]!,
  };
  assert.equal(evaluateActivity(definition, {
    assignments: {
      'room-01-cabinets': 'in-scope',
      'shared-operator-cabinet': 'out-of-scope',
      'room-02-cabinets': 'out-of-scope',
    },
    reasons,
  }).passed, true);

  const markup = renderToStaticMarkup(
    <ActivityControl
      activity={definition.activity}
      onOrderChange={() => undefined}
      onValueChange={() => undefined}
      order={[]}
      values={{
        'room-01-cabinets': 'in-scope',
        'shared-operator-cabinet': 'out-of-scope',
        'room-02-cabinets': 'out-of-scope',
      }}
    />,
  );
  assert.equal((markup.match(/data-scope-reason-option=/g) ?? []).length, 6);
  assert.doesNotMatch(markup, /<textarea/i);
});

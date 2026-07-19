import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { p01BaseActivities } from './activity-catalog.ts';
import { ActivityWorkbench, shouldLoadActivityProgress } from './activity-workbench.tsx';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test('only self-study workbenches restore self-study attempt history', () => {
  assert.equal(shouldLoadActivityProgress({ channel: 'self-study' }), true);
  assert.equal(shouldLoadActivityProgress({
    channel: 'classroom', sessionId: 'demo-class', classroomRunId: 'lesson-run-001',
  }), false);
});

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
  assert.match(markup[1]!, /data-classification-board="evidence-classification"/);
  assert.match(markup[2]!, /data-link-sequence-builder="true"/);
  assert.match(markup[3]!, /data-structured-record-form="true"/);
  assert.match(markup[4]!, /<table[^>]*data-four-state-matrix="true"/);
  assert.equal((markup[4]!.match(/type="radio"/g) ?? []).length, 16);
  assert.match(markup[5]!, /<table[^>]*data-defective-sheet-revision="true"/);
  assert.match(markup[5]!, /缺陷原值/);
  assert.match(markup[5]!, /修订值/);
});

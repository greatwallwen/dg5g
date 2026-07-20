import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { p01BaseActivities } from './activity-catalog.ts';
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
  assert.match(markup[4]!, /<table[^>]*data-four-state-matrix="true"/);
  assert.equal((markup[4]!.match(/type="radio"/g) ?? []).length, 16);
  assert.match(markup[5]!, /<table[^>]*data-defective-sheet-revision="true"/);
  assert.match(markup[5]!, /缺陷原值/);
  assert.match(markup[5]!, /修订值/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { requireSelfStudyDocument } from './self-study-content.ts';
import { resolveSelfStudyNavigationTarget } from './self-study-remediation.ts';
import { SelfStudyRenderer } from './self-study-renderer.tsx';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test('validates a remediation URL against the real node activity catalog', () => {
  const document = requireSelfStudyDocument('P1T1-N02');
  assert.deepEqual(resolveSelfStudyNavigationTarget(document, {
    section: 'practice',
    activityId: 'P1T1-N02-application-01',
  }), {
    kind: 'target',
    sectionId: 'practice',
    activityId: 'P1T1-N02-application-01',
  });
  assert.deepEqual(resolveSelfStudyNavigationTarget(document, {
    section: 'evidence',
    activityId: 'P1T1-N02-application-01',
  }), { kind: 'invalid' });
  assert.deepEqual(resolveSelfStudyNavigationTarget(document, {
    section: 'practice',
    activityId: 'P1T1-N03-micro-01',
  }), { kind: 'invalid' });
});

test('opens the real practice section and focuses the concrete remediation activity', () => {
  const document = requireSelfStudyDocument('P1T1-N02');
  const html = renderToStaticMarkup(
    <SelfStudyRenderer
      completed
      document={document}
      focusedActivityId="P1T1-N02-application-01"
      initialSection="practice"
      onComplete={() => undefined}
      saving={false}
    />,
  );
  assert.match(html, /class="self-study-section is-practice is-active"/);
  assert.match(html, /data-self-study-section="practice"/);
  assert.match(html, /data-activity-id="P1T1-N02-application-01"[^>]*data-remediation-focus="true"/);
  const workbench = readFileSync(
    new URL('../learning-activities/activity-workbench.tsx', import.meta.url),
    'utf8',
  );
  assert.match(workbench, /scrollIntoView/);
});

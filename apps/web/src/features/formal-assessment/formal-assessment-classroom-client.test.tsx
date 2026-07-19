import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ActiveIssuedAssessmentPaper } from '@/platform/formal-assessment-contract.ts';
import type { StudentAuthoritativeSnapshot } from '@/platform/authoritative-snapshot.ts';
import { FormalAssessmentEntryClient } from './formal-assessment-classroom-client.tsx';

test('resume failure keeps retry visible across same-running parent rerenders', () => {
  const source = readFileSync(new URL('./formal-assessment-classroom-client.tsx', import.meta.url), 'utf8');
  assert.match(source, /const handleResumed = useCallback/);
  assert.match(source, /setResuming\(false\);\s*if \(!resumed\) return;/);
  assert.match(source, /lastObservedStatusRef\.current !== 'running'/);
});

test('paused authoritative snapshot never renders the active attempt controls', () => {
  let activeRenderCount = 0;
  const markup = renderToStaticMarkup(<FormalAssessmentEntryClient
    classroomSessionId="session-1"
    initialSnapshot={snapshot('paused')}
    issued={issued()}
    renderAttempt={() => {
      activeRenderCount += 1;
      return <form data-active-attempt><button type="submit">submit</button></form>;
    }}
  />);

  assert.equal(activeRenderCount, 0);
  assert.match(markup, /data-assessment-state="paused"/);
  assert.doesNotMatch(markup, /data-active-attempt|type="submit"/);
});

test('terminal authoritative snapshot projects a tokenless read-only attempt in the same render', () => {
  let activeRenderCount = 0;
  const markup = renderToStaticMarkup(<FormalAssessmentEntryClient
    classroomSessionId="session-1"
    initialSnapshot={snapshot('closed')}
    issued={issued()}
    renderAttempt={(current) => {
      if (current.state === 'in-progress') activeRenderCount += 1;
      return <section data-projected-state={current.state} />;
    }}
  />);

  assert.equal(activeRenderCount, 0);
  assert.match(markup, /data-projected-state="expired"/);
});

test('classroom entry fails closed when its initial snapshot cannot prove the issued node and run', () => {
  for (const [label, initialSnapshot] of [
    ['missing snapshot', undefined],
    ['idle snapshot', snapshot('idle')],
    ['wrong-node snapshot', snapshot('running', 'P1T2-N02')],
  ] as const) {
    let activeRenderCount = 0;
    const markup = renderToStaticMarkup(<FormalAssessmentEntryClient
      classroomSessionId="session-1"
      initialSnapshot={initialSnapshot}
      issued={issued()}
      renderAttempt={(current) => {
        if (current.state === 'in-progress') activeRenderCount += 1;
        return <form data-active-attempt />;
      }}
    />);

    assert.equal(activeRenderCount, 0, label);
    assert.match(markup, /data-assessment-state="unavailable"/, label);
    assert.doesNotMatch(markup, /data-active-attempt/, label);
  }
});

function issued(): ActiveIssuedAssessmentPaper {
  return {
    assessmentId: 'assessment-1',
    attemptToken: 'active-token-with-enough-entropy',
    state: 'in-progress',
    serverNow: '2026-07-18T08:00:00.000Z',
    expiresAt: '2026-07-18T08:10:00.000Z',
    draft: { revision: 2, answers: { evidenceClassification: 'nameplate-photo' } },
    paper: {
      nodeId: 'P1T1-N02', title: 'Formal assessment', questionVersion: 'v1',
      passScore: 80, durationMinutes: 15, questions: [],
    },
  };
}

function snapshot(
  status: 'idle' | 'running' | 'paused' | 'closed',
  nodeId = 'P1T1-N02',
): StudentAuthoritativeSnapshot {
  return {
    audience: 'student',
    serverNow: '2026-07-18T08:05:00.000Z',
    snapshotVersion: 2,
    classroom: { sessionId: 'session-1', revision: 2, status: 'active' },
    submissions: {
      activeAssessment: {
        ...(status === 'idle' ? {} : { runId: 'run-1', nodeId }), status,
        expiresAt: '2026-07-18T08:10:00.000Z', remainingSecondsWhenPaused: 300,
      },
    },
  } as unknown as StudentAuthoritativeSnapshot;
}

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('teacher and projector server pages load the exact session and matching authoritative cut', () => {
  const teacherPage = source('../../app/teacher/sessions/[sessionId]/page.tsx');
  const projectorPage = source('../../app/present/[sessionId]/page.tsx');

  for (const [name, text, audience] of [
    ['teacher', teacherPage, 'teacher'],
    ['projector', projectorPage, 'projector'],
  ] as const) {
    assert.match(text, /AuthoritativeSnapshotReader/);
    assert.match(text, /getDatabase\(\)/);
    assert.match(text, new RegExp(`read\\(actor, ['"]${audience}['"], \\{ sessionId: params\\.sessionId \\}\\)`));
    assert.match(text, /initialSnapshot=\{snapshot\}/);
    assert.doesNotMatch(text, /isActiveDemoSession/);
    assert.ok(text.indexOf("requireClassRole('teacher')") < text.indexOf('getDatabase()'), `${name} must authorize first`);
  }
});

test('SQLite classroom loader never treats a node ID as a session ID', () => {
  const mockApi = source('../../platform/mock-api.ts');
  const teacherLoader = between(mockApi, 'export async function getTeacherSession', 'export async function getProjectorState');

  assert.match(teacherLoader, /getClassSession\(sessionId\)/);
  assert.match(teacherLoader, /session\.activeNodeId/);
  assert.doesNotMatch(teacherLoader, /resolveSessionId|taskIdForSession\(sessionId\)|nodeIdForSession\(sessionId\)/);
});

test('teacher console renders snapshot facts without client-side roster or score aggregation', () => {
  const client = source('./teacher-console-client.tsx');

  assert.match(client, /useAuthoritativeSnapshot/);
  assert.match(client, /projectTeacherConsoleSnapshot\(snapshot/);
  assert.match(client, /initialSnapshot/);
  assert.doesNotMatch(client, /fetchClassLearningProgress|ClassLearningProgressSnapshot/);
  for (const forbidden of [
    /\.filter\(/,
    /\.reduce\(/,
    /getRosterStats/,
    /submittedFormalScores/,
    /commandDeliveryStats/,
  ]) {
    assert.doesNotMatch(client, forbidden);
  }
});

test('teacher sample-student pulse preserves a missing test score instead of inventing zero', () => {
  const pulse = source('../skill-tree/teacher-skill-pulse.tsx');

  assert.match(pulse, /nodeTestHighestScore === undefined \? ['"]尚未形成['"]/);
  assert.doesNotMatch(pulse, /gameScore \?\? 0/);
});

test('projector consumes aggregate snapshot metrics and never traverses classroom participants', () => {
  const client = source('./projector-client.tsx');
  const projection = source('../../platform/class-session-projection.ts');

  assert.match(client, /useAuthoritativeSnapshot/);
  assert.match(client, /snapshot\.submissions\.activeAssessment/);
  assert.match(client, /initialSnapshot/);
  for (const forbidden of [/\.filter\(/, /\.reduce\(/, /anonymousProgress/, /formalTest\?\.participants/]) {
    assert.doesNotMatch(client, forbidden);
  }
  assert.doesNotMatch(projection, /anonymous-/);
});

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

function between(sourceText: string, start: string, end: string): string {
  const startIndex = sourceText.indexOf(start);
  const endIndex = sourceText.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing ${start}`);
  assert.notEqual(endIndex, -1, `missing ${end}`);
  return sourceText.slice(startIndex, endIndex);
}

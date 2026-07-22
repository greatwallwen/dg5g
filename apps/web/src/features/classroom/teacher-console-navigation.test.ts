import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('teacher node navigation starts an authoritative lesson instead of patching a generated unit id', () => {
  const source = readFileSync(new URL('./teacher-console-client.tsx', import.meta.url), 'utf8');

  assert.match(source, /startTeacherLesson/);
  assert.match(source, /expectedRevision:\s*session\.lessonState\?\.revision/);
  assert.doesNotMatch(source, /activeUnitId:\s*next\.id/);
  assert.doesNotMatch(source, /teacherSlideIndex:\s*nextIndex\s*\+\s*1/);
});

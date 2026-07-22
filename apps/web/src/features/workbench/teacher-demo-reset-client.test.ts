import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./teacher-demo-reset-client.tsx', import.meta.url), 'utf8');

test('demo reset requires confirmation and exposes distinct success and failure results', () => {
  assert.match(source, /window\.confirm\(confirmationCopy\)/);
  assert.match(source, /课程、班级、账号和素材不会删除/);
  assert.match(source, /setResult\(\{ tone: 'success'/);
  assert.match(source, /setResult\(\{ tone: 'error'/);
  assert.match(source, /role=\{result\.tone === 'error' \? 'alert' : 'status'\}/);
  assert.match(source, /重置成功/);
  assert.match(source, /重置失败/);
});

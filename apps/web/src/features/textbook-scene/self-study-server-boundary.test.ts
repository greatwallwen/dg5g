import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('locked routes never load textbook body and open routes inject a validated serializable catalog', async () => {
  const page = await readFile(new URL('../../app/learn/[nodeId]/page.tsx', import.meta.url), 'utf8');
  const gateIndex = page.indexOf("if (destination.kind !== 'open')");
  const snapshotIndex = page.indexOf("read(actor, 'student')");
  const loaderIndex = page.indexOf('const selfStudyCatalog = loadSelfStudyCatalog()');
  assert.ok(gateIndex >= 0 && snapshotIndex > gateIndex && loaderIndex > snapshotIndex);
  assert.ok(page.indexOf('requireSelfStudyDocument(params.nodeId, selfStudyCatalog)') > loaderIndex);
  assert.match(page, /AuthoritativeSnapshotReader/);
  assert.match(page, /projectStudentLearningSnapshot\(studentCut\.me\.learning\)/);
  assert.match(page, /initialSnapshot=\{initialSnapshot\}/);
  assert.match(page, /sessionId=\{studentCut\.classroom\.sessionId\}/);
  assert.match(page, /selfStudyCatalog=\{selfStudyCatalog\}/);
});

test('professional output nodes default to the evidence-sheet workspace without hiding explicit self-study links', async () => {
  const page = await readFile(new URL('../../app/learn/[nodeId]/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /getNodeLearningPolicy\(params\.nodeId\)/);
  assert.match(page, /policy\?\.requiresProfessionalOutput/);
  assert.match(page, /const initialMode =/);
  assert.match(page, /searchParams\?\.mode === 'learning'/);
  assert.match(page, /initialMode=\{initialMode\}/);
});

test('client modules consume props and never import the server filesystem loader', async () => {
  const [shell, adapter] = await Promise.all([
    readFile(new URL('./textbook-scene-shell.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../platform/deep-textbook-demo-data.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(shell, /createDemoTaskProfiles\(props\.selfStudyCatalog\)/);
  assert.match(shell, /<LearningScene[^>]+document=\{document\}/);
  assert.doesNotMatch(shell, /self-study-content|loadP1DemoContent|node:fs|readFileSync|JSON\.parse/);
  assert.match(adapter, /createDemoTaskProfiles\(catalog: SelfStudyCatalog\)/);
  assert.doesNotMatch(adapter, /进入机房前|照片怎样证明设备|怎样把用户口述|readFileSync|JSON\.parse/);
});

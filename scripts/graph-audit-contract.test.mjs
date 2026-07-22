import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(file, 'utf8');

test('graph audits validate the live semantic graph instead of the removed expert graph entry', () => {
  const darkAudit = read('scripts/audit-dark-engineering-ui.mjs');
  const capabilityAudit = read('scripts/audit-capability-map-v2.mjs');

  for (const audit of [darkAudit, capabilityAudit]) {
    assert.doesNotMatch(audit, /capability-map-expert-readable-v2\.svg/);
  }
  assert.doesNotMatch(capabilityAudit, /expertCapabilitySvgSrc|expert capability SVG asset/);

  for (const contract of [
    'data-semantic-course-graph',
    'graph.semanticEdges.filter',
    'visibleEdges.map',
    'GraphMinimap',
  ]) {
    assert.match(darkAudit, new RegExp(contract.replaceAll('.', '\\.')));
  }
});

test('dark engineering audit validates the current indoor engineering relation map', () => {
  const audit = read('scripts/audit-dark-engineering-ui.mjs');

  assert.match(audit, /shared-classroom-scene\.tsx/);
  for (const contract of [
    'IndoorScopeClassroomVisual',
    'data-classroom-scope-map="true"',
    'data-graphic-system="engineering-line"',
    'data-graphic-theme="dark-engineering"',
  ]) {
    assert.match(audit, new RegExp(contract.replaceAll('.', '\\.')));
  }
});

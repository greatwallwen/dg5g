import assert from 'node:assert/strict';
import test from 'node:test';
import { curriculumGraphNodes } from '../../platform/fixtures/curriculum-graph-fixtures.ts';
import {
  dispatchCurriculumGraphNode,
  navigateStudentGraphNode,
} from './course-graph-navigation.ts';

test('dispatches the semantic formal-test node through the independent assessment router contract', () => {
  const formal = curriculumGraphNodes.find(({ id }) => id === 'game-topology');
  assert.ok(formal);
  const pushed: string[] = [];

  dispatchCurriculumGraphNode(formal, {
    onNodeSelect(nodeId, action) {
      navigateStudentGraphNode((href) => pushed.push(href), nodeId, action);
    },
    onTaskSelect() {
      assert.fail('formal activity must not dispatch as a task');
    },
  });

  assert.deepEqual(pushed, ['/learn/P1T1-N02/test']);
});

test('keeps an ordinary capability node on the self-study route', () => {
  const capability = curriculumGraphNodes.find(({ id }) => id === 'P1T1-N02');
  assert.ok(capability);
  const pushed: string[] = [];
  dispatchCurriculumGraphNode(capability, {
    onNodeSelect(nodeId, action) {
      navigateStudentGraphNode((href) => pushed.push(href), nodeId, action);
    },
    onTaskSelect() {},
  });
  assert.deepEqual(pushed, ['/learn/P1T1-N02']);
});

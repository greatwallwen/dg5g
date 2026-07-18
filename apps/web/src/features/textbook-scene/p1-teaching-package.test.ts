import assert from 'node:assert/strict';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  TopologyRepairArcade,
  topologyRendererMode,
} from '../../../../../packages/widgets/src/edugame-pixi/index.ts';
import {
  p1TeachingPackage,
  pageWithFormalAssessment,
  pageWithProfessionalOutput,
} from './p1-teaching-package.ts';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

test('P1 publishes four ordered 45-minute classroom lessons with six pages each', () => {
  assert.deepEqual(p1TeachingPackage.map(({ id }) => id), [
    'P01-L1',
    'P01-L2',
    'P02-L1',
    'P03-L1',
  ]);

  for (const lesson of p1TeachingPackage) {
    assert.equal(lesson.suggestedMinutes, 45, lesson.id);
    assert.equal(lesson.pages.length, 6, lesson.id);
    assert.equal(
      lesson.pages.reduce((total, page) => total + page.suggestedMinutes, 0),
      45,
      lesson.id,
    );
  }
});

test('every lesson is directly teachable with decreasing scaffolds and an explicit P01 formal-test handoff', () => {
  const expectedScaffolds = {
    'P01-L1': 'full',
    'P01-L2': 'guided',
    'P02-L1': 'reduced',
    'P03-L1': 'independent',
  } as const;

  for (const lesson of p1TeachingPackage) {
    for (const page of lesson.pages) {
      assert.equal(page.scaffoldLevel, expectedScaffolds[lesson.id], page.id);
      assert.ok(page.projectorContent.title.length >= 8, `${page.id} projector title`);
      assert.ok(page.projectorContent.material.length >= 35, `${page.id} projector material`);
      assert.ok(page.projectorContent.visualCallouts.length >= 2, `${page.id} visual callouts`);
      assert.ok(page.teacherExplanation.length >= 80, `${page.id} teacher explanation`);
      assert.ok(page.caseQuestion.length >= 20, `${page.id} case question`);
      assert.ok(page.typicalAnswer.length >= 55, `${page.id} case-specific answer`);
      assert.ok(page.commonErrors.length >= 2, `${page.id} common errors`);
      assert.ok(page.followUpPrompts.length >= 2, `${page.id} follow-up prompts`);
      assert.ok(page.studentAction.length >= 20, `${page.id} student action`);
      assert.ok(page.transition.length >= 18, `${page.id} transition`);
      assert.doesNotMatch(
        page.typicalAnswer,
        /答案需包含对象、证据、判断依据和下一步动作/,
        page.id,
      );
    }
  }

  const handoff = p1TeachingPackage[1]!.pages[5]!;
  const handoffCopy = JSON.stringify(handoff);
  assert.match(handoffCopy, /正式测试/);
  assert.match(handoffCopy, /分项诊断/);
  assert.match(handoffCopy, /返回.*复学/);
});

test('each N02 has one real formal-assessment page distinct from its transfer activity', () => {
  const expected = [
    ['P1T1-N02', 'P01-L2', 'P01-L2-P06'],
    ['P1T2-N02', 'P02-L1', 'P02-L1-P06'],
    ['P1T3-N02', 'P03-L1', 'P03-L1-P06'],
  ] as const;

  for (const [nodeId, lessonId, pageId] of expected) {
    const page = pageWithFormalAssessment(nodeId);
    assert.equal(page.lessonId, lessonId);
    assert.equal(page.id, pageId);
    assert.equal(page.nodeId, nodeId);
    assert.equal(page.formalAssessmentNodeId, nodeId);
    assert.deepEqual(page.formalAssessment, {
      kind: 'formal-assessment',
      nodeId,
      gameId: `${nodeId}-server-assessment`,
      href: `/learn/${nodeId}/test`,
    });
    assert.equal(page.canonicalActivityId, `${nodeId}-transfer-01`);
    assert.deepEqual(page.canonicalActivityIds, [`${nodeId}-transfer-01`]);
  }

  const formalPages = p1TeachingPackage.flatMap(({ pages }) => pages)
    .filter(({ formalAssessment }) => formalAssessment !== undefined);
  assert.deepEqual(formalPages.map(({ id }) => id), expected.map(([, , pageId]) => pageId));
});

test('each task exposes one real N04 professional-output page', () => {
  const expected = [
    ['P01', 'P1T1-N04', 'P01-L2', 'P01-L2-P05'],
    ['P02', 'P1T2-N04', 'P02-L1', 'P02-L1-P05'],
    ['P03', 'P1T3-N04', 'P03-L1', 'P03-L1-P05'],
  ] as const;

  for (const [taskId, nodeId, lessonId, pageId] of expected) {
    const page = pageWithProfessionalOutput(taskId);
    assert.equal(page.lessonId, lessonId);
    assert.equal(page.id, pageId);
    assert.equal(page.nodeId, nodeId);
    assert.equal(page.professionalOutputTaskId, taskId);
    assert.deepEqual(page.professionalOutput, {
      kind: 'professional-output',
      taskId,
      nodeId,
      href: `/learn/${nodeId}?mode=challenge`,
    });
  }
});

test('every page has an explicit node and all P1 tasks cover N01-N04, assessment, and output', () => {
  const allPages = p1TeachingPackage.flatMap(({ pages }) => pages);
  const seenActivities = new Set<string>();

  for (const page of allPages) {
    assert.match(page.nodeId, /^P1T[123]-N0[1-4]$/, `${page.id} nodeId`);
    assert.equal(
      page.canonicalActivityId,
      page.canonicalActivityIds.length === 1 ? page.canonicalActivityIds[0] : undefined,
      `${page.id} singular activity compatibility`,
    );
    for (const activityId of page.canonicalActivityIds) {
      assert.match(activityId, new RegExp(`^${page.nodeId}-`), `${page.id} activity target`);
      assert.equal(seenActivities.has(activityId), false, `${activityId} is attached once`);
      seenActivities.add(activityId);
    }
    if (page.formalAssessment) {
      assert.equal(page.formalAssessment.nodeId, page.nodeId, `${page.id} assessment target`);
      assert.equal(page.formalAssessmentNodeId, page.nodeId, `${page.id} assessment node`);
    }
    if (page.professionalOutput) {
      assert.equal(page.professionalOutput.nodeId, page.nodeId, `${page.id} output target`);
      assert.equal(page.professionalOutputTaskId, page.taskId, `${page.id} output task`);
    }
  }

  for (const [taskId, taskIndex] of [['P01', 1], ['P02', 2], ['P03', 3]] as const) {
    const pages = allPages.filter((page) => page.taskId === taskId);
    const nodeIds = new Set(pages.map(({ nodeId }) => nodeId));
    assert.deepEqual(
      [...nodeIds].sort(),
      [1, 2, 3, 4].map((nodeIndex) => `P1T${taskIndex}-N0${nodeIndex}`),
      `${taskId} N01-N04`,
    );
    assert.equal(pages.filter(({ formalAssessment }) => formalAssessment).length, 1, `${taskId} assessment`);
    assert.equal(pages.filter(({ professionalOutput }) => professionalOutput).length, 1, `${taskId} output`);
  }
});

test('P02 and P03 use their own sequenced workplace actions and canonical activity identities', () => {
  const p02 = p1TeachingPackage[2]!;
  const p03 = p1TeachingPackage[3]!;

  assert.deepEqual(p02.pages.map(({ canonicalActivityId }) => canonicalActivityId), [
    'P1T2-N01-micro-01',
    'P1T2-N02-foundation-01',
    'P1T2-N02-application-01',
    'P1T2-N03-micro-01',
    'P1T2-N04-micro-01',
    'P1T2-N02-transfer-01',
  ]);
  assert.deepEqual(p03.pages.map(({ canonicalActivityId }) => canonicalActivityId), [
    'P1T3-N01-micro-01',
    'P1T3-N02-foundation-01',
    'P1T3-N02-application-01',
    'P1T3-N03-micro-01',
    'P1T3-N04-micro-01',
    'P1T3-N02-transfer-01',
  ]);

  const p02Copy = JSON.stringify(p02);
  for (const term of ['采集范围', '方位角', '机械下倾', '电下倾', '挂高', '风险', '无权操作', '路线', '室外站点与覆盖采集表']) {
    assert.match(p02Copy, new RegExp(term), `P02 ${term}`);
  }

  const p03Copy = JSON.stringify(p03);
  for (const term of ['投诉事实', '同地点', '同业务', '同终端', '时间轴', '交叉', '调查单', '责任人', '复测']) {
    assert.match(p03Copy, new RegExp(term), `P03 ${term}`);
  }
  assert.doesNotMatch(p03Copy, /机柜02|BBU槽位3|AAU5619/);
  for (const page of p03.pages) {
    assert.doesNotMatch(page.projectorContent.visualCallouts.join(' '), /位置证据|身份数据|方向链路/, page.id);
  }

  const p01Titles = new Set(p1TeachingPackage.slice(0, 2).flatMap(({ pages }) => pages.map(({ title }) => title)));
  for (const page of [...p02.pages, ...p03.pages]) assert.equal(p01Titles.has(page.title), false, page.id);
});

test('Pixi enhancement is explicitly limited to P01 N02 pages', () => {
  const pixiPages = p1TeachingPackage.flatMap(({ pages }) => pages)
    .filter(({ interactiveRenderer }) => interactiveRenderer === 'pixi-topology');
  assert.deepEqual(pixiPages.map(({ canonicalActivityId }) => canonicalActivityId), [
    'P1T1-N02-application-01',
  ]);
  assert.ok(p1TeachingPackage.slice(2).flatMap(({ pages }) => pages)
    .every(({ interactiveRenderer }) => interactiveRenderer === undefined));
});

test('topology activity keeps an equivalent DOM surface and falls back for reduced motion or missing Pixi', () => {
  assert.equal(topologyRendererMode({ pixiAvailable: true, reducedMotion: false }), 'pixi');
  assert.equal(topologyRendererMode({ pixiAvailable: true, reducedMotion: true }), 'dom');
  assert.equal(topologyRendererMode({ pixiAvailable: false, reducedMotion: false }), 'dom');

  const markup = renderToStaticMarkup(createElement(TopologyRepairArcade, {
    items: [{ id: 'device', label: 'BBU槽位3', target_id: 'port', correct: true }],
    targets: [{ id: 'port', label: 'AAU端口' }],
    selected: null,
    doneIds: [],
    combo: 0,
    result: 'idle',
    active: true,
    levelStep: 0,
    onSelect: () => undefined,
    onDrop: () => undefined,
  }));
  assert.match(markup, /data-topology-dom-fallback="true"/);
  assert.match(markup, /BBU槽位3/);
  assert.match(markup, /AAU端口/);
  assert.match(markup, /选择左侧现场对象，再接入右侧正确端口/);
});

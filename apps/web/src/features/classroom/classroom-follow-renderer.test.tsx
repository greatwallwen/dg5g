import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const sourceUrl = new URL('./classroom-follow-renderer.tsx', import.meta.url);

async function loadRenderer(): Promise<any> {
  assert.equal(existsSync(sourceUrl), true, 'classroom follow renderer must exist');
  return import(sourceUrl.href);
}

const followModel = {
  sessionId: 'demo-class',
  revision: 9,
  phase: 'practice',
  currentUnit: {
    taskId: 'P01',
    nodeId: 'P1T1-N02',
    unitId: 'P01-K02',
    title: '设备拓扑',
    question: '设备位置、身份和连接方向分别需要什么证据？',
    summary: '从现场影像恢复可复核关系。',
    points: ['位置证据', '身份铭牌', '端口与光纤方向'],
    visualId: 'indoor-topology',
  },
  teacherTask: { label: '教师任务', instruction: '沿拓扑指出三类证据。', phaseLabel: '学生练习' },
  classroomActivity: {
    id: 'P1T1-N02-foundation-1',
    nodeId: 'P1T1-N02',
    state: 'open',
    prompt: '指出证据缺口。',
    expectedEvidence: ['柜号', '铭牌', '端口方向'],
  },
  returnToSelfStudy: { href: '/learn/P1T3-N02', label: '返回完整自学', nodeId: 'P1T3-N02' },
};

test('renders exactly the four classroom-follow regions without a mini self-study rail', async () => {
  const renderer = await loadRenderer();
  const html = renderToStaticMarkup(createElement(renderer.ClassroomFollowRenderer, { model: followModel }));

  for (const marker of ['classroom-current-unit', 'teacher-task', 'classroom-activity', 'return-self-study']) {
    assert.equal((html.match(new RegExp(`data-${marker}`, 'g')) ?? []).length, 1, marker);
  }
  assert.match(html, /data-classroom-visual="indoor-topology"/);
  assert.match(html, /data-motion="paused"/);
  assert.match(html, /data-primary-action-policy="exactly-one"/);
  assert.equal((html.match(/data-primary-action="true"/g) ?? []).length, 1);
  assert.match(html, /data-return-self-study="true"[^>]*data-primary-action="true"|data-primary-action="true"[^>]*data-return-self-study="true"/);
  assert.match(html, /课堂活动进行中/);
  assert.match(html, /href="\/learn\/P1T3-N02"/);
  assert.doesNotMatch(html, /scene-follow-path|data-student-self-control|上一节点|下一节点|教师讲稿/);
});

test('renders explicit waiting and submitted activity states', async () => {
  const renderer = await loadRenderer();
  const waiting = renderToStaticMarkup(createElement(renderer.ClassroomFollowRenderer, {
    model: { ...followModel, classroomActivity: { ...followModel.classroomActivity, state: 'waiting' } },
  }));
  const submitted = renderToStaticMarkup(createElement(renderer.ClassroomFollowRenderer, {
    model: { ...followModel, classroomActivity: { ...followModel.classroomActivity, state: 'submitted' } },
  }));
  assert.match(waiting, /等待教师推送/);
  assert.match(submitted, /课堂活动已提交/);
});

test('self mode is a status card and never renders the teacher current unit', async () => {
  const renderer = await loadRenderer();
  const html = renderToStaticMarkup(createElement(renderer.ClassroomStudentModeRenderer, {
    screen: {
      kind: 'self',
      hasTeacherUpdate: true,
      teacherRevision: 12,
      returnTarget: { href: '/learn/P1T2-N03', nodeId: 'P1T2-N03' },
    },
    followModel,
  }));
  assert.match(html, /data-classroom-self-status/);
  assert.match(html, /data-motion="paused"/);
  assert.equal((html.match(/data-primary-action="true"/g) ?? []).length, 1);
  assert.match(html, /data-primary-action="true"[^>]*data-return-to-teacher/);
  assert.match(html, /教师课堂已更新/);
  assert.match(html, /href="\/learn\/P1T2-N03"/);
  assert.doesNotMatch(html, /data-classroom-current-unit/);
});

test('entry mode makes joining the sole primary action while self-study remains secondary', async () => {
  const renderer = await loadRenderer();
  const html = renderToStaticMarkup(createElement(renderer.ClassroomStudentModeRenderer, {
    screen: {
      kind: 'entry',
      teacherRevision: 12,
      returnTarget: { href: '/learn/P1T1-N02', nodeId: 'P1T1-N02' },
    },
    sessionStatus: 'active',
  }));
  assert.match(html, /data-classroom-entry-status/);
  assert.match(html, /data-motion="paused"/);
  assert.equal((html.match(/data-primary-action="true"/g) ?? []).length, 1);
  assert.match(html, /data-classroom-join="true"[^>]*data-primary-action="true"|data-primary-action="true"[^>]*data-classroom-join="true"/);
  assert.match(html, /返回完整自学/);
});

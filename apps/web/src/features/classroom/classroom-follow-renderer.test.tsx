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
  actionIndex: 7,
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
  assert.match(html, /data-playback-action-index="7"/);
  assert.match(html, /第2课时 · 第2页/);
  assert.match(html, /带 ODF 的链路重建/);
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

test('non-N02 follow mode renders the teacher selected teaching page instead of one repeated node summary', async () => {
  const renderer = await loadRenderer();
  const html = renderToStaticMarkup(createElement(renderer.ClassroomFollowRenderer, {
    model: {
      ...followModel,
      actionIndex: 1,
      currentUnit: {
        ...followModel.currentUnit,
        nodeId: 'P1T1-N01',
        title: '室内资源边界',
        visualId: 'indoor-scope-boundary',
      },
      classroomActivity: { ...followModel.classroomActivity, nodeId: 'P1T1-N01' },
    },
  }));

  assert.match(html, /第1课时 · 第2页/);
  assert.match(html, /data-teaching-page="P1T1-N01-S02"/);
  assert.match(html, /入口证据确认现场/);
  assert.match(html, /任务单与机房入口门牌/);
  assert.match(html, /data-classroom-scope-map="true"/);
  assert.doesNotMatch(html, /道路热点|采样路线/);
});

test('the fifth generic teaching page keeps the visual sequence complete instead of wrapping to step one', async () => {
  const renderer = await loadRenderer();
  const html = renderToStaticMarkup(createElement(renderer.ClassroomFollowRenderer, {
    model: {
      ...followModel,
      actionIndex: 4,
      currentUnit: {
        ...followModel.currentUnit,
        nodeId: 'P1T1-N04',
        title: '资料归档',
        visualId: 'indoor-evidence',
      },
      classroomActivity: { ...followModel.classroomActivity, nodeId: 'P1T1-N04' },
    },
  }));

  assert.match(html, /data-teaching-page="P1T1-N04-S05"/);
  assert.equal((html.match(/<article class="is-active"/g) ?? []).length, 4);
});

test('live challenge follow renders the independent test CTA and preserves self-study return', async () => {
  const renderer = await loadRenderer();
  const html = renderToStaticMarkup(createElement(renderer.ClassroomFollowRenderer, {
    model: { ...followModel, phase: 'challenge' },
  }));
  assert.equal((html.match(/data-primary-action="true"/g) ?? []).length, 1);
  assert.match(html, /data-classroom-formal-test="true"[^>]*data-primary-action="true"|data-primary-action="true"[^>]*data-classroom-formal-test="true"/);
  assert.match(html, /href="\/learn\/P1T1-N02\/test\?classroomSessionId=demo-class"/);
  assert.match(html, /data-return-self-study="true"/);
  assert.match(html, /data-return-href="\/learn\/P1T3-N02"/);

  const practice = renderToStaticMarkup(createElement(renderer.ClassroomFollowRenderer, {
    model: followModel,
  }));
  assert.doesNotMatch(practice, /data-classroom-formal-test/);
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

import assert from 'node:assert/strict';
import test from 'node:test';

test('level-three correction gives every P1 task a complete worked professional example', async () => {
  const { getWorkedCorrectionGuidance } = await import('./formal-assessment-correction.server.ts');
  const expectedTaskEvidence = {
    'P1T1-N02': ['铭牌', '两端端口', '对端端口', '补拍'],
    'P1T2-N02': ['坐标', '异常点', '覆盖边界', '复测'],
    'P1T3-N02': ['投诉工单', '无线测量', '误归因', '联合复测'],
  } as const;

  for (const [nodeId, expectedPhrases] of Object.entries(expectedTaskEvidence)) {
    const guidance = getWorkedCorrectionGuidance(nodeId);
    assert.equal(guidance.length, 4, `${nodeId} must show four complete correction lines`);
    assert.match(guidance[0], /^错误证据：/);
    assert.match(guidance[1], /^适用规则：/);
    assert.match(guidance[2], /^修订动作：/);
    assert.match(guidance[3], /^职业结论：/);
    for (const phrase of expectedPhrases) assert.equal(guidance.join('\n').includes(phrase), true, `${nodeId}:${phrase}`);
  }
});

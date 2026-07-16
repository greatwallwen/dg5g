import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthenticatedActor } from './auth/actor.ts';
import { AuthService } from './auth/auth-service.ts';
import { AUTH_COOKIE_NAME } from './auth/cookie.ts';
import { closeDatabase } from './db/database.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import {
  AssessmentRemediationRequiredError,
  FormalAssessmentService,
  type AssessmentAnswers,
} from './formal-assessment-service.ts';

const studentThree: AuthenticatedActor = {
  userId: 'stu-03',
  studentId: 'stu-03',
  username: 'student03',
  displayName: '学生三',
  role: 'student',
  classId: 'demo-class',
};

const taskCases = [
  {
    nodeId: 'P1T2-N02',
    gameId: 'P1T2-N02-server-assessment',
    correct: {
      evidenceClassification: 'gps-bearing-sample',
      linkReconstruction: ['site-anchor', 'sample-point', 'signal-reading', 'coverage-boundary', 'anomaly-marker'],
      defectiveOutputRevision: ['bind-coordinate', 'bind-time', 'retain-anomaly'],
      professionalConclusion: {
        confirmedFact: '已确认采样点坐标、时间和信号读数，覆盖边界证据可以复核。',
        evidenceGap: '异常点缺少复测轨迹，当前仍是待复核证据缺口。',
        risk: '若直接平均异常读数，会误判覆盖边界并影响优化结论。',
        action: '返回异常点按相同时间窗复测并挂接轨迹后再更新成果。',
      },
    },
    wrongEvidence: 'site-panorama',
  },
  {
    nodeId: 'P1T3-N02',
    gameId: 'P1T3-N02-server-assessment',
    correct: {
      evidenceClassification: 'complaint-ticket',
      linkReconstruction: ['complaint-address', 'reproduction-point', 'terminal-state', 'radio-measurement', 'cause-boundary'],
      defectiveOutputRevision: ['bind-ticket', 'bind-time-window', 'retain-contradiction'],
      professionalConclusion: {
        confirmedFact: '已确认投诉工单、投诉地址和现场复现结果，事实可以复核。',
        evidenceGap: '终端日志与无线测量存在矛盾，原因边界仍待复核。',
        risk: '若直接归因网络故障，可能误判责任并形成错误投诉结论。',
        action: '在投诉时间窗复测并核验终端日志后再更新调查结论。',
      },
    },
    wrongEvidence: 'neighbour-photo',
  },
] as const;

for (const taskCase of taskCases) {
  test(`${taskCase.nodeId} issues an answer-free task paper and enforces fail-remediate-retry-pass`, () => {
    const fixture = createTestDatabase();
    try {
      migrateDatabase(fixture.database);
      seedDemo(fixture.database);
      fixture.database.prepare(`
        INSERT INTO learning_events (
          event_id, student_id, node_id, channel, event_type, payload_json, origin
        ) VALUES (?, 'stu-03', ?, 'self-study', 'micro_practice_passed', '{"completed":true}', 'user')
      `).run(`ready-${taskCase.nodeId}`, taskCase.nodeId);
      let sequence = 0;
      let now = new Date('2026-07-16T10:00:00.000Z');
      const service = new FormalAssessmentService(fixture.database, {
        now: () => now,
        randomId: () => `${taskCase.nodeId}-${++sequence}`,
        randomToken: () => `token-${taskCase.nodeId}-${++sequence}-0123456789abcdef`,
      });

      const first = service.issuePaper(studentThree, taskCase.nodeId);
      const serializedPaper = JSON.stringify(first.paper);
      assert.equal(first.paper.nodeId, taskCase.nodeId);
      assert.doesNotMatch(serializedPaper, /acceptedOptionIds|orderedOptionIds|requiredOptionIds|forbiddenOptionIds|conclusionCriteria/);
      const wrong = wrongAnswers(first.paper, taskCase.wrongEvidence);
      const failed = service.submitAnswers(studentThree, first.attemptToken, wrong, taskCase.nodeId);
      assert.equal(failed.passed, false);
      assert.ok(failed.remediationTargets.length >= 3);
      assert.ok(failed.remediationTargets.every((target) => (
        target.nodeId === taskCase.nodeId
        && target.activityId.startsWith(`${taskCase.nodeId}-`)
      )));
      assert.throws(
        () => service.issuePaper(studentThree, taskCase.nodeId),
        (error) => error instanceof AssessmentRemediationRequiredError,
      );

      now = new Date('2026-07-16T10:01:00.000Z');
      for (const [index, target] of failed.remediationTargets.entries()) {
        fixture.database.prepare(`
          INSERT INTO practice_attempts (
            attempt_id, student_id, activity_id, node_id, passed, origin, attempted_at
          ) VALUES (?, 'stu-03', ?, ?, 1, 'user', ?)
        `).run(`remediation-${taskCase.nodeId}-${index}`, target.activityId, target.nodeId, now.toISOString());
      }
      const second = service.issuePaper(studentThree, taskCase.nodeId);
      const passed = service.submitAnswers(
        studentThree,
        second.attemptToken,
        taskCase.correct as unknown as AssessmentAnswers,
        taskCase.nodeId,
      );
      assert.equal(passed.passed, true);
      assert.equal(passed.totalScore, 100);
      const stored = fixture.database.prepare(`
        SELECT attempt.game_id AS gameId, attempt.answers_json AS answersJson,
          attempt.diagnostics_json AS diagnosticsJson, instance.status
        FROM formal_attempts AS attempt
        INNER JOIN formal_assessment_instances AS instance
          ON instance.assessment_id = attempt.assessment_id
        WHERE attempt.attempt_id = ?
      `).get(passed.attemptId) as {
        gameId: string;
        answersJson: string;
        diagnosticsJson: string;
        status: string;
      };
      const diagnostics = JSON.parse(stored.diagnosticsJson) as Record<string, unknown>;
      assert.equal(stored.gameId, taskCase.gameId);
      assert.equal(stored.status, 'closed');
      assert.equal(diagnostics.studentId, studentThree.studentId);
      assert.equal(diagnostics.gameId, taskCase.gameId);
      assert.doesNotMatch(JSON.stringify(diagnostics), /acceptedOptionIds|orderedOptionIds|secret-answer/);
      assert.notEqual(stored.answersJson, '{}');
    } finally {
      fixture.cleanup();
    }
  });

  test(`${taskCase.nodeId} is reachable through the dynamic authenticated assessment route`, async () => {
    const fixture = createTestDatabase();
    const previousPath = process.env.DGBOOK_SQLITE_PATH;
    try {
      migrateDatabase(fixture.database);
      seedDemo(fixture.database);
      fixture.database.prepare(`
        INSERT INTO learning_events (
          event_id, student_id, node_id, channel, event_type, payload_json, origin
        ) VALUES (?, 'stu-03', ?, 'self-study', 'micro_practice_passed', '{"completed":true}', 'user')
      `).run(`route-ready-${taskCase.nodeId}`, taskCase.nodeId);
      const session = new AuthService(fixture.database).login({
        username: 'student03',
        password: '123456',
      });
      assert.ok(session);
      process.env.DGBOOK_SQLITE_PATH = fixture.databasePath;
      closeDatabase();
      const route = await import('../app/api/learning/nodes/[nodeId]/assessment/route.ts');
      const response = route.GET(new Request(
        `http://localhost/api/learning/nodes/${taskCase.nodeId}/assessment`,
        { headers: { cookie: `${AUTH_COOKIE_NAME}=${session.token}` } },
      ), { params: { nodeId: taskCase.nodeId } });

      assert.equal(response.status, 200);
      const body = await response.json() as { paper: { nodeId: string } };
      assert.equal(body.paper.nodeId, taskCase.nodeId);
    } finally {
      closeDatabase();
      if (previousPath === undefined) delete process.env.DGBOOK_SQLITE_PATH;
      else process.env.DGBOOK_SQLITE_PATH = previousPath;
      fixture.cleanup();
    }
  });
}

function wrongAnswers(
  paper: { questions: Array<{ id: string; options?: Array<{ id: string }> }> },
  evidenceClassification: string,
): AssessmentAnswers {
  const linkOptions = paper.questions.find(({ id }) => id === 'linkReconstruction')?.options ?? [];
  const revisionOptions = paper.questions.find(({ id }) => id === 'defectiveOutputRevision')?.options ?? [];
  return {
    evidenceClassification,
    linkReconstruction: linkOptions.map(({ id }) => id).reverse(),
    defectiveOutputRevision: [revisionOptions.at(-1)?.id ?? ''],
    professionalConclusion: {
      confirmedFact: '不清楚',
      evidenceGap: '不清楚',
      risk: '不清楚',
      action: '不清楚',
    },
  };
}

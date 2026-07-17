import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthenticatedActor } from './auth/actor.ts';
import { migrateDatabase } from './db/migrations.ts';
import { seedDemo } from './db/demo-seed.ts';
import { createTestDatabase } from './db/test-database.ts';
import type { AppDatabase } from './db/database.ts';
import { ClassroomSessionRepository } from './classroom-session-repository.ts';
import {
  AssessmentClassroomWindowError,
  AssessmentTokenError,
  FormalAssessmentService,
  type AssessmentAnswers,
} from './formal-assessment-service.ts';

const studentOne: AuthenticatedActor = {
  userId: 'stu-01', studentId: 'stu-01', username: 'student01',
  displayName: '学生一', role: 'student', classId: 'demo-class',
};
const studentTwo: AuthenticatedActor = {
  ...studentOne, userId: 'stu-02', studentId: 'stu-02',
  username: 'student02', displayName: '学生二',
};
const studentThree: AuthenticatedActor = {
  ...studentOne, userId: 'stu-03', studentId: 'stu-03',
  username: 'student03', displayName: '学生三',
};

const passingAnswers: AssessmentAnswers = {
  evidenceClassification: 'nameplate-photo',
  linkReconstruction: ['source-device', 'source-port', 'cable-label', 'peer-port', 'peer-device'],
  defectiveOutputRevision: ['restore-source', 'add-photo-index', 'record-direction'],
  professionalConclusion: {
    confirmedFact: '设备铭牌可识别，源端口照片清晰，已经确认源设备身份和源端口。',
    evidenceGap: '对端端口照片模糊，当前无法确认对端端口编号。',
    risk: '若直接交付，链路关系可能错误并造成后续配置风险。',
    action: '重新拍摄对端端口并核验编号，补齐照片索引后更新成果表。',
  },
};

test('refresh resumes the same 15-minute assessment and expiry preserves a read-only draft until explicit restart', () => {
  const fixture = createTestDatabase();
  let now = new Date('2026-07-16T10:00:00.000Z');
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    const service = new FormalAssessmentService(fixture.database, {
      ...deterministicOptions(),
      now: () => now,
      tokenTtlMs: 30 * 60_000,
    });

    const first = service.openOrResume(studentOne, 'P1T1-N02');
    assert.equal(first.state, 'in-progress');
    assert.equal(first.serverNow, now.toISOString());
    assert.equal(Date.parse(first.expiresAt) - Date.parse(first.serverNow), 15 * 60_000);
    assert.deepEqual(first.draft, { answers: {}, revision: 0 });
    assert.ok(first.attemptToken);

    const saved = service.saveDraft(
      studentOne,
      first.attemptToken,
      { evidenceClassification: 'nameplate-photo' },
      0,
      'P1T1-N02',
    );
    assert.equal(saved.revision, 1);
    now = new Date('2026-07-16T10:01:00.000Z');

    const resumed = service.openOrResume(studentOne, 'P1T1-N02');
    assert.equal(resumed.assessmentId, first.assessmentId);
    assert.equal(resumed.expiresAt, first.expiresAt);
    assert.notEqual(resumed.attemptToken, first.attemptToken);
    assert.deepEqual(resumed.draft, saved);
    assert.throws(
      () => service.submitAnswers(studentOne, first.attemptToken, passingAnswers),
      (error) => error instanceof AssessmentTokenError && error.code === 'used-token',
    );

    now = new Date('2026-07-16T10:15:00.000Z');
    assert.throws(
      () => service.submitAnswers(studentOne, resumed.attemptToken!, passingAnswers),
      (error) => error instanceof AssessmentTokenError && error.code === 'expired-token',
    );
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_attempts WHERE assessment_id = ?
    `).pluck().get(first.assessmentId), 0);
    assert.deepEqual(fixture.database.prepare(`
      SELECT status, closure_reason AS closureReason
      FROM formal_assessment_instances WHERE assessment_id = ?
    `).get(first.assessmentId), { status: 'closed', closureReason: 'expired' });

    const expired = service.openOrResume(studentOne, 'P1T1-N02');
    assert.equal(expired.assessmentId, first.assessmentId);
    assert.equal(expired.state, 'expired');
    assert.equal(expired.attemptToken, undefined);
    assert.deepEqual(expired.draft, saved);

    const restarted = service.openOrResume(studentOne, 'P1T1-N02', { restart: true });
    assert.notEqual(restarted.assessmentId, first.assessmentId);
    assert.equal(restarted.state, 'in-progress');
    assert.deepEqual(restarted.draft, { answers: {}, revision: 0 });
    assert.deepEqual(
      service.openOrResume(studentOne, 'P1T1-N02').assessmentId,
      restarted.assessmentId,
    );
    assert.deepEqual(fixture.database.prepare(`
      SELECT answers_json AS answersJson, state_revision AS revision
      FROM formal_assessment_drafts WHERE assessment_id = ? AND student_id = ?
    `).get(first.assessmentId, studentOne.studentId), {
      answersJson: JSON.stringify(saved.answers),
      revision: saved.revision,
    });
  } finally {
    fixture.cleanup();
  }
});

test('rejects a legacy state_json formal test when no relational assessment run exists', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    const classroom = new ClassroomSessionRepository(fixture.database).readSession('demo-class');
    assert.ok(classroom);
    classroom.state.formalTest = {
      assessmentId: 'AS-P1T1-N02',
      gameId: 'P1T1-N02-server-assessment',
      nodeId: 'P1T1-N02',
      durationSeconds: 900,
      runId: 'legacy-state-json-run',
      status: 'running',
      startedAt: '2026-07-16T01:00:00.000Z',
    };
    fixture.database.prepare(`
      UPDATE classroom_sessions
      SET status = 'active', state_json = ?
      WHERE session_id = 'demo-class'
    `).run(JSON.stringify(classroom.state));
    const service = new FormalAssessmentService(fixture.database, deterministicOptions());

    assert.throws(
      () => service.openOrResume(studentOne, 'P1T1-N02', { classroomSessionId: 'demo-class' }),
      AssessmentClassroomWindowError,
    );
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_assessment_instances WHERE session_id = 'demo-class'
    `).pluck().get(), 0);
  } finally {
    fixture.cleanup();
  }
});

test('binds a classroom paper to the exact relational run and its authoritative expiry', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    openRelationalClassroomAssessmentRun(fixture.database, {
      runId: 'classroom-assessment-live-01',
      expiresAt: '2026-07-16T10:12:00.000Z',
    });
    const service = new FormalAssessmentService(fixture.database, deterministicOptions());

    const issued = service.openOrResume(studentOne, 'P1T1-N02', {
      classroomSessionId: 'demo-class',
    });
    const stored = fixture.database.prepare(`
      SELECT assessment_id AS assessmentId, session_id AS sessionId,
        classroom_run_id AS classroomRunId
      FROM formal_assessment_instances
      WHERE assessment_id = ?
    `).get(issued.assessmentId);

    assert.deepEqual(stored, {
      assessmentId: issued.assessmentId,
      sessionId: 'demo-class',
      classroomRunId: 'classroom-assessment-live-01',
    });
    assert.equal(issued.expiresAt, '2026-07-16T10:12:00.000Z');
    assert.notEqual(issued.assessmentId, 'classroom-assessment-live-01');
  } finally {
    fixture.cleanup();
  }
});

test('rejects a classroom-bound submission after its shared run has left the active window', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    openRelationalClassroomAssessmentRun(fixture.database, {
      runId: 'classroom-run-closed-before-submit',
      expiresAt: '2026-07-16T10:15:00.000Z',
    });
    const service = new FormalAssessmentService(fixture.database, deterministicOptions());
    const issued = service.openOrResume(studentOne, 'P1T1-N02', {
      classroomSessionId: 'demo-class',
    });

    fixture.database.prepare(`
      UPDATE classroom_assessment_runs
      SET status = 'closed', closed_at = '2026-07-16T10:01:00.000Z',
        closed_reason = 'teacher-collected'
      WHERE run_id = 'classroom-run-closed-before-submit'
    `).run();

    assert.throws(
      () => service.submitAnswers(studentOne, issued.attemptToken!, passingAnswers),
      AssessmentClassroomWindowError,
    );
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM formal_attempts WHERE assessment_id = ?
    `).pluck().get(issued.assessmentId), 0);
  } finally {
    fixture.cleanup();
  }
});

test('one classroom student submission closes only that instance while the shared run and peers remain open', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);
    readyForFormalAssessment(fixture.database, studentOne.userId);
    readyForFormalAssessment(fixture.database, studentTwo.userId);
    readyForFormalAssessment(fixture.database, studentThree.userId);
    openRelationalClassroomAssessmentRun(fixture.database, {
      runId: 'classroom-three-student-run',
      expiresAt: '2026-07-16T10:15:00.000Z',
    });
    const service = new FormalAssessmentService(fixture.database, deterministicOptions());
    const first = service.openOrResume(studentOne, 'P1T1-N02', { classroomSessionId: 'demo-class' });
    const second = service.openOrResume(studentTwo, 'P1T1-N02', { classroomSessionId: 'demo-class' });
    const third = service.openOrResume(studentThree, 'P1T1-N02', { classroomSessionId: 'demo-class' });

    service.submitAnswers(studentOne, first.attemptToken!, passingAnswers);
    assert.equal(fixture.database.prepare(`
      SELECT status FROM classroom_assessment_runs WHERE run_id = 'classroom-three-student-run'
    `).pluck().get(), 'running');
    const readStatus = fixture.database.prepare(`
      SELECT status FROM formal_assessment_instances WHERE assessment_id = ?
    `).pluck();
    assert.equal(readStatus.get(first.assessmentId), 'closed');
    assert.equal(readStatus.get(second.assessmentId), 'running');
    assert.equal(readStatus.get(third.assessmentId), 'running');
    assert.equal(service.submitAnswers(studentTwo, second.attemptToken!, passingAnswers).passed, true);
    assert.equal(service.submitAnswers(studentThree, third.attemptToken!, passingAnswers).passed, true);
  } finally {
    fixture.cleanup();
  }
});



function deterministicOptions() {
  let sequence = 0;
  return {
    now: () => new Date('2026-07-16T10:00:00.000Z'),
    randomId: () => `assessment-sequence-${++sequence}`,
    randomToken: () => `token-sequence-${++sequence}-0123456789abcdef`,
  };
}

function readyForFormalAssessment(database: AppDatabase, studentId: string): void {
  const insert = database.prepare(`
    INSERT INTO practice_attempts (
      attempt_id, student_id, activity_id, node_id, passed, origin, attempted_at
    ) VALUES (?, ?, ?, ?, 1, 'user', '1999-12-31T23:59:00.000Z')
  `);
  for (const [activityId, nodeId] of [
    ['P1T1-N01-micro-01', 'P1T1-N01'],
    ['P1T1-N02-foundation-01', 'P1T1-N02'],
    ['P1T1-N02-application-01', 'P1T1-N02'],
    ['P1T1-N02-transfer-01', 'P1T1-N02'],
  ]) insert.run(`lifecycle-ready-${studentId}-${activityId}`, studentId, activityId, nodeId);
}

function openRelationalClassroomAssessmentRun(
  database: AppDatabase,
  input: { runId: string; expiresAt: string },
): void {
  const lessonRunId = `${input.runId}-lesson`;
  database.prepare(`
    INSERT INTO classroom_lesson_runs (
      lesson_run_id, session_id, lesson_id, task_id, node_id, status,
      teaching_cursor_json, started_at
    ) VALUES (?, 'demo-class', 'P01-L02', 'P01', 'P1T1-N02', 'active', '{}',
      '2026-07-16T09:55:00.000Z')
  `).run(lessonRunId);
  database.prepare(`
    UPDATE classroom_sessions
    SET status = 'active', active_lesson_run_id = ?
    WHERE session_id = 'demo-class'
  `).run(lessonRunId);
  database.prepare(`
    INSERT INTO classroom_assessment_runs (
      run_id, lesson_run_id, session_id, node_id, game_id,
      status, started_at, expires_at
    ) VALUES (?, ?, 'demo-class', 'P1T1-N02', 'P1T1-N02-server-assessment',
      'running', '2026-07-16T10:00:00.000Z', ?)
  `).run(input.runId, lessonRunId, input.expiresAt);
}



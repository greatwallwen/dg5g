import type { ClassSession, StudentProgress } from '@/platform/models';
import { getNodeLearningPolicy } from '@/platform/learning-policy';
import { getRosterStats, syncReceiptState } from './classroom-session-state';

export function StudentSupervisionRoster({ onSelectStudent, selectedStudentId, session }: { onSelectStudent: (student: StudentProgress) => void; selectedStudentId: string; session: ClassSession }) {
  const roster = session.studentRoster ?? [];
  const stats = getRosterStats(session);

  return (
    <section
      className="student-roster"
      data-class-roster
      data-roster-count={stats.total}
      data-follow-count={stats.follow}
      data-self-count={stats.self}
      data-submitted-count={stats.submitted}
      data-help-count={stats.needsHelp}
      data-pending-sync-count={stats.pendingSync}
    >
      <div className="student-roster-head">
        <div>
          <strong>全班学习监督</strong>
          <span>教师查看节奏、提交和需要辅导的学生。</span>
        </div>
        <dl>
          <div><dt>跟随</dt><dd>{stats.follow}</dd></div>
          <div><dt>自主</dt><dd>{stats.self}</dd></div>
          <div><dt>提交</dt><dd>{stats.submitted}</dd></div>
          <div><dt>需关注</dt><dd>{stats.needsHelp}</dd></div>
        </dl>
      </div>
      <div className="student-roster-list">
        {roster.map((student) => (
          <StudentRosterRow isSelected={student.studentId === selectedStudentId} onSelectStudent={onSelectStudent} student={student} session={session} key={student.studentId} />
        ))}
      </div>
    </section>
  );
}

function StudentRosterRow({ isSelected, onSelectStudent, student, session }: { isSelected: boolean; onSelectStudent: (student: StudentProgress) => void; student: StudentProgress; session: ClassSession }) {
  const slideDelta = student.currentSlideIndex - session.teacherSlideIndex;
  const syncState = syncReceiptState(student, session.syncRequestId);
  const formalPassScore = getNodeLearningPolicy(session.formalTest?.nodeId ?? session.activeNodeId ?? '')?.formalPassScore;
  const formalScorePassed = formalPassScore !== undefined && (student.bestGameScore ?? -1) >= formalPassScore;
  return (
    <button
      aria-current={isSelected ? 'true' : undefined}
      className={`student-roster-row is-${student.risk}${isSelected ? ' is-selected' : ''}`}
      data-roster-row
      data-student-id={student.studentId}
      data-follow-mode={student.mode}
      data-submission-state={student.submissionState}
      data-risk={student.risk}
      data-sync-receipt={syncState}
      data-slide-delta={slideDelta}
      onClick={() => onSelectStudent(student)}
      type="button"
    >
      <div className="student-roster-name">
        <strong>{student.name}</strong>
        <span>{student.group} · 第 {student.currentSlideIndex} 页{slideDelta ? ` · 差 ${Math.abs(slideDelta)} 页` : ''}</span>
      </div>
      <div className="student-roster-tags">
        <span>{modeLabel(student.mode)}</span>
        <span>{syncState === 'handled' ? '已接收' : '待响应'}</span>
        <span>{submissionLabel(student.submissionState)}</span>
        <span>证据 {student.evidenceCount}</span>
        <span className={formalScorePassed ? 'is-score-pass' : 'is-score-watch'}>最高 {formalScoreLabel(student.bestGameScore)}</span>
        <span data-attempt-state={student.attemptCount === undefined ? 'untested' : 'formed'}>{student.attemptCount === undefined ? '尚未测试' : `第 ${student.attemptCount}/3 次`}</span>
      </div>
      <p>{student.lastAction}</p>
    </button>
  );
}

function modeLabel(mode: StudentProgress['mode']) {
  return mode === 'self' ? '自主浏览' : '跟随课堂';
}

function submissionLabel(state: StudentProgress['submissionState']) {
  if (state === 'reviewed') return '已讲评';
  if (state === 'submitted') return '已提交';
  return '待提交';
}

function formalScoreLabel(score: number | undefined): number | '尚未测试' {
  return score === undefined ? '尚未测试' : score;
}

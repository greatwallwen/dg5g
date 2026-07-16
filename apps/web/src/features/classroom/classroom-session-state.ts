import type { ClassSession, StudentProgress } from '@/platform/models';

export type StudentControlSource = 'teacher-forced' | 'student-self' | 'teacher-follow';

export interface ClassroomRosterStats {
  total: number;
  follow: number;
  self: number;
  submitted: number;
  needsHelp: number;
  pendingSync: number;
}

export interface CommandDeliveryStats {
  online: number;
  applied: number;
  failed: number;
  pending: number;
}

export function getRosterStats(session: ClassSession): ClassroomRosterStats {
  const roster = session.studentRoster ?? [];
  const syncRequestId = session.syncRequestId;
  return roster.reduce<ClassroomRosterStats>((stats, student) => {
    stats.total += 1;
    if (student.mode === 'self') stats.self += 1;
    else stats.follow += 1;
    if (student.submissionState === 'submitted' || student.submissionState === 'reviewed') stats.submitted += 1;
    if (student.risk === 'help') stats.needsHelp += 1;
    if (syncReceiptState(student, syncRequestId) === 'pending') stats.pendingSync += 1;
    return stats;
  }, { total: 0, follow: 0, self: 0, submitted: 0, needsHelp: 0, pendingSync: 0 });
}

export function submittedFormalScores(session: ClassSession): number[] {
  return (session.formalTest?.participants ?? []).flatMap((participant) => (
    participant.state !== 'submitted' || participant.score === undefined
      ? []
      : [participant.score]
  ));
}

export function teacherControlMode(session: ClassSession): 'forced' | 'mixed' | 'follow' {
  if (session.studentSyncState === 'forced') return 'forced';
  return getRosterStats(session).self > 0 ? 'mixed' : 'follow';
}

export function commandDeliveryStats(session: ClassSession): CommandDeliveryStats {
  const online = (session.devicePresence ?? []).filter(
    (device) => device.actorRole === 'student' && device.helperState === 'online',
  ).length;
  const commandId = session.activeCommand?.commandId ?? session.commandAcks?.[0]?.commandId;
  if (!commandId) return { online, applied: 0, failed: 0, pending: 0 };

  const acks = (session.commandAcks ?? []).filter(
    (ack) => ack.commandId === commandId,
  );
  const applied = acks.filter((ack) => ack.state === 'applied').length;
  const failed = acks.filter((ack) => ack.state === 'failed' || ack.state === 'expired').length;
  return { online, applied, failed, pending: Math.max(0, online - applied - failed) };
}

export function studentControlSource(session: ClassSession, student: StudentProgress, localMode: StudentProgress['mode']): StudentControlSource {
  if (session.studentSyncState === 'forced') return 'teacher-forced';
  return localMode === 'self' || student.mode === 'self' ? 'student-self' : 'teacher-follow';
}

export function syncReceiptState(student: StudentProgress, syncRequestId?: string): 'handled' | 'pending' {
  if (!syncRequestId || syncRequestId === 'initial') return 'handled';
  return student.handledSyncRequestId === syncRequestId ? 'handled' : 'pending';
}

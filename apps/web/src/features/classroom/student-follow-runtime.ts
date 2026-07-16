import type {
  ClassroomParticipationSnapshot,
} from './classroom-participation-client.ts';

export interface StudentClassroomParticipationGateway {
  join(sessionId: string): Promise<ClassroomParticipationSnapshot>;
  setMode(
    sessionId: string,
    mode: 'follow' | 'self',
  ): Promise<ClassroomParticipationSnapshot>;
  leave(sessionId: string): Promise<ClassroomParticipationSnapshot>;
}

export function joinStudentClassroom(
  gateway: StudentClassroomParticipationGateway,
  sessionId: string,
): Promise<ClassroomParticipationSnapshot> {
  return gateway.join(sessionId);
}

export function changeStudentClassroomMode(
  gateway: StudentClassroomParticipationGateway,
  sessionId: string,
  mode: 'follow' | 'self',
): Promise<ClassroomParticipationSnapshot> {
  return gateway.setMode(sessionId, mode);
}

export async function leaveStudentClassroom(
  gateway: StudentClassroomParticipationGateway,
  sessionId: string,
  href: string,
  navigate: (href: string) => void,
): Promise<ClassroomParticipationSnapshot> {
  const snapshot = await gateway.leave(sessionId);
  navigate(href);
  return snapshot;
}

export interface StudentClassroomParticipationGateway {
  join(sessionId: string): Promise<unknown>;
  setMode(
    sessionId: string,
    mode: 'follow' | 'self',
  ): Promise<unknown>;
  leave(sessionId: string): Promise<unknown>;
}

export async function joinStudentClassroom(
  gateway: StudentClassroomParticipationGateway,
  sessionId: string,
): Promise<void> {
  await gateway.join(sessionId);
}

export async function changeStudentClassroomMode(
  gateway: StudentClassroomParticipationGateway,
  sessionId: string,
  mode: 'follow' | 'self',
): Promise<void> {
  await gateway.setMode(sessionId, mode);
}

export async function leaveStudentClassroom(
  gateway: StudentClassroomParticipationGateway,
  sessionId: string,
): Promise<void> {
  await gateway.leave(sessionId);
}

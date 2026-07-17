export class AssessmentClassroomContextError extends Error {
  override readonly name = 'AssessmentClassroomContextError';
}

export function parseAssessmentClassroomSessionId(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new AssessmentClassroomContextError('Classroom assessment context must contain one session id.');
  }
  const sessionId = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(sessionId)) {
    throw new AssessmentClassroomContextError('Classroom assessment session id is invalid.');
  }
  return sessionId;
}

export function parseAssessmentRestart(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (value !== 'true') {
    throw new AssessmentClassroomContextError('Assessment restart must be the single literal value true.');
  }
  return true;
}

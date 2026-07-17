export type ActivityDeliveryContext =
  | { channel: 'self-study' }
  | { channel: 'classroom'; sessionId: string; classroomRunId: string };

export function parseActivityDeliveryContext(value: unknown): ActivityDeliveryContext {
  if (!isRecord(value) || typeof value.channel !== 'string') {
    throw new TypeError('Invalid activity delivery context.');
  }
  if (value.channel === 'self-study') {
    assertExactKeys(value, ['channel']);
    return { channel: 'self-study' };
  }
  if (value.channel === 'classroom') {
    assertExactKeys(value, ['channel', 'sessionId', 'classroomRunId']);
    assertNonEmpty('sessionId', value.sessionId);
    assertNonEmpty('classroomRunId', value.classroomRunId);
    return {
      channel: 'classroom',
      sessionId: value.sessionId,
      classroomRunId: value.classroomRunId,
    };
  }
  throw new TypeError('Unsupported activity delivery channel.');
}

function assertExactKeys(value: Record<string, unknown>, expected: string[]): void {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new TypeError('Invalid activity delivery context.');
  }
}

function assertNonEmpty(field: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { createAttemptId } from './attempt-id.ts';

test('createAttemptId works when HTTP browsers omit crypto.randomUUID', () => {
  const cryptoWithoutRandomUuid = {
    getRandomValues(values: Uint32Array) {
      values.set([0x12345678, 0x9abcdef0, 0x13579bdf, 0x2468ace0]);
      return values;
    },
  };

  assert.equal(createAttemptId(cryptoWithoutRandomUuid), 'attempt-123456789abcdef013579bdf2468ace0');
});

test('createAttemptId prefers native randomUUID in secure contexts', () => {
  assert.equal(createAttemptId({ randomUUID: () => 'native-attempt-id' }), 'native-attempt-id');
});

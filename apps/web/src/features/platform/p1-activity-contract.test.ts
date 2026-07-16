import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadP1DemoContent } from './p1-content.ts';

const generatedContentUrl = new URL('../../../../../textbook/5g/generated/p1-demo-content.json', import.meta.url);

test('runtime validation rejects four-state judgement with a record form before rendering', () => {
  expectRejectedActivityMutation('P1T1-N03-micro-01', (practice) => {
    practice.interaction = {
      type: 'record-form',
      fields: [{ id: 'state', label: '状态', placeholder: '输入状态' }],
    };
  });
});

test('runtime validation rejects a state matrix without non-empty categories before rendering', () => {
  expectRejectedActivityMutation('P1T1-N03-micro-01', (practice) => {
    practice.interaction = { type: 'state-matrix' };
  });
});

test('runtime validation rejects a structured record without non-empty fields before rendering', () => {
  expectRejectedActivityMutation('P1T1-N02-transfer-01', (practice) => {
    practice.interaction = { type: 'record-form' };
  });
});

test('runtime validation rejects defective-sheet material without a source value before rendering', () => {
  expectRejectedActivityMutation('P1T1-N04-micro-01', (practice) => {
    const materials = practice.materials as Array<Record<string, unknown>>;
    delete materials[0]!.sourceValue;
  });
});

function expectRejectedActivityMutation(
  practiceId: string,
  mutate: (practice: Record<string, unknown>) => void,
): void {
  const content = JSON.parse(readFileSync(generatedContentUrl, 'utf8')) as unknown;
  const practice = findRecordById(content, practiceId);
  assert.ok(practice, `missing generated practice ${practiceId}`);
  mutate(practice);

  const directory = mkdtempSync(join(tmpdir(), 'dgbook-p1-activity-contract-'));
  const candidatePath = join(directory, 'candidate.json');
  try {
    writeFileSync(candidatePath, JSON.stringify(content), 'utf8');
    assert.throws(
      () => loadP1DemoContent(candidatePath),
      /Invalid P1 demo content/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function findRecordById(value: unknown, id: string): Record<string, unknown> | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecordById(item, id);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (record.id === id) return record;
  for (const item of Object.values(record)) {
    const found = findRecordById(item, id);
    if (found) return found;
  }
  return undefined;
}

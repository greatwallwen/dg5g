import assert from 'node:assert/strict';
import test from 'node:test';
import { professionalOutputSchemaForTask } from '../features/portfolio/output-schema.ts';
import { p01OutputFieldKeys } from '../features/portfolio/p01-output-definition.ts';
import { loadSelfStudyCatalog } from '../features/textbook-scene/self-study-content.ts';
import { seedBase } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import {
  ProfessionalOutputRepository,
  type ProfessionalOutputEvidenceGap,
  type ProfessionalOutputUpstreamRef,
} from './professional-output-repository.ts';

test('draft evidence gaps allow either string part and append immutable revisions', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database, () => 'output-gap-draft');
    const fields = completeP01Fields();
    const v1 = repository.saveDraft({
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 0,
      fields,
      upstreamRefs: [],
      evidenceGaps: {
        deviceIdentity: { gapText: '铭牌被遮挡', nextActionText: '' },
        connectionDirection: { gapText: '', nextActionText: '补拍远端端口' },
      },
    });

    assert.deepEqual(v1.versions[0]?.evidenceGaps, {
      connectionDirection: { gapText: '', nextActionText: '补拍远端端口' },
      deviceIdentity: { gapText: '铭牌被遮挡', nextActionText: '' },
    });
    const v2 = repository.saveDraft({
      outputId: v1.head.outputId,
      studentId: 'stu-01',
      taskId: 'P01',
      expectedStateRevision: 1,
      fields,
      upstreamRefs: [],
      evidenceGaps: {
        deviceIdentity: { gapText: '铭牌被遮挡', nextActionText: '补拍铭牌并复核台账' },
      },
    });

    assert.equal(v2.head.currentVersion, 2);
    assert.deepEqual(v2.versions.map(({ version, evidenceGaps }) => ({ version, evidenceGaps })), [
      { version: 1, evidenceGaps: {
        connectionDirection: { gapText: '', nextActionText: '补拍远端端口' },
        deviceIdentity: { gapText: '铭牌被遮挡', nextActionText: '' },
      } },
      { version: 2, evidenceGaps: {
        deviceIdentity: { gapText: '铭牌被遮挡', nextActionText: '补拍铭牌并复核台账' },
      } },
    ]);
    assert.equal(fixture.database.prepare(`
      SELECT COUNT(*) FROM output_evidence_gaps WHERE output_id = 'output-gap-draft'
    `).pluck().get(), 3);
  } finally {
    fixture.cleanup();
  }
});

test('blank, unknown-field, and non-string supplied gap parts are rejected before writes', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = new ProfessionalOutputRepository(fixture.database);
    const invalidGaps: Array<{
      outputId: string;
      gaps: Record<string, ProfessionalOutputEvidenceGap>;
      message: RegExp;
    }> = [
      {
        outputId: 'output-blank-gap',
        gaps: { deviceIdentity: { gapText: ' ', nextActionText: '' } },
        message: /evidence gap/i,
      },
      {
        outputId: 'output-unknown-gap',
        gaps: { inventedField: { gapText: '无法采集', nextActionText: '升级处理' } },
        message: /field/i,
      },
      {
        outputId: 'output-number-gap',
        gaps: {
          deviceIdentity: { gapText: 42, nextActionText: '补拍铭牌' },
        } as unknown as Record<string, ProfessionalOutputEvidenceGap>,
        message: /gapText.*string/i,
      },
      {
        outputId: 'output-null-action',
        gaps: {
          deviceIdentity: { gapText: '铭牌被遮挡', nextActionText: null },
        } as unknown as Record<string, ProfessionalOutputEvidenceGap>,
        message: /nextActionText.*string/i,
      },
    ];

    for (const { outputId, gaps, message } of invalidGaps) {
      assert.throws(() => repository.saveDraft({
        outputId,
        studentId: 'stu-01',
        taskId: 'P01',
        expectedStateRevision: 0,
        fields: completeP01Fields(),
        upstreamRefs: [],
        evidenceGaps: gaps,
      }), message);
      assert.deepEqual(mutationCounts(fixture.database, outputId), {
        heads: 0, versions: 0, gaps: 0, events: 0,
      });
    }
  } finally {
    fixture.cleanup();
  }
});

test('P02 and P03 reject forged fields with matching forged gaps before writes', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = repositoryWithIds(fixture.database, [
      'upstream-p01-stu-01',
      'upstream-p01-stu-02',
      'upstream-p02-stu-02',
    ]);
    const p02Upstream = persistP01(repository, 'stu-01');
    const p03Upstream = persistP02Chain(repository, 'stu-02');
    const cases: Array<{
      taskId: 'P02' | 'P03';
      studentId: string;
      outputId: string;
      upstreamRefs: ProfessionalOutputUpstreamRef[];
    }> = [
      { taskId: 'P02', studentId: 'stu-01', outputId: 'forged-p02', upstreamRefs: [p02Upstream] },
      { taskId: 'P03', studentId: 'stu-02', outputId: 'forged-p03', upstreamRefs: [p03Upstream] },
    ];

    for (const { taskId, studentId, outputId, upstreamRefs } of cases) {
      assert.throws(() => repository.saveDraft({
        outputId,
        studentId,
        taskId,
        expectedStateRevision: 0,
        fields: { ...completeGeneratedFields(taskId), forgedField: '伪造值' },
        upstreamRefs,
        evidenceGaps: {
          forgedField: { gapText: '伪造缺口', nextActionText: '伪造动作' },
        },
      }), /unsupported|field/i);
      assert.deepEqual(mutationCounts(fixture.database, outputId), {
        heads: 0, versions: 0, gaps: 0, events: 0,
      });
    }
  } finally {
    fixture.cleanup();
  }
});

test('P02 and P03 reject forged gap keys even when all output fields are valid', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedBase(fixture.database);
    const repository = repositoryWithIds(fixture.database, [
      'gap-upstream-p01-stu-01',
      'gap-upstream-p01-stu-02',
      'gap-upstream-p02-stu-02',
    ]);
    const p02Upstream = persistP01(repository, 'stu-01');
    const p03Upstream = persistP02Chain(repository, 'stu-02');
    const cases = [
      { taskId: 'P02' as const, studentId: 'stu-01', outputId: 'forged-gap-p02', upstreamRefs: [p02Upstream] },
      { taskId: 'P03' as const, studentId: 'stu-02', outputId: 'forged-gap-p03', upstreamRefs: [p03Upstream] },
    ];

    for (const { taskId, studentId, outputId, upstreamRefs } of cases) {
      assert.throws(() => repository.saveDraft({
        outputId,
        studentId,
        taskId,
        expectedStateRevision: 0,
        fields: completeGeneratedFields(taskId),
        upstreamRefs,
        evidenceGaps: {
          forgedField: { gapText: '无证据', nextActionText: '重新采集' },
        },
      }), /field/i);
      assert.deepEqual(mutationCounts(fixture.database, outputId), {
        heads: 0, versions: 0, gaps: 0, events: 0,
      });
    }
  } finally {
    fixture.cleanup();
  }
});

function completeP01Fields(): Record<string, string> {
  return Object.fromEntries(p01OutputFieldKeys.map((key) => [key, `已填写 ${key}`]));
}

function completeGeneratedFields(taskId: 'P02' | 'P03'): Record<string, string> {
  return Object.fromEntries(professionalOutputSchemaForTask(loadSelfStudyCatalog(), taskId)
    .fields.map(({ key }) => [key, `${taskId} 已填写：${key}`]));
}

function persistP01(
  repository: ProfessionalOutputRepository,
  studentId: string,
): ProfessionalOutputUpstreamRef {
  const output = repository.saveDraft({
    studentId,
    taskId: 'P01',
    expectedStateRevision: 0,
    fields: completeP01Fields(),
    upstreamRefs: [],
  });
  return { outputId: output.head.outputId, version: output.head.currentVersion };
}

function persistP02Chain(
  repository: ProfessionalOutputRepository,
  studentId: string,
): ProfessionalOutputUpstreamRef {
  const p01 = persistP01(repository, studentId);
  const output = repository.saveDraft({
    studentId,
    taskId: 'P02',
    expectedStateRevision: 0,
    fields: completeGeneratedFields('P02'),
    upstreamRefs: [p01],
  });
  return { outputId: output.head.outputId, version: output.head.currentVersion };
}

function repositoryWithIds(
  database: Parameters<typeof seedBase>[0],
  outputIds: string[],
): ProfessionalOutputRepository {
  const remaining = [...outputIds];
  return new ProfessionalOutputRepository(database, () => {
    const outputId = remaining.shift();
    if (!outputId) throw new Error('Test output id queue exhausted.');
    return outputId;
  });
}

function mutationCounts(
  database: Parameters<typeof seedBase>[0],
  outputId: string,
): { heads: number; versions: number; gaps: number; events: number } {
  return {
    heads: database.prepare('SELECT COUNT(*) FROM professional_outputs WHERE output_id = ?').pluck().get(outputId) as number,
    versions: database.prepare('SELECT COUNT(*) FROM professional_output_versions WHERE output_id = ?').pluck().get(outputId) as number,
    gaps: database.prepare('SELECT COUNT(*) FROM output_evidence_gaps WHERE output_id = ?').pluck().get(outputId) as number,
    events: database.prepare(`
      SELECT COUNT(*) FROM learning_events WHERE json_extract(payload_json, '$.outputId') = ?
    `).pluck().get(outputId) as number,
  };
}

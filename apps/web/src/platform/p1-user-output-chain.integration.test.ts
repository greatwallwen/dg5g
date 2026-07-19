import assert from 'node:assert/strict';
import test from 'node:test';
import { evidenceLibraryForTask } from '../features/portfolio/evidence-library.ts';
import { buildP1PortfolioViewModel } from '../features/portfolio/p1-portfolio-model.ts';
import { professionalOutputSchemaForTask } from '../features/portfolio/output-schema.ts';
import { loadSelfStudyCatalog } from '../features/textbook-scene/self-study-content.ts';
import { seedDemo } from './db/demo-seed.ts';
import { migrateDatabase } from './db/migrations.ts';
import { createTestDatabase } from './db/test-database.ts';
import { readP1ProjectProjection } from './p1-project-projection.ts';
import { ProfessionalOutputPortfolioReader } from './professional-output-portfolio-reader.ts';
import {
  maximumPolicyRubricScores,
  seedLegalProfessionalOutputPracticeFacts,
  seedUserFormalAssessment,
} from './professional-output-policy-test-support.ts';
import {
  ProfessionalOutputRepository,
  type P1OutputTaskId,
  type ProfessionalOutputAggregate,
  type ProfessionalOutputUpstreamRef,
} from './professional-output-repository.ts';

const studentId = 'stu-01';
const taskIds = ['P01', 'P02', 'P03'] as const;
const formalScores: Record<P1OutputTaskId, number> = {
  P01: 82,
  P02: 86,
  P03: 90,
};
const expectedTaskScores: Record<P1OutputTaskId, number> = {
  P01: 93,
  P02: 94,
  P03: 96,
};

test('a clean user forms the real P01 to P03 output chain and only three verified facts form the portfolio', () => {
  const fixture = createTestDatabase();
  try {
    migrateDatabase(fixture.database);
    seedDemo(fixture.database);

    assert.equal(fixture.database.prepare(
      "SELECT COUNT(*) FROM users WHERE role = 'student'",
    ).pluck().get(), 3);
    assert.deepEqual(cleanUserFactCounts(), {
      events: 0,
      practiceAttempts: 0,
      formalAttempts: 0,
      outputs: 0,
      frozenScores: 0,
    });

    const initial = readP1ProjectProjection(studentId, fixture.database);
    assert.equal(taskEntryAccess(initial, 'P02'), 'locked');
    assert.equal(taskEntryAccess(initial, 'P03'), 'locked');
    assert.equal(initial.portfolioStatus, 'not-started');

    insertUnboundSubmissionEvent();
    assert.equal(
      taskEntryAccess(readP1ProjectProjection(studentId, fixture.database), 'P02'),
      'locked',
      'an event that is not bound to a persisted owned output must not unlock P02',
    );

    const outputIds = ['user-p01-output', 'user-p02-output', 'user-p03-output'];
    const repository = new ProfessionalOutputRepository(
      fixture.database,
      () => outputIds.shift()!,
    );
    const portfolioReader = new ProfessionalOutputPortfolioReader(fixture.database);
    const outputs = new Map<P1OutputTaskId, ProfessionalOutputAggregate>();
    let upstreamRefs: ProfessionalOutputUpstreamRef[] = [];

    for (const taskId of taskIds) {
      seedLegalProfessionalOutputPracticeFacts(fixture.database, studentId, taskId);
      seedUserFormalAssessment(
        fixture.database,
        studentId,
        taskId,
        formalScores[taskId],
        `chain-${taskId}`,
      );

      const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), taskId);
      const fields = Object.fromEntries(schema.fields.map(({ key }) => [
        key,
        `${taskId} user field value for ${key}`,
      ]));
      const evidenceLinks = evidenceLinksForEveryField(taskId);
      const draft = repository.saveDraft({
        studentId,
        taskId,
        expectedStateRevision: 0,
        fields,
        upstreamRefs,
        evidenceLinks,
      });

      assert.equal(draft.head.status, 'draft');
      assert.equal(draft.head.origin, 'user');
      assert.equal(draft.head.currentVersion, 1);
      assert.deepEqual(Object.keys(draft.versions[0]!.fields).sort(), schema.fields.map(({ key }) => key).sort());
      assert.deepEqual(draft.versions[0]!.upstreamRefs, upstreamRefs);
      assert.deepEqual(draft.versions[0]!.evidenceLinks, evidenceLinks);
      assert.deepEqual(draft.versions[0]!.evidenceGaps, {});
      assert.deepEqual(
        new Set(draft.versions[0]!.fieldSources.map(({ fieldKey }) => fieldKey)),
        new Set(schema.fields.map(({ key }) => key)),
      );
      assert.deepEqual(
        new Set(draft.versions[0]!.fieldSources.map(({ sourceNodeId }) => sourceNodeId)),
        new Set([
          `P1T${taskIds.indexOf(taskId) + 1}-N01`,
          `P1T${taskIds.indexOf(taskId) + 1}-N02`,
          `P1T${taskIds.indexOf(taskId) + 1}-N03`,
        ]),
      );
      assert.deepEqual(sourceAttemptOrigins(draft.head.outputId, 1), ['user']);

      const draftFacts = portfolioReader.read(studentId, taskId);
      assert.equal(draftFacts.output?.head.origin, 'user');
      assert.deepEqual(draftFacts.output?.versions[0]?.fieldSources, draft.versions[0]!.fieldSources);
      assert.ok(Object.values(draftFacts.output?.versions[0]?.evidenceLinks ?? {})
        .flat()
        .every(({ origin }) => origin === 'demo'));

      if (taskId === 'P01') {
        assert.equal(
          taskEntryAccess(readP1ProjectProjection(studentId, fixture.database), 'P02'),
          'locked',
          'a draft head is not a submitted-once unlock fact',
        );
      }
      if (taskId === 'P02') {
        assert.equal(
          taskEntryAccess(readP1ProjectProjection(studentId, fixture.database), 'P03'),
          'locked',
          'P03 stays locked until the persisted P02 draft is submitted',
        );
      }

      let submitted = repository.submit({
        outputId: draft.head.outputId,
        studentId,
        taskId,
        expectedStateRevision: 1,
        fields,
        upstreamRefs,
        evidenceLinks,
      });
      assert.equal(submitted.head.status, 'submitted');
      assert.deepEqual(readSubmissionPayload(submitted.head.outputId, 1), {
        outputId: submitted.head.outputId,
        taskId,
        version: 1,
        stateRevision: 2,
      });

      if (taskId === 'P01') {
        assert.equal(
          taskEntryAccess(readP1ProjectProjection(studentId, fixture.database), 'P02'),
          'open',
          'the repository-created event and its bound output head unlock P02',
        );
        assert.equal(buildPortfolio().items[0]?.status, 'submitted');
        assertPackageNotFormed();

        const returned = repository.reviewSubmitted({
          teacherId: 'teacher-01',
          classId: 'demo-class',
          outputId: submitted.head.outputId,
          expectedStateRevision: 2,
          expectedOutputVersion: 1,
          action: 'return',
          feedback: 'Add the missing endpoint evidence and revise the connection direction.',
          annotations: {
            connectionDirection: 'Show both endpoints and the direction between them.',
          },
        });
        assert.equal(returned.output.head.status, 'returned');
        assert.equal(returned.output.reviewHistory[0]?.outputVersion, 1);
        assert.equal(
          taskEntryAccess(readP1ProjectProjection(studentId, fixture.database), 'P02'),
          'open',
          'a teacher return does not erase the real submitted-once fact',
        );

        const revisedFields = {
          ...fields,
          connectionDirection: 'P01 revised value with both endpoints and explicit direction',
        };
        const revised = repository.saveDraft({
          outputId: submitted.head.outputId,
          studentId,
          taskId,
          expectedStateRevision: 3,
          fields: revisedFields,
          upstreamRefs,
          evidenceLinks,
        });
        assert.equal(revised.head.currentVersion, 2);
        assert.equal(revised.head.status, 'draft');
        assert.equal(revised.versions[0]?.fields.connectionDirection, fields.connectionDirection);
        assert.equal(revised.versions[1]?.fields.connectionDirection, revisedFields.connectionDirection);

        submitted = repository.submit({
          outputId: revised.head.outputId,
          studentId,
          taskId,
          expectedStateRevision: 4,
          fields: revisedFields,
          upstreamRefs,
          evidenceLinks,
        });
        assert.equal(submitted.head.currentVersion, 2);
        assert.equal(submitted.submissionCount, 2);
        assert.deepEqual(readSubmissionPayload(submitted.head.outputId, 2), {
          outputId: submitted.head.outputId,
          taskId,
          version: 2,
          stateRevision: 5,
        });
        assert.equal(
          taskEntryAccess(readP1ProjectProjection(studentId, fixture.database), 'P02'),
          'open',
        );
      }

      if (taskId === 'P02') {
        assert.equal(
          taskEntryAccess(readP1ProjectProjection(studentId, fixture.database), 'P03'),
          'open',
          'the repository-created P02 submission unlocks P03',
        );
      }

      if (taskId === 'P03') {
        const submittedPortfolio = buildPortfolio();
        assert.deepEqual(submittedPortfolio.items.map(({ status }) => status), [
          'verified',
          'verified',
          'submitted',
        ]);
        assertPackageNotFormed();
      }

      const verified = repository.reviewSubmitted({
        teacherId: 'teacher-01',
        classId: 'demo-class',
        outputId: submitted.head.outputId,
        expectedStateRevision: submitted.head.stateRevision,
        expectedOutputVersion: submitted.head.currentVersion,
        action: 'verify',
        feedback: `${taskId} evidence and output fields verified.`,
        rubricScores: maximumPolicyRubricScores(taskId),
      });
      assert.equal(verified.output.head.status, 'verified');
      assert.equal(verified.frozenTaskScore?.officialScore, expectedTaskScores[taskId]);
      assert.equal(verified.frozenTaskScore?.details.output.version, submitted.head.currentVersion);
      assert.equal(verified.frozenTaskScore?.details.nodeTestAttemptId, `chain-${taskId}-attempt`);
      outputs.set(taskId, verified.output);

      if (taskId !== 'P03') assertPackageNotFormed();
      upstreamRefs = [{
        outputId: verified.output.head.outputId,
        version: verified.output.head.currentVersion,
      }];

      seedUserFormalAssessment(
        fixture.database,
        studentId,
        taskId,
        100,
        `later-${taskId}`,
      );
    }

    const projection = readP1ProjectProjection(studentId, fixture.database);
    assert.deepEqual(projection.tasks.map(({ nodeTestHighestScore }) => nodeTestHighestScore), [100, 100, 100]);
    assert.deepEqual(projection.tasks.map(({ frozenFormalScore }) => frozenFormalScore), [82, 86, 90]);
    assert.deepEqual(projection.tasks.map(({ taskCompositeScore }) => taskCompositeScore), [93, 94, 96]);
    assert.ok(projection.tasks.every(({ realTaskCertified }) => realTaskCertified));
    assert.ok(projection.tasks.every(({ demoTaskCertified }) => !demoTaskCertified));
    assert.equal(projection.projectCompositeScore, 94);
    assert.equal(projection.projectCompositeOrigin, 'user');
    assert.equal(projection.portfolioStatus, 'complete');

    const portfolio = buildP1PortfolioViewModel(projection);
    assert.equal(portfolio.packageStatus, 'complete');
    assert.equal(portfolio.projectCompositeScore, 94);
    assert.deepEqual(portfolio.packageReferences, taskIds.map((taskId) => ({
      taskId,
      outputId: outputs.get(taskId)!.head.outputId,
      version: outputs.get(taskId)!.head.currentVersion,
    })));

    for (const taskId of taskIds) {
      const facts = portfolioReader.read(studentId, taskId);
      assert.equal(facts.output?.head.origin, 'user');
      assert.equal(facts.output?.head.status, 'verified');
      assert.equal(facts.assessment?.attemptId, `chain-${taskId}-attempt`);
      assert.equal(facts.assessment?.totalScore, formalScores[taskId]);
      assert.equal(facts.assessment?.origin, 'user');
      const current = facts.output?.versions.find(({ version }) => (
        version === facts.output?.head.currentVersion
      ));
      assert.ok(Object.values(current?.evidenceLinks ?? {}).flat()
        .every(({ origin }) => origin === 'demo'));
      assert.deepEqual(sourceAttemptOrigins(current!.outputId, current!.version), ['user']);
    }

    const demoProjection = readP1ProjectProjection('stu-03', fixture.database);
    const demoPortfolio = buildP1PortfolioViewModel(demoProjection);
    assert.ok(demoProjection.tasks.every(({ realTaskCertified }) => !realTaskCertified));
    assert.ok(demoProjection.tasks.every(({ demoTaskCertified }) => demoTaskCertified));
    assert.ok(demoProjection.tasks.every(({ outputOrigin }) => outputOrigin === 'demo'));
    assert.equal(demoProjection.projectCompositeOrigin, 'demo');
    assert.equal(demoPortfolio.packageStatus, 'demo-complete');
    assert.ok(demoPortfolio.items.every(({ statusLabel }) => statusLabel.includes('演示数据')));
    assert.match(demoPortfolio.projectCompositeScoreLabel, /演示数据/);

    function cleanUserFactCounts(): Record<string, number> {
      return {
        events: count('SELECT COUNT(*) FROM learning_events WHERE student_id = ?', studentId),
        practiceAttempts: count('SELECT COUNT(*) FROM practice_attempts WHERE student_id = ?', studentId),
        formalAttempts: count('SELECT COUNT(*) FROM formal_attempts WHERE student_id = ?', studentId),
        outputs: count('SELECT COUNT(*) FROM professional_outputs WHERE student_id = ?', studentId),
        frozenScores: count('SELECT COUNT(*) FROM frozen_task_scores WHERE student_id = ?', studentId),
      };
    }

    function insertUnboundSubmissionEvent(): void {
      fixture.database.prepare(`
        INSERT INTO learning_events (
          event_id, student_id, node_id, channel, event_type, payload_json, origin
        ) VALUES (?, ?, 'P1T1-N04', 'self-study', 'evidence_submitted', ?, 'user')
      `).run(
        'unbound-p01-submission',
        studentId,
        JSON.stringify({
          taskId: 'P01',
          outputId: 'missing-output-head',
          version: 1,
          stateRevision: 1,
        }),
      );
    }

    function sourceAttemptOrigins(outputId: string, version: number): string[] {
      return fixture.database.prepare(`
        SELECT DISTINCT attempt.origin
        FROM output_field_sources AS source
        INNER JOIN practice_attempts AS attempt
          ON attempt.attempt_id = source.source_attempt_id
        WHERE source.output_id = ? AND source.version = ?
        ORDER BY attempt.origin
      `).pluck().all(outputId, version) as string[];
    }

    function readSubmissionPayload(outputId: string, version: number): Record<string, unknown> {
      const value = fixture.database.prepare(`
        SELECT payload_json FROM learning_events
        WHERE event_type = 'evidence_submitted'
          AND json_extract(payload_json, '$.outputId') = ?
          AND json_extract(payload_json, '$.version') = ?
        ORDER BY occurred_at DESC, event_id DESC LIMIT 1
      `).pluck().get(outputId, version) as string;
      return JSON.parse(value) as Record<string, unknown>;
    }

    function buildPortfolio(): ReturnType<typeof buildP1PortfolioViewModel> {
      return buildP1PortfolioViewModel(readP1ProjectProjection(studentId, fixture.database));
    }

    function assertPackageNotFormed(): void {
      const portfolio = buildPortfolio();
      assert.equal(portfolio.packageStatus, 'not-formed');
      assert.equal(portfolio.projectCompositeScore, undefined);
      assert.deepEqual(portfolio.packageReferences, []);
    }

    function count(sql: string, ...params: unknown[]): number {
      return fixture.database.prepare(sql).pluck().get(...params) as number;
    }
  } finally {
    fixture.cleanup();
  }
});

function evidenceLinksForEveryField(
  taskId: P1OutputTaskId,
): Record<string, string[]> {
  const schema = professionalOutputSchemaForTask(loadSelfStudyCatalog(), taskId);
  const definitions = evidenceLibraryForTask(taskId);
  return Object.fromEntries(schema.fields.map(({ key }) => {
    const evidence = definitions.find(({ allowedFieldKeys }) => allowedFieldKeys.includes(key));
    assert.ok(evidence, `Missing ${taskId} evidence definition for ${key}.`);
    return [key, [evidence.evidenceId]];
  }));
}

function taskEntryAccess(
  projection: ReturnType<typeof readP1ProjectProjection>,
  taskId: 'P02' | 'P03',
): 'unpublished' | 'locked' | 'open' {
  return projection.tasks.find((task) => task.taskId === taskId)!.nodes[0]!.access;
}

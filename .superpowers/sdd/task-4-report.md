# Task 4 report — independent server-graded formal assessment

Status: **DONE_WITH_CONCERNS**

Task 4 is complete and its focused, full-unit, type, structure, production-build, security-bundle, and browser checks pass. The remaining concern is the pre-existing repository-wide capability-map asset audit described below.

## Delivered

- Added authenticated `/learn/[nodeId]/test` and `/api/learning/nodes/[nodeId]/assessment` surfaces for the P01 `P1T1-N02` assessment.
- Kept the public paper answer-free and the private rubric server-only. Papers use SHA-256-at-rest, single-use tokens bound to student, node, version, and assessment instance.
- Paper issuance now requires both authoritative node access and the persisted `micro-practice-passed` milestone. The GET contract returns a clear `422` prerequisite state instead of issuing a paper early.
- Submission accepts exactly `{ answers }`; forged score fields, invalid option IDs, wrong ordering membership, stale tokens, and reused tokens are rejected before grading.
- Persisted the assessment, normalized answers, four-dimension diagnostics, and remediation targets transactionally with `origin='user'`.
- Removed the permanent three-attempt lock. A failed attempt may be retried only after each target has a real, passed `practice_attempts` row for the same user, node, and activity after that failed assessment.
- Mapped the four formal dimensions to four distinct, genuine activities:
  - evidence classification;
  - link reconstruction;
  - defect diagnosis and revision (`P1T1-N02-remediation-revision-01`), requiring revised source evidence, photo indices, and direction;
  - professional conclusion (`P1T1-N02-remediation-conclusion-01`), requiring confirmed fact, evidence gap, risk, and action.
- Generated the two new remediation activities through `scripts/import_5g/p1_demo_content.py`; generated textbook content was not edited as an independent source.
- When the ignored authoring media root is absent, the importer now recovers source ownership from persisted lesson-AST relationship IDs and the authoritative DOCX, then intersects that ownership with the tracked runtime closure. This restores the exact 13 `/media/5g/*` references without admitting the unrelated topology asset or modifying media files.
- Preserved the Task 3 invariant of exactly six base P01 activities while allowing the two transfer/remediation-only activities in the complete catalog.
- Remediation links now use `/learn/P1T1-N02?section=practice&activityId=...`; the learning page validates the target, opens practice, and focuses the exact activity card.
- The `game-topology` graph node now opens `/learn/P1T1-N02/test`. Pointer activation distinguishes a click from graph panning, synthetic assistive clicks remain operable without double-firing physical clicks, and the D3 zoom behavior uses an explicit measured extent.
- Challenge-mode classroom follow exposes exactly one primary formal-test action and one secondary self-study return.

## RED/GREEN evidence

The review fixes were driven by failing contracts for issuance readiness, activity-specific retry evidence, semantic remediation mappings, exact remediation focus, graph routing, classroom primary-action policy, exact-once pointer/keyboard/synthetic activation, the explicit D3 zoom extent, and source-owned runtime-media recovery.

Focused activity and assessment suite:

```text
pnpm exec tsx --test \
  src/features/learning-activities/activity-evaluator.test.ts \
  src/features/learning-activities/activity-workbench-contract.test.tsx \
  src/features/learning-activities/p1-activity-contract.test.ts \
  src/platform/formal-assessment-service.test.ts
23 tests, 23 pass, 0 fail
```

Final integration regressions:

```text
python -m unittest scripts.import_5g.test_p1_demo_content -v
1 test, 1 pass

graph activation + semantic graph + P1 activity contracts
10 tests, 10 pass, 0 fail

deriveGeneratedP1MediaUrls(textbook/5g/generated/p1-demo-content.json)
22 refs accepted: 13 source images + 9 Manim refs
```

Full verification with Node `20.20.2`:

```text
pnpm web:test:unit       564 tests, 564 pass, 0 fail
pnpm typecheck           PASS
pnpm web:check-structure PASS
pnpm web:build           PASS
git diff --check         PASS (line-ending notices only)
```

Production client-bundle scan:

```text
rg -n "acceptedOptionIds|orderedOptionIds|requiredOptionIds|forbiddenOptionIds|conclusionCriteria|answerModel|correctAnswer" apps/web/.next/static
PASS: no private rubric/model-answer keys found
```

## Production browser audit

The audit used a disposable migrated/seeded SQLite database and the production Next.js build.

- A physical click on `[data-graph-node-id="game-topology"]` navigated from `/course` to `/learn/P1T1-N02/test`.
- A deliberately incorrect real submission returned `5 / 100` and four distinct remediation links.
- The defect link navigated to `/learn/P1T1-N02?section=practice&activityId=P1T1-N02-remediation-revision-01`, opened the practice tab, focused the exact card, and rendered its three revision inputs.
- In a legally advanced challenge classroom, `data-primary-action-policy="exactly-one"`, formal CTA count was `1`, primary-action count was `1`, its href was `/learn/P1T1-N02/test`, and the secondary self-study return count was `1`.
- Fresh post-build graph and classroom checks reported `0` console errors and `0` warnings.
- Disposable database and log artifacts were removed after verification.

## Security and transaction self-review

- Raw paper tokens are returned once and never persisted; only their 64-character SHA-256 hashes are stored.
- Wrong student, route-node mismatch, version/instance tamper, expiry, reuse, and stale double-issued papers are rejected.
- A forced database failure rolls back token state, assessment state, attempt persistence, and snapshot updates.
- Public projections deep-copy questions/options and never serialize private rubric fields.
- Retry readiness cannot be satisfied by generic section completion or an unrelated activity attempt.

## Remaining concern

Fresh `pnpm qa:gates` output reaches and passes the structure and dark-engineering audits, then stops at the repository's existing capability-map media check:

```text
apps/web structure check passed
audit:dark-engineering-ui: failures 0
audit:capability-map: capability map v3 audit failed (1)
- expert capability SVG asset is missing
```

This missing protected-media asset is outside Task 4 and predates these changes. Task 4 did not modify authoritative or verified media files.

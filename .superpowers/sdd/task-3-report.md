# Task 3 Report: Resumable and Timed Formal Assessments

## Status

Complete. P01, P02, and P03 N02 formal assessments now use server-owned 15-minute instances, resumable drafts, strict expiry, equivalent A/B papers, progressive correction, and relational classroom assessment runs.

## Implemented contract

- `openOrResume` reopens the same running student-and-node instance without resetting `assessmentId` or `expiresAt`; refresh issues another usable token and successful submission atomically consumes every sibling token for that assessment and student.
- Self-study uses the catalog 15-minute duration. Classroom delivery is bound only to schema-12 `classroom_assessment_runs` and its authoritative expiry; legacy `state_json.formalTest` cannot authorize a paper.
- Draft PATCH accepts exactly `{ answers, expectedRevision }`. First write requires revision zero, every successful write increments once, and stale CAS produces 409 with no overwrite.
- Assessment requests are capped at 64 KiB. Persisted drafts are capped at 32 KiB, individual strings at 2,000 characters, arrays at both a defensive global maximum and the stored paper option count, and every non-empty option ID is checked against the instance question version. Partial ordering placeholders remain legal.
- Expiry closes the instance atomically, keeps the latest saved draft read-only, creates no score or formal attempt, and exposes only an explicit `restart=true` path.
- P01/P02/P03 each provide two distinct equivalent papers. Version choice is server-owned and historical instances always restore their stored version.
- Failure guidance progresses from diagnosis, to rule location, to a four-line worked correction. Every task-specific level-three example states the wrong evidence, applicable rule, revision action, and professional conclusion before the next equivalent-paper rotation.
- The client derives time from `expiresAt - (serverNow + performance elapsed)`, autosaves after 500 ms through a serialized/coalescing coordinator, restores native uncontrolled fields from the saved draft, and performs one direct final POST at zero without native-validity blocking.
- Failed draft saves preserve the newest local pending edit and stop automatic retries; the learner can retry explicitly or save the next edit. Any POST 410 moves the UI to read-only expiry with no displayed score.

## TDD and review evidence

- Initial RED covered missing resume, strict draft CAS, relational classroom authority, A/B variants, and progressive correction.
- Review RED then reproduced four concrete gaps: reversed concurrent refresh responses invalidating the older token, unknown/oversized draft writes, missing repository size defense, and absent task-specific worked corrections.
- Review GREEN: all four focused regressions passed; POST received the same bounded-body defense with zero-write assertions.
- Formal assessment focused suite: 48/48 passed.
- Route and UI lifecycle subset after component extraction: 27/27 passed.
- Relational legacy-fixture regressions: 2/2 passed.
- Full final unit suite: 706/706 passed on Node 20.20.2.
- Final TypeScript check: passed.
- Final structure gate: passed.
- `git diff --check`: passed.

## Scope and schema

- No new migration or schema version was added; implementation uses existing schema-12 assessment instance, token, draft, lesson-run, and classroom-run tables.
- No generated textbook content, protected databases, authoritative media, or evidence bundles were edited.
- Core service/catalog work was checkpointed in `da3d12f`; the final Task 3 commit contains route, client, limits, review corrections, fixture alignment, and this report.

Final commit subject: `feat: make formal assessments resumable and timed`

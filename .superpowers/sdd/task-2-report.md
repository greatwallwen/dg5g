# Task 2 Report: Unified Real Learning Activity Facts

## Status

Complete. Task 2 now has one append-only practice-attempt fact model for self-study and classroom delivery, persistent self-study resume, explicit reading completion, and projections that derive classroom submission state only from real classroom-delivery attempts.

## Implemented contract

- Added strict delivery metadata for `self-study` and `classroom`; public `classroomRunId` is stored against `practice_attempts.classroom_run_id` and validated against `classroom_lesson_runs.lesson_run_id`.
- Reworked activity attempts as immutable facts with caller-supplied attempt IDs, canonical activity IDs, attempt numbers, diagnostics, field feedback, correction paths, artifacts, delivery metadata, pass state, and snapshot version.
- Stores the complete result envelope in `result_json`. Exact replay returns the original envelope and does not advance the clock; reuse of an attempt ID with different actor, activity, response, or delivery facts returns a conflict.
- Performs snapshot advancement and attempt insertion in one immediate transaction so rollback cannot leave a version without its fact.
- Added authenticated `GET` progress restoration and strict `POST` bodies to the activity-attempt route. Classroom writes require class membership, joined participation, the active lesson run and node, and an exact cursor `canonicalActivityId` match.
- Updated the workbench to restore persisted progress, generate a fresh immutable attempt ID per real submission, and support both delivery channels.

## Learning and classroom truth

- Self-study cursors now write only `problem`, `figure`, `steps`, `correction`, `practice`, or `output`; legacy seeded playback action IDs remain readable and are migrated on save.
- Cursor persistence occurs on node/section changes, activity attempts, unload, and initial restoration.
- The first four reading sections append one fact only after the learner selects `完成本段并继续`; there is no batch-completion shortcut.
- Practice completion is driven only by a passed activity attempt. Professional output completion remains driven by the authoritative output submission path.
- Retired generic `activity_submitted`/`classroom_activity_submitted` completion authority. The compatibility parser remains only so the legacy endpoint can reject it explicitly without side effects.
- Classroom roster and authoritative snapshot submitted counts now derive from `practice_attempts` whose delivery channel, session, run/node, actor, and origin match the active classroom facts.
- Updated the architecture gate to require rejection of the legacy generic writer and forbid its old repository/event authority.

## TDD evidence

- Initial focused RED: 25 tests, 14 passed, 11 failed for the missing immutable attempt, classroom authority, cursor, renderer, and generic-event rejection contracts.
- Focused GREEN: 26/26 passed.
- Integration contract set: 63/63 passed after replacing legacy expectations with canonical reading and real-attempt facts.
- Full final unit suite: 680/680 passed.
- Fresh final TypeScript check: passed.
- `git diff --check`: passed.

## Structure gate

The two Task 2-touched files initially over the structure limits were brought below them by extracting reading-fact persistence and compacting the practice-attempt row type. `pnpm web:check-structure` now reports exactly one remaining failure: the untouched, branch-pre-existing `apps/web/src/platform/db/migrations.test.ts` is 854 lines against an 800-line limit. Task 2 does not modify or absorb that separate test-structure repair.

## Independent review corrections

- Bound classroom activity aggregation to the exact `classroom_sessions.active_lesson_run_id`; attempts from a closed or otherwise non-active run no longer count in either the roster or authoritative snapshot.
- Added a cursor persistence coordinator that ignores a restore resolving after learner interaction, serializes writes, coalesces rapid navigation to the latest section, and routes unload cleanup through the same ordered queue.
- Review RED: the new focused suite failed for the missing coordinator and both stale-run aggregates.
- Review GREEN: focused regression suite 25/25 passed; expanded Task 2 suite 49/49 passed; full unit suite, TypeScript check, and `git diff --check` passed.
- Final lifecycle review then exposed two deeper cursor paths: a targeted practice attempt did not mark local interaction, and unload queued behind an in-flight request instead of dispatching immediately.
- The final correction treats every practice attempt as local navigation, immediately flushes the unload cursor, attaches a client-monotonic mutation timestamp, and makes the SQLite repository ignore a delayed older mutation even if it reaches the server last.
- Final lifecycle RED reproduced all paths at client, renderer-contract, route, and repository levels. Final GREEN: focused lifecycle suite 21/21, full unit suite 687/687, TypeScript check, structure gate, and `git diff --check` all passed.

## Scope boundary and concerns

- This commit establishes the shared activity contract and truthful projections; it does not claim the end-to-end classroom activity UI, which remains Task 8.
- Legacy action parsing is intentionally retained only at the rejection boundary for older clients; it cannot write completion facts.
- No generated content, authoritative media, databases, or protected evidence were edited.

Commit subject: `feat: unify real learning activity facts`

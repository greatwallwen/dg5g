# Task 4 report — independent server-graded formal assessment

Status: **DONE_WITH_CONCERNS**

The Task 4 product and security acceptance checks pass. The only remaining concern is an unrelated repository-wide asset gate: `pnpm qa:gates` stops in `audit:capability-map` because the expert capability SVG asset is missing. Task 4 does not modify protected capability-map media.

## Delivered

- Added authenticated `/learn/[nodeId]/test` and `/api/learning/nodes/[nodeId]/assessment` surfaces for the P01 `P1T1-N02` assessment.
- Split the answer-free public contract from `formal-assessment-catalog.server.ts`; the client imports only the public contract.
- Added a SHA-256-at-rest, single-use token bound to student, node, question version, and assessment instance.
- Made paper issuance atomically consume and close every prior active paper for the same student/node before creating the new paper. A stale pre-issued token cannot bypass the relearning gate.
- The submission route accepts exactly `{ answers }`; top-level or nested forged score fields are rejected.
- The server validates option IDs and exact ordering membership before applying the private rubric.
- The professional conclusion is a structured four-part response: confirmed fact, evidence gap, risk, and executable action. Each part has a private, field-specific rubric and meaningful-length requirement, so a keyword list cannot receive full marks.
- Persisted `assessment_id`, question version, normalized answers, four-dimension diagnostics, remediation targets, and `origin='user'` in one transaction.
- Failed attempts require every stable `{ nodeId, sectionId }` remediation target to be completed through user-origin practice evidence before a new paper can be issued. No Task 3 implementation module is imported.
- Removed the permanent three-attempt lock from command, projection, roster, challenge, classroom, and retired embedded-game paths. The old embedded panel is now a compatibility link to the independent assessment and cannot submit a client score.
- Replaced fragile controlled selectors with native form controls and `FormData` serialization. A real Playwright check persisted radio and checkbox state, the form validated, and the answer-only POST completed.

## RED evidence

The work followed red-green cycles:

1. Service tests initially failed because the formal assessment service/catalog did not exist.
2. Route test initially failed because the independent assessment route did not exist.
3. Forged-score and attempt-limit tests initially failed because the legacy endpoint accepted score-bearing writes and the command service threw the three-attempt error.
4. UI contract tests initially failed because the independent result/client/page and stylesheet did not exist.
5. Mastery regression initially returned only three attempts when four were expected.
6. Review hardening tests failed against the first implementation:
   - double-issued papers left the older token usable;
   - structured conclusions were rejected because the service accepted only one free-text string;
   - option allowlist checks were absent;
   - the public/private catalog split was absent;
   - the controlled selector regression lacked native `FormData` controls;
   - the retired embedded game still contained client scoring and a permanent `Math.min(3, ...)` cutoff.

Representative RED command:

```text
fnm use 20.20.2
pnpm exec tsx --test src/platform/formal-assessment-service.test.ts src/platform/formal-assessment-ui.test.tsx
Result before hardening: 6 pass, 11 fail
```

## GREEN evidence

Focused Task 4 suite:

```text
pnpm exec tsx --test src/platform/formal-assessment-service.test.ts src/platform/formal-assessment-ui.test.tsx
18 tests, 18 pass, 0 fail
```

Additional affected UI contracts:

```text
pnpm exec tsx --test src/platform/formal-assessment-ui.test.tsx src/features/textbook-scene/node-access-consumers.test.ts src/features/classroom/student-supervision-roster.test.tsx
17 tests, 17 pass, 0 fail
```

Full verification, all with Node `20.20.2`:

```text
pnpm web:test:unit       533 tests, 533 pass, 0 fail
pnpm typecheck           PASS
pnpm web:check-structure PASS
pnpm build               PASS
git diff --check         PASS (line-ending notices only)
```

Production client-bundle scan:

```text
rg -n "acceptedOptionIds|orderedOptionIds|requiredOptionIds|forbiddenOptionIds|conclusionCriteria" apps/web/.next/static
PASS: no private rubric keys in apps/web/.next/static
```

The focused assessment client chunk also contains no private rubric or model-answer keys.

## Authenticated browser audit

- Logged in through the real student login with a disposable migrated/seeded SQLite database.
- Desktop assessment rendered four question groups and the structured four-part conclusion.
- Playwright checked a radio and checkbox and confirmed both DOM states remained `true`.
- HTML form validity was `true` after selecting the five ordering controls and filling all four conclusion fields.
- Captured POST body contained exactly the `answers` object and no score.
- Server returned HTTP 200; the page rendered remediation state, `18 / 100`, four dimension cards, and four targeted relearning links.
- A fresh navigation rendered `先完成定向再学` with the four targets instead of issuing a retry.
- At 390×844, `documentElement.scrollWidth === innerWidth === 390`; all four question groups and all four conclusion fields remained present.
- Browser console: 0 warnings, 0 errors.
- Evidence: `output/playwright/task4-final-assessment-desktop.png`, `task4-final-result-desktop.png`, and `task4-final-assessment-mobile.png` (local ignored audit artifacts).

## Security and transaction self-review

- Raw token is returned once and never stored; the database contains only a 64-character SHA-256 hash.
- Wrong student, route-node mismatch, token-version tamper, assessment-instance tamper, expiry, reuse, and stale double-issued token are rejected.
- Unknown/duplicate choice IDs and incomplete/duplicated ordering values are rejected before grading and do not consume the token.
- A forced database trigger failure after token consumption rolls back token state, instance state, attempt persistence, and snapshot changes; the same token can submit successfully once the trigger is removed.
- The page authenticates before node access and paper issuance.
- Public paper projection deep-copies question/options and never serializes private rubric fields.
- Result dimensions use exactly `evidenceClassification`, `linkReconstruction`, `defectiveOutputRevision`, and `professionalConclusion`.
- No permanent retry count exists; only persisted targeted relearning controls a retry after failure.

## Remaining concern

Fresh `pnpm qa:gates` output:

```text
apps/web structure check passed
audit:dark-engineering-ui: failures 0
audit:capability-map: capability map v3 audit failed (1)
- expert capability SVG asset is missing
```

This failure is outside Task 4 and predates its changes. The authoritative/verified media boundary was left untouched as required.

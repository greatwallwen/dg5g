# P1 Image2 Design QA

final result: passed

## Acceptance scope

- Contract: `docs/design/image2/image2-route-contract.json` version 2.
- Matrix: 16 surfaces, 24 actor-scoped states, 1440x900, 1920x1080 and 390x844.
- Product path: login, student home, teacher workbench, P1/P01-P03, three N02 lessons, N04 outputs, classroom follow/self/entry, teacher console, projector, portfolio and course graph.
- Gates: required DOM regions, one explicit primary-action policy, horizontal overflow, console/page errors, keyboard focus, reduced motion, screenshot SHA, authoritative revision/version and the complete one-teacher/three-student journey.

## Reference system

- `docs/design/image2/dgbook-image2-login-dark-v4.png`
- `docs/design/image2/dgbook-image2-learning-dark-v4.png`
- `docs/design/image2/dgbook-image2-pixi-dark-v4.png`
- `docs/design/image2/dgbook-image2-teacher-dark-v4.png`
- `docs/design/image2/dgbook-image2-student-follow-dark-v4.png`
- `docs/design/image2/dgbook-image2-capability-graph-dark-v4.png`

The implementation uses the selected references as a coherent product system: deep navy engineering surfaces, cyan current action, green completion, amber returned/review state, compact radii, 1px structural borders and real SVG icons. Derived states preserve hierarchy and interaction semantics without claiming false pixel identity.

## Current audit log

- Final evidence run: `task8-final6-20260716T0455Z`.
- The static v2 route/reference contract and 12 visual-audit regression tests pass.
- The Image2 runtime matrix produced 120/120 screenshots with zero layout, route, selector, primary-action, keyboard, motion, console or page-error failures.
- The complete one-teacher/three-student journey passes with synchronized follow-mode students, an isolated self-study student, preserved personal cursor, P01/P02/P03 professional outputs, teacher verification, complete portfolio and graph refresh.
- Entry/project, learning/follow and teacher/projector/graph surfaces were independently implemented and reviewed.
- Earlier Task8-A auxiliary captures containing a Next error overlay (`no such column: current_version`) were rejected as evidence. Final evidence must be generated from one fresh temporary SQLite database, one migration/reset and one server lifecycle.
- Visual review found and returned these issues before acceptance: mobile P1 task-title truncation, mobile classroom connection-badge clipping, mobile N02 top-rail crowding, and an overly permissive incomplete-portfolio primary-action policy.
- `portfolio/incomplete` is now explicitly read-only with `primaryActionPolicy: none`.
- Final original-resolution review covered student and teacher login, P01/P02/P03 homes and project states, all three N02 figures, formal-test mobile replay, N04 returned/draft/submitted states, classroom follow/self/entry, teacher console, projector, course graph and incomplete/complete portfolios. Product P0: 0. Product P1: 0.
- Accepted non-blocking audit P2: some internal-scroller states can produce identical viewport/full-page/bottom hashes because Playwright full-page capture follows the document scroller rather than the component scroller. The required evidence files are present and the affected product surfaces were reviewed directly.

## Required final evidence

- `output/playwright/<run-id>/image2-layout/report.json` with zero failures and no console/page errors.
- All contract screenshots with non-empty SHA-256 values; long P1/N04/portfolio states also include full-page and bottom captures.
- `output/playwright/<run-id>/p1-complete-journey/report.json` proving teacher entry, three student modes, synchronized classroom revision, preserved self-study cursor, three professional outputs, teacher verification, complete portfolio and graph refresh.
- Manual original-resolution review of representative desktop, large-desktop, mobile, full-page and bottom captures with P0/P1 count equal to zero.

Final local matrix and manual visual review both passed on `task8-final6-20260716T0455Z`.

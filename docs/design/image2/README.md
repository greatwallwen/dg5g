# DGBook Image2 v2 Route and Reference Contract

`image2-route-contract.json` is the machine-readable Image2 review contract. Contract version 2 describes 16 surfaces and 24 deterministic states for the one-teacher/three-student P1 sample. It is a target and audit contract; it does not claim that every runtime selector is already implemented.

## Contract unit

The review unit is `surface/state + actor + viewportProfile`, not a route alone. Every state declares:

- `route` and `query`, kept separate so the captured URL can be compared exactly;
- a named actor and explicit fixture/setup operation;
- all required selectors and named screenshot regions;
- exactly one visual source: a direct `reference` or `derivedFrom` one or more authoritative state keys;
- a `primaryActionPolicy` of `exactly-one`, `at-most-one`, or `none`;
- allowed internal scrollers and shared overflow, keyboard, reduced-motion and primary-action checks; and
- viewport, full-page and bottom screenshot requirements.

The three viewport profiles are:

| Profile | Size | Use |
| --- | ---: | --- |
| `desktop-1440` | 1440x900 | Main product baseline |
| `desktop-1920` | 1920x1080 | Large desktop baseline |
| `mobile-390` | 390x844 | Full mobile acceptance; projector is an explicit responsive smoke |

Mobile coverage is mandatory for login, both role homes, P1, all three N02 pages, all three N04 pages, portfolio, teacher session, all student classroom modes, projector, and the course graph. Omitting `mobile-390` is a contract failure.

## P1 sample matrix

| Surface | States and actors | Route |
| --- | --- | --- |
| Login | student / teacher | `/` |
| Student home | P01 stu-01 / P02 stu-02 / P03 stu-03 | `/student/home` |
| Teacher workbench | teacher01 | `/teacher/workbench` |
| P1 project | P01 / P02 / P03 current | `/student/projects/p1` |
| Three N02 pages | figure state for stu-01 / stu-02 / stu-03 | `/learn/P1T1-N02`, `/learn/P1T2-N02`, `/learn/P1T3-N02` |
| Formal test | open | `/learn/P1T1-N02?mode=challenge` |
| Three N04 pages | returned / draft / submitted | each N04 route with `?mode=challenge` |
| Portfolio | incomplete / complete | `/student/projects/p1/portfolio` |
| Teacher session | teaching | `/teacher/sessions/demo-class` |
| Student classroom | follow / self / entry-or-left | `/classroom/demo-class` |
| Projector | active read-only | `/present/demo-class` |
| Course graph | P1 current | `/course` |

The classroom route identifies the real session. Its current node and unit come from session data; a node ID is never used as a session ID. Formal testing uses the real `?mode=challenge` query and never the retired `?state=formal-test` capture fiction.

## Direct V4 references

Exactly six states own direct product-design references:

| State key | File |
| --- | --- |
| `login/student` | `dgbook-image2-login-dark-v4.png` |
| `course-graph/P1-current` | `dgbook-image2-capability-graph-dark-v4.png` |
| `n02-p01/figure` | `dgbook-image2-learning-dark-v4.png` |
| `teacher-session/teaching` | `dgbook-image2-teacher-dark-v4.png` |
| `student-follow/follow` | `dgbook-image2-student-follow-dark-v4.png` |
| `formal-test/open` | `dgbook-image2-pixi-dark-v4.png` |

All other states use `derivedFrom` and resolve directly to these selected files. A derived state compares shared hierarchy, tokens and geometry; it must not claim false pixel similarity to a different state.

## Shared interaction contract

- The document must not overflow by more than 1px, and hiding document overflow is not an accepted fix. Only `allowedInternalScrollers` may scroll internally.
- Every primary control uses `[data-primary-action]`. `exactly-one` means one visible, enabled action; `none` is deliberate for read-only submitted/complete/projector states.
- Keyboard review covers visible focus, Enter/Space activation, Escape drawer close and focus return. Sticky controls must not cover required regions.
- The reduced-motion path uses `(prefers-reduced-motion: reduce)` plus `[data-motion="paused|reduced"]`; non-essential animation is disabled without hiding state.
- Long P1, N04 and portfolio states produce viewport, full-page and bottom evidence. The screenshot name is `<surface>--<state>--<actor>--<viewport>.png`.

The textbook remains one-way: narration and animation may focus content, but there is no student dialogue, tutor Q&A or teacher-private information on student/projector surfaces.

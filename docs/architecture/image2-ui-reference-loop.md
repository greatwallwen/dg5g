# Image2 v2 UI Reference Loop

## Purpose and authority

`docs/design/image2/image2-route-contract.json` is the single route/state inventory for Image2 capture and layout review. Version 2 replaces the old nine-route desktop list with a 24-state, actor-scoped P1 sample matrix. Capture tools, layout audits and the complete journey consume this contract instead of maintaining private route lists.

This layer is static architecture. It does not mutate React, CSS, authentication, classroom state, learning state or SQLite.

## Resolution model

The stable key is `<surface>/<state>`. A state supplies:

```text
route + query
actor + setup
viewportProfiles
requiredSelectors + regions
reference XOR derivedFrom
primaryActionPolicy + allowedInternalScrollers + checks
screenshotPolicy
```

Six states point directly at stored Image2 V4 files. Every `derivedFrom` entry points directly to one of those six authoritative state keys; derivation is not recursive and never invents a future image filename.

The real shared classroom is `demo-class`:

- teacher: `/teacher/sessions/demo-class`
- student: `/classroom/demo-class`
- projector: `/present/demo-class`

The active node/unit and revision remain session data. The formal-test route is `/learn/P1T1-N02?mode=challenge`; the three N04 professional-output states also use `?mode=challenge`.

## Capture loop

For every state and viewport profile:

1. Create the declared actor context and apply only the declared setup fixture/actions.
2. Navigate to `route + query` and record the actual URL.
3. Wait for fonts, images, critical API calls and the state selector, then pause non-essential motion.
4. Confirm every required selector and named region.
5. Enforce the state’s `exactly-one`, `at-most-one` or `none` primary-action policy.
6. Audit document overflow, allowed internal scrollers, clickable intersections, keyboard order/focus return and reduced-motion state.
7. Capture the declared viewport evidence; P1, N04 and portfolio also require full-page and bottom captures.
8. Name evidence `<surface>--<state>--<actor>--<viewport>.png` and report contract version, setup, SHA-256, actual URL, actor, state, revision and snapshotVersion.

Viewport profiles are `desktop-1440` (1440x900), `desktop-1920` (1920x1080) and `mobile-390` (390x844). The projector’s mobile pass is a responsive smoke; every other listed state receives full mobile acceptance.

## Interaction and accessibility gates

Overflow checks compare both `documentElement.scrollWidth` and `body.scrollWidth` with the viewport plus the 1px tolerance. `overflow: hidden` on the document is not evidence of correctness. Required regions and the primary action must retain a clickable intersection; long-page content keeps at least a 16px gap from sticky actions.

Keyboard review uses Tab/Shift+Tab ordering, visible focus, Enter/Space activation and Escape for modal/drawer close with focus returned to the opener. Overlay focus must not leak to the background.

The reduced-motion review emulates `(prefers-reduced-motion: reduce)`, requires `[data-motion]` to resolve to `paused` or `reduced`, and verifies that state remains understandable with non-essential movement disabled.

## Audit boundary

`scripts/image2-route-contract.test.mjs` owns schema and mutation tests for the full state/actor/390 matrix, real `demo-class` routes, real challenge query, six reference mappings, long-page captures and interaction policies.

`scripts/audit-image2-reference.mjs` validates only the v2 static contract, these two documents and the six stored V4 files. It reports surfaces, states, actors, resolved routes and viewport profiles. Browser behavior belongs to later capture/layout/journey scripts and cannot be inferred from a green static audit.

Acceptance requires both the contract test and reference audit to pass. Neither gate permits restoring the retired node-session routes, `?state=formal-test`, the clickable classroom mini-path, or a two-desktop-only matrix.

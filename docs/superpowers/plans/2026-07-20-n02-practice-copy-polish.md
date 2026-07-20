# N02 Practice Interaction and Copy Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `P1T1-N02 · 设备拓扑` self-study exercises easier for non-specialist students by replacing cramped form-like controls with lightweight card matching, path-building, and flip-card interactions, while removing system/AI-flavored student copy.

**Architecture:** Keep the existing activity IDs, response payloads, server evaluation rules, and SQLite learning events unchanged. Improve only the student-facing interaction components, CSS layout, and visible copy so existing formal tests, remediations, and portfolio links keep working.

**Tech Stack:** Next.js 14, React function components, TypeScript, CSS modules in `apps/web/src/app/*.css`, Node test runner.

## Global Constraints

- Do not change the three demo-student baseline or learning state machine.
- Do not edit `docs/guides/dgbook-p1-使用教程.md` or its PDF.
- Do not rename internal `output`/`professionalOutput` data fields for copy polish.
- Keep activity response contracts unchanged: `assignments`, `order`, `fields`, `revisions`.
- Student-visible copy should prefer `记录`, `证据表`, `整理`, `提交后提示`, `学习档案`, and avoid `服务端规则`, `汇入`, `产出` on self-study pages where not necessary.

---

### Task 1: N02 foundation card matching

**Files:**
- Modify: `apps/web/src/features/learning-activities/activity-controls.tsx`
- Modify: `apps/web/src/app/learning-activities.css`
- Test: `apps/web/src/features/learning-activities/activity-controls.test.tsx`

**Interfaces:**
- Consumes: `ActivityPublicDto` for `P1T1-N02-foundation-01`.
- Produces: the same `onValueChange(material.id, category.id)` assignments as before.

- [ ] Add a focused render test asserting the foundation activity exposes one `data-evidence-match-board`, three `data-evidence-match-card`, and three `data-evidence-match-target` elements.
- [ ] Replace the narrow three-column board with a wider card-matching layout: selected evidence card on the left, three target trays on the right, and selected assignments shown as chips.
- [ ] Keep keyboard/touch buttons at least 44px high and preserve retry/submit behavior.

### Task 2: N02 application path builder

**Files:**
- Modify: `apps/web/src/features/learning-activities/activity-controls.tsx`
- Modify: `apps/web/src/app/learning-activities.css`
- Test: `apps/web/src/features/learning-activities/activity-controls.test.tsx`

**Interfaces:**
- Consumes: `link-reconstruction` materials.
- Produces: the same ordered string array via `onOrderChange`.

- [ ] Add a render test for `data-link-path-board`, `data-link-path-slot`, and candidate cards.
- [ ] Replace the plain ordered list with a horizontal BBU → ODF → ODF → AAU path lane and candidate cards.
- [ ] Preserve exact sequence semantics and disabled selected candidates.

### Task 3: N02 transfer flip-card record

**Files:**
- Modify: `apps/web/src/features/learning-activities/activity-controls.tsx`
- Modify: `apps/web/src/app/learning-activities.css`
- Test: `apps/web/src/features/learning-activities/activity-controls.test.tsx`

**Interfaces:**
- Consumes: `structured-record` fields.
- Produces: the same `fields` map via `onValueChange`.

- [ ] Add a render test asserting transfer structured-record exposes `data-record-flip-card` and `data-record-evidence-form`.
- [ ] Add a reveal/flip control for evidence hints before the form.
- [ ] Keep all existing inputs and labels accessible.

### Task 4: Student copy de-AI pass

**Files:**
- Modify: `apps/web/src/features/learning-activities/activity-workbench.tsx`
- Modify: `apps/web/src/features/learning-activities/activity-controls.tsx`
- Modify: `apps/web/src/features/textbook-scene/self-study-types.ts`
- Modify: `apps/web/src/features/textbook-scene/self-study-renderer.tsx`
- Modify: `apps/web/src/features/textbook-scene/self-study-secondary-sections.tsx`
- Test: `apps/web/src/features/textbook-scene/self-study-renderer-contract.test.tsx`

**Interfaces:**
- Consumes: existing `selfStudySectionDefinitions`.
- Produces: six-section self-study navigation where the final visible label is `记录`, while internal section id remains `output`.

- [ ] Update contract tests from final tab `产出` to visible label `记录`.
- [ ] Replace student-facing `服务端规则评估`, `提交岗位作答`, `汇入`, and self-study final-section `产出` wording with textbook-like copy.
- [ ] Keep formal professional-output pages unchanged except where they are reached through N04 challenge surfaces.

### Task 5: Verification and remote-ready gate

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: all changes above.
- Produces: green local evidence before commit/deploy.

- [ ] Run focused tests for activity controls and self-study renderer.
- [ ] Run `pnpm typecheck`, `pnpm web:test:unit`, `pnpm web:check-structure`, and `pnpm build`.
- [ ] Capture `/learn/P1T1-N02?section=practice` screenshot and confirm first card is no longer squeezed to ~123px.

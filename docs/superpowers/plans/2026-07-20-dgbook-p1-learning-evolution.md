# DGBook P1 Learning Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended only when the user explicitly requests parallel agents) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the P01 sample easier for ordinary students by adding a beginner-friendly “在哪里、是谁、连到哪” learning path, richer visual scaffolding, targeted practice feedback, and teacher-ready explanation hooks without changing the existing state machine or assessment authority.

**Architecture:** Keep the existing P1 content authority and learning surfaces. Update the generated P1 runtime content for P01/N02 copy and practice materials, add small view-model helpers for beginner scaffolds, render the helper UI in existing self-study sections, and improve the P01 teacher package copy. Pixi deep integration is deferred to a later phase; Phase 1 prepares compatible content and HTML-first interaction affordances.

**Tech Stack:** Next.js App Router, React function components, TypeScript ESM, pnpm workspace, Node 20.20.2, pnpm 9.15.0, existing SQLite authority, existing P1 generated JSON runtime content, existing HTML activity controls, existing Pixi packages untouched in Phase 1.

## Global Constraints

- Do not edit generated build output by hand.
- Do not bypass SQLite authority with browser state or duplicated mock statistics.
- Keep exactly three demo students for this sample.
- Keep student, teacher, projector, project, portfolio, and capability-map surfaces reading the existing authority paths.
- Do not change formal assessment scoring authority; formal tests remain independent server-graded pages.
- Do not let local game scores or visual interactions directly create capability mastery.
- Do not touch `.git/`, databases, `content/5g/5g.docx`, verified media, or current guide delivery files.
- Preserve the user’s current uncommitted guide changes in `docs/guides/dgbook-p1-使用教程.md` and `docs/guides/dgbook-p1-使用教程.pdf`.
- Use Node `20.20.2` and pnpm `9.15.0` for verification commands.

---

## Scope Check

This plan implements Phase 1 from `docs/superpowers/specs/2026-07-20-dgbook-p1-learning-evolution-design.md`.

Included:

- P1T1-N02 beginner scaffold in content and UI.
- P1T1-N02 visual explanation of what evidence can and cannot prove.
- P1T1-N02 practice copy and targeted feedback upgrade.
- P01 teacher package “one screen, one question, one action” copy upgrade.
- Tests that lock down the beginner path and prevent state-machine shortcuts.

Deferred:

- Pixi evidence-detective production integration.
- P01 N01/N03/N04 full game reskin.
- P02/P03 migrated visual simplification.
- Deployment screenshots/tutorial regeneration.

## File Structure

### Modify

- `textbook/5g/generated/p1-demo-content.json`
  - Source of P1 runtime content. Update only P1T1-N02 copy and practice material fields for Phase 1.
- `apps/web/src/features/platform/p1-content.ts`
  - Extend the deep self-study schema only if needed for beginner scaffolds. Keep the extension optional and backwards-compatible for P1T2-N02/P1T3-N02.
- `apps/web/src/features/platform/p1-content.test.ts`
  - Add content contract assertions for P1T1-N02 beginner scaffold and three-question evidence language.
- `apps/web/src/features/textbook-scene/self-study-primary-sections.tsx`
  - Render beginner scaffold, proof/limit copy, and evidence-field mapping in existing sections.
- `apps/web/src/features/textbook-scene/self-study-primary-sections.test.tsx`
  - Add rendering tests for the beginner scaffold.
- `apps/web/src/features/textbook-scene/self-study-practice-section.tsx`
  - Add small labels and error-type copy around existing `ActivityWorkbench`; do not change attempt submission authority.
- `apps/web/src/features/textbook-scene/self-study-practice-section.test.tsx`
  - Add rendering tests for the scaffolded practice levels and no mastery shortcut.
- `apps/web/src/features/learning-activities/activity-controls.tsx`
  - Add optional instructional hints for classification and sequence controls based on existing activity metadata.
- `apps/web/src/features/learning-activities/activity-workbench.tsx`
  - Surface targeted error type and correction path more clearly after failed server evaluation.
- `apps/web/src/features/textbook-scene/annotated-engineering-figure.tsx`
  - Add evidence color legend and “can prove / cannot prove” captions for topology.
- `apps/web/src/features/textbook-scene/annotated-engineering-figure.test.tsx`
  - Add contract tests for non-overlapping legend and proof-limit captions.
- `apps/web/src/features/textbook-scene/p01-teaching-package.ts`
  - Rewrite P01 N02 teaching package copy for ordinary students while preserving existing page count and fields.
- `apps/web/src/features/textbook-scene/p01-teaching-package-view.test.tsx`
  - Assert each page has opening question, analogy/action, common error, prompt, student action, transition.

### Do Not Modify in Phase 1

- `packages/widgets/src/edugame-pixi/*`
- `apps/web/src/platform/learning-command-service.ts`
- `apps/web/src/platform/formal-assessment-*`
- `apps/web/src/features/portfolio/*`
- `apps/web/src/app/learn/[nodeId]/test/page.tsx`
- `docs/guides/dgbook-p1-使用教程.md`
- `docs/guides/dgbook-p1-使用教程.pdf`

---

## Task 1: Content Contract for Beginner Scaffold

**Files:**

- Modify: `apps/web/src/features/platform/p1-content.ts`
- Modify: `apps/web/src/features/platform/p1-content.test.ts`
- Modify: `textbook/5g/generated/p1-demo-content.json`

**Interfaces:**

- Consumes: existing `P1DeepNodeContent`.
- Produces: optional `beginnerScaffold` on deep self-study content:

```ts
export interface P1BeginnerScaffold {
  simpleMission: string;
  analogy: string;
  threeQuestions: Array<{
    id: 'where' | 'who' | 'connects-to';
    question: string;
    evidenceType: string;
    proves: string;
    cannotProve: string;
    outputFields: string[];
  }>;
  completionStandard: string[];
}
```

- Later tasks render `content.beginnerScaffold` when present.
- P1T2-N02 and P1T3-N02 may omit `beginnerScaffold`.

- [ ] **Step 1: Write the failing schema test**

Add this test case to `apps/web/src/features/platform/p1-content.test.ts` near existing generated-content contract tests:

```ts
test('P1T1-N02 provides a beginner three-question scaffold without changing authority flow', () => {
  const content = loadP1DemoContent();
  const node = content.tasks[0].nodes.find((item) => item.id === 'P1T1-N02');
  assert.equal(node?.selfStudy.kind, 'deep');
  if (!node || node.selfStudy.kind !== 'deep') throw new Error('P1T1-N02 deep content missing');

  assert.deepEqual(
    node.selfStudy.beginnerScaffold?.threeQuestions.map((item) => item.id),
    ['where', 'who', 'connects-to'],
  );
  assert.match(node.selfStudy.beginnerScaffold?.simpleMission ?? '', /在哪里|是谁|连到哪/);
  assert.match(node.selfStudy.beginnerScaffold?.analogy ?? '', /快递|包裹|编号|送到/);
  assert.match(node.selfStudy.beginnerScaffold?.completionStandard.join('') ?? '', /成果字段|证据|缺口/);
  assert.equal(node.requiresFormalTest, true);
  assert.equal(node.requiresProfessionalOutput, false);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run:

```powershell
fnm exec --using 20.20.2 pnpm.cmd --filter @dgbook/web test -- p1-content.test.ts
```

Expected:

```text
FAIL ... beginnerScaffold
```

If the project test runner does not accept the file argument, run:

```powershell
fnm exec --using 20.20.2 pnpm.cmd web:test:unit
```

Expected: the new test fails before implementation.

- [ ] **Step 3: Extend the TypeScript content type**

In `apps/web/src/features/platform/p1-content.ts`, add `P1BeginnerScaffold` near the practice interfaces and add this optional field to `P1DeepNodeContent`:

```ts
  beginnerScaffold?: P1BeginnerScaffold;
```

- [ ] **Step 4: Extend validation without breaking P1T2/P1T3**

In `validateDeepSelfStudyContent`, allow `beginnerScaffold` as an optional key:

```ts
const deepKeys = [
  'kind', 'nodeId', 'caseBackground', 'taskQuestion', 'prerequisites', 'glossary',
  'annotatedFigures', 'evidenceRules', 'reasoningSteps', 'examples', 'counterexamples',
  'practices', 'transferTask', 'outputTemplate', 'rubric',
];
if ('beginnerScaffold' in content) deepKeys.push('beginnerScaffold');
exactKeys(content, deepKeys, path);
```

Then add a validator:

```ts
function validateBeginnerScaffold(value: unknown, path: string): void {
  const scaffold = objectValue(value, path);
  exactKeys(scaffold, ['simpleMission', 'analogy', 'threeQuestions', 'completionStandard'], path);
  nonEmptyString(scaffold.simpleMission, `${path}.simpleMission`);
  nonEmptyString(scaffold.analogy, `${path}.analogy`);
  stringArray(scaffold.completionStandard, `${path}.completionStandard`, 2);
  const questions = arrayValue(scaffold.threeQuestions, `${path}.threeQuestions`);
  if (questions.length !== 3) invalid(`${path}.threeQuestions`, 'expected exactly three beginner questions');
  const expectedIds = ['where', 'who', 'connects-to'];
  questions.forEach((questionValue, index) => {
    const questionPath = `${path}.threeQuestions[${index}]`;
    const question = objectValue(questionValue, questionPath);
    exactKeys(question, ['id', 'question', 'evidenceType', 'proves', 'cannotProve', 'outputFields'], questionPath);
    exactValue(question.id, expectedIds[index]!, `${questionPath}.id`);
    nonEmptyString(question.question, `${questionPath}.question`);
    nonEmptyString(question.evidenceType, `${questionPath}.evidenceType`);
    nonEmptyString(question.proves, `${questionPath}.proves`);
    nonEmptyString(question.cannotProve, `${questionPath}.cannotProve`);
    stringArray(question.outputFields, `${questionPath}.outputFields`, 1);
  });
}
```

Call it after glossary validation:

```ts
if ('beginnerScaffold' in content) {
  validateBeginnerScaffold(content.beginnerScaffold, `${path}.beginnerScaffold`);
}
```

- [ ] **Step 5: Add P1T1-N02 beginner scaffold to JSON**

In `textbook/5g/generated/p1-demo-content.json`, under `P1T1-N02.selfStudy`, add this exact sibling near `taskQuestion`:

```json
"beginnerScaffold": {
  "simpleMission": "你要帮远程复核员判断：这台设备在哪里、是不是它、线连到哪。先回答这三个问题，再写职业结论。",
  "analogy": "查快递不能只看包裹近照，还要知道包裹在哪个仓、包裹编号是谁、从哪里送到哪里。设备拓扑也是一样：近照只是线索，不是完整证据链。",
  "threeQuestions": [
    {
      "id": "where",
      "question": "在哪里？",
      "evidenceType": "位置证据",
      "proves": "设备属于哪个站点、机房、机柜和槽位。",
      "cannotProve": "不能单独证明设备身份，也不能证明线缆连接方向。",
      "outputFields": ["机房/机柜/槽位", "采集范围", "照片索引"]
    },
    {
      "id": "who",
      "question": "是谁？",
      "evidenceType": "设备身份",
      "proves": "设备型号、序列号、铭牌和现场对象能互相回指。",
      "cannotProve": "不能单独证明这台设备与另一端已经连接。",
      "outputFields": ["设备型号", "序列号", "铭牌证据", "对象回指"]
    },
    {
      "id": "connects-to",
      "question": "连到哪？",
      "evidenceType": "连接方向",
      "proves": "源端口、路径、中间跳接和对端端口能按顺序复核。",
      "cannotProve": "不能用两个孤立端口近照替代中间路径证据。",
      "outputFields": ["源端口", "路径/跳接", "对端端口", "证据缺口"]
    }
  ],
  "completionStandard": [
    "能把位置、身份、方向三类证据分别挂到成果字段。",
    "能说明每类证据能证明什么、不能证明什么。",
    "遇到缺图、遮挡、冲突或无权操作时，能写出缺口和下一步复核动作。"
  ]
},
```

- [ ] **Step 6: Run focused tests**

Run:

```powershell
fnm exec --using 20.20.2 pnpm.cmd --filter @dgbook/web test -- p1-content.test.ts
```

Expected:

```text
PASS ... p1-content.test.ts
```

- [ ] **Step 7: Commit Task 1**

Run:

```powershell
git add -- apps/web/src/features/platform/p1-content.ts apps/web/src/features/platform/p1-content.test.ts textbook/5g/generated/p1-demo-content.json
git commit -m "feat: add P01 beginner learning scaffold"
```

Before committing, run `git status -sb` and confirm `docs/guides/dgbook-p1-使用教程.md` and `.pdf` are not staged.

---

## Task 2: Render Beginner Scaffold and Evidence Proof Limits

**Files:**

- Modify: `apps/web/src/features/textbook-scene/self-study-primary-sections.tsx`
- Modify: `apps/web/src/features/textbook-scene/self-study-primary-sections.test.tsx`
- Modify: `apps/web/src/features/textbook-scene/annotated-engineering-figure.tsx`
- Modify: `apps/web/src/features/textbook-scene/annotated-engineering-figure.test.tsx`
- Modify: `apps/web/src/app/self-study-textbook.css`

**Interfaces:**

- Consumes: `DeepSelfStudyContent.beginnerScaffold`.
- Produces: semantic DOM markers:

```text
data-beginner-scaffold="P1T1-N02"
data-beginner-question="where|who|connects-to"
data-proof-limit="where|who|connects-to"
data-evidence-color="position|identity|direction|gap"
```

- [ ] **Step 1: Write failing render tests**

Add to `apps/web/src/features/textbook-scene/self-study-primary-sections.test.tsx`:

```ts
test('P1T1-N02 problem section renders beginner three-question scaffold', () => {
  const document = requireSelfStudyDocument('P1T1-N02');
  const html = renderToStaticMarkup(<ProblemSection document={document} />);
  assert.match(html, /data-beginner-scaffold="P1T1-N02"/);
  assert.match(html, /在哪里/);
  assert.match(html, /是谁/);
  assert.match(html, /连到哪/);
  assert.match(html, /快递/);
  assert.match(html, /成果字段/);
});

test('P1T1-N02 figure section states what each evidence type cannot prove', () => {
  const document = requireSelfStudyDocument('P1T1-N02');
  const html = renderToStaticMarkup(<FigureSection document={document} />);
  assert.match(html, /data-proof-limit="where"/);
  assert.match(html, /不能单独证明设备身份/);
  assert.match(html, /data-proof-limit="connects-to"/);
  assert.match(html, /不能用两个孤立端口近照替代中间路径证据/);
});
```

Add to `apps/web/src/features/textbook-scene/annotated-engineering-figure.test.tsx`:

```ts
test('topology figure renders the fixed evidence color legend', () => {
  const html = renderToStaticMarkup(<AnnotatedEngineeringFigure kind="topology" />);
  assert.match(html, /data-evidence-color="position"/);
  assert.match(html, /位置/);
  assert.match(html, /data-evidence-color="identity"/);
  assert.match(html, /身份/);
  assert.match(html, /data-evidence-color="direction"/);
  assert.match(html, /方向/);
  assert.match(html, /data-evidence-color="gap"/);
  assert.match(html, /缺口/);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```powershell
fnm exec --using 20.20.2 pnpm.cmd web:test:unit
```

Expected: the new render tests fail before UI implementation.

- [ ] **Step 3: Render beginner scaffold in `ProblemSection`**

In `apps/web/src/features/textbook-scene/self-study-primary-sections.tsx`, add this helper below `SelfStudyGlossary`:

```tsx
function BeginnerScaffold({ document }: { document: SelfStudyDocument }) {
  const { content } = document;
  if (content.kind !== 'deep' || !content.beginnerScaffold) return null;
  return (
    <section className="self-study-beginner-scaffold" data-beginner-scaffold={document.nodeId}>
      <header>
        <span>新手三问法</span>
        <strong>{content.beginnerScaffold.simpleMission}</strong>
        <p>{content.beginnerScaffold.analogy}</p>
      </header>
      <div className="self-study-three-question-grid">
        {content.beginnerScaffold.threeQuestions.map((item) => (
          <article data-beginner-question={item.id} key={item.id}>
            <span>{item.evidenceType}</span>
            <h3>{item.question}</h3>
            <p><strong>能证明：</strong>{item.proves}</p>
            <p><strong>不能证明：</strong>{item.cannotProve}</p>
            <small>进入成果字段：{item.outputFields.join('、')}</small>
          </article>
        ))}
      </div>
      <ul>
        {content.beginnerScaffold.completionStandard.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}
```

Then call it inside `ProblemSection`, after prerequisite knowledge:

```tsx
<BeginnerScaffold document={document} />
```

- [ ] **Step 4: Render proof limits in `FigureSection`**

Inside the existing `self-study-figure-support` block, after evidence rules, add:

```tsx
{content.kind === 'deep' && content.beginnerScaffold ? (
  <aside className="self-study-proof-limits">
    <span>这类证据不能替代什么</span>
    {content.beginnerScaffold.threeQuestions.map((item) => (
      <article data-proof-limit={item.id} key={item.id}>
        <strong>{item.evidenceType}</strong>
        <p><b>能证明：</b>{item.proves}</p>
        <p><b>不能证明：</b>{item.cannotProve}</p>
      </article>
    ))}
  </aside>
) : null}
```

- [ ] **Step 5: Render evidence color legend in topology figure**

In `AnnotatedEngineeringFigure`, add this block before `<figcaption>`:

```tsx
{kind === 'topology' ? (
  <ul className="engineering-evidence-legend" aria-label="证据颜色图例">
    <li data-evidence-color="position"><i />位置：在哪里</li>
    <li data-evidence-color="identity"><i />身份：是谁</li>
    <li data-evidence-color="direction"><i />方向：连到哪</li>
    <li data-evidence-color="gap"><i />缺口：还不能判断</li>
  </ul>
) : null}
```

- [ ] **Step 6: Add CSS**

Append to `apps/web/src/app/self-study-textbook.css`:

```css
.self-study-beginner-scaffold {
  display: grid;
  gap: 16px;
  margin-top: 18px;
  padding: 18px;
  border: 1px solid rgba(59,130,246,.22);
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(14,165,233,.10), rgba(16,185,129,.08));
}

.self-study-beginner-scaffold header,
.self-study-beginner-scaffold article {
  display: grid;
  gap: 8px;
}

.self-study-beginner-scaffold header > span,
.self-study-proof-limits > span {
  color: #0f766e;
  font-size: 13px;
  font-weight: 900;
  letter-spacing: .08em;
}

.self-study-three-question-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.self-study-three-question-grid article,
.self-study-proof-limits article {
  border: 1px solid rgba(15,118,110,.18);
  border-radius: 18px;
  padding: 14px;
  background: rgba(255,255,255,.78);
}

.self-study-three-question-grid h3 {
  margin: 0;
  font-size: 22px;
}

.self-study-proof-limits {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.engineering-evidence-legend {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.engineering-evidence-legend li {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(15,23,42,.12);
  border-radius: 999px;
  padding: 7px 10px;
  background: rgba(255,255,255,.82);
  font-size: 12px;
  font-weight: 800;
}

.engineering-evidence-legend i {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #38bdf8;
}

.engineering-evidence-legend [data-evidence-color="identity"] i { background: #22c55e; }
.engineering-evidence-legend [data-evidence-color="direction"] i { background: #f97316; }
.engineering-evidence-legend [data-evidence-color="gap"] i { background: #facc15; }

@media (max-width: 820px) {
  .self-study-three-question-grid,
  .engineering-evidence-legend {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Run focused tests**

Run:

```powershell
fnm exec --using 20.20.2 pnpm.cmd web:test:unit
```

Expected: new scaffold render tests pass. Existing unrelated tests may still expose the known cursor ordering issue; if so, record it separately and verify these new tests pass.

- [ ] **Step 8: Commit Task 2**

Run:

```powershell
git add -- apps/web/src/features/textbook-scene/self-study-primary-sections.tsx apps/web/src/features/textbook-scene/self-study-primary-sections.test.tsx apps/web/src/features/textbook-scene/annotated-engineering-figure.tsx apps/web/src/features/textbook-scene/annotated-engineering-figure.test.tsx apps/web/src/app/self-study-textbook.css
git commit -m "feat: render P01 beginner evidence scaffold"
```

Before committing, run `git status -sb` and confirm guide files are not staged.

---

## Task 3: Practice Feedback and Activity Hints

**Files:**

- Modify: `textbook/5g/generated/p1-demo-content.json`
- Modify: `apps/web/src/features/textbook-scene/self-study-practice-section.tsx`
- Modify: `apps/web/src/features/textbook-scene/self-study-practice-section.test.tsx`
- Modify: `apps/web/src/features/learning-activities/activity-controls.tsx`
- Modify: `apps/web/src/features/learning-activities/activity-workbench.tsx`
- Modify: `apps/web/src/features/learning-activities/activity-workbench.test.tsx` if present; otherwise add assertions to the nearest existing activity test.

**Interfaces:**

- Consumes existing activity metadata:
  - `activity.kind`
  - `activity.prompt`
  - `activity.materials`
  - `activity.feedback`
  - `activity.correctionPath`
- Produces DOM markers:

```text
data-activity-hint="evidence-classification|link-reconstruction|structured-record|defective-sheet-revision"
data-correction-path-visible="true"
```

- [ ] **Step 1: Write failing practice render tests**

Add to `apps/web/src/features/textbook-scene/self-study-practice-section.test.tsx`:

```ts
test('P1T1-N02 practice levels expose beginner-friendly job actions', () => {
  const document = requireSelfStudyDocument('P1T1-N02');
  const html = renderToStaticMarkup(
    <PracticeSection document={document} passedIds={[]} onPass={() => undefined} />,
  );
  assert.match(html, /证据分类/);
  assert.match(html, /链路重建/);
  assert.match(html, /结构化记录/);
  assert.match(html, /data-activity-kind="evidence-classification"/);
  assert.match(html, /data-activity-kind="link-reconstruction"/);
  assert.match(html, /data-activity-kind="structured-record"/);
});
```

If `ActivityWorkbench` has a test file, add:

```ts
test('activity workbench renders correction-path affordance without creating mastery', () => {
  const activity = publicActivityFromPractice(
    requireSelfStudyDocument('P1T1-N02').content.kind === 'deep'
      ? requireSelfStudyDocument('P1T1-N02').content.practices.foundation[0]
      : undefined as never,
    'P1T1-N02',
  );
  assert.ok(activity);
  const html = renderToStaticMarkup(
    <ActivityWorkbench activity={activity} level="foundation" levelLabel="基础练习" passed={false} onPass={() => undefined} />,
  );
  assert.match(html, /data-activity-hint="evidence-classification"/);
  assert.doesNotMatch(html, /能力达成/);
  assert.doesNotMatch(html, /教师认证/);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```powershell
fnm exec --using 20.20.2 pnpm.cmd web:test:unit
```

Expected: new practice tests fail before implementation.

- [ ] **Step 3: Update P1T1-N02 practice prompts and feedback**

In `textbook/5g/generated/p1-demo-content.json`, update only P1T1-N02 practices to follow this content intent:

- `P1T1-N02-foundation-01`
  - prompt includes `把材料卡分到“在哪里、是谁、连到哪、不能直接用”`
  - failed feedback includes `近照不能自动证明位置和方向`
  - correction path includes `先看是否有机房/机柜回指`, `再看铭牌是否与现场对象同框`, `最后看源端口到对端是否连续`
- `P1T1-N02-application-01`
  - prompt includes `按源端口、路径、中间跳接、对端端口重建链路`
  - failed feedback includes `跳过中间路径会让链路不可复核`
  - correction path includes `把 ODF 或配线架作为独立对象登记`
- `P1T1-N02-transfer-01`
  - prompt includes `把判断写入成果字段`
  - failed feedback includes `只写结论不写证据索引不能交付`
  - correction path includes `每个字段写清材料、依据、结论`

Do not change activity IDs.

- [ ] **Step 4: Add activity hints in `ActivityControl`**

At the top of the return blocks in `ActivityControl`, add small hint sections:

For `link-reconstruction`:

```tsx
<p className="activity-control-hint" data-activity-hint={activity.kind}>
  按“源端口 → 路径 → 中间跳接 → 对端端口”排序；看不见的中间段要登记缺口，不能靠经验补齐。
</p>
```

For `structured-record`:

```tsx
<p className="activity-control-hint" data-activity-hint={activity.kind}>
  每个字段都要写“材料—依据—结论”，不要只写最终判断。
</p>
```

For `defective-sheet-revision`:

```tsx
<p className="activity-control-hint" data-activity-hint={activity.kind}>
  先改产生错误的字段和证据挂接，再改最终结论；只改结论不算修复。
</p>
```

For classification default:

```tsx
<p className="activity-control-hint" data-activity-hint={activity.kind}>
  先判断材料回答的是“在哪里、是谁、连到哪”，回答不了就放入不能直接用。
</p>
```

- [ ] **Step 5: Improve failed feedback visibility**

In `ActivityWorkbench`, change the failed feedback block to always mark correction visibility:

```tsx
<div
  className="self-study-practice-feedback"
  data-correction-path-visible={result && !result.passed && result.correctionPath.length ? 'true' : undefined}
  hidden={!result && !requestError}
  role="status"
>
```

Do not call `onPass` unless `payload.passed` is true.

- [ ] **Step 6: Add CSS for hints**

Append to `apps/web/src/app/self-study-textbook.css`:

```css
.activity-control-hint {
  margin: 8px 0 12px;
  border-left: 4px solid #38bdf8;
  border-radius: 12px;
  padding: 10px 12px;
  background: rgba(56,189,248,.10);
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
}
```

- [ ] **Step 7: Run tests**

Run:

```powershell
fnm exec --using 20.20.2 pnpm.cmd web:test:unit
```

Expected: activity and practice tests pass, and no test shows Pixi/local score as mastery.

- [ ] **Step 8: Commit Task 3**

Run:

```powershell
git add -- textbook/5g/generated/p1-demo-content.json apps/web/src/features/textbook-scene/self-study-practice-section.tsx apps/web/src/features/textbook-scene/self-study-practice-section.test.tsx apps/web/src/features/learning-activities/activity-controls.tsx apps/web/src/features/learning-activities/activity-workbench.tsx apps/web/src/app/self-study-textbook.css
git add -- apps/web/src/features/learning-activities/activity-workbench.test.tsx
git commit -m "feat: clarify P01 activity feedback"
```

If `activity-workbench.test.tsx` does not exist and was not created, omit it from `git add`.

---

## Task 4: Teacher Package Copy for Ordinary Students

**Files:**

- Modify: `apps/web/src/features/textbook-scene/p01-teaching-package.ts`
- Modify: `apps/web/src/features/textbook-scene/p01-teaching-package-view.test.tsx`

**Interfaces:**

- Consumes existing `P01TeachingPage`.
- Produces no new runtime fields in Phase 1.
- Strengthens existing fields:
  - `title`
  - `projectorContent.prompt`
  - `teacherExplanation`
  - `caseQuestion`
  - `typicalAnswer`
  - `commonErrors`
  - `followUpPrompts`
  - `studentAction`
  - `transition`

- [ ] **Step 1: Write failing teacher-package tests**

Add to `apps/web/src/features/textbook-scene/p01-teaching-package-view.test.tsx`:

```ts
test('P01 teaching package keeps two six-page lessons with beginner-friendly classroom actions', () => {
  assert.equal(p01TeachingPackage.length, 2);
  for (const lesson of p01TeachingPackage) {
    assert.equal(lesson.pages.length, 6);
    for (const page of lesson.pages) {
      const combined = [
        page.title,
        page.projectorContent.prompt,
        page.teacherExplanation,
        page.caseQuestion,
        page.typicalAnswer,
        page.commonErrors.join(' '),
        page.followUpPrompts.join(' '),
        page.studentAction,
        page.transition,
      ].join(' ');
      assert.match(combined, /在哪里|是谁|连到哪|证据|缺口|成果|复核/);
      assert.ok(page.studentAction.length >= 20, `${page.id} student action too short`);
      assert.ok(page.typicalAnswer.length >= 40, `${page.id} typical answer too short`);
      assert.ok(page.commonErrors.length >= 2, `${page.id} common errors missing`);
      assert.ok(page.followUpPrompts.length >= 2, `${page.id} follow-up prompts missing`);
    }
  }
});
```

- [ ] **Step 2: Run test and confirm failure if current copy is insufficient**

Run:

```powershell
fnm exec --using 20.20.2 pnpm.cmd web:test:unit
```

Expected: the new test fails on at least one page if copy is not beginner-friendly enough.

- [ ] **Step 3: Rewrite P01 N02 page copy without changing shape**

In `apps/web/src/features/textbook-scene/p01-teaching-package.ts`, keep the existing `lessonOnePages` and `lessonTwoPages` arrays, keep 12 pages, and revise the copy to this pattern:

Page 1:

```ts
title: '先别急着认设备：一张近照为什么不够？',
projectorContent: {
  title: '三问法：在哪里、是谁、连到哪',
  prompt: '如果你只能补拍三张照片，你会分别证明哪三个问题？',
  ...
},
teacherExplanation: '先用查快递类比降低门槛：只看包裹近照，不能知道包裹在哪个仓、编号是谁、从哪里送到哪里。设备拓扑也一样，清晰近照只是线索，不能替代位置、身份和方向三类证据。',
```

Page 2:

```ts
title: '在哪里：把设备放回唯一现场',
projectorContent.prompt: '哪几张材料能把 BBU 定位到 B1 西区、机柜 02、槽位 3？',
```

Page 3:

```ts
title: '是谁：铭牌必须能回指现场对象',
projectorContent.prompt: '只有型号没有序列号，能不能确认就是工单里的那台设备？',
```

Page 4:

```ts
title: '连到哪：从源端口追到对端端口',
projectorContent.prompt: '中间路径被挡住时，应该写满足、异常，还是待复核？',
```

Page 5:

```ts
title: '合起来：三类证据怎样进入同一条判断链',
projectorContent.prompt: '同一张照片可以支持两个字段吗？条件是什么？',
```

Page 6:

```ts
title: '完整示例：把证据链写成职业结论',
projectorContent.prompt: '请用不超过 80 字写出带对象、端口和证据索引的结论。',
```

Lesson 2 pages must use:

- `三问法快速复盘`
- `带 ODF 的链路重建`
- `铭牌挂错反例`
- `方向证据中断反例`
- `成果表修订`
- `迁移任务和正式测试入口`

Each page must include at least one of:

- `在哪里`
- `是谁`
- `连到哪`
- `证据缺口`
- `成果字段`
- `待复核`
- `异常`

- [ ] **Step 4: Run teacher package tests**

Run:

```powershell
fnm exec --using 20.20.2 pnpm.cmd web:test:unit
```

Expected: teacher package tests pass.

- [ ] **Step 5: Commit Task 4**

Run:

```powershell
git add -- apps/web/src/features/textbook-scene/p01-teaching-package.ts apps/web/src/features/textbook-scene/p01-teaching-package-view.test.tsx
git commit -m "feat: simplify P01 teacher explanations"
```

---

## Task 5: Phase 1 Verification and Router Receipt

**Files:**

- Modify or create: `docs/superpowers/reflections/2026-07-20-dgbook-p1-learning-evolution-phase1.md`
- No business code changes in this task except test-driven fixes for defects found during verification.

**Interfaces:**

- Consumes commits from Tasks 1-4.
- Produces a reflection file containing:
  - decisions kept;
  - tests run;
  - known unrelated failures;
  - cleanup/preservation check;
  - next phase recommendation.

- [ ] **Step 1: Run focused structural checks**

Run:

```powershell
fnm exec --using 20.20.2 pnpm.cmd typecheck
```

Expected:

```text
exit code 0
```

Run:

```powershell
fnm exec --using 20.20.2 pnpm.cmd web:check-structure
```

Expected:

```text
exit code 0
```

- [ ] **Step 2: Run unit tests**

Run:

```powershell
fnm exec --using 20.20.2 pnpm.cmd web:test:unit
```

Expected:

```text
All new P01 learning-evolution tests pass.
```

If the known `self-study-cursor-repository.test.ts` ordering failure remains, record it as unrelated only if the failure text still refers to cursor ordering and no new P01 learning-evolution test fails.

- [ ] **Step 3: Run production build only if typecheck and unit tests are clean or only known unrelated failure remains**

Run:

```powershell
fnm exec --using 20.20.2 pnpm.cmd build
```

Expected:

```text
Compiled successfully
```

- [ ] **Step 4: Browser smoke path**

Run local app:

```powershell
fnm exec --using 20.20.2 pnpm.cmd dev
```

Open these paths manually or with Playwright:

```text
/student/home
/learn/P1T1-N02
/teacher/workbench
/teacher/sessions/demo-p1
```

Expected:

- P1T1-N02 shows the three-question scaffold.
- The topology figure shows evidence color legend.
- Practice cards show beginner hints.
- Teacher P01 pages still show 12 total pages.
- No page shows “能力达成” merely because the scaffold or practice UI rendered.

- [ ] **Step 5: Write phase reflection**

Create `docs/superpowers/reflections/2026-07-20-dgbook-p1-learning-evolution-phase1.md`:

```markdown
# DGBook P1 Learning Evolution Phase 1 Reflection

## Decisions Kept

- P01/P1T1-N02 is the high-fidelity sample center.
- Formal tests remain server-graded.
- Pixi production integration is deferred to Phase 2.
- Beginner scaffolds explain evidence but do not create mastery.

## Verification

Record each verification item as a completed evidence line with the command, exit code, and short result. Generate the timestamp immediately after each command with `Get-Date -Format o`, then write the resulting concrete timestamp into the reflection.

- typecheck command: `fnm exec --using 20.20.2 pnpm.cmd typecheck`; required exit code: `0`.
- structure check command: `fnm exec --using 20.20.2 pnpm.cmd web:check-structure`; required exit code: `0`.
- unit test command: `fnm exec --using 20.20.2 pnpm.cmd web:test:unit`; required exit code: `0`, except the already-known cursor ordering issue may be recorded separately if unchanged.
- build command: `fnm exec --using 20.20.2 pnpm.cmd build`; required exit code: `0`.
- browser smoke paths: `/student/home`, `/learn/P1T1-N02`, `/teacher/workbench`, `/teacher/sessions/demo-p1`; required result: each path loads and shows the Phase 1 learning-evolution affordances.

## Preservation Check

- User guide md/pdf remained unstaged.
- No databases or authoritative source docx were modified.
- No generated build output was edited.

## Known Issues

- If no issue remains, write `No known issue after Phase 1 verification.`
- If the existing cursor ordering test remains unrelated, write one concrete line: `Known unrelated issue: self-study cursor ordering assertion still fails with expected order P1T2-N02, P1T1-N02, P1T1-N01 versus actual order P1T1-N01, P1T2-N02, P1T1-N02.`

## Next Phase

- Phase 2 should integrate Pixi evidence detective as optional visual companion while preserving HTML/server authority.
```

Write concrete timestamps in the reflection file; do not write symbolic time labels.

- [ ] **Step 6: Commit reflection**

Run:

```powershell
git add -- docs/superpowers/reflections/2026-07-20-dgbook-p1-learning-evolution-phase1.md
git commit -m "docs: reflect P1 learning evolution phase 1"
```

- [ ] **Step 7: Push**

Run:

```powershell
git push origin main
```

Expected:

```text
main -> main
```

---

## Implementation Notes

### Encoding Warning

PowerShell may display Chinese in TS/TSX files as mojibake depending on terminal code page. Before treating text as corrupted, verify with:

```powershell
@'
from pathlib import Path
text = Path('path/to/file.tsx').read_text(encoding='utf-8')
print(text[:200].encode('unicode_escape').decode('ascii'))
'@ | python -
```

Expected: Chinese appears as valid `\uXXXX` sequences and the file reads without `UnicodeDecodeError`.

### Known Test Environment Issue

Use Node 20.20.2. Running tests under Node 24 can fail because native dependencies such as `better-sqlite3` were built against a different ABI.

### Git Hygiene

Before every commit:

```powershell
git status -sb
```

Expected staged files must never include:

```text
docs/guides/dgbook-p1-使用教程.md
docs/guides/dgbook-p1-使用教程.pdf
```

unless the user explicitly requests guide changes.

## Plan Self-Review

### Spec Coverage

- Content scaffold: Task 1 and Task 2.
- Game/interaction preparation: Task 3, with Pixi deferred explicitly.
- Teacher explanation: Task 4.
- Visual/animation scaffolding: Task 2.
- Data truth constraints: Task 1, Task 3, Task 5.
- Preservation and cleanup: Task 5.

### Open Blank Scan

The implementation tasks avoid open-ended blanks. The reflection template contains concrete command lines and requires actual local verification times before saving.

### Type Consistency

The only new TypeScript interface is `P1BeginnerScaffold`; its fields match the render consumers in Task 2. DOM markers are fixed string values and test-locked.

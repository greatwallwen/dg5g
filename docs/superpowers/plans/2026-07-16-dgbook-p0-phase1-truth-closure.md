# DGBook P0 Phase 1 Truth Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 P0-1 与 P0-2 至 P0-6，使匿名平台展示、P01岗位练习、服务端正式测试、N04真实成果、演示状态和成果包形成一条可验证的真实链路。

**Architecture:** 保留现有 Next.js、SQLite、统一快照、成果版本库和 Image2 UI；新增结构化活动尝试、正式测试实例/服务端判分、内置证据关系和来源标记。所有学生、教师、成果包及后续图谱投影只读取这些权威事实。

**Tech Stack:** Node 20.20.2、pnpm 9.15.0、Next.js、React、TypeScript、better-sqlite3、Node test runner、Playwright、PixiJS。

## Global Constraints

- `/`、学生首页、教师工作台和现有图谱视觉保持不变。
- 匿名页面仅返回白名单摘要；完整教材、答案、教师讲稿、学生证据和成绩必须登录。
- 当前只有一名教师和三名学生；不新增平台运营者角色或文件上传。
- 学生一全新；学生二退回修订；学生三完整达成。所有预置事实标记“演示数据”。
- 正式测试由服务端判分，达标线 80；客户端不得提交分数或包含答案。
- 未达标后完成定向再学即可重试，不设三次永久锁定，不建设补考与审批。
- N02 正式测试 40% + N04 教师量规 60%；正式测试达标不等于教师确认。
- 证据来自内置现场证据库，字段挂接保存稳定 evidence ID。
- 所有功能遵循测试先行：先观察新测试按预期失败，再写最小实现并观察通过。
- Image2 保持深海军蓝工程空间、青色焦点、绿色达成、黄色风险、红色异常、真实 SVG 图标、圆角不超过 8px、每屏一个主行动。

---

### Task 1：建立真实性持久化契约并锁定基线回归

**Files:**
- Create: `apps/web/database/migrations/009_truthful_learning_artifacts.sql`
- Create: `apps/web/src/platform/learning-origin.ts`
- Modify: `apps/web/src/platform/db/migrations.ts`
- Modify: `apps/web/src/platform/db/migrations.test.ts`
- Modify: `apps/web/src/platform/authoritative-snapshot.test.ts`

**Interfaces:**
- Produces: `LearningOrigin = 'demo' | 'user'`、`practice_attempts`、`formal_assessment_instances`、`formal_assessment_tokens`、`evidence_library`、`output_evidence_links`；正式尝试、成果和复核具有来源与诊断字段。
- Consumes: 现有 `formal_attempts`、`professional_outputs`、`output_reviews`、`professional_output_versions`。

- [ ] **Step 1: 写迁移失败测试**

```ts
assert.equal(migrateDatabase(database).currentVersion, 9);
for (const table of [
  'practice_attempts',
  'formal_assessment_instances',
  'formal_assessment_tokens',
  'evidence_library',
  'output_evidence_links',
]) assert.equal(tables.has(table), true, table);
```

- [ ] **Step 2: 运行红灯**

Run: `pnpm --filter @dgbook/web exec tsx --test src/platform/db/migrations.test.ts`

Expected: FAIL，schema version 仍为 8 且新表不存在。

- [ ] **Step 3: 实现单一连续迁移**

```sql
CREATE TABLE practice_attempts (
  attempt_id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  artifact_json TEXT NOT NULL CHECK (json_valid(artifact_json)),
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  origin TEXT NOT NULL CHECK (origin IN ('demo', 'user')),
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TABLE formal_assessment_instances (
  assessment_id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES classroom_sessions(session_id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  question_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('preparing', 'running', 'closed')),
  opened_at TEXT,
  closed_at TEXT
) STRICT;
```

同一迁移加入一次性 token、内置证据、字段证据关系，以及 `origin`、`assessment_id`、`question_version`、`answers_json`、`diagnostics_json` 列；现有行回填为 `origin='demo'`。将 `LATEST_SCHEMA_VERSION` 改为 9。

- [ ] **Step 4: 固化并修复当前课堂统计回归**

保持现有零分提交测试，新增历史演示尝试与当前 assessment ID 不同的用例；先观察它因提交数为3而失败，再让快照读取当前 `assessment_id` 并只聚合该实例。预期零分计作已提交，历史/演示分不计入；不得用时间字符串临时绕过。

- [ ] **Step 5: 运行绿灯与完整性检查**

Run: `pnpm --filter @dgbook/web exec tsx --test src/platform/db/migrations.test.ts src/platform/authoritative-snapshot.test.ts`

Expected: migration 与快照过滤测试均 PASS，原 513/514 基线恢复为全绿。

- [ ] **Step 6: Commit**

```bash
git add apps/web/database/migrations/009_truthful_learning_artifacts.sql apps/web/src/platform/learning-origin.ts apps/web/src/platform/db/migrations.ts apps/web/src/platform/db/migrations.test.ts apps/web/src/platform/authoritative-snapshot.test.ts
git commit -m "feat: add truthful learning artifact schema"
```

### Task 2：补出匿名只读平台与资源生产链

**Files:**
- Create: `apps/web/src/features/platform-overview/public-platform-model.ts`
- Create: `apps/web/src/features/platform-overview/public-platform-view.tsx`
- Create: `apps/web/src/features/platform-overview/public-platform-model.test.ts`
- Create: `apps/web/src/app/platform/page.tsx`
- Create: `apps/web/src/app/resources/page.tsx`
- Create: `apps/web/src/app/governance/page.tsx`
- Create: `apps/web/src/app/delivery/page.tsx`
- Create: `apps/web/src/app/platform-overview.css`
- Modify: `apps/web/next.config.mjs`
- Modify: `apps/web/src/features/auth/login-view.tsx`
- Modify: `scripts/audit-digital-textbook-v3.mjs`

**Interfaces:**
- Produces: `PublicPlatformCard` 白名单 DTO 和四个匿名 GET 页面。
- Consumes: 固定 P1 manifest、生成物摘要、Image2 参考资产；不读取学生数据库。

- [ ] **Step 1: 写公开边界失败测试**

```ts
const json = JSON.stringify(buildPublicPlatformModel());
for (const forbidden of ['expectedEvidence', 'correctModel', 'teacherNarration', 'studentId', 'score']) {
  assert.equal(json.includes(forbidden), false, forbidden);
}
assert.deepEqual(model.stages.map(({ id }) => id), [
  'input', 'diagnosis', 'capability-map', 'generation',
  'governance', 'textbook', 'teaching', 'feedback',
]);
```

- [ ] **Step 2: 运行红灯**

Run: `pnpm --filter @dgbook/web exec tsx --test src/features/platform-overview/public-platform-model.test.ts`

Expected: FAIL，模型与路由不存在。

- [ ] **Step 3: 实现白名单模型与四页**

```ts
export interface PublicPlatformCard {
  id: string;
  title: string;
  kind: 'source' | 'resource' | 'gate' | 'delivery';
  status: 'ready' | 'review' | 'sample';
  summary: string;
  thumbnailUrl?: string;
  outputMode?: 'resource-package' | 'direct-render';
}
```

移除 `/platform -> /` 重定向；登录页只增加“查看平台总览”次级链接，不增加第二套登录按钮。四页均不得调用学习快照或公开写按钮。

- [ ] **Step 4: 运行绿灯、结构与匿名路由检查**

Run: `pnpm --filter @dgbook/web exec tsx --test src/features/platform-overview/public-platform-model.test.ts`

Run: `pnpm web:check-structure`

Expected: PASS；四个路由存在且 `/` 仍为登录入口。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/platform-overview apps/web/src/app/platform apps/web/src/app/resources apps/web/src/app/governance apps/web/src/app/delivery apps/web/src/app/platform-overview.css apps/web/src/features/auth/login-view.tsx apps/web/next.config.mjs scripts/audit-digital-textbook-v3.mjs
git commit -m "feat: add public platform overview"
```

### Task 3：实现 P01 六类岗位活动与真实作答

**Files:**
- Create: `apps/web/src/features/learning-activities/activity-definition.ts`
- Create: `apps/web/src/features/learning-activities/activity-catalog.ts`
- Create: `apps/web/src/features/learning-activities/activity-evaluator.ts`
- Create: `apps/web/src/features/learning-activities/activity-repository.ts`
- Create: `apps/web/src/features/learning-activities/activity-workbench.tsx`
- Create: `apps/web/src/features/learning-activities/activity-evaluator.test.ts`
- Create: `apps/web/src/app/api/learning/activities/[activityId]/attempts/route.ts`
- Modify: `scripts/import_5g/p1_demo_content.py`
- Modify: `textbook/5g/generated/p1-demo-content.json`
- Modify: `apps/web/src/features/platform/p1-content.ts`
- Modify: `apps/web/src/features/textbook-scene/self-study-practice-section.tsx`
- Modify: `apps/web/src/features/textbook-scene/self-study-renderer.tsx`

**Interfaces:**
- Consumes: Task 1 `practice_attempts`、现有 P1 generated content。
- Produces: `ActivityDefinition`、`ActivityAttemptResult`、可汇入成果的 `artifact`。

- [ ] **Step 1: 写六类活动失败测试**

```ts
assert.deepEqual(p01Activities.map(({ kind }) => kind), [
  'scope-classification',
  'evidence-classification',
  'link-reconstruction',
  'structured-record',
  'four-state-judgement',
  'defective-sheet-revision',
]);
assert.equal(evaluateActivity(scopeActivity, wrongResponse).passed, false);
assert.equal(evaluateActivity(scopeActivity, correctedResponse).passed, true);
```

- [ ] **Step 2: 运行红灯**

Run: `pnpm --filter @dgbook/web exec tsx --test src/features/learning-activities/activity-evaluator.test.ts`

Expected: FAIL，活动合同不存在。

- [ ] **Step 3: 扩展导入器并重新生成内容**

Run: `python scripts/import-5g-docx.py`

生成内容必须包含材料、交互类型、答案模型、针对性反馈、改正路径和迁移目标；Web 不再固定渲染“只凭单一现象/按提示补齐”。

- [ ] **Step 4: 实现服务端保存与UI**

POST body 只允许 `{ attemptId, response, expectedVersion }`；服务端从 catalog 读取规则并返回 `{ passed, feedback, correctionPath, artifact, version }`。N01 分类、N02 证据/链路/记录、N03 四态、N04 缺陷表修订使用不同控件并支持重新作答。

- [ ] **Step 5: 运行绿灯与内容审计**

Run: `pnpm --filter @dgbook/web exec tsx --test src/features/learning-activities/activity-evaluator.test.ts src/features/textbook-scene/self-study-renderer-contract.test.tsx`

Run: `pnpm audit:self-study-closure`

Expected: PASS；固定通用二选一文本不再出现。

- [ ] **Step 6: Commit**

```bash
git add scripts/import_5g/p1_demo_content.py textbook/5g/generated/p1-demo-content.json apps/web/src/features/learning-activities apps/web/src/app/api/learning/activities apps/web/src/features/platform/p1-content.ts apps/web/src/features/textbook-scene/self-study-practice-section.tsx apps/web/src/features/textbook-scene/self-study-renderer.tsx
git commit -m "feat: add authentic P01 learning activities"
```

### Task 4：实现独立、服务端判分的正式测试

**Files:**
- Create: `apps/web/src/platform/formal-assessment-catalog.ts`
- Create: `apps/web/src/platform/formal-assessment-service.ts`
- Create: `apps/web/src/platform/formal-assessment-service.test.ts`
- Create: `apps/web/src/app/api/learning/nodes/[nodeId]/assessment/route.ts`
- Create: `apps/web/src/app/learn/[nodeId]/test/page.tsx`
- Create: `apps/web/src/features/formal-assessment/formal-assessment-client.tsx`
- Create: `apps/web/src/features/formal-assessment/formal-assessment-result.tsx`
- Modify: `apps/web/src/app/api/learning/nodes/[nodeId]/attempts/route.ts`
- Modify: `apps/web/src/platform/learning-command-service.ts`
- Modify: `apps/web/src/features/textbook-scene/challenge-scene.tsx`

**Interfaces:**
- Consumes: Task 1 assessment tables；Task 3 remediation targets。
- Produces: `AssessmentPaper`（无答案）、`AssessmentSubmission`（只有答案）、`AssessmentDiagnosis`（四项分数与再学目标）。

- [ ] **Step 1: 写伪造分数失败测试**

```ts
const forged = await POST(request({ score: 100, answers: wrongAnswers }));
assert.equal(forged.status, 400);
const result = await submitAnswers(actor, token, wrongAnswers);
assert.notEqual(result.totalScore, 100);
assert.equal(JSON.stringify(result.paper).includes('correct'), false);
```

- [ ] **Step 2: 运行红灯**

Run: `pnpm --filter @dgbook/web exec tsx --test src/platform/formal-assessment-service.test.ts`

Expected: FAIL，当前接口接受客户端分数。

- [ ] **Step 3: 实现服务端题库、token和判分**

四个分项键固定为 `evidenceClassification`、`linkReconstruction`、`defectiveOutputRevision`、`professionalConclusion`。attempt token 绑定学生、节点、题目版本和 assessment instance，提交一次后失效。

- [ ] **Step 4: 实现独立页面与定向再学结果**

页面必须经 `requireClassRole('student')` 和节点门禁。未达80分显示每项诊断及 `/learn/{nodeId}?section={sectionId}`；完成对应 Task 3 活动后可再试。删除三次永久锁定。

- [ ] **Step 5: 运行绿灯与客户端答案扫描**

Run: `pnpm --filter @dgbook/web exec tsx --test src/platform/formal-assessment-service.test.ts`

Run: `rg -n "correct:|targetId:|modelAnswer" apps/web/src/features/formal-assessment apps/web/src/app/learn/[nodeId]/test`

Expected: 测试 PASS；客户端目录无答案命中。

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/platform/formal-assessment-catalog.ts apps/web/src/platform/formal-assessment-service.ts apps/web/src/platform/formal-assessment-service.test.ts apps/web/src/app/api/learning/nodes/[nodeId]/assessment apps/web/src/app/learn/[nodeId]/test apps/web/src/features/formal-assessment apps/web/src/app/api/learning/nodes/[nodeId]/attempts/route.ts apps/web/src/platform/learning-command-service.ts apps/web/src/features/textbook-scene/challenge-scene.tsx
git commit -m "feat: add server-graded formal assessment"
```

### Task 5：把 N04 建成自动汇总且可复核的真实成果表

**Files:**
- Create: `apps/web/src/features/portfolio/p01-output-definition.ts`
- Create: `apps/web/src/features/portfolio/evidence-library.ts`
- Create: `apps/web/src/features/portfolio/output-workflow-state.ts`
- Create: `apps/web/src/features/portfolio/output-workflow-state.test.ts`
- Modify: `apps/web/src/features/portfolio/output-schema.ts`
- Modify: `apps/web/src/features/portfolio/output-fieldsets.tsx`
- Modify: `apps/web/src/features/portfolio/professional-output-form.tsx`
- Modify: `apps/web/src/platform/professional-output-repository.ts`
- Modify: `apps/web/src/app/api/outputs/[taskId]/draft/route.ts`
- Modify: `apps/web/src/app/api/outputs/[taskId]/submit/route.ts`

**Interfaces:**
- Consumes: Task 1 evidence tables；Task 3 activity artifacts。
- Produces: P01任务级字段、自动预填、字段证据、六态投影。

- [ ] **Step 1: 写成果完整性与六态失败测试**

```ts
assert.deepEqual(projectOutputWorkflow(returnedV1), { state: 'returned', label: '教师退回' });
assert.deepEqual(projectOutputWorkflow(returnedDraftV2), { state: 'revising', label: '修订中' });
assert.throws(() => validateP01Output({}), /站点与机房|位置证据/);
```

- [ ] **Step 2: 运行红灯**

Run: `pnpm --filter @dgbook/web exec tsx --test src/features/portfolio/output-workflow-state.test.ts src/features/portfolio/output-schema.test.ts`

Expected: FAIL，当前schema仍来自N02通用字段。

- [ ] **Step 3: 实现任务级成果定义与自动预填**

字段固定为 `siteRoom`、`collectionScope`、`locationEvidence`、`deviceIdentity`、`endpointA`、`endpointB`、`connectionDirection`、`photoIndex`、`evidenceGap`、`riskAndReviewConclusion`。预填值携带 `sourceNodeId/sourceAttemptId`，学生修改字段不删除来源。

- [ ] **Step 4: 实现证据挂接和六态UI**

每个字段可从内置证据库选择、预览、移除；保存版本时写 `output_evidence_links`。六态由现有status、version和review history投影，不复制第二套可变状态。

- [ ] **Step 5: 运行绿灯与退回修订回归**

Run: `pnpm --filter @dgbook/web exec tsx --test src/features/portfolio/output-workflow-state.test.ts src/features/portfolio/output-schema.test.ts src/platform/professional-output-repository.test.ts`

Expected: PASS；空表不可提交，V1不可变，退回后形成V2。

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/portfolio apps/web/src/platform/professional-output-repository.ts apps/web/src/app/api/outputs
git commit -m "feat: add evidence-backed P01 output"
```

### Task 6：纠正来源、三学生状态和课堂统计

**Files:**
- Modify: `apps/web/database/demo-seed.json`
- Modify: `apps/web/src/platform/db/demo-seed.ts`
- Modify: `apps/web/src/platform/db/demo-seed.test.ts`
- Modify: `apps/web/src/platform/learning-policy.ts`
- Modify: `apps/web/src/platform/learning-read-model.ts`
- Modify: `apps/web/src/platform/authoritative-snapshot.ts`
- Modify: `apps/web/src/platform/authoritative-snapshot.test.ts`
- Create: `apps/web/src/app/api/demo/reset/route.ts`
- Modify: `apps/web/src/features/workbench/teacher-workbench.tsx`

**Interfaces:**
- Consumes: Tasks 1、3、4、5 的真实facts。
- Produces: 三种学生persona、`demo/user`标签、当前assessment实例统计、教师可控重置。

- [ ] **Step 1: 写persona与来源失败测试**

```ts
assert.equal(studentOne.attempts.length, 0);
assert.equal(studentOne.outputs.length, 0);
assert.equal(studentTwo.outputs[0].status, 'returned');
assert.equal(studentThree.outputs[0].origin, 'demo');
assert.equal(studentThree.outputs[0].content.locationEvidence.length > 0, true);
```

- [ ] **Step 2: 运行红灯**

Run: `pnpm --filter @dgbook/web exec tsx --test src/platform/db/demo-seed.test.ts src/platform/authoritative-snapshot.test.ts`

Expected: FAIL，当前空壳verified成果和历史统计仍存在。

- [ ] **Step 3: 用完整领域数据重建三persona**

学生一删除预置attempt/output/review；学生二写完整V1与字段证据后进入returned；学生三写完整活动、正式诊断、成果、量规与verified事件。所有预置事实为`origin=demo`，不再插入只有`kind/version`的空壳成果。

- [ ] **Step 4: 按requiredActivityIds和assessment实例投影**

微练习通过只认政策要求的活动；正式测试统计只认当前 `assessment_id`，包括零分提交且排除历史演示分。用户事实存在时当前状态优先选择 `origin=user`。

- [ ] **Step 5: 实现教师登录后的Demo重置**

`POST /api/demo/reset` 只接受教师角色，事务内重置三名演示学生并保持课程、媒体、账号和课堂定义；工作台使用次级动作并明确确认文案。

- [ ] **Step 6: 运行绿灯**

Run: `pnpm --filter @dgbook/web exec tsx --test src/platform/db/demo-seed.test.ts src/platform/authoritative-snapshot.test.ts src/platform/learning-read-model.test.ts`

Expected: PASS，包含原513/514中的课堂窗口回归。

- [ ] **Step 7: Commit**

```bash
git add apps/web/database/demo-seed.json apps/web/src/platform/db/demo-seed.ts apps/web/src/platform/db/demo-seed.test.ts apps/web/src/platform/learning-policy.ts apps/web/src/platform/learning-read-model.ts apps/web/src/platform/authoritative-snapshot.ts apps/web/src/platform/authoritative-snapshot.test.ts apps/web/src/app/api/demo/reset apps/web/src/features/workbench/teacher-workbench.tsx
git commit -m "fix: derive demo mastery from truthful events"
```

### Task 7：让成果包打开字段、证据、差异与诊断

**Files:**
- Create: `apps/web/src/features/portfolio/p1-portfolio-detail-model.ts`
- Create: `apps/web/src/features/portfolio/p1-portfolio-detail-view.tsx`
- Create: `apps/web/src/features/portfolio/p1-portfolio-detail-model.test.ts`
- Create: `apps/web/src/app/student/projects/p1/portfolio/[taskId]/page.tsx`
- Modify: `apps/web/src/features/portfolio/p1-portfolio-model.ts`
- Modify: `apps/web/src/features/portfolio/p1-portfolio-view.tsx`
- Modify: `apps/web/src/platform/professional-output-repository.ts`

**Interfaces:**
- Consumes: Tasks 4、5、6 的版本、证据、批注、诊断和来源。
- Produces: 成果详情投影与从成果包卡片进入详情的链接。

- [ ] **Step 1: 写详情失败测试**

```ts
assert.equal(detail.originLabel, '演示数据');
assert.equal(detail.fields.locationEvidence.evidence.length > 0, true);
assert.deepEqual(detail.versionDiff.changedFields, ['locationEvidence', 'evidenceGap']);
assert.equal(detail.assessmentDiagnosis.sections.length, 4);
assert.equal(emptyDetail.statusLabel, '尚未形成');
```

- [ ] **Step 2: 运行红灯**

Run: `pnpm --filter @dgbook/web exec tsx --test src/features/portfolio/p1-portfolio-detail-model.test.ts`

Expected: FAIL，详情投影与路由不存在。

- [ ] **Step 3: 实现详情聚合与逐字段diff**

详情只允许学生本人读取；从不可变versions、evidence links、review和formal diagnosis聚合。diff按字段键比较规范化JSON，不按字符串整段比较。

- [ ] **Step 4: 实现详情页与成果包链接**

无内容显示“尚未形成”；`origin=demo`持续显示“演示数据”；只有三任务真实成果都存在时项目包才显示完成。

- [ ] **Step 5: 运行绿灯**

Run: `pnpm --filter @dgbook/web exec tsx --test src/features/portfolio/p1-portfolio-detail-model.test.ts src/features/portfolio/p1-portfolio-model.test.ts src/features/portfolio/p1-portfolio-view.test.tsx`

Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/portfolio apps/web/src/app/student/projects/p1/portfolio/[taskId] apps/web/src/platform/professional-output-repository.ts
git commit -m "feat: open evidence-backed portfolio details"
```

### Task 8：第一阶段整体验收、浏览器旅程与发布

**Files:**
- Create: `scripts/audit-p0-phase1-truth-closure.mjs`
- Create: `scripts/audit-p0-phase1-truth-closure.test.mjs`
- Modify: `package.json`
- Modify: `docs/acceptance/p1-final-release-checklist.md`

**Interfaces:**
- Consumes: Tasks 1-7。
- Produces: 可重复本地门禁、浏览器证据、source release和现网冒烟记录。

- [ ] **Step 1: 写阶段门禁失败测试**

门禁断言：匿名四页；固定通用练习文案为0；伪造score请求被拒绝；学生一无分；学生二returned；学生三完整且标演示；N04字段/证据/V1-V2；当前assessment统计不混历史；成果详情四项诊断。

- [ ] **Step 2: 运行红灯并修复集成断口**

Run: `node --test scripts/audit-p0-phase1-truth-closure.test.mjs`

Expected: 第一次运行至少因新审计脚本未接入而FAIL；只修跨任务契约，不夹带P0-7至P0-9。

- [ ] **Step 3: 运行完整本地门禁**

Run: `pnpm web:test:unit`

Run: `pnpm web:typecheck`

Run: `pnpm web:check-structure`

Run: `pnpm build`

Run: `pnpm audit:p0-phase1-truth-closure`

Expected: 全部PASS，单测0失败。

- [ ] **Step 4: 运行真实浏览器旅程**

覆盖匿名平台、学生一首次作答/测试/提交、学生二V1退回后V2、学生三成果详情、教师复核。1440×900与1920×1080无横向溢出、console error和page error。

- [ ] **Step 5: Commit**

```bash
git add scripts/audit-p0-phase1-truth-closure.mjs scripts/audit-p0-phase1-truth-closure.test.mjs package.json docs/acceptance/p1-final-release-checklist.md
git commit -m "test: gate P0 phase one truth closure"
```

- [ ] **Step 6: 分阶段发布**

Run: `pnpm deploy:web:source`

将验证过的source release部署到现网；核验 `/api/build-info` 与本地release ID一致，再分别冒烟匿名平台、学生、教师和成果详情。成功后推送 `codex/p0-truth-closure` 到 `greatwallwen/dg5g`。

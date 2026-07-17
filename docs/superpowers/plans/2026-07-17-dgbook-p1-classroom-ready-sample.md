# DGBook P1 四课时真实教学样张 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一名教师和三名学生可真实完成的 P1 四课时数字教材样张，使 P01、P02、P03 的学习、课堂、正式测试、专业成果、教师认证、成果包和能力图谱由同一 SQLite 事实链证明。

**Architecture:** 保留 Next.js 14、React、better-sqlite3、现有活动评价器、正式测试服务、专业成果版本库和权威快照。新增一次连续迁移，把活动交付渠道、可恢复测试、独立课时运行、唯一教学游标和真实浏览器 presence 持久化；所有角色页面只消费同一版本快照，不再依赖课堂助手、组件本地通过状态或重复统计。

**Tech Stack:** Node 20.20.2、pnpm 9.15.0、Next.js 14.2.35、React 18.3.1、TypeScript、better-sqlite3 11.10.0、Node test runner、Playwright、现有 PixiJS widgets。

## Global Constraints

- 当前验收对象固定为一名教师和三名学生，但 `3` 不得成为通用运行时容量上限。
- SQLite 是学习、课堂、成绩、成果和 presence 的唯一权威；浏览器草稿不能直接形成完成事实。
- P01 两个 45 分钟课时；P02、P03 各一个 45 分钟课时。
- P01 强支架、P02 近迁移、P03 综合迁移，三者内容和界面必须明显不同。
- 同一 `canonicalActivityId` 在课堂与自学使用同一材料、response schema、服务端评价器和通过阈值。
- 正式测试 15 分钟、80 分达标；刷新不重置计时或草稿，客户端不得包含答案或提交分数。
- N04 首次有效提交开放下一任务；教师退回不得重新锁定；教师认证决定能力达成和官方任务分。
- 任务综合分固定为 N02 最高有效正式测试 40% + N04 当前认证量规 60%。
- 项目综合分只在 P01、P02、P03 三个官方任务分齐全后形成。
- 内置图片和工单显示“模拟案例材料”；真实用户行为与预置演示行为必须分开。
- 课堂、自学、投屏和图谱不新增聊天、问答导师、补考审批、账号后台或真实外业文件上传。
- 保持 Image2 V4 深色工程化视觉、现有图标库和图谱框架；每个界面只突出一个主行动。
- 不手工编辑 `.next`、生成构建输出、数据库文件或 `textbook/5g/generated/`；教材变更先修改 `scripts/import-5g-docx.py` 或 `scripts/import_5g/` 后重新生成。
- `.git/`、数据库、`content/5g/5g.docx`、导入脚本、已验证媒体以及当前/上一/最终证据均为受保护对象。
- 每项生产修改采用红灯 → 最小实现 → 绿灯 → 重构；每个任务独立提交。
- SSH 凭据只从环境变量读取，不写入仓库、计划、日志或构建产物。

## Existing Baseline

以下能力已经存在，实施时扩展而不是重写：

- Schema 版本 11，已有 `practice_attempts`、正式测试 instance/token、专业成果不可变版本、字段来源、课堂 assessment run 标识。
- `ActivityRepository`、`evaluateActivity` 和真实岗位活动目录已经能够服务端判定。
- 三个 N02 已有独立正式测试题目与四维诊断，N04 已有 CAS、版本差异、证据挂接和 40/60 冻结分。
- 课堂参与表已经区分 `joined/left` 与 `follow/self`。
- 自学游标已经按学生和节点持久化。
- 0 份真实提交禁止讲评、投屏匿名裁剪和节点路由门禁已有基础测试。

---

### Task 1: 建立 schema 12 的真实运行契约

**Files:**
- Create: `apps/web/database/migrations/012_classroom_ready_sample.sql`
- Modify: `apps/web/src/platform/db/migrations.ts`
- Modify: `apps/web/src/platform/db/migrations.test.ts`
- Modify: `apps/web/src/platform/classroom-runtime-migration.test.ts`

**Interfaces:**
- Produces: immutable activity delivery facts、`classroom_lesson_runs`、`classroom_assessment_runs`、`formal_assessment_drafts`、browser/helper presence distinction。
- Consumes: schema 11 tables without deleting or rewriting user facts。

- [ ] **Step 1: 写 schema 12 红灯测试**

```ts
assert.equal(migrateDatabase(database).currentVersion, 12);
for (const table of [
  'classroom_lesson_runs',
  'classroom_assessment_runs',
  'formal_assessment_drafts',
]) assert.equal(tables.has(table), true, table);
for (const column of ['delivery_channel', 'classroom_session_id', 'classroom_run_id', 'attempt_number']) {
  assert.equal(practiceColumns.has(column), true, column);
}
for (const column of ['client_kind', 'visibility_state']) {
  assert.equal(presenceColumns.has(column), true, column);
}
```

- [ ] **Step 2: 运行红灯**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/db/migrations.test.ts apps/web/src/platform/classroom-runtime-migration.test.ts`

Expected: FAIL，当前 `LATEST_SCHEMA_VERSION` 为 11 且新表/字段不存在。

- [ ] **Step 3: 添加唯一连续迁移**

```sql
ALTER TABLE practice_attempts
  ADD COLUMN delivery_channel TEXT NOT NULL DEFAULT 'self-study'
    CHECK (delivery_channel IN ('self-study', 'classroom'));
ALTER TABLE practice_attempts
  ADD COLUMN classroom_session_id TEXT REFERENCES classroom_sessions(session_id) ON DELETE SET NULL;
ALTER TABLE practice_attempts
  ADD COLUMN classroom_run_id TEXT CHECK (classroom_run_id IS NULL OR length(trim(classroom_run_id)) > 0);
ALTER TABLE practice_attempts
  ADD COLUMN attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number > 0);

CREATE INDEX practice_attempts_delivery_idx
  ON practice_attempts(student_id, activity_id, delivery_channel, attempted_at);

CREATE TABLE classroom_lesson_runs (
  lesson_run_id TEXT PRIMARY KEY CHECK (length(trim(lesson_run_id)) > 0),
  session_id TEXT NOT NULL REFERENCES classroom_sessions(session_id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL CHECK (length(trim(lesson_id)) > 0),
  task_id TEXT NOT NULL CHECK (task_id IN ('P01', 'P02', 'P03')),
  node_id TEXT NOT NULL CHECK (length(trim(node_id)) > 0),
  status TEXT NOT NULL CHECK (status IN ('preparing', 'active', 'paused', 'closed')),
  teaching_cursor_json TEXT NOT NULL CHECK (json_valid(teaching_cursor_json)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  started_at TEXT,
  paused_at TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE UNIQUE INDEX classroom_lesson_runs_one_open_idx
  ON classroom_lesson_runs(session_id)
  WHERE status IN ('preparing', 'active', 'paused');

ALTER TABLE classroom_sessions
  ADD COLUMN active_lesson_run_id TEXT REFERENCES classroom_lesson_runs(lesson_run_id) ON DELETE SET NULL;

CREATE TABLE classroom_assessment_runs (
  run_id TEXT PRIMARY KEY CHECK (length(trim(run_id)) > 0),
  lesson_run_id TEXT NOT NULL REFERENCES classroom_lesson_runs(lesson_run_id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES classroom_sessions(session_id) ON DELETE CASCADE,
  node_id TEXT NOT NULL CHECK (length(trim(node_id)) > 0),
  game_id TEXT NOT NULL CHECK (length(trim(game_id)) > 0),
  status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'reviewing', 'closed', 'expired')),
  started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  remaining_seconds_when_paused INTEGER CHECK (remaining_seconds_when_paused >= 0),
  review_started_at TEXT,
  closed_at TEXT,
  closed_reason TEXT CHECK (closed_reason IS NULL OR closed_reason IN ('all-submitted', 'time-expired', 'teacher-collected', 'lesson-ended')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
) STRICT;

CREATE UNIQUE INDEX classroom_assessment_runs_one_open_idx
  ON classroom_assessment_runs(lesson_run_id)
  WHERE status IN ('running', 'paused', 'reviewing');

CREATE TABLE formal_assessment_drafts (
  assessment_id TEXT NOT NULL REFERENCES formal_assessment_instances(assessment_id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(answers_json)),
  state_revision INTEGER NOT NULL DEFAULT 0 CHECK (state_revision >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (assessment_id, student_id)
) STRICT;

ALTER TABLE formal_assessment_instances ADD COLUMN expires_at TEXT;
ALTER TABLE formal_assessment_instances ADD COLUMN closure_reason TEXT
  CHECK (closure_reason IS NULL OR closure_reason IN ('submitted', 'expired', 'cancelled'));

ALTER TABLE device_presence ADD COLUMN client_kind TEXT NOT NULL DEFAULT 'helper-simulator'
  CHECK (client_kind IN ('browser', 'helper-simulator'));
ALTER TABLE device_presence ADD COLUMN visibility_state TEXT NOT NULL DEFAULT 'visible'
  CHECK (visibility_state IN ('visible', 'hidden'));
```

- [ ] **Step 4: 提升迁移版本并验证 schema 11 原数据保留**

```ts
export const LATEST_SCHEMA_VERSION = 12;
```

测试在迁移前插入一条 activity、output、review 和 classroom session，迁移后按原主键逐条读取并断言内容未变。

- [ ] **Step 5: 运行绿灯与数据库回归**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/db/migrations.test.ts apps/web/src/platform/classroom-runtime-migration.test.ts apps/web/src/platform/db/demo-seed.test.ts`

Expected: PASS，迁移可重复发现、既有事实保留、base/demo seed 均能升级到 12。

- [ ] **Step 6: 提交**

```powershell
git add apps/web/database/migrations/012_classroom_ready_sample.sql apps/web/src/platform/db/migrations.ts apps/web/src/platform/db/migrations.test.ts apps/web/src/platform/classroom-runtime-migration.test.ts
git commit -m "feat: add classroom-ready persistence contracts"
```

---

### Task 2: 统一课堂与自学的真实活动事实

**Files:**
- Create: `apps/web/src/features/learning-activities/activity-delivery-context.ts`
- Modify: `apps/web/src/features/learning-activities/activity-definition.ts`
- Modify: `apps/web/src/features/learning-activities/activity-repository.ts`
- Modify: `apps/web/src/features/learning-activities/activity-route.test.ts`
- Modify: `apps/web/src/app/api/learning/activities/[activityId]/attempts/route.ts`
- Modify: `apps/web/src/features/learning-activities/activity-workbench.tsx`
- Modify: `apps/web/src/features/textbook-scene/self-study-practice-section.tsx`
- Modify: `apps/web/src/features/textbook-scene/self-study-renderer.tsx`
- Modify: `apps/web/src/features/textbook-scene/self-study-cursor-client.ts`
- Modify: `apps/web/src/features/textbook-scene/self-study-cursor-client.test.ts`
- Modify: `apps/web/src/platform/student-classroom-action-service.ts`
- Modify: `apps/web/src/platform/student-classroom-action-service.test.ts`

**Interfaces:**
- Produces: immutable `ActivityAttemptResult` with attempt number, mistake codes, field feedback and delivery metadata。
- Removes authority from: generic `classroom_activity_submitted` completion event。

- [ ] **Step 1: 写不可变 attempt 和双渠道红灯测试**

```ts
const first = repository.recordEvaluatedAttempt({
  attemptId: 'attempt-1', studentId: 'stu-01', activity,
  response: wrong, delivery: { channel: 'classroom', sessionId: 'demo-class', classroomRunId: 'run-1' },
});
const second = repository.recordEvaluatedAttempt({
  attemptId: 'attempt-2', studentId: 'stu-01', activity,
  response: correct, delivery: { channel: 'self-study' },
});
assert.equal(first.passed, false);
assert.equal(first.attemptNumber, 1);
assert.equal(second.passed, true);
assert.equal(second.attemptNumber, 2);
assert.equal(count('practice_attempts'), 2);
assert.ok(readTopicVersion('learning:stu-01') > 0);
```

- [ ] **Step 2: 运行红灯**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/features/learning-activities/activity-route.test.ts apps/web/src/platform/student-classroom-action-service.test.ts`

Expected: FAIL，现有 repository 会覆盖同一 attempt 且无 delivery/snapshot version。

- [ ] **Step 3: 定义严格交付上下文**

```ts
export type ActivityDeliveryContext =
  | { channel: 'self-study' }
  | { channel: 'classroom'; sessionId: string; classroomRunId: string };

export interface ActivityAttemptResult {
  attemptId: string;
  canonicalActivityId: string;
  passed: boolean;
  feedback: string;
  mistakeCodes: string[];
  fieldFeedback: Record<string, string>;
  correctionPath: string[];
  artifact: ActivityArtifact;
  attemptNumber: number;
  snapshotVersion: number;
}
```

- [ ] **Step 4: 将 repository 改为每次提交 INSERT**

```ts
const attemptNumber = Number(this.database.prepare(`
  SELECT COUNT(*) + 1 FROM practice_attempts
  WHERE student_id = ? AND activity_id = ? AND origin = 'user'
`).pluck().get(input.studentId, input.activity.activity.id));
const result = evaluateActivity(input.activity, response);
this.database.prepare(`
  INSERT INTO practice_attempts (
    attempt_id, student_id, activity_id, node_id, response_json, result_json,
    artifact_json, passed, origin, delivery_channel, classroom_session_id,
    classroom_run_id, attempt_number, attempted_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?, ?)
`).run(
  input.attemptId, input.studentId, input.activity.activity.id, input.activity.activity.nodeId,
  JSON.stringify(response), JSON.stringify(result), JSON.stringify(result.artifact),
  result.passed ? 1 : 0, input.delivery.channel,
  input.delivery.channel === 'classroom' ? input.delivery.sessionId : null,
  input.delivery.channel === 'classroom' ? input.delivery.classroomRunId : null,
  attemptNumber, attemptedAt,
);
const versions = this.clock.advance([`learning:${input.studentId}`], attemptedAt);
return { ...result, attemptId: input.attemptId, canonicalActivityId: input.activity.activity.id,
  attemptNumber, snapshotVersion: versions.globalVersion };
```

相同 `attemptId` 的完全相同重放返回原结果；身份、活动或 response 不同返回 409，不允许 UPDATE 历史行。

- [ ] **Step 5: 在 route 校验课堂上下文**

课堂提交必须验证 Cookie 学生属于 session、参与状态为 `joined`、当前 lesson run 与 node/activity 一致。客户端不能提交 student ID；route 从 actor 读取。

```ts
const delivery = parseActivityDeliveryContext(body.delivery);
if (delivery.channel === 'classroom') {
  requireJoinedClassroomActivity(database, actor, activity.activity.nodeId, delivery);
}
return noStore(repository.recordEvaluatedAttempt({
  attemptId: body.attemptId,
  studentId: actor.studentId,
  activity,
  response: body.response,
  delivery,
}));
```

- [ ] **Step 6: 为工作台提供持久进度读取**

`GET /api/learning/activities/[activityId]/attempts` 返回本人数据：

```ts
type ActivityProgressDto = {
  canonicalActivityId: string;
  passed: boolean;
  attemptCount: number;
  lastAttempt?: ActivityAttemptResult;
};
```

`ActivityWorkbench` 每次提交创建新 UUID，接受 `delivery`，首次渲染从服务端数据恢复 `passed/attemptCount/lastAttempt`；课堂与自学复用同一组件。

- [ ] **Step 7: 保存并恢复准确六段自学位置**

`SelfStudyCursor` 的 `actionId` 固定保存 `problem/figure/steps/correction/practice/output` 之一。进入节点、切换六段、活动提交和离开前调用现有 cursor API；页面加载以 SQLite cursor 为初始段落。前四段只有学生明确点击“完成本段并继续”才追加阅读事件，`practice` 由真实活动通过产生，N04 `output` 由有效提交产生。删除一次点击批量生成全部段落完成事件的调用。

- [ ] **Step 8: 移除 generic classroom event 的完成信用**

`applyStudentClassroomAction` 只保留 navigation compatibility。`activity_submitted` 返回 400 和迁移提示，不再写 `completed: true`，快照统计只查询 `practice_attempts`。

- [ ] **Step 9: 运行聚焦测试**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/features/learning-activities/activity-evaluator.test.ts apps/web/src/features/learning-activities/activity-route.test.ts apps/web/src/platform/student-classroom-action-service.test.ts apps/web/src/features/textbook-scene/self-study-cursor-client.test.ts apps/web/src/features/textbook-scene/self-study-renderer-contract.test.tsx`

Expected: PASS；失败历史保留，课堂/自学通过互认，generic 事件不推进状态。

- [ ] **Step 10: 提交**

```powershell
git add apps/web/src/features/learning-activities apps/web/src/app/api/learning/activities apps/web/src/features/textbook-scene/self-study-practice-section.tsx apps/web/src/platform/student-classroom-action-service.ts apps/web/src/platform/student-classroom-action-service.test.ts
git commit -m "feat: unify real learning activity attempts"
```

---

### Task 3: 实现可恢复、可计时的正式测试

**Files:**
- Create: `apps/web/src/platform/formal-assessment-attempt-repository.ts`
- Create: `apps/web/src/platform/formal-assessment-attempt-repository.test.ts`
- Modify: `apps/web/src/platform/formal-assessment-contract.ts`
- Modify: `apps/web/src/platform/formal-assessment-catalog.server.ts`
- Modify: `apps/web/src/platform/formal-assessment-p1-tasks.test.ts`
- Modify: `apps/web/src/platform/formal-assessment-service.ts`
- Modify: `apps/web/src/platform/formal-assessment-service.test.ts`
- Modify: `apps/web/src/app/api/learning/nodes/[nodeId]/assessment/route.ts`
- Modify: `apps/web/src/features/formal-assessment/formal-assessment-client.tsx`
- Modify: `apps/web/src/platform/formal-assessment-ui.test.tsx`
- Modify: `apps/web/src/app/learn/[nodeId]/test/page.tsx`

**Interfaces:**
- Changes: `issuePaper()` → `openOrResume()`；新增 draft CAS。
- Produces: `serverNow`、15 分钟权威 `expiresAt`、draft revision、resume/expired UI。

- [ ] **Step 1: 写刷新恢复和超时红灯测试**

```ts
const first = service.openOrResume(student, 'P1T1-N02');
service.saveDraft(student, first.attemptToken, answers, 0);
clock.advanceBy(60_000);
const resumed = service.openOrResume(student, 'P1T1-N02');
assert.equal(resumed.assessmentId, first.assessmentId);
assert.deepEqual(resumed.draft.answers, answers);
assert.equal(Date.parse(resumed.expiresAt), Date.parse(first.expiresAt));
clock.advanceBy(15 * 60_000);
assert.throws(() => service.submitAnswers(student, resumed.attemptToken, answers), AssessmentTokenError);
assert.equal(countUserScores('stu-01'), 0);
```

- [ ] **Step 2: 运行红灯**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/formal-assessment-attempt-repository.test.ts apps/web/src/platform/formal-assessment-service.test.ts`

Expected: FAIL，刷新会关闭旧 instance 并创建新计时。

- [ ] **Step 3: 扩展公开 DTO**

```ts
export interface AssessmentDraftDto {
  answers: Partial<AssessmentAnswers>;
  revision: number;
  updatedAt?: string;
}

export interface IssuedAssessmentPaper {
  paper: AssessmentPaper;
  attemptToken: string;
  assessmentId: string;
  serverNow: string;
  expiresAt: string;
  state: 'in-progress' | 'paused' | 'expired';
  draft: AssessmentDraftDto;
}
```

- [ ] **Step 4: 实现 open-or-resume**

按 `studentId + nodeId + origin=user + status=running` 查询未关闭 instance。未过期时保留原 `assessmentId/expiresAt`，失效旧 token、签发新 token并读取 draft；到期时原子写 `status='closed', closure_reason='expired'`，保留只读 draft，不生成 `formal_attempts`。

标准自学试卷固定 `expiresAt = startedAt + 15min`。课堂试卷使用当前 `classroom_assessment_runs.expires_at`，不使用 30 分钟 token TTL。

- [ ] **Step 5: 增加 A/B 等价题与递进纠正策略**

每个 N02 目录包含 `A`、`B` 两个同维度、同难度、同量规版本；按该学生同节点历史 user attempt 数轮换，不能由客户端指定版本。第一次失败只显示诊断，第二次增加规则定位，第三次展示完整纠正示例后下一次强制换等价题。每次换题仍保留四维诊断和 remediation activity ID。

- [ ] **Step 6: 实现草稿 CAS**

```ts
saveDraft(actor, token, answers, expectedRevision) {
  return this.database.transaction(() => {
    const instance = this.requireOpenInstance(actor, token);
    if (this.now().getTime() >= Date.parse(instance.expiresAt)) return this.expire(instance);
    const changed = this.database.prepare(`
      INSERT INTO formal_assessment_drafts (
        assessment_id, student_id, answers_json, state_revision, updated_at
      ) VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(assessment_id, student_id) DO UPDATE SET
        answers_json = excluded.answers_json,
        state_revision = formal_assessment_drafts.state_revision + 1,
        updated_at = excluded.updated_at
      WHERE formal_assessment_drafts.state_revision = ?
    `).run(instance.assessmentId, actor.studentId, JSON.stringify(answers), now, expectedRevision);
    if (changed.changes !== 1) throw new AssessmentDraftRevisionConflictError();
    return this.readDraft(instance.assessmentId, actor.studentId);
  }).immediate();
}
```

- [ ] **Step 7: 增加 PATCH draft route**

`PATCH` body 只允许 `{ answers, expectedRevision }`；正式 `POST` 仍只允许 `{ answers }`，并在同一事务消费 token、写分数、关闭 instance、删除/保留只读草稿和推进 snapshot。

- [ ] **Step 8: 实现客户端倒计时与自动保存**

客户端用 `expiresAt - (serverNow + performance elapsed)` 显示 `MM:SS`；字段变化 500ms 后 PATCH draft。刷新使用服务端 draft 作为 `defaultValue`。剩余 0 秒后尝试一次最终提交；失败时进入只读“测试已到时，未形成成绩”。

- [ ] **Step 9: 运行正式测试回归**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/formal-assessment-attempt-repository.test.ts apps/web/src/platform/formal-assessment-service.test.ts apps/web/src/platform/formal-assessment-p1-tasks.test.ts apps/web/src/platform/formal-assessment-ui.test.tsx`

Expected: PASS；三个 N02 均为 15 分钟、刷新恢复、到时不生成假成绩。

- [ ] **Step 10: 提交**

```powershell
git add apps/web/src/platform/formal-assessment-* apps/web/src/app/api/learning/nodes apps/web/src/features/formal-assessment apps/web/src/app/learn
git commit -m "feat: make formal assessments resumable and timed"
```

---

### Task 4: 收紧 N04 提交与教师认证

**Files:**
- Create: `apps/web/src/platform/professional-output-submission-policy.ts`
- Create: `apps/web/src/platform/professional-output-submission-policy.test.ts`
- Create: `apps/web/src/platform/teacher-certification-policy.ts`
- Create: `apps/web/src/platform/teacher-certification-policy.test.ts`
- Modify: `apps/web/src/platform/professional-output-repository.ts`
- Modify: `apps/web/src/platform/professional-output-repository.test.ts`
- Modify: `apps/web/src/platform/professional-output-review-store.ts`
- Modify: `apps/web/src/platform/professional-output-review.test.ts`
- Modify: `apps/web/src/app/api/outputs/[taskId]/submit/route.ts`
- Modify: `apps/web/src/app/api/teacher/outputs/[outputId]/reviews/route.ts`
- Modify: `apps/web/src/features/review/output-review-panel.tsx`

**Interfaces:**
- Produces: server-side `assertProfessionalOutputSubmittable` and `assertTeacherCertificationAllowed`。
- Guarantees: submit/review/status/frozen score/snapshot transaction atomicity。

- [ ] **Step 1: 写直接 API 绕过红灯测试**

```ts
for (const missing of ['n04-practice', 'formal-test', 'required-field', 'field-evidence', 'upstream']) {
  const fixture = outputFixtureMissing(missing);
  assert.throws(() => fixture.repository.submit(fixture.command), ProfessionalOutputSubmissionError);
}
assert.throws(() => reviewStore.reviewSubmitted(verifyWithTotal(79)), TeacherCertificationError);
assert.throws(() => reviewStore.reviewSubmitted(verifyWithCriterionRatio(0.49)), TeacherCertificationError);
assert.equal(count('output_reviews'), 0);
assert.equal(count('frozen_task_scores'), 0);
```

- [ ] **Step 2: 运行红灯**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/professional-output-submission-policy.test.ts apps/web/src/platform/professional-output-review.test.ts apps/web/src/platform/teacher-output-review-api.test.ts`

Expected: FAIL，当前 output repository 不检查全部学习资格，0 分量规仍可 verify。

- [ ] **Step 3: 定义任务成果政策**

```ts
export const outputSubmissionPolicy = {
  P01: { nodeId: 'P1T1-N04', testNodeId: 'P1T1-N02', requiredActivityId: 'P1T1-N04-micro-01' },
  P02: { nodeId: 'P1T2-N04', testNodeId: 'P1T2-N02', requiredActivityId: 'P1T2-N04-micro-01' },
  P03: { nodeId: 'P1T3-N04', testNodeId: 'P1T3-N02', requiredActivityId: 'P1T3-N04-micro-01' },
} as const;
```

提交校验必须读取 `origin=user` 的 N04 通过 attempt、有效 N02 最高分、当前 task schema、每个证据字段的证据或 `gap + nextAction`、上游本人版本和 CAS revision。

- [ ] **Step 4: 在 output repository 同一事务执行门禁**

`saveDraft` 只验证节点 open、schema 类型和 CAS；`submit` 在写 version/head/event 前调用 `assertProfessionalOutputSubmittable(database, command)`。任何失败都不增加 version、revision 或 snapshot。

- [ ] **Step 5: 固定认证政策**

```ts
export const teacherCertificationPolicy = {
  minTotalScore: 80,
  minimumCriterionRatio: 0.5,
  formulaVersion: 'task-score-40-60-v1',
} as const;
```

`verify` 要求当前成果 version、完整量规 keys、每项不超过 max、总分 ≥80、每项 ≥50%、有效 user 正式测试。失败只能退回；退回必须有具体反馈。

- [ ] **Step 6: 扩展冻结详情**

```ts
details: {
  reviewId,
  formulaVersion: teacherCertificationPolicy.formulaVersion,
  nodeTestAttemptId,
  assessmentId,
  questionVersion,
  nodeTestHighestScore,
  outputId,
  outputVersion,
  outputRubricScore,
  rubricScores,
  taskCompositeScore,
  weights: { nodeTest: 0.4, professionalOutput: 0.6 },
}
```

增加回归：认证冻结后产生更高测试分，既有 `frozen_task_scores` 官方分保持不变；只有当前成果新版本再次提交并由教师重新认证，才写入引用新测试 attempt 的下一条冻结记录。

- [ ] **Step 7: 完善教师批阅 UI**

批阅页必须同时显示字段、证据缩略图、来源、V1/V2 差异、N02 分项诊断、字段批注和量规。总分/单项不满足时确认按钮禁用并解释，但 API 仍重复门禁。

- [ ] **Step 8: 运行成果回归**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/professional-output-submission-policy.test.ts apps/web/src/platform/professional-output-repository.test.ts apps/web/src/platform/teacher-certification-policy.test.ts apps/web/src/platform/professional-output-review.test.ts apps/web/src/platform/teacher-output-review-api.test.ts`

Expected: PASS；非法提交/认证零写入，合法确认原子形成 review、verified、冻结分和 snapshot。

- [ ] **Step 9: 提交**

```powershell
git add apps/web/src/platform/professional-output-* apps/web/src/platform/teacher-certification-* apps/web/src/app/api/outputs apps/web/src/app/api/teacher/outputs apps/web/src/features/review/output-review-panel.tsx
git commit -m "feat: enforce truthful output submission and certification"
```

---

### Task 5: 分离任务推进与能力认证

**Files:**
- Modify: `apps/web/src/platform/learning-projection.ts`
- Modify: `apps/web/src/platform/learning-projection.test.ts`
- Modify: `apps/web/src/platform/learning-policy.ts`
- Modify: `apps/web/src/platform/learning-policy.test.ts`
- Modify: `apps/web/src/platform/learning-read-model.ts`
- Modify: `apps/web/src/platform/learning-read-model.test.ts`
- Modify: `apps/web/src/platform/node-access-projection.ts`
- Modify: `apps/web/src/platform/node-access-projection.test.ts`
- Modify: `apps/web/src/platform/p1-project-projection.ts`
- Modify: `apps/web/src/platform/p1-project-projection.test.ts`

**Interfaces:**
- Changes: `PrerequisiteCondition` supports real student completion facts instead of only `achieved`。
- Produces: monotonic `taskAdvanceReady` and truthful five-axis state projection。

- [ ] **Step 1: 写“提交后开放、退回不回锁”红灯测试**

```ts
const p02 = getNodeLearningPolicy('P1T2-N01')!;
assert.deepEqual(p02.prerequisites, [
  { nodeId: 'P1T1-N02', condition: 'formal-test-passed' },
  { nodeId: 'P1T1-N04', condition: 'professional-output-submitted-once' },
]);
assert.equal(arePrerequisitesMet(p02.prerequisites, [
  progress('P1T1-N02', { formalTestPassed: true }),
  progress('P1T1-N04', { professionalOutputSubmittedOnce: true, achieved: false }),
]), true);
assert.equal(projectAfterTeacherReturn().access, 'open');
assert.equal(projectAfterTeacherReturn().output, 'returned');
assert.equal(projectAfterTeacherReturn().certification, 'pending-review');
```

- [ ] **Step 2: 运行红灯**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/learning-projection.test.ts apps/web/src/platform/learning-policy.test.ts apps/web/src/platform/learning-read-model.test.ts apps/web/src/platform/node-access-projection.test.ts`

Expected: FAIL，现有 prerequisite 只有 `achieved`。

- [ ] **Step 3: 扩展前置条件和事实**

```ts
export type PrerequisiteCondition =
  | 'micro-practice-passed'
  | 'formal-test-passed'
  | 'professional-output-submitted-once'
  | 'teacher-verified';

export interface PrerequisiteProgress {
  nodeId: string;
  microPracticePassed: boolean;
  formalTestPassed: boolean;
  professionalOutputSubmittedOnce: boolean;
  teacherVerified: boolean;
}
```

N01→N02 使用 `micro-practice-passed`，N02→N03 使用 `formal-test-passed`，N03→N04 使用 `micro-practice-passed`；跨任务使用 N02 达标和 N04 `submitted-once` 两项。

- [ ] **Step 4: 从历史事实投影 submitted-once**

查询 `professional_outputs` 当前状态只能说明当前稿；`submitted-once` 从 `learning_events event_type IN ('professional_output_submitted','professional_output_resubmitted') AND origin='user'` 推导，教师退回不会删除该历史事实。

- [ ] **Step 5: 暴露五轴状态**

```ts
type NodeStateAxes = {
  access: 'unpublished' | 'locked' | 'open';
  learning: 'not-started' | 'in-progress' | 'practice-passed';
  formalTest: 'not-required' | 'ready' | 'in-progress' | 'paused' | 'failed' | 'passed' | 'expired';
  output: 'not-required' | 'editing' | 'submitted' | 'returned' | 'revising' | 'resubmitted' | 'verified';
  certification: 'not-reached' | 'pending-review' | 'achieved';
};
```

现有中文 `NodeLearningState` 只从 axes 纯投影，不再承担前置条件判断。

- [ ] **Step 6: 验证 URL/API 门禁继续一致**

锁定/未发布/不存在节点仍不加载正文、活动和提交组件；新增测试直接调用 route 证明 P02 在 valid submit 后开放、return 后仍开放。

- [ ] **Step 7: 运行阶段一回归**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/learning-projection.test.ts apps/web/src/platform/learning-policy.test.ts apps/web/src/platform/learning-read-model.test.ts apps/web/src/platform/node-access-projection.test.ts apps/web/src/platform/p1-project-projection.test.ts apps/web/src/platform/authoritative-snapshot.test.ts`

Expected: PASS；P01 真闭环可由 user facts 完成，P02 单调开放，能力认证仍等待教师。

- [ ] **Step 8: 提交并执行阶段一部署门禁**

```powershell
git add apps/web/src/platform/learning-* apps/web/src/platform/node-access-projection* apps/web/src/platform/p1-project-projection*
git commit -m "feat: separate task advancement from certification"
pnpm web:test:unit
pnpm web:typecheck
pnpm web:check-structure
pnpm web:build
pnpm deploy:web:source
pnpm deploy:web:source:paramiko
```

部署环境只在当前进程设置 `DGBOOK_WEB_DEPLOY_HOST`、`DGBOOK_WEB_DEPLOY_USER`、`DGBOOK_WEB_DEPLOY_PASSWORD`、`DGBOOK_WEB_DEPLOY_PUBLIC_URL`；部署后核验 `/api/build-info` 和 P01 登录旅程。

---

### Task 6: 收敛唯一 TeachingCursor 与课时生命周期

**Files:**
- Create: `apps/web/src/platform/teaching-cursor.ts`
- Create: `apps/web/src/platform/teaching-cursor.test.ts`
- Modify: `apps/web/src/platform/classroom-session-repository.ts`
- Modify: `apps/web/src/platform/classroom-session-repository.test.ts`
- Modify: `apps/web/src/platform/classroom-session-service.ts`
- Modify: `apps/web/src/platform/classroom-session-service.test.ts`
- Modify: `apps/web/src/platform/classroom-session-invariants.ts`
- Modify: `apps/web/src/platform/classroom-state.ts`
- Modify: `apps/web/src/platform/models.ts`
- Modify: `apps/web/src/app/api/class-sessions/[sessionId]/lesson/route.ts`
- Modify: `apps/web/src/app/api/class-sessions/[sessionId]/route.ts`

**Interfaces:**
- Produces: one `TeachingCursor` per open lesson run and explicit lifecycle commands。
- Replaces runtime authority of: `currentSlideId`、`teacherSlideId`、`teacherSlideIndex`、top-level `playbackCursor`。

- [ ] **Step 1: 写 V1 兼容读取和唯一游标红灯测试**

```ts
const run = repository.startLessonRun({ sessionId: 'demo-class', lessonId: 'P01-L1', expectedRevision: 4 });
assert.equal(run.status, 'preparing');
assert.deepEqual(Object.keys(run.teachingCursor).sort(), [
  'actionId', 'actionIndex', 'audioOwner', 'lessonId', 'lessonRunId', 'nodeId',
  'pageId', 'pageIndex', 'phase', 'playbackStatus', 'positionMs', 'rate',
  'revision', 'taskId', 'unitId', 'updatedAt',
].sort());
assert.equal(session.activeLessonRunId, run.lessonRunId);
assert.equal(readLegacySession().teachingCursor.pageId, 'P1-TEACH-CONSOLE-N01');
```

- [ ] **Step 2: 运行红灯**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/teaching-cursor.test.ts apps/web/src/platform/classroom-session-repository.test.ts apps/web/src/platform/classroom-session-service.test.ts`

Expected: FAIL，当前 session 同时写多套游标且没有 lesson run。

- [ ] **Step 3: 定义唯一游标**

```ts
export interface TeachingCursor {
  lessonRunId: string;
  lessonId: 'P01-L1' | 'P01-L2' | 'P02-L1' | 'P03-L1';
  taskId: 'P01' | 'P02' | 'P03';
  nodeId: string;
  unitId: string;
  pageId: string;
  pageIndex: number;
  phase: 'lecture' | 'question' | 'practice' | 'assessment' | 'review' | 'close';
  actionId: string;
  actionIndex: number;
  playbackStatus: 'idle' | 'playing' | 'paused' | 'ended';
  positionMs: number;
  rate: number;
  audioOwner: 'teacher' | 'projector';
  revision: number;
  updatedAt: string;
}
```

- [ ] **Step 4: 增加课时生命周期命令**

```ts
type LessonLifecycleCommand =
  | { type: 'start'; expectedRevision: number }
  | { type: 'pause'; expectedRevision: number }
  | { type: 'resume'; expectedRevision: number }
  | { type: 'close'; expectedRevision: number; collectAssessment: boolean };
```

合法迁移固定为 `preparing→active⇄paused→closed`。`closed` 不可恢复；开始新课先确认没有开放 run。关闭时若测试运行，`collectAssessment=true` 原子收卷后关闭，否则返回 409。

- [ ] **Step 5: 所有翻页和媒体动作只更新 TeachingCursor**

repository 使用 `lesson_run_id + revision` CAS 更新 `teaching_cursor_json`，成功后同步 session revision/topic。兼容 DTO 可以从 cursor 派生旧字段，但禁止双向写回。

- [ ] **Step 6: 修复测试暂停语义**

课堂 `pause` 只修改 lesson run；assessment run 继续计时。独立 `pause-assessment` 才写 `remaining_seconds_when_paused`，且恢复时重算 `expires_at` 并追加审计事件。

- [ ] **Step 7: 运行生命周期回归**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/teaching-cursor.test.ts apps/web/src/platform/classroom-session-repository.test.ts apps/web/src/platform/classroom-session-service.test.ts apps/web/src/platform/class-session-start-lesson-route.test.ts`

Expected: PASS；旧 session 可读，新 run 只有一套位置事实，closed 不可恢复。

- [ ] **Step 8: 提交**

```powershell
git add apps/web/src/platform/teaching-cursor* apps/web/src/platform/classroom-* apps/web/src/platform/models.ts apps/web/src/app/api/class-sessions
git commit -m "feat: add authoritative lesson runs and teaching cursor"
```

---

### Task 7: 让真实浏览器成为课堂 presence 主体

**Files:**
- Create: `apps/web/src/features/classroom/classroom-presence-client.ts`
- Create: `apps/web/src/features/classroom/classroom-presence-client.test.ts`
- Create: `apps/web/src/app/api/class-sessions/[sessionId]/presence/route.ts`
- Create: `apps/web/src/platform/class-session-presence-route.test.ts`
- Modify: `apps/web/src/platform/classroom-session-repository.ts`
- Modify: `apps/web/src/platform/class-session-device-store.ts`
- Modify: `apps/web/src/features/classroom/student-follow-client.tsx`
- Modify: `apps/web/src/features/classroom/teacher-console-client.tsx`
- Modify: `apps/web/src/features/classroom/projector-client.tsx`
- Modify: `apps/web/src/platform/classroom-session-service.ts`
- Modify: `scripts/classroom-helper.mjs`
- Modify: `scripts/classroom-helper-core.test.mjs`

**Interfaces:**
- Produces: Cookie-authenticated browser heartbeat with `online/degraded/offline` health。
- Demotes: helper to `clientKind='helper-simulator'` with no teaching gate authority。

- [ ] **Step 1: 写真实浏览器 presence 红灯测试**

```ts
const online = await heartbeat(studentCookie, {
  deviceId: 'browser-stu-01', visibilityState: 'visible', pageState: 'ready', lastSeenClassroomRevision: 7,
});
assert.equal(online.actorRole, 'student');
assert.equal(online.studentId, 'stu-01');
assert.equal(online.clientKind, 'browser');
assert.equal(readAt(plusSeconds(6)).syncHealth, 'degraded');
assert.equal(readAt(plusSeconds(16)).syncHealth, 'offline');
```

- [ ] **Step 2: 运行红灯**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/class-session-presence-route.test.ts apps/web/src/features/classroom/classroom-presence-client.test.ts apps/web/src/platform/classroom-session-service.test.ts`

Expected: FAIL，真实页面没有 heartbeat，helper offline 仍阻止翻页。

- [ ] **Step 3: 实现 Cookie actor presence route**

route 不接受 user ID 或角色；从 Cookie 推导身份并验证 session ownership/membership。teacher、student、projector 均写 `client_kind='browser'`。学生 heartbeat 联结 participation 表，仅 `joined + follow` 进入同步接收者集合。

- [ ] **Step 4: 在三个真实客户端挂载 heartbeat**

可见时每 3 秒、隐藏时每 10 秒发送；页面 unload 只停止心跳，不写离线状态。客户端重连先 GET 最新 cut，再继续 heartbeat。

- [ ] **Step 5: 删除 helper 业务门禁**

删除 `requiresLiveHelper`、`hasLiveStudentHelper` 和 UI 的 `helperReady` 禁用条件。服务器离线才禁用共享写操作；0 名学生在线只显示警告，不阻止教师浏览、翻页或发起活动。

- [ ] **Step 6: 限定 helper 为模拟器**

helper 请求必须携带 `clientKind: 'helper-simulator'`，UI 显示“演示设备模拟器”；它不得改变真实 browser 在线人数、不得 `bringToFront()` 真实自主学生，也不得决定课堂操作是否可用。

- [ ] **Step 7: 运行 presence 回归**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/class-session-presence-route.test.ts apps/web/src/platform/class-session-device-store.test.ts apps/web/src/platform/classroom-session-service.test.ts apps/web/src/features/classroom/classroom-presence-client.test.ts scripts/classroom-helper-core.test.mjs`

Expected: PASS；helper 未启动时教师仍能翻页，真实三浏览器独立计算在线状态。

- [ ] **Step 8: 提交**

```powershell
git add apps/web/src/app/api/class-sessions apps/web/src/features/classroom apps/web/src/platform/class-session-* apps/web/src/platform/classroom-session-* scripts/classroom-helper*
git commit -m "feat: use real browser classroom presence"
```

---

### Task 8: 接通课堂活动、正式测试窗口和三端精确同步

**Files:**
- Modify: `apps/web/src/features/classroom/classroom-follow-model.ts`
- Modify: `apps/web/src/features/classroom/classroom-follow-model.test.ts`
- Modify: `apps/web/src/features/classroom/classroom-follow-renderer.tsx`
- Modify: `apps/web/src/features/classroom/classroom-follow-renderer.test.tsx`
- Modify: `apps/web/src/features/classroom/student-follow-client.tsx`
- Modify: `apps/web/src/features/classroom/teacher-console-client.tsx`
- Modify: `apps/web/src/features/classroom/teacher-console-view.tsx`
- Modify: `apps/web/src/features/classroom/projector-client.tsx`
- Modify: `apps/web/src/features/classroom/use-class-session.ts`
- Modify: `apps/web/src/features/classroom/class-session-polling.ts`
- Modify: `apps/web/src/platform/authoritative-snapshot.ts`
- Modify: `apps/web/src/platform/authoritative-snapshot.test.ts`
- Modify: `apps/web/src/platform/classroom-assessment-run-reader.ts`

**Interfaces:**
- Consumes: `TeachingCursor`、canonical activity attempts、classroom assessment run。
- Produces: same-revision teacher/projector/follower cut; anonymous real submission review。

- [ ] **Step 1: 写三端同页和 self 隔离红灯测试**

```ts
assert.deepEqual(pickCursor(teacher), pickCursor(projector));
assert.deepEqual(pickCursor(projector), pickCursor(followStudent));
assert.equal(followStudent.pageId, 'P01-L1-P05');
assert.equal(selfStudent.teacherUpdateAvailable, true);
assert.deepEqual(readSelfStudyCursor('stu-02'), cursorBeforeTeacherPaging);
```

并写活动测试：课堂提交 `P1T1-N02-foundation-01` 后，自学读取同一活动 `passed=true`；失败后可重新作答且失败记录仍存在。

- [ ] **Step 2: 运行红灯**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/features/classroom/classroom-follow-model.test.ts apps/web/src/features/classroom/classroom-follow-renderer.test.tsx apps/web/src/platform/authoritative-snapshot.test.ts apps/web/src/features/classroom/use-class-session-runtime.test.ts`

Expected: FAIL，跟随端仍使用 `revision % 4` 且活动无真实控件。

- [ ] **Step 3: 跟随端消费精确游标并复用 ActivityWorkbench**

`ClassroomFollowViewModel` 必须包含 `lessonId/pageId/pageIndex/pageCount/revision`。删除 `revision % 4`。活动页用 canonical DTO 渲染 `ActivityWorkbench`，delivery 固定为当前 `sessionId + lessonRunId`。

- [ ] **Step 4: 实现课堂 assessment run 服务端窗口**

启动时创建一个共享 run，服务端设置 `startedAt/expiresAt`。三个学生的 instance 指向同一 run。教师动作固定为启动、独立暂停/恢复、提前收卷、进入讲评；第一份提交不关闭 run。

讲评可用条件：

```ts
const reviewAllowed = submittedCount > 0 && (
  submittedCount === eligibleCount
  || run.status === 'expired'
  || run.closedReason === 'teacher-collected'
);
```

- [ ] **Step 5: 合并同一 cut 的轮询**

活动课堂每 1 秒请求权威 snapshot；UI 只在 `snapshot.classroomRevision === snapshot.classroom.revision` 时提交渲染。删除另一个独立 session payload 的拼接使用；后台/隐藏页降为 10 秒。

- [ ] **Step 6: 修复投屏**

投屏从 assessment run 的服务端 `expiresAt/serverNow` 显示倒计时，删除硬编码 `06:00`。上一页/下一页写同一 TeachingCursor CAS；返回只退出投屏。讲评 DTO 继续白名单，序列化测试禁止身份、答案、证据和个人分数。

- [ ] **Step 7: 完成教师课堂主操作**

主操作按 preparing/lecture/activity/test/review/paused/closed 唯一切换；上一页、暂停、结束、投屏为次级。0 提交禁讲评保留双层门禁。结束课堂时如测试运行，明确显示“收卷并结束”。

- [ ] **Step 8: 运行阶段二回归**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/features/classroom/classroom-follow-model.test.ts apps/web/src/features/classroom/classroom-follow-renderer.test.tsx apps/web/src/features/classroom/student-follow-client.test.tsx apps/web/src/features/classroom/teacher-projector-snapshot-contract.test.ts apps/web/src/features/classroom/task8-teacher-projector-ui-contract.test.ts apps/web/src/platform/authoritative-snapshot.test.ts apps/web/src/platform/classroom-session-service.test.ts`

Expected: PASS；同页同 revision、self 不跳页、课堂真实活动、统一倒计时、匿名讲评。

- [ ] **Step 9: 提交并执行阶段二部署门禁**

```powershell
git add apps/web/src/features/classroom apps/web/src/platform/authoritative-snapshot* apps/web/src/platform/classroom-assessment-run-reader.ts
git commit -m "feat: complete real three-terminal classroom sync"
pnpm web:test:unit
pnpm web:typecheck
pnpm web:check-structure
pnpm web:build
pnpm deploy:web:source
pnpm deploy:web:source:paramiko
```

远程冒烟必须在不启动 helper 的条件下验证教师翻页、投屏和真实 student01 follow。

---

### Task 9: 建立四课时授课包与递减支架内容

**Files:**
- Create: `apps/web/src/features/textbook-scene/p1-teaching-package.ts`
- Create: `apps/web/src/features/textbook-scene/p1-teaching-package.test.ts`
- Modify: `apps/web/src/features/textbook-scene/p01-teaching-package.ts`
- Modify: `apps/web/src/features/textbook-scene/classroom-lesson-model.ts`
- Modify: `apps/web/src/features/textbook-scene/classroom-lesson-model.test.ts`
- Modify: `apps/web/src/features/platform/p1-content.ts`
- Modify: `apps/web/src/features/platform/p1-content.test.ts`
- Modify: `scripts/import_5g/p1_demo_content.py`
- Modify: `scripts/import_5g/test_p1_demo_content.py`
- Regenerate: `textbook/5g/generated/p1-demo-content.json`
- Modify: `apps/web/src/features/textbook-scene/annotated-engineering-figure.tsx`
- Modify: `packages/widgets/src/edugame-pixi/TopologyRepairArcade.tsx`
- Modify: `packages/widgets/src/edugame-pixi/index.ts`

**Interfaces:**
- Produces: `P01-L1` 6 pages、`P01-L2` 6 pages、`P02-L1` 6 pages、`P03-L1` 6 pages。
- Reuses: generated P1 activities and existing topology interaction。

- [ ] **Step 1: 写四课时内容契约红灯测试**

```ts
assert.deepEqual(p1TeachingPackage.lessons.map(({ id, pages }) => [id, pages.length]), [
  ['P01-L1', 6], ['P01-L2', 6], ['P02-L1', 6], ['P03-L1', 6],
]);
for (const lesson of p1TeachingPackage.lessons) {
  assert.equal(sum(lesson.pages.map(({ durationMinutes }) => durationMinutes)), 45);
  for (const page of lesson.pages) assertFields(page, [
    'projectorContent', 'teacherNarration', 'question', 'modelAnswer', 'commonErrors',
    'followUps', 'studentAction', 'transition', 'canonicalActivityId',
  ]);
}
assert.equal(scaffoldLevel('P01-L1'), 'full');
assert.equal(scaffoldLevel('P02-L1'), 'reduced');
assert.equal(scaffoldLevel('P03-L1'), 'independent');
assert.equal(pageWithFormalAssessment('P1T1-N02').lessonId, 'P01-L2');
```

- [ ] **Step 2: 运行红灯**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/features/textbook-scene/p1-teaching-package.test.ts apps/web/src/features/textbook-scene/classroom-lesson-model.test.ts apps/web/src/features/platform/p1-content.test.ts`

Expected: FAIL，当前只有 P01 一套授课包且跟节点/播放 action 混用。

- [ ] **Step 3: 定义统一授课页类型**

```ts
export interface TeacherLessonPage {
  id: string;
  nodeId: string;
  durationMinutes: number;
  projectorContent: string[];
  teacherNarration: string[];
  question: string;
  modelAnswer: string;
  commonErrors: string[];
  followUps: string[];
  studentAction: string;
  transition: string;
  canonicalActivityId?: string;
  scaffoldLevel: 'full' | 'reduced' | 'independent';
}
```

- [ ] **Step 4: 补齐 24 页具体授课内容**

P01-L1 完整示范位置/身份/方向证据；P01-L2 用检索题进入应用、迁移、正式测试、N03、N04。P02 比较室内与室外材料但不重复完整答案。P03 不预标证据类别，要求学生自主形成投诉调查结论。禁止通用句“答案需包含对象、证据、判断依据和下一步动作”。

- [ ] **Step 5: 经导入器生成 P02/P03 专属活动与检索题**

只修改导入器/源模型并运行：

Run: `python scripts/import-5g-docx.py`

Expected: `p1-demo-content.json` 稳定生成 3 任务、12 节点、各自 canonical activity，无手工差异。

- [ ] **Step 6: 把“看图”改成真实带标注关系图**

复用现有媒体与 `AnnotatedEngineeringFigure`，每个标注可聚焦位置、铭牌/型号/槽位、端口和方向。禁止用四张纯文字卡代替图。

- [ ] **Step 7: 限定 PixiJS 使用边界**

只在 N02 链路重建调用 `TopologyRepairArcade`；提交结果仍转换为 canonical activity response 并由服务端评价。为键盘、reduced-motion 和 Canvas 不可用场景渲染相同 response schema 的 DOM sequence builder。

- [ ] **Step 8: 运行内容回归**

Run: `python -m unittest scripts.import_5g.test_p1_demo_content && node --import ./scripts/web-test-register.mjs --test apps/web/src/features/textbook-scene/p1-teaching-package.test.ts apps/web/src/features/textbook-scene/classroom-lesson-model.test.ts apps/web/src/features/platform/p1-content.test.ts apps/web/src/features/textbook-scene/annotated-engineering-figure.test.tsx && pnpm --filter @dgbook/widgets typecheck`

Expected: PASS；24 页共 180 分钟、字段齐全、支架递减、图与互动可降级。

- [ ] **Step 9: 提交**

```powershell
git add scripts/import_5g apps/web/src/features/textbook-scene apps/web/src/features/platform textbook/5g/generated/p1-demo-content.json packages/widgets/src/edugame-pixi
git commit -m "feat: add four complete P1 teaching lessons"
```

---

### Task 10: 扩展 P02/P03 成果、成果包与图谱真实挂接

**Files:**
- Modify: `apps/web/src/features/portfolio/output-schema.ts`
- Modify: `apps/web/src/features/portfolio/output-schema.test.ts`
- Modify: `apps/web/src/features/portfolio/output-fieldsets.tsx`
- Modify: `apps/web/src/features/portfolio/professional-output-form.tsx`
- Modify: `apps/web/src/features/portfolio/p1-portfolio-detail-model.ts`
- Modify: `apps/web/src/features/portfolio/p1-portfolio-detail-view.tsx`
- Modify: `apps/web/src/features/portfolio/p1-portfolio-detail-view.test.tsx`
- Modify: `apps/web/src/platform/professional-output-portfolio-reader.ts`
- Modify: `apps/web/src/platform/professional-output-portfolio-reader.test.ts`
- Modify: `apps/web/src/platform/learning-mastery.ts`
- Modify: `apps/web/src/features/skill-tree/skill-progress-client.ts`
- Modify: `apps/web/src/features/skill-tree/skill-progress-client.test.ts`

**Interfaces:**
- Produces: real P02/P03 editable outputs and auditable P1 package。
- Guarantees: graph links route to real assessment/output and scores can trace frozen facts。

- [ ] **Step 1: 写三成果完整性红灯测试**

```ts
for (const taskId of ['P01', 'P02', 'P03'] as const) {
  const schema = outputSchemaFor(taskId);
  assert.ok(schema.requiredFields.length >= 6);
  assert.ok(schema.evidenceRules.length >= 3);
}
assert.equal(portfolioAfterThreeSubmissions.status, 'summary-ready');
assert.equal(portfolioAfterTwoVerifications.status, 'summary-ready');
assert.equal(portfolioAfterThreeVerifications.status, 'deliverable');
assert.equal(portfolioAfterThreeVerifications.projectScore, average([p01, p02, p03]));
```

- [ ] **Step 2: 运行红灯**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/features/portfolio/output-schema.test.ts apps/web/src/platform/professional-output-portfolio-reader.test.ts apps/web/src/features/portfolio/p1-portfolio-detail-view.test.tsx apps/web/src/features/skill-tree/skill-progress-client.test.ts`

Expected: FAIL，P02/P03 仍缺与 P01 等价的字段/证据/版本体验或迁移对照。

- [ ] **Step 3: 定义三任务 schema 与证据政策**

P02 至少包含站点、扇区、方位/下倾、覆盖点、路线、证据缺口和复测动作；P03 至少包含投诉工单、复现场景、时间/空间条件、证据链、边界判断、风险和下一步动作。每个字段声明允许证据和缺口替代规则。

- [ ] **Step 4: 自动汇总上游活动与版本**

P02 引用当前 P01 output version，P03 引用当前 P02 version；字段来源保存 `sourceNodeId/sourceAttemptId`。查看版本差异时展示 V1/V2 字段、证据和批注差异，而不是只显示版本号。

- [ ] **Step 5: 完成项目成果包迁移对照**

成果包显示位置、身份、方向/关系框架在室内、室外、投诉三个场景的迁移；三个 submitted 后可汇总，三个 verified 后才“可交付”并显示项目综合分。

- [ ] **Step 6: 修复图谱目标路由和分数来源**

`formal-assessment` → `/learn/[nodeId]/test`；`professional-output` → `/student/projects/p1/portfolio/[taskId]`；任务分只读 frozen score；能力达成只读 axes projection。演示数据始终显示 origin 标签。

- [ ] **Step 7: 运行 P1 全任务回归**

Run: `node --import ./scripts/web-test-register.mjs --test apps/web/src/features/portfolio/output-schema.test.ts apps/web/src/platform/professional-output-portfolio-reader.test.ts apps/web/src/features/portfolio/p1-portfolio-detail-view.test.tsx apps/web/src/platform/learning-mastery.test.ts apps/web/src/features/skill-tree/skill-progress-client.test.ts apps/web/src/platform/p1-project-projection.test.ts`

Expected: PASS；三个成果可编辑/提交/批阅/打开，项目分只在三项认证后形成。

- [ ] **Step 8: 提交并执行阶段三部署门禁**

```powershell
git add apps/web/src/features/portfolio apps/web/src/platform/professional-output-portfolio-reader* apps/web/src/platform/learning-mastery* apps/web/src/features/skill-tree
git commit -m "feat: complete P1 outputs portfolio and graph flow"
pnpm web:test:unit
pnpm web:typecheck
pnpm web:check-structure
pnpm web:build
pnpm deploy:web:source
pnpm deploy:web:source:paramiko
```

远程冒烟从 student01 空状态真实完成 P01 提交并确认 P02 已开放；另外验证已有 demo student 的 P02/P03 成果仅显示“演示数据”。

---

### Task 11: Image2 视觉收口与可逆冗余清理

**Files:**
- Modify: `apps/web/src/features/home/student-home.tsx`
- Modify: `apps/web/src/features/home/role-home-read-model.ts`
- Modify: `apps/web/src/app/role-home-v5.css`
- Modify: `apps/web/src/app/self-study-textbook.css`
- Modify: `apps/web/src/app/digital-classroom-v4.css`
- Modify: `apps/web/src/app/student-classroom-runtime.css`
- Modify: `apps/web/src/app/platform-overview.css`
- Modify: `apps/web/src/features/platform-overview/public-platform-view.tsx`
- Modify: `apps/web/src/features/classroom/teacher-console-view.tsx`
- Modify: `apps/web/src/features/classroom/projector-client.tsx`
- Modify: `scripts/audit-image2-layout.mjs`
- Modify: `scripts/cleanup-runtime-artifacts.mjs`
- Modify: `scripts/cleanup-runtime-artifacts.test.mjs`

**Interfaces:**
- Produces: dual-context student home、single-page-index classroom UI、1440/1920 layout gates、protected cleanup manifest。

- [ ] **Step 1: 写视觉契约红灯测试**

断言学生首页同时存在 `教师当前讲到` 和 `我个人学到`，主按钮随课堂状态唯一切换；教师更多操作不越出 1440×900 viewport；投屏只有一个 page counter；平台八阶段在桌面为 `repeat(4, minmax(0, 1fr))`。

- [ ] **Step 2: 运行红灯**

Run: `node --test scripts/audit-image2-layout.test.mjs scripts/cleanup-runtime-artifacts.test.mjs && node --import ./scripts/web-test-register.mjs --test apps/web/src/features/home/role-home-ui-contract.test.ts apps/web/src/features/classroom/task8-teacher-projector-ui-contract.test.ts`

Expected: FAIL，当前学生首页课堂/个人语义混合、平台第八阶段裁切或教师菜单越界。

- [ ] **Step 3: 收口学生与自学布局**

课堂进行中显示课堂位置为主、个人位置为次；没有课堂时反转。折叠重复的节点 rail/播放 dock，正文保持单一纵向滚动；练习区不使用嵌套固定高度滚动。六段进度只显示同一口径。

- [ ] **Step 4: 收口教师和投屏布局**

菜单使用 viewport-aware right alignment；投屏显示 `当前课时第 X/Y 页`，媒体动作进度仅在媒体控件内部出现。离线只禁用共享写，投屏本地全屏/返回始终可用。

- [ ] **Step 5: 修复平台总览八阶段**

桌面 `4×2`、窄屏 `2×4`、手机 `1×8`；不使用隐藏水平滚动掩盖第八阶段。

- [ ] **Step 6: 执行引用证明后的可逆清理**

`cleanup-runtime-artifacts.mjs --dry-run` 只列出重复截图、临时 Playwright 输出、过期 release 包、工具缓存和无引用运行时副本；输出受保护拒绝列表。功能提交中只更新规则和测试，不直接删除 `.git`、数据库、权威教材、已验证媒体或验收证据。

- [ ] **Step 7: 运行视觉与清理门禁**

Run: `pnpm test:image2-layout && pnpm audit:image2-layout && pnpm test:workspace-cleanup && pnpm audit:dark-engineering-ui`

Expected: PASS，1440×900 与 1920×1080 无裁切、重复页码或受保护清理候选；键盘可完成主路径，200% 缩放无横向遮挡，`prefers-reduced-motion` 下 Pixi/页面转场停止非必要动画。

- [ ] **Step 8: 提交**

```powershell
git add apps/web/src/features/home apps/web/src/features/classroom apps/web/src/features/platform-overview apps/web/src/app/role-home-v5.css apps/web/src/app/self-study-textbook.css apps/web/src/app/digital-classroom-v4.css apps/web/src/app/student-classroom-runtime.css apps/web/src/app/platform-overview.css scripts/audit-image2-layout.mjs scripts/cleanup-runtime-artifacts*
git commit -m "fix: polish classroom-ready Image2 experience"
```

---

### Task 12: 完整验收、GitHub 推送与生产发布

**Files:**
- Modify: `scripts/audit-self-study-closure.mjs`
- Modify: `scripts/audit-p1-complete-journey.mjs`
- Modify: `scripts/audit-class-session-cross-context.mjs`
- Modify: `scripts/audit-class-session-sync.mjs`
- Modify: `scripts/audit-p1-three-terminal-consistency.mjs`
- Create: `scripts/audit-p1-four-lesson-journey.mjs`
- Modify: `package.json`
- Update: `docs/acceptance/p1-final-release-checklist.md`

**Interfaces:**
- Produces: clean-db browser evidence、full local gates、three staged remote deployments、final GitHub state and live build proof。

- [ ] **Step 1: 把旧审计从 generic event 改为真实事件**

浏览器脚本必须通过真实 UI/API 完成 canonical practice、formal test、N04 submission、teacher return/revision/verify；不得直接插入 `completed`、分数或 verified 状态。`audit-class-session-cross-context` 删除人工 helper heartbeat 前置。

- [ ] **Step 2: 建立三学生路径矩阵**

```text
student01: 完整自学 → 正式测试 → N04 提交
student02: 课堂 follow 完成一个活动 → 切 self → 退回成果修订
student03: 混合模式 → 完整 P01/P02/P03 → 项目成果包
teacher01: 四课时 start/pause/resume/close → 活动/测试/匿名讲评 → 课后批阅
projector: 同页、统一倒计时、匿名 DTO、上一页/下一页/返回
```

- [ ] **Step 3: 运行聚焦浏览器审计**

Run: `pnpm dev`

在另一终端依次运行：

```powershell
pnpm audit:self-study-closure -- --allow-local-mutation --isolated-sqlite D:\Claude\dgbook\output\acceptance\p1-clean.sqlite
pnpm audit:class-session-cross-context -- --base-url http://127.0.0.1:3157
pnpm audit:class-session-sync -- --base-url http://127.0.0.1:3157
pnpm audit:p1-three-terminal-consistency
node scripts/audit-p1-four-lesson-journey.mjs --base-url http://127.0.0.1:3157
```

Expected: teacher/projector/follow 在两秒内同页；self 游标不变；0 提交拒绝讲评；刷新恢复草稿/计时；P02/P03 单调开放；成果包与图谱同快照。

- [ ] **Step 4: 运行完整本地门禁**

```powershell
pnpm web:test:unit
pnpm web:typecheck
pnpm web:check-structure
pnpm web:build
pnpm qa:gates
pnpm test:workspace-cleanup
git diff --check
git status --short
```

Expected: 全部 exit 0；工作树只包含计划内验收文档/证据索引，不包含数据库、凭据或临时浏览器目录。

- [ ] **Step 5: 更新最终验收清单并提交**

清单逐项链接单测、浏览器截图、快照版本、构建日志和线上 build-info。不得以“无错误”代替具体闭环证据。

```powershell
git add scripts/audit-* package.json docs/acceptance/p1-final-release-checklist.md
git commit -m "test: prove the complete P1 teaching journey"
```

- [ ] **Step 6: 推送 GitHub**

```powershell
git remote -v
git status --short
git log -5 --oneline
git push origin main
```

Expected: `origin` 指向 `git@github.com:greatwallwen/dg5g.git`，push 成功且本地 `main` 与 `origin/main` 同一 SHA。

- [ ] **Step 7: 生成并部署最终 source release**

在当前 PowerShell 进程设置部署环境变量后运行：

```powershell
pnpm deploy:web:source
pnpm deploy:web:source:paramiko
```

Expected: 部署脚本在线备份共享 SQLite/WAL/SHM、运行 expand-first migration、构建新 release、原子切换 `dgbook-web`，失败自动保留上一 release。

- [ ] **Step 8: 执行线上四端冒烟**

```powershell
Invoke-RestMethod http://8.153.206.97/api/build-info
pnpm audit:web:remote:protocol
pnpm audit:web:remote
```

浏览器复核 `/`、`/student/home`、`/teacher/workbench`、`/teacher/sessions/demo-class`、`/present/demo-class`、`/classroom/demo-class`、P01/P02/P03、正式测试、成果包和能力图谱。线上 release SHA 必须等于 GitHub `main`。

- [ ] **Step 9: 最终提交状态证明**

```powershell
git fetch origin
git status --short
git rev-parse HEAD
git rev-parse origin/main
```

Expected: 工作树干净，两个 SHA 完全一致；线上 build-info 返回同一 source SHA 和新的 release ID。

## Execution Order and Parallelism

- Task 1 是所有实现的串行前置。
- Task 2 完成后，Task 3 与 Task 6 可以并行；两者都完成后进入 Task 8。
- Task 4 与 Task 5 串行，形成阶段一真实闭环。
- Task 7 可与 Task 4/5 并行，但必须在 Task 8 前完成。
- Task 9 可在 Task 2 接口稳定后并行编写内容；Task 10 必须等待 Task 4/5 和 Task 9。
- Task 11 等 Task 8/10 页面结构稳定后执行。
- Task 12 只在 Task 1—11 全部通过后执行。

执行采用 subagent-driven development：每项任务由独立实现 agent 完成，再依次进行规格符合性审查和代码质量审查；共享文件任务不得并行编辑。每个阶段部署后立即做远程冒烟，失败则继续修正当前阶段，不把问题推迟到最终发布。

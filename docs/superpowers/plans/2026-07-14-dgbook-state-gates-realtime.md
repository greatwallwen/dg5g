# DGBook 学习状态、门禁、课堂与实时数据实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 SQLite 事件和唯一政策投影替换进程内学习/课堂状态，使节点门禁、自学游标、课堂同步、分数和四端统计具有同一权威事实。

**Architecture:** 写操作进入服务层并在 SQLite 事务中追加幂等事实；状态、分数和解锁由纯投影函数计算。页面和 API 共用一个访问分类器。课堂游标与个人游标独立持久化。SSE 仅发布版本失效通知，四端重新 GET 同一事务快照。

**Tech Stack:** TypeScript、`better-sqlite3` repository、Next.js Route Handlers/Server Components、SSE、Node test runner、Playwright。

---

## Task 1 (S1)：冻结唯一节点政策与合法状态投影

**Files:**

- Create: `apps/web/src/platform/learning-status.ts`
- Create: `apps/web/src/platform/learning-projection.ts`
- Create: `apps/web/src/platform/learning-projection.test.ts`
- Modify: `apps/web/src/platform/models.ts`
- Modify: `apps/web/src/platform/learning-policy.ts`
- Modify: `apps/web/src/platform/learning-policy.test.ts`
- Modify: `apps/web/src/platform/fixtures/learning-fixtures.ts`
- Delete after migration: `apps/web/src/platform/learning-mastery.ts`
- Delete after migration: `apps/web/src/platform/learning-mastery.test.ts`

- [ ] 写失败测试：12 个 P1 节点都有显式政策，`publicationStatus`、`assessmentRole`、`formalPassScore`、`requiresTeacherVerification` 不允许组件推断。
- [ ] 写失败测试：同任务 N01→N04 要求前节点 `achieved`；跨任务 P1T2/P1T3 入口要求上一 N04 的 task-pixi 达标且首次产出已提交，不等待教师认证。
- [ ] 写失败表驱动测试覆盖：未解锁、可学习、学习中、微练习通过、正式测试达标、专业产出已提交、待教师复核、退回修订、教师认证、能力达成。
- [ ] 写失败测试：正式测试 100 分不能直接得到 `teacher-verified`/`achieved`；微练习不能生成正式测试分；退回后重新提交回到待复核。
- [ ] 运行 `node --test apps/web/src/platform/learning-policy.test.ts apps/web/src/platform/learning-projection.test.ts`，确认因缺失新类型/规则失败。
- [ ] 在 `learning-status.ts` 定义唯一 `NodeLearningState`、中文展示文案、颜色语义和排序；从 `models.ts` 移除重复 `SkillMasteryState` 消费点。
- [ ] 在 `learning-policy.ts` 定义：

```ts
export type AssessmentRole = 'none' | 'node-test' | 'task-pixi';
export type PublicationStatus = 'published' | 'not-open';
export type PrerequisiteCondition = 'achieved' | 'formal-test-and-output-submitted';

export interface NodeLearningPolicy {
  nodeId: `P1T${1 | 2 | 3}-N0${1 | 2 | 3 | 4}`;
  taskId: 'P01' | 'P02' | 'P03';
  publicationStatus: PublicationStatus;
  prerequisites: Array<{ nodeId: string; condition: PrerequisiteCondition }>;
  requiresMicroPractice: boolean;
  requiresFormalTest: boolean;
  assessmentRole: AssessmentRole;
  formalPassScore?: number;
  requiresProfessionalOutput: boolean;
  requiresTeacherVerification: boolean;
  professionalOutputTitle?: string;
}
```

- [ ] 设定每任务 N02=`node-test`、N04=`task-pixi`；N04 要求任务产出与教师认证；普通节点不伪造不需要的阶段。
- [ ] 实现纯函数 `deriveNodeLearningProjection(policy, facts, prerequisiteFacts)`；输出 `state/stateTrail/completionPercent/nextRequirement/achieved`。
- [ ] 删除所有 `best score => mastered`、`已点亮` 和组件内 `requiresTeacherVerification` 判断，统一改读投影。
- [ ] 重跑定向测试，预期全部通过；再运行 `pnpm web:test:unit` 防止旧模型残留。

## Task 2 (S2)：SQLite 学习事件、专业产出与成绩投影

**Depends on:** foundation Task F1 的 `AppDatabase`、迁移和 seed。

**Files:**

- Create: `apps/web/src/platform/learning-repository.ts`
- Create: `apps/web/src/platform/learning-repository.test.ts`
- Create: `apps/web/src/platform/learning-service.ts`
- Create: `apps/web/src/platform/learning-service.test.ts`
- Create: `apps/web/src/platform/score-projection.ts`
- Create: `apps/web/src/platform/score-projection.test.ts`
- Create: `apps/web/src/platform/professional-output-repository.ts`
- Modify: `apps/web/database/migrations/002_learning.sql`（由 foundation 预建，本任务补齐最终列/索引后冻结）
- Modify: `apps/web/database/seeds/demo.json`
- Delete after callers migrate: `apps/web/src/platform/skill-progress-store.ts`
- Delete after callers migrate: `apps/web/src/platform/skill-progress-store.test.ts`

- [ ] 写失败 repository 测试：同一 `eventId`、`attemptId` 重放只保存一次；事务异常时事件、尝试和版本号全部回滚。
- [ ] 写失败 service 测试：客户端传入的 `studentId`、派生状态或综合分被忽略/拒绝，实际 student 只能来自 `AuthenticatedActor`。
- [ ] 写失败评分测试：节点测试取 N02 正式尝试最高分；任务 Pixi 取 N04 正式尝试最高分；微练习完全排除。
- [ ] 写失败评分测试：`provisional = nodeAverage*0.2 + pixiBest*0.3 + outputRubric*0.5`；教师认证后冻结 `officialTaskScore`；项目分为三个正式任务分等权平均。
- [ ] 写失败测试：教师认证不回填/覆盖测试分；上游退回不重新锁死已开始下游，但 `projectBlockers` 含待修订产出。
- [ ] 运行定向测试，确认因为 repository/service 不存在而失败。
- [ ] 实现 `LearningRepository`：追加/查询 section、micro-practice、formal-attempt、output submitted/returned/verified 事实，所有唯一键由数据库约束保证。
- [ ] 实现 `ProfessionalOutputRepository`：每任务版本化结构化 JSON、提交时间、review 状态、量规维度分与反馈；教师只能复核当前版本。
- [ ] 实现 `LearningService`：`startNode`、`completeSection`、`submitMicroPractice`、`recordFormalAttempt`、`saveOutputDraft`、`submitOutput`、`reviewOutput`，每个命令先鉴权、再门禁、再事务写入。
- [ ] 实现 `readLearningSnapshot(studentId)`，在一次只读事务中加载事实并投影 12 节点、3 任务和 P1。
- [ ] 实现 `score-projection.ts`，返回带清晰字段名的分数，任何未齐数据返回 `undefined` 而非虚构 0/100。
- [ ] 将旧 skill store 调用迁移完后删除三个 `globalThis Map` 中的学习 Map；用 `rg "skill-progress-store|SkillMasteryState|已点亮" apps/web/src` 确认无业务调用。
- [ ] 重跑定向测试、`pnpm web:test:unit` 和 `PRAGMA foreign_key_check`。

## Task 3 (S3)：页面与 API 共用的节点访问门禁

**Files:**

- Create: `apps/web/src/platform/node-access.ts`
- Create: `apps/web/src/platform/node-access.test.ts`
- Create: `apps/web/src/features/learning/node-access-notice.tsx`
- Create: `apps/web/src/app/learn/[nodeId]/not-found.tsx`
- Modify: `apps/web/src/app/learn/[nodeId]/page.tsx`
- Modify: `apps/web/src/platform/access-control.ts`
- Modify: `apps/web/src/platform/access-control.test.ts`
- Modify: all learning write routes created in Task S2
- Modify: `apps/web/src/platform/fixtures/p1-scope.test.ts`

- [ ] 写失败测试覆盖 `open/locked/not-open/not-found`，尤其 P1T1-N04 锁定、P1T3-N01 已发布可进入、非法 ID 不回退 P1T1-N01。
- [ ] 写失败页面测试/运行时断言：locked 只呈现所需前置和完成要求，DOM 中不存在教材正文、练习、正式测试和提交表单。
- [ ] 写失败 API 测试：locked/not-open/not-found 的所有写命令分别返回 423/404/404（响应 code 明确区分），不写数据库。
- [ ] 实现 `classifyNodeAccess(actor, nodeId, db)`，先验证静态定义/发布状态，再读取学生事实；教师授课访问使用独立 `classifyTeachingAccess`，不得借教师权限替学生提交。
- [ ] `learn/[nodeId]/page.tsx` 在加载内容前调用分类器；仅 `open` 分支 import/读取教材定义。
- [ ] `node-access-notice.tsx` 只接收安全 DTO，不接收完整内容对象。
- [ ] 删除 Next redirect、fixture helper、审计脚本中的未知节点 fallback。
- [ ] 运行 `node --test apps/web/src/platform/node-access.test.ts apps/web/src/platform/access-control.test.ts`，再运行 `pnpm web:build` 验证动态路由。

## Task 4 (S4)：SQLite 课堂事实与自学/课堂双游标

**Files:**

- Create: `apps/web/src/platform/classroom-repository.ts`
- Create: `apps/web/src/platform/classroom-repository.test.ts`
- Create: `apps/web/src/platform/classroom-cursors.ts`
- Create: `apps/web/src/platform/classroom-cursors.test.ts`
- Modify: `apps/web/database/migrations/003_classroom.sql`（由 foundation 预建，本任务补齐最终列/索引后冻结）
- Modify: `apps/web/src/platform/class-session-protocol.ts`
- Modify: `apps/web/src/platform/class-session-protocol.test.ts`
- Modify: `apps/web/src/app/api/class-sessions/[sessionId]/route.ts`
- Modify: `apps/web/src/app/api/class-sessions/[sessionId]/helper/route.ts`
- Delete after migration: `apps/web/src/platform/class-session-store.ts`
- Delete after migration: `apps/web/src/platform/class-session-device-store.ts`

- [ ] 写失败测试：教师以 `expectedRevision` 推页，过期 revision 返回 conflict；成功 revision 单调递增。
- [ ] 写失败测试：学生 `selfStudyCursor` 与 `classroomCursor` 分表/分键；教师连推三页不改变自学 cursor。
- [ ] 写失败测试：自主学生只收到可跟随提示；调用 `joinTeacherCursor` 后才使用课堂位置；离开课堂恢复原自学位置。
- [ ] 写失败测试：Helper 离线时不从 seed 伪造 online/applied；命令仅在真实设备回执 `applied` 后显示控制成功。
- [ ] 实现 `ClassroomRepository` 的 session/member/command/device/ack 事务，心跳过期判定由统一时钟注入，便于测试。
- [ ] 定义：

```ts
export interface SelfStudyCursor { studentId: string; nodeId: string; unitId: string; updatedAt: string }
export interface ClassroomCursor { sessionId: string; nodeId: string; unitId: string; revision: number; updatedAt: string }
export function resolveStudentDisplayCursor(input: {
  mode: 'self' | 'follow'; self: SelfStudyCursor; classroom?: ClassroomCursor;
}): SelfStudyCursor | ClassroomCursor;
```

- [ ] 将 class session route 改为 Cookie actor 鉴权；删除 query role、自定义 teacher role header 和 query student 身份授权。
- [ ] 旧进程内课堂/设备 Map 全部调用迁移后删除；保留纯协议 reducer 测试。
- [ ] 运行课堂 repository/protocol 单元测试与 `pnpm audit:class-session-cross-context`，后者需更新为服务端登录。

## Task 5 (S5)：四端统一权威快照与隐私裁剪

**Files:**

- Create: `apps/web/src/platform/demo-snapshot.ts`
- Create: `apps/web/src/platform/demo-snapshot.test.ts`
- Create: `apps/web/src/platform/snapshot-clock.ts`
- Create: `apps/web/src/app/api/snapshot/route.ts`
- Create: `apps/web/src/app/api/learning/me/route.ts`
- Create: `apps/web/src/app/api/teacher/reviews/route.ts`
- Modify: student/teacher/projector/graph server loaders
- Modify: `apps/web/src/platform/mock-api.ts`
- Modify: `apps/web/src/platform/fixtures/session-fixtures.ts`

- [ ] 写失败测试：同一数据库版本读取 student/teacher/projector/graph，`snapshotVersion/classroomRevision/participantCount/submittedCount/passedCount` 相同。
- [ ] 写失败测试：教师含 3 名学生明细；学生只含本人和匿名聚合；投屏不含姓名、studentId、答案、反馈或教师脚本；图谱按 actor 返回本人或班级聚合。
- [ ] 写失败测试：投屏 18/24、教师 21/24、60/100 和 helper 假状态这些旧 fixture 字面量不能进入输出。
- [ ] 实现 `readDemoSnapshot(db, actor, audience)`，用一次 SQLite read transaction 锁定 `snapshotVersion` 后组合学习、课堂、成绩与复核投影。
- [ ] `snapshot-clock.ts` 在每个业务事务成功提交时原子递增版本，失败事务不递增。
- [ ] 将四端 loader/API 全部切到 `readDemoSnapshot`；角色组件只能格式化字段，不重新统计。
- [ ] `rg -n "18/24|21/24|24名|24 人|score: 60|score: 100" apps/web/src`，删除所有与演示事实冲突的硬编码。
- [ ] 运行 `demo-snapshot.test.ts` 与四端 Playwright 同版本抓取测试。

## Task 6 (S6)：SSE 失效通知与 15 秒降级

**Files:**

- Create: `apps/web/src/platform/realtime-bus.ts`
- Create: `apps/web/src/platform/realtime-bus.test.ts`
- Create: `apps/web/src/app/api/events/route.ts`
- Create: `apps/web/src/features/realtime/use-authoritative-refresh.ts`
- Create: `apps/web/src/features/realtime/use-authoritative-refresh.test.ts`
- Modify: learning/classroom/output services to publish after commit
- Modify: student/teacher/projector/graph clients

- [ ] 写失败测试：事件只含 `{ topic, scope, version }`，不能序列化姓名、成绩、答案、反馈、脚本。
- [ ] 写失败测试：事务提交后才发布；回滚不发布；收到旧版本不 refetch，收到更高版本合并为一次 refetch。
- [ ] 写失败 fake-timer 测试：SSE 断开后启动 15 秒轮询，重连后停止轮询并立即拉取最新快照。
- [ ] 实现单进程 `RealtimeBus`，连接销毁时必须退订；每 20 秒 comment heartbeat 防止代理空闲关闭。
- [ ] `api/events` 用 Cookie actor 限定 scope，并设置 `text/event-stream`、`no-cache`、`X-Accel-Buffering: no`。
- [ ] `use-authoritative-refresh` 只使客户端缓存失效，不在 SSE 内直接合并领域状态。
- [ ] 为四端接入同一 hook，课堂高频 UI 仍以权威 revision 为准。
- [ ] 运行单元测试并用 Playwright 主动中断 EventSource 验证恢复。

## Task 7 (S7)：移除旧协议并建立端到端回归

**Files:**

- Delete: `apps/web/src/app/api/skill-progress/[studentId]/route.ts`
- Modify: `scripts/audit-live-classroom-protocol.mjs`
- Modify: `scripts/audit-class-session-sync.mjs`
- Modify: `scripts/audit-class-session-cross-context.mjs`
- Modify: `scripts/audit-self-study-closure.mjs`
- Modify: `scripts/audit-web-runtime.mjs`
- Modify: `scripts/check-web-structure.mjs`
- Modify: `package.json`

- [ ] 先把运行时脚本从 localStorage/query/header 身份改为真实登录 Cookie，并让旧协议测试明确失败。
- [ ] 新增场景：非法角色写入 403、studentId 越权 403、锁定 API 423、未知节点不回退、双游标隔离、SSE 恢复、四快照一致。
- [ ] 删除旧 skill progress route 和所有调用；保留兼容 GET 的需求若不存在则不要建立隐式 adapter。
- [ ] 更新 structure contract，删除保护旧 `/course` 默认落点、24 人和 P03 回退的断言，新增 repository/actor/gate/snapshot 唯一性断言。
- [ ] 运行：

```powershell
pnpm web:test:unit
pnpm web:check-structure
pnpm web:typecheck
pnpm web:build
pnpm audit:class-session-cross-context
pnpm audit:self-study-closure
pnpm qa:web:runtime
```

- [ ] 预期全部退出码 0；检查输出中没有 `globalThis` 状态 Map、匿名教师写入、P1T1-N01 fallback 或 24 人统计。

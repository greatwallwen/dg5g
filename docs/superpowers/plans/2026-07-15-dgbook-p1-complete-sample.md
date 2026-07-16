# DGBook P1 Complete Digital Textbook Sample Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付并上线一个可重复演示的“一师三生 + 能力图谱”P1 完整数字教材样张，P01、P02、P03 均可完整学习、提交结构化产出并汇总成果包。

**Architecture:** 保留 `apps/web` 的 Next.js 14 单体和版本化教材文件，以 SQLite 事务作为全部可变化学习、课堂、评分和成果事实的唯一来源。按五个可上线纵向切片推进：先恢复可靠部署，再统一状态与门禁，随后完成 P1 教材与产出，最后统一课堂/图谱并清理旧工程。

**Tech Stack:** Node.js 20.20.2、pnpm 9.15.0、TypeScript、React 18、Next.js 14 App Router、better-sqlite3 11.10.0、Node test runner、Playwright、Paramiko、Image2 V4 设计合同。

**Approved requirements:** `docs/superpowers/specs/2026-07-15-dgbook-p1-complete-sample-requirements.md`

## Global Constraints

- 当前样张种子为 1 名教师和 3 名学生，但 SQL、模型和 UI 不得限制未来 24 人或更多成员。
- `apps/web` 是唯一正式前台；P2 及以后项目只显示“后续开放”，无模拟成绩和学习链接。
- SQLite 本地默认 `apps/web/.data/dgbook-demo.sqlite`，远端固定 `/var/lib/dgbook/dgbook.sqlite`，不得放入 release 目录。
- 权威运行时固定 Node.js 20.20.2；默认 Node 24 的结果不作为验收证据。
- 当前 Git 索引为 0，不执行 commit、`git clean`、`git reset` 或依赖 Git 回滚；用外部源快照、文件清单、发布 SHA 和 SDD 报告保留证据。
- 不手改 `site/dist/`。改变教材生成结果时先改 `scripts/import-5g-docx.py` 或 `scripts/import_5g/`，再运行 `pnpm import:5g`。
- 不新增聊天导师、学生对话、讨论面板、圆桌、多级审批、补考、教务回写、多租户或 P2+ 教材内容。
- SSH 凭据只使用当前进程环境变量，不写入文件、计划、日志、构建产物或命令输出；所有部署必须核对本机已固定的 `8.153.206.97` SSH host-key SHA256 并启用 strict host-key checking，指纹不一致立即终止。
- 每个发布检查点必须在远端 Linux 构建、原子切换并验证 `/api/build-info`；失败保持旧 `current` 在线。

## File and Interface Map

| 责任 | 权威文件 |
|---|---|
| P1 静态定义 | `scripts/import_5g/p1_demo_content.py`、`schemas/p1-demo-content/v1.schema.json`、`textbook/5g/generated/p1-demo-content.json` |
| 节点政策与状态 | `apps/web/src/platform/learning-policy.ts`、`learning-projection.ts`、`learning-status.ts` |
| SQLite 学习事实 | `apps/web/database/migrations/002_learning.sql`、`apps/web/src/platform/learning-repository.ts` |
| 服务端门禁 | `apps/web/src/platform/access-control.ts`、`learning-command-service.ts` |
| P1 项目与成果 | `apps/web/src/platform/p1-project-projection.ts`、`apps/web/src/features/projects/`、`apps/web/src/features/portfolio/` |
| 课堂事实 | `apps/web/database/migrations/003_classroom.sql`、`apps/web/src/platform/classroom-session-repository.ts` |
| 四端快照 | `apps/web/src/platform/authoritative-snapshot.ts`、`apps/web/src/app/api/snapshot/route.ts` |
| Image2 | `docs/design/image2/`、`apps/web/src/app/*css`、角色/图谱/教材/课堂组件 |
| 发布 | `scripts/web-source-deploy-plan.mjs`、`deploy-web-source-paramiko.py`、`prepare-web-source-release.mjs` |

---

### Task 0: 修复发布门禁并上线已完成的登录与角色首页

**Files:**
- Modify: `scripts/web-source-deploy-plan.mjs:294`
- Verify: `scripts/deploy-web-source-contract.test.mjs:82`
- Verify: `scripts/deploy_web_source_paramiko_test.py`
- Verify: `scripts/prepare-web-source-release.mjs`
- Create: `.superpowers/sdd/stage0-deploy-recovery-report.md`

**Interfaces:**
- Consumes: `buildDeploymentPlan(...).remote.preSwitch`
- Produces: 远端 shell 中字面量 `grep -Eq '(^/|(^|/)\.\.(/|$))'`，只拒绝真实 `..` 路径段。

- [x] **Step 0: 在任何生产代码变更前建立仓库外源快照**

将源码、配置、教材、媒体、迁移和部署脚本复制到 `D:/Claude/dgbook-snapshots/<UTC timestamp>/source/`；排除 `node_modules`、`.next`、SQLite、缓存、输出截图和发布压缩包。生成 `files.sha256` 与 `snapshot.json`，记录源根、文件数、总字节数和创建时间。验证快照内存在 `content/5g/5g.docx`、`apps/web/package.json`、三个 lesson AST、三份 migration 和部署脚本。

- [x] **Step 1: 运行已存在的 RED 回归**

```js
assert.match(plan.remote.preSwitch, /\(\^\/\|\(\^\|\/\)\\\.\\\.\(\/\|\$\)\)/);
assert.doesNotMatch(plan.remote.preSwitch, /\(\^\/\|\(\^\|\/\)\.\.\(\/\|\$\)\)/);
```

Run with Node 20.20.2:

```powershell
pnpm test:deploy-web-source-contract
```

Expected: FAIL，指出生成脚本含 `..` 通配而非字面 `\.\.`。

- [x] **Step 2: 最小修复模板字符串转义**

```js
if grep -Eq '(^/|(^|/)\\.\\.(/|$))' "$state/archive-entries.log"; then exit 25; fi
```

- [x] **Step 3: 运行发布契约门禁**

```powershell
pnpm test:deploy-web-source-contract
python -m unittest scripts.deploy_web_source_paramiko_test
python -m py_compile scripts/deploy-web-source-paramiko.py
```

Expected: Node 合同 13/13、Python 1/1、语法检查全部退出 0。

- [x] **Step 4: 运行已完成基础切片的最终本地门禁**

```powershell
pnpm web:test:unit
pnpm web:typecheck
pnpm web:check-structure
pnpm deploy:web:source
```

Expected: 单测 0 fail、typecheck 0、结构检查显示 `apps/web structure check passed`；source manifest 含 4 个 P1 运行时 JSON，敏感/数据库文件命中 0。

解包 `artifacts/web-source-release/dgbook-web-source.tar.gz` 到临时目录，逐条核对 manifest；发布包不得含 `.env*`、`.npmrc`、私钥、SQLite、WAL/SHM、`node_modules`、`.next` 或并行任务临时文件。将 archive SHA 和文件清单写入 Stage 0 报告。

- [x] **Step 5: 使用 Paramiko 原子部署并远端冒烟**

部署前从本机 `known_hosts` 读取并记录非敏感 host-key SHA256，启用 strict checking；每次重试生成全新 releaseId，失败时从该 release 的 `.deploy/*.log` 读取脱敏错误尾。Stage 0 将保留数临时提高到 6，避免失败 release 挤掉上一成功版；凭据在 `finally` 中从当前进程环境清除。

```powershell
$env:DGBOOK_WEB_DEPLOY_TRANSPORT='paramiko'
$env:DGBOOK_WEB_DEPLOY_AUDIT_URL='http://8.153.206.97/'
pnpm deploy:web:source:ready
curl.exe -fsS http://8.153.206.97/api/build-info
```

Expected: 新 `releaseId` 与 `sourceSha256` 匹配，`dgbook-web` active；`/student/home`、`/teacher/workbench`、`/course` 不再是 404。记录远端迁移前备份路径、迁移前后 schema version、用户数和学习事件数，确认非破坏性 seed 未回退现有进度。

- [x] **Step 6: 写发布报告**

报告记录本地门禁、远端 release、服务状态、学生/教师双视口截图和旧 release 未被破坏的证据；不记录凭据。

**Release checkpoint:** `s0-role-home-<UTC timestamp>`。

---

### Task 1: 对齐节点政策、40/60 评分和三学生错开种子

**Files:**
- Modify: `apps/web/src/platform/learning-policy.ts`
- Modify: `apps/web/src/platform/learning-policy.test.ts`
- Modify: `apps/web/src/platform/learning-mastery.ts`
- Modify: `apps/web/src/platform/learning-mastery.test.ts`
- Modify: `apps/web/src/platform/learning-projection.test.ts`
- Modify: `apps/web/src/features/platform/p1-content.test.ts`
- Modify: `apps/web/src/platform/skill-progress-store.ts`
- Modify: `apps/web/src/platform/skill-progress-store.test.ts`
- Modify: `apps/web/src/platform/teacher-review-service.ts`
- Modify: `apps/web/src/platform/teacher-review-service.test.ts`
- Modify: `apps/web/src/features/textbook-scene/challenge-scene-model.test.ts`
- Modify: `apps/web/src/features/textbook-scene/textbook-scene-policy.test.ts`
- Modify: `apps/web/src/features/textbook-scene/micro-practice-model.ts`
- Modify: `scripts/import_5g/p1_demo_content.py`
- Modify: `schemas/p1-demo-content/v1.schema.json`
- Regenerate: `textbook/5g/generated/p1-demo-content.json`
- Modify: `apps/web/database/demo-seed.json`
- Modify: `apps/web/src/platform/db/demo-seed.test.ts`
- Modify: `scripts/check-web-structure.mjs`

**Interfaces:**
- Produces: `TaskScoreProjection` and the single `nodeLearningPolicies` source consumed by content, gate, graph and API layers.

```ts
export interface TaskScoreProjection {
  nodeTestHighestScore?: number;
  outputRubricScore?: number;
  taskCompositeScore?: number;
}

export function calculateTaskCompositeScore(input: {
  nodeTestHighestScore?: number;
  outputRubricScore?: number;
}): TaskScoreProjection;
```

- [x] **Step 1: 写政策和评分 RED 测试**

```ts
assert.equal(getNodeLearningPolicy('P1T2-N02')?.assessmentRole, 'node-test');
assert.equal(getNodeLearningPolicy('P1T2-N04')?.requiresFormalTest, false);
assert.equal(getNodeLearningPolicy('P1T2-N04')?.requiresProfessionalOutput, true);
assert.deepEqual(calculateTaskCompositeScore({ nodeTestHighestScore: 80, outputRubricScore: 90 }), {
  nodeTestHighestScore: 80,
  outputRubricScore: 90,
  taskCompositeScore: 86,
});
assert.equal(calculateTaskCompositeScore({ nodeTestHighestScore: 80 }).taskCompositeScore, undefined);
```

Run:

```powershell
node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/learning-policy.test.ts apps/web/src/platform/learning-mastery.test.ts
```

Expected: FAIL，显示 N04 仍为 `task-pixi` 且旧公式为 20/30/50。

- [x] **Step 2: 最小实现确认口径**

N02 设置 `requiresFormalTest=true`、`assessmentRole='node-test'`、80 分达标；N04 设置 `requiresFormalTest=false`、`assessmentRole='none'`、`requiresProfessionalOutput=true`、`requiresTeacherVerification=true`。N04 投影不再经过 formal-test-passed，教师复核授权只看 output/teacher 配置。只有两个评分输入都存在时计算 `Math.round(test * .4 + output * .6)`；旧 Map 在本 Task 仅通过窄适配层消费新投影，Task 2 同批删除。

- [x] **Step 3: 更新生成合同并重新导入**

```powershell
pnpm import:5g
```

Expected: 12 个节点仍通过 schema；三个 N02 为正式测试，三个 N04 仅为专业产出/认证。

导入前后生成文件清单必须只包含 schema、P1 importer 和预期 P1 generated artifacts；若出现无关教材批量漂移则回退本次生成结果并先修 importer 可重复性。

- [x] **Step 4: 将 demo 游标和事实错开到三个任务**

```json
[
  { "studentId": "stu-01", "nodeId": "P1T1-N02" },
  { "studentId": "stu-02", "nodeId": "P1T2-N02" },
  { "studentId": "stu-03", "nodeId": "P1T3-N02" }
]
```

为 `stu-02` 生成 P01 已达成事实，为 `stu-03` 生成 P01/P02 已达成事实。每个已完成任务都包含 N01/N03/N04 微练习、N02 微练习与 ≥80 正式尝试、N04 已提交产出/复核事实；删除 N04 `task-pixi` 尝试。所有教师统计必须由这些 SQLite 行投影，不在组件写结果。

- [x] **Step 5: 验证 seed 幂等且不覆盖真实课堂状态**

```powershell
node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/db/demo-seed.test.ts
pnpm web:test:unit
```

Expected: 重复 demo seed 保留课堂 revision/状态，3 个游标分别为 P1T1/P1T2/P1T3；全量 0 fail。

---

### Task 2: 用 SQLite 学习服务替换未鉴权进程 Map

**Files:**
- Create: `apps/web/src/platform/learning-repository.ts`
- Create: `apps/web/src/platform/learning-repository.test.ts`
- Create: `apps/web/src/platform/learning-command-service.ts`
- Create: `apps/web/src/platform/learning-command-service.test.ts`
- Create: `apps/web/src/platform/learning-read-model.ts`
- Create: `apps/web/src/platform/learning-read-model.test.ts`
- Create: `apps/web/src/app/api/learning/me/route.ts`
- Create: `apps/web/src/app/api/learning/nodes/[nodeId]/events/route.ts`
- Create: `apps/web/src/app/api/learning/nodes/[nodeId]/attempts/route.ts`
- Create: `apps/web/src/app/api/learning/class/[classId]/route.ts`
- Modify: `apps/web/src/app/api/skill-progress/[studentId]/route.ts`
- Modify: `apps/web/src/platform/skill-progress-store.ts`
- Modify: `apps/web/src/platform/access-control.ts`
- Modify: `apps/web/src/app/learn/[nodeId]/page.tsx`
- Modify: `apps/web/src/features/skill-tree/skill-progress-client.ts`
- Modify: `apps/web/src/features/textbook-scene/textbook-scene-shell.tsx`
- Modify: `apps/web/src/features/learning/edugame-practice-panel.tsx`
- Modify: `apps/web/src/features/classroom/student-follow-client.tsx`
- Modify: `apps/web/src/platform/class-session-learning-bridge.ts`
- Modify: `apps/web/src/platform/class-session-learning-bridge.test.ts`
- Modify: `apps/web/src/features/home/role-home-read-model.ts`
- Modify: `apps/web/src/features/home/role-home-read-model.test.ts`
- Modify: `apps/web/src/features/textbook-scene/course-overview.tsx`
- Modify: `apps/web/src/features/classroom/teacher-console-client.tsx`
- Modify: `apps/web/src/features/skill-tree/teacher-skill-pulse.tsx`
- Modify: `scripts/check-web-structure.mjs`
- Modify: `scripts/audit-web-runtime.mjs`
- Modify: `scripts/audit-live-classroom-protocol.mjs`
- Modify: `scripts/audit-self-study-closure.mjs`
- Modify: `scripts/audit-digital-textbook-v3.mjs`

**Interfaces:**

```ts
export interface StudentLearningSnapshot {
  version: number;
  studentId: string;
  nodes: Array<{
    nodeId: string;
    state: NodeLearningState;
    completedSections: string[];
    attempts: FormalAttemptProjection[];
    evidence?: NodeEvidenceProjection;
    review?: OutputReviewProjection;
    prerequisites: NodePrerequisiteProjection[];
    bestFormalScore?: number;
  }>;
  tasks: Array<TaskScoreProjection & { taskId: 'P01' | 'P02' | 'P03' }>;
  projectCompositeScore?: number;
}

export class LearningCommandService {
  appendEvent(actor: AuthenticatedActor, command: LearningEventCommand): StudentLearningSnapshot;
  recordFormalAttempt(actor: AuthenticatedActor, command: FormalAttemptCommand): StudentLearningSnapshot;
  requireNodeAccess(actor: AuthenticatedActor, nodeId: string): NodeRouteClassification;
}

export type SnapshotTopic = `learning:${string}` | `classroom:${string}` | 'global';
```

- [x] **Step 1: 写身份、持久化和事务 RED 测试**

测试匿名 GET/POST/DELETE 为 401、学生读取或写入其他 `studentId` 为 403、教师只能读本人班级且不能代写、锁定节点写入不递增版本、事件/尝试重放幂等且版本只递增一次、正式测试只允许 N02 且最多 3 次、进程重建 repository 后仍能读取同一 SQLite 事实。

```powershell
node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/learning-repository.test.ts apps/web/src/platform/learning-command-service.test.ts
```

Expected: FAIL，原因是 repository/service 尚不存在。

- [x] **Step 2: 实现 prepared statements、分域版本与统一版本事务**

Repository 只接收服务端解析的 `actor.studentId`；命令服务先分类节点、验证政策和 `learning:<studentId>` expected version，再在一个事务中写事实，同时递增该学生 learning topic 与 `global` topic。无关学生或课堂写入不会制造 learning expected-version 假冲突，四端快照仍使用严格递增的 global version。

- [x] **Step 3: 建立 actor-scoped API**

`GET /api/learning/me` 返回本人快照；事件和尝试路由从 HttpOnly Cookie 派生 actor。教师班级读接口从 actor 的授课班级校验成员，只读不可代写。旧 `/api/skill-progress/[studentId]` 临时成为鉴权兼容 adapter：学生只允许路径 ID 等于 actor ID；教师 GET 仅允许本人班级成员；所有写命令仍只能由本人学生提交。adapter 将新 snapshot 映射为现有 `{progress,tasks}` response；匿名与跨范围请求失败关闭。

- [x] **Step 4: 在废弃旧 adapter 前迁移全部消费者**

将 `skill-progress-client.ts`、`textbook-scene-shell.tsx`、`edugame-practice-panel.tsx`、`student-follow-client.tsx`、`course-overview.tsx`、教师控制台/脉搏组件、角色首页读模型和 `class-session-learning-bridge.ts` 全部切到同一 actor-scoped SQLite 服务，并保留 attempts、evidence、sections、review、prerequisites 和 task projection 所需字段。消费者契约测试绿色后，旧路由 POST/DELETE/GET 全部返回 410；删除 `skill-progress-store.ts` 的 global Map。原先依赖 DELETE 的审计改为准备隔离测试数据库或受控 demo reset，不保留匿名生产重置。

- [x] **Step 5: 页面和写 API 使用同一门禁**

`/learn/[nodeId]` 在加载 `TextbookSceneShell` 前读取 SQLite 快照：locked 只显示前置条件；not-open/not-found 只显示明确说明。后三类 DOM 不得出现教材、练习、正式测试和提交组件。

- [x] **Step 6: 跑门禁回归**

```powershell
node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/learning-command-service.test.ts apps/web/src/platform/access-control.test.ts apps/web/src/features/textbook-scene/node-access-consumers.test.ts
pnpm web:test:unit
pnpm web:typecheck
```

Expected: P1T1-N04 与 P1T2-N01 对未满足学生同时在页面/API 失败关闭；未知 ID 不回退 N01；全量 0 fail。

---

### Task 3: 交付 P1 三任务项目页与真实课程图谱入口

**Files:**
- Create: `apps/web/src/platform/p1-project-projection.ts`
- Create: `apps/web/src/platform/p1-project-projection.test.ts`
- Create: `apps/web/src/app/student/projects/p1/page.tsx`
- Create: `apps/web/src/features/projects/p1-project-model.ts`
- Create: `apps/web/src/features/projects/p1-project-model.test.ts`
- Create: `apps/web/src/features/projects/p1-project-view.tsx`
- Create: `apps/web/src/features/projects/p1-task-card.tsx`
- Modify: `apps/web/src/features/home/student-home-model.ts`
- Modify: `apps/web/src/features/home/student-home-model.test.ts`
- Modify: `apps/web/src/app/course/page.tsx`
- Modify: `apps/web/src/features/textbook-scene/course-overview.tsx`
- Modify: `apps/web/src/features/skill-tree/skill-progress-client.ts`
- Modify: `apps/web/src/platform/node-access-projection.ts`
- Modify: `apps/web/src/platform/node-access-projection.test.ts`
- Modify: `apps/web/src/platform/fixtures/curriculum-graph-fixtures.ts`
- Create: `apps/web/src/platform/fixtures/curriculum-graph-fixtures.test.ts`
- Modify: `apps/web/src/features/capability-map/semantic-graph-elements.tsx`
- Modify: `apps/web/src/features/capability-map/semantic-course-graph.tsx`
- Modify: `apps/web/src/app/capability-map.css`

**Interfaces:**

```ts
export interface P1ProjectProjection {
  projectId: 'P1';
  tasks: Array<{
    taskId: 'P01' | 'P02' | 'P03';
    state: TaskLearningState;
    nodes: Array<{ nodeId: P1NodeId; state: NodeLearningState; href?: string }>;
    nextNodeId?: P1NodeId;
    outputStatus: ProfessionalOutputProjectionStatus;
    currentOutputVersion?: number;
  }>;
  portfolioStatus: 'not-started' | 'collecting' | 'awaiting-review' | 'complete';
  projectCompositeScore?: number;
}

export type TaskLearningState = 'locked' | 'available' | 'learning' | 'output-pending' | 'verified' | 'complete';
export type ProfessionalOutputProjectionStatus = 'not-started' | 'draft' | 'submitted' | 'returned' | 'verified';
```

- [x] **Step 1: 写项目链 RED 测试**

断言顺序固定 P01→P02→P03；三个任务各四节点且共 12 个唯一节点；学生一不能进入 P02，学生二能进入 P02，学生三能进入 P03；锁定卡无 href；P1T3 具有 N01→N04 完整链；P2+ 图谱节点 `label='后续开放'`、`disabled=true`、无 score/href；学生首页项目链接精确为 `/student/projects/p1`。

- [x] **Step 2: 实现 SQLite 项目投影与页面**

`p1-project-projection.ts` 组合 Task 2 SQLite snapshot 与 `loadP1DemoContent()`，不从 fixtures 复制标题、产出名或节点顺序。页面先真实显示三个任务、每任务四节点状态、下一行动、“尚未形成”的缺失分数和成果包粗状态；学生首页“查看其他任务”指向 `/student/projects/p1`。产出版本库尚未建立时 `currentOutputVersion` 保持 undefined，不解析旧 JSON 伪造第二数据源；v1 修订为 v2 的项目页/成果包同步验收归入 Task 5D。

- [x] **Step 3: 验证 30 秒入口和门禁**

```powershell
node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/p1-project-projection.test.ts apps/web/src/features/projects/p1-project-model.test.ts apps/web/src/platform/fixtures/curriculum-graph-fixtures.test.ts apps/web/src/platform/node-access-projection.test.ts apps/web/src/features/home/student-home-model.test.ts
pnpm web:check-structure
pnpm web:typecheck
```

Expected: 三学生投影分别指向 P01/P02/P03，P2+ 无伪造数据，结构/typecheck 绿色。

- [x] **Step 4: 浏览器与远端检查点**

在 1440×900 与 1920×1080 截取学生首页、P1 项目页、图谱；验证 student01 URL 绕过失败。完成 Task 2–3 后执行：

```powershell
pnpm web:test:unit
pnpm web:typecheck
pnpm web:check-structure
pnpm web:build
pnpm deploy:web:source
pnpm deploy:web:source:paramiko
curl.exe -fsS http://8.153.206.97/api/build-info
pnpm audit:web:remote -- --base-url http://8.153.206.97/ --out output/playwright/s1-state-p1-shell
```

Expected: Node20 门禁全部绿色；archive manifest/SHA 已审计；远端 build-info 匹配新 release；student01 锁定页、student02 P02、student03 P03 与 P2+“后续开放”全部通过。部署失败时 `current` 仍指向前一 release。

**Release checkpoint:** `s1-state-p1-shell-<UTC timestamp>`。

---

### Task 4: 生成并渲染三个 N02 深度自学教材

**Files:**
- Modify: `schemas/p1-demo-content/v1.schema.json`
- Modify: `scripts/import_5g/p1_demo_content.py`
- Modify: `scripts/import-5g-docx.py`
- Regenerate: `textbook/5g/generated/p1-demo-content.json`
- Create: `apps/web/src/features/textbook-scene/self-study-content.ts`
- Create: `apps/web/src/features/textbook-scene/self-study-content.test.ts`
- Create: `apps/web/src/features/textbook-scene/self-study-renderer.tsx`
- Create: `apps/web/src/features/textbook-scene/annotated-engineering-figure.tsx`
- Modify: `apps/web/src/features/textbook-scene/learning-scene.tsx`
- Modify: `apps/web/src/features/textbook-scene/textbook-scene-shell.tsx`
- Modify: `apps/web/src/features/platform/deep-textbook-demo-data.ts`

**Interfaces:**

```ts
export interface DeepNodeContent {
  nodeId: 'P1T1-N02' | 'P1T2-N02' | 'P1T3-N02';
  caseBackground: string[];
  taskQuestion: string;
  prerequisites: string[];
  glossary: Array<{ term: string; definition: string }>;
  annotatedFigures: Array<{ kind: 'topology' | 'antenna' | 'complaint'; evidenceLabels: string[] }>;
  evidenceRules: Array<{ claim: string; requiredEvidence: string[]; reason: string }>;
  reasoningSteps: string[];
  examples: Array<{ title: string; evidence: string[]; reasoning: string[]; conclusion: string }>;
  counterexamples: Array<{ title: string; error: string; correctionPath: string[] }>;
  practices: { foundation: Practice[]; application: Practice[]; transfer: Practice[] };
  outputTemplate: Record<string, unknown>;
  rubric: Array<{ criterion: string; maxScore: number }>;
}

export interface StandardNodeContent {
  nodeId: P1NodeId;
  caseBackground: string[];
  glossary: Array<{ term: string; definition: string }>;
  relationshipFigure: { kind: string; evidenceLabels: string[] };
  reasoningSteps: string[];
  example: { evidence: string[]; conclusion: string };
  counterexample: { error: string; correctionPath: string[] };
  microPractice: Practice[];
  nodeRecordTemplate: Record<string, unknown>;
}
```

- [x] **Step 1: 写内容基数 RED 审计**

对三个 N02 分别断言：术语≥3、标注图≥1、推理步骤≥4、正例≥2、反例≥2、三层练习各≥1、纠偏路径≥2、量规总分=100。对另外 9 个节点逐节点断言：连续案例≥1、术语≥3、关系图=1、步骤≥3、正例=1、反例=1、可重试微练习≥1、反馈/纠偏非空、结构化节点记录模板非空。

```powershell
node --import ./scripts/web-test-register.mjs --test apps/web/src/features/textbook-scene/self-study-content.test.ts
```

Expected: FAIL，当前 JSON 只有摘要和通用微练习。

- [x] **Step 2: 从权威教材生成三套深内容**

P01 聚焦设备位置/身份/连接方向；P02 聚焦方位角/下倾角/挂高证据；P03 聚焦同地点/同业务/同终端复现条件。生成器为全部 12 节点输出结构字段，Web 不再硬编码第二套正文。生成 JSON 中的 `outputTemplate` 与 `rubric` 是静态教材权威；Task 5B 的 `output-schema.ts` 只做类型化校验和 adapter，不复制字段或量规定义。

- [x] **Step 3: 实现一个内容定义、两个入口的自学渲染**

`SelfStudyRenderer` 顺序呈现六段，支持自由导航、术语查询、案例、三级练习、错误反馈、重试、迁移任务和产出模板。`AnnotatedEngineeringFigure` 根据 `kind` 渲染三种明确图，不允许 P03 回退覆盖路线图。

- [x] **Step 4: 导入并验证无语音自学**

```powershell
pnpm import:5g
node --import ./scripts/web-test-register.mjs --test apps/web/src/features/textbook-scene/self-study-content.test.ts
pnpm audit:content
pnpm web:typecheck
```

Expected: 三个 N02 深度审计与另外 9 节点最低合同全部绿色；关闭讲解/语音仍能读完，P03 显示投诉复现场景；真实学习旅程可依次打开 12 节点且没有占位页。

---

### Task 5A: 建立不可变产出版本库与学生 draft/submit API

**Files:**
- Create: `apps/web/database/migrations/004_p1_output_versions.sql`
- Create: `apps/web/src/platform/professional-output-repository.ts`
- Create: `apps/web/src/platform/professional-output-repository.test.ts`
- Create: `apps/web/src/app/api/outputs/[taskId]/route.ts`
- Create: `apps/web/src/app/api/outputs/[taskId]/draft/route.ts`
- Create: `apps/web/src/app/api/outputs/[taskId]/submit/route.ts`
- Modify: `apps/web/src/platform/learning-command-service.ts`

**Interfaces:**

```ts
export type P1OutputTaskId = 'P01' | 'P02' | 'P03';
export type ProfessionalOutputStatus = 'draft' | 'submitted' | 'returned' | 'verified';

export interface ProfessionalOutputHead {
  outputId: string;
  studentId: string;
  taskId: P1OutputTaskId;
  currentVersion: number;
  stateRevision: number;
  status: ProfessionalOutputStatus;
}

export interface ProfessionalOutputVersion {
  outputId: string;
  taskId: P1OutputTaskId;
  version: number;
  schemaVersion: 1;
  fields: Record<string, string | number | string[]>;
  upstreamRefs: Array<{ outputId: string; version: number }>;
}
```

- [x] **Step 1: 写 migration/repository RED 测试**

覆盖保存草稿、提交 v1、退回后保存 v2、并发 `expectedStateRevision` 冲突返回 409、P02/P03 保存真实上游 `outputId + version`。断言历史 version 行永不 UPDATE；可变 status 只存在 head。

- [x] **Step 2: 创建 head + append-only version schema**

`professional_outputs` 增加 `current_version` 与 `state_revision`；`professional_output_versions` 使用 `(output_id, version)` 主键保存不可变字段。一次 draft/submit 事务同时更新 head、追加 version（需要时）、写学习事件，并递增 `learning:<studentId>` 与 `global` snapshot topics。

- [x] **Step 3: 对产出 API 执行完整 actor/access 矩阵**

所有路由从 Cookie 派生 actor，并调用 Task 2 的同一 `requireNodeAccess`。匿名=401；locked=403；not-found=404；not-open=409；非本人 output ID 返回 404。后三种节点页面不渲染表单，写路由不能保存草稿或提交。

```powershell
node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/professional-output-repository.test.ts apps/web/src/platform/learning-command-service.test.ts
```

Expected: 生命周期、immutable version、版本冲突和门禁矩阵全部通过。

### Task 5B: 渲染三个结构化职业表单

**Files:**
- Create: `apps/web/src/features/portfolio/output-schema.ts`
- Create: `apps/web/src/features/portfolio/output-schema.test.ts`
- Create: `apps/web/src/features/portfolio/professional-output-form.tsx`
- Create: `apps/web/src/features/portfolio/output-fieldsets.tsx`
- Modify: `apps/web/src/features/textbook-scene/challenge-scene.tsx`

**Interfaces:**
- Consumes: generated `outputTemplate` and `rubric` from Task 4 as the only static field authority.
- Produces: typed validators and field renderers; `output-schema.ts` contains no duplicate task field list or duplicate rubric scores.

- [x] **Step 1: 写三表单 schema adapter RED 测试**

断言 P01/P02/P03 模板可解析、必填字段明确、未知字段被拒绝、量规总分 100、保存草稿不会提交、提交前服务端完整校验。

- [x] **Step 2: 实现三个职业表单**

P01 包含位置、设备身份、端口与走线证据；P02 包含站点、方位角、下倾角、挂高、遮挡和覆盖场景；P03 包含时间、地点、业务、终端、复现步骤和多源证据。组件消费 generated template，不硬编码第二份合同。

- [x] **Step 3: 浏览器验证 draft/恢复/submit**

三个学生分别在 P01/P02/P03 保存草稿，刷新后字段仍在；提交后表单只读并显示 version/stateRevision。

### Task 5C: 实现轻量教师复核与 40/60 分数冻结

**Files:**
- Create: `apps/web/src/features/review/output-review-panel.tsx`
- Create: `apps/web/src/app/api/teacher/outputs/route.ts`
- Create: `apps/web/src/app/api/teacher/outputs/[outputId]/reviews/route.ts`
- Modify: `apps/web/src/features/classroom/teacher-console-view.tsx`
- Modify: `apps/web/src/platform/professional-output-repository.ts`
- Modify: `apps/web/src/platform/learning-mastery.ts`
- Remove after consumer migration: `apps/web/src/app/api/teacher/reviews/route.ts`

**Interfaces:**
- Produces: a single teacher write endpoint accepting `{expectedStateRevision, action:'return'|'verify', feedback?, rubricScores}`.

- [x] **Step 1: 写 teacher authorization/review RED 测试**

学生/匿名均被拒绝；教师只可复核本班 submitted output；return/verify 严格递增 stateRevision 和 global snapshot；认证量规 0–100；认证不修改 N02 attempt。

- [x] **Step 2: 实现唯一复核入口**

教师只执行 `return` 或 `verify`。新 endpoint 绿色后，旧固定 401 route 返回 410 并在同一 Task 删除；不得保留两个写入口。

- [x] **Step 3: 冻结任务分数**

verify 事务读取 N02 历史最高分与当前量规分，按 40/60 写 `frozen_task_scores`；任一项缺失不生成 task score。80/90 必须冻结为 86。

### Task 5D: 投影项目成果包并发布内容切片

**Files:**
- Create: `apps/web/src/app/student/projects/p1/portfolio/page.tsx`
- Create: `apps/web/src/features/portfolio/p1-portfolio-model.ts`
- Create: `apps/web/src/features/portfolio/p1-portfolio-model.test.ts`
- Create: `apps/web/src/features/portfolio/p1-portfolio-view.tsx`
- Modify: `apps/web/src/platform/p1-project-projection.ts`
- Modify: `apps/web/src/features/projects/p1-project-view.tsx`

**Interfaces:**
- Produces: a portfolio projection referencing three verified immutable versions; no fourth copied content record.

- [x] **Step 1: 写成果包 RED 测试**

验证 v1→v2 后项目页和成果包都显示 v2；三份已认证 version 才形成 package；缺项显示“尚未形成”；项目综合分为三个 task score 等权平均。

- [x] **Step 2: 实现成果包页面**

显示三份产出名称、版本、状态、教师反馈、任务综合分与项目综合分，并提供返回 P1 项目页入口。

- [x] **Step 3: 跑内容/产出纵向闭环**

```powershell
node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/professional-output-repository.test.ts apps/web/src/features/portfolio/output-schema.test.ts apps/web/src/features/portfolio/p1-portfolio-model.test.ts
pnpm web:test:unit
pnpm web:typecheck
pnpm web:check-structure
pnpm web:build
pnpm deploy:web:source
pnpm deploy:web:source:paramiko
curl.exe -fsS http://8.153.206.97/api/build-info
pnpm audit:web:remote -- --base-url http://8.153.206.97/ --out output/playwright/s2-p1-content-portfolio
```

Expected: 三 N02 和 9 普通节点内容合同、三表单、return/v2/verify、40/60 分数及成果包均通过；archive SHA 与 build-info 相同，失败不切换 `current`。

**Release checkpoint:** `s2-p1-content-portfolio-<UTC timestamp>`。

---

### Task 6A: 将课堂 session/command/device 事实迁移到 SQLite

**Files:**
- Create: `apps/web/src/platform/classroom-session-repository.ts`
- Create: `apps/web/src/platform/classroom-session-repository.test.ts`
- Create: `apps/web/src/platform/classroom-session-service.ts`
- Create: `apps/web/src/platform/classroom-session-service.test.ts`
- Modify: `apps/web/src/platform/class-session-store.ts`
- Modify: `apps/web/src/platform/class-session-device-store.ts`
- Modify: `apps/web/src/app/api/class-sessions/[sessionId]/route.ts`
- Modify: `apps/web/src/app/api/class-sessions/[sessionId]/helper/route.ts`

**Interfaces:**

```ts
export interface ClassroomSnapshot {
  sessionId: string;
  status: 'preparing' | 'active' | 'paused' | 'closed';
  activeNodeId?: string;
  activeUnitId?: string;
  revision: number;
  followingStudentIds: string[];
}
```

- [x] **Step 1: 写 SQLite session RED 测试**

验证首页 href 使用真实 `session_id`，教师命令必须带 `expectedRevision`，命令/presence/ack 在进程重建后仍存在，非教师不能切页，未知 session 失败关闭。

- [x] **Step 2: 用 repository/service 替换课堂 global Map**

复用现有 `ClassroomRosterRepository`；新 repository 负责 session/commands/presence/acks。每次课堂写事务递增 `classroom:<sessionId>`、session revision 和 `global` snapshot topic。

- [x] **Step 3: 迁移现有 route 消费者后删除 Map**

先让旧 `class-session-store.ts`/device store 成为 SQLite adapter；页面/API 全部切换后删除 Map 数据与匿名写能力。

### Task 6B: 持久化主动跟随状态和“学生 + 节点”自学游标

**Files:**
- Create: `apps/web/database/migrations/005_classroom_participation.sql`
- Create: `apps/web/database/migrations/006_self_study_cursor_per_node.sql`
- Create: `apps/web/src/platform/classroom-participation-repository.ts`
- Create: `apps/web/src/platform/classroom-participation-repository.test.ts`
- Create: `apps/web/src/platform/self-study-cursor-repository.ts`
- Create: `apps/web/src/platform/self-study-cursor-repository.test.ts`
- Modify: `apps/web/src/features/home/role-home-read-model.ts`
- Modify: `apps/web/src/app/classroom/[sessionId]/page.tsx`

**Interfaces:**

```ts
export interface SelfStudyCursor {
  studentId: string;
  nodeId: P1NodeId;
  unitId?: string;
  actionId?: string;
  actionIndex: number;
  positionMs: number;
}
```

- [x] **Step 1: 写 migration/repository RED 测试**

`classroom_members` 继续表示班级名单，不代表主动跟随；新 participation 表保存 join/leave/current mode。游标唯一键必须含 `(student_id,node_id)`。同一学生在 P01-N02 和 P02-N02 保存不同 unit/action/position 后均可精确恢复。

- [x] **Step 2: 实现显式 join/leave**

学生始终先到 `/student/home`，主按钮使用 `/classroom/<db-session-id>`；进入页面写 join，返回完整自学写 leave。三名 seed 成员默认都不处于 following 状态。

- [x] **Step 3: 验证课堂不覆盖个人游标**

学生保存两个节点游标→加入课堂→教师切页→退出课堂；两个 self-study cursor 每个字段均保持原值，退出后回到进入课堂前的节点与单元。

### Task 6C: 渲染课堂跟随并完成跨上下文验收

**Files:**
- Create: `apps/web/src/features/textbook-scene/classroom-content-projection.ts`
- Create: `apps/web/src/features/textbook-scene/classroom-content-projection.test.ts`
- Create: `apps/web/src/features/textbook-scene/classroom-follow-renderer.tsx`
- Modify: `apps/web/src/features/classroom/use-class-session.ts`
- Modify: `apps/web/src/features/classroom/student-follow-client.tsx`
- Modify: `apps/web/src/features/classroom/teacher-console-client.tsx`

- [x] **Step 1: 使用同一内容定义投影课堂单元**

课堂 renderer 只显示当前单元、教师任务、活动和“返回完整自学”入口；不得渲染整章或覆盖个人游标。following 页面每 1 秒读取 revision，后台页面每 15 秒；SSE 不作为阻断依赖。

- [x] **Step 2: 跨上下文验证**

```powershell
node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/classroom-session-repository.test.ts apps/web/src/platform/classroom-participation-repository.test.ts apps/web/src/platform/self-study-cursor-repository.test.ts apps/web/src/features/textbook-scene/classroom-content-projection.test.ts
pnpm audit:class-session-sync
pnpm audit:class-session-cross-context
pnpm audit:self-study-closure
```

Expected: 教师切页、三名主动跟随学生同步、未加入学生不被强跳、两个个人节点游标逐字段不变、进程重启可恢复。

---

### Task 7: 建立学生/教师/投屏/图谱统一权威快照

**Files:**
- Create: `apps/web/src/platform/authoritative-snapshot.ts`
- Create: `apps/web/src/platform/authoritative-snapshot.test.ts`
- Create: `apps/web/src/platform/snapshot-clock.ts`
- Create: `apps/web/src/app/api/snapshot/route.ts`
- Modify: `apps/web/src/platform/learning-command-service.ts`
- Modify: `apps/web/src/platform/professional-output-repository.ts`
- Modify: `apps/web/src/platform/classroom-session-service.ts`
- Modify: `apps/web/src/features/home/role-home-read-model.ts`
- Modify: `apps/web/src/features/workbench/teacher-workbench-model.ts`
- Modify: `apps/web/src/features/classroom/projector-client.tsx`
- Modify: `apps/web/src/features/capability-map/semantic-course-graph.tsx`
- Modify: `apps/web/src/platform/mock-api.ts`
- Modify: `scripts/audit-web-runtime.mjs`
- Create: `scripts/audit-p1-three-terminal-consistency.mjs`
- Modify: `package.json`

**Interfaces:**

```ts
export interface AuthoritativeSnapshot {
  snapshotVersion: number;
  generatedAt: string;
  classroom: { sessionId: string; revision: number; status: string; activeNodeId?: string };
  project: P1ProjectProjection;
  aggregates: {
    classSize: number;
    submittedCount: number;
    passedCount: number;
  };
  students?: Array<{
    studentId: string;
    nodes: Array<{ nodeId: P1NodeId; state: NodeLearningState; nodeTestHighestScore?: number }>;
    tasks: Array<{ taskId: P1TaskId; taskCompositeScore?: number }>;
    projectCompositeScore?: number;
  }>;
}
```

- [x] **Step 1: 写同事务/字段裁剪 RED 测试**

同一 SQLite read transaction 先构造完整 compositional snapshot，再为四 audience 裁剪；四者返回相同 version、课堂、项目、人数、提交、达标、分数和状态。student 只有本人明细，projector 无姓名/学号/答案，teacher 有 3 人明细。测试再向同一 class 插入第 4 至第 24 名 active student，断言无需修改业务代码即可得到 `classSize=24`。

按顺序执行 formal attempt→draft→submit→verify→class command，每次写事务均严格递增 `global` snapshot version；四 audience 在每一步都读取同一 version 和同一事实切片。

- [x] **Step 2: 实现一个 projector、四种裁剪**

所有聚合只计算一次；页面不得本地重算人数、平均分或提交数。删除 `mock-api.ts` 中已迁移的可变化事实和 18/24、21/24 等模拟分支。

- [x] **Step 3: 更新四端和图谱语义**

统一使用“节点测试最高分”“任务综合分”“项目综合分”；无值显示“尚未形成”。图谱状态直接使用 `NodeLearningState`，测试达标不显示教师认证。

- [x] **Step 4: 三端一致性审计并发布**

```powershell
node --import ./scripts/web-test-register.mjs --test apps/web/src/platform/authoritative-snapshot.test.ts
node scripts/audit-p1-three-terminal-consistency.mjs --base-url http://127.0.0.1:3157
pnpm web:test:unit
pnpm web:typecheck
pnpm web:check-structure
pnpm web:build
pnpm deploy:web:source
pnpm deploy:web:source:paramiko
curl.exe -fsS http://8.153.206.97/api/build-info
node scripts/audit-p1-three-terminal-consistency.mjs --base-url http://8.153.206.97/
pnpm audit:web:remote -- --base-url http://8.153.206.97/ --out output/playwright/s3-classroom-unified-snapshot
```

Expected: 三学生、提交数、三类分数、状态、revision/version 全相等；投屏隐私断言通过；archive SHA 与远端 build-info 匹配，公开课堂同步通过。任一步失败时 `current` 保持前一 release。

**Release checkpoint:** `s3-classroom-unified-snapshot-<UTC timestamp>`。

---

### Task 8: Image2 全面精修与完整演示旅程验收

**Files:**
- Modify: `apps/web/src/app/role-home-v5.css`
- Modify: `apps/web/src/app/textbook-scene.css`
- Modify: `apps/web/src/app/classroom.css`
- Modify: `apps/web/src/app/digital-classroom-v4.css`
- Modify: `apps/web/src/app/capability-map.css`
- Modify: `apps/web/src/features/home/student-home.tsx`
- Modify: `apps/web/src/features/workbench/teacher-workbench.tsx`
- Modify: `apps/web/src/features/projects/p1-project-view.tsx`
- Modify: `apps/web/src/features/textbook-scene/self-study-renderer.tsx`
- Modify: `apps/web/src/features/textbook-scene/classroom-follow-renderer.tsx`
- Modify: `apps/web/src/features/classroom/projector-client.tsx`
- Modify: `apps/web/src/features/capability-map/semantic-course-graph.tsx`
- Modify: `apps/web/src/features/portfolio/p1-portfolio-view.tsx`
- Create: `scripts/capture-image2-implementation.mjs`
- Create: `scripts/audit-image2-layout.mjs`
- Create: `scripts/audit-image2-layout.test.mjs`
- Create: `scripts/audit-p1-complete-journey.mjs`
- Modify: `package.json`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: `docs/design/image2/image2-route-contract.json`
- Produces: route × viewport 截图、DOM/console/overflow/keyboard/reduced-motion 结果和完整角色旅程 JSON。

- [x] **Step 1: 为新增页面补 Image2 路由合同**

合同覆盖学生首页、教师工作台、P1 项目、三个 N02 自学、课堂跟随、投屏、图谱和成果包，视口固定 1440×900、1920×1080。

- [x] **Step 2: 只修 P0/P1/P2 视觉问题**

保持深海军蓝、青/绿/黄/红语义、≤8px 半径、一个主行动、真实 SVG 图标；禁止紫色渐变、随机光球和无意义霓虹。图谱边连接真实节点，标签不压线。

- [x] **Step 3: 跑完整一师三生旅程**

脚本顺序：teacher01 登录并开始 P1T1-N02；三学生从首页主动加入；教师切页；学生退出恢复错开进度；三人完成各自 N02/N04；教师认证；成果包与图谱更新。

- [x] **Step 4: 视觉与可访问性门禁**

```powershell
pnpm audit:image2-reference
node scripts/audit-image2-layout.mjs
node scripts/audit-p1-complete-journey.mjs --base-url http://127.0.0.1:3157
pnpm qa:gates
```

Expected: 双视口无横向溢出、console error 0、唯一主行动、键盘可达、reduced-motion 通过；`design-qa.md` 最终行为 `final result: passed`。

Completed evidence: `output/playwright/task8-final6-20260716T0455Z/`；Image2 120/120 截图、布局/路由/主行动/键盘/动效/console/page error 全部 0 失败，一师三生完整旅程 0 失败，原始分辨率人工复核 P0=0、P1=0。

---

### Task 9: 复制、校验并切换 P1 必要媒体

**Files:**
- Copy with SHA verification: `site/public/media/home/**` -> `apps/web/public/media/home/**`
- Copy with SHA verification: `site/public/media/capability-maps/**` -> `apps/web/public/media/capability-maps/**`
- Copy P01–P03 references selected from generated `mediaRefs` to their URL-preserving targets: 13 files under `apps/web/public/media/5g/**` and 9 files under `apps/web/public/media/manim/**`
- Copy selected TTS manifest/P01–P03 assets -> `apps/web/public/media/tts/**`
- Create: `scripts/audit-web-media-cutover.mjs`
- Create: `scripts/audit-web-media-cutover.test.mjs`
- Modify: `apps/web/src/platform/public-media.ts`
- Modify: `apps/web/src/app/media/home/[...path]/route.ts`
- Modify: `apps/web/src/app/media/capability-maps/[...path]/route.ts`
- Modify: `apps/web/src/app/media/tts/[...path]/route.ts`
- Modify: `scripts/web-source-release-policy.mjs`

**Interfaces:**
- Produces: immutable `media-cutover-manifest.json` containing source path, staging path, target path, byte size and SHA-256 for every copied file, plus old-target quarantine metadata.

- [x] **Step 1: 写媒体闭包 RED 测试**

从 P1 generated `mediaRefs` 与 Image2 route contract 生成需要列表，断言每个目标文件存在且 SHA 与源相同；source release allowlist 覆盖目标文件且仍拒绝数据库、密钥和 `.env*`。

- [x] **Step 2: Copy 到独立 staging，不覆盖正式目标**

从白名单源复制到仓库内唯一 staging 目录；拒绝绝对路径、`..`、符号链接、junction、reparse point 和目标根逃逸。生成逐文件源/staging SHA-256 清单，只有全量路径与 SHA 均通过才能进入 cutover。失败只撤销 staging，正式目标与旧 resolver 保持不变；源 `site/public/media` 在本 Task 完成前不移动、不删除。

- [x] **Step 3: 原子切媒体目录、resolver/allowlist 并双路径回归**

先将旧正式目标移入同盘临时 rollback 位置，再把已校验 staging 原子切为 `apps/web/public/media`；切换后应用只读新目录。完成 URL、内容、Image2、生产构建和 source archive 审计后，才把旧正式目标移入仓外 quarantine；失败立即恢复旧目标和旧 resolver，不删除任何已存在正式文件。旧 `site/public/media` 继续保留到 Task 11。

```powershell
node scripts/audit-web-media-cutover.mjs
pnpm audit:image2-reference
pnpm web:build
pnpm deploy:web:source
```

Expected: 所有 P1 媒体 URL 200，target/source SHA 相同，source 包 0 forbidden。

### Task 10: 建立活动工程审计并清理可再生缓存

**Files:**
- Create: `scripts/audit-active-workspace.mjs`
- Create: `scripts/audit-active-workspace.test.mjs`
- Modify: `scripts/cleanup-runtime-artifacts.mjs`
- Quarantine after passing dry-run audit: `apps/web/.next/`, `scripts/**/__pycache__/`，以及由明确 releaseId/SHA 列举且不属于 current/previous/final evidence 的旧截图和旧 source archive
- Protect during execution: `.git/`, `.agents/`, `.codex/`, `.codegraph/`, `.playwright-cli/`, `content/`, `textbook/`, `apps/web/database/`, `apps/web/.data/`, `site/public/media/`

**Interfaces:**

```ts
export interface ActiveWorkspaceAudit {
  forbiddenRuntimeRefs: string[];
  removablePaths: string[];
  protectedPaths: string[];
  passed: boolean;
}
```

- [x] **Step 1: 写活动闭包与保护路径测试**

断言权威 docx/importer/textbook/packages/database/media 永远不能成为候选；可再生缓存只在显式路径与扩展名白名单内出现。

- [x] **Step 2: 先生成不可变 dry-run manifest，再按同一 manifest quarantine**

```powershell
node scripts/cleanup-runtime-artifacts.mjs --dry-run --manifest artifacts/runtime-cleanup-candidates.json --verbose
node scripts/audit-active-workspace.mjs
node scripts/cleanup-runtime-artifacts.mjs --apply-manifest artifacts/runtime-cleanup-candidates.json --quarantine-root D:/Claude/dgbook-quarantine --verbose
```

`manifest` 固定每个候选的规范化绝对路径、类型、大小、SHA 和采集时间；apply 不重新扫描候选，只消费同一清单并重验仓库根、保护路径、文件状态和 reparse point。候选只移入唯一仓外 quarantine，不直接删除。Expected: apply 清单与 dry-run 完全相同；数据库/备份、最终截图目录、媒体切换清单、已上线 SHA 的 upload manifest/report 和 current+previous release 证据被保护。

### Task 11: 将 legacy 工程移入仓外可逆隔离区

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `AGENTS.md`
- Quarantine after audit: `site/src/`, `site/astro.config.mjs`, `site/package.json`, `studio/`, `OpenMAIC/`
- Quarantine after package-script migration: `scripts/prepare-cloud-sample.mjs`, `scripts/verify-cloud-sample.mjs`, `scripts/audit-cloud-sample-portability.mjs`, `scripts/audit-cloud-sample-runtime.mjs`, `scripts/audit-cloud-sample-remote.mjs`, `scripts/smoke-cloud-sample-archive.mjs`, `scripts/archive-cloud-sample.mjs`, `scripts/verify-cloud-sample-archive.mjs`, `scripts/cloud-sample-preflight.mjs`, `scripts/deploy-cloud-sample-ssh.mjs`, `scripts/prepare-cloud-sample-release.mjs`

**Interfaces:**
- Consumes: passing `ActiveWorkspaceAudit` and `media-cutover-manifest.json`.
- Produces: `D:/Claude/dgbook-quarantine/<UTC timestamp>/manifest.json` with original path, quarantine path, size and SHA for every moved file.

- [x] **Step 1: 证明 legacy 不在运行闭包**

根 dev/build/typecheck/QA/source release 不得引用 `@dgbook/site`、`studio`、`OpenMAIC` 或 `deploy:sample:*`；P1 媒体只读 apps/web。未满足任何断言则不移动对应路径。

- [x] **Step 2: 改工作区与文档，再完整重建**

从 workspace/package scripts 移除已替代入口；`AGENTS.md` 改为 apps/web 主链。运行 Node20 install、unit、typecheck、structure、qa:gates 和 production build。

- [x] **Step 3: 仓外 quarantine，不永久删除；隔离后再次完整重建**

使用唯一目标目录与受限 ACL；移动前后比较逐文件树清单，禁止覆盖已有目标。移动完成后再次运行 Node20 frozen install、unit、typecheck、structure、qa:gates、production build 和 source archive audit；任一失败立即按 manifest 原路恢复并重跑门禁。`.git/` 在开发和部署全过程保持原位，不作为运行时清理候选。

### Task 12: 最终原子部署、公开验收与 Git 元数据收口

**Files:**
- Create: `docs/acceptance/p1-final-release-checklist.md`
- Preserve: final source upload manifest/report and `output/playwright/p1-final/<releaseId>/`
- Modify: `scripts/web-source-deploy-plan.mjs`
- Modify: `scripts/deploy-web-source-contract.test.mjs`
- Reversible quarantine after all acceptance: `.git/` -> `D:/Claude/dgbook-quarantine/<UTC timestamp>/git-metadata/`

- [x] **Step 1: 最终本地门禁与 source archive 审计**

```powershell
pnpm install --frozen-lockfile
pnpm web:test:unit
pnpm web:typecheck
pnpm web:check-structure
pnpm qa:gates
pnpm web:build
pnpm deploy:web:source
```

Expected: 活动闭包无 legacy 运行引用，P1 内容/媒体全部可达，source 包 0 forbidden，所有门禁绿色。

- [x] **Step 2: 原子部署与公开验收**

```powershell
pnpm deploy:web:source:paramiko
curl.exe -fsS http://8.153.206.97/api/build-info
pnpm audit:web:remote:protocol -- --base-url http://8.153.206.97/
pnpm audit:web:remote -- --base-url http://8.153.206.97/ --out output/playwright/p1-final
node scripts/audit-p1-three-terminal-consistency.mjs --base-url http://8.153.206.97/
node scripts/audit-p1-complete-journey.mjs --base-url http://8.153.206.97/
```

发布脚本在切换时将 old-current 原子记录为受管理的 `previous` symlink；prune 同时保护 current 与 previous。其他 release 先移入远端 `retired/` 并写清单，不在发布事务内永久删除。验证 `dgbook-web` active、SQLite `integrity_check=ok`、build-info release/SHA、学生首页、教师工作台、P1 三任务、12 节点、三 N02、课堂、投屏、图谱、三份产出和成果包。迁移前备份必须 `integrity_check=ok`、权限 `0600`；记录迁移前后 schema/用户/学习事件/产出计数，并证明重复 seed 不覆盖学习进度。失败不恢复破坏性数据库 down migration。

- [x] **Step 3: 只在公开旅程全绿后隔离旧证据**

只把与 current/previous SHA 无关且由清单明确列出的旧 release、旧 archive、重复截图和剩余 legacy `site/` 移入 quarantine，不永久删除；数据库及备份永不进入候选。保留最终 source manifest、部署报告、build-info、数据库备份路径和双视口证据。

- [x] **Step 4: 按用户“Git 不需要”要求做可逆收口**

最终公开验收、SQLite 备份完整性与 current/previous 验证全部通过后，停止所有依赖 Git 的进程；为当前空索引 `.git/` 生成逐文件树清单，以受限 ACL 移入唯一仓外 quarantine，禁止覆盖已有目标。失败保持原位；成功后记录 SHA/大小/原路径/恢复命令，并不再执行任何 Git 命令。

Expected: 全部退出 0；最终证据写入 `output/playwright/p1-final/<releaseId>/` 和 acceptance checklist。

**Release checkpoint:** `s4-p1-image2-clean-final-<UTC timestamp>`。

---

## Ralph / Goal Loop

每次自动续跑只抓取一个未完成执行单元，固定顺序 `0→1→2→3→4→5A→5B→5C→5D→6A→6B→6C→7→8→9→10→11→12`；仅在 `0/3/5D/7/12` 执行远端 checkpoint。每次权威门禁先运行以下版本断言：

```powershell
$env:PATH='C:\Users\alvin\AppData\Roaming\fnm\node-versions\v20.20.2\installation;'+$env:PATH
if ((node --version) -ne 'v20.20.2') { throw 'Node 20.20.2 is required' }
if ((pnpm --version) -ne '9.15.0') { throw 'pnpm 9.15.0 is required' }
```

随后严格循环：

```text
读取本计划与 progress
-> 写一个最小 RED
-> 实现当前纵向切片
-> 聚焦测试
-> 全量 Node20 门禁
-> 独立规格审查
-> 浏览器证据
-> 远端原子发布（到达 checkpoint 时）
-> 更新 progress
-> 选择下一个最高优先 Task
```

任何本地或远端门禁失败都停留在当前 Task，先按系统化诊断确定根因；不跳过失败、不用 mock 数据掩盖、不扩展非当前范围。

## Final Acceptance Matrix

| 已确认需求 | 实现 Task | 机器验收 |
|---|---:|---|
| 学生四问首页 | 0/3/8 | role entry + DOM + 双视口 |
| 教师授课工作台 | 0/6A/8 | 两点击 N02 + SQLite session |
| P01/P02/P03 完整 | 3/4/5A–5D | 12 节点 + 三产出 + 成果包 |
| 三个 N02 深教材 | 4 | 内容基数 + 无语音自学 |
| 自学/课堂分离 | 4/6B/6C | 双游标跨上下文审计 |
| 唯一状态机 | 1/2 | 事件投影 + 非法迁移测试 |
| 路由/API 门禁 | 2/3/5A | open/locked/not-open/not-found |
| 四端数据一致 | 7 | 同 version/revision/人数/分数 |
| 40/60 评分 | 1/5C/5D/7 | 80/90=86；缺项尚未形成 |
| 3 人演示但可扩容 | 1/7 | SQLite 3→24 roster 回归 |
| Image2 高保真 | 8 | 双视口/键盘/动效/连线 |
| 工程冗余清理 | 9–12 | 媒体切换 + 活动闭包审计 + 仓外隔离 + 全量重建 |
| 每阶段远端上线 | 0/3/5D/7/12 | build-info + atomic current + smoke |

## Self-Review Checklist

- [x] 每条 2026-07-15 确认需求都映射到至少一个 Task。
- [x] 计划中不存在未决标记、未关闭的临时实现、N01 静默 fallback 或第二套可变数据源。
- [x] `P1TaskId`、`P1NodeId`、`TaskScoreProjection`、`ProfessionalOutputVersion` 和 `AuthoritativeSnapshot` 在生产者/消费者之间命名一致。
- [x] 所有权威测试均由 Ralph loop 的 Node 20.20.2/pnpm 9.15.0 可执行前置断言约束。
- [x] 任何隔离/清理动作之前均要求仓库外快照、不可变显式候选清单和通过的引用审计。

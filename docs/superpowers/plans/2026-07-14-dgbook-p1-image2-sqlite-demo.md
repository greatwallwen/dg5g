# DGBook P1 Image2 SQLite 样张总实施计划

> **已由 2026-07-15 计划取代：** 后续执行使用 `2026-07-15-dgbook-p1-complete-sample.md`；本文件只保留历史阶段背景。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前 DGBook Web 样张重构为可真实登录、可完成 P1 三任务、学生/教师/投屏/图谱数据一致、视觉对齐 Image2 V4、并能按阶段稳定发布到现网的完整演示闭环。

**Architecture:** 保留现有 Next.js 14 单体与课程静态资产；新增服务端 Cookie 会话、`better-sqlite3` 单一事实源、命令/投影服务和 SSE 失效通知。课程定义与教材内容版本化在仓库，用户、学习、评分、专业产出、课堂、游标和回执持久化在共享 SQLite。每阶段按纵向切片交付可操作页面并远端验证。

**Tech Stack:** TypeScript、React 18、Next.js 14 App Router、`better-sqlite3`、Node `crypto.scrypt`、SSE、Node test runner、Playwright、现有 Motion/XYFlow/Three/EduGame、Paramiko SSH 发布。

**Approved design:** `docs/superpowers/specs/2026-07-14-dgbook-p1-image2-sqlite-demo-design.md`

---

## 1. 子计划与责任边界

- [ ] 执行 `docs/superpowers/plans/2026-07-14-dgbook-foundation-auth-home.md`：SQLite、迁移/种子、服务端登录、角色入口与发布持久化。
- [ ] 执行 `docs/superpowers/plans/2026-07-14-dgbook-state-gates-realtime.md`：唯一状态机、路由/API 门禁、课堂双游标、统一快照和 SSE。
- [ ] 执行 `docs/superpowers/plans/2026-07-14-dgbook-p1-content-product-ui.md`：P1 三任务、N02 深教材、结构化产出、成果包、学生/教师/课堂/图谱 UI。
- [ ] 执行 `docs/superpowers/plans/2026-07-14-dgbook-image2-deploy-acceptance.md`：Image2 几何合同、运行时验收、每阶段发布、回滚和最终人工验收。

并行工作只允许发生在互不重叠的文件所有权内。共享类型、数据库 schema、路由契约和 CSS token 由主代理合并；子代理不得同时修改 `models.ts`、`package.json`、`next.config.mjs`、数据库迁移或全局 CSS。

## 2. 不可破坏约束

- [ ] 不手改 `site/dist/`。
- [ ] 改变由 `content/5g/5g.docx` 生成的教材结果时，先改 `scripts/import-5g-docx.py` 或 `scripts/import_5g/`，再运行 `pnpm import:5g`。
- [ ] 保持教材单向讲授，不新增学生对话、讨论、圆桌或问答导师入口。
- [ ] 纯动画 widget 不混入播放控制、讲师或 TTS 配置。
- [ ] 不把 SSH 密码、Cookie token、口令散列、SQLite 文件或远端备份写入 Git、计划、日志和构建产物。
- [ ] SQLite 文件固定在 release 目录外；本地默认 `apps/web/.data/dgbook-demo.sqlite`，远端默认 `/var/lib/dgbook/dgbook.sqlite`。
- [ ] 仅保留 1 名教师、3 名学生的确定性演示数据；不得恢复 24 人硬编码。
- [ ] 补考、审批、教务回写、账号后台、多租户和 P2–P6 内容不扩展进本轮。

## 3. 纵向发布顺序

### Stage 1 — SQLite、真实登录与角色首页

- [ ] 完成 foundation 子计划 Task F1–F7。
- [ ] 学生账号登录落到 `/student/home`，教师账号落到 `/teacher/workbench`。
- [ ] 学生首屏回答四问；教师两次点击内进入 P1T1-N02。
- [ ] 将当前进程内身份、3 个 Map 的后续替换入口抽象为 repository，但本阶段不必完成全部学习迁移。
- [ ] 执行本地单元、结构、typecheck、build 和角色入口 Playwright。
- [ ] 以 release ID `s1-auth-home-<timestamp>` 发布并执行远端登录、学生首页、教师工作台、旧 `/course` 入口冒烟。

### Stage 2 — 状态机、学习事实与门禁

- [ ] 完成 state 子计划 Task S1–S3。
- [ ] 所有节点状态只由 `NodeLearningPolicy + LearningEvent` 投影。
- [ ] P1T1-N04 锁定时 URL 与写 API 都拒绝正文/练习/提交；未知节点显示明确页面。
- [ ] 删除匿名可写的旧 `/api/skill-progress/[studentId]` 协议。
- [ ] 发布 `s2-state-gates-<timestamp>`，远端验证 open/locked/not-open/not-found 四类页面与 API。

### Stage 3 — P1 三任务与成果链

- [ ] 完成 content 子计划 Task C1–C4。
- [ ] `/projects/P1` 或等价 P1 页面完整显示 P01→P02→P03 与三个职业化产出。
- [ ] P03 源 MDX、lesson AST、动画、Manim 和 EduGame 资产接入 Web，不再回退 P01。
- [ ] 十二节点均有可学习内容、微练习、反馈和结构化节点产出。
- [ ] 发布 `s3-p1-project-<timestamp>`，远端依次进入 P01/P02/P03 并查看成果包状态。

### Stage 4 — N02 深教材、自学/跟随与 SQLite 课堂

- [ ] 完成 content 子计划 Task C5–C7 与 state 子计划 Task S4、S6。
- [ ] N02 六段成为可独立阅读的连续教材，满足 2 正例、2 反例、3 层练习、纠错路径、迁移与量规。
- [ ] 自学完整内容与课堂当前单元使用同一内容定义、两个渲染器和两个持久化游标。
- [ ] 教师切页只更新课堂游标；自主学习游标不被覆盖。
- [ ] 发布 `s4-learning-classroom-<timestamp>`，远端双浏览器验证同步与不强跳。

### Stage 5 — 四端一致、成绩与图谱

- [ ] 完成 state 子计划 Task S5–S7 与 content 子计划 Task C8–C10。
- [ ] 学生、教师、投屏、图谱从同一读事务得到同一 `snapshotVersion`。
- [ ] 统一显示 3 人班、提交数、达标数和课堂修订号。
- [ ] 分开显示节点测试最高分、任务暂估分、任务正式分、项目综合分。
- [ ] 教师退回/认证只操作 N04 任务产出；认证不篡改正式测试分。
- [ ] 发布 `s5-unified-snapshot-<timestamp>`，同一时刻刷新四端做字段一致性断言。

### Stage 6 — Image2 全面精修与最终收口

- [ ] 完成 Image2 子计划 Task I1–I7。
- [ ] 六张 V4 参考对应页面全部通过 1440×900 与 1920×1080 几何、溢出、可读性、键盘和 reduced-motion 门禁。
- [ ] 新学生首页、教师工作台和投屏建立 V5 参考合同，视觉语言必须延续 V4，而非另起主题。
- [ ] 5 名非专业受试者至少 4 名通过 30 秒入口与三类证据复述。
- [ ] 发布 `s6-image2-final-<timestamp>`；远端全量 `qa:demo-live`、截图证据和服务状态通过。

## 4. 每个 Stage 的统一红绿循环

- [ ] 先新增或更新会失败的单元/协议/运行时断言，并记录失败原因必须正好对应本阶段缺口。
- [ ] 只实现当前纵向切片；避免提前引入非目标后台或抽象。
- [ ] 运行定向测试直到绿色。
- [ ] 运行 `pnpm web:check-structure`，预期 `apps/web structure check passed`。
- [ ] 运行 `pnpm web:test:unit`，预期 0 failed。
- [ ] 运行 `pnpm web:typecheck`，预期退出码 0。
- [ ] 运行 `pnpm web:build`，预期 Next production build 成功。
- [ ] 运行与本阶段有关的 Playwright/runtime/Image2 审计并保留 `output/playwright/` 证据。
- [ ] 执行阶段发布合同；远端失败立即停止后续 Stage，恢复上一 release 和其兼容数据库备份。
- [ ] 部署冒烟结束后运行受保护的 `demo` seed reset，确保下一阶段仍是同一 3 人样本。

## 5. 跨子计划接口冻结点

以下接口先由 foundation/state 计划落地，其他工作只能消费，不得复制第二套：

```ts
export interface AppDatabase {
  readonly connection: import('better-sqlite3').Database;
  transaction<T>(work: () => T): T;
}

export interface AuthenticatedActor {
  userId: string;
  account: string;
  displayName: string;
  role: 'student' | 'teacher';
  classId: 'demo-class';
  studentId?: 'stu-01' | 'stu-02' | 'stu-03';
}

export type NodeRouteClassification =
  | { kind: 'open'; nodeId: string }
  | { kind: 'locked'; nodeId: string; prerequisites: PrerequisiteNotice[] }
  | { kind: 'not-open'; nodeId: string }
  | { kind: 'not-found'; requestedNodeId: string };

export interface AuthoritativeSnapshot {
  snapshotVersion: number;
  generatedAt: string;
  classroomRevision: number;
  audience: 'student' | 'teacher' | 'projector' | 'graph';
}
```

- [ ] 内容层只通过稳定 `projectId/taskId/nodeId/unitId` 关联数据库，不把数据库行号写进课程定义。
- [ ] 客户端只提交命令意图，不提交可信角色、学生 ID、派生状态或综合分。
- [ ] SSE 只通知 `topic/scope/version`，客户端随后 GET 权威快照。

## 6. 八项需求追踪

| 用户要求 | 主实现 Stage | 自动验收 |
|---|---:|---|
| 学生默认入口四问 | 1 | 登录落点、首屏 DOM、30 秒人工任务 |
| 教师授课工作台 | 1 | 两点击路径、最近位置恢复 |
| P1 三任务完整样例 | 3/5 | 12 节点、3 产出、成果包投影 |
| N02 深自学内容 | 4 | 内容 schema 基数、无语音理解题 |
| 自学/课堂跟随分离 | 4 | 双游标跨上下文测试 |
| 统一学习状态机 | 2/5 | 转移表、非法跃迁、四端状态 |
| 节点权限与路由门禁 | 2 | 页面/API 四分类测试 |
| 三端数据与统计口径 | 5 | 同版本四快照字段相等 |

## 7. 最终完成定义

- [ ] 所有子计划 checkbox 完成，且没有未完成标记、临时回退或双数据源。
- [ ] `pnpm qa:gates`、`pnpm qa:web:runtime`、`pnpm audit:class-session-cross-context`、`pnpm audit:self-study-closure` 全绿。
- [ ] SQLite `PRAGMA integrity_check` 返回 `ok`；迁移、base seed、demo seed 均可幂等重跑。
- [ ] 现网 `api/build-info` 的 release ID/sha 与最终发布一致，`dgbook-web` 为 active。
- [ ] 现网学生、教师、投屏、图谱、P1 项目、N02 自学、课堂跟随、正式测试和成果包全部冒烟通过。
- [ ] 远端截图与 Image2 合同通过，并保存最终人工验收记录；任何敏感信息均未进入产物。

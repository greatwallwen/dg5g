# DGBook SQLite、服务端认证与角色首页实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可迁移、可重置、可跨 release 保留的 SQLite 基础设施，改成真实服务端登录，并让学生/教师进入各自任务首页而非完整能力图谱。

**Architecture:** `better-sqlite3` 由仅服务端 platform 模块封装；SQL 迁移按版本执行，base/demo seed 幂等。登录验证 scrypt 散列并设置 HttpOnly Cookie，页面/API 从 Cookie 派生 actor。角色首页由服务端 read model 渲染，后续可无缝切换到统一学习投影。

**Tech Stack:** Next.js 14、TypeScript、`better-sqlite3`、Node crypto、Server Components/Route Handlers、Node test runner、Playwright。

---

## Task 1 (F1)：安装 SQLite 驱动并建立连接生命周期

**Files:**

- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/next.config.mjs`
- Modify: `.gitignore`
- Create: `apps/web/src/platform/db/database.ts`
- Create: `apps/web/src/platform/db/database.test.ts`
- Create: `apps/web/src/platform/db/test-database.ts`

- [ ] 写失败测试：临时文件数据库启用 `foreign_keys=1`、`journal_mode=wal`、`busy_timeout=5000`；同一进程 `getDatabase()` 复用连接，测试工厂彼此隔离。
- [ ] 运行 `node --test apps/web/src/platform/db/database.test.ts`，预期因模块不存在失败。
- [ ] 在 `apps/web/package.json` 添加运行依赖 `better-sqlite3`，开发依赖 `@types/better-sqlite3`；运行 `pnpm install` 更新 lockfile。
- [ ] 实现 `AppDatabase` 和 `openDatabase(path)`；路径依次读取 `DGBOOK_SQLITE_PATH`、本地默认 `apps/web/.data/dgbook-demo.sqlite`。目录不存在时安全创建。
- [ ] 连接建立时执行 PRAGMA；所有调用通过 `transaction<T>`，禁止 feature 直接 new Database。
- [ ] `next.config.mjs` 增加 `serverExternalPackages: ['better-sqlite3']`，并为 `apps/web/database/**` 增加 standalone output tracing include。
- [ ] `.gitignore` 增加 `apps/web/.data/`、`*.sqlite`、`*.sqlite-wal`、`*.sqlite-shm`、数据库备份目录；不要忽略迁移 SQL。
- [ ] 重跑测试，预期全部通过；运行 `pnpm web:typecheck` 验证 native driver 类型。

## Task 2 (F2)：版本化迁移、3 学生 seed 与数据库管理命令

**Files:**

- Create: `apps/web/database/migrations/001_system_auth.sql`
- Create: `apps/web/database/migrations/002_learning.sql`
- Create: `apps/web/database/migrations/003_classroom.sql`
- Create: `apps/web/database/demo-seed.json`
- Create: `apps/web/src/platform/db/migrations.ts`
- Create: `apps/web/src/platform/db/migrations.test.ts`
- Create: `apps/web/src/platform/db/demo-seed.ts`
- Create: `apps/web/src/platform/db/demo-seed.test.ts`
- Create: `apps/web/scripts/db-admin.mjs`
- Modify: `apps/web/package.json`

- [ ] 先写失败测试：空库执行迁移后具备全部表/索引/唯一约束；重复迁移无变化；未知更高 schema version 明确停止。
- [ ] 写失败测试：`base` seed 恰有 1 教师、3 学生、1 班；重复执行数量不增加；`demo` seed 只追加稳定事件并能受控 reset。
- [ ] 写失败测试：`learning_events.event_id`、`formal_attempts.attempt_id`、session token digest、课堂 command revision 有唯一约束，外键删除规则明确。
- [ ] `001_system_auth.sql` 建立 `schema_migrations/users/classes/class_memberships/auth_sessions/snapshot_versions`。
- [ ] `002_learning.sql` 建立 `learning_events/formal_attempts/professional_outputs/output_reviews/self_study_cursors/frozen_task_scores`。
- [ ] `003_classroom.sql` 建立 `classroom_sessions/classroom_members/classroom_commands/device_presence/command_acks`。
- [ ] `demo-seed.json` 固定 ID：`teacher-01`、`stu-01`、`stu-02`、`stu-03`、`demo-class`；账号为教师 1 个、学生 3 个，不保存 SSH 或生产秘密。
- [ ] `demo-seed.ts` 使用稳定事件 ID/upsert；口令由 seed 执行时用与登录相同的 scrypt helper 散列。Demo 默认口令可由 `DGBOOK_DEMO_PASSWORD` 覆盖。
- [ ] `db-admin.mjs` 提供 `migrate`、`seed base`、`seed demo`、`reset demo`、`verify`、`backup`；日志只输出路径、版本和计数，不输出口令/hash/token。
- [ ] 在 package scripts 增加 `db:migrate/db:seed:base/db:seed:demo/db:reset:demo/db:verify`。
- [ ] 运行 `pnpm --filter @dgbook/web db:migrate`、两次 seed、`db:verify`；预期 schema 最新、teacher=1、students=3、`integrity_check=ok`。

## Task 3 (F3)：口令、会话与 actor 授权边界

**Files:**

- Create: `apps/web/src/platform/auth/password.ts`
- Create: `apps/web/src/platform/auth/password.test.ts`
- Create: `apps/web/src/platform/auth/session-repository.ts`
- Create: `apps/web/src/platform/auth/session-repository.test.ts`
- Create: `apps/web/src/platform/auth/auth-service.ts`
- Create: `apps/web/src/platform/auth/auth-service.test.ts`
- Create: `apps/web/src/platform/auth/actor.ts`
- Create: `apps/web/src/platform/auth/actor.test.ts`
- Create: `apps/web/src/platform/auth/cookie.ts`
- Modify: `apps/web/src/features/auth/role-session.ts`

- [ ] 写失败测试：正确口令通过、错误口令失败、同口令不同 salt；比较使用 timing-safe；散列格式版本可验证。
- [ ] 写失败测试：登录只接受启用账号，生成 256-bit 随机 token，只在库中保存 SHA-256 digest，过期/撤销 token 不返回 actor。
- [ ] 写失败测试：`AuthenticatedActor` 的 role/class/studentId 来自 membership；客户端声明 role/studentId 不影响结果。
- [ ] 实现 `hashPassword/verifyPassword`，使用 `crypto.scrypt` 和随机 salt；限制账号/口令长度并给出统一失败文案，避免账号枚举。
- [ ] 实现 `AuthService.login/logout/readActor` 和 `SessionRepository`；登录事务同时清理该账号过期 session。
- [ ] 定义：

```ts
export interface AuthenticatedActor {
  userId: string;
  account: string;
  displayName: string;
  role: 'student' | 'teacher';
  classId: 'demo-class';
  studentId?: 'stu-01' | 'stu-02' | 'stu-03';
}

export async function requireUser(): Promise<AuthenticatedActor>;
export async function requireClassRole(role: 'student' | 'teacher'): Promise<AuthenticatedActor>;
```

- [ ] Cookie 名固定 `dgbook_session`，属性 `HttpOnly`、`SameSite=Lax`、`Path=/`、合理 Max-Age；生产请求使用 `Secure`。只在 Route Handler 写/清 Cookie。
- [ ] 将 `role-session.ts` 缩减为无授权意义的展示类型或删除；移除 localStorage identity 读写。
- [ ] 运行所有 auth 单元测试，预期通过；用 `rg "localStorage|x-dgbook-class-role|\?role=" apps/web/src` 列出并计划迁移剩余调用。

## Task 4 (F4)：真实登录 API、登出与角色落点

**Files:**

- Create: `apps/web/src/app/api/auth/login/route.ts`
- Create: `apps/web/src/app/api/auth/logout/route.ts`
- Create: `apps/web/src/app/api/auth/me/route.ts`
- Create: `apps/web/src/app/api/auth/auth-routes.test.ts`
- Modify: `apps/web/src/features/auth/login-page.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/features/auth/role-gate.tsx`
- Modify: `apps/web/next.config.mjs`

- [ ] 写失败 route 测试：学生/教师正确登录为 200 并返回各自 home；错误账号/口令 401；role 与账号 membership 不符 401；响应不包含 hash/token。
- [ ] 写失败安全测试：外部 `next=//evil`、反斜线、跨角色 home 被拒绝；已登录用户访问 `/` 服务端重定向到自己的角色首页。
- [ ] `login-page.tsx` 改为 POST `/api/auth/login`；只有成功后 `router.replace(home)`；失败显示字段外统一错误并恢复按钮。
- [ ] 登录页可以显示四个 demo 账号快捷选择，但表单必须真实验证；不得自动把任意账号写成本地身份。
- [ ] `/api/auth/me` 返回安全 actor DTO；logout 撤销数据库 session 并清 Cookie。
- [ ] `next.config.mjs` 把 `/teacher` 重定向改为 `/teacher/workbench`；保留 `/course` 作为次级图谱，不再作为登录默认入口。
- [ ] 运行 auth route 测试、`pnpm web:typecheck` 和 `pnpm web:build`。

## Task 5 (F5)：学生首页与教师工作台服务端读模型

**Files:**

- Create: `apps/web/src/app/student/home/page.tsx`
- Create: `apps/web/src/features/home/student-home-model.ts`
- Create: `apps/web/src/features/home/student-home-model.test.ts`
- Create: `apps/web/src/features/home/student-home.tsx`
- Create: `apps/web/src/app/teacher/workbench/page.tsx`
- Create: `apps/web/src/features/workbench/teacher-workbench-model.ts`
- Create: `apps/web/src/features/workbench/teacher-workbench-model.test.ts`
- Create: `apps/web/src/features/workbench/teacher-workbench.tsx`
- Create: `apps/web/src/app/role-home-v5.css`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/course/page.tsx`

- [ ] 学生模型先写失败测试：当前项目/任务/节点、为什么学、下一步和完成标准均非空；恰有一个 primary action；其他任务与图谱为次级入口。
- [ ] 写失败测试：有 active classroom 时 primary action 是进入课堂，自学恢复链接降为次级；无课堂时 primary 是继续学习。
- [ ] 教师模型先写失败测试：课程、`studentCount: 3`、最近授课位置、继续授课、开始新课、待批阅、薄弱点、图谱入口齐全。
- [ ] 写失败测试：继续授课一次点击到最近位置；在 workbench 打开新课选择器后，第二次点击直达 `/teacher/sessions/P1T1-N02`。
- [ ] 两个 page 都先 `requireClassRole`，未经授权跳登录并带安全相对 `next`；跨角色返回 403/角色首页，不在客户端闪现受限内容。
- [ ] 初始 read model 从 demo seed/静态 P1 定义组合；Stage 2 后只替换数据 loader 为统一投影，组件接口保持稳定。
- [ ] 实现 Image2 同源深海军蓝、12 列 Bento 首屏，主行动在 1440×900/1920×1080 首屏可见；控件最小 44px、圆角不超过 8px。
- [ ] `/course` 添加明确返回角色首页入口，继续作为能力图谱次级页面。
- [ ] 运行模型单测、typecheck、build；Playwright 断言两种角色落点和教师两点击路径。

## Task 6 (F6)：让 SQLite 跨 release 持久化并强化原子发布

**Files:**

- Modify: `scripts/deploy-web-source-paramiko.py`
- Modify: `scripts/deploy-web-source-ssh.mjs`
- Modify: `scripts/release-web-source.mjs`
- Modify: `scripts/prepare-web-source-release.mjs`
- Create: `scripts/deploy-web-source-contract.test.mjs`
- Modify: `scripts/check-web-structure.mjs`

- [ ] 写失败 contract 测试：systemd 必须含 `DGBOOK_SQLITE_PATH` 且路径不在 `/releases/`；切 current 前完成 backup/migrate/seed/verify；健康失败恢复旧 symlink 并重启。
- [ ] 写失败测试：无 Git commit 时 release ID 回退为 `<UTC timestamp>-<archive sha prefix>`；显式 `--release-id` 或 `DGBOOK_WEB_DEPLOY_RELEASE_ID` 优先并校验安全字符。
- [ ] 远端默认建立 `/var/lib/dgbook`（权限只给服务用户/root）；部署前执行 SQLite online backup 或安全 checkpoint 后复制到带 release ID 的备份。
- [ ] systemd unit 注入 `DGBOOK_SQLITE_PATH=/var/lib/dgbook/dgbook.sqlite`；发布脚本在新 release 内运行 `db:migrate`、`db:seed:base`、`db:seed:demo`、`db:verify` 后才切 symlink。
- [ ] 迁移遵循 expand-first；本轮脚本不得自动执行 destructive down migration。
- [ ] 保存旧 current target；切换后内部 3157 健康失败时恢复 target、重启 service，并保留失败 release 供诊断。
- [ ] 日志只打印 host/releaseId/sha/schemaVersion/计数；不得打印 password/token/hash 或完整环境。
- [ ] 运行 contract 测试和 `pnpm web:check-structure`。

## Task 7 (F7)：Stage 1 本地与现网验收

**Files:**

- Create: `scripts/audit-role-entry.mjs`
- Modify: `scripts/audit-web-runtime.mjs`
- Modify: `scripts/run-web-runtime-audits.mjs`
- Modify: `package.json`

- [ ] `audit-role-entry.mjs` 通过真实登录覆盖教师、3 个学生、错误口令、登出、跨角色访问、Cookie flags、学生四问、教师两点击。
- [ ] 更新 runtime audit 的登录 helper，删除 localStorage 伪身份；每个测试独立 browser context。
- [ ] 运行：

```powershell
pnpm --filter @dgbook/web db:reset:demo
pnpm web:test:unit
pnpm web:check-structure
pnpm web:typecheck
pnpm web:build
node scripts/audit-role-entry.mjs --base-url http://127.0.0.1:3162/
```

- [ ] 预期 1 教师、3 学生登录成功，错误口令 401，角色落点正确，页面 console error=0。
- [ ] 按 Image2 发布子计划使用会话临时环境变量发布 `s1-auth-home-<timestamp>`；不要把凭据写进命令文档或终端回显。
- [ ] 现网检查 `/api/build-info`、`/`、`/student/home`、`/teacher/workbench`、`/course`；验证 `dgbook-web` active 和 SQLite `integrity_check=ok`。
- [ ] 执行现网 demo reset 后再次确认 1 教师/3 学生，保存不含敏感信息的截图与报告。

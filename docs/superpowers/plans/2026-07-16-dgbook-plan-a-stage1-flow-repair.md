# DGBook 方案 A 第一阶段流程修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or equivalent bounded parallel execution. Every production change follows red-green-refactor.

**Goal:** 用最小界面和单一 SQLite 权威链修通极简登录、全局退出、教师课堂写操作以及“开始新课”真实落点。

**Architecture:** 登录页只提交用户名和密码，角色由服务端登录响应决定。退出复用现有 `/api/auth/logout`，通过一个共享账号控件进入所有认证后主界面。教师课堂更新继续使用 SQLite revision 乐观并发；“开始新课”使用明确服务端命令原子重置本轮课堂状态，禁止用 GET 查询参数隐式写状态。

**Tech Stack:** Next.js 14、React、TypeScript、Node test、SQLite、pnpm 9.15.0、Node 20.20.2。

## Global Constraints

- 登录页不得显示学生/教师切换按钮或账号卡片。
- 登录页只保留账号、密码、进入教材三个交互控件；文字提示学生账号 `student01`、`student02`、`student03`，教师账号 `teacher01`，演示密码 `123456`。
- 登录角色必须由服务端认证结果决定，不信任 URL、localStorage 或浏览器角色状态。
- 一个教师和恰好三个演示学生；不增加考勤、补考、审批和复杂教务。
- SQLite 是课堂状态、revision、成绩与参与状态的唯一权威；不增加浏览器权威副本。
- “开始新课”第二次点击必须先成功写入所选节点，再进入教师授课页。
- 所有教师写操作携带 `expectedRevision`；409 必须以可恢复失败返回，禁止静默覆盖。
- 不创建、初始化或使用 Git；不执行 commit 步骤。
- 不编辑 `.next`、构建产物、数据库文件、权威教材源或已验证媒体。

---

### Task 1: 极简登录入口

**Files:**
- Modify: `apps/web/src/features/auth/login-page.tsx`
- Modify: `apps/web/src/features/auth/login-page-contract.test.ts`
- Modify: `apps/web/src/features/auth/auth-ui-contract.test.ts`
- Modify: `apps/web/src/app/auth.css`

**Interfaces:**
- Consumes: `POST /api/auth/login` existing response `{ home }`.
- Produces: one credential form with server-selected role destination.

- [ ] Add a failing contract test asserting the source contains the three student usernames as non-button hint text and contains neither `login-role-switch` nor `login-demo-accounts`.
- [ ] Run `pnpm exec tsx --test apps/web/src/features/auth/login-page-contract.test.ts apps/web/src/features/auth/auth-ui-contract.test.ts`; expect the new assertion to fail against the current account-card UI.
- [ ] Remove role state, role switch, shortcut buttons and their imports. Keep username/password submission and exactly one primary action. Use copy: `学生账号：student01 / student02 / student03`, `教师账号：teacher01`, `演示密码：123456`.
- [ ] Remove obsolete login switch/card CSS rules and retune the compact hint spacing without changing the Image2 visual language.
- [ ] Re-run the focused tests; expect zero failures.

### Task 2: 认证后全局退出控件

**Files:**
- Create: `apps/web/src/features/auth/account-menu.tsx`
- Create: `apps/web/src/features/auth/account-menu.test.ts`
- Modify: `apps/web/src/features/home/role-home-header.tsx`
- Modify: `apps/web/src/features/auth/role-gate.tsx`
- Modify: `apps/web/src/features/textbook-scene/textbook-scene-shell.tsx`
- Modify: `apps/web/src/features/classroom/student-follow-client.tsx`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Consumes: `logoutCurrentActor(): Promise<void>`.
- Produces: `AccountMenu({ displayName, role, homeHref? })` with one destructive action `退出登录`.

- [ ] Write failing source/renderer tests proving the shared control calls `logoutCurrentActor`, returns to `/`, and appears on role homes, self-study, teacher console and student classroom.
- [ ] Run the focused tests and verify they fail because the shared control is absent.
- [ ] Implement an accessible user pill/details menu with current name/role and a single `退出登录` action. Do not add a duplicate “切换账号” action; logging out already returns to the single login form.
- [ ] Reuse the component from `RoleHomeHeader`; have `RoleBadge` render the same authenticated control; add it to self-study and student classroom top bars.
- [ ] Add keyboard focus, busy state and responsive styles in the global layer.
- [ ] Re-run focused tests; expect zero failures.

### Task 3: 修复教师 patch revision 协议

**Files:**
- Modify: `apps/web/src/features/classroom/classroom-transport.ts`
- Modify: `apps/web/src/features/classroom/classroom-transport.test.ts`
- Modify: `apps/web/src/features/classroom/use-class-session.ts`
- Modify: `apps/web/src/features/classroom/use-class-session-runtime.test.ts`

**Interfaces:**
- Changes: `patchSession(sessionId, role, studentId, patch, expectedRevision?)`.
- Teacher payload: `{ patch, expectedRevision }`.
- Student payload remains the narrow `{ action }` form.

- [ ] Change the transport test first to expect `{ patch, expectedRevision: 4 }`; run it and verify failure because current code sends only `{ patch }`.
- [ ] Extend the transport interface and implementation with the expected revision only for teacher calls.
- [ ] Add a failing hook/runtime test showing two teacher updates serialize and the second uses the revision returned by the first.
- [ ] Move teacher updates onto the existing intent queue; read `sessionRef.current.lessonState.revision`, await the patch, update `sessionRef` immediately, then process the next write. Preserve the student narrow-action path.
- [ ] Verify 409 produces a degraded/action failure state and a subsequent poll can recover without optimistic local overwrite.
- [ ] Re-run all classroom transport and session runtime tests; expect zero failures.

### Task 4: 让“开始新课”成为服务端原子命令

**Files:**
- Modify: `apps/web/src/platform/classroom-session-service.ts`
- Modify: `apps/web/src/platform/classroom-session-service.test.ts`
- Create: `apps/web/src/app/api/class-sessions/[sessionId]/lesson/route.ts`
- Create: `apps/web/src/platform/class-session-start-lesson-route.test.ts`
- Modify: `apps/web/src/features/home/role-home-types.ts`
- Modify: `apps/web/src/features/home/role-home-read-model.ts`
- Modify: `apps/web/src/features/workbench/teacher-workbench-model.ts`
- Modify: `apps/web/src/features/workbench/teacher-workbench-model.test.ts`
- Create: `apps/web/src/features/workbench/start-lesson-action.tsx`
- Create: `apps/web/src/features/workbench/start-lesson-action.test.ts`
- Modify: `apps/web/src/features/workbench/teacher-workbench.tsx`

**Interfaces:**
- Adds `POST /api/class-sessions/:sessionId/lesson` body `{ nodeId, expectedRevision }`.
- Adds `ClassroomSessionService.startLesson(actor, sessionId, nodeId, expectedRevision)`.
- Workbench snapshot exposes classroom `revision`.

- [ ] Write a failing service test: starting P1T1-N01 from a paused P1T1-N02 session changes node/unit, sets status `active`, resets phase to `prepare`, playback, activity, review and formal-test run state, and increments revision once.
- [ ] Write failing authorization/API tests for teacher success, student 403, unpublished/unknown node 400 and stale revision 409.
- [ ] Implement `startLesson` using published node policy and `initialLessonState`; derive `${taskId}-ku-${nodeId suffix}` on the server and commit once through `commitTeacherMutation`.
- [ ] Add the dedicated lesson POST route so GET navigation never mutates classroom state.
- [ ] Add classroom revision to the teacher workbench read model and view model.
- [ ] Replace node `<Link>` elements with `StartLessonAction` buttons. On success route to `/teacher/sessions/{sessionId}`; on failure keep the picker open and render an actionable error.
- [ ] Remove `?nodeId=` construction and update model/contract tests to validate command inputs instead of href shape.
- [ ] Re-run focused service, route and workbench tests; expect zero failures.

### Task 5: Integrated verification and release gate

**Files:**
- Modify only if verification exposes an in-scope defect.
- Evidence: `output/playwright/plan-a-stage1/<releaseId>/`.

- [ ] Run focused auth, home, classroom transport, classroom service and workbench tests.
- [ ] Run `pnpm typecheck`, `pnpm web:check-structure`, `pnpm web:test:unit`, and `pnpm build` with the configured Node 20/pnpm 9 toolchain.
- [ ] Start the production build locally and perform a browser audit: login has no role/account buttons; student01 and teacher01 both authenticate; every primary surface exposes exit; logout returns to the one-form login.
- [ ] Verify teacher chooses P1T1-N01 while current session is P1T1-N02 and lands on actual P1T1-N01 content; then choose P1T1-N02 and verify the actual node changes again.
- [ ] Verify a teacher patch request includes `expectedRevision` and succeeds; a deliberately stale revision returns 409 without overwriting the current node.
- [ ] Create a verified source release with the repository deployment command, upload using the existing server workflow, and repeat the same smoke checks at `http://8.153.206.97/`.

## Self-review checklist

- Requirement coverage: login simplicity, global exit, patch revision, real start lesson and deployment each map to one task.
- YAGNI: no account cards, no duplicate switch-account action, no new class/session scheduler, no makeup/approval features.
- Data authority: every classroom mutation remains SQLite-backed and revision guarded.
- Demo usability: student01-03 remain discoverable as text; teacher01 remains available without adding a second login screen.
- Regression boundary: student action payload and independent self-study progress are unchanged in this stage.

# DGBook Image2 视觉、阶段发布与验收实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将登录、角色首页、能力图谱、自学、教师授课、学生跟随、投屏和正式测试统一到 Image2 V4 高保真工程视觉，并为每个实施阶段建立可回滚的现网发布与证据化验收。

**Architecture:** 以本地 V4 图片和结构化 route contract 定义页面区域/几何/语义，不把参考图当背景贴图。Playwright 在 1440×900、1920×1080 捕获实现，自动检查布局、溢出、控件、可访问性和运行时错误，人工核对视觉层级。发布使用 source tar + Paramiko + 原子 symlink，SQLite 留在共享路径。

**Tech Stack:** React/CSS/SVG/Motion、Playwright、现有 Image2 参考图、Node 审计脚本、Paramiko/systemd/nginx。

---

## Task 1 (I1)：修复并版本化 Image2 页面合同

**Files:**

- Modify: `docs/design/image2/README.md`
- Modify: `docs/architecture/image2-ui-reference-loop.md`
- Create: `docs/design/image2/image2-route-contract.json`
- Modify: `scripts/audit-image2-reference.mjs`
- Create: `scripts/image2-route-contract.test.mjs`
- Modify: `package.json`

- [ ] 先运行 `pnpm audit:image2-reference` 记录现有 13 项失败；失败来自已删除 gap 文档、旧 spec/旧路由时，修改审计而非恢复废弃文档。
- [ ] route contract 为每页定义 `id/route/role/reference/viewports/regions/requiredSelectors`：login、student-home、teacher-workbench、course-graph、N02 self-study、teacher-session、student-follow、projector、Pixi formal test。
- [ ] 六张 V4 权威参考：login、capability graph、learning、teacher、student follow、pixi；学生首页/教师工作台/投屏建立 V5 衍生参考，但必须复用同一 token/构图语言。
- [ ] 如果生成 V5 参考，文件固定放 `docs/design/image2/`，生成前先写清页面信息架构，选定后更新 README/contract；不得把未经选择的探索图混入发布合同。
- [ ] contract 测试验证每个 route/reference/selector/viewport 存在且无重复；reference 图片必须可读取。
- [ ] 更新 `audit:image2-reference` 只引用当前设计规格、README、route contract 和真实路由。
- [ ] 运行 contract test 与 `pnpm audit:image2-reference`，预期 0 failure。

## Task 2 (I2)：建立实现截图与几何/可访问性门禁

**Files:**

- Create: `scripts/capture-image2-implementation.mjs`
- Create: `scripts/audit-image2-layout.mjs`
- Create: `scripts/audit-image2-layout.test.mjs`
- Modify: `scripts/run-web-runtime-audits.mjs`
- Modify: `package.json`

- [ ] 先写失败测试：给定故意溢出/小控件/重叠 fixture，审计必须报告横纵溢出、`<44px` 交互、`<12px` 正文、中心对象遮挡和 console error。
- [ ] capture 脚本以真实 Cookie 登录，按 route contract 在 1440×900、1920×1080 抓全页/关键 region；等待字体、网络和受控动效稳定。
- [ ] 本地输出 `output/playwright/image2-local/<id>-<viewport>.png`；远端输出 `output/playwright/image2-remote/<release-id>/<id>-<viewport>.png`，报告 JSON 不含 Cookie/账号口令。
- [ ] 自动门禁：页面横纵意外溢出≤2px、主控≥44px、可见文字≥12px、焦点可见、中心主对象无遮挡、console/page error=0。
- [ ] 运行 axe 等价语义检查或自有检查：landmark、heading 顺序、button name、form label、SVG text alternative、键盘路径、200% zoom。
- [ ] 加入 `prefers-reduced-motion` context，断言持续信号动画停止但状态/交互仍可用。
- [ ] package 增加 `capture:image2`、`audit:image2-layout`，最终纳入 `qa:gates`。

## Task 3 (I3)：统一 token、登录、学生首页与教师工作台

**Files:**

- Modify: `apps/web/src/app/digital-textbook-v4.css`
- Modify: `apps/web/src/app/auth.css`
- Modify: `apps/web/src/app/role-home-v5.css`
- Modify: `apps/web/src/features/auth/login-page.tsx`
- Modify: `apps/web/src/features/home/student-home.tsx`
- Modify: `apps/web/src/features/workbench/teacher-workbench.tsx`
- Modify: `apps/web/src/ui/foundation/icons.tsx`
- Reference: `docs/design/image2/dgbook-image2-login-dark-v4.png`

- [ ] 保留权威 token：背景 `#03111e`；surface `#071b2f/#0a243b/#0d2d48`；current `#2dd4d0`；achieved `#39c98b`；认证 `#efc75e`；风险 `#e9a33d`；错误 `#ef6672`；信息 `#4b9df5`。
- [ ] 固定 68px 顶栏、44px 最小控件、正文默认 16px/绝对最小 12px、圆角 6px/上限 8px；禁止新增紫色、随机光球和通用英文后台卡片。
- [ ] 登录 1920 几何：左网络/塔台场景 64–69%，右表单 31–36%；账号快捷选择不抢主提交按钮层级。
- [ ] 学生首页：12 列 Bento，当前学习对象最大；四问在首屏；恰有一个青色 primary CTA；课堂进行中仅改变主行动，不弹窗强跳。
- [ ] 教师工作台：当前课程/最近位置/继续授课为主层级；开始新课选择器在同页；待批阅/薄弱点/图谱为次层级；所有数字明确 3 人班。
- [ ] 使用 `Icon` 中真实 SVG，不用 Unicode/emoji；每个图标有 aria-hidden 或可访问名称。
- [ ] 分别运行两视口截图与 DOM 几何断言，人工并排核对层级、留白、CTA 和信号关系。

## Task 4 (I4)：能力图谱 Image2 精修

**Files:**

- Modify: `apps/web/src/app/capability-map.css`
- Modify: `apps/web/src/features/capability-map/semantic-course-graph.tsx`
- Modify: `apps/web/src/features/capability-map/semantic-graph-elements.tsx`
- Modify: `apps/web/src/features/capability-map/capability-edge.tsx`
- Modify: `apps/web/src/features/capability-map/graph-minimap.tsx`
- Modify: `apps/web/src/features/capability-map/graph-geometry.test.ts`
- Reference: `docs/design/image2/dgbook-image2-capability-graph-dark-v4.png`

- [ ] 1920 几何：左 rail 90–110px、右详情 300–350px，其余为真实图谱画布；当前节点位于视觉中心附近。
- [ ] 每条边连接 source/target node boundary，箭头不悬空；label 使用避让结果，不压节点/线/相邻 label。
- [ ] 图谱局部高亮用青色，达成绿色，review/risk 黄色，fault 红色；其他节点降低对比而非全屏霓虹。
- [ ] P1 三任务、12 节点、3 产出、成果包链路清楚；不出现 PLC 梯形图或无业务意义连线。
- [ ] 键盘可以依次选择 node，详情 panel 标题随焦点更新；缩放/平移/迷你图不吞浏览器快捷键。
- [ ] 运行 geometry/unit/route contract、两视口截图和 200% zoom。

## Task 5 (I5)：自学教材与讲解轨 Image2 精修

**Files:**

- Modify: `apps/web/src/app/textbook-scene.css`
- Modify: `apps/web/src/app/digital-textbook-v4.css`
- Modify: `apps/web/src/features/textbook-scene/self-study-renderer.tsx`
- Modify: `apps/web/src/features/textbook-scene/annotated-equipment-figure.tsx`
- Modify: `apps/web/src/features/playback/web-playback-dock.tsx`
- Reference: `docs/design/image2/dgbook-image2-learning-dark-v4.png`

- [ ] 1920 几何：学习路径 rail 200–240px；正文阅读列保持舒适行长；可选术语/证据抽屉 330–380px；讲解轨 104px 且不覆盖正文。
- [ ] “问题/看图/步骤/纠偏/练习/产出”是清晰章节导航；中心优先显示当前设备证据与推理，不压缩成长标题列表。
- [ ] 正文阅读 surface 保证长文对比度；工程舞台承载深色设备关系；玻璃/光效不得覆盖字和热点标签。
- [ ] 图片 hotspot、证据引线、legend 端点完全相接，label 避让；无动画时仍能读懂。
- [ ] TTS/讲师关闭时不留空白遮罩，正文与全部交互保持；讲解按钮可键盘控制并有播放状态。
- [ ] 逐步清除 `textbook-scene.css` 旧浅色规则泄漏，但不做一次性 92KB CSS 重写；每改一页以 route contract 截图保护。

## Task 6 (I6)：教师、学生跟随、投屏与 Pixi 精修

**Files:**

- Modify: `apps/web/src/app/classroom.css`
- Modify: `apps/web/src/app/digital-classroom-v4.css`
- Modify: `apps/web/src/features/classroom/teacher-console-client.tsx`
- Modify: `apps/web/src/features/classroom/teacher-console-view.tsx`
- Modify: `apps/web/src/features/classroom/student-follow-client.tsx`
- Modify: `apps/web/src/features/classroom/projector-client.tsx`
- Modify: `apps/web/src/features/classroom/student-formal-test-workspace.tsx`
- Modify: `apps/web/src/features/learning/edugame-practice-panel.tsx`
- Reference: `docs/design/image2/dgbook-image2-teacher-dark-v4.png`
- Reference: `docs/design/image2/dgbook-image2-student-follow-dark-v4.png`
- Reference: `docs/design/image2/dgbook-image2-pixi-dark-v4.png`

- [ ] 教师 1920：左 lesson rail 170–200px、中心共享场景、右 inspector 330–380px、底部控制 68–84px；控制成功/Helper 离线语义准确。
- [ ] 学生跟随：左位置 rail 160–190px、中心当前讲授对象、右活动 330–390px、底部 follow/self 控制 90–110px；完整自学返回入口常驻但不抢课堂任务。
- [ ] 投屏只显示共享焦点、课堂位置、计时和匿名聚合；不包含姓名、studentId、答案、教师私有脚本/复核面板。
- [ ] Pixi 正式测试主交互区≥70%，右工单 21–25%；工具、对象、反馈、得分语义对齐参考；错误反馈不遮挡下一步操作。
- [ ] 三端同一课堂 revision 的中心场景一致，角色差异来自裁剪而不是不同 fixture。
- [ ] 两视口/键盘/reduced-motion/离线 SSE 截图审计全部通过。

## Task 7 (I7)：每阶段本地门禁、原子发布与远端证据

**Files:**

- Modify: `scripts/release-web-source.mjs`
- Modify: `scripts/deploy-web-source-paramiko.py`（具体持久化/回滚实现由 foundation Task F6 完成）
- Modify: `scripts/audit-web-remote.mjs`
- Create: `scripts/audit-p1-three-terminal-consistency.mjs`
- Create: `docs/acceptance/p1-five-person-usability.md`
- Modify: `package.json`

- [ ] 每阶段先运行定向测试，再依次运行：

```powershell
pnpm qa:gates
pnpm qa:web:runtime
pnpm deploy:web:source
```

- [ ] 生成显式 release ID：`s<stage>-<slug>-<UTC timestamp>`；即使仓库尚无 commit，脚本也不得调用失败的 `git rev-parse` 回退。
- [ ] 发布进程只从当前会话临时环境读取 host/user/password/public URL；不得将敏感值放进命令记录、计划、dotenv、PowerShell history 或报告。
- [ ] 用 Paramiko 上传 source release；远端顺序必须为：校验 sha→备份 SQLite→解压/安装→迁移/seed/verify→build→保存 old current→切 symlink→restart→internal health→nginx test/reload。
- [ ] 健康失败自动恢复 old current、重启 service；数据库只做兼容 expand-first migration，不自动破坏性降级。
- [ ] 发布后验证：

```powershell
curl.exe -fsS http://8.153.206.97/api/build-info
pnpm audit:web:remote -- --base-url http://8.153.206.97/ --out output/playwright/image2-remote/<release-id>
pnpm audit:image2-layout -- --base-url http://8.153.206.97/ --out output/playwright/image2-remote/<release-id>
node scripts/audit-p1-three-terminal-consistency.mjs --base-url http://8.153.206.97/
```

- [ ] 预期 build-info releaseId/sha 一致，`dgbook-web` active，学生/教师/投屏/图谱同版本字段一致，截图覆盖全部 route contract。
- [ ] 冒烟会写学习事实时必须在 `finally` 运行受保护 demo reset；reset 后重新验证 1 教师/3 学生。
- [ ] 每阶段保存 release ID、测试摘要、远端报告、无敏感信息截图和上一 release ID；通过后才能进入下一阶段。

## Task 8 (I8)：五人体验与最终完成验收

**Files:**

- Modify: `docs/acceptance/p1-five-person-usability.md`
- Create: `docs/acceptance/p1-final-release-checklist.md`

- [ ] 招募 5 名不了解 5G 与能力图谱的受试者，以匿名 T01–T05 记录，不记录真实身份。
- [ ] 任务一：从学生登录开始，30 秒内找到正确学习入口；至少 4/5 通过。
- [ ] 任务二：关闭教师讲解和语音，完整阅读 N02 后说明位置/身份/方向各需要什么证据、回答什么问题、为何不能互相替代；至少 4/5 通过。
- [ ] 记录耗时、错误入口、卡点、复述结果；失败项回到对应页面修复并重测，不以解释代替 UI 修复。
- [ ] 最终执行 `pnpm qa:demo-live`、SQLite integrity、systemd active、两视口截图、200% zoom、reduced-motion、键盘与四端一致性。
- [ ] `p1-final-release-checklist.md` 记录最终 release ID、公开 URL、测试版本、通过项和已明确非目标；不得记录 SSH 密码、Cookie 或数据库内容。

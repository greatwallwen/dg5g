# DGBook P1 最终发布验收清单

## P0 Phase1 真实性闭环（2026-07-16，当前轮次）

本节是当前 `codex/p0-task8` 的增量验收记录；下方 `p1-final-20260715t224419z` 内容仅保留为上一轮历史证据，不能替代本轮验证。任何未执行项继续保持 `PENDING/BLOCKED`，不得沿用旧轮次的 `PASS`。

| 门禁 | 当前状态 | 本轮证据 |
|---|---|---|
| Phase1 专用机器门禁 | PASS | `pnpm audit:p0-phase1-truth-closure`：10/10 断言通过；聚焦真实性契约 50/50 通过 |
| 门禁脚本自身回归 | PASS | `node --test scripts/audit-p0-phase1-truth-closure.test.mjs`：6/6 通过，包含 fail-closed 与 Windows 子进程回归 |
| 成果详情动态路由 | PASS | `/student/projects/p1/portfolio/[taskId]` 存在；只接受 `taskId`，学生身份由登录 actor 派生 |
| Web 全量 unit/type/structure/build | PENDING | 等待本轮完整执行并记录新鲜输出 |
| 440×900、1920×1080 浏览器旅程 | PENDING | 尚未生成本轮专属截图、console/page error 与横向溢出证据 |
| `qa:gates` | BLOCKED | 既有审计已报告 CSS 字号、capability-map authoring SVG 与 accepted media 闭包问题；本轮必须复跑确认，不得放宽规则 |
| accepted media 40-file exact closure | BLOCKED | Task8 工作树未执行受保护媒体恢复；禁止手工改写、格式化或绕过 SHA 校验 |
| source archive、部署与 GitHub 推送 | PENDING | 本任务未打包、未部署、未推送；仅在所有本地门禁和受保护资产闭包通过后执行 |

Phase1 专用门禁覆盖：匿名四页、固定通用练习文案为零、P01 六类真实活动、正式测试 answer-only、三名学生真实性、N04 十字段/逐字段证据/V1-V2、演示来源与冻结分数身份、四维诊断、actor-owned 成果详情，以及当前 assessment 与历史演示数据隔离。

状态说明：`PASS` 表示已有本次发布证据；`PENDING` 表示尚未执行或尚未取得证据。任何 `PENDING` 都不允许改写为最终通过。

## 发布身份

| 字段 | 当前值 |
|---|---|
| Release ID | `p1-final-20260715t224419z` |
| Source SHA-256 | `6fdc0726527dd9e5d2944aae2cef6e7affd46cc5ef0e91cc40eeac6b21109477` |
| 公开地址 | `http://8.153.206.97/` |
| 最终证据根 | `output/playwright/p1-final/p1-final-20260715t224419z/` |
| 本地最终门禁证据 | `output/playwright/web-local-mrmnyzk4/` |
| Source archive | `artifacts/web-source-release-history/p1-final-20260715t224419z/dgbook-web-source.tar.gz` |
| Upload manifest | `artifacts/web-source-release-history/p1-final-20260715t224419z/dgbook-web-source.upload-manifest.json` |
| 当前总状态 | `PASSED` |

## 已完成验收

### 1. 本地发布门禁 - PASS

- [x] Node `20.20.2`、pnpm `9.15.0`。
- [x] `pnpm install --frozen-lockfile`。
- [x] Web 单测 `482/482`，失败 `0`。
- [x] Web typecheck、structure、legacy runtime closure、textbook boundary 全部通过。
- [x] 部署契约：Node `28/28`、Python `8/8`（Paramiko deploy `6/6` + helper `2/2`）。
- [x] `pnpm qa:gates`、production build、source package audit 全部通过。
- [x] 本地媒体闭包 `40/40`，总字节 `12,627,129`，失败 `0`。
- [x] 本地 Image2 `120/120`，失败 `0`。
- [x] 本地 P1 journey、课堂跨上下文、自学闭环和三端一致性全部通过。

机器证据：

- `output/playwright/web-local-mrmnyzk4/web-media-runtime/report.json`
- `output/playwright/web-local-mrmnyzk4/image2-layout/report.json`
- `output/playwright/web-local-mrmnyzk4/p1-complete-journey/report.json`
- `output/playwright/web-local-mrmnyzk4/p1-three-terminal-consistency/report.json`
- `output/playwright/web-local-mrmnyzk4/class-session-cross-context/report.json`
- `output/playwright/web-local-mrmnyzk4/self-study-closure/self-study-closure-report.json`

### 2. Source archive 与部署 - PASS

- [x] Upload manifest 的 SHA 与 source archive 一致。
- [x] Upload manifest 固定 584 个文件、40 个运行媒体文件。
- [x] 发布包不含 SQLite、WAL/SHM、凭据、`.env*`、`node_modules`、`.next` 或 legacy runtime。
- [x] 已通过 Paramiko 原子部署 `p1-final-20260715t224419z`。
- [x] 公开 build-info 的 release ID 与 source SHA 和本清单一致。
- [x] 部署后学生首页、教师工作台与课程入口可访问。

### 3. 公开课堂协议 - PASS

证据：`output/playwright/p1-final/p1-final-20260715t224419z/live-classroom-protocol-final/report.json`

- [x] 匿名访问返回 `401`。
- [x] `teacher01`、`student01`、`student02`、`student03` 登录均返回 `200`。
- [x] 演示班级精确包含 `stu-01`、`stu-02`、`stu-03` 三名学生。
- [x] 当前课堂节点为 `P1T1-N02`。
- [x] 教师、三名学生读取相同课堂 revision。

### 4. 公开运行时 - PASS

证据：`output/playwright/p1-final/p1-final-20260715t224419z/web-runtime/report.json`

- [x] 27 项检查中 `26` 项通过、公开只读环境的 `isolated mutation` 按设计跳过 `1` 项，失败 `0`。
- [x] 学生、教师、投屏、能力图谱读取同一 authoritative snapshot version。
- [x] 投屏不泄露学生姓名、学号、答案、反馈或个人产出信息。
- [x] 学生首页、教师工作台、P1 项目、三个 N02、课堂、投屏、能力图谱和成果包可访问。
- [x] 锁定节点 URL 绕过被拒绝；P2+ 只显示后续开放。
- [x] P01、P02、P03 与十二个 P1 节点完整呈现。
- [x] 三个 N02 为不同的完整自学内容；三个 N04 为专业产出入口。
- [x] 节点测试最高分、任务综合分、项目综合分口径区分。

### 5. P1 完整旅程 - PASS

证据：`output/playwright/p1-final/p1-final-20260715t224419z/p1-complete-journey/report.json`

- [x] 教师从工作台进入 P1T1-N02 授课页。
- [x] 三名学生加入课堂。
- [x] 跟随模式随教师切页，自学模式不被强制跳页。
- [x] 学生退出并重新加入后，个人自学 cursor 未被覆盖。
- [x] P01、P02、P03 三份专业产出已提交并由教师认证。
- [x] 最终成果包包含三份任务产出并显示完成。
- [x] 能力图谱包含 P03 并反映项目完成结果。
- [x] 浏览器错误 `0`，journey failure `0`。

### 6. 最终三端一致性 - PASS

证据：`output/playwright/p1-final/p1-final-20260715t224419z/p1-three-terminal-consistency/report.json`

- [x] 最终 canonical 检查为 6 项通过、失败 `0`、console error `0`。
- [x] 学生、教师、投屏、图谱的 snapshot version、课堂 revision、人数、提交数和达标数一致。
- [x] Journey 写入后，各端仍读取同一 SQLite 权威事实。

## 最终公开与基础设施验收

### 7. 远端 40 文件媒体审计 - PASS

证据：`output/playwright/p1-final/p1-final-20260715t224419z/web-media-runtime/report.json`

- [x] `expectedFiles=40`。
- [x] `checks.length=40`、`failures=[]`、`passed=true`。
- [x] 每个 URL 的 status、bytes、SHA、content-type 和 cache-control 均通过。

### 8. 远端 Image2 审计 - PASS

证据：`output/playwright/p1-final/p1-final-20260715t224419z/image2-layout/report.json`

- [x] `matrix.jobs=120`。
- [x] `captures=120`、`screenshots=120`、`failures=0`。
- [x] console/page error、横向溢出、主操作、键盘和 reduced-motion 全部通过。

### 9. 远端服务与 SQLite 基础设施 - PASS

通过已固定主机密钥的 strict Paramiko 会话执行，只保存脱敏结果到：

`output/playwright/p1-final/p1-final-20260715t224419z/remote-infrastructure.json`

- [x] `dgbook-web` 为 `active`。
- [x] `current` 精确指向 `p1-final-20260715t224419z`。
- [x] `previous` 为受管的 `s3-classroom-unified-snapshot-fix1-20260715T190407Z`，与 current 不同，且 release ID/source SHA 已记录。
- [x] build-info 精确等于本清单 release ID 和 source SHA。
- [x] `/var/lib/dgbook/dgbook.sqlite` 的 `integrity_check=ok`、`foreign_key_check=[]`、权限 `0600`、schema version `8`。
- [x] `/var/lib/dgbook/backups/dgbook-p1-final-20260715t224419z.sqlite` 存在、非空、权限 `0600`、完整性通过。
- [x] 已记录迁移前后 schema version、users、learning events、professional outputs 计数，before/after 均为 `8 / 4 / 17 / 4`。
- [x] 最终种子用户精确为一名教师和三名学生；当前 demo 数据为 users `4`、learning events `16`、professional outputs `3`。
- [x] 重复 seed 未覆盖既有学习事件或专业产出。
- [x] retired manifest 为只读 `0400`，发布事务未永久删除历史 release。

### 10. 入口可用性自动代理 - PASS

证据：`output/playwright/p1-final/p1-final-20260715t224419z/entry-usability-proxy.json`

- [x] 学生登录提交后 `275ms` 出现唯一“继续学习”入口，低于 `30s`；首页同时显示“我正在学什么、为什么学、下一步做什么、做到什么算完成”。
- [x] 主入口精确进入 `/learn/P1T1-N02`。
- [x] 教师登录提交后 `271ms` 出现继续授课入口，一次点击进入 `/teacher/sessions/demo-class`，页面当前位置精确为 `P1T1-N02`。
- [x] 两个浏览器上下文 console/page error 均为 `0`。

说明：这是稳定可复跑的浏览器自动代理，不冒充真实非专业观察者访谈；如需形成研究性可用性结论，可另补真人观察记录，但不阻塞当前样张工程验收。

### 11. 旧证据可逆隔离 - PASS

- [x] 先生成 sealed manifest，再按同一 manifest 移入 `D:/Claude/dgbook-quarantine/task12-post-release-20260715t2323z/`。
- [x] 密封 manifest SHA-256 为 `0148889d59b11588ad27b341db83354da6f2fdba078483a60a4eb3cb0b67cf5b`。
- [x] 已隔离 9 个显式候选，共 911 个文件、`367,427,424` 字节。
- [x] current、previous、本次 final evidence、source archive、SQLite、备份和接受媒体证据全部排除。
- [x] 外部 write-once apply receipt 与 sidecar 已生成；文件 SHA-256 为 `90f324720dea05bd056c1addcd2568571498d4d99d216c9b5d77a249724edbd9`，内部 receipt seal 为 `2734be3ed8883747d0260e4498808766132718c11706f91dd0cac679cf6791c6`。
- [x] Receipt 逐项记录源路径、目标路径、文件数、字节数、tree SHA、移动模式及显式恢复命令。
- [x] 未永久删除任何候选。

### 12. Git 元数据可逆隔离 - PASS

密封计划已按完整 inventory 执行：

| 字段 | 值 |
|---|---|
| Manifest | `D:/Claude/dgbook-quarantine/task12-root-git-20260715t224234z/sealed-manifest.json` |
| Manifest SHA-256 | `5d88865d623ffaa1c308142936366abacde823ae68d6f648fe7e93276eb551c2` |
| Plan seal | `f9be0c222a1f4834a786dc05e7f81e9faa71f96ba5aba9c9a2896a83f0f23cb4` |
| Inventory | 2,086 files；264 directories；0 reparse；539,007,231 bytes |

只有第 7 至 11 节全部通过后才能执行：

```powershell
node scripts/quarantine-root-git.mjs --apply --manifest D:/Claude/dgbook-quarantine/task12-root-git-20260715t224234z/sealed-manifest.json
```

- [x] Apply 前重新验证 manifest seal 与完整 inventory，未发现漂移。
- [x] `.git/` 已通过同卷目录重命名移入唯一 `root-git.payload`，没有覆盖目标、复制残留或永久删除。
- [x] Apply receipt 与 sidecar 已生成并验证；receipt 文件 SHA-256 为 `4454cc461ca94d8655ef62ddab6963ff30831974f54584da77dc9609737d62fc`。
- [x] Receipt seal 为 `f1a32541c21d8df46d65e01a1162e9b3fd3f4e94f0efab25902f97b600c2219e`，绑定同一 manifest seal、inventory summary `586c74ac541d8921f9490cccf9ead59eee2721369c3b6caa8de675878e631532`、2,086 个文件、`539,007,231` 字节和显式 restore 命令。
- [x] 隔离 session ACL 已关闭继承，仅当前用户、SYSTEM 与 Administrators 拥有 FullControl；payload 继承同一受限 ACL。
- [x] Git 隔离后未再执行任何 Git 命令。

## 最终判定

- [x] 本地门禁、source package、部署、protocol、remote runtime、P1 journey、最终一致性通过。
- [x] 远端媒体 40/40 通过。
- [x] 远端 Image2 120/120 通过。
- [x] 远端服务、current/previous、SQLite 与备份证据通过。
- [x] 学生 30 秒入口与教师两次点击以内的自动浏览器代理通过；未冒充真人观察。
- [x] 旧证据隔离 receipt 完成。
- [x] Git 隔离 receipt 完成。

最终结论：`PASSED`。产品 P0/P1 为 `0`；本清单中的工程收口项全部有密封 manifest、外部 payload、write-once receipt 与恢复命令。

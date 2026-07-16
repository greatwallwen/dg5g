# DGBook P1 内容、专业产出与产品界面实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 P1 建成从 P01、P02、P03 到三份专业产出和《5G网络信息采集成果包》的完整样例，并把 P1T1-N02 做成无需教师/语音也能独立理解的深度教材标杆。

**Architecture:** P1 内容由 importer 生成受 schema 约束的单一 JSON，Web 通过类型化 adapter 消费；同一节点内容分别由完整自学 renderer 和聚焦课堂 renderer 呈现。结构化专业产出写 SQLite，项目/图谱/UI 只消费权威投影。现有 MDX、动画、Manim、EduGame 资产通过稳定 ID 复用。

**Tech Stack:** Python importer、JSON Schema、TypeScript/React、Next.js、现有 EduGame/animation/XYFlow、SQLite service、Playwright。

---

## Task 1 (C1)：生成可复现的 P1 三任务内容合同

**Files:**

- Create: `schemas/p1-demo-content/v1.schema.json`
- Create: `scripts/import_5g/p1_demo_content.py`
- Modify: `scripts/import-5g-docx.py`
- Generate: `textbook/5g/generated/p1-demo-content.json`
- Create: `apps/web/src/features/platform/p1-content.ts`
- Create: `apps/web/src/features/platform/p1-content.test.ts`
- Modify: `apps/web/src/features/platform/deep-textbook-demo-data.ts`
- Modify: `apps/web/src/platform/fixtures/base-fixtures.ts`
- Modify: `apps/web/src/platform/fixtures/curriculum-graph-fixtures.ts`
- Modify: `apps/web/next.config.mjs` (仅由主代理合并 tracing include)

- [ ] 写失败测试：任务严格为 P01/P02/P03，每任务 4 节点，共 12 个唯一节点；runtime ID 映射 P1T1/P1T2/P1T3，不接受 `P1-T1` 等第二套 ID。
- [ ] 写失败测试：三个 N04 均配置 task-pixi、专业产出、教师认证；三个 N02 配置 node-test；跨任务依赖与状态子计划一致。
- [ ] 写失败测试：每任务定义 `why/taskOutputTitle/prerequisiteTaskId`，P1 定义最终产出《5G网络信息采集成果包》。
- [ ] 运行 `node --test apps/web/src/features/platform/p1-content.test.ts`，确认因为 loader/schema 不存在失败。
- [ ] 定义生成接口：

```ts
export interface P1DemoContent {
  schema: 'dgbook.p1-demo-content/v1';
  project: { id: 'P1'; title: string; finalOutput: '5G网络信息采集成果包' };
  tasks: [P1TaskContent, P1TaskContent, P1TaskContent];
}

export interface P1TaskContent {
  taskId: 'P01' | 'P02' | 'P03';
  runtimeTaskId: 'P1T1' | 'P1T2' | 'P1T3';
  title: string;
  why: string;
  prerequisiteTaskId?: 'P01' | 'P02';
  taskOutputTitle: string;
  nodes: [P1NodeContent, P1NodeContent, P1NodeContent, P1NodeContent];
}
```

- [ ] `p1_demo_content.py` 从现有 lesson AST/storyboard/媒体清单组合内容，并显式补充 Demo 教学结构；`import-5g-docx.py` 在同一次可复现导入中写 JSON。
- [ ] 运行 `pnpm import:5g`；预期 MDX/widget/lesson AST 与 `p1-demo-content.json` 均重新生成且 UTF-8/schema 合法。
- [ ] `p1-content.ts` 在服务端加载生成 JSON并做运行时最小校验；缺字段立即报构建错误，不静默回 fixture。
- [ ] 将旧 P01/P02 限定 union 扩展为 P01/P02/P03；删除 P1T3 到 P1T1 的 fallback。
- [ ] 运行内容单测、`pnpm validate`、`pnpm web:typecheck`。

## Task 2 (C2)：P1 项目页、三任务链和项目状态

**Files:**

- Create: `apps/web/src/app/student/projects/p1/page.tsx`
- Create: `apps/web/src/features/projects/p1-project-view.tsx`
- Create: `apps/web/src/features/projects/p1-project-model.ts`
- Create: `apps/web/src/features/projects/p1-project-model.test.ts`
- Create: `apps/web/src/features/projects/p1-task-card.tsx`
- Modify: `apps/web/src/features/home/student-home.tsx`
- Modify: `apps/web/src/app/role-home-v5.css`

- [ ] 写失败模型测试：页面按 P01→P02→P03 展示明确前后关系、任务产出、进入动作、状态和阻塞原因。
- [ ] 写失败测试：P01 产出提交 + Pixi 达标解锁 P02；P02 同理解锁 P03；退回上游后下游不重新锁死但显示项目 blocker。
- [ ] 写失败测试：三份 N04 产出未全部认证时项目不能为 completed；可预览已有成果包。
- [ ] page 先 `requireClassRole('student')`，通过 student home 的“查看其他任务”或 P1 卡进入。
- [ ] `P1ProjectModel` 只组合生成内容与 `readLearningSnapshot`，组件不得重算状态/综合分。
- [ ] UI 使用 Image2 工程链路：三个任务为有真实连接端点的水平/竖向流程，当前青色、完成绿色、风险黄色；不要用装饰性随机线。
- [ ] 1440×900 首屏显示当前任务、下一动作与最终成果包状态；完整任务详情可向下滚动。
- [ ] 运行模型测试、typecheck、build 与键盘导航检查。

## Task 3 (C3)：把 P03 已有资产正确接入 Web

**Files:**

- Modify: `apps/web/src/features/platform/p1-content.ts`
- Modify: `apps/web/src/platform/fixtures/skill-game-fixtures.ts`
- Modify: `apps/web/src/platform/fixtures/capability-fixtures.ts`
- Modify: `apps/web/src/features/textbook-scene/learning-scene.tsx`
- Modify: `apps/web/src/features/textbook-scene/challenge-scene.tsx`
- Modify: `apps/web/src/platform/public-media.ts`
- Reuse: `textbook/5g/projects/P03-complaint-information-collection.mdx`
- Reuse: `textbook/5g/generated/lesson-ast/P03.json`
- Reuse: `textbook/5g/widgets/P03-lesson-animation-001.json`
- Reuse: `textbook/5g/widgets/P03-edugame-interactive-001.json`
- Reuse: P03 media declared by the generated manifests

- [ ] 写失败测试：P1T3-N01..N04 可解析到各自内容/活动，不再返回 P01 unit；P03 challenge 使用 P03 widget ID。
- [ ] 写失败测试：所有 P03 媒体 URL 经过 `public-media.ts` 并能被 Next standalone trace/copy；不存在时构建失败而非显示空壳。
- [ ] 用 adapter 把 P03 lesson AST 的投诉事实、复现条件、交叉证据、工单闭环映射到 4 节点。
- [ ] 复用现有 P03 animation/Manim/EduGame；禁止复制或另造名字相近但脱离 importer 的假资产。
- [ ] 增加 P03 game config 的知识点、正式 attempt 与 N04 task-pixi 标记；分数进入统一 service。
- [ ] 运行 P03 单测、`pnpm audit:edugame-runtime`、build；运行时逐页进入 P1T3-N01..N04。

## Task 4 (C4)：补齐除 N02 外的十一节点最低教材规格

**Files:**

- Modify: `scripts/import_5g/p1_demo_content.py`
- Generate: `textbook/5g/generated/p1-demo-content.json`
- Create: `apps/web/src/features/platform/p1-content-quality.test.ts`
- Modify: `apps/web/src/features/textbook-scene/learning-scene.tsx`
- Modify: `apps/web/src/features/textbook-scene/micro-practice.tsx`

- [ ] 写失败数据质量测试：每个普通节点至少 1 连续案例、3–5 术语、1 带标注关系图、3–4 推理步、1 正例、1 反例、1 可重试练习、针对反馈、1 结构化节点产出。
- [ ] 明确十二节点主题，保持任务链：P01 室内对象/设备/链路/证据表；P02 站点边界/参数/场景/覆盖表；P03 投诉事实/复现/交叉定位/调查单。
- [ ] 只改 importer 内容源，重新运行 `pnpm import:5g`，不可直接修生成 JSON。
- [ ] 通用 learning scene 渲染上述字段；内容不足时显示开发错误，不用三条短句填充。
- [ ] 微练习结果只追加 `micro-practice` 事实，不能伪造正式成绩。
- [ ] 运行内容质量测试和 12 节点 Playwright smoke。

## Task 5 (C5)：P1T1-N02 深度教材标杆

**Files:**

- Modify: `scripts/import_5g/p1_demo_content.py`
- Generate: `textbook/5g/generated/p1-demo-content.json`
- Create: `apps/web/src/features/textbook-scene/self-study-content.ts`
- Create: `apps/web/src/features/textbook-scene/self-study-content.test.ts`
- Create: `apps/web/src/features/textbook-scene/self-study-renderer.tsx`
- Create: `apps/web/src/features/textbook-scene/annotated-equipment-figure.tsx`
- Modify: `apps/web/src/features/textbook-scene/learning-scene.tsx`
- Modify: `apps/web/src/features/textbook-scene/p01-n02-lesson-stage.tsx`
- Reuse: `apps/web/public/media/5g/p01-n02-topology-stage-v1.png`
- Reference: `docs/design/image2/dgbook-image2-learning-dark-v4.png`

- [ ] 定义并测试完整 `SelfStudyContent`：caseBackground、taskQuestion、prerequisites、glossary、annotatedFigures、evidenceRules、reasoningSteps、completeExamples、counterexamples、foundation/application/transfer practices、correctionPaths、transferTask、outputTemplate、rubric。
- [ ] 基数失败测试：六段导航；恰有位置/身份/连接方向三类核心证据；至少 2 正例、2 反例；三层练习每层非空；每个错误代码都有反馈与改正路径。
- [ ] 证据语义必须可复述：位置回答“在哪里”（机房/机柜/柜号/槽位）；身份回答“是谁”（铭牌/型号/序列/网元标识）；方向回答“从哪里到哪里”（两端端口标签/连续走线/上下游对象）。
- [ ] 两个完整正例必须逐步从观察→证据→排除歧义→结论；两个反例分别展示亮灯/模糊照片、单端端口/断裂走线为什么不足。
- [ ] `self-study-renderer` 将六段作为黏性目录和连续正文，不是六个单句幻灯片；术语可展开/键盘操作，任意前后阅读。
- [ ] `AnnotatedEquipmentFigure` 在真实图上建立可聚焦 hotspot、编号、图例和文本替代，端点/引线不遮挡设备标签。
- [ ] 关闭教师讲解/音频后，正文、示例、练习、反馈、产出模板仍完整可用；播报轨不得遮住正文。
- [ ] 运行内容测试、typecheck/build；用无音频 Playwright 完成证据理解题。

## Task 6 (C6)：一个内容定义、两个 renderer、两个游标

**Depends on:** state Task S4 的 `SelfStudyCursor/ClassroomCursor`。

**Files:**

- Create: `apps/web/src/features/textbook-scene/classroom-follow-renderer.tsx`
- Create: `apps/web/src/features/textbook-scene/classroom-content-projection.ts`
- Create: `apps/web/src/features/textbook-scene/classroom-content-projection.test.ts`
- Modify: `apps/web/src/features/textbook-scene/textbook-scene-shell.tsx`
- Modify: `apps/web/src/features/textbook-scene/shared-classroom-scene.tsx`
- Modify: `apps/web/src/features/classroom/student-follow-client.tsx`
- Modify: `apps/web/src/features/classroom/teacher-console-client.tsx`
- Modify: `apps/web/src/features/classroom/classroom-skill-handoff.tsx`

- [ ] 写失败测试：`projectFollowPage(content, classroomCursor)` 只输出当前课堂单元、位置、教师任务、活动和完整自学链接，不输出完整教材数组。
- [ ] 写失败跨游标测试：教师从 unit 2 推到 3，follow 学生显示 3；self 学生保持个人 section，只看到课堂更新提示。
- [ ] 自学 route 渲染 `SelfStudyRenderer`；课堂 route 渲染 `ClassroomFollowRenderer`，二者共享 `P1NodeContent`，不复制文案。
- [ ] 学生显式点“一键回到教师当前页”才从 self 切 follow；“课后返回完整自学内容”恢复 self cursor。
- [ ] 教师课堂 UI 只允许发布已存在的 classroom unit，不允许客户端任意注入教材 HTML。
- [ ] 运行 projection 单测、class-session cross-context 和双浏览器 Playwright。

## Task 7 (C7)：分层练习、错误反馈、正式测试边界

**Files:**

- Create: `apps/web/src/features/learning/practice-engine.ts`
- Create: `apps/web/src/features/learning/practice-engine.test.ts`
- Modify: `apps/web/src/features/textbook-scene/micro-practice.tsx`
- Modify: `apps/web/src/features/learning/edugame-practice-panel.tsx`
- Modify: `apps/web/src/features/classroom/student-formal-test-workspace.tsx`
- Modify: `apps/web/src/platform/fixtures/skill-game-fixtures.ts`

- [ ] 写失败测试：foundation/application/transfer 题目按 errorCode 返回理由、证据缺口、改正步骤和重试建议；重试不会覆盖历史 attempt。
- [ ] 写失败测试：N02 正式游戏写 `assessmentRole=node-test`；N04 正式游戏写 `task-pixi`；practice mode 永远不进入正式分。
- [ ] 练习 UI 即时反馈但不泄漏未作答题答案；错误后提供明确改正路径与同目标变式题。
- [ ] 迁移任务要求学生对新机柜图重新提交位置/身份/方向证据，不只是选择题。
- [ ] Pixi/正式测试界面对齐 `dgbook-image2-pixi-dark-v4.png`：主专业操作区至少 70%，右侧工单 21–25%，反馈不遮挡操作。
- [ ] 运行 practice/score 单测与正式测试 runtime audit。

## Task 8 (C8)：三个 N04 结构化专业产出和教师复核

**Files:**

- Create: `apps/web/src/features/portfolio/output-schema.ts`
- Create: `apps/web/src/features/portfolio/output-schema.test.ts`
- Create: `apps/web/src/features/portfolio/professional-output-form.tsx`
- Create: `apps/web/src/features/portfolio/output-fieldsets.tsx`
- Create: `apps/web/src/features/review/output-review-panel.tsx`
- Modify: `apps/web/src/features/textbook-scene/challenge-scene.tsx`
- Modify: `apps/web/src/features/classroom/teacher-console-view.tsx`
- Modify: `apps/web/src/app/api/teacher/reviews/route.ts`

- [ ] 为 P01 定义《室内设备与链路证据表》字段：位置、身份、两端端口、连接方向、照片索引、风险说明。
- [ ] 为 P02 定义《室外站点与覆盖采集表》字段：站点/扇区、方位角、下倾角、挂高、遮挡、热点、验证路线。
- [ ] 为 P03 定义《投诉信息调查单》字段：时间、地点、业务、终端、频次、小区/KPI/日志、问题边界、复核建议。
- [ ] 写失败校验测试：三类表缺少核心证据返回字段级错误；unknown 字段拒绝；草稿可不完整，submit 必须完整。
- [ ] N02 节点记录可被 P01 N04 通过 artifactId/version 引用，不复制第二份事实。
- [ ] 教师 review panel 从 workbench 待批阅进入，按量规维度打分、反馈并执行 return/verify；只处理 N04 任务产出。
- [ ] return 保留旧版本并允许新 revision；verify 冻结当前任务正式分；任何动作都不改正式测试 attempt。
- [ ] 运行 output schema、learning service、teacher review 权限测试。

## Task 9 (C9)：P1 成果包页面与闭环状态

**Files:**

- Create: `apps/web/src/app/student/projects/p1/portfolio/page.tsx`
- Create: `apps/web/src/features/portfolio/p1-portfolio-model.ts`
- Create: `apps/web/src/features/portfolio/p1-portfolio-model.test.ts`
- Create: `apps/web/src/features/portfolio/p1-portfolio-view.tsx`
- Modify: `apps/web/src/features/projects/p1-project-view.tsx`

- [ ] 定义 `P1PortfolioViewModel`：status、三个 task item、版本、证据索引、风险、教师评语、task scores、projectCompositeScore。
- [ ] 写失败测试：任一 N04 未认证不能显示完成；三份认证后为 completed；上游退回时显示 blocker；未齐数据不虚构综合分。
- [ ] 成果包可在进行中预览，清楚区分草稿/待复核/退回/认证；最终页显示项目级成果而不只是三个链接。
- [ ] 页面提供从项目到任务、节点、证据的可回查关系；不要在 Demo 中实现 PDF 导出审批流。
- [ ] 运行模型单测和 P01→P02→P03→三认证→成果包 Playwright journey。

## Task 10 (C10)：权威状态驱动的完整能力图谱

**Files:**

- Modify: `apps/web/src/platform/models.ts`（由主代理合并类型）
- Modify: `apps/web/src/platform/fixtures/curriculum-graph-fixtures.ts`
- Modify: `apps/web/src/features/capability-map/semantic-course-graph.tsx`
- Modify: `apps/web/src/features/capability-map/semantic-graph-elements.tsx`
- Modify: `apps/web/src/features/capability-map/graph-geometry.ts`
- Modify: `apps/web/src/features/capability-map/graph-geometry.test.ts`
- Modify: `apps/web/src/app/capability-map.css`
- Reference: `docs/design/image2/dgbook-image2-capability-graph-dark-v4.png`
- Reference: `docs/design/image2/dgbook-image2-closed-loop-reference.svg`

- [ ] 写失败测试：图谱含 P01/P02/P03、12 节点、3 任务产出和 1 项目成果；P1T3-N01 可学习时 route 可进入。
- [ ] 写失败测试：每条 semantic edge 的 source/target 存在，几何端点落真实节点边界，label box 不与节点/相邻 label 相交。
- [ ] 写失败测试：只显示权威中文状态；不得出现“已点亮”、无上下文“成绩”或把 100 分显示成教师认证。
- [ ] Graph loader 使用统一 snapshot；学生看本人状态，教师看 3 人聚合；刷新时 snapshot version 与其他端一致。
- [ ] 保持暗色工程世界、左路径 rail、中心图、右详情；青色 current、绿色 achieved、黄色 review/risk、红色 fault。
- [ ] 运行 graph geometry test、`pnpm audit:capability-map`、1440/1920 截图验收。

## Task 11 (C11)：P1 用户旅程自动化

**Files:**

- Create: `scripts/audit-p1-demo-journey.mjs`
- Modify: `scripts/run-web-runtime-audits.mjs`
- Modify: `scripts/check-web-structure.mjs`
- Modify: `package.json`

- [ ] 脚本以真实 3 学生/1 教师 Cookie 走：student home→P1→12 节点门禁→三任务解锁→三 N04 产出→教师退回/修订/认证→成果包完成。
- [ ] 额外断言 N02 无语音正文可读、P03 不回退、micro score 不进入正式分、正式 100 不等于认证。
- [ ] 审计结束在 `finally` 调用受保护 demo reset，失败时也不污染后续演示。
- [ ] package 增加 `audit:p1-demo-journey`，纳入最终 `qa:gates` 但阶段开发可定向运行。
- [ ] 运行 `pnpm import:5g && pnpm web:test:unit && pnpm web:typecheck && pnpm web:build && pnpm audit:p1-demo-journey`，预期全部退出 0。

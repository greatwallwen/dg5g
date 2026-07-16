# 生成与发布输出契约

## 目标

所有教材生成工具都必须输出可追踪、可验证、可发布的产物。禁止生成器直接写入不明结构的自由 JSON，也禁止产品运行时在已验证闭包之外猜测或回退加载产物。

## 逻辑输出目录

生成能力的通用逻辑结构是：

```text
build/
  ast/
  assets/
  media/
  reports/
  publish/
```

当前 5G 教材使用 `config/textbooks/5g/textbook.manifest.json` 将该逻辑结构映射到两类可审计输出：

- 教材生成数据写入 `textbook/5g/`，其中 P1 产品运行内容位于 `textbook/5g/generated/`。
- 导入器和作者工具产生的媒体写入 `site/public/media/`。该路径是作者源，不是产品运行根。

DOCX 导入链路已落地旁路 AST 输出 `textbook/<book-id>/generated/lesson-ast/Pxx.json`。该文件遵循 `dgbook.lesson-ast/v1`，作为后续 `knowledge-atoms -> storyboard-beats -> visual-script` 的稳定输入。

## 生成产物清单

| 产物 | 逻辑文件 | 说明 |
|---|---|---|
| 教材 AST | `ast/lesson-ast.json` | 权威源导入后的标准语义树 |
| 知识点 | `ast/knowledge-atoms.json` | 可教学最小单元 |
| 分镜 | `ast/storyboard-beats.json` | 视觉与播报脚本 |
| 动画资产 | `assets/animation/*.json` | 符合 animation schema |
| 播报资产 | `assets/narration/*.json` | 符合 narration schema |
| 图形资产 | `assets/graphics/*.json` | 符合 graphics schema |
| 音频媒体 | `media/tts/*` | 带文本 hash 和 manifest 的候选发布音频 |
| 视频媒体 | `media/video/*` | 可选预渲染视频 |
| 诊断报告 | `reports/diagnostics.json` | 统一 diagnostics |
| 发布描述 | `publish/release-manifest.json` | 待组装内容、媒体与校验结果，不直接代表产品页面 |

## 产品运行契约

`apps/web/` 是唯一产品运行时。教材生成输出进入产品前，必须满足以下分层契约：

| 层级 | 当前路径 | 权威契约 |
|---|---|---|
| 教材源 | `content/5g/5g.docx` | 内容修改的起点；需通过可复现导入器生成下游产物 |
| 生成内容 | `textbook/5g/generated/` 及 manifest 指定的其他 `textbook/5g/` 输出 | schema、引用、任务和节点契约通过后可由 Web 运行时消费 |
| 作者媒体源 | `site/public/media/` | 导入器或生成器输出；不允许产品运行时直读或 fallback |
| 验收媒体闭包 | `apps/web/public/media/` | 必须与已接受 manifest 的相对路径、数量、字节和 SHA-256 精确一致 |
| 状态权威 | `apps/web/.data/dgbook-demo.sqlite` | 学生、教师、投屏和图谱共享；不用浏览器状态覆盖 |
| 产品运行时 | `apps/web/` | Next.js 路由、授权、快照、媒体适配和五类产品界面 |

### 媒体切换契约

媒体从作者源进入产品需经过独立的验收事务：

1. 从显式白名单生成候选清单，禁止递归全目录默认纳入。
2. 在独立 staging 中比较相对路径、文件数、字节和 SHA-256，拒绝绝对路径、`..`、大小写歧义、符号链接、junction 和 reparse point。
3. 全部验证通过后原子切换到 `apps/web/public/media/`，并在切换后重做同一闭包校验。
4. `artifacts/media-cutover/<release-id>/` 保留 manifest、SHA sidecar 和 journal，`artifacts/media-cutover/current.json` 只指向已验收的 postverified 版本。
5. 运行时 resolver 只读取 `apps/web/public/media/`；缺失、hash 不符或越界时关闭失败，不转向 `site/public/media/`。

### 源码发布契约

`pnpm deploy:web:source` 生成的发布三件套位于 `artifacts/web-source-release/`：

- `dgbook-web-source.tar.gz`：可在服务器构建的源码包；
- `dgbook-web-source.tar.gz.sha256`：源码包完整性校验；
- `dgbook-web-source.upload-manifest.json`：发布标识、文件统计、媒体闭包和上传契约。

发布包必须包含 `apps/web/` 产品运行时、必需共享包、生成教材内容和与已接受 manifest 精确一致的 `apps/web/public/media/`。作者媒体源和未验收的 staging、rollback、quarantine 目录不得进入发布包。

## Manifest

```json
{
  "schema": "dgbook.publish-manifest/v1",
  "lessonId": "stm32-gpio-mini",
  "version": "0.1.0",
  "createdAt": "2026-05-21T00:00:00Z",
  "assets": [
    {
      "id": "gpio-current-flow",
      "kind": "animation",
      "path": "assets/animation/gpio-current-flow.json",
      "sourceId": "ch1-sec1-demo"
    }
  ],
  "diagnostics": "reports/diagnostics.json"
}
```

## Diagnostics

```json
{
  "level": "error",
  "code": "speech-audio-missing",
  "message": "speech 缺少发布音频",
  "targetId": "s1",
  "sourceId": "ch1-sec1-demo",
  "blocking": true
}
```

## 发布阻断条件

- schema 校验失败或 `source-id` 缺失。
- 生成内容引用的任务、节点、widget、动画或媒体不存在。
- 动画元素越界、裁切或关键重叠。
- speech 缺 `spokenText`、`caption`、真实 `audioUrl` 或匹配的文本 hash。
- 视频轨道引用缺失。
- 任意插件输出未知 schema。
- `apps/web/public/media/` 与已接受媒体 manifest 的路径、数量、字节或 SHA-256 不一致。
- Web 运行时或发布包引用 `site/public/media/` 作为运行资产。
- 发布包包含不允许的第二套运行时、媒体 staging、rollback 或 quarantine 目录。

## 命名

- 文件名：kebab-case。
- schema id：`dgbook.<domain>.<name>/v1`。
- 资产 id：稳定、可读、与 `source-id` 关联。
- 媒体切换和发布证据：使用唯一 `release-id`，不覆盖已验收证据。

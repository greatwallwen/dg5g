# OpenMAIC 动画播放对标与补足方案

## 范围

本分析基于本地 `OpenMAIC/` 参考项目和 DGBook 当前代码。对标目标不是复刻编辑器，而是吸收其“动作驱动课堂舞台”：

`Scene.actions[] -> ActionEngine -> StageState -> Canvas / Overlay / ElementRenderer`

DGBook 的发布形态保持 `animation-slide`，站点首屏直接播放。

## 差距总览

| 维度 | OpenMAIC 能力 | DGBook 现状 | 补足方向 |
|---|---|---|---|
| 渲染管线 | ScreenCanvas、ScreenElement、Overlay 分层 | 已有 TeachingStage 和元素渲染 | 补齐 renderer capability 和 DOM 测量 |
| 动作模型 | `Scene.actions[]` 是播放主接口 | actions 与 timeline cues 并存 | 建立统一 action cursor 和 cue clock |
| 状态管理 | 视觉动作写入 CanvasStore | widget runtime 局部状态 | 引入轻量 StageStateStore |
| 重点讲解 | spotlight、laser、highlight、zoomTarget | 已有重点框和 laser 基础 | 保持重点框直到下一重点或 speech 结束 |
| 转场 | 以动作改变画布状态 | 已有 page + sceneTransition | 把每个知识点拆为多页顺序播放 |
| 媒体 | video placeholder、图片处理、TTS cache | 基础可用 | 补齐视频轨道、字幕同步和图像缩放规则 |
| 生成链路 | 内容生成后再生成 actions | 仍有模板化和定制页 | 统一 KnowledgeAtom -> VisualScript |
| 审核 | 内容、动作、TTS 串联 | 旧审核工具已移除 | 用站点真实播放 + 自动截图审计替代 |

## 补足方案

### 1. Stage Runtime

```ts
export interface StageRuntimeState {
  mode: 'idle' | 'playing' | 'paused' | 'ended';
  actionIndex: number;
  cueTimeMs: number;
  activeTargets: string[];
  overlays: StageOverlayEffect[];
  camera?: StageCameraState;
  caption?: string;
}
```

集成路径：

- `packages/animation` 定义 runtime state 和 action executor。
- `packages/widgets` 订阅状态，渲染舞台、overlay、caption。
- `PlaybackBar` 只发送 play、pause、seek、speed、stop。

### 2. Action 与 Cue 对齐

```ts
export interface ActionCueBinding {
  actionId: string;
  cueIds: string[];
  startPolicy: 'after-previous' | 'with-speech' | 'absolute';
  blocking: boolean;
}
```

规则：

- speech 是主时钟。
- spotlight、laser、highlight 是非阻塞视觉动作。
- video、widget ack 是阻塞动作。
- sceneTransition 只绑定知识点 page boundary。

### 3. 多页知识点动画

```ts
export interface StagePage {
  id: string;
  phase: number;
  title: string;
  startMs: number;
  durationMs: number;
  transition?: 'sweep' | 'wipe' | 'fade' | 'zoom';
}
```

生成约束：

- 每页只展示一个核心知识点。
- 文字不跨页堆叠，旧页元素必须 exit 或 dim。
- 表格和照片采用幻灯片式分页展示，禁止靠缩放“塞进去”。
- 非实物照片重画为图形，实物照片缩小为三宫格或四宫格。

### 4. Renderer Capability Registry

```ts
export interface StageRendererCapability {
  type: string;
  render: 'dom' | 'svg' | 'canvas' | 'video';
  supportsAnimation: boolean;
  supportsMeasurement: boolean;
}
```

优先补齐：

- image clip / filter / object-fit
- shape gradient / pattern
- line marker / curve / flow
- table slide reveal
- chart count-up / threshold line
- code / latex / video placeholder

## 超越机会

- 更友好的教材 DSL：直接表达知识点、讲解、图形、互动和发布要求。
- 生成前布局求解：先分区和分页，再放元素，减少事后修补。
- 自动审计闭环：schema、布局、截图、播放、TTS 全部变成发布门禁。
- 显示文本与播报文本分离：画面显示 `3-2`，TTS 播报 `3 减去 2`。
- 多产物一致：同一 SSOT 生成 HTML、PDF、视频和互动页。

## 当前执行方向

1. 移除旧审核工具，站点真实播放成为验收界面。
2. 首屏显示教学舞台，正文和补充资料排在舞台之后。
3. 继续强化 OpenMAIC 式重点讲解、转场、动作状态和 renderer 能力。
4. 用自动截图审计替代人工 JSON 审核。

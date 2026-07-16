# EduGame 素材规范

## 目录

素材统一放在 `packages/edugame-assets/`：

- `icons/`：设备、网络、参数、风险图标。
- `cards/`：术语卡、故障卡、技能卡。
- `ui/`：按钮、HUD、进度、结算面板。
- `backgrounds/`：实验台、网络拓扑、轻科幻背景。
- `particles/`：成功、错误、连击、奖励反馈。
- `audio/`：点击、成功、错误、连击音效。
- `animations/`：后续 Rive 或 spritesheet。
- `licenses/`：授权说明。

## 命名

采用 kebab-case 或下划线资产 id，格式：

```text
type_domain_object_state_v001.ext
```

示例：

```text
icon_communication_gnb_normal_v001.svg
card_communication_kpi_front_v001.webp
bg_network_lab_dark_v001.webp
sfx_combo_success_v001.mp3
```

## 元数据

每个素材必须进入 `asset-manifest.json`：

```json
{
  "asset_id": "icon_communication_gnb_normal_v001",
  "type": "icon",
  "domain": "communication",
  "object": "gNB",
  "format": "svg",
  "license": "internal",
  "tags": ["5g", "network"],
  "allowed_usage": ["textbook", "game"]
}
```

## 授权

- 优先使用自研、内部授权、CC0 或明确可商用素材。
- 禁止使用来源不明素材。
- 第三方素材必须记录来源、license 和允许用途。

## 视觉风格

- 推荐：轻科幻、工程感、高对比、少文字、强反馈、清晰 HUD。
- 避免：低龄卡通、页游杂乱、过度拟物、表情包、无意义装饰。

## 外部素材引入策略

当前运行时优先使用程序化 fallback 素材，正式素材进入仓库前必须经过 manifest 登记。允许评估的来源：

- Kenney：适合游戏 UI、音效和轻量图形素材；仅使用明确 CC0 条目的资源。
- Tabler Icons：适合专业线性图标；按 MIT 许可记录来源。
- game-icons.net：图标量大，但多为 CC BY 3.0；若使用必须保留署名信息。
- 自研 SVG：5G 设备、KPI、信令、证据链图标优先自绘，保证教材专业风格一致。

不得直接把网上下载的 PNG/SVG 放入模板代码。正确流程是：

1. 放入 `packages/edugame-assets/` 对应分类目录。
2. 在 `asset-manifest.json` 补充 `asset_id`、`source`、`license`、`tags`、`allowed_usage`。
3. 通过 `findAsset()` 或配置里的 `asset_id` 引用。
4. 审计通过后再接入页面。

## 游戏素材设计基线

- 图标表达对象，不替代教学判断；例如 UE、gNB、GPS、KPI、LOG、AAU 要能一眼区分。
- 卡牌只放短标签和图形，解释文字进入反馈和复盘。
- HUD 必须保留得分、连击、倒计时、关卡目标和全屏入口。
- 成功反馈用发光、粒子、连线点亮；错误反馈用轻震动、红色边框和知识点解释。
- 同一页同类游戏最多使用一套主色，避免元素挤在一起造成视觉噪声。

PixiJS 运行时只消费 `asset-manifest.json` 中登记过的素材；模板不得私自硬编码未登记图标、背景、音效或动画。

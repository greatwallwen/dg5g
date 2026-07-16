# DGBook 文档索引

文档只保留当前产品口径、可复用工程经验和长期有效的技术契约。运行日志、阶段报告、过期计划和截图审计结果不进入文档树。

## 当前产品口径

- `requirements/p1-digital-textbook-demo.md`：P1 数字教材完整样例的唯一需求基线。
- `experience/p1-digital-textbook-lessons.md`：从历次迭代提炼出的产品与工程经验。
- `design/image2/README.md`：当前 Image2 视觉参考及其使用边界。

## 长期技术契约

- `architecture/overview.md`：教材生成工具链总览。
- `architecture/dsl-schema.md`：教材 DSL 与单一事实源规则。
- `architecture/pipeline.md`：流水线与插件机制。
- `architecture/output-contracts.md`：输出目录、manifest、diagnostics 与发布门禁。
- `architecture/openmaic-gap-analysis.md`：OpenMAIC 播放机制对标。
- `architecture/knowledge-animation-template.md`：知识点动画模板约束。
- `architecture/asset-schemas/`：动画、播报、文字、图形、视频资产说明。
- `deployment/`：可复用部署说明。

## 维护规则

- 新决策直接更新当前需求文档，不新增日期型计划副本。
- 审计结果写入被忽略的 `output/`，完成后可直接清理。
- 经验只有在可跨迭代复用时才进入 `experience/`。
- 文档、目录、模板使用 kebab-case；TypeScript 组件使用 PascalCase。

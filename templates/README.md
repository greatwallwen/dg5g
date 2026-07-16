# Templates

本目录保存教材生产链路可复用模板。文件名统一使用 kebab-case。

## 当前模板

| 路径 | 用途 |
|---|---|
| `lesson/minimal-lesson.yaml` | 最小教材 DSL 模板 |

## 使用约定

- 模板只放源格式，不放生成产物。
- 模板应能通过 `pnpm validate:architecture` 的轻量契约检查。
- 教材 DSL 模板可用 `node scripts/dgbook.mjs validate-dsl` 做基础字段检查。
- 大型示例放入 `docs/architecture/examples/` 或未来的 `examples/`。

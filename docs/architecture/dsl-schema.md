# 教材 DSL 规范

## 文件形式

推荐使用 YAML，文件名使用 kebab-case，例如 `stm32-gpio-basics.yaml`。同一 schema 也允许 JSON 表达。

## 顶层结构

```yaml
schema: dgbook.lesson/v1
id: stm32-gpio-basics
title: STM32 GPIO 入门
version: 0.1.0
authors:
  - name: DGBook Team
license: private
audience:
  level: beginner
  prerequisites: ["C 语言基础", "单片机基本概念"]
defaults:
  locale: zh-CN
  presenter: teacher-01
  voice: qwen-cherry
chapters: []
assets: []
```

## JSON Schema 草案

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "dgbook.lesson.v1",
  "type": "object",
  "required": ["schema", "id", "title", "version", "chapters"],
  "properties": {
    "schema": { "const": "dgbook.lesson/v1" },
    "id": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]*$" },
    "title": { "type": "string", "minLength": 1 },
    "version": { "type": "string" },
    "authors": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name"],
        "properties": {
          "name": { "type": "string" },
          "email": { "type": "string" }
        }
      }
    },
    "license": { "type": "string" },
    "audience": {
      "type": "object",
      "properties": {
        "level": { "enum": ["beginner", "intermediate", "advanced"] },
        "prerequisites": { "type": "array", "items": { "type": "string" } }
      }
    },
    "defaults": {
      "type": "object",
      "properties": {
        "locale": { "type": "string" },
        "presenter": { "type": "string" },
        "voice": { "type": "string" }
      }
    },
    "chapters": {
      "type": "array",
      "items": { "$ref": "#/$defs/chapter" }
    },
    "assets": {
      "type": "array",
      "items": { "$ref": "#/$defs/assetRef" }
    }
  },
  "$defs": {
    "chapter": {
      "type": "object",
      "required": ["id", "title", "sections"],
      "properties": {
        "id": { "type": "string" },
        "title": { "type": "string" },
        "sections": {
          "type": "array",
          "items": { "$ref": "#/$defs/section" }
        }
      }
    },
    "section": {
      "type": "object",
      "required": ["id", "title", "blocks"],
      "properties": {
        "id": { "type": "string" },
        "title": { "type": "string" },
        "blocks": {
          "type": "array",
          "items": { "$ref": "#/$defs/block" }
        }
      }
    },
    "block": {
      "type": "object",
      "required": ["type", "id"],
      "properties": {
        "id": { "type": "string" },
        "type": {
          "enum": ["explain", "example", "exercise", "animation-demo", "quiz"]
        },
        "title": { "type": "string" },
        "body": { "type": "string" },
        "animation": { "type": "string" },
        "narration": { "type": "string" },
        "quiz": { "type": "object" }
      }
    },
    "assetRef": {
      "type": "object",
      "required": ["id", "kind", "src"],
      "properties": {
        "id": { "type": "string" },
        "kind": { "enum": ["image", "video", "audio", "table", "code", "dataset"] },
        "src": { "type": "string" },
        "license": { "type": "string" }
      }
    }
  }
}
```

## 内容块约定

| 类型 | 用途 | 必填字段 |
|---|---|---|
| `explain` | 普通讲解 | `id`、`body` |
| `example` | 示例 | `id`、`body` |
| `exercise` | 练习 | `id`、`body` |
| `animation-demo` | 动画演示 | `id`、`animation`、`narration` |
| `quiz` | 互动测验 | `id`、`quiz` |

## SSOT 规则

- 页面正文、动画标题、TTS 文本都必须能回溯到 block。
- 生成器可以补全视觉结构，但不能把补全文本作为源事实。
- 若显示文本与播报文本不同，必须在 narration schema 中显式声明。
- 外部 DOCX/PDF 只作为导入源，导入后以 DSL 为准。

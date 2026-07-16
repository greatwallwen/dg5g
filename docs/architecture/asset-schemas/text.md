# Text Schema

## YAML Schema

```yaml
schema: dgbook.asset.text/v1
id: string
title: string
blocks:
  - id: string
    kind: heading | paragraph | callout | formula | code | table
    level: number
    content: string
    richText:
      - text: string
        marks: [bold, italic, code]
    latex: string
```

## JSON Schema 草案

```json
{
  "$id": "dgbook.asset.text.v1",
  "type": "object",
  "required": ["schema", "id", "title", "blocks"],
  "properties": {
    "schema": { "const": "dgbook.asset.text/v1" },
    "id": { "type": "string" },
    "title": { "type": "string" },
    "blocks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "kind"],
        "properties": {
          "id": { "type": "string" },
          "kind": {
            "enum": ["heading", "paragraph", "callout", "formula", "code", "table"]
          },
          "level": { "type": "number" },
          "content": { "type": "string" },
          "richText": { "type": "array", "items": { "type": "object" } },
          "latex": { "type": "string" }
        }
      }
    }
  }
}
```

## 最小示例

```yaml
schema: dgbook.asset.text/v1
id: gpio-text
title: GPIO 输出与 LED
blocks:
  - id: h1
    kind: heading
    level: 1
    content: LED 为什么会亮
  - id: p1
    kind: paragraph
    content: GPIO 输出高电平后，限流电阻和 LED 构成电流路径。
  - id: f1
    kind: formula
    latex: "I=(Vgpio-Vf)/R"
```

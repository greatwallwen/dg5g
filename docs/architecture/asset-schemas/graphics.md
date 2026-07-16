# Graphics Schema

## YAML Schema

```yaml
schema: dgbook.asset.graphics/v1
id: string
coordinate:
  width: number
  height: number
  unit: px
styles:
  primary: string
  accent: string
  text: string
objects:
  - id: string
    type: path | rect | circle | icon | image | group
    box: { x: number, y: number, w: number, h: number }
    style:
      fill: string
      stroke: string
      strokeWidth: number
    data: object
```

## JSON Schema 草案

```json
{
  "$id": "dgbook.asset.graphics.v1",
  "type": "object",
  "required": ["schema", "id", "coordinate", "objects"],
  "properties": {
    "schema": { "const": "dgbook.asset.graphics/v1" },
    "id": { "type": "string" },
    "coordinate": {
      "type": "object",
      "required": ["width", "height"],
      "properties": {
        "width": { "type": "number" },
        "height": { "type": "number" },
        "unit": { "const": "px" }
      }
    },
    "styles": { "type": "object" },
    "objects": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "type", "box"],
        "properties": {
          "id": { "type": "string" },
          "type": { "type": "string" },
          "box": { "type": "object" },
          "style": { "type": "object" },
          "data": { "type": "object" }
        }
      }
    }
  }
}
```

## 最小示例

```yaml
schema: dgbook.asset.graphics/v1
id: gpio-circuit
coordinate: { width: 1000, height: 562, unit: px }
styles:
  primary: "#0f766e"
  accent: "#f59e0b"
  text: "#0f172a"
objects:
  - id: led
    type: icon
    box: { x: 450, y: 240, w: 80, h: 80 }
    style: { fill: "#fff7ed", stroke: "#f59e0b", strokeWidth: 2 }
    data: { icon: led }
```

# Animation Schema

## YAML Schema

```yaml
schema: dgbook.asset.animation/v1
id: string
stage:
  width: 1000
  height: 562
  aspectRatio: "16:9"
pages:
  - id: string
    title: string
    startMs: number
    durationMs: number
layers:
  - id: string
    role: background | content | overlay | caption
elements:
  - id: string
    type: text | shape | line | image | video | chart | table | latex | code
    layer: string
    page: string
    box: { x: number, y: number, w: number, h: number }
timeline:
  durationMs: number
  cues:
    - id: string
      atMs: number
      durationMs: number
      effect: enter | exit | draw | flow | packetMove | cameraZoom | cameraPan | spotlight | laser | captionUpdate | sceneTransition
      targets: [string]
      easing: linear | easeIn | easeOut | easeInOut | spring
      payload: object
```

## JSON Schema 草案

```json
{
  "$id": "dgbook.asset.animation.v1",
  "type": "object",
  "required": ["schema", "id", "stage", "elements", "timeline"],
  "properties": {
    "schema": { "const": "dgbook.asset.animation/v1" },
    "id": { "type": "string" },
    "stage": {
      "type": "object",
      "required": ["width", "height"],
      "properties": {
        "width": { "type": "number" },
        "height": { "type": "number" },
        "aspectRatio": { "type": "string" }
      }
    },
    "pages": { "type": "array", "items": { "type": "object" } },
    "layers": { "type": "array", "items": { "type": "object" } },
    "elements": { "type": "array", "items": { "type": "object" } },
    "timeline": {
      "type": "object",
      "required": ["durationMs", "cues"],
      "properties": {
        "durationMs": { "type": "number" },
        "cues": { "type": "array", "items": { "type": "object" } }
      }
    }
  }
}
```

## 最小示例

```yaml
schema: dgbook.asset.animation/v1
id: gpio-current-flow
stage: { width: 1000, height: 562, aspectRatio: "16:9" }
pages:
  - { id: p1, title: 电流路径, startMs: 0, durationMs: 8000 }
layers:
  - { id: base, role: background }
  - { id: main, role: content }
elements:
  - id: led
    type: shape
    layer: main
    page: p1
    box: { x: 430, y: 210, w: 120, h: 80 }
timeline:
  durationMs: 8000
  cues:
    - id: c1
      atMs: 500
      durationMs: 800
      effect: enter
      targets: [led]
      easing: easeOut
      payload: {}
```

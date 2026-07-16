# Video Schema

## YAML Schema

```yaml
schema: dgbook.asset.video/v1
id: string
durationMs: number
canvas:
  width: number
  height: number
tracks:
  - id: string
    kind: visual | audio | subtitle
    clips:
      - id: string
        src: string
        startMs: number
        durationMs: number
        transition:
          in: fade | wipe | none
          out: fade | wipe | none
subtitles:
  - startMs: number
    endMs: number
    text: string
```

## JSON Schema 草案

```json
{
  "$id": "dgbook.asset.video.v1",
  "type": "object",
  "required": ["schema", "id", "durationMs", "canvas", "tracks"],
  "properties": {
    "schema": { "const": "dgbook.asset.video/v1" },
    "id": { "type": "string" },
    "durationMs": { "type": "number" },
    "canvas": {
      "type": "object",
      "required": ["width", "height"],
      "properties": {
        "width": { "type": "number" },
        "height": { "type": "number" }
      }
    },
    "tracks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "kind", "clips"],
        "properties": {
          "id": { "type": "string" },
          "kind": { "enum": ["visual", "audio", "subtitle"] },
          "clips": { "type": "array", "items": { "type": "object" } }
        }
      }
    },
    "subtitles": { "type": "array", "items": { "type": "object" } }
  }
}
```

## 最小示例

```yaml
schema: dgbook.asset.video/v1
id: gpio-video
durationMs: 12000
canvas: { width: 1920, height: 1080 }
tracks:
  - id: visual-main
    kind: visual
    clips:
      - id: anim-1
        src: /media/animations/gpio-current.webm
        startMs: 0
        durationMs: 12000
        transition: { in: fade, out: none }
  - id: audio-main
    kind: audio
    clips:
      - id: tts-1
        src: /media/tts/qwen-gpio-s1.wav
        startMs: 0
        durationMs: 12000
subtitles:
  - { startMs: 0, endMs: 4000, text: "先看电流路径。" }
```

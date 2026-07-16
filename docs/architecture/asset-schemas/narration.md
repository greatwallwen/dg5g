# Narration / TTS Schema

## YAML Schema

```yaml
schema: dgbook.asset.narration/v1
id: string
locale: zh-CN
voice:
  provider: qwen-tts | local-tts | browser
  voiceId: string
  speed: number
segments:
  - id: string
    sourceBlock: string
    displayText: string
    spokenText: string
    caption: string
    emotion: neutral | warm | serious | excited
    pauses:
      - at: number
        ms: number
    audio:
      id: string
      url: string
```

## JSON Schema 草案

```json
{
  "$id": "dgbook.asset.narration.v1",
  "type": "object",
  "required": ["schema", "id", "locale", "voice", "segments"],
  "properties": {
    "schema": { "const": "dgbook.asset.narration/v1" },
    "id": { "type": "string" },
    "locale": { "type": "string" },
    "voice": {
      "type": "object",
      "required": ["provider", "voiceId"],
      "properties": {
        "provider": { "type": "string" },
        "voiceId": { "type": "string" },
        "speed": { "type": "number", "minimum": 0.5, "maximum": 2 }
      }
    },
    "segments": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "spokenText", "caption"],
        "properties": {
          "id": { "type": "string" },
          "sourceBlock": { "type": "string" },
          "displayText": { "type": "string" },
          "spokenText": { "type": "string" },
          "caption": { "type": "string" },
          "emotion": { "type": "string" },
          "pauses": { "type": "array", "items": { "type": "object" } },
          "audio": { "type": "object" }
        }
      }
    }
  }
}
```

## 最小示例

```yaml
schema: dgbook.asset.narration/v1
id: gpio-narration
locale: zh-CN
voice:
  provider: qwen-tts
  voiceId: Cherry
  speed: 1.0
segments:
  - id: s1
    sourceBlock: ch1-sec1-demo
    displayText: "3-2"
    spokenText: "3 减去 2"
    caption: "压差决定电流"
    emotion: warm
    pauses:
      - { at: 6, ms: 300 }
    audio:
      id: qwen-gpio-s1
      url: /media/tts/qwen-gpio-s1.wav
```

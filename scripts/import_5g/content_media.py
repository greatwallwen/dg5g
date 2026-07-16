"""Media classification and compact visual rendering for imported pages."""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from pathlib import Path

try:
    from PIL import Image
except Exception:  # pragma: no cover - optional importer aid
    Image = None  # type: ignore[assignment]


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = ROOT / "site" / "public"

DIAGRAM_WORDS = (
    "流程", "结构", "拓扑", "示意", "架构", "框图", "模型", "曲线", "注册",
    "信令", "协议", "参数", "指标", "界面", "软件", "登录", "截图", "系统",
)
PHOTO_WORDS = (
    "照片", "实物", "现场", "机房", "机柜", "仪表", "仪器", "罗盘", "卷尺",
    "相机", "GPS", "天线", "车辆", "工器具", "坡度仪", "测距仪",
    "楼宇", "道路", "街道", "遮挡", "高架",
)


@dataclass
class MediaItem:
    url: str
    context: str
    caption: str = ""


def render_media_group(items: list[MediaItem]) -> list[str]:
    lines: list[str] = []
    photos: list[MediaItem] = []
    diagrams: list[MediaItem] = []

    def flush_photos() -> None:
        nonlocal photos
        if photos:
            lines.extend(render_photo_grid(photos))
            photos = []

    def flush_diagrams() -> None:
        nonlocal diagrams
        if not diagrams:
            return
        diagrams = select_representative_diagrams(diagrams)
        if len(diagrams) == 1:
            lines.extend(render_redrawn_diagram(diagrams[0]))
        else:
            lines.extend(render_diagram_deck(diagrams))
        diagrams = []

    for item in items:
        if is_real_photo(item):
            flush_diagrams()
            photos.append(item)
            continue
        flush_photos()
        diagrams.append(item)
    flush_diagrams()
    flush_photos()
    return lines


def render_photo_grid(items: list[MediaItem]) -> list[str]:
    count = min(4, max(1, len(items)))
    lines = [f'<div class="dg-media-grid dg-media-grid-{count}">']
    for item in items[:4]:
        label = short_caption(item)
        lines.append('  <figure class="dg-photo-card">')
        lines.append(f'    <img src="{item.url}" alt="{mdx_escape(label)}" loading="lazy" />')
        if label:
            lines.append(f"    <figcaption>{mdx_escape(label)}</figcaption>")
        lines.append("  </figure>")
    lines.append("</div>")
    return lines


def select_representative_diagrams(items: list[MediaItem]) -> list[MediaItem]:
    if len(items) <= 2:
        return items
    selected: list[MediaItem] = []
    seen: set[str] = set()
    for item in items:
        key = diagram_template(item)
        if key in seen:
            continue
        selected.append(item)
        seen.add(key)
        if len(selected) >= 3:
            break
    return selected or items[:1]


def render_diagram_deck(items: list[MediaItem]) -> list[str]:
    lines = [
        f'<section class="dg-visual-deck" data-slide-count="{len(items)}">',
        '  <div class="dg-visual-deck-head">',
        '    <strong>图解</strong>',
        "  </div>",
        '  <div class="dg-visual-track" tabindex="0" aria-label="图解">',
    ]
    for index, item in enumerate(items, start=1):
        lines.append(f'    <article class="dg-visual-slide" aria-label="图形 {index}">')
        lines.extend(f"      {line}" for line in render_redrawn_diagram(item))
        lines.append("    </article>")
    lines.extend(["  </div>", "</section>"])
    return lines


def render_redrawn_diagram(item: MediaItem) -> list[str]:
    label = short_caption(item) or "教材图示"
    template = diagram_template(item)
    labels = diagram_labels(template, item)
    lines = [f'<figure class="dg-redraw-diagram dg-redraw-kind-{template}" data-source="{mdx_escape(Path(item.url).name)}">']
    lines.append(f"  <figcaption>{mdx_escape(label)}</figcaption>")
    lines.append('  <div class="dg-redraw-canvas">')
    if template == "topology":
        lines.extend(render_topology(labels))
    elif template == "metric":
        lines.extend(render_metric(labels))
    else:
        lines.extend(render_flow(labels))
    lines.append("  </div>")
    lines.append("</figure>")
    return lines


def render_flow(labels: list[str]) -> list[str]:
    lines = ['    <div class="dg-redraw-flow">']
    for index, label in enumerate(labels):
        lines.append(f'      <span class="dg-redraw-node">{mdx_escape(label)}</span>')
        if index < len(labels) - 1:
            lines.append('      <span class="dg-redraw-arrow" aria-hidden="true"></span>')
    lines.append("    </div>")
    return lines


def render_topology(labels: list[str]) -> list[str]:
    return [
        '    <div class="dg-redraw-topology">',
        f'      <span class="dg-redraw-device">{mdx_escape(labels[0])}</span>',
        '      <span class="dg-redraw-link"></span>',
        f'      <span class="dg-redraw-tower">{mdx_escape(labels[1])}</span>',
        '      <span class="dg-redraw-link"></span>',
        f'      <span class="dg-redraw-cloud">{mdx_escape(labels[2])}</span>',
        f'      <span class="dg-redraw-chip">{mdx_escape(labels[3])}</span>',
        "    </div>",
    ]


def render_metric(labels: list[str]) -> list[str]:
    lines = ['    <div class="dg-redraw-metrics">']
    for label in labels:
        lines.append(f'      <span class="dg-redraw-meter"><b>{mdx_escape(label)}</b><i></i></span>')
    lines.append("    </div>")
    return lines


def is_real_photo(item: MediaItem) -> bool:
    if "/placeholders/" in item.url:
        return False
    text = f"{item.context} {item.caption}"
    if any(word in text for word in ("仿真软件", "界面", "截图", "流程图", "表格", "面板图", "消息", "信令窗口")):
        return False
    has_photo = any(word in text for word in PHOTO_WORDS)
    has_diagram = any(word in text for word in DIAGRAM_WORDS)
    if has_diagram and not has_photo:
        return False
    if has_photo and not any(word in text for word in ("流程", "结构", "拓扑", "界面", "截图")):
        return True
    suffix = Path(item.url).suffix.lower()
    photo_like = looks_photo_like(item.url)
    if suffix == ".png" and not photo_like:
        return False
    return suffix in {".jpg", ".jpeg"} and photo_like


def looks_photo_like(url: str) -> bool:
    if Image is None:
        return True
    path = PUBLIC_DIR / url.lstrip("/")
    try:
        with Image.open(path) as image:
            width, height = image.size
            if width / max(height, 1) > 2.4:
                return False
            colors = image.convert("RGB").resize((80, 80)).getcolors(maxcolors=6400) or []
            return len(colors) > 900
    except Exception:
        return False


def diagram_template(item: MediaItem) -> str:
    text = f"{item.context} {item.caption}"
    if any(word in text for word in ("RSRP", "SINR", "KPI", "指标", "dBm", "5QI")):
        return "metric"
    if any(word in text for word in ("网络", "组网", "拓扑", "架构", "BBU", "AAU", "CU", "DU", "核心网")):
        return "topology"
    return "flow"


def diagram_labels(template: str, item: MediaItem | None = None) -> list[str]:
    text = f"{item.context} {item.caption}" if item else ""
    if template == "metric":
        if any(word in text for word in ("速率", "MCS", "MIMO", "吞吐", "带宽")):
            return ["带宽", "MCS", "MIMO", "吞吐"]
        if any(word in text for word in ("切换", "A3", "邻区", "重选")):
            return ["测量", "门限", "判决", "执行"]
        if any(word in text for word in ("掉话", "时延", "语音", "VOLTE", "VoNR")):
            return ["时延", "丢包", "掉话", "质差"]
        return ["RSRP", "SINR", "5QI", "dBm"]
    if template == "topology":
        if any(word in text for word in ("网管", "告警", "性能", "日志")):
            return ["网管", "告警", "性能", "日志"]
        if any(word in text for word in ("注册", "信令", "切换", "会话")):
            return ["UE", "gNB", "AMF", "UPF"]
        return ["UE", "gNB", "5GC", "网管"]
    if any(word in text for word in ("流程", "登录", "查询", "配置", "归档", "提交")):
        return ["登录", "查询", "配置", "归档"]
    if any(word in text for word in ("优化", "复测", "问题", "验证")):
        return ["现象", "证据", "优化", "复测"]
    if any(word in text for word in ("采集", "测试", "DT", "CQT")):
        return ["规划", "采集", "分析", "输出"]
    return ["对象", "采集", "分析", "验证"]


def short_caption(item: MediaItem) -> str:
    label = normalize_space(item.caption or item.context)
    label = re.sub(r"^[图表]\s*[\d\-－—一二三四五六七八九十]+[：:、.\s]*", "", label)
    return compress_sentence(label, 28) or "教材图示"


def compress_sentence(text: str, limit: int = 46) -> str:
    text = normalize_space(re.sub(r"^\s*(?:\d+[\.)、]|[（(]?\d+[）)]|[一二三四五六七八九十]+[、.．])", "", text))
    text = text.strip("：:，,；;。")
    if not text or len(text) < 4:
        return ""
    return text if len(text) <= limit else text[: limit - 1].rstrip("，、；") + "…"


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", str(value)).strip()


def mdx_escape(value: str) -> str:
    escaped = html.escape(str(value), quote=True)
    escaped = escaped.replace("~", "～")
    escaped = escaped.replace("*", "×").replace("_", "＿")
    return escaped.replace("{", "&#123;").replace("}", "&#125;")

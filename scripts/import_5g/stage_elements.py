"""Reusable element builders for DGBook generated teaching stages."""

from __future__ import annotations

import html
import re
from typing import Any

from .stage_timeline import SEMANTIC_RELATIONS
from .visual_icons import ppt_icon

ARROW_RELATION_TYPES = set(SEMANTIC_RELATIONS)


def line_metadata(line: tuple[Any, ...], index: int, total: int) -> dict[str, str]:
    raw = line[3] if len(line) > 3 else None
    if isinstance(raw, dict):
        metadata = {str(key): str(value) for key, value in raw.items() if value is not None}
    elif raw:
        metadata = {"kind": str(raw)}
    else:
        metadata = {}
    if "kind" not in metadata and {"source", "target"}.issubset(metadata):
        metadata["kind"] = relation_for_line(index, total)
    return metadata


def relation_for_line(index: int, total: int) -> str:
    if total > 1 and index == total:
        return "feedback"
    return SEMANTIC_RELATIONS[(index - 1) % (len(SEMANTIC_RELATIONS) - 1)]


def normalize_relation(value: str | None) -> str | None:
    relation = str(value or "").strip()
    return relation if relation in ARROW_RELATION_TYPES else None


def line_effect_for_relation(relation: str) -> str:
    if relation == "data-flow":
        return "packetMove"
    if relation in {"process", "feedback"}:
        return "flow"
    return "draw"


def line_elements(project_id: str, lines: list[tuple[Any, ...]]) -> list[dict[str, Any]]:
    elements: list[dict[str, Any]] = []
    total = len(lines)
    for index, line in enumerate(lines, start=1):
        start, end, color = line[0], line[1], line[2]
        metadata = line_metadata(line, index, total)
        relation = normalize_relation(metadata.get("kind"))
        elements.append(ppt_line(
            f"{project_id}-line-{index}",
            start,
            end,
            color,
            animation_track("draw", 700 + min(index, 6) * 70, 650),
            relation_type=relation,
            source=metadata.get("source"),
            target=metadata.get("target"),
        ))
    return elements


def message_badges(project_id: str, labels: list[str], colors: list[str]) -> list[dict[str, Any]]:
    elements: list[dict[str, Any]] = []
    for index, label in enumerate(labels[:4], start=1):
        left = 150 + (index - 1) * 180
        top = 114
        color = colors[(index - 1) % len(colors)]
        elements.append(ppt_icon(f"{project_id}-msg-{index:02d}-icon", icon_for_label(label), left - 30, top - 1, 30, color, animation=animation_track("pulse", 780 + index * 70, 520, True)))
        elements.append(ppt_shape(f"{project_id}-msg-{index:02d}", left, top, 72, 28, "#ffffff", color, 14, 1, "diagram", animation_track("pulse", 820 + index * 70, 520, True)))
        elements.append(ppt_text(f"{project_id}-msg-{index:02d}-text", left + 8, top + 5, 56, 18, f'<p style="font-size:10px;font-weight:950;color:{color};text-align:center;">{html.escape(label)}</p>', 6, 1, role="diagram"))
    return elements


def compact_badges(project_id: str, labels: list[str], colors: list[str]) -> list[dict[str, Any]]:
    elements: list[dict[str, Any]] = []
    for index, label in enumerate(labels[:4], start=1):
        left = 164 + (index - 1) * 170
        color = colors[(index - 1) % len(colors)]
        elements.append(ppt_shape(f"{project_id}-msg-{index:02d}", left, 104, 62, 22, "#ffffff", color, 11, 1, "decor", animation_track("pulse", 780 + index * 70, 520, True)))
        elements.append(ppt_text(f"{project_id}-msg-{index:02d}-text", left + 7, 107, 48, 18, f'<p style="font-size:9px;font-weight:950;color:{color};text-align:center;">{html.escape(label)}</p>', 4, 1, role="decor"))
    return elements


def evidence_table(element_id: str, left: int, top: int, rows: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "id": element_id,
        "type": "table",
        "left": left,
        "top": top,
        "width": 222,
        "height": 78,
        "columns": [{"key": "step", "label": "看点"}, {"key": "evidence", "label": "证据"}],
        "rows": rows,
        "role": "model",
        "animation": animation_track("rise", 180, 580),
    }


def icon_for_label(label: str) -> str:
    if any(term in label for term in ["地图", "底图", "地形", "楼宇", "热区", "map"]):
        return "map"
    if any(term in label for term in ["DT", "路", "路线", "道路", "路迹", "route"]):
        return "route"
    if any(term in label for term in ["CQT", "点", "点位", "站址", "定位", "pin"]):
        return "pin"
    if any(term in label for term in ["GPS", "卫星", "位置", "sat"]):
        return "satellite"
    if any(term in label for term in ["LOG", "PM", "日志", "表单", "记录", "报告", "归档", "log"]):
        return "log"
    if any(term in label for term in ["频谱", "干扰", "PRB", "SSB", "spectrum"]):
        return "spectrum"
    if any(term in label for term in ["KPI", "指标", "SINR", "RSRP", "TOPN", "性能", "趋势", "吞吐", "速率"]):
        return "gauge"
    if any(term in label for term in ["告警", "异常", "风险", "Cause", "risk"]):
        return "warning"
    if any(term in label for term in ["闭环", "复测", "验证", "loop"]):
        return "loop"
    if any(term in label for term in ["UE", "终端", "terminal"]):
        return "phone"
    if any(term in label for term in ["gNB", "小区", "基站", "AAU", "RRU", "站向", "cell"]):
        return "tower"
    if any(term in label for term in ["BBU", "机柜", "服务器", "网元", "server"]):
        return "server"
    if any(term in label for term in ["AMF", "SMF", "UPF", "核心网", "承载", "core"]):
        return "cloud"
    if any(term in label for term in ["网管", "NMS", "工单", "运维"]):
        return "nms"
    if any(term in label for term in ["切换", "邻区", "A3", "handover"]):
        return "handover"
    if any(term in label for term in ["传输", "光纤", "端口", "fiber"]):
        return "fiber"
    if any(term in label for term in ["时间", "窗口", "T3", "clock"]):
        return "clock"
    if any(term in label for term in ["工具", "动作", "方案", "实施", "优化", "fix", "工"]):
        return "wrench"
    if any(term in label for term in ["提交", "输出", "报告", "结论", "归档", "check", "report"]):
        return "check"
    return "node"


def caption(project_id: str, text: str) -> list[dict[str, Any]]:
    return [
        ppt_shape(f"{project_id}-caption-strip", 298, 512, 404, 34, "#ffffff", "#dbe4ee", 14, 0.96, "caption", animation_track("rise", 1040, 540)),
        ppt_text(f"{project_id}-caption-text", 318, 518, 364, 22, f'<p style="font-size:12px;font-weight:900;color:#0f766e;text-align:center;">{html.escape(trim_text(text, 26))}</p>', 28, 1, role="caption"),
    ]


def metrics_for_chart(metrics: list[dict[str, str]], fallback: list[str]) -> list[dict[str, str]]:
    values = [str(metric.get("value") or metric.get("label") or "") for metric in metrics if metric]
    values = [value for value in values if value]
    return [{"label": f"M{index + 1}", "value": value} for index, value in enumerate((values + fallback)[:4])]


def ppt_chart(element_id: str, left: int, top: int, width: int, height: int, metrics: list[dict[str, str]]) -> dict[str, Any]:
    colors = ["#0f766e", "#2563eb", "#f59e0b", "#7c3aed"]
    series = [{"label": trim_text(metric["value"], 8), "value": 58 + index * 10, "color": colors[index % len(colors)]} for index, metric in enumerate(metrics[:4])]
    return {"id": element_id, "type": "chart", "left": left, "top": top, "width": width, "height": height, "chartType": "bar", "series": series, "role": "metric", "animation": animation_track("metric", 260, 720)}


def ppt_text(element_id: str, left: int, top: int, width: int, height: int, content: str, text_budget: int, max_lines: int, min_font_size: int = 10, role: str | None = None, animation: dict[str, Any] | None = None) -> dict[str, Any]:
    item: dict[str, Any] = {"id": element_id, "type": "text", "left": left, "top": top, "width": width, "height": height, "content": content, "textBudget": text_budget, "maxLines": max_lines, "minFontSize": min_font_size, "fit": "scale"}
    if role:
        item["role"] = role
    if animation:
        item["animation"] = animation
    return item


def ppt_shape(element_id: str, left: int, top: int, width: int, height: int, fill: str, outline: str = "#d8e0ea", radius: int = 12, opacity: float | None = None, role: str | None = None, animation: dict[str, Any] | None = None) -> dict[str, Any]:
    item: dict[str, Any] = {"id": element_id, "type": "shape", "left": left, "top": top, "width": width, "height": height, "path": rounded_rect_path(width, height, radius), "viewBox": [width, height], "fill": fill, "outline": {"style": "solid", "width": 2, "color": outline}}
    if opacity is not None:
        item["opacity"] = opacity
    if role:
        item["role"] = role
    if animation:
        item["animation"] = animation
    return item


def ppt_line(
    element_id: str,
    start: tuple[int, int],
    end: tuple[int, int],
    color: str,
    animation: dict[str, Any] | None = None,
    relation_type: str | None = None,
    source: str | None = None,
    target: str | None = None,
) -> dict[str, Any]:
    left, top = min(start[0], end[0]), min(start[1], end[1])
    relation = normalize_relation(relation_type)
    source_id = str(source or "").strip()
    target_id = str(target or "").strip()
    is_semantic_arrow = bool(relation and source_id and target_id)
    item: dict[str, Any] = {
        "id": element_id,
        "type": "line",
        "left": left,
        "top": top,
        "width": abs(end[0] - start[0]) or 1,
        "height": abs(end[1] - start[1]) or 1,
        "start": [start[0] - left, start[1] - top],
        "end": [end[0] - left, end[1] - top],
        "color": color,
        "style": "solid",
        "points": ["", "arrow"] if is_semantic_arrow else ["", ""],
        "role": "diagram" if is_semantic_arrow else "decor",
    }
    if is_semantic_arrow:
        item["source"] = source_id
        item["target"] = target_id
        item["kind"] = relation
        item["relationType"] = relation
        item["semantic"] = relation
        item["semanticKind"] = relation
        item["edgeKind"] = relation
        item["ariaLabel"] = f"{relation} connector from {source_id} to {target_id}"
    if animation:
        item["animation"] = animation
    return item


def rounded_rect_path(width: int, height: int, radius: int = 12) -> str:
    r = min(radius, width // 2, height // 2)
    return f"M {r} 0 H {width - r} Q {width} 0 {width} {r} V {height - r} Q {width} {height} {width - r} {height} H {r} Q 0 {height} 0 {height - r} V {r} Q 0 0 {r} 0 Z"


def animation_track(preset: str, delay_ms: int = 0, duration_ms: int = 560, repeat: bool = False) -> dict[str, Any]:
    return {"preset": preset, "delayMs": delay_ms, "durationMs": duration_ms, "repeat": repeat}


def trim_text(value: str, limit: int = 150) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip("，。；、:： ") + "..."

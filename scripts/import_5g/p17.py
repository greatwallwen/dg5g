"""P17 signaling lesson animation generation."""

from __future__ import annotations

import html
import re
from typing import Any

from .media_rules import manim_target_unit_id, manim_template_id, optional_manim_tracks
from .visual_icons import ppt_icon


P17_DURATION_MS = 610_000
P17_CUE_COUNT = 156
P17_FOCUS_DIM = 0.008
P17_EFFECTS = [
    "enter",
    "draw",
    "flow",
    "packetMove",
    "pathFlow",
    "cameraZoom",
    "cameraPan",
    "spotlight",
    "laser",
    "captionUpdate",
    "sceneTransition",
    "tableRowReveal",
    "countUp",
    "typeText",
    "whiteboardLine",
    "whiteboardShape",
    "whiteboardChart",
    "whiteboardTable",
    "whiteboardFormula",
    "whiteboardCode",
]


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def trim_text(value: str, limit: int = 150) -> str:
    value = normalize_space(value)
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip("，。；、") + "..."


def animation_track(preset: str, delay_ms: int = 0, duration_ms: int = 560, repeat: bool = False) -> dict[str, Any]:
    return {"preset": preset, "delayMs": delay_ms, "durationMs": duration_ms, "repeat": repeat}


def rounded_rect_path(width: int, height: int, radius: int = 12) -> str:
    r = min(radius, width // 2, height // 2)
    return f"M {r} 0 H {width - r} Q {width} 0 {width} {r} V {height - r} Q {width} {height} {width - r} {height} H {r} Q 0 {height} 0 {height - r} V {r} Q 0 0 {r} 0 Z"


def ppt_text(
    element_id: str,
    left: int,
    top: int,
    width: int,
    height: int,
    content: str,
    text_budget: int,
    max_lines: int,
    min_font_size: int = 10,
    role: str | None = None,
    animation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "id": element_id,
        "type": "text",
        "left": left,
        "top": top,
        "width": width,
        "height": height,
        "content": content,
        "textBudget": text_budget,
        "maxLines": max_lines,
        "minFontSize": min_font_size,
        "fit": "scale",
    }
    if role:
        item["role"] = role
    if animation:
        item["animation"] = animation
    return item


def ppt_shape(
    element_id: str,
    left: int,
    top: int,
    width: int,
    height: int,
    fill: str,
    outline: str = "#d8e0ea",
    radius: int = 12,
    opacity: float | None = None,
    role: str | None = None,
    animation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "id": element_id,
        "type": "shape",
        "left": left,
        "top": top,
        "width": width,
        "height": height,
        "path": rounded_rect_path(width, height, radius),
        "viewBox": [width, height],
        "fill": fill,
        "outline": {"style": "solid", "width": 2, "color": outline},
    }
    if opacity is not None:
        item["opacity"] = opacity
    if role:
        item["role"] = role
    if animation:
        item["animation"] = animation
    return item


def ppt_line(element_id: str, start: tuple[int, int], end: tuple[int, int], color: str, animation: dict[str, Any] | None = None, relation_type: str = "data-flow") -> dict[str, Any]:
    left, top = min(start[0], end[0]), min(start[1], end[1])
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
        "points": ["", "arrow"],
        "role": "diagram",
        "semanticKind": relation_type,
        "edgeKind": relation_type,
    }
    if animation:
        item["animation"] = animation
    return item


def ppt_chart(element_id: str, left: int, top: int, width: int, height: int) -> dict[str, Any]:
    return {
        "id": element_id,
        "type": "chart",
        "left": left,
        "top": top,
        "width": width,
        "height": height,
        "chartType": "bar",
        "series": [
            {"label": "RRC", "value": 68, "color": "#e11d48"},
            {"label": "NAS", "value": 82, "color": "#2563eb"},
            {"label": "PDU", "value": 76, "color": "#0f766e"},
        ],
        "role": "metric",
        "animation": animation_track("metric", 420, 720),
    }


def ppt_table(element_id: str, left: int, top: int, width: int, height: int) -> dict[str, Any]:
    return {
        "id": element_id,
        "type": "table",
        "left": left,
        "top": top,
        "width": width,
        "height": height,
        "columns": [{"key": "item", "label": "证据"}, {"key": "value", "label": "看点"}],
        "rows": [
            {"item": "消息", "value": "顺序"},
            {"item": "定时器", "value": "超时"},
            {"item": "节点", "value": "归因"},
        ],
        "role": "model",
        "animation": animation_track("rise", 180, 580),
    }


def p17_speech_action(
    project_id: str,
    index: int,
    target: str,
    title: str,
    spoken: str,
    caption: str,
    display_text: str | None = None,
    current_time_ms: int = 0,
    state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    visible = trim_text(caption, 34)
    return {
        "id": f"{project_id}-stage-speech-{index:03d}",
        "type": "speech",
        "title": title,
        "text": spoken,
        "spokenText": spoken,
        "caption": visible,
        "displayText": display_text or visible,
        "elementId": target,
        "target": target,
        "dimOpacity": P17_FOCUS_DIM,
        "focusPolicy": "hold",
        "durationMs": 5600,
        "currentTimeMs": current_time_ms,
        "state": state or {"currentTimeMs": current_time_ms, "targets": [target]},
    }


def build_p17_elements(project_id: str, title: str, scenario_label: str) -> list[dict[str, Any]]:
    eid = lambda name: f"{project_id}-{name}"
    primary = "#e11d48"
    accent = "#2563eb"
    elements: list[dict[str, Any]] = [
        ppt_shape(eid("top-band"), 36, 28, 928, 78, "#ffffff", "#dbe4ee", 16, 0.94, "decor", animation_track("fade", 0, 480)),
        ppt_text(eid("title"), 60, 44, 548, 44, f'<p style="font-size:27px;font-weight:900;color:#0f172a;">{html.escape(trim_text(title, 18))}</p>', 20, 1, role="title", animation=animation_track("rise", 80, 540)),
        ppt_text(eid("scenario-tag"), 62, 88, 260, 20, f'<p style="font-size:10px;font-weight:850;color:{primary};">{html.escape(scenario_label)}</p>', 16, 1, role="subtitle", animation=animation_track("rise", 120, 540)),
        ppt_shape(eid("lane-access"), 54, 132, 276, 322, "#fff1f2", "#fecdd3", 18, 0.9, "decor", animation_track("fade", 140, 520)),
        ppt_shape(eid("lane-core"), 362, 132, 276, 322, "#eff6ff", "#bfdbfe", 18, 0.9, "decor", animation_track("fade", 200, 520)),
        ppt_shape(eid("lane-session"), 670, 132, 276, 322, "#ecfdf5", "#bbf7d0", 18, 0.9, "decor", animation_track("fade", 260, 520)),
        ppt_text(eid("phase-01"), 76, 150, 112, 26, '<p style="font-size:13px;font-weight:900;color:#be123c;">接入侧</p>', 8, 1, role="subtitle"),
        ppt_text(eid("phase-02"), 384, 150, 112, 26, '<p style="font-size:13px;font-weight:900;color:#1d4ed8;">核心侧</p>', 8, 1, role="subtitle"),
        ppt_text(eid("phase-03"), 692, 150, 112, 26, '<p style="font-size:13px;font-weight:900;color:#15803d;">会话侧</p>', 8, 1, role="subtitle"),
    ]
    actors = [
        ("ue", 84, 190, "UE", primary),
        ("gnb", 212, 190, "gNB", primary),
        ("amf", 400, 190, "AMF", accent),
        ("smf", 528, 190, "SMF", accent),
        ("upf", 744, 190, "UPF", "#0f766e"),
    ]
    for name, left, top, label, color in actors:
        icon_kind = {"ue": "phone", "gnb": "tower", "amf": "cloud", "smf": "cloud", "upf": "cloud"}[name]
        elements.append(ppt_icon(eid(f"{name}-icon"), icon_kind, left + 28, top - 42, 34, color, animation=animation_track("rise", 260, 480)))
        elements.append(ppt_shape(eid(name), left, top, 86, 52, "#ffffff", color, 14, role="diagram", animation=animation_track("scale", 320, 560)))
        elements.append(ppt_text(eid(f"{name}-text"), left + 12, top + 13, 62, 24, f'<p style="font-size:18px;font-weight:950;color:{color};text-align:center;">{label}</p>', 6, 1, role="diagram"))
    lines = [
        ("line-rrc", (170, 216), (212, 216), primary, "process"),
        ("line-n2", (298, 216), (400, 216), accent, "dependency"),
        ("line-nas", (126, 250), (443, 250), "#7c3aed", "data-flow"),
        ("line-smf", (486, 216), (528, 216), accent, "process"),
        ("line-n4", (614, 216), (744, 216), "#0f766e", "dependency"),
        ("line-n3", (255, 276), (787, 276), "#16a34a", "data-flow"),
    ]
    for line_id, start, end, color, relation_type in lines:
        elements.append(ppt_line(eid(line_id), start, end, color, animation_track("draw", 720, 760), relation_type))
    packet_points = [
        (188, 216, primary), (200, 216, primary), (306, 216, accent),
        (326, 216, accent), (498, 216, accent), (626, 216, "#0f766e"),
        (138, 250, "#7c3aed"), (248, 250, "#7c3aed"), (360, 250, "#7c3aed"),
        (268, 276, "#16a34a"), (376, 276, "#16a34a"), (496, 276, "#16a34a"),
        (616, 276, "#16a34a"), (720, 276, "#16a34a"), (808, 276, "#16a34a"),
        (188, 396, "#ca8a04"), (498, 386, "#2563eb"), (806, 386, "#0f766e"),
    ]
    for index, (left, top, color) in enumerate(packet_points, start=1):
        packet = ppt_shape(eid(f"packet-{index:02d}"), left - 7, top - 7, 14, 14, color, color, 7, 0.82, "diagram", animation_track("pulse", 900 + index * 55, 620, True))
        packet["gradient"] = {"type": "linear", "rotate": 135, "colors": [{"pos": 0, "color": "#ffffff"}, {"pos": 1, "color": color}]}
        packet["shadow"] = {"h": 0, "v": 0, "blur": 12, "color": color}
        elements.append(packet)
    steps = [("01", "RRC", 78, 306, primary), ("02", "注册", 208, 336, "#7c3aed"), ("03", "鉴权", 384, 306, accent), ("04", "策略", 514, 336, accent), ("05", "会话", 692, 306, "#0f766e"), ("06", "验证", 820, 336, "#ca8a04")]
    for step_no, label, left, top, color in steps:
        step_id = eid(f"step-{step_no}")
        elements.append(ppt_shape(step_id, left, top, 100, 66, "#ffffff", color, 14, role="step", animation=animation_track("scale", 460 + int(step_no) * 50, 540)))
        elements.append(ppt_text(f"{step_id}-label", left + 12, top + 16, 76, 30, f'<p style="font-size:17px;font-weight:950;color:#0f172a;text-align:center;">{label}</p>', 6, 1, role="step"))
    msg_labels = ["RRC", "Setup", "Reg", "Auth", "Sec", "PDU", "QoS", "N2", "N3", "T3510", "Cause", "KPI"]
    for index, label in enumerate(msg_labels, start=1):
        row = 0 if index <= 6 else 1
        slot = (index - 1) % 6
        side = 88 if slot < 3 else 624
        left = side + (slot % 3) * 86
        top = 454 + row * 32
        color = [primary, accent, "#7c3aed", "#0f766e", "#ca8a04", "#0891b2"][index % 6]
        elements.append(ppt_shape(eid(f"msg-{index:02d}"), left, top, 74, 24, "#ffffff", color, 12, role="diagram", animation=animation_track("pulse", 820 + index * 40, 520, True)))
        elements.append(ppt_text(eid(f"msg-{index:02d}-text"), left + 7, top + 4, 60, 16, f'<p style="font-size:11px;font-weight:900;color:{color};text-align:center;">{html.escape(label)}</p>', 8, 1, role="diagram"))
    badges = [("risk-badge", 616, 36, "异常点", primary), ("clock-badge", 716, 36, "定时器", "#ca8a04"), ("loop-badge", 816, 36, "闭环", "#0f766e")]
    for name, left, top, label, color in badges:
        elements.append(ppt_shape(eid(name), left, top, 78, 28, "#ffffff", color, 14, role="metric", animation=animation_track("metric", 500, 560)))
        elements.append(ppt_text(eid(f"{name}-text"), left + 9, top + 5, 60, 16, f'<p style="font-size:11px;font-weight:900;color:{color};text-align:center;">{label}</p>', 8, 1, role="metric"))
    elements.append(ppt_table(eid("evidence-table"), 382, 410, 226, 72))
    elements.append(ppt_chart(eid("metric-chart"), 620, 370, 190, 66))
    elements.append(ppt_shape(eid("caption-strip"), 314, 520, 372, 30, "#ffffff", "#dbe4ee", 14, 0.96, "caption", animation_track("rise", 1040, 540)))
    elements.append(ppt_text(eid("caption-text"), 332, 523, 336, 22, '<p style="font-size:13px;font-weight:900;color:#0f766e;text-align:center;">信令顺序 / 证据闭环</p>', 18, 1, role="caption"))
    apply_p17_layer_metadata(project_id, elements)
    return elements


def apply_p17_layer_metadata(project_id: str, elements: list[dict[str, Any]]) -> None:
    for element in elements:
        element_id = str(element.get("id", ""))
        role = str(element.get("role", ""))
        phase, layer = infer_p17_phase(project_id, element_id, role)
        if phase:
            element["phase"] = phase
        element["layer"] = layer


def infer_p17_phase(project_id: str, element_id: str, role: str) -> tuple[int | None, str]:
    local_id = element_id.replace(f"{project_id}-", "")
    if role in {"title", "subtitle"} or local_id.startswith(("top-band", "phase-")):
        return None, "base"
    if "caption" in local_id:
        return None, "overlay"
    if local_id.startswith(("lane-access", "ue", "gnb", "line-rrc")):
        return 1, "concept"
    if local_id.startswith(("lane-core", "amf", "smf", "line-n2", "line-nas", "line-smf")):
        return 2, "process"
    if local_id.startswith(("lane-session", "upf", "line-n4", "line-n3")):
        return 3, "process"
    if local_id.startswith("line-"):
        return 3, "process"
    if local_id.startswith("step-01"):
        return 1, "process"
    if local_id.startswith(("step-02", "step-03", "step-04")):
        return 2, "process"
    if local_id.startswith("step-05"):
        return 3, "process"
    if local_id.startswith("step-06"):
        return 5, "process"
    if local_id.startswith(("msg-", "evidence")):
        return 4, "evidence"
    if local_id.startswith(("risk", "clock", "loop")):
        return 5, "evidence"
    if local_id.startswith(("metric", "packet")):
        return 5, "metric"
    return 3, "concept"


def phase_from_id(value: str, fallback: int) -> int:
    match = re.search(r"(\d+)", value)
    if not match:
        return fallback
    return max(1, min(6, int(match.group(1))))


def build_p17_narration(project_id: str) -> list[dict[str, str]]:
    return [
        {"target": f"{project_id}-title", "title": "建立总览", "caption": "先看全链路", "spoken": "这一段我们把 5G 关键信令流程当成一条可检查的工程链路来看。先不急着背消息名，而是先分清接入、核心网控制、会话建立和业务验证四个层次，这样后面看到任何异常，都能判断它卡在无线侧、控制面、用户面，还是卡在策略和资源协同上。"},
        {"target": f"{project_id}-lane-access", "title": "接入侧边界", "caption": "接入侧边界", "spoken": "左侧是接入侧。UE 和 gNB 之间首先完成无线资源控制相关动作，重点看 RRC 建立、重配置、恢复以及测量上报是否按预期发生。这里的证据通常来自空口日志、服务小区信息、测量事件和失败原因值。"},
        {"target": f"{project_id}-line-rrc", "title": "RRC 顺序", "caption": "RRC 看顺序", "spoken": "看 RRC 时不要只看最后成功或者失败，而要按时间顺序确认请求、响应、配置和完成消息是否闭合。如果某条消息缺失，后续 NAS 或 PDU 会话现象可能只是结果，不是根因。"},
        {"target": f"{project_id}-lane-core", "title": "核心控制面", "caption": "控制面接力", "spoken": "中间是核心网控制面。AMF 承接注册、移动性和安全上下文，SMF 承接会话选择和用户面控制。分析时要把 NGAP、NAS 和会话管理消息合在同一时间轴里，避免只盯单一接口。"},
        {"target": f"{project_id}-line-nas", "title": "NAS 透传", "caption": "NAS 别断链", "spoken": "NAS 消息经由无线侧透传到 AMF，所以表面上看到的是空口流程，实际判断却常常落在鉴权、安全、注册接受或拒绝原因上。只要出现拒绝、重传或定时器超时，就要把 UE 侧和 AMF 侧日志配对。"},
        {"target": f"{project_id}-step-01", "title": "第一步接入", "caption": "第一步接入", "spoken": "第一步是接入建立。教学中可以让学习者先标出 UE 发起请求的时刻，再标出 gNB 返回配置的时刻，最后确认完成消息是否到达。这个三点闭合，是判断后续流程是否有资格继续的入口条件。"},
        {"target": f"{project_id}-step-02", "title": "第二步注册", "caption": "第二步注册", "spoken": "第二步是注册管理。这里要区分初始注册、周期性注册和移动性更新，不同场景触发条件不同。若注册失败，优先看拒绝原因、鉴权结果、安全模式以及订阅数据是否匹配。"},
        {"target": f"{project_id}-step-03", "title": "第三步鉴权", "caption": "第三步鉴权", "spoken": "第三步关注鉴权和安全。鉴权不是孤立动作，它决定后续安全上下文能否建立，也会影响加密完整性保护是否启用。日志里要看随机数、响应、失败原因和安全模式完成是否成对出现。"},
        {"target": f"{project_id}-step-04", "title": "第四步策略", "caption": "第四步策略", "spoken": "第四步是策略和切片约束。很多会话失败不是无线质量差，而是 DNN、S-NSSAI、五 Q I、漫游策略或用户签约不匹配。此时要把 SMF、PCF 或签约侧信息加入证据链。"},
        {"target": f"{project_id}-step-05", "title": "第五步会话", "caption": "第五步会话", "spoken": "第五步是 PDU Session 建立。重点看 SMF 是否选择到合适的 UPF，N4 控制是否下发，N3 用户面隧道是否打通。控制面成功但业务不通时，往往要继续追到用户面路径。"},
        {"target": f"{project_id}-step-06", "title": "第六步验证", "caption": "第六步验证", "spoken": "第六步是验证。不要把信令建立成功等同于业务成功，还要结合 ping、吞吐、时延、业务应用和 KPI 指标确认真实体验。验证动作让信令分析从阅读日志变成工程闭环。"},
        {"target": f"{project_id}-msg-04", "title": "鉴权异常", "caption": "鉴权异常点", "spoken": "如果鉴权相关消息反复重试，先看 UE 身份、USIM 状态和核心网侧用户数据，再看是否存在时间同步或密钥派生问题。定位时要用消息编号和时间戳把两端日志对齐。"},
        {"target": f"{project_id}-msg-10", "title": "定时器判断", "caption": "定时器判断", "display": "3-2", "spoken": "定时器是信令分析里的路标。画面上保留三杠二这个编号，播报时也读作三杠二，避免语音引擎误读。T3510、T3560 或 RRC 已连接状态等待超时，通常提示某个响应没有回来。看到超时后，不要只记录超时本身，要回溯超时前最后一条成功消息。"},
        {"target": f"{project_id}-msg-11", "title": "原因值解读", "caption": "原因值解读", "spoken": "原因值要放到场景里解释。同一个 cause，在拥塞、签约错误、切片不匹配和覆盖异常场景下，处理建议完全不同。课堂演示时可以把原因值、接口、节点和业务现象放在一张表里。"},
        {"target": f"{project_id}-evidence-table", "title": "证据表", "caption": "证据要成表", "spoken": "证据表只放短词，但播报要讲清楚字段含义。消息字段回答发生了什么，定时器字段回答等了多久，节点字段回答责任边界在哪里。三类证据合起来，才能支撑可复核的结论。"},
        {"target": f"{project_id}-metric-chart", "title": "指标联动", "caption": "指标联动看", "spoken": "指标图不是为了装饰，而是把信令事件和性能结果接起来。注册成功率下降、PDU 建立时延变长、掉线率上升，或者同步信号参考信号接收功率低到负九十五分贝毫瓦，都可以反推需要重点复核的信令段落。"},
        {"target": f"{project_id}-risk-badge", "title": "异常优先级", "caption": "先排高风险", "spoken": "排障优先级要看影响面。单用户偶发现象先复测终端和位置，多用户同小区集中出现则转向无线或站点配置，大面积跨小区出现则要快速检查核心网、签约和策略侧。"},
        {"target": f"{project_id}-clock-badge", "title": "时间轴复盘", "caption": "时间轴复盘", "spoken": "复盘时把所有证据压到同一时间轴上。时间戳统一以后，谁先异常、谁被连带影响、哪个节点没有按时响应，就会比单独看日志清楚得多。"},
        {"target": f"{project_id}-loop-badge", "title": "闭环输出", "caption": "闭环输出", "spoken": "最终输出不是一句可能原因，而是包含现象、证据、根因、处理动作和复测结果的闭环记录。这样下一次遇到相似信令问题，团队可以复用判断路径。"},
        {"target": f"{project_id}-caption-text", "title": "总结路径", "caption": "顺序加证据", "spoken": "总结一下，学习信令分析时按顺序看消息，按节点找责任，按定时器查断点，按指标做验证，最后形成可复核的优化闭环。"},
    ]


def build_p17_timeline(project_id: str, narration: list[dict[str, str]]) -> dict[str, Any]:
    target_pool = [
        f"{project_id}-title",
        f"{project_id}-phase-01",
        f"{project_id}-phase-02",
        f"{project_id}-phase-03",
        f"{project_id}-lane-access",
        f"{project_id}-lane-core",
        f"{project_id}-lane-session",
        f"{project_id}-ue",
        f"{project_id}-gnb",
        f"{project_id}-amf",
        f"{project_id}-smf",
        f"{project_id}-upf",
        f"{project_id}-line-rrc",
        f"{project_id}-line-n2",
        f"{project_id}-line-nas",
        f"{project_id}-line-smf",
        f"{project_id}-line-n4",
        f"{project_id}-line-n3",
        f"{project_id}-step-01",
        f"{project_id}-step-02",
        f"{project_id}-step-03",
        f"{project_id}-step-04",
        f"{project_id}-step-05",
        f"{project_id}-step-06",
        f"{project_id}-msg-01",
        f"{project_id}-msg-02",
        f"{project_id}-msg-03",
        f"{project_id}-msg-04",
        f"{project_id}-msg-05",
        f"{project_id}-msg-06",
        f"{project_id}-msg-07",
        f"{project_id}-msg-08",
        f"{project_id}-msg-09",
        f"{project_id}-msg-10",
        f"{project_id}-msg-11",
        f"{project_id}-msg-12",
        f"{project_id}-evidence-table",
        f"{project_id}-metric-chart",
        f"{project_id}-risk-badge",
        f"{project_id}-clock-badge",
        f"{project_id}-loop-badge",
        f"{project_id}-caption-text",
    ]
    line_targets = [
        f"{project_id}-line-rrc",
        f"{project_id}-line-n2",
        f"{project_id}-line-nas",
        f"{project_id}-line-smf",
        f"{project_id}-line-n4",
        f"{project_id}-line-n3",
    ]
    cues: list[dict[str, Any]] = []
    cue_interval_ms = max(1_300, (P17_DURATION_MS - 2_400) // max(P17_CUE_COUNT, 1))
    for index in range(P17_CUE_COUNT):
        effect = P17_EFFECTS[index % len(P17_EFFECTS)]
        target = p17_cue_target(project_id, effect, index, target_pool, line_targets)
        payload = {"label": f"C{index + 1:02d}", "phase": (index % 6) + 1}
        if effect == "captionUpdate":
            payload["caption"] = narration[index % len(narration)]["caption"]
        if effect == "tableRowReveal":
            payload["rowCount"] = 1 + (index % 3)
        if effect == "countUp":
            payload.update({"from": 0, "to": 62 + (index % 4) * 9, "suffix": "%", "decimals": 0})
        if effect in {"flow", "packetMove", "pathFlow"}:
            payload.update({"color": ["#e11d48", "#2563eb", "#0f766e", "#ca8a04"][index % 4], "repeat": effect == "flow"})
        if effect == "typeText":
            payload.update({"text": narration[index % len(narration)]["caption"]})
        if effect == "sceneTransition":
            payload.update({"style": "sweep", "phaseLabel": narration[index % len(narration)]["caption"]})
        if effect == "whiteboardLine":
            payload.update({"x1": 130 + (index % 4) * 96, "y1": 286 + (index % 3) * 22, "x2": 230 + (index % 4) * 96, "y2": 286 + (index % 3) * 22, "color": ["#e11d48", "#2563eb", "#0f766e", "#ca8a04"][index % 4]})
        if effect == "whiteboardShape":
            payload.update({"x": 118 + (index % 4) * 96, "y": 258 + (index % 3) * 22, "width": 124, "height": 58, "shape": "rect", "color": ["#e11d48", "#2563eb", "#0f766e", "#ca8a04"][index % 4]})
        if effect == "whiteboardChart":
            payload.update({"x": 612, "y": 250 + (index % 3) * 20, "width": 146, "height": 70, "values": [0.32, 0.48, 0.64, 0.78], "color": ["#e11d48", "#2563eb", "#0f766e", "#ca8a04"][index % 4]})
        if effect == "whiteboardTable":
            payload.update({"x": 604, "y": 250 + (index % 3) * 20, "width": 156, "height": 72, "rows": 3, "cols": 3, "color": ["#e11d48", "#2563eb", "#0f766e", "#ca8a04"][index % 4]})
        if effect == "whiteboardFormula":
            payload.update({"x": 588, "y": 322, "width": 210, "height": 58, "formula": "TA = t2 - t1", "color": ["#e11d48", "#2563eb", "#0f766e", "#ca8a04"][index % 4]})
        if effect == "whiteboardCode":
            payload.update({"x": 574, "y": 314, "width": 226, "lines": ["if reject:", "  locate cause", "  retest cell"], "color": ["#e11d48", "#2563eb", "#0f766e", "#ca8a04"][index % 4]})
        if effect in {"cameraZoom", "cameraPan"}:
            payload.update({"fromScale": 1, "scale": 1.035 if effect == "cameraZoom" else 1, "fromX": 0, "x": -18 + (index % 3) * 18, "fromY": 0, "y": -8 + (index % 2) * 16})
        cue: dict[str, Any] = {
            "id": f"{project_id}-cue-{index + 1:03d}",
            "atMs": 900 + index * cue_interval_ms,
            "durationMs": 780 + (index % 5) * 140,
            "holdMs": 360 + (index % 3) * 120,
            "targets": [target],
            "effect": effect,
            "blocking": False,
            "easing": "easeInOut",
            "payload": payload,
        }
        if index < len(narration):
            cue["spokenTextRef"] = f"{project_id}-stage-speech-{index + 1:03d}"
            cue["captionRef"] = f"{project_id}-stage-speech-{index + 1:03d}"
        cues.append(cue)
    cues.extend(p17_phase_transition_cues(project_id, narration))
    cues.sort(key=lambda item: int(item.get("atMs", 0)))
    return {"durationMs": P17_DURATION_MS, "cues": cues}


def build_p17_pages(project_id: str) -> list[dict[str, Any]]:
    titles = ["接入侧", "核心控制", "会话链路", "证据定位", "指标验证", "闭环输出"]
    phase_width = P17_DURATION_MS // 6
    return [
        {
            "id": f"{project_id}-page-{phase:02d}",
            "phase": phase,
            "title": titles[phase - 1],
            "summary": f"{titles[phase - 1]}知识点页面",
            "startMs": (phase - 1) * phase_width,
            "durationMs": phase_width if phase < 6 else P17_DURATION_MS - (phase - 1) * phase_width,
        }
        for phase in range(1, 7)
    ]


def p17_phase_transition_cues(project_id: str, narration: list[dict[str, str]]) -> list[dict[str, Any]]:
    phase_width = P17_DURATION_MS // 6
    cues: list[dict[str, Any]] = []
    for phase in range(2, 7):
        transition_at = max(900, (phase - 1) * phase_width - 520)
        cues.append({
            "id": f"{project_id}-phase-transition-{phase:02d}",
            "atMs": transition_at,
            "durationMs": 1280,
            "holdMs": 440,
            "targets": [f"{project_id}-top-band"],
            "effect": "sceneTransition",
            "blocking": False,
            "easing": "easeInOut",
            "payload": {
                "phase": phase,
                "label": f"Phase {phase}",
                "style": "sweep",
                "phaseLabel": narration[(phase - 1) % len(narration)]["caption"] if narration else f"Phase {phase}",
            },
        })
        cues.append({
            "id": f"{project_id}-whiteboard-clear-{phase:02d}",
            "atMs": transition_at + 90,
            "durationMs": 80,
            "holdMs": 0,
            "targets": [f"{project_id}-top-band"],
            "effect": "whiteboardClear",
            "blocking": False,
            "easing": "easeInOut",
            "payload": {"phase": phase},
        })
    return cues


def p17_cue_target(project_id: str, effect: str, index: int, target_pool: list[str], line_targets: list[str]) -> str:
    if effect in {"draw", "flow", "packetMove", "pathFlow"}:
        return line_targets[index % len(line_targets)]
    if effect == "captionUpdate":
        return f"{project_id}-caption-text"
    if effect == "typeText":
        return f"{project_id}-caption-text"
    if effect == "sceneTransition":
        return f"{project_id}-top-band"
    if effect == "tableRowReveal":
        return f"{project_id}-evidence-table"
    if effect == "countUp":
        return f"{project_id}-metric-chart"
    if effect in {"cameraZoom", "cameraPan"}:
        return f"{project_id}-top-band"
    if effect == "whiteboardLine":
        return line_targets[index % len(line_targets)]
    if effect == "whiteboardShape":
        return target_pool[index % len(target_pool)]
    if effect in {"whiteboardChart", "whiteboardTable", "whiteboardFormula", "whiteboardCode"}:
        return f"{project_id}-metric-chart"
    return target_pool[index % len(target_pool)]


def build_p17_actions(project_id: str, widget_id: str, narration: list[dict[str, str]]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    target_pool = [item["target"] for item in narration]
    line_targets = [
        f"{project_id}-line-rrc",
        f"{project_id}-line-n2",
        f"{project_id}-line-nas",
        f"{project_id}-line-smf",
        f"{project_id}-line-n4",
        f"{project_id}-line-n3",
    ]
    phase_width = P17_DURATION_MS // 6
    for index, item in enumerate(narration, start=1):
        cue_id = f"{project_id}-cue-{index:03d}"
        speech_id = f"{project_id}-stage-speech-{index:03d}"
        target = item["target"]
        effect = P17_EFFECTS[(index - 1) % len(P17_EFFECTS)]
        cue_target = p17_cue_target(project_id, effect, index - 1, target_pool, line_targets)
        draw_target = line_targets[(index - 1) % len(line_targets)]
        draw_color = ["#e11d48", "#2563eb", "#0f766e", "#ca8a04"][index % 4]
        time_ms = int((index - 1) * P17_DURATION_MS / max(1, len(narration)))
        active_step = min(5, time_ms // phase_width)
        focus_time = time_ms + 120
        frame_state = {"activeStep": active_step, "currentTimeMs": focus_time, "targets": [target], "whiteboardEffect": "whiteboardShape", "caption": item["caption"], "x": 84 + (index % 4) * 96, "y": 250 + (index % 3) * 22, "width": 132, "height": 62, "shape": "rect", "color": draw_color, "holdMs": 4200, "durationMs": 760}
        actions.extend([
            {
                "id": f"{project_id}-stage-seek-{index:03d}",
                "type": "widget_setState",
                "title": f"定位第 {index:02d} 段",
                "widgetId": widget_id,
                "state": {
                    "activeStep": active_step,
                    "currentTimeMs": time_ms,
                },
                "delayMs": 80,
            },
            {
                "id": f"{project_id}-stage-cue-{index:03d}",
                "type": "widget_timelineCue",
                "title": f"运行 cue {index:02d}",
                "widgetId": widget_id,
                "target": cue_target,
                "content": effect,
                "state": {
                    "activeStep": active_step,
                    "cueId": cue_id,
                    "targets": [cue_target],
                    "speechId": speech_id,
                    "spokenTextRef": speech_id,
                    "captionRef": speech_id,
                },
                "durationMs": 520,
                "delayMs": 180,
            },
            {
                "id": f"{project_id}-stage-whiteboard-{index:03d}",
                "type": "widget_timelineCue",
                "title": f"鏍囨敞 {index:02d}",
                "widgetId": widget_id,
                "target": draw_target,
                "content": "whiteboardLine",
                "state": {
                    "activeStep": active_step,
                    "targets": [draw_target],
                    "caption": item["caption"],
                    "x1": 98 + (index % 4) * 94,
                    "y1": 312 + (index % 3) * 18,
                    "x2": 184 + (index % 4) * 94,
                    "y2": 312 + (index % 3) * 18,
                    "width": 5,
                    "color": draw_color,
                    "currentTimeMs": time_ms + 220,
                    "holdMs": 1600,
                },
                "durationMs": 720,
                "holdMs": 1600,
                "delayMs": 120,
            },
            {
                "id": f"{project_id}-stage-whiteboard-shape-{index:03d}",
                "type": "widget_timelineCue",
                "title": f"focus frame {index:02d}",
                "widgetId": widget_id,
                "target": target,
                "content": "whiteboardShape",
                "state": {
                    "activeStep": active_step,
                    "targets": [target],
                    "caption": item["caption"],
                    "x": 84 + (index % 4) * 96,
                    "y": 250 + (index % 3) * 22,
                    "width": 132,
                    "height": 62,
                    "shape": "rect",
                    "color": draw_color,
                    "currentTimeMs": time_ms + 120,
                    "holdMs": 1700,
                },
                "durationMs": 760,
                "holdMs": 1700,
                "delayMs": 100,
            },
            {
                "id": f"{project_id}-stage-focus-{index:03d}",
                "type": "spotlight" if index % 2 else "laser",
                "title": item["caption"],
                "elementId": target,
                "target": target,
                "color": draw_color,
                "dimOpacity": P17_FOCUS_DIM,
                "focusPolicy": "hold",
                "currentTimeMs": focus_time,
                "state": frame_state,
                "holdMs": 4200,
                "delayMs": 160,
            },
            p17_speech_action(project_id, index, target, item["title"], item["spoken"], item["caption"], item.get("display"), focus_time, frame_state),
        ])
    actions.append({
        "id": f"{project_id}-stage-final-cue",
        "type": "widget_timelineCue",
        "title": "收束时间轴",
        "widgetId": widget_id,
        "target": f"{project_id}-caption-text",
        "content": "highlight",
        "state": {"activeStep": 5, "complete": True, "targets": [f"{project_id}-caption-text"], "currentTimeMs": P17_DURATION_MS - 1600},
        "durationMs": 900,
        "delayMs": 240,
    })
    return actions


def build_p17_animation_slide_artifact(
    task: Any,
    project_title: str,
    scenario: str,
    steps: list[dict[str, str]],
    metrics: list[dict[str, str]],
    palette: tuple[str, str],
    scenario_label: str,
) -> dict[str, Any]:
    project_id = task.generated_id
    widget_id = task.widget_id
    title = task.title
    narration = build_p17_narration(project_id)
    timeline = build_p17_timeline(project_id, narration)
    pages = build_p17_pages(project_id)
    elements = build_p17_elements(project_id, title, scenario_label)
    template = manim_template_id(project_id) or "signaling-ladder"
    target_unit_id = manim_target_unit_id(project_id)
    scene = {
        "id": f"{project_id}-animation-scene",
        "title": title,
        "type": "slide",
        "description": f"{project_title} 信令定位示意动画。",
        "content": {
            "type": "slide",
            "canvas": {
                "id": f"{project_id}-slide",
                "width": 1000,
                "height": 562,
                "background": {
                    "type": "gradient",
                    "gradient": {
                        "type": "linear",
                        "rotate": 135,
                        "colors": [
                            {"pos": 0, "color": "#f8fbff"},
                            {"pos": 52, "color": "#fff7ed"},
                            {"pos": 100, "color": "#ecfdf5"},
                        ],
                    },
                },
                "theme": {"colors": [palette[0], palette[1], "#0f172a"], "backgroundColor": "#f8fafc"},
                "elements": elements,
            },
        },
        "actions": build_p17_actions(project_id, widget_id, narration),
        "timeline": timeline,
    }
    media_tracks = optional_manim_tracks(project_id, template) or optional_manim_tracks(project_id, "signaling-ladder")
    artifact: dict[str, Any] = {
        "type": "animation-slide",
        "version": 2,
        "aspectRatio": "16:9",
        "durationMs": P17_DURATION_MS,
        "minDurationMs": P17_DURATION_MS,
        "pages": pages,
        "timeline": timeline,
        "scene": scene,
        "template": template,
        "manimSpec": {
            "projectId": project_id,
            "template": template,
            "stageTemplate": "signaling-ladder",
            "clipId": f"{project_id}-manim-{template}",
            "targetUnitId": target_unit_id,
            "visualMetaphor": {
                "id": "signaling-ladder",
                "label": "信令流程阶梯",
                "layout": "signaling-ladder",
            },
            "sceneBeats": p17_manim_scene_beats(project_id, pages),
        },
        "diagnostics": [
            {
                "id": "p17-signaling-stage",
                "code": "p17-signaling-stage",
                "level": "info",
                "title": "P17 信令示意动画",
                "detail": "P17 使用 2 分钟时间线说明信令顺序、节点职责和失败点定位。",
                "message": "P17 使用 2 分钟时间线说明信令顺序、节点职责和失败点定位。",
            }
        ],
    }
    if media_tracks:
        artifact["mediaTracks"] = media_tracks
    return artifact


def p17_manim_scene_beats(project_id: str, pages: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [
        {
            "id": f"{project_id}-manim-beat-{index:02d}",
            "targetElementId": f"{project_id}-step-{index:02d}",
            "label": str(page.get("title", "")),
            "description": str(page.get("summary", "")),
        }
        for index, page in enumerate(pages, start=1)
    ]


def build_p17_playback_scenes(project_id: str, artifact: dict[str, Any]) -> list[dict[str, Any]]:
    scene = artifact["scene"]
    return [
        {
            "id": f"{project_id}-signaling-stage",
            "title": "P17 信令定位动画",
            "type": "animation",
            "order": 1,
            "stageId": project_id,
            "description": "按信令顺序说明节点职责、承载路径和失败点定位。",
            "actions": scene.get("actions", []),
        }
    ]

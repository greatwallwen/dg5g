"""Knowledge-point animation templates for non-P17 DGBook widgets."""

from __future__ import annotations

import html
import re
from typing import Any

from .action_narration import template_action_speech, template_intro_speech
from .graph_layout import knowledge_order_lines
from .media_rules import manim_target_unit_id, manim_template_id, optional_manim_tracks
from .stage_timeline import (
    MAX_STAGE_ELEMENTS_PER_PAGE,
    MAX_STAGE_PAGE_COUNT,
    MAX_STAGE_SEMANTIC_ARROWS_PER_PAGE,
    MAX_STAGE_TEXT_BUDGET,
    SEMANTIC_RELATIONS,
    STANDARD_STAGE_DURATION_MS,
    build_standard_stage_pages,
    build_standard_stage_timeline,
    stage_page_count,
)
from .visual_icons import ppt_icon
from .stage_elements import (
    animation_track,
    caption,
    compact_badges,
    evidence_table,
    icon_for_label,
    line_effect_for_relation,
    line_elements,
    message_badges,
    metrics_for_chart,
    ppt_chart,
    ppt_line,
    ppt_shape,
    ppt_text,
    relation_for_line,
    trim_text,
)
from .knowledge_template_data import (
    PROJECT_PLANS,
    PROJECT_TEMPLATE_MAP,
    TEMPLATE_INTROS,
    TEMPLATE_LABELS,
    TEMPLATE_LAYOUTS,
    TEMPLATE_PALETTES,
    TEMPLATE_PLANS,
)


ARROW_RELATION_TYPES = set(SEMANTIC_RELATIONS)
FOCUS_TARGETS_BY_LAYOUT = {
    "site-survey": {
        1: "site-panel",
        2: "site-panel",
        3: "rack-panel",
        4: "rack-panel",
        5: "form-panel",
        6: "evidence-table",
    },
    "dt-cqt-concept": {
        1: "dt-field",
        2: "hub",
        3: "road-1",
        4: "evidence-table",
        5: "metric-chart",
        6: "caption-text",
    },
    "test-process": {
        1: "step-01",
        2: "step-02",
        3: "step-03",
        4: "step-04",
        5: "metric-chart",
        6: "caption-text",
    },
    "kpi-diagnosis": {
        1: "step-01",
        2: "step-02",
        3: "step-03",
        4: "dashboard",
        5: "evidence-table",
        6: "metric-chart",
    },
    "optimization-loop": {
        1: "step-01",
        2: "step-02",
        3: "loop-core",
        4: "step-04",
        5: "evidence-table",
        6: "metric-chart",
    },
}


def build_knowledge_template_artifact(
    task: Any,
    project_title: str,
    scenario: str,
    steps: list[dict[str, str]],
    metrics: list[dict[str, str]],
    scenario_label: str,
) -> dict[str, Any]:
    project_id = str(task.generated_id)
    template = choose_template(project_id, str(task.title), project_title, scenario, steps)
    manim_template = manim_template_id(project_id) or template
    target_unit_id = manim_target_unit_id(project_id)
    plan = template_plan(project_id, template, steps)
    primary, accent, success = TEMPLATE_PALETTES[template]
    elements = base_elements(project_id, str(task.title), TEMPLATE_LABELS[template], scenario_label, primary, accent)
    elements.extend(template_elements(project_id, template, plan, metrics, primary, accent, success))
    apply_layer_metadata(project_id, template, elements)
    enforce_stage_constraints(project_id, elements)
    timeline = build_standard_stage_timeline(project_id, plan)
    pages = build_standard_stage_pages(project_id, plan)
    apply_page_focus_targets(project_id, template, pages)
    scene = {
        "id": f"{project_id}-animation-scene",
        "title": str(task.title),
        "type": "slide",
        "description": f"{TEMPLATE_LABELS[template]}用于说明 {project_title} 的关键对象、证据关系和复盘口径。",
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
                            {"pos": 58, "color": "#f8fafc"},
                            {"pos": 100, "color": "#eefdf8"},
                        ],
                    },
                },
                "theme": {"colors": [primary, accent, "#0f172a"], "backgroundColor": "#f8fafc"},
                "elements": elements,
            },
        },
        "actions": build_template_actions(project_id, str(task.widget_id), template, plan),
        "timeline": timeline,
    }
    artifact = {
        "type": "animation-slide",
        "version": 2,
        "aspectRatio": "16:9",
        "durationMs": STANDARD_STAGE_DURATION_MS,
        "minDurationMs": STANDARD_STAGE_DURATION_MS,
        "pages": pages,
        "timeline": timeline,
        "scene": scene,
        "template": template,
        "stageConstraints": {
            "maxElementsPerPage": MAX_STAGE_ELEMENTS_PER_PAGE,
            "maxSemanticArrowsPerPage": MAX_STAGE_SEMANTIC_ARROWS_PER_PAGE,
            "maxTextBudgetPerPage": MAX_STAGE_TEXT_BUDGET,
        },
        "manimSpec": {
            "projectId": project_id,
            "template": manim_template,
            "stageTemplate": layout_template(template),
            "clipId": f"{project_id}-manim-{manim_template}",
            "targetUnitId": target_unit_id,
            "visualMetaphor": {
                "id": template,
                "label": TEMPLATE_LABELS[template],
                "layout": layout_template(template),
            },
            "sceneBeats": manim_scene_beats(project_id, template, plan),
            "beatLabels": [str(item.get("label", "")) for item in plan[: stage_page_count(plan)]],
            "beatDescriptions": [str(item.get("description", "")) for item in plan[: stage_page_count(plan)]],
        },
        "diagnostics": [
            {
                "id": "knowledge-template",
                "code": template,
                "level": "info",
                "title": TEMPLATE_LABELS[template],
                "detail": "图解已覆盖对象、证据关系和复盘要点。",
                "message": "图解已覆盖对象、证据关系和复盘要点。",
            }
        ],
    }
    media_tracks = optional_manim_tracks(project_id, manim_template) or optional_manim_tracks(project_id, template) or optional_manim_tracks(project_id, layout_template(template))
    if media_tracks:
        artifact["mediaTracks"] = media_tracks
    return artifact


def manim_scene_beats(project_id: str, template: str, plan: list[dict[str, str]]) -> list[dict[str, str]]:
    return [
        {
            "id": f"{project_id}-manim-beat-{index:02d}",
            "targetElementId": stage_focus_target(project_id, template, index),
            "label": str(item.get("label", "")),
            "description": str(item.get("description", "")),
        }
        for index, item in enumerate(plan[: stage_page_count(plan)], start=1)
    ]


def apply_page_focus_targets(project_id: str, template: str, pages: list[dict[str, Any]]) -> None:
    for page in pages:
        phase = int(page.get("phase") or page.get("knowledgeIndex") or 1)
        page["focusElementId"] = stage_focus_target(project_id, template, phase)


def stage_focus_target(project_id: str, template: str, phase: int) -> str:
    layout = layout_template(template)
    if layout == "signaling-ladder" and template != "signaling-fault-ladder" and phase <= 5:
        return f"{project_id}-actor-{phase - 1}"
    local = FOCUS_TARGETS_BY_LAYOUT.get(layout, {}).get(phase)
    return f"{project_id}-{local}" if local else f"{project_id}-step-{phase:02d}"


def default_spotlight_dim(target: str) -> float:
    if any(token in target for token in ("panel", "field", "lane", "dashboard", "loop-core", "table", "chart")):
        return 0.006
    return 0.008


def choose_template(project_id: str, title: str, project_title: str, scenario: str, steps: list[dict[str, str]]) -> str:
    if project_id in PROJECT_TEMPLATE_MAP:
        return PROJECT_TEMPLATE_MAP[project_id]
    text = " ".join([title, project_title, scenario, *[str(step.get("label", "")) for step in steps]])
    if "信令" in text or scenario == "signaling":
        return "signaling-ladder"
    if any(term in title for term in ["DT", "DTCQT", "CQT", "路测"]):
        return "dt-cqt-concept"
    if any(term in title for term in ["采集", "问题处理", "测试准备", "测试执行"]):
        return "site-survey" if "室内" in text or "站点" in text or "机房" in text else "test-process"
    if any(term in text for term in ["KPI", "指标", "性能", "数据分析", "LOG", "吞吐"]):
        return "kpi-diagnosis"
    if any(term in text for term in ["优化", "参数", "闭环", "验证", "复测"]):
        return "optimization-loop"
    if any(term in text for term in ["DT", "CQT", "路测", "室内", "采集"]):
        return "dt-cqt-concept"
    return "test-process"


def template_plan(project_id: str, template: str, steps: list[dict[str, str]]) -> list[dict[str, str]]:
    if project_id in PROJECT_PLANS:
        return [{"label": label, "description": desc} for label, desc in PROJECT_PLANS[project_id]]
    defaults = [{"label": label, "description": desc} for label, desc in TEMPLATE_PLANS[template]]
    if template in {"dt-cqt-concept", "site-survey", "kpi-diagnosis", "optimization-loop", "signaling-ladder"}:
        return defaults
    merged = []
    for index, default in enumerate(defaults):
        step = steps[index] if index < len(steps) else {}
        label = trim_text(str(step.get("label") or default["label"]), 8)
        desc = trim_text(str(step.get("description") or default["description"]), 34)
        merged.append({"label": label, "description": desc})
    return merged


def layout_template(template: str) -> str:
    return TEMPLATE_LAYOUTS.get(template, template)


def base_elements(project_id: str, title: str, template_label: str, scenario_label: str, primary: str, accent: str) -> list[dict[str, Any]]:
    eid = lambda name: f"{project_id}-{name}"
    variant = int(re.sub(r"\D", "", project_id) or "0")
    rail_top = 112 + (variant % 6) * 18
    rail_height = 72 + (variant % 5) * 18
    rail_left = 42 + (variant % 5) * 28
    return [
        ppt_shape(eid("top-band"), 38, 28, 924, 76, "#ffffff", "#dbe4ee", 16, 0.94, "decor", animation_track("fade", 0, 480)),
        ppt_shape(eid("context-rail"), rail_left, rail_top, 5, rail_height, primary, primary, 4, 0.16, "decor", animation_track("fade", 180, 520)),
        ppt_text(eid("title"), 60, 43, 560, 42, f'<p style="font-size:27px;font-weight:900;color:#0f172a;">{html.escape(trim_text(title, 20))}</p>', 22, 1, role="title", animation=animation_track("rise", 80, 540)),
        ppt_text(eid("scenario-tag"), 650, 42, 278, 24, f'<p style="font-size:13px;font-weight:900;color:{primary};text-align:right;">{html.escape(template_label)}</p>', 16, 1, role="subtitle"),
        ppt_text(eid("scenario-subtag"), 650, 68, 278, 18, f'<p style="font-size:10px;font-weight:800;color:{accent};text-align:right;">{html.escape(scenario_label)}</p>', 18, 1, role="subtitle"),
    ]


def template_elements(
    project_id: str,
    template: str,
    plan: list[dict[str, str]],
    metrics: list[dict[str, str]],
    primary: str,
    accent: str,
    success: str,
) -> list[dict[str, Any]]:
    layout = layout_template(template)
    if layout == "site-survey":
        return site_survey_elements(project_id, plan, metrics, primary, accent, success)
    if layout == "signaling-ladder":
        return signaling_ladder_elements(project_id, plan, metrics, primary, accent, success)
    if layout == "kpi-diagnosis":
        return kpi_diagnosis_elements(project_id, plan, metrics, primary, accent, success)
    if layout == "optimization-loop":
        return optimization_loop_elements(project_id, plan, metrics, primary, accent, success)
    if layout == "test-process":
        return test_process_elements(project_id, plan, metrics, primary, accent, success)
    return dt_cqt_elements(project_id, plan, metrics, primary, accent, success)


def apply_layer_metadata(project_id: str, template: str, elements: list[dict[str, Any]]) -> None:
    for element in elements:
        element_id = str(element.get("id", ""))
        role = str(element.get("role", ""))
        phase, layer = infer_element_phase(project_id, template, element_id, role)
        if phase:
            element["phase"] = phase
        element["layer"] = layer


def enforce_stage_constraints(project_id: str, elements: list[dict[str, Any]]) -> None:
    keep_ids = {
        f"{project_id}-top-band",
        f"{project_id}-title",
        f"{project_id}-scenario-tag",
        f"{project_id}-scenario-subtag",
        f"{project_id}-caption-strip",
        f"{project_id}-caption-text",
        f"{project_id}-evidence-table",
        f"{project_id}-metric-chart",
    }
    keep_step_prefix = f"{project_id}-step-"
    keep_line_prefix = f"{project_id}-line-"

    def protected(element: dict[str, Any]) -> bool:
        element_id = str(element.get("id", ""))
        return element_id in keep_ids or element_id.startswith(keep_step_prefix) or (element_id.startswith(keep_line_prefix) and semantic_arrow(element))

    def visible_at_phase(element: dict[str, Any], phase: int) -> bool:
        item_phase = element.get("phase")
        if not isinstance(item_phase, int) or item_phase <= 0:
            return True
        return item_phase == phase

    def text_len(element: dict[str, Any]) -> int:
        if element.get("type") != "text":
            return 0
        return len(re.sub(r"<[^>]+>", "", str(element.get("content") or "")))

    def semantic_arrow(element: dict[str, Any]) -> bool:
        return element.get("type") == "line" and bool(element.get("source") and element.get("target") and element.get("kind"))

    def removable_priority(element: dict[str, Any]) -> int:
        element_id = str(element.get("id", ""))
        role = str(element.get("role", ""))
        if protected(element):
            return -1
        if role == "decor":
            return 20
        if any(token in element_id for token in ("msg-", "packet-", "room-", "device-dot", "loop-signal", "process-icon", "kpi-chip")):
            return 18
        if role in {"diagram", "metric"}:
            return 10
        return 4

    removed: set[str] = set()
    for phase in range(1, MAX_STAGE_PAGE_COUNT + 1):
        while True:
            visible = [item for item in elements if str(item.get("id", "")) not in removed and visible_at_phase(item, phase)]
            text_budget = sum(text_len(item) for item in visible)
            arrow_count = sum(1 for item in visible if semantic_arrow(item))
            if len(visible) <= MAX_STAGE_ELEMENTS_PER_PAGE and text_budget <= MAX_STAGE_TEXT_BUDGET and arrow_count <= MAX_STAGE_SEMANTIC_ARROWS_PER_PAGE:
                break
            candidates = [item for item in visible if removable_priority(item) > 0]
            if not candidates:
                break
            victim = max(candidates, key=lambda item: (removable_priority(item), text_len(item), str(item.get("id", ""))))
            removed.add(str(victim.get("id", "")))
    if removed:
        elements[:] = [item for item in elements if str(item.get("id", "")) not in removed]


def infer_element_phase(project_id: str, template: str, element_id: str, role: str) -> tuple[int | None, str]:
    local_id = element_id.replace(f"{project_id}-", "")
    template = layout_template(template)
    if role == "title" or local_id.startswith(("top-band", "scenario")):
        return None, "base"
    if "caption" in local_id:
        return None, "overlay"
    if local_id.startswith("line-"):
        return phase_from_index(local_id, 3), "process"
    if template == "site-survey":
        phase = site_survey_phase(local_id)
        if phase:
            return phase, "concept" if phase <= 2 else "process"
    if template == "site-survey" and local_id.startswith(("evidence-table", "metric-chart")):
        return 6, "summary"
    if template == "kpi-diagnosis" and local_id.startswith(("dashboard", "kpi-", "metric-chart")):
        return phase_from_index(local_id, 4), "metric"
    if template == "optimization-loop" and local_id.startswith(("loop-core", "loop-alert", "loop-signal")):
        return phase_from_index(local_id, 3), "process"
    if "evidence" in local_id or "table" in local_id:
        return 5, "evidence"
    if "metric" in local_id or "chart" in local_id or "kpi-chip" in local_id:
        return 5, "metric"
    if "msg-" in local_id:
        return phase_from_index(local_id, 4), "process"
    if "step-" in local_id:
        return phase_from_index(local_id, 6), "process"
    if template == "dt-cqt-concept":
        if local_id.startswith(("dt-", "cqt-", "road-", "packet-", "car", "building", "room", "hub", "gps", "log")):
            return phase_from_index(local_id, 2), "concept"
    if template == "signaling-ladder":
        if local_id.startswith(("actor-", "ladder-")):
            return None, "base"
    return 3, "concept"


def site_survey_phase(local_id: str) -> int | None:
    if local_id.startswith(("site-panel", "site-label", "floor-plan", "room-", "pin-icon")):
        return 2
    if local_id.startswith(("rack-panel", "rack-label", "rack", "device-", "aau-", "bbu-", "rru-", "rack-icon")):
        return 3
    if local_id.startswith(("support-", "power", "transmission", "ground")):
        return 4
    if local_id.startswith(("form-panel", "form-label", "form-", "photo-icon")):
        return 5
    return None


def phase_from_index(value: str, fallback: int) -> int:
    match = re.search(r"(\d+)", value)
    if not match:
        return fallback
    return max(1, min(6, int(match.group(1))))


def site_survey_elements(project_id: str, plan: list[dict[str, str]], metrics: list[dict[str, str]], primary: str, accent: str, success: str) -> list[dict[str, Any]]:
    eid = lambda name: f"{project_id}-{name}"
    colors = [primary, accent, success, "#7c3aed", "#dc2626", "#0891b2"]
    elements: list[dict[str, Any]] = [
        ppt_shape(eid("site-panel"), 56, 134, 274, 222, "#ecfdf5", "#99f6e4", 18, 0.94, "diagram", animation_track("fade", 120, 520)),
        ppt_shape(eid("rack-panel"), 364, 134, 272, 222, "#eff6ff", "#bfdbfe", 18, 0.94, "diagram", animation_track("fade", 180, 520)),
        ppt_shape(eid("form-panel"), 670, 134, 274, 222, "#fff7ed", "#fed7aa", 18, 0.94, "diagram", animation_track("fade", 240, 520)),
        ppt_text(eid("site-label"), 82, 154, 130, 22, '<p style="font-size:15px;font-weight:950;color:#0f766e;">站址/机房</p>', 8, 1, role="diagram"),
        ppt_text(eid("rack-label"), 392, 154, 132, 22, '<p style="font-size:15px;font-weight:950;color:#2563eb;">设备/配套</p>', 8, 1, role="diagram"),
        ppt_text(eid("form-label"), 700, 154, 142, 22, '<p style="font-size:15px;font-weight:950;color:#c2410c;">表单/证据</p>', 8, 1, role="diagram"),
        ppt_shape(eid("floor-plan"), 94, 204, 178, 104, "#ffffff", primary, 12, 1, "model", animation_track("draw", 360, 760)),
        ppt_shape(eid("room-a"), 112, 224, 62, 58, "#d1fae5", primary, 8, 1, "diagram", animation_track("scale", 460, 520)),
        ppt_shape(eid("room-b"), 188, 224, 62, 58, "#f0fdfa", primary, 8, 1, "diagram", animation_track("scale", 520, 520)),
        ppt_shape(eid("rack"), 432, 188, 98, 132, "#ffffff", accent, 10, 1, "model", animation_track("scale", 440, 620)),
        ppt_shape(eid("device-aau"), 450, 208, 62, 26, "#dbeafe", accent, 6, 1, "diagram", animation_track("rise", 540, 420)),
        ppt_shape(eid("device-bbu"), 450, 246, 62, 26, "#e0f2fe", accent, 6, 1, "diagram", animation_track("rise", 600, 420)),
        ppt_shape(eid("device-rru"), 450, 284, 62, 22, "#eff6ff", accent, 6, 1, "diagram", animation_track("rise", 660, 420)),
        ppt_shape(eid("form-sheet"), 724, 188, 134, 142, "#ffffff", success, 10, 1, "model", animation_track("scale", 520, 580)),
    ]
    elements.extend([
        ppt_icon(eid("pin-icon"), "pin", 136, 182, 34, primary, animation=animation_track("pulse", 580, 720, True)),
        ppt_icon(eid("rack-icon"), "tower", 542, 190, 36, accent, animation=animation_track("pulse", 660, 720, True)),
        ppt_icon(eid("photo-icon"), "camera", 778, 158, 34, success, animation=animation_track("rise", 720, 520)),
        ppt_icon(eid("form-icon"), "log", 862, 220, 34, success, animation=animation_track("rise", 780, 520)),
        ppt_text(eid("room-a-text"), 124, 244, 38, 16, '<p style="font-size:10px;font-weight:950;color:#0f766e;text-align:center;">机房</p>', 4, 1, role="diagram"),
        ppt_text(eid("room-b-text"), 200, 244, 38, 16, '<p style="font-size:10px;font-weight:950;color:#0f766e;text-align:center;">走线</p>', 4, 1, role="diagram"),
        ppt_text(eid("aau-text"), 464, 214, 34, 14, '<p style="font-size:10px;font-weight:950;color:#2563eb;text-align:center;">AAU</p>', 4, 1, role="diagram"),
        ppt_text(eid("bbu-text"), 464, 252, 34, 14, '<p style="font-size:10px;font-weight:950;color:#2563eb;text-align:center;">BBU</p>', 4, 1, role="diagram"),
        ppt_text(eid("rru-text"), 464, 288, 34, 14, '<p style="font-size:10px;font-weight:950;color:#2563eb;text-align:center;">RRU</p>', 4, 1, role="diagram"),
    ])
    support_items = [("power", "电源", "#7c3aed"), ("network", "传输", "#0891b2"), ("ground", "接地", "#ca8a04")]
    for index, (icon, label, color) in enumerate(support_items):
        left = 384 + index * 82
        elements.append(ppt_shape(eid(f"support-{index + 1}"), left, 328, 66, 28, "#ffffff", color, 12, 1, "diagram", animation_track("scale", 760 + index * 80, 420)))
        elements.append(ppt_icon(eid(f"support-{index + 1}-icon"), icon, left + 4, 326, 24, color, animation=animation_track("rise", 800 + index * 80, 420)))
        elements.append(ppt_text(eid(f"support-{index + 1}-text"), left + 28, 334, 30, 16, f'<p style="font-size:9px;font-weight:950;color:{color};text-align:center;">{label}</p>', 4, 1, role="diagram"))
    for index, label in enumerate(["站址", "经纬", "电源", "传输", "接地", "照片"], start=1):
        elements.append(ppt_text(eid(f"form-row-{index}"), 744, 198 + index * 18, 70, 14, f'<p style="font-size:10px;font-weight:850;color:#7c2d12;">{label}</p>', 4, 1, role="diagram"))
        elements.append(ppt_shape(eid(f"form-check-{index}"), 826, 201 + index * 18, 10, 10, "#fed7aa", success, 5, 1, "diagram", animation_track("scale", 740 + index * 40, 360)))
    step_slots = [(70, 410), (220, 410), (370, 410), (520, 410), (670, 410), (820, 410)]
    elements.extend(step_chain_elements(project_id, plan, step_slots, colors))
    elements.extend(line_elements(project_id, [
        *knowledge_order_lines(project_id, step_slots, colors),
        ((272, 256), (364, 256), primary, {"source": eid("floor-plan"), "target": eid("rack"), "kind": "data-flow"}),
        ((530, 256), (670, 256), accent, {"source": eid("rack"), "target": eid("form-sheet"), "kind": "process"}),
    ]))
    elements.extend(compact_badges(project_id, ["工单", "站址", "设备", "配套", "照片", "表单"], colors))
    chart = ppt_chart(eid("metric-chart"), 92, 340, 168, 54, metrics_for_chart(metrics, ["完整", "准确", "可追溯"]))
    chart["role"] = "decor"
    elements.append(chart)
    elements.append(evidence_table(eid("evidence-table"), 690, 342, [{"step": "环境", "evidence": "照片"}, {"step": "设备", "evidence": "型号"}, {"step": "配套", "evidence": "状态"}]))
    elements.extend(caption(project_id, "室内采集按站址、设备、配套、表单四类证据闭环。"))
    return elements


def dt_cqt_elements(project_id: str, plan: list[dict[str, str]], metrics: list[dict[str, str]], primary: str, accent: str, success: str) -> list[dict[str, Any]]:
    eid = lambda name: f"{project_id}-{name}"
    colors = [primary, accent, success, "#7c3aed", "#ca8a04", "#0891b2"]
    elements: list[dict[str, Any]] = [
        ppt_shape(eid("dt-field"), 58, 134, 388, 246, "#eff6ff", "#bfdbfe", 18, 0.9, "decor", animation_track("fade", 120, 520)),
        ppt_shape(eid("cqt-field"), 554, 134, 388, 246, "#fff7ed", "#fed7aa", 18, 0.9, "decor", animation_track("fade", 180, 520)),
        ppt_text(eid("dt-label"), 82, 152, 132, 24, '<p style="font-size:18px;font-weight:950;color:#1d4ed8;">DT</p>', 4, 1, role="subtitle"),
        ppt_text(eid("cqt-label"), 578, 152, 132, 24, '<p style="font-size:18px;font-weight:950;color:#c2410c;">CQT</p>', 4, 1, role="subtitle"),
        ppt_shape(eid("road-1"), 100, 250, 292, 20, "#dbeafe", primary, 10, 1, "diagram", animation_track("draw", 360, 760)),
        ppt_shape(eid("road-2"), 146, 308, 242, 18, "#dbeafe", primary, 9, 1, "diagram", animation_track("draw", 460, 760)),
        ppt_shape(eid("building"), 656, 188, 168, 132, "#ffffff", accent, 14, 1, "diagram", animation_track("scale", 320, 560)),
        ppt_shape(eid("hub"), 424, 224, 152, 88, "#ffffff", success, 18, 1, "model", animation_track("scale", 420, 560)),
        ppt_text(eid("hub-text"), 442, 246, 116, 36, '<p style="font-size:15px;font-weight:950;color:#0f766e;text-align:center;">GPS + LOG</p>', 9, 1, role="model"),
    ]
    elements.extend([
        ppt_icon(eid("dt-car-icon"), "car", 310, 218, 50, primary, animation=animation_track("flow", 560, 820, True)),
        ppt_icon(eid("cqt-pin-icon"), "pin", 830, 168, 46, accent, animation=animation_track("pulse", 620, 720, True)),
        ppt_icon(eid("gps-icon"), "satellite", 436, 178, 38, success, animation=animation_track("pulse", 680, 720, True)),
        ppt_icon(eid("log-icon"), "log", 524, 178, 38, success, animation=animation_track("rise", 720, 520)),
    ])
    for index, (left, top) in enumerate([(118, 238), (188, 238), (262, 238), (142, 296), (226, 296)], start=1):
        elements.append(ppt_shape(eid(f"packet-{index:02d}"), left, top, 18, 18, colors[index % 6], colors[index % 6], 9, 0.85, "diagram", animation_track("pulse", 760 + index * 80, 560, True)))
    for row in range(2):
        for col in range(3):
            left = 682 + col * 40
            top = 210 + row * 44
            elements.append(ppt_shape(eid(f"room-{row}-{col}"), left, top, 24, 24, "#ffedd5", accent, 6, 1, "diagram", animation_track("scale", 520 + (row * 3 + col) * 50, 420)))
    step_slots = [(84, 416), (232, 416), (380, 416), (528, 416), (676, 416), (824, 416)]
    elements.extend(step_chain_elements(project_id, plan, step_slots, colors))
    elements.extend(line_elements(project_id, [
        *knowledge_order_lines(project_id, step_slots, colors),
        ((392, 260), (424, 260), primary, {"source": eid("road-1"), "target": eid("hub"), "kind": "data-flow"}),
        ((576, 260), (656, 260), accent, {"source": eid("hub"), "target": eid("building"), "kind": "process"}),
    ]))
    elements.extend(message_badges(project_id, ["路线", "点位", "GPS", "LOG", "异常", "复测"], colors))
    elements.append(ppt_chart(eid("metric-chart"), 760, 324, 152, 52, metrics_for_chart(metrics, ["RSRP", "SINR", "接入"])))
    elements.append(evidence_table(eid("evidence-table"), 88, 328, [{"step": "DT", "evidence": "连续轨迹"}, {"step": "CQT", "evidence": "定点体验"}, {"step": "输出", "evidence": "问题点"}]))
    elements.extend(caption(project_id, "DT 看连续覆盖，CQT 看重点体验。"))
    return elements


def test_process_elements(project_id: str, plan: list[dict[str, str]], metrics: list[dict[str, str]], primary: str, accent: str, success: str) -> list[dict[str, Any]]:
    colors = [primary, accent, success, "#f59e0b", "#dc2626", "#0891b2"]
    elements = [ppt_shape(f"{project_id}-process-lane", 72, 176, 856, 176, "#f0fdfa", "#99f6e4", 18, 0.9, "decor", animation_track("fade", 140, 520))]
    process_icons = ["wrench", "phone", "satellite", "log", "warning", "check"]
    for index, icon in enumerate(process_icons, start=1):
        elements.append(ppt_icon(f"{project_id}-process-icon-{index:02d}", icon, 114 + (index - 1) * 148, 156, 36, colors[(index - 1) % len(colors)], animation=animation_track("rise", 420 + index * 60, 520)))
    for index, color in enumerate(colors, start=1):
        elements.append(ppt_shape(f"{project_id}-device-dot-{index:02d}", 126 + (index - 1) * 148, 198, 16, 16, color, color, 8, 0.86, "diagram", animation_track("pulse", 520 + index * 60, 520, True)))
    step_slots = [(94, 232), (242, 232), (390, 232), (538, 232), (686, 232), (834, 232)]
    elements.extend(step_chain_elements(project_id, plan, step_slots, colors))
    elements.extend(line_elements(project_id, [*knowledge_order_lines(project_id, step_slots, colors)]))
    elements.extend(message_badges(project_id, ["终端", "GPS", "脚本", "LOG", "标注", "报告"], colors))
    elements.append(evidence_table(f"{project_id}-evidence-table", 108, 388, [{"step": "工具", "evidence": "可用"}, {"step": "数据", "evidence": "可回放"}, {"step": "结论", "evidence": "可复测"}]))
    elements.append(ppt_chart(f"{project_id}-metric-chart", 724, 386, 172, 58, metrics_for_chart(metrics, ["覆盖", "质量", "业务"])))
    elements.extend(caption(project_id, "测试基础先保链路可用，再保数据可回放。"))
    return elements


def signaling_ladder_elements(project_id: str, plan: list[dict[str, str]], metrics: list[dict[str, str]], primary: str, accent: str, success: str) -> list[dict[str, Any]]:
    actors = [("UE", 94), ("gNB", 258), ("AMF", 422), ("SMF", 586), ("UPF", 750)]
    colors = [primary, accent, "#7c3aed", success, "#ca8a04", "#0891b2"]
    elements: list[dict[str, Any]] = []
    for index, (label, left) in enumerate(actors):
        elements.append(ppt_icon(f"{project_id}-actor-{index}-icon", icon_for_label(label), left + 30, 104, 34, colors[index], animation=animation_track("rise", 220 + index * 70, 480)))
        elements.append(ppt_shape(f"{project_id}-actor-{index}", left, 138, 92, 48, "#ffffff", colors[index], 14, 1, "diagram", animation_track("scale", 280 + index * 70, 520)))
        elements.append(ppt_text(f"{project_id}-actor-{index}-text", left + 12, 150, 68, 22, f'<p style="font-size:16px;font-weight:950;color:{colors[index]};text-align:center;">{label}</p>', 4, 1, role="diagram"))
        elements.append(ppt_line(f"{project_id}-ladder-{index}", (left + 46, 188), (left + 46, 388), "#cbd5e1", animation_track("draw", 420, 700)))
    y_positions = [224, 252, 280, 308, 336, 364]
    line_defs = []
    for index, y in enumerate(y_positions):
        start_x = 140 + (index % 4) * 164
        end_x = start_x + 164
        if index % 2:
            start_x, end_x = end_x, start_x
        source_actor = index % 4
        target_actor = source_actor + 1
        if index % 2:
            source_actor, target_actor = target_actor, source_actor
        line_defs.append(((start_x, y), (end_x, y), colors[index], {
            "source": f"{project_id}-actor-{source_actor}",
            "target": f"{project_id}-actor-{target_actor}",
            "kind": relation_for_line(index + 1, len(y_positions)),
        }))
    step_slots = [(88, 422), (236, 422), (384, 422), (532, 422), (680, 422), (828, 422)]
    elements.extend(line_elements(project_id, [
        *knowledge_order_lines(project_id, step_slots, colors),
        *[(start, end, color, metadata) for start, end, color, metadata in line_defs[:4]],
    ]))
    elements.extend(step_chain_elements(project_id, plan, step_slots, colors))
    elements.extend(message_badges(project_id, ["RRC", "NAS", "N2", "N4", "N3", "KPI"], colors))
    elements.append(evidence_table(f"{project_id}-evidence-table", 82, 338, [{"step": "消息", "evidence": "顺序"}, {"step": "节点", "evidence": "归因"}, {"step": "定时器", "evidence": "断点"}]))
    elements.append(ppt_chart(f"{project_id}-metric-chart", 748, 336, 168, 56, metrics_for_chart(metrics, ["RRC", "NAS", "PDU"])))
    elements.extend(caption(project_id, "信令按节点读，异常按方向、定时器和原因值定位。"))
    return elements


def kpi_diagnosis_elements(project_id: str, plan: list[dict[str, str]], metrics: list[dict[str, str]], primary: str, accent: str, success: str) -> list[dict[str, Any]]:
    colors = [primary, accent, success, "#f59e0b", "#2563eb", "#dc2626"]
    elements: list[dict[str, Any]] = [
        ppt_shape(f"{project_id}-dashboard", 314, 148, 372, 216, "#ffffff", "#ddd6fe", 18, 0.96, "model", animation_track("scale", 260, 560)),
        ppt_chart(f"{project_id}-metric-chart", 354, 190, 292, 116, metrics_for_chart([], [str(item["label"]) for item in plan[:4]])),
    ]
    elements.extend([
        ppt_icon(f"{project_id}-kpi-gauge-icon", "gauge", 476, 124, 42, primary, animation=animation_track("metric", 340, 620)),
        ppt_icon(f"{project_id}-kpi-chart-icon", "chart", 612, 146, 38, accent, animation=animation_track("rise", 420, 520)),
        ppt_icon(f"{project_id}-kpi-warning-icon", "warning", 326, 146, 38, "#dc2626", animation=animation_track("pulse", 520, 720, True)),
    ])
    for index, label in enumerate([str(item["label"]) for item in plan[:4]]):
        elements.append(ppt_shape(f"{project_id}-kpi-chip-{index}", 96 + index * 116, 388, 86, 34, "#ffffff", colors[index], 14, 1, "metric", animation_track("scale", 500 + index * 60, 420)))
        elements.append(ppt_text(f"{project_id}-kpi-chip-{index}-text", 108 + index * 116, 394, 62, 20, f'<p style="font-size:12px;font-weight:950;color:{colors[index]};text-align:center;">{label}</p>', 4, 1, role="metric"))
    step_slots = [(82, 230), (220, 174), (700, 174), (838, 230), (700, 422), (220, 422)]
    elements.extend(step_chain_elements(project_id, plan, step_slots, colors))
    elements.extend(line_elements(project_id, knowledge_order_lines(project_id, step_slots, colors)))
    elements.extend(message_badges(project_id, ["PM", "DT", "LOG", "TOPN", "小区", "复测"], colors))
    elements.append(evidence_table(f"{project_id}-evidence-table", 732, 326, [{"step": "趋势", "evidence": "变差"}, {"step": "分层", "evidence": "归类"}, {"step": "验证", "evidence": "对比"}]))
    elements.extend(caption(project_id, "KPI 诊断先定口径，再分层定位，最后用前后对比收口。"))
    return elements


def optimization_loop_elements(project_id: str, plan: list[dict[str, str]], metrics: list[dict[str, str]], primary: str, accent: str, success: str) -> list[dict[str, Any]]:
    colors = [primary, accent, success, "#f59e0b", "#7c3aed", "#0891b2"]
    slots = [(450, 142), (626, 216), (638, 380), (450, 448), (314, 382), (274, 216)]
    elements = [ppt_shape(f"{project_id}-loop-core", 390, 250, 220, 92, "#ffffff", "#bbf7d0", 22, 0.98, "model", animation_track("scale", 300, 560)), ppt_text(f"{project_id}-loop-core-text", 426, 276, 148, 34, '<p style="font-size:17px;font-weight:950;color:#15803d;text-align:center;">证据闭环</p>', 8, 1, role="model")]
    elements.extend([
        ppt_icon(f"{project_id}-loop-alert-icon", "warning", 430, 206, 36, colors[0], animation=animation_track("pulse", 420, 620, True)),
        ppt_icon(f"{project_id}-loop-wrench-icon", "wrench", 536, 316, 36, colors[3], animation=animation_track("rise", 520, 520)),
        ppt_icon(f"{project_id}-loop-check-icon", "check", 430, 356, 36, colors[5], animation=animation_track("scale", 620, 520)),
    ])
    for index, (left, top) in enumerate([(488, 218), (582, 250), (582, 344), (488, 376), (394, 344), (394, 250)], start=1):
        elements.append(ppt_shape(f"{project_id}-loop-signal-{index:02d}", left, top, 14, 14, colors[index - 1], colors[index - 1], 7, 0.82, "diagram", animation_track("pulse", 540 + index * 60, 520, True)))
    elements.extend(step_chain_elements(project_id, plan, slots, colors))
    elements.extend(line_elements(project_id, knowledge_order_lines(project_id, slots, colors)))
    elements.extend(message_badges(project_id, ["现象", "证据", "根因", "方案", "实施", "复测"], colors))
    elements.append(evidence_table(f"{project_id}-evidence-table", 64, 398, [{"step": "动作", "evidence": "责任"}, {"step": "风险", "evidence": "回退"}, {"step": "经验", "evidence": "沉淀"}]))
    elements.append(ppt_chart(f"{project_id}-metric-chart", 746, 394, 166, 58, metrics_for_chart(metrics, ["前", "后", "目标"])))
    elements.extend(caption(project_id, "优化不是一次动作，而是现象、证据、方案和复测的闭环。"))
    return elements


def step_chain_elements(project_id: str, plan: list[dict[str, str]], slots: list[tuple[int, int]], colors: list[str]) -> list[dict[str, Any]]:
    elements: list[dict[str, Any]] = []
    for index, step in enumerate(plan[: min(len(slots), stage_page_count(plan))]):
        left, top = slots[index]
        color = colors[index % len(colors)]
        target_id = f"{project_id}-step-{index + 1:02d}"
        label = html.escape(trim_text(str(step["label"]), 6))
        elements.append(ppt_shape(target_id, left, top, 104, 58, "#ffffff", color, 15, 1, "step", animation_track("scale", 360 + index * 70, 520)))
        elements.append(ppt_icon(f"{target_id}-icon", icon_for_label(str(step["label"])), left + 38, top + 7, 24, color, animation=animation_track("scale", 400 + index * 70, 420)))
        elements.append(ppt_text(f"{target_id}-label", left + 12, top + 34, 80, 20, f'<p style="font-size:12px;font-weight:950;color:#0f172a;text-align:center;">{label}</p>', 7, 1, role="step"))
    return elements


def build_template_actions(project_id: str, widget_id: str, template: str, plan: list[dict[str, str]]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []

    def push(action_type: str, **kwargs: Any) -> None:
        actions.append(action(project_id, len(actions) + 1, action_type, **kwargs))

    intro = template_intro_speech(
        template,
        TEMPLATE_INTROS.get(template, f"先看{TEMPLATE_LABELS[template]}的对象关系，再沿关键节点复盘证据。"),
    )
    push(
        "spotlight",
        title="总览",
        elementId=f"{project_id}-title",
        target=f"{project_id}-title",
        color=TEMPLATE_PALETTES[template][0],
        dimOpacity=0.006,
        focusPolicy="hold",
        currentTimeMs=0,
        durationMs=1100,
    )
    push(
        "speech",
        title="讲解总览",
        text=intro,
        spokenText=intro,
        caption=f"{TEMPLATE_LABELS[template]}：先看对象、证据和判据",
        displayText="总览",
        elementId=f"{project_id}-title",
        target=f"{project_id}-title",
        currentTimeMs=180,
    )

    page_count = stage_page_count(plan)
    phase_width = STANDARD_STAGE_DURATION_MS // page_count
    push("widget_setState", title="回到起点", widgetId=widget_id, state={"activeStep": 0, "currentTimeMs": 0}, durationMs=180)

    for index, step in enumerate(plan[:page_count], start=1):
        phase_start = (index - 1) * phase_width
        phase_end = STANDARD_STAGE_DURATION_MS if index == page_count else index * phase_width
        transition_time = max(0, phase_start - 520)
        transition_cutoff = phase_end - 520 if index < page_count else phase_end - 200
        focus_time = phase_start + 1300
        line_time = phase_start + 2600
        caption_time = phase_start + 3500
        caption_hold = max(0, transition_cutoff - caption_time - 850)
        target = stage_focus_target(project_id, template, index)
        line_target = f"{project_id}-line-{index}"
        caption_target = f"{project_id}-caption-text"
        relation = relation_for_line(index, page_count)
        line_effect = line_effect_for_relation(relation)
        edge_source = f"{project_id}-step-{index:02d}"
        edge_target = f"{project_id}-step-{(index % page_count) + 1:02d}"
        label = trim_text(str(step["label"]), 12)
        desc = trim_text(str(step.get("description") or label), 32)
        spoken = template_action_speech(template, label, desc, relation, index)
        caption_text = f"{label}：{desc}"

        if index > 1:
            push("widget_setState", title=f"准备{label}", widgetId=widget_id, state={"activeStep": index - 2, "currentTimeMs": transition_time}, durationMs=160)
            push(
                "widget_timelineCue",
                title=f"{label}切换",
                widgetId=widget_id,
                target=f"{project_id}-top-band",
                content="sceneTransition",
                state={"targets": [f"{project_id}-top-band"], "phase": index, "phaseLabel": label, "currentTimeMs": transition_time},
                currentTimeMs=transition_time,
                durationMs=1080,
            )
            push("widget_setState", title=f"进入{label}", widgetId=widget_id, state={"activeStep": index - 1, "currentTimeMs": phase_start}, durationMs=160)

        push(
            "spotlight" if index % 2 else "laser",
            title=label,
            content=caption_text,
            caption=trim_text(caption_text, 42),
            displayText=label,
            elementId=target,
            target=target,
            color=TEMPLATE_PALETTES[template][(index - 1) % 3],
            dimOpacity=default_spotlight_dim(target),
            focusPolicy="hold",
            currentTimeMs=focus_time,
            durationMs=max(900, phase_end - focus_time - 520),
        )
        push(
            "speech",
            title=f"{label}讲解",
            text=spoken,
            spokenText=spoken,
            caption=trim_text(caption_text, 42),
            displayText=label,
            elementId=target,
            target=target,
            dimOpacity=default_spotlight_dim(target),
            focusPolicy="hold",
            currentTimeMs=focus_time + 160,
            durationMs=5200,
        )
        push(
            "widget_timelineCue",
            title=f"{label}关系",
            widgetId=widget_id,
            target=line_target,
            content=line_effect,
            state={
                "targets": [line_target],
                "phase": index,
                "caption": label,
                "semantic": relation,
                "relationType": relation,
                "source": edge_source,
                "target": edge_target,
                "kind": relation,
                "speechId": actions[-1]["id"],
                "currentTimeMs": line_time,
                "holdMs": 350,
            },
            currentTimeMs=line_time,
            durationMs=1000,
            holdMs=350,
        )
        push(
            "widget_timelineCue",
            title=f"{label}要点",
            widgetId=widget_id,
            target=caption_target,
            content="captionUpdate",
            state={"targets": [caption_target], "phase": index, "caption": caption_text, "phaseLabel": label, "currentTimeMs": caption_time, "holdMs": caption_hold},
            currentTimeMs=caption_time,
            durationMs=850,
            holdMs=caption_hold,
        )

    push(
        "laser",
        title="复盘指向",
        content="复盘结论：顺序、证据和复测要闭合",
        caption="复盘结论：顺序、证据和复测要闭合",
        displayText="复盘",
        elementId=f"{project_id}-caption-text",
        target=f"{project_id}-caption-text",
        color="#0f766e",
        currentTimeMs=STANDARD_STAGE_DURATION_MS - 1800,
        durationMs=1600,
    )
    return actions


def action(project_id: str, index: int, action_type: str, **kwargs: Any) -> dict[str, Any]:
    item = {"id": f"{project_id}-template-action-{index:03d}", "type": action_type, **kwargs}
    if action_type == "speech":
        text = str(item.get("text") or item.get("content") or "")
        item.setdefault("text", text)
        item.setdefault("spokenText", text)
        item.setdefault("caption", trim_text(text, 58))
        item.setdefault("displayText", item["caption"])
        item.setdefault("durationMs", 4200)
    return item


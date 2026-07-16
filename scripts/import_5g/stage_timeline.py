"""Shared timeline templates for generated DGBook teaching stages."""

from __future__ import annotations

from typing import Any


STANDARD_STAGE_DURATION_MS = 610_000
MIN_STAGE_PAGE_COUNT = 4
MAX_STAGE_PAGE_COUNT = 6
MAX_STAGE_ELEMENTS_PER_PAGE = 28
MAX_STAGE_SEMANTIC_ARROWS_PER_PAGE = 2
MAX_STAGE_TEXT_BUDGET = 112
KNOWLEDGE_CUE_INTERVAL_MS = 7_600
SEMANTIC_RELATIONS = ("process", "dependency", "data-flow", "cause", "feedback")


def stage_page_count(plan: list[dict[str, str]]) -> int:
    """Clamp generated stage pages to the intended 4-6 teaching beats."""
    meaningful = [item for item in plan if item]
    return max(MIN_STAGE_PAGE_COUNT, min(MAX_STAGE_PAGE_COUNT, len(meaningful) or MIN_STAGE_PAGE_COUNT))


def stage_plan_items(plan: list[dict[str, str]]) -> list[dict[str, str]]:
    count = stage_page_count(plan)
    items = list(plan[:count])
    while len(items) < count:
        items.append({})
    return items


def build_standard_stage_timeline(project_id: str, plan: list[dict[str, str]]) -> dict[str, Any]:
    pages = stage_plan_items(plan)
    phase_count = len(pages)
    phase_width = STANDARD_STAGE_DURATION_MS // phase_count
    cues: list[dict[str, Any]] = []

    def label_for(index: int) -> str:
        item = pages[index]
        return str(item.get("label") or f"Stage {index + 1}")

    def summary_for(index: int) -> str:
        item = pages[index]
        return str(item.get("description") or item.get("label") or f"Stage {index + 1}")

    def relation_for(index: int) -> str:
        if index == phase_count - 1:
            return "feedback"
        return SEMANTIC_RELATIONS[index % (len(SEMANTIC_RELATIONS) - 1)]

    def semantic_edge_for(phase: int, relation: str) -> dict[str, str]:
        target_phase = phase + 1 if phase < phase_count else 1
        return {
            "source": f"{project_id}-step-{phase:02d}",
            "target": f"{project_id}-step-{target_phase:02d}",
            "kind": relation,
        }

    def add_cue(
        effect: str,
        phase: int,
        at_ms: int,
        duration_ms: int,
        target: str,
        *,
        hold_ms: int = 0,
        payload: dict[str, Any] | None = None,
    ) -> None:
        cues.append({
            "id": f"{project_id}-cue-{len(cues) + 1:03d}",
            "atMs": at_ms,
            "durationMs": duration_ms,
            "holdMs": hold_ms,
            "targets": [target],
            "effect": effect,
            "blocking": False,
            "beatId": f"{project_id}-beat-{phase:02d}",
            "startPolicy": "absolute",
            "exitPolicy": "auto",
            "payload": {"phase": phase, "cursorTimeMs": at_ms, **(payload or {})},
        })

    for index, _item in enumerate(pages):
        phase = index + 1
        phase_start = index * phase_width
        phase_end = STANDARD_STAGE_DURATION_MS if phase == phase_count else (index + 1) * phase_width
        relation = relation_for(index)
        edge = semantic_edge_for(phase, relation)
        label = label_for(index)
        summary = summary_for(index)
        step_target = f"{project_id}-step-{phase:02d}"
        line_target = f"{project_id}-line-{phase}"
        transition_cutoff = phase_end - 520 if phase < phase_count else phase_end - 200
        focus_start = phase_start + 1_300
        focus_hold = max(600, transition_cutoff - focus_start - 900)
        caption_start = phase_start + 3_500
        caption_hold = max(600, transition_cutoff - caption_start - 850)
        flow_effect = "packetMove" if relation == "data-flow" else "flow" if relation in {"process", "feedback"} else "draw"
        edge_payload = {
            "label": label,
            "caption": label,
            "semantic": relation,
            "relationType": relation,
            **edge,
            "color": ["#0891b2", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed"][index % 5],
        }

        add_cue("enter", phase, phase_start + 500, 700, step_target, payload={"label": label, "caption": label})
        if phase > 1:
            add_cue(
                "whiteboardClear",
                phase,
                phase_start + 120,
                80,
                f"{project_id}-top-band",
                payload={"phase": phase},
            )
        add_cue(
            "whiteboardShape",
            phase,
            phase_start + 780,
            780,
            step_target,
            hold_ms=1_550,
            payload={
                "x": 54,
                "y": 48,
                "width": 214,
                "height": 58,
                "shape": "rect",
                "color": edge_payload["color"],
                "label": label,
                "caption": label,
            },
        )
        add_cue(
            "whiteboardLine",
            phase,
            phase_start + 1_020,
            720,
            line_target,
            hold_ms=1_100,
            payload={
                "x1": 72,
                "y1": 86,
                "x2": 242,
                "y2": 86,
                "width": 5,
                "color": edge_payload["color"],
                "label": label,
                "caption": label,
            },
        )
        add_cue(
            "whiteboardText",
            phase,
            phase_start + 1_520,
            920,
            step_target,
            hold_ms=1_400,
            payload={
                "x": 72,
                "y": 74,
                "text": label[:16],
                "color": edge_payload["color"],
                "label": label,
                "caption": label,
            },
        )
        if phase % 2:
            add_cue(
                "whiteboardChart",
                phase,
                phase_start + 1_880,
                900,
                step_target,
                hold_ms=1_250,
                payload={
                    "x": 296,
                    "y": 58,
                    "width": 150,
                    "height": 72,
                    "values": [0.35, 0.58, 0.46, 0.76],
                    "color": edge_payload["color"],
                    "label": label,
                    "caption": label,
                },
            )
        else:
            add_cue(
                "whiteboardTable",
                phase,
                phase_start + 1_880,
                900,
                step_target,
                hold_ms=1_250,
                payload={
                    "x": 296,
                    "y": 58,
                    "width": 160,
                    "height": 74,
                    "rows": 3,
                    "cols": 3,
                    "color": edge_payload["color"],
                    "label": label,
                    "caption": label,
                },
            )
        add_cue(
            "whiteboardFormula" if phase % 2 else "whiteboardCode",
            phase,
            phase_start + 2_150,
            900,
            step_target,
            hold_ms=1_150,
            payload={
                "x": 468,
                "y": 56,
                "width": 220,
                "height": 58,
                "formula": "RSRP < -110 dBm",
                "lines": ["if KPI drop:", "  check evidence", "  retest route"],
                "color": edge_payload["color"],
                "label": label,
                "caption": label,
            },
        )
        add_cue(
            "spotlight" if phase % 2 else "laser",
            phase,
            focus_start,
            900,
            step_target,
            hold_ms=focus_hold,
            payload={"label": label, "caption": label, "phaseLabel": label},
        )
        add_cue(flow_effect, phase, phase_start + 2_600, 1_000, line_target, hold_ms=350, payload={**edge_payload, "repeat": relation == "process"})
        add_cue(
            "captionUpdate",
            phase,
            caption_start,
            850,
            f"{project_id}-caption-text",
            hold_ms=caption_hold,
            payload={"label": label, "caption": summary, "phaseLabel": label},
        )

        add_cue(
            "cameraPan" if phase % 2 else "cameraZoom",
            phase,
            min(transition_cutoff - 1_600, phase_start + max(8_000, phase_width // 2)),
            820,
            step_target,
            hold_ms=900,
            payload={
                "label": label,
                "caption": label,
                "fromScale": 1,
                "scale": 1.018 if phase % 2 == 0 else 1,
                "fromX": 0,
                "x": -10 if phase % 2 else 0,
                "fromY": 0,
                "y": 6 if phase % 2 else -6,
            },
        )
        cursor_time = phase_start + 8_200
        beat_index = 0
        while cursor_time + 900 <= transition_cutoff:
            effect = "pulse" if beat_index % 3 else "captionUpdate"
            target = step_target if effect == "pulse" else f"{project_id}-caption-text"
            add_cue(
                effect,
                phase,
                cursor_time,
                620,
                target,
                hold_ms=420,
                payload={"label": label, "caption": label, "phaseLabel": label},
            )
            beat_index += 1
            cursor_time += KNOWLEDGE_CUE_INTERVAL_MS

        if phase == max(2, phase_count - 1):
            add_cue(
                "tableRowReveal",
                phase,
                min(phase_end - 1_600, phase_start + 4_600),
                650,
                f"{project_id}-evidence-table",
                hold_ms=900,
                payload={"label": label, "rowCount": 2},
            )
        if phase == phase_count:
            add_cue(
                "countUp",
                phase,
                min(phase_end - 1_700, phase_start + 4_900),
                700,
                f"{project_id}-metric-chart",
                hold_ms=900,
                payload={"label": label, "from": 0, "to": 88, "suffix": "%"},
            )

    cues.extend(phase_transition_cues(project_id, STANDARD_STAGE_DURATION_MS, [label_for(i) for i in range(phase_count)], phase_count))
    cues.sort(key=lambda item: int(item.get("atMs", 0)))
    return {"durationMs": STANDARD_STAGE_DURATION_MS, "cues": cues}


def build_standard_stage_pages(project_id: str, plan: list[dict[str, str]]) -> list[dict[str, Any]]:
    pages = []
    items = stage_plan_items(plan)
    phase_count = len(items)
    phase_width = STANDARD_STAGE_DURATION_MS // phase_count
    for index, item in enumerate(items):
        phase = index + 1
        title = str(item.get("label") or f"Page {phase}")
        start_ms = index * phase_width
        pages.append({
            "id": f"{project_id}-page-{phase:02d}",
            "phase": phase,
            "knowledgeIndex": phase,
            "title": title,
            "summary": str(item.get("description") or title),
            "focusElementId": f"{project_id}-step-{phase:02d}",
            "semanticEdgeId": f"{project_id}-line-{phase}",
            "constraints": {
                "maxElements": MAX_STAGE_ELEMENTS_PER_PAGE,
                "maxSemanticArrows": MAX_STAGE_SEMANTIC_ARROWS_PER_PAGE,
                "textBudget": MAX_STAGE_TEXT_BUDGET,
            },
            "startMs": start_ms,
            "durationMs": phase_width if phase < phase_count else STANDARD_STAGE_DURATION_MS - start_ms,
        })
    return pages


def phase_transition_cues(project_id: str, duration_ms: int, captions: list[str], phase_count: int) -> list[dict[str, Any]]:
    phase_width = duration_ms // phase_count
    return [
        {
            "id": f"{project_id}-phase-transition-{phase:02d}",
            "atMs": max(900, (phase - 1) * phase_width - 520),
            "durationMs": 1_080,
            "holdMs": 0,
            "targets": [f"{project_id}-top-band"],
            "effect": "sceneTransition",
            "blocking": False,
            "beatId": f"{project_id}-phase-{phase:02d}",
            "startPolicy": "absolute",
            "exitPolicy": "auto",
            "payload": {
                "phase": phase,
                "label": f"Phase {phase}",
                "style": "sweep",
                "phaseLabel": captions[(phase - 1) % len(captions)] if captions else f"Phase {phase}",
                "cursorTimeMs": max(900, (phase - 1) * phase_width - 520),
            },
        }
        for phase in range(2, phase_count + 1)
    ]

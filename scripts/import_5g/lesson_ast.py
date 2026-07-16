"""Lesson AST sidecar output for the 5G DOCX importer."""

from __future__ import annotations

import re
from typing import Any


def build_lesson_ast(
    *,
    task: Any,
    project: Any,
    task_index: int,
    blocks: list[Any],
    sections: list[dict[str, Any]],
    steps: list[dict[str, str]],
    scenario: str,
    scenario_label: str,
    metrics: list[dict[str, str]],
    storyboard: dict[str, Any] | None = None,
    source_path: str = "content/5g/5g.docx",
) -> dict[str, Any]:
    project_id = str(getattr(task, "generated_id", ""))
    title = str(getattr(task, "title", ""))
    source_no = str(getattr(task, "source_no", ""))
    project_title = str(getattr(project, "title", ""))

    return {
        "schema": "dgbook.lesson-ast/v1",
        "source": {
            "kind": "docx",
            "path": source_path,
            "importer": "scripts/import-5g-docx.py",
        },
        "project": {
            "id": project_id,
            "title": title,
            "sourceNo": source_no,
            "chapterTitle": project_title,
            "taskIndex": task_index + 1,
        },
        "lesson": {
            "id": project_id,
            "title": title,
            "widgetId": str(getattr(task, "widget_id", "")),
            "scenario": scenario,
            "scenarioLabel": scenario_label,
        },
        "content": {
            "sections": normalize_sections(sections),
            "blocks": normalize_blocks(blocks),
            "storyboard": normalize_storyboard(storyboard),
        },
        "knowledge": {
            "steps": normalize_steps(project_id, steps),
            "metrics": normalize_metrics(metrics),
        },
        "animation": {
            "templateHint": template_hint_for_scenario(scenario),
            "durationMs": 610000,
            "targets": [
                {
                    "id": f"{project_id}-step-{index + 1:02d}",
                    "label": step.get("label", ""),
                    "description": step.get("description", ""),
                }
                for index, step in enumerate(steps[:6])
            ],
        },
        "playback": {
            "mode": "one-way",
            "widgetId": str(getattr(task, "widget_id", "")),
        },
    }


def normalize_storyboard(storyboard: dict[str, Any] | None) -> dict[str, Any]:
    if not storyboard:
        return {}
    units = storyboard.get("knowledgeUnits", [])
    return {
        "schema": storyboard.get("schema", "dgbook.lesson-storyboard/v1"),
        "learningGoal": clean_text(storyboard.get("learningGoal", "")),
        "summary": clean_text(storyboard.get("summary", "")),
        "knowledgeUnits": [
            {
                "id": clean_text(unit.get("id", "")),
                "title": clean_text(unit.get("title", "")),
                "kind": clean_text(unit.get("kind", "")),
                "shortText": clean_text(unit.get("shortText", "")),
                "narrationText": clean_text(unit.get("narrationText", "")),
            }
            for unit in units
        ],
        "reviewSummary": storyboard.get("reviewSummary", {}),
    }


def normalize_sections(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for index, section in enumerate(sections):
        output.append(
            {
                "id": str(section.get("id") or f"section-{index + 1:02d}"),
                "title": clean_text(section.get("title") or f"Section {index + 1}"),
                "icon": str(section.get("icon") or "book"),
                "texts": [clean_text(text) for text in section.get("texts", []) if clean_text(text)],
            }
        )
    return output


def normalize_blocks(blocks: list[Any]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for index, block in enumerate(blocks):
        kind = str(getattr(block, "kind", "paragraph"))
        item: dict[str, Any] = {
            "id": f"block-{index + 1:03d}",
            "kind": "paragraph" if kind == "p" else kind,
            "order": index + 1,
        }
        text = clean_text(getattr(block, "text", ""))
        media = list(getattr(block, "media", []) or [])
        rows = getattr(block, "rows", []) or []
        if text:
            item["text"] = text
        if media:
            item["mediaRefs"] = [str(ref) for ref in media]
        if rows:
            item["rows"] = [[clean_text(cell) for cell in row] for row in rows]
        output.append(item)
    return output


def normalize_steps(project_id: str, steps: list[dict[str, str]]) -> list[dict[str, str]]:
    return [
        {
            "id": f"{project_id}-knowledge-{index + 1:02d}",
            "label": clean_text(step.get("label", "")),
            "description": clean_text(step.get("description", "")),
        }
        for index, step in enumerate(steps)
    ]


def normalize_metrics(metrics: list[dict[str, str]]) -> list[dict[str, str]]:
    return [
        {
            "label": clean_text(item.get("label", "")),
            "value": clean_text(item.get("value", "")),
        }
        for item in metrics
        if item.get("label") or item.get("value")
    ]


def template_hint_for_scenario(scenario: str) -> str:
    mapping = {
        "dtcqt": "dt-cqt-concept",
        "test-issues": "test-process",
        "test-analysis": "kpi-diagnosis",
        "signaling": "signaling-ladder",
    }
    return mapping.get(scenario, "optimization-loop")


def clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()

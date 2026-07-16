"""Reusable media and interactive attachment rules for generated lessons."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .edugame_rules import EDUGAME_RULES, build_edugame_config


def _load_manim_rules() -> dict[str, dict[str, Any]]:
    """Per-project Manim slot rules, externalized to config so a new textbook
    ships its own. Box coordinates round-trip as JSON lists -> tuples."""
    path = Path(__file__).resolve().parents[2] / "config" / "textbooks" / "5g" / "manim-rules.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    for rule in data.values():
        if isinstance(rule.get("box"), list):
            rule["box"] = tuple(rule["box"])
    return data


MANIM_RULES: dict[str, dict[str, Any]] = _load_manim_rules()

MANIM_STAGE_BOX = (82, 112, 836, 344)


def manim_template_id(project_id: str) -> str:
    rule = MANIM_RULES.get(project_id)
    return str(rule["template"]) if rule else ""


def manim_stage_template(project_id: str) -> str:
    rule = MANIM_RULES.get(project_id)
    if not rule:
        return ""
    return str(rule.get("stageTemplate", rule["template"]))


def manim_target_unit_id(project_id: str) -> str:
    rule = MANIM_RULES.get(project_id)
    return str(rule.get("targetUnitId", f"{project_id}-ku-03")) if rule else f"{project_id}-ku-03"


def optional_manim_tracks(project_id: str, template: str | None = None) -> list[dict[str, Any]]:
    rule = MANIM_RULES.get(project_id)
    if not rule:
        return []
    resolved_template = str(rule["template"])
    stage_template = str(rule.get("stageTemplate", resolved_template))
    if template and template not in {resolved_template, stage_template}:
        return []
    manifest = Path("site/public/media/manim") / project_id.lower() / resolved_template / "manifest.json"
    data = read_json(manifest)
    if data.get("status") != "rendered":
        return []
    outputs = data.get("outputs") if isinstance(data.get("outputs"), dict) else {}
    video_url = outputs.get("videoUrl")
    poster_url = outputs.get("posterUrl")
    if not video_url and not poster_url:
        return []
    left, top, width, height = rule.get("box", MANIM_STAGE_BOX)
    if bool(rule.get("dominant", True)):
        left, top, width, height = MANIM_STAGE_BOX
    return [{
        "id": f"{project_id}-manim-{resolved_template}",
        "kind": "manim" if video_url else "poster",
        "layer": "diagram",
        "beatIds": [f"{project_id}-beat-01", f"{project_id}-beat-02", f"{project_id}-beat-03"],
        "startMs": rule["startMs"],
        "durationMs": rule["durationMs"],
        "x": left,
        "y": top,
        "width": width,
        "height": height,
        "videoUrl": video_url,
        "posterUrl": poster_url,
        "manifestUrl": f"/media/manim/{project_id.lower()}/{resolved_template}/manifest.json",
        "fit": "contain",
        "opacity": 0.98,
    }]


def optional_project_widget_ids(project_id: str) -> list[str]:
    return [widget["id"] for widget in build_optional_project_widgets(project_id)]


def build_optional_project_widgets(project_id: str) -> list[dict[str, Any]]:
    rule = EDUGAME_RULES.get(project_id)
    if not rule:
        return []
    widget_id = str(rule["widgetId"])
    game_config = build_edugame_config(project_id, rule, None)
    return [{
        "id": widget_id,
        "widget": "edugame-pixi",
        "version": "0.1.0",
        "props": {
            "title": game_config["title"],
            "height": 720,
            "gameConfig": game_config,
        },
        "project": project_id,
        "status": "published",
        "history": [{
            "status": "published",
            "at": "2026-05-22T00:00:00.000Z",
            "by": "docx-importer",
            "comment": "Published by the DGBook importer.",
        }],
    }]


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

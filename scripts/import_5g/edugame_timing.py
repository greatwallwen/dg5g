"""Timing budget helpers for generated 5G EduGame challenges."""
from __future__ import annotations


def game_duration_sec(template_id: str, item_count: int, fallback: int) -> int:
    base_by_template = {
        "fault-hunt": 64,
        "route-runner": 68,
        "threshold-guard": 68,
        "risk-gate": 68,
        "device-connect": 82,
        "evidence-chain": 82,
        "signaling-order": 86,
        "card-flow": 90,
        "boss-review": 96,
    }
    base = base_by_template.get(template_id, 82)
    scaled = base + max(0, item_count - 6) * 4
    return max(60, min(min(fallback, 105), scaled))

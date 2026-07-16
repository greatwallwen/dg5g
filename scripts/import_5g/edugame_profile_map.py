"""Project-to-game template mapping for 5G EduGame generation."""

GAME_TEMPLATE_BY_PROJECT = {
    "P01": "device-connect",
    "P02": "evidence-chain",
    "P03": "evidence-chain",
    "P04": "route-runner",
    "P05": "card-flow",
    "P06": "kpi-guard",
    "P07": "device-connect",
    "P08": "boss-review",
    "P09": "risk-gate",
    "P10": "risk-gate",
    "P11": "card-flow",
    "P12": "kpi-guard",
    "P13": "card-flow",
    "P14": "match-3",
    "P15": "risk-gate",
    "P16": "kpi-guard",
    "P17": "signaling-order",
    "P18": "fault-hunt",
}

TEMPLATE_MECHANIC_FAMILY = {
    "quick-hit": "quick-hit",
    "quiz-rush": "quiz-rush",
    "memory-card": "memory-card",
    "drag-match": "drag-match",
    "sort-flow": "sort-flow",
    "card-battle": "memory-card",
    "match-3": "drag-match",
    "boss-review": "quick-hit",
    "pipe-connect": "drag-match",
    "device-assemble": "drag-match",
    "maze-troubleshoot": "quick-hit",
    "tower-defense": "quick-hit",
    "2048-merge": "drag-match",
    "minesweeper-risk": "quiz-rush",
    "rhythm-tap": "quick-hit",
    "timeline-build": "sort-flow",
    "case-detective": "quick-hit",
    "knowledge-map": "memory-card",
    "repair-sim": "drag-match",
    "lab-procedure": "drag-match",
    "classification-run": "drag-match",
    "resource-management": "drag-match",
    "scenario-choice": "quiz-rush",
    "checkpoint-adventure": "quick-hit",
}


CANONICAL_GAME_TYPE = {
    "device-connect": "pipe-connect",
    "evidence-chain": "drag-match",
    "route-runner": "quiz-rush",
    "kpi-guard": "quiz-rush",
    "risk-gate": "classification-run",
    "card-flow": "memory-card",
    "signaling-order": "sort-flow",
    "fault-hunt": "maze-troubleshoot",
    "boss-review": "boss-review",
}

CANONICAL_GAME_TYPE.update(TEMPLATE_MECHANIC_FAMILY)
CANONICAL_GAME_TYPE["match-3"] = "match-3"
CANONICAL_GAME_TYPE["boss-review"] = "boss-review"

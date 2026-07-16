"""Deterministic graph helpers for generated teaching-stage diagrams."""

from __future__ import annotations

from dataclasses import dataclass

SEMANTIC_LINE_KINDS = ("process", "dependency", "data-flow", "cause", "feedback")


@dataclass(frozen=True)
class LayoutRect:
    left: int
    top: int
    width: int
    height: int

    @property
    def center(self) -> tuple[int, int]:
        return (self.left + self.width // 2, self.top + self.height // 2)


def rect_from_slot(slot: tuple[int, int], width: int = 104, height: int = 58) -> LayoutRect:
    return LayoutRect(slot[0], slot[1], width, height)


def port(rect: LayoutRect, side: str) -> tuple[int, int]:
    if side == "left":
        return (rect.left, rect.top + rect.height // 2)
    if side == "right":
        return (rect.left + rect.width, rect.top + rect.height // 2)
    if side == "top":
        return (rect.left + rect.width // 2, rect.top)
    if side == "bottom":
        return (rect.left + rect.width // 2, rect.top + rect.height)
    return rect.center


def best_ports(source: LayoutRect, target: LayoutRect) -> tuple[tuple[int, int], tuple[int, int]]:
    sx, sy = source.center
    tx, ty = target.center
    dx = tx - sx
    dy = ty - sy
    if abs(dx) >= abs(dy):
        return (
            port(source, "right" if dx >= 0 else "left"),
            port(target, "left" if dx >= 0 else "right"),
        )
    return (
        port(source, "bottom" if dy >= 0 else "top"),
        port(target, "top" if dy >= 0 else "bottom"),
    )


def edge_line(
    source: LayoutRect,
    target: LayoutRect,
    color: str,
    *,
    inset: int = 6,
) -> tuple[tuple[int, int], tuple[int, int], str]:
    start, end = best_ports(source, target)
    return (inset_point(start, end, inset), inset_point(end, start, inset), color)


def edge_kind(index: int, total: int) -> str:
    if total > 1 and index == total:
        return "feedback"
    return SEMANTIC_LINE_KINDS[(index - 1) % (len(SEMANTIC_LINE_KINDS) - 1)]


def knowledge_order_lines(
    project_id: str,
    slots: list[tuple[int, int]],
    colors: list[str],
    *,
    width: int = 104,
    height: int = 58,
) -> list[tuple[tuple[int, int], tuple[int, int], str, dict[str, str]]]:
    rects = [rect_from_slot(slot, width, height) for slot in slots]
    total = len(rects)
    lines: list[tuple[tuple[int, int], tuple[int, int], str, dict[str, str]]] = []
    for index, source_rect in enumerate(rects, start=1):
        target_index = index + 1 if index < total else 1
        target_rect = rects[target_index - 1]
        color = colors[(index - 1) % len(colors)]
        start, end, line_color = edge_line(source_rect, target_rect, color)
        lines.append((
            start,
            end,
            line_color,
            {
                "source": f"{project_id}-step-{index:02d}",
                "target": f"{project_id}-step-{target_index:02d}",
                "kind": edge_kind(index, total),
            },
        ))
    return lines


def serial_step_lines(
    slots: list[tuple[int, int]],
    colors: list[str],
    *,
    width: int = 104,
    height: int = 58,
) -> list[tuple[tuple[int, int], tuple[int, int], str]]:
    rects = [rect_from_slot(slot, width, height) for slot in slots]
    lines: list[tuple[tuple[int, int], tuple[int, int], str]] = []
    for index, source in enumerate(rects[:-1]):
        target = rects[index + 1]
        color = colors[index % len(colors)]
        lines.append(edge_line(source, target, color))
    return lines


def radial_step_lines(
    center: LayoutRect,
    slots: list[tuple[int, int]],
    colors: list[str],
    *,
    width: int = 104,
    height: int = 58,
) -> list[tuple[tuple[int, int], tuple[int, int], str]]:
    lines: list[tuple[tuple[int, int], tuple[int, int], str]] = []
    for index, slot in enumerate(slots):
        lines.append(edge_line(center, rect_from_slot(slot, width, height), colors[index % len(colors)]))
    return lines


def inset_point(start: tuple[int, int], end: tuple[int, int], inset: int) -> tuple[int, int]:
    sx, sy = start
    ex, ey = end
    dx = ex - sx
    dy = ey - sy
    if dx == 0 and dy == 0:
        return start
    if abs(dx) >= abs(dy):
        return (sx + (inset if dx > 0 else -inset), sy)
    return (sx, sy + (inset if dy > 0 else -inset))

"""Small SVG pictograms used by DGBook generated teaching stages."""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import quote


REPO_ROOT = Path(__file__).resolve().parents[2]
TABLER_ICON_DIR = REPO_ROOT / "research" / "vendor" / "tabler-icons" / "icons" / "outline"
TABLER_ICON_MAP = {
    "car": "car.svg",
    "route": "route.svg",
    "pin": "map-pin.svg",
    "satellite": "satellite.svg",
    "log": "clipboard-list.svg",
    "gauge": "gauge.svg",
    "warning": "alert-triangle.svg",
    "loop": "refresh.svg",
    "tower": "building-broadcast-tower.svg",
    "phone": "device-mobile.svg",
    "cloud": "cloud-network.svg",
    "check": "circle-check.svg",
    "clock": "clock.svg",
    "chart": "chart-bar.svg",
    "camera": "camera.svg",
    "power": "power.svg",
    "network": "network.svg",
    "ground": "plug-connected.svg",
    "wrench": "tools.svg",
    "server": "server.svg",
    "fiber": "route.svg",
    "spectrum": "chart-area-line.svg",
    "map": "map.svg",
    "nms": "device-desktop-analytics.svg",
    "handover": "arrows-exchange.svg",
    "node": "hexagon.svg",
}


def ppt_icon(
    element_id: str,
    kind: str,
    left: int,
    top: int,
    size: int,
    color: str,
    *,
    opacity: float = 0.92,
    animation: dict[str, Any] | None = None,
) -> dict[str, Any]:
    item: dict[str, Any] = {
        "id": element_id,
        "type": "image",
        "left": left,
        "top": top,
        "width": size,
        "height": size,
        "src": svg_data_uri(icon_svg(kind, color)),
        "alt": "",
        "ariaLabel": kind,
        "iconKind": kind,
        "objectFit": "contain",
        "opacity": opacity,
        "role": "decor",
    }
    if animation:
        item["animation"] = animation
    return item


def svg_data_uri(svg: str) -> str:
    return f"data:image/svg+xml;charset=utf-8,{quote(svg)}"


def icon_svg(kind: str, color: str) -> str:
    tabler = tabler_icon_svg(kind, color)
    if tabler:
        return tabler
    body = ICONS.get(kind, ICONS["node"])
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" '
        f'color="{color}" fill="none" stroke="{color}" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round">'
        f'<g>{body}</g></svg>'
    )


@lru_cache(maxsize=64)
def tabler_icon_body(kind: str) -> str:
    name = TABLER_ICON_MAP.get(kind)
    if not name:
        return ""
    path = TABLER_ICON_DIR / name
    if not path.exists():
        return ""
    source = path.read_text(encoding="utf-8")
    source = re.sub(r"<svg[^>]*>", "", source).replace("</svg>", "")
    source = re.sub(r"<!--.*?-->", "", source, flags=re.S)
    source = re.sub(r'<path stroke="none"[^>]*/>', "", source)
    source = source.replace('stroke="currentColor"', 'stroke="currentColor"')
    return source.strip()


def tabler_icon_svg(kind: str, color: str) -> str:
    body = tabler_icon_body(kind)
    if not body:
        return ""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" '
        f'color="{color}" fill="none" stroke="{color}" stroke-width="1.9" '
        f'stroke-linecap="round" stroke-linejoin="round">{body}</svg>'
    )


ICONS = {
    "car": '<path d="M14 39h36l-4.5-12h-27L14 39Z"/><path d="M18 39v6m28-6v6"/><circle cx="23" cy="46" r="3.8" fill="currentColor" stroke="none"/><circle cx="41" cy="46" r="3.8" fill="currentColor" stroke="none"/><path d="M24 27l2-6h12l2 6"/>',
    "route": '<path d="M15 49c8-18 20 8 32-17"/><circle cx="15" cy="49" r="4.5"/><circle cx="47" cy="32" r="4.5"/><path d="M27 20h14M34 13v14"/>',
    "pin": '<path d="M32 54s15-14 15-28a15 15 0 0 0-30 0c0 14 15 28 15 28Z"/><circle cx="32" cy="26" r="5.2"/>',
    "satellite": '<path d="M25 24l15 15"/><rect x="14" y="12" width="14" height="18" rx="3"/><rect x="36" y="34" width="14" height="18" rx="3"/><path d="M44 14c5 2 8 5 10 10M38 8c9 3 15 9 18 18"/>',
    "log": '<path d="M20 12h20l8 8v32H20z"/><path d="M40 12v10h8M26 30h16M26 38h16M26 46h10"/>',
    "gauge": '<path d="M14 43a18 18 0 0 1 36 0"/><path d="M32 42l12-12"/><path d="M20 43h24"/><path d="M20 33l4 4 5-8 6 9 8-13"/>',
    "warning": '<path d="M32 12 54 50H10L32 12Z"/><path d="M32 25v11M32 44h.1"/>',
    "loop": '<path d="M48 24a18 18 0 0 0-30-6l-4 4"/><path d="M14 14v8h8"/><path d="M16 40a18 18 0 0 0 30 6l4-4"/><path d="M50 50v-8h-8"/>',
    "tower": '<path d="M32 15v37M21 52h22M24 25l8-10 8 10M20 37l12-13 12 13"/><path d="M17 17c-5 5-7 10-7 16M47 17c5 5 7 10 7 16M24 18c-3 3-4 7-4 11M40 18c3 3 4 7 4 11"/>',
    "phone": '<rect x="22" y="10" width="20" height="44" rx="5"/><path d="M29 47h6"/>',
    "cloud": '<path d="M21 44h27a10 10 0 0 0 0-20 16 16 0 0 0-30-4A12 12 0 0 0 21 44Z"/><path d="M24 34h16M28 28h12M30 40h10"/>',
    "check": '<path d="M18 34l9 9 20-22"/><rect x="12" y="12" width="40" height="40" rx="10"/>',
    "clock": '<circle cx="32" cy="32" r="20"/><path d="M32 20v14l10 6"/>',
    "chart": '<path d="M14 48h38"/><path d="M20 42V28M32 42V18M44 42V24"/>',
    "camera": '<rect x="14" y="22" width="36" height="26" rx="6"/><path d="M24 22l4-6h8l4 6"/><circle cx="32" cy="35" r="8"/><path d="M44 28h.1"/>',
    "power": '<path d="M24 12v18M40 12v18"/><path d="M20 28h24v9a12 12 0 0 1-24 0v-9Z"/><path d="M32 49v7"/>',
    "network": '<rect x="12" y="14" width="16" height="14" rx="3"/><rect x="36" y="14" width="16" height="14" rx="3"/><rect x="24" y="38" width="16" height="14" rx="3"/><path d="M20 28v7h12M44 28v7H32"/>',
    "ground": '<path d="M32 12v24"/><path d="M20 36h24M24 44h16M28 52h8"/>',
    "wrench": '<path d="M44 15a12 12 0 0 0-15 15L15 44l5 5 14-14a12 12 0 0 0 15-15l-8 8-5-5 8-8Z"/>',
    "server": '<rect x="16" y="14" width="32" height="14" rx="3"/><rect x="16" y="36" width="32" height="14" rx="3"/><path d="M22 21h.1M22 43h.1M28 21h12M28 43h12"/>',
    "fiber": '<path d="M14 36c8-16 21 16 36-6"/><path d="M16 45c10-10 20 8 31-4"/><circle cx="17" cy="36" r="4"/><circle cx="49" cy="30" r="4"/>',
    "spectrum": '<path d="M14 48h38"/><path d="M18 44c4-18 8-18 12 0s8 18 12 0 6-12 10-4"/><path d="M22 18v8M32 14v12M42 20v6"/>',
    "map": '<path d="M14 18l12-5 12 5 12-5v33l-12 5-12-5-12 5V18Z"/><path d="M26 13v33M38 18v33"/><path d="M18 31c8-6 18 8 28-4"/>',
    "nms": '<circle cx="32" cy="32" r="8"/><path d="M32 12v8M32 44v8M12 32h8M44 32h8M18 18l6 6M46 18l-6 6M18 46l6-6M46 46l-6-6"/>',
    "handover": '<path d="M18 42a20 20 0 0 1 28 0"/><path d="M24 34a12 12 0 0 1 16 0"/><path d="M20 22h14m0 0-5-5m5 5-5 5"/><path d="M44 22H30m0 0 5-5m-5 5 5 5"/>',
    "node": '<circle cx="32" cy="32" r="9"/><path d="M32 12v11M32 41v11M12 32h11M41 32h11"/>',
}

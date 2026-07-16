"""MDX renderer for knowledge-first lesson storyboards."""

from __future__ import annotations

import html
import re
from typing import Any


def render_storyboard_page(storyboard: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    lines.extend(render_overview(storyboard))
    lines.append("")
    lines.extend(render_core_model(storyboard))
    lines.append("")
    for index, unit in enumerate(storyboard.get("knowledgeUnits", []), start=1):
        lines.extend(render_unit(index, unit, storyboard))
        lines.append("")
    lines.extend(render_review(storyboard))
    return lines


def render_overview(storyboard: dict[str, Any]) -> list[str]:
    return [
        '<section id="sec-overview" class="dg-story-overview" data-playback-region="overview">',
        '  <div id="sec-overview-summary" data-playback-target="sec-overview-summary guide-summary">',
        '    <span>导学摘要</span>',
        f"    <p>{esc(storyboard.get('summary', ''))}</p>",
        "  </div>",
        f'  <strong id="sec-learning-goal" data-playback-target="sec-learning-goal guide-learning-goal">{esc(storyboard.get("learningGoal", ""))}</strong>',
        "</section>",
    ]


def render_core_model(storyboard: dict[str, Any]) -> list[str]:
    visual = storyboard.get("visualModel", {})
    nodes = visual.get("nodes", [])[:5]
    metrics = visual.get("metrics", [])[:4]
    lines = [
        '<section id="sec-core-model" class="dg-core-model">',
        "  <header>",
        "    <span>概念解释</span>",
        f"    <h2>{esc(visual.get('title') or storyboard.get('title'))}</h2>",
        "  </header>",
        '  <div class="dg-core-model-grid">',
    ]
    for index, node in enumerate(nodes, start=1):
        lines.extend([
            f'    <article id="sec-core-model-node-{index}" class="dg-core-node">',
            f"      <b>{index}</b>",
            f"      <strong>{esc(node.get('label', '要点'))}</strong>",
            f"      <p>{esc(node.get('detail', ''))}</p>",
            "    </article>",
        ])
    lines.append("  </div>")
    if metrics:
        lines.append('  <div class="dg-core-metrics" aria-label="关键术语">')
        for metric in metrics:
            lines.append(f"    <span>{esc(metric)}</span>")
        lines.append("  </div>")
    lines.append("</section>")
    return lines


def render_unit(index: int, unit: dict[str, Any], storyboard: dict[str, Any]) -> list[str]:
    icon = esc(unit.get("icon", "book"))
    title = esc(unit.get("title", f"要点 {index}"))
    unit_id = esc(unit.get("id", f"unit-{index:02d}"))
    section_title = esc(unit.get("sectionTitle") or section_title_for_kind(str(unit.get("kind", "concept"))))
    step_title = f"{section_title}：{title}"
    lines = [f'<SectionStep icon="{icon}" num="{cn(index)}" title="{step_title}" id="{unit_id}" />', ""]
    lines.extend([
        f'<section id="{unit_id}-section" class="dg-knowledge-unit dg-knowledge-unit-{esc(unit.get("kind", "concept"))}" data-playback-region="{unit_id}">',
        f'  <div id="{unit_id}-body" class="dg-ku-main" data-playback-target="{unit_id}-body {unit_id}-content">',
        f"    <span class=\"dg-ku-section-label\">{section_title}</span>",
        f"    <p>{esc(unit.get('shortText', ''))}</p>",
        f"    <blockquote>{esc(unit.get('narrationText', ''))}</blockquote>",
        "  </div>",
        *render_unit_visual(unit),
    ])
    motion_slot = media_slot_for_unit(storyboard, unit.get("id", f"unit-{index:02d}"))
    if motion_slot:
        lines.extend(render_motion_clip(motion_slot, unit))
    if unit.get("kind") == "evidence":
        lines.extend(render_evidence(storyboard.get("evidenceGroups", [])))
    if unit.get("kind") == "practice":
        lines.extend(render_practice(unit))
    lines.append("</section>")
    return lines


def media_slot_for_unit(storyboard: dict[str, Any], unit_id: Any) -> dict[str, Any] | None:
    target = str(unit_id or "")
    for slot in storyboard.get("manimSlots", []):
        if str(slot.get("targetUnit", "")) == target:
            return slot
    return None


def render_motion_clip(slot: dict[str, Any], unit: dict[str, Any]) -> list[str]:
    video_url = esc(slot.get("videoUrl", ""))
    poster_url = esc(slot.get("posterUrl", ""))
    if not video_url:
        return []
    title = esc(unit.get("title", "机理讲解"))
    poster_attr = f' poster="{poster_url}"' if poster_url else ""
    return [
        '  <figure class="dg-concept-motion">',
        "    <figcaption>",
        "      <span>机理讲解</span>",
        f"      <strong>{title}</strong>",
        "    </figcaption>",
        f'    <video src="{video_url}"{poster_attr} controls preload="metadata" playsinline></video>',
        "  </figure>",
    ]


def render_unit_visual(unit: dict[str, Any]) -> list[str]:
    visual_id = esc(unit.get("visualId", "unit-visual"))
    title = esc(unit.get("title", ""))
    kind = str(unit.get("kind", "concept"))
    tokens = [esc(token) for token in unit.get("visualTokens", [])[:4] if str(token).strip()]
    if not tokens:
        tokens = ["对象", "证据", "判断", "复测"]
    if kind == "process":
        return render_token_flow(visual_id, title, tokens)
    if kind == "evidence":
        return render_token_cloud(visual_id, title, "dg-ku-evidence-chain", tokens)
    if kind == "practice":
        return render_practice_visual(visual_id, title, tokens)
    if kind == "criteria":
        return render_token_flow(visual_id, title, tokens)
    if kind == "model":
        return render_model_visual(visual_id, title, tokens)
    if kind == "review":
        return render_token_cloud(visual_id, title, "dg-ku-review", tokens)
    return [
        f'  <div id="{visual_id}" class="dg-ku-visual dg-ku-card dg-ku-concept" aria-label="{title}模型">',
        f'    <strong class="dg-ku-visual-title">{title}</strong>',
        '    <div class="dg-ku-token-grid">',
        *[f'      <span class="dg-ku-token">{token}</span>' for token in tokens],
        "    </div>",
        "  </div>",
    ]


def render_model_visual(visual_id: str, title: str, tokens: list[str]) -> list[str]:
    padded = (tokens + ["输入", "规则", "判据", "输出"])[:4]
    return [
        f'  <div id="{visual_id}" class="dg-ku-visual dg-ku-model" aria-label="{title}模型">',
        f'    <strong class="dg-ku-visual-title">{title}</strong>',
        '    <div class="dg-ku-model-grid">',
        f'      <span>{padded[0]}</span><span>{padded[1]}</span>',
        f'      <span>{padded[2]}</span><span>{padded[3]}</span>',
        "    </div>",
        "  </div>",
    ]


def render_token_flow(visual_id: str, title: str, tokens: list[str]) -> list[str]:
    lines = [f'  <div id="{visual_id}" class="dg-ku-visual dg-ku-flow" aria-label="{title}图解">']
    for index, token in enumerate(tokens[:4]):
        lines.append(f'    <span class="dg-ku-flow-step">{token}</span>')
        if index < min(len(tokens), 4) - 1:
            lines.append('    <i aria-hidden="true"></i>')
    lines.append("  </div>")
    return lines


def render_token_cloud(visual_id: str, title: str, class_name: str, tokens: list[str]) -> list[str]:
    return [
        f'  <div id="{visual_id}" class="dg-ku-visual {class_name}" aria-label="{title}图解">',
        f'    <strong class="dg-ku-visual-title">{title}</strong>',
        '    <div class="dg-ku-token-grid">',
        *[f'      <span class="dg-ku-token">{token}</span>' for token in tokens[:4]],
        "    </div>",
        "  </div>",
    ]


def render_practice_visual(visual_id: str, title: str, tokens: list[str]) -> list[str]:
    verbs = ["判断对象", "可用证据", "采用判据", "复测结论"]
    return [
        f'  <div id="{visual_id}" class="dg-ku-visual dg-ku-practice" aria-label="{title}校验">',
        f'    <strong class="dg-ku-visual-title">{title}</strong>',
        '    <div class="dg-ku-practice-steps">',
        *[f'      <span><b>{verbs[index]}</b>{token}</span>' for index, token in enumerate(tokens[:4])],
        "    </div>",
        "  </div>",
    ]


def render_evidence(groups: list[dict[str, Any]]) -> list[str]:
    lines = ['  <div class="dg-evidence-board">']
    for group in groups:
        items = group.get("items", [])
        if not items:
            continue
        if group.get("kind") == "photos":
            lines.append('    <div class="dg-evidence-photos">')
            for item in items[:4]:
                lines.append('      <figure>')
                lines.append(f'        <img src="{esc(item.get("url", ""))}" alt="{esc(item.get("caption", "现场证据"))}" loading="lazy" />')
                lines.append(f"        <figcaption>{esc(item.get('caption', '现场证据'))}</figcaption>")
                lines.append("      </figure>")
            lines.append("    </div>")
        elif group.get("kind") == "tables":
            for table in items[:2]:
                lines.append('    <article class="dg-evidence-table-summary">')
                lines.append(f"      <strong>{esc(table.get('caption', '现场记录样表'))}</strong>")
                headers = table.get("headers", [])
                if headers:
                    lines.append(f"      <p>{esc(' / '.join(headers[:4]))}</p>")
                lines.append("    </article>")
    lines.append("  </div>")
    return lines


def render_practice(unit: dict[str, Any]) -> list[str]:
    widget_id = unit.get("practiceRef")
    lines = [
        '  <aside class="dg-practice-brief">',
        "    <span>专项练习</span>",
        f"    <p>围绕“{esc(unit.get('title', '专项练习'))}”完成一次判断：先列对象和证据，再写出采用的工程判据与复测口径。</p>",
    ]
    if widget_id:
        lines.append(f'    <a href="#sec-review" data-practice-widget="{esc(widget_id)}">完成后复盘</a>')
    lines.extend([
        "  </aside>",
    ])
    return lines


def render_review(storyboard: dict[str, Any]) -> list[str]:
    units = storyboard.get("knowledgeUnits", [])
    labels = "、".join(esc(unit.get("title", "")) for unit in units[:6])
    return [
        '<section id="sec-review" class="dg-story-review">',
        "  <span>复盘</span>",
        f"  <p>本节复盘的关键线索包括：{labels}。</p>",
        "  <p>复盘时重点核对对象、证据、判据、处置动作和复测结果是否形成闭合关系。</p>",
        "</section>",
    ]


def cn(value: int) -> str:
    nums = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"]
    return nums[value - 1] if 0 < value <= len(nums) else str(value)


def esc(value: Any) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return html.escape(text, quote=True).replace("{", "&#123;").replace("}", "&#125;")


def section_title_for_kind(kind: str) -> str:
    return {
        "concept": "概念解释",
        "criteria": "工程判据",
        "evidence": "现场证据",
        "practice": "专项练习",
        "review": "复盘",
    }.get(kind, "概念解释")

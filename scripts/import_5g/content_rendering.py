"""Compact MDX rendering for imported 5G textbook content."""

from __future__ import annotations

import html
import re
from typing import Any, Callable

from import_5g.content_media import MediaItem, render_media_group

CAPTION_RE = re.compile(r"^[\u56fe\u8868]\s*[\d一二三四五六七八九十\-－—]")
LIST_RE = re.compile(r"^\s*(?:\d+[\.)、]|[（(]?\d+[）)]|[一二三四五六七八九十]+[、.．])")
NOISE_WORDS = ("二维码", "预留", "本项目章节的知识结构如下")


def render_content_blocks(
    blocks: list[Any],
    media_map: dict[str, str],
    rels: dict[str, str],
    headings: dict[str, tuple[str, str, str]],
    media_url_for_ref: Callable[[str, dict[str, str], dict[str, str]], str | None],
    num_for_section: Callable[[int], str],
) -> list[str]:
    lines: list[str] = []
    digest: list[str] = []
    media_items: list[MediaItem] = []
    recent_context: list[str] = []
    emitted: set[str] = set()
    section_no = 1

    def flush_digest() -> None:
        nonlocal digest
        if not digest:
            return
        card = render_digest_card(digest)
        if card:
            lines.extend(card)
            lines.append("")
        digest = []

    def flush_media() -> None:
        nonlocal media_items
        if not media_items:
            return
        lines.extend(render_media_group(media_items))
        lines.append("")
        media_items = []

    for block in blocks:
        kind = getattr(block, "kind", "")
        raw_text = normalize_space(getattr(block, "text", ""))
        text = raw_text
        if kind == "p":
            is_heading = raw_text in headings
            is_caption = bool(text and CAPTION_RE.match(text))
            if not is_heading:
                text = polish_task_language(raw_text)
            if is_heading:
                flush_digest()
                flush_media()
                sid, title, icon = headings[raw_text]
                if sid in emitted:
                    sid = f"{sid}-{section_no}"
                emitted.add(sid)
                lines.append(f'<SectionStep icon="{icon}" num="{num_for_section(section_no)}" title="{mdx_escape(title)}" id="{sid}" />')
                lines.append("")
                recent_context = [title]
                section_no += 1
                continue
            if text and media_items and is_caption:
                media_items[-1].caption = text
                recent_context.append(text)
                continue
            if text and not is_noise(text):
                if not is_caption:
                    digest.append(text)
                else:
                    digest.append(re.sub(r"^图表?\s*", "", text))
                recent_context.append(text)
                recent_context = recent_context[-5:]
            media_refs = getattr(block, "media", [])
            if media_refs:
                flush_digest()
                context = " ".join(recent_context[-3:]) or text or "教材图示"
                for rid in media_refs:
                    url = media_url_for_ref(rid, rels, media_map)
                    if url:
                        media_items.append(MediaItem(url=url, context=context))
        elif kind == "table":
            flush_digest()
            flush_media()
            lines.extend(render_table(getattr(block, "rows", [])))
            lines.append("")
    flush_digest()
    flush_media()
    return wrap_section_content(compact_knowledge_cards(lines))


def render_digest_card(texts: list[str]) -> list[str]:
    points = digest_points(texts)
    if not points:
        return []
    title = digest_title(texts[0])
    lines = [f'<section class="dg-digest-card" aria-label="{mdx_escape(title)}">', f'  <h3>{mdx_escape(title)}</h3>', '  <ul>']
    for point in points:
        lines.append(f"    <li>{mdx_escape(point)}</li>")
    lines.extend(["  </ul>", "</section>"])
    return lines


def compact_knowledge_cards(lines: list[str]) -> list[str]:
    compacted: list[str] = []
    cards: list[list[str]] = []
    index = 0
    while index < len(lines):
        card, next_index = read_digest_card(lines, index)
        if card:
            cards.append(card)
            index = next_index
            continue
        if not lines[index].strip() and cards:
            index += 1
            continue
        flush_knowledge_cards(compacted, cards)
        cards = []
        compacted.append(lines[index])
        index += 1
    flush_knowledge_cards(compacted, cards)
    return compacted


def read_digest_card(lines: list[str], start: int) -> tuple[list[str] | None, int]:
    line = lines[start].strip()
    if not line.startswith('<section class="dg-digest-card'):
        return None, start
    end = start
    while end < len(lines):
        if lines[end].strip() == "</section>":
            return lines[start : end + 1], end + 1
        end += 1
    return None, start


def flush_knowledge_cards(output: list[str], cards: list[list[str]]) -> None:
    if not cards:
        return
    if len(cards) < 3:
        for card in cards:
            output.extend(card)
            output.append("")
        return
    output.extend(render_knowledge_deck(cards))
    output.append("")


def render_knowledge_deck(cards: list[list[str]]) -> list[str]:
    cards = select_knowledge_cards(cards)
    lines = [
        f'<section class="dg-knowledge-deck" data-card-count="{len(cards)}">',
        '  <div class="dg-knowledge-deck-head">',
        '    <strong>要点</strong>',
        "  </div>",
        '  <div class="dg-knowledge-track" tabindex="0" aria-label="要点">',
    ]
    for index, card in enumerate(cards, start=1):
        lines.append(f'    <article class="dg-knowledge-slide" aria-label="要点 {index}">')
        lines.extend(f"      {line}" for line in card)
        lines.append("    </article>")
    lines.extend(["  </div>", "</section>"])
    return lines


def select_knowledge_cards(cards: list[list[str]], limit: int = 6) -> list[list[str]]:
    if len(cards) <= limit:
        return cards
    head_count = max(1, limit - 2)
    return cards[:head_count] + cards[-2:]


def wrap_section_content(lines: list[str]) -> list[str]:
    wrapped: list[str] = []
    content: list[str] = []
    active_title = ""

    def flush() -> None:
        nonlocal content, active_title
        if not content:
            return
        title = active_title or "本节内容"
        wrapped.append(f'<section class="dg-section-panel" aria-label="{mdx_escape(title)}">')
        wrapped.extend(f"  {line}" if line else "" for line in content)
        wrapped.append("</section>")
        wrapped.append("")
        content = []

    for line in lines:
        if line.startswith("<SectionStep "):
            flush()
            wrapped.append(line)
            wrapped.append("")
            active_title = section_title_from_step(line)
            continue
        if active_title:
            content.append(line)
        else:
            wrapped.append(line)
    flush()
    return wrapped


def section_title_from_step(line: str) -> str:
    match = re.search(r'title="([^"]+)"', line)
    return match.group(1) if match else "本节内容"


def digest_points(texts: list[str], limit: int = 4) -> list[str]:
    points: list[str] = []
    for text in texts:
        for part in split_sentences(text):
            item = compress_sentence(part)
            if item and item not in points:
                points.append(item)
            if len(points) >= limit:
                return points
    return points


def digest_title(text: str) -> str:
    text = polish_task_language(normalize_space(re.sub(LIST_RE, "", text)))
    text = text.strip("：:；;。")
    if 3 <= len(text) <= 18 and not text.endswith(("。", "；")):
        return text
    return "知识要点"


def split_sentences(text: str) -> list[str]:
    raw = re.split(r"[。；;！？!?]\s*|\n+", text)
    parts: list[str] = []
    for item in raw:
        item = normalize_space(item)
        if not item or is_noise(item):
            continue
        if LIST_RE.match(item) or len(item) >= 12:
            parts.append(item)
    return parts


def compress_sentence(text: str, limit: int = 46) -> str:
    text = polish_task_language(normalize_space(re.sub(LIST_RE, "", text)))
    text = re.sub(r"^(通过本项目的学习，?|本次任务需要|主要包括|具体包括)", "", text)
    text = text.strip("：:，,；;。")
    if not text or len(text) < 4:
        return ""
    return text if len(text) <= limit else text[: limit - 1].rstrip("，、；") + "…"


def polish_task_language(value: str) -> str:
    replacements = [
        ("\u5373\u65f6\u7ec3\u4e60", "\u5373\u65f6\u5de9\u56fa"),
        ("\u5b66\u4e60\u68c0\u9a8c", "\u80fd\u529b\u590d\u76d8"),
        ("\u8bf7\u7b80\u8981\u63cf\u8ff0", "\u590d\u76d8"),
        ("\u8bf7\u7b80\u8ff0", "\u590d\u76d8"),
        ("\u5b9e\u9a8c\u7f51", "\u8bd5\u9a8c\u7f51\u7edc"),
        ("本次任务", "本节"),
        ("本任务", "本节"),
        ("任务模块", "学习模块"),
        ("任务说明", "学习说明"),
        ("任务目标", "学习目标"),
        ("任务总览", "知识总览"),
        ("进入任务", "进入对应页面"),
        ("完成任务", "完成学习活动"),
        ("任务", "学习活动"),
        ("\u7ec3\u4e60", "\u5de9\u56fa"),
        ("\u5b9e\u8bad", "\u4eff\u771f"),
        ("\u5b9e\u9a8c", "\u9a8c\u8bc1"),
        ("\u6311\u6218", "\u8bad\u7ec3"),
        ("\u95ef\u5173", "\u8fdb\u9636\u8bad\u7ec3"),
        ("\u4f5c\u4e1a", "\u6210\u679c"),
        ("\u63d0\u4ea4", "\u5f52\u6863"),
        ("\u4e0a\u4f20", "\u5f52\u6863"),
        ("\u6253\u5206", "\u8bc4\u4ef7"),
        ("\u8bc4\u5206", "\u8bc4\u4ef7"),
        ("\u5f97\u5206", "\u7ed3\u679c"),
        ("\u622a\u56fe", "\u8bc1\u636e\u56fe"),
        ("\u65e0\u6cd5\u5b8c\u6210", "\u672a\u80fd\u5b8c\u6210"),
        ("\u8bf7\u7ed3\u5408", "\u7ed3\u5408"),
        ("\u8bf7", ""),
        ("\u8ba8\u8bba", "\u8fa8\u6790"),
        ("\u601d\u8003\u9898", "\u590d\u76d8\u9898"),
    ]
    text = value
    for source, target in replacements:
        text = text.replace(source, target)
    return text


def render_table(rows: list[list[str]]) -> list[str]:
    max_cols = max((len(row) for row in rows), default=0)
    if max_cols == 0:
        return []
    lines = render_table_digest(rows)
    if is_large_table(rows):
        lines.extend(render_table_card_deck(rows, max_cols))
        return lines
    lines.extend(render_table_card_grid(rows, max_cols, limit=6))
    return lines


def render_raw_table(rows: list[list[str]], max_cols: int) -> list[str]:
    lines = ['<div class="dg-table-wrap">', '<table class="dg-generated-table">']
    for row_index, row in enumerate(row + [""] * (max_cols - len(row)) for row in rows):
        tag = "th" if row_index == 0 else "td"
        lines.append("  <tr>")
        for cell in row:
            content = "<br />".join(mdx_escape(part) for part in str(cell).splitlines() if part.strip())
            lines.append(f"    <{tag}>{content}</{tag}>")
        lines.append("  </tr>")
    lines.extend(["</table>", "</div>"])
    return lines



def render_table_slide_deck(rows: list[list[str]], max_cols: int) -> list[str]:
    header = rows[0] if rows else []
    body = rows[1:] if len(rows) > 1 else rows
    page_size = 4 if max_cols <= 3 else 3
    pages = [body[index:index + page_size] for index in range(0, len(body), page_size)] or [[]]
    lines = ['<section class="dg-table-slide-deck" aria-label="table-pages">']
    lines.append('  <div class="dg-table-slide-track">')
    for page_index, page_rows in enumerate(pages, start=1):
        page = [header, *page_rows] if header else page_rows
        lines.append(f'    <article class="dg-table-slide" aria-label="table-page-{page_index}">')
        lines.extend(f"      {line}" for line in render_raw_table(page, max_cols))
        lines.append("    </article>")
    lines.append("  </div>")
    if len(pages) > 1:
        lines.append('  <div class="dg-table-slide-dots" aria-hidden="true">')
        for page_index in range(1, len(pages) + 1):
            state = " is-current" if page_index == 1 else ""
            lines.append(f'    <span class="{state.strip()}"></span>')
        lines.append("  </div>")
    lines.append("</section>")
    return lines


def render_table_card_deck(rows: list[list[str]], max_cols: int) -> list[str]:
    header = rows[0] if rows else []
    body = rows[1:] if len(rows) > 1 else rows
    page_size = 4 if max_cols <= 4 else 3
    pages = [body[index:index + page_size] for index in range(0, len(body), page_size)] or [[]]
    lines = ['<section class="dg-table-slide-deck dg-table-card-deck" aria-label="table-card-pages">']
    lines.append('  <div class="dg-table-slide-track">')
    for page_index, page_rows in enumerate(pages, start=1):
        lines.append(f'    <article class="dg-table-slide" aria-label="table-page-{page_index}">')
        lines.extend(f"      {line}" for line in render_table_card_grid([header, *page_rows] if header else page_rows, max_cols, limit=page_size))
        lines.append("    </article>")
    lines.append("  </div>")
    if len(pages) > 1:
        lines.append('  <div class="dg-table-slide-dots" aria-hidden="true">')
        for page_index in range(1, len(pages) + 1):
            state = " is-current" if page_index == 1 else ""
            lines.append(f'    <span class="{state.strip()}"></span>')
        lines.append("  </div>")
    lines.append("</section>")
    return lines


def render_table_card_grid(rows: list[list[str]], max_cols: int, limit: int) -> list[str]:
    header = [normalize_space(cell) for cell in rows[0]] if rows else []
    body = rows[1:] if len(rows) > 1 else rows
    lines = ['<div class="dg-table-card-grid">']
    for row_index, row in enumerate(body[:limit], start=1):
        cells = [normalize_space(cell) for cell in row + [""] * (max_cols - len(row))]
        title = first_non_empty(cells) or f"记录 {row_index}"
        lines.append('  <article class="dg-table-card">')
        lines.append(f"    <strong>{mdx_escape(compress_sentence(title, 18))}</strong>")
        lines.append('    <dl>')
        for col_index, cell in enumerate(cells[:4]):
            if not cell:
                continue
            key = header[col_index] if col_index < len(header) and header[col_index] else f"字段 {col_index + 1}"
            if col_index == 0 and cell == title:
                continue
            lines.append(f"      <dt>{mdx_escape(compress_sentence(key, 10))}</dt>")
            lines.append(f"      <dd>{mdx_escape(compress_sentence(cell, 24))}</dd>")
        lines.append("    </dl>")
        lines.append("  </article>")
    lines.append("</div>")
    return lines


def first_non_empty(values: list[str]) -> str:
    for value in values:
        if value:
            return value
    return ""

def is_large_table(rows: list[list[str]]) -> bool:
    max_cols = max((len(row) for row in rows), default=0)
    total_chars = sum(len(str(cell)) for row in rows for cell in row)
    return max_cols > 4 or len(rows) > 5 or total_chars > 520


def render_table_digest(rows: list[list[str]]) -> list[str]:
    header = [normalize_space(cell) for cell in rows[0]] if rows else []
    samples = rows[1:4]
    points: list[str] = []
    if header:
        points.append("字段：" + "、".join(compress_sentence(cell, 12) for cell in header[:5] if cell))
    for row in samples:
        item = " / ".join(compress_sentence(cell, 18) for cell in row[:3] if normalize_space(cell))
        if item:
            points.append(item)
    if not points:
        points.append(f"原表包含 {len(rows)} 行数据，建议结合字段含义完成记录和判断。")
    lines = ['<section class="dg-digest-card dg-table-digest" aria-label="表格要点">', "  <h3>表格要点</h3>", "  <ul>"]
    for point in points[:4]:
        lines.append(f"    <li>{mdx_escape(point)}</li>")
    lines.extend(["  </ul>", "</section>"])
    return lines


def is_noise(text: str) -> bool:
    return any(word in text for word in NOISE_WORDS)


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", str(value)).strip()


def mdx_escape(value: str) -> str:
    escaped = html.escape(str(value), quote=True)
    escaped = escaped.replace("~", "～")
    escaped = escaped.replace("*", "×").replace("_", "＿")
    return escaped.replace("{", "&#123;").replace("}", "&#125;")

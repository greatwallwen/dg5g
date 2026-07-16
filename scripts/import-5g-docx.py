#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "jsonschema==4.19.2",
# ]
# ///
"""Import the configured 5G source DOCX into the DGBook content structure."""

from __future__ import annotations

import copy
import html
import json
import math
import re
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from zipfile import ZipFile
import xml.etree.ElementTree as ET

if sys.version_info < (3, 12):
    raise SystemExit(
        "import-5g-docx.py requires Python 3.12+ (output is pinned to 3.12; "
        "older versions drop some evidence media). Run via:\n"
        "  uv run --python 3.12 scripts/import-5g-docx.py   (or: pnpm import:5g)"
    )

from import_5g.p17 import build_p17_animation_slide_artifact, build_p17_playback_scenes
from import_5g.book_manifest import load_book_manifest, repo_relative_path, resolve_output_path, resolve_source_docx
from import_5g.knowledge_points import build_knowledge_steps
from import_5g.knowledge_templates import build_knowledge_template_artifact
from import_5g.lesson_ast import build_lesson_ast
from import_5g.media_rules import build_optional_project_widgets, optional_project_widget_ids
from import_5g.p1_demo_content import write_p1_demo_content
from import_5g.playback_actions import animation_playback_actions
from import_5g.storyboard import build_lesson_storyboard, build_storyboard_playback_scenes, storyboard_sections
from import_5g.storyboard_rendering import render_storyboard_page
ROOT = Path(__file__).resolve().parents[1]
BOOK = "5g"
BOOK_MANIFEST = load_book_manifest(ROOT, BOOK)
DOCX = resolve_source_docx(ROOT, BOOK_MANIFEST)
DOCX_REPO_PATH = repo_relative_path(ROOT, DOCX)
PROJECT_DIR = resolve_output_path(ROOT, BOOK_MANIFEST, "projects")
WIDGET_DIR = resolve_output_path(ROOT, BOOK_MANIFEST, "widgets")
OUTLINE_PATH = resolve_output_path(ROOT, BOOK_MANIFEST, "outline")
MEDIA_DIR = resolve_output_path(ROOT, BOOK_MANIFEST, "media")
AVATAR_DIR = ROOT / "site" / "public" / "avatars"
GENERATED_DIR = resolve_output_path(ROOT, BOOK_MANIFEST, "generatedAst")
LESSON_AST_DIR = GENERATED_DIR / "lesson-ast"
REPORT_PATH = GENERATED_DIR / "5g-import-report.json"
ANIMATION_MANIFEST_PATH = resolve_output_path(ROOT, BOOK_MANIFEST, "animations") / "published.json"
TTS_MANIFEST_PATH = ROOT / "site" / "public" / "media" / "tts" / "manifest.json"


def _load_tts_audio_index() -> dict[str, dict[str, str]]:
    """Map audioId -> {url, voiceProfileId} from the prebuilt TTS manifest.

    Lets narration play prebuilt offline audio instead of falling back to the
    browser Web Speech API. A missing manifest (e.g. a new textbook before its
    audio is built) yields an empty index, so the importer degrades gracefully.
    """
    try:
        data = json.loads(TTS_MANIFEST_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return {}
    items = data.get("items", data) if isinstance(data, dict) else {}
    site_public = ROOT / "site" / "public"
    index: dict[str, dict[str, str]] = {}
    for audio_id, entry in items.items():
        if not isinstance(entry, dict):
            continue
        url = entry.get("url")
        if not (isinstance(url, str) and url.startswith("/media/tts/")):
            continue
        # Guard against manifest pollution (e.g. a benchmark TTS run rewrote an
        # entry's url to a variant file): the basename should start with the
        # audioId. If it doesn't, prefer the canonical sibling when present.
        audio_id = str(audio_id)
        slug = audio_id.lower()
        basename = url.rsplit("/", 1)[-1]
        if not basename.lower().startswith(slug):
            canonical = f"{url.rsplit('/', 1)[0]}/{slug}{Path(basename).suffix}"
            if (site_public / canonical.lstrip("/")).is_file():
                url = canonical
        provider_id = str(entry.get("providerId", "")).strip()
        if provider_id != "qwen-tts":
            continue
        provider = provider_id.removesuffix("-tts")
        voice = str(entry.get("voice", "")).strip()
        index[audio_id] = {
            "url": url,
            "voiceProfileId": f"{provider}:{voice}" if voice else provider,
        }
    return index


TTS_AUDIO_INDEX = _load_tts_audio_index()

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}

# --- Per-textbook config (5G is the first instance; platform-izes the importer) ---
CONFIG_DIR = ROOT / "config" / "textbooks" / BOOK


def _load_book_config(name: str) -> Any:
    return json.loads((CONFIG_DIR / name).read_text(encoding="utf-8"))


# Section heading -> (section id, display label, icon role). Externalized to
# config/textbooks/<book>/headings.json so a new textbook ships its own headings.
MAJOR_HEADINGS = {key: tuple(value) for key, value in _load_book_config("headings.json").items()}

# Ordered term-polish rules; order is significant (compound phrases before substrings).
TERM_REPLACEMENTS = [tuple(pair) for pair in _load_book_config("terminology.json")["replace"]]
FILE_SLUGS = _load_book_config("file-slugs.json")

PROJECT_ICONS = ["radio-tower", "route", "server-cog", "activity", "chart-line", "workflow"]
TASK_ICONS = ["map-pinned", "route", "phone-call", "radar", "wrench", "chart-no-axes-combined"]
PROJECT_HEADING_STYLES = {"2", "236"}
TASK_HEADING_STYLES = {"4", "237"}
SUPPORTED_MEDIA = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
@dataclass
class Block:
    kind: str
    text: str = ""
    style: str = ""
    media: list[str] = field(default_factory=list)
    rows: list[list[str]] = field(default_factory=list)

@dataclass
class Task:
    title: str
    source_no: str
    blocks: list[Block] = field(default_factory=list)
    generated_id: str = ""
    widget_id: str = ""

@dataclass
class SourceProject:
    title: str
    source_no: str
    preface: list[Block] = field(default_factory=list)
    tasks: list[Task] = field(default_factory=list)

def qn(prefix: str, name: str) -> str:
    return f"{{{NS[prefix]}}}{name}"
def text_of(element: ET.Element) -> str:
    parts: list[str] = []
    for node in element.iter():
        if node.tag == qn("w", "t"):
            parts.append(node.text or "")
        elif node.tag == qn("w", "tab"):
            parts.append("\t")
        elif node.tag in {qn("w", "br"), qn("w", "cr")}:
            parts.append("\n")
    return "".join(parts).strip()


def para_style(p: ET.Element) -> str:
    style = p.find("./w:pPr/w:pStyle", NS)
    return style.attrib.get(qn("w", "val"), "") if style is not None else ""
def media_refs(p: ET.Element) -> list[str]:
    refs: list[str] = []
    for blip in p.findall(".//a:blip", NS):
        rid = blip.attrib.get(qn("r", "embed")) or blip.attrib.get(qn("r", "link"))
        if rid:
            refs.append(rid)
    return refs


def load_relationships(zf: ZipFile) -> dict[str, str]:
    try:
        root = ET.fromstring(zf.read("word/_rels/document.xml.rels"))
    except KeyError:
        return {}
    rels: dict[str, str] = {}
    for rel in root:
        rid = rel.attrib.get("Id")
        target = rel.attrib.get("Target")
        if rid and target:
            rels[rid] = target
    return rels
def parse_blocks(zf: ZipFile) -> list[Block]:
    document = ET.fromstring(zf.read("word/document.xml"))
    body = document.find(qn("w", "body"))
    if body is None:
        return []
    blocks: list[Block] = []
    for child in body:
        if child.tag == qn("w", "p"):
            text = text_of(child)
            media = media_refs(child)
            if text or media:
                blocks.append(Block(kind="p", text=text, style=para_style(child), media=media))
        elif child.tag == qn("w", "tbl"):
            rows: list[list[str]] = []
            for row in child.findall("./w:tr", NS):
                rows.append([text_of(cell) for cell in row.findall("./w:tc", NS)])
            if rows:
                blocks.append(Block(kind="table", rows=rows))
    return blocks


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()
def clean_heading(value: str) -> str:
    return normalize_space(value).strip("\ufeff \u3000:：，。、")


def parse_project_title(value: str) -> tuple[str, str] | None:
    raw = clean_heading(value)
    match = re.match(r"^\u9879\u76ee\s*([0-9\u4e00-\u9fff]+)\s*[：，。、]?\s*(.+)$", raw)
    if not match:
        return None
    return match.group(1), clean_heading(re.sub(r"\d+$", "", match.group(2)))


def parse_task_title(value: str) -> tuple[str, str] | None:
    raw = clean_heading(value)
    match = re.match(r"^\u4efb\u52a1\s*([0-9\u4e00-\u9fff]+)\s*[：，。、]?\s*(.+)$", raw)
    if not match:
        return None
    return match.group(1), clean_heading(re.sub(r"\d+$", "", match.group(2)))


def split_projects(blocks: list[Block]) -> list[SourceProject]:
    start_index = 0
    for index, block in enumerate(blocks):
        if block.kind == "p" and block.style in PROJECT_HEADING_STYLES and parse_project_title(block.text):
            start_index = index
            break
    projects: list[SourceProject] = []
    current_project: SourceProject | None = None
    current_task: Task | None = None
    for block in blocks[start_index:]:
        text = normalize_space(block.text) if block.kind == "p" else ""
        project_match = parse_project_title(text) if text and block.style in PROJECT_HEADING_STYLES else None
        task_match = parse_task_title(text) if text and block.style in TASK_HEADING_STYLES else None
        if project_match:
            current_project = SourceProject(title=project_match[1], source_no=project_match[0])
            projects.append(current_project)
            current_task = None
            continue
        if task_match and current_project:
            current_task = Task(title=task_match[1], source_no=task_match[0])
            current_project.tasks.append(current_task)
            continue
        if current_task is not None:
            current_task.blocks.append(block)
        elif current_project is not None:
            current_project.preface.append(block)
    if not projects:
        raise RuntimeError(f"Could not find project headings in {DOCX_REPO_PATH}")
    return projects


def safe_slug(value: str) -> str:
    slug = normalize_space(value).lower().replace(" ", "-")
    slug = re.sub(r"[^\u4e00-\u9fffa-z0-9-]+", "", slug)
    return re.sub(r"-+", "-", slug).strip("-") or "task"


def safe_file_slug(task: Task) -> str:
    configured = str(FILE_SLUGS.get(task.generated_id, "")).strip()
    if configured:
        return configured
    slug = normalize_space(task.title).lower().replace(" ", "-")
    slug = re.sub(r"[^a-z0-9-]+", "", slug)
    return re.sub(r"-+", "-", slug).strip("-") or task.generated_id.lower()


def mdx_escape(value: str) -> str:
    escaped = html.escape(value, quote=False)
    return escaped.replace("{", "&#123;").replace("}", "&#125;")


def yaml_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def media_url_for_ref(rid: str, rels: dict[str, str], media_map: dict[str, str]) -> str | None:
    target = rels.get(rid)
    if not target:
        return None
    return media_map.get(target)


def write_media(zf: ZipFile, rels: dict[str, str]) -> dict[str, str]:
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    media_map: dict[str, str] = {}
    for target in sorted(set(rels.values())):
        if not target.startswith("media/"):
            continue
        source_name = f"word/{target}"
        stem = safe_slug(Path(target).stem)
        suffix = Path(target).suffix.lower()
        if suffix in SUPPORTED_MEDIA:
            out = MEDIA_DIR / f"{stem}{suffix}"
            try:
                out.write_bytes(zf.read(source_name))
            except KeyError:
                continue
            media_map[target] = f"/media/5g/{out.name}"
    copy_avatars()
    return media_map


def copy_avatars() -> None:
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    source = ROOT / "packages" / "animation" / "assets" / "avatars"
    for name in ["teacher.png", "teacher-2.png", "assist.png", "assist-2.png", "thinker.png"]:
        src = source / name
        if src.exists():
            shutil.copyfile(src, AVATAR_DIR / name)

def first_long_text(blocks: list[Block], fallback: str) -> str:
    for block in blocks:
        if block.kind == "p":
            text = polish_task_language(normalize_space(block.text))
            if len(text) >= 24 and text not in MAJOR_HEADINGS:
                return trim_text(text, 180)
    return polish_task_language(fallback)


def trim_text(value: str, limit: int = 150) -> str:
    value = normalize_space(value)
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip("，。；、") + "..."


def polish_task_language(value: str) -> str:
    replacements = TERM_REPLACEMENTS
    text = value
    for source, target in replacements:
        text = text.replace(source, target)
    return text


def section_id_for(title: str, occurrence: int = 1) -> tuple[str, str, str]:
    if title in MAJOR_HEADINGS:
        return MAJOR_HEADINGS[title]
    sid = f"sec-{safe_slug(title)}"
    if occurrence > 1:
        sid = f"{sid}-{occurrence}"
    return sid, title, "pin"


def analyze_sections(blocks: list[Block], task: Task, project_title: str) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = [{
        "id": "sec-overview",
        "title": "\u77e5\u8bc6\u603b\u89c8",
        "icon": "overview",
        "texts": [f"\u672c\u8282\u56f4\u7ed5\u201c{task.title}\u201d\u5c55\u5f00\uff0c\u5c5e\u4e8e\u201c{project_title}\u201d\u9879\u76ee\u3002"],
    }]
    current = sections[0]
    counts: dict[str, int] = {}
    for block in blocks:
        if block.kind == "p":
            text = normalize_space(block.text)
            if not text:
                continue
            if text in MAJOR_HEADINGS:
                counts[text] = counts.get(text, 0) + 1
                sid, title, icon = section_id_for(text, counts[text])
                current = {"id": sid, "title": title, "icon": icon, "texts": []}
                sections.append(current)
                continue
            if len(text) >= 16 and len(current["texts"]) < 3:
                current["texts"].append(trim_text(polish_task_language(text), 160))
        elif block.kind == "table" and len(current["texts"]) < 3:
            current["texts"].append(f"\u672c\u8282\u5305\u542b {len(block.rows)} \u884c\u8868\u683c\u6570\u636e\uff0c\u9700\u8981\u7ed3\u5408\u5b57\u6bb5\u542b\u4e49\u5b8c\u6210\u8bb0\u5f55\u3001\u5224\u65ad\u6216\u5206\u6790\u3002")
    return [section for section in sections if section["texts"] or section["title"] == "\u77e5\u8bc6\u603b\u89c8"]


def make_action(project_id: str, scene_key: str, index: int, action_type: str, **kwargs: Any) -> dict[str, Any]:
    action = {"id": f"{project_id}-{scene_key}-action-{index:03d}", "type": action_type, **kwargs}
    for key in ("title", "content", "caption", "displayText"):
        if key in action:
            action[key] = polish_task_language(str(action[key]))
    if action_type == "speech":
        text = str(action.get("text") or action.get("content") or "")
        text = polish_task_language(text)
        action["text"] = text
        action.setdefault("text", text)
        action.setdefault("spokenText", text)
        action.setdefault("audioId", f"{project_id}-{scene_key}-speech-{index:03d}")
        action.setdefault("speakerId", "teacher")
        action.setdefault("voiceProfileId", "qwen:Cherry")
        action.setdefault("caption", trim_text(text, 42))
        action.setdefault("displayText", action["caption"])
    return action


def attach_audio_urls(scenes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Wire prebuilt narration audio onto speech actions by audioId.

    The reader's playback engine prefers an action's ``audioUrl`` and only falls
    back to browser TTS when it is absent (see packages/animation playback). This
    runs over the final scene list so every speech action is covered regardless
    of which builder produced it (storyboard, animation, or the P17 handler).
    No-op when the TTS manifest is absent. Returns a deep copy so wiring narration
    onto the page's playback scenes never mutates objects shared with the pure
    visual widget artifact (the P17 handler returns the artifact's own actions by
    reference, and widget artifacts must stay free of TTS config).
    """
    scenes = copy.deepcopy(scenes)
    if not TTS_AUDIO_INDEX:
        return scenes
    for scene in scenes:
        for action in scene.get("actions", []) or []:
            if not isinstance(action, dict) or action.get("type") != "speech":
                continue
            if action.get("audioUrl"):
                continue
            # Storyboard actions carry an explicit audioId; the P17 stage handler
            # instead names the action id itself "P17-stage-speech-NNN", which is
            # the manifest key, so fall back to the action id when audioId is absent.
            key = str(action.get("audioId") or action.get("id") or "")
            entry = TTS_AUDIO_INDEX.get(key)
            if not entry:
                continue
            action["audioUrl"] = entry["url"]
            action.setdefault("audioId", key)
            action.setdefault("voiceProfileId", entry["voiceProfileId"])
    return scenes


SPEC_REFS = {
    "23.501": "https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=3144",
    "23.502": "https://www.3gpp.org/DynaReport/23502.htm",
    "23.503": "https://www.3gpp.org/DynaReport/23503.htm",
    "28.541": "https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=3400",
    "38.215": "https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=3217",
    "38.300": "https://portal.3gpp.org/desktopmodules/Specifications/SpecificationDetails.aspx?specificationId=3191",
    "38.331": "https://www.3gpp.org/DynaReport/38331.htm",
}

VISUAL_BLUEPRINTS: dict[str, dict[str, Any]] = {
    "site-survey": {"metrics": ["SS-RSRP", "SS-SINR", "\u7ad9\u70b9", "\u673a\u623f"], "refs": ["38.300", "38.215"], "nodes": [("\u91c7\u96c6\u5bf9\u8c61", "\u5efa\u7acb\u7ad9\u70b9\u3001\u673a\u623f\u548c\u73af\u5883\u6e05\u5355\u3002"), ("\u6d4b\u91cf\u6307\u6807", "\u56f4\u7ed5\u8986\u76d6\u5f3a\u5ea6\u548c\u8d28\u91cf\u5f62\u6210\u8f93\u5165\u3002"), ("\u8bb0\u5f55\u89c4\u8303", "\u5c06\u7167\u7247\u3001\u5750\u6807\u548c\u8868\u683c\u8f6c\u4e3a\u53ef\u590d\u6838\u8bc1\u636e\u3002"), ("\u4f18\u5316\u4f9d\u636e", "\u8f93\u51fa\u7528\u4e8e\u8986\u76d6\u8bc4\u4f30\u548c\u540e\u7eed\u6d4b\u8bd5\u7684\u6570\u636e\u3002")]},
    "drive-test": {"metrics": ["DT/CQT", "RSRP", "SINR", "\u5207\u6362"], "refs": ["38.215", "38.331"], "nodes": [("\u6d4b\u8bd5\u51c6\u5907", "\u660e\u786e\u8def\u7ebf\u3001\u7ec8\u7aef\u548c\u4e1a\u52a1\u811a\u672c\u3002"), ("\u8def\u7ebf\u6267\u884c", "\u6309\u573a\u666f\u91c7\u96c6\u8986\u76d6\u3001\u8d28\u91cf\u548c\u63a5\u5165\u4e8b\u4ef6\u3002"), ("\u5f02\u5e38\u5b9a\u4f4d", "\u5c06\u5f31\u8986\u76d6\u3001\u8d28\u5dee\u548c\u5207\u6362\u5931\u8d25\u6807\u6ce8\u5230\u8def\u7ebf\u4e0a\u3002"), ("\u95ee\u9898\u6e05\u5355", "\u8f93\u51fa\u53ef\u590d\u73b0\u7684\u95ee\u9898\u70b9\u548c\u5efa\u8bae\u52a8\u4f5c\u3002")]},
    "kpi": {"metrics": ["PM Counter", "RSRP/SINR", "Throughput", "5QI"], "refs": ["38.215", "23.503"], "nodes": [("\u6307\u6807\u91c7\u96c6", "\u7edf\u4e00\u7f51\u7ba1\u3001\u6d4b\u8bd5\u65e5\u5fd7\u548c\u4e1a\u52a1\u4fa7\u6570\u636e\u53e3\u5f84\u3002"), ("\u8d8b\u52bf\u8bc6\u522b", "\u6bd4\u8f83\u533a\u57df\u3001\u4e1a\u52a1\u548c\u5386\u53f2\u57fa\u7ebf\u8bc6\u522b\u77ed\u677f\u3002"), ("\u539f\u56e0\u5f52\u7c7b", "\u5c06\u8986\u76d6\u3001\u5e72\u6270\u3001\u5bb9\u91cf\u548c\u53c2\u6570\u5206\u5c42\u5b9a\u4f4d\u3002"), ("\u6548\u679c\u9a8c\u8bc1", "\u4ee5\u4f18\u5316\u524d\u540e\u6307\u6807\u5bf9\u6bd4\u786e\u8ba4\u6548\u679c\u3002")]},
    "network-management": {"metrics": ["ManagedElement", "Alarm", "PM", "CM"], "refs": ["28.541", "23.501"], "nodes": [("\u7f51\u7ba1\u5bf9\u8c61", "\u56f4\u7ed5 ManagedElement\u3001NRCell \u548c\u6838\u5fc3\u7f51\u5bf9\u8c61\u5efa\u6a21\u3002"), ("\u544a\u8b66\u76d1\u63a7", "\u6309\u544a\u8b66\u7ea7\u522b\u3001\u65f6\u95f4\u548c\u5173\u8054\u5bf9\u8c61\u8fc7\u6ee4\u4e8b\u4ef6\u3002"), ("\u6027\u80fd\u67e5\u8be2", "\u8054\u52a8 PM \u6307\u6807\u3001\u914d\u7f6e\u6570\u636e\u548c\u62d3\u6251\u5173\u7cfb\u3002"), ("\u5de5\u5355\u95ed\u73af", "\u5c06\u76d1\u63a7\u53d1\u73b0\u8f6c\u5316\u4e3a\u6d3e\u5355\u3001\u5904\u7406\u548c\u590d\u6838\u3002")]},
    "parameter": {"metrics": ["CM", "\u4e00\u81f4\u6027", "\u98ce\u9669", "\u56de\u9000"], "refs": ["28.541", "38.300"], "nodes": [("\u53c2\u6570\u5bfc\u51fa", "\u56fa\u5b9a\u5bf9\u8c61\u8303\u56f4\u3001\u7248\u672c\u548c\u5bfc\u51fa\u65f6\u95f4\u3002"), ("\u4e00\u81f4\u6027\u6838\u67e5", "\u5c06\u89c4\u5212\u503c\u3001\u73b0\u7f51\u503c\u548c\u90bb\u533a\u5173\u7cfb\u9010\u9879\u5bf9\u9f50\u3002"), ("\u53d8\u66f4\u63a7\u5236", "\u8bc4\u4f30\u98ce\u9669\u3001\u7a97\u53e3\u3001\u5f71\u54cd\u5c0f\u533a\u548c\u56de\u9000\u6761\u4ef6\u3002"), ("\u7ed3\u679c\u590d\u6838", "\u901a\u8fc7 KPI\u3001\u544a\u8b66\u548c\u6d4b\u8bd5\u9a8c\u8bc1\u7f51\u7edc\u8868\u73b0\u3002")]},
    "optimization": {"metrics": ["N2/N3", "\u590d\u6d4b", "\u95ed\u73af", "\u65b9\u6848"], "refs": ["23.501", "23.502", "38.300"], "nodes": [("\u95ee\u9898\u754c\u5b9a", "\u7528\u6295\u8bc9\u3001\u6d4b\u8bd5\u3001KPI \u548c\u4fe1\u4ee4\u786e\u5b9a\u4f18\u5316\u8fb9\u754c\u3002"), ("\u65b9\u6848\u5b9e\u65bd", "\u6309\u65e0\u7ebf\u3001\u627f\u8f7d\u3001\u6838\u5fc3\u7f51\u548c\u53c2\u6570\u5c42\u9762\u62c6\u5206\u52a8\u4f5c\u3002"), ("\u7aef\u5230\u7aef\u9a8c\u8bc1", "\u56f4\u7ed5 UE\u3001NG-RAN\u30015GC \u548c\u4e1a\u52a1\u8def\u5f84\u786e\u8ba4\u6548\u679c\u3002"), ("\u590d\u76d8\u5f52\u6863", "\u6c89\u6dc0\u95ee\u9898\u6839\u56e0\u3001\u5904\u7406\u52a8\u4f5c\u548c\u53ef\u590d\u7528\u7ecf\u9a8c\u3002")]},
    "signaling": {"metrics": ["RRC", "NAS", "Registration", "PDU Session"], "refs": ["23.502", "38.331", "23.501"], "nodes": [("\u65e0\u7ebf\u63a5\u5165", "UE \u4e0e gNB \u4e4b\u95f4\u5148\u5b8c\u6210 RRC \u5efa\u7acb\u3001\u91cd\u914d\u6216\u6062\u590d\u3002"), ("\u6ce8\u518c\u7ba1\u7406", "UE \u901a\u8fc7 AMF \u5b8c\u6210\u6ce8\u518c\u3001\u9274\u6743\u3001\u5b89\u5168\u548c\u79fb\u52a8\u6027\u7ba1\u7406\u3002"), ("\u4f1a\u8bdd\u5efa\u7acb", "SMF \u9009\u62e9\u5e76\u63a7\u5236 UPF\uff0c\u4e3a\u4e1a\u52a1\u5efa\u7acb PDU Session \u548c QoS \u89c4\u5219\u3002"), ("\u5f02\u5e38\u5b9a\u4f4d", "\u6309\u6d88\u606f\u65b9\u5411\u3001\u5b9a\u65f6\u5668\u548c\u5931\u8d25\u8282\u70b9\u5b9a\u4f4d\u95ee\u9898\u3002")]},
}

SCENARIO_LABELS = {
    "site-survey": "\u4fe1\u606f\u91c7\u96c6",
    "drive-test": "DT/CQT \u6d4b\u8bd5",
    "kpi": "\u6307\u6807\u5206\u6790",
    "network-management": "\u7f51\u7ba1\u95ed\u73af",
    "parameter": "\u53c2\u6570\u4f18\u5316",
    "optimization": "\u7aef\u5230\u7aef\u4f18\u5316",
    "signaling": "\u4fe1\u4ee4\u5206\u6790",
}


def infer_scenario(task_title: str, project_title: str) -> str:
    text = f"{project_title} {task_title}"
    if "\u4fe1\u4ee4" in text:
        return "signaling"
    if "\u53c2\u6570" in text:
        return "parameter"
    if "\u7f51\u7ba1" in text or "\u76d1\u63a7" in text or "\u4fe1\u606f\u7ba1\u7406" in text:
        return "network-management"
    if "\u6027\u80fd" in text or "\u6307\u6807" in text or "\u6570\u636e\u5206\u6790" in text:
        return "kpi"
    if "\u6d4b\u8bd5" in text or "DT" in text or "CQT" in text:
        return "drive-test"
    if "\u4f18\u5316" in text or "\u9a8c\u8bc1" in text:
        return "optimization"
    return "site-survey"


def animation_palette(scenario: str) -> tuple[str, str]:
    palettes = {
        "site-survey": ("#0891b2", "#16a34a"),
        "drive-test": ("#2563eb", "#f59e0b"),
        "kpi": ("#7c3aed", "#14b8a6"),
        "network-management": ("#0f766e", "#6366f1"),
        "parameter": ("#475569", "#0ea5e9"),
        "optimization": ("#16a34a", "#f59e0b"),
        "signaling": ("#e11d48", "#2563eb"),
    }
    return palettes.get(scenario, palettes["site-survey"])


def infer_metrics(task_title: str) -> list[dict[str, str]]:
    scenario = infer_scenario(task_title, task_title)
    metrics = VISUAL_BLUEPRINTS[scenario]["metrics"][:3]
    return [{"label": f"M{index + 1}", "value": value[:5]} for index, value in enumerate(metrics)]


def build_animation_slide_artifact(task: Task, project_title: str, scenario: str, steps: list[dict[str, str]], metrics: list[dict[str, str]]) -> dict[str, Any]:
    if task.generated_id == "P17":
        return build_p17_animation_slide_artifact(task, project_title, scenario, steps, metrics, animation_palette(scenario), SCENARIO_LABELS.get(scenario, "5G"))
    return build_knowledge_template_artifact(task, project_title, scenario, steps, metrics, SCENARIO_LABELS.get(scenario, "5G"))
def storyboard_knowledge_steps(storyboard: dict[str, Any]) -> list[dict[str, str]]:
    """Use the rendered textbook units as the single semantic source for sidecars."""
    return [
        {
            "label": trim_text(unit.get("title", ""), 24),
            "description": trim_text(unit.get("shortText") or unit.get("narrationText", ""), 160),
        }
        for unit in storyboard.get("knowledgeUnits", [])
        if unit.get("title")
    ]


def build_widget_instance(task: Task, project_title: str, source_steps: list[dict[str, str]]) -> dict[str, Any]:
    steps = [dict(step) for step in source_steps]
    if len(steps) < 4:
        steps.extend([
            {"label": "\u5bf9\u8c61", "description": "\u660e\u786e\u5206\u6790\u5bf9\u8c61\u3001\u8303\u56f4\u548c\u6570\u636e\u6765\u6e90\u3002"},
            {"label": "\u91c7\u96c6", "description": "\u6309\u89c4\u8303\u83b7\u53d6\u73b0\u573a\u6216\u7cfb\u7edf\u6570\u636e\u3002"},
            {"label": "\u5206\u6790", "description": "\u7ed3\u5408\u6307\u6807\u3001\u53c2\u6570\u6216\u4fe1\u4ee4\u5224\u65ad\u95ee\u9898\u3002"},
            {"label": "\u7ed3\u8bba", "description": "\u7528\u8bc1\u636e\u8bf4\u660e\u5224\u65ad\u7ed3\u679c\u548c\u540e\u7eed\u9a8c\u8bc1\u65b9\u6cd5\u3002"},
        ][: 4 - len(steps)])
    scenario = infer_scenario(task.title, project_title)
    refs = [{"label": f"3GPP TS {ref}", "href": SPEC_REFS[ref]} for ref in VISUAL_BLUEPRINTS[scenario]["refs"]]
    metrics = infer_metrics(task.title)
    targets = [{"id": f"{task.generated_id}-step-{index + 1:02d}", "label": step["label"], "description": trim_text(step["description"], 96)} for index, step in enumerate(steps[:6])]
    targets.append({"id": f"{task.generated_id}-step-final", "label": "\u9a8c\u8bc1\u7ed3\u8bba", "description": "\u6c47\u603b\u5bf9\u8c61\u3001\u8bc1\u636e\u3001\u5224\u65ad\u548c\u9a8c\u8bc1\u7ed3\u679c\u3002"})
    return {
        "id": task.widget_id,
        "widget": "lesson-animation",
        "version": "0.1.0",
        "props": {"instanceId": task.widget_id, "title": f"{task.title} · \u8fc7\u7a0b\u793a\u610f", "artifact": build_animation_slide_artifact(task, project_title, scenario, steps[:6], metrics), "targets": targets, "sources": refs, "review": {"status": "published", "checklist": {"contentAccurate": True, "animationOnly": True, "playbackSeparated": True, "widgetEmbeddable": True}, "sources": refs, "history": [{"status": "published", "at": "2026-05-15T00:00:00.000Z", "by": "docx-importer", "comment": f"Imported from {DOCX_REPO_PATH}."}]}},
        "project": task.generated_id,
        "status": "published",
        "history": [{"status": "published", "at": "2026-05-14T00:00:00.000Z", "by": "docx-importer", "comment": f"Imported from {DOCX_REPO_PATH}"}],
    }

SOURCE_PROJECT_INDEX: dict[str, int] = {}
def build_outline(projects: list[SourceProject]) -> dict[str, Any]:
    chapters: list[dict[str, Any]] = []
    units: list[dict[str, Any]] = []
    project_meta: list[dict[str, Any]] = []
    counter = 1
    for chapter_index, project in enumerate(projects, start=1):
        chapter_id = f"ch{chapter_index}"
        unit_id = f"u{chapter_index}"
        chapter_projects = [f"P{counter + i:02d}" for i in range(len(project.tasks))]
        chapters.append({"id": chapter_id, "no": chapter_index, "title": project.title, "icon": PROJECT_ICONS[(chapter_index - 1) % len(PROJECT_ICONS)], "goal": first_long_text(project.preface, f"\u638c\u63e1{project.title}\u7684\u5173\u952e\u6d41\u7a0b\u3001\u5de5\u5177\u4f7f\u7528\u548c\u7ed3\u679c\u5224\u65ad\u65b9\u6cd5\u3002"), "units": [unit_id]})
        units.append({"id": unit_id, "no": chapter_index, "title": project.title, "chapter": chapter_id, "projects": chapter_projects, "hours": max(6, len(project.tasks) * 4), "deliverable": f"\u5b8c\u6210{project.title}\u76f8\u5173\u4efb\u52a1\u8bb0\u5f55\u3001\u5206\u6790\u8fc7\u7a0b\u548c\u4f18\u5316\u7ed3\u679c\u8bf4\u660e\u3002"})
        for local_index, task in enumerate(project.tasks, start=1):
            project_id = f"P{counter:02d}"
            task.generated_id = project_id
            task.widget_id = f"{project_id}-lesson-animation-001"
            task_blocks = project.preface + task.blocks if local_index == 1 else task.blocks
            project_meta.append({"id": project_id, "title": task.title, "unit": unit_id, "chapter": chapter_id, "icon": TASK_ICONS[(counter - 1) % len(TASK_ICONS)], "threads": ["5g-network-optimization"], "estimatedPages": max(2, min(60, math.ceil(len(task_blocks) / 32))), "masterLines": [counter, len(task_blocks), chapter_index, local_index]})
            counter += 1
    all_project_ids = [project["id"] for project in project_meta]
    return {"$schema": "./schema/outline.schema.json", "title": "5G\u7f51\u7edc\u4f18\u5316\uff08\u9ad8\u7ea7\uff09", "subtitle": "DGBook · 5G \u7f51\u7edc\u4f18\u5316\u6570\u5b57\u5316\u6559\u6750", "audience": "\u804c\u4e1a\u9662\u6821\u901a\u4fe1\u6280\u672f\u3001\u79fb\u52a8\u901a\u4fe1\u548c\u7f51\u7edc\u4f18\u5316\u65b9\u5411\u5b66\u4e60\u8005", "totalHours": 64, "weeks": 16, "prerequisites": ["\u79fb\u52a8\u901a\u4fe1\u57fa\u7840", "\u65e0\u7ebf\u7f51\u7edc\u57fa\u7840"], "competencies": ["5G\u7f51\u7edc\u4fe1\u606f\u91c7\u96c6\u80fd\u529b", "\u8def\u6d4b\u4e0e\u6570\u636e\u5206\u6790\u80fd\u529b", "\u7f51\u7edc\u53c2\u6570\u68c0\u67e5\u4e0e\u4f18\u5316\u80fd\u529b", "\u4fe1\u4ee4\u5206\u6790\u4e0e\u95ee\u9898\u5b9a\u4f4d\u80fd\u529b"], "chapters": chapters, "units": units, "threads": [{"id": "5g-network-optimization", "title": "5G \u7f51\u7edc\u4f18\u5316\u95ed\u73af", "introducedIn": "P01", "appliedIn": all_project_ids, "summary": "\u8d2f\u7a7f\u4fe1\u606f\u91c7\u96c6\u3001\u6d4b\u8bd5\u5206\u6790\u3001\u53c2\u6570\u8c03\u6574\u3001\u7ed3\u679c\u9a8c\u8bc1\u548c\u62a5\u544a\u8f93\u51fa\u7684\u7f51\u4f18\u5de5\u4f5c\u6d41\u7a0b\u3002"}], "projects": project_meta}
def yaml_frontmatter(data: dict[str, Any]) -> list[str]:
    order = ["project_id", "title", "chapter", "unit", "icon", "chip", "threads", "estimatedPages", "widgets", "status", "playbackScenes"]
    lines: list[str] = []
    for key in order:
        value = data[key]
        if isinstance(value, str):
            lines.append(f"{key}: {yaml_string(value)}")
        else:
            lines.append(f"{key}: {json.dumps(value, ensure_ascii=False)}")
    return lines
def chinese_num(value: int) -> str:
    nums = ["\u4e00", "\u4e8c", "\u4e09", "\u56db", "\u4e94", "\u516d", "\u4e03", "\u516b", "\u4e5d", "\u5341", "\u5341\u4e00", "\u5341\u4e8c", "\u5341\u4e09", "\u5341\u56db"]
    return nums[value - 1] if 0 < value <= len(nums) else str(value)

def render_project_page(task: Task, project: SourceProject, task_index: int, media_map: dict[str, str], rels: dict[str, str]) -> tuple[str, list[dict[str, Any]], dict[str, Any], dict[str, Any], dict[str, Any]]:
    blocks = project.preface + task.blocks if task_index == 0 else task.blocks
    sections = analyze_sections(blocks, task, project.title)
    steps = build_knowledge_steps(task, sections, project.title)
    scenario = infer_scenario(task.title, project.title)
    metrics = infer_metrics(task.title)
    scenario_label = SCENARIO_LABELS.get(scenario, "5G")
    storyboard = build_lesson_storyboard(
        task=task,
        project_title=project.title,
        blocks=blocks,
        steps=steps,
        scenario=scenario,
        scenario_label=scenario_label,
        metrics=metrics,
        media_map=media_map,
        rels=rels,
        media_url_for_ref=media_url_for_ref,
    )
    aligned_steps = storyboard_knowledge_steps(storyboard)
    story_sections = storyboard_sections(storyboard)
    lesson_ast = build_lesson_ast(
        task=task,
        project=project,
        task_index=task_index,
        blocks=blocks,
        sections=story_sections,
        steps=aligned_steps,
        scenario=scenario,
        scenario_label=scenario_label,
        metrics=metrics,
        storyboard=storyboard,
        source_path=DOCX_REPO_PATH,
    )
    widget = build_widget_instance(task, project.title, aligned_steps)
    scenes = build_storyboard_playback_scenes(
        project_id=task.generated_id,
        title=task.title,
        storyboard=storyboard,
        widget_id=task.widget_id,
        scenario=scenario,
        make_action=make_action,
        animation_actions=animation_playback_actions,
    )
    if task.generated_id == "P17":
        scenes = scenes[:1] + build_p17_playback_scenes(task.generated_id, widget["props"]["artifact"])
    scenes = attach_audio_urls(scenes)
    visual = storyboard["visualModel"]
    body = render_storyboard_page(storyboard)
    intro = storyboard["summary"]
    evidence_count = sum(len(group.get("items", [])) for group in storyboard.get("evidenceGroups", []))
    stats = [{"label": "\u8981\u70b9", "value": len(storyboard["knowledgeUnits"])}, {"label": "\u8bc1\u636e", "value": evidence_count}, {"label": "\u793a\u610f", "value": len(storyboard["manimSlots"]) + 1}, {"label": "\u6821\u9a8c", "value": len(optional_project_widget_ids(task.generated_id))}]
    brief = [
        {"label": "\u6240\u5c5e\u9879\u76ee", "content": project.title},
        {"label": "\u672c\u8282\u76ee\u6807", "content": storyboard["learningGoal"]},
        {"label": "\u7814\u8bfb\u7ebf\u7d22", "content": "\u6982\u5ff5\u8bf4\u660e + \u5224\u65ad\u65b9\u6cd5 + \u8bc1\u636e\u6838\u9a8c"},
        {"label": "\u5224\u65ad\u8981\u6c42", "content": "\u80fd\u8bf4\u6e05\u5bf9\u8c61\u3001\u8bc1\u636e\u3001\u5224\u636e\u548c\u590d\u6d4b\u7ed3\u679c\u4e4b\u95f4\u7684\u5173\u7cfb"},
    ]
    objectives = [
        {"icon": "signal", "label": "\u77e5\u8bc6\u76ee\u6807", "text": f"\u8bc6\u522b{task.title}\u7684\u5bf9\u8c61\u3001\u6307\u6807\u4e0e\u5224\u636e\u3002"},
        {"icon": "test", "label": "\u6280\u80fd\u76ee\u6807", "text": "\u80fd\u628a\u6982\u5ff5\u3001\u6307\u6807\u3001\u8bc1\u636e\u548c\u5224\u65ad\u7ed3\u8bba\u5bf9\u9f50\u3002"},
        {"icon": "compass", "label": "\u7d20\u517b\u76ee\u6807", "text": "\u5f62\u6210\u6570\u636e\u7559\u75d5\u3001\u524d\u540e\u6838\u9a8c\u7684\u5de5\u7a0b\u4e60\u60ef\u3002"},
    ]
    frontmatter = {"project_id": task.generated_id, "title": task.title, "chapter": f"ch{SOURCE_PROJECT_INDEX[project.title]}", "unit": f"u{SOURCE_PROJECT_INDEX[project.title]}", "icon": TASK_ICONS[(int(task.generated_id[1:]) - 1) % len(TASK_ICONS)], "chip": "5G\u7f51\u4f18", "threads": ["5g-network-optimization"], "estimatedPages": max(2, min(60, math.ceil(len(blocks) / 32))), "widgets": [task.widget_id, *optional_project_widget_ids(task.generated_id)], "status": "draft", "playbackScenes": scenes}
    page = [
        "---", *yaml_frontmatter(frontmatter), "---", "",
        "<HeroBanner",
        f"  projectId={{{yaml_string('专题 ' + task.generated_id[1:])}}}",
        f"  title={{{yaml_string(task.title)}}}",
        f"  subtitle={{{yaml_string(intro)}}}",
        f"  stats={{{json.dumps(stats, ensure_ascii=False)}}}",
        "/>", "",
        "<ObjectivesAndBrief",
        f"  objectives={{{json.dumps(objectives, ensure_ascii=False)}}}",
        f"  brief={{{json.dumps(brief, ensure_ascii=False)}}}",
        "/>", "",
        "<NetworkVisual",
        '  id="sec-network-visual"',
        f"  title={{{json.dumps(visual['title'], ensure_ascii=False)}}}",
        f"  scenario={{{json.dumps(visual['scenario'], ensure_ascii=False)}}}",
        f"  nodes={{{json.dumps(visual['nodes'], ensure_ascii=False)}}}",
        f"  metrics={{{json.dumps(visual['metrics'], ensure_ascii=False)}}}",
        f"  refs={{{json.dumps([{'label': f'3GPP TS {ref}', 'href': SPEC_REFS[ref]} for ref in VISUAL_BLUEPRINTS[scenario]['refs']], ensure_ascii=False)}}}",
        "/>", "",
        *body,
    ]
    return "\n".join(page).strip() + "\n", scenes, widget, lesson_ast, storyboard

def write_outputs(projects: list[SourceProject], rels: dict[str, str], media_map: dict[str, str]) -> dict[str, Any]:
    PROJECT_DIR.mkdir(parents=True, exist_ok=True)
    WIDGET_DIR.mkdir(parents=True, exist_ok=True)
    LESSON_AST_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    ANIMATION_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    for path in PROJECT_DIR.glob("*"):
        if path.is_file():
            path.unlink()
    for path in WIDGET_DIR.glob("*.json"):
        path.unlink()
    for path in LESSON_AST_DIR.glob("*.json"):
        path.unlink()
    outline = build_outline(projects)
    OUTLINE_PATH.write_text(json.dumps(outline, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    global SOURCE_PROJECT_INDEX
    SOURCE_PROJECT_INDEX = {project.title: index for index, project in enumerate(projects, start=1)}
    widgets: list[dict[str, Any]] = []
    p1_source_artifacts: dict[str, dict[str, Any]] = {}
    task_count = 0
    for project in projects:
        for task_index, task in enumerate(project.tasks):
            task_count += 1
            page, _scenes, widget, lesson_ast, storyboard = render_project_page(task, project, task_index, media_map, rels)
            filename = f"{task.generated_id}-{safe_file_slug(task)}.mdx"
            (PROJECT_DIR / filename).write_text(page, encoding="utf-8")
            (WIDGET_DIR / f"{task.widget_id}.json").write_text(json.dumps(widget, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            (LESSON_AST_DIR / f"{task.generated_id}.json").write_text(json.dumps(lesson_ast, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            widgets.append(widget)
            task_widgets = [widget]
            for extra_widget in build_optional_project_widgets(task.generated_id):
                (WIDGET_DIR / f"{extra_widget['id']}.json").write_text(json.dumps(extra_widget, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                widgets.append(extra_widget)
                task_widgets.append(extra_widget)
            if task.generated_id in {"P01", "P02", "P03"}:
                p1_source_artifacts[task.generated_id] = {
                    "lessonAst": lesson_ast,
                    "storyboard": storyboard,
                    "widgets": task_widgets,
                }
    manifest_projects: dict[str, list[str]] = {}
    for widget in widgets:
        manifest_projects.setdefault(widget["project"], []).append(widget["id"])
    widget_manifest = {"projects": manifest_projects}
    ANIMATION_MANIFEST_PATH.write_text(json.dumps(widget_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    p1_demo_content = write_p1_demo_content(
        ROOT,
        GENERATED_DIR / "p1-demo-content.json",
        source_artifacts=p1_source_artifacts,
        widget_manifest=widget_manifest,
        media_manifest=media_map,
    )
    generated_self_study_nodes = [
        node["selfStudy"]["nodeId"]
        for task in p1_demo_content["tasks"]
        for node in task["nodes"]
    ]
    if generated_self_study_nodes != [
        f"P1T{task_index}-N0{node_index}"
        for task_index in range(1, 4)
        for node_index in range(1, 5)
    ]:
        raise RuntimeError("P1 self-study content must cover all twelve nodes in canonical order")
    report = {"bookId": BOOK, "source": DOCX_REPO_PATH, "projects": len(projects), "tasks": task_count, "widgets": len(widgets), "media": len(media_map)}
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report

def main() -> None:
    if not DOCX.exists():
        raise FileNotFoundError(DOCX)
    with ZipFile(DOCX) as zf:
        rels = load_relationships(zf)
        blocks = parse_blocks(zf)
        media_map = write_media(zf, rels)
    projects = split_projects(blocks)
    report = write_outputs(projects, rels, media_map)
    print(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()


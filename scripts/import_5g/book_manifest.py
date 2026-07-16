"""Textbook manifest helpers for the 5G importer."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_book_manifest(root: Path, book_id: str) -> dict[str, Any]:
    path = root / "config" / "textbooks" / book_id / "textbook.manifest.json"
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_source_docx(root: Path, manifest: dict[str, Any]) -> Path:
    source = manifest.get("source")
    source_info = source if isinstance(source, dict) else {}
    candidates = [
        str(source_info.get("preferredPath") or "").strip(),
        str(source_info.get("path") or "").strip(),
    ]
    tried = [item for item in candidates if item]
    for item in tried:
        candidate = root / item
        if candidate.exists():
            return candidate
    raise FileNotFoundError(f"Could not find textbook source DOCX. Tried: {', '.join(tried)}")


def resolve_output_path(root: Path, manifest: dict[str, Any], key: str) -> Path:
    outputs = manifest.get("outputs")
    output_info = outputs if isinstance(outputs, dict) else {}
    value = str(output_info.get(key) or "").strip()
    if not value:
        book_id = str(manifest.get("bookId") or "book").strip()
        raise KeyError(f"textbook manifest {book_id} is missing outputs.{key}")
    return root / value


def repo_relative_path(root: Path, target: Path) -> str:
    try:
        return target.resolve().relative_to(root.resolve()).as_posix()
    except ValueError:
        return target.as_posix()

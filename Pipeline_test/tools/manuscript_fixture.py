"""Versioned frozen-fixture → editor title/body mapping for new P1 runs.

The original Markdown source is immutable; API contentHash belongs to the
canonical BODY, not to the entire fixture file including the H1 title.
Old run artifacts must keep their original interpretation.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
import re
import unicodedata

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "input" / "manuscript"
CONVERSION_RULE_VERSION = "markdown-h1-title-body-nfc-lf-v1"
_HEADING = re.compile(r"\A# (Chương ([1-9][0-9]*) — [^\n]+)\n\n")


def parse_fixture_chapter(index: int, fixture_dir: str | Path | None = None) -> dict[str, str | int]:
    """Read chNN.md without mutating it; return exact normalized editor fields.

    Rule: UTF-8 without BOM; CRLF → LF; NFC; required first H1
    '# Chương N — ...' followed by exactly one blank line; the rest is BODY.
    No other trimming is done, so persisted prose/hash are deterministic.
    """
    if type(index) is not int or not 1 <= index <= 99:
        raise ValueError("Invalid fixture chapter number")
    path = Path(fixture_dir or FIXTURE_DIR) / f"ch{index:02d}.md"
    source_bytes = path.read_bytes()
    if source_bytes.startswith(b"\xef\xbb\xbf"):
        raise ValueError("Fixture UTF-8 BOM is not allowed")
    source = source_bytes.decode("utf-8", errors="strict")
    if "\r" in source.replace("\r\n", ""):
        raise ValueError("Fixture has bare carriage return")
    normalized = unicodedata.normalize("NFC", source.replace("\r\n", "\n"))
    heading = _HEADING.match(normalized)
    if not heading:
        raise ValueError("Fixture must begin with a numbered Markdown H1 and one blank line")
    if int(heading.group(2)) != index:
        raise ValueError("Fixture heading chapter number does not match filename")
    title = heading.group(1)
    body = normalized[heading.end():]
    if not title.split(" — ",1)[1].strip() or not body.strip():
        raise ValueError("Fixture chapter title/body must not be empty")
    if body.startswith("# Chương "):
        raise ValueError("Ambiguous duplicate leading chapter heading")
    return {
        "chapter_number": index,
        "title": title,
        "body": body,
        "source_file_sha256": hashlib.sha256(source_bytes).hexdigest(),
        "canonical_body_sha256": hashlib.sha256(body.encode("utf-8")).hexdigest(),
        "conversion_rule_version": CONVERSION_RULE_VERSION,
    }

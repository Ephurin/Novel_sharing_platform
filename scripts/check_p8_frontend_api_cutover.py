#!/usr/bin/env python3
"""Fail closed when browser/mobile sources bypass the Node AI gateway.

P8-02 invariant:
Browser/mobile -> Platform API (/api/v1) -> Node AI Gateway (/ai/*) -> FastAPI.

Only frontend/mobile application source and their public env examples are scanned.
Backend/server-to-server FastAPI references are intentionally out of scope.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCAN_ROOTS = [ROOT / "web" / "src", ROOT / "mobile" / "src"]
ENV_FILES = [ROOT / "web" / ".env.example", ROOT / "mobile" / ".env.example"]
TEXT_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".env", ".example"}

RULES: list[tuple[str, re.Pattern[str]]] = [
    (
        "direct FastAPI host/port",
        re.compile(r"https?://(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[^/'\"\s]+):8000(?:/|\b)", re.I),
    ),
    (
        "browser AI service base env",
        re.compile(r"\bVITE_AI_SERVICE_BASE_URL\b"),
    ),
    (
        "browser tenant override env",
        re.compile(r"\bVITE_AI_TENANT_ID\b"),
    ),
    (
        "mobile direct AI service env",
        re.compile(r"\bEXPO_PUBLIC_[A-Z0-9_]*AI[A-Z0-9_]*(?:SERVICE|BASE_URL|TOKEN)[A-Z0-9_]*\b"),
    ),
    (
        "public/service credential env",
        re.compile(r"\b(?:VITE|EXPO_PUBLIC)_[A-Z0-9_]*(?:SERVICE_TOKEN|PLATFORM_SERVICE_TOKEN)[A-Z0-9_]*\b"),
    ),
    (
        "server service credential reference",
        re.compile(r"\bPLATFORM_SERVICE_TOKEN\b"),
    ),
    (
        "direct canonical FastAPI Story Brain path",
        re.compile(r"(?<!/ai)(?<![A-Za-z0-9_-])/v1/story-brains(?:/|\b)"),
    ),
    (
        "direct canonical FastAPI writing path",
        re.compile(r"(?<!/ai)(?<![A-Za-z0-9_-])/v1/writing/generations(?:/|\b)"),
    ),
    (
        "direct internal FastAPI path",
        re.compile(r"(?<![A-Za-z0-9_-])/internal/v1/(?:[A-Za-z0-9_./{}:-]+)?"),
    ),
]


def iter_files() -> list[Path]:
    files: list[Path] = []
    for root in SCAN_ROOTS:
        if not root.exists():
            raise SystemExit(f"missing scan root: {root.relative_to(ROOT)}")
        for path in root.rglob("*"):
            if path.is_file() and (
                path.suffix.lower() in TEXT_SUFFIXES or path.name.endswith(".env.example")
            ):
                files.append(path)
    for path in ENV_FILES:
        if not path.exists():
            raise SystemExit(f"missing public env example: {path.relative_to(ROOT)}")
        files.append(path)
    return sorted(set(files))


def main() -> int:
    violations: list[str] = []
    scanned = 0
    for path in iter_files():
        scanned += 1
        text = path.read_text(encoding="utf-8")
        for line_number, line in enumerate(text.splitlines(), start=1):
            for label, pattern in RULES:
                match = pattern.search(line)
                if match:
                    rel = path.relative_to(ROOT).as_posix()
                    snippet = line.strip()
                    if len(snippet) > 180:
                        snippet = snippet[:177] + "..."
                    violations.append(
                        f"{rel}:{line_number}: {label}: {match.group(0)!r} :: {snippet}"
                    )

    if violations:
        print("P8-02 frontend/API cutover guard: FAIL", file=sys.stderr)
        for violation in violations:
            print(f"- {violation}", file=sys.stderr)
        return 1

    print(
        f"P8-02 frontend/API cutover guard: PASS ({scanned} files scanned; "
        "browser/mobile boundary is Node-gateway-only)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

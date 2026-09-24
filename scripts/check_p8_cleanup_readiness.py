#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

CHECKS = {
    "docker-compose.yml": [
        ("NARRATIVE_REPOSITORY: postgres", True),
        ("APP_ENV: production", True),
    ],
    "ai-service/.env.example": [
        ("NARRATIVE_REPOSITORY=postgres", True),
        ("JSON_REPOSITORY_MODE=read-only", True),
    ],
    "ai-service/core/settings.py": [
        ('NARRATIVE_REPOSITORY must be postgres when APP_ENV=production', True),
        ('JSON_REPOSITORY_MODE must be read-only when APP_ENV=production', True),
    ],
    "ai-service/main.py": [
        ('read_only=settings.json_repository_mode == "read-only"', True),
    ],
    "ai-service/api/routes.py": [
        ('@router.post("/kb/confirm", response_model=ConfirmKBResponse, deprecated=True)', True),
        ('"code": "LEGACY_JSON_READ_ONLY"', True),
        ('@router.post("/sync-story", response_model=SyncStoryResponse, deprecated=True)', True),
        ('@router.post("/suggest-next", response_model=SuggestNextResponse, deprecated=True)', True),
    ],
    "ai-service/api/interactions.py": [
        ('@router.post("/process-interactions", deprecated=True)', True),
        ('"code": "DIRECT_WRITE_DISABLED"', True),
    ],
}

FORBIDDEN = {
    "docker-compose.yml": [
        "NARRATIVE_REPOSITORY: json",
        "JSON_REPOSITORY_MODE: read-write",
    ],
    "ai-service/.env.example": [
        "NARRATIVE_REPOSITORY=json",
        "JSON_REPOSITORY_MODE=read-write",
    ],
}

LEGACY_CANDIDATES = (
    "JsonNarrativeRepository",
    "StoryKBManager",
    "/suggest-next",
    "/v1/ai/kb/confirm",
    "/v1/ai/sync-story",
    "/v1/enhanced/process-interactions",
)


def main() -> int:
    failures: list[str] = []
    checked: dict[str, list[str]] = {}

    for rel, required in CHECKS.items():
        path = ROOT / rel
        text = path.read_text(encoding="utf-8")
        checked[rel] = []
        for needle, must_exist in required:
            present = needle in text
            checked[rel].append(f"{needle}: {'present' if present else 'missing'}")
            if must_exist and not present:
                failures.append(f"{rel}: required contract missing: {needle}")

    for rel, needles in FORBIDDEN.items():
        text = (ROOT / rel).read_text(encoding="utf-8")
        for needle in needles:
            if needle in text:
                failures.append(f"{rel}: forbidden production JSON write config present: {needle}")

    inventory: dict[str, list[str]] = {}
    scan_roots = [ROOT / "ai-service", ROOT / "backend", ROOT / "web", ROOT / "mobile"]
    for base in scan_roots:
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in {".py", ".ts", ".tsx", ".md", ".yml", ".yaml"}:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            hits = [needle for needle in LEGACY_CANDIDATES if needle in text]
            if hits:
                inventory[str(path.relative_to(ROOT)).replace("\\", "/")] = sorted(set(hits))

    result = {
        "status": "PASS" if not failures else "FAIL",
        "production_write_boundary": "postgres-only",
        "legacy_json_mode": "read-only",
        "p8_05_cleanup_allowed": False,
        "p8_05_gate": "DEFERRED_UNTIL_POST_RELEASE_STABILITY",
        "failures": failures,
        "checked_contracts": checked,
        "legacy_cleanup_candidates": inventory,
    }

    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    if failures:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

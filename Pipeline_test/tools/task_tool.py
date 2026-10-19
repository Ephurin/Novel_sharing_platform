"""Offline fixture integrity, run initialization, and Vietnamese whitespace counts.

Python 3.10+, standard library only. Never calls a provider or the application.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "input"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def word_count(text: str) -> int:
    text = unicodedata.normalize("NFC", text)
    body = "\n".join(line for line in text.splitlines() if not line.lstrip().startswith("#"))
    return sum(any(char.isalnum() for char in token) for token in body.split())


def inspect_fixture() -> dict:
    manifest_path = INPUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    errors = []
    seen = set()
    words = 0
    chapters = []
    for item in manifest["files"]:
        relative = item["path"]
        path = (INPUT / relative).resolve()
        if not path.is_relative_to(INPUT.resolve()) or relative in seen:
            errors.append(f"Unsafe or duplicate path: {relative}")
            continue
        seen.add(relative)
        if not path.is_file():
            errors.append(f"Missing: {relative}")
            continue
        if digest(path) != item["sha256"]:
            errors.append(f"Hash mismatch: {relative}")
        if "chapter_number" in item:
            count = word_count(path.read_text(encoding="utf-8-sig"))
            words += count
            chapters.append(item["chapter_number"])
            if count != item["words"]:
                errors.append(f"Word count mismatch: {relative}")
    actual = {p.relative_to(INPUT).as_posix() for p in INPUT.rglob("*")
              if p.is_file() and p != manifest_path}
    if actual != seen:
        errors.append(f"File inventory mismatch: {sorted(actual ^ seen)}")
    if sorted(chapters) != [1, 2, 3, 4, 5]:
        errors.append("Seed chapter sequence must be 1..5")
    if words != manifest["seed_words"]:
        errors.append("Total seed word count mismatch")
    with (INPUT / "chapter_plan.csv").open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if [int(row["chapter"]) for row in rows] != list(range(1, 41)):
        errors.append("Plan must contain chapters 1..40 in order")
    if len(rows) >= 5 and [r["seed_state"] for r in rows[:5]] != ["complete"] * 4 + ["partial"]:
        errors.append("Plan seed states mismatch")
    if any(None in row or any(v is None for v in row.values()) for row in rows):
        errors.append("Malformed chapter plan CSV")
    with (INPUT / "PAYOFF_LEDGER.csv").open(encoding="utf-8-sig", newline="") as handle:
        payoffs = list(csv.DictReader(handle))
    if [row["id"] for row in payoffs] != [f"PF{i:02d}" for i in range(1, 13)]:
        errors.append("Payoff IDs must be PF01..PF12")
    return {"check": "OFFLINE_FIXTURE_INTEGRITY_ONLY", "ok": not errors,
            "fixture_id": manifest["fixture_id"], "version": manifest["version"],
            "manifest_sha256": digest(manifest_path), "seed_words": words,
            "planned_chapters": len(rows), "errors": errors,
            "note": "This does not verify application behavior or literary quality."}


def initialize(run_id: str) -> dict:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}", run_id):
        raise ValueError("run-id must contain 1..80 ASCII letters/digits/underscore/hyphen")
    if run_id.upper() in {"CON", "PRN", "AUX", "NUL", *[f"COM{i}" for i in range(1, 10)],
                          *[f"LPT{i}" for i in range(1, 10)]}:
        raise ValueError("Reserved Windows name")
    check = inspect_fixture()
    if not check["ok"]:
        raise ValueError(f"Fixture invalid: {check['errors']}")
    destination = ROOT / "runs" / run_id
    destination.mkdir(exist_ok=False)
    for source in (ROOT / "templates").iterdir():
        if source.is_file():
            shutil.copyfile(source, destination / source.name)
    for name in ("evidence", "final/chapters"):
        (destination / name).mkdir(parents=True, exist_ok=True)
    for name in ("run_config.json", "checkpoint.json"):
        path = destination / name
        data = json.loads(path.read_text(encoding="utf-8"))
        data["run_id"] = run_id
        if name == "run_config.json":
            data["fixture_manifest_sha256"] = check["manifest_sha256"]
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"created": str(destination), "status": "NOT_STARTED",
            "note": "Offline initialization only. Configure approved live-run limits before execution."}


def count_directory(directory: Path) -> dict:
    if not directory.is_dir():
        raise ValueError(f"Not a directory: {directory}")
    paths = sorted(directory.glob("ch[0-9][0-9].md"))
    if not paths:
        raise ValueError("No chNN.md files found; count the chapters directory, not novel.md")
    entries = [{"file": p.name, "words": word_count(p.read_text(encoding="utf-8-sig")),
                "sha256": digest(p)} for p in paths]
    total = sum(e["words"] for e in entries)
    return {"metric": "NFC whitespace units containing a letter or digit; Markdown headings excluded",
            "chapters": entries, "total_words": total, "target_words": 100000,
            "in_target_range": 95000 <= total <= 105000,
            "expected_40_chapter_files_present": [p.name for p in paths] == [f"ch{i:02d}.md" for i in range(1, 41)],
            "note": "Length only: no claim about provenance, repetition, completion, or quality."}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest="command", required=True)
    subs.add_parser("verify")
    init = subs.add_parser("init")
    init.add_argument("--run-id", required=True)
    count = subs.add_parser("count")
    count.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.command == "verify":
            result = inspect_fixture()
        elif args.command == "init":
            result = initialize(args.run_id)
        else:
            result = count_directory(args.directory)
        print(json.dumps(result, ensure_ascii=True, indent=2))
        return 1 if result.get("ok") is False else 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=True), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

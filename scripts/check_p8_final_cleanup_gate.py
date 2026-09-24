#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GATE = ROOT / "docs/development/P8-05-FINAL-CLEANUP-GATE/stability-gate.json"

REQUIRED_TRUE = (
    "observation_window_completed",
    "production_json_writes_zero",
    "rollback_path_retained",
    "supervisor_cleanup_gate_accepted",
)


def load_gate(path: Path) -> dict:
    if not path.exists():
        return {
            "status": "BLOCKED",
            "reason": f"stability gate file missing: {path.relative_to(ROOT)}",
        }
    return json.loads(path.read_text(encoding="utf-8"))


def evaluate(gate: dict) -> dict:
    blockers: list[str] = []

    if not gate.get("release_identifier"):
        blockers.append("release_identifier missing")

    for field in REQUIRED_TRUE:
        if gate.get(field) is not True:
            blockers.append(f"{field} is not true")

    if gate.get("error_budget_status") != "within_budget":
        blockers.append("error_budget_status is not within_budget")

    incidents = gate.get("open_rollback_incidents")
    if incidents != 0:
        blockers.append("open_rollback_incidents must be 0")

    evidence = gate.get("evidence")
    if not isinstance(evidence, list) or not evidence:
        blockers.append("stability evidence list is empty")

    status = "OPEN" if not blockers else "BLOCKED"
    return {
        "status": status,
        "cleanup_allowed": status == "OPEN",
        "blockers": blockers,
        "release_identifier": gate.get("release_identifier"),
        "observation_window_started_at": gate.get("observation_window_started_at"),
        "observation_window_ended_at": gate.get("observation_window_ended_at"),
        "error_budget_status": gate.get("error_budget_status"),
        "open_rollback_incidents": incidents,
        "supervisor_cleanup_gate_accepted": gate.get("supervisor_cleanup_gate_accepted") is True,
        "evidence": evidence if isinstance(evidence, list) else [],
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Evaluate the P8-05 post-release final cleanup gate."
    )
    parser.add_argument("--gate", type=Path, default=DEFAULT_GATE)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--expect-blocked",
        action="store_true",
        help="Pass only while destructive cleanup remains blocked.",
    )
    mode.add_argument(
        "--require-open",
        action="store_true",
        help="Pass only after the explicit stability gate is open.",
    )
    args = parser.parse_args()

    path = args.gate if args.gate.is_absolute() else ROOT / args.gate
    result = evaluate(load_gate(path))
    try:
        display_path = path.relative_to(ROOT)
    except ValueError:
        display_path = path
    result["gate_file"] = str(display_path).replace("\\", "/")
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))

    if args.expect_blocked:
        return 0 if result["status"] == "BLOCKED" else 2
    return 0 if result["status"] == "OPEN" else 3


if __name__ == "__main__":
    raise SystemExit(main())

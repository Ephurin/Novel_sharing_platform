#!/usr/bin/env python3
"""
Offline Evidence Validator for Gate AI-PIPE-01 Closed-Loop Validation.

Validates the evidence JSON emitted by scripts/run_ai_pipe_01_p1_closed_loop.py:
1. Valid structure and metadata (test_gate, pipeline, commit SHA, branch).
2. Exactly 15 checkpoints present, strictly numbered 1 to 15, all status == 'PASS'.
3. Provenance and persistence invariants verified:
   - Checkpoint 12: source_type == 'AI_DRAFT_ACCEPT', outbox_event_type == 'INCREMENTAL_ANALYSIS'.
   - Checkpoint 14: version_advanced is True.
   - Checkpoint 15: hashes_differ is True, brain_version_after > brain_version_before.
4. Fail-closed: includes negative self-test suite.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from pathlib import Path
from typing import Any


def validate(evidence: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    def require(condition: bool, code: str) -> None:
        if not condition:
            errors.append(code)

    require(evidence.get("test_gate") == "AI-PIPE-01", "invalid_test_gate")
    require(evidence.get("pipeline") == "P1", "invalid_pipeline")
    require(evidence.get("gate_verdict") == "P1_CLOSED_LOOP_PASS", "invalid_gate_verdict")

    sha = evidence.get("tested_code_commit")
    require(isinstance(sha, str) and (bool(re.fullmatch(r"[0-9a-f]{40}", sha)) or bool(re.fullmatch(r"[0-9a-f]{7,8}", sha))), "invalid_commit_sha")

    branch = evidence.get("branch")
    require(isinstance(branch, str) and len(branch) > 0, "missing_branch")

    require(evidence.get("total_checkpoints") == 15, "invalid_total_checkpoints")
    require(evidence.get("checkpoints_passed") == 15, "not_all_checkpoints_passed")
    require(evidence.get("checkpoints_failed") == 0, "checkpoints_failed_nonzero")

    checkpoints = evidence.get("checkpoints", [])
    require(isinstance(checkpoints, list) and len(checkpoints) == 15, "invalid_checkpoints_list")

    for i, cp in enumerate(checkpoints, start=1):
        require(cp.get("checkpoint") == i, f"checkpoint_{i}_out_of_order")
        require(cp.get("status") == "PASS", f"checkpoint_{i}_status_not_pass")
        require(isinstance(cp.get("details"), dict), f"checkpoint_{i}_details_missing")

    # Invariant Checkpoint 12: Persistence contract
    cp12 = next((c for c in checkpoints if c.get("checkpoint") == 12), {})
    cp12_details = cp12.get("details", {})
    require(cp12_details.get("source_type") == "AI_DRAFT_ACCEPT", "cp12_source_type_not_ai_draft_accept")
    require(cp12_details.get("outbox_event_type") == "INCREMENTAL_ANALYSIS", "cp12_outbox_event_not_incremental_analysis")

    # Invariant Checkpoint 14: Story Brain update
    cp14 = next((c for c in checkpoints if c.get("checkpoint") == 14), {})
    cp14_details = cp14.get("details", {})
    require(cp14_details.get("version_advanced") is True, "cp14_version_did_not_advance")

    # Invariant Checkpoint 15: Memory feedback observed
    cp15 = next((c for c in checkpoints if c.get("checkpoint") == 15), {})
    cp15_details = cp15.get("details", {})
    require(cp15_details.get("hashes_differ") is True, "cp15_context_hashes_must_differ")
    v_before = cp15_details.get("brain_version_before", 0)
    v_after = cp15_details.get("brain_version_after", 0)
    require(v_after > v_before, "cp15_brain_version_after_must_exceed_before")

    return errors


def run_self_tests(sample_evidence: dict[str, Any]) -> None:
    # 1. Base evidence must pass cleanly
    base_errors = validate(sample_evidence)
    assert not base_errors, f"Self-test base evidence failed: {base_errors}"

    # 2. Reject gate_verdict mismatch
    e2 = copy.deepcopy(sample_evidence)
    e2["gate_verdict"] = "P1_CLOSED_LOOP_FAIL"
    assert "invalid_gate_verdict" in validate(e2)

    # 3. Reject checkpoint failure
    e3 = copy.deepcopy(sample_evidence)
    e3["checkpoints"][14]["status"] = "FAIL"
    e3["checkpoints_passed"] = 14
    e3["checkpoints_failed"] = 1
    assert "not_all_checkpoints_passed" in validate(e3)

    # 4. Reject invalid source_type
    e4 = copy.deepcopy(sample_evidence)
    e4["checkpoints"][11]["details"]["source_type"] = "AUTHOR_MANUAL"
    assert "cp12_source_type_not_ai_draft_accept" in validate(e4)

    # 5. Reject if context hash did not change after acceptance
    e5 = copy.deepcopy(sample_evidence)
    e5["checkpoints"][14]["details"]["hashes_differ"] = False
    assert "cp15_context_hashes_must_differ" in validate(e5)

    # 6. Reject if brain version did not advance
    e6 = copy.deepcopy(sample_evidence)
    e6["checkpoints"][14]["details"]["brain_version_after"] = e6["checkpoints"][14]["details"]["brain_version_before"]
    assert "cp15_brain_version_after_must_exceed_before" in validate(e6)

    # 7. Reject invalid commit SHA
    e7 = copy.deepcopy(sample_evidence)
    e7["tested_code_commit"] = "not-a-sha"
    assert "invalid_commit_sha" in validate(e7)

    print("[PASS] Self-test suite: all 7 negative guardrails verified.")


def main():
    parser = argparse.ArgumentParser(description="Validate Gate AI-PIPE-01 evidence")
    parser.add_argument("--evidence", default="docs/development/AI-CORE-PIPELINE-VALIDATION-01/ai-pipe-01-closed-loop-evidence.json")
    parser.add_argument("--self-test", action="store_true", help="Run negative self-tests")
    args = parser.parse_args()

    ev_path = Path(args.evidence)
    if not ev_path.is_file():
        print(f"ERROR: Evidence file not found at {ev_path}", file=sys.stderr)
        sys.exit(1)

    with open(ev_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if args.self_test:
        run_self_tests(data)

    errors = validate(data)
    if errors:
        print(f"FAILED: Evidence validation failed with {len(errors)} error(s):", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        sys.exit(1)

    print(f"PASS: Evidence validation succeeded (0 errors) for {ev_path.name}")
    print(f"Gate: {data.get('test_gate')} | Pipeline: {data.get('pipeline')} | Verdict: {data.get('gate_verdict')}")
    print(f"Commit: {data.get('tested_code_commit')} | Branch: {data.get('branch')}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Offline Evidence Validator for Gates AI-PIPE-01 and AI-PIPE-01A Closed-Loop Validation.

Validates the evidence JSON emitted by:
- scripts/run_ai_pipe_01_p1_closed_loop.py (AI-PIPE-01 in-memory structural loop)
- scripts/run_ai_pipe_01a_production_persistence.py (AI-PIPE-01A production persistence loop)

Invariants verified:
1. Valid structure and metadata (test_gate, pipeline, commit SHA, branch).
2. Exactly 15 checkpoints present, strictly numbered 1 to 15, all status == 'PASS'.
3. Provenance and persistence invariants verified:
   - source_type == 'AI_DRAFT_ACCEPT', outbox_event_type == 'INCREMENTAL_ANALYSIS'.
   - brain version advances.
   - context previews reflect updated state.
   - For AI-PIPE-01A: idempotency row count == 1, outbox reaches COMPLETED, database is PostgreSQL.
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

    gate = evidence.get("test_gate")
    require(gate in ("AI-PIPE-01", "AI-PIPE-01A"), "invalid_test_gate")
    require(evidence.get("pipeline") == "P1", "invalid_pipeline")

    if gate == "AI-PIPE-01":
        require(evidence.get("gate_verdict") == "P1_CLOSED_LOOP_PASS", "invalid_gate_verdict")
    elif gate == "AI-PIPE-01A":
        require(evidence.get("gate_verdict") == "P1_PRODUCTION_PERSISTENCE_PASS", "invalid_gate_verdict")
        require("PostgreSQL" in str(evidence.get("database_backend")), "database_backend_not_postgresql")

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

    if gate == "AI-PIPE-01":
        # Checkpoint 12: Persistence contract
        cp12 = next((c for c in checkpoints if c.get("checkpoint") == 12), {})
        cp12_details = cp12.get("details", {})
        require(cp12_details.get("source_type") == "AI_DRAFT_ACCEPT", "cp12_source_type_not_ai_draft_accept")
        require(cp12_details.get("outbox_event_type") == "INCREMENTAL_ANALYSIS", "cp12_outbox_event_not_incremental_analysis")

        # Checkpoint 14: Story Brain update
        cp14 = next((c for c in checkpoints if c.get("checkpoint") == 14), {})
        cp14_details = cp14.get("details", {})
        require(cp14_details.get("version_advanced") is True, "cp14_version_did_not_advance")

        # Checkpoint 15: Memory feedback observed
        cp15 = next((c for c in checkpoints if c.get("checkpoint") == 15), {})
        cp15_details = cp15.get("details", {})
        require(cp15_details.get("hashes_differ") is True, "cp15_context_hashes_must_differ")
        v_before = cp15_details.get("brain_version_before", 0)
        v_after = cp15_details.get("brain_version_after", 0)
        require(v_after > v_before, "cp15_brain_version_after_must_exceed_before")

    elif gate == "AI-PIPE-01A":
        # Checkpoint 08: Direct PostgreSQL chapter_revisions persistence
        cp08 = next((c for c in checkpoints if c.get("checkpoint") == 8), {})
        cp08_details = cp08.get("details", {})
        require(cp08_details.get("source_type") == "AI_DRAFT_ACCEPT", "cp08_source_type_not_ai_draft_accept")
        require(bool(cp08_details.get("source_generation_id")), "cp08_missing_source_generation_id")
        require(bool(cp08_details.get("content_hash")), "cp08_missing_content_hash")

        # Checkpoint 10: PostgreSQL outbox event
        cp10 = next((c for c in checkpoints if c.get("checkpoint") == 10), {})
        cp10_details = cp10.get("details", {})
        require(cp10_details.get("event_type") == "INCREMENTAL_ANALYSIS", "cp10_outbox_event_not_incremental_analysis")

        # Checkpoint 11: Real outbox processor dispatch completion
        cp11 = next((c for c in checkpoints if c.get("checkpoint") == 11), {})
        cp11_details = cp11.get("details", {})
        require(cp11_details.get("status") == "COMPLETED", "cp11_outbox_status_not_completed")

        # Checkpoint 12: Story Brain update in PostgreSQL
        cp12 = next((c for c in checkpoints if c.get("checkpoint") == 12), {})
        cp12_details = cp12.get("details", {})
        v_before = cp12_details.get("brain_version_before", 0)
        v_after = cp12_details.get("brain_version_after", 0)
        require(v_after > v_before, "cp12_brain_version_did_not_advance")

        # Checkpoint 13: Second preview/generation observes updated brain version
        cp13 = next((c for c in checkpoints if c.get("checkpoint") == 13), {})
        cp13_details = cp13.get("details", {})
        require(cp13_details.get("preview_hashes_differ") is True, "cp13_preview_hashes_must_differ")
        require(cp13_details.get("brain_version_used") == v_after, "cp13_brain_version_used_mismatch")

        # Checkpoint 14: Idempotency invariant
        cp14 = next((c for c in checkpoints if c.get("checkpoint") == 14), {})
        cp14_details = cp14.get("details", {})
        require(cp14_details.get("row_count_in_db") == 1, "cp14_idempotency_duplicate_row_detected")

    return errors


def run_self_tests(sample_evidence: dict[str, Any]) -> None:
    # 1. Base evidence must pass cleanly
    base_errors = validate(sample_evidence)
    assert not base_errors, f"Self-test base evidence failed: {base_errors}"

    gate = sample_evidence.get("test_gate")

    # 2. Reject gate_verdict mismatch
    e2 = copy.deepcopy(sample_evidence)
    e2["gate_verdict"] = "INVALID_VERDICT"
    assert "invalid_gate_verdict" in validate(e2)

    # 3. Reject checkpoint failure
    e3 = copy.deepcopy(sample_evidence)
    e3["checkpoints"][14]["status"] = "FAIL"
    e3["checkpoints_passed"] = 14
    e3["checkpoints_failed"] = 1
    assert "not_all_checkpoints_passed" in validate(e3)

    if gate == "AI-PIPE-01":
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

    elif gate == "AI-PIPE-01A":
        # 4. Reject non-PostgreSQL DB
        e4 = copy.deepcopy(sample_evidence)
        e4["database_backend"] = "SQLite"
        assert "database_backend_not_postgresql" in validate(e4)

        # 5. Reject uncompleted outbox
        e5 = copy.deepcopy(sample_evidence)
        e5["checkpoints"][10]["details"]["status"] = "PENDING"
        assert "cp11_outbox_status_not_completed" in validate(e5)

        # 6. Reject duplicate idempotency row
        e6 = copy.deepcopy(sample_evidence)
        e6["checkpoints"][13]["details"]["row_count_in_db"] = 2
        assert "cp14_idempotency_duplicate_row_detected" in validate(e6)

    # 7. Reject invalid commit SHA
    e7 = copy.deepcopy(sample_evidence)
    e7["tested_code_commit"] = "not-a-sha"
    assert "invalid_commit_sha" in validate(e7)

    print(f"[PASS] Self-test suite ({gate}): all negative guardrails verified.")


def main():
    parser = argparse.ArgumentParser(description="Validate Gate AI-PIPE-01 and AI-PIPE-01A evidence")
    parser.add_argument(
        "--evidence",
        default="docs/development/AI-CORE-PIPELINE-VALIDATION-01/ai-pipe-01a-production-persistence.json",
        help="Path to evidence JSON",
    )
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

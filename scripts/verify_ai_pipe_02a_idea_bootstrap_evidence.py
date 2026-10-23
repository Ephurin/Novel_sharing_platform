#!/usr/bin/env python3
"""
Offline Evidence Validator for Gate AI-PIPE-02A Idea/Outline -> Story Brain Adapter.

Validates the evidence JSON emitted by:
- scripts/run_ai_pipe_02a_idea_bootstrap.py (docs/development/AI-CORE-PIPELINE-VALIDATION-02/ai-pipe-02a-idea-bootstrap.json)

Invariants verified:
1. Valid structure and metadata (gate='AI-PIPE-02A', pipeline='P2', verdict='P2_IDEA_BOOTSTRAP_PASS').
2. Exactly 13 checkpoints present, strictly numbered 1 to 13, all status == 'PASS'.
3. Idempotent bootstrap job allocation (CP 1 & 2).
4. Structured initial proposals cover facts (premise) and entities (CP 3).
5. Review acceptance & baseline activation reaches active state and version >= 2 (CP 4 & 5).
6. Canonical chapter & revision association (CP 6).
7. Direct PostgreSQL narrative schema persistence (no ad-hoc store) (CP 7).
8. Context preview incorporates initial brain state (CP 8).
9. Standard P1 assisted writing loop reuse with valid patch (CP 9).
10. Canonical draft acceptance persistence with source_type=AI_DRAFT_ACCEPT (CP 10).
11. Transactional outbox INCREMENTAL_ANALYSIS reaches COMPLETED and brain version advances (CP 11).
12. Memory feedback observed in second context preview (CP 12).
13. Acceptance idempotency and author-control semantics (CP 13).
14. Fail-closed: includes negative self-test suite.
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

    gate = evidence.get("gate")
    require(gate == "AI-PIPE-02A", "invalid_gate")
    require(evidence.get("pipeline") == "P2", "invalid_pipeline")
    require(evidence.get("verdict") == "P2_IDEA_BOOTSTRAP_PASS", "invalid_verdict")

    sha = evidence.get("git_commit")
    require(
        isinstance(sha, str)
        and (bool(re.fullmatch(r"[0-9a-f]{40}", sha)) or bool(re.fullmatch(r"[0-9a-f]{7,8}", sha))),
        "invalid_commit_sha",
    )

    branch = evidence.get("git_branch")
    require(isinstance(branch, str) and len(branch) > 0, "missing_branch")

    summary = evidence.get("summary", {})
    require(summary.get("total_checkpoints") == 13, "invalid_total_checkpoints")
    require(summary.get("passed") == 13, "not_all_checkpoints_passed")
    require(summary.get("failed") == 0, "checkpoints_failed_nonzero")

    checkpoints = evidence.get("checkpoints", [])
    require(isinstance(checkpoints, list) and len(checkpoints) == 13, "invalid_checkpoints_list")

    cp_map: dict[int, dict[str, Any]] = {}
    for i, cp in enumerate(checkpoints, start=1):
        num = cp.get("checkpoint")
        require(num == i, f"checkpoint_out_of_order_{i}")
        require(cp.get("status") == "PASS", f"checkpoint_{i}_not_passed")
        if isinstance(num, int):
            cp_map[num] = cp

    # Checkpoint 1 & 2: Idempotency
    cp1 = cp_map.get(1, {})
    cp2 = cp_map.get(2, {})
    require(
        cp1.get("details", {}).get("job_id") == cp2.get("details", {}).get("job_id_1"),
        "cp1_cp2_job_mismatch",
    )
    require(
        cp2.get("details", {}).get("job_id_1") == cp2.get("details", {}).get("job_id_2"),
        "cp2_not_idempotent",
    )

    # Checkpoint 3: Structured proposals
    cp3 = cp_map.get(3, {})
    c3_types = cp3.get("details", {}).get("proposal_types", [])
    require("fact" in c3_types, "cp3_missing_fact_proposal")
    require("entity" in c3_types, "cp3_missing_entity_proposal")

    # Checkpoint 4 & 5: Acceptance & Activation
    cp4 = cp_map.get(4, {})
    cp5 = cp_map.get(5, {})
    require(cp4.get("details", {}).get("brain_version") == 2, "cp4_brain_version_not_2")
    require(cp5.get("details", {}).get("status") == "active", "cp5_status_not_active")

    # Checkpoint 6: First Chapter & Revision
    cp6 = cp_map.get(6, {})
    require(bool(cp6.get("details", {}).get("chapter_id")), "cp6_missing_chapter_id")
    require(bool(cp6.get("details", {}).get("revision_id")), "cp6_missing_revision_id")

    # Checkpoint 7: PostgreSQL schema verification
    cp7 = cp_map.get(7, {})
    require(cp7.get("details", {}).get("pg_entities", 0) > 0, "cp7_no_pg_entities")
    require(cp7.get("details", {}).get("pg_facts", 0) > 0, "cp7_no_pg_facts")

    # Checkpoint 8: Context preview
    cp8 = cp_map.get(8, {})
    require(cp8.get("details", {}).get("brain_version", 0) >= 2, "cp8_brain_version_below_bootstrap_baseline")

    # Checkpoint 9: AI Writing Generation
    cp9 = cp_map.get(9, {})
    require(cp9.get("details", {}).get("status") == "completed", "cp9_generation_not_completed")
    require(cp9.get("details", {}).get("validation_status") == "passed", "cp9_validation_not_passed")

    # Checkpoint 10: Canonical Draft Acceptance
    cp10 = cp_map.get(10, {})
    require(cp10.get("details", {}).get("source_type") == "AI_DRAFT_ACCEPT", "cp10_source_type_mismatch")
    require(
        cp10.get("details", {}).get("revision_id") == cp10.get("details", {}).get("chapters_latest_revision_id"),
        "cp10_chapter_pointer_mismatch",
    )

    # Checkpoint 11: Outbox Dispatch & Brain Advancement
    cp11 = cp_map.get(11, {})
    require(cp11.get("details", {}).get("outbox_status") == "COMPLETED", "cp11_outbox_not_completed")
    require(
        cp11.get("details", {}).get("story_brain_version", 0)
        > cp8.get("details", {}).get("brain_version", 0),
        "cp11_brain_not_advanced",
    )

    review = cp11.get("details", {}).get("author_review", {})
    require(review.get("decision_origin") == "AUTHORIZED_AUTHOR_HTTP_GATEWAY", "cp11_missing_author_review")
    require(bool(review.get("pending_proposal_ids")), "cp11_missing_pending_proposals")
    require(review.get("canon_before") is not None and review.get("canon_before") == review.get("canon_before_review"), "cp11_canon_changed_before_review")
    require(review.get("approved_once") is True and bool(review.get("author_decisions")) and all(d.get("replay_status") == 409 and d.get("stale_status") == 409 and d.get("brain_version_after") == d.get("brain_version_before", 0)+1 for d in review.get("author_decisions", [])), "cp11_review_not_exactly_once")

    # Checkpoint 12: Second Context Preview
    cp12 = cp_map.get(12, {})
    require(cp12.get("details", {}).get("brain_version", 0) >= 3, "cp12_preview_brain_version_not_advanced")

    # Checkpoint 13: Acceptance Idempotency & Author Control
    cp13 = cp_map.get(13, {})
    cp13_details = cp13.get("details", {})
    require(cp13_details.get("duplicate_row_count") == 1, "cp13_duplicate_row_detected")
    require(bool(cp13_details.get("unaccepted_generation_id")), "cp13_missing_unaccepted_generation_id")
    require(
        cp13_details.get("latest_revision_before") is not None
        and cp13_details.get("latest_revision_before") == cp13_details.get("latest_revision_after"),
        "cp13_latest_revision_mutated",
    )
    require(
        cp13_details.get("unaccepted_generation_revision_count") == 0,
        "cp13_unaccepted_generation_persisted",
    )
    require(
        cp13_details.get("brain_version_before") is not None
        and cp13_details.get("brain_version_before") == cp13_details.get("brain_version_after"),
        "cp13_brain_version_mutated",
    )

    return errors


def run_self_tests() -> None:
    print("[SELF-TEST] Running negative mutant verification suite...")
    valid_fixture: dict[str, Any] = {
        "gate": "AI-PIPE-02A",
        "pipeline": "P2",
        "verdict": "P2_IDEA_BOOTSTRAP_PASS",
        "git_commit": "40f8fb8a5d2b39b94d5520375ffdda6f059434f4",
        "git_branch": "astra/ai-pipe-02-idea-bootstrap",
        "summary": {"total_checkpoints": 13, "passed": 13, "failed": 0},
        "checkpoints": [
            {
                "checkpoint": 1,
                "status": "PASS",
                "details": {"job_id": "job-123"},
            },
            {
                "checkpoint": 2,
                "status": "PASS",
                "details": {"job_id_1": "job-123", "job_id_2": "job-123"},
            },
            {
                "checkpoint": 3,
                "status": "PASS",
                "details": {"proposal_types": ["fact", "entity"]},
            },
            {
                "checkpoint": 4,
                "status": "PASS",
                "details": {"brain_version": 2},
            },
            {
                "checkpoint": 5,
                "status": "PASS",
                "details": {"status": "active"},
            },
            {
                "checkpoint": 6,
                "status": "PASS",
                "details": {"chapter_id": "ch-1", "revision_id": "rev-1"},
            },
            {
                "checkpoint": 7,
                "status": "PASS",
                "details": {"pg_entities": 3, "pg_facts": 4},
            },
            {
                "checkpoint": 8,
                "status": "PASS",
                "details": {"brain_version": 2},
            },
            {
                "checkpoint": 9,
                "status": "PASS",
                "details": {"status": "completed", "validation_status": "passed"},
            },
            {
                "checkpoint": 10,
                "status": "PASS",
                "details": {
                    "source_type": "AI_DRAFT_ACCEPT",
                    "revision_id": "rev-2",
                    "chapters_latest_revision_id": "rev-2",
                },
            },
            {
                "checkpoint": 11,
                "status": "PASS",
                "details": {"outbox_status": "COMPLETED", "story_brain_version": 3},
            },
            {
                "checkpoint": 12,
                "status": "PASS",
                "details": {"brain_version": 3},
            },
            {
                "checkpoint": 13,
                "status": "PASS",
                "details": {
                    "accepted_revision_id": "rev-2",
                    "duplicate_row_count": 1,
                    "unaccepted_generation_id": "gen-unacc-456",
                    "latest_revision_before": "rev-2",
                    "latest_revision_after": "rev-2",
                    "unaccepted_generation_revision_count": 0,
                    "brain_version_before": 3,
                    "brain_version_after": 3,
                },
            },
        ],
    }

    valid_fixture["checkpoints"][10]["details"]["author_review"] = {
        "decision_origin": "AUTHORIZED_AUTHOR_HTTP_GATEWAY", "pending_proposal_ids": ["p1"],
        "canon_before": {"brain_version": 2}, "canon_before_review": {"brain_version": 2},
        "approved_once": True, "author_decisions": [{"replay_status": 409, "stale_status": 409, "brain_version_before": 2, "brain_version_after": 3}],
    }

    # Baseline valid fixture passes
    base_errs = validate(valid_fixture)
    assert not base_errs, f"Base fixture should pass, got: {base_errs}"

    # Mutant 1: Wrong gate
    m1 = copy.deepcopy(valid_fixture)
    m1["gate"] = "AI-PIPE-01"
    assert "invalid_gate" in validate(m1)

    # Mutant 2: Missing fact proposal in CP 3
    m2 = copy.deepcopy(valid_fixture)
    m2["checkpoints"][2]["details"]["proposal_types"] = ["entity"]
    assert "cp3_missing_fact_proposal" in validate(m2)

    # Mutant 3: Outbox not completed in CP 11
    m3 = copy.deepcopy(valid_fixture)
    m3["checkpoints"][10]["details"]["outbox_status"] = "PENDING"
    assert "cp11_outbox_not_completed" in validate(m3)

    # Mutant 4: Duplicate row in CP 13
    m4 = copy.deepcopy(valid_fixture)
    m4["checkpoints"][12]["details"]["duplicate_row_count"] = 2
    assert "cp13_duplicate_row_detected" in validate(m4)

    # Mutant 5: Checkpoint failure
    m5 = copy.deepcopy(valid_fixture)
    m5["checkpoints"][8]["status"] = "FAIL"
    assert "checkpoint_9_not_passed" in validate(m5)

    # Mutant 6: Unaccepted generation mutated canonical revision
    m6 = copy.deepcopy(valid_fixture)
    m6["checkpoints"][12]["details"]["latest_revision_after"] = "rev-mutated"
    assert "cp13_latest_revision_mutated" in validate(m6)

    # Mutant 7: Unaccepted generation persisted a chapter revision row
    m7 = copy.deepcopy(valid_fixture)
    m7["checkpoints"][12]["details"]["unaccepted_generation_revision_count"] = 1
    assert "cp13_unaccepted_generation_persisted" in validate(m7)

    # Mutant 8: Unaccepted generation mutated Story Brain version
    m8 = copy.deepcopy(valid_fixture)
    m8["checkpoints"][12]["details"]["brain_version_after"] = 4
    assert "cp13_brain_version_mutated" in validate(m8)

    for field,code,value in [
        ("decision_origin","cp11_missing_author_review","outbox_auto_materialized"),
        ("pending_proposal_ids","cp11_missing_pending_proposals",[]),
        ("canon_before_review","cp11_canon_changed_before_review",{"brain_version":3}),
        ("approved_once","cp11_review_not_exactly_once",False),
    ]:
        mutant=copy.deepcopy(valid_fixture)
        mutant["checkpoints"][10]["details"]["author_review"][field]=value
        assert code in validate(mutant)

    print("[SELF-TEST] All 12 mutants successfully rejected (Fail-closed verified).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify AI-PIPE-02A evidence artifact")
    parser.add_argument(
        "--evidence-file",
        type=Path,
        default=Path("docs/development/AI-CORE-PIPELINE-VALIDATION-02/ai-pipe-02a-idea-bootstrap.json"),
        help="Path to evidence JSON",
    )
    args = parser.parse_args()

    run_self_tests()

    ev_path = args.evidence_file
    if not ev_path.is_file():
        print(f"[ERROR] Evidence file not found: {ev_path}", file=sys.stderr)
        sys.exit(1)

    with open(ev_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    errors = validate(data)
    if errors:
        print(f"[FAIL] Evidence validation failed with {len(errors)} errors:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        sys.exit(1)

    print(f"[PASS] Successfully validated evidence artifact: {ev_path}")
    print(f"       Verdict: {data.get('verdict')}")
    print(f"       Checkpoints: {data.get('summary', {}).get('passed')}/13 passed")


if __name__ == "__main__":
    main()

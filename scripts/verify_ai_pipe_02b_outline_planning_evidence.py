#!/usr/bin/env python3
"""
Offline Evidence Validator for Gate AI-PIPE-02B: Durable Outline Planning Without Future-Canon Leakage.

Validates the evidence JSON emitted by:
- scripts/run_ai_pipe_02b_outline_planning.py (docs/development/AI-CORE-PIPELINE-VALIDATION-02B/ai-pipe-02b-outline-planning.json)

Invariants verified:
1. Valid structure and metadata (gate='AI-PIPE-02B', pipeline='P2', verdict='P2_OUTLINE_PLANNING_PASS').
2. Exactly 16 checkpoints present, strictly numbered 1 to 16, all status == 'PASS'.
3. Application-facing outline/plan request & idempotent repeat (CP 1 & 2).
4. Durable PostgreSQL persistence via narrative schema (CP 3).
5. Explicit plan versioning and lifecycle (draft -> active) (CP 4 & 5).
6. Deterministic current objective selection for Chapter 1 (CP 6).
7. Context preview carries plan version and objective provenance separately from canon (CP 7).
8. Machine-checkable future leakage absence: future beats/objectives are strictly absent from historical events/facts (CP 8).
9. Standard P1 generation reuse with active plan context (CP 9).
10. Unaccepted generation safety: author control ensures no revision row created and no plan progress mutated (CP 10).
11. Accepted draft persistence via acceptDraft() and transactional outbox INCREMENTAL_ANALYSIS (CP 11).
12. Story Brain memory advances version only upon accepted draft content (CP 12).
13. Explicit author plan progress advancement (CP 13).
14. Next chapter receives next sequential objective (CP 14).
15. Plan revision/edit creates Version 2, supersedes Version 1, and preserves historical canon intact (CP 15).
16. Subsequent context preview observes active Version 2 plan and current objective (CP 16).
17. Fail-closed: includes 10 negative self-test mutants.
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
    require(gate == "AI-PIPE-02B", "invalid_gate")
    require(evidence.get("pipeline") == "P2", "invalid_pipeline")
    require(evidence.get("verdict") == "P2_OUTLINE_PLANNING_PASS", "invalid_verdict")

    sha = evidence.get("git_commit")
    require(
        isinstance(sha, str)
        and (bool(re.fullmatch(r"[0-9a-f]{40}", sha)) or bool(re.fullmatch(r"[0-9a-f]{7,8}", sha))),
        "invalid_commit_sha",
    )

    branch = evidence.get("git_branch")
    require(isinstance(branch, str) and len(branch) > 0, "missing_branch")

    summary = evidence.get("summary", {})
    require(summary.get("total_checkpoints") == 16, "invalid_total_checkpoints")
    require(summary.get("passed") == 16, "not_all_checkpoints_passed")
    require(summary.get("failed") == 0, "checkpoints_failed_nonzero")

    checkpoints = evidence.get("checkpoints", [])
    require(isinstance(checkpoints, list) and len(checkpoints) == 16, "invalid_checkpoints_list")

    cp_map: dict[int, dict[str, Any]] = {}
    for i, cp in enumerate(checkpoints, start=1):
        num = cp.get("checkpoint")
        require(num == i, f"checkpoint_out_of_order_{i}")
        require(cp.get("status") == "PASS", f"checkpoint_{i}_not_passed")
        if isinstance(num, int):
            cp_map[num] = cp

    # Checkpoint 1 & 2: Plan request and Idempotency
    cp1 = cp_map.get(1, {})
    cp1_details = cp1.get("details", {})
    require(bool(cp1_details.get("plan_id")), "cp1_missing_plan_id")
    require(cp1_details.get("plan_version") == 1, "cp1_plan_version_not_1")
    require(cp1_details.get("status") == "draft", "cp1_status_not_draft")
    require(cp1_details.get("total_objectives") == 3, "cp1_objectives_count_mismatch")

    cp2 = cp_map.get(2, {})
    cp2_details = cp2.get("details", {})
    require(
        cp1_details.get("plan_id") == cp2_details.get("plan_id_1"),
        "cp1_cp2_plan_id_mismatch",
    )
    require(
        cp2_details.get("plan_id_1") == cp2_details.get("plan_id_2"),
        "cp2_not_idempotent",
    )
    require(cp2_details.get("plan_version") == 1, "cp2_plan_version_incremented")

    # Checkpoint 3: PostgreSQL narrative persistence
    cp3 = cp_map.get(3, {})
    cp3_details = cp3.get("details", {})
    require(cp3_details.get("table") == "narrative.story_plans", "cp3_invalid_table")
    require(cp3_details.get("objectives_count_in_db") == 3, "cp3_db_objectives_count_mismatch")

    # Checkpoint 4: Explicit lifecycle & plan version
    cp4 = cp_map.get(4, {})
    cp4_details = cp4.get("details", {})
    require(cp4_details.get("plan_version") == 1, "cp4_plan_version_not_1")
    require(cp4_details.get("status") == "draft", "cp4_status_not_draft")

    # Checkpoint 5: Author activation semantics
    cp5 = cp_map.get(5, {})
    cp5_details = cp5.get("details", {})
    require(cp5_details.get("status") == "active", "cp5_status_not_active")

    # Checkpoint 6: Deterministic current objective selection
    cp6 = cp_map.get(6, {})
    cp6_details = cp6.get("details", {})
    require(cp6_details.get("order_index") == 1, "cp6_order_index_not_1")
    require(cp6_details.get("target_chapter") == 1, "cp6_target_chapter_not_1")
    require("Tỉnh dậy" in str(cp6_details.get("title")), "cp6_title_mismatch")

    # Checkpoint 7: Context preview carries plan version & objective provenance
    cp7 = cp_map.get(7, {})
    cp7_details = cp7.get("details", {})
    require(cp7_details.get("plan_version") == 1, "cp7_plan_version_not_1")
    require(bool(cp7_details.get("plan_id")), "cp7_missing_plan_id")
    require(bool(cp7_details.get("active_objective_id")), "cp7_missing_active_objective_id")

    # Checkpoint 8: Future-Information Leakage Guard (Machine-Checkable)
    cp8 = cp_map.get(8, {})
    cp8_details = cp8.get("details", {})
    require(cp8_details.get("future_events_in_db") == 0, "cp8_future_events_leaked")
    require(cp8_details.get("future_facts_in_db") == 0, "cp8_future_facts_leaked")
    require(cp8_details.get("in_recent_events") is False, "cp8_future_beat_in_recent_events")
    require(cp8_details.get("in_world_rules") is False, "cp8_future_beat_in_world_rules")

    # Checkpoint 9: Standard P1 Generation Reuse
    cp9 = cp_map.get(9, {})
    cp9_details = cp9.get("details", {})
    require(cp9_details.get("status") == "completed", "cp9_generation_not_completed")
    require(cp9_details.get("validation_status") == "passed", "cp9_validation_not_passed")

    # Checkpoint 10: Unaccepted Generation Safety
    cp10 = cp_map.get(10, {})
    cp10_details = cp10.get("details", {})
    require(cp10_details.get("latest_revision_unmutated") is True, "cp10_latest_revision_mutated")
    require(cp10_details.get("unaccepted_revision_rows") == 0, "cp10_unaccepted_revision_created")
    require(cp10_details.get("objective_status_unmutated") == "pending", "cp10_objective_status_mutated")

    # Checkpoint 11: Accepted Generation Persists via acceptDraft() & Outbox
    cp11 = cp_map.get(11, {})
    cp11_details = cp11.get("details", {})
    require(cp11_details.get("source_type") == "AI_DRAFT_ACCEPT", "cp11_source_type_mismatch")
    require(cp11_details.get("outbox_event_type") == "INCREMENTAL_ANALYSIS", "cp11_outbox_event_type_mismatch")

    # Checkpoint 12: Story Brain Advances from Accepted Content
    cp12 = cp_map.get(12, {})
    cp12_details = cp12.get("details", {})
    require(cp12_details.get("outbox_status") == "COMPLETED", "cp12_outbox_not_completed")
    require(cp12_details.get("brain_version_before", 0) >= 2, "cp12_brain_version_before_below_baseline")
    require(
        cp12_details.get("brain_version_after", 0) > cp12_details.get("brain_version_before", 0),
        "cp12_brain_version_not_advanced",
    )

    # Checkpoint 13: Explicit Plan Progress Update
    cp13 = cp_map.get(13, {})
    cp13_details = cp13.get("details", {})
    require(cp13_details.get("new_status") == "completed", "cp13_objective_not_completed")

    # Checkpoint 14: Next Chapter Receives Next Objective
    cp14 = cp_map.get(14, {})
    cp14_details = cp14.get("details", {})
    require(cp14_details.get("chapter_number") == 2, "cp14_chapter_not_2")
    require(cp14_details.get("order_index") == 2, "cp14_order_index_not_2")
    require("Roland" in str(cp14_details.get("title")), "cp14_title_missing_roland")

    # Checkpoint 15: Plan Edit Creates Version 2 without Rewriting Canon
    cp15 = cp_map.get(15, {})
    cp15_details = cp15.get("details", {})
    require(cp15_details.get("plan_v1_status") == "superseded", "cp15_plan_v1_not_superseded")
    require(cp15_details.get("plan_v2_status") == "active", "cp15_plan_v2_not_active")
    require(cp15_details.get("plan_v2_version") == 2, "cp15_plan_v2_version_not_2")
    require(cp15_details.get("canonical_brain_version", 0) >= 3, "cp15_canonical_brain_mutated")

    # Checkpoint 16: Subsequent Context Observes Active Plan Version 2
    cp16 = cp_map.get(16, {})
    cp16_details = cp16.get("details", {})
    require(cp16_details.get("observed_plan_version") == 2, "cp16_observed_plan_version_not_2")
    require("Roland" in str(cp16_details.get("observed_objective_title")), "cp16_objective_not_updated")
    require(cp16_details.get("observed_brain_version", 0) >= 3, "cp16_observed_brain_corrupted")

    return errors


def run_self_tests() -> None:
    print("[SELF-TEST] Running negative mutant verification suite for AI-PIPE-02B...")
    valid_fixture: dict[str, Any] = {
        "gate": "AI-PIPE-02B",
        "pipeline": "P2",
        "verdict": "P2_OUTLINE_PLANNING_PASS",
        "git_commit": "40f8fb8a5d2b39b94d5520375ffdda6f059434f4",
        "git_branch": "astra/ai-pipe-02b-outline-planning",
        "summary": {"total_checkpoints": 16, "passed": 16, "failed": 0},
        "checkpoints": [
            {
                "checkpoint": 1,
                "status": "PASS",
                "details": {
                    "plan_id": "plan-uuid-1",
                    "plan_version": 1,
                    "status": "draft",
                    "total_objectives": 3,
                },
            },
            {
                "checkpoint": 2,
                "status": "PASS",
                "details": {
                    "plan_id_1": "plan-uuid-1",
                    "plan_id_2": "plan-uuid-1",
                    "plan_version": 1,
                },
            },
            {
                "checkpoint": 3,
                "status": "PASS",
                "details": {
                    "table": "narrative.story_plans",
                    "objectives_count_in_db": 3,
                },
            },
            {
                "checkpoint": 4,
                "status": "PASS",
                "details": {
                    "plan_version": 1,
                    "status": "draft",
                },
            },
            {
                "checkpoint": 5,
                "status": "PASS",
                "details": {
                    "status": "active",
                },
            },
            {
                "checkpoint": 6,
                "status": "PASS",
                "details": {
                    "order_index": 1,
                    "target_chapter": 1,
                    "title": "Tỉnh dậy trên cồn cát",
                },
            },
            {
                "checkpoint": 7,
                "status": "PASS",
                "details": {
                    "plan_id": "plan-uuid-1",
                    "plan_version": 1,
                    "active_objective_id": "obj-1",
                },
            },
            {
                "checkpoint": 8,
                "status": "PASS",
                "details": {
                    "future_events_in_db": 0,
                    "future_facts_in_db": 0,
                    "in_recent_events": False,
                    "in_world_rules": False,
                },
            },
            {
                "checkpoint": 9,
                "status": "PASS",
                "details": {
                    "status": "completed",
                    "validation_status": "passed",
                },
            },
            {
                "checkpoint": 10,
                "status": "PASS",
                "details": {
                    "latest_revision_unmutated": True,
                    "unaccepted_revision_rows": 0,
                    "objective_status_unmutated": "pending",
                },
            },
            {
                "checkpoint": 11,
                "status": "PASS",
                "details": {
                    "source_type": "AI_DRAFT_ACCEPT",
                    "outbox_event_type": "INCREMENTAL_ANALYSIS",
                },
            },
            {
                "checkpoint": 12,
                "status": "PASS",
                "details": {
                    "outbox_status": "COMPLETED",
                    "brain_version_before": 2,
                    "brain_version_after": 3,
                },
            },
            {
                "checkpoint": 13,
                "status": "PASS",
                "details": {
                    "new_status": "completed",
                },
            },
            {
                "checkpoint": 14,
                "status": "PASS",
                "details": {
                    "chapter_number": 2,
                    "order_index": 2,
                    "title": "Đột kích hang ổ hắc ám kỵ sĩ Roland",
                },
            },
            {
                "checkpoint": 15,
                "status": "PASS",
                "details": {
                    "plan_v1_status": "superseded",
                    "plan_v2_status": "active",
                    "plan_v2_version": 2,
                    "canonical_brain_version": 3,
                },
            },
            {
                "checkpoint": 16,
                "status": "PASS",
                "details": {
                    "observed_plan_version": 2,
                    "observed_objective_title": "Đột kích hang ổ hắc ám kỵ sĩ Roland",
                    "observed_brain_version": 3,
                },
            },
        ],
    }

    # Baseline valid fixture passes
    base_errs = validate(valid_fixture)
    assert not base_errs, f"Base fixture should pass, got: {base_errs}"

    # Mutant 1: Wrong gate
    m1 = copy.deepcopy(valid_fixture)
    m1["gate"] = "AI-PIPE-02A"
    assert "invalid_gate" in validate(m1)

    # Mutant 2: Future events leaked (CP 8)
    m2 = copy.deepcopy(valid_fixture)
    m2["checkpoints"][7]["details"]["future_events_in_db"] = 2
    assert "cp8_future_events_leaked" in validate(m2)

    # Mutant 3: Future facts leaked (CP 8)
    m3 = copy.deepcopy(valid_fixture)
    m3["checkpoints"][7]["details"]["future_facts_in_db"] = 1
    assert "cp8_future_facts_leaked" in validate(m3)

    # Mutant 4: Future beat leaked into recent events (CP 8)
    m4 = copy.deepcopy(valid_fixture)
    m4["checkpoints"][7]["details"]["in_recent_events"] = True
    assert "cp8_future_beat_in_recent_events" in validate(m4)

    # Mutant 5: Unaccepted generation mutated latest revision (CP 10)
    m5 = copy.deepcopy(valid_fixture)
    m5["checkpoints"][9]["details"]["latest_revision_unmutated"] = False
    assert "cp10_latest_revision_mutated" in validate(m5)

    # Mutant 6: Unaccepted generation created revision row (CP 10)
    m6 = copy.deepcopy(valid_fixture)
    m6["checkpoints"][9]["details"]["unaccepted_revision_rows"] = 1
    assert "cp10_unaccepted_revision_created" in validate(m6)

    # Mutant 7: Objective status not completed (CP 13)
    m7 = copy.deepcopy(valid_fixture)
    m7["checkpoints"][12]["details"]["new_status"] = "pending"
    assert "cp13_objective_not_completed" in validate(m7)

    # Mutant 8: Plan edit failed to supersede Plan V1 (CP 15)
    m8 = copy.deepcopy(valid_fixture)
    m8["checkpoints"][14]["details"]["plan_v1_status"] = "active"
    assert "cp15_plan_v1_not_superseded" in validate(m8)

    # Mutant 9: Plan edit mutated historical brain version (CP 15)
    m9 = copy.deepcopy(valid_fixture)
    m9["checkpoints"][14]["details"]["canonical_brain_version"] = 1
    assert "cp15_canonical_brain_mutated" in validate(m9)

    # Mutant 10: Checkpoint failed
    m10 = copy.deepcopy(valid_fixture)
    m10["checkpoints"][5]["status"] = "FAIL"
    assert "checkpoint_6_not_passed" in validate(m10)

    print("[SELF-TEST] All 10 mutants successfully rejected (Fail-closed verified).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify AI-PIPE-02B evidence artifact")
    parser.add_argument(
        "--evidence-file",
        type=Path,
        default=Path("docs/development/AI-CORE-PIPELINE-VALIDATION-02B/ai-pipe-02b-outline-planning.json"),
        help="Path to evidence JSON",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Run only self-tests and exit",
    )
    args = parser.parse_args()

    run_self_tests()
    if args.self_test:
        sys.exit(0)

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
    print(f"       Checkpoints: {data.get('summary', {}).get('passed')}/16 passed")


if __name__ == "__main__":
    main()

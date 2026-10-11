#!/usr/bin/env python3
"""
Offline Evidence Validator for Gate AI-PIPE-03A: Bounded Autonomous Controller.

Validates the evidence JSON emitted by:
- scripts/run_ai_pipe_03a_autonomous_controller.py (docs/development/AI-CORE-PIPELINE-VALIDATION-03/ai-pipe-03a-autonomous-controller.json)

Invariants verified:
1. Valid structure and metadata (gate='AI-PIPE-03A', pipeline='P3', verdict='P3_AUTONOMOUS_CONTROLLER_PASS').
2. Exactly 18 checkpoints present, strictly numbered 1 to 18, all status == 'PASS'.
3. Application-facing autonomous run creation (CP 1).
4. Ownership enforcement: 403 for non-owner, 200 for admin (CP 2).
5. Durable PostgreSQL persistence via narrative.autonomous_runs (CP 3).
6. Serialized single-writer invariant: 409 conflict on duplicate active run (CP 4).
7. Active Story Plan and plan version pinned (CP 5).
8. Deterministic current objective selection for Step 1 (CP 6).
9. Standard P1 generation path reused (CP 7).
10. Deterministic quality gate acceptance (CP 8).
11. Failed generation safety: zero revisions created, plan progress untouched (CP 9).
12. Accepted generation persists via acceptDraft() with AI_DRAFT_ACCEPT (CP 10).
13. Transactional outbox completes and Story Brain advances (CP 11).
14. Objective progress updates explicitly after accepted content (CP 12).
15. Next iteration observes updated Story Brain and next objective (CP 13).
16. Idempotent retry / resume semantics (CP 14).
17. Maximum retry guard fails closed with stop_reason='max_retries_exceeded' (CP 15).
18. Stop/cancel prevents further generation and preserves canon (CP 16).
19. Terminal objective produces intentional 'completed' state (CP 17).
20. Completed run performs zero post-terminal generations (CP 18).
21. Fail-closed: includes 10 negative self-test mutants.
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
    require(gate == "AI-PIPE-03A", "invalid_gate")
    require(evidence.get("pipeline") == "P3", "invalid_pipeline")
    require(evidence.get("verdict") == "P3_AUTONOMOUS_CONTROLLER_PASS", "invalid_verdict")

    sha = evidence.get("git_commit")
    require(
        isinstance(sha, str)
        and (bool(re.fullmatch(r"[0-9a-f]{40}", sha)) or bool(re.fullmatch(r"[0-9a-f]{7,8}", sha))),
        "invalid_commit_sha",
    )

    branch = evidence.get("git_branch")
    require(isinstance(branch, str) and len(branch) > 0, "missing_branch")

    summary = evidence.get("summary", {})
    require(summary.get("total_checkpoints") == 18, "invalid_total_checkpoints")
    require(summary.get("passed") == 18, "not_all_checkpoints_passed")
    require(summary.get("failed") == 0, "checkpoints_failed_nonzero")

    checkpoints = evidence.get("checkpoints", [])
    require(isinstance(checkpoints, list) and len(checkpoints) == 18, "invalid_checkpoints_list")

    cp_map: dict[int, dict[str, Any]] = {}
    for i, cp in enumerate(checkpoints, start=1):
        num = cp.get("checkpoint")
        require(num == i, f"checkpoint_out_of_order_{i}")
        require(cp.get("status") == "PASS", f"checkpoint_{i}_not_passed")
        if isinstance(num, int):
            cp_map[num] = cp

    # CP 1: Node Boundary Creation
    cp1 = cp_map.get(1, {})
    cp1_d = cp1.get("details", {})
    require(bool(cp1_d.get("run_id")), "cp1_missing_run_id")
    require(cp1_d.get("plan_version") == 1, "cp1_plan_version_not_1")
    require(cp1_d.get("status") == "running", "cp1_status_not_running")

    # CP 2: Ownership Enforcement
    cp2 = cp_map.get(2, {})
    cp2_d = cp2.get("details", {})
    require(cp2_d.get("non_owner_status") == 403, "cp2_non_owner_not_403")
    require(cp2_d.get("admin_status") == 200, "cp2_admin_not_200")

    # CP 3: Durable PostgreSQL Persistence
    cp3 = cp_map.get(3, {})
    cp3_d = cp3.get("details", {})
    require(cp3_d.get("table") == "narrative.autonomous_runs", "cp3_invalid_table")
    require(cp3_d.get("persisted_status") == "running", "cp3_status_not_running")

    # CP 4: Serialized Single-Writer Invariant
    cp4 = cp_map.get(4, {})
    cp4_d = cp4.get("details", {})
    require(cp4_d.get("status_code") == 409, "cp4_conflict_not_409")
    require(cp4_d.get("conflict_detected") is True, "cp4_conflict_not_detected")
    require(cp4_d.get("concurrency_conflict_detected") is True, "cp4_concurrency_conflict_not_detected")
    require(cp4_d.get("idempotency_conflict_detected") is True, "cp4_idempotency_conflict_not_detected")
    require(cp4_d.get("idempotent_replay_success") is True, "cp4_idempotent_replay_failed")

    # CP 5: Active Plan & Version Pinned
    cp5 = cp_map.get(5, {})
    cp5_d = cp5.get("details", {})
    require(bool(cp5_d.get("pinned_plan_id")), "cp5_missing_plan_id")
    require(cp5_d.get("pinned_plan_version") == 1, "cp5_plan_version_not_1")

    # CP 6: Deterministic Objective Selection
    cp6 = cp_map.get(6, {})
    cp6_d = cp6.get("details", {})
    require(cp6_d.get("order_index") == 1, "cp6_order_index_not_1")

    # CP 7: Standard P1 Generation Path Reused
    cp7 = cp_map.get(7, {})
    cp7_d = cp7.get("details", {})
    require(bool(cp7_d.get("generation_id")), "cp7_missing_generation_id")
    require(cp7_d.get("status") == "completed", "cp7_generation_not_completed")

    # CP 8: Deterministic Quality Gate
    cp8 = cp_map.get(8, {})
    cp8_d = cp8.get("details", {})
    require(cp8_d.get("quality_gate_result") == "PASS", "cp8_gate_not_passed")

    # CP 9: Failed Generation Safety
    cp9 = cp_map.get(9, {})
    cp9_d = cp9.get("details", {})
    require(cp9_d.get("revisions_count_unmutated") is True, "cp9_revisions_leaked_on_failure")
    require(cp9_d.get("objective_incomplete") is True, "cp9_objective_prematurely_completed")
    require(cp9_d.get("current_retries") == 1, "cp9_retries_not_incremented")

    # CP 10: Accepted Generation Persists via acceptDraft()
    cp10 = cp_map.get(10, {})
    cp10_d = cp10.get("details", {})
    require(cp10_d.get("source_type") == "AI_DRAFT_ACCEPT", "cp10_invalid_source_type")

    # CP 11: Transactional Outbox & Brain Advances
    cp11 = cp_map.get(11, {})
    cp11_d = cp11.get("details", {})
    require(int(cp11_d.get("brain_version", 0)) >= 2, "cp11_brain_version_did_not_advance")
    require(cp11_d.get("unrelated_proposal_isolated") is True, "cp11_unrelated_proposal_not_isolated")

    # CP 12: Explicit Objective Progress Update
    cp12 = cp_map.get(12, {})
    cp12_d = cp12.get("details", {})
    require(cp12_d.get("status") == "completed", "cp12_objective_not_completed")

    # CP 13: Next Iteration Observes Updated Brain
    cp13 = cp_map.get(13, {})
    cp13_d = cp13.get("details", {})
    require(int(cp13_d.get("iteration", 0)) >= 2, "cp13_iteration_not_advanced")
    require(cp13_d.get("status") == "completed", "cp13_objective_not_completed")

    # CP 14: Idempotent Retry / Resume Semantics
    cp14 = cp_map.get(14, {})
    cp14_d = cp14.get("details", {})
    require(cp14_d.get("revisions_count_unchanged") is True, "cp14_duplicate_revisions_created")
    require(cp14_d.get("crash_recovery_zero_duplicate_revisions") is True, "cp14_crash_recovery_failed")

    # CP 15: Maximum Retry Guard Fails Closed
    cp15 = cp_map.get(15, {})
    cp15_d = cp15.get("details", {})
    require(cp15_d.get("status") == "failed", "cp15_status_not_failed")
    require(cp15_d.get("stop_reason") == "max_retries_exceeded", "cp15_stop_reason_not_exceeded")

    # CP 16: Stop / Cancel Prevents Further Generation
    cp16 = cp_map.get(16, {})
    cp16_d = cp16.get("details", {})
    require(cp16_d.get("status") == "stopped", "cp16_status_not_stopped")

    # CP 17: Terminal Objective Produces Intentional Completed State
    cp17 = cp_map.get(17, {})
    cp17_d = cp17.get("details", {})
    require(cp17_d.get("status") == "completed", "cp17_status_not_completed")
    require(cp17_d.get("stop_reason") == "terminal_objective_completed", "cp17_invalid_stop_reason")

    # CP 18: Completed Run Performs Zero Extra Generation
    cp18 = cp_map.get(18, {})
    cp18_d = cp18.get("details", {})
    require(cp18_d.get("status") == "completed", "cp18_status_not_completed")
    require(cp18_d.get("zero_extra_generation") is True, "cp18_extra_generation_detected")

    return errors


def test_mutants(evidence: dict[str, Any]) -> None:
    print("[MUTANT TEST] Running 10 negative fail-closed self-test mutants...")

    # Mutant 1: Missing checkpoint
    m1 = copy.deepcopy(evidence)
    m1["checkpoints"] = m1["checkpoints"][:17]
    m1["summary"]["total_checkpoints"] = 17
    err1 = validate(m1)
    assert any("invalid_total_checkpoints" in e or "invalid_checkpoints_list" in e for e in err1), f"Mutant 1 failed: {err1}"

    # Mutant 2: Checkpoint status not PASS
    m2 = copy.deepcopy(evidence)
    m2["checkpoints"][0]["status"] = "FAIL"
    err2 = validate(m2)
    assert any("checkpoint_1_not_passed" in e for e in err2), f"Mutant 2 failed: {err2}"

    # Mutant 3: Single-writer conflict not detected
    m3 = copy.deepcopy(evidence)
    m3["checkpoints"][3]["details"]["status_code"] = 200
    err3 = validate(m3)
    assert any("cp4_conflict_not_409" in e for e in err3), f"Mutant 3 failed: {err3}"

    # Mutant 4: Quality gate failure leaked new revisions
    m4 = copy.deepcopy(evidence)
    m4["checkpoints"][8]["details"]["revisions_count_unmutated"] = False
    err4 = validate(m4)
    assert any("cp9_revisions_leaked_on_failure" in e for e in err4), f"Mutant 4 failed: {err4}"

    # Mutant 5: Quality gate failure prematurely completed objective
    m5 = copy.deepcopy(evidence)
    m5["checkpoints"][8]["details"]["objective_incomplete"] = False
    err5 = validate(m5)
    assert any("cp9_objective_prematurely_completed" in e for e in err5), f"Mutant 5 failed: {err5}"

    # Mutant 6: Terminal completion allowed extra generation
    m6 = copy.deepcopy(evidence)
    m6["checkpoints"][17]["details"]["zero_extra_generation"] = False
    err6 = validate(m6)
    assert any("cp18_extra_generation_detected" in e for e in err6), f"Mutant 6 failed: {err6}"

    # Mutant 7: Ownership check leaked (non-owner status 200)
    m7 = copy.deepcopy(evidence)
    m7["checkpoints"][1]["details"]["non_owner_status"] = 200
    err7 = validate(m7)
    assert any("cp2_non_owner_not_403" in e for e in err7), f"Mutant 7 failed: {err7}"

    # Mutant 8: Max retries guard did not fail closed
    m8 = copy.deepcopy(evidence)
    m8["checkpoints"][14]["details"]["status"] = "running"
    err8 = validate(m8)
    assert any("cp15_status_not_failed" in e for e in err8), f"Mutant 8 failed: {err8}"

    # Mutant 9: Invalid gate or verdict string
    m9 = copy.deepcopy(evidence)
    m9["gate"] = "AI-PIPE-02B"
    err9 = validate(m9)
    assert any("invalid_gate" in e for e in err9), f"Mutant 9 failed: {err9}"

    # Mutant 10: Story Brain version failed to advance
    m10 = copy.deepcopy(evidence)
    m10["checkpoints"][10]["details"]["brain_version"] = 1
    err10 = validate(m10)
    assert any("cp11_brain_version_did_not_advance" in e for e in err10), f"Mutant 10 failed: {err10}"

    # Mutant 11: Concurrency conflict not detected in CP4
    m11 = copy.deepcopy(evidence)
    m11["checkpoints"][3]["details"]["concurrency_conflict_detected"] = False
    err11 = validate(m11)
    assert any("cp4_concurrency_conflict_not_detected" in e for e in err11), f"Mutant 11 failed: {err11}"

    # Mutant 12: Unrelated proposal leaked in review queue in CP11
    m12 = copy.deepcopy(evidence)
    m12["checkpoints"][10]["details"]["unrelated_proposal_isolated"] = False
    err12 = validate(m12)
    assert any("cp11_unrelated_proposal_not_isolated" in e for e in err12), f"Mutant 12 failed: {err12}"

    # Mutant 13: Crash recovery failed (duplicated revisions) in CP14
    m13 = copy.deepcopy(evidence)
    m13["checkpoints"][13]["details"]["crash_recovery_zero_duplicate_revisions"] = False
    err13 = validate(m13)
    assert any("cp14_crash_recovery_failed" in e for e in err13), f"Mutant 13 failed: {err13}"

    print("[MUTANT TEST] 13/13 negative fail-closed mutants rejected cleanly.")


def main() -> None:
    parser = argparse.ArgumentParser(description="AI-PIPE-03A Evidence Validator")
    parser.add_argument(
        "--evidence",
        default="docs/development/AI-CORE-PIPELINE-VALIDATION-03/ai-pipe-03a-autonomous-controller.json",
        help="Path to evidence JSON",
    )
    args = parser.parse_args()

    evidence_path = Path(args.evidence)
    if not evidence_path.is_file():
        print(f"[FAIL] Evidence file not found: {evidence_path}", file=sys.stderr)
        sys.exit(1)

    with open(evidence_path, "r", encoding="utf-8") as f:
        evidence = json.load(f)

    errors = validate(evidence)
    if errors:
        print(f"[FAIL] Evidence validation failed with {len(errors)} error(s):", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        sys.exit(1)

    print(f"[PASS] Evidence {evidence_path} is valid and meets all AI-PIPE-03A contracts.")
    test_mutants(evidence)
    print("\nGate AI-PIPE-03A Verification PASS.")


if __name__ == "__main__":
    main()

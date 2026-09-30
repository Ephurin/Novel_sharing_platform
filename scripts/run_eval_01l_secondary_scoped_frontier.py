#!/usr/bin/env python3
"""EVAL-01L secondary scoped-budget frontier + final offline adaptive policy.

Offline only. No provider calls. No production changes.

Part A:
- sweep retrieval-scoped packages at 12k / 16k / 20k / 24k
  across all EVAL-01K scenarios;
- record minimum budget for core-evidence completeness and full scoped-input fit.

Part B:
- validate a two-stage adaptive policy driven only by estimated package size.

Broad stage:
  <=20k -> broad@20k
  <=24k -> broad@24k
  >24k  -> retrieval scope

Scoped stage:
  <=12k -> scoped@12k
  <=16k -> scoped@16k
  <=20k -> scoped@20k
  <=24k -> scoped@24k
  >24k  -> unresolved pressure

No gold labels are used for routing.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
AI_SERVICE_ROOT = ROOT / "ai-service"
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(AI_SERVICE_ROOT))

import run_eval_01f_compact_provenance_budget as eval01f
import run_eval_01g_full_context_pressure as eval01g
import run_eval_01h_prod8_context_scope as eval01h
import run_eval_01k_multilane_growth_stress as eval01k
from application.context_budget import ContextBudgetPacker

EVIDENCE_DIR = ROOT / "docs" / "development" / "EVAL-01L-SECONDARY-SCOPED-FRONTIER"

CASE_IDS = eval01g.CASE_IDS
SCENARIOS = eval01k.SCENARIOS
SCOPED_BUDGETS = (12000, 16000, 20000, 24000)

BROAD_SOFT = 20000
BROAD_TOLERATED = 24000


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def full_input_fit(trace: dict[str, Any]) -> bool:
    selected = trace["selected_counts"]
    inputs = trace["input_counts"]
    return (
        selected["entities"] == inputs["entities"]
        and selected["states"] == inputs["states"]
        and selected["rules"] == inputs["rules"]
        and selected["recent"] == inputs["recent"]
        and selected["semantic"] == inputs["semantic"]
        and bool(trace["all_rule_load_retained"])
    )


def first_budget(rows: dict[str, dict[str, Any]], predicate: str) -> int | None:
    for budget in SCOPED_BUDGETS:
        if bool(rows[str(budget)][predicate]):
            return budget
    return None


def scoped_tier(estimated: int) -> tuple[str, int | None]:
    for budget in SCOPED_BUDGETS:
        if estimated <= budget:
            return f"scoped_{budget // 1000}k", budget
    return "scoped_unresolved_gt24k", None


def broad_stage(estimated: int) -> tuple[str, int | None]:
    if estimated <= BROAD_SOFT:
        return "broad_20k", BROAD_SOFT
    if estimated <= BROAD_TOLERATED:
        return "broad_24k", BROAD_TOLERATED
    return "scope_required", None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stdout-only", action="store_true")
    args = parser.parse_args()

    fixture = load_json(ROOT / "benchmarks" / "eval01e_neutral_context.json")
    retrieval = load_json(
        ROOT / "docs" / "development" / "EVAL-01-AETHELGARD-RUNTIME-BASELINE" / "retrieval-raw.json"
    )
    queries = load_json(ROOT / ".data" / "Frozen_v1" / "retrieval_queries.json")["queries"]
    canonical = load_json(ROOT / ".data" / "Frozen_v1" / "memory_chunks_canonical.json")["memories"]
    audit = load_json(ROOT / ".data" / "Frozen_v1" / "memory_chunks.json")["memories"]
    entities = load_json(ROOT / ".data" / "Batch_7" / "entities.json")["entities"]

    query_map = {f"{q['split']}:{q['query_id']}": q for q in queries}
    canonical_map = {str(m["memory_id"]): m for m in canonical}
    audit_map = {str(m["memory_id"]): m for m in audit}
    packer = ContextBudgetPacker()

    cases: list[dict[str, Any]] = []
    integrity_failures: list[dict[str, Any]] = []
    policy_failures: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []

    branch_counts = {
        "broad_20k": 0,
        "broad_24k": 0,
        "scoped_12k": 0,
        "scoped_16k": 0,
        "scoped_20k": 0,
        "scoped_24k": 0,
        "scoped_unresolved_gt24k": 0,
    }

    for case_id in CASE_IDS:
        query = query_map[case_id]
        retrieval_row = next(row for row in retrieval if row["case_id"] == case_id)
        memory_map = audit_map if retrieval_row["corpus"] == "audit_232" else canonical_map

        base_package, _ = eval01g.build_package(
            condition="compact_provenance",
            case_id=case_id,
            cutoff=int(query["chapter_cutoff"]),
            retrieval_row=retrieval_row,
            fixture=fixture,
            source_entities=entities,
            canonical_memories=canonical,
            canonical_map=canonical_map,
            audit_map=audit_map,
        )

        locked_ids = {
            str(row.get("entity_id"))
            for row in base_package.entities
            if bool(row.get("is_locked")) and row.get("entity_id")
        }
        query_ids = eval01h.query_named_entity_ids(str(query["query"]), entities)
        semantic_entity_ids = eval01h.semantic_entity_ids(retrieval_row, memory_map)
        retrieval_scope = locked_ids | query_ids | semantic_entity_ids

        broad = eval01h.scope_package(
            base_package,
            policy="baseline_prod8",
            base_scope_ids=retrieval_scope,
            balanced_ids=set(),
        )
        scoped = eval01h.scope_package(
            base_package,
            policy="retrieval_scoped_entities",
            base_scope_ids=retrieval_scope,
            balanced_ids=set(),
        )

        positive_ids = {str(v) for v in query.get("positive_memory_ids", [])}
        critical_ids = set(eval01f.CRITICAL_IDS[case_id])
        original_rule_ids = {
            eval01k.rule_id(row)
            for row in broad.world_rules
            if eval01k.rule_id(row)
        }

        scenario_rows: dict[str, Any] = {}

        for scenario_name, scenario in SCENARIOS.items():
            stressed_broad = eval01k.stress_package(broad, scenario)
            stressed_scoped = eval01k.stress_package(scoped, scenario)

            broad_estimated = packer.estimate_prompt_tokens(stressed_broad)
            scoped_estimated = packer.estimate_prompt_tokens(stressed_scoped)

            scoped_sweep: dict[str, dict[str, Any]] = {}
            for budget in SCOPED_BUDGETS:
                row = eval01k.evaluate(
                    stressed_scoped,
                    budget=budget,
                    positive_ids=positive_ids,
                    critical_ids=critical_ids,
                    required_scope_ids=retrieval_scope,
                    original_rule_ids=original_rule_ids,
                )
                row["full_input_fit"] = full_input_fit(row)
                scoped_sweep[str(budget)] = row

                checks = {
                    "deterministic": row["deterministic"],
                    "scope_retained": row["scope"]["all_required_retained"],
                    "locked_entities_retained": row["protected"]["locked_entities_retained"],
                    "locked_rules_retained": row["protected"]["locked_rules_retained"],
                    "constraints_retained": row["protected"]["constraints_retained"],
                    "protected_overflow_false": not row["protected_overflow"],
                }
                if not all(checks.values()):
                    integrity_failures.append({
                        "case_id": case_id,
                        "scenario": scenario_name,
                        "mode": "scoped_sweep",
                        "budget": budget,
                        "checks": checks,
                    })

            frontier = {
                "minimum_budget_core_evidence_complete": first_budget(
                    scoped_sweep, "core_evidence_complete"
                ),
                "minimum_budget_full_input_fit": first_budget(
                    scoped_sweep, "full_input_fit"
                ),
                "minimum_budget_all_semantic_retained": first_budget(
                    scoped_sweep, "all_semantic_retained"
                ),
                "minimum_budget_all_recent_retained": first_budget(
                    scoped_sweep, "all_recent_retained"
                ),
                "minimum_budget_original_rules_retained": first_budget(
                    scoped_sweep, "original_rules_retained"
                ),
                "minimum_budget_all_rule_load_retained": first_budget(
                    scoped_sweep, "all_rule_load_retained"
                ),
            }

            broad_branch, broad_budget = broad_stage(broad_estimated)
            if broad_branch != "scope_required":
                final_branch = broad_branch
                final_budget = broad_budget
                chosen = stressed_broad
            else:
                final_branch, final_budget = scoped_tier(scoped_estimated)
                chosen = stressed_scoped
                if final_budget is None:
                    unresolved.append({
                        "case_id": case_id,
                        "scenario": scenario_name,
                        "broad_estimated": broad_estimated,
                        "scoped_estimated": scoped_estimated,
                    })

            branch_counts[final_branch] += 1

            final_trace = None
            if final_budget is not None:
                final_trace = eval01k.evaluate(
                    chosen,
                    budget=final_budget,
                    positive_ids=positive_ids,
                    critical_ids=critical_ids,
                    required_scope_ids=retrieval_scope,
                    original_rule_ids=original_rule_ids,
                )
                final_trace["full_input_fit"] = full_input_fit(final_trace)

                final_checks = {
                    "deterministic": final_trace["deterministic"],
                    "scope_retained": final_trace["scope"]["all_required_retained"],
                    "locked_entities_retained": final_trace["protected"]["locked_entities_retained"],
                    "locked_rules_retained": final_trace["protected"]["locked_rules_retained"],
                    "constraints_retained": final_trace["protected"]["constraints_retained"],
                    "protected_overflow_false": not final_trace["protected_overflow"],
                }
                if not all(final_checks.values()):
                    integrity_failures.append({
                        "case_id": case_id,
                        "scenario": scenario_name,
                        "mode": "final_policy",
                        "branch": final_branch,
                        "checks": final_checks,
                    })

                if not final_trace["core_evidence_complete"]:
                    policy_failures.append({
                        "case_id": case_id,
                        "scenario": scenario_name,
                        "branch": final_branch,
                        "budget": final_budget,
                        "broad_estimated": broad_estimated,
                        "scoped_estimated": scoped_estimated,
                        "trace": final_trace,
                    })

            scenario_rows[scenario_name] = {
                "stress": scenario,
                "broad_estimated_before": broad_estimated,
                "scoped_estimated_before": scoped_estimated,
                "scoped_frontier": frontier,
                "scoped_sweep": scoped_sweep,
                "final_policy": {
                    "branch": final_branch,
                    "budget": final_budget,
                    "trace": final_trace,
                },
            }

        cases.append({
            "case_id": case_id,
            "retrieval_scope_entity_count": len(retrieval_scope),
            "original_rule_count": len(original_rule_ids),
            "scenarios": scenario_rows,
        })

    scenario_aggregate: dict[str, Any] = {}
    for scenario_name in SCENARIOS:
        rows = [case["scenarios"][scenario_name] for case in cases]
        final_rows = [
            row["final_policy"]["trace"]
            for row in rows
            if row["final_policy"]["trace"] is not None
        ]
        scenario_aggregate[scenario_name] = {
            "mean_broad_estimated": (
                sum(float(r["broad_estimated_before"]) for r in rows) / len(rows)
            ),
            "mean_scoped_estimated": (
                sum(float(r["scoped_estimated_before"]) for r in rows) / len(rows)
            ),
            "branches": {
                branch: sum(
                    int(r["final_policy"]["branch"] == branch)
                    for r in rows
                )
                for branch in branch_counts
            },
            "cases_core_evidence_complete": sum(
                int(r["core_evidence_complete"]) for r in final_rows
            ),
            "cases_full_input_fit": sum(
                int(r["full_input_fit"]) for r in final_rows
            ),
            "cases_unresolved": sum(
                int(r["final_policy"]["trace"] is None) for r in rows
            ),
            "mean_tokens_used": (
                sum(float(r["tokens_used"]) for r in final_rows) / len(final_rows)
                if final_rows else None
            ),
            "mean_headroom": (
                sum(float(r["headroom_tokens"]) for r in final_rows) / len(final_rows)
                if final_rows else None
            ),
            "mean_semantic_retained": (
                sum(int(r["selected_counts"]["semantic"]) for r in final_rows) / len(final_rows)
                if final_rows else None
            ),
            "mean_recent_retained": (
                sum(int(r["selected_counts"]["recent"]) for r in final_rows) / len(final_rows)
                if final_rows else None
            ),
        }

    global_frontier: dict[str, Any] = {}
    for scenario_name in SCENARIOS:
        global_frontier[scenario_name] = {}
        for metric in (
            "core_evidence_complete",
            "full_input_fit",
            "all_semantic_retained",
            "all_recent_retained",
            "original_rules_retained",
            "all_rule_load_retained",
        ):
            threshold = None
            for budget in SCOPED_BUDGETS:
                if all(
                    bool(
                        case["scenarios"][scenario_name]["scoped_sweep"][str(budget)][metric]
                    )
                    for case in cases
                ):
                    threshold = budget
                    break
            global_frontier[scenario_name][f"minimum_scoped_budget_{metric}_all_cases"] = threshold

    result = {
        "experiment_id": "EVAL-01L",
        "mode": "offline",
        "provider_calls": 0,
        "production_changes": False,
        "scoped_budgets": list(SCOPED_BUDGETS),
        "scenarios": SCENARIOS,
        "routing_contract": {
            "uses_gold_for_routing": False,
            "broad": {
                "<=20000": "broad_20k",
                "20000..24000": "broad_24k",
                ">24000": "retrieval_scope",
            },
            "scoped": {
                "<=12000": "scoped_12k",
                "12000..16000": "scoped_16k",
                "16000..20000": "scoped_20k",
                "20000..24000": "scoped_24k",
                ">24000": "unresolved",
            },
        },
        "global_scoped_frontier": global_frontier,
        "final_policy_aggregate": scenario_aggregate,
        "branch_counts_all_traces": branch_counts,
        "cases": cases,
        "integrity_failures": integrity_failures,
        "integrity_pass": len(integrity_failures) == 0,
        "final_policy_failures": policy_failures,
        "final_policy_unresolved": unresolved,
        "final_policy_pass": len(policy_failures) == 0 and len(unresolved) == 0,
        "interpretation_status": "REVIEW_REQUIRED",
    }

    lines = [
        "# EVAL-01L Secondary Scoped Budget Frontier",
        "",
        "Offline only. Provider calls: 0.",
        "",
        "## Global scoped frontier",
        "",
    ]
    for scenario_name, frontier in global_frontier.items():
        lines.append(f"### {scenario_name}")
        lines.append("")
        for key, value in frontier.items():
            lines.append(f"- {key}: {value}")
        lines.append("")

    lines.extend([
        "## Final two-stage policy",
        "",
        f"- integrity pass: {'PASS' if not integrity_failures else 'FAIL'}",
        f"- final policy pass: {'PASS' if not policy_failures and not unresolved else 'FAIL'}",
        f"- policy failures: {len(policy_failures)}",
        f"- unresolved >24k scoped cases: {len(unresolved)}",
        f"- branch counts: {branch_counts}",
        "",
        "No production policy is authorized by this diagnostic.",
        "",
    ])

    if not args.stdout_only:
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        (EVIDENCE_DIR / "diagnostic.json").write_text(
            json.dumps(result, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (EVIDENCE_DIR / "summary.md").write_text(
            "\n".join(lines),
            encoding="utf-8",
        )

    print(json.dumps({
        "experiment_id": "EVAL-01L",
        "provider_calls": 0,
        "integrity_pass": len(integrity_failures) == 0,
        "integrity_failure_count": len(integrity_failures),
        "final_policy_pass": len(policy_failures) == 0 and len(unresolved) == 0,
        "final_policy_failure_count": len(policy_failures),
        "unresolved_count": len(unresolved),
        "global_scoped_frontier": global_frontier,
        "branch_counts_all_traces": branch_counts,
        "final_policy_aggregate": scenario_aggregate,
        "interpretation_status": "REVIEW_REQUIRED",
    }, indent=2, ensure_ascii=False))

    return 0 if not integrity_failures else 2


if __name__ == "__main__":
    raise SystemExit(main())

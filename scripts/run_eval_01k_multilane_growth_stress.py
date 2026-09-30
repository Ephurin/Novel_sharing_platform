#!/usr/bin/env python3
"""EVAL-01K multi-lane Story Brain growth stress.

Offline only. No provider calls. No production changes.

This diagnostic keeps production item counts fixed for semantic/recent lanes
(8 semantic, 20 recent) and stresses:
- world-rule count;
- semantic payload size;
- recent-event payload size;
- combined pressure.

The EVAL-01J adaptive policy is evaluated unchanged. Policy failures are
recorded as findings; only harness/integrity failures make the script fail.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import replace
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
import run_eval_01j_adaptive_budget_scale as eval01j
from application.context_budget import ContextBudgetPacker

EVIDENCE_DIR = ROOT / "docs" / "development" / "EVAL-01K-MULTILANE-GROWTH-STRESS"

CASE_IDS = eval01g.CASE_IDS
SEMANTIC_LIMIT = 8
RECENT_LIMIT = 20

SCENARIOS = {
    "source_1x": {
        "rule_count_scale": 1,
        "semantic_payload_scale": 1,
        "recent_payload_scale": 1,
    },
    "rules_2x": {
        "rule_count_scale": 2,
        "semantic_payload_scale": 1,
        "recent_payload_scale": 1,
    },
    "evidence_payload_2x": {
        "rule_count_scale": 1,
        "semantic_payload_scale": 2,
        "recent_payload_scale": 2,
    },
    "combined_2x": {
        "rule_count_scale": 2,
        "semantic_payload_scale": 2,
        "recent_payload_scale": 2,
    },
    "combined_4x": {
        "rule_count_scale": 4,
        "semantic_payload_scale": 4,
        "recent_payload_scale": 4,
    },
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def repeat_text(value: Any, scale: int) -> Any:
    if scale <= 1 or not isinstance(value, str) or not value:
        return value
    return " || ".join(value for _ in range(scale))


def stress_rules(rules: tuple[dict[str, Any], ...], scale: int) -> tuple[dict[str, Any], ...]:
    if scale <= 1:
        return rules
    original = list(rules)
    clones: list[dict[str, Any]] = []
    for copy_index in range(1, scale):
        for row in original:
            clone = dict(row)
            source_id = str(
                row.get("id")
                or row.get("fact_id")
                or row.get("fact_key")
                or "rule"
            )
            clone_id = f"stress-rule-{copy_index}-{source_id}"
            clone["id"] = clone_id
            clone["fact_key"] = f"stress_clone:{copy_index}:{source_id}"
            clone["is_locked"] = False
            clone["stress_only"] = True
            clones.append(clone)
    return tuple(original + clones)


def stress_package(package, scenario: dict[str, int]):
    rules = stress_rules(
        tuple(package.world_rules),
        int(scenario["rule_count_scale"]),
    )
    semantic = []
    for row in package.semantic_memories:
        clone = dict(row)
        clone["content"] = repeat_text(
            clone.get("content"),
            int(scenario["semantic_payload_scale"]),
        )
        semantic.append(clone)
    recent = []
    for row in package.recent_events:
        clone = dict(row)
        clone["summary"] = repeat_text(
            clone.get("summary"),
            int(scenario["recent_payload_scale"]),
        )
        recent.append(clone)
    return replace(
        package,
        world_rules=tuple(rules),
        semantic_memories=tuple(semantic),
        recent_events=tuple(recent),
    )


def rule_id(row: dict[str, Any]) -> str:
    return str(
        row.get("id")
        or row.get("fact_id")
        or row.get("fact_key")
        or ""
    )


def evaluate(
    package,
    *,
    budget: int,
    positive_ids: set[str],
    critical_ids: set[str],
    required_scope_ids: set[str],
    original_rule_ids: set[str],
):
    base = eval01h.pack_metrics(
        package,
        budget=budget,
        positive_ids=positive_ids,
        critical_ids=critical_ids,
        required_scope_ids=required_scope_ids,
    )
    packer = ContextBudgetPacker()
    packed = packer.pack(package, maximum=budget)

    selected_rule_ids = {
        rule_id(row)
        for row in packed.world_rules
        if rule_id(row)
    }
    all_rule_ids = {
        rule_id(row)
        for row in package.world_rules
        if rule_id(row)
    }
    synthetic_rule_ids = {
        rule_id(row)
        for row in package.world_rules
        if bool(row.get("stress_only")) and rule_id(row)
    }

    selected = base["selected_counts"]
    inputs = base["input_counts"]
    base["all_semantic_retained"] = selected["semantic"] == inputs["semantic"]
    base["all_recent_retained"] = selected["recent"] == inputs["recent"]
    base["original_rules_retained"] = original_rule_ids.issubset(selected_rule_ids)
    base["all_rule_load_retained"] = all_rule_ids.issubset(selected_rule_ids)
    base["synthetic_rule_retention"] = (
        len(synthetic_rule_ids.intersection(selected_rule_ids))
        / len(synthetic_rule_ids)
        if synthetic_rule_ids
        else 1.0
    )
    base["core_evidence_complete"] = (
        base["all_semantic_retained"]
        and base["all_recent_retained"]
        and base["original_rules_retained"]
        and base["semantic"]["all_positive_retained"]
        and base["semantic"]["all_critical_retained"]
    )
    base["headroom_tokens"] = max(0, budget - int(base["tokens_used"] or 0))
    return base


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
    branch_counts = {"broad_20k": 0, "broad_24k": 0, "retrieval_scoped_12k": 0}

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
            rule_id(row)
            for row in broad.world_rules
            if rule_id(row)
        }

        scenario_rows: dict[str, Any] = {}
        for scenario_name, scenario in SCENARIOS.items():
            stressed_broad = stress_package(broad, scenario)
            stressed_scoped = stress_package(scoped, scenario)

            broad_estimated = packer.estimate_prompt_tokens(stressed_broad)
            scoped_estimated = packer.estimate_prompt_tokens(stressed_scoped)
            branch, budget = eval01j.adaptive_choice(broad_estimated)
            branch_counts[branch] += 1

            chosen = (
                stressed_scoped
                if branch == "retrieval_scoped_12k"
                else stressed_broad
            )
            adaptive = evaluate(
                chosen,
                budget=budget,
                positive_ids=positive_ids,
                critical_ids=critical_ids,
                required_scope_ids=retrieval_scope,
                original_rule_ids=original_rule_ids,
            )

            integrity_checks = {
                "deterministic": adaptive["deterministic"],
                "scope_retained": adaptive["scope"]["all_required_retained"],
                "locked_entities_retained": adaptive["protected"]["locked_entities_retained"],
                "locked_rules_retained": adaptive["protected"]["locked_rules_retained"],
                "constraints_retained": adaptive["protected"]["constraints_retained"],
                "protected_overflow_false": not adaptive["protected_overflow"],
            }
            if not all(integrity_checks.values()):
                integrity_failures.append({
                    "case_id": case_id,
                    "scenario": scenario_name,
                    "branch": branch,
                    "checks": integrity_checks,
                })

            if not adaptive["core_evidence_complete"]:
                policy_failures.append({
                    "case_id": case_id,
                    "scenario": scenario_name,
                    "branch": branch,
                    "budget": budget,
                    "broad_estimated": broad_estimated,
                    "scoped_estimated": scoped_estimated,
                    "selected_counts": adaptive["selected_counts"],
                    "semantic": adaptive["semantic"],
                    "original_rules_retained": adaptive["original_rules_retained"],
                    "synthetic_rule_retention": adaptive["synthetic_rule_retention"],
                })

            scenario_rows[scenario_name] = {
                "stress": scenario,
                "broad_estimated_before": broad_estimated,
                "scoped_estimated_before": scoped_estimated,
                "adaptive_branch": branch,
                "adaptive_budget": budget,
                "adaptive": adaptive,
            }

        cases.append({
            "case_id": case_id,
            "retrieval_scope_entity_count": len(retrieval_scope),
            "original_rule_count": len(original_rule_ids),
            "scenarios": scenario_rows,
        })

    aggregate: dict[str, Any] = {}
    for scenario_name in SCENARIOS:
        rows = [case["scenarios"][scenario_name] for case in cases]
        adaptive_rows = [row["adaptive"] for row in rows]
        aggregate[scenario_name] = {
            "mean_broad_estimated_before": sum(float(r["broad_estimated_before"]) for r in rows) / len(rows),
            "mean_scoped_estimated_before": sum(float(r["scoped_estimated_before"]) for r in rows) / len(rows),
            "adaptive_branches": {
                branch: sum(int(r["adaptive_branch"] == branch) for r in rows)
                for branch in branch_counts
            },
            "mean_tokens_used": sum(float(r["tokens_used"]) for r in adaptive_rows) / len(adaptive_rows),
            "mean_headroom": sum(float(r["headroom_tokens"]) for r in adaptive_rows) / len(adaptive_rows),
            "cases_core_evidence_complete": sum(int(r["core_evidence_complete"]) for r in adaptive_rows),
            "cases_all_rule_load_retained": sum(int(r["all_rule_load_retained"]) for r in adaptive_rows),
            "mean_synthetic_rule_retention": sum(float(r["synthetic_rule_retention"]) for r in adaptive_rows) / len(adaptive_rows),
            "mean_semantic_retained": sum(int(r["selected_counts"]["semantic"]) for r in adaptive_rows) / len(adaptive_rows),
            "mean_recent_retained": sum(int(r["selected_counts"]["recent"]) for r in adaptive_rows) / len(adaptive_rows),
            "cases_protected_overflow": sum(int(r["protected_overflow"]) for r in adaptive_rows),
        }

    result = {
        "experiment_id": "EVAL-01K",
        "mode": "offline",
        "provider_calls": 0,
        "production_changes": False,
        "semantic_limit": SEMANTIC_LIMIT,
        "recent_limit": RECENT_LIMIT,
        "adaptive_policy": {
            "broad_soft_threshold": eval01j.SOFT_BROAD_BUDGET,
            "broad_tolerated_threshold": eval01j.TOLERATED_BROAD_BUDGET,
            "scoped_budget": eval01j.SCOPED_BUDGET,
            "policy_modified_for_test": False,
        },
        "stress_contract": {
            "scenarios": SCENARIOS,
            "rule_growth": "deterministic noncanonical unlocked clones of source-grounded rule records",
            "semantic_payload_growth": "repeat existing selected content only; no new facts or candidates",
            "recent_payload_growth": "repeat existing selected summaries only; no new events or candidates",
            "canonical_claim": False,
            "semantic_item_count_fixed": SEMANTIC_LIMIT,
            "recent_item_count_fixed": RECENT_LIMIT,
        },
        "aggregate": aggregate,
        "branch_counts_all_traces": branch_counts,
        "cases": cases,
        "integrity_failures": integrity_failures,
        "integrity_pass": len(integrity_failures) == 0,
        "adaptive_policy_failures": policy_failures,
        "adaptive_policy_pass": len(policy_failures) == 0,
        "interpretation_status": "REVIEW_REQUIRED",
    }

    lines = [
        "# EVAL-01K Multi-Lane Growth Stress",
        "",
        "Offline only. Provider calls: 0.",
        "",
        "The EVAL-01J adaptive policy is evaluated unchanged.",
        "",
        "Policy failures are findings and do not invalidate the harness.",
        "",
        "## Scenario aggregate",
        "",
    ]
    for name, row in aggregate.items():
        lines.extend([
            f"### {name}",
            "",
            f"- mean broad estimated: {row['mean_broad_estimated_before']:.2f}",
            f"- mean scoped estimated: {row['mean_scoped_estimated_before']:.2f}",
            f"- branches: {row['adaptive_branches']}",
            f"- core evidence complete: {row['cases_core_evidence_complete']} / {len(CASE_IDS)}",
            f"- all rule load retained: {row['cases_all_rule_load_retained']} / {len(CASE_IDS)}",
            f"- mean synthetic rule retention: {row['mean_synthetic_rule_retention']:.3f}",
            f"- mean semantic retained: {row['mean_semantic_retained']:.2f} / {SEMANTIC_LIMIT}",
            f"- mean recent retained: {row['mean_recent_retained']:.2f} / {RECENT_LIMIT}",
            f"- protected overflow cases: {row['cases_protected_overflow']}",
            "",
        ])
    lines.extend([
        "## Result",
        "",
        f"- integrity pass: {'PASS' if not integrity_failures else 'FAIL'}",
        f"- integrity failures: {len(integrity_failures)}",
        f"- adaptive policy pass: {'PASS' if not policy_failures else 'FAIL'}",
        f"- adaptive policy failures: {len(policy_failures)}",
        "",
        "A policy FAIL is an experiment result, not a harness failure.",
        "No production policy change is authorized by this diagnostic.",
        "",
    ])

    if not args.stdout_only:
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        (EVIDENCE_DIR / "diagnostic.json").write_text(
            json.dumps(result, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (EVIDENCE_DIR / "summary.md").write_text("\n".join(lines), encoding="utf-8")

    print(json.dumps({
        "experiment_id": "EVAL-01K",
        "provider_calls": 0,
        "integrity_pass": len(integrity_failures) == 0,
        "integrity_failure_count": len(integrity_failures),
        "adaptive_policy_pass": len(policy_failures) == 0,
        "adaptive_policy_failure_count": len(policy_failures),
        "branch_counts_all_traces": branch_counts,
        "aggregate": aggregate,
        "interpretation_status": "REVIEW_REQUIRED",
    }, indent=2, ensure_ascii=False))

    return 0 if not integrity_failures else 2


if __name__ == "__main__":
    raise SystemExit(main())

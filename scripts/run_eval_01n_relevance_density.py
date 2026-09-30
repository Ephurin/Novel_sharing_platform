#!/usr/bin/env python3
"""EVAL-01N relevance-density / scope-first diagnostic.

Offline only. Provider calls: 0. Production code is not modified.

Question:
Can we scope entity/current-state breadth before raising Story Brain budget,
while preserving the full semantic/recent/rule payload and reducing context
density versus EVAL-01L's source_1x broad@20k route?

Policies:
A. broad_20k_current
B. retrieval_scope_min_tier
C. balanced_scope_min_tier

Candidate scope selection uses only source-derived query/retrieval/recent data.
No gold labels participate in scope, routing, or tier selection.
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

import run_eval_01g_full_context_pressure as eval01g
import run_eval_01h_prod8_context_scope as eval01h
import run_eval_01m_sealed_live_adaptive_context as eval01m
from application.context_budget import ContextBudgetPacker

EVIDENCE_DIR = ROOT / "docs" / "development" / "EVAL-01N-RELEVANCE-DENSITY"
CASE_IDS = eval01g.CASE_IDS
SCOPED_BUDGETS = (12_000, 16_000, 20_000, 24_000)
BROAD_BUDGET = 20_000
KNOWN_REGRESSION_CASE = "challenge:rq-0025"

POLICIES = (
    "broad_20k_current",
    "retrieval_scope_min_tier",
    "balanced_scope_min_tier",
)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def entity_ids(rows: Any) -> set[str]:
    return {
        str(row.get("entity_id"))
        for row in rows
        if row.get("entity_id")
    }


def semantic_ids(rows: Any) -> set[str]:
    return {
        str(row.get("memory_chunk_id"))
        for row in rows
        if row.get("memory_chunk_id")
    }


def recent_ids(rows: Any) -> set[str]:
    return {
        str(row.get("event_id"))
        for row in rows
        if row.get("event_id")
    }


def rule_ids(rows: Any) -> set[str]:
    return {
        str(row.get("id") or row.get("fact_id") or row.get("fact_key"))
        for row in rows
        if row.get("id") or row.get("fact_id") or row.get("fact_key")
    }


def metrics(
    package: Any,
    *,
    budget: int,
    required_scope_ids: set[str],
) -> dict[str, Any]:
    packer = ContextBudgetPacker()
    first = packer.pack(package, maximum=budget)
    second = packer.pack(package, maximum=budget)

    selected_entities = entity_ids(first.entities)
    input_semantic = semantic_ids(package.semantic_memories)
    selected_semantic = semantic_ids(first.semantic_memories)
    input_recent = recent_ids(package.recent_events)
    selected_recent = recent_ids(first.recent_events)
    input_rules = rule_ids(package.world_rules)
    selected_rules = rule_ids(first.world_rules)

    full_input_fit = (
        input_semantic == selected_semantic
        and input_recent == selected_recent
        and input_rules == selected_rules
        and len(first.entities) == len(package.entities)
        and len(first.current_states) == len(package.current_states)
        and not bool(first.token_budget.get("protected_overflow"))
        and int(first.token_budget.get("dropped_artifact_count") or 0) == 0
    )

    return {
        "budget": budget,
        "estimated_before": int(first.token_budget.get("estimated_before") or 0),
        "tokens_used": int(first.token_budget.get("used") or 0),
        "deterministic": first == second,
        "protected_overflow": bool(first.token_budget.get("protected_overflow")),
        "full_input_fit": full_input_fit,
        "selected_counts": {
            "entities": len(first.entities),
            "states": len(first.current_states),
            "rules": len(first.world_rules),
            "recent": len(first.recent_events),
            "semantic": len(first.semantic_memories),
        },
        "input_counts": {
            "entities": len(package.entities),
            "states": len(package.current_states),
            "rules": len(package.world_rules),
            "recent": len(package.recent_events),
            "semantic": len(package.semantic_memories),
        },
        "all_semantic_retained": input_semantic == selected_semantic,
        "all_recent_retained": input_recent == selected_recent,
        "all_rules_retained": input_rules == selected_rules,
        "required_scope_count": len(required_scope_ids),
        "required_scope_retained": len(required_scope_ids.intersection(selected_entities)),
        "all_required_scope_retained": required_scope_ids.issubset(selected_entities),
        "dropped_counts": {
            "entities": len(first.context_summary.get("dropped_entity_ids", [])),
            "rules": len(first.context_summary.get("dropped_fact_ids", [])),
            "recent": len(first.context_summary.get("dropped_event_ids", [])),
            "semantic": len(first.context_summary.get("dropped_semantic_memory_ids", [])),
        },
    }


def minimum_full_fit(
    package: Any,
    *,
    required_scope_ids: set[str],
) -> dict[str, Any]:
    attempts: list[dict[str, Any]] = []
    for budget in SCOPED_BUDGETS:
        row = metrics(
            package,
            budget=budget,
            required_scope_ids=required_scope_ids,
        )
        attempts.append(row)
        if (
            row["deterministic"]
            and not row["protected_overflow"]
            and row["full_input_fit"]
            and row["all_required_scope_retained"]
        ):
            return {
                "status": "FIT",
                "selected_budget": budget,
                "selected": row,
                "attempts": attempts,
            }
    return {
        "status": "UNRESOLVED",
        "selected_budget": None,
        "selected": attempts[-1],
        "attempts": attempts,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stdout-only", action="store_true")
    args = parser.parse_args()

    fixture = load_json(ROOT / "benchmarks" / "eval01e_neutral_context.json")
    retrieval = load_json(
        ROOT
        / "docs"
        / "development"
        / "EVAL-01-AETHELGARD-RUNTIME-BASELINE"
        / "retrieval-raw.json"
    )
    queries = load_json(
        ROOT / ".data" / "Frozen_v1" / "retrieval_queries.json"
    )["queries"]
    canonical = load_json(
        ROOT / ".data" / "Frozen_v1" / "memory_chunks_canonical.json"
    )["memories"]
    audit = load_json(
        ROOT / ".data" / "Frozen_v1" / "memory_chunks.json"
    )["memories"]
    source_entities = load_json(
        ROOT / ".data" / "Batch_7" / "entities.json"
    )["entities"]

    query_map = {
        f"{row['split']}:{row['query_id']}": row
        for row in queries
    }
    canonical_map = {
        str(row["memory_id"]): row for row in canonical
    }
    audit_map = {
        str(row["memory_id"]): row for row in audit
    }

    cases: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    for case_id in CASE_IDS:
        query = query_map[case_id]
        retrieval_row = next(
            row for row in retrieval if row["case_id"] == case_id
        )
        memory_map = (
            audit_map
            if retrieval_row["corpus"] == "audit_232"
            else canonical_map
        )

        base_package, _ = eval01g.build_package(
            condition="compact_provenance",
            case_id=case_id,
            cutoff=int(query["chapter_cutoff"]),
            retrieval_row=retrieval_row,
            fixture=fixture,
            source_entities=source_entities,
            canonical_memories=canonical,
            canonical_map=canonical_map,
            audit_map=audit_map,
        )
        base_package = eval01m.strip_evaluation_entity_locks(base_package)

        named_ids = eval01h.query_named_entity_ids(
            str(query["query"]),
            source_entities,
        )
        semantic_scope_ids = eval01h.semantic_entity_ids(
            retrieval_row,
            memory_map,
        )
        retrieval_scope_ids = named_ids | semantic_scope_ids
        balanced_extra_ids = eval01h.recent_participant_ids(base_package)
        balanced_scope_ids = retrieval_scope_ids | balanced_extra_ids

        broad = eval01h.scope_package(
            base_package,
            policy="baseline_prod8",
            base_scope_ids=retrieval_scope_ids,
            balanced_ids=set(),
        )
        retrieval_scoped = eval01h.scope_package(
            base_package,
            policy="retrieval_scoped_entities",
            base_scope_ids=retrieval_scope_ids,
            balanced_ids=set(),
        )
        balanced_scoped = eval01h.scope_package(
            base_package,
            policy="balanced_scoped_entities",
            base_scope_ids=retrieval_scope_ids,
            balanced_ids=balanced_extra_ids,
        )

        broad_row = metrics(
            broad,
            budget=BROAD_BUDGET,
            required_scope_ids=retrieval_scope_ids,
        )
        retrieval_row_out = minimum_full_fit(
            retrieval_scoped,
            required_scope_ids=retrieval_scope_ids,
        )
        balanced_row_out = minimum_full_fit(
            balanced_scoped,
            required_scope_ids=balanced_scope_ids,
        )

        row = {
            "case_id": case_id,
            "chapter_cutoff": int(query["chapter_cutoff"]),
            "routing_uses_gold": False,
            "query_gold_used_for_scope": False,
            "query_named_entity_ids": sorted(named_ids),
            "semantic_top8_entity_ids": sorted(semantic_scope_ids),
            "retrieval_scope_ids": sorted(retrieval_scope_ids),
            "newest5_recent_participant_ids": sorted(balanced_extra_ids),
            "balanced_scope_ids": sorted(balanced_scope_ids),
            "policies": {
                "broad_20k_current": broad_row,
                "retrieval_scope_min_tier": retrieval_row_out,
                "balanced_scope_min_tier": balanced_row_out,
            },
        }

        broad_used = broad_row["tokens_used"]
        for name, candidate in (
            ("retrieval_scope_min_tier", retrieval_row_out),
            ("balanced_scope_min_tier", balanced_row_out),
        ):
            selected = candidate["selected"]
            selected["token_reduction_vs_broad"] = broad_used - selected["tokens_used"]
            selected["token_reduction_pct_vs_broad"] = (
                (broad_used - selected["tokens_used"]) / broad_used
                if broad_used
                else 0.0
            )
            selected["entity_reduction_vs_broad"] = (
                broad_row["selected_counts"]["entities"]
                - selected["selected_counts"]["entities"]
            )

            checks = {
                "resolved": candidate["status"] == "FIT",
                "deterministic": bool(selected["deterministic"]),
                "protected_overflow_false": not bool(selected["protected_overflow"]),
                "full_input_fit": bool(selected["full_input_fit"]),
                "semantic_8_of_8": selected["selected_counts"]["semantic"] == 8,
                "recent_20_of_20": selected["selected_counts"]["recent"] == 20,
                "all_rules_retained": bool(selected["all_rules_retained"]),
                "required_scope_retained": bool(selected["all_required_scope_retained"]),
                "not_larger_than_broad": selected["tokens_used"] <= broad_used,
            }
            if not all(checks.values()):
                failures.append(
                    {
                        "case_id": case_id,
                        "policy": name,
                        "checks": checks,
                    }
                )

        cases.append(row)

    aggregate: dict[str, Any] = {}
    for policy in ("retrieval_scope_min_tier", "balanced_scope_min_tier"):
        selected = [
            case["policies"][policy]["selected"]
            for case in cases
        ]
        aggregate[policy] = {
            "resolved_cases": sum(
                int(case["policies"][policy]["status"] == "FIT")
                for case in cases
            ),
            "mean_tokens_used": sum(r["tokens_used"] for r in selected) / len(selected),
            "mean_entity_count": sum(
                r["selected_counts"]["entities"] for r in selected
            ) / len(selected),
            "mean_token_reduction_vs_broad": sum(
                r["token_reduction_vs_broad"] for r in selected
            ) / len(selected),
            "mean_token_reduction_pct_vs_broad": sum(
                r["token_reduction_pct_vs_broad"] for r in selected
            ) / len(selected),
            "budget_distribution": {
                str(budget): sum(
                    int(case["policies"][policy]["selected_budget"] == budget)
                    for case in cases
                )
                for budget in SCOPED_BUDGETS
            },
        }

    broad_rows = [
        case["policies"]["broad_20k_current"]
        for case in cases
    ]
    aggregate["broad_20k_current"] = {
        "mean_tokens_used": sum(r["tokens_used"] for r in broad_rows) / len(broad_rows),
        "mean_entity_count": sum(
            r["selected_counts"]["entities"] for r in broad_rows
        ) / len(broad_rows),
    }

    regression = next(
        case for case in cases if case["case_id"] == KNOWN_REGRESSION_CASE
    )

    result = {
        "experiment_id": "EVAL-01N",
        "mode": "offline",
        "provider_calls": 0,
        "production_code_modified": False,
        "context_packer_modified": False,
        "routing_uses_gold": False,
        "query_gold_used_for_scope": False,
        "broad_budget": BROAD_BUDGET,
        "scoped_budget_tiers": list(SCOPED_BUDGETS),
        "policies": list(POLICIES),
        "aggregate": aggregate,
        "known_live_regression_case": regression,
        "cases": cases,
        "contract_failures": failures,
        "contract_pass": len(failures) == 0,
        "interpretation_status": "REVIEW_REQUIRED",
    }

    summary = [
        "# EVAL-01N Relevance Density / Scope-First Diagnostic",
        "",
        "Offline only. Provider calls: 0.",
        "",
        "No production code or ContextBudgetPacker changes.",
        "",
        "## Contract",
        "",
        f"- contract pass: {'PASS' if not failures else 'FAIL'}",
        f"- failures: {len(failures)}",
        "",
        "## Aggregate",
        "",
        f"- broad@20k mean tokens used: {aggregate['broad_20k_current']['mean_tokens_used']:.2f}",
        f"- broad@20k mean entities: {aggregate['broad_20k_current']['mean_entity_count']:.2f}",
        "",
    ]
    for policy in ("retrieval_scope_min_tier", "balanced_scope_min_tier"):
        row = aggregate[policy]
        summary.extend(
            [
                f"### {policy}",
                "",
                f"- resolved cases: {row['resolved_cases']} / {len(CASE_IDS)}",
                f"- mean tokens used: {row['mean_tokens_used']:.2f}",
                f"- mean entities: {row['mean_entity_count']:.2f}",
                f"- mean token reduction vs broad: {row['mean_token_reduction_vs_broad']:.2f}",
                f"- mean token reduction pct vs broad: {row['mean_token_reduction_pct_vs_broad']:.3%}",
                f"- budget distribution: {row['budget_distribution']}",
                "",
            ]
        )

    def regression_line(policy: str) -> str:
        if policy == "broad_20k_current":
            r = regression["policies"][policy]
            return (
                f"{policy}: budget={r['budget']} used={r['tokens_used']} "
                f"entities={r['selected_counts']['entities']} "
                f"semantic={r['selected_counts']['semantic']} "
                f"recent={r['selected_counts']['recent']}"
            )
        wrapper = regression["policies"][policy]
        r = wrapper["selected"]
        return (
            f"{policy}: budget={wrapper['selected_budget']} used={r['tokens_used']} "
            f"entities={r['selected_counts']['entities']} "
            f"semantic={r['selected_counts']['semantic']} "
            f"recent={r['selected_counts']['recent']} "
            f"reduction={r['token_reduction_pct_vs_broad']:.3%}"
        )

    summary.extend(
        [
            "## Known live regression case",
            "",
            f"Case: {KNOWN_REGRESSION_CASE}",
            "",
            f"- {regression_line('broad_20k_current')}",
            f"- {regression_line('retrieval_scope_min_tier')}",
            f"- {regression_line('balanced_scope_min_tier')}",
            "",
            "No production policy change is authorized by this diagnostic.",
            "",
        ]
    )

    if not args.stdout_only:
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        (EVIDENCE_DIR / "diagnostic.json").write_text(
            json.dumps(result, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (EVIDENCE_DIR / "summary.md").write_text(
            "\n".join(summary),
            encoding="utf-8",
        )

    print(
        json.dumps(
            {
                "experiment_id": "EVAL-01N",
                "provider_calls": 0,
                "contract_pass": len(failures) == 0,
                "contract_failure_count": len(failures),
                "aggregate": aggregate,
                "known_live_regression_case": {
                    "case_id": KNOWN_REGRESSION_CASE,
                    "broad": regression["policies"]["broad_20k_current"],
                    "retrieval_scope": regression["policies"]["retrieval_scope_min_tier"]["selected"],
                    "balanced_scope": regression["policies"]["balanced_scope_min_tier"]["selected"],
                },
                "interpretation_status": "REVIEW_REQUIRED",
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())

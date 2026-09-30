#!/usr/bin/env python3
"""EVAL-01I Story Brain context-budget scaling diagnostic.

Offline only. No provider calls. No production changes.

Compares:
- baseline full entity/state input
- retrieval-scoped entity/state input

Held constant:
- semantic limit = 8
- recent-event limit = 20
- compact provenance
- current ContextBudgetPacker
- EVAL-01H production-shaped fixture

Sweeps Story Brain application budgets: 12k, 16k, 20k, 24k, 32k.
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
from application.context_budget import ContextBudgetPacker

EVIDENCE_DIR = ROOT / "docs" / "development" / "EVAL-01I-CONTEXT-BUDGET-SCALING"

CASE_IDS = eval01g.CASE_IDS
POLICIES = ("baseline_full_entities", "retrieval_scoped_entities")
BUDGETS = (12000, 16000, 20000, 24000, 32000)
SEMANTIC_LIMIT = 8
RECENT_LIMIT = 20


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def trace(
    package,
    *,
    budget: int,
    positive_ids: set[str],
    critical_ids: set[str],
    required_scope_ids: set[str],
) -> dict[str, Any]:
    row = eval01h.pack_metrics(
        package,
        budget=budget,
        positive_ids=positive_ids,
        critical_ids=critical_ids,
        required_scope_ids=required_scope_ids,
    )
    selected = row["selected_counts"]
    inputs = row["input_counts"]
    row["headroom_tokens"] = max(0, int(budget) - int(row["tokens_used"] or 0))
    row["all_semantic_retained"] = selected["semantic"] == inputs["semantic"]
    row["all_recent_retained"] = selected["recent"] == inputs["recent"]
    row["all_rules_retained"] = selected["rules"] == inputs["rules"]
    row["all_entities_retained"] = selected["entities"] == inputs["entities"]
    row["all_states_retained"] = selected["states"] == inputs["states"]
    row["all_input_artifacts_retained"] = (
        row["all_semantic_retained"]
        and row["all_recent_retained"]
        and row["all_rules_retained"]
        and row["all_entities_retained"]
        and row["all_states_retained"]
    )
    row["evidence_complete"] = (
        row["all_semantic_retained"]
        and row["all_recent_retained"]
        and row["semantic"]["all_positive_retained"]
        and row["semantic"]["all_critical_retained"]
    )
    return row


def first_budget(rows: dict[str, dict[str, Any]], predicate: str) -> int | None:
    for budget in BUDGETS:
        if bool(rows[str(budget)][predicate]):
            return budget
    return None


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

    cases: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

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

        baseline = eval01h.scope_package(
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

        positive_ids = {str(value) for value in query.get("positive_memory_ids", [])}
        critical_ids = set(eval01f.CRITICAL_IDS[case_id])

        policy_packages = {
            "baseline_full_entities": baseline,
            "retrieval_scoped_entities": scoped,
        }
        policy_rows: dict[str, Any] = {}
        for policy, package in policy_packages.items():
            required = retrieval_scope
            rows = {
                str(budget): trace(
                    package,
                    budget=budget,
                    positive_ids=positive_ids,
                    critical_ids=critical_ids,
                    required_scope_ids=required,
                )
                for budget in BUDGETS
            }
            policy_rows[policy] = {
                "budgets": rows,
                "minimum_budget_evidence_complete": first_budget(rows, "evidence_complete"),
                "minimum_budget_all_input_artifacts_retained": first_budget(
                    rows, "all_input_artifacts_retained"
                ),
                "minimum_budget_all_semantic_retained": first_budget(
                    rows, "all_semantic_retained"
                ),
                "minimum_budget_all_recent_retained": first_budget(
                    rows, "all_recent_retained"
                ),
                "minimum_budget_all_rules_retained": first_budget(
                    rows, "all_rules_retained"
                ),
            }

        for policy in POLICIES:
            for budget in BUDGETS:
                row = policy_rows[policy]["budgets"][str(budget)]
                checks = {
                    "deterministic": row["deterministic"],
                    "locked_entities_retained": row["protected"]["locked_entities_retained"],
                    "locked_rules_retained": row["protected"]["locked_rules_retained"],
                    "constraints_retained": row["protected"]["constraints_retained"],
                    "protected_overflow_false": not row["protected_overflow"],
                }
                if not all(checks.values()):
                    failures.append({
                        "case_id": case_id,
                        "policy": policy,
                        "budget": budget,
                        "checks": checks,
                    })

        cases.append({
            "case_id": case_id,
            "chapter_cutoff": int(query["chapter_cutoff"]),
            "retrieval_scope_entity_count": len(retrieval_scope),
            "policies": policy_rows,
        })

    aggregate: dict[str, Any] = {}
    for budget in BUDGETS:
        key = str(budget)
        aggregate[key] = {}
        for policy in POLICIES:
            rows = [c["policies"][policy]["budgets"][key] for c in cases]
            aggregate[key][policy] = {
                "mean_tokens_used": sum(float(r["tokens_used"]) for r in rows) / len(rows),
                "mean_headroom_tokens": sum(float(r["headroom_tokens"]) for r in rows) / len(rows),
                "mean_selected_entities": sum(r["selected_counts"]["entities"] for r in rows) / len(rows),
                "mean_selected_rules": sum(r["selected_counts"]["rules"] for r in rows) / len(rows),
                "mean_selected_recent": sum(r["selected_counts"]["recent"] for r in rows) / len(rows),
                "mean_selected_semantic": sum(r["selected_counts"]["semantic"] for r in rows) / len(rows),
                "mean_positive_retention": sum(r["semantic"]["positive_retention"] for r in rows) / len(rows),
                "mean_critical_retention": sum(r["semantic"]["critical_retention"] for r in rows) / len(rows),
                "cases_evidence_complete": sum(int(r["evidence_complete"]) for r in rows),
                "cases_all_input_artifacts_retained": sum(
                    int(r["all_input_artifacts_retained"]) for r in rows
                ),
                "cases_all_semantic_retained": sum(int(r["all_semantic_retained"]) for r in rows),
                "cases_all_recent_retained": sum(int(r["all_recent_retained"]) for r in rows),
                "cases_all_rules_retained": sum(int(r["all_rules_retained"]) for r in rows),
            }

    global_thresholds: dict[str, Any] = {}
    for policy in POLICIES:
        global_thresholds[policy] = {}
        for metric in (
            "evidence_complete",
            "all_input_artifacts_retained",
            "all_semantic_retained",
            "all_recent_retained",
            "all_rules_retained",
        ):
            threshold = None
            for budget in BUDGETS:
                if all(
                    bool(case["policies"][policy]["budgets"][str(budget)][metric])
                    for case in cases
                ):
                    threshold = budget
                    break
            global_thresholds[policy][f"minimum_budget_{metric}_all_cases"] = threshold

    result = {
        "experiment_id": "EVAL-01I",
        "mode": "offline",
        "provider_calls": 0,
        "production_context_packer_modified": False,
        "production_scope_modified": False,
        "semantic_limit": SEMANTIC_LIMIT,
        "recent_limit": RECENT_LIMIT,
        "provenance_representation": "compact_provenance",
        "budgets": list(BUDGETS),
        "policies": list(POLICIES),
        "budget_semantics": (
            "Application-level Story Brain budget only; does not include the outer "
            "system prompt, user instruction, selected manuscript text, or response tokens."
        ),
        "aggregate": aggregate,
        "global_thresholds": global_thresholds,
        "cases": cases,
        "contract_failures": failures,
        "contract_pass": len(failures) == 0,
        "interpretation_status": "REVIEW_REQUIRED",
    }

    lines = [
        "# EVAL-01I Context Budget Scaling Diagnostic",
        "",
        "Offline only. Provider calls: 0.",
        "",
        "Story Brain application budget sweep: 12k / 16k / 20k / 24k / 32k.",
        "",
        "## Global thresholds",
        "",
    ]
    for policy in POLICIES:
        lines.append(f"### {policy}")
        lines.append("")
        for key, value in global_thresholds[policy].items():
            lines.append(f"- {key}: {value}")
        lines.append("")
    lines.extend([
        "## Contract",
        "",
        f"- contract pass: {'PASS' if not failures else 'FAIL'}",
        f"- failures: {len(failures)}",
        "",
        "No production budget or scoping change is authorized by this diagnostic.",
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
        "experiment_id": "EVAL-01I",
        "provider_calls": 0,
        "contract_pass": len(failures) == 0,
        "contract_failure_count": len(failures),
        "global_thresholds": global_thresholds,
        "aggregate": aggregate,
        "interpretation_status": "REVIEW_REQUIRED",
    }, indent=2, ensure_ascii=False))
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())

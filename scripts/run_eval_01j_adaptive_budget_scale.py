#!/usr/bin/env python3
"""EVAL-01J adaptive Story Brain budget / structural scale stress.

Offline only. No provider calls. No production changes.

Candidate adaptive policy:
- broad estimated package <= 20k -> broad mode, budget 20k
- >20k and <=24k -> broad tolerated mode, budget 24k
- >24k -> retrieval-scoped mode, budget 12k

Stress scales:
- 1x source-grounded entity/state load
- 2x structural noncanonical entity/state load
- 4x structural noncanonical entity/state load

Synthetic scale clones are deterministic stress-only load. They never enter
semantic/recent evidence, query scope, or evaluation labels.
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
from application.context_budget import ContextBudgetPacker

EVIDENCE_DIR = ROOT / "docs" / "development" / "EVAL-01J-ADAPTIVE-BUDGET-SCALE"

CASE_IDS = eval01g.CASE_IDS
SCALES = (1, 2, 4)
SEMANTIC_LIMIT = 8
RECENT_LIMIT = 20

SOFT_BROAD_BUDGET = 20000
TOLERATED_BROAD_BUDGET = 24000
SCOPED_BUDGET = 12000


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def clone_entity_state_load(
    package,
    *,
    scale: int,
    retrieval_scope_ids: set[str],
):
    """Deterministically clone only non-scope entity/state bundles.

    Clones are structural load amplifiers, not canonical story records.
    """
    if scale == 1:
        return package, 0

    state_by_entity = {
        str(row.get("entity_id")): row
        for row in package.current_states
        if row.get("entity_id")
    }
    extra_entities: list[dict[str, Any]] = []
    extra_states: list[dict[str, Any]] = []

    eligible = [
        row
        for row in package.entities
        if not bool(row.get("is_locked"))
        and str(row.get("entity_id")) not in retrieval_scope_ids
    ]

    for copy_index in range(1, scale):
        for row in eligible:
            original_id = str(row["entity_id"])
            clone_id = f"stress-{copy_index}-{original_id}"
            clone = dict(row)
            clone["entity_id"] = clone_id
            clone["name"] = f"S{copy_index}-{row.get('name', original_id)}"
            clone["is_locked"] = False
            extra_entities.append(clone)

            state = state_by_entity.get(original_id)
            if state is not None:
                cloned_state = dict(state)
                cloned_state["entity_id"] = clone_id
                cloned_state["name"] = clone["name"]
                extra_states.append(cloned_state)

    scaled = replace(
        package,
        entities=tuple(package.entities) + tuple(extra_entities),
        current_states=tuple(package.current_states) + tuple(extra_states),
    )
    return scaled, len(extra_entities)


def adaptive_choice(broad_estimated_tokens: int) -> tuple[str, int]:
    if broad_estimated_tokens <= SOFT_BROAD_BUDGET:
        return "broad_20k", SOFT_BROAD_BUDGET
    if broad_estimated_tokens <= TOLERATED_BROAD_BUDGET:
        return "broad_24k", TOLERATED_BROAD_BUDGET
    return "retrieval_scoped_12k", SCOPED_BUDGET


def evaluate_trace(
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
    row["all_semantic_retained"] = selected["semantic"] == inputs["semantic"]
    row["all_recent_retained"] = selected["recent"] == inputs["recent"]
    row["all_rules_retained"] = selected["rules"] == inputs["rules"]
    row["all_entities_retained"] = selected["entities"] == inputs["entities"]
    row["all_states_retained"] = selected["states"] == inputs["states"]
    row["evidence_complete"] = (
        row["all_semantic_retained"]
        and row["all_recent_retained"]
        and row["all_rules_retained"]
        and row["semantic"]["all_positive_retained"]
        and row["semantic"]["all_critical_retained"]
    )
    row["headroom_tokens"] = max(0, budget - int(row["tokens_used"] or 0))
    return row


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
    failures: list[dict[str, Any]] = []
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

        broad_base = eval01h.scope_package(
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

        scale_rows: dict[str, Any] = {}
        for scale in SCALES:
            broad_scaled, synthetic_entity_count = clone_entity_state_load(
                broad_base,
                scale=scale,
                retrieval_scope_ids=retrieval_scope,
            )
            broad_estimated = packer.estimate_prompt_tokens(broad_scaled)
            branch, budget = adaptive_choice(broad_estimated)
            branch_counts[branch] += 1

            chosen = scoped if branch == "retrieval_scoped_12k" else broad_scaled
            adaptive = evaluate_trace(
                chosen,
                budget=budget,
                positive_ids=positive_ids,
                critical_ids=critical_ids,
                required_scope_ids=retrieval_scope,
            )

            broad_20k = evaluate_trace(
                broad_scaled,
                budget=SOFT_BROAD_BUDGET,
                positive_ids=positive_ids,
                critical_ids=critical_ids,
                required_scope_ids=retrieval_scope,
            )
            broad_24k = evaluate_trace(
                broad_scaled,
                budget=TOLERATED_BROAD_BUDGET,
                positive_ids=positive_ids,
                critical_ids=critical_ids,
                required_scope_ids=retrieval_scope,
            )
            scoped_12k = evaluate_trace(
                scoped,
                budget=SCOPED_BUDGET,
                positive_ids=positive_ids,
                critical_ids=critical_ids,
                required_scope_ids=retrieval_scope,
            )

            checks = {
                "adaptive_deterministic": adaptive["deterministic"],
                "adaptive_scope_retained": adaptive["scope"]["all_required_retained"],
                "adaptive_locked_entities_retained": adaptive["protected"]["locked_entities_retained"],
                "adaptive_locked_rules_retained": adaptive["protected"]["locked_rules_retained"],
                "adaptive_constraints_retained": adaptive["protected"]["constraints_retained"],
                "adaptive_protected_overflow_false": not adaptive["protected_overflow"],
                "adaptive_evidence_complete": adaptive["evidence_complete"],
            }
            if not all(checks.values()):
                failures.append({
                    "case_id": case_id,
                    "scale": scale,
                    "branch": branch,
                    "checks": checks,
                })

            scale_rows[str(scale)] = {
                "synthetic_entity_count": synthetic_entity_count,
                "broad_input_entities": len(broad_scaled.entities),
                "broad_input_states": len(broad_scaled.current_states),
                "broad_estimated_before": broad_estimated,
                "adaptive_branch": branch,
                "adaptive_budget": budget,
                "adaptive": adaptive,
                "comparators": {
                    "fixed_broad_20k": broad_20k,
                    "fixed_broad_24k": broad_24k,
                    "fixed_scoped_12k": scoped_12k,
                },
            }

        cases.append({
            "case_id": case_id,
            "retrieval_scope_entity_count": len(retrieval_scope),
            "scales": scale_rows,
        })

    aggregate: dict[str, Any] = {}
    for scale in SCALES:
        key = str(scale)
        rows = [case["scales"][key] for case in cases]
        adaptive_rows = [row["adaptive"] for row in rows]
        aggregate[key] = {
            "mean_broad_estimated_before": sum(float(r["broad_estimated_before"]) for r in rows) / len(rows),
            "mean_broad_input_entities": sum(int(r["broad_input_entities"]) for r in rows) / len(rows),
            "mean_synthetic_entities": sum(int(r["synthetic_entity_count"]) for r in rows) / len(rows),
            "adaptive_branches": {
                branch: sum(int(r["adaptive_branch"] == branch) for r in rows)
                for branch in branch_counts
            },
            "mean_adaptive_tokens_used": sum(float(r["tokens_used"]) for r in adaptive_rows) / len(adaptive_rows),
            "mean_adaptive_headroom": sum(float(r["headroom_tokens"]) for r in adaptive_rows) / len(adaptive_rows),
            "cases_evidence_complete": sum(int(r["evidence_complete"]) for r in adaptive_rows),
            "cases_scope_complete": sum(int(r["scope"]["all_required_retained"]) for r in adaptive_rows),
            "cases_protected_overflow": sum(int(r["protected_overflow"]) for r in adaptive_rows),
            "mean_semantic_retained": sum(int(r["selected_counts"]["semantic"]) for r in adaptive_rows) / len(adaptive_rows),
            "mean_recent_retained": sum(int(r["selected_counts"]["recent"]) for r in adaptive_rows) / len(adaptive_rows),
            "mean_rules_retained": sum(int(r["selected_counts"]["rules"]) for r in adaptive_rows) / len(adaptive_rows),
        }

    result = {
        "experiment_id": "EVAL-01J",
        "mode": "offline",
        "provider_calls": 0,
        "production_changes": False,
        "semantic_limit": SEMANTIC_LIMIT,
        "recent_limit": RECENT_LIMIT,
        "provenance_representation": "compact_provenance",
        "adaptive_policy": {
            "broad_soft_threshold": SOFT_BROAD_BUDGET,
            "broad_tolerated_threshold": TOLERATED_BROAD_BUDGET,
            "scoped_budget": SCOPED_BUDGET,
            "decision_basis": "estimated broad Story Brain tokens before pack",
        },
        "stress_contract": {
            "scales": list(SCALES),
            "synthetic_load": (
                "deterministic clones of non-locked, non-retrieval-scope entity/state bundles only"
            ),
            "canonical_claim": False,
            "synthetic_load_enters_semantic_or_recent": False,
            "synthetic_load_enters_scope_or_gold": False,
        },
        "aggregate": aggregate,
        "branch_counts_all_traces": branch_counts,
        "cases": cases,
        "contract_failures": failures,
        "contract_pass": len(failures) == 0,
        "interpretation_status": "REVIEW_REQUIRED",
    }

    lines = [
        "# EVAL-01J Adaptive Story Brain Budget / Scale Stress",
        "",
        "Offline only. Provider calls: 0.",
        "",
        "Synthetic scale clones are stress-only and noncanonical.",
        "",
        "## Adaptive policy",
        "",
        "- broad <=20k -> broad@20k",
        "- broad >20k and <=24k -> broad@24k",
        "- broad >24k -> retrieval-scoped@12k",
        "",
        "## Scale aggregate",
        "",
    ]
    for scale in SCALES:
        row = aggregate[str(scale)]
        lines.extend([
            f"### {scale}x",
            "",
            f"- mean broad estimated before: {row['mean_broad_estimated_before']:.2f}",
            f"- mean broad input entities: {row['mean_broad_input_entities']:.2f}",
            f"- adaptive branches: {row['adaptive_branches']}",
            f"- cases evidence complete: {row['cases_evidence_complete']} / {len(CASE_IDS)}",
            f"- protected overflow cases: {row['cases_protected_overflow']}",
            f"- mean semantic retained: {row['mean_semantic_retained']:.2f} / {SEMANTIC_LIMIT}",
            f"- mean recent retained: {row['mean_recent_retained']:.2f} / {RECENT_LIMIT}",
            "",
        ])
    lines.extend([
        "## Contract",
        "",
        f"- contract pass: {'PASS' if not failures else 'FAIL'}",
        f"- failures: {len(failures)}",
        "",
        "No production adaptive policy is authorized by this diagnostic.",
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
        "experiment_id": "EVAL-01J",
        "provider_calls": 0,
        "contract_pass": len(failures) == 0,
        "contract_failure_count": len(failures),
        "branch_counts_all_traces": branch_counts,
        "aggregate": aggregate,
        "interpretation_status": "REVIEW_REQUIRED",
    }, indent=2, ensure_ascii=False))
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())

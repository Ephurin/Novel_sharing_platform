#!/usr/bin/env python3
"""EVAL-01F compact provenance and residual semantic-budget diagnostic.

Offline only. No provider calls.

Compares three context representations over the same neutralized memories:
- pre_provenance: pre-EVAL-01C metadata projection;
- full_provenance: verbose EVAL-01E provenance;
- compact_provenance: source-status signals only in one concise provenance string.

Also sweeps residual semantic budgets using the same top-20 candidate order.
A reduced maximum models the semantic-memory budget left after higher-priority
canonical context consumes part of the 12k package. This is not a reconstruction
of the full entity/state/rule package and must not be reported as full-system
budget pressure.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
AI_SERVICE_ROOT = ROOT / "ai-service"
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(AI_SERVICE_ROOT))

import run_eval_01d_provenance_ab as eval01d
import run_eval_01e_sealed_provenance_ab as eval01e
from application.context_budget import ContextBudgetPacker
from domain.models import WritingContextPackage

EVIDENCE_DIR = ROOT / "docs" / "development" / "EVAL-01F-COMPACT-PROVENANCE-BUDGET"

CASE_IDS = (
    "core_gold:rq-0011",
    "challenge:rq-0023",
    "challenge:rq-0025",
    "challenge:rq-0020",
    "challenge:rq-0032",
    "core_gold:rq-0038",
    "core_gold:rq-0010",
)

BUDGETS = (12000, 6000, 5000, 4500, 4000, 3500, 3000, 2750, 2500, 2250, 2000)

CRITICAL_IDS = {
    "core_gold:rq-0011": ("mem-000089", "mem-000110"),
    "challenge:rq-0023": ("mem-000149", "mem-000155", "mem-000164"),
    "challenge:rq-0025": ("mem-000164", "mem-000172", "mem-000176"),
    "challenge:rq-0020": ("mem-000151", "mem-000161"),
    "challenge:rq-0032": ("mem-000053", "mem-000193", "mem-000194"),
    "core_gold:rq-0038": ("mem-000051", "mem-000228", "mem-000219", "mem-000224"),
    "core_gold:rq-0010": (
        "mem-000106",
        "mem-000114",
        "mem-000101",
        "mem-000103",
        "mem-000105",
        "mem-000113",
        "mem-000108",
    ),
}

CONDITIONS = ("pre_provenance", "full_provenance", "compact_provenance")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def compact_metadata(memory: dict[str, Any]) -> dict[str, Any]:
    metadata = eval01d.memory_metadata(memory, condition="pre_provenance")
    parts: list[str] = []

    status = memory.get("status")
    if status:
        parts.append(f"status={status}")

    review_status = memory.get("review_status")
    if review_status:
        parts.append(f"review={review_status}")

    tags = [str(tag) for tag in memory.get("tags", []) if str(tag)]
    if tags:
        parts.append("tags=" + ",".join(tags))

    supersedes_id = memory.get("supersedes_id")
    if supersedes_id:
        parts.append(f"supersedes={supersedes_id}")

    if parts:
        metadata["provenance"] = "|".join(parts)
    return metadata


def semantic_payload(
    memory: dict[str, Any],
    hit: dict[str, Any],
    *,
    condition: str,
) -> dict[str, Any]:
    if condition == "pre_provenance":
        return eval01d.semantic_payload(memory, hit, condition="pre_provenance")
    if condition == "full_provenance":
        return eval01d.semantic_payload(memory, hit, condition="post_provenance")
    if condition != "compact_provenance":
        raise ValueError(condition)

    payload = eval01d.semantic_payload(memory, hit, condition="pre_provenance")
    payload["metadata"] = compact_metadata(memory)
    return payload


def pack_payloads(
    payloads: list[dict[str, Any]],
    *,
    budget: int,
) -> dict[str, Any]:
    packer = ContextBudgetPacker()
    package = WritingContextPackage(
        brain_version=1,
        semantic_memories=tuple(payloads),
    )
    before = packer.estimate_prompt_tokens(package)
    packed = packer.pack(package, maximum=budget)
    selected = list(packed.context_summary.get("semantic_memory_ids", []))
    dropped = list(packed.context_summary.get("dropped_semantic_memory_ids", []))
    return {
        "tokens_before": before,
        "tokens_used": packed.token_budget.get("used"),
        "budget": budget,
        "selected_ids": selected,
        "dropped_ids": dropped,
        "selected_count": len(selected),
        "dropped_count": len(dropped),
        "budget_overflow": bool(packed.token_budget.get("budget_overflow")),
        "protected_overflow": bool(packed.token_budget.get("protected_overflow")),
    }


def smallest_budget_with_all(rows: list[dict[str, Any]], key: str) -> int | None:
    values = [int(row["budget"]) for row in rows if bool(row[key])]
    return min(values) if values else None


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

    query_map = {f"{q['split']}:{q['query_id']}": q for q in queries}
    canonical_map = {str(m["memory_id"]): m for m in canonical}
    audit_map = {str(m["memory_id"]): m for m in audit}

    top10_profiles: list[dict[str, Any]] = []
    pressure_rows: list[dict[str, Any]] = []

    for case_id in CASE_IDS:
        row = next(item for item in retrieval if item["case_id"] == case_id)
        query = query_map[case_id]
        memory_map = audit_map if row["corpus"] == "audit_232" else canonical_map

        top20_hits = row["hybrid_top20"][:20]
        top20_memories: list[tuple[dict[str, Any], dict[str, Any]]] = []
        for hit in top20_hits:
            original = memory_map[str(hit["memory_id"])]
            neutral, _ = eval01e.neutral_memory(original, fixture)
            top20_memories.append((neutral, hit))

        condition_payloads: dict[str, list[dict[str, Any]]] = {}
        for condition in CONDITIONS:
            condition_payloads[condition] = [
                semantic_payload(memory, hit, condition=condition)
                for memory, hit in top20_memories
            ]

        top10_results = {
            condition: pack_payloads(payloads[:10], budget=12000)
            for condition, payloads in condition_payloads.items()
        }
        pre_tokens = int(top10_results["pre_provenance"]["tokens_used"])
        full_tokens = int(top10_results["full_provenance"]["tokens_used"])
        compact_tokens = int(top10_results["compact_provenance"]["tokens_used"])
        full_overhead = full_tokens - pre_tokens
        compact_overhead = compact_tokens - pre_tokens
        reduction = (
            1.0 - (compact_overhead / full_overhead)
            if full_overhead > 0
            else 0.0
        )
        top10_profiles.append(
            {
                "case_id": case_id,
                "pre_tokens": pre_tokens,
                "full_tokens": full_tokens,
                "compact_tokens": compact_tokens,
                "full_overhead": full_overhead,
                "compact_overhead": compact_overhead,
                "compact_overhead_reduction_fraction": reduction,
                "all_top10_retained": {
                    condition: result["selected_count"] == 10
                    for condition, result in top10_results.items()
                },
            }
        )

        positive_ids = set(str(value) for value in query.get("positive_memory_ids", []))
        critical_ids = set(CRITICAL_IDS[case_id])
        top20_ids = [str(hit["memory_id"]) for hit in top20_hits]
        candidate_positive = positive_ids.intersection(top20_ids)
        candidate_critical = critical_ids.intersection(top20_ids)

        for budget in BUDGETS:
            packed_by_condition = {
                condition: pack_payloads(payloads, budget=budget)
                for condition, payloads in condition_payloads.items()
            }
            for condition, packed in packed_by_condition.items():
                selected = set(packed["selected_ids"])
                retained_positive = candidate_positive.intersection(selected)
                retained_critical = candidate_critical.intersection(selected)
                pressure_rows.append(
                    {
                        "case_id": case_id,
                        "condition": condition,
                        "budget": budget,
                        "tokens_before": packed["tokens_before"],
                        "tokens_used": packed["tokens_used"],
                        "selected_count": packed["selected_count"],
                        "dropped_count": packed["dropped_count"],
                        "candidate_positive_count": len(candidate_positive),
                        "retained_positive_count": len(retained_positive),
                        "positive_retention": (
                            len(retained_positive) / len(candidate_positive)
                            if candidate_positive else 1.0
                        ),
                        "all_positive_retained": retained_positive == candidate_positive,
                        "candidate_critical_count": len(candidate_critical),
                        "retained_critical_count": len(retained_critical),
                        "critical_retention": (
                            len(retained_critical) / len(candidate_critical)
                            if candidate_critical else 1.0
                        ),
                        "all_critical_retained": retained_critical == candidate_critical,
                        "selected_ids": packed["selected_ids"],
                        "dropped_ids": packed["dropped_ids"],
                    }
                )

    mean_full = statistics.mean(item["full_overhead"] for item in top10_profiles)
    mean_compact = statistics.mean(item["compact_overhead"] for item in top10_profiles)
    mean_reduction = 1.0 - (mean_compact / mean_full) if mean_full > 0 else 0.0

    dominance_failures: list[dict[str, Any]] = []
    for case_id in CASE_IDS:
        for budget in BUDGETS:
            full = next(
                row for row in pressure_rows
                if row["case_id"] == case_id
                and row["condition"] == "full_provenance"
                and row["budget"] == budget
            )
            compact = next(
                row for row in pressure_rows
                if row["case_id"] == case_id
                and row["condition"] == "compact_provenance"
                and row["budget"] == budget
            )
            if (
                compact["selected_count"] < full["selected_count"]
                or compact["retained_positive_count"] < full["retained_positive_count"]
                or compact["retained_critical_count"] < full["retained_critical_count"]
            ):
                dominance_failures.append(
                    {
                        "case_id": case_id,
                        "budget": budget,
                        "full": {
                            "selected_count": full["selected_count"],
                            "retained_positive_count": full["retained_positive_count"],
                            "retained_critical_count": full["retained_critical_count"],
                        },
                        "compact": {
                            "selected_count": compact["selected_count"],
                            "retained_positive_count": compact["retained_positive_count"],
                            "retained_critical_count": compact["retained_critical_count"],
                        },
                    }
                )

    frontiers: list[dict[str, Any]] = []
    for case_id in CASE_IDS:
        entry: dict[str, Any] = {"case_id": case_id, "conditions": {}}
        for condition in CONDITIONS:
            rows = [
                row for row in pressure_rows
                if row["case_id"] == case_id and row["condition"] == condition
            ]
            entry["conditions"][condition] = {
                "smallest_budget_all_positive": smallest_budget_with_all(
                    rows, "all_positive_retained"
                ),
                "smallest_budget_all_critical": smallest_budget_with_all(
                    rows, "all_critical_retained"
                ),
            }
        frontiers.append(entry)

    diagnostic = {
        "experiment_id": "EVAL-01F",
        "mode": "offline",
        "provider_calls": 0,
        "frozen_files_mutated": False,
        "representation_contract": {
            "pre_provenance": "pre-EVAL-01C metadata projection",
            "full_provenance": "EVAL-01E verbose compact-allowlist metadata",
            "compact_provenance": (
                "pre metadata plus one provenance string containing status, "
                "review status, tags, and supersedes_id; confirmation_status, "
                "memory_id, and chapter_title omitted as redundant/nonessential "
                "for source-status reasoning"
            ),
        },
        "budget_model": {
            "total_production_budget": 12000,
            "interpretation": (
                "Reduced maximum values are residual semantic-memory budgets "
                "after hypothetical higher-priority canonical context. This is "
                "a deterministic packer stress model, not full-system context reconstruction."
            ),
            "sweep": list(BUDGETS),
        },
        "top10_token_profiles": top10_profiles,
        "overhead_summary": {
            "mean_full_overhead": mean_full,
            "mean_compact_overhead": mean_compact,
            "mean_compact_overhead_reduction_fraction": mean_reduction,
            "compact_reduction_target_fraction": 0.50,
            "compact_reduction_target_pass": mean_reduction >= 0.50,
        },
        "pressure_rows": pressure_rows,
        "frontiers": frontiers,
        "compact_dominance_failures_vs_full": dominance_failures,
        "compact_dominance_pass": len(dominance_failures) == 0,
        "interpretation_status": "REVIEW_REQUIRED",
    }

    summary_lines = [
        "# EVAL-01F Compact Provenance + Residual Budget Diagnostic",
        "",
        "Offline diagnostic only. Provider calls: 0.",
        "",
        "## Top-10 overhead",
        "",
        f"- Mean full provenance overhead: {mean_full:.2f} estimated tokens",
        f"- Mean compact provenance overhead: {mean_compact:.2f} estimated tokens",
        f"- Mean compact reduction vs full overhead: {mean_reduction:.1%}",
        f"- Reduction target >= 50%: {'PASS' if mean_reduction >= 0.50 else 'FAIL'}",
        "",
        "## Pressure invariant",
        "",
        f"- Compact dominates/equal full at same residual budget: {'PASS' if not dominance_failures else 'FAIL'}",
        "",
        "Reduced maximum values model residual semantic-memory budget after higher-priority",
        "canonical context. They do not reconstruct the full production entity/state/rule package.",
        "",
        "No production policy change is authorized by this harness.",
        "",
    ]

    if not args.stdout_only:
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        (EVIDENCE_DIR / "diagnostic.json").write_text(
            json.dumps(diagnostic, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (EVIDENCE_DIR / "summary.md").write_text(
            "\n".join(summary_lines),
            encoding="utf-8",
        )

    print(json.dumps(
        {
            "experiment_id": "EVAL-01F",
            "provider_calls": 0,
            "case_count": len(CASE_IDS),
            "condition_count": len(CONDITIONS),
            "budget_points": len(BUDGETS),
            "mean_full_overhead": mean_full,
            "mean_compact_overhead": mean_compact,
            "mean_compact_overhead_reduction_fraction": mean_reduction,
            "compact_reduction_target_pass": mean_reduction >= 0.50,
            "compact_dominance_pass": len(dominance_failures) == 0,
            "dominance_failure_count": len(dominance_failures),
            "interpretation_status": "REVIEW_REQUIRED",
        },
        indent=2,
        ensure_ascii=False,
    ))
    return 0 if not dominance_failures else 2


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""EVAL-01H production-limit context-scope diagnostic.

Offline only. No provider calls. ContextBudgetPacker is unchanged.

Uses production-shaped defaults:
- semantic limit = 8
- recent-event limit = 20
- compact provenance
- primary budget = 12000

Policies differ only in entity/current-state input breadth:
1. baseline_prod8: full entity/state input.
2. retrieval_scoped_entities: protected + query-named + semantic-top8 entities.
3. balanced_scoped_entities: retrieval-scoped + participants from newest 5 recent events.
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
from application.context_budget import ContextBudgetPacker
from domain.models import WritingContextPackage

EVIDENCE_DIR = ROOT / "docs" / "development" / "EVAL-01H-PROD8-CONTEXT-SCOPE"

CASE_IDS = eval01g.CASE_IDS
BUDGETS = (12000, 10000, 8000)
POLICIES = (
    "baseline_prod8",
    "retrieval_scoped_entities",
    "balanced_scoped_entities",
)
SEMANTIC_LIMIT = 8
RECENT_LIMIT = 20
BALANCED_RECENT_ENTITY_WINDOW = 5


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def query_named_entity_ids(query_text: str, source_entities: list[dict[str, Any]]) -> set[str]:
    folded = query_text.casefold()
    found: set[str] = set()
    for entity in source_entities:
        names = [entity.get("canonical_name"), *entity.get("aliases", [])]
        for raw in names:
            name = str(raw or "").strip()
            if len(name) >= 3 and name.casefold() in folded:
                found.add(str(entity["entity_id"]))
                break
    return found


def semantic_entity_ids(
    retrieval_row: dict[str, Any],
    memory_map: dict[str, dict[str, Any]],
) -> set[str]:
    ids: set[str] = set()
    for hit in retrieval_row["hybrid_top20"][:SEMANTIC_LIMIT]:
        memory = memory_map[str(hit["memory_id"])]
        ids.update(str(value) for value in memory.get("entities", []))
    return ids


def recent_participant_ids(package: WritingContextPackage) -> set[str]:
    rows = list(package.recent_events)[-BALANCED_RECENT_ENTITY_WINDOW:]
    ids: set[str] = set()
    for event in rows:
        ids.update(str(value) for value in event.get("participants", []))
    return ids


def scope_package(
    package: WritingContextPackage,
    *,
    policy: str,
    base_scope_ids: set[str],
    balanced_ids: set[str],
) -> WritingContextPackage:
    semantic = tuple(package.semantic_memories[:SEMANTIC_LIMIT])
    recent = tuple(package.recent_events[-RECENT_LIMIT:])

    if policy == "baseline_prod8":
        return replace(package, semantic_memories=semantic, recent_events=recent)

    wanted = set(base_scope_ids)
    if policy == "balanced_scoped_entities":
        wanted.update(balanced_ids)
    elif policy != "retrieval_scoped_entities":
        raise ValueError(policy)

    entities = tuple(
        row for row in package.entities
        if bool(row.get("is_locked")) or str(row.get("entity_id")) in wanted
    )
    kept_ids = {
        str(row.get("entity_id"))
        for row in entities
        if row.get("entity_id")
    }
    states = tuple(
        row for row in package.current_states
        if str(row.get("entity_id")) in kept_ids
    )
    return replace(
        package,
        entities=entities,
        current_states=states,
        semantic_memories=semantic,
        recent_events=recent,
    )


def pack_metrics(
    package: WritingContextPackage,
    *,
    budget: int,
    positive_ids: set[str],
    critical_ids: set[str],
    required_scope_ids: set[str],
) -> dict[str, Any]:
    packer = ContextBudgetPacker()
    first = packer.pack(package, maximum=budget)
    second = packer.pack(package, maximum=budget)

    selected_entities = {
        str(row.get("entity_id"))
        for row in first.entities
        if row.get("entity_id")
    }
    locked_entities = {
        str(row.get("entity_id"))
        for row in package.entities
        if bool(row.get("is_locked")) and row.get("entity_id")
    }
    selected_rules = {
        str(row.get("id") or row.get("fact_id") or row.get("fact_key"))
        for row in first.world_rules
    }
    locked_rules = {
        str(row.get("id") or row.get("fact_id") or row.get("fact_key"))
        for row in package.world_rules
        if bool(row.get("is_locked"))
    }
    selected_semantic = {
        str(row.get("memory_chunk_id"))
        for row in first.semantic_memories
        if row.get("memory_chunk_id")
    }
    candidate_semantic = {
        str(row.get("memory_chunk_id"))
        for row in package.semantic_memories
        if row.get("memory_chunk_id")
    }
    candidate_positive = positive_ids.intersection(candidate_semantic)
    candidate_critical = critical_ids.intersection(candidate_semantic)

    return {
        "budget": budget,
        "estimated_before": first.token_budget.get("estimated_before"),
        "tokens_used": first.token_budget.get("used"),
        "deterministic": first == second,
        "protected_overflow": bool(first.token_budget.get("protected_overflow")),
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
        "scope": {
            "required_count": len(required_scope_ids),
            "retained_count": len(required_scope_ids.intersection(selected_entities)),
            "coverage": (
                len(required_scope_ids.intersection(selected_entities)) / len(required_scope_ids)
                if required_scope_ids else 1.0
            ),
            "all_required_retained": required_scope_ids.issubset(selected_entities),
        },
        "protected": {
            "locked_entities_retained": locked_entities.issubset(selected_entities),
            "locked_rules_retained": locked_rules.issubset(selected_rules),
            "constraints_retained": tuple(first.author_constraints) == tuple(package.author_constraints),
        },
        "semantic": {
            "candidate_positive_count": len(candidate_positive),
            "retained_positive_count": len(candidate_positive.intersection(selected_semantic)),
            "positive_retention": (
                len(candidate_positive.intersection(selected_semantic)) / len(candidate_positive)
                if candidate_positive else 1.0
            ),
            "all_positive_retained": candidate_positive.issubset(selected_semantic),
            "candidate_critical_count": len(candidate_critical),
            "retained_critical_count": len(candidate_critical.intersection(selected_semantic)),
            "critical_retention": (
                len(candidate_critical.intersection(selected_semantic)) / len(candidate_critical)
                if candidate_critical else 1.0
            ),
            "all_critical_retained": candidate_critical.issubset(selected_semantic),
        },
    }


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
    entity_source = load_json(ROOT / ".data" / "Batch_7" / "entities.json")["entities"]

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
            source_entities=entity_source,
            canonical_memories=canonical,
            canonical_map=canonical_map,
            audit_map=audit_map,
        )

        locked_ids = {
            str(row.get("entity_id"))
            for row in base_package.entities
            if bool(row.get("is_locked")) and row.get("entity_id")
        }
        named_ids = query_named_entity_ids(str(query["query"]), entity_source)
        semantic_ids = semantic_entity_ids(retrieval_row, memory_map)
        retrieval_scope = locked_ids | named_ids | semantic_ids
        balanced_ids = recent_participant_ids(base_package)

        positive_ids = {str(value) for value in query.get("positive_memory_ids", [])}
        critical_ids = set(eval01f.CRITICAL_IDS[case_id])

        policy_rows: dict[str, Any] = {}
        for policy in POLICIES:
            scoped = scope_package(
                base_package,
                policy=policy,
                base_scope_ids=retrieval_scope,
                balanced_ids=balanced_ids,
            )
            required = retrieval_scope if policy != "balanced_scoped_entities" else retrieval_scope | balanced_ids
            policy_rows[policy] = {
                str(budget): pack_metrics(
                    scoped,
                    budget=budget,
                    positive_ids=positive_ids,
                    critical_ids=critical_ids,
                    required_scope_ids=required,
                )
                for budget in BUDGETS
            }

        baseline = policy_rows["baseline_prod8"]
        for policy in ("retrieval_scoped_entities", "balanced_scoped_entities"):
            checks = {
                "all_budgets_deterministic": all(policy_rows[policy][str(b)]["deterministic"] for b in BUDGETS),
                "all_budgets_scope_retained": all(policy_rows[policy][str(b)]["scope"]["all_required_retained"] for b in BUDGETS),
                "all_budgets_protected_retained": all(
                    policy_rows[policy][str(b)]["protected"]["locked_entities_retained"]
                    and policy_rows[policy][str(b)]["protected"]["locked_rules_retained"]
                    and policy_rows[policy][str(b)]["protected"]["constraints_retained"]
                    and not policy_rows[policy][str(b)]["protected_overflow"]
                    for b in BUDGETS
                ),
                "not_worse_positive_vs_baseline": all(
                    policy_rows[policy][str(b)]["semantic"]["retained_positive_count"]
                    >= baseline[str(b)]["semantic"]["retained_positive_count"]
                    for b in BUDGETS
                ),
                "not_worse_critical_vs_baseline": all(
                    policy_rows[policy][str(b)]["semantic"]["retained_critical_count"]
                    >= baseline[str(b)]["semantic"]["retained_critical_count"]
                    for b in BUDGETS
                ),
                "not_worse_recent_vs_baseline": all(
                    policy_rows[policy][str(b)]["selected_counts"]["recent"]
                    >= baseline[str(b)]["selected_counts"]["recent"]
                    for b in BUDGETS
                ),
                "not_worse_rules_vs_baseline": all(
                    policy_rows[policy][str(b)]["selected_counts"]["rules"]
                    >= baseline[str(b)]["selected_counts"]["rules"]
                    for b in BUDGETS
                ),
            }
            if not all(checks.values()):
                failures.append({"case_id": case_id, "policy": policy, "checks": checks})

        cases.append(
            {
                "case_id": case_id,
                "chapter_cutoff": int(query["chapter_cutoff"]),
                "query_named_entity_ids": sorted(named_ids),
                "semantic_top8_entity_ids": sorted(semantic_ids),
                "locked_entity_ids": sorted(locked_ids),
                "retrieval_scope_ids": sorted(retrieval_scope),
                "newest5_recent_participant_ids": sorted(balanced_ids),
                "policies": policy_rows,
            }
        )

    aggregate: dict[str, Any] = {}
    for budget in BUDGETS:
        b = str(budget)
        aggregate[b] = {}
        for policy in POLICIES:
            rows = [case["policies"][policy][b] for case in cases]
            aggregate[b][policy] = {
                "mean_input_entities": sum(r["input_counts"]["entities"] for r in rows) / len(rows),
                "mean_selected_entities": sum(r["selected_counts"]["entities"] for r in rows) / len(rows),
                "mean_selected_rules": sum(r["selected_counts"]["rules"] for r in rows) / len(rows),
                "mean_selected_recent": sum(r["selected_counts"]["recent"] for r in rows) / len(rows),
                "mean_selected_semantic": sum(r["selected_counts"]["semantic"] for r in rows) / len(rows),
                "mean_positive_retention": sum(r["semantic"]["positive_retention"] for r in rows) / len(rows),
                "mean_critical_retention": sum(r["semantic"]["critical_retention"] for r in rows) / len(rows),
                "cases_all_positive_retained": sum(int(r["semantic"]["all_positive_retained"]) for r in rows),
                "cases_all_critical_retained": sum(int(r["semantic"]["all_critical_retained"]) for r in rows),
                "zero_semantic_cases": sum(int(r["selected_counts"]["semantic"] == 0) for r in rows),
                "zero_recent_cases": sum(int(r["selected_counts"]["recent"] == 0) for r in rows),
                "mean_scope_coverage": sum(r["scope"]["coverage"] for r in rows) / len(rows),
            }

    result = {
        "experiment_id": "EVAL-01H",
        "mode": "offline",
        "provider_calls": 0,
        "production_context_packer_modified": False,
        "semantic_limit": SEMANTIC_LIMIT,
        "recent_limit": RECENT_LIMIT,
        "provenance_representation": "compact_provenance",
        "policies": list(POLICIES),
        "budgets": list(BUDGETS),
        "scope_contract": {
            "retrieval_scoped_entities": "locked + query-named + entities appearing in semantic top-8",
            "balanced_scoped_entities": "retrieval-scoped + participants from newest five recent events",
            "gold_labels_used_for_scope": False,
            "critical-memory entity locks": "stress-protection only; inherited from EVAL-01G fixture",
        },
        "aggregate": aggregate,
        "cases": cases,
        "contract_failures": failures,
        "contract_pass": len(failures) == 0,
        "interpretation_status": "REVIEW_REQUIRED",
    }

    summary = [
        "# EVAL-01H Production-Limit Context Scope Diagnostic",
        "",
        "Offline only. Provider calls: 0.",
        "",
        "ContextBudgetPacker implementation is unchanged.",
        "",
        f"Semantic limit: {SEMANTIC_LIMIT}",
        f"Recent-event limit: {RECENT_LIMIT}",
        "Provenance: compact",
        "",
        "## 12k aggregate",
        "",
    ]
    for policy in POLICIES:
        row = aggregate["12000"][policy]
        summary.extend([
            f"### {policy}",
            "",
            f"- mean input entities: {row['mean_input_entities']:.2f}",
            f"- mean selected entities: {row['mean_selected_entities']:.2f}",
            f"- mean selected rules: {row['mean_selected_rules']:.2f}",
            f"- mean selected recent: {row['mean_selected_recent']:.2f}",
            f"- mean selected semantic: {row['mean_selected_semantic']:.2f}",
            f"- mean positive retention: {row['mean_positive_retention']:.3f}",
            f"- mean critical retention: {row['mean_critical_retention']:.3f}",
            f"- cases all positives retained: {row['cases_all_positive_retained']} / {len(CASE_IDS)}",
            f"- cases all critical retained: {row['cases_all_critical_retained']} / {len(CASE_IDS)}",
            f"- zero-semantic cases: {row['zero_semantic_cases']}",
            f"- zero-recent cases: {row['zero_recent_cases']}",
            f"- mean scope coverage: {row['mean_scope_coverage']:.3f}",
            "",
        ])
    summary.extend([
        "## Contract",
        "",
        f"- contract pass: {'PASS' if not failures else 'FAIL'}",
        f"- failures: {len(failures)}",
        "",
        "No production context-selection or packer change is authorized by this diagnostic.",
        "",
    ])

    if not args.stdout_only:
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        (EVIDENCE_DIR / "diagnostic.json").write_text(
            json.dumps(result, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (EVIDENCE_DIR / "summary.md").write_text("\n".join(summary), encoding="utf-8")

    print(json.dumps({
        "experiment_id": "EVAL-01H",
        "provider_calls": 0,
        "semantic_limit": SEMANTIC_LIMIT,
        "recent_limit": RECENT_LIMIT,
        "contract_pass": len(failures) == 0,
        "contract_failure_count": len(failures),
        "aggregate_12k": aggregate["12000"],
        "interpretation_status": "REVIEW_REQUIRED",
    }, indent=2, ensure_ascii=False))
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())

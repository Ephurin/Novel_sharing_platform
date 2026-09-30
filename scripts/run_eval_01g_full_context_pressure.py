#!/usr/bin/env python3
"""EVAL-01G production-shaped full-context pressure diagnostic.

Offline only. No provider calls.

Reconstructs a source-grounded, production-shaped WritingContextPackage with:
- entities from Batch_7/entities.json;
- compact current-state evidence derived from each entity's latest canonical
  frozen memory at the query cutoff;
- world rules from canonical memories tagged world_rule;
- recent events from canonical event_summary memories near the cutoff;
- semantic top-20 candidates from preserved EVAL-01 retrieval;
- fixed evaluation author constraints.

The fixture is not claimed to be a literal PostgreSQL runtime snapshot.
Experimental lock markers are stress-policy metadata, not story facts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
AI_SERVICE_ROOT = ROOT / "ai-service"
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(AI_SERVICE_ROOT))

import run_eval_01e_sealed_provenance_ab as eval01e
import run_eval_01f_compact_provenance_budget as eval01f
from application.context_budget import ContextBudgetPacker
from domain.models import WritingContextPackage

EVIDENCE_DIR = ROOT / "docs" / "development" / "EVAL-01G-FULL-CONTEXT-PRESSURE"

CASE_IDS = (
    "core_gold:rq-0011",
    "challenge:rq-0023",
    "challenge:rq-0025",
    "challenge:rq-0020",
    "challenge:rq-0032",
    "core_gold:rq-0038",
    "core_gold:rq-0010",
)

CONDITIONS = ("pre_provenance", "full_provenance", "compact_provenance")
BUDGETS = (12000, 10000, 8000)

AUTHOR_CONSTRAINTS = (
    "Use only supplied story evidence.",
    "Preserve chronology and unresolved uncertainty.",
    "Do not invent identity, causality, or source status that the context does not establish.",
)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def stable_hash(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(
            value,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        ).encode("utf-8")
    ).hexdigest()


def entity_records(
    *,
    source_entities: list[dict[str, Any]],
    cutoff: int,
    locked_entity_ids: set[str],
) -> list[dict[str, Any]]:
    rows = []
    for item in source_entities:
        if int(item.get("first_chapter") or 0) > cutoff:
            continue
        entity_id = str(item["entity_id"])
        rows.append(
            {
                "entity_id": entity_id,
                "name": str(item.get("canonical_name") or entity_id),
                "entity_type": str(item.get("entity_type") or "unknown"),
                "status": "Unknown",
                "location": "Unknown",
                "is_locked": entity_id in locked_entity_ids,
            }
        )
    rows.sort(
        key=lambda row: (
            0 if row["is_locked"] else 1,
            row["name"],
            row["entity_id"],
        )
    )
    return rows


def latest_state_records(
    *,
    entity_rows: list[dict[str, Any]],
    canonical_memories: list[dict[str, Any]],
    cutoff: int,
) -> list[dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for memory in canonical_memories:
        if int(memory["chapter_number"]) > cutoff:
            continue
        for entity_id in memory.get("entities", []):
            entity_id = str(entity_id)
            current = latest.get(entity_id)
            key = (int(memory["chapter_number"]), str(memory["memory_id"]))
            current_key = (
                (int(current["chapter_number"]), str(current["memory_id"]))
                if current
                else (-1, "")
            )
            if key > current_key:
                latest[entity_id] = memory

    states = []
    for entity in entity_rows:
        entity_id = str(entity["entity_id"])
        memory = latest.get(entity_id)
        state_payload: dict[str, Any] = {}
        if memory:
            state_payload = {
                "source_memory_id": str(memory["memory_id"]),
                "chapter_number": int(memory["chapter_number"]),
                "memory_type": str(memory.get("memory_type") or ""),
                "review_status": str(memory.get("review_status") or ""),
                "tags": list(memory.get("tags", [])),
            }
        states.append(
            {
                "entity_id": entity_id,
                "name": entity["name"],
                "status": "Unknown",
                "location": "Unknown",
                "state": state_payload,
            }
        )
    return states


def world_rule_records(
    *,
    canonical_memories: list[dict[str, Any]],
    cutoff: int,
) -> list[dict[str, Any]]:
    rows = []
    for memory in canonical_memories:
        if int(memory["chapter_number"]) > cutoff:
            continue
        if "world_rule" not in memory.get("tags", []):
            continue
        locked = (
            str(memory.get("review_status")) == "high_confidence"
            and float(memory.get("importance", 0.0)) >= 0.95
        )
        rows.append(
            {
                "id": str(memory["memory_id"]),
                "fact_type": "world_rule",
                "fact_key": f"frozen_memory:{memory['memory_id']}",
                "fact_value": str(memory["content"]),
                "is_locked": locked,
                "source_chapter_number": int(memory["chapter_number"]),
                "stress_policy": (
                    "locked_high_confidence_importance_gte_0.95"
                    if locked
                    else "optional"
                ),
            }
        )
    return rows


def recent_event_records(
    *,
    canonical_memories: list[dict[str, Any]],
    cutoff: int,
    excluded_memory_ids: set[str],
    limit: int = 20,
) -> list[dict[str, Any]]:
    candidates = [
        memory
        for memory in canonical_memories
        if int(memory["chapter_number"]) <= cutoff
        and str(memory.get("memory_type")) == "event_summary"
        and str(memory["memory_id"]) not in excluded_memory_ids
    ]
    candidates.sort(
        key=lambda memory: (
            int(memory["chapter_number"]),
            str(memory["memory_id"]),
        )
    )
    selected = candidates[-limit:]
    return [
        {
            "event_id": f"frozen-event:{memory['memory_id']}",
            "narrative_order": int(memory["chapter_number"]) * 1024,
            "chapter_number": int(memory["chapter_number"]),
            "event_type": "event_summary",
            "summary": str(memory["content"]),
            "participants": list(memory.get("entities", [])),
            "metadata": {
                "source_memory_id": str(memory["memory_id"]),
                "review_status": str(memory.get("review_status") or ""),
                "tags": list(memory.get("tags", [])),
            },
        }
        for memory in selected
    ]


def critical_entity_ids(
    *,
    case_id: str,
    canonical_map: dict[str, dict[str, Any]],
    audit_map: dict[str, dict[str, Any]],
) -> set[str]:
    ids: set[str] = set()
    for memory_id in eval01f.CRITICAL_IDS[case_id]:
        memory = audit_map.get(memory_id) or canonical_map.get(memory_id)
        if memory:
            ids.update(str(entity_id) for entity_id in memory.get("entities", []))
    return ids


def build_package(
    *,
    condition: str,
    case_id: str,
    cutoff: int,
    retrieval_row: dict[str, Any],
    fixture: dict[str, Any],
    source_entities: list[dict[str, Any]],
    canonical_memories: list[dict[str, Any]],
    canonical_map: dict[str, dict[str, Any]],
    audit_map: dict[str, dict[str, Any]],
) -> tuple[WritingContextPackage, dict[str, Any]]:
    memory_map = (
        audit_map if retrieval_row["corpus"] == "audit_232" else canonical_map
    )
    top20_hits = retrieval_row["hybrid_top20"][:20]
    top20_ids = {str(hit["memory_id"]) for hit in top20_hits}

    locked_entities = critical_entity_ids(
        case_id=case_id,
        canonical_map=canonical_map,
        audit_map=audit_map,
    )
    entities = entity_records(
        source_entities=source_entities,
        cutoff=cutoff,
        locked_entity_ids=locked_entities,
    )
    states = latest_state_records(
        entity_rows=entities,
        canonical_memories=canonical_memories,
        cutoff=cutoff,
    )
    rules = world_rule_records(
        canonical_memories=canonical_memories,
        cutoff=cutoff,
    )
    recent = recent_event_records(
        canonical_memories=canonical_memories,
        cutoff=cutoff,
        excluded_memory_ids=top20_ids,
        limit=20,
    )

    semantic = []
    neutralized_count = 0
    for hit in top20_hits:
        original = memory_map[str(hit["memory_id"])]
        neutral, changed = eval01e.neutral_memory(original, fixture)
        neutralized_count += int(changed)
        semantic.append(
            eval01f.semantic_payload(
                neutral,
                hit,
                condition=condition,
            )
        )

    package = WritingContextPackage(
        brain_version=1,
        entities=tuple(entities),
        current_states=tuple(states),
        recent_events=tuple(recent),
        semantic_memories=tuple(semantic),
        world_rules=tuple(rules),
        author_constraints=AUTHOR_CONSTRAINTS,
        context_summary={
            "fixture": ["eval01g-production-shaped-v1"],
            "case_id": [case_id],
        },
    )
    fixture_info = {
        "locked_entity_ids": sorted(locked_entities),
        "locked_rule_ids": sorted(
            str(rule["id"]) for rule in rules if bool(rule.get("is_locked"))
        ),
        "neutralized_semantic_count": neutralized_count,
        "input_counts": {
            "entities": len(entities),
            "current_states": len(states),
            "world_rules": len(rules),
            "author_constraints": len(AUTHOR_CONSTRAINTS),
            "recent_events": len(recent),
            "semantic_memories": len(semantic),
        },
    }
    return package, fixture_info


def pack_trace(
    *,
    package: WritingContextPackage,
    budget: int,
    positive_ids: set[str],
    critical_ids: set[str],
) -> dict[str, Any]:
    packer = ContextBudgetPacker()
    first = packer.pack(package, maximum=budget)
    second = packer.pack(package, maximum=budget)
    deterministic = first == second

    selected_semantic = list(
        first.context_summary.get("semantic_memory_ids", [])
    )
    selected_set = set(selected_semantic)
    candidate_semantic = {
        str(item.get("memory_chunk_id"))
        for item in package.semantic_memories
        if item.get("memory_chunk_id")
    }
    candidate_positive = positive_ids.intersection(candidate_semantic)
    candidate_critical = critical_ids.intersection(candidate_semantic)

    selected_entity_ids = {
        str(item.get("entity_id"))
        for item in first.entities
        if item.get("entity_id")
    }
    state_entity_ids = {
        str(item.get("entity_id"))
        for item in first.current_states
        if item.get("entity_id")
    }
    input_locked_entities = {
        str(item.get("entity_id"))
        for item in package.entities
        if bool(item.get("is_locked"))
    }
    input_locked_rules = {
        str(item.get("id"))
        for item in package.world_rules
        if bool(item.get("is_locked"))
    }
    selected_rule_ids = {
        str(item.get("id"))
        for item in first.world_rules
        if item.get("id")
    }

    return {
        "budget": budget,
        "estimated_before": first.token_budget.get("estimated_before"),
        "tokens_used": first.token_budget.get("used"),
        "budget_overflow": bool(first.token_budget.get("budget_overflow")),
        "protected_overflow": bool(first.token_budget.get("protected_overflow")),
        "deterministic": deterministic,
        "packed_context_hash": stable_hash(
            ContextBudgetPacker.prompt_context(first)
        ),
        "input_counts": {
            "entities": len(package.entities),
            "current_states": len(package.current_states),
            "world_rules": len(package.world_rules),
            "author_constraints": len(package.author_constraints),
            "recent_events": len(package.recent_events),
            "semantic_memories": len(package.semantic_memories),
        },
        "selected_counts": {
            "entities": len(first.entities),
            "current_states": len(first.current_states),
            "world_rules": len(first.world_rules),
            "author_constraints": len(first.author_constraints),
            "recent_events": len(first.recent_events),
            "semantic_memories": len(first.semantic_memories),
        },
        "dropped_counts": {
            "entities": len(
                first.context_summary.get("dropped_entity_ids", [])
            ),
            "world_rules": len(
                first.context_summary.get("dropped_fact_ids", [])
            ),
            "recent_events": len(
                first.context_summary.get("dropped_event_ids", [])
            ),
            "semantic_memories": len(
                first.context_summary.get("dropped_semantic_memory_ids", [])
            ),
        },
        "protected_contract": {
            "locked_entities_input": sorted(input_locked_entities),
            "locked_entities_retained": sorted(
                input_locked_entities.intersection(selected_entity_ids)
            ),
            "locked_entity_states_retained": sorted(
                input_locked_entities.intersection(state_entity_ids)
            ),
            "locked_rules_input": sorted(input_locked_rules),
            "locked_rules_retained": sorted(
                input_locked_rules.intersection(selected_rule_ids)
            ),
            "author_constraints_retained": (
                tuple(first.author_constraints) == AUTHOR_CONSTRAINTS
            ),
            "all_locked_entities_retained": (
                input_locked_entities.issubset(selected_entity_ids)
            ),
            "all_locked_entity_states_retained": (
                input_locked_entities.issubset(state_entity_ids)
            ),
            "all_locked_rules_retained": (
                input_locked_rules.issubset(selected_rule_ids)
            ),
        },
        "semantic_retention": {
            "candidate_positive_count": len(candidate_positive),
            "retained_positive_count": len(
                candidate_positive.intersection(selected_set)
            ),
            "positive_retention": (
                len(candidate_positive.intersection(selected_set))
                / len(candidate_positive)
                if candidate_positive
                else 1.0
            ),
            "all_positive_retained": (
                candidate_positive.issubset(selected_set)
            ),
            "candidate_critical_count": len(candidate_critical),
            "retained_critical_count": len(
                candidate_critical.intersection(selected_set)
            ),
            "critical_retention": (
                len(candidate_critical.intersection(selected_set))
                / len(candidate_critical)
                if candidate_critical
                else 1.0
            ),
            "all_critical_retained": (
                candidate_critical.issubset(selected_set)
            ),
            "selected_semantic_ids": selected_semantic,
            "dropped_semantic_ids": list(
                first.context_summary.get(
                    "dropped_semantic_memory_ids",
                    [],
                )
            ),
        },
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
    entity_source = load_json(
        ROOT / ".data" / "Batch_7" / "entities.json"
    )

    source_entities = list(entity_source["entities"])
    query_map = {
        f"{query['split']}:{query['query_id']}": query
        for query in queries
    }
    canonical_map = {
        str(memory["memory_id"]): memory for memory in canonical
    }
    audit_map = {
        str(memory["memory_id"]): memory for memory in audit
    }

    cases: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    for case_id in CASE_IDS:
        query = query_map[case_id]
        cutoff = int(query["chapter_cutoff"])
        retrieval_row = next(
            row for row in retrieval if row["case_id"] == case_id
        )
        positive_ids = {
            str(memory_id)
            for memory_id in query.get("positive_memory_ids", [])
        }
        critical_ids = set(eval01f.CRITICAL_IDS[case_id])

        condition_rows: dict[str, Any] = {}
        fixture_info: dict[str, Any] | None = None
        for condition in CONDITIONS:
            package, info = build_package(
                condition=condition,
                case_id=case_id,
                cutoff=cutoff,
                retrieval_row=retrieval_row,
                fixture=fixture,
                source_entities=source_entities,
                canonical_memories=canonical,
                canonical_map=canonical_map,
                audit_map=audit_map,
            )
            fixture_info = fixture_info or info
            condition_rows[condition] = {
                str(budget): pack_trace(
                    package=package,
                    budget=budget,
                    positive_ids=positive_ids,
                    critical_ids=critical_ids,
                )
                for budget in BUDGETS
            }

        primary_budget = "12000"
        full = condition_rows["full_provenance"][primary_budget]
        compact = condition_rows["compact_provenance"][primary_budget]

        checks = {
            "all_conditions_deterministic": all(
                condition_rows[condition][str(budget)]["deterministic"]
                for condition in CONDITIONS
                for budget in BUDGETS
            ),
            "all_protected_contracts_pass": all(
                (
                    trace["protected_contract"][
                        "all_locked_entities_retained"
                    ]
                    and trace["protected_contract"][
                        "all_locked_entity_states_retained"
                    ]
                    and trace["protected_contract"][
                        "all_locked_rules_retained"
                    ]
                    and trace["protected_contract"][
                        "author_constraints_retained"
                    ]
                )
                for condition in CONDITIONS
                for trace in condition_rows[condition].values()
            ),
            "no_protected_overflow": all(
                not condition_rows[condition][str(budget)][
                    "protected_overflow"
                ]
                for condition in CONDITIONS
                for budget in BUDGETS
            ),
            "compact_semantic_count_gte_full_at_12k": (
                compact["selected_counts"]["semantic_memories"]
                >= full["selected_counts"]["semantic_memories"]
            ),
            "compact_positive_retention_gte_full_at_12k": (
                compact["semantic_retention"]["retained_positive_count"]
                >= full["semantic_retention"]["retained_positive_count"]
            ),
            "compact_critical_retention_gte_full_at_12k": (
                compact["semantic_retention"]["retained_critical_count"]
                >= full["semantic_retention"]["retained_critical_count"]
            ),
        }
        if not all(checks.values()):
            failures.append(
                {
                    "case_id": case_id,
                    "checks": checks,
                }
            )

        cases.append(
            {
                "case_id": case_id,
                "chapter_cutoff": cutoff,
                "fixture_info": fixture_info,
                "checks": checks,
                "conditions": condition_rows,
            }
        )

    aggregate = {}
    for condition in CONDITIONS:
        rows = [
            case["conditions"][condition]["12000"]
            for case in cases
        ]
        aggregate[condition] = {
            "mean_estimated_before": (
                sum(float(row["estimated_before"]) for row in rows)
                / len(rows)
            ),
            "mean_tokens_used": (
                sum(float(row["tokens_used"]) for row in rows)
                / len(rows)
            ),
            "mean_selected_entities": (
                sum(
                    int(row["selected_counts"]["entities"])
                    for row in rows
                )
                / len(rows)
            ),
            "mean_selected_world_rules": (
                sum(
                    int(row["selected_counts"]["world_rules"])
                    for row in rows
                )
                / len(rows)
            ),
            "mean_selected_recent_events": (
                sum(
                    int(row["selected_counts"]["recent_events"])
                    for row in rows
                )
                / len(rows)
            ),
            "mean_selected_semantic_memories": (
                sum(
                    int(row["selected_counts"]["semantic_memories"])
                    for row in rows
                )
                / len(rows)
            ),
            "mean_positive_retention": (
                sum(
                    float(row["semantic_retention"]["positive_retention"])
                    for row in rows
                )
                / len(rows)
            ),
            "mean_critical_retention": (
                sum(
                    float(row["semantic_retention"]["critical_retention"])
                    for row in rows
                )
                / len(rows)
            ),
            "cases_all_positive_retained": sum(
                int(row["semantic_retention"]["all_positive_retained"])
                for row in rows
            ),
            "cases_all_critical_retained": sum(
                int(row["semantic_retention"]["all_critical_retained"])
                for row in rows
            ),
        }

    diagnostic = {
        "experiment_id": "EVAL-01G",
        "mode": "offline",
        "provider_calls": 0,
        "frozen_files_mutated": False,
        "fixture_contract": {
            "fixture_version": "eval01g-production-shaped-v1",
            "claim": (
                "Source-grounded production-shaped reconstruction, not a "
                "literal PostgreSQL runtime snapshot."
            ),
            "entities_source": ".data/Batch_7/entities.json",
            "states_source": (
                "latest canonical Frozen_v1 memory per entity at cutoff; "
                "compact evidence pointer only"
            ),
            "world_rules_source": (
                "Frozen_v1 canonical memories tagged world_rule"
            ),
            "recent_events_source": (
                "latest canonical event_summary memories at cutoff excluding "
                "the preserved semantic top-20"
            ),
            "semantic_source": (
                "preserved EVAL-01 hybrid top-20 with EVAL-01E neutral view"
            ),
            "author_constraints_source": "evaluation harness constraints",
            "locked_entity_policy": (
                "entities referenced by case-specific critical memories; "
                "experimental stress policy, not canonical story truth"
            ),
            "locked_rule_policy": (
                "high_confidence world_rule memories with importance >= 0.95; "
                "experimental stress policy"
            ),
        },
        "budgets": list(BUDGETS),
        "primary_budget": 12000,
        "aggregate_12k": aggregate,
        "cases": cases,
        "contract_failures": failures,
        "contract_pass": len(failures) == 0,
        "interpretation_status": "REVIEW_REQUIRED",
    }

    summary = [
        "# EVAL-01G Full Context Pressure Diagnostic",
        "",
        "Offline only. Provider calls: 0.",
        "",
        "Fixture claim: source-grounded production-shaped reconstruction, not a literal PostgreSQL runtime snapshot.",
        "",
        "## 12k aggregate",
        "",
    ]
    for condition in CONDITIONS:
        row = aggregate[condition]
        summary.extend(
            [
                f"### {condition}",
                "",
                f"- mean estimated before pack: {row['mean_estimated_before']:.2f}",
                f"- mean tokens used: {row['mean_tokens_used']:.2f}",
                f"- mean selected entities: {row['mean_selected_entities']:.2f}",
                f"- mean selected world rules: {row['mean_selected_world_rules']:.2f}",
                f"- mean selected recent events: {row['mean_selected_recent_events']:.2f}",
                f"- mean selected semantic memories: {row['mean_selected_semantic_memories']:.2f}",
                f"- mean positive retention: {row['mean_positive_retention']:.3f}",
                f"- mean critical retention: {row['mean_critical_retention']:.3f}",
                f"- cases all positives retained: {row['cases_all_positive_retained']} / {len(CASE_IDS)}",
                f"- cases all critical retained: {row['cases_all_critical_retained']} / {len(CASE_IDS)}",
                "",
            ]
        )
    summary.extend(
        [
            "## Contract",
            "",
            f"- contract pass: {'PASS' if not failures else 'FAIL'}",
            f"- failures: {len(failures)}",
            "",
            "No production prompt policy is authorized by this diagnostic.",
            "",
        ]
    )

    if not args.stdout_only:
        EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        (EVIDENCE_DIR / "diagnostic.json").write_text(
            json.dumps(diagnostic, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        (EVIDENCE_DIR / "summary.md").write_text(
            "\n".join(summary),
            encoding="utf-8",
        )

    print(
        json.dumps(
            {
                "experiment_id": "EVAL-01G",
                "provider_calls": 0,
                "case_count": len(CASE_IDS),
                "primary_budget": 12000,
                "contract_pass": len(failures) == 0,
                "contract_failure_count": len(failures),
                "aggregate_12k": aggregate,
                "interpretation_status": "REVIEW_REQUIRED",
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0 if not failures else 2


if __name__ == "__main__":
    raise SystemExit(main())

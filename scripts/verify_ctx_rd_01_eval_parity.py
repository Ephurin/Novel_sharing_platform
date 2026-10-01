#!/usr/bin/env python3
"""Offline parity check: production CTX-RD-01 components vs frozen EVAL-01N source_1x policy."""

from __future__ import annotations

import json
import sys
from dataclasses import replace
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
AI_SERVICE_ROOT = ROOT / "ai-service"
sys.path.insert(0, str(SCRIPTS))
sys.path.insert(0, str(AI_SERVICE_ROOT))

import run_eval_01g_full_context_pressure as eval01g
import run_eval_01h_prod8_context_scope as eval01h
import run_eval_01m_sealed_live_adaptive_context as eval01m
from application.context_budget import ContextBudgetPacker
from application.context_routing import ContextBudgetRouter
from application.context_scope import BalancedRelevanceScopeBuilder


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def ids(rows, keys):
    result = []
    for row in rows:
        for key in keys:
            if row.get(key) is not None:
                result.append(str(row[key]))
                break
    return result


def main() -> int:
    fixture = load_json(ROOT / "benchmarks" / "eval01e_neutral_context.json")
    retrieval = load_json(
        ROOT
        / "docs"
        / "development"
        / "EVAL-01-AETHELGARD-RUNTIME-BASELINE"
        / "retrieval-raw.json"
    )
    queries = load_json(ROOT / ".data" / "Frozen_v1" / "retrieval_queries.json")["queries"]
    canonical = load_json(
        ROOT / ".data" / "Frozen_v1" / "memory_chunks_canonical.json"
    )["memories"]
    audit = load_json(ROOT / ".data" / "Frozen_v1" / "memory_chunks.json")["memories"]
    source_entities = load_json(ROOT / ".data" / "Batch_7" / "entities.json")["entities"]

    query_map = {f"{row['split']}:{row['query_id']}": row for row in queries}
    canonical_map = {str(row["memory_id"]): row for row in canonical}
    audit_map = {str(row["memory_id"]): row for row in audit}

    builder = BalancedRelevanceScopeBuilder()
    router = ContextBudgetRouter(ContextBudgetPacker())
    failures = []
    rows = []

    for case_id in eval01g.CASE_IDS:
        query = query_map[case_id]
        retrieval_row = next(row for row in retrieval if row["case_id"] == case_id)
        memory_map = audit_map if retrieval_row["corpus"] == "audit_232" else canonical_map

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
        # EVAL stores semantic entity links in the frozen memory corpus,
        # while production WritingService._semantic_match_payload exposes them
        # directly as entity_ids. Enrich the fixture to the real production
        # payload shape before exercising the production scope builder.
        production_semantic = []
        for payload in base_package.semantic_memories[:8]:
            memory = memory_map[str(payload["memory_chunk_id"])]
            enriched = dict(payload)
            enriched["entity_ids"] = [
                str(value) for value in memory.get("entities", [])
            ]
            production_semantic.append(enriched)

        production_shaped = replace(
            base_package,
            semantic_memories=tuple(production_semantic),
            recent_events=tuple(base_package.recent_events[-20:]),
        )

        query_ids = eval01h.query_named_entity_ids(str(query["query"]), source_entities)
        recent_ids = eval01h.recent_participant_ids(production_shaped)

        production_scope = builder.scope(
            production_shaped,
            query_entity_ids=query_ids,
            recent_participant_entity_ids=recent_ids,
        )
        packed = router.route(production_scope)

        semantic_input = ids(
            production_shaped.semantic_memories,
            ("memory_chunk_id", "source_key", "event_id"),
        )
        semantic_out = ids(
            packed.semantic_memories,
            ("memory_chunk_id", "source_key", "event_id"),
        )
        recent_input = ids(production_shaped.recent_events, ("event_id",))
        recent_out = ids(packed.recent_events, ("event_id",))
        rule_input = ids(
            production_shaped.world_rules,
            ("id", "fact_id", "fact_key"),
        )
        rule_out = ids(packed.world_rules, ("id", "fact_id", "fact_key"))

        semantic_scope_ids = eval01h.semantic_entity_ids(retrieval_row, memory_map)
        expected_balanced = eval01h.scope_package(
            production_shaped,
            policy="balanced_scoped_entities",
            base_scope_ids=query_ids | semantic_scope_ids,
            balanced_ids=recent_ids,
        )
        expected_entity_ids = ids(expected_balanced.entities, ("entity_id", "id", "name"))
        actual_entity_ids = ids(production_scope.package.entities, ("entity_id", "id", "name"))

        checks = {
            "tier_12k": packed.token_budget.get("routing_selected_tier") == 12_000,
            "semantic_exact": semantic_out == semantic_input and len(semantic_out) == 8,
            "recent_exact": recent_out == recent_input and len(recent_out) == 20,
            "rules_exact": rule_out == rule_input,
            "entities_match_eval_balanced": actual_entity_ids == expected_entity_ids,
            "no_drop": int(packed.token_budget.get("dropped_artifact_count") or 0) == 0,
            "no_protected_overflow": not bool(packed.token_budget.get("protected_overflow")),
        }
        if not all(checks.values()):
            failures.append({"case_id": case_id, "checks": checks})

        rows.append(
            {
                "case_id": case_id,
                "selected_tier": packed.token_budget.get("routing_selected_tier"),
                "entities": len(packed.entities),
                "states": len(packed.current_states),
                "semantic": len(packed.semantic_memories),
                "recent": len(packed.recent_events),
                "rules": len(packed.world_rules),
                "checks": checks,
            }
        )

    result = {
        "verification": "CTX-RD-01 production implementation parity",
        "provider_calls": 0,
        "cases": len(rows),
        "passed": len(failures) == 0,
        "failures": failures,
        "rows": rows,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

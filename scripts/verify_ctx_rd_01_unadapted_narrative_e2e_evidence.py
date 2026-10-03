#!/usr/bin/env python3
"""Validate CTX-RD-01 unadapted narrative-context live-provider evidence without API/DB access.

Checks:
- Provenance declared as postgres_narrative_repository_unadapted (ZERO RepoAdapter).
- Live mode (rejects dry_run/offline_fake).
- Sanitized database endpoint (no credentials leaked, valid schema).
- Real positive document/query provider adapter calls.
- Raw-vs-packed semantic ID match (exact equality).
- Exact context hash parity between preview and generation job.
- Zero dropped artifacts and false overflow.
- Measured metrics present from runtime (selected_tier, dropped_artifact_count, etc.).
- Independent raw vs retained arrays for recent, rules, entities, and states (order-independent match).
- Correct per-lane provenance trace for rq-0025:
  * Cavalry memories mem-000164, mem-000172, mem-000176 in semantic top 8 (lane: semantic, ambiguous).
  * World-rule memories mem-000167, mem-000174, mem-000177 in world-rule lane (lane: world_rule).
- Privacy: ZERO full manuscript drafts committed; draft SHA-256 and snippets only.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

EXPECTED_VERSION = "gemini-embedding-2-768-v1"


def validate(evidence: dict) -> list[str]:
    errors: list[str] = []

    def require(ok: bool, code: str) -> None:
        if not ok:
            errors.append(code)

    sha = evidence.get("tested_commit")
    require(isinstance(sha, str) and bool(re.fullmatch(r"[0-9a-f]{40}", sha)), "tested_sha_invalid")
    require(evidence.get("mode") == "live", "dry_run_or_unspecified_mode")
    require(
        evidence.get("methodology") == "unadapted_postgres_narrative_repository_and_pgvector_semantic",
        "methodology_overclaims_or_invalid",
    )
    require(
        evidence.get("structured_context_source") == "postgres_narrative_repository_unadapted",
        "unadapted_structured_context_provenance_missing",
    )
    require(evidence.get("source_grounded_live_vector_query") == "DEMONSTRATED", "live_vector_query_not_demonstrated")
    require(
        evidence.get("canary_gate_verdict") == "UNADAPTED_NARRATIVE_E2E_DEMONSTRATED",
        "gate_verdict_overclaims_or_invalid",
    )
    require(evidence.get("pgvector_live") is True, "pgvector_not_live")

    # Database endpoint checks
    db = evidence.get("database")
    require(isinstance(db, str) and db.startswith("postgresql"), "database_endpoint_invalid")
    if isinstance(db, str):
        require("@" not in db or ":" not in db.split("@")[0], "database_endpoint_leaks_credentials")

    require(
        evidence.get("production_default") == "legacy-v1" and evidence.get("default_changed") is False,
        "production_default_changed",
    )
    require(evidence.get("p8_05_blocked") is True, "p8_05_unblocked")

    # Privacy check: root must not contain full drafts
    require("full_drafts" not in evidence and "drafts" not in evidence, "full_drafts_leaked_at_root")

    emb = evidence.get("embedding") or {}
    require(emb.get("provider") == "GeminiEmbeddingProvider", "embedding_provider_not_real")
    require(emb.get("version") == EXPECTED_VERSION, "embedding_version_invalid")
    require(emb.get("dimension") == 768 and emb.get("l2_normalized") is True, "embedding_shape_invalid")
    for name in ("document_calls", "query_calls"):
        n = emb.get(name)
        require(type(n) is int and n > 0, name + "_not_positive")

    cases = evidence.get("cases")
    require(isinstance(cases, list) and len(cases) >= 2, "not_enough_cases")
    attempts: list[dict] = []
    if isinstance(cases, list):
        expected_cases = {"core_gold:rq-0011", "challenge:rq-0025"}
        require(
            {c.get("query_id") for c in cases if isinstance(c, dict)} >= expected_cases,
            "missing_canonical_cases",
        )
        for i, case in enumerate(cases):
            prefix = f"case_{i}_"
            if not isinstance(case, dict):
                errors.append(prefix + "not_object")
                continue

            # Measured routing and budget metrics (fail-closed, no missing defaults)
            require(
                case.get("routing_status") == "routed" and case.get("routing_version") == "balanced-scope-v1",
                prefix + "routing_invalid",
            )
            tier = case.get("selected_tier")
            require(isinstance(tier, int) and tier in (12000, 16000, 20000, 24000), prefix + "tier_invalid")
            tokens_used = case.get("tokens_used")
            require(
                isinstance(tokens_used, int) and isinstance(tier, int) and 0 < tokens_used <= tier,
                prefix + "tokens_used_invalid_or_overflow",
            )
            require(
                case.get("dropped_artifacts") == 0
                and case.get("protected_overflow") is False
                and case.get("budget_overflow") is False,
                prefix + "loss_or_overflow",
            )

            # Semantic lane: raw vs packed equality accounting for recent event deduplication
            raw_sem = case.get("raw_semantic_ids")
            ret_sem = case.get("retained_semantic_ids")
            dedup_keys = case.get("deduplicated_semantic_source_keys") or []
            expected_ret_sem = [m for m in (raw_sem or []) if m not in dedup_keys]
            require(
                isinstance(raw_sem, list) and bool(raw_sem)
                and isinstance(ret_sem, list)
                and ret_sem == expected_ret_sem
                and case.get("raw_to_packed_semantic_ids_match") is True,
                prefix + "raw_vs_packed_semantic_mismatch",
            )

            # Recent events lane: order-independent preservation
            raw_rec = case.get("raw_recent_ids")
            ret_rec = case.get("retained_recent_ids")
            require(
                isinstance(raw_rec, list) and bool(raw_rec)
                and isinstance(ret_rec, list)
                and sorted(raw_rec) == sorted(ret_rec),
                prefix + "raw_vs_retained_recent_mismatch",
            )

            # World rules lane: order-independent preservation
            raw_rules = case.get("raw_rule_ids")
            ret_rules = case.get("retained_rule_ids")
            require(
                isinstance(raw_rules, list) and bool(raw_rules)
                and isinstance(ret_rules, list)
                and sorted(raw_rules) == sorted(ret_rules),
                prefix + "raw_vs_retained_rules_mismatch",
            )

            # Entity and state presence and subset consistency
            raw_ent = case.get("raw_entity_ids")
            ret_ent = case.get("retained_entity_ids")
            require(
                isinstance(raw_ent, list) and bool(raw_ent)
                and isinstance(ret_ent, list) and bool(ret_ent)
                and set(ret_ent).issubset(set(raw_ent)),
                prefix + "entities_missing_empty_or_not_subset",
            )

            raw_state = case.get("raw_state_entity_ids")
            ret_state = case.get("retained_state_entity_ids")
            require(
                isinstance(raw_state, list) and isinstance(ret_state, list)
                and set(ret_state).issubset(set(ret_ent)),
                prefix + "states_not_aligned_with_retained_entities",
            )

            # Hash match
            h = case.get("job_context_hash")
            require(
                isinstance(h, str) and bool(re.fullmatch(r"[0-9a-f]{64}", h))
                and h == case.get("preview_context_hash")
                and case.get("context_hash_match") is True,
                prefix + "hash_mismatch",
            )

            # Generation checks
            gen = case.get("generation") or {}
            require(
                gen.get("provider") == "gemini"
                and gen.get("actual_provider_response") is True
                and gen.get("status") == "completed"
                and gen.get("nonempty_output") is True,
                prefix + "generation_not_real_and_complete",
            )

            # Privacy checks on case level
            require("full_draft" not in gen and "full_draft" not in case, prefix + "full_draft_leaked")
            d_sha = gen.get("draft_sha256")
            require(
                isinstance(d_sha, str) and bool(re.fullmatch(r"[0-9a-f]{64}", d_sha)),
                prefix + "draft_sha256_missing_or_invalid",
            )
            require(
                isinstance(gen.get("draft_length"), int) and gen.get("draft_length", 0) > 0,
                prefix + "draft_length_zero",
            )
            d_snip = gen.get("draft_snippet")
            require(
                isinstance(d_snip, str) and 0 < len(d_snip) <= 450,
                prefix + "draft_snippet_missing_or_too_long",
            )

            rows = gen.get("model_attempts")
            require(
                isinstance(rows, list) and any(isinstance(a, dict) and a.get("status") == "success" for a in rows),
                prefix + "no_successful_model_attempt",
            )
            if isinstance(rows, list):
                attempts.extend(a for a in rows if isinstance(a, dict))

            # Case-specific provenance check for rq-0025
            if case.get("query_id") == "challenge:rq-0025":
                trace = case.get("per_lane_provenance_trace")
                require(isinstance(trace, dict), prefix + "provenance_trace_missing")
                if isinstance(trace, dict):
                    # Authoritative cavalry memories MUST have raw retrieval_origin="semantic" in top 8 (ranks 1-8)
                    cavalry_ids = ("mem-000164", "mem-000172", "mem-000176")
                    for mem_id in cavalry_ids:
                        t_item = trace.get(mem_id, {})
                        require(
                            t_item.get("retrieval_origin") == "semantic",
                            prefix + f"{mem_id}_retrieval_origin_not_semantic",
                        )
                        require(
                            t_item.get("in_semantic_top8") is True,
                            prefix + f"{mem_id}_must_be_in_semantic_top8",
                        )
                        require(
                            isinstance(t_item.get("semantic_rank"), int) and 1 <= t_item.get("semantic_rank") <= 8,
                            prefix + f"{mem_id}_invalid_semantic_rank",
                        )
                        require(
                            t_item.get("dedup_reason") == "overlap_with_recent",
                            prefix + f"{mem_id}_dedup_reason_missing",
                        )
                        require(
                            "recent" in (t_item.get("prompt_retained_lanes") or []),
                            prefix + f"{mem_id}_must_be_retained_in_recent_lane",
                        )
                        require(
                            t_item.get("actual_preserved_lane") == "recent",
                            prefix + f"{mem_id}_actual_preserved_lane_must_be_recent",
                        )
                        require(
                            t_item.get("is_ambiguous_ground_truth") is True,
                            prefix + f"{mem_id}_ambiguity_flag_missing",
                        )

                    # Distinct world-rule memories must have retrieval_origin="world_rule" (NOT semantic top 8)
                    rule_ids = ("mem-000167", "mem-000174", "mem-000177")
                    for mem_id in rule_ids:
                        t_item = trace.get(mem_id, {})
                        require(
                            t_item.get("in_semantic_top8") is False,
                            prefix + f"{mem_id}_falsely_claimed_in_semantic_top8",
                        )
                        require(
                            t_item.get("retrieval_origin") == "world_rule",
                            prefix + f"{mem_id}_retrieval_origin_not_world_rule",
                        )
                        require(
                            "world_rule" in (t_item.get("prompt_retained_lanes") or []),
                            prefix + f"{mem_id}_not_retained_in_world_rule_lane",
                        )
                        require(
                            t_item.get("actual_preserved_lane") == "world_rule",
                            prefix + f"{mem_id}_not_traced_to_world_rule",
                        )
                        require(
                            t_item.get("in_persisted_world_rules") is True,
                            prefix + f"{mem_id}_not_persisted_in_world_rules",
                        )


    summary = evidence.get("summary") or {}
    require(
        summary.get("total_cases_run") == (len(cases) if isinstance(cases, list) else None),
        "summary_case_count_mismatch",
    )
    require(
        summary.get("total_model_attempts") == len(attempts)
        and summary.get("successful_model_attempts") == sum(a.get("status") == "success" for a in attempts)
        and summary.get("failed_model_attempts") == sum(a.get("status") != "success" for a in attempts),
        "summary_model_attempts_mismatch",
    )
    return errors


def self_test() -> None:
    case_11 = {
        "query_id": "core_gold:rq-0011",
        "routing_status": "routed",
        "routing_version": "balanced-scope-v1",
        "selected_tier": 12000,
        "tokens_used": 9890,
        "raw_semantic_ids": ["mem-000089", "mem-000110"],
        "retained_semantic_ids": ["mem-000089", "mem-000110"],
        "deduplicated_semantic_source_keys": [],
        "raw_to_packed_semantic_ids_match": True,
        "raw_recent_ids": ["ev-1", "ev-2"],
        "retained_recent_ids": ["ev-2", "ev-1"],
        "raw_rule_ids": ["rule-1", "rule-2"],
        "retained_rule_ids": ["rule-1", "rule-2"],
        "raw_entity_ids": ["ent-1", "ent-2"],
        "retained_entity_ids": ["ent-1"],
        "raw_state_entity_ids": ["ent-1"],
        "retained_state_entity_ids": ["ent-1"],
        "dropped_artifacts": 0,
        "protected_overflow": False,
        "budget_overflow": False,
        "job_context_hash": "a" * 64,
        "preview_context_hash": "a" * 64,
        "context_hash_match": True,
        "generation": {
            "provider": "gemini",
            "actual_provider_response": True,
            "status": "completed",
            "nonempty_output": True,
            "draft_sha256": "c" * 64,
            "draft_length": 500,
            "draft_snippet": "Snippet preview text within safe length",
            "model_attempts": [{"status": "success"}],
        },
    }
    case_25 = {
        **case_11,
        "query_id": "challenge:rq-0025",
        "tokens_used": 11208,
        "per_lane_provenance_trace": {
            "mem-000164": {
                "retrieval_origin": "semantic",
                "in_semantic_top8": True,
                "semantic_rank": 3,
                "dedup_reason": "overlap_with_recent",
                "prompt_retained_lanes": ["recent"],
                "actual_preserved_lane": "recent",
                "is_ambiguous_ground_truth": True,
            },
            "mem-000172": {
                "retrieval_origin": "semantic",
                "in_semantic_top8": True,
                "semantic_rank": 1,
                "dedup_reason": "overlap_with_recent",
                "prompt_retained_lanes": ["recent"],
                "actual_preserved_lane": "recent",
                "is_ambiguous_ground_truth": True,
            },
            "mem-000176": {
                "retrieval_origin": "semantic",
                "in_semantic_top8": True,
                "semantic_rank": 2,
                "dedup_reason": "overlap_with_recent",
                "prompt_retained_lanes": ["recent"],
                "actual_preserved_lane": "recent",
                "is_ambiguous_ground_truth": True,
            },
            "mem-000167": {
                "retrieval_origin": "world_rule",
                "in_semantic_top8": False,
                "prompt_retained_lanes": ["world_rule"],
                "actual_preserved_lane": "world_rule",
                "in_persisted_world_rules": True,
            },
            "mem-000174": {
                "retrieval_origin": "world_rule",
                "in_semantic_top8": False,
                "prompt_retained_lanes": ["world_rule"],
                "actual_preserved_lane": "world_rule",
                "in_persisted_world_rules": True,
            },
            "mem-000177": {
                "retrieval_origin": "world_rule",
                "in_semantic_top8": False,
                "prompt_retained_lanes": ["world_rule"],
                "actual_preserved_lane": "world_rule",
                "in_persisted_world_rules": True,
            },
        },
    }
    ev = {
        "tested_commit": "b" * 40,
        "mode": "live",
        "methodology": "unadapted_postgres_narrative_repository_and_pgvector_semantic",
        "structured_context_source": "postgres_narrative_repository_unadapted",
        "source_grounded_live_vector_query": "DEMONSTRATED",
        "canary_gate_verdict": "UNADAPTED_NARRATIVE_E2E_DEMONSTRATED",
        "database": "postgresql+psycopg://localhost:5433/ephurin",
        "pgvector_live": True,
        "production_default": "legacy-v1",
        "default_changed": False,
        "p8_05_blocked": True,
        "embedding": {
            "provider": "GeminiEmbeddingProvider",
            "version": EXPECTED_VERSION,
            "dimension": 768,
            "l2_normalized": True,
            "document_calls": 11,
            "query_calls": 6,
        },
        "cases": [case_11, case_25],
        "summary": {
            "total_cases_run": 2,
            "total_model_attempts": 2,
            "successful_model_attempts": 2,
            "failed_model_attempts": 0,
        },
    }

    # 1. Valid evidence passes cleanly
    assert not validate(ev), validate(ev)

    # 2. Rejection of offline/fake modes
    assert "dry_run_or_unspecified_mode" in validate({**ev, "mode": "offline_fake"})
    assert "gate_verdict_overclaims_or_invalid" in validate({**ev, "canary_gate_verdict": "MIXED_PROVENANCE_PROVIDER_PATH_OBSERVED"})
    assert "document_calls_not_positive" in validate({**ev, "embedding": {**ev["embedding"], "document_calls": 0}})

    # 3. Rejection of credential leaks
    assert "database_endpoint_leaks_credentials" in validate({**ev, "database": "postgresql+psycopg://user:pass@localhost:5433/ephurin"})

    # 4. Privacy: full draft leak rejection
    assert "case_0_full_draft_leaked" in validate({
        **ev,
        "cases": [{**case_11, "full_draft": "Confidential draft text"}, case_25],
    })

    # 5. Fail-closed: missing tokens_used or overflow tokens
    assert "case_0_tokens_used_invalid_or_overflow" in validate({
        **ev,
        "cases": [{**case_11, "tokens_used": 15000}, case_25],
    })
    assert "case_0_tokens_used_invalid_or_overflow" in validate({
        **ev,
        "cases": [{**case_11, "tokens_used": 0}, case_25],
    })

    # 6. Fail-closed: entity subset leak
    assert "case_0_entities_missing_empty_or_not_subset" in validate({
        **ev,
        "cases": [{**case_11, "retained_entity_ids": ["ent-999"]}, case_25],
    })

    # 7. Fail-closed: state alignment leak
    assert "case_0_states_not_aligned_with_retained_entities" in validate({
        **ev,
        "cases": [{**case_11, "retained_state_entity_ids": ["ent-999"]}, case_25],
    })

    # 8. Cavalry provenance: mem-000164 must be in semantic top 8 and retained in recent
    cavalry_mismapped = {
        **ev,
        "cases": [
            case_11,
            {
                **case_25,
                "per_lane_provenance_trace": {
                    **case_25["per_lane_provenance_trace"],
                    "mem-000164": {
                        "retrieval_origin": "semantic",
                        "in_semantic_top8": False,
                        "actual_preserved_lane": "world_rule",
                        "is_ambiguous_ground_truth": True,
                    },
                },
            },
        ],
    }
    assert "case_1_mem-000164_must_be_in_semantic_top8" in validate(cavalry_mismapped)

    # 9. World-rule provenance: mem-000167 must not be falsely claimed in semantic top 8
    rule_mismapped = {
        **ev,
        "cases": [
            case_11,
            {
                **case_25,
                "per_lane_provenance_trace": {
                    **case_25["per_lane_provenance_trace"],
                    "mem-000167": {
                        "retrieval_origin": "semantic",
                        "in_semantic_top8": True,
                        "actual_preserved_lane": "semantic",
                    },
                },
            },
        ],
    }
    assert "case_1_mem-000167_falsely_claimed_in_semantic_top8" in validate(rule_mismapped)

    # 10. Recent events mismatch rejection
    recent_mismatch = {
        **ev,
        "cases": [{**case_11, "retained_recent_ids": ["ev-999"]}, case_25],
    }
    assert "case_0_raw_vs_retained_recent_mismatch" in validate(recent_mismatch)

    print("SELF-TEST PASS: unadapted narrative validator correctly enforces strict contract")



def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, default=Path("docs/development/CTX-RD-01-OPT-IN-CANARY/unadapted-narrative-e2e.json"))
    parser.add_argument("--self-test", action="store_true", help="Run offline synthetic validator self-test")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    if not args.evidence.exists():
        print(f"FAIL: evidence file not found at {args.evidence}")
        return 2

    try:
        data = json.loads(args.evidence.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"FAIL: cannot parse JSON ({exc})")
        return 2

    errors = validate(data)
    result = {"status": "PASS" if not errors else "FAIL", "errors": errors}
    print(json.dumps(result, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())

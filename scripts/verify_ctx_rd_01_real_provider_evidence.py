#!/usr/bin/env python3
"""Offline contract validator for CTX-RD-01 real-provider staging evidence.

No API or database access; validates the submitted evidence claims and rejects
fake/mixed embedding versions, missing provider-call proof and absent stress data.
A PASS validates the manifest contract, not the truth of self-reported call logs.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

EXPECTED_VERSION = "gemini-embedding-2-768-v1"
TIERS = (12000, 16000, 20000, 24000)


def validate(real: dict, stress: dict, safety: dict, config: dict) -> list[str]:
    errors: list[str] = []
    def require(ok: bool, code: str) -> None:
        if not ok:
            errors.append(code)

    commit = real.get("tested_commit")
    require(isinstance(commit, str) and bool(re.fullmatch(r"[0-9a-f]{40}", commit)), "invalid_tested_commit")
    require(config.get("tested_commit") == commit, "config_commit_mismatch")
    require(stress.get("tested_commit") == commit, "stress_commit_mismatch")
    require(safety.get("tested_commit") == commit, "safety_commit_mismatch")
    require(config.get("isolated_staging_database") is True, "staging_database_not_isolated")
    require(config.get("pgvector_live") is True, "pgvector_not_live")
    require(config.get("production_default") == "legacy-v1", "default_not_legacy")
    require(config.get("default_changed") is False, "default_changed")
    require(config.get("llm_local_fallback_enabled") is False, "local_llm_fallback_not_disabled")

    emb = real.get("embedding") or {}
    require(emb.get("provider") == "GeminiEmbeddingProvider", "embedding_provider_not_real")
    require(emb.get("model") == "gemini-embedding-2", "embedding_model_mismatch")
    require(emb.get("version") == EXPECTED_VERSION, "embedding_version_mismatch")
    require(emb.get("document_version") == EXPECTED_VERSION, "document_version_mismatch")
    require(emb.get("query_version") == EXPECTED_VERSION, "query_version_mismatch")
    require(emb.get("indexed_versions") == [EXPECTED_VERSION], "indexed_versions_mixed")
    require(emb.get("dimension") == 768, "embedding_dimension_mismatch")
    require(emb.get("query_l2_normalized") is True, "query_not_l2_normalized")
    require(emb.get("documents_l2_normalized") is True, "documents_not_l2_normalized")
    require(isinstance(emb.get("document_provider_calls"), int) and emb["document_provider_calls"] > 0, "no_real_document_calls")
    require(isinstance(emb.get("query_provider_calls"), int) and emb["query_provider_calls"] > 0, "no_real_query_calls")

    ret = real.get("retrieval") or {}
    require(ret.get("status") == "ok", "retrieval_not_ok")
    require(ret.get("ranking_version") == "hybrid-v1", "ranking_not_hybrid_v1")
    require(ret.get("hybrid_signals_resolved") is True, "hybrid_signals_not_resolved")
    require(isinstance(ret.get("chapter_cutoff"), int) and ret["chapter_cutoff"] > 0, "chapter_cutoff_missing")

    gen = real.get("generation") or {}
    require(gen.get("provider") in {"gemini", "openai", "groq"}, "generation_provider_not_real")
    require(isinstance(gen.get("requested_model"), str) and bool(gen["requested_model"]), "requested_model_missing")
    require(isinstance(gen.get("effective_model"), str) and bool(gen["effective_model"]), "effective_model_missing")
    require(gen.get("actual_provider_response") is True, "no_actual_llm_response_evidence")
    require(isinstance(gen.get("provider_calls"), int) and gen["provider_calls"] > 0, "no_real_llm_calls")
    require(gen.get("status") == "completed" and gen.get("nonempty_output") is True, "generation_not_completed")
    require(isinstance(gen.get("context_hash"), str) and bool(re.fullmatch(r"[0-9a-f]{64}", gen["context_hash"])), "context_hash_invalid")

    route = real.get("routing") or {}
    require(route.get("policy") == "balanced-scope-v1", "balanced_policy_not_active")
    require(route.get("status") == "routed", "route_not_accepted")
    require(route.get("selected_tier") in TIERS, "invalid_tier")
    before, after = route.get("entities_before"), route.get("entities_after")
    require(isinstance(before, int) and isinstance(after, int) and before >= after >= 0, "entity_counts_invalid")
    for lane in ("semantic", "recent", "rules"):
        original, kept = route.get(lane + "_input_ids"), route.get(lane + "_retained_ids")
        require(isinstance(original, list) and isinstance(kept, list) and original == kept, lane + "_ids_not_preserved")
    require(route.get("protected_overflow") is False, "protected_overflow")
    require(route.get("dropped_artifacts") == 0, "artifacts_dropped")

    cases = stress.get("cases")
    require(isinstance(cases, list) and bool(cases), "stress_cases_missing")
    if isinstance(cases, list):
        escalated = False
        for case in cases:
            if not isinstance(case, dict):
                errors.append("stress_case_invalid")
                continue
            tier = case.get("selected_tier")
            if tier in TIERS[1:]:
                escalated = True
            require(tier in TIERS[1:], "stress_tier_not_escalated")
            require(case.get("fixture_origin") in {"isolated_live_story", "production_shaped_deterministic"}, "stress_origin_unlabelled")
            require(case.get("protected_overflow") is False, "stress_protected_overflow")
            require(case.get("dropped_artifacts") == 0, "stress_artifacts_dropped")
            for lane in ("semantic", "recent", "rules"):
                require(case.get(lane + "_exact") is True, "stress_" + lane + "_not_exact")
        require(escalated, "no_tier_above_12k")

    for name in ("future_participant_leakage", "superseded_participant_leakage", "cross_tenant_leakage"):
        require(safety.get(name) == 0, name)
    for name in ("semantic_failure_legacy_fallback", "over_24k_fails_closed", "rollback_to_legacy"):
        require(safety.get(name) is True, name)
    require(safety.get("p8_05_blocked") is True, "p8_05_gate_changed")
    return errors


def load(base: Path, name: str) -> dict:
    obj = json.loads((base / name).read_text(encoding="utf-8"))
    if not isinstance(obj, dict):
        raise ValueError(name + " must be an object")
    return obj


def self_test() -> None:
    sha = "a" * 40
    real = {
        "tested_commit": sha,
        "embedding": {
            "provider": "GeminiEmbeddingProvider", "model": "gemini-embedding-2",
            "version": EXPECTED_VERSION, "document_version": EXPECTED_VERSION,
            "query_version": EXPECTED_VERSION, "indexed_versions": [EXPECTED_VERSION],
            "dimension": 768, "query_l2_normalized": True,
            "documents_l2_normalized": True, "document_provider_calls": 1,
            "query_provider_calls": 1,
        },
        "retrieval": {"status": "ok", "ranking_version": "hybrid-v1",
                      "hybrid_signals_resolved": True, "chapter_cutoff": 35},
        "generation": {"provider": "gemini", "requested_model": "model-a",
                       "effective_model": "model-a", "actual_provider_response": True,
                       "provider_calls": 1, "status": "completed",
                       "nonempty_output": True, "context_hash": "b" * 64},
        "routing": {"policy": "balanced-scope-v1", "status": "routed",
                    "selected_tier": 12000, "entities_before": 5, "entities_after": 2,
                    "semantic_input_ids": ["m1"], "semantic_retained_ids": ["m1"],
                    "recent_input_ids": ["e1"], "recent_retained_ids": ["e1"],
                    "rules_input_ids": ["r1"], "rules_retained_ids": ["r1"],
                    "protected_overflow": False, "dropped_artifacts": 0},
    }
    stress = {"tested_commit": sha, "cases": [
        {"selected_tier": 16000, "fixture_origin": "production_shaped_deterministic",
         "protected_overflow": False, "dropped_artifacts": 0, "semantic_exact": True,
         "recent_exact": True, "rules_exact": True}
    ]}
    safety = {"tested_commit": sha, "future_participant_leakage": 0,
              "superseded_participant_leakage": 0, "cross_tenant_leakage": 0,
              "semantic_failure_legacy_fallback": True, "over_24k_fails_closed": True,
              "rollback_to_legacy": True, "p8_05_blocked": True}
    config = {"tested_commit": sha, "isolated_staging_database": True,
              "pgvector_live": True, "production_default": "legacy-v1",
              "default_changed": False, "llm_local_fallback_enabled": False}
    assert not validate(real, stress, safety, config)
    real["embedding"]["query_version"] = "fake-embedding-768-v1"
    assert "query_version_mismatch" in validate(real, stress, safety, config)
    real["embedding"]["query_version"] = EXPECTED_VERSION
    real["generation"]["actual_provider_response"] = False
    assert "no_actual_llm_response_evidence" in validate(real, stress, safety, config)
    print("SELF-TEST PASS: accepts complete contract and rejects mixed/fake/provider-fallback evidence")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence-dir", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.evidence_dir:
        parser.error("--evidence-dir is required without --self-test")
    try:
        real = load(args.evidence_dir, "real-provider.json")
        stress = load(args.evidence_dir, "tier-escalation.json")
        safety = load(args.evidence_dir, "safety-rollback.json")
        config = load(args.evidence_dir, "runtime-config.json")
        errors = validate(real, stress, safety, config)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(json.dumps({"status": "BLOCKED", "reason": type(exc).__name__}))
        return 2
    print(json.dumps({"status": "PASS" if not errors else "FAIL", "errors": errors},
                     indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())

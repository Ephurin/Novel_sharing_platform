#!/usr/bin/env python3
"""Offline contract validator for CTX-RD-01 bounded opt-in canary evidence.

No API or database access; validates the submitted evidence claims and rejects
fake/mixed embedding versions, missing provider-call proof, absent stress/pressure data,
or context hash discrepancies between job and preview.
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


def validate(canary: dict, safety: dict, config: dict) -> list[str]:
    errors: list[str] = []

    def require(ok: bool, code: str) -> None:
        if not ok:
            errors.append(code)

    commit = canary.get("tested_commit")
    require(isinstance(commit, str) and bool(re.fullmatch(r"[0-9a-f]{40}", commit)), "invalid_tested_commit")
    require(config.get("tested_commit") == commit, "config_commit_mismatch")
    require(safety.get("tested_commit") == commit, "safety_commit_mismatch")
    require(config.get("canary_environment") == "isolated_demo_staging", "canary_environment_invalid")
    require(config.get("isolated_staging_database") is True, "staging_database_not_isolated")
    require(config.get("pgvector_live") is True, "pgvector_not_live")
    require(config.get("production_default") == "legacy-v1", "default_not_legacy")
    require(config.get("default_changed") is False, "default_changed")
    require(config.get("canary_opt_in_policy") == "balanced-scope-v1", "canary_opt_in_policy_mismatch")
    require(config.get("llm_local_fallback_enabled") is False, "local_llm_fallback_not_disabled")
    require(config.get("p8_05_blocked") is True, "p8_05_not_blocked_in_config")

    emb = canary.get("embedding") or {}
    require(emb.get("provider") == "GeminiEmbeddingProvider", "embedding_provider_not_real")
    require(emb.get("model") == "gemini-embedding-2", "embedding_model_mismatch")
    require(emb.get("version") == EXPECTED_VERSION, "embedding_version_mismatch")
    require(emb.get("dimension") == 768, "embedding_dimension_mismatch")
    require(emb.get("query_l2_normalized") is True, "query_not_l2_normalized")
    require(emb.get("documents_l2_normalized") is True, "documents_not_l2_normalized")
    require(isinstance(emb.get("document_provider_calls"), int) and emb["document_provider_calls"] > 0, "no_real_document_calls")
    require(isinstance(emb.get("query_provider_calls"), int) and emb["query_provider_calls"] > 0, "no_real_query_calls")

    cases = canary.get("cases") or []
    require(isinstance(cases, list) and len(cases) >= 3, "insufficient_canary_cases")

    escalated_found = False
    rq0025_found = False
    normal_found = False

    for idx, c in enumerate(cases):
        prefix = f"case_{idx}_"
        require(isinstance(c, dict), f"{prefix}not_dict")
        name = c.get("name", "")
        if "rq0025" in name or "repeated" in name:
            rq0025_found = True
        if "normal" in name:
            normal_found = True

        origin = c.get("fixture_origin")
        VALID_ORIGINS = {
            "source_inspired_synthetic_aethelgard",
            "source_inspired_synthetic_rq0025",
            "source_grounded_canonical_aethelgard",
            "source_grounded_canonical_rq0025",
            "production_shaped_deterministic_pressure",
            "real_novel_aethelgard",
            "real_novel_aethelgard_rq0025",
        }
        require(
            origin in VALID_ORIGINS,
            f"{prefix}unlabeled_origin",
        )

        tier = c.get("selected_tier")
        require(tier in TIERS, f"{prefix}invalid_tier")
        if tier in TIERS[1:]:
            escalated_found = True

        require(c.get("routing_status") == "routed", f"{prefix}routing_not_routed")
        require(c.get("routing_version") == "balanced-scope-v1", f"{prefix}routing_version_mismatch")

        for lane in ("semantic", "recent", "rules"):
            orig = c.get(f"{lane}_input_ids")
            kept = c.get(f"{lane}_retained_ids")
            require(isinstance(orig, list) and isinstance(kept, list) and orig == kept, f"{prefix}{lane}_ids_not_preserved")

        require(c.get("dropped_artifacts") == 0, f"{prefix}dropped_artifacts_nonzero")
        require(c.get("protected_overflow") is False, f"{prefix}protected_overflow_true")

        job_hash = c.get("job_context_hash")
        preview_hash = c.get("preview_context_hash")
        require(isinstance(job_hash, str) and bool(re.fullmatch(r"[0-9a-f]{64}", job_hash)), f"{prefix}invalid_job_hash")
        require(job_hash == preview_hash, f"{prefix}context_hash_mismatch")
        require(c.get("context_hash_match") is True, f"{prefix}context_hash_match_not_true")

        gen = c.get("generation") or {}
        require(gen.get("provider") == "gemini", f"{prefix}generation_provider_not_gemini")
        require(isinstance(gen.get("requested_model"), str) and bool(gen["requested_model"]), f"{prefix}requested_model_missing")
        require(isinstance(gen.get("effective_model"), str) and bool(gen["effective_model"]), f"{prefix}effective_model_missing")
        require(gen.get("actual_provider_response") is True, f"{prefix}no_actual_provider_response")
        require(gen.get("status") == "completed", f"{prefix}generation_not_completed")
        require(gen.get("nonempty_output") is True, f"{prefix}generation_output_empty")
        require(isinstance(gen.get("model_attempts"), list) and len(gen["model_attempts"]) > 0, f"{prefix}no_model_attempts")

    require(normal_found, "normal_scene_case_missing")
    require(rq0025_found, "rq0025_archetype_case_missing")
    require(escalated_found, "no_pressured_tier_escalation_case")

    for name in ("future_participant_leakage", "superseded_participant_leakage", "cross_tenant_leakage"):
        require(safety.get(name) == 0, name)
    for name in ("semantic_failure_legacy_fallback", "over_24k_fails_closed", "rollback_to_legacy"):
        require(safety.get(name) is True, name)
    require(safety.get("p8_05_blocked") is True, "p8_05_gate_changed")

    return errors


def build_valid_fixture(commit: str = "a" * 40) -> tuple[dict, dict, dict]:
    cfg = {
        "tested_commit": commit,
        "canary_environment": "isolated_demo_staging",
        "isolated_staging_database": True,
        "pgvector_live": True,
        "production_default": "legacy-v1",
        "default_changed": False,
        "canary_opt_in_policy": "balanced-scope-v1",
        "llm_local_fallback_enabled": False,
        "p8_05_blocked": True,
    }
    cases = [
        {
            "name": "normal_scene_ch35",
            "fixture_origin": "source_inspired_synthetic_aethelgard",
            "selected_tier": 12000,
            "routing_status": "routed",
            "routing_version": "balanced-scope-v1",
            "semantic_input_ids": ["s1", "s2"],
            "semantic_retained_ids": ["s1", "s2"],
            "recent_input_ids": ["e1", "e2"],
            "recent_retained_ids": ["e1", "e2"],
            "rules_input_ids": ["r1"],
            "rules_retained_ids": ["r1"],
            "dropped_artifacts": 0,
            "protected_overflow": False,
            "job_context_hash": "f" * 64,
            "preview_context_hash": "f" * 64,
            "context_hash_match": True,
            "generation": {
                "provider": "gemini",
                "requested_model": "gemini-3.8-flash",
                "effective_model": "models/gemini-3.8-flash",
                "actual_provider_response": True,
                "status": "completed",
                "nonempty_output": True,
                "model_attempts": [{"model": "models/gemini-3.8-flash", "status": "success", "call_index": 1}],
            },
        },
        {
            "name": "repeated_history_rq0025_ch49",
            "fixture_origin": "source_inspired_synthetic_rq0025",
            "selected_tier": 12000,
            "routing_status": "routed",
            "routing_version": "balanced-scope-v1",
            "semantic_input_ids": ["s1", "s2", "s3"],
            "semantic_retained_ids": ["s1", "s2", "s3"],
            "recent_input_ids": ["e1", "e2"],
            "recent_retained_ids": ["e1", "e2"],
            "rules_input_ids": ["r1"],
            "rules_retained_ids": ["r1"],
            "dropped_artifacts": 0,
            "protected_overflow": False,
            "job_context_hash": "e" * 64,
            "preview_context_hash": "e" * 64,
            "context_hash_match": True,
            "generation": {
                "provider": "gemini",
                "requested_model": "gemini-3.8-flash",
                "effective_model": "models/gemini-3.8-flash",
                "actual_provider_response": True,
                "status": "completed",
                "nonempty_output": True,
                "model_attempts": [{"model": "models/gemini-3.8-flash", "status": "success", "call_index": 1}],
            },
        },
        {
            "name": "pressured_context_tier_escalation",
            "fixture_origin": "production_shaped_deterministic_pressure",
            "selected_tier": 20000,
            "routing_status": "routed",
            "routing_version": "balanced-scope-v1",
            "semantic_input_ids": ["s1"],
            "semantic_retained_ids": ["s1"],
            "recent_input_ids": ["e1"],
            "recent_retained_ids": ["e1"],
            "rules_input_ids": ["r1"],
            "rules_retained_ids": ["r1"],
            "dropped_artifacts": 0,
            "protected_overflow": False,
            "job_context_hash": "d" * 64,
            "preview_context_hash": "d" * 64,
            "context_hash_match": True,
            "generation": {
                "provider": "gemini",
                "requested_model": "gemini-3.8-flash",
                "effective_model": "models/gemini-3.8-flash",
                "actual_provider_response": True,
                "status": "completed",
                "nonempty_output": True,
                "model_attempts": [{"model": "models/gemini-3.8-flash", "status": "success", "call_index": 1}],
            },
        },
    ]
    canary = {
        "tested_commit": commit,
        "embedding": {
            "provider": "GeminiEmbeddingProvider",
            "model": "gemini-embedding-2",
            "version": EXPECTED_VERSION,
            "dimension": 768,
            "query_l2_normalized": True,
            "documents_l2_normalized": True,
            "document_provider_calls": 3,
            "query_provider_calls": 3,
        },
        "cases": cases,
    }
    safety = {
        "tested_commit": commit,
        "future_participant_leakage": 0,
        "superseded_participant_leakage": 0,
        "cross_tenant_leakage": 0,
        "semantic_failure_legacy_fallback": True,
        "over_24k_fails_closed": True,
        "rollback_to_legacy": True,
        "p8_05_blocked": True,
    }
    return canary, safety, cfg


def self_test() -> None:
    canary, safety, cfg = build_valid_fixture()
    clean_errors = validate(canary, safety, cfg)
    assert not clean_errors, f"Self-test failed on clean fixture: {clean_errors}"

    # Mutate commit
    canary_mut = dict(canary)
    canary_mut["tested_commit"] = "bad"
    assert "invalid_tested_commit" in validate(canary_mut, safety, cfg)

    # Mutate hash mismatch
    canary_mut = json.loads(json.dumps(canary))
    canary_mut["cases"][0]["job_context_hash"] = "0" * 64
    assert any("context_hash_mismatch" in e for e in validate(canary_mut, safety, cfg))

    # Mutate missing escalation
    canary_mut = json.loads(json.dumps(canary))
    canary_mut["cases"][2]["selected_tier"] = 12000
    assert "no_pressured_tier_escalation_case" in validate(canary_mut, safety, cfg)

    # Mutate leakage
    safety_mut = dict(safety)
    safety_mut["future_participant_leakage"] = 1
    assert "future_participant_leakage" in validate(canary, safety_mut, cfg)

    print("SELF-TEST PASS: accepts complete canary contract and rejects invalid/leaking/corrupted evidence")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--evidence-dir", type=Path)
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    if not args.evidence_dir:
        parser.error("Must supply --self-test or --evidence-dir")

    dir_path = args.evidence_dir
    files = {
        "canary": dir_path / "canary-generation.json",
        "safety": dir_path / "safety-rollback.json",
        "config": dir_path / "runtime-config.json",
    }
    for name, p in files.items():
        if not p.exists():
            print(json.dumps({"status": "FAIL", "errors": [f"missing_{name}_file", str(p)]}, indent=2))
            return 2

    canary = json.loads(files["canary"].read_text(encoding="utf-8"))
    safety = json.loads(files["safety"].read_text(encoding="utf-8"))
    config = json.loads(files["config"].read_text(encoding="utf-8"))

    errors = validate(canary, safety, config)
    result = {
        "status": "FAIL" if errors else "PASS",
        "errors": errors,
    }
    print(json.dumps(result, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

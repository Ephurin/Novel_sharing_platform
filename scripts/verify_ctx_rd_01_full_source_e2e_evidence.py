#!/usr/bin/env python3
"""Validate CTX-RD-01 mixed-provenance live-provider evidence without API/DB access.

The validator checks manifest consistency; it cannot independently attest HTTP
requests or source-fact correctness. It rejects fake/dry-run PASS claims.
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
    require(evidence.get("methodology") == "real_provider_pgvector_semantic_with_fixture_structured_context",
            "methodology_overclaims_or_invalid")
    require(evidence.get("structured_context_source") == "eval01g_fixture_via_repo_adapter",
            "structured_context_provenance_missing")
    require(evidence.get("source_grounded_live_vector_query") == "DEMONSTRATED", "live_vector_query_not_demonstrated")
    require(evidence.get("canary_gate_verdict") == "MIXED_PROVENANCE_PROVIDER_PATH_OBSERVED",
            "gate_verdict_overclaims")
    require(evidence.get("pgvector_live") is True, "pgvector_not_live")
    require(evidence.get("production_default") == "legacy-v1" and evidence.get("default_changed") is False,
            "production_default_changed")
    require(evidence.get("p8_05_blocked") is True, "p8_05_unblocked")

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
        require({c.get("query_id") for c in cases if isinstance(c, dict)} >= expected_cases,
                "missing_canonical_cases")
        for i, case in enumerate(cases):
            prefix = f"case_{i}_"
            if not isinstance(case, dict):
                errors.append(prefix + "not_object")
                continue
            require(case.get("routing_status") == "routed"
                    and case.get("routing_version") == "balanced-scope-v1", prefix + "routing_invalid")
            require(case.get("selected_tier") in (12000, 16000, 20000, 24000), prefix + "tier_invalid")
            raw = case.get("retrieved_semantic_ids")
            retained = case.get("semantic_retained_ids")
            require(isinstance(raw, list) and bool(raw) and raw == retained
                    and case.get("raw_to_packed_semantic_ids_match") is True,
                    prefix + "raw_vs_packed_semantic_mismatch")
            for lane in ("recent",):
                before, after = case.get(lane + "_input_ids"), case.get(lane + "_retained_ids")
                require(isinstance(before, list) and before == after, prefix + lane + "_not_retained")
            before, after = case.get("rules_input_ids"), case.get("rules_retained_ids")
            require(isinstance(before, list) and isinstance(after, list)
                    and sorted(before) == sorted(after), prefix + "rules_not_retained")
            require(case.get("dropped_artifacts") == 0
                    and case.get("protected_overflow") is False, prefix + "loss_or_overflow")
            h = case.get("job_context_hash")
            require(isinstance(h, str) and bool(re.fullmatch(r"[0-9a-f]{64}", h))
                    and h == case.get("preview_context_hash")
                    and case.get("context_hash_match") is True, prefix + "hash_mismatch")
            gen = case.get("generation") or {}
            require(gen.get("provider") == "gemini"
                    and gen.get("actual_provider_response") is True
                    and gen.get("status") == "completed"
                    and gen.get("nonempty_output") is True, prefix + "generation_not_real_and_complete")
            rows = gen.get("model_attempts")
            require(isinstance(rows, list) and any(isinstance(a, dict) and a.get("status") == "success"
                                                   for a in rows), prefix + "no_successful_model_attempt")
            if isinstance(rows, list):
                attempts.extend(a for a in rows if isinstance(a, dict))
    summary = evidence.get("summary") or {}
    require(summary.get("total_cases_run") == (len(cases) if isinstance(cases, list) else None),
            "summary_case_count_mismatch")
    require(summary.get("total_model_attempts") == len(attempts)
            and summary.get("successful_model_attempts") == sum(a.get("status") == "success" for a in attempts)
            and summary.get("failed_model_attempts") == sum(a.get("status") != "success" for a in attempts),
            "summary_model_attempts_mismatch")
    return errors


def self_test() -> None:
    case = {
        "query_id": "core_gold:rq-0011", "routing_status": "routed",
        "routing_version": "balanced-scope-v1", "selected_tier": 12000,
        "retrieved_semantic_ids": ["s1"], "semantic_retained_ids": ["s1"],
        "raw_to_packed_semantic_ids_match": True,
        "recent_input_ids": ["r1"], "recent_retained_ids": ["r1"],
        "rules_input_ids": ["w1", "w2"], "rules_retained_ids": ["w2", "w1"],
        "dropped_artifacts": 0, "protected_overflow": False,
        "job_context_hash": "a" * 64, "preview_context_hash": "a" * 64,
        "context_hash_match": True,
        "generation": {
            "provider": "gemini", "actual_provider_response": True,
            "status": "completed", "nonempty_output": True,
            "model_attempts": [{"status": "success"}],
        },
    }
    other = {**case, "query_id": "challenge:rq-0025"}
    ev = {
        "tested_commit": "b" * 40, "mode": "live",
        "methodology": "real_provider_pgvector_semantic_with_fixture_structured_context",
        "structured_context_source": "eval01g_fixture_via_repo_adapter",
        "source_grounded_live_vector_query": "DEMONSTRATED",
        "canary_gate_verdict": "MIXED_PROVENANCE_PROVIDER_PATH_OBSERVED",
        "pgvector_live": True, "production_default": "legacy-v1",
        "default_changed": False, "p8_05_blocked": True,
        "embedding": {"provider": "GeminiEmbeddingProvider", "version": EXPECTED_VERSION,
                      "dimension": 768, "l2_normalized": True,
                      "document_calls": 11, "query_calls": 6},
        "cases": [case, other],
        "summary": {"total_cases_run": 2, "total_model_attempts": 2,
                    "successful_model_attempts": 2, "failed_model_attempts": 0},
    }
    assert not validate(ev), validate(ev)
    assert "dry_run_or_unspecified_mode" in validate({**ev, "mode": "offline_fake"})
    assert "gate_verdict_overclaims" in validate({**ev, "canary_gate_verdict": "FULL_SOURCE_E2E_DEMONSTRATED"})
    assert "document_calls_not_positive" in validate({**ev, "embedding": {**ev["embedding"], "document_calls": 0}})
    broken = {**ev, "cases": [{**case, "semantic_retained_ids": ["other"]}, other]}
    assert "case_0_raw_vs_packed_semantic_mismatch" in validate(broken)
    print("SELF-TEST PASS: fake/overclaimed/zero-provider/mismatched semantic evidence rejected")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--evidence", type=Path)
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.evidence:
        parser.error("--evidence is required")
    try:
        ev = json.loads(args.evidence.read_text(encoding="utf-8"))
        if not isinstance(ev, dict):
            raise ValueError("Evidence root must be an object")
        errors = validate(ev)
    except (OSError, ValueError, TypeError) as exc:
        print(json.dumps({"status": "BLOCKED", "reason": type(exc).__name__}))
        return 2
    print(json.dumps({"status": "PASS" if not errors else "FAIL", "errors": errors}, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())

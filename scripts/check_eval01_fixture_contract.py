#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNNER = ROOT / "scripts" / "run_eval_01.py"


def load(path: str) -> dict:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def main() -> int:
    all_queries = load(".data/Frozen_v1/retrieval_queries.json")
    vi = load(".data/Frozen_v1/vietnamese_diagnostic_queries.json")
    canonical = load(".data/Frozen_v1/memory_chunks_canonical.json")
    audit = load(".data/Frozen_v1/memory_chunks.json")

    queries = all_queries["queries"]
    core = [q for q in queries if q.get("split") == "core_gold"]
    challenge = [q for q in queries if q.get("split") == "challenge"]
    vi_queries = vi["queries"]

    failures: list[str] = []

    expected = {
        "all_queries": (len(queries), 40),
        "core_gold": (len(core), 21),
        "challenge": (len(challenge), 19),
        "vietnamese": (len(vi_queries), 10),
        "canonical_memories": (len(canonical["memories"]), 216),
        "audit_memories": (len(audit["memories"]), 232),
    }
    for label, (actual, wanted) in expected.items():
        if actual != wanted:
            failures.append(f"{label}: expected {wanted}, got {actual}")

    canonical_ids = {m["memory_id"] for m in canonical["memories"]}
    audit_ids = {m["memory_id"] for m in audit["memories"]}

    for query in core:
        missing = [
            mid
            for mid in query.get("positive_memory_ids", [])
            if mid not in canonical_ids
        ]
        if missing:
            failures.append(
                f"core {query['query_id']} positives missing from canonical corpus: {missing}"
            )

    for query in challenge:
        missing = [
            mid
            for mid in query.get("positive_memory_ids", [])
            if mid not in audit_ids
        ]
        if missing:
            failures.append(
                f"challenge {query['query_id']} positives missing from audit corpus: {missing}"
            )

    source = RUNNER.read_text(encoding="utf-8")
    forbidden_fragments = {
        'int(item["query_id"].replace("rq-", "")) <= 21':
            "numeric query-id grouping",
        '"canonical_factual_consistency": 5':
            "hard-coded generation quality score",
        '"context_adherence": 5':
            "hard-coded generation quality score",
        '"protected_artifacts_truncated": 0':
            "hard-coded protected-artifact result",
    }
    for fragment, reason in forbidden_fragments.items():
        if fragment in source:
            failures.append(f"{reason} still present: {fragment}")

    required_fragments = [
        'q.get("split") == "core_gold"',
        'q.get("split") == "challenge"',
        '"vietnamese_diagnostic"',
        'CHALLENGE_STORY_ID',
        'EventParticipantRecord(',
        '"REVIEW_REQUIRED"',
        '"not_scored"',
        '"protected_artifact_truncation": "not_measured"',
        '"prohibited_memory_violations_count"',
        '"gold_label_grade_-1_prohibited_future_or_invalid"',
        '"audit_232"',
        '"canonical_216"',
    ]
    for fragment in required_fragments:
        if fragment not in source:
            failures.append(f"required corrected-harness fragment missing: {fragment}")

    # Duplicate source query IDs are expected between core and VI diagnostics.
    # They must remain distinguishable by split-qualified case_id.
    overlap = {q["query_id"] for q in core} & {q["query_id"] for q in vi_queries}
    if not overlap:
        failures.append("expected core/VI duplicate source query IDs were not found")
    core_case_ids = {f"core_gold:{q['query_id']}" for q in core}
    vi_case_ids = {f"vietnamese_diagnostic:{q['query_id']}" for q in vi_queries}
    if core_case_ids & vi_case_ids:
        failures.append("split-qualified case IDs are not unique")

    result = {
        "status": "PASS" if not failures else "FAIL",
        "dataset_version": all_queries.get("dataset_version"),
        "counts": {k: actual for k, (actual, _) in expected.items()},
        "core_vi_source_id_overlap_count": len(overlap),
        "failures": failures,
    }
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())

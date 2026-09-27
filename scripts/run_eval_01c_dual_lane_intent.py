#!/usr/bin/env python3
"""EVAL-01C dual-lane provenance + temporal-intent diagnostic.

Offline-only. This script reuses corrected EVAL-01 retrieval candidates and
frozen labels. It does not call an LLM/embedding provider and does not modify
production retrieval, weights, schema, or corpus labels.

It compares:
1. current hybrid-v1 scoring;
2. first-occurrence intent with temporal recency neutralized;
3. first-occurrence intent with an inverse-recency diagnostic.

It also simulates a non-destructive provenance lane annotation to quantify
coverage and token overhead without suppressing any memory.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RETRIEVAL = (
    ROOT / "docs" / "development"
    / "EVAL-01-AETHELGARD-RUNTIME-BASELINE" / "retrieval-raw.json"
)
DEFAULT_OUTPUT_DIR = (
    ROOT / "docs" / "development"
    / "EVAL-01C-DUAL-LANE-TEMPORAL-INTENT"
)

WEIGHTS = {
    "semantic": 0.75,
    "entity_overlap": 0.03,
    "temporal": 0.08,
    "importance": 0.10,
    "relationship": 0.04,
}
HALF_LIFE = 12.0
EPS = 1e-12

VARIANT_TAGS = {
    "narrative_echo",
    "temporal_reset",
    "do_not_use_as_clean_ground_truth",
    "narrative_conflict",
    "attributed_claim",
    "source_conflict",
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def clamp(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def detect_intent(query: dict[str, Any]) -> str:
    query_type = str(query.get("query_type") or "")
    if query_type in {"temporal_supersession", "temporal_replay_hard_negative"}:
        return "first_occurrence"
    if "lifecycle" in query_type or "history_temporal" in query_type:
        return "lifecycle_history"
    if "ambiguity" in query_type or "contradiction" in query_type:
        return "contradiction"
    if query_type.startswith("future_leakage"):
        return "future_cutoff"
    return "generic"


def evidence_lane(memory: dict[str, Any]) -> str:
    tags = {str(tag) for tag in memory.get("tags", [])}
    review_status = str(memory.get("review_status") or "")
    status = str(memory.get("status") or "")
    if (
        status != "canonical"
        or review_status not in {"", "high_confidence"}
        or bool(tags & VARIANT_TAGS)
        or any("conflict" in tag for tag in tags)
    ):
        return "provenance_variant"
    return "primary_evidence"


def current_temporal_score(cutoff: int, chapter: int) -> float:
    age = max(0, int(cutoff) - int(chapter))
    return clamp(1.0 / (1.0 + (age / HALF_LIFE)))


def policy_temporal_score(
    *,
    policy: str,
    intent: str,
    cutoff: int,
    chapter: int,
) -> float:
    base = current_temporal_score(cutoff, chapter)
    if intent != "first_occurrence":
        return base
    if policy == "baseline":
        return base
    if policy == "neutral_first_occurrence":
        return 0.0
    if policy == "inverse_first_occurrence":
        return clamp(1.0 - base)
    raise ValueError(f"unknown policy: {policy}")


def score_candidates(
    row: dict[str, Any],
    *,
    query: dict[str, Any],
    memory_by_id: dict[str, dict[str, Any]],
    policy: str,
) -> list[dict[str, Any]]:
    signals = {
        str(item["memory_id"]): item
        for item in row.get("hybrid_top20", [])
    }
    intent = detect_intent(query)
    scored: list[dict[str, Any]] = []

    for semantic_rank, item in enumerate(row.get("semantic_top20", []), start=1):
        memory_id = str(item["memory_id"])
        memory = memory_by_id[memory_id]
        signal = signals.get(memory_id, {})
        semantic_score = clamp(1.0 / math.log2(float(semantic_rank) + 1.0))
        entity_overlap = clamp(float(signal.get("entity_overlap_score", 0.0)))
        relationship = clamp(float(signal.get("relationship_score", 0.0)))
        importance = clamp(float(memory.get("importance", 0.5)))
        temporal = policy_temporal_score(
            policy=policy,
            intent=intent,
            cutoff=int(query["chapter_cutoff"]),
            chapter=int(memory["chapter_number"]),
        )
        hybrid = clamp(
            WEIGHTS["semantic"] * semantic_score
            + WEIGHTS["entity_overlap"] * entity_overlap
            + WEIGHTS["temporal"] * temporal
            + WEIGHTS["importance"] * importance
            + WEIGHTS["relationship"] * relationship
        )
        scored.append(
            {
                "memory_id": memory_id,
                "semantic_rank": semantic_rank,
                "chapter_number": int(memory["chapter_number"]),
                "semantic_score": semantic_score,
                "entity_overlap_score": entity_overlap,
                "temporal_score": temporal,
                "importance_score": importance,
                "relationship_score": relationship,
                "hybrid_score": hybrid,
                "evidence_lane": evidence_lane(memory),
            }
        )

    scored.sort(
        key=lambda item: (
            -float(item["hybrid_score"]),
            int(item["semantic_rank"]),
            str(item["memory_id"]),
        )
    )
    for rank, item in enumerate(scored, start=1):
        item["rank"] = rank
    return scored


def query_metrics(
    query: dict[str, Any],
    ranked_ids: list[str],
    *,
    k: int = 10,
) -> dict[str, float]:
    labels = {
        str(item["memory_id"]): int(item["grade"])
        for item in query.get("labels", [])
    }
    positives = {memory_id for memory_id, grade in labels.items() if grade > 0}
    top = ranked_ids[:k]

    recall = (
        len([memory_id for memory_id in top if memory_id in positives]) / len(positives)
        if positives
        else 0.0
    )

    reciprocal_rank = 0.0
    for rank, memory_id in enumerate(top, start=1):
        if labels.get(memory_id, 0) > 0:
            reciprocal_rank = 1.0 / rank
            break

    def gain(grade: int) -> float:
        return float((2 ** max(0, grade)) - 1)

    dcg = sum(
        gain(labels.get(memory_id, 0)) / math.log2(rank + 1.0)
        for rank, memory_id in enumerate(top, start=1)
    )
    ideal_grades = sorted(
        (grade for grade in labels.values() if grade > 0),
        reverse=True,
    )[:k]
    idcg = sum(
        gain(grade) / math.log2(rank + 1.0)
        for rank, grade in enumerate(ideal_grades, start=1)
    )
    ndcg = dcg / idcg if idcg else 0.0
    return {
        "recall_at_10": recall,
        "mrr_at_10": reciprocal_rank,
        "ndcg_at_10": ndcg,
    }


def aggregate(per_query: list[dict[str, Any]]) -> dict[str, float]:
    if not per_query:
        return {
            "query_count": 0,
            "recall_at_10": 0.0,
            "mrr_at_10": 0.0,
            "ndcg_at_10": 0.0,
        }
    return {
        "query_count": len(per_query),
        "recall_at_10": statistics.fmean(
            item["metrics"]["recall_at_10"] for item in per_query
        ),
        "mrr_at_10": statistics.fmean(
            item["metrics"]["mrr_at_10"] for item in per_query
        ),
        "ndcg_at_10": statistics.fmean(
            item["metrics"]["ndcg_at_10"] for item in per_query
        ),
    }


def pairwise_failure(
    query: dict[str, Any],
    ranked: list[dict[str, Any]],
    memory_by_id: dict[str, dict[str, Any]],
) -> dict[str, Any] | None:
    cutoff = int(query["chapter_cutoff"])
    positive_ids = {
        str(item["memory_id"])
        for item in query.get("labels", [])
        if int(item.get("grade", 0)) > 0
    }
    same_or_past_prohibited = {
        str(item["memory_id"])
        for item in query.get("labels", [])
        if int(item.get("grade", 0)) < 0
        and str(item["memory_id"]) in memory_by_id
        and int(memory_by_id[str(item["memory_id"])]["chapter_number"]) <= cutoff
    }
    if not same_or_past_prohibited:
        return None

    ranks = {str(item["memory_id"]): int(item["rank"]) for item in ranked}
    positive_ranks = sorted(ranks[mid] for mid in positive_ids if mid in ranks)
    prohibited_ranks = sorted(
        ranks[mid] for mid in same_or_past_prohibited if mid in ranks
    )
    best_positive = positive_ranks[0] if positive_ranks else None
    best_prohibited = prohibited_ranks[0] if prohibited_ranks else None
    failed = (
        best_positive is not None
        and best_prohibited is not None
        and best_prohibited < best_positive
    )
    return {
        "failed": failed,
        "best_positive_rank": best_positive,
        "best_prohibited_rank": best_prohibited,
    }


def token_estimate(payload: Any) -> int:
    data = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return max(1, math.ceil(len(data) / 3))


def lane_payload(memory: dict[str, Any], *, annotated: bool) -> dict[str, Any]:
    payload = {
        "memory_chunk_id": memory["memory_id"],
        "chapter_number": int(memory["chapter_number"]),
        "content": memory["content"],
        "importance_score": float(memory.get("importance", 0.5)),
        "source_key": f"corpus:{memory['memory_id']}",
    }
    if annotated:
        payload.update(
            {
                "evidence_lane": evidence_lane(memory),
                "source_status": memory.get("status"),
                "review_status": memory.get("review_status"),
                "tags": list(memory.get("tags", [])),
            }
        )
    return payload


def render_summary(result: dict[str, Any]) -> str:
    policies = result["policies"]
    lines = [
        "# EVAL-01C Dual-Lane Context & Intent-Conditioned Ranking",
        "",
        f"- Dataset: `{result['dataset_version']}`",
        "- Mode: offline simulation over preserved EVAL-01 runtime candidates",
        "- Production changes: none",
        "",
        "## Ranking policies",
        "",
        "| Policy | Core R@10 | Core MRR@10 | Core nDCG@10 | Challenge R@10 | Challenge nDCG@10 | Pairwise failures |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for name in (
        "baseline",
        "neutral_first_occurrence",
        "inverse_first_occurrence",
    ):
        item = policies[name]
        lines.append(
            f"| {name} | "
            f"{item['splits']['core_gold']['recall_at_10']:.6f} | "
            f"{item['splits']['core_gold']['mrr_at_10']:.6f} | "
            f"{item['splits']['core_gold']['ndcg_at_10']:.6f} | "
            f"{item['splits']['challenge']['recall_at_10']:.6f} | "
            f"{item['splits']['challenge']['ndcg_at_10']:.6f} | "
            f"{item['pairwise_failure_count']} |"
        )

    lines.extend(
        [
            "",
            "## First-occurrence cases",
            "",
        ]
    )
    for case in result["first_occurrence_cases"]:
        lines.append(f"### {case['case_id']}")
        lines.append("")
        lines.append(
            f"- baseline: positive #{case['policies']['baseline']['best_positive_rank']}, "
            f"replay #{case['policies']['baseline']['best_prohibited_rank']}"
        )
        lines.append(
            f"- neutral temporal: positive #{case['policies']['neutral_first_occurrence']['best_positive_rank']}, "
            f"replay #{case['policies']['neutral_first_occurrence']['best_prohibited_rank']}"
        )
        lines.append(
            f"- inverse recency: positive #{case['policies']['inverse_first_occurrence']['best_positive_rank']}, "
            f"replay #{case['policies']['inverse_first_occurrence']['best_prohibited_rank']}"
        )
        lines.append("")

    lane = result["dual_lane"]
    lines.extend(
        [
            "## Dual-lane provenance simulation",
            "",
            f"- Top-10 memories inspected: **{lane['top10_memory_count']}**",
            f"- Variant-lane memories: **{lane['variant_lane_count']}**",
            f"- Positive memories in variant lane: **{lane['positive_variant_count']}**",
            f"- Same/past grade -1 hits in variant lane: **{lane['same_or_past_prohibited_variant_count']}**",
            f"- Same/past grade -1 hits left in primary lane: **{lane['same_or_past_prohibited_primary_count']}**",
            f"- Queries whose best positive is in variant lane: **{lane['queries_with_best_positive_in_variant']}**",
            f"- Mean annotation overhead: **{lane['mean_annotation_token_overhead']:.2f} estimated tokens/query**",
            "",
            "Dual-lane is evaluated as annotation/segregation, not as global suppression. "
            "A positive memory may legitimately live in the variant lane.",
            "",
            "## Guardrails",
            "",
            "- No frozen labels were changed.",
            "- No accepted hybrid weights were changed in production.",
            "- No embedding/provider calls were made.",
            "- No production retrieval/schema/context code was changed.",
            "",
            "Interpret policy results as diagnostic evidence only. Astra/Supervisor must decide whether any implementation slice is justified.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--retrieval", type=Path, default=DEFAULT_RETRIEVAL)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--stdout-only", action="store_true")
    args = parser.parse_args()

    retrieval = load_json(args.retrieval)
    frozen = load_json(ROOT / ".data" / "Frozen_v1" / "retrieval_queries.json")
    canonical = load_json(
        ROOT / ".data" / "Frozen_v1" / "memory_chunks_canonical.json"
    )["memories"]
    audit = load_json(
        ROOT / ".data" / "Frozen_v1" / "memory_chunks.json"
    )["memories"]

    query_map = {
        (str(query["split"]), str(query["query_id"])): query
        for query in frozen["queries"]
    }
    canonical_map = {str(memory["memory_id"]): memory for memory in canonical}
    audit_map = {str(memory["memory_id"]): memory for memory in audit}

    policies = {
        "baseline": {"per_query": []},
        "neutral_first_occurrence": {"per_query": []},
        "inverse_first_occurrence": {"per_query": []},
    }
    first_occurrence_cases: list[dict[str, Any]] = []

    baseline_raw_order_mismatch_count = 0

    lane_top10_count = 0
    lane_variant_count = 0
    positive_variant_count = 0
    same_past_prohibited_variant_count = 0
    same_past_prohibited_primary_count = 0
    queries_best_positive_variant = 0
    annotation_overheads: list[int] = []
    lane_cases: list[dict[str, Any]] = []

    for row in retrieval:
        split = str(row["split"])
        if split == "vietnamese_diagnostic":
            continue
        query = query_map.get((split, str(row["query_id"])))
        if query is None:
            continue

        memory_by_id = (
            audit_map if row.get("corpus") == "audit_232" else canonical_map
        )
        intent = detect_intent(query)
        policy_rankings: dict[str, list[dict[str, Any]]] = {}

        for policy_name in policies:
            ranked = score_candidates(
                row,
                query=query,
                memory_by_id=memory_by_id,
                policy=policy_name,
            )
            policy_rankings[policy_name] = ranked
            metrics = query_metrics(
                query,
                [str(item["memory_id"]) for item in ranked],
            )
            failure = pairwise_failure(query, ranked, memory_by_id)
            policies[policy_name]["per_query"].append(
                {
                    "case_id": row["case_id"],
                    "split": split,
                    "query_id": row["query_id"],
                    "query_type": query.get("query_type"),
                    "intent": intent,
                    "metrics": metrics,
                    "pairwise": failure,
                }
            )

        raw_hybrid_ids = [
            str(item["memory_id"]) for item in row.get("hybrid_top20", [])
        ]
        recomputed_baseline_ids = [
            str(item["memory_id"])
            for item in policy_rankings["baseline"]
        ]
        if raw_hybrid_ids != recomputed_baseline_ids:
            baseline_raw_order_mismatch_count += 1

        if intent == "first_occurrence":
            case = {
                "case_id": row["case_id"],
                "query": query["query"],
                "query_type": query.get("query_type"),
                "policies": {},
            }
            for policy_name, ranked in policy_rankings.items():
                pair = pairwise_failure(query, ranked, memory_by_id) or {
                    "failed": False,
                    "best_positive_rank": None,
                    "best_prohibited_rank": None,
                }
                case["policies"][policy_name] = pair
            first_occurrence_cases.append(case)

        baseline_top10 = policy_rankings["baseline"][:10]
        positive_ids = {
            str(item["memory_id"])
            for item in query.get("labels", [])
            if int(item.get("grade", 0)) > 0
        }
        same_past_prohibited_ids = {
            str(item["memory_id"])
            for item in query.get("labels", [])
            if int(item.get("grade", 0)) < 0
            and str(item["memory_id"]) in memory_by_id
            and int(memory_by_id[str(item["memory_id"])]["chapter_number"])
            <= int(query["chapter_cutoff"])
        }

        base_payload = []
        annotated_payload = []
        lane_rows = []
        for ranked_item in baseline_top10:
            memory_id = str(ranked_item["memory_id"])
            memory = memory_by_id[memory_id]
            lane = evidence_lane(memory)
            lane_top10_count += 1
            if lane == "provenance_variant":
                lane_variant_count += 1
                if memory_id in positive_ids:
                    positive_variant_count += 1
                if memory_id in same_past_prohibited_ids:
                    same_past_prohibited_variant_count += 1
            elif memory_id in same_past_prohibited_ids:
                same_past_prohibited_primary_count += 1

            base_payload.append(lane_payload(memory, annotated=False))
            annotated_payload.append(lane_payload(memory, annotated=True))
            lane_rows.append(
                {
                    "rank": int(ranked_item["rank"]),
                    "memory_id": memory_id,
                    "lane": lane,
                    "is_positive": memory_id in positive_ids,
                    "is_same_or_past_grade_minus_one": (
                        memory_id in same_past_prohibited_ids
                    ),
                    "review_status": memory.get("review_status"),
                    "status": memory.get("status"),
                    "tags": list(memory.get("tags", [])),
                }
            )

        positive_top10 = [
            item for item in lane_rows if item["is_positive"]
        ]
        if positive_top10 and positive_top10[0]["lane"] == "provenance_variant":
            queries_best_positive_variant += 1

        overhead = token_estimate(annotated_payload) - token_estimate(base_payload)
        annotation_overheads.append(overhead)
        lane_cases.append(
            {
                "case_id": row["case_id"],
                "intent": intent,
                "annotation_token_overhead": overhead,
                "items": lane_rows,
            }
        )

    for policy_name, item in policies.items():
        per_query = item["per_query"]
        item["splits"] = {
            split: aggregate(
                [row for row in per_query if row["split"] == split]
            )
            for split in ("core_gold", "challenge")
        }
        item["first_occurrence"] = aggregate(
            [row for row in per_query if row["intent"] == "first_occurrence"]
        )
        item["pairwise_failure_count"] = sum(
            1
            for row in per_query
            if row["pairwise"] is not None and row["pairwise"]["failed"]
        )

    baseline_by_case = {
        row["case_id"]: row for row in policies["baseline"]["per_query"]
    }
    for policy_name in (
        "neutral_first_occurrence",
        "inverse_first_occurrence",
    ):
        improved = regressed = unchanged = 0
        non_target_changed = 0
        for row in policies[policy_name]["per_query"]:
            base = baseline_by_case[row["case_id"]]
            delta = (
                row["metrics"]["ndcg_at_10"]
                - base["metrics"]["ndcg_at_10"]
            )
            if delta > EPS:
                improved += 1
            elif delta < -EPS:
                regressed += 1
            else:
                unchanged += 1
            if row["intent"] != "first_occurrence" and abs(delta) > EPS:
                non_target_changed += 1
        policies[policy_name]["ndcg_query_changes"] = {
            "improved": improved,
            "regressed": regressed,
            "unchanged": unchanged,
            "non_target_changed": non_target_changed,
        }

    result = {
        "experiment_id": "EVAL-01C",
        "name": "Dual-Lane Context & Intent-Conditioned Ranking Diagnostic",
        "dataset_version": frozen.get("dataset_version"),
        "mode": "offline_existing_runtime_candidates",
        "production_changes": False,
        "accepted_weights_unchanged": WEIGHTS,
        "temporal_half_life": HALF_LIFE,
        "baseline_recompute": {
            "raw_order_mismatch_count": baseline_raw_order_mismatch_count,
            "expected": 0,
        },
        "intent_detector": {
            "first_occurrence_query_types": [
                "temporal_supersession",
                "temporal_replay_hard_negative",
            ],
            "note": "Deterministic diagnostic classifier only; not production NLP.",
        },
        "policies": policies,
        "first_occurrence_cases": first_occurrence_cases,
        "dual_lane": {
            "definition": {
                "primary_evidence": (
                    "canonical + high-confidence + no replay/conflict marker"
                ),
                "provenance_variant": (
                    "noncanonical, ambiguous/non-high-confidence, or replay/conflict/attributed marker"
                ),
            },
            "top10_memory_count": lane_top10_count,
            "variant_lane_count": lane_variant_count,
            "positive_variant_count": positive_variant_count,
            "same_or_past_prohibited_variant_count": (
                same_past_prohibited_variant_count
            ),
            "same_or_past_prohibited_primary_count": (
                same_past_prohibited_primary_count
            ),
            "queries_with_best_positive_in_variant": (
                queries_best_positive_variant
            ),
            "mean_annotation_token_overhead": (
                statistics.fmean(annotation_overheads)
                if annotation_overheads
                else 0.0
            ),
            "max_annotation_token_overhead": (
                max(annotation_overheads) if annotation_overheads else 0
            ),
            "cases": lane_cases,
        },
        "guardrails": [
            "offline only",
            "no frozen-label mutation",
            "no provider calls",
            "no production ranking/schema/context mutation",
            "policy results are diagnostics, not accepted weights",
        ],
    }

    summary = render_summary(result)
    rendered = json.dumps(result, indent=2, ensure_ascii=False)
    print(rendered)
    print("\n--- SUMMARY ---\n")
    print(summary)

    if not args.stdout_only:
        args.output_dir.mkdir(parents=True, exist_ok=True)
        (args.output_dir / "diagnostic.json").write_text(
            rendered + "\n",
            encoding="utf-8",
        )
        (args.output_dir / "summary.md").write_text(
            summary + "\n",
            encoding="utf-8",
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

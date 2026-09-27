#!/usr/bin/env python3
"""EVAL-01B replay / temporal-intent diagnostic.

Offline-only diagnostic. It consumes the frozen corpus labels and the corrected
EVAL-01 retrieval artifacts. It does not call an embedding or generation
provider and it does not modify production data.

Goals:
- separate genuine future grade -1 labels from same/past query-conditioned
  replay/invalid labels;
- measure whether replay negatives outrank the best positive;
- identify memories that are positive for one query and prohibited for another,
  proving that grade -1 is not a global memory-delete flag;
- preserve query text/reason and source provenance for human contract review.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RETRIEVAL = (
    ROOT
    / "docs"
    / "development"
    / "EVAL-01-AETHELGARD-RUNTIME-BASELINE"
    / "retrieval-raw.json"
)
DEFAULT_OUTPUT = (
    ROOT
    / "docs"
    / "development"
    / "EVAL-01B-REPLAY-TEMPORAL-INTENT"
    / "diagnostic.json"
)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def labels_by_query(queries: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    return {
        (str(query["split"]), str(query["query_id"])): query
        for query in queries
    }


def rank_map(items: list[dict[str, Any]]) -> dict[str, int]:
    return {
        str(item["memory_id"]): int(item["rank"])
        for item in items
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--retrieval", type=Path, default=DEFAULT_RETRIEVAL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--stdout-only", action="store_true")
    args = parser.parse_args()

    retrieval_rows = load_json(args.retrieval)
    frozen = load_json(ROOT / ".data" / "Frozen_v1" / "retrieval_queries.json")
    canonical = load_json(
        ROOT / ".data" / "Frozen_v1" / "memory_chunks_canonical.json"
    )["memories"]
    audit = load_json(ROOT / ".data" / "Frozen_v1" / "memory_chunks.json")["memories"]

    queries = frozen["queries"]
    query_map = labels_by_query(queries)
    memory_by_id = {
        str(memory["memory_id"]): memory
        for memory in [*audit, *canonical]
    }

    positive_uses: dict[str, list[dict[str, Any]]] = defaultdict(list)
    prohibited_uses: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for query in queries:
        for label in query.get("labels", []):
            memory_id = str(label["memory_id"])
            record = {
                "split": query["split"],
                "query_id": query["query_id"],
                "grade": int(label["grade"]),
                "label": label["label"],
            }
            if int(label["grade"]) > 0:
                positive_uses[memory_id].append(record)
            elif int(label["grade"]) < 0:
                prohibited_uses[memory_id].append(record)

    future_label_count = 0
    same_or_past_label_count = 0
    cases: list[dict[str, Any]] = []
    stage_hits: list[dict[str, Any]] = []
    hybrid_pairwise_failures: list[dict[str, Any]] = []
    semantic_pairwise_failures: list[dict[str, Any]] = []

    for row in retrieval_rows:
        split = str(row["split"])
        # VI diagnostics inherit core labels but do not exist in retrieval_queries.
        if split == "vietnamese_diagnostic":
            continue

        query_key = (split, str(row["query_id"]))
        query = query_map.get(query_key)
        if query is None:
            continue

        cutoff = int(query["chapter_cutoff"])
        positive_ids = {
            str(label["memory_id"])
            for label in query.get("labels", [])
            if int(label.get("grade", 0)) > 0
        }
        prohibited_ids = {
            str(label["memory_id"])
            for label in query.get("labels", [])
            if int(label.get("grade", 0)) < 0
        }
        if not prohibited_ids:
            continue

        label_classes: list[dict[str, Any]] = []
        for memory_id in sorted(prohibited_ids):
            memory = memory_by_id.get(memory_id)
            chapter = int(memory.get("chapter_number", -1)) if memory else None
            classification = (
                "future_by_cutoff"
                if chapter is not None and chapter > cutoff
                else "same_or_past_query_conditioned"
            )
            if classification == "future_by_cutoff":
                future_label_count += 1
            else:
                same_or_past_label_count += 1
            label_classes.append(
                {
                    "memory_id": memory_id,
                    "memory_chapter": chapter,
                    "classification": classification,
                    "status": memory.get("status") if memory else None,
                    "review_status": memory.get("review_status") if memory else None,
                    "tags": list(memory.get("tags", [])) if memory else [],
                    "positive_in_other_queries": positive_uses.get(memory_id, []),
                }
            )

        stage_data: dict[str, Any] = {}
        for stage in ("semantic_top20", "hybrid_top20"):
            ranks = rank_map(row.get(stage, []))
            positive_ranks = sorted(
                ranks[memory_id]
                for memory_id in positive_ids
                if memory_id in ranks
            )
            prohibited_ranks = sorted(
                ranks[memory_id]
                for memory_id in prohibited_ids
                if memory_id in ranks
            )
            best_positive = positive_ranks[0] if positive_ranks else None
            best_prohibited = prohibited_ranks[0] if prohibited_ranks else None
            prohibited_outranks_positive = (
                best_positive is not None
                and best_prohibited is not None
                and best_prohibited < best_positive
            )

            stage_data[stage] = {
                "best_positive_rank": best_positive,
                "best_prohibited_rank": best_prohibited,
                "prohibited_hit_ranks": prohibited_ranks,
                "prohibited_outranks_best_positive": prohibited_outranks_positive,
            }

            for memory_id in sorted(prohibited_ids):
                if memory_id not in ranks:
                    continue
                hit = {
                    "case_id": row["case_id"],
                    "split": split,
                    "query_id": row["query_id"],
                    "query_type": query.get("query_type"),
                    "stage": stage,
                    "rank": ranks[memory_id],
                    "memory_id": memory_id,
                    "chapter_cutoff": cutoff,
                    "memory_chapter": memory_by_id.get(memory_id, {}).get(
                        "chapter_number"
                    ),
                }
                stage_hits.append(hit)

            if prohibited_outranks_positive:
                target = (
                    semantic_pairwise_failures
                    if stage == "semantic_top20"
                    else hybrid_pairwise_failures
                )
                target.append(
                    {
                        "case_id": row["case_id"],
                        "query_type": query.get("query_type"),
                        "best_positive_rank": best_positive,
                        "best_prohibited_rank": best_prohibited,
                    }
                )

        cases.append(
            {
                "case_id": row["case_id"],
                "query": query["query"],
                "query_type": query.get("query_type"),
                "review_status": query.get("review_status"),
                "reason": query.get("reason"),
                "chapter_cutoff": cutoff,
                "prohibited_labels": label_classes,
                "stages": stage_data,
            }
        )

    cross_query_dual_role = []
    for memory_id in sorted(set(positive_uses) & set(prohibited_uses)):
        cross_query_dual_role.append(
            {
                "memory_id": memory_id,
                "positive_uses": positive_uses[memory_id],
                "prohibited_uses": prohibited_uses[memory_id],
                "source": {
                    "chapter_number": memory_by_id.get(memory_id, {}).get(
                        "chapter_number"
                    ),
                    "review_status": memory_by_id.get(memory_id, {}).get(
                        "review_status"
                    ),
                    "tags": memory_by_id.get(memory_id, {}).get("tags", []),
                },
            }
        )

    diagnostic = {
        "experiment_id": "EVAL-01B",
        "name": "Replay / Temporal-Intent Diagnostic",
        "dataset_version": frozen.get("dataset_version"),
        "retrieval_source": str(args.retrieval.relative_to(ROOT)),
        "mode": "offline_existing_runtime_artifacts",
        "summary": {
            "queries_with_grade_minus_one": len(cases),
            "future_grade_minus_one_labels": future_label_count,
            "same_or_past_query_conditioned_labels": same_or_past_label_count,
            "semantic_grade_minus_one_top20_hits": sum(
                1 for hit in stage_hits if hit["stage"] == "semantic_top20"
            ),
            "hybrid_grade_minus_one_top20_hits": sum(
                1 for hit in stage_hits if hit["stage"] == "hybrid_top20"
            ),
            "semantic_pairwise_failures": len(semantic_pairwise_failures),
            "hybrid_pairwise_failures": len(hybrid_pairwise_failures),
            "cross_query_dual_role_memories": len(cross_query_dual_role),
        },
        "interpretation_contract": {
            "global_filter_safe": len(cross_query_dual_role) == 0,
            "note": (
                "A memory used positively in one query and prohibited in another "
                "cannot be treated as globally invalid solely from grade -1 labels."
            ),
        },
        "semantic_pairwise_failures": semantic_pairwise_failures,
        "hybrid_pairwise_failures": hybrid_pairwise_failures,
        "grade_minus_one_stage_hits": stage_hits,
        "cross_query_dual_role_memories": cross_query_dual_role,
        "cases": cases,
    }

    rendered = json.dumps(diagnostic, indent=2, ensure_ascii=False)
    print(rendered)
    if not args.stdout_only:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

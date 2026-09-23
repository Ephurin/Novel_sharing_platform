#!/usr/bin/env python3
"""Deterministic P7-04 hybrid re-ranking proxy over frozen P7-01 artifacts.

This benchmark does not call an embedding provider. It starts from the accepted
P7-01 Gemini top-20 semantic order, reconstructs bounded narrative signals from
frozen metadata, and applies the production HybridRanker. It is a calibration
and regression proxy, not a claim of universal weight optimality.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from application.hybrid_ranker import HybridRanker
from benchmarks.p7_embedding_benchmark import aggregate_metrics, evaluate_ranked_ids, recent_rank
from domain.models import HybridRankingSignals, SemanticMemoryMatch


SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parent
DEFAULT_MEMORIES = REPO_ROOT / ".data" / "Frozen_v1" / "memory_chunks_canonical.json"
DEFAULT_QUERIES = REPO_ROOT / ".data" / "Frozen_v1" / "core_gold_queries.json"
DEFAULT_ENTITIES = REPO_ROOT / ".data" / "Batch_7" / "entities.json"
DEFAULT_SEMANTIC = (
    REPO_ROOT
    / "docs"
    / "development"
    / "P7-01-EMBEDDING-BENCHMARK-ADR"
    / "gemini-2-768.json"
)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _contains_phrase(text: str, phrase: str) -> bool:
    phrase = phrase.strip()
    if len(phrase) < 2:
        return False
    return re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", text, flags=re.IGNORECASE) is not None


def resolve_query_entities(
    query_text: str,
    entities: list[dict[str, Any]],
    chapter_cutoff: int,
) -> set[str]:
    output: set[str] = set()
    for entity in entities:
        if int(entity.get("first_chapter") or 1) > chapter_cutoff:
            continue
        names = [entity.get("canonical_name", ""), *(entity.get("aliases") or [])]
        if any(name and _contains_phrase(query_text, str(name)) for name in names):
            output.add(str(entity["entity_id"]))
    return output


def related_entities(
    query_entity_ids: set[str],
    relationships: list[dict[str, Any]],
    chapter_cutoff: int,
) -> set[str]:
    output: set[str] = set()
    for relationship in relationships:
        if relationship.get("status") != "canonical":
            continue
        if int(relationship.get("first_chapter") or 1) > chapter_cutoff:
            continue
        left = str(relationship["a"])
        right = str(relationship["b"])
        if left in query_entity_ids:
            output.add(right)
        if right in query_entity_ids:
            output.add(left)
    return output - query_entity_ids


def _semantic_rankings(payload: dict[str, Any]) -> dict[str, list[str]]:
    return {
        str(item["query_id"]): list(item["metrics"]["20"]["ranked_ids"])
        for item in payload["per_query"]
    }


def _match(memory: dict[str, Any], semantic_rank: int) -> SemanticMemoryMatch:
    return SemanticMemoryMatch(
        memory_chunk_id=str(memory["memory_id"]),
        story_brain_id="benchmark",
        tenant_id="benchmark",
        novel_id="benchmark",
        source_key=f"frozen:{memory['memory_id']}",
        memory_type=str(memory["memory_type"]),
        content=str(memory["content"]),
        content_hash=str(memory["memory_id"]).rjust(64, "0")[-64:],
        embedding_version="gemini-embedding-2-768-v1",
        cosine_distance=float(semantic_rank),
        narrative_order=int(memory["chapter_number"]) * 1024,
        chapter_number=int(memory["chapter_number"]),
        entity_ids=tuple(str(value) for value in memory.get("entities", [])),
        importance_score=float(memory.get("importance", 0.5)),
        metadata={"tags": list(memory.get("tags", []))},
    )


def run_proxy() -> dict[str, Any]:
    memory_payload = load_json(DEFAULT_MEMORIES)
    query_payload = load_json(DEFAULT_QUERIES)
    entity_payload = load_json(DEFAULT_ENTITIES)
    semantic_payload = load_json(DEFAULT_SEMANTIC)

    memories = list(memory_payload["memories"])
    memory_by_id = {str(memory["memory_id"]): memory for memory in memories}
    queries = list(query_payload["queries"])
    semantic_by_query = _semantic_rankings(semantic_payload)
    ranker = HybridRanker()

    recent_per_query: list[dict[str, Any]] = []
    semantic_per_query: list[dict[str, Any]] = []
    hybrid_per_query: list[dict[str, Any]] = []

    for query in queries:
        query_id = str(query["query_id"])
        cutoff = int(query["chapter_cutoff"])
        semantic_ids = semantic_by_query[query_id]

        query_entities = resolve_query_entities(
            str(query["query"]),
            list(entity_payload["entities"]),
            cutoff,
        )
        related = related_entities(
            query_entities,
            list(entity_payload.get("relationships", [])),
            cutoff,
        )

        candidates = tuple(
            _match(memory_by_id[memory_id], index)
            for index, memory_id in enumerate(semantic_ids)
            if memory_id in memory_by_id
        )
        hybrid_matches = ranker.rank(
            candidates,
            signals=HybridRankingSignals(
                query_entity_ids=tuple(sorted(query_entities)),
                related_entity_ids=tuple(sorted(related)),
            ),
            chapter_number=cutoff,
            limit=20,
        )
        hybrid_ids = [match.memory_chunk_id for match in hybrid_matches]

        recent_ids = recent_rank(memories, cutoff)
        recent_per_query.append(
            {"query_id": query_id, "metrics": evaluate_ranked_ids(query, recent_ids)}
        )
        semantic_per_query.append(
            {"query_id": query_id, "metrics": evaluate_ranked_ids(query, semantic_ids)}
        )
        hybrid_per_query.append(
            {"query_id": query_id, "metrics": evaluate_ranked_ids(query, hybrid_ids)}
        )

    return {
        "dataset_version": query_payload["dataset_version"],
        "proxy": "saved-semantic-top20 + frozen narrative metadata",
        "ranking_version": ranker.ranking_version,
        "weights": {
            "semantic": ranker.weights.semantic,
            "entity_overlap": ranker.weights.entity_overlap,
            "temporal": ranker.weights.temporal,
            "importance": ranker.weights.importance,
            "relationship": ranker.weights.relationship,
        },
        "limitations": [
            "Uses saved P7-01 semantic rank order rather than raw cosine magnitudes.",
            "Entity resolution is deterministic exact canonical-name/alias matching.",
            "Relationship proxy uses frozen canonical edges available by chapter cutoff.",
            "Core-gold is calibration/regression evidence, not an independent held-out set.",
        ],
        "recent": aggregate_metrics(recent_per_query),
        "semantic": aggregate_metrics(semantic_per_query),
        "hybrid": aggregate_metrics(hybrid_per_query),
        "per_query": hybrid_per_query,
    }


def main() -> int:
    print(json.dumps(run_proxy(), indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

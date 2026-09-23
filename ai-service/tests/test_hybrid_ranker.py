from __future__ import annotations

import math

from application.hybrid_ranker import HYBRID_RANKING_VERSION, HybridRanker
from application.semantic_retriever import SemanticRetrieverService
from domain.models import (
    HybridRankingSignals,
    SemanticMemoryMatch,
)


def _match(
    memory_id: str,
    *,
    chapter: int,
    entities: tuple[str, ...] = (),
    importance: float = 0.5,
    distance: float = 0.1,
) -> SemanticMemoryMatch:
    return SemanticMemoryMatch(
        memory_chunk_id=memory_id,
        story_brain_id="00000000-0000-0000-0000-000000000010",
        tenant_id="00000000-0000-0000-0000-000000000001",
        novel_id="00000000-0000-0000-0000-000000000020",
        source_key=f"event:{memory_id}",
        memory_type="event_summary",
        content=f"memory {memory_id}",
        content_hash=memory_id.rjust(64, "0")[-64:],
        embedding_version="axis-768-v1",
        cosine_distance=distance,
        narrative_order=chapter * 1024,
        chapter_number=chapter,
        event_id=memory_id,
        entity_ids=entities,
        importance_score=importance,
    )


class AxisProvider:
    model = "axis"
    version = "axis-768-v1"
    dimension = 768

    def embed_query(self, text: str):
        return tuple([2.0] + [0.0] * 767)


class HybridRepository:
    def __init__(self, matches, *, signal_error: Exception | None = None):
        self.matches = list(matches)
        self.signal_error = signal_error
        self.requested_limit = None

    def search_semantic_memories(
        self,
        story_id,
        *,
        query_embedding,
        embedding_version,
        chapter_number,
        limit=10,
        memory_type="event_summary",
    ):
        self.requested_limit = limit
        return self.matches[:limit]

    def get_hybrid_ranking_signals(self, story_id, *, query_text, chapter_number):
        if self.signal_error is not None:
            raise self.signal_error
        return HybridRankingSignals(
            query_entity_ids=("entity-q",),
            related_entity_ids=("entity-r",),
        )


def test_hybrid_ranker_keeps_semantic_top1_but_can_promote_strong_lower_candidate():
    semantic_first = _match(
        "a",
        chapter=20,
        entities=("other",),
        importance=0.5,
    )
    semantic_second_weak = _match(
        "b",
        chapter=8,
        entities=("other",),
        importance=0.1,
    )
    narrative_strong = _match(
        "c",
        chapter=20,
        entities=("entity-q", "entity-r"),
        importance=1.0,
    )

    ranked = HybridRanker().rank(
        (semantic_first, semantic_second_weak, narrative_strong),
        signals=HybridRankingSignals(
            query_entity_ids=("entity-q",),
            related_entity_ids=("entity-r",),
        ),
        chapter_number=20,
        limit=3,
    )

    assert [item.memory_chunk_id for item in ranked] == ["a", "c", "b"]
    promoted = ranked[1]
    assert promoted.semantic_score == 0.5
    assert promoted.entity_overlap_score == 1.0
    assert promoted.temporal_score == 1.0
    assert promoted.importance_score == 1.0
    assert promoted.relationship_score == 0.5
    assert promoted.hybrid_score > ranked[2].hybrid_score


def test_temporal_decay_and_empty_entity_signals_are_bounded_and_deterministic():
    recent = _match("recent", chapter=20, importance=0.5)
    old = _match("old", chapter=8, importance=0.5)

    ranked = HybridRanker().rank(
        (recent, old),
        signals=HybridRankingSignals(),
        chapter_number=20,
        limit=2,
    )

    assert ranked[0].temporal_score == 1.0
    assert math.isclose(ranked[1].temporal_score, 0.5, rel_tol=1e-9)
    assert ranked[0].entity_overlap_score == 0.0
    assert ranked[0].relationship_score == 0.0
    assert all(0.0 <= item.hybrid_score <= 1.0 for item in ranked)


def test_hybrid_ranker_ties_keep_semantic_order_then_stable_id():
    left = _match("a", chapter=10)
    right = _match("b", chapter=10)

    ranked = HybridRanker().rank(
        (left, right),
        signals=HybridRankingSignals(),
        chapter_number=10,
        limit=2,
    )

    # semantic rank is itself a component, so the original exact-cosine order
    # remains the deterministic tie-break boundary.
    assert [item.memory_chunk_id for item in ranked] == ["a", "b"]


def test_semantic_retriever_overfetches_then_returns_hybrid_final_limit():
    matches = [
        _match(
            str(index),
            chapter=20 if index == 5 else 1,
            entities=("entity-q", "entity-r") if index == 5 else (),
            importance=1.0 if index == 5 else 0.1,
        )
        for index in range(20)
    ]
    repo = HybridRepository(matches)
    service = SemanticRetrieverService(
        repo,
        AxisProvider(),
        default_limit=2,
        hybrid_ranker=HybridRanker(),
    )

    result = service.retrieve(
        "story",
        query_text="query",
        chapter_number=20,
    )

    assert repo.requested_limit == 20
    assert len(result.matches) == 2
    assert result.ranking_version == HYBRID_RANKING_VERSION
    assert any(item.hybrid_score > 0.0 for item in result.matches)


def test_hybrid_signal_failure_keeps_successful_semantic_order():
    matches = [_match("a", chapter=3), _match("b", chapter=3)]
    repo = HybridRepository(matches, signal_error=RuntimeError("signal store unavailable"))
    service = SemanticRetrieverService(
        repo,
        AxisProvider(),
        default_limit=2,
        hybrid_ranker=HybridRanker(),
    )

    result = service.retrieve(
        "story",
        query_text="query",
        chapter_number=3,
    )

    assert result.status == "ok"
    assert [item.memory_chunk_id for item in result.matches] == ["a", "b"]
    assert result.ranking_version == "semantic-only-fallback-v1"
    assert result.fallback_reason == "hybrid:RuntimeError"

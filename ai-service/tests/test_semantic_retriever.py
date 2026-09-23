from __future__ import annotations

import math
from dataclasses import dataclass

import pytest

from application.semantic_retriever import SemanticRetrieverService
from application.writing_service import WritingService
from domain.models import (
    SemanticMemoryMatch,
    SemanticRetrievalResult,
    WritingContextPackage,
)
from infrastructure.embedding_providers import (
    DOCUMENT_INSTRUCTION,
    QUERY_INSTRUCTION,
    DeterministicFakeEmbeddingProvider,
)


class CapturingRepository:
    def __init__(self, *, matches=(), fail: Exception | None = None) -> None:
        self.matches = list(matches)
        self.fail = fail
        self.query_embedding: tuple[float, ...] | None = None
        self.embedding_version: str | None = None
        self.chapter_number: int | None = None

    def search_semantic_memories(
        self,
        story_id: str,
        *,
        query_embedding: tuple[float, ...],
        embedding_version: str,
        chapter_number: int | None,
        limit: int = 10,
        memory_type: str = "event_summary",
    ):
        if self.fail is not None:
            raise self.fail
        self.query_embedding = query_embedding
        self.embedding_version = embedding_version
        self.chapter_number = chapter_number
        return self.matches[:limit]


class AxisProvider:
    model = "axis"
    version = "axis-768-v1"
    dimension = 768

    def embed_document(self, text: str):
        return tuple([0.0, 2.0] + [0.0] * 766)

    def embed_query(self, text: str):
        return tuple([2.0] + [0.0] * 767)


class WrongDimensionProvider(AxisProvider):
    def embed_query(self, text: str):
        return (1.0, 0.0)


class BaselineNarrativeRepository:
    def get_structured_context(self, story_id: str, **kwargs):
        return WritingContextPackage(
            brain_version=7,
            recent_events=(
                {"event_id": "canonical-1", "summary": "canonical recent event"},
            ),
            context_summary={"event_ids": ["canonical-1"]},
        )


@dataclass
class StubSemanticRetriever:
    result: SemanticRetrievalResult
    last_query: str | None = None

    def retrieve(self, story_id: str, *, query_text: str, chapter_number: int | None, limit=None):
        self.last_query = query_text
        return self.result


def _match() -> SemanticMemoryMatch:
    return SemanticMemoryMatch(
        memory_chunk_id="mem-old-1",
        story_brain_id="00000000-0000-0000-0000-000000000010",
        tenant_id="00000000-0000-0000-0000-000000000001",
        novel_id="00000000-0000-0000-0000-000000000020",
        source_key="event:event-old-1",
        memory_type="event_summary",
        content="An old but relevant promise was made.",
        content_hash="a" * 64,
        embedding_version="axis-768-v1",
        cosine_distance=0.125,
        narrative_order=1024,
        chapter_number=3,
        event_id="event-old-1",
        importance_score=0.8,
    )


def test_query_and_document_embedding_recipes_are_distinct() -> None:
    assert QUERY_INSTRUCTION != DOCUMENT_INSTRUCTION
    provider = DeterministicFakeEmbeddingProvider()
    document = provider.embed_document("same text")
    query = provider.embed_query("same text")
    assert document != query


def test_semantic_retriever_l2_normalizes_query_before_repository_search() -> None:
    repo = CapturingRepository(matches=[_match()])
    service = SemanticRetrieverService(repo, AxisProvider(), default_limit=5)

    result = service.retrieve(
        "story-1",
        query_text="find the old promise",
        chapter_number=10,
    )

    assert result.status == "ok"
    assert [item.memory_chunk_id for item in result.matches] == ["mem-old-1"]
    assert repo.embedding_version == "axis-768-v1"
    assert repo.chapter_number == 10
    assert repo.query_embedding is not None
    assert len(repo.query_embedding) == 768
    assert math.isclose(
        math.sqrt(sum(value * value for value in repo.query_embedding)),
        1.0,
        rel_tol=1e-9,
    )
    assert repo.query_embedding[0] == 1.0


def test_semantic_retriever_dimension_failure_falls_back_without_raising() -> None:
    service = SemanticRetrieverService(CapturingRepository(), WrongDimensionProvider())

    result = service.retrieve(
        "story-1",
        query_text="query",
        chapter_number=4,
    )

    assert result.status == "fallback"
    assert result.matches == ()
    assert result.fallback_reason == "EmbeddingProviderError"


def test_repository_failure_falls_back_without_raising() -> None:
    repo = CapturingRepository(fail=RuntimeError("database unavailable"))
    service = SemanticRetrieverService(repo, AxisProvider())

    result = service.retrieve(
        "story-1",
        query_text="query",
        chapter_number=4,
    )

    assert result.status == "fallback"
    assert result.matches == ()
    assert result.fallback_reason == "RuntimeError"


def test_embedding_version_mismatch_is_rejected_at_composition_boundary() -> None:
    with pytest.raises(ValueError, match="must match"):
        SemanticRetrieverService(
            CapturingRepository(),
            AxisProvider(),
            embedding_version="other-768-v1",
        )


def test_writing_context_adds_semantic_memories_without_replacing_canonical_context() -> None:
    semantic = StubSemanticRetriever(
        SemanticRetrievalResult(
            matches=(_match(),),
            status="ok",
            embedding_version="axis-768-v1",
        )
    )
    service = WritingService(
        BaselineNarrativeRepository(),
        llm_service=None,
        semantic_retriever=semantic,
    )

    package = service.preview_context(
        tenant_id="tenant-1",
        story_id="story-1",
        chapter_number=8,
        semantic_query="remember the promise",
    )

    assert package.recent_events == (
        {"event_id": "canonical-1", "summary": "canonical recent event"},
    )
    assert [item["memory_chunk_id"] for item in package.semantic_memories] == ["mem-old-1"]
    assert package.context_summary["event_ids"] == ["canonical-1"]
    assert package.context_summary["semantic_memory_ids"] == ["mem-old-1"]
    assert package.context_summary["semantic_retrieval_status"] == ["ok"]
    assert semantic.last_query == "remember the promise"


def test_writing_context_semantic_failure_preserves_phase6_fallback() -> None:
    semantic = StubSemanticRetriever(
        SemanticRetrievalResult(
            matches=(),
            status="fallback",
            embedding_version="axis-768-v1",
            fallback_reason="RuntimeError",
        )
    )
    service = WritingService(
        BaselineNarrativeRepository(),
        llm_service=None,
        semantic_retriever=semantic,
    )

    package = service.preview_context(
        tenant_id="tenant-1",
        story_id="story-1",
        chapter_number=8,
        semantic_query="remember the promise",
    )

    assert package.recent_events[0]["event_id"] == "canonical-1"
    assert package.semantic_memories == ()
    assert package.context_summary["semantic_retrieval_status"] == ["fallback"]
    assert package.context_summary["semantic_fallback_reason"] == ["RuntimeError"]


def test_writing_context_without_retriever_is_phase6_compatible() -> None:
    service = WritingService(BaselineNarrativeRepository(), llm_service=None)

    package = service.preview_context(
        tenant_id="tenant-1",
        story_id="story-1",
        chapter_number=8,
    )

    assert package.recent_events[0]["event_id"] == "canonical-1"
    assert package.semantic_memories == ()
    assert "semantic_retrieval_status" not in package.context_summary

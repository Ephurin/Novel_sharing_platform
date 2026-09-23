from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass

import pytest

from application.semantic_retriever import SemanticRetrieverService
from application.writing_service import WritingService
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from tests.harness.fake_llm import FakeDeterministicLLMService
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

    def retrieve(
        self,
        story_id: str,
        *,
        query_text: str,
        chapter_number: int | None,
        limit=None,
        tenant_id: str | None = None,
    ):
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
    assert result.ranking_version == "phase6-fallback"
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


def test_missing_temporal_cutoff_skips_semantic_query() -> None:
    repo = CapturingRepository(matches=[_match()])
    service = SemanticRetrieverService(repo, AxisProvider())

    result = service.retrieve(
        "story-1",
        query_text="query that would otherwise retrieve memories",
        chapter_number=None,
    )

    assert result.status == "skipped"
    assert result.matches == ()
    assert result.ranking_version == "not-ranked"
    assert result.fallback_reason == "missing_temporal_cutoff"
    assert repo.query_embedding is None


def test_semantic_memory_content_changes_generation_context_hash() -> None:
    repo = InMemoryNarrativeRepository()
    novel_id = "10000000-0000-0000-0000-000000000777"
    source_text = "A short current chapter passage."
    content_hash = hashlib.sha256(source_text.encode("utf-8")).hexdigest()

    first = _match()
    semantic = StubSemanticRetriever(
        SemanticRetrievalResult(
            matches=(first,),
            status="ok",
            embedding_version=first.embedding_version,
        )
    )
    service = WritingService(
        repo,
        FakeDeterministicLLMService(),
        semantic_retriever=semantic,
    )

    job1 = service.start_generation(
        tenant_id="00000000-0000-0000-0000-000000000001",
        novel_id=novel_id,
        chapter_id="chapter-5",
        revision_id="ephemeral:context-hash-1",
        content_hash=content_hash,
        operation="continue",
        selection={"start": 0, "end": 0, "cursor": 0},
        instruction="Recall the old promise.",
        chapter_number=5,
        source_text=source_text,
    )

    second = SemanticMemoryMatch(
        memory_chunk_id="mem-old-2",
        story_brain_id=first.story_brain_id,
        tenant_id=first.tenant_id,
        novel_id=first.novel_id,
        source_key="event:event-old-2",
        memory_type=first.memory_type,
        content="A different old memory is now retrieved.",
        content_hash="b" * 64,
        embedding_version=first.embedding_version,
        cosine_distance=0.05,
        narrative_order=2048,
        chapter_number=4,
        event_id="event-old-2",
        importance_score=0.8,
    )
    semantic.result = SemanticRetrievalResult(
        matches=(second,),
        status="ok",
        embedding_version=second.embedding_version,
    )

    job2 = service.start_generation(
        tenant_id="00000000-0000-0000-0000-000000000001",
        novel_id=novel_id,
        chapter_id="chapter-5",
        revision_id="ephemeral:context-hash-2",
        content_hash=content_hash,
        operation="continue",
        selection={"start": 0, "end": 0, "cursor": 0},
        instruction="Recall the old promise.",
        chapter_number=5,
        source_text=source_text,
    )

    assert job1.context_hash
    assert job2.context_hash
    assert job1.context_hash != job2.context_hash
    assert job1.context_summary["semantic_memory_ids"] == ["mem-old-1"]
    assert job2.context_summary["semantic_memory_ids"] == ["mem-old-2"]


def test_semantic_retriever_skips_cross_tenant_scope() -> None:
    repo = CapturingRepository(matches=[_match()])
    service = SemanticRetrieverService(
        repo,
        AxisProvider(),
        tenant_id="tenant-a",
    )

    result = service.retrieve(
        "story-1",
        query_text="query",
        chapter_number=5,
        tenant_id="tenant-b",
    )

    assert result.status == "skipped"
    assert result.matches == ()
    assert result.fallback_reason == "tenant_scope_mismatch"
    assert repo.query_embedding is None

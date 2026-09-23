from __future__ import annotations

import math
import uuid
from dataclasses import replace

import pytest

from application.semantic_memory_service import SemanticMemoryMaterializationService
from domain.embeddings import EmbeddingProviderError, l2_normalize
from domain.models import EventMemorySource, SemanticMemoryChunk, SemanticMemoryEmbedding
from infrastructure.embedding_providers import DeterministicFakeEmbeddingProvider


class FakeSemanticMemoryRepository:
    def __init__(self, sources: list[EventMemorySource]) -> None:
        self.sources = list(sources)
        self.chunks: dict[tuple[str, str], SemanticMemoryChunk] = {}
        self.embeddings: dict[tuple[str, str], SemanticMemoryEmbedding] = {}

    def list_event_memory_sources(self, story_id: str) -> list[EventMemorySource]:
        return list(self.sources)

    def upsert_memory_chunk(self, story_id: str, **values) -> SemanticMemoryChunk:
        key = (values["memory_type"], values["source_key"])
        existing = self.chunks.get(key)
        if existing is None:
            existing = SemanticMemoryChunk(
                memory_chunk_id=str(uuid.uuid4()),
                story_brain_id=self.sources[0].story_brain_id,
                tenant_id=self.sources[0].tenant_id,
                novel_id=self.sources[0].novel_id,
                source_key=values["source_key"],
                memory_type=values["memory_type"],
                content=values["content"],
                content_hash=values["content_hash"],
                importance_score=values["importance_score"],
                narrative_order=values["narrative_order"],
                chapter_id=values["chapter_id"],
                revision_id=values["revision_id"],
                event_id=values["event_id"],
                entity_id=values["entity_id"],
                entity_ids=values["entity_ids"],
                metadata=values["metadata"],
            )
        else:
            existing = replace(
                existing,
                content=values["content"],
                content_hash=values["content_hash"],
                importance_score=values["importance_score"],
                narrative_order=values["narrative_order"],
                chapter_id=values["chapter_id"],
                revision_id=values["revision_id"],
                event_id=values["event_id"],
                entity_id=values["entity_id"],
                entity_ids=values["entity_ids"],
                metadata=values["metadata"],
            )
        self.chunks[key] = existing
        return existing

    def list_memory_chunks(self, story_id: str, *, memory_type: str | None = None):
        chunks = list(self.chunks.values())
        return [chunk for chunk in chunks if memory_type is None or chunk.memory_type == memory_type]

    def delete_memory_chunks_not_in_sources(
        self,
        story_id: str,
        *,
        memory_type: str,
        active_source_keys: set[str],
    ) -> int:
        doomed = [
            key
            for key, chunk in self.chunks.items()
            if chunk.memory_type == memory_type and chunk.source_key not in active_source_keys
        ]
        doomed_chunk_ids = {self.chunks[key].memory_chunk_id for key in doomed}
        for key in doomed:
            del self.chunks[key]
        for key in list(self.embeddings):
            if key[0] in doomed_chunk_ids:
                del self.embeddings[key]
        return len(doomed)

    def get_embedding(self, story_id: str, memory_chunk_id: str, embedding_version: str):
        return self.embeddings.get((memory_chunk_id, embedding_version))

    def upsert_embedding(self, story_id: str, embedding: SemanticMemoryEmbedding):
        self.embeddings[(embedding.memory_chunk_id, embedding.embedding_version)] = embedding
        return embedding

    def list_embeddings_for_version(self, story_id: str, embedding_version: str):
        return [
            embedding
            for (_, version), embedding in self.embeddings.items()
            if version == embedding_version
        ]

    def delete_embedding_version(self, story_id: str, embedding_version: str) -> int:
        keys = [key for key in self.embeddings if key[1] == embedding_version]
        for key in keys:
            del self.embeddings[key]
        return len(keys)

    def embedding_coverage(self, story_id: str, embedding_version: str):
        embeddings = self.list_embeddings_for_version(story_id, embedding_version)
        chunk_by_id = {chunk.memory_chunk_id: chunk for chunk in self.chunks.values()}
        fresh = sum(
            1
            for embedding in embeddings
            if chunk_by_id.get(embedding.memory_chunk_id)
            and chunk_by_id[embedding.memory_chunk_id].content_hash == embedding.content_hash
        )
        return {
            "memory_chunks": len(self.chunks),
            "embeddings": len(embeddings),
            "fresh_embeddings": fresh,
        }


class VersionTwoFakeProvider(DeterministicFakeEmbeddingProvider):
    model = "fake-embedding-v2"
    version = "fake-embedding-768-v2"


class FailingProvider(DeterministicFakeEmbeddingProvider):
    def embed_document(self, text: str):
        raise EmbeddingProviderError("provider unavailable")


def make_source(summary: str = "Mira rescued Eldric at the north gate") -> EventMemorySource:
    return EventMemorySource(
        event_id=str(uuid.uuid4()),
        story_brain_id=str(uuid.uuid4()),
        tenant_id=str(uuid.uuid4()),
        novel_id=str(uuid.uuid4()),
        summary=summary,
        narrative_order=1024,
        chapter_number=3,
        chapter_id=str(uuid.uuid4()),
        revision_id=str(uuid.uuid4()),
        entity_ids=(str(uuid.uuid4()),),
        metadata={"event_type": "rescue"},
    )


def test_l2_normalize_rejects_invalid_vectors() -> None:
    with pytest.raises(EmbeddingProviderError, match="dimension mismatch"):
        l2_normalize([1.0, 2.0], expected_dimension=3)
    with pytest.raises(EmbeddingProviderError, match="zero norm"):
        l2_normalize([0.0, 0.0], expected_dimension=2)


def test_materialization_is_idempotent_and_persists_l2_normalized_embedding() -> None:
    source = make_source()
    repository = FakeSemanticMemoryRepository([source])
    provider = DeterministicFakeEmbeddingProvider()
    service = SemanticMemoryMaterializationService(repository, provider)

    first = service.materialize_event_memories(source.novel_id)
    second = service.materialize_event_memories(source.novel_id)

    assert first["memory_chunk_count"] == 1
    assert first["embedded_count"] == 1
    assert second["embedded_count"] == 0
    assert second["reused_embedding_count"] == 1
    assert len(repository.chunks) == 1
    assert len(repository.embeddings) == 1
    embedding = next(iter(repository.embeddings.values()))
    norm = math.sqrt(sum(value * value for value in embedding.embedding))
    assert norm == pytest.approx(1.0)


def test_provider_failure_leaves_retryable_memory_chunk_without_embedding() -> None:
    source = make_source()
    repository = FakeSemanticMemoryRepository([source])
    service = SemanticMemoryMaterializationService(repository, FailingProvider())

    with pytest.raises(EmbeddingProviderError, match="Embedding failed"):
        service.materialize_event_memories(source.novel_id)

    assert len(repository.chunks) == 1
    assert repository.embeddings == {}


def test_embedding_versions_coexist_and_deleting_v2_keeps_chunk_and_v1() -> None:
    source = make_source()
    repository = FakeSemanticMemoryRepository([source])

    SemanticMemoryMaterializationService(
        repository, DeterministicFakeEmbeddingProvider()
    ).materialize_event_memories(source.novel_id)
    SemanticMemoryMaterializationService(
        repository, VersionTwoFakeProvider()
    ).materialize_event_memories(source.novel_id)

    chunk = next(iter(repository.chunks.values()))
    assert (chunk.memory_chunk_id, "fake-embedding-768-v1") in repository.embeddings
    assert (chunk.memory_chunk_id, "fake-embedding-768-v2") in repository.embeddings

    assert repository.delete_embedding_version(source.novel_id, "fake-embedding-768-v2") == 1
    assert len(repository.chunks) == 1
    assert (chunk.memory_chunk_id, "fake-embedding-768-v1") in repository.embeddings


def test_content_change_marks_old_version_stale_until_reembedded() -> None:
    source = make_source("First canonical summary")
    repository = FakeSemanticMemoryRepository([source])
    v1 = DeterministicFakeEmbeddingProvider()
    service = SemanticMemoryMaterializationService(repository, v1)
    service.materialize_event_memories(source.novel_id)

    chunk_before = next(iter(repository.chunks.values()))
    embedding_before = repository.get_embedding(
        source.novel_id, chunk_before.memory_chunk_id, v1.version
    )
    assert embedding_before is not None

    repository.sources = [replace(source, summary="Corrected canonical summary")]
    # Update content without invoking the v1 provider yet to demonstrate stale detection.
    changed_content = repository.sources[0].summary
    changed_hash = service._content_hash(changed_content)
    repository.upsert_memory_chunk(
        source.novel_id,
        source_key=f"event:{source.event_id}",
        memory_type="event_summary",
        content=changed_content,
        content_hash=changed_hash,
        importance_score=0.5,
        narrative_order=source.narrative_order,
        chapter_id=source.chapter_id,
        revision_id=source.revision_id,
        event_id=source.event_id,
        entity_id=None,
        entity_ids=source.entity_ids,
        metadata=source.metadata,
    )
    coverage = repository.embedding_coverage(source.novel_id, v1.version)
    assert coverage["embeddings"] == 1
    assert coverage["fresh_embeddings"] == 0

    result = service.materialize_event_memories(source.novel_id)
    assert result["embedded_count"] == 1
    assert result["fresh_embedding_count"] == 1


def test_inactive_event_chunk_is_removed_without_touching_other_sources() -> None:
    active = make_source("Active event")
    inactive = make_source("Soon superseded event")
    repository = FakeSemanticMemoryRepository([active, inactive])
    service = SemanticMemoryMaterializationService(
        repository, DeterministicFakeEmbeddingProvider()
    )
    service.materialize_event_memories(active.novel_id)
    assert len(repository.chunks) == 2

    repository.sources = [active]
    result = service.materialize_event_memories(active.novel_id)
    assert result["removed_chunk_count"] == 1
    assert {chunk.event_id for chunk in repository.chunks.values()} == {active.event_id}

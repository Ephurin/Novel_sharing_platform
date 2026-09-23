from __future__ import annotations

import hashlib
import math
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from application.semantic_memory_service import SemanticMemoryMaterializationService
from domain.embeddings import EmbeddingProviderError
from domain.repositories import SemanticMemoryRepository
from infrastructure.embedding_providers import DeterministicFakeEmbeddingProvider
from infrastructure.orm_models import Base, EventRecord, SCHEMA, StoryBrainRecord
from infrastructure.postgres_semantic_memory_repository import PostgresSemanticMemoryRepository


TENANT_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
NOVEL_ID = uuid.UUID("10000000-0000-0000-0000-000000000001")
BRAIN_ID = uuid.UUID("20000000-0000-0000-0000-000000000001")


@pytest.fixture()
def semantic_repo():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        execution_options={"schema_translate_map": {SCHEMA: None}},
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory.begin() as session:
        session.add(
            StoryBrainRecord(
                id=BRAIN_ID,
                tenant_id=TENANT_ID,
                novel_id=NOVEL_ID,
                status="active",
                brain_version=1,
                schema_version=1,
            )
        )
    repo = PostgresSemanticMemoryRepository(factory, tenant_id=TENANT_ID)
    assert isinstance(repo, SemanticMemoryRepository)
    try:
        yield repo, factory
    finally:
        Base.metadata.drop_all(engine)
        engine.dispose()


def _add_event(
    factory,
    *,
    event_id: uuid.UUID,
    summary: str,
    order: int,
    confirmation_status: str = "confirmed",
    supersedes_id: str | None = None,
) -> None:
    metadata = {"importance_score": 0.8}
    if supersedes_id:
        metadata["supersedes_id"] = supersedes_id
    with factory.begin() as session:
        session.add(
            EventRecord(
                id=event_id,
                story_brain_id=BRAIN_ID,
                tenant_id=TENANT_ID,
                novel_id=NOVEL_ID,
                narrative_order=order,
                event_type="test_event",
                summary=summary,
                participants=[],
                event_metadata=metadata,
                chapter_number=max(1, order // 1024),
                source_type="AI",
                confirmation_status=confirmation_status,
            )
        )


def test_only_confirmed_non_superseded_events_materialize(semantic_repo) -> None:
    repo, factory = semantic_repo
    original_id = uuid.uuid4()
    replacement_id = uuid.uuid4()
    pending_id = uuid.uuid4()
    _add_event(factory, event_id=original_id, summary="Old event", order=1024)
    _add_event(
        factory,
        event_id=replacement_id,
        summary="Corrected event",
        order=2048,
        supersedes_id=str(original_id),
    )
    _add_event(
        factory,
        event_id=pending_id,
        summary="Pending event",
        order=3072,
        confirmation_status="pending",
    )

    service = SemanticMemoryMaterializationService(
        repo, DeterministicFakeEmbeddingProvider()
    )
    result = service.materialize_event_memories(str(NOVEL_ID))
    chunks = repo.list_memory_chunks(str(NOVEL_ID))

    assert result["source_count"] == 1
    assert len(chunks) == 1
    assert chunks[0].content == "Corrected event"
    assert chunks[0].event_id == str(replacement_id)
    assert "Pending event" not in [chunk.content for chunk in chunks]


def test_retry_is_idempotent_and_persisted_vector_is_l2_normalized(semantic_repo) -> None:
    repo, factory = semantic_repo
    _add_event(factory, event_id=uuid.uuid4(), summary="A canonical event", order=1024)
    provider = DeterministicFakeEmbeddingProvider()
    service = SemanticMemoryMaterializationService(repo, provider)

    first = service.materialize_event_memories(str(NOVEL_ID))
    second = service.materialize_event_memories(str(NOVEL_ID))

    chunks = repo.list_memory_chunks(str(NOVEL_ID))
    embeddings = repo.list_embeddings_for_version(str(NOVEL_ID), provider.version)
    assert len(chunks) == 1
    assert len(embeddings) == 1
    assert first["embedded_count"] == 1
    assert second["embedded_count"] == 0
    assert second["reused_embedding_count"] == 1

    vector = embeddings[0].embedding
    assert len(vector) == 768
    assert math.sqrt(sum(value * value for value in vector)) == pytest.approx(1.0)


def test_embedding_versions_coexist_and_old_version_survives_reindex(semantic_repo) -> None:
    repo, factory = semantic_repo
    _add_event(factory, event_id=uuid.uuid4(), summary="Versioned memory", order=1024)

    v1 = DeterministicFakeEmbeddingProvider()
    v2 = DeterministicFakeEmbeddingProvider()
    v2.version = "fake-embedding-768-v2"
    v2.model = "fake-embedding-v2"

    SemanticMemoryMaterializationService(repo, v1).materialize_event_memories(
        str(NOVEL_ID)
    )
    SemanticMemoryMaterializationService(repo, v2).materialize_event_memories(
        str(NOVEL_ID)
    )

    assert len(repo.list_memory_chunks(str(NOVEL_ID))) == 1
    assert len(repo.list_embeddings_for_version(str(NOVEL_ID), v1.version)) == 1
    assert len(repo.list_embeddings_for_version(str(NOVEL_ID), v2.version)) == 1

    assert repo.delete_embedding_version(str(NOVEL_ID), v2.version) == 1
    assert len(repo.list_memory_chunks(str(NOVEL_ID))) == 1
    assert len(repo.list_embeddings_for_version(str(NOVEL_ID), v1.version)) == 1


def test_content_hash_detects_stale_embedding(semantic_repo) -> None:
    repo, factory = semantic_repo
    event_id = uuid.uuid4()
    _add_event(factory, event_id=event_id, summary="Original memory", order=1024)
    provider = DeterministicFakeEmbeddingProvider()
    SemanticMemoryMaterializationService(repo, provider).materialize_event_memories(
        str(NOVEL_ID)
    )
    chunk = repo.list_memory_chunks(str(NOVEL_ID))[0]

    updated_content = "Updated derived content"
    repo.upsert_memory_chunk(
        str(NOVEL_ID),
        source_key=chunk.source_key,
        memory_type=chunk.memory_type,
        content=updated_content,
        content_hash=hashlib.sha256(updated_content.encode("utf-8")).hexdigest(),
        importance_score=chunk.importance_score,
        narrative_order=chunk.narrative_order,
        chapter_id=chunk.chapter_id,
        revision_id=chunk.revision_id,
        event_id=chunk.event_id,
        entity_id=chunk.entity_id,
        entity_ids=chunk.entity_ids,
        metadata=chunk.metadata,
    )

    coverage = repo.embedding_coverage(str(NOVEL_ID), provider.version)
    assert coverage == {
        "total_chunks": 1,
        "embedded": 1,
        "current": 0,
        "stale": 1,
        "missing": 0,
    }


def test_provider_failure_leaves_memory_chunk_retryable(semantic_repo) -> None:
    repo, factory = semantic_repo
    _add_event(factory, event_id=uuid.uuid4(), summary="Retryable memory", order=1024)

    class FailingProvider:
        model = "failure"
        version = "failure-768-v1"
        dimension = 768

        def embed_document(self, text: str):
            raise EmbeddingProviderError("provider unavailable")

    service = SemanticMemoryMaterializationService(repo, FailingProvider())
    with pytest.raises(EmbeddingProviderError):
        service.materialize_event_memories(str(NOVEL_ID))

    assert len(repo.list_memory_chunks(str(NOVEL_ID))) == 1
    assert repo.list_embeddings_for_version(str(NOVEL_ID), FailingProvider.version) == []
    coverage = repo.embedding_coverage(str(NOVEL_ID), FailingProvider.version)
    assert coverage["missing"] == 1


def test_wrong_dimension_is_rejected_before_persistence(semantic_repo) -> None:
    repo, factory = semantic_repo
    _add_event(factory, event_id=uuid.uuid4(), summary="Dimension test", order=1024)

    class WrongDimensionProvider:
        model = "wrong"
        version = "wrong-767-v1"
        dimension = 768

        def embed_document(self, text: str):
            return [0.25] * 767

    with pytest.raises(EmbeddingProviderError, match="dimension mismatch"):
        SemanticMemoryMaterializationService(
            repo, WrongDimensionProvider()
        ).materialize_event_memories(str(NOVEL_ID))

    assert len(repo.list_memory_chunks(str(NOVEL_ID))) == 1
    assert repo.list_embeddings_for_version(
        str(NOVEL_ID), WrongDimensionProvider.version
    ) == []

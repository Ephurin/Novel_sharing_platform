from __future__ import annotations

import math
import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import sessionmaker

from application.semantic_memory_service import SemanticMemoryMaterializationService
from domain.models import NarrativeEvent, SemanticMemoryEmbedding
from infrastructure.embedding_providers import DeterministicFakeEmbeddingProvider
from infrastructure.orm_models import (
    MemoryChunkRecord,
    MemoryEmbeddingRecord,
    SCHEMA,
)
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from infrastructure.postgres_semantic_memory_repository import (
    PostgresSemanticMemoryRepository,
)


pytestmark = pytest.mark.postgres_integration
SERVICE_ROOT = Path(__file__).resolve().parent.parent


def get_postgres_url() -> str:
    url = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url or not url.startswith("postgresql"):
        raise pytest.UsageError("TEST_DATABASE_URL must point to disposable PostgreSQL")
    return url


@pytest.fixture(scope="module")
def pg_engine():
    engine = create_engine(
        get_postgres_url(),
        pool_pre_ping=True,
        connect_args={"connect_timeout": 5},
    )
    cfg = Config(str(SERVICE_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(SERVICE_ROOT / "migrations"))
    cfg.set_main_option("sqlalchemy.url", get_postgres_url())
    command.upgrade(cfg, "head")
    yield engine
    engine.dispose()


@pytest.fixture
def session_factory(pg_engine):
    return sessionmaker(bind=pg_engine, expire_on_commit=False)


class VersionTwoFakeProvider(DeterministicFakeEmbeddingProvider):
    model = "fake-embedding-v2"
    version = "fake-embedding-768-v2"


def _repos(session_factory):
    tenant_id = str(uuid.uuid4())
    actor_id = str(uuid.uuid4())
    narrative = PostgresNarrativeRepository(
        session_factory,
        tenant_id=tenant_id,
        actor_id=actor_id,
    )
    semantic = PostgresSemanticMemoryRepository(
        session_factory,
        tenant_id=tenant_id,
    )
    return tenant_id, narrative, semantic


def test_pgvector_extension_schema_and_dimension_are_live(pg_engine) -> None:
    inspector = inspect(pg_engine)
    tables = set(inspector.get_table_names(schema=SCHEMA))
    assert {"memory_chunks", "memory_embeddings"}.issubset(tables)

    chunk_columns = {column["name"] for column in inspector.get_columns("memory_chunks", schema=SCHEMA)}
    assert "embedding" not in chunk_columns

    with pg_engine.connect() as connection:
        extension = connection.scalar(
            text("SELECT extname FROM pg_extension WHERE extname = 'vector'")
        )
        vector_type = connection.scalar(
            text(
                """
                SELECT format_type(a.atttypid, a.atttypmod)
                FROM pg_attribute a
                JOIN pg_class c ON c.oid = a.attrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = :schema
                  AND c.relname = 'memory_embeddings'
                  AND a.attname = 'embedding'
                  AND a.attnum > 0
                  AND NOT a.attisdropped
                """
            ),
            {"schema": SCHEMA},
        )
    assert extension == "vector"
    assert vector_type == "vector(768)"


def test_event_sources_filter_unconfirmed_and_superseded_rows(session_factory) -> None:
    tenant_id, narrative, semantic = _repos(session_factory)
    novel_id = str(uuid.uuid4())

    original_external = str(uuid.uuid4())
    narrative.append_event(
        novel_id,
        NarrativeEvent(
            event_id=original_external,
            event_type="meeting",
            summary="Original event that will be corrected",
            chapter=2,
        ),
    )
    original_db_id = narrative.get_story_brain(novel_id).events[0].event_id

    narrative.append_event(
        novel_id,
        NarrativeEvent(
            event_id=str(uuid.uuid4()),
            event_type="meeting",
            summary="Corrected active event",
            chapter=2,
            metadata={"supersedes_id": original_db_id},
        ),
    )

    novel_uuid = narrative._novel_id(novel_id)
    with session_factory() as session:
        brain = narrative._get_or_create_brain(session, novel_uuid)
        from infrastructure.orm_models import EventRecord

        session.add_all(
            [
                EventRecord(
                    story_brain_id=brain.id,
                    tenant_id=uuid.UUID(tenant_id),
                    novel_id=novel_uuid,
                    narrative_order=3072,
                    event_type="draft",
                    summary="Pending event",
                    chapter_number=3,
                    confirmation_status="pending",
                ),
                EventRecord(
                    story_brain_id=brain.id,
                    tenant_id=uuid.UUID(tenant_id),
                    novel_id=novel_uuid,
                    narrative_order=4096,
                    event_type="draft",
                    summary="Rejected event",
                    chapter_number=4,
                    confirmation_status="rejected",
                ),
            ]
        )
        session.commit()

    sources = semantic.list_event_memory_sources(novel_id)
    assert [source.summary for source in sources] == ["Corrected active event"]


def test_materialization_keeps_parallel_versions_and_tenant_isolation(session_factory) -> None:
    tenant_id, narrative, semantic = _repos(session_factory)
    novel_id = str(uuid.uuid4())
    narrative.append_event(
        novel_id,
        NarrativeEvent(
            event_id=str(uuid.uuid4()),
            event_type="discovery",
            summary="Mira discovers the sealed observatory",
            chapter=7,
        ),
    )

    v1 = DeterministicFakeEmbeddingProvider()
    v2 = VersionTwoFakeProvider()
    first = SemanticMemoryMaterializationService(semantic, v1).materialize_event_memories(novel_id)
    second = SemanticMemoryMaterializationService(semantic, v2).materialize_event_memories(novel_id)

    assert first["fresh_embedding_count"] == 1
    assert second["fresh_embedding_count"] == 1
    chunks = semantic.list_memory_chunks(novel_id)
    assert len(chunks) == 1
    chunk = chunks[0]
    assert semantic.get_embedding(novel_id, chunk.memory_chunk_id, v1.version) is not None
    assert semantic.get_embedding(novel_id, chunk.memory_chunk_id, v2.version) is not None

    other_tenant = PostgresSemanticMemoryRepository(
        session_factory,
        tenant_id=str(uuid.uuid4()),
    )
    assert other_tenant.list_memory_chunks(novel_id) == []

    assert semantic.delete_embedding_version(novel_id, v2.version) == 1
    assert semantic.get_embedding(novel_id, chunk.memory_chunk_id, v1.version) is not None
    assert semantic.list_memory_chunks(novel_id)[0].content == chunk.content


def test_wrong_dimension_rejected_and_exact_cosine_ordering_works(session_factory) -> None:
    _, narrative, semantic = _repos(session_factory)
    novel_id = str(uuid.uuid4())
    narrative.append_event(
        novel_id,
        NarrativeEvent(
            event_id=str(uuid.uuid4()),
            event_type="first",
            summary="First semantic memory",
            chapter=1,
        ),
    )
    narrative.append_event(
        novel_id,
        NarrativeEvent(
            event_id=str(uuid.uuid4()),
            event_type="second",
            summary="Second semantic memory",
            chapter=2,
        ),
    )
    sources = semantic.list_event_memory_sources(novel_id)
    chunks = []
    for source in sources:
        content_hash = SemanticMemoryMaterializationService._content_hash(source.summary)
        chunks.append(
            semantic.upsert_memory_chunk(
                novel_id,
                source_key=f"event:{source.event_id}",
                memory_type="event_summary",
                content=source.summary,
                content_hash=content_hash,
                importance_score=0.5,
                narrative_order=source.narrative_order,
                chapter_id=source.chapter_id,
                revision_id=source.revision_id,
                event_id=source.event_id,
                entity_id=None,
                entity_ids=source.entity_ids,
                metadata=source.metadata,
            )
        )

    invalid = SemanticMemoryEmbedding(
        embedding_id=str(uuid.uuid4()),
        memory_chunk_id=chunks[0].memory_chunk_id,
        story_brain_id=chunks[0].story_brain_id,
        tenant_id=chunks[0].tenant_id,
        novel_id=chunks[0].novel_id,
        embedding_model="test",
        embedding_version="test-768-v1",
        embedding_dimension=2,
        normalization="l2",
        content_hash=chunks[0].content_hash,
        embedding=(1.0, 0.0),
    )
    with pytest.raises(ValueError, match="768 dimensions"):
        semantic.upsert_embedding(novel_id, invalid)

    vector_a = tuple([1.0] + [0.0] * 767)
    vector_b = tuple([0.0, 1.0] + [0.0] * 766)
    for chunk, vector in zip(chunks, (vector_a, vector_b)):
        semantic.upsert_embedding(
            novel_id,
            SemanticMemoryEmbedding(
                embedding_id=str(uuid.uuid4()),
                memory_chunk_id=chunk.memory_chunk_id,
                story_brain_id=chunk.story_brain_id,
                tenant_id=chunk.tenant_id,
                novel_id=chunk.novel_id,
                embedding_model="test",
                embedding_version="test-768-v1",
                embedding_dimension=768,
                normalization="l2",
                content_hash=chunk.content_hash,
                embedding=vector,
            ),
        )

    with session_factory() as session:
        ranked = session.scalars(
            select(MemoryEmbeddingRecord)
            .where(
                MemoryEmbeddingRecord.embedding_version == "test-768-v1",
                MemoryEmbeddingRecord.tenant_id == uuid.UUID(chunks[0].tenant_id),
                MemoryEmbeddingRecord.novel_id == uuid.UUID(chunks[0].novel_id),
            )
            .order_by(MemoryEmbeddingRecord.embedding.cosine_distance(list(vector_a)))
        ).all()
    assert [str(row.memory_chunk_id) for row in ranked] == [
        chunks[0].memory_chunk_id,
        chunks[1].memory_chunk_id,
    ]

    with pg_engine_for(session_factory).connect() as connection:
        with pytest.raises(DBAPIError):
            connection.execute(text("SELECT '[1,2]'::vector(768)"))


def pg_engine_for(session_factory):
    return session_factory.kw["bind"]


def test_migration_downgrade_reupgrade_preserves_canonical_data(session_factory) -> None:
    _, narrative, _ = _repos(session_factory)
    novel_id = str(uuid.uuid4())
    narrative.upsert_entity(novel_id, {"name": "Persistent Canonical Entity", "type": "PER"})

    cfg = Config(str(SERVICE_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(SERVICE_ROOT / "migrations"))
    cfg.set_main_option("sqlalchemy.url", get_postgres_url())

    command.downgrade(cfg, "0006_fix_revision_provenance")
    inspector = inspect(pg_engine_for(session_factory))
    tables = set(inspector.get_table_names(schema=SCHEMA))
    assert "memory_chunks" not in tables
    assert "memory_embeddings" not in tables
    assert "entities" in tables
    assert [entity.name for entity in narrative.list_entities(novel_id)] == [
        "Persistent Canonical Entity"
    ]

    command.upgrade(cfg, "head")
    inspector = inspect(pg_engine_for(session_factory))
    tables = set(inspector.get_table_names(schema=SCHEMA))
    assert {"memory_chunks", "memory_embeddings"}.issubset(tables)
    assert [entity.name for entity in narrative.list_entities(novel_id)] == [
        "Persistent Canonical Entity"
    ]

from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from domain.models import SemanticMemoryEmbedding
from infrastructure.orm_models import MemoryEmbeddingRecord, SCHEMA, StoryBrainRecord
from infrastructure.semantic_memory_repository import PostgresSemanticMemoryRepository


pytestmark = pytest.mark.postgres_integration
SERVICE_ROOT = Path(__file__).resolve().parents[1]


def _database_url() -> str:
    value = (
        os.getenv("TEST_DATABASE_URL")
        or os.getenv("DATABASE_URL")
        or ""
    ).strip()
    if not value:
        pytest.skip("TEST_DATABASE_URL is required for live pgvector integration")
    return value


def _alembic_config(url: str) -> Config:
    cfg = Config(str(SERVICE_ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(SERVICE_ROOT / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def _vector(values: list[float]) -> str:
    return "[" + ",".join(str(value) for value in values) + "]"


def test_live_pgvector_semantic_memory_foundation() -> None:
    url = _database_url()
    cfg = _alembic_config(url)
    engine = create_engine(url, pool_pre_ping=True)

    # Start from the current canonical migration head and apply P7-02.
    command.upgrade(cfg, "head")

    with engine.connect() as conn:
        extension = conn.execute(
            text("SELECT extname FROM pg_extension WHERE extname = 'vector'")
        ).scalar_one()
        assert extension == "vector"
        vector_type = conn.execute(
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
        ).scalar_one()
        assert vector_type == "vector(768)"

    tenant_id = uuid.uuid4()
    novel_id = uuid.uuid4()
    brain_id = uuid.uuid4()
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory.begin() as session:
        session.add(
            StoryBrainRecord(
                id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                status="active",
                brain_version=1,
                schema_version=1,
            )
        )

    repo = PostgresSemanticMemoryRepository(factory, tenant_id=tenant_id)
    chunk_a = repo.upsert_memory_chunk(
        str(novel_id),
        source_key="event:a",
        memory_type="event_summary",
        content="Alpha memory",
        content_hash="a" * 64,
        importance_score=0.8,
        narrative_order=1024,
        chapter_id=None,
        revision_id=None,
        event_id=None,
        entity_id=None,
        entity_ids=(),
        metadata={"chapter_number": 1},
    )
    chunk_b = repo.upsert_memory_chunk(
        str(novel_id),
        source_key="event:b",
        memory_type="event_summary",
        content="Beta memory",
        content_hash="b" * 64,
        importance_score=0.7,
        narrative_order=2048,
        chapter_id=None,
        revision_id=None,
        event_id=None,
        entity_id=None,
        entity_ids=(),
        metadata={"chapter_number": 2},
    )

    first = [0.0] * 768
    second = [0.0] * 768
    first[0] = 1.0
    second[1] = 1.0
    version = "integration-768-v1"

    for chunk, values, hash_value in (
        (chunk_a, first, "a" * 64),
        (chunk_b, second, "b" * 64),
    ):
        repo.upsert_embedding(
            str(novel_id),
            SemanticMemoryEmbedding(
                embedding_id=str(uuid.uuid4()),
                memory_chunk_id=chunk.memory_chunk_id,
                story_brain_id=chunk.story_brain_id,
                tenant_id=chunk.tenant_id,
                novel_id=chunk.novel_id,
                embedding_model="integration-model",
                embedding_version=version,
                embedding_dimension=768,
                normalization="l2",
                content_hash=hash_value,
                embedding=tuple(values),
            ),
        )

    # Exact cosine ordering must be deterministic within one embedding version.
    with engine.connect() as conn:
        ranked = conn.execute(
            text(
                f"""
                SELECT memory_chunk_id::text
                FROM {SCHEMA}.memory_embeddings
                WHERE embedding_version = :version
                ORDER BY embedding <=> CAST(:query_vector AS vector)
                """
            ),
            {"version": version, "query_vector": _vector(first)},
        ).scalars().all()
        assert ranked[:2] == [chunk_a.memory_chunk_id, chunk_b.memory_chunk_id]

    # A different version can coexist for the same memory without replacing v1.
    version_two = "integration-768-v2"
    repo.upsert_embedding(
        str(novel_id),
        SemanticMemoryEmbedding(
            embedding_id=str(uuid.uuid4()),
            memory_chunk_id=chunk_a.memory_chunk_id,
            story_brain_id=chunk_a.story_brain_id,
            tenant_id=chunk_a.tenant_id,
            novel_id=chunk_a.novel_id,
            embedding_model="integration-model-v2",
            embedding_version=version_two,
            embedding_dimension=768,
            normalization="l2",
            content_hash="a" * 64,
            embedding=tuple(second),
        ),
    )
    assert len(repo.list_embeddings_for_version(str(novel_id), version)) == 2
    assert len(repo.list_embeddings_for_version(str(novel_id), version_two)) == 1

    # Application validation and the physical vector type both reject bad dimensions.
    with pytest.raises(ValueError, match="768"):
        repo.upsert_embedding(
            str(novel_id),
            SemanticMemoryEmbedding(
                embedding_id=str(uuid.uuid4()),
                memory_chunk_id=chunk_a.memory_chunk_id,
                story_brain_id=chunk_a.story_brain_id,
                tenant_id=chunk_a.tenant_id,
                novel_id=chunk_a.novel_id,
                embedding_model="bad",
                embedding_version="bad-dimension",
                embedding_dimension=767,
                normalization="l2",
                content_hash="a" * 64,
                embedding=tuple([1.0] * 767),
            ),
        )

    with pytest.raises(Exception):
        with factory.begin() as session:
            session.add(
                MemoryEmbeddingRecord(
                    id=uuid.uuid4(),
                    memory_chunk_id=uuid.UUID(chunk_b.memory_chunk_id),
                    story_brain_id=brain_id,
                    tenant_id=tenant_id,
                    novel_id=novel_id,
                    embedding_model="bad-db",
                    embedding_version="bad-db-768-v1",
                    embedding_dimension=768,
                    normalization="l2",
                    content_hash="b" * 64,
                    embedding=[1.0] * 767,
                )
            )

    # Tenant isolation is fail-closed: the same novel is not visible without a
    # Story Brain owned by the requesting tenant.
    other_repo = PostgresSemanticMemoryRepository(factory, tenant_id=uuid.uuid4())
    with pytest.raises(KeyError):
        other_repo.list_memory_chunks(str(novel_id))

    # Downgrade owns only the derived semantic-memory tables. Canonical Story
    # Brain data must survive, then re-upgrade must recreate pgvector storage.
    command.downgrade(cfg, "0006_fix_revision_provenance")
    inspector = inspect(engine)
    assert "memory_chunks" not in inspector.get_table_names(schema=SCHEMA)
    assert "memory_embeddings" not in inspector.get_table_names(schema=SCHEMA)
    with engine.connect() as conn:
        preserved = conn.execute(
            text(
                f"SELECT count(*) FROM {SCHEMA}.story_brains "
                "WHERE id = :brain_id AND tenant_id = :tenant_id"
            ),
            {"brain_id": brain_id, "tenant_id": tenant_id},
        ).scalar_one()
        assert preserved == 1

    command.upgrade(cfg, "head")
    inspector = inspect(engine)
    assert "memory_chunks" in inspector.get_table_names(schema=SCHEMA)
    assert "memory_embeddings" in inspector.get_table_names(schema=SCHEMA)
    with engine.connect() as conn:
        extension_after = conn.execute(
            text("SELECT extname FROM pg_extension WHERE extname = 'vector'")
        ).scalar_one()
        assert extension_after == "vector"

    engine.dispose()

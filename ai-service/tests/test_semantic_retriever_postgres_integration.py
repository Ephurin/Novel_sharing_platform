from __future__ import annotations

import hashlib
import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from domain.models import NarrativeEvent, SemanticMemoryEmbedding
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from infrastructure.postgres_semantic_memory_repository import (
    PostgresSemanticMemoryRepository,
)
from infrastructure.orm_models import (
    EntityRecord,
    EventParticipantRecord,
    EventRecord,
    RelationshipRecord,
    StoryBrainRecord,
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


def _repos(session_factory, *, tenant_id: str | None = None):
    tenant = tenant_id or str(uuid.uuid4())
    narrative = PostgresNarrativeRepository(
        session_factory,
        tenant_id=tenant,
        actor_id=str(uuid.uuid4()),
    )
    semantic = PostgresSemanticMemoryRepository(
        session_factory,
        tenant_id=tenant,
    )
    return tenant, narrative, semantic


def _hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _unit_axis(first: float, second: float = 0.0) -> tuple[float, ...]:
    norm = (first * first + second * second) ** 0.5
    return tuple([first / norm, second / norm] + [0.0] * 766)


def _materialize_chunk(semantic, novel_id: str, source, *, content: str | None = None):
    value = source.summary if content is None else content
    return semantic.upsert_memory_chunk(
        novel_id,
        source_key=f"event:{source.event_id}",
        memory_type="event_summary",
        content=value,
        content_hash=_hash(value),
        importance_score=0.5,
        narrative_order=source.narrative_order,
        chapter_id=source.chapter_id,
        revision_id=source.revision_id,
        event_id=source.event_id,
        entity_id=None,
        entity_ids=source.entity_ids,
        metadata=source.metadata,
    )


def _embed(semantic, novel_id: str, chunk, *, version: str, vector: tuple[float, ...]):
    return semantic.upsert_embedding(
        novel_id,
        SemanticMemoryEmbedding(
            embedding_id=str(uuid.uuid4()),
            memory_chunk_id=chunk.memory_chunk_id,
            story_brain_id=chunk.story_brain_id,
            tenant_id=chunk.tenant_id,
            novel_id=chunk.novel_id,
            embedding_model=version.split("-768-")[0],
            embedding_version=version,
            embedding_dimension=768,
            normalization="l2",
            content_hash=chunk.content_hash,
            embedding=vector,
        ),
    )


def test_exact_retrieval_filters_time_version_freshness_and_scope(session_factory) -> None:
    tenant_id, narrative, semantic = _repos(session_factory)
    novel_id = str(uuid.uuid4())

    narrative.append_event(
        novel_id,
        NarrativeEvent(
            event_id=str(uuid.uuid4()),
            event_type="old_memory",
            summary="An old oath binds the observatory guardians.",
            chapter=2,
        ),
    )
    narrative.append_event(
        novel_id,
        NarrativeEvent(
            event_id=str(uuid.uuid4()),
            event_type="stale_memory",
            summary="A stale memory that will be edited after embedding.",
            chapter=3,
        ),
    )
    narrative.append_event(
        novel_id,
        NarrativeEvent(
            event_id=str(uuid.uuid4()),
            event_type="future_memory",
            summary="A future revelation occurs much later.",
            chapter=20,
        ),
    )

    sources = semantic.list_event_memory_sources(novel_id)
    by_summary = {source.summary: source for source in sources}

    old = _materialize_chunk(
        semantic,
        novel_id,
        by_summary["An old oath binds the observatory guardians."],
    )
    stale = _materialize_chunk(
        semantic,
        novel_id,
        by_summary["A stale memory that will be edited after embedding."],
    )
    future = _materialize_chunk(
        semantic,
        novel_id,
        by_summary["A future revelation occurs much later."],
    )

    v1 = "test-model-768-v1"
    v2 = "test-model-768-v2"
    query = _unit_axis(1.0)

    # v1: future would be the best match if temporal filtering were applied too late.
    _embed(semantic, novel_id, old, version=v1, vector=_unit_axis(0.8, 0.6))
    _embed(semantic, novel_id, stale, version=v1, vector=_unit_axis(0.95, 0.3122498999))
    _embed(semantic, novel_id, future, version=v1, vector=query)

    # A different embedding version must never contaminate v1 retrieval.
    _embed(semantic, novel_id, old, version=v2, vector=query)

    # Change chunk content after v1 embedding; the old v1 row must become stale
    # and be excluded by hash equality in the retrieval SQL.
    edited_stale = _materialize_chunk(
        semantic,
        novel_id,
        by_summary["A stale memory that will be edited after embedding."],
        content="Edited stale memory with a new content hash.",
    )
    assert edited_stale.content_hash != stale.content_hash

    early = semantic.search_semantic_memories(
        novel_id,
        query_embedding=query,
        embedding_version=v1,
        chapter_number=5,
        limit=10,
    )
    assert [item.memory_chunk_id for item in early] == [old.memory_chunk_id]
    assert all((item.chapter_number or 0) <= 5 for item in early)
    assert all(item.embedding_version == v1 for item in early)

    late = semantic.search_semantic_memories(
        novel_id,
        query_embedding=query,
        embedding_version=v1,
        chapter_number=25,
        limit=10,
    )
    assert [item.memory_chunk_id for item in late] == [
        future.memory_chunk_id,
        old.memory_chunk_id,
    ]
    assert late[0].cosine_distance < late[1].cosine_distance

    version_two = semantic.search_semantic_memories(
        novel_id,
        query_embedding=query,
        embedding_version=v2,
        chapter_number=5,
        limit=10,
    )
    assert [item.memory_chunk_id for item in version_two] == [old.memory_chunk_id]

    other_tenant = PostgresSemanticMemoryRepository(
        session_factory,
        tenant_id=str(uuid.uuid4()),
    )
    assert other_tenant.search_semantic_memories(
        novel_id,
        query_embedding=query,
        embedding_version=v1,
        chapter_number=25,
        limit=10,
    ) == []

    # Same tenant but another novel/story brain cannot see these rows.
    other_novel = str(uuid.uuid4())
    narrative.append_event(
        other_novel,
        NarrativeEvent(
            event_id=str(uuid.uuid4()),
            event_type="other_story",
            summary="Another story memory.",
            chapter=1,
        ),
    )
    assert semantic.search_semantic_memories(
        other_novel,
        query_embedding=query,
        embedding_version=v1,
        chapter_number=25,
        limit=10,
    ) == []


def test_repository_rejects_non_normalized_or_wrong_dimension_query(session_factory) -> None:
    _, narrative, semantic = _repos(session_factory)
    novel_id = str(uuid.uuid4())
    narrative.append_event(
        novel_id,
        NarrativeEvent(
            event_id=str(uuid.uuid4()),
            event_type="seed",
            summary="Seed event",
            chapter=1,
        ),
    )

    with pytest.raises(ValueError, match="768 dimensions"):
        semantic.search_semantic_memories(
            novel_id,
            query_embedding=(1.0, 0.0),
            embedding_version="test-model-768-v1",
            chapter_number=1,
        )

    with pytest.raises(ValueError, match="L2-normalized"):
        semantic.search_semantic_memories(
            novel_id,
            query_embedding=tuple([2.0] + [0.0] * 767),
            embedding_version="test-model-768-v1",
            chapter_number=1,
        )


def test_superseded_event_is_excluded_even_before_chunk_cleanup(session_factory) -> None:
    _, narrative, semantic = _repos(session_factory)
    novel_id = str(uuid.uuid4())

    original_external_id = str(uuid.uuid4())
    narrative.append_event(
        novel_id,
        NarrativeEvent(
            event_id=original_external_id,
            event_type="meeting",
            summary="Original memory that is about to be superseded.",
            chapter=2,
        ),
    )
    original_source = semantic.list_event_memory_sources(novel_id)[0]
    original_chunk = _materialize_chunk(semantic, novel_id, original_source)
    query = _unit_axis(1.0)
    _embed(
        semantic,
        novel_id,
        original_chunk,
        version="test-model-768-v1",
        vector=query,
    )

    # Add the correction but intentionally do NOT run materializer cleanup.
    # Retrieval itself must already exclude the now-superseded original.
    narrative.append_event(
        novel_id,
        NarrativeEvent(
            event_id=str(uuid.uuid4()),
            event_type="meeting",
            summary="Corrected active memory.",
            chapter=2,
            metadata={"supersedes_id": original_external_id},
        ),
    )

    matches = semantic.search_semantic_memories(
        novel_id,
        query_embedding=query,
        embedding_version="test-model-768-v1",
        chapter_number=5,
        limit=10,
    )
    assert matches == []


def test_repository_requires_temporal_cutoff(session_factory) -> None:
    _, narrative, semantic = _repos(session_factory)
    novel_id = str(uuid.uuid4())
    narrative.append_event(
        novel_id,
        NarrativeEvent(
            event_id=str(uuid.uuid4()),
            event_type="seed",
            summary="Seed event",
            chapter=1,
        ),
    )

    with pytest.raises(ValueError, match="chapter cutoff"):
        semantic.search_semantic_memories(
            novel_id,
            query_embedding=_unit_axis(1.0),
            embedding_version="test-model-768-v1",
            chapter_number=None,
        )



def test_hybrid_signal_resolution_is_temporal_and_tenant_scoped(session_factory) -> None:
    tenant_id, narrative, semantic = _repos(session_factory)
    novel_id = str(uuid.uuid4())

    narrative.upsert_entity(
        novel_id,
        {"name": "Elena", "type": "character"},
    )
    narrative.upsert_entity(
        novel_id,
        {"name": "Alan", "type": "character"},
    )
    narrative.upsert_entity(
        novel_id,
        {"name": "Valora", "type": "character"},
    )
    narrative.append_event(
        novel_id,
        NarrativeEvent(
            event_id=str(uuid.uuid4()),
            event_type="early_alliance",
            summary="Elena and Alan coordinate early.",
            chapter=2,
        ),
    )
    narrative.append_event(
        novel_id,
        NarrativeEvent(
            event_id=str(uuid.uuid4()),
            event_type="future_alliance",
            summary="Elena meets Valora later.",
            chapter=10,
        ),
    )

    with session_factory.begin() as session:
        brain = session.scalar(
            select(StoryBrainRecord).where(
                StoryBrainRecord.tenant_id == uuid.UUID(tenant_id),
                StoryBrainRecord.novel_id == uuid.UUID(novel_id),
            )
        )
        assert brain is not None
        entities = {
            row.canonical_name: row
            for row in session.scalars(
                select(EntityRecord).where(
                    EntityRecord.story_brain_id == brain.id,
                    EntityRecord.tenant_id == uuid.UUID(tenant_id),
                    EntityRecord.novel_id == uuid.UUID(novel_id),
                )
            ).all()
        }
        events = {
            row.summary: row
            for row in session.scalars(
                select(EventRecord).where(
                    EventRecord.story_brain_id == brain.id,
                    EventRecord.tenant_id == uuid.UUID(tenant_id),
                    EventRecord.novel_id == uuid.UUID(novel_id),
                )
            ).all()
        }
        for name in ("Elena", "Alan"):
            session.add(
                EventParticipantRecord(
                    event_id=events["Elena and Alan coordinate early."].id,
                    entity_id=entities[name].id,
                    participant_role="actor",
                )
            )
        for name in ("Elena", "Valora"):
            session.add(
                EventParticipantRecord(
                    event_id=events["Elena meets Valora later."].id,
                    entity_id=entities[name].id,
                    participant_role="actor",
                )
            )
        session.add(
            RelationshipRecord(
                story_brain_id=brain.id,
                tenant_id=uuid.UUID(tenant_id),
                novel_id=uuid.UUID(novel_id),
                subject_name="Elena",
                relation_type="allies",
                object_name="Valora",
                source_type="author",
                relation_metadata={"first_chapter": 10},
            )
        )

    early = semantic.get_hybrid_ranking_signals(
        novel_id,
        query_text="What do Elena and Valora trust each other to do?",
        chapter_number=5,
    )
    with session_factory() as session:
        ids = {
            row.canonical_name: str(row.id)
            for row in session.scalars(
                select(EntityRecord).where(
                    EntityRecord.tenant_id == uuid.UUID(tenant_id),
                    EntityRecord.novel_id == uuid.UUID(novel_id),
                )
            ).all()
        }

    assert early.query_entity_ids == (ids["Elena"],)
    assert ids["Alan"] in early.related_entity_ids
    assert ids["Valora"] not in early.query_entity_ids
    assert ids["Valora"] not in early.related_entity_ids

    late = semantic.get_hybrid_ranking_signals(
        novel_id,
        query_text="What do Elena and Valora trust each other to do?",
        chapter_number=12,
    )
    assert set(late.query_entity_ids) == {ids["Elena"], ids["Valora"]}
    assert ids["Alan"] in late.related_entity_ids

    other_tenant = PostgresSemanticMemoryRepository(
        session_factory,
        tenant_id=str(uuid.uuid4()),
    )
    assert other_tenant.get_hybrid_ranking_signals(
        novel_id,
        query_text="Elena and Valora",
        chapter_number=12,
    ).query_entity_ids == ()

from __future__ import annotations

import hashlib
import os
import uuid
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core.story_kb_manager import KBEntity, KBRelation, StoryKB, StoryKBManager
from domain.models import NarrativeEntity, NarrativeEvent
from domain.projection import project
from infrastructure.json_postgres_cutover import (
    CutoverMigrationError,
    JsonPostgresCutoverMigrator,
    canonical_snapshot,
    legacy_entity_uuid,
)
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository


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


def _seed_json(storage: Path, story_id: str, *, unsupported: bool = False) -> tuple[StoryKBManager, str]:
    manager = StoryKBManager(storage)
    hero_id = str(legacy_entity_uuid(story_id, "Elena"))
    ally_id = str(legacy_entity_uuid(story_id, "Alan"))
    event_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{story_id}:event:meeting"))
    fact_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{story_id}:fact:health"))
    fact_transition_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{story_id}:transition:health"))
    event_transition_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{story_id}:transition:location"))
    alias_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"alias:{hero_id}:the astronomer"))
    mention_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{story_id}:mention:elena"))
    proposal_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{story_id}:proposal:pending-fact"))

    entities = [
        NarrativeEntity(
            name="Elena",
            entity_id=hero_id,
            entity_type="character",
            status="Alive",
            location="Observatory",
            mentions=7,
            is_locked=False,
        ),
        NarrativeEntity(
            name="Alan",
            entity_id=ally_id,
            entity_type="character",
            status="Alive",
            location="Archive",
            mentions=3,
            is_locked=True,
        ),
    ]
    facts = [
        {
            "fact_id": fact_id,
            "subject_entity_id": hero_id,
            "fact_type": "character_state",
            "fact_key": "health",
            "fact_value": 90,
            "is_locked": False,
            "priority": 2,
        }
    ]
    events = [
        NarrativeEvent(
            event_id=event_id,
            event_type="meeting",
            participants=(hero_id, ally_id),
            summary="Elena meets Alan at the observatory.",
            chapter=2,
            metadata={"importance_score": 0.8, "source": "author"},
        )
    ]
    transitions = [
        {
            "transition_id": fact_transition_id,
            "entity_id": hero_id,
            "fact_id": fact_id,
            "event_id": None,
            "attribute_key": "health",
            "new_value": 90,
            "sequence": 1,
        },
        {
            "transition_id": event_transition_id,
            "entity_id": hero_id,
            "fact_id": None,
            "event_id": event_id,
            "attribute_key": "location",
            "new_value": "Observatory",
            "sequence": 2,
        },
    ]
    projection = project(entities, facts, events, transitions)

    kb = StoryKB(
        story_id=story_id,
        metadata={
            "brain_version": "4",
            "status": "active",
            "baseline_revision_id": str(uuid.uuid4()),
        },
        entities={
            "elena": KBEntity(
                name="Elena",
                entity_type="character",
                status="Alive",
                location="Observatory",
                mentions=7,
                is_locked=False,
            ),
            "alan": KBEntity(
                name="Alan",
                entity_type="character",
                status="Alive",
                location="Archive",
                mentions=3,
                is_locked=True,
            ),
        },
        entity_aliases=[
            {
                "alias_id": alias_id,
                "entity_id": hero_id,
                "alias": "The Astronomer",
                "normalized_alias": "the astronomer",
            }
        ],
        entity_mentions=[
            {
                "mention_id": mention_id,
                "entity_id": hero_id,
                "chapter_id": str(uuid.uuid4()),
                "revision_id": str(uuid.uuid4()),
                "surface_text": "Elena",
                "source_start": 3,
                "source_end": 8,
                "source_text_hash": hashlib.sha256(b"Elena").hexdigest(),
                "extractor_version": "legacy-v1",
            }
        ],
        facts=facts,
        state_transitions=transitions,
        narrative_projection=projection,
        relations=[
            KBRelation(
                subject="Elena",
                relation="trusts",
                object="Alan",
                metadata={"first_chapter": 2},
                source="author",
                locked=True,
            )
        ],
        enhanced_events=[
            {
                "event_id": event_id,
                "event_type": "meeting",
                "participants": [hero_id, ally_id],
                "summary": "Elena meets Alan at the observatory.",
                "chapter": 2,
                "importance_score": 0.8,
                "source": "author",
            }
        ],
        proposals=[
            {
                "proposal_id": proposal_id,
                "proposal_type": "fact",
                "payload": {"fact_key": "legacy.note", "fact_value": "pending"},
                "evidence": [],
                "confidence": 0.7,
                "expected_brain_version": 4,
                "status": "pending",
            }
        ],
    )
    if unsupported:
        kb.event_history = [
            {
                "event_id": "old-history-only",
                "chapter": 1,
                "participants": [],
                "locations": [],
                "summary": "Old legacy-only history.",
                "event_type": "general",
            }
        ]
    manager.save_narrative_kb(story_id, kb)
    return manager, hero_id


def _migrator(session_factory, storage: Path, tenant_id: str) -> JsonPostgresCutoverMigrator:
    return JsonPostgresCutoverMigrator(
        session_factory,
        tenant_id=tenant_id,
        actor_id=str(uuid.uuid4()),
        json_storage=storage,
    )


def test_dry_run_is_read_only_then_apply_has_full_canonical_parity(
    session_factory, tmp_path: Path
) -> None:
    story_id = str(uuid.uuid4())
    tenant_id = str(uuid.uuid4())
    manager, hero_id = _seed_json(tmp_path, story_id)
    source_file = manager._get_file_path(story_id)
    source_before = source_file.read_bytes()

    migrator = _migrator(session_factory, tmp_path, tenant_id)
    plan = migrator.plan(story_id)

    assert plan["action"] == "ready"
    assert plan["safe_to_apply"] is True
    assert plan["target_exists"] is False
    assert source_file.read_bytes() == source_before

    applied = migrator.apply(story_id)
    assert applied["applied"] is True
    assert applied["parity"] is True
    assert applied["source_unchanged"] is True
    assert source_file.read_bytes() == source_before

    target = PostgresNarrativeRepository(
        session_factory,
        tenant_id=tenant_id,
        actor_id=str(uuid.uuid4()),
    )
    source_snapshot = canonical_snapshot(migrator._source.get_story_brain(story_id))
    target_snapshot = canonical_snapshot(target.get_story_brain(story_id))
    assert target_snapshot == source_snapshot

    hero = next(item for item in target_snapshot["entities"] if item["entity_id"] == hero_id)
    assert hero == {
        "entity_id": hero_id,
        "name": "Elena",
        "entity_type": "character",
        "status": "Alive",
        "location": "Observatory",
        "mentions": 7,
        "is_locked": False,
    }
    assert target_snapshot["relations"][0]["locked"] is True
    assert target_snapshot["events"][0]["chapter"] == 2
    assert len(target_snapshot["aliases"]) == 1
    assert len(target_snapshot["mentions"]) == 1
    assert len(target_snapshot["facts"]) == 1
    assert len(target_snapshot["proposals"]) == 1
    assert len(target_snapshot["transitions"]) == 2

    rebuilt = target.rebuild_projection(story_id, expected_brain_version=4)
    assert canonical_snapshot(target.get_story_brain(story_id))["state"] == canonical_snapshot(
        migrator._source.get_story_brain(story_id)
    )["state"]
    assert rebuilt == target.get_current_state(story_id)


def test_second_apply_is_idempotent(session_factory, tmp_path: Path) -> None:
    story_id = str(uuid.uuid4())
    tenant_id = str(uuid.uuid4())
    _seed_json(tmp_path, story_id)
    migrator = _migrator(session_factory, tmp_path, tenant_id)

    first = migrator.apply(story_id)
    second = migrator.apply(story_id)

    assert first["applied"] is True
    assert second["applied"] is False
    assert second["idempotent"] is True
    assert second["action"] == "already_migrated"


def test_conflicting_nonempty_target_is_blocked(session_factory, tmp_path: Path) -> None:
    story_id = str(uuid.uuid4())
    tenant_id = str(uuid.uuid4())
    _seed_json(tmp_path, story_id)
    target = PostgresNarrativeRepository(
        session_factory,
        tenant_id=tenant_id,
        actor_id=str(uuid.uuid4()),
    )
    target.upsert_entity(story_id, {"name": "Conflicting", "type": "character"})

    migrator = _migrator(session_factory, tmp_path, tenant_id)
    plan = migrator.plan(story_id)

    assert plan["action"] == "blocked_conflict"
    assert plan["safe_to_apply"] is False
    with pytest.raises(CutoverMigrationError, match="blocked_conflict"):
        migrator.apply(story_id)


def test_legacy_only_canonical_ambiguity_is_blocked(session_factory, tmp_path: Path) -> None:
    story_id = str(uuid.uuid4())
    tenant_id = str(uuid.uuid4())
    _seed_json(tmp_path, story_id, unsupported=True)
    migrator = _migrator(session_factory, tmp_path, tenant_id)

    plan = migrator.plan(story_id)

    assert plan["action"] == "blocked_unsupported"
    assert plan["unsupported"][0]["field"] == "event_history"
    with pytest.raises(CutoverMigrationError, match="blocked_unsupported"):
        migrator.apply(story_id)


def test_migration_is_tenant_scoped(session_factory, tmp_path: Path) -> None:
    story_id = str(uuid.uuid4())
    source_tenant = str(uuid.uuid4())
    other_tenant = str(uuid.uuid4())
    _seed_json(tmp_path, story_id)

    other = PostgresNarrativeRepository(
        session_factory,
        tenant_id=other_tenant,
        actor_id=str(uuid.uuid4()),
    )
    other.upsert_entity(story_id, {"name": "Other tenant entity", "type": "character"})
    before = canonical_snapshot(other.get_story_brain(story_id))

    migrator = _migrator(session_factory, tmp_path, source_tenant)
    assert migrator.apply(story_id)["parity"] is True

    after = canonical_snapshot(other.get_story_brain(story_id))
    assert after == before

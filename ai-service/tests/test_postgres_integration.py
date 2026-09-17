"""
Comprehensive Integration Tests for Narrative Memory Phase 4 on real PostgreSQL.
Validates Alembic migrations, atomic transactions, rollbacks, tenant isolation,
row-level locking, and concurrency.
"""

from __future__ import annotations

import os
import threading
import uuid
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, func, inspect, select, text
from sqlalchemy.orm import Session, sessionmaker

from domain.errors import OptimisticLockError
from domain.models import NarrativeProposal, ProposalStatus
from domain.projection import ProjectionError
from infrastructure.database import session_scope
from infrastructure.orm_models import (
    Base,
    CurrentEntityStateRecord,
    EntityRecord,
    EventParticipantRecord,
    EventRecord,
    ProposalRecord,
    SCHEMA,
    StateTransitionRecord,
    StoryBrainRecord,
)
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository

SERVICE_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TEST_DB = "postgresql+psycopg://testuser:testpass@127.0.0.1:5433/test_novel_platform"


def get_postgres_url() -> str:
    url = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url or not url.startswith("postgresql"):
        # Fallback to local default port 5433 mapped from Docker Compose
        url = DEFAULT_TEST_DB
    return url


@pytest.fixture(scope="session")
def pg_engine():
    url = get_postgres_url()
    engine = create_engine(url, pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        pytest.skip(f"PostgreSQL database not available at {url}: {exc}")
    yield engine
    engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def ensure_schema_migrated(pg_engine):
    """Ensure migrations are applied before running tests."""
    alembic_cfg = Config(str(SERVICE_ROOT / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(SERVICE_ROOT / "migrations"))
    alembic_cfg.set_main_option("sqlalchemy.url", get_postgres_url())
    command.upgrade(alembic_cfg, "head")


@pytest.fixture
def session_factory(pg_engine):
    return sessionmaker(bind=pg_engine, expire_on_commit=False)


@pytest.fixture
def test_tenant_actor():
    return str(uuid.uuid4()), str(uuid.uuid4())


@pytest.fixture
def repo(session_factory, test_tenant_actor):
    tenant_id, actor_id = test_tenant_actor
    repository = PostgresNarrativeRepository(
        session_factory, tenant_id=tenant_id, actor_id=actor_id
    )
    return repository


def make_event_proposal_group(
    story_id: str,
    entity_name: str,
    health_val: int = 80,
    *,
    event_id: str | None = None,
    supersedes: str | None = None,
    brain_version: int = 1,
) -> list[NarrativeProposal]:
    group_id = str(uuid.uuid4())
    eid = event_id or str(uuid.uuid4())
    event_payload = {
        "event_id": eid,
        "event_type": "battle",
        "summary": f"{entity_name} was engaged in battle",
        "participants": [entity_name],
        "chapter": 1,
    }
    if supersedes:
        event_payload["supersedes_id"] = supersedes

    prop_event = NarrativeProposal(
        proposal_id=eid,
        proposal_type="event",
        payload=event_payload,
        dependency_group_id=group_id,
        materialization_order=0,
        expected_brain_version=brain_version,
    )
    prop_trans = NarrativeProposal(
        proposal_id=str(uuid.uuid4()),
        proposal_type="state_transition",
        payload={
            "event_id": eid,
            "entity_id": entity_name,
            "attribute_key": "health",
            "new_value": health_val,
        },
        dependency_group_id=group_id,
        materialization_order=1,
        expected_brain_version=brain_version,
    )
    return [prop_event, prop_trans]


# =========================================================================
# 1. Alembic Upgrade / Downgrade on Clean & Existing Database
# =========================================================================
def test_alembic_migrations_lifecycle(pg_engine):
    """
    Test clean upgrade to 0001, seed baseline data, upgrade to head (Phase 4),
    verify new tables, downgrade to 0001 (retaining baseline data), and upgrade back to head.
    """
    url = get_postgres_url()
    alembic_cfg = Config(str(SERVICE_ROOT / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(SERVICE_ROOT / "migrations"))
    alembic_cfg.set_main_option("sqlalchemy.url", url)

    # 1. Downgrade to 0001_narrative_foundation
    command.downgrade(alembic_cfg, "0001_narrative_foundation")
    inspector = inspect(pg_engine)
    tables_0001 = set(inspector.get_table_names(schema=SCHEMA))
    assert "story_brains" in tables_0001
    assert "entities" in tables_0001
    assert "event_participants" not in tables_0001
    assert "state_transitions" not in tables_0001
    assert "current_entity_states" not in tables_0001

    # Insert a test baseline row into story_brains under 0001 schema
    test_novel = uuid.uuid4()
    test_tenant = uuid.uuid4()
    with pg_engine.begin() as conn:
        conn.execute(
            text(
                f"INSERT INTO {SCHEMA}.story_brains (id, tenant_id, novel_id, status, brain_version, schema_version) "
                f"VALUES ('{uuid.uuid4()}', '{test_tenant}', '{test_novel}', 'active', 1, 1)"
            )
        )

    # 2. Upgrade to head
    command.upgrade(alembic_cfg, "head")
    inspector = inspect(pg_engine)
    tables_head = set(inspector.get_table_names(schema=SCHEMA))
    assert {"event_participants", "state_transitions", "current_entity_states"}.issubset(tables_head)

    # Verify baseline row survived the upgrade
    with pg_engine.connect() as conn:
        count = conn.execute(
            text(f"SELECT count(*) FROM {SCHEMA}.story_brains WHERE novel_id = '{test_novel}'")
        ).scalar()
        assert count == 1

    # 3. Downgrade back to 0001 and verify Phase 4 tables dropped cleanly
    command.downgrade(alembic_cfg, "0001_narrative_foundation")
    inspector = inspect(pg_engine)
    tables_after_downgrade = set(inspector.get_table_names(schema=SCHEMA))
    assert "state_transitions" not in tables_after_downgrade

    # Baseline data still exists
    with pg_engine.connect() as conn:
        count = conn.execute(
            text(f"SELECT count(*) FROM {SCHEMA}.story_brains WHERE novel_id = '{test_novel}'")
        ).scalar()
        assert count == 1

    # 4. Final upgrade back to head
    command.upgrade(alembic_cfg, "head")


# =========================================================================
# 2. Acceptance, Rebuild, and History Preservation on PostgreSQL
# =========================================================================
def test_acceptance_rebuild_and_correction_history(repo, session_factory):
    novel_id = str(uuid.uuid4())
    repo.upsert_entity(novel_id, {"name": "Tiêu Viêm", "type": "PER"})

    # Phase 4 acceptance
    proposals = make_event_proposal_group(novel_id, "Tiêu Viêm", health_val=75)
    repo.save_proposals(novel_id, proposals)
    group_ids = [p.proposal_id for p in proposals]
    repo.accept_proposal_group(novel_id, group_ids, expected_brain_version=1)

    # State check
    entities = repo.list_entities(novel_id)
    tieu_viem_id = str(entities[0].entity_id)
    state_online = repo.get_current_state(novel_id)
    assert tieu_viem_id in state_online["entities"]
    assert state_online["entities"][tieu_viem_id]["health"] == 75
    assert state_online["provenance"][tieu_viem_id]["health"]["transition_id"] is not None

    # Rebuild check (must match online projection identically, version unchanged)
    state_rebuilt = repo.rebuild_projection(novel_id, expected_brain_version=2)
    assert state_rebuilt == state_online
    brain = repo.get_story_brain(novel_id)
    assert int(brain.metadata["brain_version"]) == 2

    # Propose and accept correction
    original_event_id = proposals[0].proposal_id
    corr_proposals = make_event_proposal_group(
        novel_id, "Tiêu Viêm", health_val=85, supersedes=original_event_id, brain_version=2
    )
    repo.save_proposals(novel_id, corr_proposals)
    repo.accept_proposal_group(
        novel_id, [p.proposal_id for p in corr_proposals], expected_brain_version=2
    )

    # Verify both original event and correction event exist in PostgreSQL
    with session_scope(session_factory) as session:
        events = session.scalars(
            select(EventRecord)
            .where(EventRecord.novel_id == uuid.UUID(novel_id))
            .order_by(EventRecord.created_at)
        ).all()
        assert len(events) == 2
        # Original event is preserved, not deleted or overwritten
        assert str(events[0].id) == original_event_id
        # Second event references supersedes_id in metadata
        assert events[1].event_metadata.get("supersedes_id") == original_event_id

    # New projected state reflects correction replay
    state_corrected = repo.get_current_state(novel_id)
    assert state_corrected["entities"][tieu_viem_id]["health"] == 85


# =========================================================================
# 3. Atomic Transaction Rollback on Projection Error
# =========================================================================
def test_projection_error_rolls_back_entire_transaction(repo, session_factory):
    novel_id = str(uuid.uuid4())
    repo.upsert_entity(novel_id, {"name": "Dược Lão", "type": "PER"})

    # Create group with invalid health (out of bounds 0..100)
    proposals = make_event_proposal_group(novel_id, "Dược Lão", health_val=999)
    repo.save_proposals(novel_id, proposals)
    group_ids = [p.proposal_id for p in proposals]

    with pytest.raises(ProjectionError):
        repo.accept_proposal_group(novel_id, group_ids, expected_brain_version=1)

    # Verify atomic rollback in DB:
    # 1. Brain version did NOT increment
    brain = repo.get_story_brain(novel_id)
    assert int(brain.metadata["brain_version"]) == 1

    # 2. No events, transitions or participants committed
    with session_scope(session_factory) as session:
        ev_count = session.scalar(
            select(func.count(EventRecord.id)).where(EventRecord.novel_id == uuid.UUID(novel_id))
        )
        tr_count = session.scalar(
            select(func.count(StateTransitionRecord.id)).where(
                StateTransitionRecord.story_brain_id == uuid.UUID(brain.story_id)
            )
        )
        assert ev_count == 0
        assert tr_count == 0

        # Proposals remain pending
        db_proposals = session.scalars(
            select(ProposalRecord).where(ProposalRecord.novel_id == uuid.UUID(novel_id))
        ).all()
        assert all(p.status == ProposalStatus.PENDING.value for p in db_proposals)

    # 3. Retry with valid value succeeds without duplicate errors
    duoc_lao_id = str(repo.list_entities(novel_id)[0].entity_id)
    edited = {proposals[1].proposal_id: {**proposals[1].payload, "new_value": 90}}
    repo.accept_proposal_group(novel_id, group_ids, expected_brain_version=1, edited_payloads=edited)
    assert int(repo.get_story_brain(novel_id).metadata["brain_version"]) == 2
    assert repo.get_current_state(novel_id)["entities"][duoc_lao_id]["health"] == 90


# =========================================================================
# 4. Author Lock Blocks Conflicting Mutations
# =========================================================================
def test_author_lock_blocks_conflicting_changes(repo, session_factory):
    novel_id = str(uuid.uuid4())
    repo.upsert_entity(novel_id, {"name": "Mỹ Đỗ Toa", "type": "PER"})

    # Lock entity type in database as Author
    with session_scope(session_factory) as session:
        entity = session.scalar(
            select(EntityRecord).where(
                EntityRecord.novel_id == uuid.UUID(novel_id),
                EntityRecord.normalized_name == "mỹ đỗ toa",
            )
        )
        entity.is_locked = True
        entity.locked_by = uuid.UUID(str(repo._actor_id))

    # Proposal trying to change entity type to ORG must fail with lock error
    conflict_prop = NarrativeProposal(
        proposal_id=str(uuid.uuid4()),
        proposal_type="entity",
        payload={"canonical_name": "Mỹ Đỗ Toa", "normalized_name": "mỹ đỗ toa", "entity_type": "ORG"},
        dependency_group_id=str(uuid.uuid4()),
        expected_brain_version=1,
    )
    repo.save_proposals(novel_id, [conflict_prop])

    with pytest.raises(OptimisticLockError):
        repo.accept_proposal_group(novel_id, [conflict_prop.proposal_id], expected_brain_version=1)


# =========================================================================
# 5. Tenant Isolation and Multi-Novel Isolation
# =========================================================================
def test_tenant_and_novel_isolation(session_factory):
    tenant_a = str(uuid.uuid4())
    tenant_b = str(uuid.uuid4())
    actor_id = str(uuid.uuid4())

    repo_a = PostgresNarrativeRepository(session_factory, tenant_id=tenant_a, actor_id=actor_id)
    repo_b = PostgresNarrativeRepository(session_factory, tenant_id=tenant_b, actor_id=actor_id)

    novel_id = str(uuid.uuid4())
    repo_a.upsert_entity(novel_id, {"name": "Huân Nhi", "type": "PER"})

    # Repo B (different tenant) cannot see entities of novel_id
    entities_b = repo_b.list_entities(novel_id)
    assert len(entities_b) == 0

    # Repo A proposals cannot be accepted by Repo B
    prop = NarrativeProposal(
        proposal_id=str(uuid.uuid4()),
        proposal_type="entity",
        payload={"canonical_name": "Nạp Lan Yên Nhiên", "normalized_name": "nạp lan yên nhiên", "entity_type": "PER"},
        dependency_group_id=str(uuid.uuid4()),
        expected_brain_version=1,
    )
    repo_a.save_proposals(novel_id, [prop])

    with pytest.raises(KeyError):
        repo_b.accept_proposal_group(novel_id, [prop.proposal_id], expected_brain_version=1)


# =========================================================================
# 6. Concurrency Locking: Two Transactions Simultaneously Accepting
# =========================================================================
def test_concurrent_accept_proposal_group_exact_one_succeeds(repo, session_factory):
    novel_id = str(uuid.uuid4())
    repo.upsert_entity(novel_id, {"name": "Vân Vận", "type": "PER"})

    # Pre-save two independent proposal groups
    group_1 = make_event_proposal_group(novel_id, "Vân Vận", health_val=70, brain_version=1)
    group_2 = make_event_proposal_group(novel_id, "Vân Vận", health_val=60, brain_version=1)
    repo.save_proposals(novel_id, group_1)
    repo.save_proposals(novel_id, group_2)

    barrier = threading.Barrier(2)
    results = []
    errors = []

    def worker(group_proposals):
        thread_repo = PostgresNarrativeRepository(
            session_factory, tenant_id=repo._tenant_id, actor_id=repo._actor_id
        )
        p_ids = [p.proposal_id for p in group_proposals]
        try:
            barrier.wait(timeout=5)
            res = thread_repo.accept_proposal_group(
                novel_id, p_ids, expected_brain_version=1
            )
            results.append(res)
        except Exception as exc:
            errors.append(exc)

    t1 = threading.Thread(target=worker, args=(group_1,))
    t2 = threading.Thread(target=worker, args=(group_2,))

    t1.start()
    t2.start()
    t1.join(timeout=10)
    t2.join(timeout=10)

    # Exactly one transaction must succeed; the other must raise OptimisticLockError
    assert len(results) == 1, f"Expected 1 success, got {len(results)}"
    assert len(errors) == 1, f"Expected 1 error, got {len(errors)}"
    assert isinstance(errors[0], OptimisticLockError)

    # Final brain version is incremented exactly once (from 1 to 2)
    brain = repo.get_story_brain(novel_id)
    assert int(brain.metadata["brain_version"]) == 2


# =========================================================================
# 7. Concurrent Rebuild vs Acceptance Integrity
# =========================================================================
def test_concurrent_rebuild_and_acceptance(repo, session_factory):
    novel_id = str(uuid.uuid4())
    repo.upsert_entity(novel_id, {"name": "Tiểu Y Tiên", "type": "PER"})

    group = make_event_proposal_group(novel_id, "Tiểu Y Tiên", health_val=90, brain_version=1)
    repo.save_proposals(novel_id, group)
    p_ids = [p.proposal_id for p in group]

    barrier = threading.Barrier(2)
    results = {}

    def accept_worker():
        thread_repo = PostgresNarrativeRepository(
            session_factory, tenant_id=repo._tenant_id, actor_id=repo._actor_id
        )
        barrier.wait(timeout=5)
        results["accept"] = thread_repo.accept_proposal_group(
            novel_id, p_ids, expected_brain_version=1
        )

    def rebuild_worker():
        thread_repo = PostgresNarrativeRepository(
            session_factory, tenant_id=repo._tenant_id, actor_id=repo._actor_id
        )
        barrier.wait(timeout=5)
        # Rebuild might see version 1 or version 2 depending on lock order
        try:
            results["rebuild"] = thread_repo.rebuild_projection(novel_id, expected_brain_version=1)
        except OptimisticLockError:
            results["rebuild"] = "locked_out"

    t1 = threading.Thread(target=accept_worker)
    t2 = threading.Thread(target=rebuild_worker)

    t1.start()
    t2.start()
    t1.join(timeout=10)
    t2.join(timeout=10)

    # Both threads finished cleanly, state is deterministic
    tieu_y_tien_id = str(repo.list_entities(novel_id)[0].entity_id)
    state = repo.get_current_state(novel_id)
    assert tieu_y_tien_id in state["entities"]
    assert state["entities"][tieu_y_tien_id]["health"] == 90

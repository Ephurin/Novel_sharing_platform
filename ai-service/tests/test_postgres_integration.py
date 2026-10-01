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
from domain.models import BootstrapJob, BootstrapRevision, NarrativeProposal, ProposalStatus
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


pytestmark = pytest.mark.postgres_integration

SERVICE_ROOT = Path(__file__).resolve().parent.parent
def get_postgres_url() -> str:
    url = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url or not url.startswith("postgresql"):
        raise pytest.UsageError(
            "TEST_DATABASE_URL must be a PostgreSQL URL. Start the `test` Compose profile "
            "or provide an isolated PostgreSQL database."
        )
    return url


@pytest.fixture(scope="session")
def pg_engine():
    url = get_postgres_url()
    engine = create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        raise pytest.UsageError(
            f"PostgreSQL integration database is unavailable at {url}: {exc}"
        ) from exc
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
    assert {"event_participants", "state_transitions", "current_entity_states", "bootstrap_jobs"}.issubset(tables_head)

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



def test_recent_scope_participants_exclude_superseded_event_entities(repo):
    novel_id = str(uuid.uuid4())
    repo.upsert_entity(novel_id, {"name": "Original Actor", "type": "PER"})
    repo.upsert_entity(novel_id, {"name": "Replacement Actor", "type": "PER"})

    original = make_event_proposal_group(
        novel_id,
        "Original Actor",
        health_val=70,
        brain_version=1,
    )
    repo.save_proposals(novel_id, original)
    repo.accept_proposal_group(
        novel_id,
        [p.proposal_id for p in original],
        expected_brain_version=1,
    )

    replacement = make_event_proposal_group(
        novel_id,
        "Replacement Actor",
        health_val=90,
        supersedes=original[0].proposal_id,
        brain_version=2,
    )
    repo.save_proposals(novel_id, replacement)
    repo.accept_proposal_group(
        novel_id,
        [p.proposal_id for p in replacement],
        expected_brain_version=2,
    )

    ids = {item.name: item.entity_id for item in repo.list_entities(novel_id)}
    context = repo.get_structured_context(novel_id, chapter_number=1)
    scoped_ids = set(context.context_summary["recent_scope_participant_entity_ids"])

    assert ids["Replacement Actor"] in scoped_ids
    assert ids["Original Actor"] not in scoped_ids
    assert [event["summary"] for event in context.recent_events] == [
        "Replacement Actor was engaged in battle"
    ]


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
    errors = []

    def accept_worker():
        try:
            thread_repo = PostgresNarrativeRepository(
                session_factory, tenant_id=repo._tenant_id, actor_id=repo._actor_id
            )
            barrier.wait(timeout=5)
            results["accept"] = thread_repo.accept_proposal_group(
                novel_id, p_ids, expected_brain_version=1
            )
        except Exception as exc:
            errors.append(exc)

    def rebuild_worker():
        try:
            thread_repo = PostgresNarrativeRepository(
                session_factory, tenant_id=repo._tenant_id, actor_id=repo._actor_id
            )
            barrier.wait(timeout=5)
            # Rebuild may lose the version race, which must leave no stale projection.
            results["rebuild"] = thread_repo.rebuild_projection(novel_id, expected_brain_version=1)
        except OptimisticLockError:
            results["rebuild"] = "locked_out"
        except Exception as exc:
            errors.append(exc)

    t1 = threading.Thread(target=accept_worker)
    t2 = threading.Thread(target=rebuild_worker)

    t1.start()
    t2.start()
    t1.join(timeout=10)
    t2.join(timeout=10)

    assert not t1.is_alive() and not t2.is_alive(), "Concurrent workers did not finish"
    assert not errors, f"Concurrent workers failed: {errors!r}"
    assert results.get("accept", {}).get("brain_version") == 2
    assert results.get("rebuild") == "locked_out" or isinstance(results.get("rebuild"), dict)
    tieu_y_tien_id = str(repo.list_entities(novel_id)[0].entity_id)
    state = repo.get_current_state(novel_id)
    assert tieu_y_tien_id in state["entities"]
    assert state["entities"][tieu_y_tien_id]["health"] == 90
    assert state["provenance"][tieu_y_tien_id]["health"]["event_id"] == group[0].proposal_id
    assert int(repo.get_story_brain(novel_id).metadata["brain_version"]) == 2


def test_bootstrap_job_persistence_and_entity_merge(repo, session_factory):
    novel_id = str(uuid.uuid4())
    revision_id = str(uuid.uuid4())
    job = BootstrapJob(
        job_id=str(uuid.uuid4()),
        novel_id=novel_id,
        tenant_id=str(repo._tenant_id),
        revisions=(
            BootstrapRevision(
                chapter_id=str(uuid.uuid4()),
                revision_id=revision_id,
                content_hash="a" * 64,
            ),
        ),
    )
    repo.create_bootstrap_job(job)
    running = repo.save_bootstrap_job(
        BootstrapJob(
            job_id=job.job_id,
            novel_id=job.novel_id,
            tenant_id=job.tenant_id,
            revisions=(BootstrapRevision(
                chapter_id=job.revisions[0].chapter_id,
                revision_id=revision_id,
                content_hash="a" * 64,
                status="completed",
                proposal_count=2,
            ),),
            status="waiting_review",
            progress_current=1,
            stage="review",
            result={"required_proposal_ids": []},
        )
    )
    assert running.progress_current == 1
    restarted_repo = PostgresNarrativeRepository(
        session_factory,
        tenant_id=str(repo._tenant_id),
        actor_id=str(repo._actor_id),
    )
    persisted = restarted_repo.get_bootstrap_job(job.job_id)
    assert persisted.status == "waiting_review"
    assert persisted.revisions[0].status == "completed"
    activated = restarted_repo.activate_baseline(novel_id, job.job_id, revision_id)
    assert activated["status"] == "active"
    brain_after_activation = restarted_repo.get_story_brain(novel_id)
    assert brain_after_activation.metadata["baseline_revision_id"] == revision_id

    repo.upsert_entity(novel_id, {"name": "Hải Ba Đông", "type": "PER"})
    repo.upsert_entity(novel_id, {"name": "Hai Ba Dong", "type": "PER"})
    entities = repo.list_entities(novel_id)
    source = next(item for item in entities if item.name == "Hai Ba Dong")
    target = next(item for item in entities if item.name == "Hải Ba Đông")
    merged = repo.merge_entities(
        novel_id, source.entity_id, target.entity_id, expected_brain_version=1
    )
    assert merged["brain_version"] == 2
    assert [item.name for item in repo.list_entities(novel_id)] == ["Hải Ba Đông"]


def test_revision_provenance_lifecycle(repo, session_factory):
    novel_id = f"test-novel-provenance-{uuid.uuid4().hex[:8]}"
    chap_id = "chapter-10"
    rev_id = f"rev-xyz-{uuid.uuid4().hex[:8]}"

    # 1. Record provenance
    repo.record_revision_provenance(
        story_id=novel_id,
        chapter_id=chap_id,
        revision_id=rev_id,
        chapter_number=10,
    )

    # 2. Query provenance
    prov = repo.get_revision_provenance(novel_id, rev_id)
    assert prov is not None
    assert prov["chapter_number"] == 10
    assert prov["story_brain_id"] is not None
    assert prov["novel_id"] is not None
    assert prov["chapter_id"] is not None

    # 3. Update provenance
    repo.record_revision_provenance(
        story_id=novel_id,
        chapter_id=chap_id,
        revision_id=rev_id,
        chapter_number=11,
    )
    prov_updated = repo.get_revision_provenance(novel_id, rev_id)
    assert prov_updated is not None
    assert prov_updated["chapter_number"] == 11

    # 4. Tenant isolation: a different tenant cannot access this provenance
    other_tenant_repo = PostgresNarrativeRepository(
        session_factory,
        tenant_id=str(uuid.uuid4()),
        actor_id=str(uuid.uuid4()),
    )
    assert other_tenant_repo.get_revision_provenance(novel_id, rev_id) is None


def test_chapter_25_event_and_state_isolation_from_chapter_5(repo):
    novel_id = f"novel-temporal-{uuid.uuid4().hex[:8]}"

    # Step 1: Create confirmed entity Tiêu Viêm
    repo.upsert_entity(novel_id, {"name": "Tiêu Viêm", "type": "PER"})
    entities = repo.list_entities(novel_id)
    ent = next(item for item in entities if item.name == "Tiêu Viêm")
    ent_id = ent.entity_id

    # Record provenance for revision at chapter 25
    rev_id_25 = f"rev-ch25-{uuid.uuid4().hex[:8]}"
    repo.record_revision_provenance(
        story_id=novel_id,
        chapter_id="chap-25",
        revision_id=rev_id_25,
        chapter_number=25,
    )

    # Step 2: Create event proposal at chapter 25
    group_id = str(uuid.uuid4())
    event_id = str(uuid.uuid4())
    ev_prop = NarrativeProposal(
        proposal_id=str(uuid.uuid4()),
        proposal_type="event",
        payload={
            "event_id": event_id,
            "event_type": "battle",
            "summary": "Tiêu Viêm defeated Nạp Lan Yên Nhiên at Vân Lam Tông",
            "participants": ["Tiêu Viêm"],
            "chapter": 25,
            "chapter_number": 25,
        },
        analysis_run_id=str(uuid.uuid4()),
        dependency_group_id=group_id,
        materialization_order=0,
        evidence=({"revision_id": rev_id_25, "chapter_number": 25},),
        confidence=0.95,
        expected_brain_version=1,
    )

    # Step 3: Create state_transition proposal linked to the chapter 25 event
    st_prop = NarrativeProposal(
        proposal_id=str(uuid.uuid4()),
        proposal_type="state_transition",
        payload={
            "entity_id": ent_id,
            "event_id": event_id,
            "attribute_key": "health",
            "new_value": 65,
        },
        analysis_run_id=ev_prop.analysis_run_id,
        dependency_group_id=group_id,
        materialization_order=1,
        evidence=ev_prop.evidence,
        confidence=0.95,
        expected_brain_version=1,
    )

    repo.save_proposals(novel_id, [ev_prop, st_prop])
    repo.accept_proposal_group(
        novel_id,
        [ev_prop.proposal_id, st_prop.proposal_id],
        expected_brain_version=1,
    )

    # Query structured context at chapter 5: Future chapter 25 event and resulting state must NOT appear!
    ctx_ch5 = repo.get_structured_context(novel_id, chapter_number=5)
    event_summaries_ch5 = [ev.get("summary") for ev in ctx_ch5.recent_events]
    assert not any("Vân Lam Tông" in str(s) for s in event_summaries_ch5), (
        f"Temporal leakage: Chapter 25 event appeared in Chapter 5 context: {event_summaries_ch5}"
    )
    # Entity dynamic state in chapter 5 must NOT have health 65
    ch5_states = {s.get("entity_id") or s.get("name"): s for s in ctx_ch5.current_states}
    tieu_viem_ch5_state = ch5_states.get(ent_id) or ch5_states.get("Tiêu Viêm") or {}
    ch5_health = tieu_viem_ch5_state.get("state", {}).get("health")
    assert ch5_health != 65, (
        f"Temporal leakage: State transition health=65 appeared in Chapter 5: {tieu_viem_ch5_state}"
    )
    assert ent_id not in ctx_ch5.context_summary[
        "recent_scope_participant_entity_ids"
    ], "Future event participant must not leak into relevance scope before cutoff"

    # Query structured context at chapter 25: Future chapter 25 event and resulting state MUST appear!
    ctx_ch25 = repo.get_structured_context(novel_id, chapter_number=25)
    event_summaries_ch25 = [ev.get("summary") for ev in ctx_ch25.recent_events]
    assert any("Vân Lam Tông" in str(s) for s in event_summaries_ch25), (
        f"Missing event: Chapter 25 event not found in Chapter 25 context: {event_summaries_ch25}"
    )
    ch25_states = {s.get("entity_id") or s.get("name"): s for s in ctx_ch25.current_states}
    tieu_viem_ch25_state = ch25_states.get(ent_id) or ch25_states.get("Tiêu Viêm") or {}
    ch25_health = tieu_viem_ch25_state.get("state", {}).get("health")
    assert ch25_health == 65, (
        f"Missing state: State transition health=65 not reflected in Chapter 25: {tieu_viem_ch25_state}"
    )
    assert ent_id in ctx_ch25.context_summary[
        "recent_scope_participant_entity_ids"
    ], "Canonical event participant ID must feed the relevance scope after cutoff"
    assert ctx_ch25.context_summary["recent_scope_participant_identity"] == [
        "normalized-event-participants-v1"
    ]


# =========================================================================
# 8. Migration Compatibility & NOT NULL Constraint Assertions (Blocker 1)
# =========================================================================
def test_alembic_head_schema_has_revision_id_not_null_and_unique_constraint(pg_engine):
    """Assert final head schema has revision_id NOT NULL and unique constraint."""
    inspector = inspect(pg_engine)
    columns = {col["name"]: col for col in inspector.get_columns("revision_provenances", schema=SCHEMA)}
    assert "revision_id" in columns, "revision_id column missing from revision_provenances"
    assert columns["revision_id"]["nullable"] is False, "revision_id column must be NOT NULL"

    constraints = inspector.get_unique_constraints("revision_provenances", schema=SCHEMA)
    uq_names = {c["name"]: set(c["column_names"]) for c in constraints}
    assert "uq_rev_provenance_revision" in uq_names, "uq_rev_provenance_revision unique constraint missing"
    assert uq_names["uq_rev_provenance_revision"] == {"tenant_id", "novel_id", "revision_id"}


def test_migration_upgrade_from_legacy_0005_schema(pg_engine):
    """
    Simulate upgrade path from legacy 0005 table (no revision_id), apply 0006,
    and verify backfill, NOT NULL enforcement, and unique constraint.
    """
    url = get_postgres_url()
    alembic_cfg = Config(str(SERVICE_ROOT / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(SERVICE_ROOT / "migrations"))
    alembic_cfg.set_main_option("sqlalchemy.url", url)

    # 1. Downgrade to 0005
    command.downgrade(alembic_cfg, "0005_revision_provenance")
    inspector = inspect(pg_engine)
    cols_0005 = {c["name"] for c in inspector.get_columns("revision_provenances", schema=SCHEMA)}
    assert "revision_id" not in cols_0005, "0005 schema must not contain revision_id"

    # 2. Insert a legacy row into story_brains and revision_provenances without revision_id
    test_tenant = uuid.uuid4()
    test_novel = uuid.uuid4()
    test_brain = uuid.uuid4()
    test_prov_id = uuid.uuid4()
    test_chap_id = uuid.uuid4()

    with pg_engine.begin() as conn:
        conn.execute(
            text(
                f"INSERT INTO {SCHEMA}.story_brains (id, tenant_id, novel_id, status, brain_version, schema_version) "
                f"VALUES ('{test_brain}', '{test_tenant}', '{test_novel}', 'active', 1, 1)"
            )
        )
        conn.execute(
            text(
                f"INSERT INTO {SCHEMA}.revision_provenances (id, story_brain_id, tenant_id, novel_id, chapter_id, chapter_number) "
                f"VALUES ('{test_prov_id}', '{test_brain}', '{test_tenant}', '{test_novel}', '{test_chap_id}', 7)"
            )
        )

    # 3. Upgrade to head without MIGRATION_CLEAR_UNMAPPED_PROVENANCE must fail actionably
    # (proves migration refuses to silently fabricate random UUID identities)
    os.environ.pop("MIGRATION_CLEAR_UNMAPPED_PROVENANCE", None)
    with pytest.raises(Exception) as exc_info:
        command.upgrade(alembic_cfg, "head")
    assert "unmapped legacy revision_provenance rows without revision_id" in str(exc_info.value)

    # 4. Upgrade to head with controlled policy MIGRATION_CLEAR_UNMAPPED_PROVENANCE=true
    os.environ["MIGRATION_CLEAR_UNMAPPED_PROVENANCE"] = "true"
    try:
        command.upgrade(alembic_cfg, "head")
    finally:
        os.environ.pop("MIGRATION_CLEAR_UNMAPPED_PROVENANCE", None)

    # 5. Verify schema integrity at head
    inspector = inspect(pg_engine)
    cols_head = {c["name"]: c for c in inspector.get_columns("revision_provenances", schema=SCHEMA)}
    assert "revision_id" in cols_head
    assert cols_head["revision_id"]["nullable"] is False

    # 6. Verify semantic invariant: controlled rebuild restores exact revision lookup
    session_factory = sessionmaker(bind=pg_engine, expire_on_commit=False)
    repo = PostgresNarrativeRepository(
        session_factory=session_factory,
        tenant_id=str(test_tenant),
        actor_id=str(uuid.uuid4()),
    )
    # Rebuild provenance for known revision
    known_rev_id = f"rev-legacy-{uuid.uuid4().hex[:8]}"
    repo.record_revision_provenance(
        story_id=str(test_novel),
        chapter_id=str(test_chap_id),
        revision_id=known_rev_id,
        chapter_number=7,
    )

    prov = repo.get_revision_provenance(str(test_novel), known_rev_id)
    assert prov is not None, "Rebuilt legacy revision must resolve"
    assert prov["chapter_number"] == 7, "Rebuilt legacy revision must preserve exact chapter_number"
    assert str(prov["revision_id"]) == str(repo._stable_uuid("revision", known_rev_id))


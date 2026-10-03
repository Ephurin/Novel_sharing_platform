"""PostgreSQL integration tests for unadapted narrative context invariants.

Validates on real PostgreSQL + pgvector:
1. Entity cutoff & future-entity leakage prevention (entities with first_chapter > cutoff excluded).
2. As-of state projection across chapter cutoff boundaries.
3. Event supersession resolution up to chapter cutoff.
4. Cross-tenant isolation (tenant A cannot see tenant B's entities, events, or facts).
5. Normalized latest-five recent event participant IDs via EventParticipantRecord.
"""
from __future__ import annotations

import json
import os
import sys
import uuid
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from application.context_budget import ContextBudgetPacker
from application.writing_service import WritingService
from infrastructure.database import session_scope
from infrastructure.orm_models import (
    CurrentEntityStateRecord,
    EntityRecord,
    EventParticipantRecord,
    EventRecord,
    FactRecord,
    StateTransitionRecord,
    StoryBrainRecord,
)
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from run_ctx_rd_01_unadapted_narrative_e2e import (
    build_event_record_from_memory,
    derive_memory_source_and_ambiguity_status,
)

pytestmark = pytest.mark.postgres_integration


def get_postgres_url() -> str:
    url = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL") or "postgresql+psycopg://postgres:postgres@localhost:5433/ephurin"
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    if not url.startswith("postgresql"):
        raise pytest.UsageError("A valid PostgreSQL URL is required for postgres_integration tests.")
    return url


@pytest.fixture(scope="module")
def pg_session_factory():
    url = get_postgres_url()
    engine = create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        if os.getenv("CI") or os.getenv("REQUIRE_POSTGRES") == "1":
            pytest.fail(f"PostgreSQL required but not reachable at {url}: {exc}")
        pytest.skip(f"PostgreSQL not reachable at {url}: {exc}")
    return sessionmaker(bind=engine)


def test_entity_chapter_cutoff_and_future_leakage_prevention(pg_session_factory: Any) -> None:
    """Entities with first_chapter > cutoff must be excluded from get_structured_context."""
    tenant_id = uuid.uuid4()
    novel_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    brain_id = uuid.uuid4()

    with session_scope(pg_session_factory) as session:
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
        session.flush()

        # Entity 1: introduced at chapter 10 (early character)
        e1_id = uuid.uuid4()
        session.add(
            EntityRecord(
                id=e1_id,
                story_brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                entity_type="character",
                canonical_name="Alan Frost",
                normalized_name="alan frost",
                static_attributes={"status": "active", "first_chapter": 10},
                source_type="author",
                confirmation_status="confirmed",
            )
        )
        # Entity 2: introduced at chapter 30 (mid character)
        e2_id = uuid.uuid4()
        session.add(
            EntityRecord(
                id=e2_id,
                story_brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                entity_type="character",
                canonical_name="Elena Thorn",
                normalized_name="elena thorn",
                static_attributes={"status": "active", "first_chapter": 30},
                source_type="author",
                confirmation_status="confirmed",
            )
        )
        # Entity 3: introduced at chapter 61 (future character - Batch_7 tail)
        e3_id = uuid.uuid4()
        session.add(
            EntityRecord(
                id=e3_id,
                story_brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                entity_type="character",
                canonical_name="Zephyr Sovereign",
                normalized_name="zephyr sovereign",
                static_attributes={"status": "active", "first_chapter": 61},
                source_type="author",
                confirmation_status="confirmed",
            )
        )

    repo = PostgresNarrativeRepository(pg_session_factory, tenant_id=tenant_id, actor_id=actor_id)

    # At cutoff chapter 32: e1 (Ch10) and e2 (Ch30) must be included, e3 (Ch61) MUST be excluded!
    pkg_ch32 = repo.get_structured_context(story_id=str(novel_id), chapter_number=32)
    entity_names_32 = {e["name"] for e in pkg_ch32.entities}
    assert "Alan Frost" in entity_names_32
    assert "Elena Thorn" in entity_names_32
    assert "Zephyr Sovereign" not in entity_names_32, "Future entity leaked past chapter cutoff 32!"

    # At cutoff chapter 49: e1 and e2 included, e3 (Ch61) still MUST be excluded!
    pkg_ch49 = repo.get_structured_context(story_id=str(novel_id), chapter_number=49)
    entity_names_49 = {e["name"] for e in pkg_ch49.entities}
    assert "Alan Frost" in entity_names_49
    assert "Elena Thorn" in entity_names_49
    assert "Zephyr Sovereign" not in entity_names_49, "Future entity leaked past chapter cutoff 49!"

    # At cutoff chapter 61: all 3 entities are included
    pkg_ch61 = repo.get_structured_context(story_id=str(novel_id), chapter_number=61)
    entity_names_61 = {e["name"] for e in pkg_ch61.entities}
    assert "Alan Frost" in entity_names_61
    assert "Elena Thorn" in entity_names_61
    assert "Zephyr Sovereign" in entity_names_61


def test_as_of_state_projection_across_cutoff(pg_session_factory: Any) -> None:
    """State transitions must only project up to active events/facts within the chapter cutoff."""
    tenant_id = uuid.uuid4()
    novel_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    brain_id = uuid.uuid4()

    ent_id = uuid.uuid4()
    ev1_id = uuid.uuid4()
    ev2_id = uuid.uuid4()

    with session_scope(pg_session_factory) as session:
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
        session.flush()

        session.add(
            EntityRecord(
                id=ent_id,
                story_brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                entity_type="character",
                canonical_name="Cavalry Commander",
                normalized_name="cavalry commander",
                static_attributes={"status": "healthy", "location": "Fortress"},
                source_type="author",
                confirmation_status="confirmed",
            )
        )
        # Event at Ch 45: Landslide
        session.add(
            EventRecord(
                id=ev1_id,
                story_brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                narrative_order=45001,
                event_type="event_summary",
                summary="Landslide near gorge",
                participants=["Cavalry Commander"],
                chapter_number=45,
                source_type="author",
                confirmation_status="confirmed",
            )
        )
        # Event at Ch 52: Aftermath
        session.add(
            EventRecord(
                id=ev2_id,
                story_brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                narrative_order=52001,
                event_type="event_summary",
                summary="Rescue arrived",
                participants=["Cavalry Commander"],
                chapter_number=52,
                source_type="author",
                confirmation_status="confirmed",
            )
        )
        session.flush()

        # Add participant links required by projection engine
        session.add(EventParticipantRecord(event_id=ev1_id, entity_id=ent_id, participant_role="actor"))
        session.add(EventParticipantRecord(event_id=ev2_id, entity_id=ent_id, participant_role="actor"))

        # State transition at Ch 45 event: status -> buried
        session.add(
            StateTransitionRecord(
                id=uuid.uuid4(),
                story_brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                entity_id=ent_id,
                event_id=ev1_id,
                sequence=1,
                attribute_key="status",
                new_value="buried_in_gorge",
            )
        )
        # State transition at Ch 52 event: status -> rescued
        session.add(
            StateTransitionRecord(
                id=uuid.uuid4(),
                story_brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                entity_id=ent_id,
                event_id=ev2_id,
                sequence=2,
                attribute_key="status",
                new_value="rescued",
            )
        )

    repo = PostgresNarrativeRepository(pg_session_factory, tenant_id=tenant_id, actor_id=actor_id)

    # At cutoff Ch 49: state should be "buried_in_gorge" (Ch 52 transition must NOT leak!)
    pkg_ch49 = repo.get_structured_context(story_id=str(novel_id), chapter_number=49)
    state_map_ch49 = {s["entity_id"]: s for s in pkg_ch49.current_states}
    state_ch49 = state_map_ch49.get(str(ent_id), {})
    assert state_ch49.get("status") == "buried_in_gorge", f"Expected buried_in_gorge at Ch49, got {state_ch49}"

    # At cutoff Ch 55: state should be "rescued"
    pkg_ch55 = repo.get_structured_context(story_id=str(novel_id), chapter_number=55)
    state_map_ch55 = {s["entity_id"]: s for s in pkg_ch55.current_states}
    state_ch55 = state_map_ch55.get(str(ent_id), {})
    assert state_ch55.get("status") == "rescued", f"Expected rescued at Ch55, got {state_ch55}"


def test_event_supersession_and_temporal_cutoff(pg_session_factory: Any) -> None:
    """Superseded events must be excluded from structured context recent events."""
    tenant_id = uuid.uuid4()
    novel_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    brain_id = uuid.uuid4()

    ev1_id = uuid.uuid4()
    ev2_id = uuid.uuid4()
    ev3_id = uuid.uuid4()

    with session_scope(pg_session_factory) as session:
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
        session.flush()

        # Event 1: Initial cavalry report in Ch 45
        session.add(
            EventRecord(
                id=ev1_id,
                story_brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                narrative_order=45001,
                event_type="event_summary",
                summary="Initial burial report in Ch 45",
                chapter_number=45,
                source_type="author",
                confirmation_status="confirmed",
            )
        )
        # Event 2: Correction in Ch 47 superseding Event 1
        session.add(
            EventRecord(
                id=ev2_id,
                story_brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                narrative_order=47001,
                event_type="event_summary",
                summary="Revised cavalry count in Ch 47",
                chapter_number=47,
                event_metadata={"supersedes_id": str(ev1_id)},
                source_type="author",
                confirmation_status="confirmed",
            )
        )
        # Event 3: Future event in Ch 55
        session.add(
            EventRecord(
                id=ev3_id,
                story_brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                narrative_order=55001,
                event_type="event_summary",
                summary="Later battle in Ch 55",
                chapter_number=55,
                source_type="author",
                confirmation_status="confirmed",
            )
        )

    repo = PostgresNarrativeRepository(pg_session_factory, tenant_id=tenant_id, actor_id=actor_id)

    # At cutoff Ch 49:
    # Event 1 should be excluded because it is superseded by Event 2.
    # Event 2 should be included.
    # Event 3 should be excluded because chapter_number > 49.
    pkg = repo.get_structured_context(story_id=str(novel_id), chapter_number=49)
    event_ids = {str(e.get("event_id") or e.get("id")) for e in pkg.recent_events}
    assert str(ev1_id) not in event_ids, "Superseded event 1 must not be present!"
    assert str(ev2_id) in event_ids, "Active superseding event 2 must be present!"
    assert str(ev3_id) not in event_ids, "Future event 3 must not be present past cutoff 49!"


def test_cross_tenant_isolation(pg_session_factory: Any) -> None:
    """Data from Tenant A must never be visible to Tenant B."""
    tenant_a = uuid.uuid4()
    tenant_b = uuid.uuid4()
    novel_a = uuid.uuid4()
    novel_b = uuid.uuid4()
    actor_id = uuid.uuid4()

    with session_scope(pg_session_factory) as session:
        brain_a = StoryBrainRecord(
            id=uuid.uuid4(),
            tenant_id=tenant_a,
            novel_id=novel_a,
            status="active",
            brain_version=1,
            schema_version=1,
        )
        brain_b = StoryBrainRecord(
            id=uuid.uuid4(),
            tenant_id=tenant_b,
            novel_id=novel_b,
            status="active",
            brain_version=1,
            schema_version=1,
        )
        session.add_all([brain_a, brain_b])
        session.flush()

        # Tenant A entity
        session.add(
            EntityRecord(
                id=uuid.uuid4(),
                story_brain_id=brain_a.id,
                tenant_id=tenant_a,
                novel_id=novel_a,
                entity_type="character",
                canonical_name="Tenant A Secret Hero",
                normalized_name="tenant a secret hero",
                static_attributes={"status": "active", "first_chapter": 1},
                source_type="author",
                confirmation_status="confirmed",
            )
        )
        # Tenant B entity
        session.add(
            EntityRecord(
                id=uuid.uuid4(),
                story_brain_id=brain_b.id,
                tenant_id=tenant_b,
                novel_id=novel_b,
                entity_type="character",
                canonical_name="Tenant B Secret Hero",
                normalized_name="tenant b secret hero",
                static_attributes={"status": "active", "first_chapter": 1},
                source_type="author",
                confirmation_status="confirmed",
            )
        )

    repo_a = PostgresNarrativeRepository(pg_session_factory, tenant_id=tenant_a, actor_id=actor_id)
    repo_b = PostgresNarrativeRepository(pg_session_factory, tenant_id=tenant_b, actor_id=actor_id)

    pkg_a = repo_a.get_structured_context(story_id=str(novel_a), chapter_number=10)
    names_a = {e["name"] for e in pkg_a.entities}
    assert "Tenant A Secret Hero" in names_a
    assert "Tenant B Secret Hero" not in names_a, "Tenant B entity leaked into Tenant A!"

    pkg_b = repo_b.get_structured_context(story_id=str(novel_b), chapter_number=10)
    names_b = {e["name"] for e in pkg_b.entities}
    assert "Tenant B Secret Hero" in names_b
    assert "Tenant A Secret Hero" not in names_b, "Tenant A entity leaked into Tenant B!"


def test_normalized_latest_five_recent_event_participants(pg_session_factory: Any) -> None:
    """The latest five events must extract canonical participant IDs via EventParticipantRecord."""
    tenant_id = uuid.uuid4()
    novel_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    brain_id = uuid.uuid4()

    with session_scope(pg_session_factory) as session:
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
        session.flush()

        ent1_id = uuid.uuid4()
        ent2_id = uuid.uuid4()
        session.add(
            EntityRecord(
                id=ent1_id,
                story_brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                entity_type="character",
                canonical_name="Hero One",
                normalized_name="hero one",
                static_attributes={"status": "active", "first_chapter": 1},
                source_type="author",
                confirmation_status="confirmed",
            )
        )
        session.add(
            EntityRecord(
                id=ent2_id,
                story_brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                entity_type="character",
                canonical_name="Hero Two",
                normalized_name="hero two",
                static_attributes={"status": "active", "first_chapter": 1},
                source_type="author",
                confirmation_status="confirmed",
            )
        )

        for i in range(1, 7):
            ev_id = uuid.uuid4()
            session.add(
                EventRecord(
                    id=ev_id,
                    story_brain_id=brain_id,
                    tenant_id=tenant_id,
                    novel_id=novel_id,
                    narrative_order=i * 100,
                    event_type="event_summary",
                    summary=f"Event number {i}",
                    chapter_number=i,
                    source_type="author",
                    confirmation_status="confirmed",
                )
            )
            session.flush()
            # Events 4, 5, 6 have ent1 and ent2 as participants
            if i in (4, 5, 6):
                session.add(EventParticipantRecord(event_id=ev_id, entity_id=ent1_id, participant_role="actor"))
                session.add(EventParticipantRecord(event_id=ev_id, entity_id=ent2_id, participant_role="actor"))

    repo = PostgresNarrativeRepository(pg_session_factory, tenant_id=tenant_id, actor_id=actor_id)
    pkg = repo.get_structured_context(story_id=str(novel_id), chapter_number=10)

    recent_participant_ids = pkg.context_summary.get("recent_scope_participant_entity_ids", [])
    assert str(ent1_id) in recent_participant_ids
    assert str(ent2_id) in recent_participant_ids


def test_ambiguous_source_status_preservation_in_recent_events_and_prompt(pg_session_factory: Any) -> None:
    """Ambiguous/conflicting source reports (Ch45, 47, 49) must preserve review_status and ambiguity metadata.

    Runner-derived test: uses the exact build_event_record_from_memory and derive_memory_source_and_ambiguity_status
    materialization functions from run_ctx_rd_01_unadapted_narrative_e2e.py to ensure that:
    1. PostgresNarrativeRepository.get_structured_context preserves source_status='ambiguous' and is_ambiguous=True.
    2. ContextBudgetPacker.prompt_context(WritingService.preview_context(...)) preserves those ambiguity flags in
       prompt recent_events, strictly asserting that incompatible reports are NEVER presented as undisputed 'canonical' truths.
    3. Deduplicated recent memories retain their full source/ambiguity metadata without flattening.
    """
    tenant_id = uuid.uuid4()
    novel_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    brain_id = uuid.uuid4()

    # Load authentic frozen memories from corpus
    corpus_file = ROOT / ".data" / "Frozen_v1" / "memory_chunks_canonical.json"
    if corpus_file.exists():
        raw_mems = json.loads(corpus_file.read_text(encoding="utf-8"))["memories"]
        mem_by_id = {str(m["memory_id"]): m for m in raw_mems}
        cavalry_mems = [
            mem_by_id["mem-000164"],
            mem_by_id["mem-000172"],
            mem_by_id["mem-000176"],
        ]
    else:
        cavalry_mems = [
            {
                "memory_id": "mem-000164",
                "chapter_number": 45,
                "content": "Landslide at Dragon's Tooth Canyon buries Roland's three-thousand heavy cavalry.",
                "memory_type": "event_summary",
                "review_status": "ambiguous",
                "tags": ["narrative_echo", "temporal_reset", "do_not_use_as_clean_ground_truth"],
                "entities": ["ent-roland"],
            },
            {
                "memory_id": "mem-000172",
                "chapter_number": 47,
                "content": "Repeated report of 3000 cavalry buried under avalanche.",
                "memory_type": "event_summary",
                "review_status": "ambiguous",
                "tags": ["narrative_echo", "temporal_reset", "do_not_use_as_clean_ground_truth"],
                "entities": ["ent-roland"],
            },
            {
                "memory_id": "mem-000176",
                "chapter_number": 49,
                "content": "Roland's 3000 cavalry arrives intact with two solar artillery systems.",
                "memory_type": "event_summary",
                "review_status": "ambiguous",
                "tags": ["force_state_conflict", "temporal_reset", "do_not_use_as_clean_ground_truth"],
                "entities": ["ent-roland"],
            },
        ]

    with session_scope(pg_session_factory) as session:
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
        session.flush()

        # Seed Roland entity
        roland_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, f"{novel_id}:entity:ent-roland")
        session.add(
            EntityRecord(
                id=roland_uuid,
                story_brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                entity_type="character",
                canonical_name="Roland",
                normalized_name="roland",
                description="Commander of the heavy cavalry",
                static_attributes={"status": "active", "source_entity_id": "ent-roland", "first_chapter": 1},
                source_type="author",
                confirmation_status="confirmed",
                confidence=1.0,
                is_locked=True,
            )
        )
        session.flush()

        # Seed reports using EXACT runner factory function
        entity_name_map = {"ent-roland": "Roland"}
        for idx, mem in enumerate(cavalry_mems):
            ch = int(mem.get("chapter_number") or 1)
            event_rec = build_event_record_from_memory(
                brain_id=brain_id,
                tenant_id=tenant_id,
                novel_id=novel_id,
                mem=mem,
                narrative_order=ch * 1000 + idx,
                entity_name_map=entity_name_map,
            )
            session.add(event_rec)
        session.flush()

    repo = PostgresNarrativeRepository(pg_session_factory, tenant_id=tenant_id, actor_id=actor_id)

    # 1. Repository-level structured context verification
    pkg = repo.get_structured_context(story_id=str(novel_id), chapter_number=49)
    recent_by_mid = {
        (ev.get("metadata") or {}).get("memory_id"): ev
        for ev in pkg.recent_events
    }
    for mem in cavalry_mems:
        mid = mem["memory_id"]
        assert mid in recent_by_mid, f"{mid} must be present in structured recent_events"
        ev = recent_by_mid[mid]
        meta = ev.get("metadata") or {}
        # Strict assertion: ambiguous reports MUST NOT be flattened to canonical
        assert meta.get("source_status") == "ambiguous", f"{mid} source_status must be 'ambiguous'"
        assert meta.get("source_status") != "canonical", f"{mid} source_status must NOT be 'canonical'"
        assert meta.get("review_status") == "ambiguous", f"{mid} review_status must be 'ambiguous'"
        assert meta.get("is_ambiguous") is True, f"{mid} is_ambiguous must be True"
        assert meta.get("is_ambiguous_ground_truth") is True, f"{mid} is_ambiguous_ground_truth must be True"
        assert meta.get("report_semantics") == "confirmed_source_report"
        # Confirmation status at storage level represents confirmed source report
        assert ev.get("confirmation_status") in ("confirmed", None)

    # 2. WritingService preview and packed prompt context verification
    svc = WritingService(
        repository=repo,
        llm_service=object(),
        context_routing_policy="balanced-scope-v1",
    )
    preview = svc.preview_context(
        tenant_id=str(tenant_id),
        story_id=str(novel_id),
        chapter_number=49,
    )
    packer = ContextBudgetPacker()
    prompt_payload = packer.prompt_context(preview)

    prompt_recent_by_mid = {
        (ev.get("metadata") or {}).get("memory_id"): ev
        for ev in prompt_payload.get("recent_events", [])
    }
    for mem in cavalry_mems:
        mid = mem["memory_id"]
        assert mid in prompt_recent_by_mid, f"{mid} must be retained in prompt recent_events"
        ev = prompt_recent_by_mid[mid]
        meta = ev.get("metadata") or {}
        # In the actual prompt given to the LLM, the conflicting claims must be marked ambiguous
        assert meta.get("source_status") == "ambiguous", f"Prompt event {mid} source_status must be 'ambiguous'"
        assert meta.get("source_status") != "canonical", f"Prompt event {mid} source_status must NOT be 'canonical'"
        assert meta.get("is_ambiguous") is True, f"Prompt event {mid} is_ambiguous must be True"
        assert meta.get("is_ambiguous_ground_truth") is True
        assert meta.get("report_semantics") == "confirmed_source_report"


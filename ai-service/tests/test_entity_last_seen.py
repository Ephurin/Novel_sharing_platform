"""N8 (live retest 3): entity locations were never filled, so every character was "Unknown" in memory,
the writing context and the canon fact check, although approved events record their places."""
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from domain.last_seen import last_seen_locations
from domain.models import NarrativeProposal
from infrastructure.orm_models import Base, SCHEMA
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from services.rule_consistency import canon_facts_from_brain

ENTITIES = [("vu", "Trần Vũ", "PER"), ("lam", "Lam Yên", "PER"), ("tk", "Thạch Khê", "LOC"), ("ls", "Lôi Sơn", "LOC")]


def test_latest_event_with_a_place_wins_and_places_are_not_located():
    seen = last_seen_locations(ENTITIES, [
        (1, ["vu", "lam"], ["tk"]),
        (2, ["vu", "ls"], ["ls"]),        # a place listed as participant is skipped
        (3, ["Lam Yên"], []),             # no place: does not erase the earlier one
        (4, ["vu"], ["không có", "Lôi Sơn"]),  # unknown refs skipped, names resolve
    ])
    assert seen["vu"] == {"location": "Lôi Sơn", "location_id": "ls", "chapter": 4}
    assert seen["lam"]["location"] == "Thạch Khê" and seen["lam"]["chapter"] == 1
    assert "ls" not in seen and "tk" not in seen


def test_canon_facts_use_last_seen_wording_only_for_unknown_places():
    brain = SimpleNamespace(
        entities=[SimpleNamespace(entity_id=i, name=n, entity_type=t, location="Unknown", approved_profile={})
                  for i, n, t in ENTITIES[:3]],
        events=[SimpleNamespace(event_id="e1", chapter=2, summary="Gặp nhau", participants=("vu",),
                                metadata={"locations": ["tk"]})])
    brain.entities[1].location = "Kinh thành"
    texts = [f["text"] for f in canon_facts_from_brain(brain, [])]
    assert "Trần Vũ xuất hiện gần nhất ở Thạch Khê (chương 2)" in texts
    assert "Lam Yên ở Kinh thành" in texts


@pytest.fixture
def repo():
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False},
                           poolclass=StaticPool, execution_options={"schema_translate_map": {SCHEMA: None}})
    Base.metadata.create_all(engine)
    tenant = "00000000-0000-0000-0000-000000000001"
    yield PostgresNarrativeRepository(sessionmaker(bind=engine, expire_on_commit=False), tenant_id=tenant, actor_id=tenant)
    engine.dispose()


def test_writing_context_fills_an_unknown_place_from_events_up_to_the_cutoff(repo):
    group = "30000000-0000-0000-0000-000000000001"
    entity = lambda n, name, kind: NarrativeProposal(f"20000000-0000-0000-0000-0000000000{n}", "entity",
        {"canonical_name": name, "normalized_name": name.casefold(), "entity_type": kind}, dependency_group_id=group,
        materialization_order=n)
    event = lambda n, chapter, place: NarrativeProposal(f"20000000-0000-0000-0000-0000000000{n}", "event",
        {"event_type": "travel", "summary": f"Vũ tới {place}", "participants": ["Trần Vũ"], "locations": [place],
         "chapter": chapter}, dependency_group_id=group, materialization_order=n)
    proposals = [entity(10, "Trần Vũ", "PER"), entity(11, "Thạch Khê", "LOC"), entity(12, "Lôi Sơn", "LOC"),
                 event(20, 1, "Thạch Khê"), event(21, 3, "Lôi Sơn")]
    repo.save_proposals("story", proposals)
    repo.accept_proposal_group("story", [p.proposal_id for p in proposals], expected_brain_version=1)
    by_name = lambda package: {e["name"]: e["location"] for e in package.entities}
    assert by_name(repo.get_structured_context("story", chapter_number=2))["Trần Vũ"] == \
        "Thạch Khê (xuất hiện gần nhất, chương 1)"
    assert by_name(repo.get_structured_context("story", chapter_number=4))["Trần Vũ"].startswith("Lôi Sơn")
    assert by_name(repo.get_structured_context("story", chapter_number=4))["Lôi Sơn"] == "Unknown"

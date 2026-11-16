"""Findings from the fourth P2 live retest (2026-11-16): Q2 setup and extraction entity types differ,
Q3 too few events per chapter."""
import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from application.entity_hitl import HITL_EVENT_INSTRUCTIONS
from domain.models import NarrativeProposal
from infrastructure.orm_models import Base, SCHEMA
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository


@pytest.fixture
def repo():
    engine = create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False},
                           poolclass=StaticPool, execution_options={"schema_translate_map": {SCHEMA: None}})
    Base.metadata.create_all(engine)
    tenant = "00000000-0000-0000-0000-000000000001"
    yield PostgresNarrativeRepository(sessionmaker(bind=engine, expire_on_commit=False), tenant_id=tenant, actor_id=tenant)
    engine.dispose()


def entities(repo, *specs):
    group = "30000000-0000-0000-0000-000000000001"
    proposals = [NarrativeProposal(f"20000000-0000-0000-0000-0000000000{10 + i}", "entity",
                 {"canonical_name": name, "normalized_name": name.casefold(), "entity_type": kind},
                 dependency_group_id=group, materialization_order=i) for i, (name, kind) in enumerate(specs)]
    repo.save_proposals("story", proposals)
    repo.accept_proposal_group("story", [p.proposal_id for p in proposals], expected_brain_version=1)
    return {e.name: e.entity_id for e in repo.get_story_brain("story").entities}


def test_q2_a_setup_location_merges_with_an_extracted_loc(repo):
    ids = entities(repo, ("Lôi Sơn", "location"), ("núi Lôi Sơn", "LOC"))
    repo.merge_entities("story", ids["núi Lôi Sơn"], ids["Lôi Sơn"], expected_brain_version=2)
    assert [e.name for e in repo.get_story_brain("story").entities] == ["Lôi Sơn"]


def test_q2_different_kinds_still_do_not_merge(repo):
    ids = entities(repo, ("Lôi Sơn", "location"), ("Trần Vũ", "PER"))
    with pytest.raises(ValueError, match="same type"):
        repo.merge_entities("story", ids["Trần Vũ"], ids["Lôi Sơn"], expected_brain_version=2)


def test_q3_event_prompt_asks_for_every_distinct_event_and_its_place():
    text = HITL_EVENT_INSTRUCTIONS
    assert "3 to 8 events" in text and "do not merge separate scenes" in text
    assert "locations: reviewed entity_id values of the places" in text
    shape = json.loads(text[text.index('{"events"'):text.index('. No predictions')])
    assert shape["events"][0]["locations"] == ["exact reviewed entity_id"]

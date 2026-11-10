import uuid
from dataclasses import replace
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from application.narrative_service import NarrativeApplicationService
from core.story_kb_manager import StoryKBManager
from domain.errors import OptimisticLockError
from domain.models import NarrativeProposal, ProposalStatus
from domain.projection import (
    WORLD_RULE_LINEAGE_MALFORMED,
    WORLD_RULE_SUCCESSOR_UNVERIFIED,
    ProjectionError,
    WorldRuleLineageError,
    resolve_effective_facts,
)
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.json_narrative_repository import JsonNarrativeRepository
from infrastructure.postgres_narrative_repository import PostgresNarrativeRepository
from infrastructure.orm_models import Base, SCHEMA, EventParticipantRecord, StateTransitionRecord


@pytest.fixture(params=["memory", "json", "sql"])
def repo(request, tmp_path):
    engine = None
    if request.param == "memory":
        result = InMemoryNarrativeRepository()
    elif request.param == "json":
        result = JsonNarrativeRepository(StoryKBManager(tmp_path))
    else:
        engine = create_engine("sqlite://", execution_options={"schema_translate_map": {SCHEMA: None}})
        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, _):
            connection.execute("PRAGMA foreign_keys=ON")
        Base.metadata.create_all(engine)
        result = PostgresNarrativeRepository(sessionmaker(bind=engine, expire_on_commit=False),
            tenant_id=str(uuid.uuid4()), actor_id=str(uuid.uuid4()))
    result.upsert_entity("story", {"name": "Minh", "type": "PER"})
    result.upsert_entity("story", {"name": "Lan", "type": "PER"})
    yield result
    if engine:
        engine.dispose()


def accept(repo, proposals):
    version = int(repo.get_story_brain("story").metadata.get("brain_version", "1"))
    proposals = [replace(p, expected_brain_version=version) for p in proposals]
    repo.save_proposals("story", proposals)
    return repo.accept_proposal_group("story", [p.proposal_id for p in proposals], version)


def event_group(value=90, *, supersedes=None, attribute="health"):
    group = str(uuid.uuid4())
    event_id = str(uuid.uuid4())
    event_payload = {"event_id": event_id, "event_type": "injury", "summary": "Minh was injured",
                     "participants": ["Minh"], "chapter": 1}
    if supersedes:
        event_payload["supersedes_id"] = supersedes
    return [NarrativeProposal(event_id, "event", event_payload, dependency_group_id=group),
            NarrativeProposal(str(uuid.uuid4()), "state_transition", {
                "event_id": event_id, "entity_id": "Minh", "attribute_key": attribute, "new_value": value},
                dependency_group_id=group, materialization_order=1)]


def test_rebuild_equals_online_and_provenance_survives_reload(repo):
    proposals = event_group()
    accept(repo, proposals)
    state = repo.get_current_state("story")
    entity_id = next(e.entity_id for e in repo.list_entities("story") if e.name == "Minh")
    assert state["entities"][entity_id]["health"] == 90
    assert state["provenance"][entity_id]["health"]["transition_id"] == proposals[1].proposal_id
    assert repo.rebuild_projection("story", 2) == state
    assert repo.rebuild_projection("story", 2) == state
    assert repo.get_story_brain("story").metadata["brain_version"] == "2"
    if isinstance(repo, JsonNarrativeRepository):
        assert JsonNarrativeRepository(StoryKBManager(repo._manager.storage_dir)).get_current_state("story") == state
    if isinstance(repo, PostgresNarrativeRepository):
        with repo._session_factory() as session:
            assert len(session.scalars(select(EventParticipantRecord)).all()) == 1
            assert len(session.scalars(select(StateTransitionRecord)).all()) == 1


def test_correction_replays_at_original_position_and_preserves_history(repo):
    first, later = event_group(90), event_group(70)
    accept(repo, first)
    accept(repo, later)
    old = repo.get_story_brain("story").events
    correction = event_group(100, supersedes=first[0].proposal_id)
    accept(repo, correction)
    brain = repo.get_story_brain("story")
    assert brain.events[:2] == old
    assert len(brain.events) == 3
    assert next(iter(brain.current_state["entities"].values()))["health"] == 70
    assert repo.rebuild_projection("story", 4) == brain.current_state
    second = event_group(50, supersedes=correction[0].proposal_id)
    accept(repo, second)
    assert next(iter(repo.get_current_state("story")["entities"].values()))["health"] == 70


def test_bad_transition_rolls_back_whole_group_then_can_retry(repo):
    proposals = event_group(101)
    repo.save_proposals("story", proposals)
    with pytest.raises(ProjectionError):
        repo.accept_proposal_group("story", [p.proposal_id for p in proposals], 1)
    brain = repo.get_story_brain("story")
    assert not brain.events and not brain.transitions
    assert all(p.status == ProposalStatus.PENDING for p in brain.proposals)
    assert brain.metadata.get("brain_version", "1") == "1"
    repo.accept_proposal_group("story", [p.proposal_id for p in proposals], 1,
        edited_payloads={proposals[1].proposal_id: {**proposals[1].payload, "new_value": 80}})
    assert len(repo.get_story_brain("story").transitions) == 1


def test_transition_cannot_reference_another_story(repo):
    first = event_group()
    accept(repo, first)
    repo.upsert_entity("other", {"name": "Minh", "type": "PER"})
    proposal = replace(first[1], proposal_id=str(uuid.uuid4()))
    repo.save_proposals("other", [proposal])
    with pytest.raises(ProjectionError):
        repo.accept_proposal_group("other", [proposal.proposal_id], 1)


def test_relationship_projection_has_transition_provenance(repo):
    proposals = event_group({"Lan": "ALLY_OF"}, attribute="active_relationships")
    accept(repo, proposals)
    state = repo.get_current_state("story")
    assert state["relationships"][0]["transition_id"] == proposals[1].proposal_id
    assert any(r["relation"] == "ALLY_OF" for r in repo.get_related_entities("story", "Minh"))
    assert repo.rebuild_projection("story", 2) == state
    accept(repo, event_group({}, supersedes=proposals[0].proposal_id, attribute="active_relationships"))
    assert not any(r["relation"] == "ALLY_OF" for r in repo.get_related_entities("story", "Minh"))


def test_locked_relationship_rolls_back(repo):
    repo.override_relation("story", "Minh", "ENEMY_OF", "Lan")
    with pytest.raises(OptimisticLockError):
        accept(repo, event_group({"Lan": "ALLY_OF"}, attribute="active_relationships"))
    assert not repo.get_story_brain("story").events


def test_initial_fact_produces_transition_and_baseline(repo):
    entity = next(e for e in repo.list_entities("story") if e.name == "Minh")
    accept(repo, [NarrativeProposal(str(uuid.uuid4()), "fact", {
        "subject_entity_id": entity.entity_id, "fact_type": "initial_state",
        "fact_key": "location", "fact_value": "Village"})])
    state = repo.get_current_state("story")
    assert state["entities"][entity.entity_id]["location"] == "Village"
    assert state["provenance"][entity.entity_id]["location"]["fact_id"]
    assert repo.rebuild_projection("story", 2) == state


def test_rebuild_failure_keeps_previous_projection_and_retry_is_safe(repo):
    accept(repo, event_group())
    state = repo.get_current_state("story")
    module = ("domain.projection" if isinstance(repo, JsonNarrativeRepository)
              else type(repo).__module__)
    with patch(f"{module}.project", side_effect=ProjectionError("injected failure")):
        with pytest.raises(ProjectionError):
            repo.rebuild_projection("story", 2)
    assert repo.get_current_state("story") == state
    assert repo.rebuild_projection("story", 2) == state
    with pytest.raises(OptimisticLockError):
        repo.rebuild_projection("story", 1)


def test_correction_service_creates_pending_group(repo):
    first = event_group()
    accept(repo, first)
    service = NarrativeApplicationService(repo)
    corrections = service.propose_event_correction("story", first[0].proposal_id,
        {"event_type": "injury", "summary": "Minor injury", "participants": ["Minh"]},
        [{"entity_id": "Minh", "attribute_key": "health", "new_value": 95}], 2)
    assert len(repo.get_story_brain("story").events) == 1
    service.accept_proposal_group("story", [p.proposal_id for p in corrections], 2)
    assert next(iter(repo.get_current_state("story")["entities"].values()))["health"] == 95


def test_duplicate_event_and_competing_correction_are_rejected(repo):
    first = event_group()
    accept(repo, first)
    duplicate = replace(first[0], proposal_id=str(uuid.uuid4()))
    with pytest.raises(ProjectionError):
        accept(repo, [duplicate])
    correction = event_group(80, supersedes=first[0].proposal_id)
    accept(repo, correction)
    with pytest.raises(ProjectionError):
        accept(repo, event_group(60, supersedes=first[0].proposal_id))
    assert len(repo.get_story_brain("story").events) == 2


def test_matching_author_relationship_is_preserved_and_rebuild_matches(repo):
    repo.override_relation("story", "Minh", "ALLY_OF", "Lan")
    accept(repo, event_group({"Lan": "ALLY_OF"}, attribute="active_relationships"))
    state = repo.get_current_state("story")
    assert repo.rebuild_projection("story", 2) == state
    assert any(r.locked for r in repo.get_story_brain("story").relations if r.object == "Lan")


def test_sql_tenant_scope_on_state_and_correction(repo):
    if not isinstance(repo, PostgresNarrativeRepository):
        pytest.skip("SQL tenant boundary")
    proposals = event_group()
    accept(repo, proposals)
    other = PostgresNarrativeRepository(repo._session_factory,
        tenant_id=str(uuid.uuid4()), actor_id=str(uuid.uuid4()))
    assert other.get_current_state("story")["entities"] == {}
    with pytest.raises(KeyError):
        NarrativeApplicationService(other).propose_event_correction("story", proposals[0].proposal_id, {}, [], 1)


def _setup_rule(fact_id, key="mana_cap", value="Tier 3", *, supersedes_id=None, is_locked=False,
                is_retired=False, source_type="author_setup", confirmation_status="confirmed",
                created_by="00000000-0000-0000-0000-000000000002", tenant_id="00000000-0000-0000-0000-000000000001",
                novel_id="11111111-1111-1111-1111-111111111111", story_brain_id="22222222-2222-2222-2222-222222222222",
                **extra):
    return {
        "fact_id": fact_id,
        "story_brain_id": story_brain_id,
        "tenant_id": tenant_id,
        "novel_id": novel_id,
        "subject_entity_id": None,
        "fact_type": "world_rule",
        "fact_key": key,
        "fact_value": value,
        "source_type": source_type,
        "confirmation_status": confirmation_status,
        "is_locked": is_locked,
        "source_revision_id": None,
        "chapter_number": None,
        "source_start": None,
        "source_end": None,
        "created_by": created_by,
        "supersedes_id": supersedes_id,
        "is_retired": is_retired,
        **extra,
    }


_SCOPE = dict(
    tenant_id="00000000-0000-0000-0000-000000000001",
    novel_id="11111111-1111-1111-1111-111111111111",
    story_brain_id="22222222-2222-2222-2222-222222222222",
)


def _p1_fact(fact_id, key="hair", value="black", *, supersedes_id=None, is_retired=False,
             confirmation_status="confirmed", fact_type="character_trait",
             subject_entity_id="33333333-3333-3333-3333-333333333333", chapter_number=1):
    return {
        "fact_id": fact_id, **_SCOPE, "subject_entity_id": subject_entity_id, "fact_type": fact_type,
        "fact_key": key, "fact_value": value, "source_type": "AI", "confirmation_status": confirmation_status,
        "is_locked": False, "source_revision_id": "44444444-4444-4444-4444-444444444444",
        "chapter_number": chapter_number, "source_start": 0, "source_end": 5, "created_by": None,
        "supersedes_id": supersedes_id, "is_retired": is_retired,
    }


def test_resolve_effective_facts_independent_setup_roots_and_retirement_semantics():
    a = _setup_rule("a", "teleport_rule", "No teleport in barrier", is_locked=True)
    b = _setup_rule("b", "alchemy_rule", "Tier 4 requires soul fire", is_locked=True, source_type="model_suggestion")
    retired = _setup_rule("c", "old_rule", "Retired standalone", is_locked=True, is_retired=True)
    pending = _setup_rule("d", "teleport_rule", "Pending amendment", supersedes_id="a", confirmation_status="proposed")
    effective = resolve_effective_facts([a, b, retired, pending], **_SCOPE,
                                        expected_setup_actor="00000000-0000-0000-0000-000000000002")
    # Standalone retirement keeps pre-existing Approved Memory semantics (hidden, not an error);
    # an unconfirmed successor never replaces the approved root.
    assert [f["fact_id"] for f in effective] == ["a", "b"]


def test_resolve_effective_facts_preserves_p1_corrections_and_retirement():
    trait_v1 = _p1_fact("t1", value="black")
    trait_v2 = _p1_fact("t2", value="white", supersedes_id="t1")
    ch_rule_v1 = _p1_fact("w1", "barrier", "sealed", fact_type="world_rule", subject_entity_id=None)
    ch_rule_v2 = _p1_fact("w2", "barrier", "open", fact_type="world_rule", subject_entity_id=None, supersedes_id="w1")
    retired_trait = _p1_fact("t3", "eyes", "blue", is_retired=True)
    unknown_parent = _p1_fact("t4", "height", "tall", supersedes_id="legacy-missing")
    setup_root = _setup_rule("s1", "gravity", "Standard gravity", is_locked=True)
    effective = resolve_effective_facts(
        [trait_v1, trait_v2, ch_rule_v1, ch_rule_v2, retired_trait, unknown_parent, setup_root], **_SCOPE)
    assert [f["fact_id"] for f in effective] == ["t2", "w2", "t4", "s1"]


@pytest.mark.parametrize("successor_kwargs", [
    {},
    {"is_locked": True},
    {"source_type": "author"},
    {"source_type": "model_suggestion"},
    {"source_type": "AI"},
    {"created_by": "99999999-9999-9999-9999-999999999999"},
    {"created_by": None},
    {"is_retired": True},
])
@pytest.mark.parametrize("root_locked", [False, True])
def test_well_formed_but_unaudited_setup_successor_fails_closed(successor_kwargs, root_locked):
    root = _setup_rule("root-1", "gravity", "Standard gravity", is_locked=root_locked)
    child = _setup_rule("child-1", "gravity", "Amended gravity", supersedes_id="root-1", **successor_kwargs)
    with pytest.raises(WorldRuleLineageError) as raised:
        resolve_effective_facts([root, child], **_SCOPE,
                                expected_setup_actor="00000000-0000-0000-0000-000000000002")
    assert raised.value.code == WORLD_RULE_SUCCESSOR_UNVERIFIED


@pytest.mark.parametrize("attachment", ["entity_bound", "chapter_scoped", "revision_bound", "p1_trait"])
def test_non_setup_fact_cannot_supersede_setup_root(attachment):
    root = _setup_rule("root-1", "gravity", "Standard gravity", is_locked=True)
    if attachment == "p1_trait":
        child = _p1_fact("child-1", supersedes_id="root-1")
    else:
        extra = {"entity_bound": {"subject_entity_id": "33333333-3333-3333-3333-333333333333"},
                 "chapter_scoped": {"chapter_number": 2},
                 "revision_bound": {"source_revision_id": "44444444-4444-4444-4444-444444444444"}}[attachment]
        child = _setup_rule("child-1", "gravity", "Attached", supersedes_id="root-1", **extra)
    with pytest.raises(WorldRuleLineageError) as raised:
        resolve_effective_facts([root, child], **_SCOPE)
    assert raised.value.code == WORLD_RULE_SUCCESSOR_UNVERIFIED


@pytest.mark.parametrize("malformed", [
    "self_loop", "orphan_parent", "cycle_2", "cycle_3", "stem_cycle", "fork",
    "unconfirmed_parent", "cross_scope_parent_not_loaded",
])
def test_malformed_setup_lineage_fails_closed(malformed):
    root = _setup_rule("root-1", "gravity", "Standard gravity", is_locked=True)
    if malformed == "self_loop":
        facts = [_setup_rule("root-1", "gravity", "Self", supersedes_id="root-1")]
    elif malformed in ("orphan_parent", "cross_scope_parent_not_loaded"):
        facts = [_setup_rule("child-1", "gravity", "Orphan", supersedes_id="missing-id")]
    elif malformed == "cycle_2":
        facts = [_setup_rule("node-a", "gravity", "A", supersedes_id="node-b"),
                 _setup_rule("node-b", "gravity", "B", supersedes_id="node-a")]
    elif malformed == "cycle_3":
        facts = [_setup_rule("node-a", "gravity", "A", supersedes_id="node-c"),
                 _setup_rule("node-b", "gravity", "B", supersedes_id="node-a"),
                 _setup_rule("node-c", "gravity", "C", supersedes_id="node-b")]
    elif malformed == "stem_cycle":
        facts = [root, _setup_rule("node-a", "gravity", "A", supersedes_id="node-b"),
                 _setup_rule("node-b", "gravity", "B", supersedes_id="node-a")]
    elif malformed == "fork":
        facts = [root, _setup_rule("child-1", "gravity", "Branch 1", supersedes_id="root-1"),
                 _setup_rule("child-2", "gravity", "Branch 2", supersedes_id="root-1")]
    elif malformed == "unconfirmed_parent":
        facts = [_setup_rule("root-1", "gravity", "Proposed parent", confirmation_status="proposed"),
                 _setup_rule("child-1", "gravity", "Child", supersedes_id="root-1")]
    else:
        raise AssertionError(malformed)
    with pytest.raises(WorldRuleLineageError) as raised:
        resolve_effective_facts(facts, **_SCOPE)
    assert raised.value.code in {WORLD_RULE_SUCCESSOR_UNVERIFIED, WORLD_RULE_LINEAGE_MALFORMED}


@pytest.mark.parametrize("scope_key", ["tenant_id", "novel_id", "story_brain_id"])
def test_cross_scope_fact_rows_fail_closed(scope_key):
    root = _setup_rule("root-1", "gravity", "Standard gravity")
    foreign = _setup_rule("child-1", "gravity", "Cross", **{scope_key: "99999999-9999-9999-9999-999999999999"})
    with pytest.raises(ProjectionError):
        resolve_effective_facts([root, foreign], **_SCOPE)

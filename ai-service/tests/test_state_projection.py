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
from domain.projection import ProjectionError, resolve_effective_facts
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


def test_resolve_effective_facts_valid_chains_and_independent_rules():
    r1_root = _setup_rule("r1-root", "teleport_rule", "No teleport in barrier", is_locked=True)
    r1_mid = _setup_rule("r1-mid", "teleport_rule", "Short-range teleport only", supersedes_id="r1-root", is_locked=True)
    r1_leaf = _setup_rule("r1-leaf", "teleport_rule", "Teleport allowed with royal seal", supersedes_id="r1-mid", is_locked=False)
    r2_single = _setup_rule("r2-single", "alchemy_rule", "Tier 4 requires soul fire", is_locked=True)
    effective = resolve_effective_facts(
        [r1_root, r1_mid, r1_leaf, r2_single],
        tenant_id="00000000-0000-0000-0000-000000000001",
        novel_id="11111111-1111-1111-1111-111111111111",
        story_brain_id="22222222-2222-2222-2222-222222222222",
        expected_setup_actor="00000000-0000-0000-0000-000000000002",
    )
    assert [f["fact_id"] for f in effective] == ["r1-leaf", "r2-single"]
    assert effective[0]["fact_value"] == "Teleport allowed with royal seal"
    assert effective[0]["is_locked"] is False


@pytest.mark.parametrize("malformed", [
    "self_loop",
    "orphan_parent",
    "cycle_2",
    "cycle_3",
    "stem_cycle",
    "fork",
    "cross_tenant",
    "cross_novel",
    "cross_brain",
    "unconfirmed_successor",
    "unconfirmed_parent",
    "ai_successor",
    "model_suggestion_successor",
    "actor_mismatch",
    "null_actor",
    "entity_bound_successor",
    "chapter_scoped_successor",
    "retired_standalone_leaf",
    "retired_chain_leaf",
])
def test_resolve_effective_facts_rejects_malformed_lineage(malformed):
    root = _setup_rule("root-1", "gravity", "Standard gravity", is_locked=True)
    if malformed == "self_loop":
        facts = [_setup_rule("root-1", "gravity", "Self", supersedes_id="root-1")]
    elif malformed == "orphan_parent":
        facts = [_setup_rule("child-1", "gravity", "Orphan", supersedes_id="missing-id")]
    elif malformed == "cycle_2":
        facts = [
            _setup_rule("node-a", "gravity", "A", supersedes_id="node-b"),
            _setup_rule("node-b", "gravity", "B", supersedes_id="node-a"),
        ]
    elif malformed == "cycle_3":
        facts = [
            _setup_rule("node-a", "gravity", "A", supersedes_id="node-c"),
            _setup_rule("node-b", "gravity", "B", supersedes_id="node-a"),
            _setup_rule("node-c", "gravity", "C", supersedes_id="node-b"),
        ]
    elif malformed == "stem_cycle":
        facts = [
            root,
            _setup_rule("node-a", "gravity", "A", supersedes_id="node-b"),
            _setup_rule("node-b", "gravity", "B", supersedes_id="node-a"),
        ]
    elif malformed == "fork":
        facts = [
            root,
            _setup_rule("child-1", "gravity", "Branch 1", supersedes_id="root-1"),
            _setup_rule("child-2", "gravity", "Branch 2", supersedes_id="root-1"),
        ]
    elif malformed == "cross_tenant":
        facts = [root, _setup_rule("child-1", "gravity", "Cross", supersedes_id="root-1", tenant_id="99999999-9999-9999-9999-999999999999")]
    elif malformed == "cross_novel":
        facts = [root, _setup_rule("child-1", "gravity", "Cross", supersedes_id="root-1", novel_id="99999999-9999-9999-9999-999999999999")]
    elif malformed == "cross_brain":
        facts = [root, _setup_rule("child-1", "gravity", "Cross", supersedes_id="root-1", story_brain_id="99999999-9999-9999-9999-999999999999")]
    elif malformed == "unconfirmed_successor":
        facts = [root, _setup_rule("child-1", "gravity", "Proposed", supersedes_id="root-1", confirmation_status="proposed")]
    elif malformed == "unconfirmed_parent":
        facts = [
            _setup_rule("root-1", "gravity", "Proposed parent", confirmation_status="proposed"),
            _setup_rule("child-1", "gravity", "Child", supersedes_id="root-1"),
        ]
    elif malformed == "ai_successor":
        facts = [root, _setup_rule("child-1", "gravity", "AI hijack", supersedes_id="root-1", source_type="AI")]
    elif malformed == "model_suggestion_successor":
        facts = [root, _setup_rule("child-1", "gravity", "Model suggestion hijack", supersedes_id="root-1", source_type="model_suggestion")]
    elif malformed == "actor_mismatch":
        facts = [root, _setup_rule("child-1", "gravity", "Foreign actor", supersedes_id="root-1", created_by="99999999-9999-9999-9999-999999999999")]
    elif malformed == "null_actor":
        facts = [root, _setup_rule("child-1", "gravity", "Null actor", supersedes_id="root-1", created_by=None)]
    elif malformed == "entity_bound_successor":
        facts = [root, _setup_rule("child-1", "gravity", "Entity bound", supersedes_id="root-1", subject_entity_id="33333333-3333-3333-3333-333333333333")]
    elif malformed == "chapter_scoped_successor":
        facts = [root, _setup_rule("child-1", "gravity", "Chapter scoped", supersedes_id="root-1", chapter_number=2)]
    elif malformed == "retired_standalone_leaf":
        facts = [_setup_rule("root-1", "gravity", "Retired leaf", is_retired=True)]
    elif malformed == "retired_chain_leaf":
        facts = [root, _setup_rule("child-1", "gravity", "Retired successor", supersedes_id="root-1", is_retired=True)]
    else:
        raise AssertionError(malformed)

    with pytest.raises(ProjectionError):
        resolve_effective_facts(
            facts,
            tenant_id="00000000-0000-0000-0000-000000000001",
            novel_id="11111111-1111-1111-1111-111111111111",
            story_brain_id="22222222-2222-2222-2222-222222222222",
            expected_setup_actor="00000000-0000-0000-0000-000000000002",
        )


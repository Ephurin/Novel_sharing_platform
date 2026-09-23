from __future__ import annotations

import hashlib
import json

from application.context_budget import (
    CONTEXT_PACKING_VERSION,
    TOKEN_ESTIMATOR_VERSION,
    ContextBudgetPacker,
)
from application.writing_service import WritingService
from core.fake_llm import FakeDeterministicLLMService
from domain.models import WritingContextPackage


def _entity(entity_id: str, *, locked: bool = False, pad: str = "") -> dict:
    return {
        "entity_id": entity_id,
        "name": entity_id,
        "entity_type": "character",
        "status": "Alive",
        "location": "Somewhere",
        "is_locked": locked,
        "description": pad,
    }


def _state(entity_id: str, *, pad: str = "") -> dict:
    return {
        "entity_id": entity_id,
        "name": entity_id,
        "status": "Alive",
        "location": "Somewhere",
        "state": {"note": pad},
    }


def _rule(rule_id: str, *, locked: bool = False, pad: str = "") -> dict:
    return {
        "id": rule_id,
        "fact_type": "world_rule",
        "fact_key": rule_id,
        "fact_value": f"Rule {rule_id} {pad}",
        "is_locked": locked,
    }


def _recent(event_id: str, chapter: int, *, pad: str = "") -> dict:
    return {
        "event_id": event_id,
        "narrative_order": chapter * 1024,
        "chapter_number": chapter,
        "event_type": "event",
        "summary": f"Recent {event_id} {pad}",
        "participants": [],
        "metadata": {},
    }


def _semantic(memory_id: str, *, event_id: str = "", pad: str = "") -> dict:
    return {
        "memory_chunk_id": memory_id,
        "memory_type": "event_summary",
        "content": f"Semantic {memory_id} {pad}",
        "content_hash": memory_id,
        "embedding_version": "test-768-v1",
        "cosine_distance": 0.1,
        "narrative_order": 1,
        "chapter_number": 1,
        "event_id": event_id or None,
        "entity_ids": [],
        "importance_score": 0.5,
        "semantic_score": 1.0,
        "entity_overlap_score": 0.0,
        "temporal_score": 0.5,
        "relationship_score": 0.0,
        "hybrid_score": 0.8,
        "metadata": {},
    }


def _package(**kwargs) -> WritingContextPackage:
    values = {
        "brain_version": 7,
        "entities": (),
        "current_states": (),
        "recent_events": (),
        "semantic_memories": (),
        "world_rules": (),
        "author_constraints": (),
        "token_budget": {},
        "context_summary": {},
    }
    values.update(kwargs)
    return WritingContextPackage(**values)


def test_packer_obeys_budget_and_preserves_locked_rule_and_author_constraint() -> None:
    packer = ContextBudgetPacker()
    package = _package(
        entities=(_entity("e1"), _entity("e2", pad="x" * 600)),
        current_states=(_state("e1"), _state("e2", pad="x" * 600)),
        world_rules=(
            _rule("locked", locked=True),
            _rule("optional", pad="x" * 600),
        ),
        author_constraints=("Never resurrect the dead.",),
        recent_events=(_recent("r1", 1, pad="x" * 600),),
        semantic_memories=(_semantic("m1", pad="x" * 600),),
    )

    protected = _package(
        world_rules=(_rule("locked", locked=True),),
        author_constraints=("Never resurrect the dead.",),
    )
    maximum = packer.estimate_prompt_tokens(protected) + 120
    packed = packer.pack(package, maximum=maximum)

    assert packed.token_budget["used"] <= maximum
    assert packed.token_budget["budget_overflow"] is False
    assert packed.world_rules[0]["id"] == "locked"
    assert packed.author_constraints == ("Never resurrect the dead.",)
    assert packed.token_budget["packing_version"] == CONTEXT_PACKING_VERSION
    assert packed.token_budget["estimator_version"] == TOKEN_ESTIMATOR_VERSION


def test_protected_only_overflow_is_explicit_and_never_truncates() -> None:
    packer = ContextBudgetPacker()
    locked = _rule("locked", locked=True, pad="world " * 500)
    constraint = "constraint " * 500
    package = _package(
        world_rules=(locked, _rule("optional")),
        author_constraints=(constraint,),
        semantic_memories=(_semantic("m1"),),
        recent_events=(_recent("r1", 1),),
    )

    packed = packer.pack(package, maximum=20)

    assert packed.world_rules == (locked,)
    assert packed.author_constraints == (constraint,)
    assert packed.semantic_memories == ()
    assert packed.recent_events == ()
    assert packed.token_budget["protected_overflow"] is True
    assert packed.token_budget["budget_overflow"] is True


def test_locked_entity_and_state_bundle_is_protected_and_atomic() -> None:
    packer = ContextBudgetPacker()
    e1 = _entity("e1", locked=True)
    s1 = _state("e1")
    package = _package(
        entities=(e1, _entity("e2", pad="x" * 200)),
        current_states=(s1, _state("e2", pad="x" * 200)),
    )

    maximum = packer.estimate_prompt_tokens(
        _package(entities=(e1,), current_states=(s1,))
    )
    packed = packer.pack(package, maximum=maximum)

    assert [item["entity_id"] for item in packed.entities] == ["e1"]
    assert [item["entity_id"] for item in packed.current_states] == ["e1"]


def test_entity_state_bundle_is_never_partially_selected() -> None:
    packer = ContextBudgetPacker()
    e1, s1 = _entity("e1"), _state("e1")
    e2, s2 = _entity("e2"), _state("e2")
    package = _package(
        entities=(e1, e2),
        current_states=(s1, s2),
    )
    maximum = packer.estimate_prompt_tokens(
        _package(entities=(e1,), current_states=(s1,))
    )

    packed = packer.pack(package, maximum=maximum)

    entity_ids = [item["entity_id"] for item in packed.entities]
    state_ids = [item["entity_id"] for item in packed.current_states]
    assert entity_ids == ["e1"]
    assert state_ids == ["e1"]


def test_semantic_order_is_preserved_as_selected_subsequence() -> None:
    packer = ContextBudgetPacker()
    first = _semantic("m1")
    second = _semantic("m2")
    third = _semantic("m3")
    package = _package(semantic_memories=(first, second, third))
    maximum = packer.estimate_prompt_tokens(
        _package(semantic_memories=(first, second))
    )

    packed = packer.pack(package, maximum=maximum)

    assert [item["memory_chunk_id"] for item in packed.semantic_memories] == ["m1", "m2"]
    assert packed.context_summary["dropped_semantic_memory_ids"] == ["m3"]


def test_semantic_recent_duplicate_uses_canonical_event_once_and_promotes_it() -> None:
    packer = ContextBudgetPacker()
    event = _recent("event-1", 4)
    package = _package(
        recent_events=(event, _recent("event-2", 5)),
        semantic_memories=(
            _semantic("mem-1", event_id="event-1"),
            _semantic("mem-old"),
        ),
    )

    packed = packer.pack(package, maximum=10_000)

    assert "mem-1" not in [item["memory_chunk_id"] for item in packed.semantic_memories]
    assert [item["event_id"] for item in packed.recent_events].count("event-1") == 1
    assert packed.context_summary["deduplicated_semantic_memory_ids"] == ["mem-1"]
    assert packed.token_budget["deduplicated_semantic_count"] == 1


def test_newest_remaining_recent_event_wins_under_tight_budget() -> None:
    packer = ContextBudgetPacker()
    newest = _recent("r3", 3)
    package = _package(
        recent_events=(
            _recent("r1", 1),
            _recent("r2", 2),
            newest,
        )
    )
    maximum = packer.estimate_prompt_tokens(_package(recent_events=(newest,)))

    packed = packer.pack(package, maximum=maximum)

    assert [item["event_id"] for item in packed.recent_events] == ["r3"]


def test_oversized_optional_semantic_does_not_block_smaller_later_memory() -> None:
    packer = ContextBudgetPacker()
    huge = _semantic("huge", pad="x" * 4000)
    small = _semantic("small")
    package = _package(semantic_memories=(huge, small))
    maximum = packer.estimate_prompt_tokens(_package(semantic_memories=(small,)))

    packed = packer.pack(package, maximum=maximum)

    assert [item["memory_chunk_id"] for item in packed.semantic_memories] == ["small"]
    assert "huge" in packed.context_summary["dropped_semantic_memory_ids"]


def test_identical_input_produces_identical_package_and_trace() -> None:
    packer = ContextBudgetPacker()
    package = _package(
        entities=(_entity("e1"),),
        current_states=(_state("e1"),),
        world_rules=(_rule("r1", locked=True), _rule("r2")),
        recent_events=(_recent("ev1", 1),),
        semantic_memories=(_semantic("m1"),),
    )

    first = packer.pack(package, maximum=800)
    second = packer.pack(package, maximum=800)

    assert first == second


class _OneContextRepository:
    def __init__(self, package: WritingContextPackage) -> None:
        self.package = package
        self.jobs = {}

    def get_structured_context(self, story_id: str, **kwargs):
        assert kwargs["enforce_token_budget"] is False
        return self.package

    def get_story_brain(self, story_id: str):
        class _Brain:
            metadata = {"brain_version": "1"}
        return _Brain()

    def get_writing_job(self, job_id: str):
        if job_id not in self.jobs:
            raise KeyError(job_id)
        return self.jobs[job_id]

    def create_writing_job(self, job):
        self.jobs[job.job_id] = job
        return job

    def save_writing_job(self, job):
        self.jobs[job.job_id] = job
        return job


def test_writing_service_hashes_and_sends_exact_packed_prompt_context() -> None:
    huge = _recent("drop-me", 1, pad="x" * 5000)
    locked = _rule("locked", locked=True)
    source_package = _package(
        world_rules=(locked,),
        recent_events=(huge,),
    )
    default_budget = ContextBudgetPacker().estimate_prompt_tokens(
        _package(world_rules=(locked,))
    )
    packer = ContextBudgetPacker(default_budget=default_budget)
    repo = _OneContextRepository(source_package)
    llm = FakeDeterministicLLMService()
    service = WritingService(repo, llm, context_packer=packer)

    source_text = "Current chapter."
    content_hash = hashlib.sha256(source_text.encode("utf-8")).hexdigest()
    job = service.start_generation(
        tenant_id="tenant",
        novel_id="novel",
        chapter_id="chapter",
        revision_id="revision",
        content_hash=content_hash,
        operation="continue",
        selection={"start": 0, "end": len(source_text), "cursor": len(source_text)},
        instruction="Continue.",
        expected_brain_version=1,
        source_text=source_text,
        process_inline=True,
    )

    sent = llm.last_call["context_package"]
    assert sent == packer.prompt_context(
        service.preview_context(tenant_id="tenant", story_id="novel")
    )
    assert sent["recent_events"] == []
    assert sent["world_rules"][0]["id"] == "locked"
    assert "drop-me" in job.context_summary["dropped_event_ids"]
    expected_hash = hashlib.sha256(
        json.dumps(sent, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()
    assert job.context_hash == expected_hash
    assert job.context_summary["context_packing_version"] == [CONTEXT_PACKING_VERSION]

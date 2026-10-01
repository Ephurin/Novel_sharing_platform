from __future__ import annotations

from application.context_scope import BalancedRelevanceScopeBuilder
from domain.models import WritingContextPackage


def _entity(entity_id: str, *, locked: bool = False, name: str | None = None, **extra):
    return {
        "entity_id": entity_id,
        "name": name or entity_id,
        "is_locked": locked,
        **extra,
    }


def _state(entity_id: str):
    return {"entity_id": entity_id, "state": {"status": "active"}}


def test_balanced_scope_preserves_required_entity_sources_and_evidence_lanes() -> None:
    package = WritingContextPackage(
        brain_version=7,
        entities=(
            _entity("query", name="Query Hero"),
            _entity("semantic"),
            _entity("recent"),
            _entity("locked", locked=True),
            _entity("explicit", name="Focused Character"),
            _entity("noise"),
        ),
        current_states=tuple(
            _state(entity_id)
            for entity_id in ("query", "semantic", "recent", "locked", "explicit", "noise")
        ),
        recent_events=({"event_id": "ev-1"},),
        semantic_memories=(
            {
                "memory_chunk_id": "mem-1",
                "entity_ids": ["semantic"],
                "metadata": {"positive_memory_ids": ["gold-should-not-drive-scope"]},
            },
        ),
        world_rules=({"id": "rule-1"},),
        author_constraints=("keep tone",),
        context_summary={"gold_entity_ids": ["noise"]},
    )

    result = BalancedRelevanceScopeBuilder().scope(
        package,
        query_entity_ids=("query", "unknown"),
        recent_participant_entity_ids=("recent", "missing"),
        explicit_character_name="Focused Character",
    )

    assert [row["entity_id"] for row in result.package.entities] == [
        "query",
        "semantic",
        "recent",
        "locked",
        "explicit",
    ]
    assert [row["entity_id"] for row in result.package.current_states] == [
        "query",
        "semantic",
        "recent",
        "locked",
        "explicit",
    ]
    assert result.package.recent_events == package.recent_events
    assert result.package.semantic_memories == package.semantic_memories
    assert result.package.world_rules == package.world_rules
    assert result.package.author_constraints == package.author_constraints
    assert result.query_entity_ids == ("explicit", "query")
    assert result.semantic_entity_ids == ("semantic",)
    assert result.recent_participant_entity_ids == ("recent",)
    assert result.locked_entity_ids == ("locked",)
    assert result.entity_count_before == 6
    assert result.entity_count_after == 5
    assert result.state_count_before == 6
    assert result.state_count_after == 5


def test_balanced_scope_is_deterministic_and_ignores_unknown_ids() -> None:
    package = WritingContextPackage(
        brain_version=1,
        entities=(_entity("e1"), _entity("e2")),
        current_states=(_state("e1"), _state("e2")),
        semantic_memories=({"memory_chunk_id": "m1", "entity_ids": ["e1", "missing"]},),
    )
    builder = BalancedRelevanceScopeBuilder()

    first = builder.scope(
        package,
        query_entity_ids=("missing",),
        recent_participant_entity_ids=("missing",),
    )
    second = builder.scope(
        package,
        query_entity_ids=("missing",),
        recent_participant_entity_ids=("missing",),
    )

    assert first == second
    assert [row["entity_id"] for row in first.package.entities] == ["e1"]
    assert [row["entity_id"] for row in first.package.current_states] == ["e1"]

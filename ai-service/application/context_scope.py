from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Iterable

from domain.models import WritingContextPackage


BALANCED_SCOPE_VERSION = "balanced-scope-v1"


@dataclass(frozen=True, slots=True)
class ContextScopeResult:
    package: WritingContextPackage
    policy: str
    query_entity_ids: tuple[str, ...]
    semantic_entity_ids: tuple[str, ...]
    recent_participant_entity_ids: tuple[str, ...]
    locked_entity_ids: tuple[str, ...]
    entity_count_before: int
    entity_count_after: int
    state_count_before: int
    state_count_after: int


class BalancedRelevanceScopeBuilder:
    """Scope only entity/current-state breadth; preserve all evidence lanes."""

    policy = BALANCED_SCOPE_VERSION

    def scope(
        self,
        package: WritingContextPackage,
        *,
        query_entity_ids: Iterable[str] = (),
        recent_participant_entity_ids: Iterable[str] = (),
        explicit_character_name: str | None = None,
    ) -> ContextScopeResult:
        available_entity_ids = {
            self._entity_id(entity)
            for entity in package.entities
            if self._entity_id(entity)
        }

        locked_ids = {
            self._entity_id(entity)
            for entity in package.entities
            if bool(entity.get("is_locked")) and self._entity_id(entity)
        }
        query_ids = {
            str(value)
            for value in query_entity_ids
            if str(value) in available_entity_ids
        }
        recent_ids = {
            str(value)
            for value in recent_participant_entity_ids
            if str(value) in available_entity_ids
        }

        semantic_ids: set[str] = set()
        for memory in package.semantic_memories:
            entity_id = memory.get("entity_id")
            if entity_id is not None and str(entity_id) in available_entity_ids:
                semantic_ids.add(str(entity_id))
            for value in memory.get("entity_ids", []) or []:
                if str(value) in available_entity_ids:
                    semantic_ids.add(str(value))

        explicit_ids: set[str] = set()
        explicit_name = str(explicit_character_name or "").strip().casefold()
        if explicit_name:
            for entity in package.entities:
                if str(entity.get("name") or "").strip().casefold() == explicit_name:
                    entity_id = self._entity_id(entity)
                    if entity_id:
                        explicit_ids.add(entity_id)

        if len(explicit_ids) != 1:
            explicit_ids.clear()

        wanted = locked_ids | query_ids | semantic_ids | recent_ids | explicit_ids

        entities = tuple(
            entity
            for entity in package.entities
            if self._entity_id(entity) in wanted
        )
        kept_ids = {
            self._entity_id(entity)
            for entity in entities
            if self._entity_id(entity)
        }
        states = tuple(
            state
            for state in package.current_states
            if self._entity_id(state) in kept_ids
        )

        scoped = replace(
            package,
            entities=entities,
            current_states=states,
        )

        return ContextScopeResult(
            package=scoped,
            policy=self.policy,
            query_entity_ids=tuple(sorted(query_ids | explicit_ids)),
            semantic_entity_ids=tuple(sorted(semantic_ids)),
            recent_participant_entity_ids=tuple(sorted(recent_ids)),
            locked_entity_ids=tuple(sorted(locked_ids)),
            entity_count_before=len(package.entities),
            entity_count_after=len(entities),
            state_count_before=len(package.current_states),
            state_count_after=len(states),
        )

    @staticmethod
    def _entity_id(item: dict) -> str:
        value = item.get("entity_id") or item.get("id")
        return str(value) if value is not None else ""

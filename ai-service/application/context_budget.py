from __future__ import annotations

import json
import math
from dataclasses import replace
from typing import Any

from domain.models import WritingContextPackage


CONTEXT_PACKING_VERSION = "context-budget-v1"
TOKEN_ESTIMATOR_VERSION = "utf8-json-bytes-3-v1"
DEFAULT_CONTEXT_TOKEN_BUDGET = 12_000


class ContextBudgetPacker:
    """Deterministically select whole context artifacts under an estimated token budget."""

    def __init__(
        self,
        *,
        default_budget: int = DEFAULT_CONTEXT_TOKEN_BUDGET,
    ) -> None:
        if default_budget <= 0:
            raise ValueError("default_budget must be positive")
        self.default_budget = int(default_budget)

    @staticmethod
    def prompt_context(package: WritingContextPackage) -> dict[str, Any]:
        """Return the exact Story Brain payload intended for the writing LLM."""
        return {
            "brain_version": package.brain_version,
            "entities": list(package.entities),
            "current_states": list(package.current_states),
            "world_rules": list(package.world_rules),
            "author_constraints": list(package.author_constraints),
            "recent_events": list(package.recent_events),
            "semantic_memories": list(package.semantic_memories),
        }

    @classmethod
    def estimate_prompt_tokens(cls, package: WritingContextPackage) -> int:
        serialized = json.dumps(
            cls.prompt_context(package),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        ).encode("utf-8")
        return max(1, math.ceil(len(serialized) / 3))

    def pack(
        self,
        package: WritingContextPackage,
        *,
        maximum: int | None = None,
    ) -> WritingContextPackage:
        budget = int(maximum) if maximum is not None and int(maximum) > 0 else self.default_budget
        before_tokens = self.estimate_prompt_tokens(package)

        locked_rules = [rule for rule in package.world_rules if bool(rule.get("is_locked"))]
        unlocked_rules = [rule for rule in package.world_rules if not bool(rule.get("is_locked"))]

        selected_rules: list[dict[str, Any]] = list(locked_rules)
        selected_constraints: list[str] = list(package.author_constraints)
        selected_entities: list[dict[str, Any]] = []
        selected_states: list[dict[str, Any]] = []
        selected_semantic: list[dict[str, Any]] = []
        selected_recent: list[dict[str, Any]] = []

        dropped_rule_ids: list[str] = []
        dropped_entity_ids: list[str] = []
        dropped_event_ids: list[str] = []
        dropped_semantic_ids: list[str] = []
        deduplicated_semantic_ids: list[str] = []

        state_by_entity: dict[str, dict[str, Any]] = {}
        orphan_states: list[dict[str, Any]] = []
        for state in package.current_states:
            entity_id = self._entity_id(state)
            if entity_id:
                state_by_entity.setdefault(entity_id, state)
            else:
                orphan_states.append(state)

        entity_bundles: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
        bundled_state_ids: set[str] = set()
        locked_entity_bundles: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
        optional_entity_bundles: list[tuple[dict[str, Any], dict[str, Any] | None]] = []
        for entity in package.entities:
            entity_id = self._entity_id(entity)
            state = state_by_entity.get(entity_id) if entity_id else None
            if state is not None and entity_id:
                bundled_state_ids.add(entity_id)
            bundle = (entity, state)
            entity_bundles.append(bundle)
            if bool(entity.get("is_locked")):
                locked_entity_bundles.append(bundle)
            else:
                optional_entity_bundles.append(bundle)

        for entity_id, state in state_by_entity.items():
            if entity_id not in bundled_state_ids and all(
                self._entity_id(entity) != entity_id for entity in package.entities
            ):
                optional_entity_bundles.append(({}, state))

        # Protected artifacts are added intact even when they overflow.
        for entity, state in locked_entity_bundles:
            if entity:
                selected_entities.append(entity)
            if state:
                selected_states.append(state)

        protected_package = self._build_package(
            package,
            entities=selected_entities,
            states=selected_states,
            rules=selected_rules,
            constraints=selected_constraints,
            recent=[],
            semantic=[],
        )
        protected_tokens = self.estimate_prompt_tokens(protected_package)
        protected_overflow = protected_tokens > budget

        recent_by_event: dict[str, dict[str, Any]] = {}
        for event in package.recent_events:
            event_id = self._event_id(event)
            if event_id:
                recent_by_event[event_id] = event

        promoted_recent_ids: set[str] = set()
        evidence_candidates: list[tuple[str, dict[str, Any], str | None]] = []
        seen_promoted_events: set[str] = set()
        for memory in package.semantic_memories:
            memory_id = self._semantic_id(memory)
            event_id = self._event_id(memory)
            if event_id and event_id in recent_by_event:
                deduplicated_semantic_ids.append(memory_id)
                if event_id not in seen_promoted_events:
                    evidence_candidates.append(
                        ("recent", recent_by_event[event_id], memory_id)
                    )
                    seen_promoted_events.add(event_id)
                    promoted_recent_ids.add(event_id)
                continue
            evidence_candidates.append(("semantic", memory, None))

        def candidate_package(
            *,
            entities: list[dict[str, Any]] | None = None,
            states: list[dict[str, Any]] | None = None,
            rules: list[dict[str, Any]] | None = None,
            recent: list[dict[str, Any]] | None = None,
            semantic: list[dict[str, Any]] | None = None,
        ) -> WritingContextPackage:
            return self._build_package(
                package,
                entities=selected_entities if entities is None else entities,
                states=selected_states if states is None else states,
                rules=selected_rules if rules is None else rules,
                constraints=selected_constraints,
                recent=selected_recent if recent is None else recent,
                semantic=selected_semantic if semantic is None else semantic,
            )

        def fits(candidate: WritingContextPackage) -> bool:
            return self.estimate_prompt_tokens(candidate) <= budget

        if not protected_overflow:
            # Entity/current-state bundles are atomic.
            for entity, state in optional_entity_bundles:
                next_entities = [*selected_entities, entity] if entity else list(selected_entities)
                next_states = [*selected_states, state] if state else list(selected_states)
                if fits(candidate_package(entities=next_entities, states=next_states)):
                    if entity:
                        selected_entities.append(entity)
                    if state:
                        selected_states.append(state)
                else:
                    identifier = self._entity_id(entity) or self._entity_id(state or {})
                    if identifier:
                        dropped_entity_ids.append(identifier)

            # Canonical non-locked rules precede derived semantic memory.
            for rule in unlocked_rules:
                next_rules = [*selected_rules, rule]
                if fits(candidate_package(rules=next_rules)):
                    selected_rules.append(rule)
                else:
                    dropped_rule_ids.append(self._rule_id(rule))

            # Preserve hybrid order. A semantic duplicate promotes the canonical
            # recent-event representation into this priority lane.
            for kind, artifact, _memory_id in evidence_candidates:
                if kind == "semantic":
                    next_semantic = [*selected_semantic, artifact]
                    if fits(candidate_package(semantic=next_semantic)):
                        selected_semantic.append(artifact)
                    else:
                        dropped_semantic_ids.append(self._semantic_id(artifact))
                else:
                    event_id = self._event_id(artifact)
                    if event_id and any(self._event_id(item) == event_id for item in selected_recent):
                        continue
                    next_recent = [*selected_recent, artifact]
                    if fits(candidate_package(recent=next_recent)):
                        selected_recent.append(artifact)
                    elif event_id:
                        dropped_event_ids.append(event_id)

            # Remaining recent events compete newest-first, then are restored to
            # chronological output order below.
            already_selected_event_ids = {
                self._event_id(event) for event in selected_recent if self._event_id(event)
            }
            remaining_recent = [
                event
                for event in package.recent_events
                if self._event_id(event) not in already_selected_event_ids
                and self._event_id(event) not in promoted_recent_ids
            ]
            for event in reversed(remaining_recent):
                next_recent = [*selected_recent, event]
                if fits(candidate_package(recent=next_recent)):
                    selected_recent.append(event)
                else:
                    event_id = self._event_id(event)
                    if event_id:
                        dropped_event_ids.append(event_id)

            # State records without any stable entity identity are lowest priority
            # but may still fit. They remain whole artifacts.
            for state in orphan_states:
                next_states = [*selected_states, state]
                if fits(candidate_package(states=next_states)):
                    selected_states.append(state)

        else:
            dropped_rule_ids.extend(self._rule_id(rule) for rule in unlocked_rules)
            for entity, state in optional_entity_bundles:
                identifier = self._entity_id(entity) or self._entity_id(state or {})
                if identifier:
                    dropped_entity_ids.append(identifier)
            for kind, artifact, _memory_id in evidence_candidates:
                if kind == "semantic":
                    dropped_semantic_ids.append(self._semantic_id(artifact))
                else:
                    event_id = self._event_id(artifact)
                    if event_id:
                        dropped_event_ids.append(event_id)
            for event in package.recent_events:
                event_id = self._event_id(event)
                if event_id and event_id not in dropped_event_ids:
                    dropped_event_ids.append(event_id)

        # Canonical recent-event output remains chronological/deterministic.
        selected_recent.sort(key=self._recent_sort_key)

        packed = self._build_package(
            package,
            entities=selected_entities,
            states=selected_states,
            rules=selected_rules,
            constraints=selected_constraints,
            recent=selected_recent,
            semantic=selected_semantic,
        )
        after_tokens = self.estimate_prompt_tokens(packed)

        selected_entity_ids = [
            value for value in (self._entity_id(item) for item in selected_entities) if value
        ]
        selected_event_ids = [
            value for value in (self._event_id(item) for item in selected_recent) if value
        ]
        selected_fact_ids = [self._rule_id(item) for item in selected_rules]
        selected_semantic_ids = [self._semantic_id(item) for item in selected_semantic]

        context_summary = dict(package.context_summary)
        context_summary["entity_ids"] = selected_entity_ids
        context_summary["event_ids"] = selected_event_ids
        context_summary["fact_ids"] = selected_fact_ids
        context_summary["semantic_memory_ids"] = selected_semantic_ids
        context_summary["context_packing_version"] = [CONTEXT_PACKING_VERSION]
        context_summary["context_token_estimator_version"] = [TOKEN_ESTIMATOR_VERSION]
        context_summary["dropped_entity_ids"] = self._unique(dropped_entity_ids)
        context_summary["dropped_event_ids"] = self._unique(dropped_event_ids)
        context_summary["dropped_fact_ids"] = self._unique(dropped_rule_ids)
        context_summary["dropped_semantic_memory_ids"] = self._unique(dropped_semantic_ids)
        context_summary["deduplicated_semantic_memory_ids"] = self._unique(
            deduplicated_semantic_ids
        )

        token_budget = {
            "used": after_tokens,
            "maximum": budget,
            "estimated_before": before_tokens,
            "budget_overflow": after_tokens > budget,
            "protected_overflow": protected_overflow,
            "packing_version": CONTEXT_PACKING_VERSION,
            "estimator_version": TOKEN_ESTIMATOR_VERSION,
            "deduplicated_semantic_count": len(self._unique(deduplicated_semantic_ids)),
            "dropped_artifact_count": (
                len(self._unique(dropped_entity_ids))
                + len(self._unique(dropped_event_ids))
                + len(self._unique(dropped_rule_ids))
                + len(self._unique(dropped_semantic_ids))
            ),
        }
        return replace(
            packed,
            token_budget=token_budget,
            context_summary=context_summary,
        )

    @staticmethod
    def _build_package(
        source: WritingContextPackage,
        *,
        entities: list[dict[str, Any]],
        states: list[dict[str, Any]],
        rules: list[dict[str, Any]],
        constraints: list[str],
        recent: list[dict[str, Any]],
        semantic: list[dict[str, Any]],
    ) -> WritingContextPackage:
        return WritingContextPackage(
            brain_version=source.brain_version,
            entities=tuple(entities),
            current_states=tuple(states),
            recent_events=tuple(recent),
            semantic_memories=tuple(semantic),
            world_rules=tuple(rules),
            author_constraints=tuple(constraints),
            token_budget=source.token_budget,
            context_summary=source.context_summary,
        )

    @staticmethod
    def _entity_id(item: dict[str, Any]) -> str:
        value = item.get("entity_id") or item.get("id") or item.get("name")
        return str(value) if value is not None else ""

    @staticmethod
    def _event_id(item: dict[str, Any]) -> str:
        value = item.get("event_id")
        return str(value) if value is not None else ""

    @staticmethod
    def _semantic_id(item: dict[str, Any]) -> str:
        value = item.get("memory_chunk_id") or item.get("source_key") or item.get("event_id")
        return str(value) if value is not None else ""

    @staticmethod
    def _rule_id(item: dict[str, Any]) -> str:
        value = item.get("id") or item.get("fact_id") or item.get("fact_key")
        return str(value) if value is not None else ""

    @staticmethod
    def _recent_sort_key(item: dict[str, Any]) -> tuple[int, int, str]:
        narrative_order = int(item.get("narrative_order") or 0)
        chapter_number = int(item.get("chapter_number") or item.get("chapter") or 0)
        return narrative_order, chapter_number, ContextBudgetPacker._event_id(item)

    @staticmethod
    def _unique(values: list[str]) -> list[str]:
        return list(dict.fromkeys(value for value in values if value))

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from domain.models import AnalysisRun, NarrativeEntity, NarrativeEvent, NarrativeProposal, StoryBrain


@runtime_checkable
class NarrativeRepository(Protocol):
    def get_story_brain(self, story_id: str) -> StoryBrain: ...

    def list_entities(self, story_id: str) -> list[NarrativeEntity]: ...

    def upsert_entity(self, story_id: str, entity_data: dict[str, Any]) -> dict[str, Any]: ...

    def add_entity_alias(
        self, story_id: str, entity_id: str, alias: str
    ) -> str: ...

    def add_entity_mention(
        self,
        story_id: str,
        entity_id: str,
        *,
        chapter_id: str,
        revision_id: str,
        surface_text: str,
        source_start: int,
        source_end: int,
        source_text_hash: str,
        extractor_version: str | None = None,
    ) -> str: ...

    def append_event(self, story_id: str, event: NarrativeEvent) -> None: ...

    def save_proposals(
        self, story_id: str, proposals: list[NarrativeProposal]
    ) -> list[NarrativeProposal]: ...

    def list_proposals(
        self,
        story_id: str,
        *,
        status: str | None = None,
        proposal_type: str | None = None,
        analysis_run_id: str | None = None,
    ) -> list[NarrativeProposal]: ...

    def locate_proposal(self, proposal_id: str) -> tuple[str, NarrativeProposal]: ...

    def accept_proposal_group(
        self,
        story_id: str,
        proposal_ids: list[str],
        expected_brain_version: int,
        *,
        edited_payloads: dict[str, dict[str, Any]] | None = None,
        reason: str | None = None,
    ) -> dict[str, Any]: ...

    def decide_proposal(
        self, story_id: str, proposal_id: str, accepted: bool, reason: str | None = None
    ) -> NarrativeProposal: ...

    def get_current_state(self, story_id: str) -> dict[str, Any]: ...

    def rebuild_projection(self, story_id: str, expected_brain_version: int) -> dict[str, Any]: ...

    def get_or_create_analysis_run(
        self,
        story_id: str,
        *,
        idempotency_key: str,
        input_hash: str,
        operation: str,
        pipeline_version: str,
    ) -> AnalysisRun: ...

    def get_related_entities(
        self, story_id: str, entity_name: str, limit: int = 10
    ) -> list[dict[str, str]]: ...

    def get_story_context(self, story_id: str, character_name: str, limit: int = 50) -> str: ...

    def get_consistency_data(
        self, story_id: str, character_name: str
    ) -> list[dict[str, str]]: ...

    def get_known_locations(self, story_id: str) -> set[str]: ...

    def override_relation(
        self, story_id: str, subject: str, relation_type: str, object_name: str
    ) -> dict[str, Any]: ...

    def export_snapshot(self, story_id: str) -> dict[str, Any]: ...

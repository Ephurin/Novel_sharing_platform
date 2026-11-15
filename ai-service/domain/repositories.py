from __future__ import annotations

from typing import Any, Protocol, runtime_checkable

from domain.models import (
    EntityReviewCompletion,
    AnalysisRun,
    BootstrapJob,
    EventMemorySource,
    NarrativeEntity,
    NarrativeEvent,
    NarrativeProposal,
    SemanticMemoryChunk,
    SemanticMemoryEmbedding,
    SemanticMemoryMatch,
    HybridRankingSignals,
    StoryBrain,
    StoryPlan,
    StoryPlanObjective,
    AutonomousRun,
    WritingContextPackage,
    WritingGenerationJob,
)


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

    def locate_proposal_group(self, group_id: str) -> tuple[str, list[NarrativeProposal]]: ...

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

    def create_bootstrap_job(self, job: BootstrapJob) -> BootstrapJob: ...

    def finalize_idea_bootstrap(self, job: BootstrapJob, proposals: list[NarrativeProposal], run: AnalysisRun) -> BootstrapJob: ...

    def start_bootstrap_processing(self, job_id: str) -> BootstrapJob: ...

    def fail_bootstrap_job(self, job: BootstrapJob) -> None: ...

    def get_bootstrap_job(self, job_id: str) -> BootstrapJob: ...

    def save_bootstrap_job(self, job: BootstrapJob) -> BootstrapJob: ...

    def activate_baseline(
        self, story_id: str, job_id: str, baseline_revision_id: str
    ) -> dict[str, Any]: ...

    def merge_entities(
        self, story_id: str, source_entity_id: str, target_entity_id: str,
        expected_brain_version: int
    ) -> dict[str, Any]: ...

    def create_writing_job(self, job: WritingGenerationJob) -> WritingGenerationJob: ...

    def get_writing_job(self, job_id: str) -> WritingGenerationJob: ...

    def save_writing_job(self, job: WritingGenerationJob) -> WritingGenerationJob: ...

    def get_structured_context(
        self,
        story_id: str,
        *,
        chapter_number: int | None = None,
        character_name: str | None = None,
        limit_recent_events: int = 20,
        token_budget: int | None = None,
        enforce_token_budget: bool = True,
        profile_entity_ids: tuple[str, ...] | None = None,
    ) -> WritingContextPackage: ...

    def record_revision_provenance(
        self,
        story_id: str,
        chapter_id: str,
        revision_id: str,
        chapter_number: int,
    ) -> None: ...

    def get_revision_provenance(
        self,
        story_id: str,
        revision_id: str,
    ) -> dict[str, Any] | None: ...

    def create_story_plan(self, plan: StoryPlan) -> StoryPlan: ...

    def get_story_plan(self, plan_id: str) -> StoryPlan | None: ...

    def get_active_story_plan(self, novel_id: str) -> StoryPlan | None: ...

    def list_story_plans(self, novel_id: str) -> list[StoryPlan]: ...

    def activate_story_plan(self, novel_id: str, plan_id: str) -> StoryPlan: ...

    def update_objective_status(
        self,
        novel_id: str,
        plan_id: str,
        objective_id: str,
        status: str,
    ) -> StoryPlanObjective: ...

    def create_autonomous_run(self, run: AutonomousRun) -> AutonomousRun: ...

    def get_autonomous_run(self, run_id: str) -> AutonomousRun | None: ...

    def get_active_autonomous_run(self, novel_id: str) -> AutonomousRun | None: ...

    def update_autonomous_run(self, run: AutonomousRun) -> AutonomousRun: ...




@runtime_checkable
class SemanticMemoryRepository(Protocol):
    """Persistence port for rebuildable semantic-memory artifacts only."""

    def list_event_memory_sources(self, story_id: str) -> list[EventMemorySource]: ...

    def upsert_memory_chunk(
        self,
        story_id: str,
        *,
        source_key: str,
        memory_type: str,
        content: str,
        content_hash: str,
        importance_score: float,
        narrative_order: int | None,
        chapter_id: str | None,
        revision_id: str | None,
        event_id: str | None,
        entity_id: str | None,
        entity_ids: tuple[str, ...],
        metadata: dict[str, Any],
    ) -> SemanticMemoryChunk: ...

    def list_memory_chunks(
        self,
        story_id: str,
        *,
        memory_type: str | None = None,
    ) -> list[SemanticMemoryChunk]: ...

    def delete_memory_chunks_not_in_sources(
        self,
        story_id: str,
        *,
        memory_type: str,
        active_source_keys: set[str],
    ) -> int: ...

    def get_embedding(
        self,
        story_id: str,
        memory_chunk_id: str,
        embedding_version: str,
    ) -> SemanticMemoryEmbedding | None: ...

    def upsert_embedding(
        self,
        story_id: str,
        embedding: SemanticMemoryEmbedding,
    ) -> SemanticMemoryEmbedding: ...

    def list_embeddings_for_version(
        self,
        story_id: str,
        embedding_version: str,
    ) -> list[SemanticMemoryEmbedding]: ...

    def delete_embedding_version(
        self,
        story_id: str,
        embedding_version: str,
    ) -> int: ...

    def embedding_coverage(
        self,
        story_id: str,
        embedding_version: str,
    ) -> dict[str, int]: ...

    def get_hybrid_ranking_signals(
        self,
        story_id: str,
        *,
        query_text: str,
        chapter_number: int,
    ) -> HybridRankingSignals: ...

    def search_semantic_memories(
        self,
        story_id: str,
        *,
        query_embedding: tuple[float, ...],
        embedding_version: str,
        chapter_number: int | None,
        limit: int = 10,
        memory_type: str = "event_summary",
    ) -> list[SemanticMemoryMatch]: ...


@runtime_checkable
class EntityReviewRepository(NarrativeRepository, Protocol):
    def get_story_brain(self, story_id: str, *, read_only: bool = False) -> StoryBrain: ...

    def get_entity_guidance(self, story_id: str) -> dict: ...

    def save_entity_guidance(self, story_id: str, guidance: dict, expected_version: int) -> dict: ...

    def get_entity_registry(self, story_id: str) -> dict: ...

    def list_entity_reviews(self, story_id: str) -> list[dict]: ...

    def get_entity_candidate_audit(self, story_id: str, run_id: str) -> dict | None: ...

    def save_entity_candidate_audit(self, story_id: str, run_id: str, audit: dict, *, expected_version: int | None = None) -> None: ...

    def complete_entity_review(self, story_id: str, run_id: str, audit: dict, proposals: list[NarrativeProposal]) -> EntityReviewCompletion: ...

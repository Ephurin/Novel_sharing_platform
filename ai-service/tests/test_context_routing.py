from __future__ import annotations

import hashlib

import pytest

from application.context_budget import ContextBudgetPacker
from application.context_routing import ContextBudgetRouter
from application.context_scope import BalancedRelevanceScopeBuilder
from application.hybrid_ranker import HYBRID_RANKING_VERSION
from application.writing_service import WritingService
from domain.errors import ContextRoutingUnresolvedError
from domain.models import (
    SemanticMemoryMatch,
    SemanticRetrievalResult,
    StoryBrain,
    WritingContextPackage,
)


def _entity(entity_id: str, *, pad: str = ""):
    return {
        "entity_id": entity_id,
        "name": entity_id,
        "is_locked": False,
        "pad": pad,
    }


def _state(entity_id: str):
    return {"entity_id": entity_id, "state": {"status": "active"}}


def _package(*, pad: str = "") -> WritingContextPackage:
    return WritingContextPackage(
        brain_version=1,
        entities=(_entity("e1", pad=pad),),
        current_states=(_state("e1"),),
        recent_events=({"event_id": "ev-1", "participants": ["raw-name"]},),
        semantic_memories=(
            {
                "memory_chunk_id": "mem-1",
                "entity_ids": ["e1"],
                "content": "relevant memory",
            },
        ),
        world_rules=({"id": "rule-1", "is_locked": False},),
        context_summary={
            "recent_scope_participant_entity_ids": ["e1"],
            "recent_scope_participant_identity": ["normalized-event-participants-v1"],
        },
    )


def _scope(package: WritingContextPackage):
    return BalancedRelevanceScopeBuilder().scope(
        package,
        query_entity_ids=("e1",),
        recent_participant_entity_ids=("e1",),
    )


def test_router_selects_smallest_full_fit_tier_and_records_trace() -> None:
    router = ContextBudgetRouter(ContextBudgetPacker())
    packed = router.route(_scope(_package()))

    assert packed.token_budget["routing_selected_tier"] == 12_000
    assert packed.context_summary["context_routing_version"] == ["balanced-scope-v1"]
    assert packed.context_summary["context_scope_policy"] == ["balanced-scope-v1"]
    assert packed.token_budget["dropped_artifact_count"] == 0


def test_router_escalates_to_16k_when_12k_would_drop_scope_artifacts() -> None:
    package = _package(pad="x" * 38_000)
    packer = ContextBudgetPacker()
    assert 12_000 < packer.estimate_prompt_tokens(package) < 16_000

    packed = ContextBudgetRouter(packer).route(_scope(package))

    assert packed.token_budget["routing_selected_tier"] == 16_000
    assert packed.token_budget["dropped_artifact_count"] == 0
    assert [row["entity_id"] for row in packed.entities] == ["e1"]


def test_router_fails_closed_when_scoped_package_exceeds_24k() -> None:
    package = _package(pad="x" * 80_000)
    packer = ContextBudgetPacker()
    assert packer.estimate_prompt_tokens(package) > 24_000

    with pytest.raises(ContextRoutingUnresolvedError) as exc:
        ContextBudgetRouter(packer).route(_scope(package))

    assert exc.value.details["routing_status"] == "unresolved"
    assert exc.value.details["routing_reason"] == "scoped_package_exceeds_max_tier"
    assert exc.value.details["max_tier"] == 24_000


class _Repo:
    def __init__(self, package: WritingContextPackage):
        self.package = package

    def get_structured_context(self, story_id: str, **kwargs):
        assert kwargs["enforce_token_budget"] is False
        return self.package


class _Retriever:
    default_limit = 8

    def __init__(self, result: SemanticRetrievalResult):
        self.result = result

    def retrieve(self, *args, **kwargs):
        return self.result


def _match(*, entity_ids=("e1",)) -> SemanticMemoryMatch:
    return SemanticMemoryMatch(
        memory_chunk_id="mem-live",
        story_brain_id="brain",
        tenant_id="tenant",
        novel_id="story",
        source_key="event:ev",
        memory_type="event_summary",
        content="memory",
        content_hash="a" * 64,
        embedding_version="v1",
        cosine_distance=0.1,
        chapter_number=1,
        entity_ids=tuple(entity_ids),
    )


def _service_package() -> WritingContextPackage:
    return WritingContextPackage(
        brain_version=3,
        entities=(_entity("e1"), _entity("noise")),
        current_states=(_state("e1"), _state("noise")),
        recent_events=({"event_id": "ev-1"},),
        world_rules=({"id": "rule-1"},),
        context_summary={
            "recent_scope_participant_entity_ids": ["e1"],
            "recent_scope_participant_identity": ["normalized-event-participants-v1"],
        },
    )


def _hybrid_result(*, query_ids=("e1",), entity_ids=("e1",)) -> SemanticRetrievalResult:
    return SemanticRetrievalResult(
        matches=(_match(entity_ids=entity_ids),),
        status="ok",
        embedding_version="v1",
        ranking_version=HYBRID_RANKING_VERSION,
        query_entity_ids=tuple(query_ids),
        related_entity_ids=(),
        hybrid_signals_resolved=True,
    )


def test_writing_service_balanced_policy_scopes_before_routing() -> None:
    service = WritingService(
        _Repo(_service_package()),
        llm_service=None,
        semantic_retriever=_Retriever(_hybrid_result()),
        context_routing_policy="balanced-scope-v1",
    )

    package = service.preview_context(
        tenant_id="tenant",
        story_id="story",
        chapter_number=5,
        semantic_query="query",
    )

    assert [row["entity_id"] for row in package.entities] == ["e1"]
    assert [row["entity_id"] for row in package.current_states] == ["e1"]
    assert package.context_summary["context_routing_version"] == ["balanced-scope-v1"]
    assert package.token_budget["routing_selected_tier"] == 12_000


def test_writing_service_semantic_only_fallback_stays_legacy() -> None:
    result = _hybrid_result()
    result = SemanticRetrievalResult(
        matches=result.matches,
        status="ok",
        embedding_version="v1",
        ranking_version="semantic-only-fallback-v1",
        query_entity_ids=("e1",),
        hybrid_signals_resolved=True,
        fallback_reason="hybrid:RuntimeError",
    )
    service = WritingService(
        _Repo(_service_package()),
        llm_service=None,
        semantic_retriever=_Retriever(result),
        context_routing_policy="balanced-scope-v1",
    )

    package = service.preview_context(
        tenant_id="tenant",
        story_id="story",
        chapter_number=5,
        semantic_query="query",
    )

    assert [row["entity_id"] for row in package.entities] == ["e1", "noise"]
    assert "context_routing_version" not in package.context_summary


def test_writing_service_manual_budget_override_stays_legacy() -> None:
    service = WritingService(
        _Repo(_service_package()),
        llm_service=None,
        semantic_retriever=_Retriever(_hybrid_result()),
        context_routing_policy="balanced-scope-v1",
    )

    package = service.preview_context(
        tenant_id="tenant",
        story_id="story",
        chapter_number=5,
        semantic_query="query",
        token_budget=20_000,
    )

    assert package.token_budget["maximum"] == 20_000
    assert [row["entity_id"] for row in package.entities] == ["e1", "noise"]
    assert "context_routing_version" not in package.context_summary


def test_writing_service_empty_resolved_scope_conservatively_uses_legacy() -> None:
    package = _service_package()
    package = WritingContextPackage(
        brain_version=package.brain_version,
        entities=package.entities,
        current_states=package.current_states,
        recent_events=package.recent_events,
        world_rules=package.world_rules,
        context_summary={
            "recent_scope_participant_entity_ids": [],
            "recent_scope_participant_identity": ["normalized-event-participants-v1"],
        },
    )
    service = WritingService(
        _Repo(package),
        llm_service=None,
        semantic_retriever=_Retriever(_hybrid_result(query_ids=(), entity_ids=())),
        context_routing_policy="balanced-scope-v1",
    )

    routed = service.preview_context(
        tenant_id="tenant",
        story_id="story",
        chapter_number=5,
        semantic_query="query",
    )

    assert [row["entity_id"] for row in routed.entities] == ["e1", "noise"]
    assert "context_routing_version" not in routed.context_summary


class _GenerationRepo(_Repo):
    def __init__(self, package: WritingContextPackage):
        super().__init__(package)
        self.jobs = {}
        self.brain = StoryBrain(
            story_id="story",
            metadata={"brain_version": "1"},
        )

    def get_story_brain(self, story_id: str):
        return self.brain

    def create_writing_job(self, job):
        self.jobs[job.job_id] = job
        return job

    def get_writing_job(self, job_id: str):
        return self.jobs[job_id]

    def save_writing_job(self, job):
        self.jobs[job.job_id] = job
        return job


class _MustNotCallLLM:
    def __init__(self):
        self.called = False

    def generate_writing_draft(self, **kwargs):
        self.called = True
        raise AssertionError("LLM must not be called for unresolved context routing")


def test_generation_fails_closed_before_llm_when_scoped_context_exceeds_24k() -> None:
    huge = WritingContextPackage(
        brain_version=1,
        entities=(_entity("e1", pad="x" * 80_000),),
        current_states=(_state("e1"),),
        recent_events=({"event_id": "ev-1"},),
        world_rules=({"id": "rule-1"},),
        context_summary={
            "recent_scope_participant_entity_ids": ["e1"],
            "recent_scope_participant_identity": ["normalized-event-participants-v1"],
        },
    )
    repo = _GenerationRepo(huge)
    llm = _MustNotCallLLM()
    service = WritingService(
        repo,
        llm_service=llm,
        semantic_retriever=_Retriever(_hybrid_result()),
        context_routing_policy="balanced-scope-v1",
    )
    source_text = "Current chapter."
    content_hash = hashlib.sha256(source_text.encode("utf-8")).hexdigest()

    job = service.start_generation(
        tenant_id="tenant",
        novel_id="story",
        chapter_id="chapter",
        revision_id="ephemeral:test",
        content_hash=content_hash,
        operation="continue",
        selection={"start": 0, "end": 0, "cursor": 0},
        instruction="Continue from the supplied evidence.",
        expected_brain_version=1,
        chapter_number=5,
        process_inline=True,
        source_text=source_text,
    )

    assert job.status == "failed"
    assert job.stage == "failed"
    assert job.error["code"] == "CONTEXT_SCOPE_EXCEEDS_MAX_TIER"
    assert job.error["details"]["routing_status"] == "unresolved"
    assert job.error["details"]["max_tier"] == 24_000
    assert llm.called is False

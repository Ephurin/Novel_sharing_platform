from __future__ import annotations

import hashlib
import pytest

from application.bootstrap_service import ManuscriptBootstrapService
from application.ports import RevisionContent
from application.revision_analysis_service import RevisionAnalysisService
from domain.errors import BaselineReviewRequiredError
from domain.projection import ProjectionError
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from services.entity_pipeline.pipeline import EntityPipeline
from tests.harness.fake_llm import FakeDeterministicLLMService


TENANT = "00000000-0000-0000-0000-000000000001"
NOVEL = "10000000-0000-0000-0000-000000000001"


class RevisionProvider:
    def __init__(self, revisions: list[RevisionContent], fail_once_on: str | None = None):
        self.items = {item.revision_id: item for item in revisions}
        self.fail_once_on = fail_once_on
        self.calls: dict[str, int] = {}

    def get_revision(self, *, tenant_id, novel_id, chapter_id, revision_id):
        self.calls[revision_id] = self.calls.get(revision_id, 0) + 1
        if revision_id == self.fail_once_on and self.calls[revision_id] > 1:
            self.fail_once_on = None
            raise RuntimeError("simulated worker interruption")
        item = self.items[revision_id]
        assert tenant_id == TENANT
        assert novel_id == item.novel_id
        assert chapter_id == item.chapter_id
        return item


def revision(chapter: int, text: str) -> RevisionContent:
    return RevisionContent(
        revision_id=f"30000000-0000-0000-0000-00000000000{chapter}",
        novel_id=NOVEL,
        chapter_id=f"20000000-0000-0000-0000-00000000000{chapter}",
        content=text,
        content_hash=hashlib.sha256(text.encode()).hexdigest(),
    )


def build_service(repository, provider):
    analysis = RevisionAnalysisService(
        repository,
        provider,
        EntityPipeline(pipeline_version="bootstrap-test", prompt_version="test"),
        FakeDeterministicLLMService(),
    )
    return ManuscriptBootstrapService(repository, provider, analysis)


def request_revisions(items):
    return [
        {
            "chapter_id": item.chapter_id,
            "revision_id": item.revision_id,
            "content_hash": item.content_hash,
        }
        for item in items
    ]


def test_multichapter_job_resumes_from_durable_chapter_checkpoint():
    items = [
        revision(1, "Tiêu Viêm đối đầu Hải Ba Đông tại sa mạc."),
        revision(2, "Tiêu Viêm và Hải Ba Đông phá trận pháp tại Mạc Gia."),
    ]
    repository = InMemoryNarrativeRepository()
    provider = RevisionProvider(items, fail_once_on=items[1].revision_id)
    service = build_service(repository, provider)
    job = service.start(
        tenant_id=TENANT,
        novel_id=NOVEL,
        revisions=request_revisions(items),
        locale="vi-VN",
        options={"require_review_for_all": True, "build_embeddings": False},
    )

    with pytest.raises(RuntimeError, match="worker interruption"):
        service.process(job.job_id)
    interrupted = repository.get_bootstrap_job(job.job_id)
    assert interrupted.status == "failed"
    assert interrupted.progress_current == 1
    first_run = interrupted.revisions[0].analysis_run_id

    # A new worker/service instance continues with the same repository checkpoint.
    resumed = build_service(repository, provider).resume(job.job_id)
    assert resumed.status == "waiting_review"
    assert resumed.progress_current == 2
    assert resumed.revisions[0].analysis_run_id == first_run
    assert resumed.result["scene_count"] == 2

    proposal_ids = {
        item.proposal_id for item in repository.list_proposals(NOVEL, status="pending")
    }
    repeated = build_service(repository, provider).resume(job.job_id)
    assert repeated.status == "waiting_review"
    assert {
        item.proposal_id for item in repository.list_proposals(NOVEL, status="pending")
    } == proposal_ids


def test_cross_chapter_acceptance_resolves_the_same_entity_once():
    items = [
        revision(1, "Tiêu Viêm đối đầu Hải Ba Đông tại sa mạc."),
        revision(2, "Tiêu Viêm và Hải Ba Đông tiến vào Mạc Gia."),
    ]
    repository = InMemoryNarrativeRepository()
    service = build_service(repository, RevisionProvider(items))
    job = service.start(
        tenant_id=TENANT,
        novel_id=NOVEL,
        revisions=request_revisions(items),
        locale="vi-VN",
        options={"require_review_for_all": True},
    )
    service.process(job.job_id)

    proposals = repository.list_proposals(NOVEL, status="pending")
    group_ids = list(dict.fromkeys(item.dependency_group_id for item in proposals))
    brain_version = 1
    for group_id in group_ids:
        group = [item.proposal_id for item in proposals if item.dependency_group_id == group_id]
        result = repository.accept_proposal_group(
            NOVEL, group, expected_brain_version=brain_version
        )
        brain_version = result["brain_version"]

    entity_names = [item.name for item in repository.list_entities(NOVEL)]
    assert entity_names.count("Tiêu Viêm") == 1
    assert entity_names.count("Hải Ba Đông") == 1


def test_review_priority_and_baseline_gate():
    items = [
        revision(
            1,
            "Luật: Người chết không thể hồi sinh.\n"
            "Tiêu Viêm đối đầu Hải Ba Đông tại sa mạc.",
        )
    ]
    repository = InMemoryNarrativeRepository()
    service = build_service(repository, RevisionProvider(items))
    job = service.start(
        tenant_id=TENANT,
        novel_id=NOVEL,
        revisions=request_revisions(items),
        locale="vi-VN",
        options={"require_review_for_all": True},
    )
    job = service.process(job.job_id)
    queue = service.review_queue(NOVEL)
    assert queue
    world_rules = [item for item in queue if item["proposal_type"] == "fact"]
    assert len(world_rules) == 1
    assert world_rules[0]["payload"]["fact_value"] == "Người chết không thể hồi sinh."
    assert world_rules[0]["review_priority"] == 80
    assert [item["review_priority"] for item in queue] == sorted(
        (item["review_priority"] for item in queue), reverse=True
    )

    with pytest.raises(BaselineReviewRequiredError):
        service.activate_baseline(NOVEL, job.job_id)
    proposals = repository.list_proposals(NOVEL, status="pending")
    with pytest.raises(ProjectionError, match='complete dependency group'):
        repository.decide_proposal(NOVEL, world_rules[0]['proposal_id'], accepted=False, reason='partial review')
    assert repository.list_proposals(NOVEL, status='pending') == proposals
    version = 1
    for group_id in dict.fromkeys(p.dependency_group_id for p in proposals):
        result = repository.accept_proposal_group(NOVEL,
            [p.proposal_id for p in proposals if p.dependency_group_id == group_id], version)
        version = result['brain_version']
    activated = service.activate_baseline(NOVEL, job.job_id)
    assert activated["status"] == "active"
    assert repository.get_bootstrap_job(job.job_id).status == "completed"
    assert repository.get_story_brain(NOVEL).metadata["baseline_revision_id"] == items[-1].revision_id


def test_merge_duplicate_entity_is_versioned_and_preserves_alias():
    repository = InMemoryNarrativeRepository()
    repository.upsert_entity(NOVEL, {"word": "Hải Ba Đông", "entity": "PER"})
    repository.upsert_entity(NOVEL, {"word": "Hai Ba Dong", "entity": "PER"})
    entities = repository.list_entities(NOVEL)
    source = next(item for item in entities if item.name == "Hai Ba Dong")
    target = next(item for item in entities if item.name == "Hải Ba Đông")

    result = repository.merge_entities(
        NOVEL, source.entity_id, target.entity_id, expected_brain_version=1
    )
    assert result["brain_version"] == 2
    assert [item.name for item in repository.list_entities(NOVEL)] == ["Hải Ba Đông"]
    aliases = repository.get_story_brain(NOVEL).aliases
    assert any(item.entity_id == target.entity_id and item.alias == "Hai Ba Dong" for item in aliases)
    alias_count = len(aliases)
    alias_id = repository.add_entity_alias(NOVEL, target.entity_id, "Hai Ba Dong")
    assert repository.add_entity_alias(NOVEL, target.entity_id, "Hai Ba Dong") == alias_id
    assert len(repository.get_story_brain(NOVEL).aliases) == alias_count

from __future__ import annotations

import hashlib
import json
import os
import uuid
from dataclasses import replace
from typing import Any
import pytest
from fastapi.testclient import TestClient

from api.deps import require_service_token
from application.narrative_service import NarrativeApplicationService
from application.ports import RevisionContent
from application.writing_service import WritingService
from core.fake_llm import FakeDeterministicLLMService
from core.settings import Settings
from domain.models import (
    BootstrapJob,
    BootstrapRevision,
    NarrativeProposal,
    ProposalStatus,
    WritingGenerationJob,
)
from infrastructure.in_memory_narrative_repository import InMemoryNarrativeRepository
from infrastructure.revision_content_provider import InMemoryRevisionContentProvider
from main import app


@pytest.fixture
def test_env():
    tenant_id = "00000000-0000-0000-0000-000000000001"
    novel_id = "11111111-1111-1111-1111-111111111111"
    chapter_id = "22222222-2222-2222-2222-222222222222"
    rev1_id = "33333333-3333-3333-3333-333333333331"
    rev2_id = "33333333-3333-3333-3333-333333333332"

    repo = InMemoryNarrativeRepository()
    repo.get_story_brain(novel_id)

    rev1_text = "Chương 1: Tiêu gia thiếu niên thiên tài vẫn lạc."
    rev1_hash = hashlib.sha256(rev1_text.encode("utf-8")).hexdigest()
    rev1 = RevisionContent(
        revision_id=rev1_id,
        novel_id=novel_id,
        chapter_id=chapter_id,
        content=rev1_text,
        content_hash=rev1_hash,
        chapter_number=1,
    )

    rev2_text = "Chương 2: Dược Lão xuất hiện trong nhẫn cổ."
    rev2_hash = hashlib.sha256(rev2_text.encode("utf-8")).hexdigest()
    rev2 = RevisionContent(
        revision_id=rev2_id,
        novel_id=novel_id,
        chapter_id=chapter_id,
        content=rev2_text,
        content_hash=rev2_hash,
        chapter_number=2,
    )

    rev_provider = InMemoryRevisionContentProvider([rev1, rev2])
    fake_llm = FakeDeterministicLLMService()
    writing_service = WritingService(
        repository=repo,
        llm_service=fake_llm,
        revision_provider=rev_provider,
    )

    # Save original app.state
    orig_repo = getattr(app.state, "narrative_repository", None)
    orig_ws = getattr(app.state, "writing_service", None)
    orig_ns = getattr(app.state, "narrative_service", None)
    orig_llm = getattr(app.state, "llm_service", None)
    orig_settings = getattr(app.state, "settings", None)

    app.state.narrative_repository = repo
    app.state.writing_service = writing_service
    app.state.narrative_service = NarrativeApplicationService(repo)
    app.state.llm_service = fake_llm
    if orig_settings:
        app.state.settings = replace(
            orig_settings,
            llm_provider="fake",
            platform_service_token="test-secret-token",
            service_auth_disabled=False,
        )
    else:
        os.environ["LLM_PROVIDER"] = "fake"
        os.environ["PLATFORM_SERVICE_TOKEN"] = "test-secret-token"
        os.environ["SERVICE_AUTH_DISABLED"] = "false"
        app.state.settings = Settings.from_env()

    client = TestClient(app)

    yield {
        "repo": repo,
        "writing_service": writing_service,
        "fake_llm": fake_llm,
        "client": client,
        "novel_id": novel_id,
        "chapter_id": chapter_id,
        "rev1_id": rev1_id,
        "rev2_id": rev2_id,
        "rev1_hash": rev1_hash,
    }

    # Restore app.state
    app.state.narrative_repository = orig_repo
    app.state.writing_service = orig_ws
    app.state.narrative_service = orig_ns
    app.state.llm_service = orig_llm
    app.state.settings = orig_settings


def test_finding1_fake_llm_service_and_settings():
    """Finding 1: LLM_PROVIDER=fake is supported and FakeDeterministicLLMService is usable in production composition root."""
    orig_provider = os.environ.get("LLM_PROVIDER")
    orig_model = os.environ.pop("LLM_MODEL", None)
    try:
        os.environ["LLM_PROVIDER"] = "fake"
        settings = Settings.from_env()
        assert settings.llm_provider == "fake"
        assert settings.llm_model == "fake-p4-model"
    finally:
        if orig_provider is not None:
            os.environ["LLM_PROVIDER"] = orig_provider
        else:
            os.environ.pop("LLM_PROVIDER", None)
        if orig_model is not None:
            os.environ["LLM_MODEL"] = orig_model

    fake_llm = FakeDeterministicLLMService()
    res = fake_llm.generate_writing_draft(
        operation="continue",
        instruction="Viết tiếp đoạn này",
        selected_text="Tiêu Viêm cầm hắc thiết trọng kiếm.",
    )
    assert res["draft_text"] != ""
    assert fake_llm.last_call is not None
    assert fake_llm.last_call["instruction"] == "Viết tiếp đoạn này"
    assert fake_llm.last_call["selected_text"] == "Tiêu Viêm cầm hắc thiết trọng kiếm."


def test_finding2_internal_novel_resolution_routes(test_env):
    """Finding 2: Internal endpoints resolve canonical novel_id for proposals and proposal groups."""
    client: TestClient = test_env["client"]
    repo: InMemoryNarrativeRepository = test_env["repo"]
    novel_id = test_env["novel_id"]

    prop_id = str(uuid.uuid4())
    group_id = str(uuid.uuid4())
    proposal = NarrativeProposal(
        proposal_id=prop_id,
        proposal_type="fact",
        payload={"fact_type": "world_rule", "fact_key": "world_rule_1", "fact_value": "Đấu Khí Đại Lục"},
        dependency_group_id=group_id,
        status=ProposalStatus.PENDING,
    )
    repo.save_proposals(novel_id, [proposal])

    headers = {"Authorization": "Bearer test-secret-token"}

    # Single proposal novel resolution
    res_prop = client.get(f"/internal/v1/proposals/{prop_id}/novel", headers=headers)
    assert res_prop.status_code == 200
    assert res_prop.json()["data"] == {"proposal_id": prop_id, "novel_id": novel_id}

    # Proposal group novel resolution
    res_group = client.get(f"/internal/v1/proposal-groups/{group_id}/novel", headers=headers)
    assert res_group.status_code == 200
    assert res_group.json()["data"]["novel_id"] == novel_id
    assert res_group.json()["data"]["group_id"] == group_id

    # Non-existent proposal returns 404
    res_404 = client.get(f"/internal/v1/proposals/{uuid.uuid4()}/novel", headers=headers)
    assert res_404.status_code == 404


def test_finding3_service_token_auth_enforcement(test_env):
    """Finding 3: /v1 and /internal routes reject unauthenticated/invalid requests, allow valid token, /health remains open."""
    client: TestClient = test_env["client"]

    # 1. /health is public and unauthenticated
    res_health = client.get("/health")
    assert res_health.status_code == 200

    # 2. /suggest-next without token -> 401
    res_no_auth = client.post(
        "/suggest-next",
        json={"current_text": "Tiêu Viêm", "story_id": test_env["novel_id"]},
    )
    assert res_no_auth.status_code == 401
    assert res_no_auth.json()["detail"]["code"] == "SERVICE_AUTH_REQUIRED"

    # 3. /suggest-next with invalid token -> 403
    res_bad_auth = client.post(
        "/suggest-next",
        headers={"Authorization": "Bearer wrong-token"},
        json={"current_text": "Tiêu Viêm", "story_id": test_env["novel_id"]},
    )
    assert res_bad_auth.status_code == 403
    assert res_bad_auth.json()["detail"]["code"] == "SERVICE_AUTH_INVALID"

    # 4. /suggest-next with valid Bearer token passes auth
    res_valid_bearer = client.post(
        "/suggest-next",
        headers={"Authorization": "Bearer test-secret-token"},
        json={"current_text": "Tiêu Viêm", "story_id": test_env["novel_id"]},
    )
    assert res_valid_bearer.status_code != 401
    assert res_valid_bearer.status_code != 403

    # 5. /suggest-next with valid X-Service-Token passes auth
    res_valid_x_token = client.post(
        "/suggest-next",
        headers={"X-Service-Token": "test-secret-token"},
        json={"current_text": "Tiêu Viêm", "story_id": test_env["novel_id"]},
    )
    assert res_valid_x_token.status_code != 401
    assert res_valid_x_token.status_code != 403


def test_finding4_suggest_next_no_silent_fallback_on_error(test_env):
    """Finding 4: /suggest-next does NOT silently fall back to legacy narrative graph when writing_service fails."""
    client: TestClient = test_env["client"]
    ws: WritingService = test_env["writing_service"]
    novel_id = test_env["novel_id"]

    # Mock writing_service.start_generation to raise an error
    def failing_start(*args, **kwargs):
        raise RuntimeError("LLM synthesis completely failed")

    orig_start = ws.start_generation
    ws.start_generation = failing_start

    try:
        res = client.post(
            "/suggest-next",
            headers={"Authorization": "Bearer test-secret-token"},
            json={
                "story_id": novel_id,
                "current_text": "Đoạn văn thử nghiệm.",
                "character_name": "Tiêu Viêm",
            },
        )
        # MUST fail with 500 SUGGEST_NEXT_FAILED, NOT return 200 with raw graph fallback
        assert res.status_code == 500
        data = res.json()
        assert data["detail"]["code"] == "SUGGEST_NEXT_FAILED"
    finally:
        ws.start_generation = orig_start


def test_finding5_suggest_next_preserves_current_text(test_env):
    """Finding 5: /suggest-next preserves client current_text and passes it to writing service and fake LLM."""
    client: TestClient = test_env["client"]
    fake_llm: FakeDeterministicLLMService = test_env["fake_llm"]
    novel_id = test_env["novel_id"]

    test_text = "Tiêu Viêm nhìn lên bầu trời Vân Lam Tông, lửa giận bốc lên ngùn ngụt."
    res = client.post(
        "/suggest-next",
        headers={"Authorization": "Bearer test-secret-token"},
        json={
            "story_id": novel_id,
            "current_text": test_text,
            "character_name": "Tiêu Viêm",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert "suggestions" in data
    assert len(data["suggestions"]) > 0

    # Verify FakeDeterministicLLMService received the client's current_text as selected_text
    assert fake_llm.last_call is not None
    assert fake_llm.last_call["selected_text"] == test_text


def test_finding6_temporal_cutoff_incremental_revisions(test_env):
    """Finding 6: Facts from chapter 2 revision are not visible when querying structured context for chapter 1."""
    repo: InMemoryNarrativeRepository = test_env["repo"]
    novel_id = test_env["novel_id"]
    rev1_id = test_env["rev1_id"]
    rev2_id = test_env["rev2_id"]

    # 1. Bootstrap job establishes baseline with Chapter 1
    bootstrap_job = BootstrapJob(
        job_id=str(uuid.uuid4()),
        novel_id=novel_id,
        tenant_id="00000000-0000-0000-0000-000000000001",
        revisions=(
            BootstrapRevision(
                chapter_id=test_env["chapter_id"],
                revision_id=rev1_id,
                content_hash="hash1",
                chapter_number=1,
            ),
        ),
    )
    repo.create_bootstrap_job(bootstrap_job)

    # 2. Incremental revision analysis records provenance for Chapter 2
    repo.record_revision_provenance(
        story_id=novel_id,
        chapter_id=test_env["chapter_id"],
        revision_id=rev2_id,
        chapter_number=2,
    )

    # 3. Create a proposal for a fact originating from revision 2
    prop_id = str(uuid.uuid4())
    group_id = str(uuid.uuid4())
    fact_proposal = NarrativeProposal(
        proposal_id=prop_id,
        proposal_type="fact",
        payload={
            "fact_type": "world_rule",
            "fact_key": "duoc_lao_power",
            "fact_value": "Đấu Tôn đỉnh phong",
            "chapter_number": 2,
        },
        dependency_group_id=group_id,
        evidence=({"revision_id": rev2_id, "start": 0, "end": 20},),
        expected_brain_version=1,
        status=ProposalStatus.PENDING,
    )
    repo.save_proposals(novel_id, [fact_proposal])

    # 4. Author accepts the proposal group
    repo.accept_proposal_group(
        story_id=novel_id,
        proposal_ids=[prop_id],
        expected_brain_version=1,
    )

    # 5. Query context at Chapter 1 cutoff -> Fact MUST BE EXCLUDED
    ctx_ch1 = repo.get_structured_context(novel_id, chapter_number=1)
    fact_keys_ch1 = [r.get("fact_key") for r in ctx_ch1.world_rules]
    assert "duoc_lao_power" not in fact_keys_ch1, "Chapter 2 fact leaked into Chapter 1 context!"

    # 6. Query context at Chapter 2 cutoff -> Fact MUST BE INCLUDED
    ctx_ch2 = repo.get_structured_context(novel_id, chapter_number=2)
    fact_keys_ch2 = [r.get("fact_key") for r in ctx_ch2.world_rules]
    assert "duoc_lao_power" in fact_keys_ch2, "Chapter 2 fact missing from Chapter 2 context!"


def test_finding9_context_hash_reflects_content_changes(test_env):
    """Finding 9: context_hash is computed over full prompt context content, not merely IDs."""
    ws: WritingService = test_env["writing_service"]
    repo: InMemoryNarrativeRepository = test_env["repo"]
    novel_id = test_env["novel_id"]

    # Create entity
    repo.upsert_entity(novel_id, {"name": "Hải Ba Đông", "type": "PER", "status": "Alive"})

    ctx1 = repo.get_structured_context(novel_id)
    # Start generation job
    job1 = ws.start_generation(
        novel_id=novel_id,
        chapter_id=test_env["chapter_id"],
        revision_id=test_env["rev1_id"],
        content_hash=test_env["rev1_hash"],
        operation="continue",
        tenant_id="00000000-0000-0000-0000-000000000001",
        expected_brain_version=1,
        selection={"start": 0, "end": 0},
        instruction="Tiếp tục",
    )

    # Now change entity state in brain (same entity ID, different state content)
    repo.upsert_entity(novel_id, {"name": "Hải Ba Đông", "type": "PER", "status": "Sealed"})

    job2 = ws.start_generation(
        novel_id=novel_id,
        chapter_id=test_env["chapter_id"],
        revision_id=test_env["rev1_id"],
        content_hash=test_env["rev1_hash"],
        operation="continue",
        tenant_id="00000000-0000-0000-0000-000000000001",
        expected_brain_version=1,
        selection={"start": 0, "end": 0},
        instruction="Tiếp tục",
    )

    assert job1.context_hash != ""
    assert job2.context_hash != ""
    assert job1.context_hash != job2.context_hash, "context_hash must differ when state content changes!"


def test_p65_r3_service_auth_all_endpoints(test_env):
    """P6.5-R3 Finding 3: Complete service-auth boundary coverage on /v1/enhanced, /v1/story-brains, /v1/ai, and /suggest-next."""
    client: TestClient = test_env["client"]
    novel_id = test_env["novel_id"]

    # 1. /v1/enhanced/kb/{story_id}
    res_kb_no_auth = client.get(f"/v1/enhanced/kb/{novel_id}")
    assert res_kb_no_auth.status_code == 401
    assert res_kb_no_auth.json()["detail"]["code"] == "SERVICE_AUTH_REQUIRED"

    res_kb_bad_auth = client.get(f"/v1/enhanced/kb/{novel_id}", headers={"Authorization": "Bearer bad-token"})
    assert res_kb_bad_auth.status_code == 403
    assert res_kb_bad_auth.json()["detail"]["code"] == "SERVICE_AUTH_INVALID"

    res_kb_valid = client.get(f"/v1/enhanced/kb/{novel_id}", headers={"Authorization": "Bearer test-secret-token"})
    assert res_kb_valid.status_code in (200, 404)

    # 2. /v1/enhanced/relation/override
    res_rel_no_auth = client.post("/v1/enhanced/relation/override", json={"story_id": novel_id, "entity_a": "A", "entity_b": "B", "relation": "ALLY"})
    assert res_rel_no_auth.status_code == 401
    assert res_rel_no_auth.json()["detail"]["code"] == "SERVICE_AUTH_REQUIRED"

    res_rel_bad_auth = client.post("/v1/enhanced/relation/override", headers={"Authorization": "Bearer bad-token"}, json={"story_id": novel_id, "entity_a": "A", "entity_b": "B", "relation": "ALLY"})
    assert res_rel_bad_auth.status_code == 403
    assert res_rel_bad_auth.json()["detail"]["code"] == "SERVICE_AUTH_INVALID"

    # 3. /v1/enhanced/process-interactions
    res_proc_no_auth = client.post("/v1/enhanced/process-interactions", json={"story_id": novel_id, "text": "Hello"})
    assert res_proc_no_auth.status_code == 401

    res_proc_bad_auth = client.post("/v1/enhanced/process-interactions", headers={"Authorization": "Bearer bad-token"}, json={"story_id": novel_id, "text": "Hello"})
    assert res_proc_bad_auth.status_code == 403

    # 4. /v1/story-brains/by-novel/{novel_id}
    res_brain_no_auth = client.get(f"/v1/story-brains/by-novel/{novel_id}")
    assert res_brain_no_auth.status_code == 401

    res_brain_bad_auth = client.get(f"/v1/story-brains/by-novel/{novel_id}", headers={"Authorization": "Bearer bad-token"})
    assert res_brain_bad_auth.status_code == 403

    res_brain_valid = client.get(f"/v1/story-brains/by-novel/{novel_id}", headers={"Authorization": "Bearer test-secret-token"})
    assert res_brain_valid.status_code == 200

    # 5. /v1/ai/extract-entities
    res_ai_no_auth = client.post("/v1/ai/extract-entities", json={"text": "Tiêu Viêm cầm kiếm"})
    assert res_ai_no_auth.status_code == 401

    res_ai_bad_auth = client.post("/v1/ai/extract-entities", headers={"Authorization": "Bearer bad-token"}, json={"text": "Tiêu Viêm cầm kiếm"})
    assert res_ai_bad_auth.status_code == 403

    # 6. /v1/story-brains/{story_id}/context-preview
    res_prev_no_auth = client.get(f"/v1/story-brains/{novel_id}/context-preview")
    assert res_prev_no_auth.status_code == 401

    res_prev_bad_auth = client.get(f"/v1/story-brains/{novel_id}/context-preview", headers={"Authorization": "Bearer bad-token"})
    assert res_prev_bad_auth.status_code == 403

    res_prev_valid = client.get(
        f"/v1/story-brains/{novel_id}/context-preview",
        headers={
            "Authorization": "Bearer test-secret-token",
            "X-Tenant-Id": "00000000-0000-0000-0000-000000000001",
            "X-Request-Id": "test-req-1",
        },
    )
    assert res_prev_valid.status_code == 200


def test_p65_r4_service_auth_unset_fails_closed(test_env):
    """P6.5-R4 Finding 3: Protected routes fail-closed with 503 when PLATFORM_SERVICE_TOKEN is unset."""
    client: TestClient = test_env["client"]
    novel_id = test_env["novel_id"]
    current_settings = app.state.settings

    try:
        # Case A: platform_service_token is unset and service_auth_disabled=False -> FAILS CLOSED with 503
        app.state.settings = replace(
            current_settings,
            platform_service_token="",
            service_auth_disabled=False,
        )

        res_suggest = client.post(
            "/suggest-next",
            json={"current_text": "Tiêu Viêm", "story_id": novel_id},
        )
        assert res_suggest.status_code == 503
        assert res_suggest.json()["detail"]["code"] == "SERVICE_AUTH_NOT_CONFIGURED"

        res_enhanced = client.get(f"/v1/enhanced/kb/{novel_id}")
        assert res_enhanced.status_code == 503
        assert res_enhanced.json()["detail"]["code"] == "SERVICE_AUTH_NOT_CONFIGURED"

        # Even with a token sent, server is not configured -> 503
        res_with_token = client.get(
            f"/v1/enhanced/kb/{novel_id}",
            headers={"Authorization": "Bearer some-token"},
        )
        assert res_with_token.status_code == 503
        assert res_with_token.json()["detail"]["code"] == "SERVICE_AUTH_NOT_CONFIGURED"

        # Case B: explicit dev flag service_auth_disabled=True -> allows bypass
        app.state.settings = replace(
            current_settings,
            platform_service_token="",
            service_auth_disabled=True,
        )
        res_bypassed = client.get(f"/v1/story-brains/by-novel/{novel_id}")
        assert res_bypassed.status_code == 200

    finally:
        app.state.settings = current_settings


def test_p65_r4_temporal_missing_provenance_fails_closed(test_env):
    """P6.5-R4 Finding 4: Revisions missing canonical chapter_number fail closed and never default to chapter 1."""
    from application.revision_analysis_service import RevisionAnalysisService
    from services.entity_pipeline.pipeline import EntityPipeline

    repo: InMemoryNarrativeRepository = test_env["repo"]
    novel_id = test_env["novel_id"]
    rev_missing_id = str(uuid.uuid4())
    text_content = "Tiêu Viêm luyện chế đan dược."
    content_hash = hashlib.sha256(text_content.encode("utf-8")).hexdigest()

    # Provider returns revision with chapter_number=None
    rev_missing = RevisionContent(
        revision_id=rev_missing_id,
        novel_id=novel_id,
        chapter_id=test_env["chapter_id"],
        content=text_content,
        content_hash=content_hash,
        chapter_number=None,
    )
    provider = InMemoryRevisionContentProvider([rev_missing])

    analysis_service = RevisionAnalysisService(
        repository=repo,
        revision_provider=provider,
        entity_pipeline=EntityPipeline(),
        llm_service=test_env["fake_llm"],
    )

    # analyze MUST raise ValueError when chapter_number is None
    with pytest.raises(ValueError, match="Canonical chapter_number is required"):
        analysis_service.analyze(
            tenant_id="00000000-0000-0000-0000-000000000001",
            novel_id=novel_id,
            chapter_id=test_env["chapter_id"],
            revision_id=rev_missing_id,
            content_hash=content_hash,
            operation="incremental_story_analysis",
            idempotency_key="missing-ch-test",
            options={"extract_events": True, "extract_entities": True},
        )

    # Verify zero proposals were materialized
    brain = repo.get_story_brain(novel_id)
    assert not any(getattr(p, "revision_id", None) == rev_missing_id for p in brain.proposals)

    # Acceptance of event proposal without chapter provenance must also raise ValueError
    bad_event_prop = NarrativeProposal(
        proposal_id=str(uuid.uuid4()),
        proposal_type="event",
        payload={
            "event_id": str(uuid.uuid4()),
            "event_type": "battle",
            "summary": "Trận chiến không rõ chương",
            "participants": [],
        },
        dependency_group_id=str(uuid.uuid4()),
        evidence=(),
        expected_brain_version=int(brain.metadata.get("brain_version", "1")),
    )
    repo.save_proposals(novel_id, [bad_event_prop])

    with pytest.raises(ValueError, match="canonical chapter provenance"):
        repo.accept_proposal_group(
            story_id=novel_id,
            proposal_ids=[bad_event_prop.proposal_id],
            expected_brain_version=int(brain.metadata.get("brain_version", "1")),
        )


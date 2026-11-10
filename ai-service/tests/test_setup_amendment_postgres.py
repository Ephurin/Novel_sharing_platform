"""P2-07E: PostgreSQL integration tests for author-approved World Setup rule amendment backend."""
from __future__ import annotations

import json
import uuid
import pytest
from sqlalchemy import text

from api.setup_schemas import (
    SetupActivationRequest,
    SetupRuleAmendmentProposalRequest,
    SetupRuleAmendmentDecisionRequest,
)
from application.setup_service import SetupService
from domain.errors import BootstrapConflictError
from domain.projection import WorldRuleLineageError
from tests.test_p2_bootstrap_postgres import ACTOR, TENANT, engine, f
from tests.test_plan_review_fixes_postgres import FOREIGN
from tests.test_setup_activation_postgres import owned, ready, activate
from tests.test_setup_review_postgres import review, envelope
from tests.test_setup_v1_postgres import submit

pytestmark = pytest.mark.postgres_integration


@pytest.fixture
def amendment_env(owned):
    f = owned
    from types import SimpleNamespace
    from api.entity_hitl_routes import router as hitl_router
    from api.narrative_routes import internal_router
    f.client.app.state.revision_analysis_service = SimpleNamespace(_repository=f.repo)
    f.client.app.state.settings.default_tenant_id = TENANT
    try:
        f.client.app.include_router(hitl_router)
    except Exception:
        pass
    try:
        f.client.app.include_router(internal_router)
    except Exception:
        pass
    return f


def _memory_headers(f):
    return {
        **f.headers,
        "X-Author-Id": ACTOR,
        "X-Tenant-Id": TENANT,
        "X-Request-Id": str(uuid.uuid4()),
    }


def _activated_novel(amendment_env):
    f = amendment_env
    job, body = ready(f)
    receipt = activate(f, job, body)
    novel_id = f.src.novel_id
    with f.engine.connect() as db:
        fact = db.execute(
            text(
                "SELECT id, story_brain_id, fact_key, fact_value, is_locked "
                "FROM narrative.facts WHERE novel_id=:n AND fact_type='world_rule'"
            ),
            {"n": novel_id},
        ).mappings().one()
        brain = db.execute(
            text("SELECT id, brain_version, status FROM narrative.story_brains WHERE novel_id=:n"),
            {"n": novel_id},
        ).mappings().one()
    return f, novel_id, str(fact["id"]), dict(fact), dict(brain)


def test_amendment_full_lifecycle_accept_flow(amendment_env):
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    # 1. Check initial history
    history = service.get_amendment_history(novel_id, fact_id, tenant_id=TENANT, actor_id=ACTOR)
    assert history["contract_version"] == "setup-rule-amendment-v1"
    assert history["effective_head_id"] == fact_id
    assert history["root_fact_id"] == fact_id
    assert len(history["lineage"]) == 1
    assert len(history["proposals"]) == 0

    # 2. Author proposes amendment
    propose_req = SetupRuleAmendmentProposalRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="amend-prop-01",
        replacement_text="Chỉ tu giả Nguyên Anh mới có thể ngự không phi hành.",
        expected_brain_version=brain_data["brain_version"],
        private_author_notes=["Private design rationale"],
    )
    prop_res = service.propose_amendment(novel_id, fact_id, propose_req, tenant_id=TENANT, actor_id=ACTOR)
    assert prop_res["contract_version"] == "setup-rule-amendment-v1"
    assert prop_res["status"] == "pending"
    assert prop_res["parent_fact_id"] == fact_id
    assert prop_res["brain_version"] == brain_data["brain_version"]
    proposal_id = prop_res["proposal_id"]

    # History shows proposal as pending
    history = service.get_amendment_history(novel_id, fact_id, tenant_id=TENANT, actor_id=ACTOR)
    assert len(history["proposals"]) == 1
    assert history["proposals"][0]["proposal_id"] == proposal_id
    assert history["proposals"][0]["status"] == "pending"
    assert history["effective_head_id"] == fact_id  # Canon head unchanged before decision

    # Pre-decision: Approved Memory and Context Preview still show original root rule
    brain = f.repo.get_story_brain(novel_id, read_only=True)
    from domain.projection import resolve_effective_facts
    effective_pre = resolve_effective_facts(brain.facts, novel_id=novel_id)
    assert any(f["fact_id"] == fact_id and "Không ai bay được" in str(f.get("fact_value")) for f in effective_pre)

    # 3. Author decides to accept the amendment
    decide_req = SetupRuleAmendmentDecisionRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="amend-dec-01",
        decision="accept",
        expected_brain_version=brain_data["brain_version"],
        reason="Nâng cấp năng lực nhân vật theo diễn biến mới",
    )
    dec_res = service.decide_amendment(novel_id, proposal_id, decide_req, tenant_id=TENANT, actor_id=ACTOR)
    assert dec_res["contract_version"] == "setup-rule-amendment-v1"
    assert dec_res["decision"] == "accept"
    assert dec_res["brain_version"] == brain_data["brain_version"] + 1
    successor_fact_id = dec_res["successor_fact_id"]
    assert successor_fact_id is not None
    assert dec_res["artifact_ids"] == [successor_fact_id]

    # 4. Post-decision Parity Verification
    # A. Readback History
    history_after = service.get_amendment_history(novel_id, fact_id, tenant_id=TENANT, actor_id=ACTOR)
    assert history_after["effective_head_id"] == successor_fact_id
    assert len(history_after["lineage"]) == 2
    assert history_after["lineage"][0]["fact_id"] == fact_id
    assert history_after["lineage"][1]["fact_id"] == successor_fact_id
    assert history_after["lineage"][1]["supersedes_id"] == fact_id
    assert history_after["proposals"][0]["status"] == "accepted"
    assert history_after["proposals"][0]["decision"] == "accept"
    assert history_after["proposals"][0]["successor_fact_id"] == successor_fact_id

    # B. Approved Memory API
    mem_resp = f.client.get(f"/v1/story-brains/{novel_id}/memory", headers=_memory_headers(f))
    assert mem_resp.status_code == 200, mem_resp.text
    mem_facts = mem_resp.json()["data"]["facts"]
    mem_fact_ids = {f["fact_id"] for f in mem_facts}
    assert successor_fact_id in mem_fact_ids
    assert fact_id not in mem_fact_ids  # Replaced root rule is hidden
    amended_fact = next(f for f in mem_facts if f["fact_id"] == successor_fact_id)
    assert amended_fact["fact_value"] == "Chỉ tu giả Nguyên Anh mới có thể ngự không phi hành."

    # C. Context Preview API
    ctx_package = f.repo.get_structured_context(novel_id)
    rule_ids = {r["id"] for r in ctx_package.world_rules}
    assert successor_fact_id in rule_ids
    assert fact_id not in rule_ids
    ctx_rule = next(r for r in ctx_package.world_rules if r["id"] == successor_fact_id)
    assert ctx_rule["fact_value"] == "Chỉ tu giả Nguyên Anh mới có thể ngự không phi hành."

    # D. Writing Rule Authority Snapshot
    from domain.models import WritingGenerationJob
    job = WritingGenerationJob(
        job_id="job-snap-1",
        novel_id=novel_id,
        chapter_id=str(uuid.uuid4()),
        revision_id=str(uuid.uuid4()),
        content_hash="mock",
        tenant_id=TENANT,
        operation="continue",
        selection={"start": 0, "end": 0},
        instruction="test",
        actor_id=ACTOR,
        chapter_number=1,
    )
    snap_version, snap_rules = f.repo.writing_rule_authority_snapshot(job)
    assert snap_version == brain_data["brain_version"] + 1
    snap_fact_ids = {r[0] for r in snap_rules}
    assert successor_fact_id in snap_fact_ids
    assert fact_id not in snap_fact_ids

    # E. State Projection Parity
    proj = f.repo.rebuild_projection(novel_id, expected_brain_version=brain_data["brain_version"] + 1)
    assert proj is not None


def test_amendment_full_lifecycle_reject_flow(amendment_env):
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    # 1. Author proposes amendment
    prop_res = service.propose_amendment(
        novel_id,
        fact_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="amend-prop-reject-01",
            replacement_text="Đề xuất bị bác bỏ.",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    proposal_id = prop_res["proposal_id"]

    # 2. Author decides to reject
    dec_res = service.decide_amendment(
        novel_id,
        proposal_id,
        SetupRuleAmendmentDecisionRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="amend-dec-reject-01",
            decision="reject",
            expected_brain_version=brain_data["brain_version"],
            reason="Ý tưởng không phù hợp cấu trúc thế giới",
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    assert dec_res["decision"] == "reject"
    assert dec_res["successor_fact_id"] is None
    assert dec_res["artifact_ids"] == []
    assert dec_res["brain_version"] == brain_data["brain_version"]  # Unbumped

    # Root remains effective head
    history = service.get_amendment_history(novel_id, fact_id, tenant_id=TENANT, actor_id=ACTOR)
    assert history["effective_head_id"] == fact_id
    assert len(history["lineage"]) == 1
    assert history["proposals"][0]["status"] == "rejected"
    assert history["proposals"][0]["decision"] == "reject"

    # Context and Memory unchanged
    ctx_package = f.repo.get_structured_context(novel_id)
    assert {r["id"] for r in ctx_package.world_rules} == {fact_id}


def test_amendment_second_generation_chain(amendment_env):
    f, novel_id, root_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    # Generation 1
    p1 = service.propose_amendment(
        novel_id,
        root_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="prop-gen-1",
            replacement_text="Gen 1 amendment",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    d1 = service.decide_amendment(
        novel_id,
        p1["proposal_id"],
        SetupRuleAmendmentDecisionRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="dec-gen-1",
            decision="accept",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    head1_id = d1["successor_fact_id"]

    # Generation 2 (proposed on head1)
    p2 = service.propose_amendment(
        novel_id,
        head1_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="prop-gen-2",
            replacement_text="Gen 2 amendment",
            expected_brain_version=brain_data["brain_version"] + 1,
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    d2 = service.decide_amendment(
        novel_id,
        p2["proposal_id"],
        SetupRuleAmendmentDecisionRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="dec-gen-2",
            decision="accept",
            expected_brain_version=brain_data["brain_version"] + 1,
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    head2_id = d2["successor_fact_id"]

    history = service.get_amendment_history(novel_id, head2_id, tenant_id=TENANT, actor_id=ACTOR)
    assert history["effective_head_id"] == head2_id
    assert history["root_fact_id"] == root_id
    assert [e["fact_id"] for e in history["lineage"]] == [root_id, head1_id, head2_id]

    ctx_package = f.repo.get_structured_context(novel_id)
    assert {r["id"] for r in ctx_package.world_rules} == {head2_id}


def test_amendment_locked_rule_strictly_preserves_lock(amendment_env):
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    with f.engine.begin() as db:
        db.execute(
            text("UPDATE narrative.facts SET is_locked=true WHERE id=:id"),
            {"id": uuid.UUID(fact_id)},
        )

    service = SetupService(f.service)
    p = service.propose_amendment(
        novel_id,
        fact_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="prop-locked-1",
            replacement_text="Quy tắc cấm sửa đổi nhưng vẫn khóa",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    assert p["is_locked"] is True

    d = service.decide_amendment(
        novel_id,
        p["proposal_id"],
        SetupRuleAmendmentDecisionRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="dec-locked-1",
            decision="accept",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    successor_id = d["successor_fact_id"]
    assert d["is_locked"] is True

    # Verify successor inherited is_locked = True in database
    with f.engine.connect() as db:
        succ = db.execute(
            text("SELECT id, is_locked FROM narrative.facts WHERE id=:id"),
            {"id": uuid.UUID(successor_id)},
        ).mappings().one()
    assert succ["is_locked"] is True

    ctx_package = f.repo.get_structured_context(novel_id)
    assert any(r["id"] == successor_id and r["is_locked"] is True for r in ctx_package.world_rules)


def test_amendment_idempotent_replay_and_conflict_guards(amendment_env):
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    # 1. Propose idempotent replay
    prop_req = SetupRuleAmendmentProposalRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="idemp-key-01",
        replacement_text="Same text",
        expected_brain_version=brain_data["brain_version"],
    )
    p1 = service.propose_amendment(novel_id, fact_id, prop_req, tenant_id=TENANT, actor_id=ACTOR)
    p1_replay = service.propose_amendment(novel_id, fact_id, prop_req, tenant_id=TENANT, actor_id=ACTOR)
    assert p1["proposal_id"] == p1_replay["proposal_id"]

    # 2. Idempotency conflict on propose (same key, different replacement_text)
    conflict_prop = SetupRuleAmendmentProposalRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="idemp-key-01",
        replacement_text="Different text",
        expected_brain_version=brain_data["brain_version"],
    )
    with pytest.raises(BootstrapConflictError) as exc:
        service.propose_amendment(novel_id, fact_id, conflict_prop, tenant_id=TENANT, actor_id=ACTOR)
    assert exc.value.code == "AMENDMENT_IDEMPOTENCY_CONFLICT"

    # 3. Pending amendment exists guard (different key on same rule while first is pending)
    different_key_prop = SetupRuleAmendmentProposalRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="different-key-02",
        replacement_text="Another text",
        expected_brain_version=brain_data["brain_version"],
    )
    with pytest.raises(BootstrapConflictError) as exc:
        service.propose_amendment(novel_id, fact_id, different_key_prop, tenant_id=TENANT, actor_id=ACTOR)
    assert exc.value.code == "AMENDMENT_PENDING_EXISTS"

    # 4. CAS conflict on decide
    with pytest.raises(BootstrapConflictError) as exc:
        service.decide_amendment(
            novel_id,
            p1["proposal_id"],
            SetupRuleAmendmentDecisionRequest(
                contract_version="setup-rule-amendment-v1",
                idempotency_key="dec-cas-01",
                decision="accept",
                expected_brain_version=brain_data["brain_version"] + 999,
            ),
            tenant_id=TENANT,
            actor_id=ACTOR,
        )
    assert exc.value.code == "AMENDMENT_VERSION_CONFLICT"

    # 5. Decide proposal
    dec_req = SetupRuleAmendmentDecisionRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="dec-idemp-01",
        decision="accept",
        expected_brain_version=brain_data["brain_version"],
    )
    d1 = service.decide_amendment(novel_id, p1["proposal_id"], dec_req, tenant_id=TENANT, actor_id=ACTOR)
    # Replay decide
    d1_replay = service.decide_amendment(novel_id, p1["proposal_id"], dec_req, tenant_id=TENANT, actor_id=ACTOR)
    assert d1["successor_fact_id"] == d1_replay["successor_fact_id"]

    # 6. Already decided guard (different key on already decided proposal)
    with pytest.raises(BootstrapConflictError) as exc:
        service.decide_amendment(
            novel_id,
            p1["proposal_id"],
            SetupRuleAmendmentDecisionRequest(
                contract_version="setup-rule-amendment-v1",
                idempotency_key="different-dec-key",
                decision="reject",
                expected_brain_version=brain_data["brain_version"] + 1,
            ),
            tenant_id=TENANT,
            actor_id=ACTOR,
        )
    assert exc.value.code == "AMENDMENT_PROPOSAL_ALREADY_DECIDED"

    # 7. Parent conflict: cannot propose on replaced parent
    with pytest.raises(BootstrapConflictError) as exc:
        service.propose_amendment(
            novel_id,
            fact_id,
            SetupRuleAmendmentProposalRequest(
                contract_version="setup-rule-amendment-v1",
                idempotency_key="prop-on-replaced",
                replacement_text="Targeting old parent",
                expected_brain_version=brain_data["brain_version"] + 1,
            ),
            tenant_id=TENANT,
            actor_id=ACTOR,
        )
    assert exc.value.code == "AMENDMENT_PARENT_CONFLICT"


def test_amendment_cross_tenant_and_foreign_author_forbidden(amendment_env):
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    # Insert foreign author
    with f.engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO users(user_id,email,username,password_hash,role,status) "
                "VALUES (:a,:email,:name,'offline','AUTHOR','ACTIVE') ON CONFLICT(user_id) DO NOTHING"
            ),
            {"a": FOREIGN, "email": "foreign@example.test", "name": "foreign"},
        )

    # Foreign author cannot propose
    with pytest.raises(KeyError):
        service.propose_amendment(
            novel_id,
            fact_id,
            SetupRuleAmendmentProposalRequest(
                contract_version="setup-rule-amendment-v1",
                idempotency_key="foreign-prop-1",
                replacement_text="Foreign proposal",
                expected_brain_version=brain_data["brain_version"],
            ),
            tenant_id=TENANT,
            actor_id=FOREIGN,
        )

    # Author creates proposal
    p = service.propose_amendment(
        novel_id,
        fact_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="auth-prop-1",
            replacement_text="Valid proposal",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )

    # Foreign author cannot decide
    with pytest.raises(KeyError):
        service.decide_amendment(
            novel_id,
            p["proposal_id"],
            SetupRuleAmendmentDecisionRequest(
                contract_version="setup-rule-amendment-v1",
                idempotency_key="foreign-dec-1",
                decision="accept",
                expected_brain_version=brain_data["brain_version"],
            ),
            tenant_id=TENANT,
            actor_id=FOREIGN,
        )

    # Foreign author cannot readback history
    with pytest.raises(KeyError):
        service.get_amendment_history(novel_id, fact_id, tenant_id=TENANT, actor_id=FOREIGN)


def test_amendment_fails_when_m0_not_active(owned):
    f = owned
    # Ready but not activated!
    job, _ = ready(f)
    novel_id = f.src.novel_id
    service = SetupService(f.service)

    with f.engine.connect() as db:
        fact = db.execute(
            text("SELECT id FROM narrative.facts WHERE novel_id=:n AND fact_type='world_rule'"),
            {"n": novel_id},
        ).mappings().one()

    with pytest.raises(BootstrapConflictError) as exc:
        service.propose_amendment(
            novel_id,
            fact["id"],
            SetupRuleAmendmentProposalRequest(
                contract_version="setup-rule-amendment-v1",
                idempotency_key="prop-pre-m0",
                replacement_text="Pre-M0 proposal",
                expected_brain_version=1,
            ),
            tenant_id=TENANT,
            actor_id=ACTOR,
        )
    assert exc.value.code == "M0_NOT_ACTIVE"


def test_unaudited_lookalike_successor_remains_strictly_blocked(amendment_env):
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)

    # Directly insert an unaudited confirmed successor without an amendment receipt
    fake_successor_id = str(uuid.uuid4())
    with f.engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO narrative.facts("
                "id,story_brain_id,tenant_id,novel_id,fact_type,fact_key,fact_value,source_type,"
                "confirmation_status,is_locked,priority,created_by,supersedes_id,is_retired"
                ") VALUES (:id,:b,:t,:n,'world_rule',:k,CAST(:v AS jsonb),'author_setup','confirmed',false,0,:a,:p,false)"
            ),
            {
                "id": fake_successor_id,
                "b": brain_data["id"],
                "t": TENANT,
                "n": novel_id,
                "k": fact_data["fact_key"],
                "v": json.dumps("UNAUDITED INJECTION"),
                "a": ACTOR,
                "p": fact_id,
            },
        )

    # Must fail closed with WORLD_RULE_SUCCESSOR_UNVERIFIED
    with pytest.raises(WorldRuleLineageError) as exc:
        f.repo.get_structured_context(novel_id)
    assert exc.value.code == "WORLD_RULE_SUCCESSOR_UNVERIFIED"

    mem_resp = f.client.get(f"/v1/story-brains/{novel_id}/memory", headers=_memory_headers(f))
    assert mem_resp.status_code == 409
    assert mem_resp.json()["detail"]["reason"] == "WORLD_RULE_SUCCESSOR_UNVERIFIED"

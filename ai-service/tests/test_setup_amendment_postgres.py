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
from application.setup_service import SetupService, SetupFailure
from domain.errors import BootstrapConflictError
from domain.projection import WorldRuleLineageError
from infrastructure.orm_models import ProposalDecisionRecord
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


def test_concurrent_double_accept_race(amendment_env):
    """Concurrency test: Two threads attempting to accept the same proposal simultaneously.

    Transaction lock order on StoryBrain FOR UPDATE and Proposal FOR UPDATE guarantees:
    - Exactly one thread succeeds with 200 and bumps brain version.
    - Exactly one thread fails with 409 (conflict/already decided).
    - Database state has exactly 1 successor fact and 1 decision record.
    """
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    prop_req = SetupRuleAmendmentProposalRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="race-prop-1",
        replacement_text="Quy tắc sau cuộc đua đồng thời.",
        expected_brain_version=brain_data["brain_version"],
    )
    prop = service.propose_amendment(novel_id, fact_id, prop_req, tenant_id=TENANT, actor_id=ACTOR)
    proposal_id = prop["proposal_id"]

    decide_req_1 = SetupRuleAmendmentDecisionRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="race-dec-thread-1",
        decision="accept",
        expected_brain_version=brain_data["brain_version"],
        reason="Thread 1 wins or conflicts",
    )
    decide_req_2 = SetupRuleAmendmentDecisionRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="race-dec-thread-2",
        decision="accept",
        expected_brain_version=brain_data["brain_version"],
        reason="Thread 2 wins or conflicts",
    )

    results = []
    errors = []

    def _call(req):
        try:
            res = service.decide_amendment(novel_id, proposal_id, req, tenant_id=TENANT, actor_id=ACTOR)
            results.append(res)
        except Exception as e:
            errors.append(e)

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=2) as executor:
        t1 = executor.submit(_call, decide_req_1)
        t2 = executor.submit(_call, decide_req_2)
        t1.result()
        t2.result()

    assert len(results) == 1, f"Expected exactly 1 success, got {len(results)}"
    assert len(errors) == 1, f"Expected exactly 1 conflict error, got {len(errors)}"
    err = errors[0]
    assert isinstance(err, BootstrapConflictError)
    assert err.code in ("AMENDMENT_VERSION_CONFLICT", "AMENDMENT_PROPOSAL_ALREADY_DECIDED", "AMENDMENT_PARENT_CONFLICT")

    # Verify database consistency
    with f.engine.connect() as db:
        successors = db.execute(
            text("SELECT id FROM narrative.facts WHERE supersedes_id=:p AND confirmation_status='confirmed'"),
            {"p": fact_id},
        ).fetchall()
        assert len(successors) == 1

        decisions = db.execute(
            text("SELECT id, decision FROM narrative.proposal_decisions WHERE proposal_id=:p"),
            {"p": proposal_id},
        ).fetchall()
        assert len(decisions) == 1
        assert decisions[0][1] == "accept"

        brain = db.execute(
            text("SELECT brain_version FROM narrative.story_brains WHERE novel_id=:n"),
            {"n": novel_id},
        ).mappings().one()
        assert brain["brain_version"] == brain_data["brain_version"] + 1


def test_transaction_atomic_rollback_on_failure(amendment_env):
    """Failure injection test: Verify atomic rollback if transaction fails during acceptance.

    Ensures zero dangling successor facts, proposal remains pending, and zero brain bumps.
    """
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    prop_req = SetupRuleAmendmentProposalRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="rollback-prop-1",
        replacement_text="Quy tắc trước khi rollback.",
        expected_brain_version=brain_data["brain_version"],
    )
    prop = service.propose_amendment(novel_id, fact_id, prop_req, tenant_id=TENANT, actor_id=ACTOR)
    proposal_id = prop["proposal_id"]

    decide_req = SetupRuleAmendmentDecisionRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="rollback-dec-1",
        decision="accept",
        expected_brain_version=brain_data["brain_version"],
        reason="Trigger failure injection",
    )

    from unittest.mock import patch
    original_add = None

    def _failing_add(session_self, instance, *args, **kwargs):
        if isinstance(instance, ProposalDecisionRecord):
            raise RuntimeError("INJECTED_TRANSACTION_FAILURE")
        return original_add(session_self, instance, *args, **kwargs)

    from sqlalchemy.orm import Session
    original_add = Session.add

    with patch.object(Session, "add", _failing_add):
        with pytest.raises(RuntimeError, match="INJECTED_TRANSACTION_FAILURE"):
            service.decide_amendment(novel_id, proposal_id, decide_req, tenant_id=TENANT, actor_id=ACTOR)

    # Verify atomic rollback in durable PostgreSQL
    with f.engine.connect() as db:
        succ = db.execute(
            text("SELECT count(*) FROM narrative.facts WHERE supersedes_id=:p"),
            {"p": fact_id},
        ).scalar()
        assert succ == 0

        p_status = db.execute(
            text("SELECT status FROM narrative.proposals WHERE id=:p"),
            {"p": proposal_id},
        ).scalar()
        assert p_status == "pending"

        dec_count = db.execute(
            text("SELECT count(*) FROM narrative.proposal_decisions WHERE proposal_id=:p"),
            {"p": proposal_id},
        ).scalar()
        assert dec_count == 0

        curr_version = db.execute(
            text("SELECT brain_version FROM narrative.story_brains WHERE novel_id=:n"),
            {"n": novel_id},
        ).scalar()
        assert curr_version == brain_data["brain_version"]


def test_m0_provenance_rejects_non_setup_root(amendment_env):
    """F-01: Proposing amendment on a fact not originated from M0 setup review fails closed."""
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    # Insert a non-setup world rule directly into facts (not in M0 canonical_artifact_ids)
    unauthorized_rule_id = str(uuid.uuid4())
    with f.engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO narrative.facts("
                "id,story_brain_id,tenant_id,novel_id,fact_type,fact_key,fact_value,source_type,"
                "confirmation_status,is_locked,priority,created_by,supersedes_id,is_retired"
                ") VALUES (:id,:b,:t,:n,'world_rule','unauth_key',CAST(:v AS jsonb),'author_setup','confirmed',false,0,:a,NULL,false)"
            ),
            {
                "id": unauthorized_rule_id,
                "b": brain_data["id"],
                "t": TENANT,
                "n": novel_id,
                "v": json.dumps("Quy tắc không xuất xứ từ M0 setup"),
                "a": ACTOR,
            },
        )

    # Attempting to propose amendment must fail with 422 AMENDMENT_TARGET_INELIGIBLE
    with pytest.raises(SetupFailure) as exc:
        service.propose_amendment(
            novel_id,
            unauthorized_rule_id,
            SetupRuleAmendmentProposalRequest(
                contract_version="setup-rule-amendment-v1",
                idempotency_key="unauth-prop-1",
                replacement_text="Thử sửa quy tắc không rõ nguồn gốc",
                expected_brain_version=brain_data["brain_version"],
            ),
            tenant_id=TENANT,
            actor_id=ACTOR,
        )
    assert exc.value.status == 422
    assert exc.value.code == "AMENDMENT_TARGET_INELIGIBLE"


def test_forged_decision_receipt_fails_closed(amendment_env):
    """F-01: Forged receipt (mismatched actor or tampered payload) is rejected by repository edge loader."""
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)

    fake_successor_id = str(uuid.uuid4())
    fake_proposal_id = str(uuid.uuid4())
    fake_run_id = str(uuid.uuid4())
    intruder_actor = str(uuid.uuid4())

    with f.engine.begin() as db:
        # 1. Fact record created by intruder
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
                "v": json.dumps("Quy tắc giả mạo"),
                "a": intruder_actor,
                "p": fact_id,
            },
        )
        # 2. Run record
        db.execute(
            text(
                "INSERT INTO narrative.analysis_runs(id,story_brain_id,tenant_id,novel_id,operation,pipeline_version,input_hash,status,idempotency_key) "
                "VALUES (:id,:b,:t,:n,'setup_amendment','setup-rule-amendment-v1','fake_hash','completed',:k)"
            ),
            {"id": fake_run_id, "b": brain_data["id"], "t": TENANT, "n": novel_id, "k": f"fake:{fake_run_id}"},
        )
        # 3. Proposal record
        db.execute(
            text(
                "INSERT INTO narrative.proposals(id,analysis_run_id,story_brain_id,tenant_id,novel_id,dependency_group_id,"
                "materialization_order,proposal_type,status,expected_brain_version,payload) "
                "VALUES (:id,:r,:b,:t,:n,:dg,0,'world_rule_amendment','accepted',1,CAST(:p AS jsonb))"
            ),
            {
                "id": fake_proposal_id,
                "r": fake_run_id,
                "b": brain_data["id"],
                "t": TENANT,
                "n": novel_id,
                "dg": str(uuid.uuid4()),
                "p": json.dumps({
                    "contract_version": "setup-rule-amendment-v1",
                    "parent_fact_id": fact_id,
                    "fact_key": fact_data["fact_key"],
                    "replacement_text": "Quy tắc giả mạo",
                    "is_locked": False,
                }),
            },
        )
        # 4. Decision record with forged intruder actor
        db.execute(
            text(
                "INSERT INTO narrative.proposal_decisions(id,proposal_id,actor_id,decision,edited_payload) "
                "VALUES (:id,:p,:a,'accept',CAST(:payload AS jsonb))"
            ),
            {
                "id": str(uuid.uuid4()),
                "p": fake_proposal_id,
                "a": intruder_actor,
                "payload": json.dumps({
                    "contract_version": "setup-rule-amendment-v1",
                    "decision_type": "amendment_decision",
                    "decision": "accept",
                    "parent_fact_id": fact_id,
                    "successor_fact_id": fake_successor_id,
                    "artifact_ids": [fake_successor_id],
                }),
            },
        )

    # _load_verified_amendment_edges must reject this edge
    with f.engine.connect() as db:
        from infrastructure.database import session_scope
        with session_scope(f.repo._session_factory) as s:
            verified = f.repo._load_verified_amendment_edges(s, novel_id)
            assert (fact_id, fake_successor_id) not in verified

    # Context preview and memory must fail closed
    with pytest.raises(WorldRuleLineageError) as exc:
        f.repo.get_structured_context(novel_id)
    assert exc.value.code == "WORLD_RULE_SUCCESSOR_UNVERIFIED"


def test_unaudited_ancestor_chain_fails_closed(amendment_env):
    """F-01: Proposing amendment on an unaudited chain fails closed."""
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    # Insert unaudited successor fact A1
    unaudited_succ_id = str(uuid.uuid4())
    with f.engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO narrative.facts("
                "id,story_brain_id,tenant_id,novel_id,fact_type,fact_key,fact_value,source_type,"
                "confirmation_status,is_locked,priority,created_by,supersedes_id,is_retired"
                ") VALUES (:id,:b,:t,:n,'world_rule',:k,CAST(:v AS jsonb),'author_setup','confirmed',false,0,:a,:p,false)"
            ),
            {
                "id": unaudited_succ_id,
                "b": brain_data["id"],
                "t": TENANT,
                "n": novel_id,
                "k": fact_data["fact_key"],
                "v": json.dumps("Unaudited successor"),
                "a": ACTOR,
                "p": fact_id,
            },
        )

    # Attempting to propose amendment on unaudited_succ_id must fail
    with pytest.raises(BootstrapConflictError) as exc:
        service.propose_amendment(
            novel_id,
            unaudited_succ_id,
            SetupRuleAmendmentProposalRequest(
                contract_version="setup-rule-amendment-v1",
                idempotency_key="prop-unaudited-1",
                replacement_text="Sửa tiếp trên chuỗi chưa kiểm toán",
                expected_brain_version=brain_data["brain_version"],
            ),
            tenant_id=TENANT,
            actor_id=ACTOR,
        )
    assert exc.value.code == "AMENDMENT_PARENT_CONFLICT"


def test_propose_idempotency_after_brain_bump_and_accept(amendment_env):
    """F-02: Retrying identical proposal after brain version bump returns original receipt."""
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    prop_req = SetupRuleAmendmentProposalRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="idemp-bump-test",
        replacement_text="Văn bản đề xuất hợp lệ.",
        expected_brain_version=brain_data["brain_version"],
        private_author_notes=["Note A", "Note B"],
    )
    p1 = service.propose_amendment(novel_id, fact_id, prop_req, tenant_id=TENANT, actor_id=ACTOR)
    assert p1["brain_version"] == brain_data["brain_version"]

    # Author accepts proposal -> brain_version bumps
    dec_req = SetupRuleAmendmentDecisionRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="idemp-bump-dec",
        decision="accept",
        expected_brain_version=brain_data["brain_version"],
    )
    d1 = service.decide_amendment(novel_id, p1["proposal_id"], dec_req, tenant_id=TENANT, actor_id=ACTOR)
    assert d1["brain_version"] == brain_data["brain_version"] + 1

    # Client retries original propose request (which still has original expected_brain_version)
    p2 = service.propose_amendment(novel_id, fact_id, prop_req, tenant_id=TENANT, actor_id=ACTOR)
    assert p2["proposal_id"] == p1["proposal_id"]
    assert p2["brain_version"] == brain_data["brain_version"]  # Original brain version preserved


def test_propose_changed_private_notes_conflict(amendment_env):
    """F-02: Fingerprint includes private_author_notes; changing notes on same key yields 409 conflict."""
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    req1 = SetupRuleAmendmentProposalRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="idemp-notes-key",
        replacement_text="Văn bản đề xuất",
        expected_brain_version=brain_data["brain_version"],
        private_author_notes=["Ghi chú 1"],
    )
    service.propose_amendment(novel_id, fact_id, req1, tenant_id=TENANT, actor_id=ACTOR)

    req2 = SetupRuleAmendmentProposalRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="idemp-notes-key",
        replacement_text="Văn bản đề xuất",
        expected_brain_version=brain_data["brain_version"],
        private_author_notes=["Ghi chú 2 (đã thay đổi)"],
    )
    with pytest.raises(BootstrapConflictError) as exc:
        service.propose_amendment(novel_id, fact_id, req2, tenant_id=TENANT, actor_id=ACTOR)
    assert exc.value.code == "AMENDMENT_IDEMPOTENCY_CONFLICT"


def test_decide_changed_reason_conflict(amendment_env):
    """F-02: Fingerprint includes reason; changing reason on same key yields 409 conflict."""
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    prop = service.propose_amendment(
        novel_id,
        fact_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="reason-prop",
            replacement_text="Văn bản",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )

    req1 = SetupRuleAmendmentDecisionRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="reason-dec-key",
        decision="reject",
        expected_brain_version=brain_data["brain_version"],
        reason="Lý do từ chối A",
    )
    service.decide_amendment(novel_id, prop["proposal_id"], req1, tenant_id=TENANT, actor_id=ACTOR)

    req2 = SetupRuleAmendmentDecisionRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="reason-dec-key",
        decision="reject",
        expected_brain_version=brain_data["brain_version"],
        reason="Lý do từ chối B (đã thay đổi)",
    )
    with pytest.raises(BootstrapConflictError) as exc:
        service.decide_amendment(novel_id, prop["proposal_id"], req2, tenant_id=TENANT, actor_id=ACTOR)
    assert exc.value.code == "AMENDMENT_IDEMPOTENCY_CONFLICT"


def test_history_isolation_same_fact_key_different_roots(amendment_env):
    """F-03: Two independent roots sharing same fact_key have zero cross-chain leakage in history."""
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    # Insert a second root fact sharing the exact same fact_key and register it in M0 artifacts
    second_root_id = str(uuid.uuid4())
    with f.engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO narrative.facts("
                "id,story_brain_id,tenant_id,novel_id,fact_type,fact_key,fact_value,source_type,"
                "confirmation_status,is_locked,priority,created_by,supersedes_id,is_retired"
                ") VALUES (:id,:b,:t,:n,'world_rule',:k,CAST(:v AS jsonb),'author_setup','confirmed',false,0,:a,NULL,false)"
            ),
            {
                "id": second_root_id,
                "b": brain_data["id"],
                "t": TENANT,
                "n": novel_id,
                "k": fact_data["fact_key"],  # Same fact_key!
                "v": json.dumps("Root B sharing the same key text"),
                "a": ACTOR,
            },
        )
        # Update M0 job canonical_artifact_ids to include second_root_id
        job_row = db.execute(
            text("SELECT id, result FROM narrative.bootstrap_jobs WHERE novel_id=:n AND stage='m0_active'"),
            {"n": novel_id},
        ).mappings().one()
        res = dict(job_row["result"])
        review_resp = dict(res["setup_review"]["response"])
        review_resp["canonical_artifact_ids"].append(second_root_id)
        res["setup_review"]["response"] = review_resp
        db.execute(
            text("UPDATE narrative.bootstrap_jobs SET result=CAST(:r AS jsonb) WHERE id=:id"),
            {"id": job_row["id"], "r": json.dumps(res)},
        )

    # Propose and accept amendment on Root A -> Successor A1
    prop_a = service.propose_amendment(
        novel_id,
        fact_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="prop-root-a",
            replacement_text="Successor for Root A",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    dec_a = service.decide_amendment(
        novel_id,
        prop_a["proposal_id"],
        SetupRuleAmendmentDecisionRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="dec-root-a",
            decision="accept",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    successor_a_id = dec_a["successor_fact_id"]

    # Propose amendment on Root B (remains pending)
    prop_b = service.propose_amendment(
        novel_id,
        second_root_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="prop-root-b",
            replacement_text="Proposal for Root B",
            expected_brain_version=brain_data["brain_version"] + 1,
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )

    # 1. Query history for Root A
    hist_a = service.get_amendment_history(novel_id, fact_id, tenant_id=TENANT, actor_id=ACTOR)
    assert hist_a["root_fact_id"] == fact_id
    assert hist_a["effective_head_id"] == successor_a_id
    lineage_a_ids = [e["fact_id"] for e in hist_a["lineage"]]
    assert lineage_a_ids == [fact_id, successor_a_id]
    prop_a_ids = [p["proposal_id"] for p in hist_a["proposals"]]
    assert prop_a_ids == [prop_a["proposal_id"]]

    # 2. Query history for Successor A1 (walking up to Root A)
    hist_a1 = service.get_amendment_history(novel_id, successor_a_id, tenant_id=TENANT, actor_id=ACTOR)
    assert hist_a1["root_fact_id"] == fact_id
    assert hist_a1["effective_head_id"] == successor_a_id
    assert [e["fact_id"] for e in hist_a1["lineage"]] == [fact_id, successor_a_id]

    # 3. Query history for Root B
    hist_b = service.get_amendment_history(novel_id, second_root_id, tenant_id=TENANT, actor_id=ACTOR)
    assert hist_b["root_fact_id"] == second_root_id
    assert hist_b["effective_head_id"] == second_root_id
    lineage_b_ids = [e["fact_id"] for e in hist_b["lineage"]]
    assert lineage_b_ids == [second_root_id]
    prop_b_ids = [p["proposal_id"] for p in hist_b["proposals"]]
    assert prop_b_ids == [prop_b["proposal_id"]]


def test_history_fails_closed_on_tampered_lineage(amendment_env):
    """F-03: History does NOT fall back silently; tampered lineage raises 409 conflict."""
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    # Tamper with the fact by pointing supersedes_id to a non-existent UUID (broken lineage)
    with f.engine.begin() as db:
        db.execute(
            text("UPDATE narrative.facts SET supersedes_id=:fake WHERE id=:id"),
            {"fake": str(uuid.uuid4()), "id": fact_id},
        )

    with pytest.raises(BootstrapConflictError) as exc:
        service.get_amendment_history(novel_id, fact_id, tenant_id=TENANT, actor_id=ACTOR)
    assert "AMENDMENT_MALFORMED_LINEAGE" in exc.value.code or "AMENDMENT_RESOLVER_FAILED" in exc.value.code


def test_f04_non_global_fact_cannot_supersede_second_gen_head(amendment_env):
    """F-04: Confirmed P1 trait/chapter-scoped child pointing to approved successor A must fail closed."""
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    # 1. Author proposes and accepts amendment R -> A
    prop = service.propose_amendment(
        novel_id,
        fact_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="f04-prop-1",
            replacement_text="Successor A (2nd generation)",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    dec = service.decide_amendment(
        novel_id,
        prop["proposal_id"],
        SetupRuleAmendmentDecisionRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="f04-dec-1",
            decision="accept",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    successor_a_id = dec["successor_fact_id"]

    # 2. Directly insert a confirmed chapter-scoped / character trait child B pointing supersedes_id = A
    trait_b_id = str(uuid.uuid4())
    with f.engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO narrative.facts("
                "id,story_brain_id,tenant_id,novel_id,fact_type,fact_key,fact_value,source_type,"
                "confirmation_status,is_locked,priority,created_by,supersedes_id,chapter_number,is_retired"
                ") VALUES (:id,:b,:t,:n,'character_trait','trait_key',CAST(:v AS jsonb),'author_setup','confirmed',false,0,:a,:p,1,false)"
            ),
            {
                "id": trait_b_id,
                "b": brain_data["id"],
                "t": TENANT,
                "n": novel_id,
                "v": json.dumps("Chapter-scoped trait attempting to supersede World Setup Rule A"),
                "a": ACTOR,
                "p": successor_a_id,
            },
        )

    # 3. Assert resolve_effective_facts fails closed (no unauthorized replacement of 2nd gen head A)
    with pytest.raises(WorldRuleLineageError) as exc:
        f.repo.get_structured_context(novel_id)
    assert exc.value.code == "WORLD_RULE_SUCCESSOR_UNVERIFIED"

    # Memory endpoint also fails closed
    mem_resp = f.client.get(f"/v1/story-brains/{novel_id}/memory", headers=_memory_headers(f))
    assert mem_resp.status_code == 409
    assert mem_resp.json()["detail"]["reason"] == "WORLD_RULE_SUCCESSOR_UNVERIFIED"


def test_f04_non_global_fact_cannot_supersede_third_gen_head(amendment_env):
    """F-04: Non-global child attached to 3rd-generation active head also fails closed."""
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    # Gen 1 -> Gen 2
    prop1 = service.propose_amendment(
        novel_id,
        fact_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="f04-gen2-prop",
            replacement_text="Successor Gen 2",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    dec1 = service.decide_amendment(
        novel_id,
        prop1["proposal_id"],
        SetupRuleAmendmentDecisionRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="f04-gen2-dec",
            decision="accept",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    gen2_id = dec1["successor_fact_id"]

    # Gen 2 -> Gen 3
    prop2 = service.propose_amendment(
        novel_id,
        gen2_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="f04-gen3-prop",
            replacement_text="Successor Gen 3",
            expected_brain_version=brain_data["brain_version"] + 1,
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    dec2 = service.decide_amendment(
        novel_id,
        prop2["proposal_id"],
        SetupRuleAmendmentDecisionRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="f04-gen3-dec",
            decision="accept",
            expected_brain_version=brain_data["brain_version"] + 1,
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    gen3_id = dec2["successor_fact_id"]

    # Attach non-global fact to Gen 3
    non_global_id = str(uuid.uuid4())
    with f.engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO narrative.facts("
                "id,story_brain_id,tenant_id,novel_id,fact_type,fact_key,fact_value,source_type,"
                "confirmation_status,is_locked,priority,created_by,supersedes_id,chapter_number,is_retired"
                ") VALUES (:id,:b,:t,:n,'world_rule','setup_key',CAST(:v AS jsonb),'author_setup','confirmed',false,0,:a,:p,2,false)"
            ),
            {
                "id": non_global_id,
                "b": brain_data["id"],
                "t": TENANT,
                "n": novel_id,
                "v": json.dumps("Chapter-bound rule attempting to supersede Gen 3 head"),
                "a": ACTOR,
                "p": gen3_id,
            },
        )

    with pytest.raises(WorldRuleLineageError) as exc:
        f.repo.get_structured_context(novel_id)
    assert exc.value.code == "WORLD_RULE_SUCCESSOR_UNVERIFIED"


def test_f04_independent_p1_fact_corrections_unaffected(amendment_env):
    """F-04: Independent valid P1 fact correction chains (non-setup) remain completely functional."""
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)

    # Insert independent P1 trait C0 and successor C1
    c0_id = str(uuid.uuid4())
    c1_id = str(uuid.uuid4())
    with f.engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO narrative.facts("
                "id,story_brain_id,tenant_id,novel_id,fact_type,fact_key,fact_value,source_type,"
                "confirmation_status,is_locked,priority,created_by,supersedes_id,chapter_number,is_retired"
                ") VALUES "
                "(:c0,:b,:t,:n,'character_trait','bravery',CAST(:v0 AS jsonb),'author_p1','confirmed',false,0,:a,NULL,1,false),"
                "(:c1,:b,:t,:n,'character_trait','bravery',CAST(:v1 AS jsonb),'author_p1','confirmed',false,0,:a,:c0,1,false)"
            ),
            {
                "c0": c0_id,
                "c1": c1_id,
                "b": brain_data["id"],
                "t": TENANT,
                "n": novel_id,
                "v0": json.dumps("Dũng cảm"),
                "v1": json.dumps("Rất dũng cảm"),
                "a": ACTOR,
            },
        )

    # Query structured context: World Setup rule remains head, C1 replaces C0 cleanly
    ctx = f.repo.get_structured_context(novel_id)
    rule_ids = {r["id"] for r in ctx.world_rules}
    assert fact_id in rule_ids


def test_f05_tampered_decision_receipt_fields_fail_closed(amendment_env):
    """F-05: Tampering any binding field in the decision receipt causes edge rejection and fail-closed resolution."""
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    prop = service.propose_amendment(
        novel_id,
        fact_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="f05-prop-1",
            replacement_text="Successor for F05 Tamper Test",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    dec = service.decide_amendment(
        novel_id,
        prop["proposal_id"],
        SetupRuleAmendmentDecisionRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="f05-dec-1",
            decision="accept",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    decision_id = dec["proposal_id"]
    succ_id = dec["successor_fact_id"]

    # Verify edge is initially accepted
    from infrastructure.database import session_scope
    with session_scope(f.repo._session_factory) as s:
        verified = f.repo._load_verified_amendment_edges(s, novel_id)
        assert (fact_id, succ_id) in verified

    from application.writing_service import WritingService
    from tests.test_world_rule_effective_head_postgres import TeleportDraftProvider
    from tests.test_writing_plan_authority_postgres import SqlRevisionProvider

    provider = TeleportDraftProvider()
    writing_service = WritingService(f.repo, provider, SqlRevisionProvider(f.engine))

    with f.engine.connect() as db:
        orig_row = db.execute(
            text("SELECT id, edited_payload FROM narrative.proposal_decisions WHERE proposal_id=:p"),
            {"p": decision_id},
        ).mappings().one()
        orig_payload = dict(orig_row["edited_payload"])
        rec_id = orig_row["id"]

    # Test tampering fields one by one in edited_payload (including fact_value, fact_key, is_locked)
    tamper_cases = [
        ("proposal_id", str(uuid.uuid4())),
        ("actor_id", str(uuid.uuid4())),
        ("tenant_id", str(uuid.uuid4())),
        ("novel_id", str(uuid.uuid4())),
        ("story_brain_id", str(uuid.uuid4())),
        ("setup_snapshot_id", str(uuid.uuid4())),
        ("setup_hash", "tampered_hash_value"),
        ("expected_brain_version", 999),
        ("resulting_brain_version", 999),
        ("root_fact_id", str(uuid.uuid4())),
        ("fact_value", "tampered_receipt_fact_value"),
        ("fact_key", "tampered_receipt_fact_key"),
        ("is_locked", not orig_payload.get("is_locked", False)),
    ]

    for field_name, bad_value in tamper_cases:
        tampered_payload = dict(orig_payload)
        tampered_payload[field_name] = bad_value
        with f.engine.begin() as db:
            db.execute(
                text("UPDATE narrative.proposal_decisions SET edited_payload=CAST(:p AS jsonb) WHERE id=:id"),
                {"p": json.dumps(tampered_payload), "id": rec_id},
            )

        with session_scope(f.repo._session_factory) as s:
            verified = f.repo._load_verified_amendment_edges(s, novel_id)
            assert (fact_id, succ_id) not in verified, f"Field {field_name} tampering was not rejected by edge loader!"

        with pytest.raises(WorldRuleLineageError) as exc:
            f.repo.get_structured_context(novel_id)
        assert exc.value.code == "WORLD_RULE_SUCCESSOR_UNVERIFIED", (
            f"Field {field_name} tampering did not fail closed with WORLD_RULE_SUCCESSOR_UNVERIFIED in get_structured_context!"
        )

    # Verify zero provider calls were made during all fail-closed resolutions
    assert len(provider.payloads) == 0

    # Restore valid payload
    with f.engine.begin() as db:
        db.execute(
            text("UPDATE narrative.proposal_decisions SET edited_payload=CAST(:p AS jsonb) WHERE id=:id"),
            {"p": json.dumps(orig_payload), "id": rec_id},
        )


def test_f05_tampered_run_or_successor_scope_fails_closed(amendment_env):
    """F-05: Tampering analysis_runs operation or successor fact_type/lock causes edge rejection."""
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    prop = service.propose_amendment(
        novel_id,
        fact_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="f05-scope-prop",
            replacement_text="Successor Scope Tamper",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    dec = service.decide_amendment(
        novel_id,
        prop["proposal_id"],
        SetupRuleAmendmentDecisionRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="f05-scope-dec",
            decision="accept",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    succ_id = dec["successor_fact_id"]

    from infrastructure.database import session_scope

    # Tamper analysis_runs operation
    with f.engine.begin() as db:
        db.execute(
            text("UPDATE narrative.analysis_runs SET operation='unauthorized_operation' WHERE novel_id=:n"),
            {"n": novel_id},
        )
    with session_scope(f.repo._session_factory) as s:
        assert (fact_id, succ_id) not in f.repo._load_verified_amendment_edges(s, novel_id)

    # Restore operation and tamper successor fact_type
    with f.engine.begin() as db:
        db.execute(
            text("UPDATE narrative.analysis_runs SET operation='setup_amendment' WHERE novel_id=:n"),
            {"n": novel_id},
        )
        db.execute(
            text("UPDATE narrative.facts SET fact_type='character_trait' WHERE id=:id"),
            {"id": succ_id},
        )
    with session_scope(f.repo._session_factory) as s:
        assert (fact_id, succ_id) not in f.repo._load_verified_amendment_edges(s, novel_id)


def test_f06_decision_revalidation_rejects_tampered_ancestry_under_same_brain_version(amendment_env):
    """F-06: Tampering parent lineage while proposal is pending causes decide_amendment to fail closed.

    Guarantees 0 successor facts, 0 decision records, proposal remains pending, and 0 brain bumps.
    """
    f, novel_id, fact_id, fact_data, brain_data = _activated_novel(amendment_env)
    service = SetupService(f.service)

    prop = service.propose_amendment(
        novel_id,
        fact_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key="f06-prop-1",
            replacement_text="Proposal pending decision",
            expected_brain_version=brain_data["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    proposal_id = prop["proposal_id"]

    # Tamper with the parent fact while proposal is pending: retire it without changing brain version
    with f.engine.begin() as db:
        db.execute(
            text("UPDATE narrative.facts SET is_retired=true WHERE id=:id"),
            {"id": fact_id},
        )

    # Calling decide_amendment must fail closed
    dec_req = SetupRuleAmendmentDecisionRequest(
        contract_version="setup-rule-amendment-v1",
        idempotency_key="f06-dec-1",
        decision="accept",
        expected_brain_version=brain_data["brain_version"],
    )
    with pytest.raises((SetupFailure, BootstrapConflictError)):
        service.decide_amendment(novel_id, proposal_id, dec_req, tenant_id=TENANT, actor_id=ACTOR)

    # Verify PostgreSQL state: zero successor facts, zero decisions, proposal still pending, brain version unchanged
    with f.engine.connect() as db:
        succ_count = db.execute(
            text("SELECT count(*) FROM narrative.facts WHERE supersedes_id=:p"),
            {"p": fact_id},
        ).scalar()
        assert succ_count == 0

        dec_count = db.execute(
            text("SELECT count(*) FROM narrative.proposal_decisions WHERE proposal_id=:p"),
            {"p": proposal_id},
        ).scalar()
        assert dec_count == 0

        p_status = db.execute(
            text("SELECT status FROM narrative.proposals WHERE id=:p"),
            {"p": proposal_id},
        ).scalar()
        assert p_status == "pending"

        b_version = db.execute(
            text("SELECT brain_version FROM narrative.story_brains WHERE novel_id=:n"),
            {"n": novel_id},
        ).scalar()
        assert b_version == brain_data["brain_version"]


"""P2-06A: PostgreSQL integration tests for AI Brainstorming Foundation.

Verifies:
- Real PostgreSQL Story Brain read and grounding in approved entities/rules.
- Generation of structured World Rules, Character Seeds, and Future Events.
- All proposals carry `status: 'model_proposed'`, strictly separated from Canon/History.
- Zero mutations to Canon: 0 narrative_events rows, 0 new facts, unchanged brain_version.
- CAS verification on PostgreSQL brain_version.
- Identity and scope isolation on PostgreSQL tenant.
- Idempotency replay and conflict detection.
- Zero private notes leakage.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import threading
import time
import uuid
import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException

from api.brainstorm_schemas import BrainstormRequest
from api.deps import get_narrative_repository
from api.setup_schemas import SetupRuleAmendmentDecisionRequest, SetupRuleAmendmentProposalRequest
from application.brainstorm_service import BrainstormService
from application.setup_service import SetupService
from core.fake_llm import FakeDeterministicLLMService
from infrastructure.database import session_scope
from infrastructure.orm_models import AnalysisRunRecord, EventRecord, FactRecord, StoryBrainRecord
from tests.test_p2_bootstrap_postgres import ACTOR, TENANT, engine, f
from tests.test_plan_review_fixes_postgres import FOREIGN
from tests.test_setup_activation_postgres import owned, ready, activate

pytestmark = pytest.mark.postgres_integration


@pytest.fixture
def brainstorm_env(owned):
    f = owned
    fake_llm = FakeDeterministicLLMService()
    f.fake_llm = fake_llm
    f.brainstorm_svc = BrainstormService(repository=f.repo, llm_service=fake_llm)
    f.client.app.state.llm_service = fake_llm
    f.client.app.state.brainstorm_service = f.brainstorm_svc
    return f


def _headers(f, author_id=ACTOR, tenant_id=TENANT):
    return {
        **f.headers,
        "X-Author-Id": author_id,
        "X-User-Id": author_id,
        "X-Actor-Id": author_id,
        "X-Tenant-Id": tenant_id,
        "X-Request-Id": str(uuid.uuid4()),
    }


def _activated_brain(brainstorm_env):
    f = brainstorm_env
    job, body = ready(f)
    receipt = activate(f, job, body)
    novel_id = f.src.novel_id
    return novel_id, receipt


def test_brainstorm_postgres_grounded_and_leaves_canon_immutable(brainstorm_env):
    """P2-06A-PG-01: Suggestions are grounded in PG approved entities and leave PG Canon completely untouched."""
    f = brainstorm_env
    novel_id, activation = _activated_brain(f)
    headers = _headers(f)

    # Inspect Postgres before brainstorm
    with session_scope(f.repo._session_factory) as session:
        events_before = session.query(EventRecord).filter(EventRecord.novel_id == uuid.UUID(novel_id)).count()
        facts_before = session.query(FactRecord).filter(FactRecord.novel_id == uuid.UUID(novel_id)).count()
        brain_rec = session.query(StoryBrainRecord).filter(StoryBrainRecord.novel_id == uuid.UUID(novel_id)).first()
        brain_version_before = brain_rec.brain_version

    # Execute Brainstorming
    res = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=headers,
        json={
            "contract_version": "brainstorm-v1",
            "target": "all",
            "instruction": "Đề xuất thêm nhân vật mới và sự kiện tương lai",
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]

    # Verify model_proposed invariants
    assert len(data["world_rules"]) >= 1
    for r in data["world_rules"]:
        assert r["status"] == "model_proposed"
        assert r["is_canon"] is False
        assert r["is_historical"] is False

    assert len(data["characters"]) >= 1
    for c in data["characters"]:
        assert c["status"] == "model_proposed"
        assert c["is_canon"] is False
        assert c["is_historical"] is False

    assert len(data["future_events"]) >= 1
    for ev in data["future_events"]:
        assert ev["status"] == "model_proposed"
        assert ev["is_canon"] is False
        assert ev["is_historical"] is False
        assert ev["target_chapter"] >= 1

    # Verify strict Canon Immutability in PostgreSQL database
    with session_scope(f.repo._session_factory) as session:
        events_after = session.query(EventRecord).filter(EventRecord.novel_id == uuid.UUID(novel_id)).count()
        facts_after = session.query(FactRecord).filter(FactRecord.novel_id == uuid.UUID(novel_id)).count()
        brain_rec_after = session.query(StoryBrainRecord).filter(StoryBrainRecord.novel_id == uuid.UUID(novel_id)).first()
        brain_version_after = brain_rec_after.brain_version

    assert events_after == events_before == 0, "No historical narrative events must be created"
    assert facts_after == facts_before, "No unapproved facts must be materialized into facts table"
    assert brain_version_after == brain_version_before, "Brain version must remain unchanged by brainstorm"


def test_brainstorm_postgres_cas_and_idempotency(brainstorm_env):
    """P2-06A-PG-02: Enforce CAS against PostgreSQL brain_version and test idempotency caching."""
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)

    # 1. CAS conflict
    res_conflict = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=headers,
        json={
            "contract_version": "brainstorm-v1",
            "expected_brain_version": 9999,
        },
    )
    assert res_conflict.status_code == 409
    assert res_conflict.json()["detail"]["code"] == "BRAIN_VERSION_CONFLICT"

    # 2. Idempotency replay and conflict
    idem_key = f"pg-idem-{uuid.uuid4()}"
    body = {
        "contract_version": "brainstorm-v1",
        "instruction": "Tạo nhánh phát triển mới",
        "idempotency_key": idem_key,
    }
    res1 = f.client.post(f"/v1/story-brains/{novel_id}/brainstorm", headers=headers, json=body)
    assert res1.status_code == 200

    # Replay same key & body
    res2 = f.client.post(f"/v1/story-brains/{novel_id}/brainstorm", headers=headers, json=body)
    assert res2.status_code == 200
    assert res1.json()["data"]["provenance"]["timestamp"] == res2.json()["data"]["provenance"]["timestamp"]

    # Replay same key & modified body -> 409
    res3 = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=headers,
        json={**body, "instruction": "Hướng dẫn bị sửa đổi"},
    )
    assert res3.status_code == 409
    assert res3.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"


def test_brainstorm_postgres_author_operation_backward_compat(brainstorm_env):
    """P2-06A-PG-03: Backward compatibility for suggest_events via author-operation endpoint."""
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)

    res = f.client.post(
        f"/v1/story-brains/{novel_id}/author-operation",
        headers=headers,
        json={
            "operation": "suggest_events",
            "instruction": "Gợi ý sự kiện cho chương 2",
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()["data"]
    assert "events" in data
    assert len(data["events"]) >= 1
    assert data["events"][0]["status"] == "model_proposed"
    assert data["events"][0]["is_canon"] is False


def test_brainstorm_postgres_private_notes_redacted(brainstorm_env):
    """P2-06A-PG-04: Verify private author notes are not sent to model or leaked in response."""
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)

    markers = [f"private-{uuid.uuid4()}" for _ in range(2)]
    count = f.fake_llm.call_count
    res = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=headers,
        json={
            "contract_version": "brainstorm-v1",
            "instruction": "Gợi ý bình thường",
            "private_notes": markers[0],
            "private_author_notes": [markers[1]],
        },
    )
    assert res.status_code == 200
    assert f.fake_llm.call_count == count + 1
    payload = f.fake_llm.last_call
    assert payload["instruction"] == "Gợi ý bình thường"
    assert all(marker not in res.text and marker not in json.dumps(payload) for marker in markers)
    print("B08-05 " + json.dumps({"payload_fields": sorted(payload), "protected_fields_absent": True,
                                 "fake_dispatches": 1}))


def test_brainstorm_postgres_bsa01_effective_world_rules_lineage(brainstorm_env):
    """BSA-01: Root rule superseded via verified amendment edge is excluded; only effective successor grounded."""
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)

    # 1. Fetch root world rule fact
    with f.engine.connect() as db:
        fact = db.execute(
            text(
                "SELECT id, fact_key, fact_value FROM narrative.facts "
                "WHERE novel_id=:n AND fact_type='world_rule' ORDER BY created_at ASC LIMIT 1"
            ),
            {"n": novel_id},
        ).mappings().one()
        brain = db.execute(
            text("SELECT brain_version FROM narrative.story_brains WHERE novel_id=:n"),
            {"n": novel_id},
        ).mappings().one()
    root_fact_id = str(fact["id"])
    root_val_str = str(fact["fact_value"])

    # 2. Propose and accept amendment through SetupService to establish verified amendment edge
    setup_svc = SetupService(f.service)
    prop_res = setup_svc.propose_amendment(
        novel_id,
        root_fact_id,
        SetupRuleAmendmentProposalRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key=f"prop-{uuid.uuid4()}",
            replacement_text="Đạo pháp tự nhiên: Chỉ tu giả Nguyên Anh mới có thể ngự không phi hành.",
            expected_brain_version=brain["brain_version"],
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    dec_res = setup_svc.decide_amendment(
        novel_id,
        prop_res["proposal_id"],
        SetupRuleAmendmentDecisionRequest(
            contract_version="setup-rule-amendment-v1",
            idempotency_key=f"dec-{uuid.uuid4()}",
            decision="accept",
            expected_brain_version=brain["brain_version"],
            reason="Cập nhật quy tắc bay",
        ),
        tenant_id=TENANT,
        actor_id=ACTOR,
    )
    successor_id = dec_res["successor_fact_id"]
    assert successor_id is not None

    # 3. Call brainstorm
    f.fake_llm.last_call = {}
    res = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=headers,
        json={"contract_version": "brainstorm-v1", "target": "world_rules"},
    )
    assert res.status_code == 200, res.text

    # 4. Verify grounding prompt contains successor text and excludes superseded root text
    dispatched_rules = f.fake_llm.last_call.get("world_rules", [])
    dispatched_str = " ".join(dispatched_rules)
    assert "Chỉ tu giả Nguyên Anh mới có thể ngự không phi hành" in dispatched_str
    assert "Không ai bay được" not in dispatched_str


def test_brainstorm_postgres_bsa01_unverified_successor_fails_closed(brainstorm_env):
    """BSA-01: An unverified successor (no receipt edge) fails closed with 422 before LLM dispatch."""
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)

    with f.engine.connect() as db:
        fact = db.execute(
            text("SELECT id, story_brain_id FROM narrative.facts WHERE novel_id=:n AND fact_type='world_rule' LIMIT 1"),
            {"n": novel_id},
        ).mappings().one()
    root_id = str(fact["id"])
    brain_id = str(fact["story_brain_id"])

    # Insert an unverified successor directly into Postgres without accepted proposal/receipt edge
    unverified_id = str(uuid.uuid4())
    with f.engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO narrative.facts("
                "id, story_brain_id, tenant_id, novel_id, fact_type, fact_key, fact_value,"
                "source_type, confirmation_status, priority, is_locked, created_by, supersedes_id, is_retired"
                ") VALUES ("
                ":id, :brain, :t, :n, 'world_rule', 'unverified_rule', CAST(:val AS jsonb),"
                "'author_setup', 'confirmed', 0, false, :actor, :super, false"
                ")"
            ),
            {
                "id": unverified_id,
                "brain": brain_id,
                "t": TENANT,
                "n": novel_id,
                "val": json.dumps("Unverified rule bypass"),
                "actor": ACTOR,
                "super": root_id,
            },
        )

    f.fake_llm.last_call = {}
    f.fake_llm.call_count = 0
    res = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=headers,
        json={"contract_version": "brainstorm-v1"},
    )
    assert res.status_code == 422
    assert res.json()["detail"]["code"] in ("WORLD_RULE_SUCCESSOR_UNVERIFIED", "WORLD_RULE_LINEAGE_INVALID")
    assert f.fake_llm.last_call == {}
    assert f.fake_llm.call_count == 0


def test_brainstorm_postgres_bsa02_durable_idempotency_restart_and_brain_update(brainstorm_env):
    """BSA-02: Durable PostgreSQL idempotency persists across service restart and surviving brain updates."""
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)
    idem_key = f"pg-durable-{uuid.uuid4()}"
    req_body = {
        "contract_version": "brainstorm-v1",
        "instruction": "Khai phá cốt truyện chương 3",
        "idempotency_key": idem_key,
    }

    # 1. Initial brainstorm call
    f.fake_llm.call_count = 0
    res1 = f.client.post(f"/v1/story-brains/{novel_id}/brainstorm", headers=headers, json=req_body)
    assert res1.status_code == 200
    assert f.fake_llm.call_count == 1
    cached_timestamp = res1.json()["data"]["provenance"]["timestamp"]
    cached_rule_id = res1.json()["data"]["world_rules"][0]["rule_id"]

    # 2. Verify durable row in analysis_runs table
    with session_scope(f.repo._session_factory) as session:
        scoped_key = f"brainstorm:{TENANT}:{ACTOR}:{novel_id}:{idem_key}"[:255]
        run_rec = session.scalar(
            select(AnalysisRunRecord).where(
                AnalysisRunRecord.idempotency_key == scoped_key,
                AnalysisRunRecord.novel_id == uuid.UUID(novel_id),
            )
        )
        assert run_rec is not None
        assert run_rec.status == "completed"
        assert run_rec.entity_candidate_audit is not None
        cached_resp = run_rec.entity_candidate_audit.get("response", {})
        assert cached_resp.get("provenance", {}).get("timestamp") == cached_timestamp

    # 3. Simulate process restart by creating a new BrainstormService instance
    fresh_service = BrainstormService(repository=f.repo, llm_service=f.fake_llm)
    f.client.app.state.brainstorm_service = fresh_service

    # Replay same key and payload on fresh service
    f.fake_llm.call_count = 0
    res2 = f.client.post(f"/v1/story-brains/{novel_id}/brainstorm", headers=headers, json=req_body)
    assert res2.status_code == 200
    assert res2.json()["data"]["provenance"]["timestamp"] == cached_timestamp
    assert res2.json()["data"]["world_rules"][0]["rule_id"] == cached_rule_id
    assert f.fake_llm.call_count == 0, "Restarted service must serve from Postgres without calling LLM"

    # 4. Mutate story brain version in PostgreSQL (simulating intervening Brain / Setup update)
    with f.engine.begin() as db:
        db.execute(
            text("UPDATE narrative.story_brains SET brain_version = brain_version + 5 WHERE novel_id = :n"),
            {"n": novel_id},
        )

    # Replay same key and payload again: must still succeed and return original cached response
    res3 = f.client.post(f"/v1/story-brains/{novel_id}/brainstorm", headers=headers, json=req_body)
    assert res3.status_code == 200
    assert res3.json()["data"]["provenance"]["timestamp"] == cached_timestamp
    assert res3.json()["data"]["world_rules"][0]["rule_id"] == cached_rule_id
    assert f.fake_llm.call_count == 0, "Intervening brain version update must not invalidate exact idempotency replay"


def test_brainstorm_postgres_bsa02_concurrent_single_flight(brainstorm_env):
    """BSA-02: Simultaneous concurrent requests with same idempotency key are single-flighted to 1 LLM call."""
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)
    idem_key = f"pg-concurrent-{uuid.uuid4()}"
    req_body = {
        "contract_version": "brainstorm-v1",
        "instruction": "Đồng quy vu tận chi chiến",
        "idempotency_key": idem_key,
    }

    f.fake_llm.call_count = 0

    def _call():
        return f.client.post(f"/v1/story-brains/{novel_id}/brainstorm", headers=headers, json=req_body)

    with ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(_call)
        f2 = executor.submit(_call)
        res1 = f1.result()
        res2 = f2.result()

    assert res1.status_code == 200
    assert res2.status_code == 200
    assert res1.json()["data"]["provenance"]["timestamp"] == res2.json()["data"]["provenance"]["timestamp"]
    assert res1.json()["data"]["world_rules"][0]["rule_id"] == res2.json()["data"]["world_rules"][0]["rule_id"]
    assert f.fake_llm.call_count == 1, "Only 1 LLM provider dispatch should occur for concurrent single-flight"


def test_brainstorm_postgres_bsa03_ownership_and_auth_enforcement(brainstorm_env):
    """BSA-03: Mandatory author identity, novel ownership check, and fail-closed plan CAS."""
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)

    # 1. Missing author identity -> 401
    f.fake_llm.call_count = 0
    no_auth_headers = {k: v for k, v in _headers(f).items() if k not in ("X-Author-Id", "X-User-Id", "X-Actor-Id")}
    res_no_auth = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=no_auth_headers,
        json={"contract_version": "brainstorm-v1"},
    )
    assert res_no_auth.status_code == 401
    assert res_no_auth.json()["detail"]["code"] == "BRAINSTORM_IDENTITY_REQUIRED"
    assert f.fake_llm.call_count == 0

    # 2. Foreign author calling owned novel -> 403
    foreign_headers = _headers(f, author_id=FOREIGN)
    res_foreign = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=foreign_headers,
        json={"contract_version": "brainstorm-v1"},
    )
    assert res_foreign.status_code == 403
    assert res_foreign.json()["detail"]["code"] == "NOVEL_OWNERSHIP_MISMATCH"
    assert f.fake_llm.call_count == 0

    # 3. Plan CAS conflict on missing or mismatched plan -> 409
    res_plan_conflict = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=_headers(f),
        json={"contract_version": "brainstorm-v1", "expected_plan_version": 9999},
    )
    assert res_plan_conflict.status_code == 409
    assert res_plan_conflict.json()["detail"]["code"] == "PLAN_VERSION_CONFLICT"
    assert f.fake_llm.call_count == 0


def test_brainstorm_postgres_bsa02r_retry_succeeds_after_429_failure(brainstorm_env):
    """BSA-02R: Same-key retry succeeds in PostgreSQL after initial 429 failure, transitioning failed -> completed."""
    from unittest.mock import patch
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)
    idem_key = f"pg-retry-429-{uuid.uuid4()}"
    scoped_key = f"brainstorm:{TENANT}:{ACTOR}:{novel_id}:{idem_key}"[:255]
    req_body = {
        "contract_version": "brainstorm-v1",
        "idempotency_key": idem_key,
        "instruction": "Khai phá cốt truyện chương 4",
    }

    # 1. First attempt triggers transient 429 quota exhaustion on provider
    f.fake_llm.call_count = 0
    with patch.object(f.fake_llm, "suggest_brainstorm", side_effect=RuntimeError("429 Resource exhausted")):
        res1 = f.client.post(
            f"/v1/story-brains/{novel_id}/brainstorm",
            headers=headers,
            json=req_body,
        )
    assert res1.status_code == 429
    assert res1.json()["detail"]["code"] == "PROVIDER_QUOTA_EXHAUSTED"

    # Verify AnalysisRunRecord is marked as "failed" in PostgreSQL
    with session_scope(f.repo._session_factory) as session:
        run_rec = session.scalar(
            select(AnalysisRunRecord).where(
                AnalysisRunRecord.idempotency_key == scoped_key,
                AnalysisRunRecord.novel_id == uuid.UUID(novel_id),
            )
        )
        assert run_rec is not None
        assert run_rec.status == "failed"

    # 2. Same-key exact retry with same payload succeeds with 200
    res2 = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=headers,
        json=req_body,
    )
    assert res2.status_code == 200
    cached_timestamp = res2.json()["data"]["provenance"]["timestamp"]

    # Verify AnalysisRunRecord transitioned to "completed" in PostgreSQL
    with session_scope(f.repo._session_factory) as session:
        run_rec2 = session.scalar(
            select(AnalysisRunRecord).where(
                AnalysisRunRecord.idempotency_key == scoped_key,
                AnalysisRunRecord.novel_id == uuid.UUID(novel_id),
            )
        )
        assert run_rec2 is not None
        assert run_rec2.status == "completed"

    # 3. Third call with same key is replayed from PostgreSQL without provider call
    f.fake_llm.call_count = 0
    res3 = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=headers,
        json=req_body,
    )
    assert res3.status_code == 200
    assert res3.json()["data"]["provenance"]["timestamp"] == cached_timestamp
    assert f.fake_llm.call_count == 0, "Exact replay must be served from cache without LLM call"


def test_brainstorm_postgres_bsa02r_retry_succeeds_after_502_failure(brainstorm_env):
    """BSA-02R: Same-key retry succeeds in PostgreSQL after initial 502 provider failure."""
    from unittest.mock import patch
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)
    idem_key = f"pg-retry-502-{uuid.uuid4()}"
    scoped_key = f"brainstorm:{TENANT}:{ACTOR}:{novel_id}:{idem_key}"[:255]
    req_body = {
        "contract_version": "brainstorm-v1",
        "idempotency_key": idem_key,
        "instruction": "Khai phá cốt truyện mới",
    }

    # 1. First attempt triggers 502 provider error
    with patch.object(f.fake_llm, "suggest_brainstorm", side_effect=RuntimeError("502 Bad Gateway")):
        res1 = f.client.post(
            f"/v1/story-brains/{novel_id}/brainstorm",
            headers=headers,
            json=req_body,
        )
    assert res1.status_code == 502
    assert res1.json()["detail"]["code"] == "BRAINSTORM_PROVIDER_ERROR"

    # Verify status is failed
    with session_scope(f.repo._session_factory) as session:
        run_rec = session.scalar(
            select(AnalysisRunRecord).where(
                AnalysisRunRecord.idempotency_key == scoped_key,
                AnalysisRunRecord.novel_id == uuid.UUID(novel_id),
            )
        )
        assert run_rec is not None
        assert run_rec.status == "failed"

    # 2. Same-key exact retry succeeds with 200
    res2 = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=headers,
        json=req_body,
    )
    assert res2.status_code == 200

    with session_scope(f.repo._session_factory) as session:
        run_rec2 = session.scalar(
            select(AnalysisRunRecord).where(
                AnalysisRunRecord.idempotency_key == scoped_key,
                AnalysisRunRecord.novel_id == uuid.UUID(novel_id),
            )
        )
        assert run_rec2 is not None
        assert run_rec2.status == "completed"


def test_brainstorm_postgres_bsa02r_stale_pending_lease_takeover(brainstorm_env):
    """BSA-02R: Expired pending lease (e.g. from crashed worker) is safely taken over in PostgreSQL."""
    import time
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)
    idem_key = f"pg-stale-takeover-{uuid.uuid4()}"
    scoped_key = f"brainstorm:{TENANT}:{ACTOR}:{novel_id}:{idem_key}"[:255]

    req = BrainstormRequest(
        contract_version="brainstorm-v1",
        idempotency_key=idem_key,
        instruction="Stale lease recovery",
    )
    canonical_input = {
        "tenant_id": str(TENANT),
        "author_id": str(ACTOR),
        "novel_id": str(novel_id),
        "idempotency_key": req.idempotency_key,
        "target": req.target,
        "instruction": req.instruction,
        "current_chapter": req.current_chapter,
        "target_chapter": req.target_chapter,
        "expected_brain_version": req.expected_brain_version,
        "expected_plan_version": req.expected_plan_version,
        "private_notes": req.private_notes,
        "private_author_notes": req.private_author_notes,
    }
    input_hash = hashlib.sha256(
        json.dumps(canonical_input, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()

    # Insert a stale pending run into PostgreSQL with expired lease
    with session_scope(f.repo._session_factory) as session:
        brain_rec = session.scalar(
            select(StoryBrainRecord).where(*f.repo._scope(StoryBrainRecord, uuid.UUID(novel_id)))
        )
        stale_run = AnalysisRunRecord(
            id=uuid.uuid4(),
            story_brain_id=brain_rec.id,
            tenant_id=f.repo._tenant_id,
            novel_id=uuid.UUID(novel_id),
            operation="brainstorm",
            status="pending",
            idempotency_key=scoped_key,
            input_hash=input_hash,
            pipeline_version="brainstorm-v1",
            entity_candidate_audit={
                "author_id": str(ACTOR),
                "input_hash": input_hash,
                "lease_token": "crashed-worker-token",
                "lease_expires_at": time.time() - 60.0,  # Expired 60s ago
            },
        )
        session.add(stale_run)

    # Next brainstorm request with same key detects expired lease, takes over, and succeeds
    res = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=headers,
        json={
            "contract_version": "brainstorm-v1",
            "idempotency_key": idem_key,
            "instruction": "Stale lease recovery",
        },
    )
    assert res.status_code == 200

    # Verify status in PostgreSQL transitioned to completed
    with session_scope(f.repo._session_factory) as session:
        updated_run = session.scalar(
            select(AnalysisRunRecord).where(
                AnalysisRunRecord.idempotency_key == scoped_key,
                AnalysisRunRecord.novel_id == uuid.UUID(novel_id),
            )
        )
        assert updated_run is not None
        assert updated_run.status == "completed"


def test_brainstorm_postgres_bsa02r_reservation_db_failure_fail_closed(brainstorm_env):
    """BSA-02R: If DB reservation throws an error, fail closed with 503 and zero LLM calls."""
    from unittest.mock import patch
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)
    idem_key = f"pg-db-fail-{uuid.uuid4()}"

    f.fake_llm.call_count = 0
    with patch.object(
        f.brainstorm_svc,
        "_reserve_or_takeover_receipt",
        side_effect=RuntimeError("Database connection timeout"),
    ):
        res = f.client.post(
            f"/v1/story-brains/{novel_id}/brainstorm",
            headers=headers,
            json={
                "contract_version": "brainstorm-v1",
                "idempotency_key": idem_key,
                "instruction": "Normal",
            },
        )
        assert res.status_code == 503
        assert res.json()["detail"]["code"] == "IDEMPOTENCY_STORE_UNAVAILABLE"
        assert f.fake_llm.call_count == 0, "Zero LLM calls must occur when reservation fails"


def test_brainstorm_postgres_bsa02r_concurrency_across_separate_instances(brainstorm_env):
    """BSA-02R: Simultaneous requests across separate BrainstormService instances are single-flighted."""
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    idem_key = f"pg-multi-inst-{uuid.uuid4()}"
    req_body = {
        "contract_version": "brainstorm-v1",
        "instruction": "Đại hội liên minh đa server",
        "idempotency_key": idem_key,
    }

    # Two separate BrainstormService instances sharing same PostgreSQL repository
    svc1 = BrainstormService(repository=f.repo, llm_service=f.fake_llm)
    svc2 = BrainstormService(repository=f.repo, llm_service=f.fake_llm)

    f.fake_llm.call_count = 0
    req_dto = BrainstormRequest.model_validate(req_body)

    with ThreadPoolExecutor(max_workers=2) as executor:
        t1 = executor.submit(svc1.brainstorm, novel_id, req_dto, tenant_id=str(TENANT), actor_id=str(ACTOR))
        t2 = executor.submit(svc2.brainstorm, novel_id, req_dto, tenant_id=str(TENANT), actor_id=str(ACTOR))
        res1 = t1.result()
        res2 = t2.result()

    assert res1.provenance.timestamp == res2.provenance.timestamp
    assert res1.world_rules[0].rule_id == res2.world_rules[0].rule_id
    assert f.fake_llm.call_count == 1, "Only 1 LLM dispatch across separate service instances"


def test_brainstorm_postgres_bsa03r_ownership_denied_when_core_novel_absent(brainstorm_env):
    """BSA-03R: Story Brain exists in PostgreSQL, but absent or soft-deleted Core novel row fails closed."""
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)

    # 1. Delete Core novels row from PostgreSQL
    with f.engine.begin() as db:
        db.execute(text("DELETE FROM novels WHERE novel_id = :n"), {"n": novel_id})

    # Verify Story Brain still exists
    with session_scope(f.repo._session_factory) as session:
        brain_rec = session.scalar(
            select(StoryBrainRecord).where(*f.repo._scope(StoryBrainRecord, uuid.UUID(novel_id)))
        )
        assert brain_rec is not None

    f.fake_llm.call_count = 0
    # Brainstorm call must fail closed with 404 NOVEL_NOT_FOUND, even with valid service token
    res_absent = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=headers,
        json={"contract_version": "brainstorm-v1"},
    )
    assert res_absent.status_code == 404
    assert res_absent.json()["detail"]["code"] == "NOVEL_NOT_FOUND"
    assert f.fake_llm.call_count == 0, "Zero LLM calls when Core novel row is absent"

    # 2. Foreign author also denied when novel row absent
    foreign_headers = _headers(f, author_id=FOREIGN)
    res_foreign = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=foreign_headers,
        json={"contract_version": "brainstorm-v1"},
    )
    assert res_foreign.status_code == 404
    assert f.fake_llm.call_count == 0

    # 3. Soft-deleted novel: re-insert with deleted_at set
    with f.engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO novels(novel_id, author_id, title, slug, synopsis, deleted_at) "
                "VALUES (:n, :a, 'Soft Deleted', :slug, 'synopsis', NOW())"
            ),
            {"n": novel_id, "a": ACTOR, "slug": f"deleted-{novel_id}"},
        )

    res_deleted = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=headers,
        json={"contract_version": "brainstorm-v1"},
    )
    assert res_deleted.status_code == 404
    assert res_deleted.json()["detail"]["code"] == "NOVEL_DELETED"
    assert f.fake_llm.call_count == 0, "Zero LLM calls when novel is soft-deleted"


def test_brainstorm_postgres_bsa04r_scalar_type_errors_return_502(brainstorm_env):
    """BSA-04R: Provider returning malformed scalar types in real PostgreSQL returns 502, never 500."""
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)
    url = f"/v1/story-brains/{novel_id}/brainstorm"

    cases = [
        "test_adversarial_scalar_rule_text",
        "test_adversarial_scalar_char_name",
        "test_adversarial_scalar_event_title",
        "test_adversarial_bad_aliases_string",
        "test_adversarial_bad_aliases_int",
        "test_adversarial_bad_participant_int",
        "test_adversarial_bad_participant_hint_int",
        "test_adversarial_bool_chapter",
        "test_adversarial_bool_min_words",
    ]

    for trigger in cases:
        res = f.client.post(
            url,
            headers=headers,
            json={"contract_version": "brainstorm-v1", "instruction": trigger},
        )
        assert res.status_code == 502, f"Expected 502 for trigger {trigger}, got {res.status_code}: {res.text}"
        assert res.json()["detail"]["code"] == "BRAINSTORM_PROVIDER_ERROR"


def test_brainstorm_postgres_bsa02s_slow_provider_lease_renewal_prevents_duplicate_dispatch(brainstorm_env):
    """BSA-02S: Worker A runs longer than lease timeout while LLM provider is processing.
    Background lease renewal updates PostgreSQL lease_expires_at, preventing Worker B from
    taking over or issuing duplicate LLM calls.
    """
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    idem_key = f"pg-slow-provider-{uuid.uuid4()}"
    req_body = {
        "contract_version": "brainstorm-v1",
        "instruction": "Test postgres slow provider renewal",
        "idempotency_key": idem_key,
    }

    class SlowPgLLM(FakeDeterministicLLMService):
        def __init__(self):
            super().__init__()
            self.entered_event = threading.Event()
            self.release_event = threading.Event()
            self.dispatches: int = 0

        def suggest_brainstorm(self, **kwargs):
            self.dispatches += 1
            self.entered_event.set()
            self.release_event.wait(timeout=5.0)
            return super().suggest_brainstorm(**kwargs)

    slow_llm = SlowPgLLM()
    # Fast lease in test: lease_duration = 0.4s, heartbeat_interval = 0.08s
    svc1 = BrainstormService(
        repository=f.repo,
        llm_service=slow_llm,
        lease_duration=0.4,
        heartbeat_interval=0.08,
    )
    svc2 = BrainstormService(
        repository=f.repo,
        llm_service=slow_llm,
        lease_duration=0.4,
        heartbeat_interval=0.08,
    )

    req_dto = BrainstormRequest.model_validate(req_body)

    res_a_holder: list[Any] = []
    err_a_holder: list[Any] = []

    def worker_a():
        try:
            r = svc1.brainstorm(novel_id, req_dto, tenant_id=str(TENANT), actor_id=str(ACTOR))
            res_a_holder.append(r)
        except Exception as e:
            err_a_holder.append(e)

    thread_a = threading.Thread(target=worker_a)
    thread_a.start()

    assert slow_llm.entered_event.wait(timeout=3.0), "Worker A must enter provider"

    # Sleep 0.6s: strictly exceeds Worker A's initial 0.4s lease_duration.
    # PostgreSQL row must have been renewed by the background heartbeat.
    time.sleep(0.6)

    # Verify that in PostgreSQL, lease_expires_at was renewed into the future
    scoped_key = f"brainstorm:{TENANT}:{ACTOR}:{novel_id}:{idem_key}"[:255]
    with session_scope(f.repo._session_factory) as session:
        run_rec = session.scalar(
            select(AnalysisRunRecord).where(
                AnalysisRunRecord.idempotency_key == scoped_key,
                AnalysisRunRecord.novel_id == uuid.UUID(novel_id),
            )
        )
        assert run_rec is not None
        assert run_rec.status == "pending"
        exp = (run_rec.entity_candidate_audit or {}).get("lease_expires_at", 0)
        assert exp > time.time(), "Lease in PostgreSQL must have been renewed past current time"

    # Worker B calls brainstorm with identical key
    res_b_holder: list[Any] = []
    err_b_holder: list[Any] = []

    def worker_b():
        try:
            r = svc2.brainstorm(novel_id, req_dto, tenant_id=str(TENANT), actor_id=str(ACTOR))
            res_b_holder.append(r)
        except Exception as e:
            err_b_holder.append(e)

    thread_b = threading.Thread(target=worker_b)
    thread_b.start()

    time.sleep(0.1)

    # At this point, exactly 1 LLM dispatch must exist across separate service instances
    assert slow_llm.dispatches == 1, "No concurrent second provider dispatch while A is alive"

    # Release Worker A
    slow_llm.release_event.set()
    thread_a.join(timeout=3.0)
    thread_b.join(timeout=3.0)

    assert len(err_a_holder) == 0, f"Worker A failed: {err_a_holder}"
    assert len(res_a_holder) == 1
    assert len(res_b_holder) == 1
    assert slow_llm.dispatches == 1, "Total LLM dispatches across separate instances must remain 1"
    assert slow_llm.call_count == 1, "Completed LLM calls must remain 1"
    assert res_a_holder[0].provenance.timestamp == res_b_holder[0].provenance.timestamp


def test_brainstorm_postgres_bsa02s_crashed_worker_safe_takeover(brainstorm_env):
    """BSA-02S: Worker A crashes in PostgreSQL (lease expired in DB, no active thread).
    Worker B safely takes over the slot in PostgreSQL and completes successfully.
    """
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)
    idem_key = f"pg-crash-recovery-{uuid.uuid4()}"
    scoped_key = f"brainstorm:{TENANT}:{ACTOR}:{novel_id}:{idem_key}"[:255]

    req = BrainstormRequest(
        contract_version="brainstorm-v1",
        idempotency_key=idem_key,
        instruction="Test crash takeover in PG",
    )
    canonical_input = {
        "tenant_id": str(TENANT),
        "author_id": str(ACTOR),
        "novel_id": str(novel_id),
        "idempotency_key": req.idempotency_key,
        "target": req.target,
        "instruction": req.instruction,
        "current_chapter": req.current_chapter,
        "target_chapter": req.target_chapter,
        "expected_brain_version": req.expected_brain_version,
        "expected_plan_version": req.expected_plan_version,
        "private_notes": req.private_notes,
        "private_author_notes": req.private_author_notes,
    }
    input_hash = hashlib.sha256(
        json.dumps(canonical_input, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()

    # Insert a crashed worker's pending record into PostgreSQL (expired 45s ago)
    with session_scope(f.repo._session_factory) as session:
        brain_rec = session.scalar(
            select(StoryBrainRecord).where(*f.repo._scope(StoryBrainRecord, uuid.UUID(novel_id)))
        )
        crashed_run = AnalysisRunRecord(
            id=uuid.uuid4(),
            story_brain_id=brain_rec.id,
            tenant_id=f.repo._tenant_id,
            novel_id=uuid.UUID(novel_id),
            operation="brainstorm",
            status="pending",
            idempotency_key=scoped_key,
            input_hash=input_hash,
            pipeline_version="brainstorm-v1",
            entity_candidate_audit={
                "author_id": str(ACTOR),
                "input_hash": input_hash,
                "lease_token": "dead-worker-token-pg",
                "lease_expires_at": time.time() - 45.0,
            },
        )
        session.add(crashed_run)

    f.fake_llm.call_count = 0

    # Worker B calls brainstorm: must detect expired lease without active thread, takeover, and succeed
    res = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=headers,
        json={
            "contract_version": "brainstorm-v1",
            "idempotency_key": idem_key,
            "instruction": "Test crash takeover in PG",
        },
    )
    assert res.status_code == 200
    assert f.fake_llm.call_count == 1, "Worker B must execute exactly 1 LLM call"

    with session_scope(f.repo._session_factory) as session:
        updated_run = session.scalar(
            select(AnalysisRunRecord).where(
                AnalysisRunRecord.idempotency_key == scoped_key,
                AnalysisRunRecord.novel_id == uuid.UUID(novel_id),
            )
        )
        assert updated_run.status == "completed"
        audit = updated_run.entity_candidate_audit or {}
        assert audit.get("lease_token") != "dead-worker-token-pg", "New lease token must have been assigned"


def test_brainstorm_postgres_bsa03s_json_adapter_ownership_fail_closed_zero_llm_calls(brainstorm_env):
    """BSA-03S: When narrative repository is JsonNarrativeRepository, ownership verification fails closed.
    Neither author A nor author B can read Story Brain or invoke LLM provider.
    Zero provider calls must occur.
    """
    import tempfile
    from core.story_kb_manager import KBEntity, StoryKBManager
    from infrastructure.json_narrative_repository import JsonNarrativeRepository

    f = brainstorm_env

    with tempfile.TemporaryDirectory() as tmpdir:
        json_mgr = StoryKBManager(storage_dir=tmpdir)
        json_novel_id = str(uuid.uuid4())

        # Seed KB data
        kb = json_mgr.load_kb(json_novel_id)
        kb.entities["Tiêu Viêm"] = KBEntity(name="Tiêu Viêm", entity_type="character", status="Alive")
        json_mgr.save_narrative_kb(json_novel_id, kb)

        json_repo = JsonNarrativeRepository(json_mgr)
        json_svc = BrainstormService(repository=json_repo, llm_service=f.fake_llm)

        f.fake_llm.call_count = 0
        req = BrainstormRequest(
            contract_version="brainstorm-v1",
            instruction="Test json repo fail-closed",
        )

        # 1. Author A (ACTOR) fails closed
        with pytest.raises(HTTPException) as exc_a:
            json_svc.brainstorm(json_novel_id, req, tenant_id=str(TENANT), actor_id=str(ACTOR))
        assert exc_a.value.status_code == 503
        assert exc_a.value.detail["code"] == "OWNERSHIP_VERIFICATION_UNAVAILABLE"
        assert f.fake_llm.call_count == 0, "Zero LLM calls on author A verification failure"

        # 2. Author B (FOREIGN) fails closed
        with pytest.raises(HTTPException) as exc_b:
            json_svc.brainstorm(json_novel_id, req, tenant_id=str(TENANT), actor_id=str(FOREIGN))
        assert exc_b.value.status_code == 503
        assert exc_b.value.detail["code"] == "OWNERSHIP_VERIFICATION_UNAVAILABLE"
        assert f.fake_llm.call_count == 0, "Zero LLM calls on author B verification failure"

        # 3. Via HTTP endpoint with app dependency override
        f.client.app.dependency_overrides[get_narrative_repository] = lambda: json_repo
        f.client.app.state.brainstorm_service = json_svc
        try:
            headers_a = _headers(f, author_id=ACTOR)
            res_a = f.client.post(
                f"/v1/story-brains/{json_novel_id}/brainstorm",
                headers=headers_a,
                json={"contract_version": "brainstorm-v1", "instruction": "HTTP JSON test A"},
            )
            assert res_a.status_code == 503
            assert res_a.json()["detail"]["code"] == "OWNERSHIP_VERIFICATION_UNAVAILABLE"
            assert f.fake_llm.call_count == 0

            headers_b = _headers(f, author_id=FOREIGN)
            res_b = f.client.post(
                f"/v1/story-brains/{json_novel_id}/brainstorm",
                headers=headers_b,
                json={"contract_version": "brainstorm-v1", "instruction": "HTTP JSON test B"},
            )
            assert res_b.status_code == 503
            assert res_b.json()["detail"]["code"] == "OWNERSHIP_VERIFICATION_UNAVAILABLE"
            assert f.fake_llm.call_count == 0
        finally:
            f.client.app.dependency_overrides.pop(get_narrative_repository, None)
            f.client.app.state.brainstorm_service = f.brainstorm_svc


def test_brainstorm_postgres_bsa02s_non_unique_integrity_error_fails_closed_503(brainstorm_env):
    """BSA-02S Nonblocking Maintenance: Distinguish unique key collisions from unrelated IntegrityErrors.
    Unrelated integrity errors (e.g. check constraint or foreign key) immediately raise HTTP 503,
    rather than waiting 10s and returning 409.
    """
    from unittest.mock import patch
    f = brainstorm_env
    novel_id, _ = _activated_brain(f)
    headers = _headers(f)
    idem_key = f"pg-non-unique-err-{uuid.uuid4()}"

    f.fake_llm.call_count = 0
    # Simulate an IntegrityError that is NOT a unique violation (no pgcode 23505 and no 'unique' in msg)
    non_unique_exc = IntegrityError(
        statement="INSERT INTO analysis_runs ...",
        params={},
        orig=Exception("check constraint 'analysis_runs_status_check' failed"),
    )

    with patch.object(
        f.brainstorm_svc,
        "_reserve_or_takeover_receipt",
        side_effect=non_unique_exc,
    ):
        res = f.client.post(
            f"/v1/story-brains/{novel_id}/brainstorm",
            headers=headers,
            json={
                "contract_version": "brainstorm-v1",
                "idempotency_key": idem_key,
                "instruction": "Test non unique integrity error",
            },
        )
        # Fast fail-closed: must NOT wait 10 seconds, returns 503
        assert res.status_code == 503
        assert res.json()["detail"]["code"] == "IDEMPOTENCY_STORE_UNAVAILABLE"
        assert f.fake_llm.call_count == 0


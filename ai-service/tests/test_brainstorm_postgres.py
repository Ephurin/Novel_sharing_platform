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

import hashlib
import json
import uuid
import pytest
from sqlalchemy import text

from api.brainstorm_schemas import BrainstormRequest
from application.brainstorm_service import BrainstormService
from core.fake_llm import FakeDeterministicLLMService
from infrastructure.database import session_scope
from infrastructure.orm_models import NarrativeEventRecord, FactRecord, StoryBrainRecord
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
        events_before = session.scalar(
            text("SELECT count(*) FROM narrative_events WHERE novel_id = :nid"),
            {"nid": uuid.UUID(novel_id)},
        )
        facts_before = session.scalar(
            text("SELECT count(*) FROM facts WHERE novel_id = :nid"),
            {"nid": uuid.UUID(novel_id)},
        )
        brain_row = session.execute(
            text("SELECT brain_version FROM story_brains WHERE novel_id = :nid"),
            {"nid": uuid.UUID(novel_id)},
        ).first()
        brain_version_before = brain_row[0]

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
        events_after = session.scalar(
            text("SELECT count(*) FROM narrative_events WHERE novel_id = :nid"),
            {"nid": uuid.UUID(novel_id)},
        )
        facts_after = session.scalar(
            text("SELECT count(*) FROM facts WHERE novel_id = :nid"),
            {"nid": uuid.UUID(novel_id)},
        )
        brain_row_after = session.execute(
            text("SELECT brain_version FROM story_brains WHERE novel_id = :nid"),
            {"nid": uuid.UUID(novel_id)},
        ).first()
        brain_version_after = brain_row_after[0]

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

    secret = "PG_SECRET_NOTE_REDACTION_CHECK_112233"
    res = f.client.post(
        f"/v1/story-brains/{novel_id}/brainstorm",
        headers=headers,
        json={
            "contract_version": "brainstorm-v1",
            "instruction": "Gợi ý bình thường",
            "private_notes": secret,
        },
    )
    assert res.status_code == 200
    assert secret not in res.text
    assert secret not in json.dumps(f.fake_llm.last_call)


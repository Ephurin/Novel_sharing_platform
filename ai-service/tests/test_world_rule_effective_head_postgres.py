"""P2-07D: Shared effective World Setup rule authority across Memory, Context, Projection, and Dispatch."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict
import hashlib
import json
from types import SimpleNamespace
import uuid

import pytest
from sqlalchemy import text

from api.entity_hitl_routes import router as hitl_router
from api.narrative_routes import internal_router
from application.writing_service import WritingService
from domain.errors import BootstrapConflictError
from domain.projection import WorldRuleLineageError
from tests.test_p2_bootstrap_postgres import ACTOR, TENANT, engine, f, snapshot
from tests.test_plan_review_fixes_postgres import FOREIGN
from tests.test_setup_activation_postgres import activate, owned, ready, state as m0_state
from tests.test_writing_plan_authority_postgres import (
    RecordingProvider,
    SqlRevisionProvider,
    assert_blocked,
    durable,
    request_body,
    seed_plan,
)

pytestmark = pytest.mark.postgres_integration


class TeleportDraftProvider(RecordingProvider):
    """Offline fake provider that emits a teleport-in-barrier draft to test _validate_draft."""

    def generate_writing_draft(self, **kwargs):
        self.payloads.append(deepcopy(kwargs))
        text_out = "Tiêu Viêm kích hoạt Phù Ấn Cổ để dịch chuyển trong kết giới phong tỏa."
        return {
            "draft_text": text_out,
            "patch": {"start": 0, "end": 0, "replacement": text_out},
            "model_info": {"provider": "recording-fake"},
        }


@pytest.fixture
def rule_env(f):
    n, c, r = f.src.novel_id, f.src.chapter_id, f.src.revision_id
    content = "Chương mở đầu: Tiêu Viêm đứng trước kết giới cổ xưa."
    h = hashlib.sha256(content.encode("utf-8")).hexdigest()
    with f.engine.begin() as db:
        for actor in (ACTOR, FOREIGN):
            db.execute(
                text(
                    "INSERT INTO users(user_id,email,username,password_hash,role,status) "
                    "VALUES (:a,:email,:name,'offline-only','AUTHOR','ACTIVE') "
                    "ON CONFLICT(user_id) DO NOTHING"
                ),
                {"a": actor, "email": f"{actor}@example.test", "name": f"p207d-{actor}"},
            )
        db.execute(
            text(
                "INSERT INTO novels(novel_id,author_id,title,slug,synopsis) "
                "VALUES (:n,:a,'P2-07D Novel',:slug,'offline')"
            ),
            {"n": n, "a": ACTOR, "slug": f"p207d-{n}"},
        )
        db.execute(
            text(
                "INSERT INTO chapters(chapter_id,novel_id,chapter_number,title,content,word_count) "
                "VALUES (:c,:n,1,'Chapter 1',:content,9)"
            ),
            {"c": c, "n": n, "content": content},
        )
        db.execute(
            text(
                "INSERT INTO chapter_revisions(revision_id,novel_id,chapter_id,content_hash,content,word_count,source_type,created_by) "
                "VALUES (:r,:n,:c,:h,:content,9,'AUTHOR_MANUAL',:a)"
            ),
            {"r": r, "n": n, "c": c, "h": h, "content": content, "a": ACTOR},
        )
        db.execute(
            text("UPDATE chapters SET latest_revision_id=:r WHERE chapter_id=:c"),
            {"r": r, "c": c},
        )
    f.repo.get_story_brain(n)
    with f.engine.begin() as db:
        brain_id = db.execute(
            text(
                "UPDATE narrative.story_brains "
                "SET status='active', baseline_revision_id=:r "
                "WHERE novel_id=:n AND tenant_id=:t RETURNING id"
            ),
            {"r": r, "n": n, "t": TENANT},
        ).scalar_one()
        db.execute(
            text(
                "INSERT INTO narrative.entities("
                "id,story_brain_id,tenant_id,novel_id,entity_type,canonical_name,normalized_name,"
                "confirmation_status,static_attributes,source_type,is_locked,private_author_notes"
                ") VALUES (:id,:brain,:t,:n,'PER','Tiêu Viêm','tiêu viêm','confirmed','{}','author_setup',false,'P207DPrivateOnly')"
            ),
            {"id": str(uuid.uuid4()), "brain": brain_id, "t": TENANT, "n": n},
        )
    provider = TeleportDraftProvider()
    service = WritingService(f.repo, provider, SqlRevisionProvider(f.engine))
    f.client.app.state.writing_service = service
    f.client.app.state.revision_analysis_service = SimpleNamespace(_repository=f.repo)
    f.client.app.state.settings.default_tenant_id = TENANT
    f.client.app.include_router(hitl_router)
    f.client.app.include_router(internal_router)
    seed_plan(f, ACTOR)
    return f, service, provider, h, str(brain_id)


def _insert_fact(
    db,
    *,
    brain_id: str,
    tenant_id: str = TENANT,
    novel_id: str,
    fact_id: str | None = None,
    subject_entity_id: str | None = None,
    fact_type: str = "world_rule",
    fact_key: str = "barrier_teleport",
    fact_value: object = "Cấm dịch chuyển trong kết giới phong tỏa",
    source_type: str = "author_setup",
    confirmation_status: str = "confirmed",
    is_locked: bool = False,
    source_revision_id: str | None = None,
    chapter_number: int | None = None,
    source_start: int | None = None,
    source_end: int | None = None,
    created_by: str | None = ACTOR,
    supersedes_id: str | None = None,
    is_retired: bool = False,
) -> str:
    fid = fact_id or str(uuid.uuid4())
    db.execute(
        text(
            "INSERT INTO narrative.facts("
            "id,story_brain_id,tenant_id,novel_id,subject_entity_id,fact_type,fact_key,fact_value,"
            "source_type,confirmation_status,priority,is_locked,source_revision_id,chapter_number,"
            "source_start,source_end,created_by,supersedes_id,is_retired"
            ") VALUES ("
            ":id,:brain,:tenant,:novel,:subject,:fact_type,:fact_key,CAST(:fact_value AS jsonb),"
            ":source_type,:confirmation_status,0,:is_locked,:source_revision_id,:chapter_number,"
            ":source_start,:source_end,:created_by,:supersedes_id,:is_retired"
            ")"
        ),
        {
            "id": fid,
            "brain": brain_id,
            "tenant": tenant_id,
            "novel": novel_id,
            "subject": subject_entity_id,
            "fact_type": fact_type,
            "fact_key": fact_key,
            "fact_value": json.dumps(fact_value, ensure_ascii=False),
            "source_type": source_type,
            "confirmation_status": confirmation_status,
            "is_locked": is_locked,
            "source_revision_id": source_revision_id,
            "chapter_number": chapter_number,
            "source_start": source_start,
            "source_end": source_end,
            "created_by": created_by,
            "supersedes_id": supersedes_id,
            "is_retired": is_retired,
        },
    )
    return fid


def _insert_transition(
    db,
    *,
    brain_id: str,
    tenant_id: str = TENANT,
    novel_id: str,
    entity_id: str,
    attribute_key: str,
    new_value: object,
    fact_id: str | None = None,
    event_id: str | None = None,
    sequence: int = 1,
) -> str:
    tid = str(uuid.uuid4())
    db.execute(
        text(
            "INSERT INTO narrative.state_transitions("
            "id,story_brain_id,tenant_id,novel_id,entity_id,event_id,fact_id,attribute_key,new_value,sequence"
            ") VALUES (:id,:brain,:tenant,:novel,:entity,:event,:fact,:key,CAST(:val AS jsonb),:seq)"
        ),
        {
            "id": tid,
            "brain": brain_id,
            "tenant": tenant_id,
            "novel": novel_id,
            "entity": entity_id,
            "event": event_id,
            "fact": fact_id,
            "key": attribute_key,
            "val": json.dumps(new_value, ensure_ascii=False),
            "seq": sequence,
        },
    )
    return tid


def _memory_headers(f):
    return {
        **f.headers,
        "X-Author-Id": ACTOR,
        "X-Tenant-Id": TENANT,
        "X-Request-Id": str(uuid.uuid4()),
    }


def _assert_canon_unchanged(f, before):
    after = durable(f, "p207d-after")
    canon_before = {k: v for k, v in before.items() if k != "writing_generations"}
    canon_after = {k: v for k, v in after.items() if k != "writing_generations"}
    assert canon_before == canon_after
    assert f.llm.calls == 0


@pytest.mark.parametrize("is_locked", [False, True])
def test_baseline_single_setup_rule_and_p1_extracted_facts_unchanged(rule_env, is_locked):
    f, service, provider, h, brain_id = rule_env
    n = f.src.novel_id
    with f.engine.begin() as db:
        setup_rule_id = _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            fact_key="alchemy_tier",
            fact_value="Luyện đan tứ phẩm cần linh hỏa bản mệnh",
            is_locked=is_locked,
        )
        p1_fact_id = _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            fact_key="forest_herb",
            fact_value="Huyết Liên Tinh mọc ở tầng sâu đại ngàn",
            source_type="AI",
            chapter_number=1,
            source_revision_id=f.src.revision_id,
            source_start=0,
            source_end=15,
            is_locked=False,
        )

    before = durable(f, f"p207d-baseline-{is_locked}")
    mem_resp = f.client.get(f"/v1/story-brains/{n}/memory", headers=_memory_headers(f))
    assert mem_resp.status_code == 200, mem_resp.text
    mem_facts = mem_resp.json()["data"]["facts"]
    assert {item["fact_id"] for item in mem_facts} == {setup_rule_id, p1_fact_id}

    ctx_resp = f.client.get(
        f"/v1/story-brains/{n}/context-preview?chapter_number=1",
        headers=_memory_headers(f),
    )
    assert ctx_resp.status_code == 200, ctx_resp.text
    ctx_rules = ctx_resp.json()["data"]["world_rules"]
    assert {item["id"] for item in ctx_rules} == {setup_rule_id, p1_fact_id}

    gen_resp = f.client.post(
        "/v1/writing/generations",
        headers=_memory_headers(f),
        json=request_body((f, service, provider, h)),
    )
    assert gen_resp.status_code == 202, gen_resp.text
    job = f.repo.get_writing_job(gen_resp.json()["data"]["job_id"])
    assert job.status == "completed" and len(provider.payloads) == 1
    dispatched_rules = provider.payloads[0]["context_package"]["world_rules"]
    assert {item["id"] for item in dispatched_rules} == {setup_rule_id, p1_fact_id}
    _assert_canon_unchanged(f, before)


def _assert_all_consumers_fail_closed(f, service, provider, h, caplog, before, *, reason=None, leaked=()):
    n = f.src.novel_id
    # 1. Approved Memory fails closed with 409 INVALID_CANON_HISTORY
    mem_resp = f.client.get(f"/v1/story-brains/{n}/memory", headers=_memory_headers(f))
    assert mem_resp.status_code == 409, mem_resp.text
    assert mem_resp.json()["detail"]["code"] == "INVALID_CANON_HISTORY"
    if reason is not None:
        assert mem_resp.json()["detail"]["reason"] in reason
    # 2. Context preview fails closed with 409 INVALID_CANON_HISTORY
    ctx_resp = f.client.get(
        f"/v1/story-brains/{n}/context-preview?chapter_number=1",
        headers=_memory_headers(f),
    )
    assert ctx_resp.status_code == 409, ctx_resp.text
    assert ctx_resp.json()["detail"]["code"] == "INVALID_CANON_HISTORY"
    if reason is not None:
        assert ctx_resp.json()["detail"]["reason"] in reason
    for marker in ("P207DPrivateOnly", *leaked):
        assert marker not in mem_resp.text and marker not in ctx_resp.text
    # 3. Writing worker fails closed with WRITING_CONTEXT_AUTHORITY_DENIED and zero provider calls
    gen_resp = f.client.post(
        "/v1/writing/generations",
        headers=_memory_headers(f),
        json=request_body((f, service, provider, h)),
    )
    assert gen_resp.status_code == 202, gen_resp.text
    job = f.repo.get_writing_job(gen_resp.json()["data"]["job_id"])
    assert_blocked(job, provider, caplog)
    assert "P207DPrivateOnly" not in json.dumps(asdict(job), default=str)
    _assert_canon_unchanged(f, before)


UNVERIFIED = {"WORLD_RULE_SUCCESSOR_UNVERIFIED"}
UNVERIFIED_OR_MALFORMED = {"WORLD_RULE_SUCCESSOR_UNVERIFIED", "WORLD_RULE_LINEAGE_MALFORMED"}


@pytest.mark.parametrize(
    "hops,parent_locked,head_locked,parent_retired",
    [
        (2, False, False, False),
        (2, True, False, False),
        (2, True, True, True),
        (3, True, False, False),
        (3, True, True, True),
    ],
)
def test_well_formed_but_unaudited_successor_chain_never_replaces_root(
    rule_env, hops, parent_locked, head_locked, parent_retired, caplog
):
    """F-01: matching source/actor/scope metadata alone is not author approval."""
    f, service, provider, h, brain_id = rule_env
    n = f.src.novel_id
    with f.engine.begin() as db:
        root_id = _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            fact_key="barrier_teleport",
            fact_value="ROOT_RULE: Cấm dịch chuyển trong kết giới phong tỏa",
            source_type="model_suggestion",
            is_locked=parent_locked,
            is_retired=parent_retired,
        )
        prev_id = root_id
        if hops == 3:
            prev_id = _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_key="barrier_teleport",
                fact_value="UNAUDITED_MID: Không thể dịch chuyển trong kết giới cấp cao",
                source_type="author_setup",
                is_locked=parent_locked,
                is_retired=parent_retired,
                supersedes_id=root_id,
            )
        _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            fact_key="barrier_teleport",
            fact_value="UNAUDITED_HEAD: Trong kết giới phong tỏa cho phép dịch chuyển bằng Phù Ấn Cổ",
            source_type="author_setup",
            is_locked=head_locked,
            supersedes_id=prev_id,
        )
        _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            fact_key="alchemy_fire",
            fact_value="ACTIVE_INDEPENDENT: Luyện đan tam phẩm cần đan hỏa",
            is_locked=True,
        )
    with f.engine.connect() as db:
        successor_ids = {
            str(r[0]) for r in db.execute(
                text("SELECT id FROM narrative.facts WHERE novel_id=:n AND supersedes_id IS NOT NULL"), {"n": n}
            ).all()
        }
        payloads = [r[0] for r in db.execute(text("SELECT edited_payload FROM narrative.proposal_decisions")).all()]
    # No author-approval receipt references any successor in this novel.
    assert successor_ids and not any(
        successor_ids & set((payload or {}).get("artifact_ids", [])) for payload in payloads
    )
    before = durable(f, f"p207d-unaudited-{hops}-{parent_locked}-{head_locked}-{parent_retired}")
    with pytest.raises(WorldRuleLineageError) as raised:
        f.repo.get_structured_context(n, chapter_number=1)
    assert raised.value.code == "WORLD_RULE_SUCCESSOR_UNVERIFIED"
    _assert_all_consumers_fail_closed(
        f, service, provider, h, caplog, before,
        reason=UNVERIFIED, leaked=("UNAUDITED_HEAD", "UNAUDITED_MID", "ROOT_RULE"),
    )


def test_real_setup_review_root_with_receipt_is_not_replaced_by_unaudited_successor(owned):
    """F-01 with a genuine author-approved root produced by the real setup review flow."""
    f = owned
    job, _ = ready(f)
    n = f.src.novel_id
    with f.engine.connect() as db:
        root = db.execute(
            text(
                "SELECT id, story_brain_id, fact_key, source_type, created_by, is_locked "
                "FROM narrative.facts WHERE novel_id=:n AND fact_type='world_rule'"
            ),
            {"n": n},
        ).mappings().one()
        receipt_artifacts = [
            row[0]
            for row in db.execute(
                text(
                    "SELECT d.edited_payload FROM narrative.proposal_decisions d "
                    "JOIN narrative.proposals p ON p.id = d.proposal_id "
                    "WHERE p.novel_id=:n AND d.decision IN ('accept','edit_accept')"
                ),
                {"n": n},
            ).all()
        ]
    root_id = str(root["id"])
    # The approved root is backed by a durable setup-review decision receipt.
    assert any(root_id in (payload or {}).get("artifact_ids", []) for payload in receipt_artifacts)
    baseline = f.repo.get_structured_context(n)
    assert root_id in {r["id"] for r in baseline.world_rules}

    with f.engine.begin() as db:
        successor_id = _insert_fact(
            db,
            brain_id=str(root["story_brain_id"]),
            novel_id=n,
            fact_key=root["fact_key"],
            fact_value="UNAUDITED_SUCCESSOR: Amended without a decision receipt",
            source_type="author_setup",
            created_by=str(root["created_by"]),
            is_locked=bool(root["is_locked"]),
            supersedes_id=root_id,
        )
    with f.engine.connect() as db:
        rows = [r[0] for r in db.execute(text("SELECT edited_payload FROM narrative.proposal_decisions")).all()]
    assert not any(successor_id in (payload or {}).get("artifact_ids", []) for payload in rows)
    before = snapshot(f, "p207d-receipt-before")
    with pytest.raises(WorldRuleLineageError) as raised:
        f.repo.get_structured_context(n)
    assert raised.value.code == "WORLD_RULE_SUCCESSOR_UNVERIFIED"
    from domain.projection import resolve_effective_facts
    with pytest.raises(WorldRuleLineageError):
        resolve_effective_facts(f.repo.get_story_brain(n, read_only=True).facts)
    assert snapshot(f, "p207d-receipt-after") == before
    assert f.llm.calls == 0


def test_p1_fact_corrections_standalone_retirement_and_pending_setup_successor_preserved(rule_env):
    """F-02: World Setup restrictions must not break valid P1 correction / retirement semantics."""
    f, service, provider, h, brain_id = rule_env
    n = f.src.novel_id
    with f.engine.connect() as db:
        entity_id = str(db.execute(
            text("SELECT id FROM narrative.entities WHERE novel_id=:n LIMIT 1"), {"n": n}
        ).scalar_one())
    p1 = dict(source_type="AI", chapter_number=1, source_revision_id=f.src.revision_id,
              source_start=0, source_end=15, created_by=None)
    with f.engine.begin() as db:
        setup_root = _insert_fact(
            db, brain_id=brain_id, novel_id=n, fact_key="barrier_teleport",
            fact_value="SETUP_ROOT: Cấm dịch chuyển trong kết giới phong tỏa", is_locked=True,
        )
        # Pending (unapproved) setup successor: ignored, never replaces the approved root.
        _insert_fact(
            db, brain_id=brain_id, novel_id=n, fact_key="barrier_teleport",
            fact_value="PENDING_SUCCESSOR: chưa được duyệt", confirmation_status="proposed",
            supersedes_id=setup_root,
        )
        # Standalone retired setup rule: hidden (pre-existing Approved Memory semantics).
        _insert_fact(
            db, brain_id=brain_id, novel_id=n, fact_key="retired_rule",
            fact_value="RETIRED_SETUP: luật đã bỏ", is_locked=True, is_retired=True,
        )
        trait_v1 = _insert_fact(
            db, brain_id=brain_id, novel_id=n, subject_entity_id=entity_id,
            fact_type="character_trait", fact_key="hair", fact_value="P1_OLD_TRAIT: tóc đen", **p1,
        )
        trait_v2 = _insert_fact(
            db, brain_id=brain_id, novel_id=n, subject_entity_id=entity_id,
            fact_type="character_trait", fact_key="hair", fact_value="P1_NEW_TRAIT: tóc bạc",
            supersedes_id=trait_v1, **p1,
        )
        ch_rule_v1 = _insert_fact(
            db, brain_id=brain_id, novel_id=n, fact_key="forest_herb",
            fact_value="P1_OLD_RULE: Huyết Liên mọc ven suối", **p1,
        )
        ch_rule_v2 = _insert_fact(
            db, brain_id=brain_id, novel_id=n, fact_key="forest_herb",
            fact_value="P1_NEW_RULE: Huyết Liên mọc ở tầng sâu đại ngàn", supersedes_id=ch_rule_v1, **p1,
        )
        _insert_fact(
            db, brain_id=brain_id, novel_id=n, fact_key="old_herb",
            fact_value="P1_RETIRED_RULE: đã bỏ", is_retired=True, **p1,
        )
    before = durable(f, "p207d-p1-compat")
    mem_resp = f.client.get(f"/v1/story-brains/{n}/memory", headers=_memory_headers(f))
    assert mem_resp.status_code == 200, mem_resp.text
    assert {i["fact_id"] for i in mem_resp.json()["data"]["facts"]} == {setup_root, trait_v2, ch_rule_v2}
    for hidden in ("PENDING_SUCCESSOR", "RETIRED_SETUP", "P1_OLD_TRAIT", "P1_OLD_RULE", "P1_RETIRED_RULE"):
        assert hidden not in mem_resp.text

    ctx_resp = f.client.get(
        f"/v1/story-brains/{n}/context-preview?chapter_number=1", headers=_memory_headers(f)
    )
    assert ctx_resp.status_code == 200, ctx_resp.text
    # Context packs every effective confirmed fact family (pre-existing behavior).
    assert {i["id"] for i in ctx_resp.json()["data"]["world_rules"]} == {setup_root, trait_v2, ch_rule_v2}
    for hidden in ("PENDING_SUCCESSOR", "RETIRED_SETUP", "P1_OLD_TRAIT", "P1_OLD_RULE", "P1_RETIRED_RULE"):
        assert hidden not in ctx_resp.text

    gen_resp = f.client.post(
        "/v1/writing/generations", headers=_memory_headers(f), json=request_body((f, service, provider, h))
    )
    assert gen_resp.status_code == 202, gen_resp.text
    job = f.repo.get_writing_job(gen_resp.json()["data"]["job_id"])
    assert job.status == "completed" and len(provider.payloads) == 1
    dispatched = json.dumps(provider.payloads[0]["context_package"], ensure_ascii=False)
    assert "SETUP_ROOT" in dispatched and "P1_NEW_RULE" in dispatched
    for hidden in ("PENDING_SUCCESSOR", "RETIRED_SETUP", "P1_OLD_RULE", "P1_RETIRED_RULE"):
        assert hidden not in dispatched
    _assert_canon_unchanged(f, before)


@pytest.mark.parametrize("is_locked", [False, True])
def test_p1_state_projection_parity_with_memory_and_writing_context_under_corrections_and_retirement(rule_env, is_locked):
    """F-03: State projection and rebuild_projection must stay synchronized with Memory and Writing Context."""
    f, service, provider, h, brain_id = rule_env
    n = f.src.novel_id
    with f.engine.connect() as db:
        entity_id = str(db.execute(
            text("SELECT id FROM narrative.entities WHERE novel_id=:n LIMIT 1"), {"n": n}
        ).scalar_one())
        brain_version = db.execute(
            text("SELECT brain_version FROM narrative.story_brains WHERE novel_id=:n"), {"n": n}
        ).scalar_one()

    # 1. Baseline: Fact F1 + State Transition T1
    with f.engine.begin() as db:
        f1_id = _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            subject_entity_id=entity_id,
            fact_type="character_trait",
            fact_key="cultivation_stage",
            fact_value="Đại Đấu Sư",
            source_type="AI",
            is_locked=is_locked,
            chapter_number=1,
            source_revision_id=f.src.revision_id,
        )
        _insert_transition(
            db,
            brain_id=brain_id,
            novel_id=n,
            entity_id=entity_id,
            attribute_key="cultivation_stage",
            new_value="Đại Đấu Sư",
            fact_id=f1_id,
            sequence=10,
        )

    # Rebuild projection and check strict parity across all consumers
    rebuilt_state = f.repo.rebuild_projection(n, brain_version)
    assert rebuilt_state["entities"][entity_id]["cultivation_stage"] == "Đại Đấu Sư"

    mem_resp = f.client.get(f"/v1/story-brains/{n}/memory", headers=_memory_headers(f))
    assert mem_resp.status_code == 200
    assert mem_resp.json()["data"]["current_state"]["entities"][entity_id]["cultivation_stage"] == "Đại Đấu Sư"

    def _extract_ctx_states(ctx_pkg):
        return {s["entity_id"]: s["state"] for s in ctx_pkg.current_states}

    ctx_no_ch = f.repo.get_structured_context(n, chapter_number=None)
    assert _extract_ctx_states(ctx_no_ch)[entity_id]["cultivation_stage"] == "Đại Đấu Sư"

    ctx_ch1 = f.repo.get_structured_context(n, chapter_number=1)
    assert _extract_ctx_states(ctx_ch1)[entity_id]["cultivation_stage"] == "Đại Đấu Sư"

    # 2. Fact F2 supersedes F1 with new value "Đấu Vương" and State Transition T2
    with f.engine.begin() as db:
        f2_id = _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            subject_entity_id=entity_id,
            fact_type="character_trait",
            fact_key="cultivation_stage",
            fact_value="Đấu Vương",
            source_type="AI",
            is_locked=is_locked,
            chapter_number=1,
            source_revision_id=f.src.revision_id,
            supersedes_id=f1_id,
        )
        _insert_transition(
            db,
            brain_id=brain_id,
            novel_id=n,
            entity_id=entity_id,
            attribute_key="cultivation_stage",
            new_value="Đấu Vương",
            fact_id=f2_id,
            sequence=20,
        )

    # Rebuild projection must succeed without OptimisticLockError, applying only effective F2 and T2
    rebuilt_state_2 = f.repo.rebuild_projection(n, brain_version)
    assert rebuilt_state_2["entities"][entity_id]["cultivation_stage"] == "Đấu Vương"

    mem_resp_2 = f.client.get(f"/v1/story-brains/{n}/memory", headers=_memory_headers(f))
    assert mem_resp_2.status_code == 200
    assert mem_resp_2.json()["data"]["current_state"]["entities"][entity_id]["cultivation_stage"] == "Đấu Vương"

    ctx_no_ch_2 = f.repo.get_structured_context(n, chapter_number=None)
    assert _extract_ctx_states(ctx_no_ch_2)[entity_id]["cultivation_stage"] == "Đấu Vương"

    ctx_ch1_2 = f.repo.get_structured_context(n, chapter_number=1)
    assert _extract_ctx_states(ctx_ch1_2)[entity_id]["cultivation_stage"] == "Đấu Vương"

    # Writing Service generation dispatch receives the updated projected entity state
    gen_resp = f.client.post(
        "/v1/writing/generations",
        headers=_memory_headers(f),
        json=request_body((f, service, provider, h)),
    )
    assert gen_resp.status_code == 202
    job = f.repo.get_writing_job(gen_resp.json()["data"]["job_id"])
    assert job.status == "completed" and len(provider.payloads) == 1
    pkg = provider.payloads[0]["context_package"]
    dispatched_states = {s["entity_id"]: s.get("state", {}) for s in pkg.get("current_states", [])}
    assert dispatched_states[entity_id]["cultivation_stage"] == "Đấu Vương"

    # 3. Fact F3 retirement: Fact F3 is retired with state transition T3
    with f.engine.begin() as db:
        f3_id = _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            subject_entity_id=entity_id,
            fact_type="character_trait",
            fact_key="sect",
            fact_value="Vân Lam Tông",
            source_type="AI",
            is_locked=True,
            is_retired=True,
            chapter_number=1,
            source_revision_id=f.src.revision_id,
        )
        _insert_transition(
            db,
            brain_id=brain_id,
            novel_id=n,
            entity_id=entity_id,
            attribute_key="sect",
            new_value="Vân Lam Tông",
            fact_id=f3_id,
            sequence=30,
        )

    # Rebuild projection: retired fact F3 and transition T3 must be omitted from projected state
    rebuilt_state_3 = f.repo.rebuild_projection(n, brain_version)
    assert "sect" not in rebuilt_state_3["entities"][entity_id]
    assert rebuilt_state_3["entities"][entity_id]["cultivation_stage"] == "Đấu Vương"

    mem_resp_3 = f.client.get(f"/v1/story-brains/{n}/memory", headers=_memory_headers(f))
    assert mem_resp_3.status_code == 200
    assert "sect" not in mem_resp_3.json()["data"]["current_state"]["entities"][entity_id]

    ctx_no_ch_3 = f.repo.get_structured_context(n, chapter_number=None)
    assert "sect" not in _extract_ctx_states(ctx_no_ch_3).get(entity_id, {})

    ctx_ch1_3 = f.repo.get_structured_context(n, chapter_number=1)
    assert "sect" not in _extract_ctx_states(ctx_ch1_3).get(entity_id, {})


def test_chapter_cutoff_and_tight_token_budget_never_resurrect_retired_locked_rules(rule_env):
    f, service, _, _, brain_id = rule_env
    n = f.src.novel_id
    with f.engine.begin() as db:
        retired_ids = [
            _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_key=f"mana_law_{idx}",
                fact_value=f"RETIRED_LOCKED_{idx}: Không được dịch chuyển trong kết giới cấp {idx}",
                is_locked=True,
                is_retired=True,
            )
            for idx in range(5)
        ]
        head_id = _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            fact_key="mana_law",
            fact_value="ACTIVE_LOCKED: Cho phép dịch chuyển khi có Phù Ấn",
            is_locked=True,
        )
        ch2_fact_id = _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            fact_key="ch2_secret",
            fact_value="CH2_FACT: Bí mật chỉ xuất hiện ở chương 2",
            source_type="AI",
            chapter_number=2,
        )
    repo_pkg = f.repo.get_structured_context(
        n, chapter_number=1, token_budget=380, enforce_token_budget=True
    )
    assert [r["id"] for r in repo_pkg.world_rules] == [head_id]
    assert repo_pkg.token_budget["locked_overflow"] is False
    for old_id in retired_ids:
        assert old_id not in repo_pkg.context_summary["fact_ids"]
    assert ch2_fact_id not in repo_pkg.context_summary["fact_ids"]
    preview_ch1 = service.preview_context(tenant_id=TENANT, story_id=n, chapter_number=1, token_budget=380)
    assert [r["id"] for r in preview_ch1.world_rules] == [head_id]
    assert "RETIRED_LOCKED_" not in json.dumps(asdict(preview_ch1), ensure_ascii=False)
    preview_ch2 = service.preview_context(tenant_id=TENANT, story_id=n, chapter_number=2, token_budget=1200)
    assert {r["id"] for r in preview_ch2.world_rules} == {head_id, ch2_fact_id}
    assert "RETIRED_LOCKED_" not in json.dumps(asdict(preview_ch2), ensure_ascii=False)


@pytest.mark.parametrize(
    "case",
    [
        "orphan_parent",
        "cycle_2",
        "cycle_3",
        "fork",
        "cross_novel_parent",
        "cross_tenant_parent",
        "cross_brain_parent",
        "unconfirmed_parent",
        "ai_source_successor",
        "model_suggestion_successor",
        "foreign_actor_successor",
        "null_actor_successor",
        "entity_bound_successor",
        "chapter_scoped_successor",
        "revision_bound_successor",
        "p1_trait_attached_to_setup_root",
        "retired_chain_leaf",
    ],
)
def test_malformed_or_unauthorized_rule_lineage_fails_closed(rule_env, case, caplog):
    f, service, provider, h, brain_id = rule_env
    n = f.src.novel_id
    other_brain = None
    with f.engine.begin() as db:
        if case == "orphan_parent":
            _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Orphan child",
                         supersedes_id=str(uuid.uuid4()))
        elif case in ("cycle_2", "cycle_3"):
            ids = [str(uuid.uuid4()) for _ in range(2 if case == "cycle_2" else 3)]
            _insert_fact(db, brain_id=brain_id, novel_id=n, fact_id=ids[0], fact_value="Node 0")
            for idx in range(1, len(ids)):
                _insert_fact(db, brain_id=brain_id, novel_id=n, fact_id=ids[idx],
                             fact_value=f"Node {idx}", supersedes_id=ids[idx - 1])
            db.execute(text("UPDATE narrative.facts SET supersedes_id=:last WHERE id=:first"),
                       {"first": ids[0], "last": ids[-1]})
        elif case == "fork":
            root_id = _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Root")
            _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Branch 1", supersedes_id=root_id)
            _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Branch 2", supersedes_id=root_id)
        elif case in ("cross_novel_parent", "cross_tenant_parent", "cross_brain_parent"):
            other_tenant = str(uuid.uuid4()) if case == "cross_tenant_parent" else TENANT
            other_novel = str(uuid.uuid4()) if case != "cross_tenant_parent" else n
            other_brain = str(uuid.uuid4())
            db.execute(
                text(
                    "INSERT INTO narrative.story_brains(id,tenant_id,novel_id,status,brain_version,schema_version,entity_guidance) "
                    "VALUES (:id,:t,:n,'draft',1,1,'{}'::jsonb)"
                ),
                {"id": other_brain, "t": other_tenant, "n": other_novel},
            )
            foreign_parent = _insert_fact(db, brain_id=other_brain, tenant_id=other_tenant,
                                          novel_id=other_novel, fact_value="Foreign parent rule")
            _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Child referencing foreign parent",
                         supersedes_id=foreign_parent)
        elif case == "unconfirmed_parent":
            root_id = _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Proposed root",
                                   confirmation_status="proposed")
            _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Confirmed child of proposed root",
                         supersedes_id=root_id)
        else:
            root_id = _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Root")
            child = dict(fact_value=f"Child {case}", supersedes_id=root_id)
            if case == "ai_source_successor":
                child["source_type"] = "AI"
            elif case == "model_suggestion_successor":
                child["source_type"] = "model_suggestion"
            elif case == "foreign_actor_successor":
                child["created_by"] = FOREIGN
            elif case == "null_actor_successor":
                child["created_by"] = None
            elif case in ("entity_bound_successor", "p1_trait_attached_to_setup_root"):
                child["subject_entity_id"] = str(db.execute(
                    text("SELECT id FROM narrative.entities WHERE novel_id=:n LIMIT 1"), {"n": n}
                ).scalar_one())
                if case == "p1_trait_attached_to_setup_root":
                    child.update(fact_type="character_trait", source_type="AI", chapter_number=1,
                                 source_revision_id=f.src.revision_id, created_by=None)
            elif case == "chapter_scoped_successor":
                child["chapter_number"] = 1
            elif case == "revision_bound_successor":
                child["source_revision_id"] = f.src.revision_id
            elif case == "retired_chain_leaf":
                child["is_retired"] = True
            else:
                raise AssertionError(case)
            _insert_fact(db, brain_id=brain_id, novel_id=n, **child)

    before = durable(f, f"p207d-malformed-{case}")
    try:
        _assert_all_consumers_fail_closed(
            f, service, provider, h, caplog, before, reason=UNVERIFIED_OR_MALFORMED
        )
    finally:
        if other_brain is not None:
            with f.engine.begin() as db:
                db.execute(text("DELETE FROM narrative.facts WHERE story_brain_id=:b"), {"b": other_brain})
                db.execute(text("DELETE FROM narrative.story_brains WHERE id=:b"), {"b": other_brain})


@pytest.mark.parametrize(
    "mutation",
    [
        "supersede_during_packing",
        "retire_during_packing",
        "mutate_value_during_packing",
        "fork_during_packing",
    ],
)
def test_rule_lineage_context_to_dispatch_fence(rule_env, mutation, caplog):
    f, service, provider, h, brain_id = rule_env
    n = f.src.novel_id
    with f.engine.begin() as db:
        root_id = _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            fact_key="barrier_teleport",
            fact_value="Initial approved rule before packing",
            is_locked=True,
        )

    job = service.start_generation(
        tenant_id=TENANT,
        process_inline=False,
        **request_body((f, service, provider, h)),
    )
    original_preview = service.preview_context
    snapshot_after_mutation = {}

    def mutate_after_preview(**kwargs):
        pkg = original_preview(**kwargs)
        with f.engine.begin() as db:
            if mutation == "supersede_during_packing":
                _insert_fact(
                    db,
                    brain_id=brain_id,
                    novel_id=n,
                    fact_key="barrier_teleport",
                    fact_value="Amended rule inserted before dispatch",
                    is_locked=True,
                    supersedes_id=root_id,
                )
            elif mutation == "retire_during_packing":
                db.execute(
                    text("UPDATE narrative.facts SET is_retired=true WHERE id=:id"),
                    {"id": root_id},
                )
            elif mutation == "mutate_value_during_packing":
                db.execute(
                    text("UPDATE narrative.facts SET fact_value='\"Tampered value\"'::jsonb WHERE id=:id"),
                    {"id": root_id},
                )
            elif mutation == "fork_during_packing":
                _insert_fact(
                    db,
                    brain_id=brain_id,
                    novel_id=n,
                    fact_key="barrier_teleport",
                    fact_value="Fork branch 1",
                    supersedes_id=root_id,
                )
                _insert_fact(
                    db,
                    brain_id=brain_id,
                    novel_id=n,
                    fact_key="barrier_teleport",
                    fact_value="Fork branch 2",
                    supersedes_id=root_id,
                )
        snapshot_after_mutation.update(durable(f, f"p207d-fence-{mutation}"))
        return pkg

    service.preview_context = mutate_after_preview
    result = service.process_generation(job.job_id)
    assert_blocked(result, provider, caplog)
    _assert_canon_unchanged(f, snapshot_after_mutation)


@pytest.mark.parametrize("tamper", ["supersede_ bump_version", "retire_rule"])
def test_m0_activation_remains_strict_when_setup_rule_is_superseded_or_retired_pre_activation(
    owned, tamper
):
    f = owned
    job, body = ready(f)
    with f.engine.begin() as db:
        rule_row = db.execute(
            text(
                "SELECT id, story_brain_id FROM narrative.facts "
                "WHERE novel_id=:n AND fact_type='world_rule' LIMIT 1"
            ),
            {"n": f.src.novel_id},
        ).mappings().one()
        if tamper == "supersede_ bump_version":
            _insert_fact(
                db,
                brain_id=str(rule_row["story_brain_id"]),
                novel_id=f.src.novel_id,
                fact_key="gravity",
                fact_value="Amended before M0 activation",
                supersedes_id=str(rule_row["id"]),
            )
            db.execute(
                text("UPDATE narrative.story_brains SET brain_version=brain_version+1 WHERE novel_id=:n"),
                {"n": f.src.novel_id},
            )
        else:
            db.execute(
                text("UPDATE narrative.facts SET is_retired=true WHERE id=:id"),
                {"id": str(rule_row["id"])},
            )

    before = m0_state(f, f"m0-p207d-before-{tamper}")
    with pytest.raises(BootstrapConflictError):
        activate(f, job, body)
    assert m0_state(f, f"m0-p207d-after-{tamper}") == before
    assert f.llm.calls == 0

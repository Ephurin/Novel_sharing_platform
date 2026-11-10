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
def test_valid_world_rule_chains_unlocked_and_locked_parity(
    rule_env, hops, parent_locked, head_locked, parent_retired
):
    f, service, provider, h, brain_id = rule_env
    n = f.src.novel_id
    with f.engine.begin() as db:
        root_id = _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            fact_key="barrier_teleport",
            fact_value="OBSOLETE_ROOT: Cấm dịch chuyển trong kết giới phong tỏa",
            source_type="model_suggestion",
            is_locked=parent_locked,
            is_retired=parent_retired,
        )
        prev_id = root_id
        mid_id = None
        if hops == 3:
            mid_id = _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_key="barrier_teleport",
                fact_value="OBSOLETE_MID: Không thể dịch chuyển trong kết giới cấp cao",
                source_type="author_setup",
                is_locked=parent_locked,
                is_retired=parent_retired,
                supersedes_id=root_id,
            )
            prev_id = mid_id
        head_id = _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            fact_key="barrier_teleport",
            fact_value="EFFECTIVE_HEAD: Trong kết giới phong tỏa cho phép dịch chuyển bằng Phù Ấn Cổ",
            source_type="author_setup",
            is_locked=head_locked,
            is_retired=False,
            supersedes_id=prev_id,
        )
        independent_id = _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            fact_key="alchemy_fire",
            fact_value="ACTIVE_INDEPENDENT: Luyện đan tam phẩm cần đan hỏa",
            source_type="author_setup",
            is_locked=True,
            is_retired=False,
        )

    before = durable(f, f"p207d-chain-{hops}-{parent_locked}-{head_locked}-{parent_retired}")

    # 1. Approved Memory readback
    mem_resp = f.client.get(f"/v1/story-brains/{n}/memory", headers=_memory_headers(f))
    assert mem_resp.status_code == 200, mem_resp.text
    mem_facts = mem_resp.json()["data"]["facts"]
    assert {item["fact_id"] for item in mem_facts} == {head_id, independent_id}
    assert len(mem_facts) == 2
    mem_dump = json.dumps(mem_facts, ensure_ascii=False)
    assert "OBSOLETE_ROOT" not in mem_dump
    assert "OBSOLETE_MID" not in mem_dump
    assert "EFFECTIVE_HEAD" in mem_dump

    # 2. Repository get_structured_context & WritingService.preview_context HTTP endpoint
    repo_ctx = f.repo.get_structured_context(n, chapter_number=1)
    assert {item["id"] for item in repo_ctx.world_rules} == {head_id, independent_id}
    assert len(repo_ctx.world_rules) == 2
    if not head_locked:
        assert [item["id"] for item in repo_ctx.world_rules] == [independent_id, head_id]
    ctx_resp = f.client.get(
        f"/v1/story-brains/{n}/context-preview?chapter_number=1",
        headers=_memory_headers(f),
    )
    assert ctx_resp.status_code == 200, ctx_resp.text
    ctx_data = ctx_resp.json()["data"]
    assert {item["id"] for item in ctx_data["world_rules"]} == {head_id, independent_id}
    assert set(ctx_data["context_summary"]["fact_ids"]) == {head_id, independent_id}
    assert root_id not in ctx_data["context_summary"]["fact_ids"]
    if mid_id:
        assert mid_id not in ctx_data["context_summary"]["fact_ids"]

    # 3. Writing generation worker + RecordingProvider + _validate_draft consistency check
    gen_resp = f.client.post(
        "/v1/writing/generations",
        headers=_memory_headers(f),
        json=request_body((f, service, provider, h)),
    )
    assert gen_resp.status_code == 202, gen_resp.text
    job = f.repo.get_writing_job(gen_resp.json()["data"]["job_id"])
    assert job.status == "completed"
    # Superseded locked rule ("Cấm dịch chuyển trong kết giới phong tỏa") must NOT trigger WORLD_RULE_VIOLATION!
    assert job.validation_status == "passed", [asdict(v) for v in job.validations]
    assert len(provider.payloads) == 1
    dispatched_str = json.dumps(provider.payloads[0]["context_package"], ensure_ascii=False)
    assert "OBSOLETE_ROOT" not in dispatched_str
    assert "OBSOLETE_MID" not in dispatched_str
    assert "EFFECTIVE_HEAD" in dispatched_str
    assert "P207DPrivateOnly" not in dispatched_str

    _assert_canon_unchanged(f, before)


def test_chapter_cutoff_and_tight_token_budget_never_resurrect_superseded_or_retired_rules(rule_env):
    f, service, _, _, brain_id = rule_env
    n = f.src.novel_id
    with f.engine.begin() as db:
        # 5 superseded locked predecessors that would overflow a 420-token budget if not excluded
        prev_id = None
        superseded_ids = []
        for idx in range(5):
            fid = _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_key="mana_law",
                fact_value=f"SUPERSEDED_LOCKED_{idx}: Không được dịch chuyển trong kết giới cấp {idx}",
                source_type="author_setup",
                is_locked=True,
                is_retired=(idx % 2 == 0),
                supersedes_id=prev_id,
            )
            superseded_ids.append(fid)
            prev_id = fid
        head_id = _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            fact_key="mana_law",
            fact_value="EFFECTIVE_LOCKED_HEAD: Cho phép dịch chuyển khi có Phù Ấn",
            source_type="author_setup",
            is_locked=True,
            is_retired=False,
            supersedes_id=prev_id,
        )
        ch2_fact_id = _insert_fact(
            db,
            brain_id=brain_id,
            novel_id=n,
            fact_key="ch2_secret",
            fact_value="CH2_FACT: Bí mật chỉ xuất hiện ở chương 2",
            source_type="AI",
            chapter_number=2,
            is_locked=False,
        )

    # Repo-level tight budget + chapter_number=1 cutoff
    repo_pkg = f.repo.get_structured_context(
        n, chapter_number=1, token_budget=380, enforce_token_budget=True
    )
    assert [r["id"] for r in repo_pkg.world_rules] == [head_id]
    assert repo_pkg.token_budget["locked_overflow"] is False
    for old_id in superseded_ids:
        assert old_id not in repo_pkg.context_summary["fact_ids"]
    assert ch2_fact_id not in repo_pkg.context_summary["fact_ids"]

    # Application-level ContextBudgetPacker preview at chapter 1 and chapter 2
    preview_ch1 = service.preview_context(
        tenant_id=TENANT, story_id=n, chapter_number=1, token_budget=380
    )
    assert [r["id"] for r in preview_ch1.world_rules] == [head_id]
    assert "SUPERSEDED_LOCKED_" not in json.dumps(asdict(preview_ch1), ensure_ascii=False)

    preview_ch2 = service.preview_context(
        tenant_id=TENANT, story_id=n, chapter_number=2, token_budget=1200
    )
    assert {r["id"] for r in preview_ch2.world_rules} == {head_id, ch2_fact_id}
    assert "SUPERSEDED_LOCKED_" not in json.dumps(asdict(preview_ch2), ensure_ascii=False)


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
        "unconfirmed_successor",
        "unconfirmed_parent",
        "ai_source_successor",
        "model_suggestion_successor",
        "foreign_actor_successor",
        "null_actor_successor",
        "entity_bound_successor",
        "chapter_scoped_successor",
        "revision_bound_successor",
        "retired_standalone_leaf",
        "retired_chain_leaf",
    ],
)
def test_malformed_or_unauthorized_rule_lineage_fails_closed(rule_env, case, caplog):
    f, service, provider, h, brain_id = rule_env
    n = f.src.novel_id
    with f.engine.begin() as db:
        if case == "orphan_parent":
            _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_value="Orphan child",
                supersedes_id=str(uuid.uuid4()),
            )
        elif case == "cycle_2":
            id_a, id_b = str(uuid.uuid4()), str(uuid.uuid4())
            _insert_fact(db, brain_id=brain_id, novel_id=n, fact_id=id_a, fact_value="Node A")
            _insert_fact(
                db, brain_id=brain_id, novel_id=n, fact_id=id_b, fact_value="Node B", supersedes_id=id_a
            )
            db.execute(
                text("UPDATE narrative.facts SET supersedes_id=:b WHERE id=:a"),
                {"a": id_a, "b": id_b},
            )
        elif case == "cycle_3":
            id_a, id_b, id_c = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
            _insert_fact(db, brain_id=brain_id, novel_id=n, fact_id=id_a, fact_value="Node A")
            _insert_fact(
                db, brain_id=brain_id, novel_id=n, fact_id=id_b, fact_value="Node B", supersedes_id=id_a
            )
            _insert_fact(
                db, brain_id=brain_id, novel_id=n, fact_id=id_c, fact_value="Node C", supersedes_id=id_b
            )
            db.execute(
                text("UPDATE narrative.facts SET supersedes_id=:c WHERE id=:a"),
                {"a": id_a, "c": id_c},
            )
        elif case == "fork":
            root_id = _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Root")
            _insert_fact(
                db, brain_id=brain_id, novel_id=n, fact_value="Branch 1", supersedes_id=root_id
            )
            _insert_fact(
                db, brain_id=brain_id, novel_id=n, fact_value="Branch 2", supersedes_id=root_id
            )
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
            foreign_parent = _insert_fact(
                db,
                brain_id=other_brain,
                tenant_id=other_tenant,
                novel_id=other_novel,
                fact_value="Foreign parent rule",
            )
            _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_value="Child referencing foreign parent",
                supersedes_id=foreign_parent,
            )
        elif case == "unconfirmed_successor":
            root_id = _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Root")
            _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_value="Proposed child",
                confirmation_status="proposed",
                supersedes_id=root_id,
            )
        elif case == "unconfirmed_parent":
            root_id = _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_value="Proposed root",
                confirmation_status="proposed",
            )
            _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_value="Confirmed child of proposed root",
                supersedes_id=root_id,
            )
        elif case == "ai_source_successor":
            root_id = _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Root")
            _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_value="AI hijack child",
                source_type="AI",
                supersedes_id=root_id,
            )
        elif case == "model_suggestion_successor":
            root_id = _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Root")
            _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_value="Unreviewed model suggestion child",
                source_type="model_suggestion",
                supersedes_id=root_id,
            )
        elif case == "foreign_actor_successor":
            root_id = _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Root")
            _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_value="Foreign actor child",
                created_by=FOREIGN,
                supersedes_id=root_id,
            )
        elif case == "null_actor_successor":
            root_id = _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Root")
            _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_value="Null actor child",
                created_by=None,
                supersedes_id=root_id,
            )
        elif case == "entity_bound_successor":
            root_id = _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Root")
            entity_id = db.execute(
                text("SELECT id FROM narrative.entities WHERE novel_id=:n LIMIT 1"),
                {"n": n},
            ).scalar_one()
            _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                subject_entity_id=str(entity_id),
                fact_value="Entity-bound child",
                supersedes_id=root_id,
            )
        elif case == "chapter_scoped_successor":
            root_id = _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Root")
            _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                chapter_number=1,
                fact_value="Chapter-scoped child",
                supersedes_id=root_id,
            )
        elif case == "revision_bound_successor":
            root_id = _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Root")
            _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                source_revision_id=f.src.revision_id,
                fact_value="Revision-bound child",
                supersedes_id=root_id,
            )
        elif case == "retired_standalone_leaf":
            _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_value="Retired standalone rule without successor",
                is_retired=True,
            )
        elif case == "retired_chain_leaf":
            root_id = _insert_fact(db, brain_id=brain_id, novel_id=n, fact_value="Root")
            _insert_fact(
                db,
                brain_id=brain_id,
                novel_id=n,
                fact_value="Retired leaf without successor",
                supersedes_id=root_id,
                is_retired=True,
            )
        else:
            raise AssertionError(case)

    before = durable(f, f"p207d-malformed-{case}")

    try:
        # 1. Approved Memory fails closed with 409 INVALID_CANON_HISTORY
        mem_resp = f.client.get(f"/v1/story-brains/{n}/memory", headers=_memory_headers(f))
        assert mem_resp.status_code == 409, mem_resp.text
        assert mem_resp.json()["detail"]["code"] == "INVALID_CANON_HISTORY"

        # 2. Context preview fails closed with 409 INVALID_CANON_HISTORY
        ctx_resp = f.client.get(
            f"/v1/story-brains/{n}/context-preview?chapter_number=1",
            headers=_memory_headers(f),
        )
        assert ctx_resp.status_code == 409, ctx_resp.text
        assert ctx_resp.json()["detail"]["code"] == "INVALID_CANON_HISTORY"
        assert "P207DPrivateOnly" not in ctx_resp.text

        # 3. Writing generation worker fails closed with WRITING_CONTEXT_AUTHORITY_DENIED and 0 LLM calls
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
    finally:
        if case in ("cross_novel_parent", "cross_tenant_parent", "cross_brain_parent"):
            with f.engine.begin() as db:
                db.execute(
                    text("DELETE FROM narrative.facts WHERE novel_id=:n"),
                    {"n": n},
                )
                db.execute(
                    text("DELETE FROM narrative.story_brains WHERE id=:b"),
                    {"b": other_brain},
                )


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

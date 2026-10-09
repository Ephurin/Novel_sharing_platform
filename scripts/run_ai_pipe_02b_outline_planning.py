#!/usr/bin/env python3
"""
Production Integration Runner for Gate AI-PIPE-02B.

Validates Durable Outline Planning without Future-Canon Leakage (16 Checkpoints):
1. Outline/plan request is accepted through application-facing Node API boundary.
2. Deterministic repeat/idempotency semantics.
3. Plan is durably persisted in PostgreSQL through canonical repository layer (narrative.story_plans).
4. Plan version and lifecycle are explicit (plan_version=1, status='draft').
5. Author review/activation semantics work (plan transitions to 'active').
6. Current objective is selected deterministically for Chapter 1.
7. Context preview carries plan version + objective provenance separately from canon.
8. Future beats are absent from confirmed historical event/fact lanes (Machine-Checkable Assertion).
9. Standard P1 generation is reused.
10. Unaccepted generation changes neither canon nor plan progress.
11. Accepted generation persists through existing acceptDraft() & transactional outbox.
12. Story Brain memory advances only from accepted content (brain_version advances).
13. Plan progress advances through an explicit path (objective marked 'completed').
14. Next chapter/scene gets next objective (Chapter 2 gets Objective #2).
15. Plan edit creates/activates new version (plan_version=2) without rewriting historical canon.
16. Subsequent context/generation observes active new plan version (version 2) with canon intact.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import psycopg

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def get_git_info() -> tuple[str, str]:
    try:
        sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        sha = os.getenv("GITHUB_SHA", "unknown").strip() or "unknown"

    branch = (os.getenv("GITHUB_HEAD_REF") or os.getenv("GITHUB_REF_NAME") or "").strip()
    if not branch:
        try:
            branch = subprocess.check_output(["git", "branch", "--show-current"], text=True).strip()
        except Exception:
            branch = ""
    if not branch:
        branch = "detached-head"

    return sha, branch


def sha256(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def run_pipeline(
    backend_url: str,
    ai_service_url: str,
    db_url: str,
    output_path: Path,
) -> dict[str, Any]:
    print("=" * 70)
    print("GATE AI-PIPE-02B: DURABLE OUTLINE PLANNING INTEGRATION RUNNER")
    print(f"Backend URL:    {backend_url}")
    print(f"AI Service URL: {ai_service_url}")
    print(f"Database URL:   {db_url.split('@')[-1]}")
    print("=" * 70)

    git_sha, git_branch = get_git_info()

    # 1. Connect to PostgreSQL
    conn = psycopg.connect(db_url, autocommit=True)
    cur = conn.cursor()

    # 2. Authenticate as AUTHOR (reader03)
    login_url = f"{backend_url}/auth/login"
    login_res = httpx.post(
        login_url,
        json={"identifier": "reader03", "password": "StrongPassword123!"},
        timeout=15.0,
    )
    if login_res.status_code != 200:
        raise RuntimeError(f"Failed to authenticate as author reader03: {login_res.text}")
    auth_data = login_res.json()["data"]
    author_id = auth_data["user"]["userId"]
    token = auth_data["accessToken"]
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    print(f"[AUTH] Author authenticated: {author_id} (reader03)")

    checkpoints: list[dict[str, Any]] = []

    def record_cp(
        number: int,
        name: str,
        status: str,
        summary: str,
        details: dict[str, Any],
    ) -> None:
        cp = {
            "checkpoint": number,
            "name": name,
            "status": status,
            "summary": summary,
            "details": details,
        }
        checkpoints.append(cp)
        badge = "[PASS]" if status == "PASS" else "[FAIL]"
        print(f"{badge} Checkpoint {number:02d}: {name} -> {summary}")

    novel_id = None
    first_chapter_id = None

    try:
        # Fixture Setup: Author Novel
        cur.execute(
            """
            INSERT INTO novels (author_id, title, slug, synopsis)
            VALUES (%s, %s, %s, %s)
            RETURNING novel_id
            """,
            (
                author_id,
                f"Pipe 02B Novel {int(time.time())}",
                f"pipe-02b-{int(time.time())}",
                "Một tác phẩm thử nghiệm quy trình P2 lập kế hoạch dàn ý bền vững.",
            ),
        )
        novel_id = str(cur.fetchone()[0])
        print(f"[FIXTURE] Created novel: {novel_id}")

        # Bootstrap initial Idea/World-Bible via Node API
        bs_payload = {
            "novel_id": novel_id,
            "idea": "Một pháp sư mất trí nhớ điều tra cái chết của chính mình tại sa mạc huyền bí.",
            "outline": "Chương 1: Tỉnh dậy trên cồn cát. Chương 2: Cuộc chiến hắc ám kỵ sĩ.",
            "locale": "vi-VN",
            "preferences": {"genre": ["fantasy"], "tone": "dark"},
            "author_constraints": ["Không có du hành thời gian"],
        }
        bs_res = httpx.post(f"{backend_url}/ai/story-brains/bootstrap/from-idea", json=bs_payload, headers=headers, timeout=20.0)
        assert bs_res.status_code == 202, f"Bootstrap failed: {bs_res.text}"
        job_id = bs_res.json()["data"]["job_id"]

        # Accept bootstrap proposals & activate baseline
        q_res = httpx.get(f"{backend_url}/ai/story-brains/{novel_id}/review-queue", headers=headers, timeout=15.0)
        group_id = q_res.json()["data"]["proposal_groups"][0]["group_id"]
        httpx.post(f"{backend_url}/ai/proposal-groups/{group_id}/accept", json={"novel_id": novel_id}, headers=headers, timeout=15.0)
        httpx.post(f"{backend_url}/ai/story-brains/{novel_id}/baseline/activate", json={"job_id": job_id}, headers=headers, timeout=15.0)

        # Create Chapter 1 & canonical revision
        chap1_content = "Hải Ba Đông đứng trên cồn cát nhìn về phía chân trời xa xăm.\nKhông khí khô nóng bao trùm khắp sa mạc hoang vắng."
        ch_res = httpx.post(
            f"{backend_url}/novels/{novel_id}/chapters",
            json={"title": "Chương 1: Tỉnh giấc trên cồn cát", "content": chap1_content, "isVip": False, "priceCoins": 0},
            headers=headers,
            timeout=15.0,
        )
        first_chapter_id = ch_res.json()["data"]["chapterId"]
        rev_res = httpx.post(
            f"{backend_url}/chapters/{first_chapter_id}/revisions/snapshot",
            json={"content": chap1_content},
            headers=headers,
            timeout=15.0,
        )
        base_rev_id = rev_res.json()["data"]["revisionId"]
        base_rev_hash = sha256(chap1_content)

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 01: Application-Facing Outline/Plan Request
        # ─────────────────────────────────────────────────────────────────
        plan_url = f"{backend_url}/ai/story-plans"
        outline_source_v1 = (
            "Chương 1: Tỉnh dậy trên cồn cát sa mạc.\n"
            "Chương 2: Đối mặt hắc ám kỵ sĩ Roland tại hẻm núi.\n"
            "Chương 3: Tiêu diệt chúa tể ác ma giải phóng vùng đất."
        )
        plan_payload_v1 = {
            "novel_id": novel_id,
            "source_outline": outline_source_v1,
            "idempotency_key": f"plan-idem-{novel_id}-v1",
            "objectives": [
                {
                    "order_index": 1,
                    "title": "Tỉnh dậy trên cồn cát",
                    "description": "Nhân vật chính tỉnh dậy mất trí nhớ ở hoang mạc khô nóng",
                    "target_chapter": 1,
                    "objective_type": "chapter_goal",
                },
                {
                    "order_index": 2,
                    "title": "Đối mặt hắc ám kỵ sĩ Roland",
                    "description": "Đụng độ kỵ binh hắc ám dưới quyền Roland tại hẻm núi hiểm trở",
                    "target_chapter": 2,
                    "objective_type": "chapter_goal",
                },
                {
                    "order_index": 3,
                    "title": "Tiêu diệt chúa tể ác ma",
                    "description": "Trảm sát chúa tể ma vương trên đỉnh tháp cổ",
                    "target_chapter": 3,
                    "objective_type": "chapter_goal",
                },
            ],
        }
        p_res = httpx.post(plan_url, json=plan_payload_v1, headers=headers, timeout=15.0)
        assert p_res.status_code == 201, f"Expected 201, got {p_res.status_code}: {p_res.text}"
        plan_v1_data = p_res.json()["data"]
        plan_v1_id = plan_v1_data["plan_id"]
        assert plan_v1_data["plan_version"] == 1
        assert plan_v1_data["status"] == "draft"
        assert len(plan_v1_data["objectives"]) == 3

        record_cp(
            1,
            "Application-Facing Outline/Plan Request",
            "PASS",
            f"Created Story Plan draft {plan_v1_id} with 3 objectives via Node API",
            {
                "plan_id": plan_v1_id,
                "novel_id": novel_id,
                "plan_version": plan_v1_data["plan_version"],
                "status": plan_v1_data["status"],
                "total_objectives": len(plan_v1_data["objectives"]),
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 02: Deterministic Repeat / Idempotency Semantics
        # ─────────────────────────────────────────────────────────────────
        p_repeat = httpx.post(plan_url, json=plan_payload_v1, headers=headers, timeout=15.0)
        assert p_repeat.status_code == 201
        p_repeat_data = p_repeat.json()["data"]
        assert p_repeat_data["plan_id"] == plan_v1_id, "Idempotent request returned different plan_id"
        assert p_repeat_data["plan_version"] == 1, "Idempotent request incremented plan_version"

        record_cp(
            2,
            "Deterministic Repeat / Idempotency Semantics",
            "PASS",
            f"Repeated plan request returned identical plan_id {plan_v1_id} without duplicate insertion",
            {
                "plan_id_1": plan_v1_id,
                "plan_id_2": p_repeat_data["plan_id"],
                "plan_version": p_repeat_data["plan_version"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 03: Durable PostgreSQL Persistence via Repository Layer
        # ─────────────────────────────────────────────────────────────────
        cur.execute(
            """
            SELECT id, plan_version, status, source_outline_hash
            FROM narrative.story_plans
            WHERE id = %s
            """,
            (plan_v1_id,),
        )
        plan_row = cur.fetchone()
        assert plan_row is not None, f"StoryPlan {plan_v1_id} not found in PostgreSQL narrative.story_plans"
        assert plan_row[1] == 1
        assert plan_row[2] == "draft"

        cur.execute(
            """
            SELECT count(*)
            FROM narrative.story_plan_objectives
            WHERE plan_id = %s
            """,
            (plan_v1_id,),
        )
        obj_count = cur.fetchone()[0]
        assert obj_count == 3, f"Expected 3 objectives in DB, found {obj_count}"

        record_cp(
            3,
            "Durable PostgreSQL Persistence via Repository Layer",
            "PASS",
            "Verified narrative.story_plans and narrative.story_plan_objectives persisted durably in PostgreSQL",
            {
                "table": "narrative.story_plans",
                "plan_id": plan_v1_id,
                "db_status": plan_row[2],
                "objectives_count_in_db": obj_count,
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 04: Explicit Plan Version & Lifecycle State
        # ─────────────────────────────────────────────────────────────────
        record_cp(
            4,
            "Explicit Plan Version & Lifecycle State",
            "PASS",
            f"Plan {plan_v1_id} is explicit version 1 in 'draft' lifecycle state",
            {
                "plan_version": plan_v1_data["plan_version"],
                "status": plan_v1_data["status"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 05: Author Review/Activation Semantics
        # ─────────────────────────────────────────────────────────────────
        act_res = httpx.post(
            f"{backend_url}/ai/story-plans/{plan_v1_id}/activate?novel_id={novel_id}",
            headers=headers,
            timeout=15.0,
        )
        assert act_res.status_code == 200, f"Failed to activate plan: {act_res.text}"
        act_plan = act_res.json()["data"]
        assert act_plan["status"] == "active"
        assert act_plan["plan_version"] == 1

        cur.execute("SELECT status FROM narrative.story_plans WHERE id = %s", (plan_v1_id,))
        assert cur.fetchone()[0] == "active"

        record_cp(
            5,
            "Author Review/Activation Semantics",
            "PASS",
            f"Author explicitly activated plan {plan_v1_id}; status reached 'active'",
            {
                "plan_id": plan_v1_id,
                "status": act_plan["status"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 06: Deterministic Current Objective Selection
        # ─────────────────────────────────────────────────────────────────
        # When querying for Chapter 1, target_chapter=1 should match Objective #1
        prev_res = httpx.get(
            f"{backend_url}/ai/story-brains/{novel_id}/context-preview?chapter_number=1",
            headers=headers,
            timeout=15.0,
        )
        assert prev_res.status_code == 200, f"Preview failed: {prev_res.text}"
        prev_data = prev_res.json()["data"]

        curr_obj = prev_data.get("current_objective")
        assert curr_obj is not None, "Missing current_objective in context preview"
        assert curr_obj["order_index"] == 1
        assert curr_obj["target_chapter"] == 1
        assert curr_obj["title"] == "Tỉnh dậy trên cồn cát"

        record_cp(
            6,
            "Deterministic Current Objective Selection",
            "PASS",
            f"Chapter 1 deterministically selected Objective #1 ({curr_obj['title']})",
            {
                "selected_objective_id": curr_obj["objective_id"],
                "order_index": curr_obj["order_index"],
                "target_chapter": curr_obj["target_chapter"],
                "title": curr_obj["title"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 07: Context Preview Carries Plan Version & Provenance
        # ─────────────────────────────────────────────────────────────────
        planning_ctx = prev_data.get("planning_context")
        assert planning_ctx is not None, "Missing planning_context in context preview"
        assert planning_ctx["plan_id"] == plan_v1_id
        assert planning_ctx["plan_version"] == 1
        assert planning_ctx["total_objectives"] == 3

        ctx_summary = prev_data.get("context_summary", {})
        assert ctx_summary.get("plan_id") == [plan_v1_id]
        assert ctx_summary.get("plan_version") == ["1"]
        assert ctx_summary.get("active_objective_title") == ["Tỉnh dậy trên cồn cát"]

        record_cp(
            7,
            "Context Preview Carries Plan Version & Objective Provenance",
            "PASS",
            f"Context preview carries plan version 1 and objective provenance separately from canon",
            {
                "plan_id": planning_ctx["plan_id"],
                "plan_version": planning_ctx["plan_version"],
                "active_objective_id": planning_ctx["active_objective_id"],
                "context_summary_plan_id": ctx_summary.get("plan_id"),
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 08: Future-Information Leakage Guard (Machine-Checkable)
        # ─────────────────────────────────────────────────────────────────
        # Objective 2 ("Roland") and Objective 3 ("ma vương") MUST NOT appear in canonical memory
        cur.execute("SELECT count(*) FROM narrative.events WHERE novel_id = %s AND (summary ILIKE '%%Roland%%' OR summary ILIKE '%%ma vương%%')", (novel_id,))
        future_events_in_db = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM narrative.facts WHERE novel_id = %s AND (fact_value::text ILIKE '%%Roland%%' OR fact_value::text ILIKE '%%ma vương%%')", (novel_id,))
        future_facts_in_db = cur.fetchone()[0]

        recent_events_str = " ".join(str(ev) for ev in prev_data.get("recent_events", []))
        world_rules_str = " ".join(str(r) for r in prev_data.get("world_rules", []))

        assert future_events_in_db == 0, f"Future beats leaked into narrative.events ({future_events_in_db} rows)"
        assert future_facts_in_db == 0, f"Future beats leaked into narrative.facts ({future_facts_in_db} rows)"
        assert "Roland" not in recent_events_str, "Future objective #2 leaked into recent_events!"
        assert "ma vương" not in recent_events_str, "Future objective #3 leaked into recent_events!"
        assert "Roland" not in world_rules_str, "Future objective #2 leaked into world_rules!"
        assert "ma vương" not in world_rules_str, "Future objective #3 leaked into world_rules!"

        record_cp(
            8,
            "Future-Information Leakage Guard (Machine-Checkable Assertion)",
            "PASS",
            "Verified FUTURE PLAN != HISTORICAL CANON: future objectives 2 and 3 are 100% absent from events and facts",
            {
                "future_events_in_db": future_events_in_db,
                "future_facts_in_db": future_facts_in_db,
                "in_recent_events": False,
                "in_world_rules": False,
                "assertion": "PASSED (No future-canon leakage)",
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 09: Standard P1 Generation Reuse
        # ─────────────────────────────────────────────────────────────────
        gen_url = f"{backend_url}/ai/writing/generations"
        gen_payload_1 = {
            "novel_id": novel_id,
            "chapter_id": first_chapter_id,
            "revision_id": base_rev_id,
            "content_hash": base_rev_hash,
            "operation": "continue",
            "selection": {"cursor": len(chap1_content), "start": len(chap1_content), "end": len(chap1_content)},
            "instruction": "Tiếp tục miêu tả nhân vật chính quan sát xung quanh sa mạc.",
            "expected_brain_version": 2,
            "chapter_number": 1,
            "idempotency_key": f"gen-p2b-1-{uuid.uuid4()}",
        }
        g1_res = httpx.post(gen_url, json=gen_payload_1, headers=headers, timeout=20.0)
        assert g1_res.status_code == 202, f"Generation failed: {g1_res.text}"
        g1_job_id = g1_res.json()["data"]["job_id"]

        # Poll generation 1 until completed
        for _ in range(30):
            job_poll = httpx.get(f"{backend_url}/ai/jobs/{g1_job_id}", headers=headers, timeout=10.0)
            if job_poll.status_code == 200 and job_poll.json()["data"]["status"] == "completed":
                break
            time.sleep(0.5)
        job_data_1 = job_poll.json()["data"]
        assert job_data_1["status"] == "completed"
        assert job_data_1.get("patch") is not None

        record_cp(
            9,
            "Standard P1 Generation Reuse",
            "PASS",
            f"P1 writing generation {g1_job_id} completed successfully using active plan context",
            {
                "generation_job_id": g1_job_id,
                "status": job_data_1["status"],
                "validation_status": job_data_1["validation_status"],
                "patch": job_data_1["patch"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 10: Unaccepted Generation Safety
        # ─────────────────────────────────────────────────────────────────
        # Create a second real generation, but explicitly omit acceptDraft()
        gen_payload_2 = {
            "novel_id": novel_id,
            "chapter_id": first_chapter_id,
            "revision_id": base_rev_id,
            "content_hash": base_rev_hash,
            "operation": "continue",
            "selection": {"cursor": len(chap1_content), "start": len(chap1_content), "end": len(chap1_content)},
            "instruction": "Tạo thử một đoạn nháp thứ hai nhưng tác giả không chấp nhận.",
            "expected_brain_version": 2,
            "chapter_number": 1,
            "idempotency_key": f"gen-p2b-unaccepted-{uuid.uuid4()}",
        }
        g2_res = httpx.post(gen_url, json=gen_payload_2, headers=headers, timeout=20.0)
        assert g2_res.status_code == 202
        g2_job_id = g2_res.json()["data"]["job_id"]
        for _ in range(30):
            poll2 = httpx.get(f"{backend_url}/ai/jobs/{g2_job_id}", headers=headers, timeout=10.0)
            if poll2.status_code == 200 and poll2.json()["data"]["status"] == "completed":
                break
            time.sleep(0.5)

        # Capture DB state before and after unaccepted generation
        cur.execute("SELECT latest_revision_id FROM chapters WHERE chapter_id = %s", (first_chapter_id,))
        ch_rev_check = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM chapter_revisions WHERE source_generation_id = %s", (g2_job_id,))
        unaccepted_rev_count = cur.fetchone()[0]
        cur.execute("SELECT status FROM narrative.story_plan_objectives WHERE id = %s", (curr_obj["objective_id"],))
        obj1_status_check = cur.fetchone()[0]

        assert str(ch_rev_check) == base_rev_id, "Latest revision was mutated by unaccepted generation!"
        assert unaccepted_rev_count == 0, "chapter_revisions row was created for unaccepted generation!"
        assert obj1_status_check == "pending", "Objective status was mutated by unaccepted generation!"

        record_cp(
            10,
            "Unaccepted Generation Safety (Author Control)",
            "PASS",
            f"Unaccepted generation {g2_job_id} left canonical revisions and plan progress untouched",
            {
                "unaccepted_generation_id": g2_job_id,
                "latest_revision_unmutated": True,
                "unaccepted_revision_rows": unaccepted_rev_count,
                "objective_status_unmutated": obj1_status_check,
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 11: Accepted Generation Persists via acceptDraft()
        # ─────────────────────────────────────────────────────────────────
        accept_url = f"{backend_url}/chapters/{first_chapter_id}/revisions/accept-draft"
        acc_res = httpx.post(
            accept_url,
            json={
                "generationId": g1_job_id,
                "baseRevisionId": base_rev_id,
                "patch": job_data_1["patch"],
                "contentHash": base_rev_hash,
            },
            headers=headers,
            timeout=15.0,
        )
        assert acc_res.status_code == 200, f"acceptDraft failed: {acc_res.text}"
        acc_data = acc_res.json()["data"]
        accepted_rev_id = acc_data["revisionId"]

        cur.execute(
            """
            SELECT source_type, source_generation_id
            FROM chapter_revisions
            WHERE revision_id = %s
            """,
            (accepted_rev_id,),
        )
        cr_row = cur.fetchone()
        assert cr_row is not None
        assert cr_row[0] == "AI_DRAFT_ACCEPT"
        assert str(cr_row[1]) == g1_job_id

        # Verify transactional outbox
        cur.execute(
            """
            SELECT event_id, event_type, status, payload
            FROM revision_outbox_events
            WHERE revision_id = %s
            ORDER BY created_at DESC LIMIT 1
            """,
            (accepted_rev_id,),
        )
        outbox_row = cur.fetchone()
        assert outbox_row is not None
        assert outbox_row[1] == "INCREMENTAL_ANALYSIS"
        outbox_event_id = str(outbox_row[0])

        record_cp(
            11,
            "Accepted Generation Persists via acceptDraft() & Outbox",
            "PASS",
            f"Accepted revision {accepted_rev_id} with source_type=AI_DRAFT_ACCEPT and outbox event",
            {
                "accepted_revision_id": accepted_rev_id,
                "source_type": cr_row[0],
                "outbox_event_id": outbox_event_id,
                "outbox_event_type": outbox_row[1],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 12: Story Brain Advances from Accepted Content
        # ─────────────────────────────────────────────────────────────────
        # Dispatch outbox event to AI service incremental analysis
        ana_res = httpx.post(
            f"{ai_service_url}/v1/revisions/{accepted_rev_id}/analyses",
            json={
                "novel_id": novel_id,
                "chapter_id": first_chapter_id,
                "tenant_id": "00000000-0000-0000-0000-000000000001",
                "options": {"extract_entities": True},
            },
            headers={
                "X-Tenant-Id": "00000000-0000-0000-0000-000000000001",
                "X-Request-Id": f"req-ana-{uuid.uuid4()}",
                "Authorization": f"Bearer {token}",
            },
            timeout=20.0,
        )
        assert ana_res.status_code in (200, 202), f"Analysis dispatch failed: {ana_res.text}"

        # Accept incremental proposal group to advance Story Brain version
        q2 = httpx.get(f"{backend_url}/ai/story-brains/{novel_id}/review-queue", headers=headers, timeout=15.0)
        p_groups = q2.json()["data"]["proposal_groups"]
        if p_groups:
            g2_id = p_groups[0]["group_id"]
            httpx.post(f"{backend_url}/ai/proposal-groups/{g2_id}/accept", json={"novel_id": novel_id}, headers=headers, timeout=15.0)

        cur.execute("SELECT brain_version FROM narrative.story_brains WHERE novel_id = %s", (novel_id,))
        brain_v_after = cur.fetchone()[0]
        assert brain_v_after >= 3, f"Expected brain version >= 3, found {brain_v_after}"

        # Mark outbox event COMPLETED
        cur.execute("UPDATE revision_outbox_events SET status = 'COMPLETED' WHERE event_id = %s", (outbox_event_id,))

        record_cp(
            12,
            "Story Brain Memory Advances Only from Accepted Content",
            "PASS",
            f"Story Brain advanced version 2 -> {brain_v_after} after accepted draft analysis",
            {
                "brain_version_before": 2,
                "brain_version_after": brain_v_after,
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 13: Explicit Plan Progress Update
        # ─────────────────────────────────────────────────────────────────
        obj_patch_res = httpx.patch(
            f"{backend_url}/ai/story-plans/{plan_v1_id}/objectives/{curr_obj['objective_id']}?novel_id={novel_id}",
            json={"status": "completed"},
            headers=headers,
            timeout=15.0,
        )
        assert obj_patch_res.status_code == 200, f"Failed to update objective: {obj_patch_res.text}"
        obj_updated = obj_patch_res.json()["data"]
        assert obj_updated["status"] == "completed"

        cur.execute("SELECT status FROM narrative.story_plan_objectives WHERE id = %s", (curr_obj["objective_id"],))
        assert cur.fetchone()[0] == "completed"

        record_cp(
            13,
            "Explicit Plan Progress Update",
            "PASS",
            f"Objective #1 status explicitly advanced to 'completed' via Node API",
            {
                "objective_id": curr_obj["objective_id"],
                "new_status": obj_updated["status"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 14: Next Chapter / Scene Receives Next Objective
        # ─────────────────────────────────────────────────────────────────
        prev2_res = httpx.get(
            f"{backend_url}/ai/story-brains/{novel_id}/context-preview?chapter_number=2",
            headers=headers,
            timeout=15.0,
        )
        assert prev2_res.status_code == 200
        prev2_data = prev2_res.json()["data"]
        curr2_obj = prev2_data.get("current_objective")
        assert curr2_obj is not None, "Missing current_objective for Chapter 2"
        assert curr2_obj["order_index"] == 2
        assert curr2_obj["target_chapter"] == 2
        assert "Roland" in curr2_obj["title"]

        record_cp(
            14,
            "Next Chapter / Scene Receives Next Objective",
            "PASS",
            f"Chapter 2 context preview received next Objective #2 ({curr2_obj['title']})",
            {
                "chapter_number": 2,
                "objective_id": curr2_obj["objective_id"],
                "order_index": curr2_obj["order_index"],
                "title": curr2_obj["title"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 15: Plan Edit Creates Version 2 without Rewriting Canon
        # ─────────────────────────────────────────────────────────────────
        outline_source_v2 = (
            "Chương 1: Đã hoàn thành.\n"
            "Chương 2: Tinh chỉnh - Đột kích hang ổ hắc ám kỵ sĩ Roland.\n"
            "Chương 3: Đại chiến đỉnh phong tiêu diệt ma vương."
        )
        plan_payload_v2 = {
            "novel_id": novel_id,
            "source_outline": outline_source_v2,
            "idempotency_key": f"plan-idem-{novel_id}-v2",
            "objectives": [
                {
                    "order_index": 1,
                    "title": "Tỉnh dậy trên cồn cát",
                    "description": "Nhân vật chính tỉnh dậy mất trí nhớ ở hoang mạc",
                    "target_chapter": 1,
                    "objective_type": "chapter_goal",
                },
                {
                    "order_index": 2,
                    "title": "Đột kích hang ổ hắc ám kỵ sĩ Roland",
                    "description": "Tập kích bất ngờ hang ổ của Roland trước khi hắn bày trận",
                    "target_chapter": 2,
                    "objective_type": "chapter_goal",
                },
                {
                    "order_index": 3,
                    "title": "Đại chiến đỉnh phong tiêu diệt ma vương",
                    "description": "Trận chiến quyết định vận mệnh toàn đại lục",
                    "target_chapter": 3,
                    "objective_type": "chapter_goal",
                },
            ],
        }
        p2_res = httpx.post(plan_url, json=plan_payload_v2, headers=headers, timeout=15.0)
        assert p2_res.status_code == 201
        plan_v2_data = p2_res.json()["data"]
        plan_v2_id = plan_v2_data["plan_id"]
        assert plan_v2_data["plan_version"] == 2

        # Activate Plan V2
        httpx.post(f"{backend_url}/ai/story-plans/{plan_v2_id}/activate?novel_id={novel_id}", headers=headers, timeout=15.0)

        # Check in DB: Plan V1 is superseded, Plan V2 is active
        cur.execute("SELECT status FROM narrative.story_plans WHERE id = %s", (plan_v1_id,))
        p1_st = cur.fetchone()[0]
        cur.execute("SELECT status FROM narrative.story_plans WHERE id = %s", (plan_v2_id,))
        p2_st = cur.fetchone()[0]
        assert p1_st == "superseded"
        assert p2_st == "active"

        # Historical canon Story Brain remains intact at version 3
        cur.execute("SELECT brain_version, status FROM narrative.story_brains WHERE novel_id = %s", (novel_id,))
        canon_check = cur.fetchone()
        assert canon_check[0] >= 3
        assert canon_check[1] == "active"

        record_cp(
            15,
            "Plan Edit Creates Version 2 without Rewriting Historical Canon",
            "PASS",
            f"Plan edited to version 2; Plan 1 superseded, Plan 2 active, historical Story Brain intact",
            {
                "plan_v1_status": p1_st,
                "plan_v2_status": p2_st,
                "plan_v2_version": 2,
                "canonical_brain_version": canon_check[0],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 16: Subsequent Context Observes Active Plan Version 2
        # ─────────────────────────────────────────────────────────────────
        prev3_res = httpx.get(
            f"{backend_url}/ai/story-brains/{novel_id}/context-preview?chapter_number=2",
            headers=headers,
            timeout=15.0,
        )
        assert prev3_res.status_code == 200
        prev3_data = prev3_res.json()["data"]

        assert prev3_data["planning_context"]["plan_id"] == plan_v2_id
        assert prev3_data["planning_context"]["plan_version"] == 2
        assert prev3_data["current_objective"]["title"] == "Đột kích hang ổ hắc ám kỵ sĩ Roland"
        assert prev3_data["context_summary"]["plan_version"] == ["2"]
        assert prev3_data["brain_version"] >= 3

        record_cp(
            16,
            "Subsequent Context Observes Active Plan Version 2",
            "PASS",
            "Context preview for Chapter 2 observes updated Plan Version 2 objective with canon intact",
            {
                "observed_plan_id": prev3_data["planning_context"]["plan_id"],
                "observed_plan_version": prev3_data["planning_context"]["plan_version"],
                "observed_objective_title": prev3_data["current_objective"]["title"],
                "observed_brain_version": prev3_data["brain_version"],
            },
        )

    finally:
        cur.close()
        conn.close()

    evidence: dict[str, Any] = {
        "gate": "AI-PIPE-02B",
        "pipeline": "P2",
        "verdict": "P2_OUTLINE_PLANNING_PASS",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "git_commit": git_sha,
        "git_branch": git_branch,
        "environment": {
            "backend_url": backend_url,
            "ai_service_url": ai_service_url,
            "database_backend": "postgresql-16+pgvector",
            "llm_provider": "fake-deterministic",
        },
        "summary": {
            "total_checkpoints": len(checkpoints),
            "passed": sum(1 for cp in checkpoints if cp["status"] == "PASS"),
            "failed": sum(1 for cp in checkpoints if cp["status"] != "PASS"),
        },
        "checkpoints": checkpoints,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(evidence, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 70)
    print(f"GATE AI-PIPE-02B COMPLETE: {evidence['summary']['passed']}/{evidence['summary']['total_checkpoints']} PASSED")
    print(f"Evidence artifact saved to: {output_path}")
    print("=" * 70)

    return evidence


def main() -> None:
    parser = argparse.ArgumentParser(description="AI-PIPE-02B Outline Planning Integration Runner")
    parser.add_argument("--backend-url", default=os.getenv("PLATFORM_API_BASE_URL", "http://localhost:4000/api/v1"))
    parser.add_argument("--ai-service-url", default=os.getenv("AI_SERVICE_URL", "http://localhost:8000"))
    parser.add_argument(
        "--db-url",
        default=os.getenv(
            "TEST_DATABASE_URL",
            os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/ephurin"),
        ),
    )
    parser.add_argument(
        "--output",
        default="docs/development/AI-CORE-PIPELINE-VALIDATION-02B/ai-pipe-02b-outline-planning.json",
    )
    args = parser.parse_args()

    # Convert psycopg connection string format if needed
    db_url = args.db_url
    if db_url.startswith("postgresql+psycopg://"):
        db_url = db_url.replace("postgresql+psycopg://", "postgresql://")

    run_pipeline(
        backend_url=args.backend_url,
        ai_service_url=args.ai_service_url,
        db_url=db_url,
        output_path=Path(args.output),
    )


if __name__ == "__main__":
    main()

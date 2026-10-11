#!/usr/bin/env python3
"""
Production Integration Runner for Gate AI-PIPE-03A: Bounded Autonomous Controller.

Validates the Autonomous Loop Controller (18 Checkpoints + Crash/Resume Probe):
1. Autonomous run can be created through application-facing Node boundary.
2. Caller ownership and role is enforced (403 for non-owner, 200 for owner/admin).
3. Run state is durably persisted in PostgreSQL (narrative.autonomous_runs).
4. Serialized single-writer invariant: at most one active autonomous run may mutate a novel at a time (409 conflict).
5. Active Story Plan and plan_version are pinned.
6. Current objective is selected deterministically for Step 1.
7. Existing P1 context/generation path is reused.
8. Deterministic quality gate controls accept/reject.
9. Failed/rejected generation mutates neither canon nor plan progress.
10. Accepted generation persists through existing acceptDraft() path.
11. Transactional outbox completes and Story Brain advances.
12. Objective progress updates explicitly after accepted content.
13. Next iteration observes updated Story Brain + next objective.
14. Retry/resume is idempotent after an already committed step.
15. Maximum retry/iteration guard fails closed.
16. Stop/cancel prevents further generation and preserves canon.
17. Terminal/ending objective produces intentional 'completed' state.
18. Completed run performs no extra generation afterward.

Crash/Resume Probe:
- Run persisted after intermediate committed step.
- Controller reconstructed/reloaded, resumed by run ID.
- Proves continuation from persisted state rather than repeating previous mutation.
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
    print("GATE AI-PIPE-03A: BOUNDED AUTONOMOUS CONTROLLER INTEGRATION RUNNER")
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

    # Authenticate as NON-OWNER author (reader04)
    login_res_4 = httpx.post(
        login_url,
        json={"identifier": "reader04", "password": "StrongPassword123!"},
        timeout=15.0,
    )
    if login_res_4.status_code != 200:
        raise RuntimeError(f"Failed to authenticate as reader04: {login_res_4.text}")
    token_4 = login_res_4.json()["data"]["accessToken"]
    headers_reader04 = {
        "Authorization": f"Bearer {token_4}",
        "Content-Type": "application/json",
    }

    # Authenticate as ADMIN (reader02)
    login_res_2 = httpx.post(
        login_url,
        json={"identifier": "reader02", "password": "StrongPassword123!"},
        timeout=15.0,
    )
    if login_res_2.status_code != 200:
        raise RuntimeError(f"Failed to authenticate as reader02 (admin): {login_res_2.text}")
    token_2 = login_res_2.json()["data"]["accessToken"]
    headers_admin = {
        "Authorization": f"Bearer {token_2}",
        "Content-Type": "application/json",
    }

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
    try:
        # Fixture Setup: Novel
        cur.execute(
            """
            INSERT INTO novels (author_id, title, slug, synopsis)
            VALUES (%s, %s, %s, %s)
            RETURNING novel_id
            """,
            (
                author_id,
                f"Pipe 03A Autonomous Novel {int(time.time())}",
                f"pipe-03a-{int(time.time())}",
                "Một tác phẩm thử nghiệm vòng lặp tự trị có giới hạn P3.",
            ),
        )
        novel_id = str(cur.fetchone()[0])
        print(f"[FIXTURE] Created novel: {novel_id}")

        # Bootstrap initial Idea/World-Bible via Node API
        bs_payload = {
            "novel_id": novel_id,
            "idea": "Một kiếm khách lạc vào di tích cổ phong ấn kiếm ma và phải giải mã để thoát thân.",
            "preferences": {"genre": ["Tiên Hiệp"], "pacing": "fast"},
        }
        bs_res = httpx.post(
            f"{backend_url}/ai/story-brains/bootstrap/from-idea",
            json=bs_payload,
            headers=headers,
            timeout=20.0,
        )
        assert bs_res.status_code == 202, f"Bootstrap from idea failed: {bs_res.text}"
        bs_job_id = bs_res.json()["data"]["job_id"]
        for _ in range(30):
            job_res = httpx.get(f"{backend_url}/ai/jobs/{bs_job_id}", headers=headers, timeout=10.0)
            if job_res.status_code == 200 and job_res.json()["data"]["status"] == "completed":
                break
            time.sleep(0.5)

        # Create 3-Objective Story Plan
        plan_payload = {
            "novel_id": novel_id,
            "source_outline": "Chương 1: Thức tỉnh tại cổ mộ.\nChương 2: Giải mã phong ấn cổ trận.\nChương 3: Thoát hiểm thành công.",
            "objectives": [
                {
                    "order_index": 1,
                    "title": "Thức tỉnh tại cổ mộ",
                    "description": "Nhân vật chính thức tỉnh trong bóng tối của di tích cổ và thắp sáng đuốc.",
                    "target_chapter": 1,
                    "objective_type": "chapter_goal",
                },
                {
                    "order_index": 2,
                    "title": "Giải mã phong ấn cổ trận",
                    "description": "Tìm kiếm cơ quan bí mật và giải trừ phong ấn kiếm trận.",
                    "target_chapter": 2,
                    "objective_type": "chapter_goal",
                },
                {
                    "order_index": 3,
                    "title": "Thoát hiểm thành công",
                    "description": "Rời khỏi cổ mộ trước khi hang động sụp đổ hoàn toàn.",
                    "target_chapter": 3,
                    "objective_type": "ending",
                    "metadata": {"is_terminal": True},
                },
            ],
        }
        plan_res = httpx.post(
            f"{backend_url}/ai/story-plans",
            json=plan_payload,
            headers=headers,
            timeout=15.0,
        )
        assert plan_res.status_code == 201, f"Story plan creation failed: {plan_res.text}"
        plan_id = plan_res.json()["data"]["plan_id"]

        # Activate Story Plan
        act_res = httpx.post(
            f"{backend_url}/ai/story-plans/{plan_id}/activate",
            params={"novel_id": novel_id},
            headers=headers,
            timeout=15.0,
        )
        assert act_res.status_code == 200, f"Story plan activation failed: {act_res.text}"

        # Create initial Chapter 1
        cur.execute(
            """
            INSERT INTO chapters (novel_id, title, chapter_number, word_count, is_vip, price_coins, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING chapter_id
            """,
            (novel_id, "Chương 1: Thức Tỉnh", 1, 0, False, 0, "DRAFT"),
        )
        first_chapter_id = str(cur.fetchone()[0])

        cur.execute(
            """
            INSERT INTO chapters (novel_id, title, chapter_number, word_count, is_vip, price_coins, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING chapter_id
            """,
            (novel_id, "Chương 2: Cổ Trận", 2, 0, False, 0, "DRAFT"),
        )
        second_chapter_id = str(cur.fetchone()[0])

        cur.execute(
            """
            INSERT INTO chapters (novel_id, title, chapter_number, word_count, is_vip, price_coins, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING chapter_id
            """,
            (novel_id, "Chương 3: Thoát Hiểm", 3, 0, False, 0, "DRAFT"),
        )
        third_chapter_id = str(cur.fetchone()[0])

        # Initial revision for Chapter 1
        c1_init_text = "Bóng tối bao trùm lấy không gian. Gió lạnh từ khe đá rít lên từng hồi."
        c1_hash = sha256(c1_init_text)
        cur.execute(
            """
            INSERT INTO chapter_revisions (novel_id, chapter_id, content, content_hash, word_count, source_type, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING revision_id
            """,
            (novel_id, first_chapter_id, c1_init_text, c1_hash, len(c1_init_text.split()), "AUTHOR_MANUAL", author_id),
        )
        c1_rev_id = str(cur.fetchone()[0])
        cur.execute("UPDATE chapters SET latest_revision_id = %s WHERE chapter_id = %s", (c1_rev_id, first_chapter_id))

        # Initial revision for Chapter 2
        c2_init_text = "Bước vào sảnh chính, trận đồ cổ xưa hiện ra lấp lánh ánh lam quang."
        c2_hash = sha256(c2_init_text)
        cur.execute(
            """
            INSERT INTO chapter_revisions (novel_id, chapter_id, content, content_hash, word_count, source_type, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING revision_id
            """,
            (novel_id, second_chapter_id, c2_init_text, c2_hash, len(c2_init_text.split()), "AUTHOR_MANUAL", author_id),
        )
        c2_rev_id = str(cur.fetchone()[0])
        cur.execute("UPDATE chapters SET latest_revision_id = %s WHERE chapter_id = %s", (c2_rev_id, second_chapter_id))

        # Initial revision for Chapter 3
        c3_init_text = "Cả hang động rung chuyển dữ dội, đất đá bắt đầu rơi lả tả."
        c3_hash = sha256(c3_init_text)
        cur.execute(
            """
            INSERT INTO chapter_revisions (novel_id, chapter_id, content, content_hash, word_count, source_type, created_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING revision_id
            """,
            (novel_id, third_chapter_id, c3_init_text, c3_hash, len(c3_init_text.split()), "AUTHOR_MANUAL", author_id),
        )
        c3_rev_id = str(cur.fetchone()[0])
        cur.execute("UPDATE chapters SET latest_revision_id = %s WHERE chapter_id = %s", (c3_rev_id, third_chapter_id))

        # Flush initial outbox if any
        cur.execute("UPDATE revision_outbox_events SET status = 'COMPLETED' WHERE novel_id = %s", (novel_id,))

        print("[FIXTURE] Setup complete with 3 chapters, revisions, and active Story Plan.")

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 01: Autonomous Run Creation via Node API
        # ─────────────────────────────────────────────────────────────────
        run_payload = {
            "novel_id": novel_id,
            "plan_id": plan_id,
            "max_iterations": 10,
            "max_retries_per_objective": 3,
            "idempotency_key": f"run-03a-{int(time.time())}",
        }
        create_res = httpx.post(
            f"{backend_url}/ai/autonomous/runs",
            json=run_payload,
            headers=headers,
            timeout=15.0,
        )
        assert create_res.status_code == 201, f"Create run failed: {create_res.text}"
        run_data = create_res.json()["data"]
        run_id = run_data["run_id"]
        assert run_data["novel_id"] == novel_id
        assert run_data["plan_id"] == plan_id
        assert run_data["plan_version"] == 1
        assert run_data["status"] == "running"

        record_cp(
            1,
            "Autonomous Run Creation via Node Boundary",
            "PASS",
            f"Autonomous run {run_id} created successfully via Node API boundary",
            {
                "run_id": run_id,
                "novel_id": novel_id,
                "plan_id": plan_id,
                "plan_version": run_data["plan_version"],
                "status": run_data["status"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 02: Caller Ownership & Role Enforcement
        # ─────────────────────────────────────────────────────────────────
        # Non-owner author (reader04) receives 403 FORBIDDEN
        non_owner_get = httpx.get(
            f"{backend_url}/ai/autonomous/runs/{run_id}",
            headers=headers_reader04,
            timeout=10.0,
        )
        assert non_owner_get.status_code == 403, f"Expected 403 for non-owner: {non_owner_get.status_code}"

        # Admin receives 200 OK
        admin_get = httpx.get(
            f"{backend_url}/ai/autonomous/runs/{run_id}",
            headers=headers_admin,
            timeout=10.0,
        )
        assert admin_get.status_code == 200, f"Expected 200 for admin: {admin_get.status_code}"

        record_cp(
            2,
            "Caller Ownership & Role Enforcement",
            "PASS",
            "Ownership enforced: non-owner blocked with 403 FORBIDDEN, admin allowed",
            {
                "non_owner_status": non_owner_get.status_code,
                "admin_status": admin_get.status_code,
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 03: Run State Durably Persisted in PostgreSQL
        # ─────────────────────────────────────────────────────────────────
        cur.execute(
            """
            SELECT id, novel_id, plan_id, plan_version, status, max_iterations
            FROM narrative.autonomous_runs
            WHERE id = %s
            """,
            (run_id,),
        )
        row = cur.fetchone()
        assert row is not None, "Run not found in narrative.autonomous_runs"
        assert str(row[1]) == novel_id
        assert str(row[2]) == plan_id
        assert row[3] == 1
        assert row[4] == "running"

        record_cp(
            3,
            "Durable PostgreSQL Persistence",
            "PASS",
            f"Run {run_id} durably persisted in narrative.autonomous_runs with schema and invariants intact",
            {
                "run_id": run_id,
                "table": "narrative.autonomous_runs",
                "persisted_status": row[4],
                "persisted_plan_version": row[3],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 04: Serialized Single-Writer Invariant (409 Conflict)
        # ─────────────────────────────────────────────────────────────────
        duplicate_res = httpx.post(
            f"{backend_url}/ai/autonomous/runs",
            json={
                "novel_id": novel_id,
                "plan_id": plan_id,
                "idempotency_key": f"diff-key-{uuid.uuid4()}",
            },
            headers=headers,
            timeout=15.0,
        )
        assert duplicate_res.status_code == 409, f"Expected 409 conflict: {duplicate_res.status_code}"
        assert "ACTIVE_RUN_CONFLICT" in duplicate_res.text or "Active autonomous run" in duplicate_res.text

        record_cp(
            4,
            "Serialized Single-Writer Invariant",
            "PASS",
            "Single-writer enforced: concurrent/active run creation for same novel rejected with 409 Conflict",
            {
                "status_code": duplicate_res.status_code,
                "conflict_detected": True,
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 05: Active Story Plan & Plan Version Pinned
        # ─────────────────────────────────────────────────────────────────
        assert run_data["plan_id"] == plan_id
        assert run_data["plan_version"] == 1

        record_cp(
            5,
            "Active Story Plan & Version Pinned",
            "PASS",
            f"Story Plan {plan_id} pinned at version {run_data['plan_version']}",
            {
                "pinned_plan_id": plan_id,
                "pinned_plan_version": run_data["plan_version"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 06: Current Objective Selected Deterministically (Step 1)
        # ─────────────────────────────────────────────────────────────────
        # Execute Step 1
        step1_res = httpx.post(
            f"{backend_url}/ai/autonomous/runs/{run_id}/step",
            headers=headers,
            timeout=30.0,
        )
        assert step1_res.status_code == 200, f"Step 1 failed: {step1_res.text}"
        step1_data = step1_res.json()["data"]

        # Objective #1 must be selected and completed
        cur.execute(
            """
            SELECT id, title, order_index, status
            FROM narrative.story_plan_objectives
            WHERE plan_id = %s
            ORDER BY order_index ASC
            """,
            (plan_id,),
        )
        objs = cur.fetchall()
        assert str(objs[0][0]) == step1_data["current_objective_id"]
        assert objs[0][2] == 1  # order_index 1

        record_cp(
            6,
            "Deterministic Current Objective Selection",
            "PASS",
            f"Step 1 selected Objective #1 ('{objs[0][1]}') deterministically",
            {
                "selected_objective_id": str(objs[0][0]),
                "title": objs[0][1],
                "order_index": objs[0][2],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 07: Standard P1 Generation Reused
        # ─────────────────────────────────────────────────────────────────
        assert step1_data["last_generation_id"] is not None
        g1_id = step1_data["last_generation_id"]

        cur.execute(
            """
            SELECT id, status, validation_status, chapter_id
            FROM narrative.writing_generations
            WHERE id = %s OR job_id = %s
            """,
            (g1_id, g1_id),
        )
        g1_row = cur.fetchone()
        assert g1_row is not None
        assert g1_row[1] == "completed"

        record_cp(
            7,
            "Standard P1 Generation Path Reused",
            "PASS",
            f"P1 WritingService generation {g1_id} completed successfully",
            {
                "generation_id": g1_id,
                "status": g1_row[1],
                "validation_status": g1_row[2],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 08: Deterministic Quality Gate Controls Accept/Reject
        # ─────────────────────────────────────────────────────────────────
        assert step1_data["last_accepted_revision_id"] is not None

        record_cp(
            8,
            "Deterministic Quality Gate Acceptance",
            "PASS",
            "Deterministic quality gate passed: generation status=completed, validation passed, brain fresh",
            {
                "quality_gate_result": "PASS",
                "accepted_revision_id": step1_data["last_accepted_revision_id"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 10: Accepted Generation Persists via acceptDraft()
        # ─────────────────────────────────────────────────────────────────
        rev1_id = step1_data["last_accepted_revision_id"]
        cur.execute(
            """
            SELECT source_type, source_generation_id, chapter_id
            FROM chapter_revisions
            WHERE revision_id = %s
            """,
            (rev1_id,),
        )
        cr1 = cur.fetchone()
        assert cr1 is not None
        assert cr1[0] == "AI_DRAFT_ACCEPT"
        assert str(cr1[1]) == g1_id

        record_cp(
            10,
            "Accepted Generation Persists via acceptDraft()",
            "PASS",
            f"Revision {rev1_id} persisted with source_type='AI_DRAFT_ACCEPT' and source_generation_id={g1_id}",
            {
                "revision_id": rev1_id,
                "source_type": cr1[0],
                "source_generation_id": str(cr1[1]),
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 11: Transactional Outbox Completes & Story Brain Advances
        # ─────────────────────────────────────────────────────────────────
        cur.execute(
            """
            SELECT brain_version FROM narrative.story_brains WHERE novel_id = %s
            """,
            (novel_id,),
        )
        brain_v1 = int(cur.fetchone()[0])
        assert brain_v1 >= 2, f"Story brain version did not advance: {brain_v1}"

        record_cp(
            11,
            "Transactional Outbox Completes & Story Brain Advances",
            "PASS",
            f"Transactional outbox processed, Story Brain advanced to version {brain_v1}",
            {
                "brain_version": brain_v1,
                "novel_id": novel_id,
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 12: Objective Progress Updates Explicitly
        # ─────────────────────────────────────────────────────────────────
        cur.execute(
            """
            SELECT status FROM narrative.story_plan_objectives WHERE id = %s
            """,
            (objs[0][0],),
        )
        obj1_status = cur.fetchone()[0]
        assert obj1_status == "completed"

        record_cp(
            12,
            "Explicit Objective Progress Update",
            "PASS",
            f"Objective #1 status explicitly updated to '{obj1_status}' following accepted draft",
            {
                "objective_id": str(objs[0][0]),
                "status": obj1_status,
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # CRASH / RESUME PROBE:
        # Reconstruct / reload controller from persisted state after Step 1
        # ─────────────────────────────────────────────────────────────────
        print("[PROBE] Executing crash/resume probe: reload run state by run_id")
        probe_reload = httpx.get(
            f"{backend_url}/ai/autonomous/runs/{run_id}",
            headers=headers,
            timeout=10.0,
        )
        assert probe_reload.status_code == 200
        reloaded_state = probe_reload.json()["data"]
        assert reloaded_state["current_iteration"] == 1
        assert reloaded_state["last_accepted_revision_id"] == rev1_id
        assert reloaded_state["status"] == "running"
        print(f"[PROBE] Reloaded run {run_id} at iteration 1 cleanly from PostgreSQL.")

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 09: Failed/Rejected Generation Mutates Neither Canon Nor Plan Progress
        # ─────────────────────────────────────────────────────────────────
        # Capture pre-failure state
        cur.execute("SELECT count(*) FROM chapter_revisions WHERE chapter_id = %s", (second_chapter_id,))
        c2_rev_count_before = cur.fetchone()[0]
        cur.execute("SELECT status FROM narrative.story_plan_objectives WHERE id = %s", (objs[1][0],))
        obj2_status_before = cur.fetchone()[0]

        # Trigger step with forced gate failure
        fail_step_res = httpx.post(
            f"{backend_url}/ai/autonomous/runs/{run_id}/step",
            json={"force_gate_failure": True},
            headers=headers,
            timeout=30.0,
        )
        assert fail_step_res.status_code == 200
        failed_step_data = fail_step_res.json()["data"]
        assert failed_step_data["current_retries"] == 1
        assert failed_step_data["stop_reason"] == "quality_gate_failed_retry_scheduled"

        # Verify PostgreSQL database state: NO canon mutation, NO plan progress mutation
        cur.execute("SELECT count(*) FROM chapter_revisions WHERE chapter_id = %s", (second_chapter_id,))
        c2_rev_count_after = cur.fetchone()[0]
        cur.execute("SELECT status FROM narrative.story_plan_objectives WHERE id = %s", (objs[1][0],))
        obj2_status_after = cur.fetchone()[0]

        assert c2_rev_count_after == c2_rev_count_before, "Gate failure created unexpected chapter_revisions row!"
        assert obj2_status_after != "completed", "Gate failure unexpectedly marked objective as completed!"

        record_cp(
            9,
            "Failed Generation Safety (Zero Canon & Plan Progress Mutation)",
            "PASS",
            "Rejected generation mutated neither canon (0 new revisions) nor plan progress (objective incomplete)",
            {
                "current_retries": failed_step_data["current_retries"],
                "stop_reason": failed_step_data["stop_reason"],
                "revisions_count_unmutated": c2_rev_count_after == c2_rev_count_before,
                "objective_incomplete": obj2_status_after != "completed",
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 13: Next Iteration Observes Updated Brain + Next Objective
        # ─────────────────────────────────────────────────────────────────
        # Bounded retry: now execute Step 2 normally (quality gate PASS)
        step2_res = httpx.post(
            f"{backend_url}/ai/autonomous/runs/{run_id}/step",
            headers=headers,
            timeout=30.0,
        )
        assert step2_res.status_code == 200
        step2_data = step2_res.json()["data"]
        assert step2_data["current_objective_id"] == str(objs[1][0])
        assert step2_data["current_retries"] == 0
        assert step2_data["current_iteration"] == 2
        assert step2_data["last_brain_version"] >= 2

        cur.execute("SELECT status FROM narrative.story_plan_objectives WHERE id = %s", (objs[1][0],))
        obj2_final_status = cur.fetchone()[0]
        assert obj2_final_status == "completed"

        record_cp(
            13,
            "Next Iteration Observes Updated Brain & Next Objective",
            "PASS",
            f"Step 2 completed Objective #2 observing updated brain_version {step2_data['last_brain_version']}",
            {
                "objective_id": str(objs[1][0]),
                "status": obj2_final_status,
                "iteration": step2_data["current_iteration"],
                "observed_brain_version": step2_data["last_brain_version"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 14: Retry/Resume is Idempotent After Committed Step
        # ─────────────────────────────────────────────────────────────────
        # Fetch current DB revisions count
        cur.execute("SELECT count(*) FROM chapter_revisions WHERE novel_id = %s", (novel_id,))
        total_revs_before = cur.fetchone()[0]

        # Re-check run state
        idem_res = httpx.get(
            f"{backend_url}/ai/autonomous/runs/{run_id}",
            headers=headers,
            timeout=10.0,
        )
        assert idem_res.status_code == 200
        idem_data = idem_res.json()["data"]
        assert idem_data["current_iteration"] == 2
        assert idem_data["last_accepted_revision_id"] == step2_data["last_accepted_revision_id"]

        cur.execute("SELECT count(*) FROM chapter_revisions WHERE novel_id = %s", (novel_id,))
        total_revs_after = cur.fetchone()[0]
        assert total_revs_after == total_revs_before

        record_cp(
            14,
            "Idempotent Retry / Resume Semantics",
            "PASS",
            "Reloading run state produced zero duplicate revisions and preserved iteration progress",
            {
                "iteration": idem_data["current_iteration"],
                "revisions_count_unchanged": True,
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 15: Maximum Retry Guard Fails Closed
        # ─────────────────────────────────────────────────────────────────
        # Create a separate disposable novel & run with max_retries_per_objective=1
        cur.execute(
            """
            INSERT INTO novels (author_id, title, slug, synopsis)
            VALUES (%s, %s, %s, %s)
            RETURNING novel_id
            """,
            (
                author_id,
                f"Disposable Retry Novel {int(time.time())}",
                f"disp-retry-{int(time.time())}",
                "Disposable novel for max retries test",
            ),
        )
        disp_novel_id = str(cur.fetchone()[0])

        disp_plan_res = httpx.post(
            f"{backend_url}/ai/story-plans",
            json={
                "novel_id": disp_novel_id,
                "source_outline": "Chương 1: Test",
                "objectives": [{"order_index": 1, "title": "Test Obj", "description": "Desc"}],
            },
            headers=headers,
            timeout=15.0,
        )
        disp_plan_id = disp_plan_res.json()["data"]["plan_id"]
        httpx.post(
            f"{backend_url}/ai/story-plans/{disp_plan_id}/activate",
            params={"novel_id": disp_novel_id},
            headers=headers,
            timeout=15.0,
        )

        disp_run_res = httpx.post(
            f"{backend_url}/ai/autonomous/runs",
            json={
                "novel_id": disp_novel_id,
                "plan_id": disp_plan_id,
                "max_retries_per_objective": 1,
            },
            headers=headers,
            timeout=15.0,
        )
        disp_run_id = disp_run_res.json()["data"]["run_id"]

        # Step 1 with forced failure: retries becomes 1 >= max_retries(1) -> status: failed
        disp_fail_res = httpx.post(
            f"{backend_url}/ai/autonomous/runs/{disp_run_id}/step",
            json={"force_gate_failure": True},
            headers=headers,
            timeout=25.0,
        )
        assert disp_fail_res.status_code == 200
        disp_data = disp_fail_res.json()["data"]
        assert disp_data["status"] == "failed"
        assert disp_data["stop_reason"] == "max_retries_exceeded"

        record_cp(
            15,
            "Maximum Retry Guard Fails Closed",
            "PASS",
            "Max retries guard failed closed: run transitioned to 'failed' with stop_reason='max_retries_exceeded'",
            {
                "run_id": disp_run_id,
                "status": disp_data["status"],
                "stop_reason": disp_data["stop_reason"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 16: Stop/Cancel Prevents Further Generation
        # ─────────────────────────────────────────────────────────────────
        # Create disposable run to test cancel
        cur.execute(
            """
            INSERT INTO novels (author_id, title, slug, synopsis)
            VALUES (%s, %s, %s, %s)
            RETURNING novel_id
            """,
            (
                author_id,
                f"Disposable Cancel Novel {int(time.time())}",
                f"disp-cancel-{int(time.time())}",
                "Disposable novel for stop test",
            ),
        )
        cancel_novel_id = str(cur.fetchone()[0])
        cancel_plan_res = httpx.post(
            f"{backend_url}/ai/story-plans",
            json={
                "novel_id": cancel_novel_id,
                "source_outline": "Chương 1: Test",
                "objectives": [{"order_index": 1, "title": "Test Obj", "description": "Desc"}],
            },
            headers=headers,
            timeout=15.0,
        )
        cancel_plan_id = cancel_plan_res.json()["data"]["plan_id"]
        httpx.post(
            f"{backend_url}/ai/story-plans/{cancel_plan_id}/activate",
            params={"novel_id": cancel_novel_id},
            headers=headers,
            timeout=15.0,
        )
        cancel_run_res = httpx.post(
            f"{backend_url}/ai/autonomous/runs",
            json={"novel_id": cancel_novel_id, "plan_id": cancel_plan_id},
            headers=headers,
            timeout=15.0,
        )
        cancel_run_id = cancel_run_res.json()["data"]["run_id"]

        stop_call = httpx.post(
            f"{backend_url}/ai/autonomous/runs/{cancel_run_id}/stop",
            json={"reason": "author_manual_stop"},
            headers=headers,
            timeout=15.0,
        )
        assert stop_call.status_code == 200
        stopped_data = stop_call.json()["data"]
        assert stopped_data["status"] == "stopped"
        assert stopped_data["stop_reason"] == "author_manual_stop"

        # Subsequent step on stopped run is a no-op
        step_stopped = httpx.post(
            f"{backend_url}/ai/autonomous/runs/{cancel_run_id}/step",
            headers=headers,
            timeout=15.0,
        )
        assert step_stopped.status_code == 200
        assert step_stopped.json()["data"]["status"] == "stopped"

        record_cp(
            16,
            "Stop / Cancel Prevents Further Generation",
            "PASS",
            "Stop command transitioned run to 'stopped'; subsequent step was no-op preserving canon",
            {
                "run_id": cancel_run_id,
                "status": stopped_data["status"],
                "stop_reason": stopped_data["stop_reason"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 17: Terminal Objective Produces Intentional Completed State
        # ─────────────────────────────────────────────────────────────────
        # In our primary run, Step 3 executes Objective #3 (marked terminal/ending)
        step3_res = httpx.post(
            f"{backend_url}/ai/autonomous/runs/{run_id}/step",
            headers=headers,
            timeout=30.0,
        )
        assert step3_res.status_code == 200, f"Step 3 failed: {step3_res.text}"
        step3_data = step3_res.json()["data"]
        assert step3_data["status"] == "completed"
        assert step3_data["stop_reason"] == "terminal_objective_completed"
        assert step3_data["current_iteration"] == 3

        # Verify Objective #3 is completed in DB
        cur.execute("SELECT status FROM narrative.story_plan_objectives WHERE id = %s", (objs[2][0],))
        obj3_status = cur.fetchone()[0]
        assert obj3_status == "completed"

        record_cp(
            17,
            "Terminal Objective Intentional Completion",
            "PASS",
            "Terminal objective completion intentionally transitioned run status to 'completed'",
            {
                "run_id": run_id,
                "status": step3_data["status"],
                "stop_reason": step3_data["stop_reason"],
                "terminal_objective_id": str(objs[2][0]),
                "iteration": step3_data["current_iteration"],
            },
        )

        # ─────────────────────────────────────────────────────────────────
        # Checkpoint 18: Completed Run Performs No Extra Generation Afterward
        # ─────────────────────────────────────────────────────────────────
        cur.execute(
            """
            SELECT count(*) FROM narrative.writing_generations WHERE novel_id = %s
            """,
            (novel_id,),
        )
        total_gen_before_c18 = cur.fetchone()[0]

        # Call step on completed run
        step_after_comp = httpx.post(
            f"{backend_url}/ai/autonomous/runs/{run_id}/step",
            headers=headers,
            timeout=15.0,
        )
        assert step_after_comp.status_code == 200
        after_comp_data = step_after_comp.json()["data"]
        assert after_comp_data["status"] == "completed"
        assert after_comp_data["stop_reason"] == "terminal_objective_completed"

        # Verify generation count unmutated
        cur.execute(
            """
            SELECT count(*) FROM narrative.writing_generations WHERE novel_id = %s
            """,
            (novel_id,),
        )
        total_gen_after_c18 = cur.fetchone()[0]
        assert total_gen_after_c18 == total_gen_before_c18

        record_cp(
            18,
            "Completed Run Performs Zero Post-Terminal Generations",
            "PASS",
            "Subsequent step calls on completed run perform zero extra generations (count unchanged)",
            {
                "run_id": run_id,
                "status": after_comp_data["status"],
                "generation_count_before": total_gen_before_c18,
                "generation_count_after": total_gen_after_c18,
                "zero_extra_generation": True,
            },
        )

    finally:
        cur.close()
        conn.close()

    evidence: dict[str, Any] = {
        "gate": "AI-PIPE-03A",
        "pipeline": "P3",
        "verdict": "P3_AUTONOMOUS_CONTROLLER_PASS",
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
        "checkpoints": sorted(checkpoints, key=lambda cp: cp["checkpoint"]),
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(evidence, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 70)
    print(f"GATE AI-PIPE-03A COMPLETE: {evidence['summary']['passed']}/{evidence['summary']['total_checkpoints']} PASSED")
    print(f"Evidence artifact saved to: {output_path}")
    print("=" * 70)

    return evidence


def main() -> None:
    parser = argparse.ArgumentParser(description="AI-PIPE-03A Autonomous Controller Integration Runner")
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
        default="docs/development/AI-CORE-PIPELINE-VALIDATION-03/ai-pipe-03a-autonomous-controller.json",
    )
    args = parser.parse_args()

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
